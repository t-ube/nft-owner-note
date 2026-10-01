'use client'

// Xaman・PC 用の QR ログイン。仕様は doc/login.md「Xaman・PC（QR）」。
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getDictionary } from '@/i18n/get-dictionary'
import type { Dictionary } from '@/i18n/dictionaries/index'
import {
  LOGIN_TTL_MS,
  startXamanLogin,
  verifyXamanLogin,
  type XamanLoginStart,
} from '@/lib/auth/session-client'

const POLL_INTERVAL_MS = 3000

type Props = {
  open: boolean
  lang: string
  onSuccess: (account: string) => void
  onClose: () => void
}

export function XamanLoginDialog({ open, lang, onSuccess, onClose }: Props) {
  const t = useMemo(
    () => (getDictionary(lang as 'en' | 'ja') as unknown as Dictionary).xamanLogin,
    [lang]
  )
  const [start, setStart] = useState<XamanLoginStart | null>(null)
  const [error, setError] = useState<string | null>(null)
  const onSuccessRef = useRef(onSuccess)
  onSuccessRef.current = onSuccess

  useEffect(() => {
    if (!open) return
    let done = false
    let ws: WebSocket | null = null
    let poll: ReturnType<typeof setInterval> | null = null
    let expire: ReturnType<typeof setTimeout> | null = null
    let checking = false

    setStart(null)
    setError(null)

    const stop = () => {
      done = true
      if (poll) clearInterval(poll)
      if (expire) clearTimeout(expire)
      ws?.close()
    }

    // WebSocket の通知もポーリングも、確認のきっかけにしか使わない
    const check = async () => {
      if (done || checking) return
      checking = true
      try {
        const r = await verifyXamanLogin()
        if (done) return
        if (r.status === 'ok') {
          stop()
          onSuccessRef.current(r.account)
        } else if (r.status === 'error') {
          stop()
          setError(r.error === 'declined' ? t.declined : t.failed)
        }
      } catch {
        /* 一時的な失敗は次のきっかけでやり直す */
      } finally {
        checking = false
      }
    }

    void (async () => {
      try {
        const s = await startXamanLogin(lang)
        if (done) return
        setStart(s)
        ws = new WebSocket(s.ws)
        ws.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data)
            if ('signed' in data || 'expired' in data) void check()
          } catch {
            /* 状態以外のメッセージは無視 */
          }
        }
        poll = setInterval(() => void check(), POLL_INTERVAL_MS)
        expire = setTimeout(() => {
          stop()
          setError(t.expired)
        }, LOGIN_TTL_MS)
      } catch {
        if (!done) setError(t.failed)
      }
    })()

    return stop
  }, [open, lang, t])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[380px]">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-2">
          {start && !error ? (
            // QR は xumm.app が返す画像の URL をそのまま表示する
            // eslint-disable-next-line @next/next/no-img-element
            <img src={start.qr} alt="Xaman QR" width={240} height={240} className="rounded-md bg-white" />
          ) : !error ? (
            <div className="h-[240px] w-[240px] animate-pulse rounded-md bg-muted" />
          ) : null}

          {error && <div className="text-sm text-red-600">{error}</div>}

          <div className="flex gap-2">
            {start && !error && (
              <Button asChild variant="outline">
                <a href={start.link} target="_blank" rel="noopener noreferrer">
                  {t.openInXaman}
                </a>
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              {t.cancel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
