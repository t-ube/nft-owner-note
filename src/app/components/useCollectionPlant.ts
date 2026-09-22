'use client';

import { useEffect, useState } from 'react';
import { CACHE_API_BASE } from '@/app/components/useNftCache';

/** 枝（taxon）1本分。 */
export interface PlantHub {
  taxon: number;
  name: string | null;
  /** アイコン URI（face_uri の hex、なければ image_url） */
  icon: string | null;
  /** その taxon を取得した wallet 数 */
  wallets: number;
  /** その taxon での XRP spend 合計 */
  spend: number;
}

/** wallet 1件分。issuer 自身は含まない。 */
export interface PlantNode {
  wallet: string;
  /** 最終活動からの日数 */
  daysSinceLast: number | null;
  /** 初観測からの日数 */
  daysSinceFirst: number | null;
  /** 取得件数（葉） */
  leaves: number;
  /** XRP spend */
  spend: number;
  /** 取得した taxon（昇順）と、taxon ごとの取得件数 */
  taxa: { taxon: number; leaves: number }[];
  /** この issuer で初観測から 30 日以内 */
  isSprout: boolean;
}

export interface CollectionPlant {
  hubs: PlantHub[];
  /** spend 降順・wallet 昇順 */
  nodes: PlantNode[];
}

export type CollectionPlantStatus = 'loading' | 'loaded' | 'error';

export interface CollectionPlantState {
  status: CollectionPlantStatus;
  plant: CollectionPlant | null;
}

/** /api/collection/:issuer/plant のレスポンス（列指向）。 */
interface PlantRow {
  n: number;
  h: { t: number; name: string | null; i: string | null; w: number; s: number | string }[] | null;
  a: string[];
  d: (number | null)[];
  f: (number | null)[];
  l: number[];
  s: (number | string)[];
  k: number[];
  t: (number | string)[];
  tl: number[];
}

const SPROUT_DAYS = 30;

/**
 * 列指向の配列をノードに戻す。
 * wallet i の taxon は t の sum(k[0..i-1]) 番目から k[i] 個。
 */
function decode(r: PlantRow): CollectionPlant {
  const hubs: PlantHub[] = (r.h ?? []).map(h => ({
    taxon: Number(h.t),
    name: h.name,
    icon: h.i,
    wallets: Number(h.w) || 0,
    spend: Number(h.s) || 0,
  }));

  const nodes: PlantNode[] = [];
  let p = 0;
  for (let i = 0; i < r.n; i++) {
    const taxa: PlantNode['taxa'] = [];
    for (let j = 0; j < r.k[i]; j++, p++) {
      taxa.push({ taxon: Number(r.t[p]), leaves: r.tl[p] ?? 0 });
    }
    const f = r.f[i];
    nodes.push({
      wallet: r.a[i],
      daysSinceLast: r.d[i],
      daysSinceFirst: f,
      leaves: r.l[i] ?? 0,
      spend: Number(r.s[i]) || 0,
      taxa,
      isSprout: f !== null && f <= SPROUT_DAYS,
    });
  }
  return { hubs, nodes };
}

// ---- issuer 単位のキャッシュ（タブを切り替えても取り直さない）----

const cache = new Map<string, Promise<CollectionPlant | null>>();

async function fetchPlant(issuer: string): Promise<CollectionPlant | null> {
  const res = await fetch(`${CACHE_API_BASE}/api/collection/${encodeURIComponent(issuer)}/plant`);
  // 集計対象の wallet が無い issuer は 404
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`plant: HTTP ${res.status}`);
  return decode((await res.json()) as PlantRow);
}

function loadPlant(issuer: string): Promise<CollectionPlant | null> {
  let p = cache.get(issuer);
  if (!p) {
    p = fetchPlant(issuer);
    // 失敗したものは次回やり直せるようにキャッシュから外す
    p.catch(() => cache.delete(issuer));
    cache.set(issuer, p);
  }
  return p;
}

/** issuer のエコシステム（旧オーナー活性図）のデータを取得するフック。 */
export function useCollectionPlant(issuer?: string | null): CollectionPlantState {
  const [state, setState] = useState<CollectionPlantState>({ status: 'loading', plant: null });

  useEffect(() => {
    if (!issuer) return;
    let cancelled = false;
    setState({ status: 'loading', plant: null });
    loadPlant(issuer)
      .then(plant => {
        if (!cancelled) setState({ status: 'loaded', plant });
      })
      .catch(error => {
        console.error('Failed to load collection plant:', error);
        if (!cancelled) setState({ status: 'error', plant: null });
      });
    return () => {
      cancelled = true;
    };
  }, [issuer]);

  return state;
}
