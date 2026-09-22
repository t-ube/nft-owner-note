// ネットワーク図（エコシステム・コミュニティ）で共通の、拡大・移動の計算

export const ZOOM_MAX = 8;
export const ZOOM_STEP = 1.5;

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 拡大率と、表示範囲の中心（レイアウト座標） */
export interface View {
  k: number;
  cx: number;
  cy: number;
}

/** 拡大した表示範囲が図の外にはみ出さないように中心を寄せる */
export function clampView(view: View, vb: ViewBox): View {
  const k = Math.min(ZOOM_MAX, Math.max(1, view.k));
  const w = vb.w / k, h = vb.h / k;
  return {
    k,
    cx: Math.min(vb.x + vb.w - w / 2, Math.max(vb.x + w / 2, view.cx)),
    cy: Math.min(vb.y + vb.h - h / 2, Math.max(vb.y + h / 2, view.cy)),
  };
}

/** 範囲（レイアウト座標）が収まるように拡大した表示。全体表示と変わらなければ null */
export function fitView(vb: ViewBox, x0: number, y0: number, x1: number, y1: number, pad = 24): View | null {
  const k = Math.min(vb.w / (x1 - x0 + pad * 2), vb.h / (y1 - y0 + pad * 2));
  const next = clampView({ k, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }, vb);
  return next.k <= 1 ? null : next;
}

/** 動かしている最中のアニメーションを止める */
export function cancelViewAnimation(ref: { current: number | null }) {
  if (ref.current !== null) cancelAnimationFrame(ref.current);
  ref.current = null;
}

/** 表示範囲を from から target（null なら全体表示）へなめらかに動かす */
export function animateView(
  ref: { current: number | null },
  from: View,
  target: View | null,
  vb: ViewBox,
  setView: (view: View | null) => void
) {
  cancelViewAnimation(ref);
  const to = target ?? { k: 1, cx: vb.x + vb.w / 2, cy: vb.y + vb.h / 2 };
  const start = performance.now();
  const DURATION = 350;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / DURATION);
    if (t >= 1) {
      ref.current = null;
      setView(target);
      return;
    }
    const e = 1 - Math.pow(1 - t, 3);
    // 拡大率は対数で補間すると、拡大の速さが一定に見える
    const k = Math.exp(Math.log(from.k) + (Math.log(to.k) - Math.log(from.k)) * e);
    setView(clampView({ k, cx: from.cx + (to.cx - from.cx) * e, cy: from.cy + (to.cy - from.cy) * e }, vb));
    ref.current = requestAnimationFrame(step);
  };
  ref.current = requestAnimationFrame(step);
}
