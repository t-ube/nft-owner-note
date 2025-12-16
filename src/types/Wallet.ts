export type WalletType = 'xaman'// | 'crossmark'

export interface Wallet {
  name: string;
  icon: string;
  walletType: WalletType;
}

export const Wallets: Wallet[] = [
  { name: 'Xaman', icon: '/images/icon/xaman.svg', walletType: 'xaman' },
  /*{ name: 'Crossmark', icon: '/images/icon/crossmark.ico', walletType: 'crossmark' }*/
];
