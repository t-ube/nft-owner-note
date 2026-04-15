'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import { getXumm } from '@/lib/xumm/client'

export type SyncSession = {
  address: string
  expiresAt: string
}

type SignInResult = { address: string } | null

type SyncSessionCtx = {
  session: SyncSession | null
  isLoading: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
  requestSignIn: () => Promise<SignInResult>
}

const Ctx = createContext<SyncSessionCtx | null>(null)

export function SyncSessionProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<SyncSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/sync/session', { cache: 'no-store' })
      if (!res.ok) {
        setSession(null)
        return
      }
      const data = await res.json()
      setSession(data.session ?? null)
    } catch (err) {
      console.error('Failed to load sync session:', err)
      setSession(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Mobile PKCE flow redirects away from the app and comes back — on return
  // the page reloads. This picks up a resolved Xumm PKCE flow (if any) and
  // exchanges the JWT for a sync session cookie so refresh() picks it up.
  const resumePkce = useCallback(async () => {
    if (typeof window === 'undefined') return
    try {
      const xumm = getXumm()
      await xumm.environment.ready
      const account = await xumm.user.account
      if (!account) return
      const jwt = await xumm.environment.bearer
      if (!jwt) return

      await fetch('/api/auth/xaman/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jwt,
          deviceLabel:
            typeof navigator !== 'undefined' ? navigator.userAgent : null,
        }),
      })
    } catch (err) {
      console.error('PKCE resume failed:', err)
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/sync/logout', { method: 'POST' })
    } catch (err) {
      console.error('Failed to sign out sync session:', err)
    }
    setSession(null)
  }, [])

  const requestSignIn = useCallback(async (): Promise<SignInResult> => {
    const xumm = getXumm()
    const result = await xumm.authorize()
    if (result instanceof Error) {
      throw result
    }
    if (!result?.jwt) {
      return null
    }

    const res = await fetch('/api/auth/xaman/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jwt: result.jwt,
        deviceLabel:
          typeof navigator !== 'undefined' ? navigator.userAgent : null,
      }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      const msg = data.detail
        ? `${data.error || 'Verification failed'}: ${data.detail}`
        : data.error || 'Verification failed'
      throw new Error(msg)
    }
    const data = await res.json().catch(() => ({}))
    if (data?.address) {
      await refresh()
      return { address: data.address as string }
    }
    return null
  }, [refresh])

  useEffect(() => {
    void (async () => {
      await resumePkce()
      await refresh()
    })()
  }, [resumePkce, refresh])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refresh()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [refresh])

  return (
    <Ctx.Provider
      value={{ session, isLoading, refresh, signOut, requestSignIn }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useSyncSession() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSyncSession must be used within SyncSessionProvider')
  return v
}
