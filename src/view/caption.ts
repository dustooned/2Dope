/**
 * Drawing a caption (balloon and lettering) live, in the shared renderer: the canvas, Motion,
 * Share and every export draw captions through `paintCaption`. The balloon fill goes on the
 * Colour plane; ink, tails and letters on the Ink plane, so Ink/Colour effect targets work.
 */
import { valueAt, type Prop } from '../core/anim';
import { setLayerReach } from '../core/effects';
import { alongPath, balloonOutline, balloonProfile, balloonShapes, fitCaption, pathBand, pathLength, textPath, type Fit, type Pt } from '../lettering/geometry';
import { CAPTION_KEYS, captionValue, LETTER_SIZE_FRACTION, type CaptionKey, type CaptionSpec } from '../lettering/spec';
import { freshState, hasBold, runsOf, stripMarkup } from '../lettering/markup';
import { captionFont, captionFontReady, captionProject } from './captionfonts';
import { baselineOffset, emboldenWidth, glyphFont, glyphOf, syntheticFace } from './captionglyphs';
import { familyName } from '../lettering/fonts';

/**
 * How far a caption layer's balloon and letters reach past its page (page units, 0 inside), with a
 * margin for tails and outlines; at most half the page's longer side, so buffers stay a sane size.
 */
const reaches = new Map<string, { key: string; reach: number }>();
export function captionReach(l: { id: string; kind?: string; caption?: CaptionSpec }): number {
  const c = l.kind === 'drawings' ? l.caption : undefined, project = captionProject();
  if (!c || !project) return 0;
  const W = project.width, H = project.height, key = `${JSON.stringify(c)}|${W}x${H}`, hit = reaches.get(l.id);
  if (hit?.key === key) return hit.reach;
  const { lay, shapes } = captionBalloon(c, 0, W, H);
  const pts = [...shapes.outline, ...shapes.joined.flat(), ...shapes.seams.flat(), ...shapes.zigzags.flat(), ...shapes.bubbles.flatMap(b => [{ x: b.x - b.r, y: b.y - b.r }, { x: b.x + b.r, y: b.y + b.r }]), ...captionLinks(c, 0, W, H).flatMap(k => k.outline)];
  const margin = lay.size * (c.inkWidth * 2 + 1 + Math.max(Math.abs(c.underFill?.dx ?? 0), Math.abs(c.underFill?.dy ?? 0)));
  let out = 0;
  for (const p of pts) out = Math.max(out, -p.x, -p.y, p.x - W, p.y - H);
  const reach = out > 0 ? Math.min(Math.max(W, H) / 2, out + margin) : 0;
  if (reaches.size > 200) reaches.clear();
  reaches.set(l.id, { key, reach });
  return reach;
}
setLayerReach(l => captionReach(l as { id: string; kind?: string; caption?: CaptionSpec }));

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
    // every closed piece of the balloon: the main one (tails merged in), Joined tails, seam tails and bolts,
    // joined balloons and their necks
    const union = [shapes.outline, ...shapes.joined, ...links.flatMap(k => [k.outline, k.neck])];
    const closedShapes = [...union, ...shapes.seams];
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
        const outside = (pieces: Pt[][]) => {
          // clip to outside every piece (one even-odd clip each): what is drawn then shows only outside them all
          const far = 1e6;
          for (const p of pieces) { g.beginPath(); g.rect(-far, -far, 2 * far, 2 * far); p.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y))); g.closePath(); g.clip('evenodd'); }
        };
        if (union.length > 1) {
          // pieces that share one outline: stroke each twice as wide, outside all of them
          g.save(); outside(union);
          g.lineWidth = c.inkWidth * size * 2;
          for (const p of union) { pathOf(g, p); g.stroke(); }
          g.restore();
        } else {
          pathOf(g, shapes.outline); g.stroke();
        }
        g.setLineDash(whisper ?? []); g.lineDashOffset = 0;
        // closed tails and bolts: outlined only outside the balloon, whose own outline closes them
        if (shapes.seams.length) {
          g.save(); outside(union);
          g.lineWidth = c.inkWidth * size * 2;
          for (const p of shapes.seams) { pathOf(g, p); g.stroke(); }
          g.restore();
          g.lineWidth = c.inkWidth * size;
        }
        for (const b of shapes.bubbles) { g.beginPath(); g.arc(b.x, b.y, b.r, 0, Math.PI * 2); g.stroke(); }
        shapes.zigzags.forEach((z, i) => { g.lineWidth = c.inkWidth * size * (shapes.zigzagWidths[i] ?? 1); pathOf(g, z, false); g.stroke(); });
        g.lineWidth = c.inkWidth * size;
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
    // Write on: each letter's outline draws on, then it fills, one after another
    const writeOn = captionAt(c, 'writeOn', frame) / 100;
    const write = writeOn < 1 ? { t: writeOn, total: Math.max(1, total), done: 0 } : undefined;
    for (const p of pieces) { if (left <= 0) break; left = drawWords(g, p.cap, p.lay, left, frame, write); }
  }
  g.restore();
}

/** One letter placed for drawing: its font, colour, where it stands (left edge or centre) and its turn. */
export interface Placed { ch: string; font: string; bold: boolean; italic: boolean; color: string | null; x: number; y: number; angle: number; centred: boolean; index: number }

/** How far Write on has got: its share (0..1) over all the letters, and how many are placed so far. */
interface WriteState { t: number; total: number; done: number }

/** Shake, Wave and Jitter at a frame: an offset and a turn for letter i (the same every time a frame is drawn). */
function letterMotion(c: CaptionSpec, frame: number, size: number): ((i: number) => { dx: number; dy: number; turn: number }) | null {
  const shake = captionAt(c, 'shake', frame) / 100, wave = captionAt(c, 'wave', frame) / 100, jitter = captionAt(c, 'jitter', frame) / 100;
  if (!shake && !wave && !jitter) return null;
  const fps = captionProject()?.comp.fps ?? 24, seed = [...c.text].reduce((h, ch) => (h * 33 + ch.charCodeAt(0)) >>> 0, 11);
  const rnd = (i: number, f: number, k: number) => { let x = Math.imul(seed ^ (i * 0x9e3779b1) ^ (f * 0x85ebca6b) ^ (k * 0xc2b2ae35), 0x27d4eb2d) >>> 0; x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d) >>> 0; x ^= x >>> 12; return (x >>> 0) / 4294967296 - 0.5; };
  const twos = Math.floor(frame / 2);
  return i => {
    // Shake: a new small jolt every frame; Wave: a ripple running along the words, once a second;
    // Jitter: hand-drawn boil, a little offset and turn that changes on twos
    const dx = shake * size * 0.14 * rnd(i, frame, 1) + jitter * size * 0.06 * rnd(i, twos, 3);
    const dy = shake * size * 0.14 * rnd(i, frame, 2) - wave * size * 0.32 * Math.sin((2 * Math.PI * frame) / fps - i * 0.55) + jitter * size * 0.06 * rnd(i, twos, 4);
    return { dx, dy, turn: jitter * 0.22 * rnd(i, twos, 5) + shake * 0.05 * rnd(i, frame, 6) };
  };
}

/** Stroke the first `share` (0..1) of a letter's contours, as if a pen were drawing its outline. */
function traceContours(g: CanvasRenderingContext2D, contours: Pt[][], length: number, share: number, dx: number, dy: number): void {
  let left = length * share;
  g.beginPath();
  for (const p of contours) {
    if (left <= 0) break;
    g.moveTo(p[0]!.x + dx, p[0]!.y + dy);
    for (let i = 1; i <= p.length && left > 0; i++) {
      const a = p[i - 1]!, b = p[i % p.length]!, d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d <= left) { g.lineTo(b.x + dx, b.y + dy); left -= d; continue; }
      const t = left / d;
      g.lineTo(a.x + (b.x - a.x) * t + dx, a.y + (b.y - a.y) * t + dy);
      left = 0;
    }
  }
  g.stroke();
}

/** Draw placed letters (with their motion and Write on), at most `budget`. Returns the letters left. */
function paintLetters(g: CanvasRenderingContext2D, c: CaptionSpec, size: number, letters: Placed[], frame: number, budget: number, write?: WriteState): number {
  const move = letterMotion(c, frame, size);
  g.textBaseline = 'middle';
  for (const l of letters) {
    if (budget <= 0) break;
    budget--;
    const order = write ? write.done++ : 0;
    if (l.ch === ' ') continue;
    // this letter's own progress: 0 not started, 1 written
    const u = write ? Math.max(0, Math.min(1, write.t * write.total - order)) : 1;
    if (u <= 0) continue;
    const m = move?.(l.index);
    g.save();
    g.translate(l.x + (m?.dx ?? 0), l.y + (m?.dy ?? 0));
    if (l.angle || m?.turn) g.rotate(l.angle + (m?.turn ?? 0));
    g.font = l.font; g.textAlign = l.centred ? 'center' : 'left';
    let fillA = 1;
    if (u < 1) {
      const f = glyphFont(c.font, l.bold, l.italic), trace = Math.min(1, u / 0.7);
      fillA = Math.max(0, Math.min(1, (u - 0.55) / 0.45));
      if (f) {
        // the pen draws the letter's outline, then the letter fills in
        // a face the font has no file for is faked (slanted, bolder) the way the browser fakes it
        const fake = syntheticFace(c.font, l.bold, l.italic);
        const gl = glyphOf(f, familyName(c.font, l.bold, l.italic), l.ch, size, fake.skew);
        g.strokeStyle = c.textOutline && c.textOutlineWidth > 0 ? c.textOutline : (l.color ?? c.textColor);
        g.lineWidth = Math.max(1, size * 0.04) + (fake.embolden ? emboldenWidth(size) : 0); g.lineJoin = 'round'; g.lineCap = 'round';
        traceContours(g, gl.contours, gl.length, trace, l.centred ? -gl.advance / 2 : 0, baselineOffset(f, size));
      } else {
        // outlines not ready (or a font with none to read): the letter wipes on from the left
        const w = g.measureText(l.ch).width, x0 = l.centred ? -w / 2 : 0;
        g.beginPath(); g.rect(x0 - size * 0.2, -size, (w + size * 0.4) * trace, size * 2); g.clip();
        fillA = 1;
      }
    }
    if (fillA > 0) {
      g.globalAlpha *= fillA;
      if (c.textOutline && c.textOutlineWidth > 0) { g.strokeStyle = c.textOutline; g.lineWidth = c.textOutlineWidth * size * 2; g.lineJoin = 'round'; g.strokeText(l.ch, 0, 0); }
      g.fillStyle = l.color ?? c.textColor;
      g.fillText(l.ch, 0, 0);
    }
    g.restore();
  }
  g.textAlign = 'start';
  return budget;
}

/** Each line of a balloon's words measured in its runs' own fonts (for alignment). */
function measureLines(g: CanvasRenderingContext2D, c: CaptionSpec, lay: CaptionLayout) {
  const size = lay.size, state = freshState();
  const lines = lay.fit.lines.map(line => {
    const runs = runsOf(line.text, state).map(r => {
      const bold = c.bold || r.bold, italic = c.italic || r.italic;
      const font = r.bold || r.italic ? captionFont({ ...c, bold, italic }, size) : lay.font;
      g.font = font;
      const w = g.measureText(r.text).width + lay.tracking * [...r.text].length;
      return { ...r, bold, italic, font, w };
    });
    return { y: line.y, runs, width: runs.reduce((n, r) => n + r.w, 0) - (runs.length ? lay.tracking : 0) };
  });
  const widest = Math.max(0, ...lines.map(l => l.width));
  const lineX = (w: number) => (c.align === 'left' ? c.x - widest / 2 : c.align === 'right' ? c.x + widest / 2 - w : c.x - w / 2);
  return { lines, lineX };
}

/** Every letter of a balloon placed one by one (kerning kept by measuring each prefix), or along its path. */
function placeWords(g: CanvasRenderingContext2D, c: CaptionSpec, lay: CaptionLayout): Placed[] {
  const curved = curvePath(c, lay);
  if (curved) return placeOnPath(g, c, lay, curved);
  const { lines, lineX } = measureLines(g, c, lay), letters: Placed[] = [];
  let index = 0;
  for (const line of lines) {
    let x = lineX(line.width);
    for (const r of line.runs) {
      g.font = r.font;
      const chars = [...r.text];
      chars.forEach((ch, i) => { letters.push({ ch, font: r.font, bold: r.bold, italic: r.italic, color: r.color, x: x + g.measureText(chars.slice(0, i).join('')).width + lay.tracking * i, y: c.y + line.y, angle: 0, centred: false, index: index++ }); });
      x += r.w;
    }
  }
  return letters;
}

/** Every letter of a caption (its joined balloons' too), placed: for exports that draw letters as shapes. */
export function captionLetters(c: CaptionSpec, frame: number, pageW: number, pageH: number): { caption: CaptionSpec; size: number; letters: Placed[] }[] {
  const g = (measureCanvas ??= document.createElement('canvas').getContext('2d')!);
  const { lay } = captionBalloon(c, frame, pageW, pageH);
  const pieces = [{ cap: c, lay }, ...captionLinks(c, frame, pageW, pageH).map(k => ({ cap: k.caption, lay: k.lay }))];
  return pieces.map(p => ({ caption: p.cap, size: p.lay.size, letters: placeWords(g, p.cap, p.lay) }));
}

/** Draw one balloon's words (styled runs), at most `budget` letters. Returns the letters left. */
function drawWords(g: CanvasRenderingContext2D, c: CaptionSpec, lay: CaptionLayout, budget: number, frame = 0, write?: WriteState): number {
  const size = lay.size;
  // moving, curved or writing letters are drawn one by one
  if (write || curvePath(c, lay) || letterMotion(c, frame, size)) return paintLetters(g, c, size, placeWords(g, c, lay), frame, budget, write);
  g.textBaseline = 'middle';
  const { lines, lineX } = measureLines(g, c, lay);
  for (const line of lines) {
    if (budget <= 0) break;
    let x = lineX(line.width);
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
function placeOnPath(g: CanvasRenderingContext2D, c: CaptionSpec, lay: CaptionLayout, path: Pt[]): Placed[] {
  const size = lay.size, state = freshState();
  // every letter with its own font (styled words) and width, the lines run together
  const letters: { ch: string; font: string; bold: boolean; italic: boolean; color: string | null; w: number }[] = [];
  lay.fit.lines.forEach((line, i) => {
    if (i) letters.push({ ch: ' ', font: lay.font, bold: c.bold, italic: c.italic, color: null, w: size * 0.3 });
    for (const r of runsOf(line.text, state)) {
      const bold = c.bold || r.bold, italic = c.italic || r.italic;
      const font = r.bold || r.italic ? captionFont({ ...c, bold, italic }, size) : lay.font;
      g.font = font;
      for (const ch of r.text) letters.push({ ch, font, bold, italic, color: r.color, w: g.measureText(ch).width + lay.tracking });
    }
  });
  const total = letters.reduce((n, l) => n + l.w, 0);
  let d = (pathLength(path) - total) / 2;
  return letters.map((l, index) => {
    const at = alongPath(path, d + l.w / 2);
    d += l.w;
    return { ch: l.ch, font: l.font, bold: l.bold, italic: l.italic, color: l.color, x: c.x + at.x, y: c.y + at.y, angle: at.angle, centred: true, index };
  });
}
