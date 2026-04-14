'use client'

// Determinism check for Xaman SignIn signatures.
//
// Manually run two SignIn flows on the SAME wallet account back-to-back.
// If Xaman/Xumm produces the same `response.hex` both times, then the
// signature is suitable as input key material for HKDF-based backup-key
// derivation. If not, we must fall back to a different key-management
// scheme (e.g. passphrase or wrapped DEK) for the Xaman path.
//
// This page is only useful in dev/staging — there is no auth on /api/auth/xaman/peek
// beyond holding the Xumm server credentials, and the page does not
// create or persist any sync session.

import { useCallback, useEffect, useRef, useState } from 'react'

type Challenge = {
  uuid: string
  qr: string
  next: string
  websocket: string
}

type PeekResponse = {
  meta: { signed?: boolean; resolved?: boolean; expired?: boolean; cancelled?: boolean } | null
  response: {
    account?: string
    hex?: string
    txid?: string
    signmethod?: string
  } | null
  requestJson: unknown
}

type RoundResult = {
  uuid: string
  account: string | null
  hex: string | null
  signmethod: string | null
  requestJson: unknown
}

type Round = {
  index: 1 | 2
  status: 'idle' | 'creating' | 'awaiting-sign' | 'fetching' | 'done' | 'error'
  challenge: Challenge | null
  result: RoundResult | null
  error: string | null
}

function emptyRound(index: 1 | 2): Round {
  return { index, status: 'idle', challenge: null, result: null, error: null }
}

export default function XamanDeterminismTestPage() {
  const [round1, setRound1] = useState<Round>(() => emptyRound(1))
  const [round2, setRound2] = useState<Round>(() => emptyRound(2))
  const socketRef = useRef<WebSocket | null>(null)

  const cleanupSocket = useCallback(() => {
    if (socketRef.current) {
      try {
        socketRef.current.close()
      } catch {}
      socketRef.current = null
    }
  }, [])

  useEffect(() => () => cleanupSocket(), [cleanupSocket])

  const peek = useCallback(async (uuid: string): Promise<PeekResponse> => {
    const res = await fetch(`/api/auth/xaman/peek?uuid=${encodeURIComponent(uuid)}`)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `peek failed: ${res.status}`)
    }
    return (await res.json()) as PeekResponse
  }, [])

  const runRound = useCallback(
    async (index: 1 | 2) => {
      cleanupSocket()
      const setRound = index === 1 ? setRound1 : setRound2

      setRound({ index, status: 'creating', challenge: null, result: null, error: null })

      try {
        const res = await fetch('/api/auth/xaman/challenge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || 'failed to create challenge')
        }
        const challenge: Challenge = await res.json()
        setRound((prev) => ({ ...prev, status: 'awaiting-sign', challenge }))

        const socket = new WebSocket(challenge.websocket)
        socketRef.current = socket

        const finished = new Promise<void>((resolve, reject) => {
          socket.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data)
              if (data.signed === true) {
                resolve()
              } else if (data.signed === false) {
                reject(new Error('user cancelled or sign rejected'))
              }
            } catch {
              // ignore keepalive frames
            }
          }
          socket.onerror = () => reject(new Error('websocket error'))
          socket.onclose = () => {
            // close without explicit signed=true is treated as failure unless
            // we already resolved
          }
        })

        await finished
        cleanupSocket()

        setRound((prev) => ({ ...prev, status: 'fetching' }))
        const peeked = await peek(challenge.uuid)
        const result: RoundResult = {
          uuid: challenge.uuid,
          account: peeked.response?.account ?? null,
          hex: peeked.response?.hex ?? null,
          signmethod: peeked.response?.signmethod ?? null,
          requestJson: peeked.requestJson,
        }
        setRound((prev) => ({ ...prev, status: 'done', result }))
      } catch (err) {
        cleanupSocket()
        setRound((prev) => ({
          ...prev,
          status: 'error',
          error: err instanceof Error ? err.message : 'unknown error',
        }))
      }
    },
    [cleanupSocket, peek]
  )

  const reset = () => {
    cleanupSocket()
    setRound1(emptyRound(1))
    setRound2(emptyRound(2))
  }

  const bothDone = round1.status === 'done' && round2.status === 'done'
  const sameAccount =
    bothDone && round1.result?.account && round2.result?.account
      ? round1.result.account === round2.result.account
      : false
  const sameHex =
    bothDone && round1.result?.hex && round2.result?.hex
      ? round1.result.hex === round2.result.hex
      : false

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6 font-sans">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Xaman SignIn determinism test</h1>
        <p className="text-sm text-muted-foreground">
          Run two SignIn flows on the same Xaman account. If both rounds produce
          the same <code>response.hex</code>, the signature is deterministic and
          can be used as HKDF input key material for backup encryption. If not,
          we need a different key-management scheme for Xaman.
        </p>
      </header>

      <div className="flex gap-3">
        <button
          className="rounded border px-4 py-2 disabled:opacity-50"
          onClick={() => runRound(1)}
          disabled={round1.status === 'creating' || round1.status === 'awaiting-sign'}
        >
          Run round 1
        </button>
        <button
          className="rounded border px-4 py-2 disabled:opacity-50"
          onClick={() => runRound(2)}
          disabled={
            round1.status !== 'done' ||
            round2.status === 'creating' ||
            round2.status === 'awaiting-sign'
          }
        >
          Run round 2
        </button>
        <button className="rounded border px-4 py-2" onClick={reset}>
          Reset
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <RoundCard round={round1} />
        <RoundCard round={round2} />
      </div>

      {bothDone && (
        <div className="rounded border p-4 space-y-2">
          <h2 className="font-semibold">Verdict</h2>
          <div>
            same account:{' '}
            <span className={sameAccount ? 'text-green-700' : 'text-red-700'}>
              {sameAccount ? 'YES' : 'NO'}
            </span>
            {!sameAccount && (
              <span className="text-sm text-muted-foreground ml-2">
                (signed with different wallets — re-run with the same account)
              </span>
            )}
          </div>
          <div>
            same response.hex:{' '}
            <span className={sameHex ? 'text-green-700' : 'text-red-700'}>
              {sameHex ? 'YES (deterministic)' : 'NO (non-deterministic)'}
            </span>
          </div>
          {sameAccount && !sameHex && (
            <p className="text-sm text-muted-foreground">
              Xaman SignIn is non-deterministic for this account. The
              wallet-signature-derived AES key approach is NOT viable for
              Xaman; fall back to passphrase or wrapped-DEK scheme.
            </p>
          )}
          {sameAccount && sameHex && (
            <p className="text-sm text-muted-foreground">
              Xaman SignIn is deterministic for this account. The
              HKDF-from-signature scheme is viable for Xaman.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function RoundCard({ round }: { round: Round }) {
  return (
    <div className="rounded border p-4 space-y-3">
      <div className="font-semibold">Round {round.index}</div>
      <div className="text-sm">
        status: <span className="font-mono">{round.status}</span>
      </div>

      {round.challenge && round.status === 'awaiting-sign' && (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={round.challenge.qr}
            alt="Xaman QR"
            width={200}
            height={200}
            className="border bg-white p-2"
          />
          <a
            href={round.challenge.next}
            target="_blank"
            rel="noopener noreferrer"
            className="block underline text-sm"
          >
            Open in Xaman
          </a>
          <div className="text-xs text-muted-foreground break-all">
            uuid: {round.challenge.uuid}
          </div>
        </div>
      )}

      {round.error && (
        <div className="text-sm text-red-700">error: {round.error}</div>
      )}

      {round.result && (
        <div className="space-y-2 text-xs">
          <div>
            account:{' '}
            <span className="font-mono break-all">{round.result.account ?? '—'}</span>
          </div>
          <div>
            signmethod:{' '}
            <span className="font-mono">{round.result.signmethod ?? '—'}</span>
          </div>
          <div>
            <div>response.hex ({round.result.hex?.length ?? 0} chars):</div>
            <div className="font-mono break-all bg-muted/30 p-2 rounded">
              {round.result.hex ?? '—'}
            </div>
          </div>
          <details>
            <summary className="cursor-pointer">request_json</summary>
            <pre className="font-mono text-[10px] whitespace-pre-wrap break-all bg-muted/30 p-2 rounded mt-1">
              {JSON.stringify(round.result.requestJson, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}
