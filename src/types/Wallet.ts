import {
  XummJsonTransaction,
  XummPostPayloadBodyBlob,
  XummPostPayloadBodyJson
} from '@/types/Xaman'

export type WalletType = 'xaman' | 'joey'// | 'crossmark'
export type TxJson = Record<string, unknown>

export type XamanTx =
  | XummPostPayloadBodyJson
  | XummPostPayloadBodyBlob
  | XummJsonTransaction

export type UnifiedTx = XamanTx

export type TxResult =
  | { success: true; hash?: string; raw?: unknown }
  | { success: false; error: string; raw?: unknown }

export interface Wallet {
  name: string;
  icon: string;
  walletType: WalletType;
}

export const Wallets: Wallet[] = [
  { name: 'Xaman', icon: '/images/icon/xaman.svg', walletType: 'xaman' },
  { name: 'Joey', icon: '/images/icon/joey.svg', walletType: 'joey' }
  /*{ name: 'Crossmark', icon: '/images/icon/crossmark.ico', walletType: 'crossmark' }*/
];
