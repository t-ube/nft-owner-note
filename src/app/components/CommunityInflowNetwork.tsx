'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import _ from 'lodash';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertCircle,
  ArrowRight,
  Loader2,
  Maximize,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import HelpPopover from '@/app/components/HelpPopover';
import NFTSiteWalletIcons from '@/app/components/NFTSiteWalletIcons';
import { faceImageUrl, requestFaceCache } from '@/app/components/CollectionFace';
import { loadPlant } from '@/app/components/useCollectionPlant';
import {
  useCreatorInflow,
  CreatorInflow,
  InflowHub,
  InflowOwner,
  LoyaltyBand,
} from '@/app/components/useCreatorInflow';
import {
  View,
  ViewBox,
  clampView,
  fitView,
  animateView,
  cancelViewAnimation,
  ZOOM_MAX,
  ZOOM_STEP,
} from '@/app/components/networkView';
import { collectionPath } from '@/utils/routes';
import { dbManager, AddressGroup, AddressInfo } from '@/utils/db';
import { getDictionary } from '@/i18n/get-dictionary';
import { Dictionary } from '@/i18n/dictionaries/index';

interface CommunityInflowNetworkProps {
  lang: string;
  issuer: string;
}

// ---- 見た目のルール ----

const CENTER_R = 28;
const OWNER_R_MAX = 40;

/** 周りのハブは直径 20 + 4√m */
const hubRadiusOf = (hub: InflowHub) => (hub.index === 0 ? CENTER_R : 10 + 2 * Math.sqrt(hub.members));

/** 支払額の偏りが極端なので √ スケールにする */
const ownerRadiusOf = (spend: number) => Math.min(OWNER_R_MAX, 3 + 0.3 * Math.sqrt(Math.max(0, spend)));

/** 流入線の太さ（max は中央を除く描くハブの最大値） */
const flowWidthOf = (flow: number, max: number) => 1 + 10 * Math.sqrt(max > 0 ? flow / max : 0);

// エコシステムの緑〜赤と混同しないよう、ピンク系にする
const FLOW_COLOR = '#D4537E';
const OTHERS_COLOR = '#B4B2A9';
const BAND_COLORS: Record<LoyaltyBand, string> = {
  core: '#993556',
  light: '#ED93B1',
  guest: '#B4B2A9',
  gift: '#D3D1C7',
};
/** この作家に課金していないギフトは半透明にする */
const isGiftBand = (band: LoyaltyBand) => band === 'gift';
/** ファン = コア + ライト */
const isFanBand = (band: LoyaltyBand) => band === 'core' || band === 'light';

const LEGEND_BANDS: LoyaltyBand[] = ['core', 'light', 'guest', 'gift'];

/** 顔画像が無いときに出す、名前の頭 2 文字 */
const initialsOf = (name: string) => Array.from(name.trim()).slice(0, 2).join('');

const truncate = (label: string, max: number) =>
  label.length > max ? `${label.slice(0, max - 1)}…` : label;

// ---- レイアウト ----

interface PlacedHub extends InflowHub {
  x: number;
  y: number;
  r: number;
}

interface PlacedOwner extends InflowOwner {
  x: number;
  y: number;
  r: number;
}

interface Layout {
  hubs: PlacedHub[];
  owners: PlacedOwner[];
  /** 流入線の太さの基準（中央を除く描くハブの最大流入額） */
  maxFlow: number;
  viewBox: ViewBox;
}

/**
 * 中央ハブを原点に、周りのハブを円周上（12 時から時計回り）に固定し、
 * オーナーはぶら下げる先のハブへ引き寄せて重なりを解消する。
 * 初期位置は乱数を使わず決めるので、毎回同じ配置になる。
 */
function computeLayout(inflow: CreatorInflow): Layout {
  const drawn = inflow.drawnHubs;
  const slot = new Map(drawn.map((h, i) => [h.index, i]));
  const hubs: PlacedHub[] = drawn.map(h => ({ ...h, x: 0, y: 0, r: hubRadiusOf(h) }));
  const source = inflow.owners;
  const hubOf = (owner: InflowOwner) => slot.get(owner.hubIndex) ?? 0;

  // ハブごとの塊の大きさから、円周上の間隔を決める
  const area = new Array(hubs.length).fill(0);
  for (const owner of source) {
    const er = ownerRadiusOf(owner.spend) + 1.5;
    area[hubOf(owner)] += Math.PI * er * er;
  }
  const PACKING = 0.7;
  const clusterR = area.map((a, i) => Math.sqrt(a / Math.PI / PACKING) + hubs[i].r + 8);

  const outer = hubs.length - 1;
  if (outer > 0) {
    const GAP = 36;
    const arcs = clusterR.slice(1).map(r => 2 * r + GAP);
    const total = arcs.reduce((a, b) => a + b, 0);
    const ring = Math.max(
      total / (Math.PI * 2),
      clusterR[0] + Math.max(...clusterR.slice(1)) + GAP,
      140
    );
    let acc = 0;
    arcs.forEach((arc, k) => {
      // 12 時の位置から時計回り（SVG は y が下向きなので角度を増やす向き）
      const a = -Math.PI / 2 + ((acc + arc / 2) / total) * Math.PI * 2;
      acc += arc;
      hubs[k + 1].x = Math.cos(a) * ring;
      hubs[k + 1].y = Math.sin(a) * ring;
    });
  }

  const n = source.length;
  const xs = new Float64Array(n), ys = new Float64Array(n);
  const vx = new Float64Array(n), vy = new Float64Array(n);
  const ers = new Float64Array(n);
  const home = new Int32Array(n);
  const countOnHub = new Array(hubs.length).fill(0);

  source.forEach((owner, i) => {
    const h = hubOf(owner);
    home[i] = h;
    ers[i] = ownerRadiusOf(owner.spend) + 1.5;
    // 支払額の多い順に、ハブの近くから黄金角のらせんで並べる
    const j = countOnHub[h]++;
    const rr = hubs[h].r + 6 + 9 * Math.sqrt(j + 0.5);
    xs[i] = hubs[h].x + Math.cos(j * 2.39996) * rr;
    ys[i] = hubs[h].y + Math.sin(j * 2.39996) * rr;
  });

  const maxEr = n > 0 ? Math.max(...Array.from(ers)) : 1;
  const cell = maxEr * 2;
  const TICKS = 260;

  for (let tick = 0; tick < TICKS; tick++) {
    const alpha = 1 - tick / TICKS;

    // ぶら下げる先のハブへ引き寄せる
    for (let i = 0; i < n; i++) {
      const h = hubs[home[i]];
      vx[i] += (h.x - xs[i]) * 0.02 * alpha;
      vy[i] += (h.y - ys[i]) * 0.02 * alpha;
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

    // ハブ（固定）とは重ならないように外へ押し出す。
    // ぶら下げる先とは少し間を空ける（リンク長: 周り 22 + r、中央 34 + r 程度）
    for (let i = 0; i < n; i++) {
      hubs.forEach((h, k) => {
        const dx = xs[i] - h.x, dy = ys[i] - h.y;
        const dist = Math.hypot(dx, dy);
        const min = h.r + ers[i] + (k === home[i] ? 6 : 3);
        if (dist >= min) return;
        const ux = dist < 1e-6 ? Math.cos(i) : dx / dist;
        const uy = dist < 1e-6 ? Math.sin(i) : dy / dist;
        xs[i] = h.x + ux * min;
        ys[i] = h.y + uy * min;
      });
    }
  }

  const owners: PlacedOwner[] = source.map((owner, i) => ({
    ...owner,
    x: xs[i],
    y: ys[i],
    r: ownerRadiusOf(owner.spend),
  }));

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const extend = (x0: number, y0: number, x1: number, y1: number) => {
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  };
  // 名前はハブの下に出すので、そのぶん広めに取る
  for (const h of hubs) extend(h.x - h.r - 50, h.y - h.r, h.x + h.r + 50, h.y + h.r + 22);
  owners.forEach((o, i) => extend(o.x - ers[i], o.y - ers[i], o.x + ers[i], o.y + ers[i]));
  const PAD = 16;

  return {
    hubs,
    owners,
    maxFlow: Math.max(0, ...hubs.slice(1).map(h => h.flow)),
    viewBox: {
      x: minX - PAD,
      y: minY - PAD,
      w: maxX - minX + PAD * 2,
      h: maxY - minY + PAD * 2,
    },
  };
}

// ---- 表示 ----

const formatXrp = (value: number) =>
  value.toLocaleString(undefined, { maximumFractionDigits: 1 });

/** 凡例の 1 項目（見出し → 図 → 説明） */
const LegendItem: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="flex flex-col items-start gap-1.5 min-w-0">
    <div className="text-sm font-medium">{title}</div>
    {children}
  </div>
);

const LegendCaption: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-xs text-muted-foreground max-w-[12rem]">{children}</div>
);

const AVATAR_SIZES = {
  md: { box: 'h-10 w-10', text: 'text-sm', others: 'text-[10px]' },
  sm: { box: 'h-7 w-7', text: 'text-[10px]', others: 'text-[8px]' },
  xs: { box: 'h-5 w-5', text: 'text-[8px]', others: 'text-[6px]' },
};

/** パネル・ツールチップ用のハブのアイコン（図のハブと同じく、画像が無ければ名前の頭 2 文字） */
const HubAvatar: React.FC<{
  hub: InflowHub;
  broken: boolean;
  othersLabel: string;
  size?: keyof typeof AVATAR_SIZES;
}> = ({ hub, broken, othersLabel, size = 'md' }) => {
  const [error, setError] = useState(false);
  const face = hub.face && !broken && !error ? hub.face : null;
  const { box, text, others } = AVATAR_SIZES[size];
  if (hub.isOthers) {
    return (
      <span
        className={`flex ${box} shrink-0 items-center justify-center rounded-full ${others} text-[#2C2C2A]`}
        style={{ background: OTHERS_COLOR }}
      >
        {othersLabel}
      </span>
    );
  }
  if (face) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={faceImageUrl(face)}
        alt={hub.name}
        onError={() => {
          setError(true);
          requestFaceCache(face);
        }}
        className={`${box} shrink-0 rounded-full border object-cover`}
      />
    );
  }
  return (
    <span className={`flex ${box} shrink-0 items-center justify-center rounded-full border bg-muted ${text}`}>
      {initialsOf(hub.name)}
    </span>
  );
};

type Hover =
  | { kind: 'owner'; index: number; x: number; y: number }
  | { kind: 'hub'; index: number; x: number; y: number };

/** クリックして拡大表示しているもの（owner の index は layout.owners の添字） */
type Focus = { kind: 'owner' | 'hub'; index: number };

const CommunityInflowNetwork: React.FC<CommunityInflowNetworkProps> = ({ lang, issuer }) => {
  const router = useRouter();
  const { status, inflow } = useCreatorInflow(issuer);
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [fansOnly, setFansOnly] = useState(false);
  const [creatorsOnly, setCreatorsOnly] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [brokenFaces, setBrokenFaces] = useState<Set<string>>(new Set());
  const [opening, setOpening] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [focus, setFocus] = useState<Focus | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => () => cancelViewAnimation(animRef), []);

  // ツールチップが図の外に見切れないよう、実際の大きさを測って置き場所を決める
  useLayoutEffect(() => {
    const tip = tooltipRef.current;
    const box = containerRef.current;
    if (!hover || !tip || !box) return;
    const MARGIN = 4, OFFSET = 12;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const cw = box.clientWidth, ch = box.clientHeight;
    let x = hover.x + OFFSET;
    if (x + w > cw - MARGIN) x = hover.x - OFFSET - w;
    let y = hover.y + OFFSET;
    if (y + h > ch - MARGIN) y = hover.y - OFFSET - h;
    x = Math.max(MARGIN, Math.min(x, cw - w - MARGIN));
    y = Math.max(MARGIN, Math.min(y, ch - h - MARGIN));
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }, [hover]);
  // 拡大表示（null = 全体表示）
  const [view, setView] = useState<View | null>(null);
  const dragRef = useRef<{ x: number; y: number; view: View } | null>(null);
  const [dragging, setDragging] = useState(false);

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

  const layout = useMemo(() => (inflow ? computeLayout(inflow) : null), [inflow]);

  // データが変わると図の大きさが変わるので、全体表示に戻す
  useEffect(() => {
    setView(null);
    setHover(null);
    setFocus(null);
  }, [layout]);

  const hubBySlot = useMemo(
    () => new Map((layout?.hubs ?? []).map(h => [h.index, h])),
    [layout]
  );

  // オーナーとハブを結ぶ線はまとめて 1 本の path にする
  const ownerEdgesPath = useMemo(() => {
    if (!layout) return '';
    let d = '';
    for (const o of layout.owners) {
      const h = hubBySlot.get(o.hubIndex) ?? layout.hubs[0];
      d += `M${o.x.toFixed(1)} ${o.y.toFixed(1)}L${h.x.toFixed(1)} ${h.y.toFixed(1)}`;
    }
    return d;
  }, [layout, hubBySlot]);

  const pointerAt = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    return rect ? { x: e.clientX - rect.left, y: e.clientY - rect.top } : { x: 0, y: 0 };
  };

  // アプリには作家単位のページが無いので、その作家の代表シリーズのコレクションを開く
  const openCreator = async (hub: InflowHub) => {
    if (!hub.issuer || opening) return;
    setOpening(hub.issuer);
    try {
      const plant = await loadPlant(hub.issuer);
      const series = plant?.hubs ?? [];
      const pick = series.find(s => s.name === hub.name) ?? _.maxBy(series, 'spend');
      if (pick) {
        router.push(collectionPath(lang, { issuer: hub.issuer, taxon: String(pick.taxon) }, 'community'));
        return;
      }
    } catch (error) {
      console.error('Failed to resolve creator collection:', error);
    }
    setOpening(null);
  };

  if (!dict) return null;

  const { community } = dict.project.detail;

  const bandLabel = (band: LoyaltyBand) => community.bands[band];
  const hubLabel = (h: InflowHub) => (h.isOthers ? community.hub.others : h.name);

  const checkboxes: [string, string, boolean, (v: boolean) => void][] = [
    ['communityFansOnly', community.actions.fansOnly, fansOnly, setFansOnly],
    ['communityCreatorsOnly', community.actions.creatorsOnly, creatorsOnly, setCreatorsOnly],
  ];

  // 操作・凡例は読み込み中も出したままにして、図の場所だけを差し替える
  const aside = (
    <aside className="space-y-4 lg:w-56 lg:shrink-0">
      <div className="flex flex-col sm:flex-row lg:flex-col justify-between items-start sm:items-center lg:items-start gap-3">
        <div className="flex flex-wrap lg:flex-col items-center lg:items-start gap-x-4 gap-y-2">
          {checkboxes.map(([id, label, checked, onChange]) => (
            <div key={id} className="flex items-center space-x-2">
              <Checkbox id={id} checked={checked} onCheckedChange={v => onChange(v as boolean)} />
              <label htmlFor={id} className="text-sm">{label}</label>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {inflow && layout && (
            <div className="text-sm text-gray-500">
              {community.status.showing
                .replace('{owners}', inflow.owners.length.toLocaleString())
                .replace('{hubs}', (layout.hubs.length - 1).toLocaleString())}
            </div>
          )}
          <HelpPopover
            label={community.legend.toggle}
            description={community.description}
            items={[
              [community.legend.centerLabel, community.legend.center],
              [community.legend.hubLabel, community.legend.hub],
              [community.legend.othersLabel, community.legend.others],
              [community.legend.flowLabel, community.legend.flow],
              [community.legend.sizeLabel, community.legend.size],
              [community.legend.colorLabel, community.legend.color],
              [community.legend.creatorLabel, community.legend.creator],
            ]}
            note={community.legend.note}
          />
        </div>
      </div>

      {/* 凡例（常に表示） */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-md border bg-muted/30 p-3 sm:flex sm:flex-wrap sm:items-start sm:gap-x-8 lg:flex-col lg:flex-nowrap">
        <LegendItem title={community.legend.colorLabel}>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {LEGEND_BANDS.map(band => (
              <span key={band} className="flex items-center gap-1 text-xs">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ background: BAND_COLORS[band], opacity: isGiftBand(band) ? 0.5 : 1 }}
                />
                {bandLabel(band)}
              </span>
            ))}
          </div>
          <LegendCaption>{community.tooltip.loyalty}</LegendCaption>
        </LegendItem>

        <LegendItem title={community.legend.sizeLabel}>
          <div className="flex items-end gap-3">
            {[10, 100, 1000].map(v => {
              const r = ownerRadiusOf(v);
              return (
                <div key={v} className="flex flex-col items-center gap-0.5">
                  <svg width={r * 2 + 2} height={r * 2 + 2} aria-hidden>
                    <circle cx={r + 1} cy={r + 1} r={r} fill={BAND_COLORS.light} />
                  </svg>
                  <span className="text-xs text-muted-foreground tabular-nums">{v.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
          <LegendCaption>{community.tooltip.spend} (XRP)</LegendCaption>
        </LegendItem>

        <LegendItem title={community.legend.flowLabel}>
          <svg width={64} height={24} aria-hidden>
            <line x1={2} y1={6} x2={62} y2={6} stroke={FLOW_COLOR} strokeOpacity={0.5} strokeWidth={1.5} />
            <line x1={2} y1={17} x2={62} y2={17} stroke={FLOW_COLOR} strokeOpacity={0.5} strokeWidth={8} />
          </svg>
          <LegendCaption>{community.tooltip.flow}</LegendCaption>
        </LegendItem>

        <LegendItem title={community.legend.creatorLabel}>
          <svg width={20} height={20} aria-hidden>
            <circle cx={10} cy={10} r={7} fill={BAND_COLORS.light} stroke="currentColor" strokeWidth={2} />
          </svg>
          <LegendCaption>{community.tooltip.creator}</LegendCaption>
        </LegendItem>
      </div>
    </aside>
  );

  // PC では操作・凡例を左の列に縦に並べ、図を縦スクロールなしで見られるようにする
  const shell = (content: React.ReactNode) => (
    <div className="space-y-4 lg:flex lg:items-start lg:gap-4 lg:space-y-0">
      {aside}
      <div className="min-w-0 flex-1 space-y-2">{content}</div>
    </div>
  );

  // 読み込み中などは、図と同じ場所に枠だけ出す
  const placeholder = (children: React.ReactNode) => (
    <div className="flex h-64 items-center justify-center gap-2 rounded-md border text-sm text-gray-500">
      {children}
    </div>
  );

  if (status === 'loading') {
    return shell(placeholder(
      <>
        <Loader2 className="h-4 w-4 animate-spin" />
        {community.status.loading}
      </>
    ));
  }

  if (status === 'error') {
    return shell(
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{community.errors.loadFailed}</AlertDescription>
      </Alert>
    );
  }

  if (!inflow || !layout || inflow.owners.length === 0) {
    return shell(placeholder(community.status.noData));
  }

  const hoveredOwner = hover?.kind === 'owner' ? layout.owners[hover.index] : null;
  const homeAvatar = (o: InflowOwner) => {
    const home = inflow.hubs[o.homeIndex];
    return home ? (
      <HubAvatar
        key={home.index}
        hub={home}
        broken={!!home.face && brokenFaces.has(home.face)}
        othersLabel={community.hub.others}
        size="xs"
      />
    ) : null;
  };
  const hoveredHub = hover?.kind === 'hub' ? hubBySlot.get(hover.index) ?? null : null;
  const hoveredGroup = hoveredOwner ? groupOf(hoveredOwner.address) : null;
  const focusedHub = focus?.kind === 'hub' ? hubBySlot.get(focus.index) ?? null : null;
  const focusedOwner = focus?.kind === 'owner' ? layout.owners[focus.index] ?? null : null;
  const focusedOwnerHub = focusedOwner ? hubBySlot.get(focusedOwner.hubIndex) ?? null : null;
  const focusedGroup = focusedOwner ? groupOf(focusedOwner.address) : null;
  // カーソルを合わせたハブ、なければ拡大中のハブ（オーナーならそのぶら下がり先）のオーナー以外を薄くする
  const spotlightHub = hoveredHub ?? focusedHub ?? focusedOwnerHub;

  const ownerOpacity = (o: PlacedOwner) => {
    const dimmed =
      (fansOnly && !isFanBand(o.band)) ||
      (creatorsOnly && !o.isCreator) ||
      (spotlightHub !== null && o.hubIndex !== spotlightHub.index);
    if (dimmed) return 0.15;
    return isGiftBand(o.band) ? 0.5 : 1;
  };

  const { viewBox } = layout;
  const current: View = view ?? {
    k: 1,
    cx: viewBox.x + viewBox.w / 2,
    cy: viewBox.y + viewBox.h / 2,
  };
  const visible = {
    w: viewBox.w / current.k,
    h: viewBox.h / current.k,
  };
  const zoomBy = (factor: number) => {
    const next = clampView({ ...current, k: current.k * factor }, viewBox);
    setView(next.k === 1 ? null : next);
    setHover(null);
  };

  // 表示範囲をなめらかに動かす（target が null なら全体表示）
  const animateTo = (target: View | null) => animateView(animRef, current, target, viewBox, setView);

  // 指定した範囲が収まるように拡大する
  const zoomToBox = (x0: number, y0: number, x1: number, y1: number) => {
    setHover(null);
    animateTo(fitView(viewBox, x0, y0, x1, y1));
  };

  // ハブと、そこにぶら下がるオーナーが収まるように拡大する
  const focusHub = (h: PlacedHub) => {
    let x0 = h.x - h.r, y0 = h.y - h.r, x1 = h.x + h.r, y1 = h.y + h.r + 22;
    for (const o of layout.owners) {
      if (o.hubIndex !== h.index) continue;
      x0 = Math.min(x0, o.x - o.r);
      y0 = Math.min(y0, o.y - o.r);
      x1 = Math.max(x1, o.x + o.r);
      y1 = Math.max(y1, o.y + o.r);
    }
    setFocus({ kind: 'hub', index: h.index });
    zoomToBox(x0, y0, x1, y1);
  };

  // オーナーとその周り（大きさに応じた範囲）が見えるように拡大する
  const focusOwner = (index: number) => {
    const o = layout.owners[index];
    const half = Math.max(60, o.r * 3);
    setFocus({ kind: 'owner', index });
    zoomToBox(o.x - half, o.y - half, o.x + half, o.y + half);
  };

  const closeFocus = () => {
    setFocus(null);
    animateTo(null);
  };

  // 拡大中はマウスのドラッグで表示位置を動かす（タッチはページのスクロールに使うので動かさない）
  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // 何もない場所をクリック・タップしたらツールチップを消す
    setHover(null);
    if (e.pointerType !== 'mouse' || current.k <= 1) return;
    cancelViewAnimation(animRef);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, view: current };
    setDragging(true);
  };
  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    const width = svgRef.current?.clientWidth;
    if (!drag || !width) return;
    const unit = visible.w / width;
    setView(
      clampView(
        {
          k: drag.view.k,
          cx: drag.view.cx - (e.clientX - drag.x) * unit,
          cy: drag.view.cy - (e.clientY - drag.y) * unit,
        },
        viewBox
      )
    );
  };
  const endDrag = () => {
    dragRef.current = null;
    setDragging(false);
  };

  const center = layout.hubs[0];

  return shell(
    <div
      ref={containerRef}
      className="relative rounded-md border bg-background overflow-hidden touch-pan-y select-none"
      onPointerLeave={() => setHover(null)}
    >
      <svg
        ref={svgRef}
        viewBox={`${current.cx - visible.w / 2} ${current.cy - visible.h / 2} ${visible.w} ${visible.h}`}
        className={`block w-full h-auto max-h-[80vh] lg:max-h-[calc(100vh-14rem)] text-foreground ${
          dragging ? 'cursor-grabbing' : current.k > 1 ? 'cursor-grab' : ''
        }`}
        role="img"
        onPointerDown={handleSvgPointerDown}
        // ドラッグで文字が選択されたり、選択に引きずられてページがスクロールしたりしないようにする
        onMouseDown={e => e.preventDefault()}
        onPointerMove={handleSvgPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-label={community.title}
      >
        <defs>
          {layout.hubs.map(h => (
            <clipPath key={h.index} id={`community-hub-${h.index}`}>
              <circle cx={h.x} cy={h.y} r={h.r - 2} />
            </clipPath>
          ))}
        </defs>

        {/* 流入線（中央 → 周りのハブ） */}
        <g stroke={FLOW_COLOR} strokeLinecap="round" opacity={0.3}>
          {layout.hubs.slice(1).map(h => (
            <line
              key={h.index}
              x1={center.x}
              y1={center.y}
              x2={h.x}
              y2={h.y}
              strokeWidth={flowWidthOf(h.flow, layout.maxFlow)}
            />
          ))}
        </g>

        {/* オーナーとハブを結ぶ線 */}
        <path
          d={ownerEdgesPath}
          stroke="currentColor"
          strokeWidth={0.5}
          opacity={hoveredOwner || hoveredHub ? 0.08 : 0.25}
          fill="none"
        />
        {focusedOwner && focusedOwnerHub && (
          <line
            x1={focusedOwner.x}
            y1={focusedOwner.y}
            x2={focusedOwnerHub.x}
            y2={focusedOwnerHub.y}
            stroke="currentColor"
            strokeWidth={1.5 / current.k}
            opacity={0.6}
          />
        )}

        {/* オーナー（支払額の多い順に描き、小さいものを上に重ねる） */}
        <g>
          {layout.owners.map((o, i) => (
            <circle
              key={o.address}
              cx={o.x}
              cy={o.y}
              r={o.r}
              fill={BAND_COLORS[o.band]}
              opacity={ownerOpacity(o)}
              // 作家オーナーは縁取りで区別する（背景色に溶けないよう前景色にする）
              stroke={o.isCreator || hoveredOwner === o || focusedOwner === o ? 'currentColor' : 'hsl(var(--background))'}
              strokeWidth={focusedOwner === o ? 3 : o.isCreator || hoveredOwner === o ? 2 : 0.8}
              className="cursor-pointer"
              onPointerEnter={e => setHover({ kind: 'owner', index: i, ...pointerAt(e) })}
              onPointerMove={e => setHover({ kind: 'owner', index: i, ...pointerAt(e) })}
              onPointerDown={e => {
                e.stopPropagation();
                setHover({ kind: 'owner', index: i, ...pointerAt(e) });
              }}
              onClick={() => focusOwner(i)}
            />
          ))}
        </g>

        {/* ハブ */}
        <g>
          {layout.hubs.map(h => {
            const isCenter = h.index === 0;
            const face = h.face && !brokenFaces.has(h.face) ? h.face : null;
            const isFocused = focus?.kind === 'hub' && focus.index === h.index;
            const label = hubLabel(h);
            return (
              <g
                key={h.index}
                className="cursor-pointer"
                onPointerEnter={e => setHover({ kind: 'hub', index: h.index, ...pointerAt(e) })}
                onPointerMove={e => setHover({ kind: 'hub', index: h.index, ...pointerAt(e) })}
                onPointerDown={e => {
                  e.stopPropagation();
                  setHover({ kind: 'hub', index: h.index, ...pointerAt(e) });
                }}
                // クリックしたら拡大して、移動するかどうかはパネルのボタンで決めてもらう
                onClick={() => focusHub(h)}
              >
                <circle
                  cx={h.x}
                  cy={h.y}
                  r={h.r}
                  fill={h.isOthers ? OTHERS_COLOR : 'hsl(var(--muted))'}
                  stroke={isCenter || isFocused ? 'hsl(var(--primary))' : h.isOthers ? 'none' : FLOW_COLOR}
                  strokeWidth={isCenter || isFocused ? 3 : 1.5}
                />
                {h.isOthers ? (
                  <text
                    x={h.x}
                    y={h.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={10}
                    fill="#2C2C2A"
                  >
                    {community.hub.others}
                  </text>
                ) : face ? (
                  <image
                    href={faceImageUrl(face)}
                    x={h.x - h.r + 2}
                    y={h.y - h.r + 2}
                    width={(h.r - 2) * 2}
                    height={(h.r - 2) * 2}
                    preserveAspectRatio="xMidYMid slice"
                    clipPath={`url(#community-hub-${h.index})`}
                    onError={() => {
                      setBrokenFaces(prev => new Set(prev).add(face));
                      requestFaceCache(face); // 次回のために生成を依頼しておく
                    }}
                  />
                ) : (
                  <text
                    x={h.x}
                    y={h.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={isCenter ? 14 : 10}
                    fill="currentColor"
                  >
                    {initialsOf(h.name)}
                  </text>
                )}
                {/* 名前はぶら下がるオーナーに重なるので、クリックして拡大している間は出さない。
                    ボタンで拡大したときも文字は大きくせず、画面上で同じ大きさに保つ */}
                {focus === null && (
                  <text
                    x={h.x}
                    y={h.y + h.r + 13 / current.k}
                    textAnchor="middle"
                    fontSize={(isCenter ? 12 : 11) / current.k}
                    fontWeight={isCenter ? 700 : 500}
                    fill="currentColor"
                    stroke="hsl(var(--background))"
                    strokeWidth={3 / current.k}
                    paintOrder="stroke"
                  >
                    {h.isOthers
                      ? community.hub.members.replace('{count}', h.members.toLocaleString())
                      : truncate(label, isCenter ? 24 : 14)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-md border bg-background/90 shadow-sm">
        {([
          [ZoomIn, community.actions.zoomIn, () => zoomBy(ZOOM_STEP), current.k >= ZOOM_MAX],
          [ZoomOut, community.actions.zoomOut, () => zoomBy(1 / ZOOM_STEP), current.k <= 1],
          [Maximize, community.actions.zoomReset, closeFocus, current.k <= 1 && focus === null],
        ] as const).map(([Icon, label, onClick, disabled]) => (
          <Button
            key={label}
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-none"
            onClick={onClick}
            disabled={disabled}
            title={label}
            aria-label={label}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
      </div>

      {focusedHub && (
        <div className="absolute left-2 top-2 z-10 w-64 max-w-[calc(100%-3.5rem)] space-y-2 rounded-md border bg-background/95 p-3 text-sm shadow-md">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <HubAvatar
                key={focusedHub.index}
                hub={focusedHub}
                broken={!!focusedHub.face && brokenFaces.has(focusedHub.face)}
                othersLabel={community.hub.others}
              />
              <div className="min-w-0 break-words font-medium">{hubLabel(focusedHub)}</div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-1 -mt-1 h-6 w-6 shrink-0"
              onClick={closeFocus}
              title={community.actions.closeFocus}
              aria-label={community.actions.closeFocus}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <div>{community.tooltip.members}: {focusedHub.members.toLocaleString()}</div>
            <div>{community.tooltip.flow}: {formatXrp(focusedHub.flow)} XRP</div>
          </div>
          {focusedHub.issuer && focusedHub.index !== 0 && (
            <Button
              size="sm"
              className="w-full"
              onClick={() => void openCreator(focusedHub)}
              disabled={opening !== null}
            >
              {opening === focusedHub.issuer
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <ArrowRight className="mr-2 h-4 w-4" />}
              {community.actions.openCreator}
            </Button>
          )}
        </div>
      )}

      {focusedOwner && (
        <div className="absolute left-2 top-2 z-10 w-64 max-w-[calc(100%-3.5rem)] space-y-2 rounded-md border bg-background/95 p-3 text-sm shadow-md">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="inline-block h-4 w-4 shrink-0 rounded-full"
                style={{ background: BAND_COLORS[focusedOwner.band] }}
                aria-hidden
              />
              <div className="min-w-0" title={focusedOwner.address}>
                {focusedGroup?.name && <div className="break-words font-medium">{focusedGroup.name}</div>}
                <div className={`font-mono ${focusedGroup?.name ? 'text-xs text-muted-foreground' : 'font-medium'}`}>
                  {`${focusedOwner.address.slice(0, 6)}...${focusedOwner.address.slice(-4)}`}
                </div>
              </div>
              {focusedOwner.isCreator && (
                <span className="shrink-0 rounded border px-1 text-[10px] font-medium">{community.tooltip.creator}</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="-mr-1 -mt-1 h-6 w-6 shrink-0"
              onClick={closeFocus}
              title={community.actions.closeFocus}
              aria-label={community.actions.closeFocus}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-0.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              {community.tooltip.home}:
              {homeAvatar(focusedOwner)}
              <span className="min-w-0 break-words">{focusedOwner.homeName}</span>
            </div>
            <div>{community.tooltip.spend}: {formatXrp(focusedOwner.spend)} XRP</div>
            <div>
              {community.tooltip.loyalty}:{' '}
              {focusedOwner.loyalty === null ? '-' : `${focusedOwner.loyalty.toFixed(1)}%`}
              {' / '}{bandLabel(focusedOwner.band)}
            </div>
          </div>
          <NFTSiteWalletIcons wallet={focusedOwner.address} issuer={issuer} />
          {focusedOwnerHub && (
            <Button size="sm" variant="outline" className="w-full" onClick={() => focusHub(focusedOwnerHub)}>
              {community.actions.showHome}
            </Button>
          )}
        </div>
      )}

      {hover && (hoveredOwner || hoveredHub) && (
        <div
          ref={tooltipRef}
          className="pointer-events-none absolute left-0 top-0 z-10 max-w-[260px] rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
        >
          {hoveredOwner && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {hoveredGroup?.name ? (
                  <span className="font-medium break-words">{hoveredGroup.name}</span>
                ) : (
                  <span className="font-mono font-medium">{hoveredOwner.address.slice(0, 6)}…</span>
                )}
                {hoveredOwner.isCreator && (
                  <span className="rounded border px-1 text-[10px] font-medium">{community.tooltip.creator}</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {community.tooltip.home}:
                {homeAvatar(hoveredOwner)}
                <span className="min-w-0 break-words">{hoveredOwner.homeName}</span>
              </div>
              <div>{community.tooltip.spend}: {formatXrp(hoveredOwner.spend)} XRP</div>
              <div className="flex items-center gap-1.5">
                {community.tooltip.loyalty}:{' '}
                {hoveredOwner.loyalty === null ? '-' : `${hoveredOwner.loyalty.toFixed(1)}%`}
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: BAND_COLORS[hoveredOwner.band] }}
                />
                {bandLabel(hoveredOwner.band)}
              </div>
            </div>
          )}
          {hoveredHub && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <HubAvatar
                  key={hoveredHub.index}
                  hub={hoveredHub}
                  broken={!!hoveredHub.face && brokenFaces.has(hoveredHub.face)}
                  othersLabel={community.hub.others}
                  size="sm"
                />
                <div className="min-w-0 font-medium break-words">{hubLabel(hoveredHub)}</div>
              </div>
              <div>{community.tooltip.members}: {hoveredHub.members.toLocaleString()}</div>
              <div>{community.tooltip.flow}: {formatXrp(hoveredHub.flow)} XRP</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CommunityInflowNetwork;
