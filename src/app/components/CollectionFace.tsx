'use client';

import React, { useState } from 'react';
import { Folder } from 'lucide-react';
import { CACHE_API_BASE } from '@/app/components/useNftCache';
import { useCollection } from '@/app/components/useCollection';
import { cn } from '@/lib/utils';

interface CollectionFaceProps {
  issuer?: string | null;
  taxon?: string | number | null;
  /** 画像が無いときの代替アイコン用のラベル。 */
  alt?: string | null;
  /** 大きさは呼び出し側で指定する（例: 'h-10 w-10'）。 */
  className?: string;
}

/** face_uri は XRPL の生 hex なので hex_uri で画像を取る。 */
const faceImageUrl = (hexUri: string) =>
  `${CACHE_API_BASE}/api/image?hex_uri=${encodeURIComponent(hexUri)}`;

// 未キャッシュだった hex は一度だけ生成を依頼する
const requested = new Set<string>();

function requestFaceCache(hexUri: string) {
  if (requested.has(hexUri)) return;
  requested.add(hexUri);
  void fetch(`${CACHE_API_BASE}/api/cache`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hex_uri: hexUri }),
  }).catch(() => {
    /* 失敗しても致命的ではない */
  });
}

/**
 * コレクションの顔画像。
 * コレクションが未登録、face_uri が無い、画像が未キャッシュのときはフォルダアイコンを出す。
 */
const CollectionFace: React.FC<CollectionFaceProps> = ({
  issuer,
  taxon,
  alt,
  className = 'h-10 w-10',
}) => {
  const { status, collection } = useCollection(issuer, taxon);
  const [imgError, setImgError] = useState(false);
  const faceUri = collection?.face_uri;

  if (faceUri && !imgError) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={faceImageUrl(faceUri)}
        alt={alt ?? collection?.name ?? 'Collection'}
        loading="lazy"
        onError={() => {
          setImgError(true);
          requestFaceCache(faceUri); // 次回のために生成を依頼しておく
        }}
        className={cn('shrink-0 rounded object-cover', className)}
      />
    );
  }

  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded bg-muted text-muted-foreground',
        className
      )}
      title={alt ?? undefined}
    >
      <Folder className={cn('h-1/2 w-1/2', status === 'loading' && 'opacity-50')} />
    </div>
  );
};

export default CollectionFace;
