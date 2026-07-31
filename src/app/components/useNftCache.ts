'use client';

import { useEffect, useState } from 'react';

// XRPL NFT のメタデータ／画像をキャッシュする外部 API。
// `uri`（デコード済み ipfs://… など）または `hex_uri`（XRPL 生 hex）を受け付ける。
const CACHE_API_BASE = 'https://xrpl-nft-ipfs-cache-api.shirome.workers.dev';

// 生成完了までのポーリング設定。生成には十数秒〜かかることがあるため長めに待つ。
const POLL_INTERVAL_MS = 6000;
const MAX_POLLS = 20; // 6s × 20 = 最大約2分

export type NftCacheStatus = 'loading' | 'pending' | 'completed' | 'failed';

export interface NftCacheState {
  status: NftCacheStatus;
  name: string | null;
  imageUrl: string | null;
}

/** NFT の uri からキャッシュ済み画像（webp）の URL を組み立てる。 */
export function nftImageUrl(uri: string): string {
  return `${CACHE_API_BASE}/api/image?uri=${encodeURIComponent(uri)}`;
}

/** キャッシュ生成を依頼する（best-effort）。 */
export async function requestNftCache(uri: string): Promise<void> {
  try {
    await fetch(`${CACHE_API_BASE}/api/cache`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri }),
    });
  } catch {
    /* 失敗しても致命的ではない */
  }
}

// ---- uri 単位の共有ストア（サムネイルと名前で取得を1回に集約する）----

interface Entry {
  state: NftCacheState;
  subscribers: Set<() => void>;
  started: boolean;
  polls: number;
  timer: ReturnType<typeof setTimeout> | null;
}

const store = new Map<string, Entry>();

function getEntry(uri: string): Entry {
  let e = store.get(uri);
  if (!e) {
    e = {
      state: { status: 'loading', name: null, imageUrl: null },
      subscribers: new Set(),
      started: false,
      polls: 0,
      timer: null,
    };
    store.set(uri, e);
  }
  return e;
}

function setState(uri: string, patch: Partial<NftCacheState>) {
  const e = getEntry(uri);
  e.state = { ...e.state, ...patch };
  e.subscribers.forEach((cb) => cb());
}

interface CacheResponse {
  status?: string;
  metadata?: { name?: string | null };
}

async function fetchCache(uri: string): Promise<CacheResponse | null> {
  const res = await fetch(
    `${CACHE_API_BASE}/api/cache?uri=${encodeURIComponent(uri)}`,
    { cache: 'no-store' }
  );
  if (res.status === 404) return null; // まだ登録されていない
  if (!res.ok) throw new Error(`cache lookup failed: ${res.status}`);
  return (await res.json()) as CacheResponse;
}

// レスポンスを状態へ反映。終端状態（完了/失敗）なら true を返す。
function applyData(uri: string, data: CacheResponse): boolean {
  const status = data.status;
  const name = data.metadata?.name ?? null;
  if (status === 'completed') {
    setState(uri, { status: 'completed', name, imageUrl: nftImageUrl(uri) });
    return true;
  }
  if (status === 'failed' || status === 'error') {
    setState(uri, { status: 'failed', name });
    return true;
  }
  setState(uri, { status: 'pending', name }); // processing/pending 等
  return false;
}

function start(uri: string) {
  const e = getEntry(uri);
  if (e.started) return;
  e.started = true;

  const poll = async () => {
    e.polls += 1;
    try {
      const data = await fetchCache(uri);
      if (data && applyData(uri, data)) return;
    } catch {
      /* 一時的な失敗はポーリング継続 */
    }
    if (e.polls >= MAX_POLLS) {
      setState(uri, { status: 'failed' });
      return;
    }
    e.timer = setTimeout(poll, POLL_INTERVAL_MS);
  };

  void (async () => {
    try {
      const data = await fetchCache(uri);
      if (data) {
        if (applyData(uri, data)) return; // 既にキャッシュ済み等
      } else {
        // 未登録 → 生成を依頼して完了までポーリング
        setState(uri, { status: 'pending' });
        await requestNftCache(uri);
      }
    } catch {
      setState(uri, { status: 'pending' });
    }
    e.timer = setTimeout(poll, POLL_INTERVAL_MS);
  })();
}

/**
 * uri のキャッシュ状態（画像 URL・名前）を購読するフック。
 * 同一 uri は共有ストアで1回だけ取得・ポーリングされる。
 */
export function useNftCache(uri?: string | null): NftCacheState {
  const [, force] = useState(0);

  useEffect(() => {
    if (!uri) return;
    const e = getEntry(uri);
    const cb = () => force((n) => n + 1);
    e.subscribers.add(cb);
    start(uri);
    return () => {
      e.subscribers.delete(cb);
    };
  }, [uri]);

  if (!uri) return { status: 'failed', name: null, imageUrl: null };
  return getEntry(uri).state;
}
