/**
 * Time zoom for the Draw strip, as pure functions (units: px per frame, "cell").
 * The limits follow the screen and the shot, so they hold on a phone, an iPad and a wide desktop,
 * and for a 20-frame loop or a 5-minute film. Nothing here is saved.
 */

/** One frame never gets narrower than this, however long the shot. */
export const ABSOLUTE_MIN_CELL = 0.5;
/** One frame never gets wider than this, however wide the screen. */
export const ABSOLUTE_MAX_CELL = 400;
/** A short shot may always be zoomed out to this (the old fixed minimum). */
const SHORT_SHOT_MIN_CELL = 4;
/** Zoomed all the way in, one frame fills this fraction of the strip (frame focus). */
const FOCUS_FRACTION = 1 / 4;
/** The strip opens at this width per frame, or less when the whole shot needs it. */
export const OPEN_CELL = 44;

export interface ZoomLimits {
  min: number;
  max: number;
  /** The width per frame that shows the whole shot. */
  fit: number;
}

/** Zoom limits for a strip `viewWidth` px wide, `label` px of it taken by track names, holding `frames` frames. */
export function zoomLimits(viewWidth: number, label: number, frames: number): ZoomLimits {
  const room = Math.max(1, viewWidth - label);
  const max = Math.min(ABSOLUTE_MAX_CELL, Math.max(SHORT_SHOT_MIN_CELL * 2, room * FOCUS_FRACTION));
  const fit = Math.max(ABSOLUTE_MIN_CELL, Math.min(max, (room - 12) / Math.max(1, frames)));
  const min = Math.max(ABSOLUTE_MIN_CELL, Math.min(fit, SHORT_SHOT_MIN_CELL));
  return { min, max, fit };
}

export const clampCell = (cell: number, limits: ZoomLimits): number => Math.max(limits.min, Math.min(limits.max, cell));

/** Two fingers moving to `spread` from `spread0`: the width per frame follows at 0.6 of the finger ratio. */
export const PINCH_GAIN = 0.6;
export function pinchCell(cell0: number, spread0: number, spread: number): number {
  return cell0 * Math.pow(Math.max(20, spread) / Math.max(20, spread0), PINCH_GAIN);
}

/** What counts as a quick pinch that fits the whole shot (all three, so a slow or small pinch only zooms). */
export const FIT_PINCH = { maxMs: 250, minPxPerSecond: 800, minScale: 1.6 } as const;
export function isFitPinch(durationMs: number, spreadStart: number, spreadEnd: number): boolean {
  if (durationMs <= 0 || durationMs >= FIT_PINCH.maxMs) return false;
  const start = Math.max(20, spreadStart), end = Math.max(20, spreadEnd);
  // fingers coming together by at least 1.6x, and fast
  if (start / end <= FIT_PINCH.minScale) return false;
  return (Math.abs(start - end) / durationMs) * 1000 > FIT_PINCH.minPxPerSecond;
}

/** The scroll position that keeps `frame` at `screenX` (px from the strip's left edge) after a zoom. */
export function anchoredScroll(label: number, frame: number, cell: number, screenX: number): number {
  return Math.max(0, label + frame * cell - screenX);
}
