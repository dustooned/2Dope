import type { SymmetryMode } from './adjust';
import type { BrushSettings } from './brush';

/** One input sample in document space. */
export interface StrokePoint {
  x: number;
  y: number;
  /** 0..1, 1 for a mouse. */
  pressure: number;
  /** Degrees, -90..90 (Pointer Events tiltX / tiltY). */
  tiltX: number;
  tiltY: number;
  /** Milliseconds since the stroke started. */
  t: number;
  /** Width multiplier set by point editing (missing = 1). */
  w?: number;
}

export type Tool = 'brush' | 'eraser' | 'pen' | 'fill';

/**
 * A stroke is data, not pixels: the stabilized points plus everything needed to re-render it
 * exactly (brush settings, color, seed). Pixels are a cache. This gives replay, write-on,
 * deterministic export and re-rendering at any resolution later.
 */
export interface StrokeRecord {
  id: string;
  tool: Tool;
  brush: BrushSettings;
  color: string;
  seed: number;
  points: StrokePoint[];
  /** Drawing Guide symmetry while it was drawn (raster brushes mirror their dabs). */
  sym?: { mode: SymmetryMode; cx: number; cy: number };
}

/** 0 upright .. 1 flat. */
export function tiltAmount(p: StrokePoint): number {
  return Math.min(1, Math.hypot(p.tiltX, p.tiltY) / 90);
}

export function strokeLength(points: StrokePoint[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    len += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return len;
}

let counter = 0;
export function newStrokeId(): string {
  counter += 1;
  return `s${Date.now().toString(36)}${counter.toString(36)}`;
}
