'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react'
import { Xumm } from "xumm"
import type { XummTypes } from 'xumm-sdk'
import type { UnifiedTx } from '@/types/Wallet'
import type { XummJsonTransaction } from '@/types/Xaman'

export const XAMAN_NETWORK = 'MAINNET'


// トランザクション結果の型定義
interface TransactionResult {
  hash?: string;
  success: boolean;
  error?: string;
  [key: string]: string | number | boolean | object | undefined;
}

// アカウント情報の型定義
interface Account {
  address: string;
}

interface XamanWalletProviderProps {
  children: ReactNode;
}

// 署名リクエストの型定義
interface SignRequest {
  payload: XummTypes.XummPostPayloadResponse;
  resolve: (result: TransactionResult) => void;
  reject: (error: Error) => void;
}

// コンテキストの型定義
interface XamanContextType {
  account: Account | undefined;
  isConnected: boolean;
  isConnecting: boolean;
  connect: () => Promise<boolean>;
  disconnect: () => Promise<boolean>;
  signAndSubmitTransaction: (
    transaction: UnifiedTx,
    return_url_query?: string
  ) => Promise<TransactionResult>;
  error: string | null;
  clearError: () => void;
  balanceXrp: number | null;
  // 署名UI用の状態
  currentSignRequest: SignRequest | null;
  clearSignRequest: () => void;
}

// Create context
const XamanContext = createContext<XamanContextType>({
  account: undefined,
  isConnected: false,
  isConnecting: false,
  connect: async () => false,
  disconnect: async () => false,
  signAndSubmitTransaction: async () => ({ success: false }),
  error: null,
  clearError: () => {},
  balanceXrp: null,
  currentSignRequest: null,
  clearSignRequest: () => {},
})

// 個別のカスタムフック
export const useAccount = () => {
  const context = useContext(XamanContext)
  if (context === undefined) {
    throw new Error('useAccount must be used within a XamanWalletProvider')
  }
  return context.account
}

export const useConnect = () => {
  const context = useContext(XamanContext)
  if (context === undefined) {
    throw new Error('useConnect must be used within a XamanWalletProvider')
  }
  return { 
    connect: context.connect, 
    isConnecting: context.isConnecting 
  }
}

export const useDisconnect = () => {
  const context = useContext(XamanContext)
  if (context === undefined) {
    throw new Error('useDisconnect must be used within a XamanWalletProvider')
  }
  return context.disconnect
}

export const useSignAndSubmitTransaction = () => {
  const context = useContext(XamanContext)
  if (context === undefined) {
    throw new Error('useSignAndSubmitTransaction must be used within a XamanWalletProvider')
  }
  return context.signAndSubmitTransaction
}

export const useXamanError = () => {
  const context = useContext(XamanContext)
  if (context === undefined) {
    throw new Error('useXamanError must be used within a XamanWalletProvider')
  }
  return { 
    error: context.error, 
    clearError: context.clearError 
  }
}

export const useXamanStatus = () => {
  const context = useContext(XamanContext)
  if (context === undefined) {
    throw new Error('useXamanStatus must be used within a XamanWalletProvider')
  }
  return { 
    isConnected: context.isConnected 
  }
}

export const useBalanceXrp = () => {
  const context = useContext(XamanContext)
  if (context === undefined) {
    throw new Error('useAccount must be used within a XamanWalletProvider')
  }
  return context.balanceXrp
}

// 署名リクエスト用のフック
export const useXamanSignRequest = () => {
  const context = useContext(XamanContext)
  if (context === undefined) {
    throw new Error('useXamanSignRequest must be used within a XamanWalletProvider')
  }
  return {
    signRequest: context.currentSignRequest,
    clearSignRequest: context.clearSignRequest
  }
}

// Provider component
export const XamanProvider = ({ children }: XamanWalletProviderProps) => {
  const [account, setAccount] = useState<Account | undefined>(undefined)
  const [isConnecting, setIsConnecting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [currentSignRequest, setCurrentSignRequest] = useState<SignRequest | null>(null)
  const [balanceXrp, setBalanceXrp] = useState<number | null>(null);
  
  const xaman = useMemo(() => {
    return new Xumm(process.env.NEXT_PUBLIC_XAMAN_API_KEY as string, undefined);
  }, []);

  const checkConnectionStatus = useCallback(async () => {
    try {
      const user = await xaman.user;
      if (user) {
        const accountAddress = await user.account;
        if (accountAddress) {
          setAccount({ address: accountAddress });
          setBalanceXrp(await getXrpBalance(accountAddress));
        }
      }
    } catch (error) {
      console.warn('No existing connection:', error);
    }
  }, [xaman]);
  
  const connect = useCallback(async (): Promise<boolean> => {
    setIsConnecting(true)
    setError(null)
  
    try {
      console.log('Starting wallet connection process...');
      const result = await xaman.authorize();

      if (result instanceof Error) {
        console.error('Authorize failed:', result);
        setError(result.message);
        return false;
      }

      if (!result) {
        // undefined の場合は「何も起きなかった/キャンセル扱い」
        setError('Sign-in was cancelled');
        return false;
      }

      console.log('Authorize finished.');
      
      const address = await xaman.user.account;
      if (address) {
        setAccount({ address });
        setBalanceXrp(await getXrpBalance(address));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Wallet connection error:', error);
      setError('Failed to connect wallet');
      return false;
    } finally {
      setIsConnecting(false);
      console.log('Wallet connection process ended.');
    }
  }, [xaman]);

  const disconnect = async (): Promise<boolean> => {
    try {
      await xaman.logout();
      setAccount(undefined);
      setBalanceXrp(null);
      return true
    } catch (error) {
      console.error('Wallet disconnection error:', error);
      setError('Failed to disconnect wallet');
      return false;
    }
  }

  useEffect(() => {
    console.log('Checking existing Xaman connection status...');
    checkConnectionStatus().then(() => {
    });
  }, [checkConnectionStatus]);

  const signAndSubmitTransaction = async (
    transaction: UnifiedTx,
    return_url_query?: string
  ): Promise<TransactionResult> => {
    setError(null)

    const baseUrl = window.location.origin + window.location.pathname
    const connector = window.location.search ? '&' : '?'
    const fullUrl = return_url_query ? `${baseUrl}${connector}${return_url_query}` : baseUrl

    try {
      if (!account) throw new Error('Wallet is not connected');
      const payload = await xaman.payload?.create({
        txjson: transaction as XummJsonTransaction,
        options: {
          return_url: {
            app: fullUrl,
            web: fullUrl,
          },
          force_network: XAMAN_NETWORK
        }
      })

      if (!payload) throw new Error('Failed to create payload');
      // Promiseで署名プロセスを管理
      return new Promise((resolve, reject) => {
        // 署名リクエストを設定（UIコンポーネントが検知する）
        setCurrentSignRequest({ payload, resolve, reject })

        const socket = new WebSocket(payload.refs.websocket_status)
        const timeout = setTimeout(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.close()
            setCurrentSignRequest(null)
            reject(new Error('Transaction signing timed out'));
          }
        }, 60000)

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (data.signed === true) {
              clearTimeout(timeout)
              socket.close()
              const result = {
                hash: data.txid,
                success: true,
                payload_uuid: payload.uuid,
                next: payload.next,
                refs: payload.refs,
                pushed: payload.pushed
              }
              resolve(result)
              setCurrentSignRequest(null)
            } else if (data.signed === false) {
              clearTimeout(timeout)
              socket.close()
              const result = {
                success: false,
                error: 'User cancelled',
                payload_uuid: payload.uuid
              }
              resolve(result)
              setCurrentSignRequest(null)
            }
          } catch (e) {
            console.error('WebSocket parsing error:', e);
          }
        }

        socket.onerror = (err) => {
          clearTimeout(timeout)
          console.error('WebSocket error:', err);
          socket.close()
          setCurrentSignRequest(null)
          reject(new Error('WebSocket communication error'));
        }

        socket.onclose = () => {
          console.log('WebSocket connection closed');
        }
      })
    } catch (err) {
      console.error('Signing error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage)
      setCurrentSignRequest(null)
      return { success: false, error: errorMessage }
    }
  }

  const clearError = (): void => {
    setError(null)
  }

  const clearSignRequest = (): void => {
    setCurrentSignRequest(null)
  }

  const getXrpBalance = async (address: string): Promise<number | null> => {
    try {
      const res = await fetch('/api/xrp-balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      })
      if (!res.ok) {
        console.warn('Failed to fetch balance:', await res.text());
        return null
      }
      const data = await res.json()
      return data.availableXrp ?? null
    } catch (err) {
      console.error('Balance fetch error:', err);
      return null
    }
  }

  const value: XamanContextType = {
    account,
    isConnected: !!account,
    isConnecting,
    connect,
    disconnect,
    signAndSubmitTransaction,
    error,
    clearError,
    balanceXrp,
    currentSignRequest,
    clearSignRequest,
  }

  return (
    <XamanContext.Provider value={value}>
      {children}
    </XamanContext.Provider>
  )
}
