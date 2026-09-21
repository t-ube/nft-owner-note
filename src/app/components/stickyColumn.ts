// 表を横スクロールしても左端の列を固定するためのクラス。
// Tailwind がクラス名を拾えるよう、すべて文字列リテラルで書く。

/** 固定する列。下の列が透けないよう背景を塗り、右端に境界線を付ける */
export const STICKY_COL =
  'sticky left-0 z-10 bg-background shadow-[inset_-1px_0_0_hsl(var(--border))]';

/** 行のホバー色（muted/50）を、不透明な背景の上に重ねて再現する。行に group クラスが必要 */
export const STICKY_ROW_HOVER =
  'group-hover:[background:linear-gradient(hsl(var(--muted)/0.5),hsl(var(--muted)/0.5)),hsl(var(--background))]';