'use client'

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import type { WalletType, UnifiedTx, TxResult } from '@/types/Wallet'
import type { AuthSession } from '@/app/contexts/AuthSessionContext'

import {
  useSignAndSubmitTransaction as useXamanSign,
  useXamanError,
} from '@/app/contexts/XamanContext'

import { useProvider as useJoey } from '@/app/contexts/JoeyContext'
import { useAuthSession } from '@/app/contexts/AuthSessionContext'

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
   * Joey 専用: 接続済みの Joey で署名し直してログインする（通常は connect('joey') が署名まで行う）。
   * Joey 側でアカウントを切り替えたときの入り口。同じアドレスで既にログインしていれば何もしない。
   */
  authenticateJoeySync: () => Promise<{ ok: boolean; error?: string }>
  isAuthenticatingJoey: boolean
}

const Ctx = createContext<UnifiedCtx | null>(null)

function extractXrplAddress(caipAccount?: string | null): string | null {
  if (!caipAccount) return null

  const parts = caipAccount.split(':')
  if (parts.length !== 3) return null

  const [namespace, , address] = parts
  if (namespace !== 'xrpl') return null

  return address
}

/** 署名に必要な、接続中の Joey のアドレス・セッション・チェーン */
type JoeyTarget = { address: string; topic: string; chainId: string }

function toJoeyTarget(topic: string | undefined, caipAccount: string | undefined): JoeyTarget | null {
  const address = extractXrplAddress(caipAccount)
  if (!topic || !caipAccount || !address) return null
  // "xrpl:0:rXXXX" → "xrpl:0"
  return { address, topic, chainId: caipAccount.split(':').slice(0, 2).join(':') }
}

export function XRPLWalletProvider({ children }: React.PropsWithChildren) {
  const [walletType, setWalletType] = useState<WalletType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isAuthenticatingJoey, setIsAuthenticatingJoey] = useState(false)
  const [account, setAccount] = useState<string | null>(null)
  const [balanceXrp, setBalanceXrp] = useState<number | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const prevSessionRef = useRef<AuthSession | null>(null)

  // --- Xaman: 取引の署名だけ。ログインは AuthSessionContext（サーバーの SignIn）
  const xamanSign = useXamanSign()
  const { error: xamanError, clearError: clearXamanError } = useXamanError()

  // --- ログイン状態（on_session）。Xaman のアドレスはここが正
  const {
    session: authSession,
    isLoading: isSessionLoading,
    requestXamanSignIn,
    signInWithJoey,
    refresh: refreshSession,
    signOut: sessionSignOut,
  } = useAuthSession()
  // Xaman としての復元に使うのは、Xaman でログインしたセッションだけ
  const xamanSession = authSession?.wallet === 'xaman' ? authSession : null

  // --- Joey ---
  const joey = useJoey()

  // 接続直後は joey の state がまだ古いので、最新の値はこの ref から読む
  const joeyRef = useRef(joey)
  joeyRef.current = joey

  /** WalletConnect で接続する（接続済みならそのまま）。接続先を返す */
  const joeyConnect = useCallback(async (): Promise<JoeyTarget | null> => {
    const current = joeyRef.current
    if (current.session && current.accounts?.length) {
      return toJoeyTarget(current.session.topic, current.accounts[0])
    }
    const res = await current.actions.connect()
    if (res?.error) throw res.error
    const session = res?.data
    return toJoeyTarget(session?.topic, session?.namespaces?.xrpl?.accounts?.[0])
  }, [])

  /** 接続中の Joey でチャレンジ tx に署名してログインする。同じアドレスで既にログイン済みなら何もしない */
  const signInJoey = useCallback(async (target: JoeyTarget) => {
    const current = await refreshSession()
    if (current?.address === target.address) return

    const api = joeyRef.current.api
    if (!api) throw new Error('Joey API is not initialized')

    // サーバーが組み立てたチャレンジ tx に署名だけしてもらう（送信はしない）。
    // Fee / Sequence / LastLedgerSequence は Joey に本物の値を入れてもらう（台帳で通らない値だと署名を拒むため）。
    // autofill / submit は一番上の階層に置く（options の中に入れると Joey アプリに読まれず、送信されていた）
    await signInWithJoey(target.address, async (tx) => {
      const signRes = await api.signTransaction(
        {
          tx_signer: target.address,
          tx_json: tx,
          autofill: true,
          submit: false,
        } as unknown as Parameters<typeof api.signTransaction>[0],
        { sessionId: target.topic, chainId: target.chainId }
      )
      if (signRes.error) throw signRes.error
      const signedTxJson = signRes.data?.tx_json
      if (!signedTxJson) throw new Error('Joey returned no signed tx_json')
      return signedTxJson
    })
  }, [refreshSession, signInWithJoey])

  // 接続済みの Joey で署名し直す（Joey 側でアカウントを切り替えたときなど）
  const authenticateJoeySync = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    setError(null)
    const target =
      walletType === 'joey' ? toJoeyTarget(joey.session?.topic, joey.accounts?.[0]) : null
    if (!target) {
      const msg = 'Joey is not connected'
      setError(msg)
      return { ok: false, error: msg }
    }

    setIsAuthenticatingJoey(true)
    try {
      await signInJoey(target)
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      console.error('[authenticateJoeySync] failed:', e)
      setError(msg)
      return { ok: false, error: msg }
    } finally {
      setIsAuthenticatingJoey(false)
    }
  }, [walletType, joey.session, joey.accounts, signInJoey])

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
          // スマホは Xaman へページ遷移するので、ここには戻らない（戻ったあとは復元で拾う）
          const result = await requestXamanSignIn()
          if (!result) return false
          setAccount(result.address)
          setWalletType('xaman')
          return true
        } else if (type === 'joey') {
          // 接続に続けて署名まで行い、Xaman と同じく一続きでログインを済ませる
          const target = await joeyConnect()
          if (!target) {
            setError('Could not resolve XRPL address from Joey session')
            return false
          }
          setWalletType('joey')
          setAccount(target.address)
          setIsAuthenticatingJoey(true)
          try {
            await signInJoey(target)
          } finally {
            setIsAuthenticatingJoey(false)
          }
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
    [clearError, requestXamanSignIn, joeyConnect, signInJoey]
  )

  const disconnect = useCallback(async () => {
    clearError()
    try {
      // どちらのウォレットでも、セッションの Cookie は必ず消す
      await sessionSignOut()
      if (walletType === 'joey') {
        await joey.actions.disconnect()
      }
      setWalletType(null)
      setAccount(null)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      return false
    }
  }, [clearError, walletType, sessionSignOut, joey.actions])

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
  // Xaman でログインしたセッションがあれば xaman として復元
  useEffect(() => {
    if (isInitialized) return
    if (walletType !== null) return
    if (isSessionLoading) return

    if (joey.accounts?.length) {
      const addr = extractXrplAddress(joey.accounts[0])
      if (addr) {
        setWalletType('joey')
        setAccount(addr)
        setIsInitialized(true)
        return
      }
    }

    if (xamanSession) {
      setWalletType('xaman')
      setAccount(xamanSession.address)
      setIsInitialized(true)
      return
    }

    setIsInitialized(true)
  }, [joey.accounts, xamanSession, isSessionLoading, walletType, isInitialized])

  // スマホの Xaman ログインはページ遷移で戻ってくるので、未接続のときに
  // Xaman のセッションが現れたら xaman として拾う
  useEffect(() => {
    if (!isInitialized) return
    if (walletType !== null) return
    if (!xamanSession) return
    setWalletType('xaman')
    setAccount(xamanSession.address)
  }, [isInitialized, walletType, xamanSession])

  // walletType が xaman のとき、セッションの変化を account に反映。
  // ただし「初めて xaman に切り替わった瞬間に session がまだ非同期で読み込み
  // 中で null」というケースで誤って account/walletType をクリアしないよう、
  // 「以前 session があったのに失われたとき」だけクリアする遷移検知にする。
  useEffect(() => {
    if (!isInitialized) return
    if (walletType !== 'xaman') return

    const prev = prevSessionRef.current
    prevSessionRef.current = xamanSession

    if (xamanSession) {
      setAccount(xamanSession.address)
    } else if (prev) {
      setAccount(null)
      setWalletType(null)
    }
  }, [walletType, xamanSession, isInitialized])

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
