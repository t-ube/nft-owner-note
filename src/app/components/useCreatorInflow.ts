'use client';

import { useCallback, useEffect, useState } from 'react';
import { CACHE_API_BASE } from '@/app/components/useNftCache';

/** 忠誠度のラベル。gift（この作家には 0 XRP）は paid_only=0 のときだけ出る */
export type LoyaltyBand = 'core' | 'light' | 'guest' | 'gift';

/** コミュニティ（オーナーの本拠地になっている作家）1つ分。 */
export interface InflowHub {
  /** hubs 内の添字（ハブ番号） */
  index: number;
  /** issuer アドレス。「その他」には無い */
  issuer: string | null;
  name: string;
  /** 顔画像のキー（face_uri の hex） */
  face: string | null;
  /** 本拠地にしている人数 */
  members: number;
  /** その人たちが対象作家に払った合計 XRP */
  flow: number;
  /** 描画先のハブ番号（自分自身、または「その他」） */
  group: number;
  /** 「その他」のまとめ先か */
  isOthers: boolean;
}

/** オーナー 1 人分。 */
export interface InflowOwner {
  address: string;
  /** 対象作家への支払額（XRP） */
  spend: number;
  /** 忠誠度 %（0〜100）。xrp.cafe で一度も課金していない人は null */
  loyalty: number | null;
  band: LoyaltyBand;
  /** 本当の本拠地のハブ番号（0 = 生え抜き） */
  homeIndex: number;
  /** 本当の本拠地の名前（「その他」にまとめられた人でも正しい名前） */
  homeName: string;
  /** ぶら下げる先のハブ番号 */
  hubIndex: number;
  /** そのオーナー自身が作家か */
  isCreator: boolean;
}

export interface CreatorInflow {
  issuer: string;
  /** 集計時刻（ISO 8601） */
  at: string;
  /** すべてのハブ（添字 = ハブ番号） */
  hubs: InflowHub[];
  /** 描くハブ（先頭が中央） */
  drawnHubs: InflowHub[];
  /** 支払額の多い順 */
  owners: InflowOwner[];
}

/** /api/creators/:issuer/inflow のレスポンス。 */
interface InflowResponse {
  issuer: string;
  at: string;
  hubs: { i?: string; n: string; f?: string; m: number; fl: number; g: number }[];
  fields: string[];
  w: unknown[][];
}

const BANDS = new Set<LoyaltyBand>(['core', 'light', 'guest', 'gift']);

function decode(res: InflowResponse): CreatorInflow {
  const hubs: InflowHub[] = res.hubs.map((h, index) => ({
    index,
    issuer: h.i ?? null,
    name: h.n,
    face: h.f ?? null,
    members: Number(h.m) || 0,
    flow: Number(h.fl) || 0,
    group: h.g,
    isOthers: index !== 0 && !h.i,
  }));

  // w は fields の順に並んだ配列なので、位置を名前から引く
  const col = (key: string, fallback: number) => {
    const i = res.fields.indexOf(key);
    return i === -1 ? fallback : i;
  };
  const [A, S, LY, B, H, C] = [col('a', 0), col('s', 1), col('ly', 2), col('b', 3), col('h', 4), col('c', 5)];

  const owners: InflowOwner[] = res.w.map(row => {
    const homeIndex = Number(row[H]) || 0;
    const home = hubs[homeIndex] ?? hubs[0];
    const band = String(row[B]) as LoyaltyBand;
    const loyalty = row[LY];
    return {
      address: String(row[A]),
      spend: Number(row[S]) || 0,
      loyalty: typeof loyalty === 'number' ? loyalty : null,
      band: BANDS.has(band) ? band : 'guest',
      homeIndex,
      homeName: home.name,
      hubIndex: home.group,
      isCreator: row[C] === true,
    };
  });

  return {
    issuer: res.issuer,
    at: res.at,
    hubs,
    drawnHubs: hubs.filter(h => h.group === h.index),
    owners,
  };
}

// ---- 取得（issuer ごとにキャッシュ。タブを切り替えても取り直さない）----

/** 描くハブ（中央を除く）がこの数を超えたら、min_members を上げて取り直す */
const MAX_DRAWN_HUBS = 30;
const MIN_MEMBERS_STEPS = [2, 3, 5, 10, 20, 50];

const cache = new Map<string, Promise<CreatorInflow>>();

async function fetchInflowOnce(issuer: string, minMembers: number): Promise<CreatorInflow> {
  // 配布のみ・無課金のオーナーも常に含める
  const params = new URLSearchParams({ min_members: String(minMembers), paid_only: '0' });
  const res = await fetch(`${CACHE_API_BASE}/api/creators/${encodeURIComponent(issuer)}/inflow?${params}`);
  if (!res.ok) throw new Error(`inflow: HTTP ${res.status}`);
  return decode((await res.json()) as InflowResponse);
}

async function fetchInflow(issuer: string): Promise<CreatorInflow> {
  let result: CreatorInflow | null = null;
  for (const minMembers of MIN_MEMBERS_STEPS) {
    result = await fetchInflowOnce(issuer, minMembers);
    if (result.drawnHubs.length - 1 <= MAX_DRAWN_HUBS) break;
  }
  return result!;
}

function loadInflow(issuer: string): Promise<CreatorInflow> {
  let p = cache.get(issuer);
  if (!p) {
    p = fetchInflow(issuer);
    // 失敗したものは次回やり直せるようにキャッシュから外す
    p.catch(() => cache.delete(issuer));
    cache.set(issuer, p);
  }
  return p;
}

export type CreatorInflowStatus = 'loading' | 'loaded' | 'error';

export interface CreatorInflowState {
  status: CreatorInflowStatus;
  inflow: CreatorInflow | null;
  /** 失敗したときに、もう一度取得する */
  retry: () => void;
}

/** 作家（issuer）のコミュニティ流入図のデータを取得するフック。 */
export function useCreatorInflow(issuer: string | null | undefined): CreatorInflowState {
  const [state, setState] = useState<{ status: CreatorInflowStatus; inflow: CreatorInflow | null }>({
    status: 'loading',
    inflow: null,
  });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt(n => n + 1), []);

  useEffect(() => {
    if (!issuer) return;
    let cancelled = false;
    setState({ status: 'loading', inflow: null });
    loadInflow(issuer)
      .then(inflow => {
        if (!cancelled) setState({ status: 'loaded', inflow });
      })
      .catch(error => {
        console.error('Failed to load creator inflow:', error);
        if (!cancelled) setState({ status: 'error', inflow: null });
      });
    return () => {
      cancelled = true;
    };
  }, [issuer, attempt]);

  return { ...state, retry };
}
