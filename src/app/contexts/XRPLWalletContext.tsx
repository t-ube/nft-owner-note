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
import { setJoeyBackupKey } from '@/lib/sync/backupKey'

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
  /**
   * Joey-only: trigger the sync sign-in flow for an already-connected Joey
   * wallet. Skips the WC connect step. If the server already has a valid
   * cookie for the current address, returns immediately without prompting.
   */
  authenticateJoeySync: () => Promise<{ ok: boolean; error?: string }>
  isAuthenticatingJoey: boolean
}

const Ctx = createContext<UnifiedCtx | null>(null)

export function XRPLWalletProvider({ children }: React.PropsWithChildren) {
  const [walletType, setWalletType] = useState<WalletType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isAuthenticatingJoey, setIsAuthenticatingJoey] = useState(false)
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
    refresh: refreshSyncSession,
    signOut: syncSignOut,
  } = useSyncSession()

  // --- Joey ---
  const joey = useJoey()

  function extractXrplAddress(caipAccount?: string | null): string | null {
    if (!caipAccount) return null

    const parts = caipAccount.split(':')
    if (parts.length !== 3) return null

    const [namespace, , address] = parts
    if (namespace !== 'xrpl') return null

    return address
  }

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

  // Joey two-step flow: separate sync sign-in invoked from MyAccount UI.
  // Assumes WC connect already completed.
  const authenticateJoeySync = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setError(null)

    if (walletType !== 'joey') {
      const msg = 'Joey is not the active wallet'
      setError(msg)
      return { ok: false, error: msg }
    }
    if (!joey.session || !joey.accounts?.length) {
      const msg = 'Joey is not connected'
      setError(msg)
      return { ok: false, error: msg }
    }

    const topic = joey.session.topic
    const address = extractXrplAddress(joey.accounts[0])
    if (!address) {
      const msg = 'Could not resolve XRPL address from Joey session'
      setError(msg)
      return { ok: false, error: msg }
    }

    setIsAuthenticatingJoey(true)
    try {
      // 1. Existing cookie check — if the server already has a valid sync
      //    session for this address, we don't need to sign again.
      try {
        const sessionRes = await fetch('/api/auth/sync/session', { cache: 'no-store' })
        if (sessionRes.ok) {
          const data = await sessionRes.json()
          if (data?.session?.address === address) {
            console.log('[authenticateJoeySync] existing sync session, skipping sign')
            // Joey backup key is derived from a hardcoded constant, so we
            // can re-prime the cache without re-signing.
            try {
              await setJoeyBackupKey(address)
            } catch (cryptoErr) {
              console.error('[authenticateJoeySync] backup key derivation failed', cryptoErr)
            }
            await refreshSyncSession()
            return { ok: true }
          }
        }
      } catch (e) {
        console.warn('[authenticateJoeySync] session check failed, proceeding to sign', e)
      }

      const api = joey.api
      if (!api) {
        const msg = 'Joey API is not initialized'
        setError(msg)
        return { ok: false, error: msg }
      }

      // 2. Sign-only AccountSet via methods.signTransaction (matches Joey docs).
      const tx = {
        TransactionType: 'AccountSet',
        Account: address,
      }
      console.log('[authenticateJoeySync] calling signTransaction', { tx_signer: address, tx })

      const signRes = await api.signTransaction(
        {
          tx_signer: address,
          tx_json: tx,
          options: { autofill: true, submit: false },
        } as unknown as Parameters<typeof api.signTransaction>[0],
        { sessionId: topic, chainId: joey.chain }
      )
      console.log('[authenticateJoeySync] signTransaction returned', {
        error: signRes.error,
        hasData: !!signRes.data,
      })
      if (signRes.error) {
        throw signRes.error
      }
      const signedTxJson = signRes.data?.tx_json
      if (!signedTxJson) {
        throw new Error('Joey returned no signed tx_json')
      }

      // 3. Server-side verify and session issuance.
      const verifyRes = await fetch('/api/auth/joey/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tx_json: signedTxJson,
          deviceLabel: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        }),
      })
      if (!verifyRes.ok) {
        const data = await verifyRes.json().catch(() => ({}))
        const msg = data.detail
          ? `${data.error || 'Verification failed'}: ${data.detail}`
          : data.error || 'Verification failed'
        throw new Error(msg)
      }

      try {
        await setJoeyBackupKey(address)
      } catch (cryptoErr) {
        console.error('[authenticateJoeySync] backup key derivation failed', cryptoErr)
      }

      await refreshSyncSession()
      console.log('[authenticateJoeySync] success')
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      console.error('[authenticateJoeySync] failed:', e)
      setError(msg)
      return { ok: false, error: msg }
    } finally {
      setIsAuthenticatingJoey(false)
    }
  }, [walletType, joey.session, joey.accounts, joey.api, joey.chain, refreshSyncSession])

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
        // Joey also has a sync session (issued by /api/auth/joey/verify)
        // and a cached backup key in localStorage. syncSignOut revokes
        // the server-side session cookie and calls clearAllBackupKeys,
        // which wipes both the AES key and the walletType mapping.
        await syncSignOut()
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

  // Safety net for the PC Xaman flow: after the initial restore effect
  // runs, if a fresh syncSession appears while walletType is still
  // null, adopt it as an Xaman sign-in. The normal path is for connect()
  // to await requestSignIn() and then setAccount/setWalletType itself,
  // but the sync session update from handleVerified's refresh() can
  // race ahead of connect()'s microtask continuation on desktop — and
  // neither the initial restore effect (guarded by isInitialized) nor
  // the sync effect above (guarded by walletType==='xaman') would pick
  // it up on its own. Without this, account stays null and the user
  // is stuck on the wallet-select view even though they are signed in.
  useEffect(() => {
    if (!isInitialized) return
    if (walletType !== null) return
    if (!syncSession) return
    setWalletType('xaman')
    setAccount(syncSession.address)
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
    authenticateJoeySync,
    isAuthenticatingJoey,
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
