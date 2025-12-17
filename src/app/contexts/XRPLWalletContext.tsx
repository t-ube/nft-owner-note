'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { WalletType, UnifiedTx, TxResult } from '@/types/Wallet'

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
}

const Ctx = createContext<UnifiedCtx | null>(null)

export function XRPLWalletProvider({ children }: React.PropsWithChildren) {
  const [walletType, setWalletType] = useState<WalletType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [account, setAccount] = useState<string | null>(null)

  // --- Xaman 側 ---
  const xamanAccount = useXamanAccount()
  const { connect: xamanConnect, isConnecting: xamanIsConnecting } = useXamanConnect()
  const xamanDisconnect = useXamanDisconnect()
  const xamanSign = useXamanSign()
  const { error: xamanError, clearError: clearXamanError } = useXamanError()

  // --- Joey 側 ---
  const joey = useJoey()
  const joeyConnect = useCallback(async (): Promise<boolean> => {
    setError(null)
    try {
      if (joey.session && joey.accounts?.length) {
        setWalletType('joey')
        return true
      }
      const res = await joey.actions.connect()
      console.log(res);
      if (res?.error) {
        console.log('Joey connect error:', res.error);
        setError(res.error.message)
        return false
      }
      setWalletType('joey')
      return true
    } catch (e) {
      console.log('Joey connect exception:', e);
      setError(e instanceof Error ? e.message : 'Unknown error')
      return false
    }
  }, [joey.actions, joey.accounts, joey.session])

  // isConnecting は統合的に
  const connecting = isConnecting || xamanIsConnecting

  const clearError = useCallback(() => {
    setError(null)
    clearXamanError()
  }, [clearXamanError])

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

  const disconnect = useCallback(async () => {
    clearError()
    try {
      if (walletType === 'xaman') {
        const ok = await xamanDisconnect()
        if (ok) {
          setWalletType(null);
          setAccount(null)
        }
        return ok
      }
      if (walletType === 'joey') {
        const response = await joey.actions.disconnect()
        console.log(response);
        setWalletType(null)
        setAccount(null)
        return true
      }
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      return false
    }
  }, [clearError, walletType, xamanDisconnect, joey.actions])

  useEffect(() => {
    console.log('Wallet type changed:', walletType);
    if (walletType === 'xaman') {
      setAccount(xamanAccount?.address ?? null)
    } else if (walletType === 'joey') {
      const a = joey.accounts?.[0]
      setAccount(a ? (joey.chain ? a.replace(joey.chain, '') : a) : null)
    } else {
      setAccount(null)
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
    const addr = joey.chain ? a.replace(joey.chain, '') : a
    setAccount(addr)
    if (walletType === null) setWalletType('joey')
  }, [walletType, joey.session, joey.accounts, joey.chain])

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

  const value: UnifiedCtx = {
    walletType,
    account,
    isConnecting: connecting,
    error: error ?? xamanError ?? null,
    connect,
    disconnect,
    signAndSubmit,
    clearError,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useXRPLWallet() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useXRPLWallet must be used within XRPLWalletProvider')
  return v
}
