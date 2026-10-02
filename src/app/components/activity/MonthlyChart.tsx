"use client";

// 月別の受取（XRP）の棒グラフ。並べた月の棒を押すとその月を選ぶ。
// 系列は受取（上向き）と、支出を出すときは支出（下向き・赤）。縦軸は 1 本で、0 の線を上下の間に置く。
// 選んだ月だけ濃く、ほかは同じ色を薄くする。compact（簡易表示）では縦軸と目盛りの線を省き、低く描く。
import { useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ActivityMonth } from "@/lib/activity/types";
import type { ActivityTexts } from "./shared";

type Props = {
  /** 並べる月（'YYYY-MM'、古い順） */
  months: string[];
  data: Map<string, ActivityMonth>;
  selected: string;
  onSelect: (month: string) => void;
  onPrev: () => void;
  onNext: (() => void) | null;
  isLoading: boolean;
  lang: string;
  t: ActivityTexts;
  /** 簡易表示（数か月分を小さく） */
  compact?: boolean;
  /** 支出（送金・購入）を下向きに出すか */
  showSpent?: boolean;
  /** 支出の呼び名（オンの種類に合わせて「送金」「購入」「送金・購入」） */
  spentLabel?: string;
  /** 見出しの右端（月送りの右）に置く操作。表示の切り替えボタンなど */
  action?: ReactNode;
};

/** その月の XRP の受取（確定分） */
export function xrpOf(month: ActivityMonth | undefined): number {
  return Number(
    month?.received.find((r) => r.currency === "XRP")?.received ?? 0,
  );
}

/** その月の XRP の支出（確定分） */
export function spentXrpOf(month: ActivityMonth | undefined): number {
  return Number(month?.received.find((r) => r.currency === "XRP")?.spent ?? 0);
}

/** 目盛りを切りのよい数（1・2・5 の倍数）にそろえる */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0];
  const rough = max / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? rough;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(v);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

function monthLabel(month: string, lang: string, withYear: boolean) {
  const d = new Date(`${month}-01T00:00:00`);
  return d.toLocaleDateString(
    lang === "ja" ? "ja-JP" : "en-US",
    withYear ? { year: "numeric", month: "short" } : { month: "short" },
  );
}

export function MonthlyChart({
  months,
  data,
  selected,
  onSelect,
  onPrev,
  onNext,
  isLoading,
  lang,
  t,
  compact = false,
  showSpent = false,
  spentLabel = "",
  action,
}: Props) {
  const CHART_HEIGHT = compact ? 72 : 160;
  const [hovered, setHovered] = useState<string | null>(null);
  const received = useMemo(
    () => months.map((m) => xrpOf(data.get(m))),
    [months, data],
  );
  const spent = useMemo(
    () => months.map((m) => (showSpent ? spentXrpOf(data.get(m)) : 0)),
    [months, data, showSpent],
  );

  // 上（受取）と下（支出）の目盛り。同じ 1 本の軸で、0 の線の位置だけを変える
  const upTicks = useMemo(
    () => niceTicks(Math.max(...received, 0)),
    [received],
  );
  const downTicks = useMemo(() => {
    const max = Math.max(...spent, 0);
    return max > 0 ? niceTicks(max) : [0];
  }, [spent]);
  const downTop = downTicks[downTicks.length - 1];
  // 受取も支出も無ければ、0 の線を下端に置く
  const upTop = upTicks[upTicks.length - 1] || (downTop > 0 ? 0 : 1);
  const unit = CHART_HEIGHT / (upTop + downTop);
  const zeroY = upTop * unit;

  const fmt = (v: number) =>
    v.toLocaleString(lang === "ja" ? "ja-JP" : "en-US", {
      maximumFractionDigits: 2,
    });
  // 縦軸の目盛り（上は受取、下は支出を「−」で）
  const axisTicks = [
    ...upTicks.map((v) => ({ y: zeroY - v * unit, label: fmt(v) })),
    ...downTicks
      .slice(1)
      .map((v) => ({ y: zeroY + v * unit, label: `−${fmt(v)}` })),
  ];

  return (
    <div>
      <div
        className={`flex items-center justify-between gap-2 ${compact ? "mb-1" : "mb-2"}`}
      >
        <div
          className={
            compact
              ? "text-xs text-muted-foreground"
              : "text-sm text-muted-foreground"
          }
        >
          {t.chart.title}
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onPrev}
            title={t.chart.prev}
            aria-label={t.chart.prev}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onNext ?? undefined}
            disabled={!onNext}
            title={t.chart.next}
            aria-label={t.chart.next}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {action}
        </div>
      </div>

      <div className="flex gap-2">
        {/* 縦軸（切りのよい数）。簡易表示では省く */}
        {!compact && (
          <div
            className="relative w-12 shrink-0 text-right text-[11px] text-muted-foreground"
            style={{ height: CHART_HEIGHT }}
          >
            {axisTicks.map(({ y, label }) => (
              <span
                key={`${y}:${label}`}
                className="absolute right-0 -translate-y-1/2"
                style={{ top: y }}
              >
                {label}
              </span>
            ))}
          </div>
        )}

        <div className="relative min-w-0 flex-1">
          {/* 目盛りの線（細く、目立たせない）。簡易表示では 0 の線だけ */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0"
            style={{ height: CHART_HEIGHT }}
          >
            {(compact ? [{ y: zeroY, label: "0" }] : axisTicks).map(
              ({ y, label }) => (
                <div
                  key={`${y}:${label}`}
                  className={`absolute inset-x-0 border-t ${y === zeroY ? "border-muted-foreground/40" : "border-border"}`}
                  style={{ top: y }}
                />
              ),
            )}
          </div>

          {/* 棒。列全体が押せる・ホバーできる範囲 */}
          <div
            className={`relative flex ${isLoading ? "opacity-50" : ""}`}
            style={{ height: CHART_HEIGHT }}
          >
            {months.map((m, i) => {
              const up = received[i];
              const down = spent[i];
              const isSelected = m === selected;
              const stats = data.get(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => onSelect(m)}
                  onMouseEnter={() => setHovered(m)}
                  onMouseLeave={() => setHovered((h) => (h === m ? null : h))}
                  onFocus={() => setHovered(m)}
                  onBlur={() => setHovered((h) => (h === m ? null : h))}
                  aria-label={`${monthLabel(m, lang, true)} ${fmt(up)} XRP${down > 0 ? ` / −${fmt(down)} XRP` : ""}`}
                  aria-pressed={isSelected}
                  className={`relative h-full flex-1 rounded-md ${
                    isSelected
                      ? "bg-[#2a78d6]/5 dark:bg-[#3987e5]/10"
                      : "hover:bg-muted/60"
                  }`}
                >
                  {/* 受取（0 の線から上へ） */}
                  {up > 0 && (
                    <span
                      className={`absolute left-1/2 w-3/5 max-w-6 -translate-x-1/2 rounded-t-[4px] ${
                        isSelected
                          ? "bg-[#2a78d6] dark:bg-[#3987e5]"
                          : "bg-[#2a78d6]/35 dark:bg-[#3987e5]/40"
                      }`}
                      style={{
                        bottom: CHART_HEIGHT - zeroY,
                        height: Math.max(2, up * unit),
                      }}
                    />
                  )}
                  {/* 支出（0 の線から下へ、赤） */}
                  {down > 0 && (
                    <span
                      className={`absolute left-1/2 w-3/5 max-w-6 -translate-x-1/2 rounded-b-[4px] ${
                        isSelected
                          ? "bg-red-500 dark:bg-red-400"
                          : "bg-red-500/35 dark:bg-red-400/40"
                      }`}
                      style={{ top: zeroY, height: Math.max(2, down * unit) }}
                    />
                  )}
                  {hovered === m && (
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-left text-xs text-popover-foreground shadow-md">
                      <span className="block font-semibold">{fmt(up)} XRP</span>
                      {down > 0 && (
                        <span className="block font-semibold text-red-600 dark:text-red-400">
                          {spentLabel} −{fmt(down)} XRP
                        </span>
                      )}
                      <span className="block text-muted-foreground">
                        {monthLabel(m, lang, true)}
                        {stats &&
                          stats.sale_count > 0 &&
                          ` · ${t.day.sold.replace("{count}", String(stats.sale_count))}`}
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* 月の目盛り。1 月と左端だけ年も出す */}
          <div className="mt-1 flex">
            {months.map((m, i) => (
              <span
                key={m}
                className={`flex-1 text-center text-[11px] ${m === selected ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              >
                {monthLabel(m, lang, i === 0 || m.endsWith("-01"))}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
