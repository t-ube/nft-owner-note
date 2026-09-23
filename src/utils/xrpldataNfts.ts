// utils/xrpldataNfts.ts
// コレクション（issuer + taxon）の NFT を 1 回でまとめて取る。
// XRPL の nfts_by_issuer は 100 件ずつ（最大 100）で往復が増えるため、
// 一覧をまとめて返すこの API を先に試し、失敗したら XRPL から取り直す。

const ENDPOINT = 'https://api.xrpldata.com/api/v1/xls20-nfts/issuer';
/** 1 回に取る上限（レスポンスヘッダの x-max-limit は 100000） */
const LIMIT = 100000;

export interface XrplDataNFT {
  nft_id: string;
  nft_serial: number;
  owner: string;
  /** デコード済み（DB に入れる形） */
  uri: string;
  /** XRPL の生 hex（名前の一括取得にそのまま使える） */
  hexUri: string;
  flags: number;
  transfer_fee: number;
  issuer: string;
  nft_taxon: number;
}

export interface XrplDataCollection {
  nfts: XrplDataNFT[];
  /** 取得時点のレジャー番号 */
  ledgerIndex: number;
}

interface XrplDataResponse {
  info?: { ledger_index?: number };
  data?: {
    nfts?: {
      NFTokenID: string;
      Issuer: string;
      Owner: string;
      Taxon: number;
      Sequence: number;
      TransferFee: number;
      Flags: number;
      URI?: string;
    }[];
  };
}

const decodeHexUri = (hex: string): string => {
  if (!/^[0-9a-f]*$/i.test(hex) || hex.length % 2 !== 0) return '';
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return new TextDecoder().decode(bytes);
};

/**
 * コレクションの NFT をまとめて取る。取れなければ null（呼び出し側で XRPL から取り直す）。
 * バーン済みの NFT は返らないので、呼び出し側で「一覧に無いものはバーン済み」として扱う。
 */
export async function fetchCollectionNFTs(issuer: string, taxon: string): Promise<XrplDataCollection | null> {
  try {
    const res = await fetch(
      `${ENDPOINT}/${encodeURIComponent(issuer)}/taxon/${encodeURIComponent(taxon)}?limit=${LIMIT}`
    );
    if (!res.ok) throw new Error(`xrpldata: HTTP ${res.status}`);
    const body = (await res.json()) as XrplDataResponse;
    const rows = body.data?.nfts;
    if (!Array.isArray(rows)) throw new Error('xrpldata: unexpected response');

    return {
      ledgerIndex: body.info?.ledger_index ?? 0,
      nfts: rows.map(row => {
        const hexUri = (row.URI ?? '').toUpperCase();
        return {
          nft_id: row.NFTokenID,
          nft_serial: row.Sequence,
          owner: row.Owner,
          uri: hexUri ? decodeHexUri(hexUri) : '',
          hexUri,
          flags: row.Flags,
          transfer_fee: row.TransferFee,
          issuer: row.Issuer,
          nft_taxon: row.Taxon,
        };
      }),
    };
  } catch (error) {
    console.error('Failed to fetch NFTs from xrpldata:', error);
    return null;
  }
}
