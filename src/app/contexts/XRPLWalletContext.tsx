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
  balanceXrp: number | null
}

const Ctx = createContext<UnifiedCtx | null>(null)

export function XRPLWalletProvider({ children }: React.PropsWithChildren) {
  const [walletType, setWalletType] = useState<WalletType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [account, setAccount] = useState<string | null>(null)
  const [balanceXrp, setBalanceXrp] = useState<number | null>(null)
 
  // ========== DEBUG: account変更を追跡 ==========
  useEffect(() => {
    console.log('[DEBUG] account useEffect triggered, account:', account)
  }, [account])

  // --- Xaman 側 ---
  const xamanAccount = useXamanAccount()
  const { connect: xamanConnect, isConnecting: xamanIsConnecting } = useXamanConnect()
  const xamanDisconnect = useXamanDisconnect()
  const xamanSign = useXamanSign()
  const { error: xamanError, clearError: clearXamanError } = useXamanError()

  // --- Joey 側 ---
  const joey = useJoey()

  // Joey接続  
  const joeyConnect = useCallback(async (): Promise<boolean> => {
    setError(null)
    try {
      if (joey.session && joey.accounts?.length) {
        setWalletType('walletconnect')
        return true
      }
      const res = await joey.actions.connect()
      if (res?.error) {
        console.error('Joey connect error:', res.error)
        setError(res.error.message)
        return false
      }
      setWalletType('walletconnect')
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
      } else if (type === 'walletconnect') {
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
        return ok
      }
      if (walletType === 'walletconnect') {
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
  }, [clearError, walletType, xamanDisconnect, joey.actions])

  // 統合的な signAndSubmit
  const signAndSubmit = useCallback(async (tx: UnifiedTx): Promise<TxResult> => {
    clearError()
    try {
      if (walletType === 'xaman') {
        const r = await xamanSign(tx as UnifiedTx)
        if (r.success) return { success: true, hash: r.hash, raw: r }
        return { success: false, error: r.error ?? 'Unknown error', raw: r }
      }

      if (walletType === 'walletconnect') {
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
    const restoreSession = async () => {
      console.log('[DEBUG] Session restore check starting...')

      // 1. Xamanセッションの確認
      if (xamanAccount?.address) {
        console.log('[DEBUG] Restoring Xaman session:', xamanAccount.address)
        setWalletType('xaman')
        setAccount(xamanAccount.address)
        return
      }

      // 2. Joeyセッションの確認
      if (joey.accounts && joey.accounts.length > 0) {
        const addr = extractXrplAddress(joey.accounts[0])
        if (addr) {
          console.log('[DEBUG] Restoring Joey session:', addr)
          setWalletType('walletconnect')
          setAccount(addr)
          return
        }
      }

      const xamanChecked = xamanAccount !== undefined
      const joeyChecked = joey.accounts !== undefined

      if (xamanChecked && joeyChecked) {
        console.log('[DEBUG] No session to restore. Initialization complete.')
      }
    }

    restoreSession()
  }, [xamanAccount, joey.accounts])

  // walletType 変更時にアカウント更新
  useEffect(() => {
    if (!walletType) {
      if (account !== null) setAccount(null)
      setAccount(null)
      return
    }

    let currentAddress: string | null = null

    if (walletType === 'xaman') {
      currentAddress = xamanAccount?.address ?? null
      setAccount(xamanAccount?.address ?? null)
    } else if (walletType === 'walletconnect') {
      currentAddress = extractXrplAddress(joey.accounts?.[0]) ?? null
    }

    if (currentAddress !== account) {
      console.log('[DEBUG] Syncing account state:', currentAddress)
      setAccount(currentAddress)
    }

  }, [walletType, xamanAccount?.address, joey.accounts, joey.chain, account])

  // Joey のアカウント変更を監視
  useEffect(() => {
    if (walletType !== null && walletType !== 'walletconnect') {
      return
    }
    if (!joey.session) {
      setAccount(null)
      if (walletType !== null) {
        setWalletType(null)
      }
      return
    }
    const a = joey.accounts?.[0]
    if (!a) {
      setAccount(null)
      if (walletType !== null) {
        setWalletType(null)
      }
      return
    }
    if (joey.accounts?.length) {
      const addr = extractXrplAddress(joey.accounts[0])
      setAccount(addr)
      if (walletType === null) setWalletType('walletconnect')
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
        if (walletType !== null) {
          setWalletType(null)
        }
      }
    })()

  }, [walletType, joey.session, joey.accounts, joey.actions])

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
      return data.availableXrp ?? null
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
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useXRPLWallet() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useXRPLWallet must be used within XRPLWalletProvider')
  return v
}
