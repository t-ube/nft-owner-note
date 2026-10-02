// サーバー専用。マイアクティビティの RPC（定義は src/query/activity.sql）と、クエリの読み取り。
import { isValidClassicAddress } from 'ripple-address-codec';
import { supabaseAdmin } from '@/lib/supabase/admin';
import {
  ACTIVITY_FILTER_KINDS,
  ACTIVITY_MAX_ADDRESSES,
  type ActivityCursor,
  type ActivityFilter,
  type ActivityItem,
  type ActivityFilterKind,
  type ActivitySummary,
  type ActivityDay,
  type ActivityMonth,
  type ActivityGroupBy,
  type ActivityGroups,
} from '@/lib/activity/types';

export const ACTIVITY_PAGE_SIZE = 50;

function isDate(s: string | null): s is string {
  return !!s && !Number.isNaN(Date.parse(s));
}

/**
 * クエリから絞り込みを読む。アドレスが無ければログイン中のアドレスだけにする。
 * 台帳の公開情報なので、ログイン中なら任意のアドレスを受け付ける。
 */
export function parseActivityFilter(params: URLSearchParams, sessionAddress: string): ActivityFilter | null {
  const addresses = Array.from(new Set(params.getAll('address')));
  if (addresses.length > ACTIVITY_MAX_ADDRESSES || addresses.some((a) => !isValidClassicAddress(a))) return null;

  const parties = Array.from(new Set(params.getAll('party')));
  if (parties.length > ACTIVITY_MAX_ADDRESSES || parties.some((a) => !isValidClassicAddress(a))) return null;

  const kinds = Array.from(new Set(params.getAll('kind')));
  if (kinds.some((k) => !(ACTIVITY_FILTER_KINDS as readonly string[]).includes(k))) return null;

  const from = params.get('from');
  const to = params.get('to');
  if ((from && !isDate(from)) || (to && !isDate(to))) return null;

  return {
    addresses: addresses.length > 0 ? addresses : [sessionAddress],
    kinds: kinds as ActivityFilterKind[],
    parties,
    includeTransfers: params.get('include_transfers') === '1',
    includeSelfMints: params.get('include_self_mints') === '1',
    from: from || null,
    to: to || null,
  };
}

export function parseCursor(params: URLSearchParams): ActivityCursor | null {
  const date = params.get('before_date');
  const hash = params.get('before_hash');
  return isDate(date) && hash && /^[0-9A-Fa-f]{64}$/.test(hash) ? { before_date: date, before_hash: hash } : null;
}

function filterParams(filter: ActivityFilter) {
  return {
    p_addresses: filter.addresses,
    // 種類の指定が無ければすべて
    p_kinds: filter.kinds.length > 0 ? filter.kinds : null,
    p_from: filter.from,
    p_to: filter.to,
    // 対象者の指定が無ければ絞らない
    p_parties: filter.parties.length > 0 ? filter.parties : null,
    // 既定では転送と手動ミントを除く（含める指定があったときだけ除かない）
    p_exclude_transfers: !filter.includeTransfers,
    p_exclude_self_mints: !filter.includeSelfMints,
  };
}

export async function fetchActivity(
  filter: ActivityFilter,
  cursor: ActivityCursor | null,
  limit = ACTIVITY_PAGE_SIZE
): Promise<ActivityItem[] | null> {
  const { data, error } = await supabaseAdmin.rpc('owner_note_activity', {
    ...filterParams(filter),
    p_before_date: cursor?.before_date ?? null,
    p_before_hash: cursor?.before_hash ?? null,
    p_limit: limit,
  });
  if (error) {
    console.error('[activity] owner_note_activity failed:', error.message);
    return null;
  }
  return (data ?? []) as ActivityItem[];
}

export async function fetchActivitySummary(filter: ActivityFilter): Promise<ActivitySummary | null> {
  const { data, error } = await supabaseAdmin.rpc('owner_note_activity_summary', filterParams(filter));
  if (error) {
    console.error('[activity] owner_note_activity_summary failed:', error.message);
    return null;
  }
  return data as ActivitySummary;
}

/** IANA のタイムゾーン名らしいか（不正な値は Postgres がエラーにする） */
export function isTimeZone(tz: string | null): tz is string {
  return !!tz && /^[A-Za-z0-9_+\-/]{1,64}$/.test(tz);
}

async function fetchByPeriod<T>(rpc: string, filter: ActivityFilter, tz: string): Promise<T[] | null> {
  const { data, error } = await supabaseAdmin.rpc(rpc, { ...filterParams(filter), p_tz: tz });
  if (error) {
    console.error(`[activity] ${rpc} failed:`, error.message);
    return null;
  }
  return (data ?? []) as T[];
}

/** 日別。tz（画面のタイムゾーン）での日付ごとの集計 */
export function fetchActivityDaily(filter: ActivityFilter, tz: string): Promise<ActivityDay[] | null> {
  return fetchByPeriod<ActivityDay>('owner_note_activity_daily', filter, tz);
}

/** 月別。tz（画面のタイムゾーン）での月ごとの集計 */
export function fetchActivityMonthly(filter: ActivityFilter, tz: string): Promise<ActivityMonth[] | null> {
  return fetchByPeriod<ActivityMonth>('owner_note_activity_monthly', filter, tz);
}

/** 月別の表示。作品ごと・購入者ごとにまとめる */
export async function fetchActivityGroups(filter: ActivityFilter, by: ActivityGroupBy): Promise<ActivityGroups | null> {
  const { data, error } = await supabaseAdmin.rpc('owner_note_activity_groups', { ...filterParams(filter), p_by: by });
  if (error) {
    console.error('[activity] owner_note_activity_groups failed:', error.message);
    return null;
  }
  return data as ActivityGroups;
}

/** 月別の表示のまとまりの中の行（新しい順、500 件まで）。key は fetchActivityGroups が返した key */
export async function fetchActivityGroupItems(
  filter: ActivityFilter,
  by: ActivityGroupBy,
  key: string
): Promise<ActivityItem[] | null> {
  const { data, error } = await supabaseAdmin.rpc('owner_note_activity_group_rows', {
    ...filterParams(filter),
    p_by: by,
    p_key: key,
  });
  if (error) {
    console.error('[activity] owner_note_activity_group_rows failed:', error.message);
    return null;
  }
  return (data ?? []) as ActivityItem[];
}
