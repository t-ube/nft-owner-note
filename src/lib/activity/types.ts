// マイアクティビティの行と集計の形（src/query/activity.sql の戻り値）

/**
 * 行の種類。transfer は 0 での受け渡し、resale は他人の NFT の転売、
 * purchase（NFT の購入）と payment_out（送金）は支出
 */
export const ACTIVITY_KINDS = [
  "mint",
  "sale",
  "secondary",
  "resale",
  "transfer",
  "payment",
  "launchpad_revenue",
  "purchase",
  "payment_out",
] as const;
/** 一度に問い合わせるアドレスの上限 */
export const ACTIVITY_MAX_ADDRESSES = 50;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** 絞り込みで選ぶ種類。ミントは手動とローンチパッドに分ける */
/** sale は一次販売、secondary は二次販売、payment は着金、launchpad_revenue はローンチパッドの収益、payment_out は送金、purchase は NFT の購入 */
export const ACTIVITY_FILTER_KINDS = [
  "sale",
  "secondary",
  "launchpad",
  "manual",
  "payment",
  "launchpad_revenue",
  "transfer",
  "resale",
  "payment_out",
  "purchase",
] as const;
export type ActivityFilterKind = (typeof ACTIVITY_FILTER_KINDS)[number];

/** ミントの分け方。manual: オーナーが発行者本人 / launchpad: 委任ミント（オーナーが発行者と違う） */
export type MintType = "manual" | "launchpad";

export type ActivityItem = {
  kind: ActivityKind;
  /** mint のときだけ。ほかは null */
  mint_type: MintType | null;
  tx_hash: string;
  tx_date: string;
  nftoken_id: string | null;
  uri: string | null;
  /** NFT 名（uri_cache の metadata.name）。無ければ null */
  name: string | null;
  issuer: string | null;
  /** mint / sale: オーナー / payment: 払った人 */
  from_account: string | null;
  /** mint: 次のオーナー（destination） / sale: 次のオーナー（買い手） / payment: 受け取ったアドレス */
  to_account: string | null;
  /** 'XRP'、IOU の通貨コード、または 'MPT'。mint と金額未確定の行は null */
  currency: string | null;
  currency_issuer: string | null;
  /** 自分に入った額 */
  received: number | null;
  /** 自分から出ていった額（purchase / payment_out のとき） */
  spent: number | null;
  /** 金額が確定しているか（false の行は合計に入れない） */
  settled: boolean;
  memo: string | null;
};

export type ActivityCurrencyTotal = {
  currency: string;
  currency_issuer: string | null;
  received: number;
  spent: number;
  sale_count: number;
  payment_count: number;
};

/** 対象者（オーナー・次のオーナー・払った人として登場した相手。自分の対象アドレスは除く） */
export type ActivityParty = {
  address: string;
  /** オーナー（売り手・ミント時の所有者・払った人）として登場した件数 */
  owner_count: number;
  /** 次のオーナー（買い手・ミントの destination）として登場した件数 */
  next_owner_count: number;
  /** その相手が関わった取引で自分に入った額（通貨ごと、確定分のみ、多い順） */
  received: {
    currency: string;
    currency_issuer: string | null;
    received: number;
  }[];
};

export type ActivitySummary = {
  currencies: ActivityCurrencyTotal[];
  /** 手動ミントの件数 */
  manual_mint_count: number;
  /** ローンチパッド（委任ミント）の件数。販売数にも含まれる */
  launchpad_mint_count: number;
  /** 販売数（一次 + 二次 + ローンチパッド） */
  sale_count: number;
  payment_count: number;
  /** ローンチパッドの収益（着金のうちローンチパッドからの支払い）の件数。古い版の集計関数では無い */
  launchpad_revenue_count?: number;
  /** 一次販売（自分が売り手）の件数 */
  primary_count: number;
  /** 二次販売（自分の NFT を他人が売った）の件数 */
  secondary_count: number;
  /** 転送（0 での受け渡し）の件数。販売数には含まない */
  transfer_count: number;
  /** 転売（他人の NFT を自分が売った）の件数 */
  resale_count: number;
  /** 送金（自分が送った Payment）の件数 */
  payment_out_count: number;
  /** 購入（自分が NFT を買った）の件数 */
  purchase_count: number;
  buyer_count: number;
  /** 購入者数の内訳（それぞれ重複なし。足しても buyer_count にはならない）。古い版の集計関数では無い */
  primary_buyer_count?: number;
  secondary_buyer_count?: number;
  launchpad_buyer_count?: number;
  payer_count: number;
  unsettled_count: number;
  /** 種類ごとの XRP の受取・支出（確定分）。古い版の集計関数では無い */
  xrp_by_kind?: Partial<
    Record<ActivityKind, { received: number; spent: number }>
  >;
  /** 登場の多い順に上位 50。対象者での絞り込みはかけない */
  parties: ActivityParty[];
};

/** 絞り込み。日時は ISO 文字列で、from 以上 to 未満。parties が空なら対象者で絞らない */
export type ActivityFilter = {
  addresses: string[];
  /** 空ならすべての種類 */
  kinds: ActivityFilterKind[];
  parties: string[];
  /** 0 での売買（転送）も含める。既定では含めない */
  includeTransfers: boolean;
  /** 手動ミント（次のオーナーが無いか、対象アドレスのどれかのミント）も含める。既定では含めない */
  includeSelfMints: boolean;
  from: string | null;
  to: string | null;
};

/** 通貨ごとの受取（と支出）。支出が無い集計では spent は無い */
export type ActivityReceived = {
  currency: string;
  currency_issuer: string | null;
  received: number;
  spent?: number;
};

/** 日別（画面のタイムゾーンでの日付ごと） */
export type ActivityDay = {
  /** 'YYYY-MM-DD' */
  day: string;
  /** 手動ミントの件数 */
  manual_mint_count: number;
  /** ローンチパッド（委任ミント）の件数。販売数にも含まれる */
  launchpad_mint_count: number;
  /** 販売数（一次 + 二次 + ローンチパッド） */
  sale_count: number;
  payment_count: number;
  /** 転送（0 での受け渡し）の件数。販売数には含まない */
  transfer_count: number;
  /** 転売（他人の NFT を自分が売った）の件数 */
  resale_count: number;
  /** 支出（NFT の購入と送金）の件数 */
  expense_count: number;
  buyer_count: number;
  /** その日の購入者（自分の対象アドレスは除く） */
  buyers: string[];
  received: ActivityReceived[];
};

/** 月別（画面のタイムゾーンでの月ごと） */
export type ActivityMonth = {
  /** 'YYYY-MM' */
  month: string;
  /** 手動ミントの件数 */
  manual_mint_count: number;
  /** ローンチパッド（委任ミント）の件数。販売数にも含まれる */
  launchpad_mint_count: number;
  /** 販売数（一次 + 二次 + ローンチパッド） */
  sale_count: number;
  payment_count: number;
  /** 転送（0 での受け渡し）の件数。販売数には含まない */
  transfer_count: number;
  /** 転売（他人の NFT を自分が売った）の件数 */
  resale_count: number;
  /** 支出（NFT の購入と送金）の件数 */
  expense_count: number;
  buyer_count: number;
  received: ActivityReceived[];
};

/** 月別の表示のまとめ方 */
export type ActivityGroupBy = 'artwork' | 'buyer';

/** 月別の表示の 1 まとまり（src/query/activity.sql の owner_note_activity_groups） */
export type ActivityGroup = {
  key: string;
  kind: ActivityKind;
  mint_type: 'manual' | 'launchpad' | null;
  /** 相手（購入者ごとなら購入者。作品ごとなら最後の取引の相手）。購入は売り手、着金などは払った人、送金は送り先 */
  address: string | null;
  count: number;
  /** 相手の数（重複なし、自分の対象アドレスは除く） */
  people_count: number;
  /** 作品の数（重複なし） */
  artwork_count: number;
  last_date: string;
  /** 作品（新しい順に 16 点まで、同じ作品は 1 点） */
  artworks: { name: string | null; uri: string | null; nftoken_id: string | null }[];
  /** 確定分の受取・支出（通貨ごと） */
  amounts: { currency: string; currency_issuer: string | null; received: number; spent: number }[];
};

export type ActivityGroups = {
  /** NFT のある取引のまとまり */
  groups: ActivityGroup[];
  /** NFT の無い取引（着金・ローンチパッドの収益・送金）のまとまり */
  others: ActivityGroup[];
};

export type ActivityCursor = { before_date: string; before_hash: string };

export type ActivityPage = {
  items: ActivityItem[];
  /** 続きを取るときのカーソル。最後のページなら null */
  next: ActivityCursor | null;
};
