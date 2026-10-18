import { cloneBrush, PRESETS, type BrushSettings } from './brush';

/** Brush library categories (Procreate Dreams style). "Mine" holds the brushes you saved. */
export type BrushCategory = 'sketch' | 'ink' | 'paint' | 'mine';

export const CATEGORIES: { id: BrushCategory; label: string }[] = [
  { id: 'sketch', label: '✏️ Sketching' },
  { id: 'ink', label: '🖋️ Inking' },
  { id: 'paint', label: '🖌️ Painting' },
  { id: 'mine', label: '⭐ My brushes' },
];

/** Where each built-in brush lives. */
const BUILT_IN: Record<string, BrushCategory> = {
  Pencil: 'sketch',
  'Shading Pencil': 'sketch',
  Charcoal: 'sketch',
  Ink: 'ink',
  'Brush Pen': 'ink',
  'Fine Liner': 'ink',
  'Pixel Ink': 'ink',
  Marker: 'paint',
  'Soft Airbrush': 'paint',
};

export function categoryOf(name: string, mine: readonly BrushSettings[]): BrushCategory {
  if (mine.some((b) => b.name === name)) return 'mine';
  return BUILT_IN[name] ?? 'paint';
}

export function isBuiltIn(name: string): boolean {
  return PRESETS.some((p) => p.name === name);
}

/** A name not used by any brush yet: "Ink copy", "Ink copy 2", … */
export function uniqueName(want: string, taken: readonly string[]): string {
  const base = want.trim().slice(0, 40) || 'My brush';
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const n = `${base} ${i}`;
    if (!taken.includes(n)) return n;
  }
  return `${base} ${Date.now()}`;
}

/**
 * A saved brush read back from storage: every field the engine needs is filled from the Pencil
 * so an older or hand-edited entry never breaks drawing. Null when it is not a brush at all.
 */
export function readBrush(v: unknown): BrushSettings | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<BrushSettings>;
  if (typeof o.name !== 'string' || !o.name.trim()) return null;
  const base = cloneBrush(PRESETS[0]!);
  const out = { ...base, ...o, name: o.name.trim().slice(0, 40) } as BrushSettings;
  for (const k of Object.keys(base) as (keyof BrushSettings)[]) {
    const want = typeof base[k];
    if (typeof out[k] !== want) (out as unknown as Record<string, unknown>)[k] = base[k];
  }
  if (!Number.isFinite(out.size) || out.size <= 0) out.size = base.size;
  // an image tip must be a small image data URL; anything else falls back to the round tip
  if (out.tipImage !== undefined && !(typeof out.tipImage === 'string' && out.tipImage.startsWith('data:image/') && out.tipImage.length < 400_000)) delete out.tipImage;
  for (const k of ['hueJitter', 'satJitter', 'brightJitter', 'wetPull'] as const) {
    const v = out[k];
    if (v === undefined) continue;
    if (typeof v !== 'number' || !Number.isFinite(v)) delete out[k];
    else out[k] = Math.min(1, Math.max(0, v));
  }
  if (out.strokeColor !== undefined && typeof out.strokeColor !== 'boolean') delete out.strokeColor;
  if (out.grainImage !== undefined && !(typeof out.grainImage === 'string' && out.grainImage.startsWith('data:image/') && out.grainImage.length < 600_000)) delete out.grainImage;
  return out;
}
