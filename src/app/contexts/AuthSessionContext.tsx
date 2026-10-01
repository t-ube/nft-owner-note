'use client'

// ログイン状態（on_session）と、Xaman / Joey のログイン操作。仕様は doc/login.md。
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { getDictionary } from '@/i18n/get-dictionary'
import type { Dictionary } from '@/i18n/dictionaries/index'
import { XamanLoginDialog } from '@/app/components/XamanLoginDialog'
import {
  LOGIN_TTL_MS,
  MOBILE_LOGIN_STARTED_KEY,
  fetchMe,
  joeyChallenge,
  joeyVerify,
  logout,
  startXamanMobileLogin,
  verifyXamanLogin,
  type AuthSession,
} from '@/lib/auth/session-client'

export type { AuthSession }

type AuthSessionCtx = {
  session: AuthSession | null
  isLoading: boolean
  refresh: () => Promise<AuthSession | null>
  signOut: () => Promise<void>
  /** PC は QR ダイアログを開いて結果を返す。スマホは Xaman へページ遷移する（null を返す） */
  requestXamanSignIn: () => Promise<AuthSession | null>
  /** Joey で接続中のアドレスにログインする。sign はチャレンジ tx に署名して署名済み tx_json を返す */
  signInWithJoey: (address: string, sign: (tx: Record<string, unknown>) => Promise<unknown>) => Promise<AuthSession>
  /** ログインの失敗・拒否の理由（ログインボタンの横に出す） */
  loginError: string | null
  clearLoginError: () => void
}

const Ctx = createContext<AuthSessionCtx | null>(null)

function currentLang(): 'en' | 'ja' {
  if (typeof window === 'undefined') return 'en'
  return window.location.pathname.split('/')[1] === 'ja' ? 'ja' : 'en'
}

function loginTexts() {
  return (getDictionary(currentLang()) as unknown as Dictionary).xamanLogin
}

function readMobileStartedAt(): number | null {
  try {
    const v = Number(sessionStorage.getItem(MOBILE_LOGIN_STARTED_KEY))
    return v && Date.now() - v < LOGIN_TTL_MS ? v : null
  } catch {
    return null
  }
}

function clearMobileStartedAt() {
  try {
    sessionStorage.removeItem(MOBILE_LOGIN_STARTED_KEY)
  } catch {
    /* ignore */
  }
}

function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

export function AuthSessionProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const dialogResolveRef = useRef<((s: AuthSession | null) => void) | null>(null)

  const refresh = useCallback(async () => {
    try {
      const s = await fetchMe()
      setSession(s)
      return s
    } catch (err) {
      console.error('Failed to load session:', err)
      setSession(null)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await logout()
    } catch (err) {
      console.error('Failed to sign out:', err)
    }
    setSession(null)
  }, [])

  const requestXamanSignIn = useCallback(async (): Promise<AuthSession | null> => {
    setLoginError(null)
    if (isCoarsePointer()) {
      startXamanMobileLogin(currentLang())
      return null
    }
    dialogResolveRef.current?.(null)
    setDialogOpen(true)
    return new Promise((resolve) => {
      dialogResolveRef.current = resolve
    })
  }, [])

  const closeDialog = useCallback((s: AuthSession | null) => {
    setDialogOpen(false)
    dialogResolveRef.current?.(s)
    dialogResolveRef.current = null
  }, [])

  const signInWithJoey = useCallback(
    async (address: string, sign: (tx: Record<string, unknown>) => Promise<unknown>) => {
      setLoginError(null)
      const tx = await joeyChallenge(address)
      const signed = await sign(tx)
      await joeyVerify(signed)
      const s = await refresh()
      if (!s) throw new Error('session_missing')
      return s
    },
    [refresh]
  )

  // スマホ: Xaman から戻ったとき（?login=xaman）や、アプリ切り替えで戻ったときに確かめる
  const verifyMobileLogin = useCallback(
    async (fromReturnUrl: boolean) => {
      const r = await verifyXamanLogin().catch(() => null)
      if (!r || r.status === 'pending') return
      clearMobileStartedAt()
      if (r.status === 'ok') {
        await refresh()
        return
      }
      // 戻り先なしで画面に戻っただけのときは、待ち受けが無いのは普通なので黙る
      if (r.error === 'no_pending_login' && !fromReturnUrl) return
      const t = loginTexts()
      setLoginError(r.error === 'declined' ? t.declined : t.failed)
    },
    [refresh]
  )

  useEffect(() => {
    void (async () => {
      const url = new URL(window.location.href)
      const login = url.searchParams.get('login')
      if (login) {
        url.searchParams.delete('login')
        window.history.replaceState(window.history.state, '', url.toString())
      }
      if (login === 'failed') {
        clearMobileStartedAt()
        setLoginError(loginTexts().failed)
      } else if (login === 'xaman' || readMobileStartedAt()) {
        await verifyMobileLogin(login === 'xaman')
      }
      await refresh()
    })()
  }, [refresh, verifyMobileLogin])

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      if (readMobileStartedAt()) void verifyMobileLogin(false)
      else void refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [refresh, verifyMobileLogin])

  return (
    <Ctx.Provider
      value={{
        session,
        isLoading,
        refresh,
        signOut,
        requestXamanSignIn,
        signInWithJoey,
        loginError,
        clearLoginError: () => setLoginError(null),
      }}
    >
      {children}
      <XamanLoginDialog
        open={dialogOpen}
        lang={currentLang()}
        onSuccess={async () => closeDialog(await refresh())}
        onClose={() => closeDialog(null)}
      />
    </Ctx.Provider>
  )
}

export function useAuthSession() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuthSession must be used within AuthSessionProvider')
  return v
}
