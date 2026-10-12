export type FrameFormat = 'frames' | 'secFrames' | 'timecode';

export const FRAME_FORMATS: { id: FrameFormat; label: string }[] = [
  { id: 'frames', label: 'Frames' },
  { id: 'secFrames', label: 'Sec + frames' },
  { id: 'timecode', label: 'Timecode' },
];

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/**
 * Label for a frame. `frame` is 0-based; the labels count from 1 in "frames" (like a cel sheet)
 * and show the usual 1+01 style for seconds + frames, or HH:MM:SS:FF timecode (FF from 00).
 */
export function frameLabel(frame: number, fps: number, format: FrameFormat): string {
  const f = Math.max(0, Math.floor(frame));
  const rate = Math.max(1, Math.round(fps));
  if (format === 'frames') return String(f + 1);
  const secs = Math.floor(f / rate);
  const rem = f % rate;
  if (format === 'secFrames') return `${secs}+${pad(rem + 1)}`;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${pad(h)}:${pad(m)}:${pad(secs % 60)}:${pad(rem)}`;
}

/** A length of time as text: "30f", "2s 06f" or a timecode (counts from 0). Negative keeps its sign. */
export function durationLabel(frames: number, fps: number, format: FrameFormat): string {
  const sign = frames < 0 ? '−' : '';
  const n = Math.abs(Math.round(frames));
  const rate = Math.max(1, Math.round(fps));
  if (format === 'frames') return `${sign}${n}f`;
  const secs = Math.floor(n / rate);
  const rem = n % rate;
  if (format === 'secFrames') return `${sign}${secs}s ${pad(rem)}f`;
  return `${sign}${frameLabel(n, fps, 'timecode')}`;
}

/** Frames between ruler labels so labels about `labelPx` wide never overlap at `cellPx` per frame. */
export function rulerStep(cellPx: number, fps: number, format: FrameFormat): number {
  const rate = Math.max(1, Math.round(fps));
  const labelPx = format === 'timecode' ? 74 : format === 'secFrames' ? 38 : 26;
  const steps = [1, 2, 5, 10, rate / 2, rate, rate * 2, rate * 5, rate * 10, rate * 30, rate * 60].filter((s) => Number.isInteger(s) && s >= 1).sort((a, b) => a - b);
  // seconds formats read best on whole seconds once labels get crowded
  const ok = steps.filter((s) => format === 'frames' || s < rate || s % rate === 0);
  return ok.find((s) => s * cellPx >= labelPx + 6) ?? ok[ok.length - 1]!;
}

/** True on the first frame of each second, where the sheet draws a heavier line. */
export function isSecondBoundary(frame: number, fps: number): boolean {
  return frame % Math.max(1, Math.round(fps)) === 0;
}
