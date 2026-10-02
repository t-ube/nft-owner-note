// マイアクティビティの表示用の整形

/** URI が XRPL の生 hex なら UTF-8 に直す（画像キャッシュ API はデコード済みの uri で引く） */
export function decodeUri(uri: string | null): string | null {
  if (!uri) return null;
  if (uri.length % 2 !== 0 || !/^[0-9A-Fa-f]+$/.test(uri)) return uri;
  const bytes = new Uint8Array(uri.length / 2);
  for (let i = 0; i < bytes.length; i++)
    bytes[i] = parseInt(uri.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes).replace(/\0+$/, "");
}

/** 40 桁 hex の通貨コードは読める文字に直す（例: 534F4C4F... → SOLO） */
export function currencyLabel(currency: string | null): string {
  if (!currency) return "";
  if (currency.length === 40 && /^[0-9A-Fa-f]+$/.test(currency)) {
    const text = decodeUri(currency)?.replace(/\0/g, "").trim();
    if (text) return text;
  }
  return currency;
}

/** 金額の表示のしかた。roundUp なら絶対値で小数第 2 位まで切り上げる（日別の表示用） */
export type AmountFormat = { roundUp?: boolean };

/** 絶対値で小数第 2 位まで切り上げる（-1.234 → -1.24）。浮動小数の誤差（1.1 * 100 = 110.00000000000001）を避ける */
function ceilTo2(value: number): number {
  const scaled = Number((Math.abs(value) * 100).toFixed(8));
  return (Math.sign(value) * Math.ceil(scaled)) / 100;
}

export function formatAmount(
  amount: number | null,
  currency: string | null,
  lang: string,
  format: AmountFormat = {},
): string {
  if (amount === null || amount === undefined) return "—";
  const value = format.roundUp ? ceilTo2(Number(amount)) : Number(amount);
  const n = value.toLocaleString(lang === "ja" ? "ja-JP" : "en-US", {
    maximumFractionDigits: format.roundUp ? 2 : 6,
  });
  return `${n} ${currencyLabel(currency)}`.trim();
}

export function formatDate(iso: string, lang: string): string {
  return new Date(iso).toLocaleString(lang === "ja" ? "ja-JP" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortAddr(addr: string): string {
  return addr.length <= 12 ? addr : `${addr.slice(0, 5)}…${addr.slice(-4)}`;
}

export function txUrl(hash: string): string {
  return `https://bithomp.com/explorer/${hash}`;
}

/** Bithomp の NFT のページ（NFTSiteIcons と同じ形） */
export function bithompNftUrl(nftokenId: string): string {
  return `https://bithomp.com/en/nft/${nftokenId}`;
}

/** xrp.cafe の NFT のページ（NFTSiteIcons と同じ形） */
export function xrpcafeNftUrl(nftokenId: string): string {
  return `https://xrp.cafe/nft/${nftokenId}`;
}
