'use client'

import React, { useCallback, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getXumm } from '@/lib/xumm/client'

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
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startSignIn = useCallback(async () => {
    setError(null)
    setIsSigningIn(true)
    try {
      const xumm = getXumm()
      const result = await xumm.authorize()
      if (result instanceof Error) {
        throw result
      }
      if (!result || !result.jwt) {
        throw new Error(errorLabel)
      }

      const res = await fetch('/api/auth/xaman/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jwt: result.jwt,
          deviceLabel: deviceLabel ?? null,
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
      if (data?.address && onVerified) {
        onVerified(data.address as string)
      }
      onOpenChange(false)
    } catch (err) {
      console.error('Sync sign-in error:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsSigningIn(false)
    }
  }, [deviceLabel, onOpenChange, onVerified, errorLabel])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          <Button onClick={startSignIn} disabled={isSigningIn}>
            {isSigningIn ? 'Signing in…' : openInXamanLabel}
          </Button>

          {error && <div className="text-sm text-red-600">{error}</div>}

          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSigningIn}
          >
            {cancelLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
