import React, { useEffect, useRef, useState } from 'react';
import { ImageOff, Loader2 } from 'lucide-react';
import { useNftCache } from '@/app/components/useNftCache';

export { nftImageUrl, requestNftCache } from '@/app/components/useNftCache';

interface NFTThumbnailProps {
  uri?: string | null;
  alt?: string;
  className?: string;
}

/**
 * NFT のサムネイル。未キャッシュなら自動でキャッシュ生成を依頼し、
 * 完了までスピナーを表示、完了後に画像を表示する。
 */
const NFTThumbnail: React.FC<NFTThumbnailProps> = ({
  uri,
  alt,
  className = 'h-10 w-10',
}) => {
  const { status, imageUrl } = useNftCache(uri);
  const [imgError, setImgError] = useState(false);

  // 生成待ち／読み込み中
  if (status === 'loading' || status === 'pending') {
    return (
      <div
        className={`flex items-center justify-center rounded bg-muted ${className}`}
      >
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // 失敗・時間切れ・画像自体の読み込み失敗
  if (status === 'failed' || imgError || !imageUrl) {
    return (
      <div
        className={`flex items-center justify-center rounded bg-muted ${className}`}
      >
        <ImageOff className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageUrl}
      alt={alt ?? 'NFT'}
      loading="lazy"
      onError={() => setImgError(true)}
      className={`rounded object-cover ${className}`}
    />
  );
};

interface NFTNameProps {
  uri?: string | null;
  /** DB 側に既に保持している名前（あれば優先表示）。 */
  fallback?: string | null;
  /** DB 未保存の名前をキャッシュ API から取得できたとき一度だけ通知する。 */
  onResolved?: (name: string) => void;
}

/**
 * NFT 名。DB に名前があればそれを、なければキャッシュ API 取得分を表示する。
 * DB 未保存の名前を取得できた場合は onResolved で親へ通知（永続化用）。
 */
export const NFTName: React.FC<NFTNameProps> = ({
  uri,
  fallback,
  onResolved,
}) => {
  const { status, name } = useNftCache(uri);
  const firedRef = useRef(false);

  useEffect(() => {
    if (fallback) return; // DB に既にある場合は保存不要
    if (name && !firedRef.current) {
      firedRef.current = true;
      onResolved?.(name);
    }
  }, [fallback, name, onResolved]);

  const display = fallback ?? name;

  if (display) return <>{display}</>;
  if (status === 'loading' || status === 'pending') {
    return <span className="text-muted-foreground">…</span>;
  }
  return <>-</>;
};

export default NFTThumbnail;
