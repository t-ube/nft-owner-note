"use client";

// 複数の作品の画像を 1 枠に並べる（日別・月別のタイルと、開いた一覧の見出しで使う）
import NFTThumbnail from "@/app/components/NFTThumbnail";
import type { ActivityItem } from "@/lib/activity/types";
import { decodeUri } from "@/lib/activity/format";

/** 作品として並べるのに要る項目（一覧の行でも、月別の集計の作品でもよい） */
export type ArtworkRef = Pick<ActivityItem, "name" | "uri" | "nftoken_id">;

/** 作品（名前があれば名前、無ければ URI で見分ける） */
export const productOf = (item: Pick<ActivityItem, "name" | "uri">) =>
  item.name ? `name:${item.name}` : `uri:${item.uri ?? ""}`;

/** 作品を 1 件ずつ（並びはそのまま、同じ作品は最初の 1 件）。NFT の無い行は除く */
export function uniqueArtworks<T extends ArtworkRef>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!item.nftoken_id) return false;
    const key = productOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 1 枠に並べる作品の上限（4×4） */
const MOSAIC_MAX = 16;

/**
 * 複数の作品の画像を 1 枠に並べる（最大 16 点）。
 * 行の数は点数の平方根に近い数にし、各行に均等に割り振る（上の行ほど少なく、1 点が大きい）。
 * 例: 2 点は 1 行、3 点は 1+2、5 点は 2+3、16 点は 4×4。並べきれないときは最後の枠に残りの数を重ねる。
 * total は作品の全体の数（items が上限で切られているとき。無ければ items の作品数）
 */
export function ArtworkMosaic({
  items,
  total,
  className = "",
}: {
  items: ArtworkRef[];
  total?: number;
  className?: string;
}) {
  const artworks = uniqueArtworks(items);
  const shown = artworks.slice(0, MOSAIC_MAX);
  const hidden =
    Math.max(total ?? artworks.length, shown.length) - shown.length;
  const rowCount = Math.max(1, Math.round(Math.sqrt(shown.length)));
  const perRow = Math.floor(shown.length / rowCount);
  const extra = shown.length % rowCount;
  const rows: ArtworkRef[][] = [];
  let index = 0;
  for (let r = 0; r < rowCount; r++) {
    const size = perRow + (r >= rowCount - extra ? 1 : 0);
    rows.push(shown.slice(index, index + size));
    index += size;
  }
  return (
    <div
      className={`flex flex-col gap-px overflow-hidden bg-border ${className}`}
    >
      {rows.map((row, r) => (
        <div key={r} className="flex min-h-0 flex-1 gap-px">
          {row.map((item, i) => {
            const last = r === rows.length - 1 && i === row.length - 1;
            return (
              <div key={productOf(item)} className="relative min-w-0 flex-1">
                <NFTThumbnail
                  uri={decodeUri(item.uri)}
                  alt=""
                  className="h-full w-full rounded-none object-cover"
                />
                {hidden > 0 && last && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 font-semibold text-white">
                    +{hidden + 1}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
