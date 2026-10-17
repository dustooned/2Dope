import { staticProp, valueAt, type Prop, type Vec2 } from './anim';
import { drawingAt, totalFrames, type Exposure } from './timeline';
import { soundStart, type SoundClip } from './audio';

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
  /**
   * A guide layer (the storyboard / animatic, references): shown in every view, left out of
   * exports unless `guideExport` is on (After Effects' guide layers).
   */
  guide?: boolean;
  guideExport?: boolean;
  /** Linked art layers: drawings layers sharing a `cel` group keep the same cels and timing. */
  cel?: string;
  /** A still layer (background, object): one drawing held for the whole shot, like a Procreate layer. */
  still?: boolean;
  /** Clipping mask: shows only where the first unclipped layer below has paint (Procreate's clipping mask). */
  clip?: boolean;
  /** Alpha Lock: brushes change only pixels that already have paint. */
  alphaLock?: boolean;
}

/** Is this layer left out of a final render? */
export function skippedInExport(l: { guide?: boolean; guideExport?: boolean }): boolean {
  return l.guide === true && l.guideExport !== true;
}

/**
 * How a layer with its own timeline (drawings, precomp) plays it:
 * - once: play it through; past the end it disappears, or holds the last frame if the layer's
 *   out point is set later (so a one-shot can rest on its final pose)
 * - loop: repeat (a walk cycle placed once)
 * - pingpong: forwards, then backwards, and again
 * - single: always show one frame (`single`): a precomp used as a library of poses or mouths
 */
export type PlayMode = 'once' | 'loop' | 'pingpong' | 'single';
export const PLAY_MODES: PlayMode[] = ['once', 'loop', 'pingpong', 'single'];

interface Timed {
  play: PlayMode;
  /** Playback rate (1 = as drawn; 0.5 = half speed). */
  speed: number;
  /** The frame `single` shows (0-based, in the content's own frames). */
  single: number;
  /**
   * Which content frame to show, keyed over time (0-based content frames). With keys it overrides
   * play mode and speed: hold keys swap frames (lip sync, poses), linear keys ramp, reverse or freeze.
   */
  timeRemap: Prop<number> | null;
}

/** Frame-by-frame drawings, timed by exposures (what the strip and X-sheet edit). */
export interface DrawingsLayer extends LayerBase, Timed {
  kind: 'drawings';
  exposures: Exposure[];
  /**
   * Settings for the Line and Fill parts of every drawing this layer shows (missing = defaults).
   * They let lines and colour be shown, faded, recoloured or shifted separately across the shot.
   */
  parts?: Partial<Record<PartName, Part>>;
}

/** The two parts of every drawing: linework (line plane + vector strokes) and flat colour. */
export type PartName = 'line' | 'fill';
/** Draw order, bottom first. */
export const PART_NAMES: PartName[] = ['fill', 'line'];

export interface Part {
  visible: boolean;
  /** 0..100, multiplies the layer's opacity. Keys in layer time. */
  opacity: Prop<number>;
  /** Recolour: every painted pixel of this part takes this colour (its alpha kept). null = own colours. */
  tint: string | null;
  /** Shift relative to the layer, in layer pixels. Keys in layer time. */
  offset: Prop<Vec2>;
}

export function defaultPart(): Part {
  return { visible: true, opacity: staticProp(100), tint: null, offset: staticProp<Vec2>([0, 0]) };
}

/** A drawings layer's settings for one part (defaults when it has none). */
export function partOf(l: DrawingsLayer, name: PartName): Part {
  return l.parts?.[name] ?? defaultPart();
}

/** Does this part look exactly like no settings at all? */
export function isDefaultPart(p: Part): boolean {
  return p.visible && p.tint === null && !p.opacity.keys.length && p.opacity.value === 100 && !p.offset.keys.length && p.offset.value[0] === 0 && p.offset.value[1] === 0;
}

/** Does any part of the layer change how its drawings look? */
export function partsActive(l: DrawingsLayer): boolean {
  return PART_NAMES.some((n) => !!l.parts?.[n] && !isDefaultPart(l.parts[n]!));
}

/** A precomp: another comp placed as one layer. Instances of the same comp share its content. */
export interface CompLayer extends LayerBase, Timed {
  kind: 'comp';
  comp: string;
  /**
   * This instance's own values for the comp's pinned properties, by pin key ("layerId:prop").
   * Keys are in the nested layer's time, like the property they replace.
   */
  overrides: Record<string, Prop>;
}

/** A property of a layer inside a comp, shown as a control on every instance of that comp. */
export interface Pin {
  layer: string;
  prop: PinProp;
}

export type PinProp = 'position' | 'scale' | 'rotation' | 'opacity' | 'anchor' | 'zoom';
export const PIN_PROPS: PinProp[] = ['position', 'scale', 'rotation', 'opacity', 'anchor', 'zoom'];

export const pinKey = (p: Pin) => `${p.layer}:${p.prop}`;

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
  /** Audio clips use this comp's clock; independent of drawing-layer visibility. */
  audio?: SoundClip[];
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
  /** Properties exposed to instances (After Effects' Essential Properties, simplified). */
  pins: Pin[];
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

/** The default timing of a new drawings or precomp layer: play once at normal speed. */
export const ONCE: Timed = { play: 'once', speed: 1, single: 0, timeRemap: null };

/** A drawings layer whose page is `w`×`h`, centred in a `compW`×`compH` comp. */
export function drawingsLayer(id: string, name: string, exposures: Exposure[], w: number, h: number, compW = w, compH = h): DrawingsLayer {
  return { ...base(id, name, w, h, compW, compH), kind: 'drawings', exposures, ...ONCE };
}

export function compLayer(id: string, name: string, nested: Comp, parent: Comp): CompLayer {
  return { ...base(id, name, nested.width, nested.height, parent.width, parent.height), kind: 'comp', comp: nested.id, ...ONCE, overrides: {} };
}

export function cameraLayer(id: string, comp: Comp): CameraLayer {
  return { ...base(id, 'Camera', comp.width, comp.height, comp.width, comp.height), kind: 'camera', zoom: staticProp(100) };
}

export function nullLayer(id: string, name: string, comp: Comp): NullLayer {
  return { ...base(id, name, 0, 0, comp.width, comp.height), kind: 'null' };
}

export function newComp(id: string, name: string, width: number, height: number, fps: number): Comp {
  return { id, name, width, height, fps, duration: null, background: null, folder: null, layers: [], pins: [] };
}

/**
 * The comp as one instance shows it: pinned properties take this instance's overrides. Without
 * overrides it is the comp itself (no copy).
 */
export function instanceComp(nested: Comp, l: CompLayer): Comp {
  const keys = Object.keys(l.overrides ?? {});
  if (!keys.length) return nested;
  const live = new Set(nested.pins.map(pinKey));
  let changed = false;
  const layers = nested.layers.map((x) => {
    let copy: Layer | null = null;
    for (const k of keys) {
      const [id, prop] = k.split(':') as [string, PinProp];
      if (id !== x.id || !live.has(k)) continue;
      copy ??= { ...x, transform: { ...x.transform } } as Layer;
      const p = l.overrides[k]!;
      if (prop === 'zoom') {
        if (copy.kind === 'camera') copy.zoom = p as Prop<number>;
      } else (copy.transform as unknown as Record<string, Prop>)[prop] = p;
      changed = true;
    }
    return copy ?? x;
  });
  return changed ? { ...nested, layers } : nested;
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

/** Content frames per comp frame: the content's fps over the comp's, times speed. */
function rate(l: DrawingsLayer | CompLayer, comps: ReadonlyMap<string, Comp>, parentFps?: number): number {
  let r = Math.max(0.01, l.speed || 1);
  if (l.kind === 'comp' && parentFps) {
    const n = comps.get(l.comp);
    if (n) r *= n.fps / parentFps;
  }
  return r;
}

/** Does the layer's timing keep going past its content (loops, ping-pong, a held frame, remap)? */
export function playsOn(l: Layer): boolean {
  if (l.kind !== 'drawings' && l.kind !== 'comp') return true;
  return l.play !== 'once' || (l.timeRemap?.keys.length ?? 0) > 0;
}

/**
 * The comp frame after the layer's last visible frame. `parentFps` is the fps of the comp the
 * layer is in (needed when a precomp runs at another rate).
 */
export function layerEnd(l: Layer, comps: ReadonlyMap<string, Comp>, parentFps?: number): number {
  if (l.out !== null) return l.out;
  if (l.kind !== 'drawings' && l.kind !== 'comp') return Number.POSITIVE_INFINITY;
  if (playsOn(l)) return Number.POSITIVE_INFINITY;
  const len = contentLength(l, comps) ?? 0;
  return l.start + Math.ceil(len / rate(l, comps, parentFps) - 1e-9);
}

/** Is the layer showing at this comp frame? */
export function activeAt(l: Layer, compFrame: number, comps: ReadonlyMap<string, Comp>, parentFps?: number): boolean {
  return l.visible && compFrame >= l.in && compFrame < layerEnd(l, comps, parentFps);
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

/**
 * The single place that decides which frame of its content a drawings or precomp layer shows at
 * a comp frame (0-based content frame), or null when it shows nothing. Time remap wins, then
 * play mode, speed and fps.
 */
export function contentFrameAt(l: DrawingsLayer | CompLayer, compFrame: number, len: number, comps: ReadonlyMap<string, Comp>, parentFps?: number): number | null {
  if (!l.visible || compFrame < l.in || (l.out !== null && compFrame >= l.out)) return null;
  if (len <= 0) return null;
  const lf = layerFrame(l, compFrame);
  const last = len - 1;
  if (l.timeRemap && l.timeRemap.keys.length) return Math.max(0, Math.min(last, Math.round(valueAt(l.timeRemap, lf))));
  if (l.play === 'single') return Math.max(0, Math.min(last, Math.round(l.single)));
  if (lf < 0) return null;
  const f = Math.floor(lf * rate(l, comps, parentFps) + 1e-9);
  if (l.play === 'loop') return mod(f, len);
  if (l.play === 'pingpong') {
    if (len === 1) return 0;
    const r = mod(f, 2 * last);
    return r <= last ? r : 2 * last - r;
  }
  if (f <= last) return f;
  return l.out !== null ? last : null; // once: hold the last frame only if the layer was made longer
}

/**
 * A comp's length in frames: its set duration, or the end of its last layer that ends (at least
 * 1). Guards against precomp cycles (the schema refuses them too).
 */
export function compLength(c: Comp, comps: ReadonlyMap<string, Comp>, seen: Set<string> = new Set()): number {
  if (c.duration !== null) return c.duration;
  if (seen.has(c.id)) return 1;
  seen.add(c.id);
  let end = 1;
  for (const clip of c.audio ?? []) {
    const start = soundStart(clip, c);
    if (start !== null) end = Math.max(end, Math.ceil(start + (clip.trimOut - clip.trimIn) * c.fps));
  }
  for (const l of c.layers) {
    if (l.out !== null) end = Math.max(end, l.out);
    else if (l.kind === 'drawings') {
      if (!playsOn(l)) end = Math.max(end, layerEnd(l, comps, c.fps));
      else end = Math.max(end, l.start + totalFrames(l.exposures));
    } else if (l.kind === 'comp') {
      const n = comps.get(l.comp);
      if (!n) continue;
      const len = compLength(n, comps, new Set(seen));
      end = Math.max(end, l.start + Math.ceil(len / rate(l, comps, c.fps) - 1e-9));
    }
  }
  return end;
}

/** Which drawing a drawings layer shows at a comp frame, or null (before/after it, or hidden). */
export function drawingOf(l: DrawingsLayer, compFrame: number): string | null {
  const f = contentFrameAt(l, compFrame, totalFrames(l.exposures), EMPTY);
  return f === null ? null : drawingAt(l.exposures, f);
}

const EMPTY: ReadonlyMap<string, Comp> = new Map();

/** The nested comp frame a precomp layer shows at a parent comp frame (converting fps if they differ). */
export function nestedFrame(l: CompLayer, compFrame: number, parentFps: number, nested: Comp, comps: ReadonlyMap<string, Comp>): number | null {
  return contentFrameAt(l, compFrame, compLength(nested, comps), comps, parentFps);
}

// ---------------------------------------------------------------------------------------------
// Space: 2D affine matrices [a, b, c, d, e, f] (same order as DOMMatrix / canvas setTransform)

export type Mat = [number, number, number, number, number, number];
export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export function mul(m: Mat, n: Mat): Mat {
  return [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
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
  if (
    l.kind !== 'drawings' ||
    l.guide ||
    partsActive(l) ||
    l.play !== 'once' ||
    l.speed !== 1 ||
    l.timeRemap?.keys.length ||
    l.start !== 0 ||
    l.in !== 0 ||
    l.out !== null ||
    l.blend !== 'normal' ||
    !l.visible
  )
    return false;
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
export function frameContent(comps: ReadonlyMap<string, Comp>, compId: string | Comp, frame: number, depth = 0): FrameContent {
  const c = typeof compId === 'string' ? comps.get(compId) : compId;
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
      const inner = frameContent(comps, instanceComp(n, l), nf, depth + 1);
      for (const d of inner.drawings) drawings.add(d);
      parts.push(`${l.id}:[${inner.key}]@${look}`);
    }
  }
  return { key: parts.join(';'), drawings };
}
