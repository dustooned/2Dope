import type { Exposure } from './timeline';

/**
 * Canvas view options for Draw and Animate: how much of the pasteboard shows and which framing
 * guides sit over the page. Device-only preferences, outside the project and History; nothing here
 * reaches an export.
 *
 * Overscan never resizes a drawing. Raster planes stay page-sized (memory, residency, Lite limits
 * and every pixel consumer are unchanged); vector lines are point records and were never bounded by
 * the page, so with Overscan on they are drawn, kept and erased past the edge. See HANDOFF.md.
 */
export interface CanvasView {
  /** Show artwork past the page edge, dimmed, and let vector lines land there. */
  overscan: boolean;
  /** Action-safe and title-safe frames. */
  safeAreas: boolean;
  /** A small cross at the centre of the page. */
  centre: boolean;
  /** Micro thumbnails of the neighbouring drawings. */
  overview: boolean;
}

export const CANVAS_VIEW_KEY = '2dope.canvas.view';
export const DEFAULT_CANVAS_VIEW: CanvasView = { overscan: false, safeAreas: false, centre: false, overview: false };

/** Broadcast convention: action safe keeps 90% of the frame, title safe 80%. */
export const ACTION_SAFE = 0.9;
export const TITLE_SAFE = 0.8;

/** Validate stored preferences: anything unreadable falls back to its default. */
export function readCanvasView(saved: unknown): CanvasView {
  const out = { ...DEFAULT_CANVAS_VIEW };
  if (!saved || typeof saved !== 'object') return out;
  for (const k of Object.keys(out) as (keyof CanvasView)[]) {
    const v = (saved as Record<string, unknown>)[k];
    if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/** The centred rectangle keeping `fraction` of a w×h frame. */
export function safeRect(w: number, h: number, fraction: number): { x: number; y: number; w: number; h: number } {
  const f = Math.max(0, Math.min(1, fraction));
  const sw = w * f, sh = h * f;
  return { x: (w - sw) / 2, y: (h - sh) / 2, w: sw, h: sh };
}

export interface OverviewEntry {
  drawing: string;
  /** First frame of this exposure, in the layer's own time. */
  start: number;
  length: number;
  current: boolean;
}

/** The exposures around the one showing at layer frame `lf`: up to `radius` either side. */
export function overviewEntries(exposures: readonly Exposure[], lf: number, radius = 2): OverviewEntry[] {
  const all: OverviewEntry[] = [];
  let start = 0, at = -1;
  for (const e of exposures) {
    if (at < 0 && lf >= start && lf < start + e.length) at = all.length;
    all.push({ drawing: e.drawing, start, length: e.length, current: false });
    start += e.length;
  }
  if (!all.length) return [];
  if (at < 0) at = lf < 0 ? 0 : all.length - 1;
  all[at]!.current = true;
  return all.slice(Math.max(0, at - radius), at + radius + 1);
}
