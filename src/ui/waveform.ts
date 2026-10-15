import type { SoundClip } from '../core/audio';
import { waveformColumns, type WaveformData } from '../core/waveform';

/** Shared static waveform drawing; playback moves a CSS playhead rather than repainting PCM. */
export function paintWaveform(canvas: HTMLCanvasElement, data: WaveformData, clip: SoundClip): void {
  const width = Math.max(64, Math.min(1536, Math.ceil(canvas.clientWidth || canvas.width)));
  canvas.width = width;
  const g = canvas.getContext('2d'); if (!g) return;
  const middle = canvas.height / 2, amplitude = middle - 2;
  g.clearRect(0, 0, width, canvas.height);
  g.fillStyle = clip.muted ? '#777887' : '#77d9ba';
  for (const [x, [lo, hi]] of waveformColumns(data, clip.trimIn, clip.trimOut, width, clip.gain).entries()) {
    const top = middle - Math.max(0, hi) * amplitude;
    const bottom = middle - Math.min(0, lo) * amplitude;
    g.fillRect(x, top, 1, Math.max(1, bottom - top));
  }
  g.globalAlpha = 0.4; g.fillRect(0, middle, width, 1); g.globalAlpha = 1;
}
