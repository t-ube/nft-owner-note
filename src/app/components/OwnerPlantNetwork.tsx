'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import _ from 'lodash';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { AlertCircle, ChevronDown, HelpCircle, Loader2 } from "lucide-react";
import { useCollectionPlant, CollectionPlant, PlantHub, PlantNode } from '@/app/components/useCollectionPlant';
import { faceImageUrl } from '@/app/components/CollectionFace';
import { dbManager, AddressGroup, AddressInfo } from '@/utils/db';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

interface OwnerPlantNetworkProps {
  lang: string;
  issuer: string;
  /** 表示中のコレクション。該当するハブを強調する */
  taxon: string;
}

// ---- 見た目のルール ----

const HUB_R = 22;
const LEAF_MAX = 16;
const LEAF_LEN = 6;
const LEAF_WIDTH = 2.2;

/** spend の偏りが極端なので √ スケールにする */
const radiusOf = (spend: number) => 3.5 + Math.sqrt(Math.max(0, spend)) * 0.36;

/** 葉のぶんも含めた、ぶつかり判定用の半径 */
const outerRadiusOf = (node: PlantNode) =>
  radiusOf(node.spend) + (node.leaves > 0 ? LEAF_LEN + 1 : 1.5);

const COLOR_STOPS: [number, [number, number, number]][] = [
  [0, [0x63, 0x99, 0x22]],   // 緑
  [90, [0xBA, 0x75, 0x17]],  // 黄土
  [365, [0xA3, 0x2D, 0x2D]], // 赤褐色
];
const SPROUT_COLOR = '#A6D65B';
const BRANCH_COLOR = '#8B6B4A';

const toHex = (rgb: number[]) =>
  '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

/** 最終活動からの日数を色にする（365 日以上は赤褐色に固定） */
function recencyColor(days: number | null): string {
  const d = days === null ? Infinity : Math.max(0, days);
  for (let i = 1; i < COLOR_STOPS.length; i++) {
    const [d1, c1] = COLOR_STOPS[i];
    if (d <= d1) {
      const [d0, c0] = COLOR_STOPS[i - 1];
      const u = (d - d0) / (d1 - d0);
      return toHex(c0.map((v, k) => v + (c1[k] - v) * u));
    }
  }
  return toHex(COLOR_STOPS[COLOR_STOPS.length - 1][1]);
}

const nodeColor = (node: PlantNode) => (node.isSprout ? SPROUT_COLOR : recencyColor(node.daysSinceLast));

/** 葉（最大 16 枚）を 1 本の path にまとめる */
function leavesPath(x: number, y: number, r: number, count: number, seed: number): string {
  const n = Math.min(count, LEAF_MAX);
  if (n <= 0) return '';
  const offset = (seed * 2.39996) % (Math.PI * 2);
  let d = '';
  for (let q = 0; q < n; q++) {
    const a = offset + (q * Math.PI * 2) / n;
    const cx = Math.cos(a), cy = Math.sin(a);
    const px = -cy * LEAF_WIDTH, py = cx * LEAF_WIDTH;
    const bx = x + cx * r, by = y + cy * r;
    const tx = x + cx * (r + LEAF_LEN), ty = y + cy * (r + LEAF_LEN);
    const mx = x + cx * (r + LEAF_LEN / 2), my = y + cy * (r + LEAF_LEN / 2);
    d += `M${bx.toFixed(1)} ${by.toFixed(1)}Q${(mx + px).toFixed(1)} ${(my + py).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}Q${(mx - px).toFixed(1)} ${(my - py).toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}Z`;
  }
  return d;
}

/** face_uri は XRPL の生 hex、image_url は普通の URL */
function hubIconUrl(icon: string | null): string | null {
  if (!icon) return null;
  if (/^https?:\/\//i.test(icon)) return icon;
  if (/^[0-9a-f]+$/i.test(icon)) return faceImageUrl(icon);
  return null;
}

// ---- レイアウト ----

interface PlacedHub extends PlantHub {
  x: number;
  y: number;
}

interface PlacedNode extends PlantNode {
  x: number;
  y: number;
  r: number;
  color: string;
  leafPath: string;
}

interface Layout {
  hubs: PlacedHub[];
  nodes: PlacedNode[];
  viewBox: { x: number; y: number; w: number; h: number };
}

/**
 * taxon ハブを固定座標に置き、wallet は取得した taxon の重心に引き寄せる。
 * 複数 taxon を持つ wallet は枝の間に寄る。重なりは位置補正で解消する。
 */
function computeLayout(plant: CollectionPlant, limit: number): Layout {
  const source = plant.nodes.slice(0, limit);
  const hubIndex = new Map(plant.hubs.map((h, i) => [h.taxon, i]));
  const m = plant.hubs.length;

  // 1 taxon だけの wallet が作る塊の大きさから、ハブ同士の間隔を決める
  const soloArea = new Array(m).fill(0);
  let sharedArea = 0;
  for (const node of source) {
    const er = outerRadiusOf(node);
    const area = Math.PI * er * er;
    if (node.taxa.length === 1) {
      const h = hubIndex.get(node.taxa[0].taxon);
      if (h !== undefined) soloArea[h] += area;
    } else {
      sharedArea += area;
    }
  }
  const PACKING = 0.7;
  const clusterR = soloArea.map(a => Math.sqrt(a / Math.PI / PACKING) + HUB_R + 8);
  const sharedR = Math.sqrt(sharedArea / Math.PI / PACKING);

  const hubs: PlacedHub[] = plant.hubs.map(h => ({ ...h, x: 0, y: 0 }));
  if (m > 1) {
    const GAP = 40;
    const arcs = clusterR.map(r => 2 * r + GAP);
    const total = arcs.reduce((a, b) => a + b, 0);
    const ring = Math.max(
      total / (Math.PI * 2),
      m === 2 ? Math.max(...clusterR) + GAP : 0,
      sharedR + Math.max(...clusterR) * 0.6,
      120
    );
    let acc = 0;
    hubs.forEach((h, i) => {
      const a = -Math.PI / 2 + ((acc + arcs[i] / 2) / total) * Math.PI * 2;
      acc += arcs[i];
      h.x = Math.cos(a) * ring;
      h.y = Math.sin(a) * ring;
    });
  }

  // 目標位置 = 取得した taxon の重心（取得件数で重み付け）
  const n = source.length;
  const xs = new Float64Array(n), ys = new Float64Array(n);
  const vx = new Float64Array(n), vy = new Float64Array(n);
  const txs = new Float64Array(n), tys = new Float64Array(n);
  const ers = new Float64Array(n);
  const groupCount = new Map<string, number>();

  source.forEach((node, i) => {
    let sx = 0, sy = 0, sw = 0;
    for (const { taxon, leaves } of node.taxa) {
      const h = hubIndex.get(taxon);
      if (h === undefined) continue;
      const w = leaves + 1;
      sx += hubs[h].x * w;
      sy += hubs[h].y * w;
      sw += w;
    }
    txs[i] = sw > 0 ? sx / sw : 0;
    tys[i] = sw > 0 ? sy / sw : 0;
    ers[i] = outerRadiusOf(node);

    // 初期位置は同じ taxon の組ごとに葉序（黄金角）のらせんで並べる。spend の大きい順に内側から
    const key = node.taxa.map(t => t.taxon).join(',');
    const j = groupCount.get(key) ?? 0;
    groupCount.set(key, j + 1);
    const base = node.taxa.length === 1 ? HUB_R + 6 : 0;
    const rr = base + 9 * Math.sqrt(j + 0.5);
    xs[i] = txs[i] + Math.cos(j * 2.39996) * rr;
    ys[i] = tys[i] + Math.sin(j * 2.39996) * rr;
  });

  const maxEr = n > 0 ? Math.max(...Array.from(ers)) : 1;
  const cell = maxEr * 2;
  const TICKS = 260;

  for (let tick = 0; tick < TICKS; tick++) {
    const alpha = 1 - tick / TICKS;

    // 目標位置へ引き寄せる
    for (let i = 0; i < n; i++) {
      vx[i] += (txs[i] - xs[i]) * 0.02 * alpha;
      vy[i] += (tys[i] - ys[i]) * 0.02 * alpha;
      xs[i] += vx[i];
      ys[i] += vy[i];
      vx[i] *= 0.6;
      vy[i] *= 0.6;
    }

    // ノード同士の重なりを解消（グリッドで近傍だけ見る）
    const grid = new Map<string, number[]>();
    for (let i = 0; i < n; i++) {
      const key = `${Math.floor(xs[i] / cell)},${Math.floor(ys[i] / cell)}`;
      const bucket = grid.get(key);
      if (bucket) bucket.push(i);
      else grid.set(key, [i]);
    }
    for (let i = 0; i < n; i++) {
      const gx = Math.floor(xs[i] / cell), gy = Math.floor(ys[i] / cell);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const bucket = grid.get(`${gx + ox},${gy + oy}`);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            let dx = xs[j] - xs[i], dy = ys[j] - ys[i];
            let dist = Math.hypot(dx, dy);
            const min = ers[i] + ers[j];
            if (dist >= min) continue;
            if (dist < 1e-6) {
              dx = Math.cos(i + j);
              dy = Math.sin(i + j);
              dist = 1;
            }
            // 大きいノードほど動きにくくする
            const wi = ers[j] * ers[j], wj = ers[i] * ers[i];
            const push = ((min - dist) / dist) * 0.5;
            const share = wi / (wi + wj);
            xs[i] -= dx * push * share * 2;
            ys[i] -= dy * push * share * 2;
            xs[j] += dx * push * (1 - share) * 2;
            ys[j] += dy * push * (1 - share) * 2;
          }
        }
      }
    }

    // ハブ（固定）とは重ならないように外へ押し出す
    for (let i = 0; i < n; i++) {
      for (const h of hubs) {
        const dx = xs[i] - h.x, dy = ys[i] - h.y;
        const dist = Math.hypot(dx, dy);
        const min = HUB_R + ers[i] + 3;
        if (dist >= min) continue;
        const ux = dist < 1e-6 ? Math.cos(i) : dx / dist;
        const uy = dist < 1e-6 ? Math.sin(i) : dy / dist;
        xs[i] = h.x + ux * min;
        ys[i] = h.y + uy * min;
      }
    }
  }

  const nodes: PlacedNode[] = source.map((node, i) => {
    const r = radiusOf(node.spend);
    return {
      ...node,
      x: xs[i],
      y: ys[i],
      r,
      color: nodeColor(node),
      leafPath: leavesPath(xs[i], ys[i], r, node.leaves, i),
    };
  });

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const extend = (x0: number, y0: number, x1: number, y1: number) => {
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  };
  for (const h of hubs) extend(h.x - HUB_R - 50, h.y - HUB_R, h.x + HUB_R + 50, h.y + HUB_R + 22);
  nodes.forEach((node, i) => extend(node.x - ers[i], node.y - ers[i], node.x + ers[i], node.y + ers[i]));
  const PAD = 16;

  return {
    hubs,
    nodes,
    viewBox: {
      x: minX - PAD,
      y: minY - PAD,
      w: maxX - minX + PAD * 2,
      h: maxY - minY + PAD * 2,
    },
  };
}

// ---- 表示 ----

const LIMITS = [100, 300, 1000, Infinity];

type Hover =
  | { kind: 'node'; index: number; x: number; y: number }
  | { kind: 'hub'; taxon: number; x: number; y: number };

const OwnerPlantNetwork: React.FC<OwnerPlantNetworkProps> = ({ lang, issuer, taxon }) => {
  const { status, plant } = useCollectionPlant(issuer);
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [limit, setLimit] = useState(300);
  const [legendOpen, setLegendOpen] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [brokenIcons, setBrokenIcons] = useState<Set<number>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadDictionary = async () => {
      const dictionary = await getDictionary(lang as 'en' | 'ja');
      setDict(dictionary);
    };
    loadDictionary();
  }, [lang]);

  // アドレス帳（オーナー名）
  const [addressGroups, setAddressGroups] = useState<Record<string, AddressGroup>>({});
  const [addressInfos, setAddressInfos] = useState<Record<string, AddressInfo>>({});

  const loadAddressBook = useCallback(async () => {
    const [groups, infos] = await Promise.all([
      dbManager.getAllAddressGroups(),
      dbManager.getAllAddressInfos(),
    ]);
    setAddressGroups(_.keyBy(groups, 'id'));
    setAddressInfos(_.keyBy(infos, 'address'));
  }, []);

  useEffect(() => {
    void loadAddressBook();
  }, [loadAddressBook]);

  const groupOf = (wallet: string): AddressGroup | null => {
    const groupId = addressInfos[wallet]?.groupId;
    return groupId ? addressGroups[groupId] ?? null : null;
  };

  const layout = useMemo(() => (plant ? computeLayout(plant, limit) : null), [plant, limit]);

  const hubByTaxon = useMemo(
    () => new Map((layout?.hubs ?? []).map(h => [h.taxon, h])),
    [layout]
  );

  // 線はまとめて 1 本の path にする
  const edgesPath = useMemo(() => {
    if (!layout) return '';
    let d = '';
    for (const node of layout.nodes) {
      for (const { taxon: t } of node.taxa) {
        const h = hubByTaxon.get(t);
        if (h) d += `M${node.x.toFixed(1)} ${node.y.toFixed(1)}L${h.x.toFixed(1)} ${h.y.toFixed(1)}`;
      }
    }
    return d;
  }, [layout, hubByTaxon]);

  const pointerAt = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 };
  };

  if (!dict) return null;

  const { ownerPlant } = dict.project.detail;

  const hubName = (h: PlantHub) => h.name || ownerPlant.hub.fallback.replace('{taxon}', String(h.taxon));

  const formatXrp = (value: number) =>
    value.toLocaleString(undefined, { maximumFractionDigits: 1 });

  const formatDaysAgo = (days: number) =>
    new Intl.RelativeTimeFormat(lang, { numeric: 'auto' }).format(-days, 'day');

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {ownerPlant.status.loading}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{ownerPlant.errors.loadFailed}</AlertDescription>
      </Alert>
    );
  }

  if (!plant || !layout || plant.nodes.length === 0) {
    return <div className="py-8 text-center text-sm text-gray-500">{ownerPlant.status.noData}</div>;
  }

  const hoveredNode = hover?.kind === 'node' ? layout.nodes[hover.index] : null;
  const hoveredHub = hover?.kind === 'hub' ? hubByTaxon.get(hover.taxon) ?? null : null;
  const hoveredGroup = hoveredNode ? groupOf(hoveredNode.wallet) : null;
  const isDimmed = (node: PlacedNode) =>
    hoveredHub !== null && !node.taxa.some(t => t.taxon === hoveredHub.taxon);

  const { viewBox } = layout;
  const showBranches = layout.hubs.length > 1;
  const containerWidth = containerRef.current?.clientWidth ?? 0;

  return (
    <div className="space-y-4">
      <Collapsible open={legendOpen} onOpenChange={setLegendOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <HelpCircle className="h-4 w-4" />
            {ownerPlant.legend.toggle}
            <ChevronDown className={`h-4 w-4 transition-transform ${legendOpen ? 'rotate-180' : ''}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 rounded-md border bg-muted/30 p-3 sm:p-4 space-y-3 text-sm">
            <p className="text-muted-foreground">{ownerPlant.description}</p>
            <dl className="grid gap-x-6 gap-y-2 md:grid-cols-2">
              {([
                [ownerPlant.legend.branchLabel, ownerPlant.legend.branch],
                [ownerPlant.legend.nodeLabel, ownerPlant.legend.node],
                [ownerPlant.legend.lineLabel, ownerPlant.legend.line],
                [ownerPlant.legend.sizeLabel, ownerPlant.legend.size],
                [ownerPlant.legend.colorLabel, ownerPlant.legend.color],
                [ownerPlant.legend.sproutLabel, ownerPlant.legend.sprout],
                [ownerPlant.legend.leavesLabel, ownerPlant.legend.leaves],
              ] as [string, string][]).map(([label, text]) => (
                <div key={label}>
                  <dt className="font-medium">{label}</dt>
                  <dd className="text-muted-foreground">{text}</dd>
                </div>
              ))}
            </dl>
            <p className="text-muted-foreground">{ownerPlant.legend.note}</p>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">{ownerPlant.actions.limit}</span>
          <div className="inline-flex rounded-md border">
            {LIMITS.map(value => (
              <Button
                key={value}
                variant={limit === value ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 rounded-none first:rounded-l-md last:rounded-r-md"
                onClick={() => setLimit(value)}
              >
                {value === Infinity ? ownerPlant.actions.all : value.toLocaleString()}
              </Button>
            ))}
          </div>
        </div>
        <div className="text-sm text-gray-500">
          {ownerPlant.status.showing
            .replace('{shown}', layout.nodes.length.toLocaleString())
            .replace('{total}', plant.nodes.length.toLocaleString())}
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>{ownerPlant.legend.colorLabel}</span>
          <div className="flex flex-col">
            <div
              className="h-2 w-32 rounded-sm"
              style={{
                background: `linear-gradient(to right, ${recencyColor(0)} 0%, ${recencyColor(90)} ${(90 / 365) * 100}%, ${recencyColor(365)} 100%)`,
              }}
            />
            <div className="relative h-4 w-32 tabular-nums">
              <span className="absolute left-0">0</span>
              <span className="absolute -translate-x-1/2" style={{ left: `${(90 / 365) * 100}%` }}>90</span>
              <span className="absolute right-0">365+</span>
            </div>
          </div>
          <span>{ownerPlant.legend.days}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full" style={{ background: SPROUT_COLOR }} />
          {ownerPlant.legend.sproutLabel}
        </div>
        <div className="flex items-center gap-1.5">
          <svg width="46" height="22" viewBox="0 0 46 22" aria-hidden>
            {[10, 100, 1000].map((v, i) => {
              const r = radiusOf(v) * 0.6;
              const cx = [5, 16, 34][i];
              return <circle key={v} cx={cx} cy={11} r={r} fill="none" stroke="currentColor" />;
            })}
          </svg>
          {ownerPlant.legend.sizeShort}
        </div>
        <div>{ownerPlant.legend.leavesShort}</div>
      </div>

      <div
        ref={containerRef}
        className="relative rounded-md border bg-background overflow-hidden touch-pan-y"
        onPointerLeave={() => setHover(null)}
      >
        <svg
          viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
          className="block w-full h-auto max-h-[80vh] text-foreground"
          role="img"
          // 何もない場所をクリック・タップしたらツールチップを消す
          onPointerDown={() => setHover(null)}
          aria-label={ownerPlant.title}
        >
          <defs>
            {layout.hubs.map(h => (
              <clipPath key={h.taxon} id={`plant-hub-${h.taxon}`}>
                <circle cx={h.x} cy={h.y} r={HUB_R - 2} />
              </clipPath>
            ))}
          </defs>

          {/* 枝 */}
          {showBranches && (
            <g stroke={BRANCH_COLOR} strokeLinecap="round" fill="none" opacity={0.35}>
              {layout.hubs.map(h => (
                <path
                  key={h.taxon}
                  d={`M0 0Q${(h.x * 0.5 - h.y * 0.15).toFixed(1)} ${(h.y * 0.5 + h.x * 0.15).toFixed(1)} ${h.x.toFixed(1)} ${h.y.toFixed(1)}`}
                  strokeWidth={4}
                />
              ))}
              <circle cx={0} cy={0} r={5} fill={BRANCH_COLOR} stroke="none" />
            </g>
          )}

          {/* 線 */}
          <path
            d={edgesPath}
            stroke="currentColor"
            strokeWidth={0.6}
            opacity={hoveredNode || hoveredHub ? 0.04 : 0.1}
            fill="none"
          />
          {hoveredNode && (
            <g stroke="currentColor" strokeWidth={1.5} opacity={0.6}>
              {hoveredNode.taxa.map(({ taxon: t }) => {
                const h = hubByTaxon.get(t);
                return h ? <line key={t} x1={hoveredNode.x} y1={hoveredNode.y} x2={h.x} y2={h.y} /> : null;
              })}
            </g>
          )}

          {/* wallet（大きいものから描き、小さいものを上に重ねる） */}
          <g>
            {layout.nodes.map((node, i) => (
              <g
                key={node.wallet}
                opacity={isDimmed(node) ? 0.15 : 1}
                className="cursor-pointer"
                onPointerEnter={e => setHover({ kind: 'node', index: i, ...pointerAt(e) })}
                onPointerMove={e => setHover({ kind: 'node', index: i, ...pointerAt(e) })}
                onPointerDown={e => {
                  e.stopPropagation();
                  setHover({ kind: 'node', index: i, ...pointerAt(e) });
                }}
              >
                {node.leafPath && <path d={node.leafPath} fill={node.color} opacity={0.55} />}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={node.r}
                  fill={node.color}
                  stroke={hoveredNode === node ? 'currentColor' : 'hsl(var(--background))'}
                  strokeWidth={hoveredNode === node ? 1.5 : 0.8}
                />
              </g>
            ))}
          </g>

          {/* 枝（taxon ハブ） */}
          <g>
            {layout.hubs.map(h => {
              const icon = brokenIcons.has(h.taxon) ? null : hubIconUrl(h.icon);
              const isCurrent = String(h.taxon) === String(taxon);
              const label = hubName(h);
              return (
                <g
                  key={h.taxon}
                  className="cursor-pointer"
                  onPointerEnter={e => setHover({ kind: 'hub', taxon: h.taxon, ...pointerAt(e) })}
                  onPointerMove={e => setHover({ kind: 'hub', taxon: h.taxon, ...pointerAt(e) })}
                  onPointerDown={e => {
                    e.stopPropagation();
                    setHover({ kind: 'hub', taxon: h.taxon, ...pointerAt(e) });
                  }}
                >
                  <circle
                    cx={h.x}
                    cy={h.y}
                    r={HUB_R}
                    fill="hsl(var(--muted))"
                    stroke={isCurrent ? 'hsl(var(--primary))' : BRANCH_COLOR}
                    strokeWidth={isCurrent ? 3 : 2}
                  />
                  {icon ? (
                    <image
                      href={icon}
                      x={h.x - HUB_R + 2}
                      y={h.y - HUB_R + 2}
                      width={(HUB_R - 2) * 2}
                      height={(HUB_R - 2) * 2}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#plant-hub-${h.taxon})`}
                      onError={() => setBrokenIcons(prev => new Set(prev).add(h.taxon))}
                    />
                  ) : (
                    <text
                      x={h.x}
                      y={h.y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={11}
                      fill="currentColor"
                    >
                      {h.taxon}
                    </text>
                  )}
                  <text
                    x={h.x}
                    y={h.y + HUB_R + 13}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={isCurrent ? 700 : 500}
                    fill="currentColor"
                    stroke="hsl(var(--background))"
                    strokeWidth={3}
                    paintOrder="stroke"
                  >
                    {label.length > 20 ? `${label.slice(0, 19)}…` : label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>

        {hover && (hoveredNode || hoveredHub) && (
          <div
            className="pointer-events-none absolute z-10 max-w-[260px] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
            style={{
              top: hover.y + 12,
              ...(hover.x > containerWidth / 2
                ? { right: containerWidth - hover.x + 12 }
                : { left: hover.x + 12 }),
            }}
          >
            {hoveredNode && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {hoveredGroup?.name ? (
                    <span className="font-medium break-words">{hoveredGroup.name}</span>
                  ) : (
                    <span className="font-mono font-medium">{hoveredNode.wallet.slice(0, 6)}…</span>
                  )}
                  {hoveredNode.isSprout && (
                    <span className="rounded px-1 text-[10px] font-medium text-black" style={{ background: SPROUT_COLOR }}>
                      {ownerPlant.legend.sproutLabel}
                    </span>
                  )}
                </div>
                {hoveredGroup?.name && (
                  <div className="text-muted-foreground">
                    <span className="font-mono">{hoveredNode.wallet.slice(0, 6)}…</span>
                    {hoveredGroup.xAccount && <span className="ml-2">@{hoveredGroup.xAccount.replace(/^@/, '')}</span>}
                  </div>
                )}
                <div>
                  {ownerPlant.tooltip.lastActive}:{' '}
                  {hoveredNode.daysSinceLast === null ? '-' : formatDaysAgo(hoveredNode.daysSinceLast)}
                </div>
                <div>{ownerPlant.tooltip.acquired}: {hoveredNode.leaves.toLocaleString()}</div>
                <div>{ownerPlant.tooltip.spend}: {formatXrp(hoveredNode.spend)} XRP</div>
                <div>
                  <div>{ownerPlant.tooltip.collections}:</div>
                  <ul className="ml-2">
                    {hoveredNode.taxa.map(({ taxon: t, leaves }) => {
                      const h = hubByTaxon.get(t);
                      return (
                        <li key={t} className="truncate">
                          {h ? hubName(h) : ownerPlant.hub.fallback.replace('{taxon}', String(t))} ({leaves.toLocaleString()})
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            )}
            {hoveredHub && (
              <div className="space-y-1">
                <div className="font-medium">{hubName(hoveredHub)}</div>
                <div>{ownerPlant.tooltip.wallets}: {hoveredHub.wallets.toLocaleString()}</div>
                <div>{ownerPlant.tooltip.spend}: {formatXrp(hoveredHub.spend)} XRP</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default OwnerPlantNetwork;
