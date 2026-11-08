/**
 * Drawing a caption (balloon and lettering) live, in the shared renderer: the canvas, Motion,
 * Share and every export draw captions through `paintCaption`. The balloon fill goes on the
 * Colour plane; ink, tails and letters on the Ink plane, so Ink/Colour effect targets work.
 */
import { valueAt, type Prop } from '../core/anim';
import { balloonOutline, balloonShapes, fitCaption, type Fit, type Pt } from '../lettering/geometry';
import { CAPTION_KEYS, captionValue, LETTER_SIZE_FRACTION, type CaptionKey, type CaptionSpec } from '../lettering/spec';
import { captionFont, captionFontReady, captionProject } from './captionfonts';

/** A caption's keyable setting at a layer frame (keys win over the still value), clamped to its range. */
export function captionAt(c: CaptionSpec, key: CaptionKey, frame: number): number {
  const track = c.keys?.[key], d = CAPTION_KEYS.find(k => k.key === key)!;
  if (track && track.keys.length) return Math.min(d.max, Math.max(d.min, valueAt(track as unknown as Prop<number>, frame)));
  return captionValue(c, key);
}

export interface CaptionLayout { fit: Fit; size: number; tracking: number; font: string; text: string }

const layouts = new Map<string, CaptionLayout>();
let measureCanvas: CanvasRenderingContext2D | null = null;

/** The lettering size of a caption, page units. */
export function captionSize(c: CaptionSpec, pageHeight: number): number { return LETTER_SIZE_FRACTION[c.size] * pageHeight; }

/** Lay out a caption (cached by its text, look, size, spacing and whether its font has loaded). */
export function captionLayout(c: CaptionSpec, frame: number, pageW: number, pageH: number): CaptionLayout {
  const size = captionSize(c, pageH), tracking = captionAt(c, 'tracking', frame), leading = captionAt(c, 'leading', frame) / 100;
  const text = c.caps ? c.text.toUpperCase() : c.text, font = captionFont(c, size);
  const key = `${text}|${font}|${captionFontReady(c)}|${c.style}|${tracking}|${leading}|${pageW}x${pageH}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const g = (measureCanvas ??= document.createElement('canvas').getContext('2d')!);
  g.font = font;
  const extra = (tracking / 1000) * size;
  const measure = (t: string) => g.measureText(t).width + extra * Math.max(0, [...t].length - 1);
  const fit = fitCaption(text.length ? text : ' ', c.style, measure, { size, leading, maxA: pageW * 0.48, maxB: pageH * 0.48 });
  const out = { fit, size, tracking: extra, font, text };
  if (layouts.size > 200) layouts.delete(layouts.keys().next().value!);
  layouts.set(key, out);
  return out;
}

const pathOf = (g: CanvasRenderingContext2D, pts: Pt[], close = true) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); if (close) g.closePath(); };
const lengthOf = (pts: Pt[]) => { let n = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i]!, b = pts[(i + 1) % pts.length]!; n += Math.hypot(b.x - a.x, b.y - a.y); } return n; };

/** The balloon (with tails) of a caption at a frame, page units. */
export function captionBalloon(c: CaptionSpec, frame: number, pageW: number, pageH: number) {
  const lay = captionLayout(c, frame, pageW, pageH);
  const seed = [...c.text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const outline = balloonOutline(c.style, lay.fit.a, lay.fit.b, seed, c.path);
  return { lay, shapes: balloonShapes(outline, c.style === 'sfx' ? [] : c.tails, c.x, c.y, lay.size) };
}

/** Draw a caption at a layer frame. `planes`: 'fill' = balloon fill only, 'line' = ink and letters only. */
export function paintCaption(g: CanvasRenderingContext2D, c: CaptionSpec, frame: number, planes: 'all' | 'line' | 'fill'): void {
  const project = captionProject(), pageW = project?.width ?? g.canvas.width, pageH = project?.height ?? g.canvas.height;
  const { lay, shapes } = captionBalloon(c, frame, pageW, pageH), size = lay.size;
  const scale = captionAt(c, 'balloon', frame) / 100, balloonA = captionAt(c, 'balloonOpacity', frame) / 100, textA = captionAt(c, 'textOpacity', frame) / 100;
  if (scale <= 0) return;
  const pivot = c.tails[0] && c.style !== 'sfx' ? { x: c.tails[0].x, y: c.tails[0].y } : { x: c.x, y: c.y };
  g.save();
  g.translate(pivot.x, pivot.y); g.scale(scale, scale); g.translate(-pivot.x, -pivot.y);
  const base = g.globalAlpha;
  if (c.style !== 'sfx' && balloonA > 0) {
    g.globalAlpha = base * balloonA;
    const closedShapes = [shapes.outline, ...shapes.seams];
    if (planes !== 'line') {
      g.fillStyle = c.fill;
      for (const s of closedShapes) { pathOf(g, s); g.fill(); }
      for (const b of shapes.bubbles) { g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.fill(); }
    }
    if (planes !== 'fill' && c.inkWidth > 0) {
      g.strokeStyle = c.ink; g.lineWidth = c.inkWidth * size; g.lineJoin = 'round'; g.lineCap = 'round';
      const inkEnd = captionAt(c, 'inkEnd', frame) / 100, L = lengthOf(shapes.outline);
      if (c.style === 'whisper') g.setLineDash([size * 0.45, size * 0.3]);
      else if (inkEnd < 1) g.setLineDash([L * inkEnd, L + 1]);
      if (inkEnd > 0) {
        pathOf(g, shapes.outline); g.stroke();
        g.setLineDash(c.style === 'whisper' ? [size * 0.45, size * 0.3] : []);
        // a seam tail's base sits under the balloon fill: draw the fill again over the seam's inner end
        for (const s of shapes.seams) { pathOf(g, s); g.stroke(); }
        for (const b of shapes.bubbles) { g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.stroke(); }
        for (const z of shapes.zigzags) { pathOf(g, z, false); g.stroke(); }
      }
      g.setLineDash([]);
    }
  }
  if (planes !== 'fill' && textA > 0 && c.text.trim()) {
    g.globalAlpha = base * textA;
    g.font = lay.font; g.textBaseline = 'middle';
    g.fillStyle = c.textColor;
    const reveal = captionAt(c, 'reveal', frame) / 100, total = lay.fit.lines.reduce((n, l) => n + [...l.text].length, 0);
    let left = Math.round(total * reveal);
    const widest = Math.max(...lay.fit.lines.map(l => l.width));
    for (const line of lay.fit.lines) {
      if (left <= 0) break;
      const chars = [...line.text], shown = chars.slice(0, left);
      left -= chars.length;
      const x0 = c.align === 'left' ? c.x - widest / 2 : c.align === 'right' ? c.x + widest / 2 - line.width : c.x - line.width / 2, y = c.y + line.y;
      const draw = (paint: (t: string, x: number) => void) => {
        if (!lay.tracking) { paint(shown.join(''), x0); return; }
        let x = x0;
        for (const ch of shown) { paint(ch, x); x += g.measureText(ch).width + lay.tracking; }
      };
      if (c.textOutline && c.textOutlineWidth > 0) {
        g.strokeStyle = c.textOutline; g.lineWidth = c.textOutlineWidth * size * 2; g.lineJoin = 'round';
        draw((t, x) => g.strokeText(t, x, y));
      }
      draw((t, x) => g.fillText(t, x, y));
    }
  }
  g.restore();
}
