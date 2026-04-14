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
import { CloudSyncIndicator } from '@/app/components/CloudSyncIndicator'
import { getDictionary } from '@/i18n/get-dictionary'
import type { Dictionary } from '@/i18n/dictionaries/index'
import { dbManager } from '@/utils/db'
import { syncManager } from '@/lib/sync/SyncManager'
import { clearAllBackupKeys, setXamanBackupKey } from '@/lib/sync/backupKey'

export type SyncSession = {
  address: string
  expiresAt: string
}

type SignInResult = { address: string } | null

type SyncSessionCtx = {
  session: SyncSession | null
  isLoading: boolean
  isSyncing: boolean
  /**
   * Monotonic counter that increments each time a cloud sync finishes
   * (success or failure). Components that read data from IndexedDB can
   * use this as a useEffect dependency to re-fetch their snapshots when
   * remote changes have been merged into the local store.
   */
  syncCompleteCount: number
  refresh: () => Promise<void>
  signOut: () => Promise<void>
  requestSignIn: () => Promise<SignInResult>
}

const Ctx = createContext<SyncSessionCtx | null>(null)

const PENDING_UUID_KEY = 'pendingXamanUuid'
const PENDING_AT_KEY = 'pendingXamanAt'
const PENDING_TTL_MS = 10 * 60 * 1000

export function SyncSessionProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<SyncSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [activeSyncCount, setActiveSyncCount] = useState(0)
  const [syncCompleteCount, setSyncCompleteCount] = useState(0)
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

  const checkPending = useCallback(async () => {
    if (typeof window === 'undefined') return
    const pendingUuid = sessionStorage.getItem(PENDING_UUID_KEY)
    const pendingAtRaw = sessionStorage.getItem(PENDING_AT_KEY)
    if (!pendingUuid || !pendingAtRaw) return

    const pendingAt = parseInt(pendingAtRaw, 10)
    if (Number.isNaN(pendingAt) || Date.now() - pendingAt > PENDING_TTL_MS) {
      sessionStorage.removeItem(PENDING_UUID_KEY)
      sessionStorage.removeItem(PENDING_AT_KEY)
      return
    }

    try {
      const res = await fetch('/api/auth/xaman/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uuid: pendingUuid }),
      })
      if (res.ok) {
        sessionStorage.removeItem(PENDING_UUID_KEY)
        sessionStorage.removeItem(PENDING_AT_KEY)
        const data = await res.json().catch(() => null)
        if (data?.address && data?.signInHex) {
          try {
            await setXamanBackupKey(data.address as string, data.signInHex as string)
          } catch (cryptoErr) {
            console.error('[SyncSessionContext] backup key derivation failed', cryptoErr)
          }
        }
        // Resolve any pending signIn promise from a previous tab/visit
        if (data?.address && resolverRef.current) {
          resolverRef.current({ address: data.address })
          resolverRef.current = null
          setDialogOpen(false)
        }
      }
    } catch (err) {
      console.error('Pending Xaman verify failed:', err)
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await fetch('/api/auth/sync/logout', { method: 'POST' })
    } catch (err) {
      console.error('Failed to sign out sync session:', err)
    }
    clearAllBackupKeys()
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
      await checkPending()
      await refresh()
    })()
  }, [checkPending, refresh])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void (async () => {
          await checkPending()
          await refresh()
        })()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [checkPending, refresh])

  // Auto-sync: when a session becomes available, activate the
  // corresponding per-address IDB (migrating pre-login data from the
  // guest DB if this is a first-ever sign-in), then run an initial
  // sync and subscribe to dbManager changes for debounced re-sync.
  //
  // Remote-applied rows use dbManager.upsert*, which intentionally
  // does not emit onChange, so remote downloads never re-trigger a sync.
  //
  // Logout does NOT switch the DB back — a logged-out user keeps
  // writing to their last active DB, and the next sign-in with the
  // same address simply continues where they left off.
  useEffect(() => {
    const address = session?.address
    if (!address) return

    let cancelled = false

    const runSync = () => {
      setActiveSyncCount(c => c + 1)
      syncManager
        .syncAll(address)
        .catch(err => {
          console.error('[auto-sync] failed', err)
        })
        .finally(() => {
          setActiveSyncCount(c => Math.max(0, c - 1))
          setSyncCompleteCount(c => c + 1)
        })
    }

    const init = async () => {
      try {
        await dbManager.setActiveAddress(address)
      } catch (err) {
        console.error('[auto-sync] setActiveAddress failed', err)
      }
      // Nudge every page that depends on syncCompleteCount to re-fetch
      // from the newly-activated DB even before the first sync finishes,
      // so the UI does not flash stale data from the previous DB.
      setSyncCompleteCount(c => c + 1)
      if (cancelled) return
      runSync()
    }

    void init()

    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = dbManager.onChange(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(runSync, 2000)
    })

    return () => {
      cancelled = true
      unsubscribe()
      if (timer) clearTimeout(timer)
    }
  }, [session?.address])

  const cs = dict.project.myAccount.cloudSync

  return (
    <Ctx.Provider
      value={{
        session,
        isLoading,
        isSyncing: activeSyncCount > 0,
        syncCompleteCount,
        refresh,
        signOut,
        requestSignIn,
      }}
    >
      {children}
      <CloudSyncIndicator active={activeSyncCount > 0} />
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
