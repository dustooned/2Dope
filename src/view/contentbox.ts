import type { Vec2 } from '../core/anim';
import { apply, contentFrameAt, compLength, nestedFrame, worldMatrix, type Comp, type Layer } from '../core/comp';
import type { Drawing, Project } from '../core/project';
import { drawingAt, totalFrames } from '../core/timeline';

/** A rectangle in some layer's own space. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The smallest rectangle holding every pixel with alpha > 0 in RGBA data, or null when blank.
 * Scans rows from the top and bottom, then columns only inside those rows.
 */
export function alphaBox(data: Uint8ClampedArray, w: number, h: number): Box | null {
  const rowHas = (y: number) => {
    for (let i = y * w * 4 + 3, end = i + w * 4; i < end; i += 4) if (data[i]) return true;
    return false;
  };
  let top = 0;
  while (top < h && !rowHas(top)) top++;
  if (top === h) return null;
  let bottom = h - 1;
  while (bottom > top && !rowHas(bottom)) bottom--;
  const colHas = (x: number) => {
    for (let y = top; y <= bottom; y++) if (data[(y * w + x) * 4 + 3]) return true;
    return false;
  };
  let left = 0;
  while (left < w && !colHas(left)) left++;
  let right = w - 1;
  while (right > left && !colHas(right)) right--;
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

export function union(a: Box | null, b: Box | null): Box | null {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function canvasBox(c: HTMLCanvasElement | null): Box | null {
  if (!c || !c.width || !c.height) return null;
  const g = c.getContext('2d');
  if (!g) return null;
  return alphaBox(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
}

const cache = new WeakMap<Drawing, { rev: number; box: Box | null }>();

/**
 * What a drawing actually covers (fill, line and vector strokes), cached per revision. A parked
 * drawing answers from the cache (its pixels cannot change while parked), or `undefined` when it
 * was never measured, so callers can fall back to the page.
 */
export function drawingBox(d: Drawing): Box | null | undefined {
  const hit = cache.get(d);
  if (hit && (hit.rev === d.rev || d.parked)) return hit.box;
  if (d.parked) return undefined;
  let box = union(canvasBox(d.line), canvasBox(d.fill));
  for (const v of d.vectors) {
    const pad = v.brush.size * 2;
    for (const p of v.points) box = union(box, { x: p.x - pad, y: p.y - pad, w: pad * 2, h: pad * 2 });
  }
  cache.set(d, { rev: d.rev, box });
  return box;
}

/**
 * What a layer shows at a comp frame, in the layer's own space: the drawing on screen, or for a
 * precomp the union of what its layers show. `null` = nothing visible, `undefined` = unknown
 * (a parked drawing never measured).
 */
export function layerContentBox(project: Project, comp: Comp, l: Layer, compFrame: number, depth = 0): Box | null | undefined {
  if (l.kind === 'drawings') {
    const f = contentFrameAt(l, compFrame, totalFrames(l.exposures), project.comps, comp.fps);
    if (f === null) return null;
    const id = drawingAt(l.exposures, f);
    if (!id) return null;
    const d = project.drawings.get(id);
    return d ? drawingBox(d) : undefined;
  }
  if (l.kind !== 'comp' || depth > 8) return null;
  const nested = project.comps.get(l.comp);
  if (!nested) return null;
  const nf = nestedFrame(l, compFrame, comp.fps, nested, project.comps);
  if (nf === null || nf >= compLength(nested, project.comps)) return null;
  let out: Box | null = null;
  for (const child of nested.layers) {
    if (child.kind !== 'drawings' && child.kind !== 'comp') continue;
    const b = layerContentBox(project, nested, child, nf, depth + 1);
    if (b === undefined) return undefined;
    if (!b) continue;
    const m = worldMatrix(nested, child, nf);
    const pts: Vec2[] = [
      [b.x, b.y],
      [b.x + b.w, b.y],
      [b.x + b.w, b.y + b.h],
      [b.x, b.y + b.h],
    ].map((p) => apply(m, p as Vec2));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    out = union(out, { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) });
  }
  return out;
}
