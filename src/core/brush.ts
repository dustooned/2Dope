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

/**
 * Shading with the side of the pencil. Past `threshold` degrees of tilt the brush blends into a
 * second, broader, softer, lighter tip that leans with the pen and shows more paper grain.
 */
export interface TiltShade {
  enabled: boolean;
  /** Tilt (degrees from upright) where shading starts; full shading 20° later. */
  threshold: number;
  /** Size multiplier at full shading. */
  size: number;
  /** Opacity multiplier at full shading. */
  opacity: number;
  /** Tip roundness at full shading (flat side of the lead). */
  roundness: number;
  /** Tip hardness at full shading. */
  hardness: number;
  /** Paper grain strength for the shaded part. */
  grain: number;
}

export interface BrushSettings {
  name: string;
  /**
   * An image tip (Procreate's shape source): a small PNG as a data URL. White (or opaque) paints,
   * black (or transparent) does not. Missing = the round tip. Raster brushes only.
   */
  tipImage?: string;
  /**
   * A grain picture (Procreate's grain source) as a small PNG data URL, tiled across the paper:
   * white lets paint through, black holds it back. Missing = the built-in paper grain.
   */
  grainImage?: string;
  /** Colour dynamics (Procreate): hue, saturation and brightness vary, 0..1 each. */
  hueJitter?: number;
  satJitter?: number;
  brightJitter?: number;
  /** The colour varies once per stroke instead of on every dab. */
  strokeColor?: boolean;
  /** Wet mix pull (Procreate): how much of the colour already on the canvas the brush picks up, 0..1. */
  wetPull?: number;
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
  tiltShade: TiltShade;
  /** Soft (anti-aliased) edges. Off = hard pixel edges, so fills lock tight to the line. Default on. */
  antiAlias?: boolean;
  /** Post-correction 0..1: smooth the stroke after the pen lifts (0 = off). */
  postSmooth?: number;
  /** Procreate-style Stabilisation 0..1: steadies fast strokes (a time-window average). */
  stabilize?: number;
  /** Motion filtering 0..1: removes hand shake. */
  motionFilter?: number;
  /** Expression 0..1: keeps some natural wobble while motion filtering. */
  expression?: number;
}

export const NO_TILT_SHADE: TiltShade = {
  enabled: false,
  threshold: 40,
  size: 3,
  opacity: 0.45,
  roundness: 0.35,
  hardness: 0.1,
  grain: 0.8,
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0 (no shading) .. 1 (full side-of-pencil shading) for a pen tilt. */
export function shadeAmount(ts: TiltShade, tiltX: number, tiltY: number): number {
  if (!ts.enabled) return 0;
  const deg = Math.min(90, Math.hypot(tiltX, tiltY));
  return smoothstep(ts.threshold, ts.threshold + 20, deg);
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
  tiltShade: { ...NO_TILT_SHADE, enabled: true },
};

export const PRESETS: BrushSettings[] = [
  base,
  {
    ...base,
    name: 'Ink',
    size: 10,
    hardness: 0.98,
    spacing: 0.05,
    flow: 1,
    sizeDyn: dyn('pressure', 0.05, 1.6),
    opacityDyn: dyn('off'),
    grain: 0,
    taperStart: 30,
    taperEnd: 40,
    smoothing: 0.45,
    postSmooth: 0.5,
    tiltShade: NO_TILT_SHADE,
  },
  {
    ...base,
    name: 'Brush Pen',
    size: 18,
    hardness: 0.98,
    spacing: 0.04,
    flow: 1,
    roundness: 0.75,
    angle: 30,
    sizeDyn: dyn('pressure', 0.02, 2.2),
    opacityDyn: dyn('off'),
    grain: 0,
    taperStart: 50,
    taperEnd: 90,
    smoothing: 0.55,
    postSmooth: 0.6,
    tiltShade: NO_TILT_SHADE,
  },
  {
    ...base,
    name: 'Fine Liner',
    size: 4,
    hardness: 0.98,
    spacing: 0.05,
    flow: 1,
    sizeDyn: dyn('pressure', 0.75, 1),
    opacityDyn: dyn('off'),
    grain: 0,
    taperStart: 6,
    taperEnd: 6,
    smoothing: 0.4,
    postSmooth: 0.4,
    tiltShade: NO_TILT_SHADE,
  },
  {
    ...base,
    name: 'Pixel Ink',
    size: 3,
    hardness: 0.98,
    spacing: 0.05,
    flow: 1,
    sizeDyn: dyn('off'),
    opacityDyn: dyn('off'),
    grain: 0,
    smoothing: 0.3,
    postSmooth: 0.3,
    antiAlias: false,
    tiltShade: NO_TILT_SHADE,
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
    tiltShade: NO_TILT_SHADE,
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
    sizeDyn: dyn('pressure', 0.5, 1),
    opacityDyn: dyn('pressure', 0.1, 1.4),
    flowDyn: dyn('off', 0, 1, 0.4),
    scatter: 0.08,
    grain: 0.75,
    grainScale: 1.2,
    smoothing: 0.1,
    tiltShade: { enabled: true, threshold: 35, size: 2.5, opacity: 0.55, roundness: 0.3, hardness: 0.05, grain: 0.9 },
  },
  {
    ...base,
    name: 'Shading Pencil',
    size: 6,
    hardness: 0.7,
    spacing: 0.1,
    flow: 0.8,
    grain: 0.5,
    grainScale: 0.5,
    tiltShade: { enabled: true, threshold: 30, size: 5, opacity: 0.35, roundness: 0.25, hardness: 0.05, grain: 0.85 },
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
    tiltShade: NO_TILT_SHADE,
  },
];

export function cloneBrush(b: BrushSettings): BrushSettings {
  return structuredClone(b);
}
