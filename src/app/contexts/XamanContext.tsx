'use client'

// Xaman での取引の署名。ペイロードはサーバーが作る（doc/login.md「取引の署名（Xaman）」）。
// ブラウザ側の Xumm SDK は使わない。ログイン状態は AuthSessionContext が持つ。
import { createContext, useCallback, useContext, useState, ReactNode } from 'react'
import type { UnifiedTx } from '@/types/Wallet'
import {
  LOGIN_TTL_MS,
  createXamanSignRequest,
  fetchXamanSignResult,
  type XamanSignRequest,
} from '@/lib/auth/session-client'

interface TransactionResult {
  hash?: string;
  success: boolean;
  error?: string;
  [key: string]: string | number | boolean | object | null | undefined;
}

interface XamanContextType {
  signAndSubmitTransaction: (
    transaction: UnifiedTx,
    return_url_query?: string
  ) => Promise<TransactionResult>;
  error: string | null;
  clearError: () => void;
  /** 署名待ちのリクエスト（QR やリンクを出す画面が使う） */
  currentSignRequest: XamanSignRequest | null;
  clearSignRequest: () => void;
}

const XamanContext = createContext<XamanContextType | null>(null)

function useXamanContext(name: string) {
  const context = useContext(XamanContext)
  if (!context) throw new Error(`${name} must be used within a XamanProvider`)
  return context
}

export const useSignAndSubmitTransaction = () =>
  useXamanContext('useSignAndSubmitTransaction').signAndSubmitTransaction

export const useXamanError = () => {
  const { error, clearError } = useXamanContext('useXamanError')
  return { error, clearError }
}

export const useXamanSignRequest = () => {
  const { currentSignRequest, clearSignRequest } = useXamanContext('useXamanSignRequest')
  return { signRequest: currentSignRequest, clearSignRequest }
}

/** WebSocket で決着の知らせを待つ。知らせが来なくても期限で打ち切る */
function waitForResolution(wsUrl: string): Promise<void> {
  return new Promise((resolve) => {
    const socket = new WebSocket(wsUrl)
    const finish = () => {
      clearTimeout(timer)
      socket.close()
      resolve()
    }
    const timer = setTimeout(finish, LOGIN_TTL_MS)
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if ('signed' in data || 'expired' in data) finish()
      } catch {
        /* 状態以外のメッセージは無視 */
      }
    }
    socket.onerror = finish
  })
}

export const XamanProvider = ({ children }: { children: ReactNode }) => {
  const [error, setError] = useState<string | null>(null)
  const [currentSignRequest, setCurrentSignRequest] = useState<XamanSignRequest | null>(null)

  const signAndSubmitTransaction = useCallback(async (
    transaction: UnifiedTx,
    return_url_query?: string
  ): Promise<TransactionResult> => {
    setError(null)
    const txjson = 'txjson' in transaction ? transaction.txjson : transaction
    if ('txblob' in transaction) {
      return { success: false, error: 'txblob is not supported' }
    }

    let returnPath: string | undefined
    if (return_url_query) {
      const connector = window.location.search ? '&' : '?'
      returnPath = `${window.location.pathname}${window.location.search}${connector}${return_url_query}`
    }

    try {
      const request = await createXamanSignRequest(txjson, returnPath)
      setCurrentSignRequest(request)
      try {
        await waitForResolution(request.refs.websocket_status)
        // 結果は WebSocket ではなくサーバーで確かめる
        const result = await fetchXamanSignResult(request.uuid)
        switch (result.status) {
          case 'signed':
            return {
              success: true,
              hash: result.txid ?? undefined,
              dispatched_result: result.dispatched_result,
              payload_uuid: request.uuid,
            }
          case 'rejected':
            return { success: false, error: 'User cancelled', payload_uuid: request.uuid }
          case 'pending':
            return { success: false, error: 'Transaction signing timed out', payload_uuid: request.uuid }
          default:
            throw new Error(result.error)
        }
      } finally {
        setCurrentSignRequest(null)
      }
    } catch (err) {
      console.error('Signing error:', err)
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(errorMessage)
      return { success: false, error: errorMessage }
    }
  }, [])

  const value: XamanContextType = {
    signAndSubmitTransaction,
    error,
    clearError: () => setError(null),
    currentSignRequest,
    clearSignRequest: () => setCurrentSignRequest(null),
  }

  return (
    <XamanContext.Provider value={value}>
      {children}
    </XamanContext.Provider>
  )
}
