/**
 * Layer effects (After Effects style): an ordered stack on a drawings layer, each aimed at the
 * layer's Line, its Fill, or the whole layer. Effects belong to the layer, not to its drawings,
 * so the drawings stay clean and one drawing can look different on different layers.
 *
 * Randomness is seeded (the effect's seed and the held frame), so playback, scrubbing, undo and
 * every export give the same pixels. `hold` makes the pattern change every N frames: line boil
 * on twos or threes, the way hand-drawn boil looks.
 */

export type EffectType = 'boil';
export type EffectTarget = 'line' | 'fill' | 'layer';

export interface LayerEffect {
  id: string;
  type: EffectType;
  on: boolean;
  target: EffectTarget;
  /** How far pixels move (boil), in document pixels. */
  amount: number;
  /** The size of the wobble (boil), in document pixels: small is jittery, large is wavy. */
  size: number;
  /** A new pattern every this many frames (1 = every frame). */
  hold: number;
  seed: number;
}

export const EFFECT_TYPES: { id: EffectType; label: string; hint: string; target: EffectTarget; amount: number; size: number; hold: number }[] = [
  { id: 'boil', label: 'Line boil', hint: 'Lines wobble like hand-drawn boil', target: 'line', amount: 1.6, size: 22, hold: 2 },
];

export const EFFECT_LIMITS = { amount: [0, 16] as const, size: [4, 160] as const, hold: [1, 8] as const };

export const TARGET_NAMES: Record<EffectTarget, string> = { line: 'Line', fill: 'Fill', layer: 'Whole layer' };

export function newEffect(type: EffectType, id: string, seed: number): LayerEffect {
  const d = EFFECT_TYPES.find((t) => t.id === type) ?? EFFECT_TYPES[0]!;
  return { id, type: d.id, on: true, target: d.target, amount: d.amount, size: d.size, hold: d.hold, seed: seed >>> 0 };
}

/** Which pattern of an effect shows at a layer frame (changes every `hold` frames). */
export function effectTick(e: LayerEffect, frame: number): number {
  return Math.floor(frame / Math.max(1, Math.round(e.hold)));
}

const clamp = (x: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, x));

/** Validate effects from a file (unknown types and bad values are dropped or clamped). */
export function readEffects(v: unknown): LayerEffect[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: LayerEffect[] = [];
  for (const raw of v.slice(0, 16)) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (!EFFECT_TYPES.some((t) => t.id === r.type)) continue;
    const num = (x: unknown, lim: readonly [number, number], d: number) => (typeof x === 'number' && Number.isFinite(x) ? clamp(x, lim) : d);
    const def = EFFECT_TYPES.find((t) => t.id === r.type)!;
    out.push({
      id: typeof r.id === 'string' && r.id.length <= 40 ? r.id : `fx${out.length + 1}`,
      type: def.id,
      on: r.on !== false,
      target: r.target === 'fill' || r.target === 'layer' ? r.target : r.target === 'line' ? 'line' : def.target,
      amount: num(r.amount, EFFECT_LIMITS.amount, def.amount),
      size: num(r.size, EFFECT_LIMITS.size, def.size),
      hold: Math.round(num(r.hold, EFFECT_LIMITS.hold, def.hold)),
      seed: typeof r.seed === 'number' && Number.isFinite(r.seed) ? r.seed >>> 0 : 1,
    });
  }
  return out.length ? out : undefined;
}

/**
 * Live preview while a slider moves (no undo step until it is let go): the effects to show for a
 * layer instead of its saved ones.
 */
export const effectPreview = new Map<string, LayerEffect[]>();

/** The effects that draw for a layer (preview first, then its own), switched-on only. */
export function activeEffects(l: { id: string; effects?: LayerEffect[] }): LayerEffect[] {
  const list = effectPreview.get(l.id) ?? l.effects ?? [];
  return list.filter((e) => e.on);
}

/** A short signature of what effects do at a frame (frame keys, caches). */
export function effectsKey(l: { id: string; effects?: LayerEffect[] }, frame: number): string {
  const fx = activeEffects(l);
  return fx.length ? fx.map((e) => `${e.type}:${e.target}:${e.amount}:${e.size}:${e.seed}:${effectTick(e, frame)}`).join(',') : '';
}
