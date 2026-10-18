import { activeEffects } from '../core/effects';
import { drawEffected, releaseEffectScratch } from './effects';
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

// ---------------------------------------------------------------------------------------------
// Clipping masks

/** Can this layer clip to the one below? (drawings only; a storyboard guide never does). */
export const clips = (l: Layer): boolean => l.kind === 'drawings' && l.clip === true && !l.guide;

/** Clipping groups: each base layer's index -> the indices of the clipped layers stacked on it (layers[0] is the top). */
export function clipGroups(layers: Layer[]): Map<number, number[]> {
  const out = new Map<number, number[]>();
  for (let i = layers.length - 1; i >= 0; i--) {
    if (clips(layers[i]!)) continue;
    const members: number[] = [];
    for (let j = i - 1; j >= 0 && clips(layers[j]!); j--) members.push(j);
    if (members.length) out.set(i, members);
  }
  return out;
}

function fresh(tag: string, w: number, h: number): CanvasRenderingContext2D {
  const c = scratchFor(tag, w, h);
  const x = c.getContext('2d')!;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, w, h);
  return x;
}

/**
 * Draw a clipping group onto `g`: the base, then each clipped layer only where the base has paint.
 * `drawMask` draws the base at full strength (its pixels are the mask); the base itself shows at
 * `baseAlpha` (0 = mask only). Members draw at their own opacity and composite with their blend
 * mode; the whole group composites with the base's blend mode. Callbacks set their own transforms
 * (absolute, as on `g`): every scratch canvas has `g`'s size.
 */
export function drawClipGroup(
  g: CanvasRenderingContext2D,
  drawMask: (x: CanvasRenderingContext2D) => void,
  baseAlpha: number,
  baseBlend: BlendMode,
  members: { draw: (x: CanvasRenderingContext2D) => void; blend: BlendMode }[],
  key: string,
): void {
  const w = g.canvas.width, h = g.canvas.height;
  const t = g.getTransform();
  const mask = fresh(`clipm${key}`, w, h);
  mask.setTransform(t);
  drawMask(mask);
  const out = fresh(`clipo${key}`, w, h);
  if (baseAlpha > 0) {
    out.globalAlpha = baseAlpha;
    out.drawImage(mask.canvas, 0, 0);
    out.globalAlpha = 1;
  }
  for (const m of members) {
    const tmp = fresh(`clipt${key}`, w, h);
    tmp.setTransform(t);
    m.draw(tmp);
    tmp.setTransform(1, 0, 0, 1, 0, 0);
    tmp.globalAlpha = 1;
    tmp.globalCompositeOperation = 'destination-in';
    tmp.drawImage(mask.canvas, 0, 0);
    tmp.globalCompositeOperation = 'source-over';
    out.globalCompositeOperation = BLEND[m.blend];
    out.drawImage(tmp.canvas, 0, 0);
    out.globalCompositeOperation = 'source-over';
  }
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = BLEND[baseBlend];
  g.drawImage(out.canvas, 0, 0);
  g.restore();
}

/** A layer's own look with the blend mode left to the caller (used inside clipping groups). */
const plain = (l: Layer): Layer => (l.blend === 'normal' ? l : ({ ...l, blend: 'normal' } as Layer));

/** Free the compositor's scratch canvases (after an export). */
export function releaseScratch(): void {
  for (const c of scratch.values()) {
    c.width = 0;
    c.height = 0;
  }
  scratch.clear();
  releaseEffectScratch();
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
  const groups = clipGroups(c.layers);
  const shows = (l: Layer) => !(l.kind === 'camera' || l.kind === 'null' || !activeAt(l, frame, comps) || (depth === 0 && opt.skip === l.id) || (opt.export && skippedInExport(l)));
  const alphaOf = (l: Layer) => opacityAt(l, frame) * (depth === 0 ? (opt.alpha ?? 1) : 1);
  const matOf = (l: Layer) => base.multiply(toDom(mul(view, worldMatrix(c, l, frame))));
  for (let i = c.layers.length - 1; i >= 0; i--) {
    const l = c.layers[i]!;
    // a clipped layer draws with its base (a clipped layer with nothing to clip to shows nothing)
    if (clips(l)) continue;
    if (!shows(l)) continue;
    const members = groups.get(i);
    if (members) {
      drawClipGroup(
        g,
        (x) => drawLayer(x, project, c, plain(l), frame, matOf(l), 1, planes, opt, depth),
        alphaOf(l),
        l.blend,
        members.filter((j) => shows(c.layers[j]!) && alphaOf(c.layers[j]!) > 0).map((j) => {
          const cl = c.layers[j]!;
          return { draw: (x) => drawLayer(x, project, c, plain(cl), frame, matOf(cl), alphaOf(cl), planes, opt, depth), blend: cl.blend };
        }),
        `${depth}`,
      );
      continue;
    }
    const alpha = alphaOf(l);
    if (alpha <= 0) continue;
    drawLayer(g, project, c, l, frame, matOf(l), alpha, planes, opt, depth);
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
    // A plain layer draws straight in; with opacity, a blend mode or a mask the drawing is
    // flattened first (its fill does not show through its own lines; the mask takes paint away)
    const mask = l.mask ? project.drawings.get(l.mask) : undefined;
    const masked = !!mask && !mask.parked;
    const lf = layerFrame(l, frame);
    // effects (line boil...): the layer is painted part by part and processed first
    const fx = activeEffects(l).length ? drawEffected(l, lf, project.width, project.height, planes, depth, (t, part) => paintPlanes(t, d, part, opt, { layer: l, lf, depth }), opt.source ? undefined : `${d.id}:${d.rev}:${l.parts ? JSON.stringify(l.parts) : ''}`) : null;
    if (alpha >= 1 && l.blend === 'normal' && !masked && !fx) direct = d;
    else {
      source = scratchFor(`d${depth}`, project.width, project.height);
      const sg = source.getContext('2d')!;
      if (fx) {
        sg.setTransform(1, 0, 0, 1, 0, 0);
        sg.clearRect(0, 0, source.width, source.height);
        sg.drawImage(fx, 0, 0);
      } else paintPlanes(sg, d, planes, opt, { layer: l, lf, depth });
      if (masked) {
        sg.setTransform(1, 0, 0, 1, 0, 0);
        sg.globalAlpha = 1;
        sg.globalCompositeOperation = 'destination-out';
        sg.drawImage(mask.line, 0, 0);
        for (const v of mask.vectors) drawVectorStroke(sg, v);
        sg.globalCompositeOperation = 'source-over';
      }
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
export function drawLayersAround(g: CanvasRenderingContext2D, project: Project, c: Comp, frame: number, activeId: string, side: 'below' | 'above', alpha = 1, guideAlpha = 1, exclude?: Set<string>): void {
  const comps = project.comps;
  const idx = c.layers.findIndex((l) => l.id === activeId);
  const base = g.getTransform();
  const groups = clipGroups(c.layers);
  for (let i = c.layers.length - 1; i >= 0; i--) {
    const l = c.layers[i]!;
    if (i === idx || exclude?.has(l.id) || clips(l)) continue;
    // layers[0] is the top; a layer not yet in the comp (a placeholder) goes to the bottom
    const above = idx < 0 || i < idx;
    if ((side === 'above') !== above) continue;
    if (!showsAround(l, frame, comps)) continue;
    const members = groups.get(i)?.filter((j) => j !== idx && showsAround(c.layers[j]!, frame, comps));
    if (members?.length) {
      drawClipGroup(
        g,
        (x) => drawLayerAround(x, project, c, frame, activeId, plain(l), 1, base),
        aroundAlpha(l, frame, alpha, guideAlpha),
        l.blend,
        members.map((j) => {
          const cl = c.layers[j]!;
          return { draw: (x) => drawLayerAround(x, project, c, frame, activeId, plain(cl), aroundAlpha(cl, frame, alpha, guideAlpha), base), blend: cl.blend };
        }),
        'around',
      );
      continue;
    }
    const a = aroundAlpha(l, frame, alpha, guideAlpha);
    if (a <= 0) continue;
    drawLayerAround(g, project, c, frame, activeId, l, a, base);
  }
  g.setTransform(base);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

const showsAround = (l: Layer, frame: number, comps: ReadonlyMap<string, Comp>) => !(l.kind === 'camera' || l.kind === 'null' || !activeAt(l, frame, comps));
const aroundAlpha = (l: Layer, frame: number, alpha: number, guideAlpha: number) => opacityAt(l, frame) * (l.guide ? guideAlpha : alpha);

/**
 * One layer of the Draw view, placed relative to the layer being drawn on (its page is the view's
 * space). `base` is the view transform the Draw view started from.
 */
export function drawLayerAround(g: CanvasRenderingContext2D, project: Project, c: Comp, frame: number, activeId: string, l: Layer, alpha: number, base: DOMMatrix): void {
  const active = c.layers.find((x) => x.id === activeId);
  const rel = active ? invert(worldMatrix(c, active, frame)) : IDENTITY;
  drawLayer(g, project, c, l, frame, base.multiply(toDom(mul(rel, worldMatrix(c, l, frame)))), alpha, 'all', {}, 0);
  g.setTransform(base);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}
