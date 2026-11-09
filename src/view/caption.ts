/**
 * Drawing a caption (balloon and lettering) live, in the shared renderer: the canvas, Motion,
 * Share and every export draw captions through `paintCaption`. The balloon fill goes on the
 * Colour plane; ink, tails and letters on the Ink plane, so Ink/Colour effect targets work.
 */
import { valueAt, type Prop } from '../core/anim';
import { alongPath, balloonOutline, balloonProfile, balloonShapes, fitCaption, pathBand, pathLength, textPath, type Fit, type Pt } from '../lettering/geometry';
import { CAPTION_KEYS, captionValue, LETTER_SIZE_FRACTION, type CaptionKey, type CaptionSpec } from '../lettering/spec';
import { freshState, hasBold, runsOf, stripMarkup } from '../lettering/markup';
import { captionFont, captionFontReady, captionProject } from './captionfonts';

/** A caption's keyable setting at a layer frame (keys win over the still value), clamped to its range. */
export function captionAt(c: CaptionSpec, key: CaptionKey, frame: number): number {
  const track = c.keys?.[key], d = CAPTION_KEYS.find(k => k.key === key)!;
  if (track && track.keys.length) return Math.min(d.max, Math.max(d.min, valueAt(track as unknown as Prop<number>, frame)));
  return captionValue(c, key);
}

export interface CaptionLayout { fit: Fit; size: number; tracking: number; font: string; text: string }

const layouts = new Map<string, CaptionLayout>();
/** The look as a short cache key (a custom outline by its size and a checksum, not every point). */
function lookKey(c: CaptionSpec): string {
  const l = c.look;
  if (!l) return '';
  const { outline, ...rest } = l;
  const sum = outline ? outline.reduce((s, [x, y], i) => s + (x * 31 + y * 17) * (i + 1), 0).toFixed(3) : '';
  return `${JSON.stringify(rest)}${outline ? `#${outline.length}:${sum}` : ''}`;
}
let measureCanvas: CanvasRenderingContext2D | null = null;

/** The lettering size of a caption, page units. */
export function captionSize(c: CaptionSpec, pageHeight: number): number { return LETTER_SIZE_FRACTION[c.size] * (c.scale ?? 1) * pageHeight; }

/** Lay out a caption (cached by its text, look, size, spacing and whether its font has loaded). */
export function captionLayout(c: CaptionSpec, frame: number, pageW: number, pageH: number): CaptionLayout {
  const size = captionSize(c, pageH), tracking = captionAt(c, 'tracking', frame), leading = captionAt(c, 'leading', frame) / 100;
  const text = c.caps ? c.text.toUpperCase() : c.text, font = captionFont(c, size);
  const bold = hasBold(text), boldFont = bold ? captionFont({ ...c, bold: true }, size) : '';
  const key = `${text}|${font}|${captionFontReady(c)}|${bold ? captionFontReady({ ...c, bold: true }) : ''}|${c.style}|${c.shape ?? 1}|${lookKey(c)}|${c.minSize ?? ''}|${tracking}|${leading}|${pageW}x${pageH}`;
  const hit = layouts.get(key);
  if (hit) return hit;
  const g = (measureCanvas ??= document.createElement('canvas').getContext('2d')!);
  g.font = font;
  const extra = (tracking / 1000) * size;
  // markup takes no room; a caption with bold words measures with the wider bold letters, so they always fit
  const measure = (t: string) => {
    const plain = stripMarkup(t);
    let w = g.measureText(plain).width;
    if (bold) { g.font = boldFont; w = Math.max(w, g.measureText(plain).width); g.font = font; }
    return w + extra * Math.max(0, [...plain].length - 1);
  };
  const fitted = fitCaption(text.length ? text : ' ', c.style, measure, { size, leading, maxA: pageW * 0.48, maxB: pageH * 0.48, aspect: c.shape ?? 1, profile: balloonProfile(c.style, c.look) });
  // a minimum size (a converted drawing keeps its drawn size until the words need more)
  const fit = c.minSize ? { ...fitted, a: Math.max(fitted.a, c.minSize[0]), b: Math.max(fitted.b, c.minSize[1]) } : fitted;
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
  // a sound effect on a path: its area is a band along the path
  const curved = curvePath(c, lay);
  const outline = curved ? pathBand(curved, lay.size * 0.8) : balloonOutline(c.style, lay.fit.a, lay.fit.b, seed, c.path, c.look);
  return { lay, outline, shapes: balloonShapes(outline, c.style === 'sfx' ? [] : c.tails, c.x, c.y, lay.size) };
}

/** The path a sound effect's letters follow (around its centre), or null for straight lettering. */
export function curvePath(c: CaptionSpec, lay: CaptionLayout): Pt[] | null {
  if (c.style !== 'sfx' || !c.curve) return null;
  const span = lay.fit.lines.reduce((n, l) => n + l.width, 0) + lay.size * 0.3 * Math.max(0, lay.fit.lines.length - 1);
  const p = textPath(c.curve, Math.max(span, lay.size), lay.size);
  return p.length >= 2 ? p : null;
}

/** A joined balloon as a caption of its own (same look, its words and place, no tails). */
export function linkCaption(c: CaptionSpec, i: number): CaptionSpec {
  const k = c.links![i]!;
  const { links: _l, minSize: _m, keys: _k, ...rest } = c;
  return { ...rest, text: k.text, x: k.x, y: k.y, tails: [] };
}

/** Joined balloons: each one's layout and outline (page units), and the neck joining it to the main balloon. */
export function captionLinks(c: CaptionSpec, frame: number, pageW: number, pageH: number) {
  if (!c.links?.length || c.style === 'sfx') return [];
  const size = captionSize(c, pageH);
  return c.links.map((_, i) => {
    const lc = linkCaption(c, i), { lay, shapes } = captionBalloon(lc, frame, pageW, pageH);
    return { caption: lc, lay, outline: shapes.outline, neck: neckBetween({ x: c.x, y: c.y }, { x: lc.x, y: lc.y }, size * 1.5) };
  });
}

/** A short, waisted strip between two balloon centres (its ends sit inside the balloons). */
function neckBetween(a: Pt, b: Pt, w: number): Pt[] {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d, out: Pt[] = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16, half = (w / 2) * (0.62 + 0.38 * Math.abs(2 * t - 1)); out.push({ x: a.x + dx * t + nx * half, y: a.y + dy * t + ny * half }); }
  for (let i = 16; i >= 0; i--) { const t = i / 16, half = (w / 2) * (0.62 + 0.38 * Math.abs(2 * t - 1)); out.push({ x: a.x + dx * t - nx * half, y: a.y + dy * t - ny * half }); }
  return out;
}

/**
 * Draw a caption at a layer frame. `planes`: 'fill' = balloon fill only, 'line' = ink and letters,
 * 'ink' = the balloon's ink and tails only, 'text' = the letters only (so effects can target each).
 */
export function paintCaption(g: CanvasRenderingContext2D, c: CaptionSpec, frame: number, planes: 'all' | 'line' | 'fill' | 'ink' | 'text'): void {
  const project = captionProject(), pageW = project?.width ?? g.canvas.width, pageH = project?.height ?? g.canvas.height;
  const { lay, shapes } = captionBalloon(c, frame, pageW, pageH), size = lay.size;
  const links = captionLinks(c, frame, pageW, pageH);
  const scale = captionAt(c, 'balloon', frame) / 100, balloonA = captionAt(c, 'balloonOpacity', frame) / 100, textA = captionAt(c, 'textOpacity', frame) / 100;
  if (scale <= 0) return;
  const pivot = c.tails[0] && c.style !== 'sfx' ? { x: c.tails[0].x, y: c.tails[0].y } : { x: c.x, y: c.y };
  g.save();
  g.translate(pivot.x, pivot.y); g.scale(scale, scale); g.translate(-pivot.x, -pivot.y);
  const base = g.globalAlpha;
  if (c.style !== 'sfx' && balloonA > 0 && planes !== 'text') {
    g.globalAlpha = base * balloonA;
    // every closed piece of the balloon: the main one (tails merged in), seam tails, joined balloons and their necks
    const closedShapes = [shapes.outline, ...shapes.seams, ...links.flatMap(k => [k.outline, k.neck])];
    if (planes === 'all' || planes === 'fill') {
      const fillAll = (dx: number, dy: number) => {
        for (const s of closedShapes) { g.beginPath(); s.forEach((p, i) => (i ? g.lineTo(p.x + dx, p.y + dy) : g.moveTo(p.x + dx, p.y + dy))); g.closePath(); g.fill(); }
        for (const b of shapes.bubbles) { g.beginPath(); g.arc(b.x + dx, b.y + dy, b.r, 0, Math.PI * 2); g.fill(); }
      };
      // the under-fill: the same shapes, offset, behind
      if (c.underFill) { g.fillStyle = c.underFill.color; fillAll(c.underFill.dx * size, c.underFill.dy * size); }
      g.fillStyle = c.fill;
      fillAll(0, 0);
    }
    if (planes !== 'fill' && c.inkWidth > 0) {
      g.strokeStyle = c.ink; g.lineWidth = c.inkWidth * size; g.lineJoin = 'round'; g.lineCap = 'round';
      const inkStart = captionAt(c, 'inkStart', frame) / 100, inkEnd = captionAt(c, 'inkEnd', frame) / 100, L = lengthOf(shapes.outline);
      const whisper = c.style === 'whisper' ? [size * 0.45, size * 0.3] : null;
      // the outline drawn from Ink start to Ink length (both share of the way round)
      const partial = !whisper && (inkStart > 0 || inkEnd < 1);
      if (whisper) g.setLineDash(whisper);
      else if (partial) { g.setLineDash([L * Math.max(0, inkEnd - inkStart), L + 1]); g.lineDashOffset = -L * inkStart; }
      if (inkEnd > inkStart || whisper) {
        if (links.length) {
          // joined balloons share one outline: stroke every piece twice as wide, outside all of them
          g.save();
          const far = 1e6;
          for (const s of [shapes.outline, ...links.flatMap(k => [k.outline, k.neck])]) {
            g.beginPath(); g.rect(-far, -far, 2 * far, 2 * far); s.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath(); g.clip('evenodd');
          }
          g.lineWidth = c.inkWidth * size * 2;
          for (const s of [shapes.outline, ...links.flatMap(k => [k.outline, k.neck])]) { pathOf(g, s); g.stroke(); }
          g.restore();
          g.setLineDash(whisper ?? []); g.lineDashOffset = 0;
        } else {
          pathOf(g, shapes.outline); g.stroke();
        }
        g.setLineDash(whisper ?? []); g.lineDashOffset = 0;
        // a seam tail's base sits under the balloon fill: draw the fill again over the seam's inner end
        for (const s of shapes.seams) { pathOf(g, s); g.stroke(); }
        for (const b of shapes.bubbles) { g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.stroke(); }
        for (const z of shapes.zigzags) { pathOf(g, z, false); g.stroke(); }
      }
      g.setLineDash([]); g.lineDashOffset = 0;
    }
  }
  if (planes !== 'fill' && planes !== 'ink' && textA > 0) {
    g.globalAlpha = base * textA;
    // the words, the main balloon's then each joined one's, revealed in that order
    const pieces = [{ cap: c, lay }, ...links.map(k => ({ cap: k.caption, lay: k.lay }))].filter(p => stripMarkup(p.cap.text).trim());
    const total = pieces.reduce((n, p) => n + p.lay.fit.lines.reduce((m, l) => m + [...stripMarkup(l.text)].length, 0), 0);
    let left = Math.round(total * (captionAt(c, 'reveal', frame) / 100));
    for (const p of pieces) { if (left <= 0) break; left = drawWords(g, p.cap, p.lay, left); }
  }
  g.restore();
}

/** Draw one balloon's words (styled runs), at most `budget` letters. Returns the letters left. */
function drawWords(g: CanvasRenderingContext2D, c: CaptionSpec, lay: CaptionLayout, budget: number): number {
  const curved = curvePath(c, lay);
  if (curved) return drawOnPath(g, c, lay, curved, budget);
  const size = lay.size, state = freshState();
  g.textBaseline = 'middle';
  // measure each line as it will be drawn (runs in their own fonts), for alignment
  const lines = lay.fit.lines.map(line => {
    const runs = runsOf(line.text, state).map(r => {
      const font = r.bold || r.italic ? captionFont({ ...c, bold: c.bold || r.bold, italic: c.italic || r.italic }, size) : lay.font;
      g.font = font;
      const w = g.measureText(r.text).width + lay.tracking * [...r.text].length;
      return { ...r, font, w };
    });
    return { y: line.y, runs, width: runs.reduce((n, r) => n + r.w, 0) - (runs.length ? lay.tracking : 0) };
  });
  const widest = Math.max(0, ...lines.map(l => l.width));
  for (const line of lines) {
    if (budget <= 0) break;
    let x = c.align === 'left' ? c.x - widest / 2 : c.align === 'right' ? c.x + widest / 2 - line.width : c.x - line.width / 2;
    const y = c.y + line.y;
    for (const r of line.runs) {
      if (budget <= 0) break;
      const chars = [...r.text], shown = chars.slice(0, budget);
      budget -= chars.length;
      g.font = r.font;
      const paint = (draw: (t: string, px: number) => void) => {
        if (!lay.tracking) { draw(shown.join(''), x); return; }
        let px = x;
        for (const ch of shown) { draw(ch, px); px += g.measureText(ch).width + lay.tracking; }
      };
      if (c.textOutline && c.textOutlineWidth > 0) {
        g.strokeStyle = c.textOutline; g.lineWidth = c.textOutlineWidth * size * 2; g.lineJoin = 'round';
        paint((t, px) => g.strokeText(t, px, y));
      }
      g.fillStyle = r.color ?? c.textColor;
      paint((t, px) => g.fillText(t, px, y));
      x += r.w;
    }
  }
  return budget;
}

/** A sound effect's letters along its path, each turned to follow it, centred on the path. */
function drawOnPath(g: CanvasRenderingContext2D, c: CaptionSpec, lay: CaptionLayout, path: Pt[], budget: number): number {
  const size = lay.size, state = freshState();
  g.textBaseline = 'middle'; g.textAlign = 'center';
  // every letter with its own font (styled words) and width, the lines run together
  const letters: { ch: string; font: string; color: string | null; w: number }[] = [];
  lay.fit.lines.forEach((line, i) => {
    if (i) letters.push({ ch: ' ', font: lay.font, color: null, w: size * 0.3 });
    for (const r of runsOf(line.text, state)) {
      const font = r.bold || r.italic ? captionFont({ ...c, bold: c.bold || r.bold, italic: c.italic || r.italic }, size) : lay.font;
      g.font = font;
      for (const ch of r.text) letters.push({ ch, font, color: r.color, w: g.measureText(ch).width + lay.tracking });
    }
  });
  const total = letters.reduce((n, l) => n + l.w, 0);
  let d = (pathLength(path) - total) / 2;
  for (const l of letters) {
    if (budget <= 0) break;
    const at = alongPath(path, d + l.w / 2);
    d += l.w;
    if (l.ch === ' ') { budget--; continue; }
    budget--;
    g.save();
    g.translate(c.x + at.x, c.y + at.y); g.rotate(at.angle);
    g.font = l.font;
    if (c.textOutline && c.textOutlineWidth > 0) { g.strokeStyle = c.textOutline; g.lineWidth = c.textOutlineWidth * size * 2; g.lineJoin = 'round'; g.strokeText(l.ch, 0, 0); }
    g.fillStyle = l.color ?? c.textColor;
    g.fillText(l.ch, 0, 0);
    g.restore();
  }
  g.textAlign = 'start';
  return budget;
}
