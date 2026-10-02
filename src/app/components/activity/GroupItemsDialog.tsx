"use client";

// まとめたタイル（日別・月別）を押したときの、中の取引の一覧。1 件を押すと詳細を開く
import { ExternalLink } from "lucide-react";
import NFTThumbnail, { NFTName } from "@/app/components/NFTThumbnail";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActivityItem } from "@/lib/activity/types";
import { decodeUri, formatDate, txUrl } from "@/lib/activity/format";
import { ArtworkMosaic, productOf } from "./ArtworkMosaic";
import {
  AddressName,
  ItemAmount,
  XrpcafeLink,
  hasAmount,
  type ActivityTexts,
  type AddressBook,
} from "./shared";

/** 一覧の金額は小数第 2 位までの切り上げで出す */
const ROUND_UP = { roundUp: true } as const;

/** 自分宛ての支払い（着金とローンチパッドの収益）。相手は払った人で、作品は無い */
export const isIncomingPayment = (item: Pick<ActivityItem, "kind">) =>
  item.kind === "payment" || item.kind === "launchpad_revenue";

/** 取引の相手（購入は売り手、着金・ローンチパッドの収益は払った人、それ以外は次のオーナー・送り先） */
export const personOf = (item: ActivityItem) =>
  item.kind === "purchase" || isIncomingPayment(item)
    ? item.from_account
    : item.to_account;

/** 相手の数（重複なし） */
export const peopleCount = (items: ActivityItem[]) =>
  new Set(items.map((item) => personOf(item) ?? "")).size;

/** 作品の数（重複なし）。着金などの作品の無い行は数えない */
export const artworkCount = (items: ActivityItem[]) =>
  new Set(items.filter((item) => item.nftoken_id).map(productOf)).size;

/**
 * 見出しの文字。
 * 購入者ごとの表示では相手の名前を大きく、下に作品名（複数なら作品数）。
 * それ以外は作品名（着金などは払った人）を大きく、下に相手（複数なら人数）
 */
function GroupTitle({
  items,
  buyerFirst,
  names,
  t,
}: {
  items: ActivityItem[];
  buyerFirst: boolean;
  names: AddressBook;
  t: ActivityTexts;
}) {
  const first = items[0];
  const artworks = artworkCount(items);
  const people = peopleCount(items);
  const countLabel = t.day.count.replace("{count}", String(items.length));
  const artworkLabel =
    artworks > 1 ? (
      t.day.artworks.replace("{count}", String(artworks))
    ) : (
      <NFTName uri={decodeUri(first.uri)} fallback={first.name} />
    );
  const main = buyerFirst ? (
    <AddressName address={personOf(first)} names={names} t={t} />
  ) : artworks > 1 || first.nftoken_id ? (
    artworkLabel
  ) : (
    <AddressName address={personOf(first)} names={names} t={t} />
  );
  const sub = buyerFirst ? (
    artworkLabel
  ) : isIncomingPayment(first) || !first.nftoken_id ? null : people > 1 ? (
    t.day.people.replace("{count}", String(people))
  ) : (
    <AddressName address={personOf(first)} names={names} t={t} />
  );
  return (
    <span className="min-w-0">
      <span className="block truncate text-lg">
        {main} {countLabel}
      </span>
      {sub && (
        <span className="block truncate text-sm font-normal text-muted-foreground">
          {sub}
        </span>
      )}
    </span>
  );
}

/**
 * まとめたタイルの中身。items が null の間は読み込み中。
 * buyerFirst は購入者ごとの表示か（見出しで相手の名前を大きく出す）
 */
export function GroupItemsDialog({
  open,
  items,
  buyerFirst,
  names,
  lang,
  t,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  items: ActivityItem[] | null;
  buyerFirst: boolean;
  names: AddressBook;
  lang: string;
  t: ActivityTexts;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: ActivityItem) => void;
}) {
  const ready = items && items.length > 0 ? items : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-4">
            {!ready ? (
              <>
                <span className="h-20 w-20 shrink-0 animate-pulse rounded-md bg-muted" />
                <span className="h-6 w-48 animate-pulse rounded bg-muted" />
              </>
            ) : (
              <>
                {artworkCount(ready) > 1 ? (
                  <ArtworkMosaic
                    items={ready}
                    className="h-20 w-20 shrink-0 rounded-md text-xs"
                  />
                ) : (
                  ready[0].nftoken_id && (
                    <NFTThumbnail
                      uri={decodeUri(ready[0].uri)}
                      alt=""
                      className="h-20 w-20 shrink-0 rounded-md"
                    />
                  )
                )}
                <GroupTitle
                  items={ready}
                  buyerFirst={buyerFirst && !isIncomingPayment(ready[0])}
                  names={names}
                  t={t}
                />
              </>
            )}
          </DialogTitle>
        </DialogHeader>
        {items && items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t.empty}
          </div>
        ) : !ready ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : (
          <ul className="max-h-[65vh] divide-y overflow-y-auto text-sm">
            {ready.map((item) => (
              <li key={item.tx_hash} className="flex items-center gap-4 py-2.5">
                {item.nftoken_id && (
                  <NFTThumbnail
                    uri={decodeUri(item.uri)}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-md"
                  />
                )}
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left hover:underline"
                  onClick={() => onSelect(item)}
                >
                  <span className="block text-xs text-muted-foreground">
                    {formatDate(item.tx_date, lang)}
                  </span>
                  {item.nftoken_id && artworkCount(ready) > 1 && (
                    <span className="block truncate font-medium">
                      <NFTName uri={decodeUri(item.uri)} fallback={item.name} />
                    </span>
                  )}
                  <span className="block truncate">
                    <AddressName
                      address={item.from_account}
                      names={names}
                      t={t}
                    />
                    {!isIncomingPayment(item) && peopleCount(ready) > 1 && (
                      <>
                        {" → "}
                        <AddressName
                          address={item.to_account}
                          names={names}
                          t={t}
                        />
                      </>
                    )}
                  </span>
                </button>
                {hasAmount(item) && (
                  <span className="shrink-0">
                    <ItemAmount item={item} lang={lang} format={ROUND_UP} />
                    {!item.settled && (
                      <Badge variant="outline" className="ml-1 text-[10px]">
                        {t.unsettled}
                      </Badge>
                    )}
                  </span>
                )}
                {/* 外部リンク。どちらも 16px の枠にそろえ、xrp.cafe が無い行も枠を空けて取引のリンクの列をそろえる */}
                <span className="flex shrink-0 items-center gap-2">
                  <span className="flex h-4 w-4 items-center justify-center">
                    {item.nftoken_id && (
                      <XrpcafeLink
                        nftokenId={item.nftoken_id}
                        label={t.openInXrpcafe}
                      />
                    )}
                  </span>
                  <a
                    href={txUrl(item.tx_hash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                    title={item.tx_hash}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
