/**
 * Timecode (format 12): burns a frame counter or timecode into the picture, over the layer's own
 * art. The text depends only on the frame, the frame rate and the settings, so the canvas, Share's
 * preview and every export (video, GIF, PNG) draw the same pixels.
 */
import { param, type LayerEffect } from '../core/effects';
import { burnInLabel, type FrameFormat } from '../core/timecode';

const FONTS: Record<string, string> = {
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
};

/** Where an anchor sits across and down the page: 0 = left / top, 0.5 = middle, 1 = right / bottom. */
export function anchorOf(id: string): [number, number] {
  const ax = id[1] === 'l' ? 0 : id[1] === 'r' ? 1 : 0.5;
  const ay = id[0] === 't' ? 0 : id[0] === 'b' ? 1 : 0.5;
  return [ax, ay];
}

/**
 * The box the text sits in (page pixels, page origin at 0,0): the anchor point is inset from its
 * edges by Edge margin (a share of the shorter side), moved by Move across / down (shares of the
 * page), and the box's matching corner or edge sits on that point.
 */
export function timecodeBox(e: LayerEffect, pw: number, ph: number, bw: number, bh: number): { x: number; y: number } {
  const [ax, ay] = anchorOf(param<string>(e, 'anchor'));
  const m = (Math.min(pw, ph) * Number(param<number>(e, 'margin'))) / 100;
  const px = ax * pw + (ax === 0 ? m : ax === 1 ? -m : 0) + (pw * Number(param<number>(e, 'x'))) / 100;
  const py = ay * ph + (ay === 0 ? m : ay === 1 ? -m : 0) + (ph * Number(param<number>(e, 'y'))) / 100;
  return { x: px - ax * bw, y: py - ay * bh };
}

/** The label at a frame (shot or layer frame, chosen by the caller from Count). */
export function timecodeText(e: LayerEffect, frame: number, fps: number): string {
  const format = param<string>(e, 'format') as FrameFormat;
  return burnInLabel(frame, fps, format === 'frames' || format === 'secFrames' ? format : 'timecode', Number(param<number>(e, 'start')) || 0, String(param<string>(e, 'prefix') ?? ''));
}

/** Draw the label onto the effect's working canvas (page inside `pad` on every side). */
export function timecodeEffect(c: HTMLCanvasElement, e: LayerEffect, frame: number, fps: number, pad: number): void {
  const g = c.getContext('2d');
  if (!g) return;
  const pw = c.width - 2 * pad, ph = c.height - 2 * pad;
  const size = Math.max(1, e.amount * (Number(param<number>(e, 'scale')) / 100));
  const alpha = Math.min(1, Math.max(0, e.size / 100));
  if (alpha <= 0 || pw <= 0 || ph <= 0) return;
  const text = timecodeText(e, frame, fps);
  g.save();
  g.font = `600 ${size}px ${FONTS[param<string>(e, 'font')] ?? FONTS.mono}`;
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  // tabular figures where the font has them, so the counter does not jitter
  (g as CanvasRenderingContext2D & { fontVariantNumeric?: string }).fontVariantNumeric = 'tabular-nums';
  const padX = size * 0.35, padY = size * 0.2;
  const tw = g.measureText(text).width, bw = tw + 2 * padX, bh = size * 1.2 + 2 * padY;
  const at = timecodeBox(e, pw, ph, bw, bh);
  const x = pad + at.x, y = pad + at.y;
  if (param<boolean>(e, 'box')) {
    g.globalAlpha = alpha * Math.min(1, Math.max(0, Number(param<number>(e, 'boxOpacity')) / 100));
    g.fillStyle = param<string>(e, 'boxColor');
    const r = Math.min(bh / 4, size * 0.2);
    g.beginPath();
    if (typeof g.roundRect === 'function') g.roundRect(x, y, bw, bh, r); else g.rect(x, y, bw, bh);
    g.fill();
  }
  g.globalAlpha = alpha;
  g.fillStyle = param<string>(e, 'color');
  g.fillText(text, x + padX, y + bh / 2);
  g.restore();
}
