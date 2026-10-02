"use client";

// 月別。選んだ月から過去へ、月ごとに取引を作品ごと（種類・作品が同じもの）か購入者ごと（種類・相手が同じもの）に
// まとめて並べる。まとめるのはサーバー（owner_note_activity_groups）で、1 か月分を全部数える。
// 下端が見えたら前の月（取引のある月まで飛ばす）を読む。
// 着金・ローンチパッドの収益・送金は作品が無いので、下に分けて相手ごとに出す。
// まとまりを押すと中の取引の一覧（サーバーから引く）、一覧の 1 件を押すと詳細。
import { useEffect, useRef, useState } from "react";
import NFTThumbnail, { NFTName } from "@/app/components/NFTThumbnail";
import { Badge } from "@/components/ui/badge";
import type {
  ActivityGroup,
  ActivityGroupBy,
  ActivityGroups,
  ActivityItem,
} from "@/lib/activity/types";
import { decodeUri, formatAmount } from "@/lib/activity/format";
import { ArtworkMosaic } from "./ArtworkMosaic";
import { GroupItemsDialog } from "./GroupItemsDialog";
import {
  AddressName,
  ItemDetailDialog,
  KindBadge,
  MonthDivider,
  ReceivedList,
  SpentList,
  isExpense,
  type ActivityTexts,
  type AddressBook,
} from "./shared";

/** 日別と同じく、小数第 2 位までの切り上げで出す */
const ROUND_UP = { roundUp: true } as const;

/** 1 か月分（month は 'YYYY-MM'） */
export type MonthSection = { month: string; data: ActivityGroups };

type Props = {
  /** 新しい月から。null の間は最初の読み込み中 */
  sections: MonthSection[] | null;
  /** 読み込んでいる最中 */
  isLoading: boolean;
  /** 最初から読み直している最中（前のデータを薄く出しておく） */
  isReplacing: boolean;
  /** まだ前の月がある */
  hasMore: boolean;
  onLoadMore: () => void;
  by: ActivityGroupBy;
  names: AddressBook;
  lang: string;
  t: ActivityTexts;
  /** まとまりの中の取引を引く（month の、key は ActivityGroup.key のもの） */
  loadItems: (month: string, key: string) => Promise<ActivityItem[]>;
};

/** 月の見出しの数字（その月の件数と、確定した XRP の受取） */
function monthStats(data: ActivityGroups) {
  let count = 0;
  let xrp = 0;
  for (const group of [...data.groups, ...data.others]) {
    count += Number(group.count);
    if (isExpense(group)) continue;
    for (const a of group.amounts)
      if (a.currency === "XRP") xrp += Number(a.received);
  }
  return { count, xrp };
}

/** まとまりの金額。支出の種類は赤で「−」、それ以外は受取 */
function GroupAmount({ group, lang }: { group: ActivityGroup; lang: string }) {
  if (group.amounts.length === 0) return null;
  return isExpense(group) ? (
    <SpentList received={group.amounts} lang={lang} format={ROUND_UP} />
  ) : (
    <ReceivedList received={group.amounts} lang={lang} format={ROUND_UP} />
  );
}

export function MonthlyView({
  sections,
  isLoading,
  isReplacing,
  hasMore,
  onLoadMore,
  by,
  names,
  lang,
  t,
  loadItems,
}: Props) {
  /** 開いているまとまり（items が null の間は読み込み中） */
  const [opened, setOpened] = useState<{
    key: string;
    items: ActivityItem[] | null;
  } | null>(null);
  const [selectedItem, setSelectedItem] = useState<ActivityItem | null>(null);

  const openGroup = (month: string, group: ActivityGroup) => {
    const key = `${month}|${group.key}`;
    setOpened({ key, items: null });
    loadItems(month, group.key)
      .then((items) =>
        // 読み込み中に別のまとまりを開いたら捨てる
        setOpened((prev) => (prev && prev.key === key ? { key, items } : prev)),
      )
      .catch((err) => {
        console.error("Failed to load activity group items:", err);
        setOpened((prev) =>
          prev && prev.key === key ? { key, items: [] } : prev,
        );
      });
  };

  // 下端が見えたら前の月を読む
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || isLoading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, isLoading, onLoadMore, sections]);

  if (!sections) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="aspect-[3/4] animate-pulse rounded-lg bg-muted"
          />
        ))}
      </div>
    );
  }
  const buyerFirst = by === "buyer";
  return (
    <div
      className={`space-y-8 transition-opacity ${isReplacing ? "opacity-60" : ""}`}
    >
      {sections.map((section) => {
        const stats = monthStats(section.data);
        const empty =
          section.data.groups.length === 0 && section.data.others.length === 0;
        return (
          <section key={section.month} className="space-y-3">
            {/* 月の見出しと、その月の件数・受取 */}
            <div className="flex flex-wrap items-baseline gap-x-3">
              <div className="min-w-0 flex-1">
                <MonthDivider month={section.month} lang={lang} />
              </div>
              {!empty && (
                <span className="text-sm text-muted-foreground">
                  {t.monthView.count.replace(
                    "{count}",
                    stats.count.toLocaleString(),
                  )}
                  {stats.xrp > 0 && (
                    <>
                      {" · "}
                      {t.kpi.received}{" "}
                      <span className="font-semibold text-foreground">
                        {formatAmount(stats.xrp, "XRP", lang, ROUND_UP)}
                      </span>
                    </>
                  )}
                </span>
              )}
            </div>
            {empty ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t.empty}
              </div>
            ) : (
              <div className="space-y-6">
                {section.data.groups.length > 0 && (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">
                    {section.data.groups.map((group) => {
                      const first = group.artworks[0];
                      const artworkLabel =
                        group.artwork_count > 1 ? (
                          t.day.artworks.replace(
                            "{count}",
                            String(group.artwork_count),
                          )
                        ) : first ? (
                          <NFTName
                            uri={decodeUri(first.uri)}
                            fallback={first.name}
                          />
                        ) : null;
                      const person = group.address ? (
                        <AddressName
                          address={group.address}
                          names={names}
                          t={t}
                        />
                      ) : null;
                      return (
                        <button
                          type="button"
                          key={group.key}
                          onClick={() => openGroup(section.month, group)}
                          className="block overflow-hidden rounded-lg border bg-card text-left transition-shadow hover:shadow-md"
                        >
                          <div className="relative aspect-square w-full bg-muted">
                            {group.artwork_count > 1 ? (
                              <ArtworkMosaic
                                items={group.artworks}
                                total={group.artwork_count}
                                className="h-full w-full text-base"
                              />
                            ) : (
                              first && (
                                <NFTThumbnail
                                  uri={decodeUri(first.uri)}
                                  alt=""
                                  className="h-full w-full rounded-none object-cover"
                                />
                              )
                            )}
                            <KindBadge
                              item={group}
                              t={t}
                              className="absolute left-2 top-2 text-[10px]"
                            />
                            {group.count > 1 && (
                              <Badge className="absolute right-2 top-2 border border-white/30 bg-black/45 text-xs text-white shadow-sm backdrop-blur-sm hover:bg-black/45">
                                {t.day.count.replace(
                                  "{count}",
                                  String(group.count),
                                )}
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-0.5 p-2">
                            <div className="truncate text-sm font-medium">
                              {buyerFirst ? person : artworkLabel}
                            </div>
                            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span className="min-w-0 truncate">
                                {buyerFirst
                                  ? artworkLabel
                                  : group.people_count > 1
                                    ? t.day.people.replace(
                                        "{count}",
                                        String(group.people_count),
                                      )
                                    : person}
                              </span>
                              <span
                                className={`ml-auto shrink-0 text-right font-medium ${isExpense(group) ? "" : "text-foreground"}`}
                              >
                                <GroupAmount group={group} lang={lang} />
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* NFT の無い取引（着金・ローンチパッドの収益・送金）は相手ごとに */}
                {section.data.others.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-sm font-semibold">
                      {t.monthView.others}
                    </h3>
                    <ul className="divide-y rounded-lg border">
                      {section.data.others.map((group) => (
                        <li
                          key={group.key}
                          role="button"
                          tabIndex={0}
                          onClick={() => openGroup(section.month, group)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              openGroup(section.month, group);
                            }
                          }}
                          className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50"
                        >
                          <KindBadge
                            item={group}
                            t={t}
                            className="shrink-0 text-[10px]"
                          />
                          <span className="min-w-0 flex-1 truncate">
                            {group.address ? (
                              <AddressName
                                address={group.address}
                                names={names}
                                t={t}
                              />
                            ) : (
                              "-"
                            )}
                          </span>
                          {group.count > 1 && (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {t.day.count.replace(
                                "{count}",
                                String(group.count),
                              )}
                            </span>
                          )}
                          <span className="shrink-0 text-right font-medium">
                            <GroupAmount group={group} lang={lang} />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </section>
        );
      })}

      {isLoading && !isReplacing && hasMore && (
        <div className="h-24 animate-pulse rounded-md bg-muted" />
      )}
      {/* ここが見えたら前の月を読む */}
      <div ref={sentinelRef} aria-hidden className="h-px" />

      <GroupItemsDialog
        open={!!opened}
        items={opened?.items ?? null}
        buyerFirst={by === "buyer"}
        names={names}
        lang={lang}
        t={t}
        onOpenChange={(open) => !open && setOpened(null)}
        onSelect={(item) => {
          setOpened(null);
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
