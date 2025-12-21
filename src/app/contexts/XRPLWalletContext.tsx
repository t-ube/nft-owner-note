'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import type { WalletType, UnifiedTx, TxResult } from '@/types/Wallet'

// Supabase
import { createSupabaseClient } from '@/lib/supabase/client'
import type { User as SupabaseUser } from '@supabase/supabase-js'

// Xaman
import { useConnect as useXamanConnect, useDisconnect as useXamanDisconnect, useAccount as useXamanAccount } from '@/app/contexts/XamanContext'
import { useSignAndSubmitTransaction as useXamanSign } from '@/app/contexts/XamanContext'
import { useXamanError } from '@/app/contexts/XamanContext'

// Joey
import { useProvider as useJoey } from '@/app/contexts/JoeyContext'

type UnifiedCtx = {
  walletType: WalletType | null
  account: string | null
  isConnecting: boolean
  error: string | null
  connect: (type: WalletType) => Promise<boolean>
  disconnect: () => Promise<boolean>
  signAndSubmit: (tx: UnifiedTx) => Promise<TxResult>
  clearError: () => void
  balanceXrp: number | null
  supabase: ReturnType<typeof createSupabaseClient>
  supabaseUser: SupabaseUser | null
  supabaseUserId: string | null
  isAuthenticated: boolean
  encryptionKey: string | null
}

const Ctx = createContext<UnifiedCtx | null>(null)

export function XRPLWalletProvider({ children }: React.PropsWithChildren) {
  const [walletType, setWalletType] = useState<WalletType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [account, setAccount] = useState<string | null>(null)
  const [balanceXrp, setBalanceXrp] = useState<number | null>(null)
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null)
  const supabase = useMemo(() => createSupabaseClient(), [])
  const supabaseUserId = supabaseUser?.id ?? null
  const isAuthenticated = supabaseUser !== null && account !== null
  const [isInitialized, setIsInitialized] = useState(false)
  const encryptionKey = supabaseUser?.user_metadata?.encryption_key ?? null

  // --- Xaman 側 ---
  const xamanAccount = useXamanAccount()
  const { connect: xamanConnect, isConnecting: xamanIsConnecting } = useXamanConnect()
  const xamanDisconnect = useXamanDisconnect()
  const xamanSign = useXamanSign()
  const { error: xamanError, clearError: clearXamanError } = useXamanError()

  // --- Joey 側 ---
  const joey = useJoey()

  // Supabaseセッション監視
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      //console.log('Supabase initial user:', data.user)
      setSupabaseUser(data.user)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSupabaseUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase])

  // Supabase認証関数
  const authenticateWithSupabase = useCallback(async (walletAddress: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/supabase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Auth failed')
      }

      const { access_token, refresh_token } = await res.json()

      // クライアントでセッションをセット
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      })

      if (error) throw error

      return true
    } catch (err) {
      console.error('Supabase auth error:', err)
      return false
    }
  }, [supabase])

  // アカウントがnullになったらSupabaseからサインアウト
  /* 危険
  useEffect(() => {
    if (!isInitialized) return
    
    if (account != null) return
    if (supabaseUser == null) return
    
    supabase.auth.signOut().then(() => {
      setSupabaseUser(null)
    })
  }, [account, supabaseUser, supabase])
  */

  // アカウント変更を監視してSupabase認証
  useEffect(() => {
    if (account == null) return
    if (supabaseUser != null) return
    const authenticate = async () => {
      const ok = await authenticateWithSupabase(account)
      if (!ok) {
        console.warn('Supabase authentication failed, but wallet connected')
      }
    }
    authenticate()
  }, [account, supabaseUser, authenticateWithSupabase])

  // Joey接続  
  const joeyConnect = useCallback(async (): Promise<boolean> => {
    setError(null)
    try {
      if (joey.session && joey.accounts?.length) {
        setWalletType('joey')
        return true
      }
      const res = await joey.actions.connect()
      if (res?.error) {
        console.error('Joey connect error:', res.error)
        setError(res.error.message)
        return false
      }
      setWalletType('joey')
      return true
    } catch (e) {
      console.error('Joey connect exception:', e)
      setError(e instanceof Error ? e.message : 'Unknown error')
      return false
    }
  }, [joey.actions, joey.accounts, joey.session])

  /*
  useEffect(() => {
    const kit = joey.walletKit
    if (!kit) return

    const onProposalExpire = (event: unknown) => {
      console.warn('Joey proposal_expire:', event)
      setError('Connection request expired')
    }

    const onSessionRequestExpire = (event: unknown) => {
      console.warn('Joey session_request_expire:', event)
      setError('Request expired')
    }

    const onSessionDelete = (event: unknown) => {
      console.warn('Joey session_delete:', event)
      setWalletType(null)
      setAccount(null)
      setBalanceXrp(null)
    }

    kit.on('proposal_expire', onProposalExpire)
    kit.on('session_request_expire', onSessionRequestExpire)
    kit.on('session_delete', onSessionDelete)

    const relayer = kit.core?.relayer
    const onRelayerDisconnect = (event: unknown) => {
      console.warn('Joey relayer_disconnect:', event)
      setError('WalletConnect relay disconnected')
    }
    relayer?.on?.('relayer_disconnect', onRelayerDisconnect)

    return () => {
      kit.off?.('proposal_expire', onProposalExpire)
      kit.off?.('session_request_expire', onSessionRequestExpire)
      kit.off?.('session_delete', onSessionDelete)
      relayer?.off?.('relayer_disconnect', onRelayerDisconnect)
    }
  }, [joey.walletKit])
  */

  // XRPLアドレス抽出
  function extractXrplAddress(caipAccount?: string | null): string | null {
    if (!caipAccount) return null

    const parts = caipAccount.split(':')
    if (parts.length !== 3) return null

    const [namespace, , address] = parts
    if (namespace !== 'xrpl') return null

    return address
  }

  // isConnecting は統合的に
  const connecting = isConnecting || xamanIsConnecting

  // エラークリア
  const clearError = useCallback(() => {
    setError(null)
    clearXamanError()
  }, [clearXamanError])

  // 接続
  const connect = useCallback(async (type: WalletType) => {
    clearError()
    setIsConnecting(true)
    try {
      if (type === 'xaman') {
        const ok = await xamanConnect()
        if (!ok) {
          setError(xamanError ?? 'Failed to connect wallet')
          return false
        }
        setAccount(xamanAccount?.address ?? null)
        setWalletType('xaman')
        return true
      } else if (type === 'joey') {
        const ok = await joeyConnect()
        if (!ok) return false
        return true
      }
      setError('Unsupported wallet type')
      return false
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      return false
    } finally {
      setIsConnecting(false)
    }
  }, [clearError, xamanAccount?.address, xamanConnect, xamanError, joeyConnect])

  // 切断
  const disconnect = useCallback(async () => {
    clearError()
    try {
      if (walletType === 'xaman') {
        const ok = await xamanDisconnect()
        if (ok) {
          setWalletType(null)
          setAccount(null)
        }
        await supabase.auth.signOut()
        setSupabaseUser(null)
        return ok
      }
      if (walletType === 'joey') {
        await joey.actions.disconnect()
        setWalletType(null)
        setAccount(null)
        await supabase.auth.signOut()
        setSupabaseUser(null)
        return true
      }
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      return false
    }
  }, [clearError, walletType, xamanDisconnect, joey.actions, supabase])

  // 統合的な signAndSubmit
  const signAndSubmit = useCallback(async (tx: UnifiedTx): Promise<TxResult> => {
    clearError()
    try {
      if (walletType === 'xaman') {
        const r = await xamanSign(tx as UnifiedTx)
        if (r.success) return { success: true, hash: r.hash, raw: r }
        return { success: false, error: r.error ?? 'Unknown error', raw: r }
      }

      if (walletType === 'joey') {
        return { success: false, error: 'Not implemented yet' }
      }

      return { success: false, error: 'Wallet is not connected' }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      setError(msg)
      return { success: false, error: msg }
    }
  }, [clearError, walletType, xamanSign])

  // 初回接続時にセッション復元
  useEffect(() => {
    if (isInitialized) return
    if (walletType !== null) return
    
    // Xamanセッション復元
    if (xamanAccount?.address) {
      setWalletType('xaman')
      setAccount(xamanAccount.address)
      setIsInitialized(true)
      return
    }
    
    // Joeyセッション復元
    if (joey.accounts?.length) {
      const addr = extractXrplAddress(joey.accounts[0])
      if (addr) {
        setWalletType('joey')
        setAccount(addr)
        setIsInitialized(true)
        return
      }
    }
  }, [xamanAccount?.address, joey.accounts, walletType, isInitialized])

  // walletType 変更時にアカウント更新
  useEffect(() => {
    if (!isInitialized) return
    if (walletType === 'xaman') {
      setAccount(xamanAccount?.address ?? null)
    } else if (walletType === 'joey') {
      const a = joey.accounts?.[0]
      const address = extractXrplAddress(a)
      setAccount(address)
    }
  }, [walletType, xamanAccount?.address, joey.accounts, joey.chain])

  // Joey のアカウント変更を監視
  useEffect(() => {
    if (walletType !== null && walletType !== 'joey') {
      return
    }
    if (!joey.session) {
      setAccount(null)
      return
    }
    const a = joey.accounts?.[0]
    if (!a) {
      setAccount(null)
      return
    }
    if (joey.accounts?.length) {
      const addr = extractXrplAddress(joey.accounts[0])
      setAccount(addr)
      if (walletType === null) setWalletType('joey')
      return
    }
    (async () => {
      try {
        if (joey.session !== undefined) {
          await joey.actions.reconnect(joey.session)
        }
      } catch (e) {
        console.error('Joey reconnect error:', e)
        setError(e instanceof Error ? e.message : 'Unknown error')
        setAccount(null)
      }
    })()

  }, [walletType, joey.session, joey.accounts, joey.chain])

  // XRP残高取得
  const getXrpBalance = useCallback(async (address: string): Promise<number | null> => {
    try {
      const res = await fetch('/api/xrp-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      })
      if (!res.ok) {
        console.warn('Failed to fetch balance:', await res.text())
        return null
      }
      const data = await res.json()
      return data.xrp ?? null
    } catch (err) {
      console.error('Balance fetch error:', err)
      return null
    }
  },[])

  useEffect(() => {
    if (account === null) {
      setBalanceXrp(null)
      return
    }
    getXrpBalance(account).then(setBalanceXrp)
  }, [account, getXrpBalance])

  const value: UnifiedCtx = {
    walletType,
    account,
    isConnecting: connecting,
    error: error ?? xamanError ?? null,
    connect,
    disconnect,
    signAndSubmit,
    clearError,
    balanceXrp,
    supabase,
    supabaseUser,
    supabaseUserId,
    isAuthenticated,
    encryptionKey,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useXRPLWallet() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useXRPLWallet must be used within XRPLWalletProvider')
  return v
}
