'use client';

import { useEffect, useState } from 'react';
import { CACHE_API_BASE } from '@/app/components/useNftCache';

/**
 * コレクションのコレクター（取得履歴のあるウォレット）1件分。
 * 保有者ではないので、すでに手放したウォレットも含まれる。
 */
export interface Collector {
  wallet: string;
  firstAt: string;
  lastAt: string;
  /** 有償購入の回数 */
  purchaseCount: number;
  /** 有償購入の合計額（XRP）。API は精度を保つため文字列で返す */
  purchaseXrp: string;
  /** 無償配布で受け取った回数 */
  distributionCount: number;
  /** ローンチパッド経由で受け取った回数 */
  launchpadCount: number;
  /** 活動のあった日数（UTC） */
  activeDays: number;
  /** 活動のあった月数 */
  activeMonths: number;
}

export type CollectorsStatus = 'loading' | 'loaded' | 'error';

export interface CollectorsState {
  status: CollectorsStatus;
  collectors: Collector[];
}

interface CollectorsResponse {
  fields: string[];
  collectors: unknown[][];
  has_more: boolean;
}

// API の上限に合わせる
const PAGE_LIMIT = 1000;

/**
 * 配列形式の行を fields の並びでオブジェクトに戻す。
 * 列は末尾に追加される前提だが、念のため添字ではなく名前で引く。
 */
function toCollectors(fields: string[], rows: unknown[][]): Collector[] {
  const idx = (name: string) => fields.indexOf(name);
  const i = {
    wallet: idx('wallet'),
    firstAt: idx('first_at'),
    lastAt: idx('last_at'),
    purchaseCount: idx('purchase_count'),
    purchaseXrp: idx('purchase_xrp'),
    distributionCount: idx('distribution_count'),
    launchpadCount: idx('launchpad_count'),
    activeDays: idx('active_days'),
    activeMonths: idx('active_months'),
  };
  const str = (row: unknown[], k: number) => (k >= 0 && row[k] != null ? String(row[k]) : '');
  const num = (row: unknown[], k: number) => (k >= 0 ? Number(row[k]) || 0 : 0);

  return rows.map(row => ({
    wallet: str(row, i.wallet),
    firstAt: str(row, i.firstAt),
    lastAt: str(row, i.lastAt),
    purchaseCount: num(row, i.purchaseCount),
    purchaseXrp: str(row, i.purchaseXrp) || '0',
    distributionCount: num(row, i.distributionCount),
    launchpadCount: num(row, i.launchpadCount),
    activeDays: num(row, i.activeDays),
    activeMonths: num(row, i.activeMonths),
  }));
}

// ---- issuer:taxon 単位のキャッシュ（タブを切り替えても取り直さない）----

const cache = new Map<string, Promise<Collector[]>>();

async function fetchAllCollectors(issuer: string, taxon: string | number): Promise<Collector[]> {
  const all: Collector[] = [];
  let offset = 0;
  for (;;) {
    const res = await fetch(
      `${CACHE_API_BASE}/api/collection/${encodeURIComponent(issuer)}/${encodeURIComponent(String(taxon))}/collectors?limit=${PAGE_LIMIT}&offset=${offset}`
    );
    if (!res.ok) throw new Error(`collectors: HTTP ${res.status}`);
    const data = (await res.json()) as CollectorsResponse;
    const rows = data.collectors ?? [];
    all.push(...toCollectors(data.fields ?? [], rows));
    if (!data.has_more || rows.length === 0) break;
    offset += rows.length;
  }
  return all;
}

function loadCollectors(issuer: string, taxon: string | number): Promise<Collector[]> {
  const key = `${issuer}:${taxon}`;
  let p = cache.get(key);
  if (!p) {
    p = fetchAllCollectors(issuer, taxon);
    // 失敗したものは次回やり直せるようにキャッシュから外す
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** コレクションのコレクター一覧を全ページ取得するフック。 */
export function useCollectors(issuer?: string | null, taxon?: string | number | null): CollectorsState {
  const [state, setState] = useState<CollectorsState>({ status: 'loading', collectors: [] });

  useEffect(() => {
    if (!issuer || taxon === null || taxon === undefined) return;
    let cancelled = false;
    setState({ status: 'loading', collectors: [] });
    loadCollectors(issuer, taxon)
      .then(collectors => {
        if (!cancelled) setState({ status: 'loaded', collectors });
      })
      .catch(error => {
        console.error('Failed to load collectors:', error);
        if (!cancelled) setState({ status: 'error', collectors: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [issuer, taxon]);

  return state;
}
