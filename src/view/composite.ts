import { activeEffects, artReach, effectsPad, temporalEffect, temporalSamples } from '../core/effects';
import { drawEffected, fxPreview, fxPreviewScale, releaseEffectScratch } from './effects';
import { paintCaption } from './caption';
import { captionAtFrame, captionSignature, videoAt } from '../core/comp';
import { videoFrame, videoFrameReady } from './videoframes';
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
  vectorTweenAt,
  worldMatrix,
  type BlendMode,
  type Comp,
  type DrawingsLayer,
  type Layer,
  type Mat,
  type PartName,
  type PartGrad,
} from '../core/comp';
import type { Drawing, Project } from '../core/project';
import { strokeLength, type StrokeRecord } from '../core/stroke';
import { tweenStrokes } from '../core/vectortween';

/** Which planes of each drawing to draw: everything, only linework (with vectors), or only fills. */
/** `ink` and `text` split a caption's Ink plane into its balloon ink and its letters (other drawings: ink = line, text = nothing). */
export type Planes = 'all' | 'line' | 'fill' | 'ink' | 'text';

/** Resident pixels and preview-only ink supplied by the drawing tool. Never saved as artwork. */
export interface DrawingSource {
  line: HTMLCanvasElement;
  fill: HTMLCanvasElement | null;
  vectors?: readonly StrokeRecord[];
  vectorLength?: (v: StrokeRecord) => number;
  overlay?: (g: CanvasRenderingContext2D, part: PartName) => void;
}

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
  /** A guide layer of the top comp to render even in a final render (the board in an animatic). */
  guide?: string;
  /** With `guide`: draw only that layer of the top comp (a board-only animatic). */
  onlyGuide?: boolean;
  /** Draw this drawing's pixels from other canvases (the stroke being painted right now). */
  source?: (d: Drawing) => DrawingSource | null;
  /** Echo reads a past source without starting another temporal history from that sample. */
  temporal?: false;
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
  /** The comp and its frame (a caption's tail can follow another layer). */
  comp?: Comp;
  frame?: number;
  /** The project (a movie layer's movie size). */
  project?: Project;
}

function paintPlanes(g: CanvasRenderingContext2D, d: Drawing, planes: Planes, opt?: CompositeOptions, parts?: PartsCtx): void {
  // a movie layer shows its movie on the Colour plane, fitted to the page, under anything painted on it
  if (parts?.layer.kind === 'drawings' && parts.layer.video && parts.comp && parts.frame !== undefined && parts.project) {
    const v = parts.layer.video, asset = parts.project.videos.get(v.asset), t = videoAt(parts.layer, parts.frame, parts.comp.fps);
    if (asset && t !== null && t < asset.duration && (planes === 'all' || planes === 'fill')) {
      const pic = videoFrame(v.asset, t, parts.comp.fps, !!opt?.export);
      if (pic) {
        const W = parts.project.width, H = parts.project.height, k = Math.min(W / asset.width, H / asset.height);
        const w = asset.width * k, h = asset.height * k;
        g.drawImage(pic, (W - w) / 2, (H - h) / 2, w, h);
      }
    }
    paintPlanes(g, d, planes, opt, { ...parts, layer: { ...parts.layer, video: undefined } });
    return;
  }
  // a caption layer draws its balloon and lettering live, then anything painted on its drawing on
  // top (so strokes made while a caption was selected are never lost from Motion or exports)
  if (parts?.layer.kind === 'drawings' && parts.layer.caption) {
    const shown = parts.comp && parts.frame !== undefined ? captionAtFrame(parts.comp, parts.layer, parts.frame)! : parts.layer.caption;
    paintCaption(g, shown, parts.lf, planes);
    if (planes !== 'text') paintPlanes(g, d, planes === 'ink' ? 'line' : planes, opt, { ...parts, layer: { ...parts.layer, caption: undefined } });
    return;
  }
  if (planes === 'text') return;
  if (planes === 'ink') planes = 'line';
  if (d.parked) return; // the caller pins what a frame needs; never draw a packed-away drawing
  const src: DrawingSource = opt?.source?.(d) ?? { line: d.line, fill: d.fill };
  const paint = (t: CanvasRenderingContext2D, name: PartName) => {
    if (name === 'fill') {
      if (src.fill) t.drawImage(src.fill, 0, 0);
      src.overlay?.(t, name);
      return;
    }
    t.drawImage(src.line, 0, 0);
    for (const v of src.vectors ?? d.vectors) drawVectorStroke(t, v, src.vectorLength?.(v) ?? strokeLength(v.points));
    src.overlay?.(t, name);
  };
  if (!parts || !partsActive(parts.layer)) {
    for (const name of PART_NAMES) if (planes === 'all' || planes === name) paint(g, name);
    return;
  }
  const base = g.globalAlpha;
  for (const name of PART_NAMES) {
    if (planes !== 'all' && planes !== name) continue;
    if (name === 'fill' && !src.fill && !src.overlay) continue;
    const p = partOf(parts.layer, name);
    const a = p.visible ? Math.max(0, Math.min(1, valueAt(p.opacity, parts.lf) / 100)) : 0;
    if (a <= 0) continue;
    const [ox, oy] = valueAt(p.offset, parts.lf);
    g.save();
    g.translate(ox, oy);
    g.globalAlpha = base * a;
    if (p.tint || a < 1 || src.overlay) {
      // Flatten each plane's raster, vectors and predicted ink before applying its opacity.
      const tg = fresh(`t${parts.depth}`, src.line.width, src.line.height);
      const t = tg.canvas;
      paint(tg, name);
      if (p.tint) {
        tg.globalCompositeOperation = 'source-in';
        tg.fillStyle = partFill(tg, p.tint, p.grad ?? null, t.width, t.height);
        tg.fillRect(0, 0, t.width, t.height);
        tg.globalCompositeOperation = 'source-over';
      }
      g.drawImage(t, 0, 0);
    } else paint(g, name);
    g.restore();
  }
}

const toDom = (m: Mat) => new DOMMatrix(m);

/** A part's recolour: one colour, or a gradient across the page to a second colour. */
function partFill(g: CanvasRenderingContext2D, tint: string, grad: PartGrad | null, w: number, h: number): string | CanvasGradient {
  if (!grad) return tint;
  const cx = w / 2, cy = h / 2, r = Math.hypot(w, h) / 2;
  let gr: CanvasGradient;
  if (grad.kind === 'radial') gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  else {
    const a = (grad.angle * Math.PI) / 180;
    const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
    gr = g.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
  }
  gr.addColorStop(0, tint);
  gr.addColorStop(1, grad.color2);
  return gr;
}

/**
 * Draw one frame of a comp onto `g`, on top of the transform `g` already has (so callers can
 * scale for export). Layers draw bottom to top through the active camera, with their transform,
 * parenting, opacity and blend mode; precomps render into a scratch canvas first and then place
 * like any layer. The drawings a frame needs must be live (see core/residency.ts).
 */
/** A line burned into final renders (a student's name, class and date), or null. */
let exportStamp: string | null = null;
export function setExportStamp(s: string | null): void {
  exportStamp = s && s.trim() ? s.trim().slice(0, 120) : null;
}

/** The stamp in the bottom-left corner, in comp units, readable on any picture. */
function drawStamp(g: CanvasRenderingContext2D, c: Comp, text: string): void {
  // about 3.5% of the page, and never wider than the page
  let size = Math.max(4, Math.min(c.width, c.height) * 0.035);
  g.save();
  const font = () => `600 ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  g.font = font();
  let w = g.measureText(text).width;
  const room = c.width - size * 2.2;
  if (w > room && w > 0) { size *= room / w; g.font = font(); w = g.measureText(text).width; }
  const pad = size * 0.5, x = size * 0.6, y = c.height - size * 0.6;
  g.globalAlpha = 0.72;
  g.fillStyle = '#000';
  g.beginPath();
  g.roundRect(x - pad, y - size - pad * 0.6, w + pad * 2, size + pad * 1.4, size * 0.3);
  g.fill();
  g.globalAlpha = 1;
  g.fillStyle = '#fff';
  g.textBaseline = 'alphabetic';
  g.fillText(text, x, y);
  g.restore();
}

export function drawComp(g: CanvasRenderingContext2D, project: Project, compId: string | Comp, frame: number, opt: CompositeOptions = {}, depth = 0): void {
  const comps = project.comps;
  const c = typeof compId === 'string' ? comps.get(compId) : compId;
  if (!c || depth > MAX_DEPTH) return;
  const planes = opt.planes ?? 'all';
  const base = g.getTransform();
  const view = depth === 0 && opt.camera === false ? ([1, 0, 0, 1, 0, 0] as Mat) : viewMatrix(c, frame, comps);
  const groups = clipGroups(c.layers);
  const shows = (l: Layer) => !(l.kind === 'camera' || l.kind === 'null' || !activeAt(l, frame, comps) || (depth === 0 && opt.skip === l.id) || (depth === 0 && opt.onlyGuide && l.id !== opt.guide) || (opt.export && skippedInExport(l) && !(depth === 0 && l.id === opt.guide)));
  const alphaOf = (l: Layer) => opacityAt(l, frame) * (depth === 0 ? (opt.alpha ?? 1) : 1);
  // adjustment layers work on what is below them: the comp is drawn on its own page first
  const adjusts = (l: Layer) => l.kind === 'drawings' && !!l.adjust && shows(l) && activeEffects(l).some(e => !temporalEffect(e.type)) && (!!opt.export || fxPreview !== 'off');
  const page = c.layers.some(adjusts) ? scratchFor(`adj${depth}`, c.width, c.height) : null;
  const out = g;
  if (page) {
    g = page.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, c.width, c.height);
  }
  if (c.background && opt.backgrounds !== false) {
    g.fillStyle = c.background;
    g.fillRect(0, 0, c.width, c.height);
  }
  const layerBase = page ? new DOMMatrix() : base;
  for (let i = c.layers.length - 1; i >= 0; i--) {
    const l = c.layers[i]!;
    if (l.kind === 'drawings' && l.adjust) {
      if (page && adjusts(l)) applyAdjustment(page, l, frame, alphaOf(l), depth, c.fps, opt.export ? 1 : fxPreviewScale());
      continue;
    }
    // a clipped layer draws with its base (a clipped layer with nothing to clip to shows nothing)
    if (clips(l)) continue;
    if (!shows(l)) continue;
    const members = groups.get(i);
    if (members) {
      drawClipGroup(
        g,
        (x) => drawTimedLayer(x, project, c, plain(l), frame, layerBase, 1, planes, opt, depth, view),
        alphaOf(l),
        l.blend,
        members.filter((j) => shows(c.layers[j]!) && alphaOf(c.layers[j]!) > 0).map((j) => {
          const cl = c.layers[j]!;
          return { draw: (x) => drawTimedLayer(x, project, c, plain(cl), frame, layerBase, alphaOf(cl), planes, opt, depth, view), blend: cl.blend };
        }),
        `${depth}`,
      );
      continue;
    }
    const alpha = alphaOf(l);
    if (alpha <= 0) continue;
    drawTimedLayer(g, project, c, l, frame, layerBase, alpha, planes, opt, depth, view);
  }
  if (page) {
    g = out;
    g.setTransform(base);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.drawImage(page, 0, 0);
  }
  g.setTransform(base);
  if (depth === 0 && opt.export && exportStamp && opt.planes === undefined) drawStamp(g, c, exportStamp);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

/** An adjustment layer: its effects on the comp drawn so far (`page`), mixed in by its opacity. */
function applyAdjustment(page: HTMLCanvasElement, l: DrawingsLayer, frame: number, alpha: number, depth: number, fps: number, scale = 1): void {
  if (alpha <= 0) return;
  const pad = effectsPad(l);
  // A flattened composite has no separate Ink/Colour planes. Run every effect once, in order.
  const fx = drawEffected(l, layerFrame(l, frame), page.width, page.height, 'all', depth, (t) => t.drawImage(page, 0, 0), undefined, fps, scale, true);
  if (!fx) return;
  const g = page.getContext('2d')!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  // Interpolate premultiplied pixels, including alpha; source-over would double translucent art
  // and leave the original behind a shifted/blurred result at partial adjustment opacity.
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'destination-in';
  g.fillStyle = `rgba(0,0,0,${1 - alpha})`;
  g.fillRect(0, 0, page.width, page.height);
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = alpha;
  g.drawImage(fx, -pad, -pad, page.width + 2 * pad, page.height + 2 * pad);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

function drawTimedLayer(g: CanvasRenderingContext2D, project: Project, c: Comp, l: Layer, frame: number, base: DOMMatrix, alpha: number, planes: Planes, opt: CompositeOptions, depth: number, view: Mat = IDENTITY): void {
  const now = worldMatrix(c, l, frame);
  if (!l.adjust && opt.temporal !== false && (opt.export || fxPreview !== 'off')) {
    const { echoes, poses, trails } = temporalSamples(l, frame);
    const motion = poses.map(at => worldMatrix(c, l, at));
    const blur = motion.some(pose => pose.some((n, i) => Math.abs(n - now[i]!) > 1e-7));
    if (echoes.length || blur || trails.length) {
      const scale = opt.export ? 1 : fxPreviewScale();
      const w = Math.max(1, Math.round(c.width * scale)), h = Math.max(1, Math.round(c.height * scale));
      const plate = fresh(`temporal${depth}`, w, h);
      const plateBase = new DOMMatrix().scale(w / c.width, h / c.height).multiply(toDom(view));
      const layer = plain(l), previous: CompositeOptions = { ...opt, temporal: false };
      // Outline Trail: each earlier frame as its outline alone (no art), oldest first
      for (const t of trails) {
        const pose = plateBase.multiply(toDom(worldMatrix(c, l, t.frame)));
        drawLayer(plate, project, c, { ...layer, effects: [t.effect] } as Layer, t.frame, pose, t.alpha, planes, previous, depth);
      }
      for (const sample of echoes) {
        const pose = plateBase.multiply(toDom(worldMatrix(c, l, sample.frame)));
        drawLayer(plate, project, c, layer, sample.frame, pose, sample.alpha, planes, previous, depth);
      }
      if (blur) {
        const target = echoes.length ? fresh(`shutter${depth}`, w, h) : plate;
        drawLayer(target, project, c, layer, frame, plateBase, 1, planes, opt, depth, undefined,
          motion.map(pose => plateBase.multiply(toDom(pose))));
        if (target !== plate) {
          plate.setTransform(1, 0, 0, 1, 0, 0);
          plate.drawImage(target.canvas, 0, 0);
        }
      } else drawLayer(plate, project, c, layer, frame, plateBase.multiply(toDom(now)), 1, planes, opt, depth);
      g.setTransform(base);
      g.globalAlpha = alpha;
      g.globalCompositeOperation = BLEND[l.blend];
      g.drawImage(plate.canvas, 0, 0, c.width, c.height);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      return;
    }
  }
  drawLayer(g, project, c, l, frame, base.multiply(toDom(mul(view, now))), alpha, planes, opt, depth);
}

function drawLayer(g: CanvasRenderingContext2D, project: Project, c: Comp, l: Layer, frame: number, m: DOMMatrix, alpha: number, planes: Planes, opt: CompositeOptions, depth: number, editingDrawing?: Drawing, poses?: DOMMatrix[]): void {
  let source: HTMLCanvasElement | null = null;
  let direct: Drawing | null = null;
  let pad = 0;
  // the flattened copy's resolution (1 = page pixels)
  let res = 1;
  if (l.kind === 'drawings') {
    const id = drawingOf(l, frame);
    let d = editingDrawing ?? (id ? project.drawings.get(id) : undefined);
    if (!d || d.parked) return;
    const tween = !editingDrawing && vectorTweenAt(l, frame);
    const next = tween && project.drawings.get(tween.next);
    let tweenKey = '';
    if (tween && next && !next.parked) {
      d = { ...d, vectors: tweenStrokes(d.vectors, next.vectors, tween.t) };
      tweenKey = `:${next.id}:${next.rev}:${tween.t}`;
    }
    // A plain layer draws straight in; with opacity, a blend mode or a mask the drawing is
    // flattened first (its fill does not show through its own lines; the mask takes paint away)
    const mask = l.mask ? project.drawings.get(l.mask) : undefined;
    const masked = !!mask && !mask.parked;
    const lf = layerFrame(l, frame);
    // effects (line boil...): the layer is painted part by part and processed first
    // while you work effects can be faster (half size) or off; exports always render them in full
    const fxScale = opt.export ? 1 : fxPreviewScale();
    const drawing = d;
    const fx = activeEffects(l).length && (opt.export || fxPreview !== 'off') ? drawEffected(l, lf, project.width, project.height, planes, depth, (t, part) => paintPlanes(t, drawing, part, opt, { layer: l, lf, depth, comp: c, frame, project }), opt.source ? undefined : `${d.id}:${d.rev}${tweenKey}:${l.video ? `v${videoAt(l, frame, c.fps)}:${videoFrameReady(l.video.asset, videoAt(l, frame, c.fps) ?? 0) ? 1 : 0}` : ''}:${l.parts ? JSON.stringify(l.parts) : ''}${l.caption ? captionSignature(captionAtFrame(c, l, frame)!, lf) : ''}`, c.fps, fxScale) : null;
    if (alpha >= 1 && l.blend === 'normal' && !masked && !fx && !poses) direct = d;
    else {
      // effects that reach past the art (shadow, glow) come back on a grown page; a caption placed
      // past its page edge gets the room it needs too, so it is never cut at the page
      pad = fx ? effectsPad(l) : artReach(l);
      // a caption is drawn live, so its flattened copy is made at the size it shows (sharp when scaled up)
      if (!fx && l.caption) res = Math.max(1, Math.min(3, Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)), 4096 / (project.width + 2 * pad), 4096 / (project.height + 2 * pad)));
      const sg = fresh(`d${depth}`, Math.ceil((project.width + 2 * pad) * res), Math.ceil((project.height + 2 * pad) * res));
      source = sg.canvas;
      if (fx) {
        sg.setTransform(1, 0, 0, 1, 0, 0);
        sg.clearRect(0, 0, source.width, source.height);
        sg.drawImage(fx, 0, 0, source.width, source.height);
      } else {
        sg.setTransform(res, 0, 0, res, pad * res, pad * res);
        paintPlanes(sg, d, planes, opt, { layer: l, lf, depth, comp: c, frame, project });
      }
      if (masked) {
        sg.setTransform(res, 0, 0, res, pad * res, pad * res);
        sg.globalAlpha = 1;
        sg.globalCompositeOperation = 'destination-out';
        const maskSrc = opt.source?.(mask);
        sg.drawImage(maskSrc?.line ?? mask.line, 0, 0);
        for (const v of maskSrc?.vectors ?? mask.vectors) drawVectorStroke(sg, v);
        sg.globalCompositeOperation = 'source-over';
      }
    }
  } else if (l.kind === 'comp') {
    const n = project.comps.get(l.comp);
    const nf = n ? nestedFrame(l, frame, c.fps, n, project.comps) : null;
    if (!n || nf === null) return;
    const sg = fresh(`c${depth}`, n.width, n.height);
    source = sg.canvas;
    drawComp(sg, project, instanceComp(n, l), nf, opt, depth + 1);
    if (activeEffects(l).length && (opt.export || fxPreview !== 'off')) {
      const fx = drawEffected(l, layerFrame(l, frame), n.width, n.height, planes, depth,
        (t) => t.drawImage(source!, 0, 0), undefined, c.fps, opt.export ? 1 : fxPreviewScale(), true);
      if (fx) {
        pad = effectsPad(l);
        const scaled = scratchFor(`cf${depth}`, n.width + 2 * pad, n.height + 2 * pad);
        scaled.getContext('2d')!.drawImage(fx, 0, 0, scaled.width, scaled.height);
        source = scaled;
      }
    }
  }
  if (poses && source) {
    g.globalAlpha = alpha / poses.length;
    g.globalCompositeOperation = 'lighter';
    for (const pose of poses) {
      g.setTransform(pose);
      g.drawImage(source, -pad, -pad, source.width / res, source.height / res);
    }
  } else {
    g.setTransform(m);
    g.globalAlpha = alpha;
    g.globalCompositeOperation = BLEND[l.blend];
    if (direct && l.kind === 'drawings') paintPlanes(g, direct, planes, opt, { layer: l, lf: layerFrame(l, frame), depth, comp: c, frame, project });
    else if (source) g.drawImage(source, -pad, -pad, source.width / res, source.height / res);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

/**
 * Draw the editable cel in its own page coordinates, using the same parts, mask, opacity and
 * blend compositor as playback/export. Effects remain off while painting, as in the Draw UI.
 * A clipping-group caller supplies full alpha for the base mask and applies base opacity once
 * to the group; members supply their own opacity. Preview sources never mutate the document.
 */
export function drawEditingLayer(
  g: CanvasRenderingContext2D, project: Project, c: Comp, l: DrawingsLayer, frame: number,
  drawing: Drawing, matrix: DOMMatrix,
  opt: { source?: CompositeOptions['source']; editingMask?: boolean; alpha?: number; blend?: BlendMode } = {},
): void {
  if (!l.visible) return;
  const alpha = opt.alpha ?? opacityAt(l, frame);
  if (alpha <= 0) return;
  if (drawing.parked) {
    // Keep the loading placeholder, but apply the same layer properties to it as to live pixels.
    if (!drawing.thumb) return;
    const g = fresh('editingPlaceholder', project.width, project.height);
    g.drawImage(drawing.thumb, 0, 0, project.width, project.height);
    drawing = { ...drawing, parked: null, line: g.canvas, fill: null };
  }
  const layer = { ...l, effects: undefined, ...(opt.editingMask ? { mask: undefined } : {}), blend: opt.blend ?? l.blend };
  g.save();
  drawLayer(g, project, c, layer, frame, matrix, alpha, 'all', { source: opt.source }, 0, drawing);
  g.restore();
}

/**
 * The Draw view's other layers: the comp's layers below (or above) the one being drawn on, at a
 * frame, placed relative to it (the drawn-on layer's page is the view's space). Cameras and nulls
 * are not drawn. `alpha` fades them (a light-table look); hidden layers stay hidden.
 */
export function drawLayersAround(g: CanvasRenderingContext2D, project: Project, c: Comp, frame: number, activeId: string, side: 'below' | 'above', alpha = 1, guideAlpha = 1, exclude?: Set<string>, keep?: Set<string>): void {
  // `keep`: layers of the same stack as the one you paint on show fully, whatever Others says
  const alphaOf = (l: Layer) => aroundAlpha(l, frame, keep?.has(l.id) ? 1 : alpha, guideAlpha);
  const comps = project.comps;
  const idx = c.layers.findIndex((l) => l.id === activeId);
  const base = g.getTransform();
  const groups = clipGroups(c.layers);
  for (let i = c.layers.length - 1; i >= 0; i--) {
    const l = c.layers[i]!;
    if (i === idx || exclude?.has(l.id) || clips(l) || (l.kind === 'drawings' && l.adjust)) continue;
    // layers[0] is the top; a layer not yet in the comp (a placeholder) goes to the bottom
    const above = idx < 0 || i < idx;
    if ((side === 'above') !== above) continue;
    if (!showsAround(l, frame, comps)) continue;
    const members = groups.get(i)?.filter((j) => j !== idx && showsAround(c.layers[j]!, frame, comps));
    if (members?.length) {
      drawClipGroup(
        g,
        (x) => drawLayerAround(x, project, c, frame, activeId, plain(l), 1, base),
        alphaOf(l),
        l.blend,
        members.map((j) => {
          const cl = c.layers[j]!;
          return { draw: (x) => drawLayerAround(x, project, c, frame, activeId, plain(cl), alphaOf(cl), base), blend: cl.blend };
        }),
        'around',
      );
      continue;
    }
    const a = alphaOf(l);
    if (a <= 0) continue;
    drawLayerAround(g, project, c, frame, activeId, l, a, base);
  }
  g.setTransform(base);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}

const showsAround = (l: Layer, frame: number, comps: ReadonlyMap<string, Comp>) => !(l.kind === 'camera' || l.kind === 'null' || !activeAt(l, frame, comps));
// notes (draw-over corrections) always show fully; the storyboard and other guides follow their slider
const aroundAlpha = (l: Layer, frame: number, alpha: number, guideAlpha: number) => opacityAt(l, frame) * (l.notes ? 1 : l.guide ? guideAlpha : alpha);

/**
 * One layer of the Draw view, placed relative to the layer being drawn on (its page is the view's
 * space). `base` is the view transform the Draw view started from.
 */
export function drawLayerAround(g: CanvasRenderingContext2D, project: Project, c: Comp, frame: number, activeId: string, l: Layer, alpha: number, base: DOMMatrix): void {
  const active = c.layers.find((x) => x.id === activeId);
  const rel = active ? invert(worldMatrix(c, active, frame)) : IDENTITY;
  drawTimedLayer(g, project, c, l, frame, base.multiply(toDom(rel)), alpha, 'all', {}, 0);
  g.setTransform(base);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
}
