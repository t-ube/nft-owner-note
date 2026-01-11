'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createSupabaseClient } from '@/lib/supabase/client'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { useXRPLWallet } from './XRPLWalletContext'

interface SupabaseAuthContextType {
  supabase: ReturnType<typeof createSupabaseClient>
  user: SupabaseUser | null
  isLoading: boolean
  isAuthenticated: boolean
  signOut: () => Promise<void>
}

const SupabaseAuthContext = createContext<SupabaseAuthContextType | null>(null)

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const { account } = useXRPLWallet()
  const [user, setUser] = useState<SupabaseUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  //const supabase = createSupabaseClient()
  const supabase = useMemo(() => createSupabaseClient(), []);
  const isauthenticating = useRef(false)
  
  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
  }, [supabase])

  // セッションの初期確認
  useEffect(() => {
    // 初回セッション取得
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    // セッションの変更（ログイン、ログアウト、トークン更新）を監視
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Supabase Auth Event:', event)
      setUser(session?.user ?? null)
      setIsLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  // ウォレットのアドレスに基づいた自動ログイン/ログアウト
  useEffect(() => {
    const handleWalletAuth = async () => {
      if (isauthenticating.current) return
      
      // account があるが、Supabaseに未ログイン（または別ユーザー）の場合
      if (account) {
        // 現在のSupabaseユーザーのメールアドレスが、現在のウォレットアドレスと一致するか確認
        // (route.ts の仕様に合わせて lowercase で比較)
        const expectedEmail = `${account.toLowerCase()}@xrpl.wallet`
        
        if (!user || user.email !== expectedEmail) {
          //isauthenticating.current = true;
          setIsLoading(true)
          
          try {
            const res = await fetch('/api/auth/supabase', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ walletAddress: account })
            })
            
            if (!res.ok) {
                const data = await res.json()
                console.log('[DEBUG] authenticateWithSupabase failed:', data)
                throw new Error(data.error || 'Auth failed')
            }
        
            const { success, user } = await res.json()
            console.log('[DEBUG] authenticateWithSupabase response:', { success, user })
    
            if (success) {
              // APIがクッキーにセッションを保存済み
              if (user) {
                console.log('[DEBUG] authenticateWithSupabase success, user:', user.id)
                setUser({
                  id: user.id,
                  email: user.email,
                  user_metadata: user.user_metadata,
                  aud: 'authenticated',
                  created_at: '',
                } as SupabaseUser)
                return true
              }
              // API側で verifyOtp まで完了し Cookie がセットされている想定
              // getSession() で最新の状態を反映
              /*
              const { data: { session } } = await supabase.auth.getSession()
              setUser(session?.user ?? null)
              return true
              */
            }
            
          } catch (err) {
            console.error('Supabase Auth Error:', err)
          } finally {
            //isauthenticating.current = false;
            setIsLoading(false)
          }
        }
      } 
      // account が消えた（切断された）ら Supabase からもサインアウト
      else if (!account && user) {
        await signOut()
      }
    }

    handleWalletAuth()
  }, [account, user, supabase, signOut])

  const value = {
    supabase,
    user,
    isLoading,
    isAuthenticated: !!user,
    signOut
  }

  return (
    <SupabaseAuthContext.Provider value={value}>
      {children}
    </SupabaseAuthContext.Provider>
  )
}

export const useSupabaseAuth = () => {
  const context = useContext(SupabaseAuthContext)
  if (!context) throw new Error('useSupabaseAuth must be used within SupabaseAuthProvider')
  return context
}