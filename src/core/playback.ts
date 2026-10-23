/** Preview-only comp interval: zero-based start, exclusive end. Never trims content/export. */
export interface PlaybackRange { start: number; end: number }

export const RANGE_GESTURE_KEY = '2dope.playback.rangeGesture';
export const readRangeGesture = (stored: unknown): boolean => stored === true;

/** Resolve against the current length without destroying saved edges when an edit shortens it. */
export function playbackBounds(range: PlaybackRange | undefined, length: number): PlaybackRange {
  const end = Math.max(1, Math.floor(length));
  if (!range) return { start: 0, end };
  const start = Math.max(0, Math.min(end - 1, range.start));
  return { start, end: Math.max(start + 1, Math.min(end, range.end)) };
}

/** Clock and look-ahead both wrap at the same edges, including after a long background pause. */
export function loopFrame(frame: number, range: PlaybackRange): number {
  const length = range.end - range.start;
  return range.start + ((frame - range.start) % length + length) % length;
}
