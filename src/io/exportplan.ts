import type { Exposure } from '../core/timeline';

/**
 * Which images to write. Passes come from the drawing's planes, so they are exact (no guessing
 * what is "line" and what is "fill"):
 * - combined: everything as you see it
 * - lines: the Line plane and vector strokes only
 * - fills: the Fill plane only
 * - matte: the silhouette of the whole drawing, white with alpha
 */
export type Pass = 'combined' | 'lines' | 'fills' | 'matte';

export const PASSES: { id: Pass; label: string; hint: string; folder: string; suffix: string }[] = [
  { id: 'combined', label: 'Combined', hint: 'The finished image', folder: 'combined', suffix: '' },
  { id: 'lines', label: 'Lines', hint: 'Linework and vector strokes only, with alpha', folder: 'lines', suffix: '_lines' },
  { id: 'fills', label: 'Fills', hint: 'Flat color only, with alpha', folder: 'fills', suffix: '_fills' },
  { id: 'matte', label: 'Matte', hint: 'White silhouette of the whole drawing, with alpha', folder: 'matte', suffix: '_matte' },
];

export interface ExportOptions {
  name: string;
  passes: Pass[];
  /** 1 = full size. */
  scale: number;
  /** Applies to the combined pass only; the other passes stay transparent so they can be composited. */
  background: 'transparent' | 'white';
  range: 'all' | 'selected';
  /** Number of the first file (1001 is common for VFX). */
  start: number;
}

export const DEFAULT_EXPORT: ExportOptions = {
  name: 'shot',
  passes: ['combined'],
  scale: 1,
  background: 'transparent',
  range: 'all',
  start: 1,
};

export const NUMBER_PAD = 4;

/** A folder / file safe name: letters, digits, dash, underscore. */
export function sanitizeName(name: string): string {
  const s = name
    .trim()
    .replace(/[^\w\- ]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return s || 'shot';
}

export interface PlannedFrame {
  /** 0-based timeline frame. */
  frame: number;
  /** Index into the exposures. */
  exposure: number;
  drawing: string;
}

/** The frames to write, in order. `selected` are exposure indices (used when range is "selected"). */
export function framesToExport(ex: Exposure[], range: 'all' | 'selected', selected: number[]): PlannedFrame[] {
  const pick = range === 'selected' && selected.length ? new Set(selected) : null;
  const out: PlannedFrame[] = [];
  let frame = 0;
  ex.forEach((e, i) => {
    for (let k = 0; k < e.length; k++, frame++) {
      if (!pick || pick.has(i)) out.push({ frame, exposure: i, drawing: e.drawing });
    }
  });
  return out;
}

/** Path of one image inside the archive, e.g. "shot/lines/shot_lines_1001.png". */
export function entryPath(name: string, pass: Pass, number: number): string {
  const p = PASSES.find((x) => x.id === pass)!;
  return `${name}/${p.folder}/${name}${p.suffix}_${String(Math.max(0, Math.floor(number))).padStart(NUMBER_PAD, '0')}.png`;
}

/** Output size for a scale (never below 1 px). */
export function scaledSize(width: number, height: number, scale: number): { w: number; h: number } {
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

export interface ExportManifest {
  format: '2dope-export';
  version: 1;
  savedBy: string;
  name: string;
  fps: number;
  canvas: { width: number; height: number };
  size: { width: number; height: number };
  scale: number;
  background: 'transparent' | 'white';
  frames: number;
  firstNumber: number;
  numberPadding: number;
  passes: Record<string, { folder: string; pattern: string }>;
  /** What each image shows, so a reader can rebuild timing from the files. */
  exposures: { drawing: number; fromFrame: number; length: number; role?: string }[];
}

export function buildManifest(args: {
  opts: ExportOptions;
  savedBy: string;
  fps: number;
  width: number;
  height: number;
  frames: PlannedFrame[];
  exposures: { drawing: number; fromFrame: number; length: number; role?: string }[];
}): ExportManifest {
  const { opts, frames } = args;
  const size = scaledSize(args.width, args.height, opts.scale);
  const passes: ExportManifest['passes'] = {};
  for (const id of opts.passes) {
    const p = PASSES.find((x) => x.id === id)!;
    passes[id] = { folder: p.folder, pattern: `${opts.name}${p.suffix}_${'#'.repeat(NUMBER_PAD)}.png` };
  }
  return {
    format: '2dope-export',
    version: 1,
    savedBy: args.savedBy,
    name: opts.name,
    fps: args.fps,
    canvas: { width: args.width, height: args.height },
    size: { width: size.w, height: size.h },
    scale: opts.scale,
    background: opts.background,
    frames: frames.length,
    firstNumber: opts.start,
    numberPadding: NUMBER_PAD,
    passes,
    exposures: args.exposures,
  };
}
