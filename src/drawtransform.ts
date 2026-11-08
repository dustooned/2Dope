/**
 * Draw/Animate selection Transform: the live session state and the geometry, pixel and overlay work
 * that does not need the rest of App. App owns the session (starting, History, notices); this
 * module answers "where are the handles", "what does a drag do" and "paint the preview".
 */
import { makeCanvas } from './brush/raster';
import type { Drawing } from './core/project';
import type { StrokeRecord } from './core/stroke';
import { drawVectorStroke } from './brush/vector';
import { vectorSelected } from './core/vectorstyle';
import type { Area } from './fill/fill';
import { applyPoint, clipRect, invert, matrixFor, overallScale, transformedRect, transformRegion, transformVectors, unionRect, type Interpolation, type Rect, type XParams } from './core/selxform';
import { deformation, transformNodes, validTransformNodes, type Point, type TransformMode } from './core/transformmesh';

export type TransformGrab = { kind: 'scale' | 'rotate' | 'move' | 'deform'; handle: number };

export interface TransformDrag {
  id: number; kind: TransformGrab['kind']; x: number; y: number; base: XParams;
  anchor: Point; anchorLocal: Point; d0: number; a0: number; lx: number; ly: number;
  handle: number; nodes: Point[] | null; nodeStart: Point[] | null; guides?: [number | null, number | null];
}

/** A live selection transform: the selected pixels (and whole vector strokes inside) are previewed on the canvases, one undo step on Apply. */
export interface TransformState {
  d: Drawing; area: Area; points: [number, number][]; pivot: [number, number]; params: XParams;
  whole: boolean; nodes: Point[] | null; vectorPixels?: ImageData; vectorBounds?: Rect | null; rasterIds?: Set<string>;
  baseLine: ImageData; baseFill: ImageData | null; vectors: StrokeRecord[]; region: Rect | null;
  drag: TransformDrag | null;
}

export interface TransformFrame { corners: Point[]; handles: Point[]; outline: Point[]; centre: Point; knob: Point }

/** Settings the Transform options row changes; they last for the session, not the project. */
export interface TransformOptions {
  mode: TransformMode;
  interpolation: Interpolation;
  snap: boolean;
  magnetics: boolean;
  snapDistance: number;
}

const clampParams = (p: XParams): XParams => {
  p.scale = Math.max(0.1, Math.min(8, p.scale));
  if (p.sx !== undefined) p.sx = Math.max(0.05, Math.min(20, p.sx));
  if (p.sy !== undefined) p.sy = Math.max(0.05, Math.min(20, p.sy));
  p.rotate = ((((p.rotate + 180) % 360) + 360) % 360) - 180;
  return p;
};

export const patchParams = (params: XParams, patch: Partial<XParams>): XParams => clampParams({ ...params, ...patch });

/** Corners of the transformed selection box, its centre, and the rotate knob (document space). */
export function transformFrame(x: TransformState, mode: TransformMode, zoom: number): TransformFrame {
  const m = matrixFor(x.params, x.pivot[0], x.pivot[1]);
  const warp = x.nodes && deformation(x.area, x.nodes, m);
  const grid = transformNodes(x.area, 3).map(p => warp ? warp.forward(...p) : applyPoint(m, ...p));
  const corners = [0, 2, 8, 6].map(i => grid[i]!);
  const outline = [0, 1, 2, 5, 8, 7, 6, 3].map(i => grid[i]!);
  const handles = mode === 'warp' ? grid : mode === 'distort' ? corners : outline;
  const centre = applyPoint(m, x.pivot[0], x.pivot[1]);
  // the knob sits beyond the middle of the top edge, away from the centre
  const top = grid[1]!;
  const len = Math.hypot(top[0] - centre[0], top[1] - centre[1]) || 1;
  const reach = 34 / zoom;
  const knob: Point = [top[0] + ((top[0] - centre[0]) / len) * reach, top[1] + ((top[1] - centre[1]) / len) * reach];
  return { corners, handles, outline, centre, knob };
}

/** What a touch at document point (px, py) grabs: a handle scales or deforms, the knob rotates, anywhere else moves. */
export function transformGrab(f: TransformFrame, mode: TransformMode, zoom: number, px: number, py: number): TransformGrab {
  const r = 26 / zoom;
  if (Math.hypot(px - f.knob[0], py - f.knob[1]) <= r) return { kind: 'rotate', handle: -1 };
  let nearest = r, handle = -1;
  f.handles.forEach((p, i) => { const distance = Math.hypot(px - p[0], py - p[1]); if (distance < nearest) { nearest = distance; handle = i; } });
  return { kind: handle < 0 ? 'move' : mode === 'warp' || mode === 'distort' ? 'deform' : 'scale', handle };
}

/** The selection outline where the transform would leave it. */
export function transformedPoints(x: TransformState): [number, number][] {
  const m = matrixFor(x.params, x.pivot[0], x.pivot[1]);
  const warp = x.nodes && deformation(x.area, x.nodes, m);
  return x.points.map(p => warp ? warp.forward(...p) : applyPoint(m, ...p));
}

/** Width and height before rotation, in drawing pixels, and the angle. */
export function transformSize(x: TransformState): { width: number; height: number; angle: number } {
  const nodes = x.nodes ?? transformNodes(x.area, 2);
  const xs = nodes.map(p => p[0]), ys = nodes.map(p => p[1]);
  return {
    width: (Math.max(...xs) - Math.min(...xs)) * x.params.scale * (x.params.sx ?? 1),
    height: (Math.max(...ys) - Math.min(...ys)) * x.params.scale * (x.params.sy ?? 1),
    angle: x.params.rotate,
  };
}

/** Scale to fit the page, centred, with no rotation. */
export function fitParams(x: TransformState, W: number, H: number): XParams {
  const points = x.nodes ?? transformNodes(x.area, 2);
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  const scale = Math.max(0.1, Math.min(8, W / (right - left), H / (bottom - top)));
  const params = { ...x.params, scale, sx: 1, sy: 1, rotate: 0, dx: 0, dy: 0 };
  const centre = applyPoint(matrixFor(params, ...x.pivot), (left + right) / 2, (top + bottom) / 2);
  return { ...params, dx: W / 2 - centre[0], dy: H / 2 - centre[1] };
}

/**
 * Paint the current transform onto the drawing's canvases (preview), from the saved base pixels.
 * Returns true the first time a warp turns selected vectors into pixels, so the caller can say so.
 */
export function paintTransform(x: TransformState, W: number, H: number, interpolation: Interpolation, lengthOf: (v: StrokeRecord) => number): boolean {
  const a = x.area;
  const m = matrixFor(x.params, x.pivot[0], x.pivot[1]);
  const warp = x.nodes && deformation(a, x.nodes, m);
  let rasterized = false;
  if (warp && !x.rasterIds) {
    const picked = x.vectors.filter(v => vectorSelected(v, a.mask, W, H));
    x.rasterIds = new Set(picked.map(v => v.id));
    if (picked.length) {
      const canvas = makeCanvas(W, H), g = canvas.getContext('2d')!;
      for (const v of picked) drawVectorStroke(g, v, lengthOf(v));
      x.vectorPixels = g.getImageData(0, 0, W, H);
      let left = W, top = H, right = 0, bottom = 0;
      for (let y = 0; y < H; y++) for (let col = 0; col < W; col++) {
        if (!x.vectorPixels.data[(y * W + col) * 4 + 3]) continue;
        left = Math.min(left, col); top = Math.min(top, y);
        right = Math.max(right, col + 1); bottom = Math.max(bottom, y + 1);
      }
      x.vectorBounds = clipRect(left, top, right, bottom, W, H);
      canvas.width = 0;
      rasterized = true;
    }
  }
  const bounds = warp ? clipRect(
    Math.floor(Math.min(...warp.points.map(p => p[0]))) - 2, Math.floor(Math.min(...warp.points.map(p => p[1]))) - 2,
    Math.ceil(Math.max(...warp.points.map(p => p[0]))) + 2, Math.ceil(Math.max(...warp.points.map(p => p[1]))) + 2, W, H,
  ) : transformedRect(m, a, W, H);
  const source = unionRect(clipRect(a.x0, a.y0, a.x1 + 1, a.y1 + 1, W, H), warp ? x.vectorBounds ?? null : null);
  const region = unionRect(unionRect(bounds, source), x.region);
  x.region = region;
  if (!region) return rasterized;
  const put = (canvas: HTMLCanvasElement, base: ImageData) =>
    canvas.getContext('2d')!.putImageData(new ImageData(transformRegion(base.data, W, H, a.mask, m, region, interpolation, warp ? warp.inverse : undefined), region.w, region.h), region.x, region.y);
  put(x.d.line, x.baseLine);
  if (x.baseFill && x.d.fill) put(x.d.fill, x.baseFill);
  if (warp) {
    if (x.vectorPixels) {
      const canvas = makeCanvas(region.w, region.h);
      canvas.getContext('2d')!.putImageData(new ImageData(transformRegion(x.vectorPixels.data, W, H, a.mask, m, region, interpolation, warp.inverse), region.w, region.h), 0, 0);
      x.d.line.getContext('2d')!.drawImage(canvas, region.x, region.y);
      canvas.width = 0;
    }
    x.d.vectors = x.vectors.filter(v => !x.rasterIds!.has(v.id));
  } else x.d.vectors = transformVectors(x.vectors, a.mask, W, H, m, overallScale(x.params)).vectors;
  x.d.rev++;
  return rasterized;
}

/** Put the drawing back the way it was before the transform started. Returns true if anything was painted. */
export function restoreTransform(x: TransformState): boolean {
  const r = x.region;
  if (!r) return false;
  const back = (canvas: HTMLCanvasElement | null, base: ImageData | null) => {
    if (canvas && base) canvas.getContext('2d')!.putImageData(base, 0, 0, r.x, r.y, r.w, r.h);
  };
  back(x.d.line, x.baseLine);
  back(x.d.fill, x.baseFill);
  x.d.vectors = x.vectors;
  return true;
}

/** Before and after pixels of the painted region, for one undo step. */
export function transformChange(x: TransformState, region: Rect, W: number): { lineBefore: ImageData; lineAfter: ImageData; fillBefore: ImageData | null; fillAfter: ImageData | null } {
  const grab = (base: ImageData) => {
    const b = new ImageData(region.w, region.h);
    for (let y = 0; y < region.h; y++) {
      const from = ((region.y + y) * W + region.x) * 4;
      b.data.set(base.data.subarray(from, from + region.w * 4), y * region.w * 4);
    }
    return b;
  };
  const d = x.d;
  return {
    lineBefore: grab(x.baseLine),
    lineAfter: d.line.getContext('2d')!.getImageData(region.x, region.y, region.w, region.h),
    fillBefore: x.baseFill ? grab(x.baseFill) : null,
    fillAfter: x.baseFill && d.fill ? d.fill.getContext('2d')!.getImageData(region.x, region.y, region.w, region.h) : null,
  };
}

/** Start a drag on the transform: what was grabbed and where it is anchored. */
export function beginTransformDrag(x: TransformState, f: TransformFrame, grab: TransformGrab, mode: TransformMode, id: number, px: number, py: number): TransformDrag {
  const m = matrixFor(x.params, ...x.pivot);
  const anchor = grab.kind === 'scale' ? f.handles[(grab.handle + 4) % 8]! : f.centre;
  const local = invert(m)!;
  const [lx, ly] = localOf(x.params.rotate, px - anchor[0], py - anchor[1]);
  let nodeStart = x.nodes;
  if (grab.kind === 'deform' && mode === 'warp' && x.nodes?.length !== 9) {
    const warped = x.nodes && deformation(x.area, x.nodes, m);
    nodeStart = transformNodes(x.area, 3).map(pt => warped ? applyPoint(local, ...warped.forward(...pt)) : pt);
  } else if (grab.kind === 'deform' && !nodeStart) nodeStart = transformNodes(x.area, 2);
  return {
    id, ...grab, x: px, y: py, base: { ...x.params, sx: x.params.sx ?? 1, sy: x.params.sy ?? 1 }, anchor, anchorLocal: applyPoint(local, ...anchor),
    d0: Math.max(1, Math.hypot(px - anchor[0], py - anchor[1])), a0: Math.atan2(py - anchor[1], px - anchor[0]),
    lx, ly, nodes: x.nodes, nodeStart,
  };
}

/** A drag in the selection's own frame (undoing its rotation). */
export function localOf(rotate: number, dx: number, dy: number): [number, number] {
  const r = -(rotate * Math.PI) / 180;
  return [dx * Math.cos(r) - dy * Math.sin(r), dx * Math.sin(r) + dy * Math.cos(r)];
}

/**
 * Where a drag to (px, py) takes the transform. `params` is the new parameter set (or null to keep
 * them), `nodes` the new deform cage (or undefined to keep it).
 */
export function dragTransform(
  x: TransformState, xd: TransformDrag, o: TransformOptions, px: number, py: number, shift: boolean, zoom: number, W: number, H: number,
): { params?: XParams; nodes?: Point[] | null } {
  const base = xd.base;
  const dx = px - xd.x, dy = py - xd.y;
  if (xd.kind === 'move') {
    let tx = dx, ty = dy;
    xd.guides = undefined;
    const constrained = o.magnetics || shift;
    const horizontal = Math.abs(tx) >= Math.abs(ty);
    if (constrained) {
      if (horizontal) ty = 0; else tx = 0;
    }
    if (o.snap) {
      const guides: [number | null, number | null] = xd.guides = [null, null];
      const m = matrixFor(base, ...x.pivot);
      const cage = xd.nodes && deformation(x.area, xd.nodes, m);
      const points = cage ? cage.points : transformNodes(x.area, 2).map(pt => applyPoint(m, ...pt));
      const align = (axis: 0 | 1, shiftBy: number, size: number) => {
        const coords = points.map(pt => pt[axis]), lo = Math.min(...coords), hi = Math.max(...coords);
        const targets = [0, size / 2, size];
        const deltas = [-lo - shiftBy, size / 2 - (lo + hi) / 2 - shiftBy, size - hi - shiftBy];
        const index = deltas.reduce((best, v, i) => Math.abs(v) < Math.abs(deltas[best]!) ? i : best, 0);
        const nearest = deltas[index]!;
        if (Math.abs(nearest) > o.snapDistance / zoom) return shiftBy;
        guides[axis] = targets[index]!;
        return shiftBy + nearest;
      };
      if (!constrained || horizontal) tx = align(0, tx, W);
      if (!constrained || !horizontal) ty = align(1, ty, H);
    }
    return { params: patchParams(x.params, { dx: base.dx + tx, dy: base.dy + ty }) };
  }
  if (xd.kind === 'deform') {
    if (!dx && !dy) return x.nodes !== xd.nodes ? { nodes: xd.nodes } : {};
    const inv = invert(matrixFor(base, ...x.pivot))!;
    const tx = inv[0] * dx + inv[2] * dy, ty = inv[1] * dx + inv[3] * dy;
    const nodes = xd.nodeStart!;
    const picked = o.mode === 'warp' ? xd.handle : (nodes.length === 9 ? [0, 2, 8, 6] : [0, 1, 3, 2])[xd.handle]!;
    const next = nodes.map(([nx, ny], i): Point => {
      let weight = Number(i === picked);
      if (o.mode === 'distort' && nodes.length === 9)
        weight = (1 - Math.abs((i % 3) - (picked % 3)) / 2) * (1 - Math.abs(Math.floor(i / 3) - Math.floor(picked / 3)) / 2);
      return [nx + tx * weight, ny + ty * weight];
    });
    return validTransformNodes(next) ? { nodes: next } : {};
  }
  const [ax, ay] = xd.anchor;
  if (xd.kind === 'scale') {
    const next = { ...base };
    if (o.mode === 'freeform') {
      const [lx, ly] = localOf(x.params.rotate, px - ax, py - ay);
      const h = xd.handle;
      if (h % 2 === 0 || h === 3 || h === 7) next.sx = Math.max(0.05, Math.min(20, (base.sx ?? 1) * lx / (xd.lx || 1)));
      if (h % 2 === 0 || h === 1 || h === 5) next.sy = Math.max(0.05, Math.min(20, (base.sy ?? 1) * ly / (xd.ly || 1)));
    } else next.scale = Math.max(0.1, Math.min(8, base.scale * Math.hypot(px - ax, py - ay) / xd.d0));
    const moved = applyPoint(matrixFor(next, ...x.pivot), ...xd.anchorLocal);
    next.dx += ax - moved[0]; next.dy += ay - moved[1];
    return { params: patchParams(x.params, next) };
  }
  let deg = base.rotate + ((Math.atan2(py - ay, px - ax) - xd.a0) * 180) / Math.PI;
  const snap = Math.round(deg / 15) * 15;
  if (o.snap && Math.abs(deg - snap) < Math.min(7, o.snapDistance * 3 / 8)) deg = snap;
  return { params: patchParams(x.params, { rotate: deg }) };
}

/** The cage, handles, rotate knob, snap guides and the live size/angle badge. */
export function drawTransformHandles(
  g: CanvasRenderingContext2D, x: TransformState, f: TransformFrame, mode: TransformMode,
  view: { zoom: number; dpr: number; docW: number; docH: number; screenW: number; screenH: number; toScreen: (p: Point) => { x: number; y: number } },
): void {
  const z = view.zoom;
  g.save();
  g.lineWidth = 1.5 / z;
  const guides = x.drag?.guides;
  if (guides) {
    g.strokeStyle = '#4aa3ff';
    g.setLineDash([6 / z, 4 / z]);
    g.beginPath();
    if (guides[0] !== null) { g.moveTo(guides[0], 0); g.lineTo(guides[0], view.docH); }
    if (guides[1] !== null) { g.moveTo(0, guides[1]); g.lineTo(view.docW, guides[1]); }
    g.stroke();
    g.setLineDash([]);
  }
  g.strokeStyle = '#4aa3ff';
  g.beginPath();
  f.outline.forEach((c, i) => (i ? g.lineTo(c[0], c[1]) : g.moveTo(c[0], c[1])));
  g.closePath();
  g.stroke();
  const top = f.outline[1]!;
  g.beginPath();
  g.moveTo(top[0], top[1]);
  g.lineTo(f.knob[0], f.knob[1]);
  g.stroke();
  const dot = (p: Point, r: number) => {
    g.beginPath();
    g.arc(p[0], p[1], r / z, 0, Math.PI * 2);
    g.fillStyle = '#fff';
    g.fill();
    g.stroke();
  };
  if (mode === 'warp') {
    for (const [a, b, c] of [[1, 4, 7], [3, 4, 5]] as const) {
      g.beginPath(); g.moveTo(...f.handles[a]!); g.lineTo(...f.handles[b]!); g.lineTo(...f.handles[c]!); g.stroke();
    }
  }
  for (const c of f.handles) dot(c, 7);
  dot(f.knob, 11);
  const drag = x.drag;
  if (drag) {
    const size = transformSize(x);
    const label = drag.kind === 'rotate' ? `${size.angle.toFixed(1)}°` : `${Math.round(size.width)} × ${Math.round(size.height)} px`;
    const p = view.toScreen(f.knob);
    g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    g.font = '600 12px system-ui';
    g.textBaseline = 'middle';
    const width = g.measureText(label).width + 16;
    const left = Math.max(4, Math.min(p.x - width / 2, view.screenW - width - 4));
    const tp = Math.max(4, Math.min(p.y - 38, view.screenH - 28));
    g.fillStyle = '#222633';
    g.fillRect(left, tp, width, 24);
    g.fillStyle = '#fff';
    g.fillText(label, left + 8, tp + 12);
  }
  g.restore();
}
