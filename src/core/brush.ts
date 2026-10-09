/**
 * Brush settings: a plain, serializable parameter bag (the native brush format is this JSON).
 * Every dynamic parameter uses the same `Dynamic` shape, so pressure, tilt and speed can drive
 * any of them (see docs/feature-deconstruction 02 and 06).
 */

export type Control = 'off' | 'pressure' | 'tilt' | 'speed';

export interface Dynamic {
  control: Control;
  /** Output when the input is 0 (0..1). */
  min: number;
  /** Response curve exponent: 1 linear, <1 soft (reaches full early), >1 firm. */
  curve: number;
  /** Random reduction per dab (0..1), seeded. */
  jitter: number;
  invert: boolean;
}

export interface BrushSettings {
  name: string;
  /** Diameter in document pixels. */
  size: number;
  /** Edge hardness 0 (soft) .. 1 (hard). */
  hardness: number;
  /** Dab spacing as a fraction of the dab diameter. */
  spacing: number;
  /** Stroke opacity ceiling (0..1). The stroke composites once at this opacity. */
  opacity: number;
  /** Per-dab coverage (0..1). Builds up within a stroke towards the opacity ceiling. */
  flow: number;
  /** Tip roundness 0.05..1 (1 = circle). */
  roundness: number;
  /** Tip angle in degrees. */
  angle: number;
  /** Rotate the tip to follow the stroke direction. */
  followDirection: boolean;
  sizeDyn: Dynamic;
  opacityDyn: Dynamic;
  flowDyn: Dynamic;
  /** Perpendicular scatter as a multiple of the dab size. */
  scatter: number;
  /** Paper grain strength 0..1 (removes coverage through a paper-aligned noise texture). */
  grain: number;
  /** Grain texture scale (1 = 256 px tile). */
  grainScale: number;
  /** Taper length at the start / end of a stroke, in document pixels. */
  taperStart: number;
  taperEnd: number;
  /** Stabilizer amount 0..1. */
  smoothing: number;
  /** Pulled-string (lazy mouse) stabilizer instead of exponential smoothing. */
  pulledString: boolean;
}

export interface InputSample {
  /** 0..1 (1 for a mouse). */
  pressure: number;
  /** 0 upright .. 1 flat. */
  tilt: number;
  /** 0 still .. 1 fast. */
  speed: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function dyn(control: Control, min = 0, curve = 1, jitter = 0, invert = false): Dynamic {
  return { control, min, curve, jitter, invert };
}

/** Evaluate a dynamic to a 0..1 multiplier. `rnd` is a seeded 0..1 value for jitter. */
export function evalDynamic(d: Dynamic, s: InputSample, rnd: number): number {
  let v = d.control === 'pressure' ? s.pressure : d.control === 'tilt' ? s.tilt : d.control === 'speed' ? s.speed : 1;
  if (d.control !== 'off') {
    if (d.invert) v = 1 - v;
    v = d.min + (1 - d.min) * Math.pow(clamp01(v), d.curve);
  }
  if (d.jitter > 0) v *= 1 - d.jitter * rnd;
  return clamp01(v);
}

const base: BrushSettings = {
  name: 'Pencil',
  size: 8,
  hardness: 0.8,
  spacing: 0.12,
  opacity: 1,
  flow: 0.9,
  roundness: 1,
  angle: 0,
  followDirection: false,
  sizeDyn: dyn('pressure', 0.25, 1.2),
  opacityDyn: dyn('pressure', 0.35, 1),
  flowDyn: dyn('off'),
  scatter: 0,
  grain: 0.35,
  grainScale: 0.6,
  taperStart: 0,
  taperEnd: 0,
  smoothing: 0.25,
  pulledString: false,
};

export const PRESETS: BrushSettings[] = [
  base,
  {
    ...base,
    name: 'Ink',
    size: 10,
    hardness: 0.95,
    spacing: 0.06,
    flow: 1,
    sizeDyn: dyn('pressure', 0.05, 1.6),
    opacityDyn: dyn('off'),
    grain: 0,
    taperStart: 30,
    taperEnd: 40,
    smoothing: 0.45,
  },
  {
    ...base,
    name: 'Marker',
    size: 28,
    hardness: 0.6,
    spacing: 0.05,
    opacity: 0.7,
    flow: 0.25,
    roundness: 0.35,
    angle: 35,
    sizeDyn: dyn('off'),
    opacityDyn: dyn('off'),
    grain: 0,
    smoothing: 0.2,
  },
  {
    ...base,
    name: 'Charcoal',
    size: 26,
    hardness: 0.35,
    spacing: 0.15,
    opacity: 0.9,
    flow: 0.5,
    roundness: 0.6,
    followDirection: true,
    sizeDyn: dyn('tilt', 0.5, 1),
    opacityDyn: dyn('pressure', 0.1, 1.4),
    flowDyn: dyn('off', 0, 1, 0.4),
    scatter: 0.08,
    grain: 0.75,
    grainScale: 1.2,
    smoothing: 0.1,
  },
  {
    ...base,
    name: 'Soft Airbrush',
    size: 90,
    hardness: 0,
    spacing: 0.1,
    opacity: 0.6,
    flow: 0.08,
    sizeDyn: dyn('off'),
    opacityDyn: dyn('off'),
    flowDyn: dyn('pressure', 0, 1.5),
    grain: 0,
    smoothing: 0.3,
  },
];

export function cloneBrush(b: BrushSettings): BrushSettings {
  return structuredClone(b);
}
