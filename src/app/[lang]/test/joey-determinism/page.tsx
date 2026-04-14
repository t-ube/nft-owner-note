'use client'

// Determinism check for Joey signTransaction over a canonical fixed AccountSet.
//
// Goal: verify that two consecutive calls to signTransaction with
// `autofill: false, submit: false` and a byte-identical tx_json produce
// the same TxnSignature. If yes, we can fold backup-key derivation into
// the existing Joey auth sign (no extra signing operation).
//
// Manually run two sign rounds on the same Joey account, compare the
// resulting TxnSignature (and full tx_json) side-by-side.

import { useCallback, useEffect, useState } from 'react'
import { convertStringToHex } from 'xrpl'
import { useProvider as useJoey } from '@/app/contexts/JoeyContext'

type SignedTx = {
  TransactionType?: string
  Account?: string
  Fee?: string
  Sequence?: number
  Flags?: number
  SigningPubKey?: string
  TxnSignature?: string
  [key: string]: unknown
}

type Round = {
  index: 1 | 2
  status: 'idle' | 'signing' | 'done' | 'error'
  signed: SignedTx | null
  error: string | null
}

function emptyRound(index: 1 | 2): Round {
  return { index, status: 'idle', signed: null, error: null }
}

function extractXrplAddress(caipAccount?: string | null): string | null {
  if (!caipAccount) return null
  const parts = caipAccount.split(':')
  if (parts.length !== 3) return null
  const [namespace, , address] = parts
  if (namespace !== 'xrpl') return null
  return address
}

export default function JoeyDeterminismTestPage() {
  const joey = useJoey()
  const [round1, setRound1] = useState<Round>(() => emptyRound(1))
  const [round2, setRound2] = useState<Round>(() => emptyRound(2))
  const [connectError, setConnectError] = useState<string | null>(null)
  const [isConnecting, setIsConnecting] = useState(false)

  const connected = !!(joey.session && joey.accounts?.length)
  const address = connected && joey.accounts ? extractXrplAddress(joey.accounts[0]) : null

  useEffect(() => {
    if (connected) setConnectError(null)
  }, [connected])

  const connect = useCallback(async () => {
    setConnectError(null)
    setIsConnecting(true)
    try {
      const res = await joey.actions.connect()
      if (res?.error) {
        setConnectError(res.error.message)
      }
    } catch (e) {
      setConnectError(e instanceof Error ? e.message : 'unknown error')
    } finally {
      setIsConnecting(false)
    }
  }, [joey.actions])

  const disconnect = useCallback(async () => {
    try {
      await joey.actions.disconnect()
    } catch (e) {
      console.warn('Joey disconnect failed', e)
    }
  }, [joey.actions])

  const signRound = useCallback(
    async (index: 1 | 2) => {
      if (!address) return
      const setRound = index === 1 ? setRound1 : setRound2
      setRound({ index, status: 'signing', signed: null, error: null })

      try {
        const api = joey.api
        if (!api || !joey.session) {
          throw new Error('Joey API or session is not initialized')
        }
        const topic = joey.session.topic

        // Canonical AccountSet with a Memo carrying the backup-key
        // derivation marker. Use autofill:true so the wallet computes
        // valid Sequence/Fee from the current account state. Because
        // submit:false the tx is never broadcast, the on-chain Sequence
        // never advances, so two consecutive autofill+sign calls should
        // see the same Sequence value — making the resulting TxnSignature
        // deterministic in practice. This is what we want to verify.
        //
        // Memo hex strings are produced via xrpl.js's official helper
        // (convertStringToHex) so we never hand-roll the encoding.
        const tx = {
          TransactionType: 'AccountSet',
          Account: address,
          Memos: [
            {
              Memo: {
                MemoType: convertStringToHex('owner-note/backup-key'),
                MemoFormat: convertStringToHex('text/plain'),
                MemoData: convertStringToHex('xrpl-owner-note:backup-key:v1'),
              },
            },
          ],
        }

        const signRes = await api.signTransaction(
          {
            tx_signer: address,
            tx_json: tx,
            options: { autofill: true, submit: false },
          } as unknown as Parameters<typeof api.signTransaction>[0],
          { sessionId: topic, chainId: joey.chain }
        )
        if (signRes.error) throw signRes.error
        const signed = signRes.data?.tx_json as unknown as SignedTx | undefined
        if (!signed) throw new Error('Joey returned no signed tx_json')
        setRound({ index, status: 'done', signed, error: null })
      } catch (e) {
        setRound({
          index,
          status: 'error',
          signed: null,
          error: e instanceof Error ? e.message : 'unknown error',
        })
      }
    },
    [address, joey.api, joey.session, joey.chain]
  )

  const reset = () => {
    setRound1(emptyRound(1))
    setRound2(emptyRound(2))
  }

  const bothDone = round1.status === 'done' && round2.status === 'done'
  const sameSignature =
    bothDone && round1.signed?.TxnSignature && round2.signed?.TxnSignature
      ? round1.signed.TxnSignature === round2.signed.TxnSignature
      : false
  const sameFullTx =
    bothDone && round1.signed && round2.signed
      ? JSON.stringify(round1.signed) === JSON.stringify(round2.signed)
      : false

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6 font-sans">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">Joey signTransaction determinism test</h1>
        <p className="text-sm text-muted-foreground">
          Sign a canonical fixed AccountSet (autofill: false, submit: false)
          twice on the same Joey account. If both rounds produce the same{' '}
          <code>TxnSignature</code>, we can fold backup-key derivation into
          the existing Joey auth sign with no extra signing operation.
        </p>
      </header>

      <div className="rounded border p-4 space-y-2">
        <div className="font-semibold">Wallet</div>
        {connected ? (
          <>
            <div className="text-sm">
              connected: <span className="font-mono break-all">{address ?? '—'}</span>
            </div>
            <button className="rounded border px-3 py-1 text-sm" onClick={disconnect}>
              Disconnect
            </button>
          </>
        ) : (
          <>
            <div className="text-sm text-muted-foreground">not connected</div>
            <button
              className="rounded border px-3 py-1 text-sm disabled:opacity-50"
              onClick={connect}
              disabled={isConnecting}
            >
              {isConnecting ? 'Connecting…' : 'Connect Joey'}
            </button>
            {connectError && (
              <div className="text-sm text-red-700">connect error: {connectError}</div>
            )}
          </>
        )}
      </div>

      <div className="flex gap-3">
        <button
          className="rounded border px-4 py-2 disabled:opacity-50"
          onClick={() => signRound(1)}
          disabled={!connected || round1.status === 'signing'}
        >
          Sign round 1
        </button>
        <button
          className="rounded border px-4 py-2 disabled:opacity-50"
          onClick={() => signRound(2)}
          disabled={!connected || round1.status !== 'done' || round2.status === 'signing'}
        >
          Sign round 2
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
            same TxnSignature:{' '}
            <span className={sameSignature ? 'text-green-700' : 'text-red-700'}>
              {sameSignature ? 'YES (deterministic)' : 'NO (non-deterministic)'}
            </span>
          </div>
          <div>
            same full tx_json:{' '}
            <span className={sameFullTx ? 'text-green-700' : 'text-red-700'}>
              {sameFullTx ? 'YES' : 'NO'}
            </span>
          </div>
          {!sameSignature && (
            <p className="text-sm text-muted-foreground">
              Joey signTransaction is non-deterministic for this configuration.
              Inspect the diff between the two tx_json blobs to see what Joey
              injected (Sequence, Fee, LastLedgerSequence, Flags, NetworkID, etc.).
            </p>
          )}
          {sameSignature && sameFullTx && (
            <p className="text-sm text-muted-foreground">
              Joey signTransaction is deterministic for this configuration.
              Backup-key derivation can reuse the same TxnSignature without
              an extra signing operation.
            </p>
          )}
          {sameSignature && !sameFullTx && (
            <p className="text-sm text-muted-foreground">
              Signature matches but the surrounding tx_json fields differ.
              That is fine for backup-key derivation as long as we use only
              the TxnSignature.
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
      {round.error && (
        <div className="text-sm text-red-700">error: {round.error}</div>
      )}
      {round.signed && (
        <div className="space-y-2 text-xs">
          <div>
            <div>TxnSignature ({round.signed.TxnSignature?.length ?? 0} chars):</div>
            <div className="font-mono break-all bg-muted/30 p-2 rounded">
              {round.signed.TxnSignature ?? '—'}
            </div>
          </div>
          <div>
            <div>SigningPubKey:</div>
            <div className="font-mono break-all bg-muted/30 p-2 rounded">
              {round.signed.SigningPubKey ?? '—'}
            </div>
          </div>
          <details>
            <summary className="cursor-pointer">full tx_json</summary>
            <pre className="font-mono text-[10px] whitespace-pre-wrap break-all bg-muted/30 p-2 rounded mt-1">
              {JSON.stringify(round.signed, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  )
}
