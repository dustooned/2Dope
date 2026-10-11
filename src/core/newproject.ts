/** What the New project dialog offers, as plain data so it can be tested. */

export interface Aspect {
  id: string;
  label: string;
  /** Width : height. */
  w: number;
  h: number;
}

export const ASPECTS: Aspect[] = [
  { id: '16:9', label: 'Wide', w: 16, h: 9 },
  { id: '21:9', label: 'Ultrawide', w: 21, h: 9 },
  { id: '9:16', label: 'Vertical', w: 9, h: 16 },
  { id: '1:1', label: 'Square', w: 1, h: 1 },
  { id: '4:3', label: 'Classic', w: 4, h: 3 },
];

/** Resolution tiers by the SHORT side (720p = 1280×720 in wide, 720×1280 in vertical). */
export const TIERS = [720, 1080, 1440] as const;
export type Tier = (typeof TIERS)[number];

export const MIN_SIDE = 64;
export const MAX_SIDE = 4096;

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function clampSide(n: number): number {
  return Math.min(MAX_SIDE, Math.max(MIN_SIDE, Math.round(n)));
}

/** Page size for an aspect ratio at a tier (always even numbers). */
export function sizeFor(aspect: { w: number; h: number }, tier: number): { width: number; height: number } {
  const short = Math.min(aspect.w, aspect.h);
  const k = tier / short;
  return { width: clampSide(even(aspect.w * k)), height: clampSide(even(aspect.h * k)) };
}

/** Scale a page down (keeping its shape, even sides) so it has at most `maxPixels` pixels. */
export function fitPixels(width: number, height: number, maxPixels: number): { width: number; height: number } {
  if (width * height <= maxPixels) return { width, height };
  const k = Math.sqrt(maxPixels / (width * height));
  const fit = (n: number) => Math.max(MIN_SIDE, Math.floor((n * k) / 2) * 2);
  return { width: fit(width), height: fit(height) };
}

/** Bytes one plane (line or fill) of a drawing takes while it is on screen. */
export function planeBytes(width: number, height: number): number {
  return width * height * 4;
}

export type SizeNote = { level: 'heavy' | 'too-big'; text: string } | null;

/** A plain-words heads-up for big pages (they use a lot of memory on iPads). */
export function sizeNote(width: number, height: number): SizeNote {
  const mp = (width * height) / 1e6;
  if (mp > 8.5) return { level: 'too-big', text: `${mp.toFixed(1)} megapixels is very large: drawing will be slow and an iPad may run out of memory. 1080p or 1440p is the safe range.` };
  if (mp > 3.5) return { level: 'heavy', text: `${mp.toFixed(1)} megapixels is heavy for older iPads. It is fine on a desktop or a recent iPad Pro.` };
  return null;
}

export interface FpsPreset {
  fps: number;
  name: string;
}

export const FPS_NAMES: FpsPreset[] = [
  { fps: 12, name: 'Frame by frame' },
  { fps: 15, name: 'Anime' },
  { fps: 24, name: 'Cinema' },
  { fps: 25, name: 'PAL' },
  { fps: 30, name: 'Television' },
  { fps: 50, name: 'PAL 50' },
  { fps: 60, name: 'Smooth' },
];

export function clampFps(n: number): number {
  return Math.min(120, Math.max(1, Math.round(n)));
}

export interface LengthChoice {
  id: string;
  label: string;
  /** Seconds, or 0 for a single frame. */
  seconds: number;
}

export const LENGTHS: LengthChoice[] = [
  { id: 'frame', label: '1 frame', seconds: 0 },
  { id: '1s', label: '1 second', seconds: 1 },
  { id: '2s', label: '2 seconds', seconds: 2 },
  { id: '5s', label: '5 seconds', seconds: 5 },
  { id: '10s', label: '10 seconds', seconds: 10 },
];

/** Frames a new project's first drawing is held for. */
export function framesFor(choice: LengthChoice, fps: number): number {
  return choice.seconds === 0 ? 1 : Math.max(1, Math.round(choice.seconds * fps));
}

/** The settings the dialog remembers between uses. */
export interface NewSettings {
  aspect: string;
  tier: number;
  custom: { width: number; height: number };
  fps: number;
  length: string;
}

export const DEFAULT_NEW: NewSettings = { aspect: '16:9', tier: 1080, custom: { width: 1920, height: 1080 }, fps: 12, length: 'frame' };

/** Read remembered settings, ignoring anything that no longer makes sense. */
export function readNewSettings(raw: unknown): NewSettings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<NewSettings>;
  const aspects = [...ASPECTS.map((a) => a.id), 'screen', 'custom'];
  const c = (typeof o.custom === 'object' && o.custom !== null ? o.custom : {}) as Partial<NewSettings['custom']>;
  return {
    aspect: typeof o.aspect === 'string' && aspects.includes(o.aspect) ? o.aspect : DEFAULT_NEW.aspect,
    tier: (TIERS as readonly number[]).includes(o.tier ?? 0) ? (o.tier as number) : DEFAULT_NEW.tier,
    custom: {
      width: Number.isFinite(c.width) ? clampSide(c.width as number) : DEFAULT_NEW.custom.width,
      height: Number.isFinite(c.height) ? clampSide(c.height as number) : DEFAULT_NEW.custom.height,
    },
    fps: Number.isFinite(o.fps) ? clampFps(o.fps as number) : DEFAULT_NEW.fps,
    length: LENGTHS.some((l) => l.id === o.length) ? (o.length as string) : DEFAULT_NEW.length,
  };
}
