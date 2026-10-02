// 画面側のマイアクティビティ API 呼び出し
import type {
  ActivityCursor,
  ActivityDay,
  ActivityMonth,
  ActivityFilter,
  ActivityPage,
  ActivitySummary,
  ActivityGroupBy,
  ActivityGroups,
  ActivityItem,
} from '@/lib/activity/types';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(typeof data?.error === 'string' ? data.error : `http_${res.status}`);
  }
  return res.json();
}

function filterQuery(filter: ActivityFilter): URLSearchParams {
  const params = new URLSearchParams();
  filter.addresses.forEach((a) => params.append('address', a));
  filter.kinds.forEach((k) => params.append('kind', k));
  filter.parties.forEach((a) => params.append('party', a));
  if (filter.includeTransfers) params.set('include_transfers', '1');
  if (filter.includeSelfMints) params.set('include_self_mints', '1');
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  return params;
}

/** 一覧の 1 ページ。limit は 1 ページの件数（1〜50、既定は 50） */
export function fetchActivityPage(
  filter: ActivityFilter,
  cursor?: ActivityCursor | null,
  limit?: number
): Promise<ActivityPage> {
  const params = filterQuery(filter);
  if (limit) params.set('limit', String(limit));
  if (cursor) {
    params.set('before_date', cursor.before_date);
    params.set('before_hash', cursor.before_hash);
  }
  return getJson<ActivityPage>(`/api/activity?${params}`);
}

export function fetchActivitySummary(filter: ActivityFilter): Promise<ActivitySummary> {
  return getJson<ActivitySummary>(`/api/activity/summary?${filterQuery(filter)}`);
}

function periodQuery(filter: ActivityFilter): URLSearchParams {
  const params = filterQuery(filter);
  params.set('tz', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  return params;
}

/** 日別。日付は端末のタイムゾーンで区切る */
export function fetchActivityDaily(filter: ActivityFilter): Promise<ActivityDay[]> {
  return getJson<ActivityDay[]>(`/api/activity/daily?${periodQuery(filter)}`);
}

/** 月別。月は端末のタイムゾーンで区切る */
export function fetchActivityMonthly(filter: ActivityFilter): Promise<ActivityMonth[]> {
  return getJson<ActivityMonth[]>(`/api/activity/monthly?${periodQuery(filter)}`);
}

/** 月別の表示。作品ごと・購入者ごとにまとめる */
export function fetchActivityGroups(filter: ActivityFilter, by: ActivityGroupBy): Promise<ActivityGroups> {
  const params = filterQuery(filter);
  params.set('by', by);
  return getJson<ActivityGroups>(`/api/activity/groups?${params}`);
}

/** 月別の表示のまとまりの中の行（新しい順、500 件まで） */
export function fetchActivityGroupItems(
  filter: ActivityFilter,
  by: ActivityGroupBy,
  key: string
): Promise<ActivityItem[]> {
  const params = filterQuery(filter);
  params.set('by', by);
  params.set('key', key);
  return getJson<ActivityItem[]>(`/api/activity/groups/items?${params}`);
}
