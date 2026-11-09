/**
 * Letter outlines from the caption fonts themselves, loaded only when a caption needs outlines
 * (Write on, an SVG export, Convert to vector lines). TrueType and OpenType fonts are read with
 * opentype.js; WOFF2 fonts (compressed) with fontkit. Both load lazily; a face is read once, and
 * until it is, `glyphFont` is null and the renderer uses its fallback.
 */
import type { Font } from 'opentype.js';
import { setGlyphStamp } from '../core/comp';
import type { Project } from '../core/project';
import { bundledFile, bundledFont, familyName, isCustomFont } from '../lettering/fonts';
import type { Pt } from '../lettering/geometry';
import { captionFontBytes, captionProject, captionRedraw } from './captionfonts';

/** What 2Dope needs from a font: its outlines and widths (opentype.js's shape; fontkit is wrapped to match). */
type GlyphSource = Pick<Font, 'unitsPerEm' | 'ascender' | 'descender' | 'getPath' | 'getAdvanceWidth'>;

const fonts = new Map<string, { font: GlyphSource | null; promise: Promise<GlyphSource | null> }>();
let ready = 0;
setGlyphStamp(() => String(ready));

/** A WOFF2 font through fontkit, shaped like opentype.js (y down, pixel sizes). */
async function fromWoff2(bytes: ArrayBuffer): Promise<GlyphSource> {
  const { create } = await import('fontkit');
  const made = create(new Uint8Array(bytes)), f = 'fonts' in made ? made.fonts[0]! : made;
  const glyph = (ch: string) => f.glyphForCodePoint(ch.codePointAt(0) ?? 32);
  return {
    unitsPerEm: f.unitsPerEm,
    ascender: f.ascent,
    descender: f.descent,
    getAdvanceWidth: (ch, size) => glyph(ch).advanceWidth * (size / f.unitsPerEm),
    getPath: (ch, x, y, size) => {
      const k = size / f.unitsPerEm, X = (v: number) => x + v * k, Y = (v: number) => y - v * k;
      return {
        commands: glyph(ch).path.commands.map(({ command: c, args: a }) =>
          c === 'moveTo' ? { type: 'M' as const, x: X(a[0]!), y: Y(a[1]!) }
          : c === 'lineTo' ? { type: 'L' as const, x: X(a[0]!), y: Y(a[1]!) }
          : c === 'quadraticCurveTo' ? { type: 'Q' as const, x1: X(a[0]!), y1: Y(a[1]!), x: X(a[2]!), y: Y(a[3]!) }
          : c === 'bezierCurveTo' ? { type: 'C' as const, x1: X(a[0]!), y1: Y(a[1]!), x2: X(a[2]!), y2: Y(a[3]!), x: X(a[4]!), y: Y(a[5]!) }
          : { type: 'Z' as const }),
      };
    },
  };
}

function load(project: Project, font: string, bold: boolean, italic: boolean): Promise<GlyphSource | null> {
  const key = familyName(font, bold, italic), have = fonts.get(key);
  if (have) return have.promise;
  const entry: { font: GlyphSource | null; promise: Promise<GlyphSource | null> } = { font: null, promise: Promise.resolve(null) };
  entry.promise = (async () => {
    try {
      const bytes = await captionFontBytes(project, font, bold, italic);
      if (!bytes || bytes.byteLength < 4) return null;
      const tag = String.fromCharCode(...new Uint8Array(bytes.slice(0, 4)));
      if (tag === 'wOF2') entry.font = await fromWoff2(bytes);
      else {
        const { parse } = await import('opentype.js');
        try { entry.font = parse(bytes); } catch { entry.font = await fromWoff2(bytes); }
      }
      ready++;
      captionRedraw();
      return entry.font;
    } catch {
      return null;
    }
  })();
  fonts.set(key, entry);
  return entry.promise;
}

/** A face's outlines if read (otherwise null, and it starts loading). */
export function glyphFont(font: string, bold: boolean, italic: boolean): GlyphSource | null {
  const have = fonts.get(familyName(font, bold, italic));
  if (have) return have.font;
  const project = captionProject();
  if (project) void load(project, font, bold, italic);
  return null;
}

/** Wait for a face's outlines (exports). */
export function glyphFontReady(project: Project, font: string, bold: boolean, italic: boolean): Promise<GlyphSource | null> {
  return load(project, font, bold, italic);
}

/**
 * How the browser fakes a face the font has no file for (the way Chrome's Skia does it): a slant
 * of a quarter of the height, and a bolder outline grown by about a thirtieth of the size. A
 * project's own font is one file, so its bold and italic are always faked.
 */
export function syntheticFace(font: string, bold: boolean, italic: boolean): { skew: number; embolden: number } {
  let fakeBold = bold, fakeItalic = italic;
  if (!isCustomFont(font)) {
    const f = bundledFont(font) ?? bundledFont('comic-neue')!;
    if (!bundledFile(f, bold, italic).synthetic) { fakeBold = false; fakeItalic = false; }
  }
  return { skew: fakeItalic ? 0.25 : 0, embolden: fakeBold ? 1 : 0 };
}

/** The extra width Skia's fake bold strokes around a letter at a size (1/24 of it at 9 px down to 1/32 from 36 px). */
export function emboldenWidth(size: number): number {
  const t = Math.max(0, Math.min(1, (size - 9) / 27));
  return size * (1 / 24 + (1 / 32 - 1 / 24) * t);
}

/** One letter's outline: closed contours as points (curves flattened), and their total length. */
export interface Glyph { contours: Pt[][]; length: number; advance: number }
const glyphs = new Map<string, Glyph>();

/**
 * A letter's outline at a pixel size, its left edge at x = 0 and its baseline at y = 0, slanted by
 * `skew` (a faked italic leans right as it rises). Curves become short straight steps.
 */
export function glyphOf(f: GlyphSource, key: string, ch: string, size: number, skew = 0): Glyph {
  const id = `${key}|${ch}|${size.toFixed(2)}|${skew}`, hit = glyphs.get(id);
  if (hit) return hit;
  const contours: Pt[][] = [];
  let cur: Pt[] = [], at: Pt = { x: 0, y: 0 };
  const steps = Math.max(4, Math.min(16, Math.round(size / 6)));
  const put = (x: number, y: number) => cur.push({ x: x - skew * y, y });
  for (const c of f.getPath(ch, 0, 0, size).commands) {
    if (c.type === 'M') { if (cur.length > 1) contours.push(cur); cur = []; put(c.x, c.y); at = { x: c.x, y: c.y }; }
    else if (c.type === 'L') { put(c.x, c.y); at = { x: c.x, y: c.y }; }
    else if (c.type === 'Q') {
      for (let i = 1; i <= steps; i++) { const t = i / steps, u = 1 - t; put(u * u * at.x + 2 * u * t * c.x1 + t * t * c.x, u * u * at.y + 2 * u * t * c.y1 + t * t * c.y); }
      at = { x: c.x, y: c.y };
    } else if (c.type === 'C') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        put(u * u * u * at.x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x, u * u * u * at.y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y);
      }
      at = { x: c.x, y: c.y };
    } else { if (cur.length > 1) contours.push(cur); cur = []; }
  }
  if (cur.length > 1) contours.push(cur);
  let length = 0;
  for (const p of contours) for (let i = 0; i < p.length; i++) { const a = p[i]!, b = p[(i + 1) % p.length]!; length += Math.hypot(b.x - a.x, b.y - a.y); }
  const g = { contours, length, advance: f.getAdvanceWidth(ch, size) };
  if (glyphs.size > 2000) glyphs.delete(glyphs.keys().next().value!);
  glyphs.set(id, g);
  return g;
}

/** Where the baseline sits below a canvas 'middle' text line, for a face at a size. */
export function baselineOffset(f: GlyphSource, size: number): number {
  return ((f.ascender + f.descender) / 2) * (size / f.unitsPerEm);
}
