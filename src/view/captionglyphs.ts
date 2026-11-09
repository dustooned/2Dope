/**
 * Letter outlines from the caption fonts themselves (opentype.js, loaded only when a caption needs
 * outlines: Write on, an SVG export). A face is parsed once; until it is, `glyphFont` is null and the
 * renderer uses its fallback. WOFF2 fonts cannot be read this way and stay on the fallback.
 */
import type { Font } from 'opentype.js';
import { setGlyphStamp } from '../core/comp';
import type { Project } from '../core/project';
import { familyName } from '../lettering/fonts';
import type { Pt } from '../lettering/geometry';
import { captionFontBytes, captionProject, captionRedraw } from './captionfonts';

const fonts = new Map<string, { font: Font | null; promise: Promise<Font | null> }>();
let ready = 0;
setGlyphStamp(() => String(ready));

function load(project: Project, font: string, bold: boolean, italic: boolean): Promise<Font | null> {
  const key = familyName(font, bold, italic), have = fonts.get(key);
  if (have) return have.promise;
  const entry: { font: Font | null; promise: Promise<Font | null> } = { font: null, promise: Promise.resolve(null) };
  entry.promise = (async () => {
    try {
      const [{ parse }, bytes] = await Promise.all([import('opentype.js'), captionFontBytes(project, font, bold, italic)]);
      if (!bytes) return null;
      entry.font = parse(bytes);
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

/** A face's outlines if parsed (otherwise null, and it starts loading). */
export function glyphFont(font: string, bold: boolean, italic: boolean): Font | null {
  const have = fonts.get(familyName(font, bold, italic));
  if (have) return have.font;
  const project = captionProject();
  if (project) void load(project, font, bold, italic);
  return null;
}

/** Wait for a face's outlines (exports). */
export function glyphFontReady(project: Project, font: string, bold: boolean, italic: boolean): Promise<Font | null> {
  return load(project, font, bold, italic);
}

/** One letter's outline: closed contours as points (curves flattened), and their total length. */
export interface Glyph { contours: Pt[][]; length: number; advance: number }
const glyphs = new Map<string, Glyph>();

/**
 * A letter's outline at a pixel size, its left edge at x = 0 and its baseline at y = 0. Curves
 * become short straight steps (fine enough at the drawn size).
 */
export function glyphOf(f: Font, key: string, ch: string, size: number): Glyph {
  const id = `${key}|${ch}|${size.toFixed(2)}`, hit = glyphs.get(id);
  if (hit) return hit;
  const contours: Pt[][] = [];
  let cur: Pt[] = [], at: Pt = { x: 0, y: 0 };
  const steps = Math.max(4, Math.min(16, Math.round(size / 6)));
  for (const c of f.getPath(ch, 0, 0, size).commands) {
    if (c.type === 'M') { if (cur.length > 1) contours.push(cur); cur = [{ x: c.x, y: c.y }]; at = { x: c.x, y: c.y }; }
    else if (c.type === 'L') { cur.push({ x: c.x, y: c.y }); at = { x: c.x, y: c.y }; }
    else if (c.type === 'Q') {
      for (let i = 1; i <= steps; i++) { const t = i / steps, u = 1 - t; cur.push({ x: u * u * at.x + 2 * u * t * c.x1 + t * t * c.x, y: u * u * at.y + 2 * u * t * c.y1 + t * t * c.y }); }
      at = { x: c.x, y: c.y };
    } else if (c.type === 'C') {
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        cur.push({ x: u * u * u * at.x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x, y: u * u * u * at.y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y });
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
export function baselineOffset(f: Font, size: number): number {
  return ((f.ascender + f.descender) / 2) * (size / f.unitsPerEm);
}
