'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { setXamanBackupKey } from '@/lib/sync/backupKey'

type Challenge = {
  uuid: string
  qr: string
  next: string
  websocket: string
}

const PENDING_UUID_KEY = 'pendingXamanUuid'
const PENDING_AT_KEY = 'pendingXamanAt'

interface SyncSignInDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onVerified?: (address: string) => void
  deviceLabel?: string
  title: string
  description: string
  openInXamanLabel: string
  cancelLabel: string
  errorLabel: string
}

export function SyncSignInDialog({
  open,
  onOpenChange,
  onVerified,
  deviceLabel,
  title,
  description,
  openInXamanLabel,
  cancelLabel,
  errorLabel,
}: SyncSignInDialogProps) {
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const socketRef = useRef<WebSocket | null>(null)

  const cleanup = useCallback(() => {
    if (socketRef.current) {
      try {
        socketRef.current.close()
      } catch {}
      socketRef.current = null
    }
  }, [])

  const verify = useCallback(
    async (uuid: string) => {
      setIsVerifying(true)
      try {
        const res = await fetch('/api/auth/xaman/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uuid, deviceLabel: deviceLabel ?? null }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          const msg = data.detail
            ? `${data.error || 'Verification failed'}: ${data.detail}`
            : data.error || 'Verification failed'
          throw new Error(msg)
        }
        const data = await res.json().catch(() => ({}))
        sessionStorage.removeItem(PENDING_UUID_KEY)
        sessionStorage.removeItem(PENDING_AT_KEY)
        if (data?.address && data?.signInHex) {
          try {
            await setXamanBackupKey(data.address as string, data.signInHex as string)
          } catch (cryptoErr) {
            console.error('[SyncSignInDialog] backup key derivation failed', cryptoErr)
          }
        }
        if (data?.address && onVerified) {
          onVerified(data.address as string)
        }
        onOpenChange(false)
      } catch (err) {
        console.error('Sync verify error:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsVerifying(false)
      }
    },
    [deviceLabel, onOpenChange, onVerified]
  )

  // Open: fetch challenge and connect websocket. Close: cleanup.
  useEffect(() => {
    if (!open) {
      cleanup()
      setChallenge(null)
      setError(null)
      return
    }

    let cancelled = false
    setError(null)
    setChallenge(null)
    ;(async () => {
      try {
        // Only request a return_url on mobile browsers. On desktop, the user
        // typically scans the QR with their phone, and a return_url would
        // force the *phone* to navigate to the desktop URL after signing,
        // which is undesirable. Desktop completes via WebSocket instead.
        const isMobile =
          typeof navigator !== 'undefined' &&
          /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
        const returnUrl =
          isMobile && typeof window !== 'undefined'
            ? `${window.location.origin}${window.location.pathname}`
            : undefined
        const res = await fetch('/api/auth/xaman/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ returnUrl }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'Failed to start sign-in')
        }
        const data: Challenge = await res.json()
        if (cancelled) return
        setChallenge(data)
        try {
          sessionStorage.setItem(PENDING_UUID_KEY, data.uuid)
          sessionStorage.setItem(PENDING_AT_KEY, Date.now().toString())
        } catch {}

        const socket = new WebSocket(data.websocket)
        socketRef.current = socket
        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data)
            if (payload.signed === true) {
              cleanup()
              void verify(data.uuid)
            } else if (payload.signed === false) {
              cleanup()
              setError(errorLabel)
            }
          } catch {
            // ignore non-JSON keepalive frames
          }
        }
        socket.onerror = (e) => {
          console.error('Xaman websocket error:', e)
          cleanup()
          setError(errorLabel)
        }
      } catch (err) {
        if (cancelled) return
        console.error('Failed to start Xaman challenge:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
    })()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [open, cleanup, verify, errorLabel])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {challenge ? (
            <>
              <div className="rounded-md border bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={challenge.qr}
                  alt="Xaman sign-in QR"
                  width={220}
                  height={220}
                />
              </div>
              <Button
                variant="outline"
                onClick={() => window.open(challenge.next, '_blank')}
              >
                {openInXamanLabel}
              </Button>
            </>
          ) : (
            <div className="h-[220px] w-[220px] flex items-center justify-center text-sm text-muted-foreground">
              ...
            </div>
          )}

          {isVerifying && (
            <div className="text-sm text-muted-foreground">Verifying…</div>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}

          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
