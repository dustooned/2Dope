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

/** True on the first frame of each second, where the sheet draws a heavier line. */
export function isSecondBoundary(frame: number, fps: number): boolean {
  return frame % Math.max(1, Math.round(fps)) === 0;
}
