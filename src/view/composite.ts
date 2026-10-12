import { makeCanvas } from '../brush/raster';
import { drawVectorStroke } from '../brush/vector';
import { valueAt } from '../core/anim';
import {
  IDENTITY,
  invert,
  activeAt,
  skippedInExport,
  drawingOf,
  instanceComp,
  layerFrame,
  mul,
  nestedFrame,
  opacityAt,
  PART_NAMES,
  partOf,
  partsActive,
  viewMatrix,
  worldMatrix,
  type BlendMode,
  type Comp,
  type DrawingsLayer,
  type Layer,
  type Mat,
  type PartName,
} from '../core/comp';
import type { Drawing, Project } from '../core/project';
import { strokeLength } from '../core/stroke';

/** Which planes of each drawing to draw: everything, only linework (with vectors), or only fills. */
export type Planes = 'all' | 'line' | 'fill';

export interface CompositeOptions {
  planes?: Planes;
  /** Paint comp backgrounds (off for passes that must keep alpha, like lines and fills). */
  backgrounds?: boolean;
  /** Look through the topmost camera of the top comp (default true). */
  camera?: boolean;
  /** A layer of the top comp to leave out (the precomp being edited, when its context is shown). */
  skip?: string;
  /** Multiply the top comp's layers' opacity (context drawn faintly). */
  alpha?: number;
  /** A final render: guide layers (the storyboard) are left out unless set to export. */
  export?: boolean;
  /** Draw this drawing's pixels from other canvases (the stroke being painted right now). */
  source?: (d: Drawing) => { line: HTMLCanvasElement; fill: HTMLCanvasElement | null } | null;
}

const BLEND: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  add: 'lighter',
};

const MAX_DEPTH = 8;

/** Scratch canvases, one per nesting depth, reused between frames. */
const scratch = new Map<string, HTMLCanvasElement>();
function scratchFor(tag: string, w: number, h: number): HTMLCanvasElement {
  let c = scratch.get(tag);
  if (!c) {
    c = makeCanvas(w, h);
    scratch.set(tag, c);
  } else if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  } else {
    c.getContext('2d')?.clearRect(0, 0, w, h);
  }
  return c;
}

/** Free the compositor's scratch canvases (after an export). */
export function releaseScratch(): void {
  for (const c of scratch.values()) {
    c.width = 0;
    c.height = 0;
  }
  scratch.clear();
}

/** The layer a drawing is painted for, so its Line / Fill part settings apply. */
interface PartsCtx {
  layer: DrawingsLayer;
  /** The layer's own frame (part keys are in layer time). */
  lf: number;
  depth: number;
}

function paintPlanes(g: CanvasRenderingContext2D, d: Drawing, planes: Planes, opt?: CompositeOptions, parts?: PartsCtx): void {
  if (d.parked) return; // the caller pins what a frame needs; never draw a packed-away drawing
  const src = opt?.source?.(d) ?? { line: d.line, fill: d.fill };
  const paint = (t: CanvasRenderingContext2D, name: PartName) => {
    if (name === 'fill') {
      if (src.fill) t.drawImage(src.fill, 0, 0);
      return;
    }
    t.drawImage(src.line, 0, 0);
    for (const v of d.vectors) drawVectorStroke(t, v, strokeLength(v.points));
  };
  if (!parts || !partsActive(parts.layer)) {
    for (const name of PART_NAMES) if (planes === 'all' || planes === name) paint(g, name);
    return;
  }
  const base = g.globalAlpha;
  for (const name of PART_NAMES) {
    if (planes !== 'all' && planes !== name) continue;
    if (name === 'fill' && !src.fill) continue;
    const p = partOf(parts.layer, name);
    const a = p.visible ? Math.max(0, Math.min(1, valueAt(p.opacity, parts.lf) / 100)) : 0;
    if (a <= 0) continue;
    const [ox, oy] = valueAt(p.offset, parts.lf);
    g.save();
    g.translate(ox, oy);
    g.globalAlpha = base * a;
    if (p.tint) {
      // recolour: the part's pixels in one colour, keeping their alpha (anti-aliasing stays)
      const t = scratchFor(`t${parts.depth}`, src.line.width, src.line.height);
      const tg = t.getContext('2d')!;
      paint(tg, name);
      tg.globalCompositeOperation = 'source-in';
      tg.fillStyle = p.tint;
      tg.fillRect(0, 0, t.width, t.height);
      tg.globalCompositeOperation = 'source-over';
      g.drawImage(t, 0, 0);
    } else paint(g, name);
    g.restore();
  }
}

const toDom = (m: Mat) => new DOMMatrix(m);

/**
 * Draw one frame of a comp onto `g`, on top of the transform `g` already has (so callers can
 * scale for export). Layers draw bottom to top through the active camera, with their transform,
 * parenting, opacity and blend mode; precomps render into a scratch canvas first and then place
 * like any layer. The drawings a frame needs must be live (see core/residency.ts).
 */
export function drawComp(g: CanvasRenderingContext2D, project: Project, compId: string | Comp, frame: number, opt: CompositeOptions = {}, depth = 0): void {
  const comps = project.comps;
  const c = typeof compId === 'string' ? comps.get(compId) : compId;
  if (!c || depth > MAX_DEPTH) return;
  const planes = opt.planes ?? 'all';
  const base = g.getTransform();
  if (c.background && opt.backgrounds !== false) {
    g.fillStyle = c.background;
    g.fillRect(0, 0, c.width, c.height);
  }
  const view = depth === 0 && opt.camera === false ? ([1, 0, 0, 1, 0, 0] as Mat) : viewMatrix(c, frame, comps);
  for (let i = c.layers.length - 1; i >= 0; i--) {
    const l = c.layers[i]!;
    if (l.kind === 'camera' || l.kind === 'null' || !activeAt(l, frame, comps)) continue;
    if (depth === 0 && opt.skip === l.id) continue;
    if (opt.export && skippedInExport(l)) continue;
    const alpha = opacityAt(l, frame) * (depth === 0 ? (opt.alpha ?? 1) : 1);
    if (alpha <= 0) continue;
    const m = base.multiply(toDom(mul(view, worldMatrix(c, l, frame))));
    drawLayer(g, project, c, l, frame, m, alpha, planes, opt, depth);
  }
  g.setTransform(base);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

function drawLayer(g: CanvasRenderingContext2D, project: Project, c: Comp, l: Layer, frame: number, m: DOMMatrix, alpha: number, planes: Planes, opt: CompositeOptions, depth: number): void {
  let source: HTMLCanvasElement | null = null;
  let direct: Drawing | null = null;
  if (l.kind === 'drawings') {
    const id = drawingOf(l, frame);
    const d = id ? project.drawings.get(id) : undefined;
    if (!d || d.parked) return;
    // A plain layer draws straight in; with opacity or a blend mode the drawing is flattened first
    // so its fill does not show through its own lines.
    if (alpha >= 1 && l.blend === 'normal') direct = d;
    else {
      source = scratchFor(`d${depth}`, project.width, project.height);
      const sg = source.getContext('2d')!;
      paintPlanes(sg, d, planes, opt, { layer: l, lf: layerFrame(l, frame), depth });
    }
  } else if (l.kind === 'comp') {
    const n = project.comps.get(l.comp);
    const nf = n ? nestedFrame(l, frame, c.fps, n, project.comps) : null;
    if (!n || nf === null) return;
    source = scratchFor(`c${depth}`, n.width, n.height);
    const sg = source.getContext('2d')!;
    sg.setTransform(1, 0, 0, 1, 0, 0);
    drawComp(sg, project, instanceComp(n, l), nf, opt, depth + 1);
  }
  g.setTransform(m);
  g.globalAlpha = alpha;
  g.globalCompositeOperation = BLEND[l.blend];
  if (direct && l.kind === 'drawings') paintPlanes(g, direct, planes, opt, { layer: l, lf: layerFrame(l, frame), depth });
  else if (source) g.drawImage(source, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

/**
 * The Draw view's other layers: the comp's layers below (or above) the one being drawn on, at a
 * frame, placed relative to it (the drawn-on layer's page is the view's space). Cameras and nulls
 * are not drawn. `alpha` fades them (a light-table look); hidden layers stay hidden.
 */
export function drawLayersAround(g: CanvasRenderingContext2D, project: Project, c: Comp, frame: number, activeId: string, side: 'below' | 'above', alpha = 1, guideAlpha = 1): void {
  const comps = project.comps;
  const idx = c.layers.findIndex((l) => l.id === activeId);
  const active = idx >= 0 ? c.layers[idx]! : null;
  const rel = active ? invert(worldMatrix(c, active, frame)) : IDENTITY;
  const base = g.getTransform();
  for (let i = c.layers.length - 1; i >= 0; i--) {
    const l = c.layers[i]!;
    if (i === idx || l.kind === 'camera' || l.kind === 'null' || !activeAt(l, frame, comps)) continue;
    // layers[0] is the top; a layer not yet in the comp (a placeholder) goes to the bottom
    const above = idx < 0 || i < idx;
    if ((side === 'above') !== above) continue;
    const a = opacityAt(l, frame) * (l.guide ? guideAlpha : alpha);
    if (a <= 0) continue;
    drawLayer(g, project, c, l, frame, base.multiply(toDom(mul(rel, worldMatrix(c, l, frame)))), a, 'all', {}, 0);
  }
  g.setTransform(base);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}
