"use client";

// 日別。Google フォトのように、日付の見出しの下にその日の NFT を並べる。
// 見出しの合計は期間全体の日別集計（サーバー）から、並べる NFT は読み込み済みの一覧から出す。
// 「同じ人・同じ作品をまとめる」をオンにすると、同じ日の中で、種類・人・作品が同じものを 1 枚にまとめる。
//   人: 次のオーナー（支払いなら払った人） / 作品: NFT 名（完全一致）。名前が無ければ uri
//   切り替えのスイッチはページ側（タブの行）にある
import { Fragment, useMemo, useState } from "react";
import { Check, ChevronDown, Copy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import NFTThumbnail, { NFTName } from "@/app/components/NFTThumbnail";
import { XrpLogo } from "./XrpLogo";
import { ArtworkMosaic, productOf } from "./ArtworkMosaic";
import {
  GroupItemsDialog,
  artworkCount,
  isIncomingPayment,
  peopleCount,
  personOf,
} from "./GroupItemsDialog";
import type {
  ActivityDay,
  ActivityItem,
  ActivityReceived,
} from "@/lib/activity/types";
import { decodeUri, shortAddr } from "@/lib/activity/format";
import {
  AddressName,
  ItemDetailDialog,
  KindBadge,
  XrpcafeLink,
  hasAmount,
  ItemAmount,
  SpentList,
  isExpense,
  signedAmount,
  MonthDivider,
  ReceivedList,
  type ActivityTexts,
  type AddressBook,
  xHandle,
} from "./shared";

type Props = {
  items: ActivityItem[];
  days: ActivityDay[] | null;
  names: AddressBook;
  lang: string;
  t: ActivityTexts;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  /**
   * 同じ日の中での表示のしかた（切り替えはタブの行にある）。none は 1 件ずつ、
   * buyer は種類・購入者（作品は問わない）、artwork は種類・作品（購入者は問わない）が同じものを 1 枚にする
   */
  grouping: DailyGrouping;
};

export type DailyGrouping = "none" | "buyer" | "artwork";

/** 日別の金額は小数第 2 位までの切り上げで出す */
const ROUND_UP = { roundUp: true } as const;

/** 1 枚のタイル。まとめないときは items が 1 件 */
type Tile = {
  key: string;
  items: ActivityItem[];
  /** 確定した受取の通貨ごとの合計 */
  received: ActivityReceived[];
  /** 未確定の行を含むか */
  unsettled: boolean;
};

/** 端末のタイムゾーンでの 'YYYY-MM-DD'（サーバーの日別集計と同じ区切り） */
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("sv-SE");

function dayTitle(day: string, lang: string) {
  return new Date(`${day}T00:00:00`).toLocaleDateString(
    lang === "ja" ? "ja-JP" : "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    },
  );
}

/**
 * まとめるときのキー。buyer は種類・購入者、artwork は種類・作品が同じなら同じタイル。
 * 着金・ローンチパッドの収益は作品が無いので、どちらでも払った人でまとめる
 */
function groupKey(
  item: ActivityItem,
  grouping: Exclude<DailyGrouping, "none">,
): string {
  const incoming = isIncomingPayment(item);
  const person =
    grouping !== "artwork" || incoming ? (personOf(item) ?? "") : "";
  const product = grouping === "artwork" && !incoming ? productOf(item) : "";
  return `${item.kind}:${item.mint_type ?? ""}|${person}|${product}`;
}

function toTile(key: string, items: ActivityItem[]): Tile {
  const totals = new Map<string, ActivityReceived>();
  for (const item of items) {
    const amount = signedAmount(item);
    if (!item.settled || item.currency === null || amount === null) continue;
    const k = `${item.currency}:${item.currency_issuer ?? ""}`;
    const prev = totals.get(k);
    totals.set(k, {
      currency: item.currency,
      currency_issuer: item.currency_issuer,
      received: Number(prev?.received ?? 0) + amount,
    });
  }
  return {
    key,
    items,
    received: Array.from(totals.values()).sort(
      (a, b) => b.received - a.received,
    ),
    unsettled: items.some((i) => hasAmount(i) && !i.settled),
  };
}

/**
 * その日の購入者のチップ。押すと全員を「@X アカウント」（無ければ短縮アドレス）で、
 * 半角スペース区切りの 1 行にしてコピーする（X の投稿にそのまま貼れるように）
 */
function BuyersChip({
  buyers,
  names,
  t,
}: {
  buyers: string[];
  names: AddressBook;
  t: ActivityTexts;
}) {
  const [copied, setCopied] = useState(false);
  const text = buyers
    .map((address) => {
      const handle = xHandle(names.get(address)?.xAccount ?? null);
      return handle ? `@${handle}` : shortAddr(address);
    })
    .join(" ");
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch (err) {
          console.error("Failed to copy buyers:", err);
        }
      }}
      className="inline-flex items-center gap-1.5 self-center rounded-full border border-primary/25 bg-primary/5 px-2.5 py-0.5 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
      title={`${t.day.copyBuyers}
${text}`}
    >
      <Users className="h-3.5 w-3.5" />
      {t.day.buyers.replace("{count}", String(buyers.length))}
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5 opacity-70" />
      )}
    </button>
  );
}

/** その日の件数（販売・ローンチパッド・手動ミント・着金・転送）。見出しには出さず、押すと開く */
function DayDetails({ stats, t }: { stats: ActivityDay; t: ActivityTexts }) {
  const rows = (
    [
      [t.kpi.sold, stats.sale_count],
      [t.kpi.launchpadMints, stats.launchpad_mint_count],
      [t.kpi.manualMints, stats.manual_mint_count],
      [t.kpi.payments, stats.payment_count],
      [t.kpi.transfers, stats.transfer_count],
    ] as const
  ).filter(([, count]) => count > 0);
  if (rows.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {t.day.details}
          <ChevronDown className="h-3 w-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-2">
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          {rows.map(([label, count]) => (
            <Fragment key={label}>
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium tabular-nums">
                {Number(count).toLocaleString()}
              </dd>
            </Fragment>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  );
}

export function DailyView({
  items,
  days,
  names,
  lang,
  t,
  hasMore,
  isLoading,
  onLoadMore,
  grouping,
}: Props) {
  const [selectedItem, setSelectedItem] = useState<ActivityItem | null>(null);
  const [selectedTile, setSelectedTile] = useState<Tile | null>(null);
  const dayStats = useMemo(
    () => new Map((days ?? []).map((d) => [d.day, d])),
    [days],
  );

  // 読み込み済みの一覧を日ごとに分け、必要ならその日の中でまとめる（一覧は新しい順なので、日も新しい順）
  const sections = useMemo(() => {
    const byDay: { day: string; items: ActivityItem[] }[] = [];
    for (const item of items) {
      const day = dayKey(item.tx_date);
      const last = byDay[byDay.length - 1];
      if (last && last.day === day) last.items.push(item);
      else byDay.push({ day, items: [item] });
    }
    return byDay.map(({ day, items: dayItems }) => {
      if (grouping === "none")
        return {
          day,
          tiles: dayItems.map((item) => toTile(item.tx_hash, [item])),
        };
      const map = new Map<string, ActivityItem[]>();
      for (const item of dayItems) {
        const key = groupKey(item, grouping);
        const list = map.get(key);
        if (list) list.push(item);
        else map.set(key, [item]);
      }
      return {
        day,
        tiles: Array.from(map, ([key, list]) => toTile(key, list)),
      };
    });
  }, [items, grouping]);

  const openTile = (tile: Tile) => {
    if (tile.items.length === 1) setSelectedItem(tile.items[0]);
    else setSelectedTile(tile);
  };

  return (
    <div className="space-y-8">
      {sections.length === 0 && !isLoading && (
        <div className="text-sm text-muted-foreground">{t.empty}</div>
      )}

      {sections.map(({ day, tiles }, index) => {
        const stats = dayStats.get(day);
        // 月が変わるところ（と先頭）に月の区切りを出す
        const month = day.slice(0, 7);
        const newMonth =
          index === 0 || sections[index - 1].day.slice(0, 7) !== month;
        return (
          <section key={day} className="space-y-3">
            {newMonth && <MonthDivider month={month} lang={lang} />}
            {/* 日付と、その日の受取・支出・購入者。ほかの件数は「詳細」の中 */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b pb-2">
              <h3 className="text-base font-semibold">{dayTitle(day, lang)}</h3>
              {stats && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <ReceivedList
                    received={stats.received}
                    lang={lang}
                    className="font-semibold"
                    format={ROUND_UP}
                  />
                  <SpentList
                    received={stats.received}
                    lang={lang}
                    className="font-semibold"
                    format={ROUND_UP}
                  />
                  {stats.buyers?.length > 0 && (
                    <BuyersChip buyers={stats.buyers} names={names} t={t} />
                  )}
                  <DayDetails stats={stats} t={t} />
                </div>
              )}
            </div>

            {/* その日の NFT */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
              {tiles.map((tile) => {
                const item = tile.items[0];
                const uri = decodeUri(item.uri);
                const count = tile.items.length;
                const people = peopleCount(tile.items);
                const artworks = artworkCount(tile.items);
                // 購入者ごとの表示では、購入者の名前を主役にする（着金などはもともと払った人が主役）
                const buyerFirst =
                  grouping === "buyer" && !isIncomingPayment(item);
                // xrp.cafe のリンクは個別に表示しているときだけ（まとめたタイルは開いた一覧の各行に出す）
                const showCafeLink = grouping === "none" && !!item.nftoken_id;
                const artworkLabel =
                  artworks > 1 ? (
                    t.day.artworks.replace("{count}", String(artworks))
                  ) : (
                    <NFTName uri={uri} fallback={item.name} />
                  );
                return (
                  <div
                    key={tile.key}
                    className="group overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md"
                  >
                    {/* 画像（押すと詳細） */}
                    <button
                      type="button"
                      onClick={() => openTile(tile)}
                      className="relative block aspect-square w-full bg-muted"
                    >
                      {artworks > 1 ? (
                        <ArtworkMosaic
                          items={tile.items}
                          className="h-full w-full text-base"
                        />
                      ) : item.nftoken_id ? (
                        <NFTThumbnail
                          uri={uri}
                          alt=""
                          className="h-full w-full rounded-none object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <XrpLogo className="w-1/2 text-foreground/70" />
                        </div>
                      )}
                      <KindBadge
                        item={item}
                        t={t}
                        className="absolute left-2 top-2 text-[10px]"
                      />
                      {count > 1 && (
                        <Badge className="absolute right-2 top-2 border border-white/30 bg-black/45 text-xs text-white shadow-sm backdrop-blur-sm hover:bg-black/45">
                          {t.day.count.replace("{count}", String(count))}
                        </Badge>
                      )}
                    </button>
                    {/* 名前と金額（押すと詳細）。xrp.cafe へのリンクは名前の行の右上に重ね、金額の行は右端まで使う */}
                    <div className="relative p-2">
                      <button
                        type="button"
                        onClick={() => openTile(tile)}
                        className="block w-full space-y-0.5 text-left"
                      >
                        <div
                          className={`truncate text-sm font-medium ${showCafeLink ? "pr-5" : ""}`}
                        >
                          {buyerFirst ? (
                            <AddressName
                              address={item.to_account}
                              names={names}
                              t={t}
                            />
                          ) : artworks > 1 || item.nftoken_id ? (
                            artworkLabel
                          ) : (
                            <AddressName
                              address={item.from_account}
                              names={names}
                              t={t}
                            />
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="min-w-0 truncate">
                            {buyerFirst ? (
                              artworkLabel
                            ) : isIncomingPayment(item) ? null : people > 1 ? (
                              t.day.people.replace("{count}", String(people))
                            ) : (
                              <AddressName
                                address={item.to_account}
                                names={names}
                                t={t}
                              />
                            )}
                          </span>
                          {hasAmount(item) && (
                            <span
                              className={`ml-auto shrink-0 text-right font-medium ${
                                isExpense(item)
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-foreground"
                              }`}
                            >
                              {tile.received.length > 0 ? (
                                <ReceivedList
                                  received={tile.received}
                                  lang={lang}
                                  format={ROUND_UP}
                                />
                              ) : (
                                <ItemAmount
                                  item={item}
                                  lang={lang}
                                  format={ROUND_UP}
                                />
                              )}
                            </span>
                          )}
                        </div>
                      </button>
                      {showCafeLink && item.nftoken_id && (
                        <span className="absolute right-2 top-2.5">
                          <XrpcafeLink
                            nftokenId={item.nftoken_id}
                            label={t.openInXrpcafe}
                          />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {isLoading && <div className="h-24 animate-pulse rounded-md bg-muted" />}
      {hasMore && !isLoading && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={onLoadMore}>
            {t.loadMore}
          </Button>
        </div>
      )}

      {/* まとめたタイルの中身。1 件を押すと詳細 */}
      <GroupItemsDialog
        open={!!selectedTile}
        items={selectedTile?.items ?? null}
        buyerFirst={grouping === "buyer"}
        names={names}
        lang={lang}
        t={t}
        onOpenChange={(open) => !open && setSelectedTile(null)}
        onSelect={(item) => {
          setSelectedTile(null);
          setSelectedItem(item);
        }}
      />

      <ItemDetailDialog
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        names={names}
        lang={lang}
        t={t}
      />
    </div>
  );
}
