"use client";

// 詳細。1 件ずつの表（日時・種類・NFT・オーナー・次のオーナー・受取・取引）
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import NFTThumbnail, { NFTName } from "@/app/components/NFTThumbnail";
import type { ActivityItem } from "@/lib/activity/types";
import { decodeUri, formatDate, txUrl } from "@/lib/activity/format";
import { Fragment } from "react";
import {
  AddressName,
  KindBadge,
  hasAmount,
  ItemAmount,
  NftSiteLinks,
  formatMonth,
  monthOf,
  type ActivityTexts,
  type AddressBook,
} from "./shared";

type Props = {
  items: ActivityItem[];
  names: AddressBook;
  lang: string;
  t: ActivityTexts;
  hasMore: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
};

export function DetailTable({
  items,
  names,
  lang,
  t,
  hasMore,
  isLoading,
  onLoadMore,
}: Props) {
  return (
    <>
      {items.length === 0 && !isLoading ? (
        <div className="text-sm text-muted-foreground">{t.empty}</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">
                  {t.columns.date}
                </TableHead>
                <TableHead>{t.columns.kind}</TableHead>
                <TableHead>{t.columns.nft}</TableHead>
                <TableHead className="whitespace-nowrap">
                  {t.columns.from}
                </TableHead>
                <TableHead className="whitespace-nowrap">
                  {t.columns.to}
                </TableHead>
                <TableHead className="text-right">{t.columns.amount}</TableHead>
                <TableHead>{t.columns.tx}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => {
                const uri = decodeUri(item.uri);
                // 月が変わるところ（と先頭）に月の区切りの行を出す
                const month = monthOf(item.tx_date);
                const newMonth =
                  index === 0 || monthOf(items[index - 1].tx_date) !== month;
                return (
                  <Fragment key={item.tx_hash}>
                    {newMonth && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={7}
                          className="pb-1 pt-4 text-base font-bold"
                        >
                          {formatMonth(month, lang)}
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell className="whitespace-nowrap text-xs">
                        {formatDate(item.tx_date, lang)}
                      </TableCell>
                      <TableCell>
                        <KindBadge item={item} t={t} />
                      </TableCell>
                      <TableCell>
                        {item.nftoken_id ? (
                          <div className="flex min-w-[14rem] items-center gap-3">
                            <NFTThumbnail
                              uri={uri}
                              alt=""
                              className="h-14 w-14 shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <div
                                className="truncate text-sm font-medium"
                                title={item.nftoken_id}
                              >
                                <span>
                                  <NFTName uri={uri} fallback={item.name} />
                                </span>
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {t.issuerLabel}{" "}
                                <AddressName
                                  address={item.issuer}
                                  names={names}
                                  t={t}
                                />
                              </div>
                              <div className="mt-1">
                                <NftSiteLinks
                                  nftokenId={item.nftoken_id}
                                  t={t}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span
                            className="text-xs text-muted-foreground"
                            title={item.memo ?? undefined}
                          >
                            {item.memo ? item.memo.slice(0, 40) : "—"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        <AddressName
                          address={item.from_account}
                          names={names}
                          t={t}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        <AddressName
                          address={item.to_account}
                          names={names}
                          t={t}
                        />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm">
                        {!hasAmount(item) ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <ItemAmount item={item} lang={lang} />
                            {!item.settled && (
                              <Badge variant="outline" className="text-[10px]">
                                {t.unsettled}
                              </Badge>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <a
                          href={txUrl(item.tx_hash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex text-muted-foreground hover:text-foreground"
                          title={item.tx_hash}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {isLoading && (
        <div className="mt-3 h-10 animate-pulse rounded-md bg-muted" />
      )}

      {hasMore && !isLoading && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" onClick={onLoadMore}>
            {t.loadMore}
          </Button>
        </div>
      )}
    </>
  );
}
