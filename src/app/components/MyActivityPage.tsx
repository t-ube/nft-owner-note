"use client";

// マイアクティビティ。発行した NFT のミント・売買と、自分宛ての支払いを、月ごとの売上として見せる。
// 定義は src/query/activity.sql。
// 上段右で対象アドレス、KPI のタイルで表示する種類、下段左の対象者リストで相手を絞り込む。
// 簡易表示（既定）: 左の列に小さな売上カード（3 か月の棒グラフ）と対象者、右に日別・詳細。KPI は出さない。
// 展開表示: 売上カード（直近 12 か月の棒グラフ）→ 選んだ月の KPI（種類の切り替えを兼ねる）→ 下段。
// 日別・詳細は選んだ月の末日から始まり、下へスクロールするとそのまま前の月へ遡る。
// 対象アドレスはアドレス帳（IndexedDB の addressGroups）から選べ、表示もアドレス帳の名前に置き換える。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ChevronDown, Maximize2, Minimize2, X } from "lucide-react";
import { isValidClassicAddress } from "ripple-address-codec";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ActivityAddressPicker } from "@/app/components/ActivityAddressPicker";
import {
  AddressEditProvider,
  AddressName,
  ReceivedList,
  monthOf,
  type AddressBook,
} from "@/app/components/activity/shared";
import {
  DailyView,
  type DailyGrouping,
} from "@/app/components/activity/DailyView";
import { DetailTable } from "@/app/components/activity/DetailTable";
import {
  MonthlyView,
  type MonthSection,
} from "@/app/components/activity/MonthlyView";
import {
  MonthlyChart,
  spentXrpOf,
  xrpOf,
} from "@/app/components/activity/MonthlyChart";
import { getDictionary } from "@/i18n/get-dictionary";
import type { Dictionary } from "@/i18n/dictionaries/index";
import { useAuthSession } from "@/app/contexts/AuthSessionContext";
import { dbManager, type AddressGroup } from "@/utils/db";
import {
  fetchActivityDaily,
  fetchActivityGroupItems,
  fetchActivityGroups,
  fetchActivityMonthly,
  fetchActivityPage,
  fetchActivitySummary,
} from "@/lib/activity/client";
import {
  ACTIVITY_FILTER_KINDS,
  ACTIVITY_MAX_ADDRESSES,
  type ActivityCursor,
  type ActivityGroupBy,
  type ActivityDay,
  type ActivityFilter,
  type ActivityItem,
  type ActivityFilterKind,
  type ActivityMonth,
  type ActivityParty,
  type ActivitySummary,
} from "@/lib/activity/types";

type Props = { lang: string };

/** 対象。グループならそのアドレスすべて。enabled が false のものは問い合わせから除外する */
type Target =
  | { type: "group"; id: string; enabled: boolean }
  | { type: "address"; address: string; enabled: boolean };

// ----- 対象の保存（ログイン中のアドレスごとに、この端末の localStorage へ） -----

const storageKey = (login: string) => `activity.targets.${login}`;
const targetKey = (t: Target) =>
  t.type === "group" ? `g:${t.id}` : `a:${t.address}`;

function loadTargets(login: string): Target[] {
  let saved: Target[] = [];
  try {
    const raw = localStorage.getItem(storageKey(login));
    if (raw) {
      saved = (JSON.parse(raw) as Target[]).filter((t) =>
        t.type === "group"
          ? typeof t.id === "string"
          : isValidClassicAddress(t.address),
      );
    }
  } catch {
    /* 読めなければログイン中のアドレスだけ */
  }
  // ログイン中のアドレスは必ず先頭に置く（外せないが、除外はできる）
  const isSelf = (t: Target) => t.type === "address" && t.address === login;
  const self = saved.find(isSelf) ?? {
    type: "address" as const,
    address: login,
    enabled: true,
  };
  return [self, ...saved.filter((t) => !isSelf(t))];
}

function saveTargets(login: string, targets: Target[]) {
  try {
    localStorage.setItem(storageKey(login), JSON.stringify(targets));
  } catch {
    /* 保存できなくても表示には影響しない */
  }
}

// ----- 表示する種類（左のチェックボックスで切り替える。集計・グラフ・一覧・取引先すべてに効く。端末ごと） -----

const KINDS_KEY = "activity.shownKinds";
// 初期値（保存が無いとき）は販売（一次・二次・ローンチパッド）だけ
const DEFAULT_KINDS: ActivityFilterKind[] = ["sale", "secondary", "launchpad"];

function loadKinds(): ActivityFilterKind[] {
  try {
    const raw = localStorage.getItem(KINDS_KEY);
    if (raw) {
      const saved = (JSON.parse(raw) as string[]).filter(
        (k): k is ActivityFilterKind =>
          (ACTIVITY_FILTER_KINDS as readonly string[]).includes(k),
      );
      // 一次と二次を分ける前に保存した設定では、売買を出していれば二次も出す
      if (saved.includes("sale") && !raw.includes('"secondary"'))
        saved.push("secondary");
      // ローンチパッドの収益を分ける前に保存した設定では、着金を出していればこれも出す
      if (saved.includes("payment") && !raw.includes('"launchpad_revenue"'))
        saved.push("launchpad_revenue");
      if (saved.length > 0) return saved;
    }
  } catch {
    /* 読めなければ既定 */
  }
  return DEFAULT_KINDS;
}

function saveKinds(kinds: ActivityFilterKind[]) {
  try {
    localStorage.setItem(KINDS_KEY, JSON.stringify(kinds));
  } catch {
    /* 保存できなくても表示には影響しない */
  }
}

/** タイルの色の目印（一覧のバッジと同じ色） */
const KIND_DOT: Record<ActivityFilterKind, string> = {
  sale: "bg-emerald-500",
  secondary: "bg-emerald-300",
  launchpad: "bg-violet-500",
  manual: "bg-sky-500",
  payment: "bg-amber-500",
  launchpad_revenue: "bg-fuchsia-500",
  transfer: "bg-zinc-400",
  resale: "bg-teal-500",
  payment_out: "bg-orange-500",
  purchase: "bg-rose-500",
};

// ----- 展開表示か（端末ごと） -----

const EXPANDED_KEY = "activity.expanded";

function loadExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_KEY) === "1";
  } catch {
    return false;
  }
}

function saveExpanded(value: boolean) {
  try {
    localStorage.setItem(EXPANDED_KEY, value ? "1" : "0");
  } catch {
    /* 保存できなくても表示には影響しない */
  }
}

// ----- 月（'YYYY-MM'。端末のタイムゾーン） -----

const CHART_MONTHS = 12;
/** 簡易表示の棒グラフに並べる月数 */
const COMPACT_MONTHS = 3;

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** その月の 1 日 0 時（端末のタイムゾーン）を ISO に */
function monthStartIso(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toISOString();
}

function monthTitle(month: string, lang: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString(
    lang === "ja" ? "ja-JP" : "en-US",
    {
      year: "numeric",
      month: "long",
    },
  );
}

/** 表示する種類のチェックボックス。集計・グラフ・一覧・取引先すべてに効く */
function KindsCard({
  kinds,
  onToggle,
  t,
}: {
  kinds: ActivityFilterKind[];
  onToggle: (kind: ActivityFilterKind) => void;
  t: Dictionary["myActivity"];
}) {
  const labels: Record<ActivityFilterKind, string> = {
    sale: t.kpi.trades,
    secondary: t.kpi.secondary,
    launchpad: t.kpi.launchpadMints,
    manual: t.kpi.manualMints,
    payment: t.kpi.payments,
    launchpad_revenue: t.kpi.launchpadRevenue,
    transfer: t.kpi.transfers,
    resale: t.kpi.resales,
    payment_out: t.kpi.sent,
    purchase: t.kpi.purchases,
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{t.listKinds}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {ACTIVITY_FILTER_KINDS.map((kind) => (
            <li key={kind}>
              <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
                <Checkbox
                  checked={kinds.includes(kind)}
                  onCheckedChange={() => onToggle(kind)}
                />
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${KIND_DOT[kind]}`}
                />
                <span>{labels[kind]}</span>
              </label>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

type KpiRow = {
  kind: ActivityFilterKind;
  label: string;
  value: number | undefined;
};

/**
 * KPI のカード。上に合計（表示している種類だけ）、下に内訳。
 * 表示していない種類の内訳は薄く出し、合計には入れない。
 * 人数のように内訳を足しても合計にならないものは total を渡す。
 */
function KpiCard({
  label,
  unit,
  negative = false,
  loading,
  rows,
  kinds,
  format,
  hiddenLabel,
  total: totalOverride,
}: {
  label: string;
  unit?: string;
  negative?: boolean;
  loading: boolean;
  rows: KpiRow[];
  kinds: ActivityFilterKind[];
  format: (v: number) => string;
  hiddenLabel: string;
  total?: number;
}) {
  const total =
    totalOverride ??
    rows.reduce(
      (sum, r) => (kinds.includes(r.kind) ? sum + Number(r.value ?? 0) : sum),
      0,
    );
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      {loading ? (
        <div className="mt-2 h-7 animate-pulse rounded bg-muted" />
      ) : (
        <div
          className={`mt-1 text-2xl font-bold ${negative && total > 0 ? "text-red-600 dark:text-red-400" : ""}`}
        >
          {negative && total > 0 ? "−" : ""}
          {format(total)}
          {unit && (
            <span className="ml-1 text-sm font-semibold text-muted-foreground">
              {unit}
            </span>
          )}
        </div>
      )}
      <ul className="mt-2 space-y-0.5 border-t pt-2 text-xs">
        {rows.map((r) => {
          const on = kinds.includes(r.kind);
          return (
            <li
              key={r.kind}
              className={`flex items-center gap-1.5 ${on ? "" : "text-muted-foreground opacity-60"}`}
              title={on ? undefined : hiddenLabel}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${on ? KIND_DOT[r.kind] : "border border-muted-foreground/40"}`}
              />
              <span
                className={`min-w-0 flex-1 truncate ${on ? "text-muted-foreground" : ""}`}
              >
                {r.label}
              </span>
              <span
                className={`tabular-nums ${on ? "font-medium" : "line-through"}`}
              >
                {loading ? "…" : format(Number(r.value ?? 0))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function MyActivityPage({ lang }: Props) {
  const { session, isLoading: isSessionLoading } = useAuthSession();
  const login = session?.address ?? null;

  const [dict, setDict] = useState<Dictionary | null>(null);
  const [groups, setGroups] = useState<AddressGroup[]>([]);

  const [targets, setTargets] = useState<Target[]>([]);
  /** 表示する種類（左のチェックボックスで切り替える） */
  const [kinds, setKinds] = useState<ActivityFilterKind[]>(DEFAULT_KINDS);
  /** 対象者での絞り込み（選んだ相手が関わった取引だけにする） */
  const [parties, setParties] = useState<string[]>([]);

  /** 選んだ月と、チャートの右端の月 */
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [chartEnd, setChartEnd] = useState(currentMonth);

  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  /** KPI のタイルの数字。表示する種類に関係なく全部を数える */
  const [kpi, setKpi] = useState<ActivitySummary | null>(null);
  /** 対象者のリスト。選んで読み直す間も前のリストを出しておく（押した場所がずれないように） */
  const [partyRows, setPartyRows] = useState<ActivityParty[] | null>(null);
  const [months, setMonths] = useState<ActivityMonth[] | null>(null);
  /** チャートを読み直している最中か。読み直す間も前のデータを出しておく（大きさが変わってガタつかないように） */
  const [monthsLoading, setMonthsLoading] = useState(true);
  /** 日別の集計（日の見出しの合計に使う）。一覧に出てきた月の分だけ取る */
  const [daysByMonth, setDaysByMonth] = useState<Map<string, ActivityDay[]>>(
    new Map(),
  );
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [next, setNext] = useState<ActivityCursor | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  type Tab = "daily" | "monthly" | "detail";
  const [tab, setTab] = useState<Tab>("daily");
  /** 展開表示（12 か月のチャートと KPI）か。既定は簡易表示 */
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(loadExpanded());
  }, []);

  const changeExpanded = (value: boolean) => {
    setExpanded(value);
    saveExpanded(value);
  };

  /** 日別の表示のしかた（個別・購入者ごと・作品ごと。端末ごと。初期値は購入者ごと） */
  const [grouping, setGrouping] = useState<DailyGrouping>("buyer");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("activity.dailyGrouping");
      if (saved === "none" || saved === "buyer" || saved === "artwork")
        setGrouping(saved);
      // 選べるようにする前の設定で、まとめるスイッチをオフにしていたら個別に
      // （以前の「同じ購入者の同じ作品をまとめる」とスイッチのオンは、初期値の購入者ごとのまま）
      else if (
        saved === null &&
        localStorage.getItem("activity.dailyGrouped") === "0"
      )
        setGrouping("none");
    } catch {
      /* 読めなければ初期値（購入者ごと） */
    }
  }, []);
  const changeGrouping = (value: DailyGrouping) => {
    setGrouping(value);
    try {
      localStorage.setItem("activity.dailyGrouping", value);
    } catch {
      /* 保存できなくても表示には影響しない */
    }
  };

  useEffect(() => {
    setDict(getDictionary(lang as "en" | "ja") as unknown as Dictionary);
  }, [lang]);

  // アドレス帳（削除済みのグループは使わない）。編集して保存したら読み直す
  const loadGroups = useCallback(() => {
    dbManager
      .getAllAddressGroups()
      .then((all) =>
        setGroups(
          all
            .filter((g) => !g.isDeleted)
            .sort((a, b) => a.name.localeCompare(b.name)),
        ),
      )
      .catch((err) => console.error("Failed to load address book:", err));
  }, []);
  useEffect(() => {
    loadGroups();
  }, [loadGroups]);
  const addressEdit = useMemo(
    () => ({
      lang,
      onSaved: () => loadGroups(),
      onSavedAny: () => loadGroups(),
    }),
    [lang, loadGroups],
  );

  const groupsById = useMemo(
    () => new Map(groups.map((g) => [g.id, g])),
    [groups],
  );
  // アドレスごとの名前と X アカウント（アドレス帳）
  const names = useMemo<AddressBook>(() => {
    const map: AddressBook = new Map();
    for (const g of groups)
      for (const a of g.addresses)
        if (g.name)
          map.set(a, { name: g.name, xAccount: g.xAccount, groupId: g.id });
    return map;
  }, [groups]);

  useEffect(() => {
    setTargets(login ? loadTargets(login) : []);
  }, [login]);

  useEffect(() => {
    setKinds(loadKinds());
  }, []);

  /** 表示する種類を切り替える。全部は消さない */
  const toggleKind = (kind: ActivityFilterKind) =>
    setKinds((prev) => {
      const nextKinds = prev.includes(kind)
        ? prev.filter((k) => k !== kind)
        : [...prev, kind];
      if (nextKinds.length === 0) return prev;
      saveKinds(nextKinds);
      return nextKinds;
    });

  const updateTargets = useCallback(
    (update: (prev: Target[]) => Target[]) => {
      setTargets((prev) => {
        const nextTargets = update(prev);
        if (login) saveTargets(login, nextTargets);
        return nextTargets;
      });
    },
    [login],
  );

  // 有効な対象をアドレスに展開する（重複は除く）
  const addresses = useMemo(() => {
    const set = new Set<string>();
    for (const t of targets) {
      if (!t.enabled) continue;
      if (t.type === "address") set.add(t.address);
      else groupsById.get(t.id)?.addresses.forEach((a) => set.add(a));
    }
    return Array.from(set);
  }, [targets, groupsById]);
  const tooMany = addresses.length > ACTIVITY_MAX_ADDRESSES;

  // 期間以外の絞り込み。すべての種類が選ばれていれば種類の指定は送らない
  const toKindsParam = (list: ActivityFilterKind[]) =>
    list.length === ACTIVITY_FILTER_KINDS.length ? [] : list;
  const base = useMemo<Omit<ActivityFilter, "from" | "to"> | null>(() => {
    if (addresses.length === 0 || tooMany || kinds.length === 0) return null;
    return {
      addresses,
      kinds: toKindsParam(kinds),
      parties,
      // 転送と手動ミントは種類の指定で出し分けるので、ここでは除かない
      includeTransfers: true,
      includeSelfMints: true,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addresses, tooMany, kinds, parties]);
  const baseKey = JSON.stringify(base);
  /** KPI 用（種類を問わない） */
  const kpiKey = JSON.stringify(base && { ...base, kinds: [] });

  /** 選んだ月だけ（売上カード・KPI・対象者） */
  const monthFilter = useMemo<ActivityFilter | null>(
    () =>
      base && {
        ...base,
        from: monthStartIso(selectedMonth),
        to: monthStartIso(addMonths(selectedMonth, 1)),
      },
    [base, selectedMonth],
  );
  /** 月別のまとめ方（作品ごと・購入者ごと。端末ごと） */
  const [monthBy, setMonthBy] = useState<ActivityGroupBy>("artwork");
  useEffect(() => {
    try {
      if (localStorage.getItem("activity.monthlyGrouping") === "buyer")
        setMonthBy("buyer");
    } catch {
      /* 読めなければ作品ごと */
    }
  }, []);
  const changeMonthBy = (value: ActivityGroupBy) => {
    setMonthBy(value);
    try {
      localStorage.setItem("activity.monthlyGrouping", value);
    } catch {
      /* 保存できなくても表示には影響しない */
    }
  };
  /** 月別の各月（選んだ月から過去へ。取引の無い月は飛ばす） */
  const [monthSections, setMonthSections] = useState<MonthSection[] | null>(
    null,
  );
  /** 次に読む月（それより前で取引のある、いちばん新しい月）。null なら終わり */
  const [monthNext, setMonthNext] = useState<string | null>(null);
  const [monthLoading, setMonthLoading] = useState(false);
  /** 最初から読み直している最中（前のデータを薄く出しておく） */
  const [monthReplacing, setMonthReplacing] = useState(false);
  /** 読み直したら古い読み込みの結果を捨てるための番号 */
  const monthGen = useRef(0);

  /** 1 か月分を読む。あわせて、その前で取引のある月を 1 件だけ引いて次に読む月にする */
  const loadMonthSection = useCallback(
    async (month: string, gen: number, replace: boolean) => {
      if (!base) return;
      setMonthLoading(true);
      if (replace) setMonthReplacing(true);
      try {
        const [data, older] = await Promise.all([
          fetchActivityGroups(
            {
              ...base,
              from: monthStartIso(month),
              to: monthStartIso(addMonths(month, 1)),
            },
            monthBy,
          ),
          fetchActivityPage(
            { ...base, from: null, to: monthStartIso(month) },
            null,
            1,
          ),
        ]);
        if (gen !== monthGen.current) return;
        setMonthSections((prev) =>
          replace || !prev
            ? [{ month, data }]
            : prev.some((section) => section.month === month)
              ? prev
              : [...prev, { month, data }],
        );
        const latestOlder = older.items[0];
        setMonthNext(latestOlder ? monthOf(latestOlder.tx_date) : null);
      } catch (err) {
        console.error("Failed to load activity groups:", err);
        if (gen === monthGen.current) setError(true);
      } finally {
        if (gen === monthGen.current) {
          setMonthLoading(false);
          setMonthReplacing(false);
        }
      }
    },
    [base, monthBy],
  );

  // 月別のタブを開いているときだけ、選んだ月から読み直す
  useEffect(() => {
    if (tab !== "monthly") return;
    const gen = ++monthGen.current;
    setMonthNext(null);
    if (!base) {
      setMonthSections(null);
      setMonthLoading(false);
      setMonthReplacing(false);
      return;
    }
    void loadMonthSection(selectedMonth, gen, true);
    // base は baseKey が同じなら同じ中身
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, baseKey, selectedMonth, monthBy]);

  const loadMoreMonths = useCallback(() => {
    if (monthLoading || !monthNext) return;
    void loadMonthSection(monthNext, monthGen.current, false);
  }, [monthLoading, monthNext, loadMonthSection]);

  /** 選んだ月の末日から過去へ（日別・詳細） */
  const listFilter = useMemo<ActivityFilter | null>(
    () =>
      base && {
        ...base,
        from: null,
        to: monthStartIso(addMonths(selectedMonth, 1)),
      },
    [base, selectedMonth],
  );
  const chartMonths = useMemo(
    () =>
      Array.from({ length: CHART_MONTHS }, (_, i) =>
        addMonths(chartEnd, i - CHART_MONTHS + 1),
      ),
    [chartEnd],
  );

  // 選んだ月の集計（売上・KPI・対象者）
  useEffect(() => {
    setSummary(null);
    setError(false);
    if (!monthFilter) return;
    let cancelled = false;
    fetchActivitySummary(monthFilter)
      .then((s) => {
        if (cancelled) return;
        setSummary(s);
        // 古い版の集計関数（取引先を返さない）でも読み込み中のままにしない
        setPartyRows(s.parties ?? []);
      })
      .catch((err) => {
        console.error("Failed to load activity summary:", err);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
    // monthFilter は baseKey と selectedMonth が同じなら同じ中身
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey, selectedMonth]);

  // KPI のタイルの数字（選んだ月、種類を問わず全部）
  useEffect(() => {
    setKpi(null);
    if (!base) return;
    let cancelled = false;
    fetchActivitySummary({
      ...base,
      kinds: [],
      from: monthStartIso(selectedMonth),
      to: monthStartIso(addMonths(selectedMonth, 1)),
    })
      .then((s) => !cancelled && setKpi(s))
      .catch((err) => {
        console.error("Failed to load activity KPI:", err);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
    // base は kpiKey が同じなら（種類以外は）同じ中身
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpiKey, selectedMonth]);

  // チャート（直近 12 か月）。読み直す間は前のデータを薄く出しておく
  useEffect(() => {
    setMonthsLoading(true);
    if (!base) {
      setMonths(null);
      return;
    }
    let cancelled = false;
    fetchActivityMonthly({
      ...base,
      from: monthStartIso(chartMonths[0]),
      to: monthStartIso(addMonths(chartMonths[chartMonths.length - 1], 1)),
    })
      .then((data) => {
        if (cancelled) return;
        setMonths(data);
        setMonthsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load activity by month:", err);
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
    // base は baseKey が同じなら同じ中身
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey, chartMonths]);

  // 一覧（選んだ月の末日から過去へ）
  useEffect(() => {
    setItems([]);
    setNext(null);
    if (!listFilter) return;
    let cancelled = false;
    setIsLoading(true);
    fetchActivityPage(listFilter)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setNext(page.next);
      })
      .catch((err) => {
        console.error("Failed to load activity:", err);
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // listFilter は baseKey と selectedMonth が同じなら同じ中身
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey, selectedMonth]);

  const loadMore = useCallback(async () => {
    if (!next || !listFilter || isLoading) return;
    setIsLoading(true);
    try {
      const page = await fetchActivityPage(listFilter, next);
      setItems((prev) => [...prev, ...page.items]);
      setNext(page.next);
    } catch (err) {
      console.error("Failed to load more activity:", err);
      setError(true);
    } finally {
      setIsLoading(false);
    }
  }, [next, listFilter, isLoading]);

  // 日別の集計は、一覧に出てきた月の分だけ月ごとに取る（絞り込みが変わったら捨てる）
  useEffect(() => {
    setDaysByMonth(new Map());
  }, [baseKey]);
  const shownMonths = useMemo(
    () =>
      Array.from(
        new Set(
          items.map((i) =>
            new Date(i.tx_date).toLocaleDateString("sv-SE").slice(0, 7),
          ),
        ),
      ),
    [items],
  );
  useEffect(() => {
    if (!base) return;
    const missing = shownMonths.filter((m) => !daysByMonth.has(m));
    if (missing.length === 0) return;
    let cancelled = false;
    // 取りに行く月は先に空で埋めて、二重に取らない
    setDaysByMonth((prev) => {
      const map = new Map(prev);
      missing.forEach((m) => map.set(m, []));
      return map;
    });
    for (const m of missing) {
      fetchActivityDaily({
        ...base,
        from: monthStartIso(m),
        to: monthStartIso(addMonths(m, 1)),
      })
        .then((data) => {
          if (cancelled) return;
          setDaysByMonth((prev) => new Map(prev).set(m, data));
        })
        .catch((err) => console.error("Failed to load activity by day:", err));
    }
    return () => {
      cancelled = true;
    };
    // base は baseKey が同じなら同じ中身
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey, shownMonths]);
  const days = useMemo(
    () => Array.from(daysByMonth.values()).flat(),
    [daysByMonth],
  );

  // 下までスクロールしたら続き（前の月へ）を読む
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !next) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [next, loadMore, tab]);

  if (!dict) return null;
  const t = dict.myActivity;
  const f = t.filters;

  const titleBlock = (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5" />
        <h1 className="text-xl font-bold">{t.title}</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>
    </div>
  );

  if (!isSessionLoading && !login) {
    return (
      <div className="w-full px-4 py-6 lg:px-6">
        {titleBlock}
        <Card className="mt-4">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t.signInRequired}
          </CardContent>
        </Card>
      </div>
    );
  }

  const enabledCount = targets.filter((tg) => tg.enabled).length;
  const selectedGroupIds = targets.flatMap((tg) =>
    tg.type === "group" ? [tg.id] : [],
  );
  const selectedAddresses = targets.flatMap((tg) =>
    tg.type === "address" ? [tg.address] : [],
  );

  /** 対象者の選択を切り替える */
  const toggleParty = (address: string) =>
    setParties((prev) =>
      prev.includes(address)
        ? prev.filter((a) => a !== address)
        : [...prev, address],
    );

  // 選んだ月と前月の XRP の受取（前月比）
  const monthData = new Map((months ?? []).map((m) => [m.month, m]));
  const selectedXrp = xrpOf(monthData.get(selectedMonth));
  const prevMonth = addMonths(selectedMonth, -1);
  const prevXrp = xrpOf(monthData.get(prevMonth));
  const hasPrev = months !== null && chartMonths.includes(prevMonth);
  const changePct =
    hasPrev && prevXrp > 0 ? ((selectedXrp - prevXrp) / prevXrp) * 100 : null;
  const otherCurrencies = (summary?.currencies ?? []).filter(
    (c) => c.currency !== "XRP",
  );
  const now = currentMonth();
  // 送金か購入のタイルがオンなら、その合計（支出）と差引も出す
  const showSpent = kinds.includes("payment_out") || kinds.includes("purchase");
  const spentLabel = [
    kinds.includes("payment_out") ? t.kpi.sent : null,
    kinds.includes("purchase") ? t.kpi.purchases : null,
  ]
    .filter(Boolean)
    .join("・");
  const selectedSpent = spentXrpOf(monthData.get(selectedMonth));
  const fmtXrp = (v: number) =>
    v.toLocaleString(lang === "ja" ? "ja-JP" : "en-US", {
      maximumFractionDigits: 2,
    });

  return (
    <AddressEditProvider value={addressEdit}>
      <div className="w-full px-4 py-6 lg:px-6">
        {/* 上段: 左にタイトル、右に対象アドレスと表示設定 */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          {titleBlock}

          <div className="flex flex-wrap items-center gap-2">
            {/* 対象アドレス（押すと一覧とアドレス帳の検索が開く。チェックを外すと除外） */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-2">
                  {f.addressesButton}
                  <Badge variant="secondary" className="px-1.5">
                    {enabledCount}/{targets.length}
                  </Badge>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3">
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {targets.map((tg) => {
                    const group =
                      tg.type === "group" ? groupsById.get(tg.id) : undefined;
                    const removable = !(
                      tg.type === "address" && tg.address === login
                    );
                    return (
                      <li
                        key={targetKey(tg)}
                        className={`flex items-center gap-2 rounded-md px-1 py-1 text-sm ${tg.enabled ? "" : "opacity-50"}`}
                      >
                        <Checkbox
                          checked={tg.enabled}
                          onCheckedChange={(checked) =>
                            updateTargets((prev) =>
                              prev.map((p) =>
                                targetKey(p) === targetKey(tg)
                                  ? { ...p, enabled: checked === true }
                                  : p,
                              ),
                            )
                          }
                        />
                        <div className="min-w-0 flex-1">
                          {tg.type === "group" ? (
                            <div className="flex items-baseline gap-2">
                              <span className="truncate">
                                {group?.name ?? "—"}
                              </span>
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {f.addressCount.replace(
                                  "{count}",
                                  String(group?.addresses.length ?? 0),
                                )}
                              </span>
                            </div>
                          ) : (
                            <div className="truncate">
                              <AddressName
                                address={tg.address}
                                names={names}
                                t={t}
                              />
                            </div>
                          )}
                        </div>
                        {removable && (
                          <button
                            type="button"
                            onClick={() =>
                              updateTargets((prev) =>
                                prev.filter(
                                  (p) => targetKey(p) !== targetKey(tg),
                                ),
                              )
                            }
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={f.remove}
                            aria-label={f.remove}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-2 border-t pt-2">
                  <ActivityAddressPicker
                    groups={groups}
                    selectedGroupIds={selectedGroupIds}
                    selectedAddresses={selectedAddresses}
                    onToggleGroup={(id) =>
                      updateTargets((prev) =>
                        prev.some((p) => p.type === "group" && p.id === id)
                          ? prev.filter(
                              (p) => !(p.type === "group" && p.id === id),
                            )
                          : [...prev, { type: "group", id, enabled: true }],
                      )
                    }
                    onAddAddress={(address) =>
                      updateTargets((prev) => [
                        ...prev,
                        { type: "address", address, enabled: true },
                      ])
                    }
                    labels={f}
                  />
                </div>
                {tooMany && (
                  <div className="mt-2 text-xs text-red-600">
                    {f.tooMany.replace("{max}", String(ACTIVITY_MAX_ADDRESSES))}
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {(tooMany || (!base && kinds.length > 0)) && (
          <div className="mt-3 text-sm text-muted-foreground">
            {tooMany
              ? f.tooMany.replace("{max}", String(ACTIVITY_MAX_ADDRESSES))
              : f.noAddress}
          </div>
        )}
        {error && <div className="mt-3 text-sm text-red-600">{t.error}</div>}

        {base && expanded && (
          <>
            {/* 売上: 選んだ月の受取（XRP）と前月比、直近 12 か月の棒グラフ */}
            <Card className="mt-4">
              <CardContent className="grid grid-cols-1 gap-6 pt-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
                <div>
                  <div className="text-sm text-muted-foreground">
                    {t.month.title.replace(
                      "{month}",
                      monthTitle(selectedMonth, lang),
                    )}
                  </div>
                  {months ? (
                    <div className="mt-1 text-5xl font-bold tracking-tight">
                      {selectedXrp.toLocaleString(
                        lang === "ja" ? "ja-JP" : "en-US",
                        { maximumFractionDigits: 2 },
                      )}
                      <span className="ml-1 text-xl font-semibold text-muted-foreground">
                        XRP
                      </span>
                    </div>
                  ) : (
                    <div className="mt-2 h-12 w-48 animate-pulse rounded bg-muted" />
                  )}
                  {months && (
                    <div className="mt-2 text-sm text-muted-foreground">
                      {changePct === null
                        ? t.month.noPrev
                        : t.month.vsPrev.replace(
                            "{value}",
                            `${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`,
                          )}
                    </div>
                  )}
                  {months && showSpent && (
                    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                      <dt className="text-muted-foreground">{spentLabel}</dt>
                      <dd className="text-right text-red-600 dark:text-red-400">
                        −{fmtXrp(selectedSpent)} XRP
                      </dd>
                      <dt className="text-muted-foreground">{t.month.net}</dt>
                      <dd className="text-right font-semibold">
                        {fmtXrp(selectedXrp - selectedSpent)} XRP
                      </dd>
                    </dl>
                  )}
                  {otherCurrencies.length > 0 && (
                    <ReceivedList
                      received={otherCurrencies}
                      lang={lang}
                      className="mt-2 block text-sm text-muted-foreground"
                    />
                  )}
                  {summary && summary.unsettled_count > 0 && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      {t.unsettledNote.replace(
                        "{count}",
                        String(summary.unsettled_count),
                      )}
                    </div>
                  )}
                </div>
                <MonthlyChart
                  action={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 px-2 text-xs text-muted-foreground"
                      onClick={() => changeExpanded(false)}
                      title={t.chart.collapse}
                    >
                      <Minimize2 className="h-3.5 w-3.5" />
                      {t.chart.collapse}
                    </Button>
                  }
                  showSpent={showSpent}
                  spentLabel={spentLabel}
                  months={chartMonths}
                  data={monthData}
                  selected={selectedMonth}
                  onSelect={setSelectedMonth}
                  onPrev={() => setChartEnd((m) => addMonths(m, -CHART_MONTHS))}
                  onNext={
                    chartEnd < now
                      ? () =>
                          setChartEnd((m) =>
                            addMonths(m, CHART_MONTHS) > now
                              ? now
                              : addMonths(m, CHART_MONTHS),
                          )
                      : null
                  }
                  isLoading={!months || monthsLoading}
                  lang={lang}
                  t={t}
                />
              </CardContent>
            </Card>

            {/* 選んだ月の KPI。内訳のうち表示していない種類は薄く出し、合計からは外す（切り替えは左のチェックボックス） */}
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <KpiCard
                label={t.kpi.sold}
                loading={!kpi}
                rows={[
                  {
                    kind: "sale",
                    label: t.kpi.trades,
                    value: kpi?.primary_count,
                  },
                  {
                    kind: "secondary",
                    label: t.kpi.secondary,
                    value: kpi?.secondary_count,
                  },
                  {
                    kind: "launchpad",
                    label: t.kpi.launchpadMints,
                    value: kpi?.launchpad_mint_count,
                  },
                ]}
                kinds={kinds}
                format={(v) => v.toLocaleString()}
                hiddenLabel={t.kpi.hidden}
              />
              {/* 購入者数。合計は表示している種類での重複なしの人数（表示している種類で集計した summary から） */}
              <KpiCard
                label={t.kpi.customers}
                loading={!kpi || !summary}
                total={Number(summary?.buyer_count ?? 0)}
                rows={[
                  {
                    kind: "sale",
                    label: t.kpi.trades,
                    value: kpi?.primary_buyer_count,
                  },
                  {
                    kind: "secondary",
                    label: t.kpi.secondary,
                    value: kpi?.secondary_buyer_count,
                  },
                  {
                    kind: "launchpad",
                    label: t.kpi.launchpadMints,
                    value: kpi?.launchpad_buyer_count,
                  },
                ]}
                kinds={kinds}
                format={(v) => v.toLocaleString()}
                hiddenLabel={t.kpi.hidden}
              />
              <KpiCard
                label={t.kpi.mints}
                loading={!kpi}
                rows={[
                  {
                    kind: "launchpad",
                    label: t.kpi.launchpadMints,
                    value: kpi?.launchpad_mint_count,
                  },
                  {
                    kind: "manual",
                    label: t.kpi.manualMints,
                    value: kpi?.manual_mint_count,
                  },
                ]}
                kinds={kinds}
                format={(v) => v.toLocaleString()}
                hiddenLabel={t.kpi.hidden}
              />
              <KpiCard
                label={t.kpi.revenue}
                unit="XRP"
                loading={!kpi}
                rows={[
                  {
                    kind: "sale",
                    label: t.kpi.primaryRevenue,
                    value: kpi?.xrp_by_kind?.sale?.received,
                  },
                  {
                    kind: "secondary",
                    label: t.kpi.royalty,
                    value: kpi?.xrp_by_kind?.secondary?.received,
                  },
                  {
                    kind: "launchpad_revenue",
                    label: t.kpi.launchpadRevenue,
                    value: kpi?.xrp_by_kind?.launchpad_revenue?.received,
                  },
                  {
                    kind: "payment",
                    label: t.kpi.payments,
                    value: kpi?.xrp_by_kind?.payment?.received,
                  },
                  {
                    kind: "resale",
                    label: t.kpi.resales,
                    value: kpi?.xrp_by_kind?.resale?.received,
                  },
                ]}
                kinds={kinds}
                format={fmtXrp}
                hiddenLabel={t.kpi.hidden}
              />
              <KpiCard
                label={t.kpi.expense}
                unit="XRP"
                negative
                loading={!kpi}
                rows={[
                  {
                    kind: "purchase",
                    label: t.kpi.purchases,
                    value: kpi?.xrp_by_kind?.purchase?.spent,
                  },
                  {
                    kind: "payment_out",
                    label: t.kpi.sent,
                    value: kpi?.xrp_by_kind?.payment_out?.spent,
                  },
                ]}
                kinds={kinds}
                format={fmtXrp}
                hiddenLabel={t.kpi.hidden}
              />
            </div>
          </>
        )}

        {/* 下段: 左に対象者、右にタブ */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
          <div className="space-y-4">
            {/* 簡易表示の売上（選んだ月の受取と、3 か月の棒グラフ）。展開すると上の大きな表示になる */}
            {base && !expanded && (
              <Card>
                <CardContent className="space-y-3 pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">
                        {t.month.title.replace(
                          "{month}",
                          monthTitle(selectedMonth, lang),
                        )}
                      </div>
                      {months ? (
                        <div
                          className={`mt-0.5 text-2xl font-bold tracking-tight transition-opacity ${monthsLoading ? "opacity-50" : ""}`}
                        >
                          {selectedXrp.toLocaleString(
                            lang === "ja" ? "ja-JP" : "en-US",
                            { maximumFractionDigits: 2 },
                          )}
                          <span className="ml-1 text-sm font-semibold text-muted-foreground">
                            XRP
                          </span>
                        </div>
                      ) : (
                        <div className="mt-1 h-7 w-28 animate-pulse rounded bg-muted" />
                      )}
                      {months && (
                        <div className="text-xs text-muted-foreground">
                          {changePct === null
                            ? t.month.noPrev
                            : t.month.vsPrev.replace(
                                "{value}",
                                `${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}%`,
                              )}
                        </div>
                      )}
                      {months && showSpent && (
                        <div className="text-xs text-muted-foreground">
                          {spentLabel}{" "}
                          <span className="text-red-600 dark:text-red-400">
                            −{fmtXrp(selectedSpent)}
                          </span>
                          {" · "}
                          {t.month.net}{" "}
                          <span className="font-semibold text-foreground">
                            {fmtXrp(selectedXrp - selectedSpent)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <MonthlyChart
                    compact
                    action={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => changeExpanded(true)}
                        title={t.chart.expand}
                        aria-label={t.chart.expand}
                      >
                        <Maximize2 className="h-4 w-4" />
                      </Button>
                    }
                    showSpent={showSpent}
                    spentLabel={spentLabel}
                    months={chartMonths.slice(-COMPACT_MONTHS)}
                    data={monthData}
                    selected={selectedMonth}
                    onSelect={setSelectedMonth}
                    onPrev={() => setChartEnd((m) => addMonths(m, -1))}
                    onNext={
                      chartEnd < now
                        ? () => setChartEnd((m) => addMonths(m, 1))
                        : null
                    }
                    isLoading={!months || monthsLoading}
                    lang={lang}
                    t={t}
                  />
                </CardContent>
              </Card>
            )}

            {/* 表示する種類 */}
            <KindsCard kinds={kinds} onToggle={toggleKind} t={t} />

            {/* 対象者（押すとその人が関わった取引だけに絞り込む。複数選べる） */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-base">{t.partiesTitle}</CardTitle>
                {parties.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setParties([])}
                  >
                    {t.partiesFiltering.replace(
                      "{count}",
                      String(parties.length),
                    )}{" "}
                    · {t.partiesClear}
                  </button>
                )}
              </CardHeader>
              <CardContent>
                {!partyRows ? (
                  <div className="h-16 animate-pulse rounded-md bg-muted" />
                ) : partyRows.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    {t.partiesEmpty}
                  </div>
                ) : (
                  <ul className="max-h-[32rem] space-y-1 overflow-y-auto">
                    {partyRows.map((p) => (
                      <li key={p.address}>
                        <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
                          <Checkbox
                            checked={parties.includes(p.address)}
                            onCheckedChange={() => toggleParty(p.address)}
                          />
                          <span className="min-w-0 flex-1 truncate">
                            <AddressName
                              address={p.address}
                              names={names}
                              interactive={false}
                            />
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            className="min-w-0"
          >
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                {/* 日別のとき、まとめ方を選ぶ */}
                {tab === "daily" ? (
                  <Select
                    value={grouping}
                    onValueChange={(v) => changeGrouping(v as DailyGrouping)}
                  >
                    <SelectTrigger className="h-8 w-auto gap-2 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t.day.groupNone}</SelectItem>
                      <SelectItem value="buyer">{t.day.groupBuyer}</SelectItem>
                      <SelectItem value="artwork">
                        {t.day.groupArtwork}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                ) : tab === "monthly" ? (
                  <Select
                    value={monthBy}
                    onValueChange={(v) => changeMonthBy(v as ActivityGroupBy)}
                  >
                    <SelectTrigger className="h-8 w-auto gap-2 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="artwork">
                        {t.day.groupArtwork}
                      </SelectItem>
                      <SelectItem value="buyer">{t.day.groupBuyer}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <span />
                )}
                <TabsList className="ml-auto">
                  {(["daily", "monthly", "detail"] as const).map((key) => (
                    <TabsTrigger key={key} value={key}>
                      {t.tabs[key]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </CardHeader>
              <CardContent>
                {base && (
                  <>
                    <TabsContent value="daily" className="mt-0">
                      <DailyView
                        items={items}
                        days={days}
                        names={names}
                        lang={lang}
                        t={t}
                        hasMore={!!next}
                        isLoading={isLoading}
                        onLoadMore={loadMore}
                        grouping={grouping}
                      />
                    </TabsContent>
                    <TabsContent value="monthly" className="mt-0">
                      <MonthlyView
                        sections={monthSections}
                        isLoading={monthLoading}
                        isReplacing={monthReplacing}
                        hasMore={!!monthNext}
                        onLoadMore={loadMoreMonths}
                        by={monthBy}
                        names={names}
                        lang={lang}
                        t={t}
                        loadItems={(month, key) =>
                          base
                            ? fetchActivityGroupItems(
                                {
                                  ...base,
                                  from: monthStartIso(month),
                                  to: monthStartIso(addMonths(month, 1)),
                                },
                                monthBy,
                                key,
                              )
                            : Promise.resolve([])
                        }
                      />
                    </TabsContent>
                    <TabsContent value="detail" className="mt-0">
                      <DetailTable
                        items={items}
                        names={names}
                        lang={lang}
                        t={t}
                        hasMore={!!next}
                        isLoading={isLoading}
                        onLoadMore={loadMore}
                      />
                    </TabsContent>
                    {/* ここが見えたら前の月へ続きを読む（月別は 1 か月分だけなので読まない） */}
                    {tab !== "monthly" && (
                      <div ref={sentinelRef} aria-hidden className="h-px" />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </Tabs>
        </div>
      </div>
    </AddressEditProvider>
  );
}
