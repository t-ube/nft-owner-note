'use client';

import { useEffect, useState } from 'react';
import { CACHE_API_BASE } from '@/app/components/useNftCache';

/** コレクション（issuer + taxon）の情報。未登録のものもあるので注意。 */
export interface Collection {
  issuer: string;
  taxon: number;
  cafe_id: number | null;
  name: string | null;
  description: string | null;
  image_url: string | null;
  vanity_url: string | null;
  /** 顔となる NFT の URI（ipfs://…）。無いこともある。 */
  face_uri: string | null;
  fetched_at: string;
}

export type CollectionStatus = 'loading' | 'found' | 'missing';

export interface CollectionState {
  status: CollectionStatus;
  collection: Collection | null;
}

// ---- issuer:taxon 単位の共有ストア（同じコレクションは1回だけ取得する）----

interface Entry {
  state: CollectionState;
  subscribers: Set<() => void>;
  started: boolean;
}

const store = new Map<string, Entry>();

const keyOf = (issuer: string, taxon: string | number) => `${issuer}:${taxon}`;

function getEntry(key: string): Entry {
  let entry = store.get(key);
  if (!entry) {
    entry = {
      state: { status: 'loading', collection: null },
      subscribers: new Set(),
      started: false,
    };
    store.set(key, entry);
  }
  return entry;
}

function setState(key: string, state: CollectionState) {
  const entry = getEntry(key);
  entry.state = state;
  entry.subscribers.forEach(cb => cb());
}

function start(key: string, issuer: string, taxon: string | number) {
  const entry = getEntry(key);
  if (entry.started) return;
  entry.started = true;

  void (async () => {
    try {
      const res = await fetch(
        `${CACHE_API_BASE}/api/collection/${encodeURIComponent(issuer)}/${encodeURIComponent(String(taxon))}`,
        { cache: 'no-store' }
      );
      if (!res.ok) {
        // 404（未登録）や 400（不正な issuer/taxon）は「無い」として扱う
        setState(key, { status: 'missing', collection: null });
        return;
      }
      const data = (await res.json()) as { collection?: Collection };
      if (!data.collection) {
        setState(key, { status: 'missing', collection: null });
        return;
      }
      setState(key, { status: 'found', collection: data.collection });
    } catch {
      setState(key, { status: 'missing', collection: null });
    }
  })();
}

/**
 * コレクション情報を購読するフック。
 * 同じ issuer/taxon は共有ストアで1回だけ取得する。
 */
export function useCollection(issuer?: string | null, taxon?: string | number | null): CollectionState {
  const [, force] = useState(0);
  const key = issuer && taxon !== null && taxon !== undefined ? keyOf(issuer, taxon) : null;

  useEffect(() => {
    if (!key || !issuer || taxon === null || taxon === undefined) return;
    const entry = getEntry(key);
    const cb = () => force(n => n + 1);
    entry.subscribers.add(cb);
    start(key, issuer, taxon);
    return () => {
      entry.subscribers.delete(cb);
    };
  }, [key, issuer, taxon]);

  if (!key) return { status: 'missing', collection: null };
  return getEntry(key).state;
}
