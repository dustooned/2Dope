import type { Vec2 } from './anim';
export interface LayoutBox { x: number; y: number; w: number; h: number }
export interface LayoutItem { id: string; box: LayoutBox }
export type Alignment = 'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom';
export type Distribution = 'horizontal' | 'vertical';
export function unionBoxes(boxes: LayoutBox[]): LayoutBox {
  if (!boxes.length) throw new Error('Select artwork first.');
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y };
}
export function alignment(items: LayoutItem[], target: LayoutBox, mode: Alignment): Map<string, Vec2> {
  return new Map(items.map(({ id, box: b }) => [id, [mode === 'left' ? target.x - b.x : mode === 'right' ? target.x + target.w - b.x - b.w : mode === 'centerX' ? target.x + target.w / 2 - b.x - b.w / 2 : 0,
    mode === 'top' ? target.y - b.y : mode === 'bottom' ? target.y + target.h - b.y - b.h : mode === 'centerY' ? target.y + target.h / 2 - b.y - b.h / 2 : 0] as Vec2]));
}
/** Equal gaps between visual bounds; outermost items stay fixed. Negative gaps are allowed. */
export function distribution(items: LayoutItem[], axis: Distribution): Map<string, Vec2> {
  if (items.length < 3) throw new Error('Select at least three layers to distribute.');
  const horizontal = axis === 'horizontal', at = (b: LayoutBox) => horizontal ? b.x : b.y, size = (b: LayoutBox) => horizontal ? b.w : b.h;
  const sorted = [...items].sort((a, b) => at(a.box) - at(b.box) || a.id.localeCompare(b.id)), first = sorted[0]!.box, last = sorted.at(-1)!.box;
  const gap = (at(last) + size(last) - at(first) - sorted.reduce((n, i) => n + size(i.box), 0)) / (items.length - 1), result = new Map<string, Vec2>(); let cursor = at(first);
  for (const item of sorted) { const delta = cursor - at(item.box); result.set(item.id, horizontal ? [delta, 0] : [0, delta]); cursor += size(item.box) + gap; } return result;
}
export interface SnapPrefs { on: boolean; canvas: boolean; layers: boolean; grid: boolean; size: number }
export const DEFAULT_SNAP: SnapPrefs = { on: false, canvas: true, layers: true, grid: false, size: 16 };
export function readSnap(value: unknown): SnapPrefs { const p = value && typeof value === 'object' ? value as Partial<SnapPrefs> : {}; return { on: p.on === true, canvas: p.canvas !== false, layers: p.layers !== false, grid: p.grid === true, size: typeof p.size === 'number' && Number.isFinite(p.size) ? Math.max(1, Math.min(1024, Math.round(p.size))) : 16 }; }
export interface SnapGuide { axis: 'x' | 'y'; value: number }
/** Find one nearest edge/centre alignment per axis, in composition space. */
export function snapBox(box: LayoutBox, targets: LayoutBox[], tolerance: number, grid = 0): { delta: Vec2; guides: SnapGuide[] } {
  const delta: Vec2 = [0, 0], guides: SnapGuide[] = [];
  for (const [index, axis] of [[0, 'x'], [1, 'y']] as const) {
    const source = axis === 'x' ? [box.x, box.x + box.w / 2, box.x + box.w] : [box.y, box.y + box.h / 2, box.y + box.h];
    let best = tolerance + 1e-9, guide: number | null = null;
    const values = targets.flatMap(t => axis === 'x' ? [t.x, t.x + t.w / 2, t.x + t.w] : [t.y, t.y + t.h / 2, t.y + t.h]);
    for (const s of source) for (const t of values) { const d = t - s; if (Math.abs(d) < best) { best = Math.abs(d); delta[index] = d; guide = t; } }
    if (grid > 0) { const center = source[1]!, t = Math.round(center / grid) * grid, d = t - center; if (Math.abs(d) < best) { delta[index] = d; guide = t; } }
    if (guide !== null) guides.push({ axis, value: guide });
  }
  return { delta, guides };
}
