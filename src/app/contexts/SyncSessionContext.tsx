'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { usePathname } from 'next/navigation'
import { SyncSignInDialog } from '@/app/components/SyncSignInDialog'
import { getDictionary } from '@/i18n/get-dictionary'
import type { Dictionary } from '@/i18n/dictionaries/index'
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
  const [dialogOpen, setDialogOpen] = useState(false)
  const resolverRef = useRef<((result: SignInResult) => void) | null>(null)

  const pathname = usePathname()
  const lang: 'en' | 'ja' = useMemo(() => {
    const seg = pathname?.split('/')[1]
    return seg === 'ja' ? 'ja' : 'en'
  }, [pathname])
  const dict = useMemo(
    () => getDictionary(lang) as unknown as Dictionary,
    [lang]
  )

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
  // the page reloads with a fresh dialog state. This picks up a resolved
  // Xumm PKCE flow (if any) and exchanges the JWT for a sync session cookie.
  const resumePkce = useCallback(async () => {
    if (typeof window === 'undefined') return
    try {
      const xumm = getXumm()
      await xumm.environment.ready
      const account = await xumm.user.account
      if (!account) return
      const jwt = await xumm.environment.bearer
      if (!jwt) return

      const res = await fetch('/api/auth/xaman/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jwt,
          deviceLabel:
            typeof navigator !== 'undefined' ? navigator.userAgent : null,
        }),
      })
      if (!res.ok) return
      const data = await res.json().catch(() => null)
      if (data?.address && resolverRef.current) {
        resolverRef.current({ address: data.address })
        resolverRef.current = null
        setDialogOpen(false)
      }
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

  const requestSignIn = useCallback(() => {
    return new Promise<SignInResult>((resolve) => {
      // If a previous request is still pending, resolve it as null first
      if (resolverRef.current) {
        resolverRef.current(null)
      }
      resolverRef.current = resolve
      setDialogOpen(true)
    })
  }, [])

  const handleVerified = useCallback(
    async (address: string) => {
      // Clear the resolver synchronously *before* awaiting refresh so that
      // a subsequent onOpenChange(false) does not see a pending resolver and
      // mistakenly treat the success as a cancellation.
      if (resolverRef.current) {
        resolverRef.current({ address })
        resolverRef.current = null
      }
      await refresh()
    },
    [refresh]
  )

  const handleDialogChange = useCallback((open: boolean) => {
    if (!open && resolverRef.current) {
      resolverRef.current(null)
      resolverRef.current = null
    }
    setDialogOpen(open)
  }, [])

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

  const cs = dict.project.myAccount.cloudSync

  return (
    <Ctx.Provider
      value={{ session, isLoading, refresh, signOut, requestSignIn }}
    >
      {children}
      <SyncSignInDialog
        open={dialogOpen}
        onOpenChange={handleDialogChange}
        onVerified={handleVerified}
        deviceLabel={typeof navigator !== 'undefined' ? navigator.userAgent : undefined}
        title={cs.dialogTitle}
        description={cs.dialogDescription}
        openInXamanLabel={cs.openInXaman}
        cancelLabel={cs.cancel}
        errorLabel={cs.signError}
      />
    </Ctx.Provider>
  )
}

export function useSyncSession() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSyncSession must be used within SyncSessionProvider')
  return v
}
