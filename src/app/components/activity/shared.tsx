"use client";

// マイアクティビティの各ビューで共通に使う部品
import Image from "next/image";
import { createContext, useContext, useRef, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  UserSearch,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import NFTThumbnail, { NFTName } from "@/app/components/NFTThumbnail";
import type { Dictionary } from "@/i18n/dictionaries/index";
import { AddressGroupDialog } from "@/app/components/AddressGroupDialog";
import type { AddressGroup } from "@/utils/db";
import { importXrpcafeProfile } from "@/utils/xrpcafe";
import type { ActivityItem, ActivityReceived } from "@/lib/activity/types";
import {
  decodeUri,
  formatAmount,
  formatDate,
  shortAddr,
  txUrl,
  xrpcafeNftUrl,
  bithompNftUrl,
  type AmountFormat,
} from "@/lib/activity/format";

export type ActivityTexts = Dictionary["myActivity"];

const BADGE_CLASS = {
  manual:
    "bg-sky-100 text-sky-700 hover:bg-sky-100 dark:bg-sky-950 dark:hover:bg-sky-950 dark:text-sky-300",
  launchpad:
    "bg-violet-100 text-violet-700 hover:bg-violet-100 dark:bg-violet-950 dark:hover:bg-violet-950 dark:text-violet-300",
  sale: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:hover:bg-emerald-950 dark:text-emerald-300",
  secondary:
    "bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-50 dark:bg-emerald-950 dark:hover:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800",
  payment:
    "bg-amber-100 text-amber-700 hover:bg-amber-100 dark:bg-amber-950 dark:hover:bg-amber-950 dark:text-amber-300",
  launchpad_revenue:
    "bg-fuchsia-100 text-fuchsia-700 hover:bg-fuchsia-100 dark:bg-fuchsia-950 dark:hover:bg-fuchsia-950 dark:text-fuchsia-300",
  transfer:
    "bg-zinc-100 text-zinc-600 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800",
  resale:
    "bg-teal-100 text-teal-700 hover:bg-teal-100 dark:bg-teal-950 dark:hover:bg-teal-950 dark:text-teal-300",
  purchase:
    "bg-rose-100 text-rose-700 hover:bg-rose-100 dark:bg-rose-950 dark:hover:bg-rose-950 dark:text-rose-300",
  payment_out:
    "bg-orange-100 text-orange-700 hover:bg-orange-100 dark:bg-orange-950 dark:hover:bg-orange-950 dark:text-orange-300",
};

/** 支出の種類か（NFT の購入と送金） */
export const isExpense = (item: Pick<ActivityItem, "kind">) =>
  item.kind === "purchase" || item.kind === "payment_out";

/** 金額を出す種類か（ミントと転送はお金が動かないので出さない） */
export const hasAmount = (item: ActivityItem) =>
  item.kind === "sale" ||
  item.kind === "secondary" ||
  item.kind === "resale" ||
  item.kind === "payment" ||
  item.kind === "launchpad_revenue" ||
  isExpense(item);

/** 受取は正、支出は負の金額 */
export function signedAmount(item: ActivityItem): number | null {
  if (isExpense(item)) return item.spent === null ? null : -Number(item.spent);
  return item.received === null ? null : Number(item.received);
}

/** 1 件の金額。支出は「−」を付けて赤くする */
export function ItemAmount({
  item,
  lang,
  format,
}: {
  item: ActivityItem;
  lang: string;
  /** 日別では小数第 2 位までの切り上げ */
  format?: AmountFormat;
}) {
  return (
    <span className={isExpense(item) ? "text-red-600 dark:text-red-400" : ""}>
      {formatAmount(signedAmount(item), item.currency, lang, format)}
    </span>
  );
}

/** 通貨ごとの支出を「−」付きで並べる（支出が無ければ何も出さない） */
export function SpentList({
  received,
  lang,
  format,
  className = "",
}: {
  received: ActivityReceived[];
  lang: string;
  /** 日別では小数第 2 位までの切り上げ */
  format?: AmountFormat;
  className?: string;
}) {
  const spent = received.filter((r) => Number(r.spent ?? 0) > 0);
  if (spent.length === 0) return null;
  return (
    <span className={`text-red-600 dark:text-red-400 ${className}`}>
      {spent.map((r, i) => (
        <span
          key={`${r.currency}:${r.currency_issuer ?? ""}`}
          title={r.currency_issuer ?? undefined}
        >
          {i > 0 && " · "}
          {formatAmount(-Number(r.spent), r.currency, lang, format)}
        </span>
      ))}
    </span>
  );
}

/** 行の種類のバッジ（ミントは手動とローンチパッドで分ける） */
export function KindBadge({
  item,
  t,
  className = "",
}: {
  /** 一覧の行のほか、月別のまとまりも渡せる（種類だけ見る） */
  item: Pick<ActivityItem, "kind" | "mint_type">;
  t: ActivityTexts;
  className?: string;
}) {
  const key = item.kind === "mint" ? (item.mint_type ?? "manual") : item.kind;
  const label =
    item.kind === "mint"
      ? t.mintTypes[item.mint_type ?? "manual"]
      : t.kinds[item.kind];
  // ローンチパッドは名前が長いので、文字を一回り小さくする（渡された大きさに対して）
  const long = key === "launchpad" || key === "launchpad_revenue";
  return (
    <Badge className={`${BADGE_CLASS[key]} ${className}`}>
      {long ? <span className="text-[0.85em]">{label}</span> : label}
    </Badge>
  );
}

/** 'YYYY-MM' を「2026年10月」のように */
export function formatMonth(month: string, lang: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(
    lang === "ja" ? "ja-JP" : "en-US",
    {
      year: "numeric",
      month: "long",
    },
  );
}

/** 端末のタイムゾーンでの 'YYYY-MM' */
export const monthOf = (iso: string) =>
  new Date(iso).toLocaleDateString("sv-SE").slice(0, 7);

/** 一覧の月の区切り（前の月へ遡ったところで出す） */
export function MonthDivider({ month, lang }: { month: string; lang: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-lg font-bold">{formatMonth(month, lang)}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** 外部サイトを開く小さな丸いアイコン */
function SiteIconLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex shrink-0 rounded-full opacity-80 hover:opacity-100"
      title={label}
      aria-label={label}
    >
      <Image
        src={icon}
        alt=""
        width={16}
        height={16}
        className="rounded-full"
      />
    </a>
  );
}

/** NFTokenID で xrp.cafe の NFT のページを開く */
export function XrpcafeLink({
  nftokenId,
  label,
}: {
  nftokenId: string;
  label: string;
}) {
  return (
    <SiteIconLink
      href={xrpcafeNftUrl(nftokenId)}
      icon="/images/xrpcafe.jpg"
      label={label}
    />
  );
}

/** NFT を外部サイトで開くアイコンの並び（xrp.cafe と Bithomp） */
export function NftSiteLinks({
  nftokenId,
  t,
}: {
  nftokenId: string;
  t: ActivityTexts;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <XrpcafeLink nftokenId={nftokenId} label={t.openInXrpcafe} />
      <SiteIconLink
        href={bithompNftUrl(nftokenId)}
        icon="/images/bithomp.png"
        label={t.openInBithomp}
      />
    </div>
  );
}

/** アドレス帳（IndexedDB の addressGroups）から引いた、アドレスごとの名前と X アカウント */
export type AddressBookEntry = {
  name: string;
  xAccount: string | null;
  groupId: string;
};
export type AddressBook = Map<string, AddressBookEntry>;

/** アドレス帳の編集（AddressGroupDialog）に要るもの。ページが渡す */
type AddressEditContextValue = {
  lang: string;
  onSaved: (group: AddressGroup) => void;
  /** プロフィールの取り込みなど、グループを返さない保存のあとに読み直す */
  onSavedAny: () => void;
};
const AddressEditContext = createContext<AddressEditContextValue | null>(null);
export const AddressEditProvider = AddressEditContext.Provider;

/** X アカウントの書き方（@付き・URL）をそろえて、ハンドルだけにする */
export function xHandle(xAccount: string | null): string | null {
  if (!xAccount) return null;
  const handle = xAccount
    .trim()
    .replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, "")
    .replace(/^@/, "")
    .split(/[/?#]/)[0];
  return handle || null;
}

/** 押すとコピーして、少しのあいだ「コピーしました」にするボタン */
function CopyButton({ value, t }: { value: string; t: ActivityTexts }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch (err) {
          console.error("Failed to copy:", err);
        }
      }}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
      title={copied ? t.copied : t.copy}
      aria-label={copied ? t.copied : t.copy}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/** xrp.cafe のプロフィールを引いてアドレス帳に入れるボタン（OwnerList の自動取得の 1 件分） */
function ProfileFetchButton({
  address,
  t,
  onSaved,
}: {
  address: string;
  t: ActivityTexts;
  onSaved?: () => void;
}) {
  const [state, setState] = useState<
    "idle" | "loading" | "saved" | "notFound" | "error"
  >("idle");
  const label =
    state === "saved"
      ? t.profileFetched
      : state === "notFound"
        ? t.profileNotFound
        : state === "error"
          ? t.error
          : t.fetchProfile;
  return (
    <button
      type="button"
      disabled={state === "loading"}
      onClick={async (e) => {
        e.stopPropagation();
        setState("loading");
        try {
          const result = await importXrpcafeProfile(address);
          setState(result);
          if (result === "saved") onSaved?.();
        } catch (err) {
          console.error("Failed to fetch xrp.cafe profile:", err);
          setState("error");
        }
      }}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
      title={label}
      aria-label={label}
    >
      {state === "loading" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : state === "saved" ? (
        <Check className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <UserSearch
          className={`h-3.5 w-3.5 ${state === "notFound" || state === "error" ? "text-red-500" : ""}`}
        />
      )}
    </button>
  );
}

/**
 * アドレス帳の名前があればそれ、無ければ短縮したアドレス。
 * マウスを乗せると（タッチなら押すと）、吹き出しを出す。アドレス全体（コピー・X で検索・
 * xrp.cafe からプロフィールを取得・アドレス帳で編集）と、X アカウントがあればそのリンク（コピー）。
 * interactive={false} なら吹き出しを出さない（取引先のリストなど、押す操作がほかにあるところ）
 */
export function AddressName({
  address,
  names,
  t,
  interactive = true,
}: {
  address: string | null;
  names: AddressBook;
  t?: ActivityTexts;
  interactive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const touchRef = useRef(false);
  const editContext = useContext(AddressEditContext);
  if (!address) return <span className="text-muted-foreground">—</span>;
  const entry = names.get(address);
  const label = (
    <span
      className={entry ? "" : "font-mono text-xs"}
      title={interactive && t ? undefined : address}
    >
      {entry?.name ?? shortAddr(address)}
    </span>
  );
  if (!interactive || !t) return label;

  const handle = xHandle(entry?.xAccount ?? null);
  return (
    <>
      <TooltipProvider delayDuration={300}>
        <Tooltip open={open} onOpenChange={setOpen}>
          <TooltipTrigger asChild>
            <span
              className="cursor-default underline decoration-dotted decoration-muted-foreground/40 underline-offset-2"
              // タッチでは押すと開く（まわりのタイルや行の「押すと詳細」は動かさない）
              onPointerDown={(e) => {
                touchRef.current = e.pointerType === "touch";
              }}
              onClick={(e) => {
                if (!touchRef.current) return;
                e.preventDefault();
                e.stopPropagation();
                setOpen((o) => !o);
              }}
            >
              {label}
            </span>
          </TooltipTrigger>
          <TooltipContent
            side="top"
            className="w-60 border bg-popover px-3 py-2 text-popover-foreground shadow-md"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 名前（無ければ Unknown）。少し大きく、下の 2 行とは間をあける */}
            <div className="mb-1.5 flex h-7 items-center justify-between gap-3">
              <span
                className={`min-w-0 truncate text-sm font-semibold ${entry?.name ? "" : "text-muted-foreground"}`}
              >
                {entry?.name ?? t.unknown}
              </span>
              <span className="-mr-1 flex shrink-0 items-center">
                {editContext && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen(false);
                      setEditOpen(true);
                    }}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={t.editAddress}
                    aria-label={t.editAddress}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
                <ProfileFetchButton
                  address={address}
                  t={t}
                  onSaved={editContext?.onSavedAny}
                />
              </span>
            </div>
            {/* X アカウント（無ければ @-）。リンクは右のボタンで */}
            <div className="flex h-6 items-center justify-between gap-3">
              <span
                className={`min-w-0 truncate text-xs ${handle ? "" : "text-muted-foreground"}`}
              >
                {handle ? `@${handle}` : "@-"}
              </span>
              {handle && (
                <span className="-mr-1 flex shrink-0 items-center">
                  <CopyButton value={`@${handle}`} t={t} />
                  <a
                    href={`https://x.com/${handle}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-70 hover:bg-muted hover:opacity-100"
                    title={t.openXProfile}
                    aria-label={t.openXProfile}
                  >
                    <Image
                      src="/images/x-logo-black.png"
                      alt=""
                      width={13}
                      height={13}
                      className="dark:invert"
                    />
                  </a>
                </span>
              )}
            </div>
            {/* アドレス（短縮。コピーと検索は全体で） */}
            <div className="flex h-6 items-center justify-between gap-3">
              <span
                className="font-mono text-xs text-muted-foreground"
                title={address}
              >
                {shortAddr(address)}
              </span>
              <span className="-mr-1 flex shrink-0 items-center">
                <CopyButton value={address} t={t} />
                <a
                  href={`https://x.com/search?q=${encodeURIComponent(address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-70 hover:bg-muted hover:opacity-100"
                  title={t.searchX}
                  aria-label={t.searchX}
                >
                  <Image
                    src="/images/x-logo-black.png"
                    alt=""
                    width={13}
                    height={13}
                    className="dark:invert"
                  />
                </a>
              </span>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {/* 編集はツールチップの外に置く（ツールチップが閉じても消えないように） */}
      {/* ダイアログは画面の最前面に描かれるが、React のイベントは部品の親子をたどって伝わるので、
          ここで止めないと閉じるボタンなどのクリックがタイルや行の「押すと詳細」まで届く */}
      {editContext && editOpen && (
        <span
          className="contents"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <AddressGroupDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            groupId={entry?.groupId}
            initialAddresses={[address]}
            onSave={editContext.onSaved}
            lang={editContext.lang}
          />
        </span>
      )}
    </>
  );
}

/** 通貨ごとの受取を並べる（いちばん多いものを先頭に） */
export function ReceivedList({
  received,
  lang,
  format,
  className = "",
}: {
  received: ActivityReceived[];
  lang: string;
  /** 日別では小数第 2 位までの切り上げ */
  format?: AmountFormat;
  className?: string;
}) {
  // 支出しか無い通貨は受取の一覧には出さない
  const shown = received.filter(
    (r) => Number(r.received) !== 0 || r.spent === undefined,
  );
  if (shown.length === 0) return null;
  return (
    <span className={className}>
      {shown.map((r, i) => (
        <span
          key={`${r.currency}:${r.currency_issuer ?? ""}`}
          title={r.currency_issuer ?? undefined}
        >
          {i > 0 && " · "}
          {formatAmount(r.received, r.currency, lang, format)}
        </span>
      ))}
    </span>
  );
}

/** 1 件の取引の詳細（オーナー → 次のオーナー、受取、取引へのリンク） */
export function ItemDetailDialog({
  item,
  onClose,
  names,
  lang,
  t,
}: {
  item: ActivityItem | null;
  onClose: () => void;
  names: AddressBook;
  lang: string;
  t: ActivityTexts;
}) {
  const uri = item ? decodeUri(item.uri) : null;
  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KindBadge item={item} t={t} />
                <span className="text-sm font-normal text-muted-foreground">
                  {formatDate(item.tx_date, lang)}
                </span>
              </DialogTitle>
            </DialogHeader>
            {item.nftoken_id && (
              <div className="flex items-center gap-3">
                <NFTThumbnail uri={uri} alt="" className="h-20 w-20 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium" title={item.nftoken_id}>
                    <span>
                      <NFTName uri={uri} fallback={item.name} />
                    </span>
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {t.issuerLabel}{" "}
                    <AddressName address={item.issuer} names={names} t={t} />
                  </div>
                  <div className="mt-1">
                    <NftSiteLinks nftokenId={item.nftoken_id} t={t} />
                  </div>
                </div>
              </div>
            )}
            <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t.columns.from}</dt>
              <dd className="truncate">
                <AddressName address={item.from_account} names={names} t={t} />
              </dd>
              <dt className="text-muted-foreground">{t.columns.to}</dt>
              <dd className="truncate">
                <AddressName address={item.to_account} names={names} t={t} />
              </dd>
              {hasAmount(item) && (
                <>
                  <dt className="text-muted-foreground">{t.columns.amount}</dt>
                  <dd className="flex items-center gap-1">
                    <ItemAmount item={item} lang={lang} />
                    {!item.settled && (
                      <Badge variant="outline" className="text-[10px]">
                        {t.unsettled}
                      </Badge>
                    )}
                  </dd>
                </>
              )}
              {item.memo && (
                <>
                  <dt className="text-muted-foreground">Memo</dt>
                  <dd className="break-all text-xs">{item.memo}</dd>
                </>
              )}
            </dl>
            <a
              href={txUrl(item.tx_hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              {t.columns.tx} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
