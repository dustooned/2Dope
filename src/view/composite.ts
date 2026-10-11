import { makeCanvas } from '../brush/raster';
import { drawVectorStroke } from '../brush/vector';
import { activeAt, drawingOf, mul, nestedFrame, opacityAt, viewMatrix, worldMatrix, type BlendMode, type Comp, type Layer, type Mat } from '../core/comp';
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

function paintPlanes(g: CanvasRenderingContext2D, d: Drawing, planes: Planes, opt?: CompositeOptions): void {
  if (d.parked) return; // the caller pins what a frame needs; never draw a packed-away drawing
  const src = opt?.source?.(d) ?? { line: d.line, fill: d.fill };
  if (planes !== 'line' && src.fill) g.drawImage(src.fill, 0, 0);
  if (planes !== 'fill') {
    g.drawImage(src.line, 0, 0);
    for (const v of d.vectors) drawVectorStroke(g, v, strokeLength(v.points));
  }
}

const toDom = (m: Mat) => new DOMMatrix(m);

/**
 * Draw one frame of a comp onto `g`, on top of the transform `g` already has (so callers can
 * scale for export). Layers draw bottom to top through the active camera, with their transform,
 * parenting, opacity and blend mode; precomps render into a scratch canvas first and then place
 * like any layer. The drawings a frame needs must be live (see core/residency.ts).
 */
export function drawComp(g: CanvasRenderingContext2D, project: Project, compId: string, frame: number, opt: CompositeOptions = {}, depth = 0): void {
  const comps = project.comps;
  const c = comps.get(compId);
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
    const alpha = opacityAt(l, frame);
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
      paintPlanes(sg, d, planes, opt);
    }
  } else if (l.kind === 'comp') {
    const n = project.comps.get(l.comp);
    const nf = n ? nestedFrame(l, frame, c.fps, n, project.comps) : null;
    if (!n || nf === null) return;
    source = scratchFor(`c${depth}`, n.width, n.height);
    const sg = source.getContext('2d')!;
    sg.setTransform(1, 0, 0, 1, 0, 0);
    drawComp(sg, project, n.id, nf, opt, depth + 1);
  }
  g.setTransform(m);
  g.globalAlpha = alpha;
  g.globalCompositeOperation = BLEND[l.blend];
  if (direct) paintPlanes(g, direct, planes, opt);
  else if (source) g.drawImage(source, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}
