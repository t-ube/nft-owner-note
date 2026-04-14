'use client'

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type { WalletType, UnifiedTx, TxResult } from '@/types/Wallet'
import type { SyncSession } from '@/app/contexts/SyncSessionContext'

import {
  useSignAndSubmitTransaction as useXamanSign,
  useXamanError,
} from '@/app/contexts/XamanContext'

import { useProvider as useJoey } from '@/app/contexts/JoeyContext'
import { useSyncSession } from '@/app/contexts/SyncSessionContext'

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
}

const Ctx = createContext<UnifiedCtx | null>(null)

export function XRPLWalletProvider({ children }: React.PropsWithChildren) {
  const [walletType, setWalletType] = useState<WalletType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [account, setAccount] = useState<string | null>(null)
  const [balanceXrp, setBalanceXrp] = useState<number | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const prevSyncSessionRef = useRef<SyncSession | null>(null)

  // --- Xaman: only used for transaction signing path. Sign-in is now handled
  //     entirely via the server SignIn flow exposed by SyncSessionContext.
  const xamanSign = useXamanSign()
  const { error: xamanError, clearError: clearXamanError } = useXamanError()

  // --- Sync session: source of truth for Xaman address ---
  const {
    session: syncSession,
    isLoading: isSyncLoading,
    requestSignIn,
    signOut: syncSignOut,
  } = useSyncSession()

  // --- Joey ---
  const joey = useJoey()

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

  function extractXrplAddress(caipAccount?: string | null): string | null {
    if (!caipAccount) return null

    const parts = caipAccount.split(':')
    if (parts.length !== 3) return null

    const [namespace, , address] = parts
    if (namespace !== 'xrpl') return null

    return address
  }

  const clearError = useCallback(() => {
    setError(null)
    clearXamanError()
  }, [clearXamanError])

  const connect = useCallback(
    async (type: WalletType) => {
      clearError()
      setIsConnecting(true)
      try {
        if (type === 'xaman') {
          const result = await requestSignIn()
          if (!result) {
            setError('Sign-in was cancelled')
            return false
          }
          setAccount(result.address)
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
    },
    [clearError, requestSignIn, joeyConnect]
  )

  const disconnect = useCallback(async () => {
    clearError()
    try {
      if (walletType === 'xaman') {
        await syncSignOut()
        setWalletType(null)
        setAccount(null)
        return true
      }
      if (walletType === 'joey') {
        await joey.actions.disconnect()
        setWalletType(null)
        setAccount(null)
        return true
      }
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      return false
    }
  }, [clearError, walletType, syncSignOut, joey.actions])

  const signAndSubmit = useCallback(
    async (tx: UnifiedTx): Promise<TxResult> => {
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
    },
    [clearError, walletType, xamanSign]
  )

  // 初回セッション復元: Joey が接続中ならそれ、そうでなければ
  // SyncSession に Xaman セッションがあれば xaman として復元
  useEffect(() => {
    if (isInitialized) return
    if (walletType !== null) return
    if (isSyncLoading) return

    if (joey.accounts?.length) {
      const addr = extractXrplAddress(joey.accounts[0])
      if (addr) {
        setWalletType('joey')
        setAccount(addr)
        setIsInitialized(true)
        return
      }
    }

    if (syncSession) {
      setWalletType('xaman')
      setAccount(syncSession.address)
      setIsInitialized(true)
      return
    }

    setIsInitialized(true)
  }, [joey.accounts, syncSession, isSyncLoading, walletType, isInitialized])

  // walletType が xaman のとき、syncSession の変化を account に反映。
  // ただし「初めて xaman に切り替わった瞬間に session がまだ非同期で読み込み
  // 中で null」というケースで誤って account/walletType をクリアしないよう、
  // 「以前 session があったのに失われたとき」だけクリアする遷移検知にする。
  useEffect(() => {
    if (!isInitialized) return
    if (walletType !== 'xaman') return

    const prev = prevSyncSessionRef.current
    prevSyncSessionRef.current = syncSession

    if (syncSession) {
      setAccount(syncSession.address)
    } else if (prev) {
      setAccount(null)
      setWalletType(null)
    }
  }, [walletType, syncSession, isInitialized])

  // walletType が joey のとき、Joey 側の変化を反映
  useEffect(() => {
    if (!isInitialized) return
    if (walletType !== 'joey') return
    const a = joey.accounts?.[0]
    const address = extractXrplAddress(a)
    setAccount(address)
  }, [walletType, joey.accounts, joey.chain, isInitialized])

  // Joey のアカウント変更を監視（未接続状態からの自動接続検知）
  useEffect(() => {
    if (walletType !== null && walletType !== 'joey') return
    if (!joey.session) {
      if (walletType === 'joey') setAccount(null)
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
    ;(async () => {
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
  }, [walletType, joey.session, joey.accounts, joey.chain, joey.actions])

  const getXrpBalance = useCallback(
    async (address: string): Promise<number | null> => {
      try {
        const res = await fetch('/api/xrp-balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }),
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
    },
    []
  )

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
    isConnecting,
    error: error ?? xamanError ?? null,
    connect,
    disconnect,
    signAndSubmit,
    clearError,
    balanceXrp,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useXRPLWallet() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useXRPLWallet must be used within XRPLWalletProvider')
  return v
}
