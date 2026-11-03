/**
 * SVG export of a drawing's vector lines (the hand-off format Clip Studio and Illustrator read).
 *
 * Each line becomes one stroked path along its centreline, with round caps and joins, its colour,
 * opacity and its average drawn width. SVG strokes have one width, so the per-point width profile
 * (pressure, point widths, tapers) rides along in `data-2dope-w` (half-widths, one per point), which
 * `readVectorSvg` reads back. Not exported: brush styles (stamps, tips, grain), selection clips and
 * fills; a styled line comes out as its centreline.
 */

import { strokeLength, type StrokeRecord } from '../core/stroke';
import { vectorWidths } from '../core/vectorcut';

const n2 = (v: number) => String(Math.round(v * 100) / 100);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** An SVG document of the given lines on a `width` × `height` page. */
export function vectorsToSvg(strokes: StrokeRecord[], width: number, height: number, title = '2Dope vector lines'): string {
  const paths: string[] = [];
  for (const rec of strokes) {
    if (rec.tool === 'eraser' || !rec.points.length) continue;
    if (rec.shape) {
      const s = rec.shape;
      paths.push(`  <path d="${esc(s.path)}" transform="matrix(${s.matrix.join(' ')})" fill="${s.fill ?? 'none'}" stroke="${s.stroke ?? 'none'}" stroke-width="${s.width}" fill-rule="${s.rule}" stroke-linecap="${s.cap}" stroke-linejoin="${s.join}" stroke-miterlimit="${s.miter}" opacity="${rec.brush.opacity}"/>`);
      continue;
    }
    const half = vectorWidths(rec, strokeLength(rec.points));
    const mean = half.reduce((a, b) => a + b, 0) / half.length;
    const pts = rec.points.length === 1 ? [rec.points[0]!, rec.points[0]!] : rec.points;
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${n2(p.x)} ${n2(p.y)}`).join(' ');
    const w = (rec.points.length === 1 ? [half[0]!, half[0]!] : half).map(n2).join(' ');
    const op = rec.brush.opacity < 1 ? ` stroke-opacity="${n2(rec.brush.opacity)}"` : '';
    paths.push(`  <path id="${esc(rec.id)}" d="${d}" fill="none" stroke="${rec.color}" stroke-width="${n2(mean * 2)}"${op} stroke-linecap="round" stroke-linejoin="round" data-2dope-w="${w}"/>`);
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <title>${esc(title)}</title>`,
    ...paths,
    '</svg>',
    '',
  ].join('\n');
}

export interface SvgLine {
  id: string;
  color: string;
  /** Stroke width as written (the line's average drawn width). */
  width: number;
  points: { x: number; y: number }[];
  /** Half-widths per point, when the file has the 2Dope width profile. */
  widths?: number[];
}

/** The lines of an SVG this exporter wrote (paths of M/L commands). Other paths are skipped. */
export function readVectorSvg(text: string): SvgLine[] {
  const out: SvgLine[] = [];
  for (const m of text.matchAll(/<path\b([^>]*)\/?>/g)) {
    const attrs = new Map([...m[1]!.matchAll(/([\w:-]+)="([^"]*)"/g)].map((a) => [a[1]!, a[2]!]));
    const d = attrs.get('d');
    if (!d || /[^ML0-9.,\s+\-eE]/.test(d)) continue;
    const nums = d.match(/-?[\d.]+(?:e[+-]?\d+)?/gi)?.map(Number) ?? [];
    if (nums.length < 2 || nums.length % 2 || nums.some((v) => !Number.isFinite(v))) continue;
    const points = [];
    for (let i = 0; i < nums.length; i += 2) points.push({ x: nums[i]!, y: nums[i + 1]! });
    const widths = attrs.get('data-2dope-w')?.trim().split(/\s+/).map(Number);
    out.push({
      id: attrs.get('id') ?? `svg${out.length + 1}`,
      color: attrs.get('stroke') ?? '#000000',
      width: Number(attrs.get('stroke-width') ?? 1),
      points,
      ...(widths && widths.length === points.length && widths.every(Number.isFinite) ? { widths } : {}),
    });
  }
  return out;
}
