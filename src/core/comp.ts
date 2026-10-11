import { staticProp, valueAt, type Prop, type Vec2 } from './anim';
import { drawingAt, totalFrames, type Exposure } from './timeline';

/**
 * Comps and layers (design doc 11 §2). One project holds several comps: the shot and any
 * precomps. A comp is a stack of layers, top first. Every view (flipbook strip, X-sheet, layers)
 * reads and edits this one tree.
 *
 * Time: integer frames at the comp's fps. A layer's own time starts at `start`; its keyframes and
 * its drawings are in layer time, so moving a layer moves its animation with it.
 */

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'add';
export const BLEND_MODES: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'add'];

/** Layer transform, After Effects style: position of the anchor point, scale %, rotation °, opacity %. */
export interface Transform {
  anchor: Prop<Vec2>;
  position: Prop<Vec2>;
  scale: Prop<Vec2>;
  rotation: Prop<number>;
  opacity: Prop<number>;
}

interface LayerBase {
  id: string;
  name: string;
  /** Comp frame where the layer's frame 0 sits. */
  start: number;
  /** First comp frame the layer is visible. */
  in: number;
  /** Comp frame after the last visible one; null = until its content ends (or forever for cameras/nulls). */
  out: number | null;
  /** Parent layer id (in the same comp): this layer moves with it. */
  parent: string | null;
  visible: boolean;
  locked: boolean;
  /** Timeline label colour index (0 = none). */
  label: number;
  blend: BlendMode;
  transform: Transform;
}

/** Frame-by-frame drawings, timed by exposures (what the strip and X-sheet edit). */
export interface DrawingsLayer extends LayerBase {
  kind: 'drawings';
  exposures: Exposure[];
  /** Repeat the exposures (a walk cycle placed once, playing on). */
  loop: boolean;
}

/** A precomp: another comp placed as one layer. Instances of the same comp share its content. */
export interface CompLayer extends LayerBase {
  kind: 'comp';
  comp: string;
  loop: boolean;
}

/** A 2D camera. The topmost visible camera frames the comp; `zoom` 100 % shows the comp as is. */
export interface CameraLayer extends LayerBase {
  kind: 'camera';
  zoom: Prop<number>;
}

/** An invisible handle to parent other layers to. */
export interface NullLayer extends LayerBase {
  kind: 'null';
}

export type Layer = DrawingsLayer | CompLayer | CameraLayer | NullLayer;
export type LayerKind = Layer['kind'];

export interface Comp {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  /** Frames; null = as long as its content. */
  duration: number | null;
  /** Solid background colour (#rrggbb), or null for transparent. */
  background: string | null;
  /** Project bin folder, or null for the top level. */
  folder: string | null;
  /** Top of the stack first. */
  layers: Layer[];
}

/** A folder in the project bin (comps, later images and audio). */
export interface BinFolder {
  id: string;
  name: string;
  parent: string | null;
}

// ---------------------------------------------------------------------------------------------
// Construction

export function newTransform(width: number, height: number, at: Vec2 = [width / 2, height / 2]): Transform {
  return {
    anchor: staticProp<Vec2>([width / 2, height / 2]),
    position: staticProp<Vec2>([at[0], at[1]]),
    scale: staticProp<Vec2>([100, 100]),
    rotation: staticProp(0),
    opacity: staticProp(100),
  };
}

function base(id: string, name: string, width: number, height: number, compW: number, compH: number): LayerBase {
  return {
    id,
    name,
    start: 0,
    in: 0,
    out: null,
    parent: null,
    visible: true,
    locked: false,
    label: 0,
    blend: 'normal',
    transform: { ...newTransform(width, height, [compW / 2, compH / 2]) },
  };
}

/** A drawings layer whose page is `w`×`h`, centred in a `compW`×`compH` comp. */
export function drawingsLayer(id: string, name: string, exposures: Exposure[], w: number, h: number, compW = w, compH = h): DrawingsLayer {
  return { ...base(id, name, w, h, compW, compH), kind: 'drawings', exposures, loop: false };
}

export function compLayer(id: string, name: string, nested: Comp, parent: Comp): CompLayer {
  return { ...base(id, name, nested.width, nested.height, parent.width, parent.height), kind: 'comp', comp: nested.id, loop: false };
}

export function cameraLayer(id: string, comp: Comp): CameraLayer {
  return { ...base(id, 'Camera', comp.width, comp.height, comp.width, comp.height), kind: 'camera', zoom: staticProp(100) };
}

export function nullLayer(id: string, name: string, comp: Comp): NullLayer {
  return { ...base(id, name, 0, 0, comp.width, comp.height), kind: 'null' };
}

export function newComp(id: string, name: string, width: number, height: number, fps: number): Comp {
  return { id, name, width, height, fps, duration: null, background: null, folder: null, layers: [] };
}

// ---------------------------------------------------------------------------------------------
// Time

/** Layer frame for a comp frame. */
export function layerFrame(l: Layer, compFrame: number): number {
  return compFrame - l.start;
}

/** How long a layer's own content is, in its frames (null = no natural end). */
export function contentLength(l: Layer, comps: ReadonlyMap<string, Comp>): number | null {
  if (l.kind === 'drawings') return totalFrames(l.exposures);
  if (l.kind === 'comp') {
    const c = comps.get(l.comp);
    return c ? compLength(c, comps) : 0;
  }
  return null;
}

/** The comp frame after the layer's last visible frame. */
export function layerEnd(l: Layer, comps: ReadonlyMap<string, Comp>): number {
  if (l.out !== null) return l.out;
  const loops = (l.kind === 'drawings' || l.kind === 'comp') && l.loop;
  const len = contentLength(l, comps);
  if (len === null || loops) return Number.POSITIVE_INFINITY;
  return l.start + len;
}

/** Is the layer showing at this comp frame? */
export function activeAt(l: Layer, compFrame: number, comps: ReadonlyMap<string, Comp>): boolean {
  return l.visible && compFrame >= l.in && compFrame < layerEnd(l, comps);
}

/**
 * A comp's length in frames: its set duration, or the end of its last finite layer (at least 1).
 * Guards against precomp cycles (the schema refuses them too).
 */
export function compLength(c: Comp, comps: ReadonlyMap<string, Comp>, seen: Set<string> = new Set()): number {
  if (c.duration !== null) return c.duration;
  if (seen.has(c.id)) return 1;
  seen.add(c.id);
  let end = 1;
  for (const l of c.layers) {
    if (l.out !== null) end = Math.max(end, l.out);
    else if (l.kind === 'drawings') end = Math.max(end, l.start + totalFrames(l.exposures));
    else if (l.kind === 'comp') {
      const n = comps.get(l.comp);
      if (n) end = Math.max(end, l.start + compLength(n, comps, new Set(seen)));
    }
  }
  return end;
}

/** Which drawing a drawings layer shows at a comp frame, or null (before/after it, or hidden). */
export function drawingOf(l: DrawingsLayer, compFrame: number): string | null {
  if (!l.visible || compFrame < l.in || (l.out !== null && compFrame >= l.out)) return null;
  let f = layerFrame(l, compFrame);
  const len = totalFrames(l.exposures);
  if (!len) return null;
  if (l.loop) f = ((f % len) + len) % len;
  if (f < 0 || f >= len) return null;
  return drawingAt(l.exposures, f);
}

/** The nested comp frame a precomp layer shows at a parent comp frame (converting fps if they differ). */
export function nestedFrame(l: CompLayer, compFrame: number, parentFps: number, nested: Comp, comps: ReadonlyMap<string, Comp>): number | null {
  if (!activeAt(l, compFrame, comps)) return null;
  const lf = layerFrame(l, compFrame);
  let nf = Math.floor((lf * nested.fps) / parentFps + 1e-9);
  const len = compLength(nested, comps);
  if (l.loop) nf = ((nf % len) + len) % len;
  if (nf < 0 || nf >= len) return null;
  return nf;
}

// ---------------------------------------------------------------------------------------------
// Space: 2D affine matrices [a, b, c, d, e, f] (same order as DOMMatrix / canvas setTransform)

export type Mat = [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function invert(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return [...IDENTITY];
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export function apply(m: Mat, p: Vec2): Vec2 {
  return [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]];
}

const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
const scaling = (x: number, y: number): Mat => [x, 0, 0, y, 0, 0];
function rotating(deg: number): Mat {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

/** A layer's own transform at a comp frame (keys are in layer time): T(position) R(rotation) S(scale) T(−anchor). */
export function localMatrix(l: Layer, compFrame: number): Mat {
  const f = layerFrame(l, compFrame);
  const t = l.transform;
  const [ax, ay] = valueAt(t.anchor, f);
  const [px, py] = valueAt(t.position, f);
  const [sx, sy] = valueAt(t.scale, f);
  const rot = valueAt(t.rotation, f);
  return mul(mul(mul(translate(px, py), rotating(rot)), scaling(sx / 100, sy / 100)), translate(-ax, -ay));
}

/** Layer space → comp space, through its parents. Parent cycles are cut. */
export function worldMatrix(c: Comp, l: Layer, compFrame: number): Mat {
  let m = localMatrix(l, compFrame);
  const seen = new Set([l.id]);
  let p = l.parent;
  while (p && !seen.has(p)) {
    seen.add(p);
    const pl = c.layers.find((x) => x.id === p);
    if (!pl) break;
    m = mul(localMatrix(pl, compFrame), m);
    p = pl.parent;
  }
  return m;
}

/** Opacity 0..1 at a comp frame (not inherited from parents, as in After Effects). */
export function opacityAt(l: Layer, compFrame: number): number {
  return Math.min(1, Math.max(0, valueAt(l.transform.opacity, layerFrame(l, compFrame)) / 100));
}

/** The camera that frames the comp at this frame: the topmost visible, active camera layer. */
export function activeCamera(c: Comp, compFrame: number, comps: ReadonlyMap<string, Comp>): CameraLayer | null {
  for (const l of c.layers) if (l.kind === 'camera' && activeAt(l, compFrame, comps)) return l;
  return null;
}

/**
 * Comp space → what the frame shows. With no camera it is the identity. A camera at the comp
 * centre, unrotated, at zoom 100 % is also the identity; moving it right moves the picture left.
 * The camera's own anchor and scale are ignored; zoom is its own property.
 */
export function viewMatrix(c: Comp, compFrame: number, comps: ReadonlyMap<string, Comp>): Mat {
  const cam = activeCamera(c, compFrame, comps);
  if (!cam) return [...IDENTITY];
  const f = layerFrame(cam, compFrame);
  // the camera's place in the comp, through its parents (a camera can ride a null)
  const world = worldMatrix(c, cam, compFrame);
  const anchor = valueAt(cam.transform.anchor, f);
  const [px, py] = apply(world, anchor);
  const rot = Math.atan2(world[1], world[0]) * (180 / Math.PI);
  const zoom = Math.max(1, valueAt(cam.zoom, f)) / 100;
  return mul(mul(mul(translate(c.width / 2, c.height / 2), scaling(zoom, zoom)), rotating(-rot)), translate(-px, -py));
}

// ---------------------------------------------------------------------------------------------
// Structure checks

/** Would placing `child` inside `parent` make a comp contain itself? */
export function wouldCycle(parentId: string, childId: string, comps: ReadonlyMap<string, Comp>): boolean {
  const stack = [childId];
  const seen = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (id === parentId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const c = comps.get(id);
    if (!c) continue;
    for (const l of c.layers) if (l.kind === 'comp') stack.push(l.comp);
  }
  return false;
}

/** Is any layer of the comp animated or moved from where it was created? (decides if a plain flipbook export suffices) */
export function isPlainFlipbook(c: Comp): boolean {
  if (c.layers.length !== 1) return false;
  const l = c.layers[0]!;
  if (l.kind !== 'drawings' || l.loop || l.start !== 0 || l.in !== 0 || l.out !== null || l.blend !== 'normal' || !l.visible) return false;
  const t = l.transform;
  const still = (p: Prop) => p.keys.length === 0;
  if (![t.anchor, t.position, t.scale, t.rotation, t.opacity].every(still)) return false;
  const [ax, ay] = t.anchor.value;
  const [px, py] = t.position.value;
  return ax === px && ay === py && t.scale.value[0] === 100 && t.scale.value[1] === 100 && t.rotation.value === 0 && t.opacity.value === 100;
}

/**
 * Parent a layer (or unparent with null) without it jumping: like After Effects, its position,
 * rotation and scale are re-expressed in the new parent's space at `compFrame`. Animated values
 * are offset by the same amount at every key. Refuses parent loops (returns false).
 */
export function setParent(c: Comp, l: Layer, parentId: string | null, compFrame: number): boolean {
  if (parentId === l.id) return false;
  for (let p: string | null = parentId, n = 0; p && n < 1000; n++) {
    if (p === l.id) return false;
    p = c.layers.find((x) => x.id === p)?.parent ?? null;
  }
  const parentWorld = (id: string | null): Mat => {
    if (!id) return [...IDENTITY];
    const p = c.layers.find((x) => x.id === id);
    return p ? worldMatrix(c, p, compFrame) : [...IDENTITY];
  };
  const oldP = parentWorld(l.parent);
  const newP = parentWorld(parentId);
  // the change that maps old-parent space into new-parent space
  const delta = mul(invert(newP), oldP);
  const dRot = Math.atan2(delta[1], delta[0]) * (180 / Math.PI);
  const dScale = Math.hypot(delta[0], delta[1]);
  const t = l.transform;
  const mapPos = (v: Vec2): Vec2 => apply(delta, v);
  t.position = { value: mapPos(t.position.value), keys: t.position.keys.map((k) => ({ ...k, v: mapPos(k.v) })) };
  t.rotation = { value: t.rotation.value + dRot, keys: t.rotation.keys.map((k) => ({ ...k, v: k.v + dRot })) };
  const sc = (v: Vec2): Vec2 => [v[0] * dScale, v[1] * dScale];
  t.scale = { value: sc(t.scale.value), keys: t.scale.keys.map((k) => ({ ...k, v: sc(k.v) })) };
  l.parent = parentId;
  return true;
}

// ---------------------------------------------------------------------------------------------
// What a frame shows (for export de-duplication and memory pinning)

export interface FrameContent {
  /** Equal for two frames that render the same pixels (held drawings, no motion). */
  key: string;
  /** Every drawing the frame needs, through precomps. */
  drawings: Set<string>;
}

const round = (m: Mat) => m.map((x) => Math.round(x * 1e4) / 1e4).join(',');

/** Describe a comp frame without drawing it. */
export function frameContent(comps: ReadonlyMap<string, Comp>, compId: string, frame: number, depth = 0): FrameContent {
  const c = comps.get(compId);
  const drawings = new Set<string>();
  if (!c || depth > 8) return { key: '', drawings };
  const parts: string[] = [c.background ?? '-', round(viewMatrix(c, frame, comps))];
  for (const l of c.layers) {
    if (l.kind === 'camera' || l.kind === 'null' || !activeAt(l, frame, comps)) continue;
    const look = `${round(worldMatrix(c, l, frame))}|${opacityAt(l, frame).toFixed(4)}|${l.blend}`;
    if (l.kind === 'drawings') {
      const id = drawingOf(l, frame);
      if (!id) continue;
      drawings.add(id);
      parts.push(`${l.id}:${id}@${look}`);
    } else {
      const n = comps.get(l.comp);
      const nf = n ? nestedFrame(l, frame, c.fps, n, comps) : null;
      if (!n || nf === null) continue;
      const inner = frameContent(comps, n.id, nf, depth + 1);
      for (const d of inner.drawings) drawings.add(d);
      parts.push(`${l.id}:[${inner.key}]@${look}`);
    }
  }
  return { key: parts.join(';'), drawings };
}
