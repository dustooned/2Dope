import { spatialHandle, smoothPath, straightPath, validateProperty } from './core/precision';
import { pathProp } from './core/motionpath';
import { alignment, distribution, unionBoxes, snapBox, readSnap, type Alignment, type Distribution, type LayoutBox, type SnapPrefs, type SnapGuide } from './core/layout';
import { syncCelGroups } from './core/cellink';
import { assetClipTimingChange, assetTimingChange, type AssetTimingField, type AssetClipGesture } from './core/assettiming';
import { CURVES, curveOf, EASED, easingOf, easingSides, isAnimated, moveKey, removeKey, reverseKeys, scaleKeyTimes, setAllEasings, setKey, setSegmentCurve, setSegmentEasing, setSegmentSide, shiftKeys, staticProp, valueAt, type Curve, type Easing, type Prop, type Side, type Vec2 } from './core/anim';
import { loopKeys, smoothKeys, staggerOffsets, wiggle, type LoopMode, type StaggerOrder, type WiggleOptions } from './core/keytools';
import { effectDef, keyableSettings, newEffect, plainName, stillSetting, temporalEffect } from './core/effects';
import { newSeed } from './core/rng';
import { CAPTION_KEYS, captionValue, type CaptionKey, type CaptionTrack } from './lettering/spec';
import {
  apply,
  cameraLayer,
  compLayer,
  instanceComp,
  newComp,
  compLength,
  drawingsLayer,
  invert,
  layerEnd,
  layerFrame,
  mul,
  newTransform,
  nullLayer,
  setParent,
  viewMatrix,
  worldMatrix,
  type Comp,
  type Layer,
  type Mat,
} from './core/comp';
import { defaultPart, drawingOf, localMatrix, nestedFrame, partOf, PART_LABEL, type PartGrad, type PartName } from './core/comp';
import { rippleExposures, shiftLater } from './core/ripple';
import { contentFrameAt, type PinProp, type PlayMode } from './core/comp';
import { paintedNear, paintedRoute } from './paintedroute';
import { totalFrames } from './core/timeline';
import { layerContentBox } from './view/contentbox';
import type { Command } from './core/history';
import type { App } from './app';
import { MAX_LAYERS } from './io/schema';

/** The properties the Motion view animates, by name. */
export type PropName = 'position' | 'scale' | 'rotation' | 'opacity' | 'anchor' | 'zoom' | 'remap' | PartProp;

/** A drawings layer's Line or Fill part property ("line.opacity", "fill.offset"...). */
export type PartProp = `${PartName}.${'opacity' | 'offset'}`;
export const isPartProp = (n: string): n is PartProp => n === 'line.opacity' || n === 'line.offset' || n === 'fill.opacity' || n === 'fill.offset';

export const PROP_LABEL: Record<PropName, string> = {
  position: 'Position',
  scale: 'Scale',
  rotation: 'Rotation',
  opacity: 'Opacity',
  anchor: 'Anchor',
  zoom: 'Zoom',
  remap: 'Frame',
  'line.opacity': 'Line opacity',
  'line.offset': 'Line offset',
  'fill.opacity': 'Fill opacity',
  'fill.offset': 'Fill offset',
};

/** Which properties a layer shows, in order. */
export function propsOf(l: Layer): PropName[] {
  if (l.kind === 'camera') return ['position', 'rotation', 'zoom'];
  if (l.kind === 'null') return ['position', 'scale', 'rotation'];
  // "Frame" picks which frame of the layer's own timeline shows (swaps, freezes, ramps)
  return ['position', 'scale', 'rotation', 'opacity', 'remap'];
}

export function getProp(l: Layer, n: PropName): Prop {
  if (isPartProp(n)) {
    const [part, field] = n.split('.') as [PartName, 'opacity' | 'offset'];
    return l.kind === 'drawings' ? (partOf(l, part)[field] as Prop) : (defaultPart()[field] as Prop);
  }
  if (n === 'remap') return (l.kind === 'drawings' || l.kind === 'comp') && l.timeRemap ? l.timeRemap : { value: 0, keys: [] };
  if (n === 'zoom') return l.kind === 'camera' ? l.zoom : (l.transform.opacity as Prop);
  return l.transform[n] as Prop;
}

function setPropOn(l: Layer, n: PropName, p: Prop): void {
  if (isPartProp(n)) {
    const [part, field] = n.split('.') as [PartName, 'opacity' | 'offset'];
    if (l.kind === 'drawings') l.parts = { ...l.parts, [part]: { ...partOf(l, part), [field]: p } };
    return;
  }
  if (n === 'remap') {
    // only keys mean anything here: without them the layer plays by its play mode
    if (l.kind === 'drawings' || l.kind === 'comp') l.timeRemap = p.keys.length ? (p as Prop<number>) : null;
    return;
  }
  if (n === 'zoom' && l.kind === 'camera') l.zoom = p as Prop<number>;
  else (l.transform as unknown as Record<string, Prop>)[n] = p;
}

/** A property row: a layer's own property, or `pin:<layerId>:<prop>` on a precomp layer (a pinned property of its comp). */
export type PropKey = PropName | `pin:${string}` | `fx:${string}` | `cap:${string}`;

/** A caption setting row: `cap:<setting>` (Reveal, Balloon, opacities...), keyed in layer time. */
export const isCap = (k: string): k is `cap:${string}` => k.startsWith('cap:');

/** An effect setting row: `fx:<effect id>:<setting>` (Amount, Size or a numeric extra), keyed in layer time. */
export const isFx = (k: string): k is `fx:${string}` => k.startsWith('fx:');
const fxParts = (k: `fx:${string}`) => { const [, id, key] = k.split(':'); return { id: id!, key: key! }; };

export const isPin = (k: string): k is `pin:${string}` => k.startsWith('pin:');

export interface KeyRef {
  layer: string;
  prop: PropKey;
  f: number;
}

export const keyId = (k: KeyRef) => `${k.layer}|${k.prop}|${k.f}`;

type GestureKind = 'move' | 'scale' | 'rotate';

/** Restricted canvas gestures, used by Animate's explicit asset arrangement tool. */
export interface GestureOptions {
  accept?: (layer: Layer) => boolean;
  allowLocked?: boolean;
  simple?: boolean;
  autoKey?: boolean;
}

interface Gesture {
  kind: GestureKind;
  layer: string;
  /** Layers before the gesture began (every move recomputes from here, so keys never pile up). */
  before: Layer[];
  startPt: Vec2;
  anchorComp: Vec2;
  /** Screen distance used by scale (anchor to pointer at the start). */
  startDist: number;
  startAngle: number;
  moved: boolean;
  zoom: number;
  simple: boolean;
  autoKey: boolean;
  moveIds: string[];
  box: LayoutBox | null;
  targets: LayoutBox[];
}

const HANDLE_PX = 22;
const NULL_HALF = 32;
/** Breathing room (layer px) between a drawing's ink and its selection box. */
const CONTENT_PAD = 6;

/**
 * Everything the Motion workspace changes: layers, their order, timing and parents, and every
 * property and key. Each edit is one undoable step (it stores the comp's layer list before and
 * after; layers are plain data, so this is small).
 */
/** A route line inside the layer that should travel would travel with it. */
export const SAME_LAYER_LINE = 'That line is part of this layer, so it would move along with it. In Draw, select the line and use Cut to layer, then try again.';

/** Points along a vector shape's SVG path (page units of its drawing). */
function sampleShapePath(d: string, m: readonly number[]): Vec2[] {
  try {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    host.style.cssText = 'position:absolute;left:-9999px;width:0;height:0;visibility:hidden';
    host.append(p); document.body.append(host);
    const len = p.getTotalLength(), out: Vec2[] = [];
    for (let i = 0; i <= 120; i++) { const q = p.getPointAtLength((i / 120) * len); out.push([m[0]! * q.x + m[2]! * q.y + m[4]!, m[1]! * q.x + m[3]! * q.y + m[5]!]); }
    host.remove();
    return out;
  } catch { return []; }
}

export class CompEditor {
  /** Selected layer ids (order = selection order). */
  selected: string[] = [];
  /** Selected keys. */
  keys = new Set<string>();
  /** Layers whose property rows are open. */
  open = new Set<string>();
  /** Writing keys while you edit, even on a property that is not animated yet. */
  autoKey = false;
  /** Dreams' "Add keyframe at start": the first key after frame 0 also keeps the old value at frame 0. */
  keyAtStart = true;
  /** New keys get the easing used last. */
  lastEase: Easing = 'linear';
  /** Taps add to the layer selection instead of replacing it (grouping by touch). */
  multiSelect = false;
  /** Look through the topmost camera (off = see the whole comp and the camera's frame). */
  throughCamera = true;
  onChange: () => void = () => {};
  /** Counts every edit to layers and keys (views redraw rows when it moves). */
  rev = 0;

  snap: SnapPrefs = (() => { try { return readSnap(JSON.parse(localStorage.getItem('2dope.motion.snap.v1') ?? 'null')); } catch { return readSnap(null); } })();
  snapGuides: SnapGuide[] = [];
  anchorEditing = false;
  private anchorDrag: { comp: string; frame: number; layer: string; before: Layer[]; original: Layer; inverse: Mat; offset: Vec2; autoKey: boolean; moved: boolean; start: Vec2; zoom: number; fromHandle: boolean } | null = null;
  pathEditing = false;
  /** Draw a path: the next drag on the Motion canvas records a line for Animate along a path. */
  drawingPath = false;
  /** The line being drawn (stage space), for the overlay. */
  pathStroke: Vec2[] | null = null;
  private pathZoom = 1;
  /** Set by the UI: what to do with a finished line (stage space). */
  onPathDrawn: ((points: Vec2[]) => void) | null = null;
  pathLinked = false;
  pathFrame: number | null = null;
  private pathView: boolean | null = null;
  private pathDrag: { layer: string; before: Layer[]; index: number; side: 'point' | 'in' | 'out'; start: Vec2; original: Prop<Vec2>; moved: boolean } | null = null;
  private gesture: Gesture | null = null;
  private clipGesture: {project: App['project']; comp: Comp; before: Layer[]; frame: number; id: string; kind: AssetClipGesture} | null = null;

  constructor(private readonly app: App) {}

  get comp(): Comp {
    return this.app.project.comp;
  }

  layer(id: string): Layer | undefined {
    return this.comp.layers.find((l) => l.id === id);
  }

  get primary(): Layer | undefined {
    const id = this.selected[this.selected.length - 1];
    return id ? this.layer(id) : undefined;
  }

  /**
   * The playhead in the time a property's keys use: the layer's own time, or for a pinned
   * property the time of the layer inside the precomp.
   */
  frameOf(l: Layer, n?: PropKey): number {
    if (n && isPin(n) && l.kind === 'comp') {
      const nested = this.app.project.comps.get(l.comp);
      const [, id] = n.split(':');
      const inner = nested?.layers.find((x) => x.id === id);
      if (!nested || !inner) return 0;
      const nf = nestedFrame(l, this.app.frame, this.comp.fps, nested, this.app.project.comps) ?? Math.max(0, Math.floor(((this.app.frame - l.start) * nested.fps) / this.comp.fps));
      return layerFrame(inner, nf);
    }
    return layerFrame(l, this.app.frame);
  }

  /** The frame of its own timeline a drawings or precomp layer shows at the playhead (0-based). */
  contentFrame(l: Layer): number | null {
    const p = this.app.project;
    if (l.kind === 'drawings') return contentFrameAt(l, this.app.frame, totalFrames(l.exposures), p.comps, this.comp.fps);
    if (l.kind === 'comp') {
      const n = p.comps.get(l.comp);
      return n ? contentFrameAt(l, this.app.frame, compLength(n, p.comps), p.comps, this.comp.fps) : null;
    }
    return null;
  }

  /** How many frames a drawings or precomp layer's own timeline has. */
  contentLength(l: Layer): number {
    const p = this.app.project;
    if (l.kind === 'drawings') return totalFrames(l.exposures);
    if (l.kind === 'comp') {
      const n = p.comps.get(l.comp);
      return n ? compLength(n, p.comps) : 1;
    }
    return 1;
  }

  /** Set how long the open comp is (frames), or null to follow its content. */
  setDuration(frames: number | null): void {
    const c = this.comp;
    const n = frames === null || frames < 1 ? null : Math.round(Math.min(frames, 1_000_000));
    if (n === c.duration) return;
    this.editProject(n === null ? 'Length: automatic' : `Length: ${n} frames`, () => {
      c.duration = n;
    });
    this.app.setFrame(Math.min(this.app.frame, this.app.compEnd - 1));
  }

  /** Play once, loop, ping-pong, or hold one frame; and the speed. */
  setPlay(id: string, play: PlayMode, opts: { single?: number; speed?: number } = {}): void {
    this.edit('Playback', (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (!l || (l.kind !== 'drawings' && l.kind !== 'comp')) return;
      l.play = play;
      if (opts.single !== undefined) l.single = Math.max(0, Math.round(opts.single));
      if (opts.speed !== undefined) l.speed = Math.max(0.05, Math.min(20, opts.speed));
    });
  }

  /** A property of a layer, including pinned properties of a precomp (this instance's value). */
  getProp(l: Layer, n: PropKey): Prop {
    if (isCap(n)) {
      const key = n.slice(4) as CaptionKey, c = l.kind === 'drawings' ? l.caption : undefined;
      return c ? ((c.keys?.[key] as unknown as Prop | undefined) ?? staticProp(captionValue(c, key))) : staticProp(0);
    }
    if (isFx(n)) {
      const { id, key } = fxParts(n), e = l.kind === 'drawings' || l.kind === 'comp' ? l.effects?.find((x) => x.id === id) : undefined;
      return e ? (e.keys?.[key] ?? staticProp(stillSetting(e, key))) : staticProp(0);
    }
    if (isPin(n)) {
      if (l.kind !== 'comp') return l.transform.opacity as Prop;
      const key = n.slice(4);
      const own = l.overrides[key];
      if (own) return own;
      const [id, prop] = key.split(':') as [string, PropName];
      const inner = this.app.project.comps.get(l.comp)?.layers.find((x) => x.id === id);
      return inner ? getProp(inner, prop) : (l.transform.opacity as Prop);
    }
    if (n === 'remap' && (l.kind === 'drawings' || l.kind === 'comp') && !l.timeRemap?.keys.length) return { value: this.contentFrame(l) ?? 0, keys: [] };
    return getProp(l, n);
  }

  private setProp(l: Layer, n: PropKey, p: Prop): void {
    if (isCap(n)) {
      if (l.kind !== 'drawings' || !l.caption) return;
      const key = n.slice(4) as CaptionKey, q = p as Prop<number>, c = { ...l.caption, keys: { ...l.caption.keys }, values: { ...l.caption.values } };
      if (q.keys.length) c.keys[key] = q as unknown as CaptionTrack; else { delete c.keys[key]; c.values[key] = q.value; }
      l.caption = c;
      return;
    }
    if (isFx(n)) {
      const { id, key } = fxParts(n), e = l.kind === 'drawings' || l.kind === 'comp' ? l.effects?.find((x) => x.id === id) : undefined;
      if (!e) return;
      const q = p as Prop<number>, keys = { ...e.keys };
      // keys animate the setting; without keys it keeps a still value (readable by older builds)
      if (q.keys.length) keys[key] = q; else {
        delete keys[key];
        if (key === 'amount') e.amount = q.value; else if (key === 'size') e.size = q.value; else e.params = { ...e.params, [key]: q.value };
      }
      if (Object.keys(keys).length) e.keys = keys; else delete e.keys;
      return;
    }
    if (isPin(n)) {
      if (l.kind === 'comp') l.overrides = { ...l.overrides, [n.slice(4)]: p };
      return;
    }
    setPropOn(l, n, p);
  }

  /** The rows a layer shows: its own properties, then a precomp's pinned ones. */
  rowsOf(l: Layer): PropKey[] {
    const rows: PropKey[] = [...propsOf(l)];
    // a caption shows its own settings, ready to key
    if (l.kind === 'drawings' && l.caption) for (const k of CAPTION_KEYS) rows.push(`cap:${k.key}`);
    // effect settings show once they have keys (a ◆ on the Effects card starts them)
    if (l.kind === 'drawings' || l.kind === 'comp') for (const e of l.effects ?? []) for (const k of Object.keys(e.keys ?? {})) rows.push(`fx:${e.id}:${k}`);
    if (l.kind === 'comp') {
      const nested = this.app.project.comps.get(l.comp);
      for (const p of nested?.pins ?? []) if (nested?.layers.some((x) => x.id === p.layer)) rows.push(`pin:${p.layer}:${p.prop}`);
    }
    return rows;
  }

  /** "★ Ball Position" for a pin row, "Position" otherwise. */
  rowLabel(l: Layer, n: PropKey): string {
    if (isCap(n)) return `\u{1F4AC} ${CAPTION_KEYS.find(k => k.key === n.slice(4))?.label ?? n.slice(4)}`;
    if (isFx(n)) {
      const { id, key } = fxParts(n), e = l.kind === 'drawings' || l.kind === 'comp' ? l.effects?.find((x) => x.id === id) : undefined;
      return e ? `\u2728 ${plainName(effectDef(e.type))} ${keyableSettings(e.type).find((s) => s.key === key)?.label ?? key}` : '\u2728 ?';
    }
    if (!isPin(n)) return PROP_LABEL[n];
    const [, id, prop] = n.split(':') as [string, string, PropName];
    const inner = l.kind === 'comp' ? this.app.project.comps.get(l.comp)?.layers.find((x) => x.id === id) : undefined;
    return `★ ${inner?.name ?? '?'} ${PROP_LABEL[prop] ?? prop}`;
  }

  /** The value kind of a row (for formatting and the value editor). */
  rowProp(n: PropKey): PropName {
    // an effect setting is a plain number (it scrubs and formats like rotation; Motion shows its own unit)
    if (isFx(n) || isCap(n)) return 'rotation';
    const name = isPin(n) ? (n.split(':')[2] as PropName) : n;
    // part rows format like the layer's own opacity / position
    if (isPartProp(name)) return name.endsWith('opacity') ? 'opacity' : 'position';
    return name;
  }

  /** Has this instance changed a pinned property? */
  isOverridden(l: Layer, n: PropKey): boolean {
    return isPin(n) && l.kind === 'comp' && !!l.overrides[n.slice(4)];
  }

  /** Go back to the comp's own value for a pinned property on this instance. */
  resetPin(id: string, n: PropKey): void {
    if (!isPin(n)) return;
    this.edit('Reset to the comp', (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (l && l.kind === 'comp') {
        const o = { ...l.overrides };
        delete o[n.slice(4)];
        l.overrides = o;
      }
    });
  }

  /** Is a property of a layer in the open comp pinned (shown on its instances)? */
  isPinned(layerId: string, n: PropName): boolean {
    return this.comp.pins.some((p) => p.layer === layerId && p.prop === n);
  }

  /** Pin or unpin a property of a layer in the open comp. */
  togglePin(layerId: string, n: PropName): void {
    if (n === 'remap') return; // a layer's own frame picking is not a pinnable property (yet)
    const c = this.comp;
    const before = structuredClone(c.pins);
    const has = this.isPinned(layerId, n);
    c.pins = has ? c.pins.filter((p) => !(p.layer === layerId && p.prop === n)) : [...c.pins, { layer: layerId, prop: n as PinProp }];
    const after = structuredClone(c.pins);
    const id = c.id;
    const set = (pins: typeof before) => {
      const cc = this.app.project.comps.get(id);
      if (cc) cc.pins = structuredClone(pins);
      this.changed();
    };
    this.app.history.push({ label: has ? 'Unpin property' : 'Pin property', do: () => set(after), undo: () => set(before) }, true);
    this.changed();
  }

  changed(): void {
    this.rev++;
    this.app.requestRender();
    this.app.onFrameChange();
    this.app.onDocChanged();
    this.onChange();
  }

  /** Forget selections that no longer exist (after undo, open, delete). */
  tidy(): void {
    const ids = new Set(this.comp.layers.map((l) => l.id));
    this.selected = this.selected.filter((id) => ids.has(id));
    for (const k of [...this.keys]) if (!ids.has(k.split('|')[0]!)) this.keys.delete(k);
    for (const id of [...this.open]) if (!ids.has(id.split('#')[0]!)) this.open.delete(id);
  }

  reset(): void {
    this.gesture = null; this.clipGesture = null; this.pathDrag = null; this.anchorDrag = null; this.anchorEditing = false; this.drawingPath = false; this.pathStroke = null;
    if (this.pathEditing) { this.pathEditing = false; if (this.pathView !== null) this.throughCamera = this.pathView; this.pathView = null; this.pathFrame = null; }
    this.selected = [];
    this.keys.clear();
    this.open.clear();
    this.gesture = null;
    this.clipGesture = null;
    this.trail = [];
  }

  // -------------------------------------------------------------------------------------------
  // Precomps: group, ungroup, make unique, go inside and back out

  /** How we got into the open comp: each step is a precomp layer of the comp above. */
  private trail: { comp: string; layer: string; returnFrame?: number }[] = [];

  /** One undo step that may change several comps (group, ungroup, make unique). */
  editProject(label: string, fn: () => void, drawings?: Command['drawings']): void {
    const p = this.app.project;
    const snap = () => ({ comps: structuredClone([...p.comps.values()]), active: p.activeComp, trail: [...this.trail] });
    const before = snap();
    fn();
    const after = snap();
    const set = (st: typeof before) => {
      p.comps.clear();
      for (const c of structuredClone(st.comps)) p.comps.set(c.id, c);
      const was = p.activeComp;
      p.activeComp = st.active;
      this.trail = [...st.trail];
      this.tidy();
      if (was !== st.active) this.app.onCompChange();
      this.changed();
    };
    this.app.history.push({ label, drawings, do: () => set(after), undo: () => set(before) }, true);
    this.tidy();
    this.changed();
  }

  /**
   * Put layers into a new comp, replaced by one layer showing it (After Effects' "move all
   * attributes"). The new comp has this comp's size and speed, so nothing moves or retimes.
   * Layers left outside that were parented to a grouped layer keep their place, unparented.
   */
  group(ids: string[] = this.selected, name?: string, asset = false): string | null {
    const c = this.comp;
    const p = this.app.project;
    const picked = c.layers.filter((l) => ids.includes(l.id));
    if (!picked.length) return null;
    const nid = p.newId('c');
    let made: string | null = null;
    this.editProject(asset ? 'Create asset from selection' : 'Group into comp', () => {
      const set = new Set(ids);
      for (const l of c.layers) if (!set.has(l.id) && l.parent && set.has(l.parent)) setParent(c, l, null, this.app.frame);
      const nested = newComp(nid, name?.trim() || `${picked[0]!.name} comp`, c.width, c.height, c.fps);
      nested.folder = c.folder;
      if (asset) {
        nested.asset = true;
        // Held artwork can have transform keys beyond its one-frame drawing content.
        // A reusable clip keeps the shot's full clock instead of ending after that drawing.
        nested.duration = compLength(c, p.comps);
      }
      nested.layers = picked.map((l) => ({ ...l, parent: l.parent && set.has(l.parent) ? l.parent : null }));
      p.comps.set(nid, nested);
      const at = c.layers.findIndex((l) => set.has(l.id));
      const layer = compLayer(p.newId('L'), nested.name, nested, c);
      c.layers = c.layers.filter((l) => !set.has(l.id));
      c.layers.splice(Math.max(0, at), 0, layer);
      made = layer.id;
    });
    if (made) this.select(made);
    return made;
  }

  /**
   * Put a precomp's layers back into this comp (Harmony's "explode"). Their times shift by the
   * precomp layer's start. If the precomp layer was moved, scaled or animated, its layers ride a
   * new null that carries that transform, so nothing jumps. Other instances keep the comp.
   */
  ungroup(id: string): boolean {
    const c = this.comp;
    const p = this.app.project;
    const l = c.layers.find((x) => x.id === id);
    if (!l || l.kind !== 'comp') return false;
    const nested = p.comps.get(l.comp);
    if (!nested || nested.fps !== c.fps) return false;
    this.editProject('Ungroup comp', () => {
      const inner = structuredClone(instanceComp(nested, l).layers);
      // fresh ids, so the same comp can be ungrouped twice
      const ids = new Map<string, string>();
      for (const x of inner) {
        const nid = p.newId('L');
        ids.set(x.id, nid);
        x.id = nid;
        // reserve the id at once (newId looks at the comps)
        c.layers.push({ ...x, visible: false } as Layer);
      }
      c.layers = c.layers.filter((x) => ![...ids.values()].includes(x.id));
      const t = l.transform;
      const still = [t.anchor, t.position, t.scale, t.rotation].every((q) => !q.keys.length);
      const plain =
        still && t.anchor.value[0] === t.position.value[0] && t.anchor.value[1] === t.position.value[1] && t.scale.value[0] === 100 && t.scale.value[1] === 100 && t.rotation.value === 0 && !l.parent;
      let holder: string | null = null;
      const out: Layer[] = [];
      if (!plain) {
        const n = nullLayer(p.newId('L'), `${l.name} (group)`, c);
        n.transform = structuredClone(l.transform);
        n.transform.opacity = { value: 100, keys: [] };
        n.parent = l.parent;
        n.start = l.start;
        n.in = l.in;
        n.out = l.out;
        holder = n.id;
        out.push(n);
      }
      for (const x of inner) {
        x.parent = x.parent ? (ids.get(x.parent) ?? null) : holder;
        x.start += l.start;
        x.in += l.start;
        if (x.out !== null) x.out += l.start;
        out.push(x);
      }
      const at = c.layers.findIndex((x) => x.id === id);
      c.layers.splice(at, 1, ...out);
    });
    this.select(null);
    return true;
  }

  /** Give this instance its own copy of the comp, so changing it leaves the other instances alone. */
  makeUnique(id: string): void {
    const c = this.comp;
    const p = this.app.project;
    const l = c.layers.find((x) => x.id === id);
    if (!l || l.kind !== 'comp') return;
    const nested = p.comps.get(l.comp);
    if (!nested) return;
    this.editProject('Make unique', () => {
      const copy = structuredClone(nested);
      copy.id = p.newId('c');
      copy.name = `${nested.name} copy`;
      p.comps.set(copy.id, copy);
      const live = c.layers.find((x) => x.id === id);
      if (live && live.kind === 'comp') live.comp = copy.id;
    });
  }

  /** Another instance of a precomp (shares its content), or a copy of a null or camera, above it. */
  duplicate(id: string): void {
    const c = this.comp;
    const l = c.layers.find((x) => x.id === id);
    if (!l || l.kind === 'drawings') return;
    let made: string | null = null;
    this.edit('Duplicate layer', (cc) => {
      const copy = structuredClone(l);
      copy.id = this.app.project.newId('L');
      copy.name = `${l.name} 2`;
      cc.layers.splice(
        cc.layers.findIndex((x) => x.id === id),
        0,
        copy,
      );
      made = copy.id;
    });
    if (made) this.select(made);
  }

  /**
   * Split layers at the playhead (Procreate Dreams' split, After Effects' split layer): each
   * layer that spans the playhead becomes two, the first ending and the second starting there.
   * Both keep the same content, timing and keys, so nothing moves. One undo step; selects the
   * second halves. Returns how many layers were split.
   */
  split(ids: string[] = this.selected): number {
    const f = this.app.frame;
    const comps = this.app.project.comps;
    const made: string[] = [];
    this.edit(ids.length > 1 ? 'Split layers' : 'Split layer', (c) => {
      for (const id of ids) {
        const i = c.layers.findIndex((x) => x.id === id);
        const l = c.layers[i];
        if (!l || l.kind === 'camera' || l.kind === 'null') continue;
        if (f <= l.in || f >= layerEnd(l, comps, c.fps)) continue;
        const second = structuredClone(l);
        second.id = this.app.project.newId('L');
        second.in = f;
        l.out = f;
        c.layers.splice(i, 0, second);
        made.push(second.id);
      }
    });
    if (made.length) {
      this.selected = made;
      this.changed();
    }
    return made.length;
  }

  /** How many layers (in all comps) show this comp. */
  instances(compId: string): number {
    let n = 0;
    for (const c of this.app.project.comps.values()) for (const l of c.layers) if (l.kind === 'comp' && l.comp === compId) n++;
    return n;
  }

  /** Go inside a precomp layer: its comp becomes the one you edit, at the frame it was showing. */
  enter(id: string, returnToEntry = false): boolean {
    const c = this.comp;
    const l = c.layers.find((x) => x.id === id);
    if (!l || l.kind !== 'comp') return false;
    const p = this.app.project;
    const nested = p.comps.get(l.comp);
    if (!nested) return false;
    const nf = nestedFrame(l, this.app.frame, c.fps, nested, p.comps) ?? 0;
    this.setAnchorEditing(false);
    this.setPathEditing(false);
    this.trail.push({ comp: c.id, layer: l.id, ...(returnToEntry ? { returnFrame: this.app.frame } : {}) });
    this.switchTo(nested.id, nf);
    return true;
  }

  /** Back out to the comp above (or to `depth` steps from the top: 0 = the shot). */
  exit(depth = this.crumbs().length - 2): boolean {
    const crumbs = this.crumbs();
    if (crumbs.length < 2 || depth < 0 || depth >= crumbs.length - 1) return false;
    this.setAnchorEditing(false);
    this.setPathEditing(false);
    const p = this.app.project;
    const returnStep = this.trail[depth];
    // map the playhead out through every level we leave
    let frame = this.app.frame;
    for (let i = crumbs.length - 1; i > depth; i--) {
      const via = crumbs[i]!.via!;
      const parent = crumbs[i - 1]!.comp;
      const inner = crumbs[i]!.comp;
      frame = this.trail[i - 1]?.returnFrame ?? (via ? via.start + Math.floor((frame * parent.fps) / inner.fps + 1e-9) : 0);
    }
    this.trail = this.trail.slice(0, depth);
    this.gestureEnd(true);
    this.switchTo(crumbs[depth]!.comp.id, frame);
    if (returnStep?.returnFrame !== undefined && this.layer(returnStep.layer)) this.select(returnStep.layer);
    void p;
    return true;
  }

  private switchTo(compId: string, frame: number): void {
    const p = this.app.project;
    p.activeComp = compId;
    const first = p.comp.layers.find((x) => x.kind === 'drawings');
    if (first) p.activeLayer = first.id;
    this.selected = [];
    this.keys.clear();
    this.app.frame = Math.max(0, Math.min(frame, this.app.compEnd - 1));
    this.app.onCompChange();
    this.rev++;
    this.app.requestRender();
    this.app.onFrameChange();
    this.onChange();
  }

  /**
   * The way from the shot to the open comp, each step with the precomp layer it went through.
   * Rebuilt from the project when the remembered trail no longer leads there (after an undo).
   */
  crumbs(): { comp: Comp; via: Extract<Layer, { kind: 'comp' }> | null }[] {
    const p = this.app.project;
    const main = p.comps.get(p.main);
    if (!main) return [];
    const out: { comp: Comp; via: Extract<Layer, { kind: 'comp' }> | null }[] = [{ comp: main, via: null }];
    let ok = true;
    for (const step of this.trail) {
      const here = out[out.length - 1]!.comp;
      const l = p.comps.get(step.comp) === here ? here.layers.find((x) => x.id === step.layer) : undefined;
      const next = l && l.kind === 'comp' ? p.comps.get(l.comp) : undefined;
      if (!l || l.kind !== 'comp' || !next) {
        ok = false;
        break;
      }
      out.push({ comp: next, via: l });
    }
    if (ok && out[out.length - 1]!.comp.id === p.activeComp) return out;
    // search: shortest path of precomp layers from the shot to the open comp
    const queue: { comp: Comp; path: typeof out }[] = [{ comp: main, path: [{ comp: main, via: null }] }];
    const seen = new Set([main.id]);
    while (queue.length) {
      const { comp, path } = queue.shift()!;
      if (comp.id === p.activeComp) {
        this.trail = path.slice(1).map((s, i) => ({ comp: path[i]!.comp.id, layer: s.via!.id }));
        return path;
      }
      for (const l of comp.layers) {
        if (l.kind !== 'comp' || seen.has(l.comp)) continue;
        const n = p.comps.get(l.comp);
        if (!n) continue;
        seen.add(n.id);
        queue.push({ comp: n, path: [...path, { comp: n, via: l }] });
      }
    }
    // not reachable from the shot (a comp only in the bin): show it on its own
    const solo = p.comp;
    this.trail = [];
    return solo.id === main.id
      ? out.slice(0, 1)
      : [
          { comp: main, via: null },
          { comp: solo, via: null },
        ];
  }

  /** While inside a precomp: the comp above, the layer we came through, and the frame it shows. */
  context(): { parent: Comp; layer: Extract<Layer, { kind: 'comp' }>; frame: number } | null {
    const crumbs = this.crumbs();
    if (crumbs.length < 2) return null;
    const last = crumbs[crumbs.length - 1]!;
    const parent = crumbs[crumbs.length - 2]!.comp;
    if (!last.via) return null;
    const frame = last.via.start + Math.floor((this.app.frame * parent.fps) / last.comp.fps + 1e-9);
    return { parent, layer: last.via, frame };
  }

  /** Show the comp above, faintly, behind a precomp you are editing. */
  showContext = true;

  // -------------------------------------------------------------------------------------------
  // History: one step = the layer list of one comp, before and after

  /** Run an edit as one undoable step. Returns false if nothing changed. */
  edit(label: string, fn: (c: Comp) => void): boolean {
    const c = this.comp;
    const before = structuredClone(c.layers);
    fn(c);
    const after = structuredClone(c.layers);
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    this.push(label, c.id, before, after);
    this.changed();
    return true;
  }

  private push(label: string, compId: string, before: Layer[], after: Layer[]): void {
    // linked art layers stay in step whatever edited them (Motion trims, moves, ripples)
    const synced = syncCelGroups(before, after, (src, partnerOf) => this.app.partnerDrawing(src, partnerOf));
    if (synced) {
      after = structuredClone(synced);
      const live = this.app.project.comps.get(compId);
      if (live) live.layers = structuredClone(synced);
    }
    const set = (layers: Layer[]) => {
      const c = this.app.project.comps.get(compId);
      if (!c) return;
      c.layers = structuredClone(layers);
      const was = this.app.project.activeComp;
      this.app.project.activeComp = compId;
      this.app.frame = Math.max(0, Math.min(this.app.frame, this.app.compEnd - 1));
      this.tidy();
      if (was !== compId) this.app.onCompChange();
      this.changed();
    };
    const cmd: Command = { label, do: () => set(after), undo: () => set(before) };
    this.app.history.push(cmd, true);
  }

  // -------------------------------------------------------------------------------------------
  // Layers

  /** Counts explicit selections (the Effects card follows a pick, even of the layer already selected). */
  picks = 0;

  select(id: string | null, add = false): void {
    if (this.anchorEditing) this.setAnchorEditing(false);
    if (this.pathEditing) this.setPathEditing(false);
    this.picks++;
    if (id === null) this.selected = [];
    else if (add) this.selected = this.selected.includes(id) ? this.selected.filter((x) => x !== id) : [...this.selected, id];
    else this.selected = [id];
    const l = this.primary;
    if (l && l.kind === 'drawings') this.app.focusLayer(l.id);
    // selecting never unfolds a row: its ▸ arrow shows the properties
    this.keys.clear();
    this.onChange();
    this.app.requestRender();
  }

  /** A new layer above the selected one (or on top). */
  /** A new layer; an adjustment layer is always its own layer, placed right above `above` (default: on top). */
  /** A layer that shows the shot's sound (an empty drawing with a Sound wave effect). One Undo step. */
  addSoundWaveLayer(): void {
    const before = this.app.history.peekUndo();
    this.addLayer('drawings', this.primary?.id);
    const l = this.primary;
    if (!l || this.app.history.peekUndo() === before) return;
    this.edit('Sound wave', c => {
      const x = c.layers.find(y => y.id === l.id);
      if (!x || x.kind !== 'drawings') return;
      x.name = 'Sound wave';
      x.effects = [...(x.effects ?? []), newEffect('soundwave', `fx${Date.now().toString(36)}`, newSeed())];
    });
    this.app.history.combine(2, 'Add sound wave layer');
    if (!(this.comp.audio ?? []).length) this.app.onNotice?.('Add a sound to this shot to see its wave. Effects you add after Sound wave act on the wave.');
  }

  addLayer(kind: 'drawings' | 'null' | 'camera' | 'adjustment', above?: string): void {
    const c = this.comp;
    const p = this.app.project;
    let made: Layer | null = null;
    const at = this.primary
      ? Math.max(
          0,
          c.layers.findIndex((l) => l.id === this.primary!.id),
        )
      : 0;
    this.edit(`Add ${kind === 'drawings' ? 'drawing' : kind} layer`, (cc) => {
      if (kind === 'adjustment') {
        // its own layer for the whole shot, right above the chosen layer (or on top): its effects
        // change everything below it, and the layers themselves stay as they are
        const d = p.newDrawing();
        made = drawingsLayer(p.newId('L'), 'Adjustment', [{ drawing: d.id, length: Math.max(1, this.app.compEnd) }], p.width, p.height, cc.width, cc.height);
        made.adjust = true;
        const under = above ? cc.layers.findIndex((l) => l.id === above) : -1;
        cc.layers.splice(Math.max(0, under), 0, made);
        return;
      }
      const id = p.newId('L');
      if (kind === 'camera') made = cameraLayer(id, cc);
      else if (kind === 'null') made = nullLayer(id, 'Anchor', cc);
      else {
        const d = p.newDrawing();
        made = drawingsLayer(id, `Drawing ${id.slice(1)}`, [{ drawing: d.id, length: Math.max(1, cc.fps) }], p.width, p.height, cc.width, cc.height);
        made.start = Math.max(0, this.app.frame);
        made.in = made.start;
      }
      cc.layers.splice(at, 0, made);
    });
    const m = made as Layer | null;
    if (m) {
      this.open.add(m.id);
      // an adjustment layer is only its effects: open them to choose one, and keep drawing where you were
      if (kind === 'adjustment') this.app.openEffects?.(m.id);
      else this.select(m.id);
    }
  }

  /** Turn a drawings layer into an adjustment layer or back: one undo step. */
  setAdjust(id: string, on: boolean): void {
    const target = this.layer(id);
    if (on && target?.kind === 'drawings' && target.title) { this.app.onNotice?.('Convert this title to paint before making it an adjustment layer.'); return; }
    if (on && target?.effects?.some(e => temporalEffect(e.type))) {
      this.app.onNotice?.('Remove Echo and Motion blur before making this an adjustment layer.');
      return;
    }
    this.edit(on ? 'Adjustment layer' : 'Adjustment layer off', (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (l && l.kind === 'drawings') {
        if (on) { l.adjust = true; delete l.tweenVectors; }
        else delete l.adjust;
      }
    });
  }

  setVectorTween(id: string, on: boolean, quiet = false): void {
    const l = this.layer(id);
    if (!l || l.kind !== 'drawings' || l.locked || l.adjust || l.guide || l.notes || l.title || !!l.tweenVectors === on) return;
    this.edit(on ? 'Enable vector tweening' : 'Disable vector tweening', c => {
      const layer = c.layers.find(layer => layer.id === id);
      if (layer?.kind !== 'drawings') return;
      if (on) layer.tweenVectors = true;
      else delete layer.tweenVectors;
    });
    if (on && !quiet) this.app.onNotice?.('Use Next pose in Animate to copy a vector drawing and move its points.');
  }

  deleteLayers(ids = this.selected): void {
    if (!ids.length) return;
    this.edit(ids.length === 1 ? 'Delete layer' : 'Delete layers', (c) => {
      const gone = new Set(ids);
      c.layers = c.layers.filter((l) => !gone.has(l.id));
      for (const l of c.layers) if (l.parent && gone.has(l.parent)) l.parent = null;
    });
    this.tidy();
    this.onChange();
  }

  /** Copy layer timing and settings while keeping their drawing and source references. */
  pasteLayers(layers: Layer[], sourceComp: string): boolean {
    const app = this.app, p = app.project, c = this.comp;
    if (!layers.length || app.strokeActive || app.playing || this.dragging || c.layers.length + layers.length > MAX_LAYERS) return false;
    const seen = new Set<string>();
    const usable = (id: string): boolean => {
      if (id === c.id || !p.comps.has(id)) return false;
      if (seen.has(id)) return true;
      seen.add(id);
      return p.comps.get(id)!.layers.every(l => l.kind !== 'comp' || usable(l.comp));
    };
    if (layers.some(l => l.kind === 'comp' ? !usable(l.comp) : l.kind === 'drawings' && (
      l.exposures.some(e => !p.drawings.has(e.drawing)) || (l.mask && !p.drawings.has(l.mask))
    ))) return false;
    const ids = new Map(layers.map(l => [l.id, p.newId('L')]));
    const groups = new Map<string, string>();
    const copies = structuredClone(layers);
    for (const l of copies) {
      l.id = ids.get(l.id)!;
      if (l.parent) l.parent = ids.get(l.parent) ?? (sourceComp === c.id && c.layers.some(x => x.id === l.parent) ? l.parent : null);
      if (l.kind === 'drawings' && l.cel) {
        const group = groups.get(l.cel) ?? l.id;
        groups.set(l.cel, group);
        l.cel = group;
      }
    }
    this.edit('Paste layers', cc => {
      const at = cc.layers.findIndex(l => l.id === this.primary?.id);
      cc.layers.splice(Math.max(0, at), 0, ...copies);
    });
    this.selected = copies.map(l => l.id);
    this.keys.clear();
    this.onChange();
    return true;
  }

  /** Move a layer up (−1) or down (+1) the stack. */
  reorder(id: string, delta: number): void {
    this.edit('Reorder layer', (c) => {
      const i = c.layers.findIndex((l) => l.id === id);
      const j = Math.max(0, Math.min(c.layers.length - 1, i + delta));
      if (i < 0 || i === j) return;
      const [l] = c.layers.splice(i, 1);
      c.layers.splice(j, 0, l!);
    });
  }

  /** Put a layer at an index of the stack (drag to reorder). */
  moveTo(id: string, index: number): void {
    this.edit('Reorder layer', (c) => {
      const i = c.layers.findIndex((l) => l.id === id);
      if (i < 0) return;
      const [l] = c.layers.splice(i, 1);
      c.layers.splice(Math.max(0, Math.min(c.layers.length, index)), 0, l!);
    });
  }

  rename(id: string, name: string): void {
    const clean = name.trim().slice(0, 80);
    if (!clean) return;
    this.edit('Rename layer', (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (l) l.name = clean;
    });
  }

  setFlag(id: string, flag: 'visible' | 'locked', value: boolean): void {
    this.edit(flag === 'visible' ? (value ? 'Show layer' : 'Hide layer') : value ? 'Lock layer' : 'Unlock layer', (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (l) l[flag] = value;
    });
  }

  /** Show / hide or recolour one part (Line or Fill) of a drawings layer. One undo step. */
  setPart(id: string, part: PartName, patch: { visible?: boolean; tint?: string | null; grad?: PartGrad | null }): void {
    const what = patch.visible !== undefined ? `${patch.visible ? 'Show' : 'Hide'} ${PART_LABEL[part].toLowerCase()}` : patch.grad !== undefined ? (patch.grad ? `${PART_LABEL[part]} gradient` : `Flat ${PART_LABEL[part].toLowerCase()}`) : patch.tint ? `Recolour ${PART_LABEL[part].toLowerCase()}` : `Original ${PART_LABEL[part].toLowerCase()}`;
    this.edit(what, (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (l?.kind === 'drawings') l.parts = { ...l.parts, [part]: { ...partOf(l, part), ...patch } };
    });
  }

  /** Back to the defaults for one part (visible, full opacity, own colours, no offset). */
  resetPart(id: string, part: PartName): void {
    this.edit(`Reset ${PART_LABEL[part].toLowerCase()}`, (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (l?.kind !== 'drawings' || !l.parts?.[part]) return;
      const { [part]: _gone, ...rest } = l.parts;
      void _gone;
      l.parts = rest;
    });
  }

  setLabel(id: string, label: number): void {
    this.edit('Layer colour', (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (l) l.label = label;
    });
  }

  setParentOf(id: string, parent: string | null): boolean {
    let ok = true;
    this.edit(parent ? 'Parent layer' : 'Unparent layer', (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (l) ok = setParent(c, l, parent, this.app.frame);
    });
    return ok;
  }

  /**
   * Layer timing in comp frames. Moving `start` slides the layer and its animation together;
   * `in` / `out` trim what shows without touching the content.
   */
  setTiming(id: string, t: { start?: number; in?: number; out?: number | null }, label = 'Move layer'): void {
    if (!this.edit(label, (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (!l) return;
      // trimming the end (ripple on): the layers that started at or after the old end move with it
      if (t.out !== undefined && t.out !== null && t.start === undefined && this.app.rippling) {
        const oldEnd = layerEnd(l, this.app.project.comps, c.fps);
        if (Number.isFinite(oldEnd)) {
          const delta = Math.round(t.out) - oldEnd;
          const moved = shiftLater(c.layers, id, oldEnd, delta);
          if (moved !== c.layers) c.layers.splice(0, c.layers.length, ...moved);
          // the board and the animation drawn in step with it (both ending at the old end) keep
          // ending together: trimming one lengthens or shortens the other's last hold
          const isBoard = (x: Layer) => x.kind === 'drawings' && x.guide === true;
          for (const o of c.layers) {
            if (o.id === id || o.kind !== 'drawings' || o.out !== null || !(isBoard(l) || isBoard(o))) continue;
            const total = totalFrames(o.exposures);
            if (o.start + total !== oldEnd || !delta) continue;
            o.exposures = rippleExposures(o.exposures, total + Math.min(0, delta), delta);
          }
        }
      }
      if (t.start !== undefined) {
        const d = Math.round(t.start) - l.start;
        l.start += d;
        l.in += d;
        if (l.out !== null) l.out += d;
      }
      if (t.in !== undefined) l.in = Math.round(t.in);
      if (t.out !== undefined) l.out = t.out === null ? null : Math.round(t.out);
      if (l.out !== null && l.out <= l.in) l.out = l.in + 1;
    })) return;
    // a layer dragged past the end of a shot with a set length makes the shot that long (one Undo step)
    const after = this.layer(id), c = this.comp;
    if (t.out !== undefined && after?.out != null && c.duration !== null && after.out > c.duration) {
      this.setDuration(after.out);
      this.app.history.combine(2, label);
    }
  }

  /** Beginner asset timing: one instance, one undo step, with no ripple into other tracks. */
  setAssetTiming(id: string, field: AssetTimingField, value?: number): boolean {
    if (this.app.strokeActive || this.app.playing) return false;
    const l = this.layer(id), p = this.app.project;
    if (!l || l.kind !== 'comp' || !p.comps.get(l.comp)?.asset) return false;
    const patch = assetTimingChange(l, this.comp, p.comps, field, value);
    if (!patch) return false;
    return this.edit(`Asset ${field === 'shot' ? 'follows shot end' : field}`, c => {
      const live = c.layers.find(x => x.id === id);
      if (!live || live.kind !== 'comp') return;
      Object.assign(live, patch);
      this.app.frame = Math.max(0, Math.min(this.app.frame, compLength(c, p.comps) - 1));
    });
  }

  /** Live clip timing shares the numeric rules, but commits only on pointer release. */
  assetClipStart(id: string, kind: AssetClipGesture): boolean {
    if (this.app.strokeActive || this.dragging || this.app.playing) return false;
    const l = this.layer(id), project = this.app.project;
    if (!l || l.kind !== 'comp' || !project.comps.get(l.comp)?.asset) return false;
    this.clipGesture = {project, comp:this.comp, before:structuredClone(this.comp.layers), frame:this.app.frame, id, kind};
    this.changedLive(); return true;
  }
  get assetClipDragging(): boolean { return this.clipGesture !== null; }
  assetClipMove(delta: number): void {
    const g = this.clipGesture; if (!g) return;
    if (g.project !== this.app.project || g.comp !== this.comp) { this.assetClipEnd(true); return; }
    const original = g.before.find(l => l.id === g.id), live = this.layer(g.id);
    if (!original || original.kind !== 'comp' || !live) return;
    const patch = assetClipTimingChange(original,g.comp,g.project.comps,g.kind,delta);
    if (!patch) return;
    Object.assign(live,patch);
    this.app.frame = Math.max(0,Math.min(g.frame,compLength(g.comp,g.project.comps)-1));
    this.changedLive();
  }
  assetClipEnd(cancel = false): void {
    const g = this.clipGesture; this.clipGesture = null; if (!g) return;
    const same = g.project === this.app.project && g.comp === this.comp;
    const after = structuredClone(g.comp.layers);
    if (cancel || !same) {
      g.comp.layers = g.before;
      if (same) this.app.frame = Math.max(0,Math.min(g.frame,compLength(g.comp,g.project.comps)-1));
      this.changedLive(); return;
    }
    if (JSON.stringify(after) === JSON.stringify(g.before)) { this.changedLive(); return; }
    this.push(g.kind === 'move' ? 'Move asset clip' : g.kind === 'in' ? 'Trim asset start' : 'Trim asset end',g.comp.id,g.before,after);
    this.changed();
  }

  // -------------------------------------------------------------------------------------------
  // Properties and keys

  /** The value a property has at the playhead. */
  valueNow(l: Layer, n: PropKey): number | Vec2 {
    return valueAt(this.getProp(l, n), this.frameOf(l, n));
  }

  /** The prop after setting `value` at the playhead: a key if animated (or auto-key), else the still value. */
  private withValue(l: Layer, n: PropKey, value: number | Vec2): Prop {
    const p = this.getProp(l, n);
    const f = this.frameOf(l, n);
    if (n === 'remap') {
      // the first pick also keeps what the layer showed at its start (frame 0, or the held frame)
      const base = isAnimated(p) ? p : { value: (l.kind === 'drawings' || l.kind === 'comp') && l.play === 'single' ? l.single : 0, keys: [] };
      return setKey(base, f, value as never, isAnimated(p) ? this.lastEase : 'hold', this.keyAtStart && !isAnimated(p) ? 0 : undefined) as Prop;
    }
    if (isAnimated(p) || this.autoKey) return setKey(p, f, value as never, this.lastEase, this.keyAtStart && !isAnimated(p) ? 0 : undefined) as Prop;
    return { ...p, value } as Prop;
  }

  setValue(id: string, n: PropKey, value: number | Vec2, label = 'Change value'): void {
    this.edit(label, (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (l) { this.setProp(l, n, this.withValue(l, n, value)); if (n === 'anchor') l.anchorFixed = true; }
    });
  }

  // Scrubbing a value (drag on the number, After Effects style): live while dragging, one undo step.
  private scrub: { before: Layer[]; compId: string } | null = null;

  scrubStart(): void {
    if (!this.scrub) this.scrub = { before: structuredClone(this.comp.layers), compId: this.comp.id };
  }

  /** Set a value live during a scrub (no undo step yet). */
  scrubSet(id: string, n: PropKey, value: number | Vec2): void {
    const l = this.comp.layers.find((x) => x.id === id);
    if (!l || !this.scrub) return;
    this.setProp(l, n, this.withValue(l, n, value)); if (n === 'anchor') l.anchorFixed = true;
    this.changedLive();
  }

  /** Finish a scrub: one undo step if anything changed (`cancel` puts it back). */
  scrubEnd(label: string, cancel = false): void {
    const s = this.scrub;
    this.scrub = null;
    if (!s) return;
    const c = this.app.project.comps.get(s.compId);
    if (!c) return;
    if (cancel) {
      c.layers = s.before;
      this.changedLive();
      return;
    }
    const after = structuredClone(c.layers);
    if (JSON.stringify(after) === JSON.stringify(s.before)) return;
    this.push(label, s.compId, s.before, after);
    this.changed();
  }

  /** The diamond: add a key at the playhead holding the current value, or remove the one there. */
  toggleKey(id: string, n: PropKey): void {
    this.edit('Toggle keyframe', (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (!l) return;
      const p = this.getProp(l, n);
      const f = this.frameOf(l, n);
      if (p.keys.some((k) => k.f === f)) this.setProp(l, n, removeKey(p, f));
      else this.setProp(l, n, setKey(p, f, valueAt(p, f) as never, this.lastEase, this.keyAtStart && !isAnimated(p) ? 0 : undefined) as Prop);
    });
    this.keys.clear();
  }

  /** Drop all animation on a property, keeping what it shows now. */
  clearAnimation(id: string, n: PropKey): void {
    this.edit('Clear animation', (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (!l) return;
      const p = this.getProp(l, n);
      this.setProp(l, n, { value: valueAt(p, this.frameOf(l, n)), keys: [] } as Prop);
    });
    this.keys.clear();
  }

  /** Select several keys at once (a box around them); `add` keeps what was selected. */
  selectKeys(refs: KeyRef[], add = false): void {
    if (!add) this.keys.clear();
    for (const r of refs) this.keys.add(keyId(r));
    this.onChange();
  }

  clearKeys(): void {
    if (!this.keys.size) return;
    this.keys.clear();
    this.onChange();
  }

  selectKey(k: KeyRef, add = false): void {
    const id = keyId(k);
    if (add) {
      if (this.keys.has(id)) this.keys.delete(id);
      else this.keys.add(id);
    } else {
      this.keys.clear();
      this.keys.add(id);
    }
    this.onChange();
  }

  selectedKeys(): KeyRef[] {
    return [...this.keys].map((s) => {
      const [layer, prop, f] = s.split('|');
      return { layer: layer!, prop: prop as PropKey, f: Number(f) };
    });
  }

  /** Move selected keys by whole frames (retiming). */
  nudgeKeys(df: number, refs = this.selectedKeys()): void {
    if (!df || !refs.length) return;
    this.edit('Move keys', (c) => {
      const moved = new Map<string, number>();
      // move the farthest first so keys never collide while sliding
      const order = [...refs].sort((a, b) => (df > 0 ? b.f - a.f : a.f - b.f));
      for (const r of order) {
        const l = c.layers.find((x) => x.id === r.layer);
        if (!l) continue;
        this.setProp(l, r.prop, moveKey(this.getProp(l, r.prop), r.f, r.f + df));
        moved.set(keyId(r), r.f + df);
      }
      this.keys = new Set(refs.map((r) => keyId({ ...r, f: r.f + df })));
    });
  }

  deleteKeys(refs = this.selectedKeys()): void {
    if (!refs.length) return;
    this.edit('Delete keys', (c) => {
      for (const r of refs) {
        const l = c.layers.find((x) => x.id === r.layer);
        if (l) this.setProp(l, r.prop, removeKey(this.getProp(l, r.prop), r.f));
      }
    });
    this.keys.clear();
    this.onChange();
  }

  /** Set the easing of the segments that start at the selected keys. */
  setEasing(e: Easing, refs = this.selectedKeys()): void {
    this.lastEase = e;
    if (refs.length) {
      this.edit('Set easing', (c) => {
        for (const r of refs) {
          const l = c.layers.find((x) => x.id === r.layer);
          if (l) this.setProp(l, r.prop, setSegmentEasing(this.getProp(l, r.prop), r.f, e));
        }
      });
    }
    this.onChange();
  }

  /** Dreams' "Set all easings" for a property's whole key row. */
  setAllEasing(id: string, n: PropKey, e: Easing): void {
    this.lastEase = e;
    this.edit('Set all easings', (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (l) this.setProp(l, n, setAllEasings(this.getProp(l, n), e));
    });
  }

  /** Ease only one side of the selected keys' segments (the other side stays as it is): one undo step. */
  setEaseSide(side: 'in' | 'out', refs = this.selectedKeys()): void {
    if (!refs.length) return;
    this.edit(side === 'out' ? 'Ease in only' : 'Ease out only', (c) => {
      for (const r of refs) {
        const l = c.layers.find((x) => x.id === r.layer);
        if (l) this.setProp(l, r.prop, setSegmentSide(this.getProp(l, r.prop), r.f, side, EASED));
      }
    });
    this.onChange();
  }

  /** Give the selected keys' segments a named curve: one undo step. */
  setCurve(id: Curve, refs = this.selectedKeys()): void {
    if (!refs.length) return;
    this.edit(`Curve: ${CURVES.find((c) => c.id === id)?.label ?? id}`, (c) => {
      for (const r of refs) {
        const l = c.layers.find((x) => x.id === r.layer);
        if (l) this.setProp(l, r.prop, setSegmentCurve(this.getProp(l, r.prop), r.f, id));
      }
    });
    this.onChange();
  }

  /**
   * The selected keys as ranges, one per property row: from the first to the last selected key
   * (a single selected key stands for the row's whole key range).
   */
  private keyRanges(refs = this.selectedKeys()): { layer: string; prop: PropKey; from: number; to: number }[] {
    const rows = new Map<string, { layer: string; prop: PropKey; fs: number[] }>();
    for (const r of refs) {
      const id = `${r.layer}|${r.prop}`;
      const row = rows.get(id) ?? { layer: r.layer, prop: r.prop, fs: [] };
      row.fs.push(r.f);
      rows.set(id, row);
    }
    const out: { layer: string; prop: PropKey; from: number; to: number }[] = [];
    for (const row of rows.values()) {
      const l = this.layer(row.layer);
      if (!l) continue;
      const keys = this.getProp(l, row.prop).keys;
      const fs = row.fs.length > 1 ? row.fs : keys.map((k) => k.f);
      if (fs.length > 1) out.push({ layer: row.layer, prop: row.prop, from: Math.min(...fs), to: Math.max(...fs) });
    }
    return out;
  }

  /** Apply a key tool to every selected range: one undo step. */
  private keyTool(label: string, fn: (p: Prop, from: number, to: number) => Prop): boolean {
    const ranges = this.keyRanges();
    if (!ranges.length) { this.app.onNotice?.('Select two keys (or one key of an animated property) first.'); return false; }
    const done = this.edit(label, (c) => {
      for (const r of ranges) {
        const l = c.layers.find((x) => x.id === r.layer);
        if (l) this.setProp(l, r.prop, fn(this.getProp(l, r.prop), r.from, r.to));
      }
    });
    this.onChange();
    return done;
  }

  /** Wiggle between the selected keys (EffectCraft's Wiggler). */
  wiggleKeys(o: WiggleOptions): boolean {
    return this.keyTool('Wiggle', (p, a, b) => wiggle(p, a, b, this.comp.fps, o));
  }

  /** Remove keys that the motion does not need (within `tolerance`). */
  smoothSelectedKeys(tolerance: number): boolean {
    return this.keyTool('Smooth keys', (p, a, b) => smoothKeys(p, a, b, tolerance));
  }

  /** Loop the selected keys `repeats` more times. */
  loopSelectedKeys(mode: LoopMode, repeats: number): boolean {
    return this.keyTool('Loop keys', (p, a, b) => loopKeys(p, a, b, mode, repeats));
  }

  /** Offset the selected layers' keys by `step` frames each, in layer order, reverse or random. */
  staggerLayers(step: number, order: StaggerOrder, seed: number): boolean {
    const ids = this.comp.layers.map((l) => l.id).filter((id) => this.selected.includes(id));
    if (ids.length < 2) { this.app.onNotice?.('Select two or more layers to stagger.'); return false; }
    const offsets = staggerOffsets(ids.length, step, order, seed);
    const done = this.edit('Stagger', (c) => {
      ids.forEach((id, i) => {
        const l = c.layers.find((x) => x.id === id);
        if (!l || !offsets[i]) return;
        for (const n of this.rowsOf(l)) this.setProp(l, n, shiftKeys(this.getProp(l, n), offsets[i]!));
      });
    });
    this.keys.clear();
    this.onChange();
    return done;
  }

  /**
   * Audio React: add baked offsets to properties, one key per frame (comp frames, turned into each
   * layer's time); a point gets them on both axes or one. One undo step, "React to audio".
   */
  bakeReaction(rows: { layer: string; prop: PropKey }[], values: { frame: number; value: number }[], axis: 'both' | 'x' | 'y' = 'both'): boolean {
    if (!rows.length || !values.length) return false;
    const done = this.edit('React to audio', (c) => {
      for (const r of rows) {
        const l = c.layers.find((x) => x.id === r.layer);
        if (!l) continue;
        const before = this.getProp(l, r.prop);
        let p = before;
        for (const { frame, value } of values) {
          const f = frame - l.start, base = valueAt(before, f);
          const v = typeof base === 'number' ? base + value : ([base[0] + (axis === 'y' ? 0 : value), base[1] + (axis === 'x' ? 0 : value)] as Vec2);
          p = setKey(p, f, v as never, 'linear');
        }
        this.setProp(l, r.prop, p);
      }
    });
    this.onChange();
    return done;
  }

  /**
   * Start or stop keyframing an effect setting (the ◆ on the Effects card): on puts a key at the
   * playhead with the value it has now; off drops the keys and keeps that value. One undo step.
   */
  keyEffectSetting(layerId: string, effectId: string, key: string, on: boolean): boolean {
    const n: PropKey = `fx:${effectId}:${key}`;
    const done = this.edit(on ? 'Keyframe effect' : 'Remove effect keys', (c) => {
      const l = c.layers.find((x) => x.id === layerId);
      if (!l) return;
      const p = this.getProp(l, n) as Prop<number>, f = this.frameOf(l), v = valueAt(p, f);
      this.setProp(l, n, on ? setKey(p, f, v, this.lastEase) : { value: v, keys: [] });
    });
    this.onChange();
    return done;
  }

  /** The property rows of the selected keys (one entry per row). */
  selectedRows(): { layer: string; prop: PropKey; from: number; to: number }[] {
    const rows = new Map<string, { layer: string; prop: PropKey; from: number; to: number }>();
    for (const r of this.selectedKeys()) {
      const id = `${r.layer}|${r.prop}`, row = rows.get(id);
      if (row) { row.from = Math.min(row.from, r.f); row.to = Math.max(row.to, r.f); } else rows.set(id, { layer: r.layer, prop: r.prop, from: r.f, to: r.f });
    }
    return [...rows.values()];
  }

  /** The easing copied with Copy easing (both sides of a segment). */
  easeClipboard: { out: Side; in: Side } | null = null;

  /** Copy the easing of the first selected key's segment. */
  copyEasing(): boolean {
    for (const r of this.selectedKeys()) {
      const l = this.layer(r.layer);
      if (!l) continue;
      const keys = this.getProp(l, r.prop).keys, i = keys.findIndex((k) => k.f === r.f);
      if (keys[i] && keys[i + 1]) { this.easeClipboard = { out: { ...keys[i]!.out }, in: { ...keys[i + 1]!.in } }; this.onChange(); return true; }
    }
    this.app.onNotice?.('Select a key that has a key after it, then copy its easing.');
    return false;
  }

  /** Give the selected keys' segments the copied easing: one undo step. */
  pasteEasing(): boolean {
    const s = this.easeClipboard, refs = this.selectedKeys();
    if (!s || !refs.length) return false;
    const done = this.edit('Paste easing', (c) => {
      for (const r of refs) {
        const l = c.layers.find((x) => x.id === r.layer);
        if (l) this.setProp(l, r.prop, setSegmentSide(setSegmentSide(this.getProp(l, r.prop), r.f, 'out', s.out), r.f, 'in', s.in));
      }
    });
    this.onChange();
    return done;
  }

  /** The named curve shared by the selected keys' segments, or null when mixed / none / custom. */
  curveOfSelection(): Curve | null {
    let common: Curve | null | undefined;
    for (const r of this.selectedKeys()) {
      const l = this.layer(r.layer);
      if (!l) continue;
      const p = this.getProp(l, r.prop);
      const i = p.keys.findIndex((k) => k.f === r.f);
      const a = p.keys[i], b = p.keys[i + 1];
      if (!a || !b) continue;
      const e = curveOf(a.out, b.in);
      if (common === undefined) common = e;
      else if (common !== e) return null;
    }
    return common ?? null;
  }

  /** The easing shared by the selected keys' segments, or null when mixed / none. */
  easingOfSelection(): Easing | null {
    let common: Easing | null | undefined;
    for (const r of this.selectedKeys()) {
      const l = this.layer(r.layer);
      if (!l) continue;
      const p = this.getProp(l, r.prop);
      const i = p.keys.findIndex((k) => k.f === r.f);
      const a = p.keys[i];
      const b = p.keys[i + 1];
      if (!a || !b) continue;
      const e = easingOf(a.out, b.in);
      if (common === undefined) common = e;
      else if (common !== e) return null;
    }
    return common ?? null;
  }

  /** A key's frame on the shot's clock (keys are stored in their layer's own time). */
  keyShotFrame(r: KeyRef): number {
    const l = this.layer(r.layer);
    return l ? r.f + (this.app.frame - this.frameOf(l, r.prop)) : r.f;
  }

  /**
   * Stretch (factor > 1) or squeeze the timing of the selected keys around a shot frame: the first
   * selected key by default, so the motion starts on time and ends later or sooner. One Undo step.
   */
  scaleKeys(factor: number, pivotShot?: number, refs = this.selectedKeys()): boolean {
    if (!refs.length || !Number.isFinite(factor) || factor <= 0 || Math.abs(factor - 1) < 1e-6) return false;
    const pivot = pivotShot ?? Math.min(...refs.map((r) => this.keyShotFrame(r)));
    const rows = new Map<string, KeyRef[]>();
    for (const r of refs) rows.set(`${r.layer}|${r.prop}`, [...(rows.get(`${r.layer}|${r.prop}`) ?? []), r]);
    const next = new Set<string>();
    const made = this.edit(factor > 1 ? 'Stretch key timing' : 'Squeeze key timing', (c) => {
      for (const list of rows.values()) {
        const l = c.layers.find((x) => x.id === list[0]!.layer);
        if (!l) continue;
        const n = list[0]!.prop, offset = this.app.frame - this.frameOf(l, n), before = this.getProp(l, n);
        const frames = new Set(list.map((r) => r.f)), after = scaleKeyTimes(before, frames, pivot - offset, factor);
        this.setProp(l, n, after);
        // the selection follows the moved keys (new objects; untouched keys keep their identity)
        for (const k of after.keys) if (!before.keys.includes(k)) next.add(keyId({ layer: l.id, prop: n, f: k.f }));
      }
    });
    if (made) { this.keys = next; this.onChange(); }
    return made;
  }

  /** Mirror the selected keys (or a whole row) in time so the motion plays backwards. */
  reverse(refs = this.selectedKeys()): void {
    const rows = new Map<string, KeyRef[]>();
    for (const r of refs) rows.set(`${r.layer}|${r.prop}`, [...(rows.get(`${r.layer}|${r.prop}`) ?? []), r]);
    if (!rows.size) return;
    this.edit('Reverse keys', (c) => {
      for (const list of rows.values()) {
        const l = c.layers.find((x) => x.id === list[0]!.layer);
        if (!l) continue;
        const frames = list.map((r) => r.f);
        const a = Math.min(...frames);
        const b = Math.max(...frames);
        const p = this.getProp(l, list[0]!.prop);
        this.setProp(l, list[0]!.prop, reverseKeys(p, a, b));
      }
    });
    // selection follows the mirrored positions
    this.keys.clear();
  }

  // -------------------------------------------------------------------------------------------
  // Canvas gestures: drag a layer, its corner (scale) or the top handle (rotate)

  get canEditAnchor(): boolean {
    const l = this.primary;
    return !!l && l.kind !== 'camera' && !l.adjust && !l.guide && !l.locked && l.visible && this.app.frame >= l.in && this.app.frame < layerEnd(l, this.app.project.comps, this.comp.fps);
  }
  setAnchorEditing(on: boolean): void {
    this.gestureEnd(true);
    if (on && (!this.canEditAnchor || this.app.playing || this.app.strokeActive)) { this.app.onNotice?.('Select unlocked artwork or a null at the playhead first.'); return; }
    if (on && this.pathEditing) this.setPathEditing(false);
    this.anchorEditing = on; this.onChange(); this.app.requestRender();
  }
  /** Reposition a pivot without changing the layer matrix at this frame. */
  private anchorTransform(l: Layer, next: Vec2, autoKey = this.autoKey): Layer['transform'] {
    const f = this.frameOf(l), t = l.transform, old = valueAt(t.anchor, f), pos = valueAt(t.position, f), m = localMatrix(l, this.app.frame);
    const dx = next[0] - old[0], dy = next[1] - old[1], position: Vec2 = [pos[0] + m[0] * dx + m[2] * dy, pos[1] + m[1] * dx + m[3] * dy];
    const write = (p: Prop<Vec2>, v: Vec2) => isAnimated(p) || autoKey ? setKey(p, f, v, this.lastEase, this.keyAtStart && !isAnimated(p) ? 0 : undefined) : { ...p, value: v };
    const result = { ...structuredClone(t), anchor: write(t.anchor, next), position: write(t.position, position) };
    validateProperty(result.anchor); validateProperty(result.position); return result;
  }
  anchorPreset(x: number, y: number): boolean {
    if (!this.canEditAnchor || this.dragging || this.app.playing || this.app.strokeActive) return false;
    if (![x, y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) return false;
    const l = this.primary!, measured = l.kind === 'null' ? this.bounds(l) : layerContentBox(this.app.project, this.comp, l, this.app.frame);
    if (measured === undefined) { this.app.onNotice?.('Artwork is still loading. Try the anchor preset again.'); return false; }
    const b = measured ?? this.page(l), next: Vec2 = [b.x + b.w * x, b.y + b.h * y], transform = this.anchorTransform(l, next);
    return this.edit('Place anchor', c => { const live = c.layers.find(v => v.id === l.id)!; live.transform = transform; live.anchorFixed = true; });
  }
  private anchorStart(pt: Vec2, zoom: number): boolean {
    if (!this.canEditAnchor || this.dragging || this.app.playing || this.app.strokeActive) return false;
    const l = this.primary!, matrix = this.matrixOf(l);
    if (Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]) < 1e-10) { this.app.onNotice?.('Restore the layer and parent scale before dragging the anchor.'); return false; }
    const a = this.anchorStage(l), near = Math.hypot(pt[0] - a[0], pt[1] - a[1]) * zoom <= 22;
    this.anchorDrag = { comp: this.comp.id, frame: this.app.frame, layer: l.id, before: structuredClone(this.comp.layers), original: structuredClone(l), inverse: invert(matrix), offset: near ? [pt[0] - a[0], pt[1] - a[1]] : [0, 0], autoKey: this.autoKey, moved: false, start: pt, zoom, fromHandle: near };
    if (!near) this.anchorMove(pt); return true;
  }
  private anchorMove(pt: Vec2): void {
    const d = this.anchorDrag, l = d ? this.layer(d.layer) : null; if (!d) return;
    if (!l || this.comp.id !== d.comp || this.app.frame !== d.frame) { this.anchorEnd(true); return; }
    if (d.fromHandle && !d.moved && Math.hypot(pt[0] - d.start[0], pt[1] - d.start[1]) * d.zoom < 3) return;
    const next = apply(d.inverse, [pt[0] - d.offset[0], pt[1] - d.offset[1]]), old = valueAt(d.original.transform.anchor, this.frameOf(d.original));
    if (Math.hypot(next[0] - old[0], next[1] - old[1]) < 1e-8) { l.transform = structuredClone(d.original.transform); if (d.original.anchorFixed) l.anchorFixed = true; else delete l.anchorFixed; d.moved = false; }
    else { try { l.transform = this.anchorTransform(d.original, next, d.autoKey); l.anchorFixed = true; d.moved = true; } catch (e) { this.app.onNotice?.((e as Error).message); return; } }
    this.changedLive();
  }
  private anchorEnd(cancel: boolean): void {
    const d = this.anchorDrag; this.anchorDrag = null; if (!d) return;
    const comp = this.app.project.comps.get(d.comp); if (!comp) return;
    if (cancel || !d.moved || this.app.frame !== d.frame || this.comp.id !== d.comp) { comp.layers = d.before; this.changedLive(); return; }
    this.push('Move anchor', d.comp, d.before, structuredClone(comp.layers)); this.changed();
  }

  replaceProperty(id: string, n: PropKey, expected: string, next: Prop, label: string): boolean {
    const layer = this.layer(id); if (!layer || layer.locked) throw new Error('Choose an unlocked layer.');
    if (this.app.strokeActive || this.app.playing || this.dragging || JSON.stringify(this.getProp(layer, n)) !== expected) throw new Error('The property changed. Close and reopen the editor.');
    validateProperty(next); if (n === 'zoom' && [next.value, ...next.keys.map(k => k.v)].some(v => Number(v) <= 0)) throw new Error('Camera zoom must stay above zero.');
    return this.edit(label, c => { const live = c.layers.find(l => l.id === id); if (live) this.setProp(live, n, structuredClone(next)); });
  }
  /**
   * The vector line (drawn with Vector on a visible drawing or guide layer, at this frame) nearest a
   * stage point, as stage points from its first drawn point, with the layer it is on; null when none
   * is within `reach`. Notes layers are left out.
   */
  lineAt(pt: Vec2, reach: number): { points: Vec2[]; layer: string } | null {
    const c = this.comp, f = this.app.frame, view = this.view();
    let best: { points: Vec2[]; layer: string } | null = null, bestD = reach;
    for (const l of c.layers) {
      if (l.kind !== 'drawings' || !l.visible || l.notes) continue;
      const id = drawingOf(l, f), d = id ? this.app.project.drawings.get(id) : undefined;
      if (!d) continue;
      const m = mul(view, worldMatrix(c, l, f));
      for (const s of d.vectors) {
        // any vector line (pen, vector brush strokes, imported shapes)
        const own = s.shape?.path ? sampleShapePath(s.shape.path, s.shape.matrix) : s.points.map(p => [p.x, p.y] as Vec2);
        if (own.length < 2) continue;
        const pts = own.map(p => apply(m, p) as Vec2);
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1]!, b = pts[i]!, dx = b[0] - a[0], dy = b[1] - a[1], ll = dx * dx + dy * dy;
          const t = ll ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / ll)) : 0;
          const dd = Math.hypot(pt[0] - (a[0] + dx * t), pt[1] - (a[1] + dy * t));
          if (dd < bestD) { bestD = dd; best = { points: pts, layer: l.id }; }
        }
      }
    }
    if (best) return best;
    // a painted line (brush): the route runs through its middle, end to end. Front layers first;
    // thick painted shapes (characters) are not routes, so the pick whip still parents to them.
    for (const l of [...c.layers].reverse()) {
      if (l.kind !== 'drawings' || !l.visible || l.notes || l.caption) continue;
      const id = drawingOf(l, f), d = id ? this.app.project.drawings.get(id) : undefined;
      if (!d) continue;
      const m = mul(view, worldMatrix(c, l, f)), inv = invert(m);
      if (!inv) continue;
      const [x, y] = apply(inv, pt), scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      if (!paintedNear(d, x, y, reach / scale)) continue;
      const route = paintedRoute(d);
      if (route && route.length >= 2) return { points: route.map(p => apply(m, p) as Vec2), layer: l.id };
    }
    return null;
  }

  /** Start (or stop) drawing a path for the selected layer to travel along. */
  setDrawingPath(on: boolean): void {
    if (on) {
      const layer = this.primary;
      if (!layer || layer.locked) { this.app.onNotice?.('Select an unlocked layer to animate along a path.'); return; }
      if (this.anchorEditing) this.setAnchorEditing(false);
      if (this.pathEditing) this.setPathEditing(false);
      this.app.onNotice?.(`Draw the path for “${layer.name}”, or tap a line you drew with Vector. Esc cancels.`);
    }
    this.pathStroke = null;
    this.drawingPath = on;
    this.onChange(); this.app.requestRender();
  }

  /**
   * Animate along a path: the layer's position follows `points` (stage space, as drawn) from the
   * playhead for `frames` frames. Replaces its position keys. One Undo step.
   * The artwork itself travels on the line: a layer whose anchor is still the untouched page centre
   * gets it moved to the centre of what it shows first (an anchor placed by hand is kept).
   */
  animateAlongPath(id: string, points: Vec2[], frames: number, options: { even: boolean; orient: boolean }): boolean {
    const layer = this.layer(id);
    if (!layer || layer.locked) return false;
    const inv = invert(this.pathMatrix(layer));
    if (!inv) { this.app.onNotice?.('Restore the parent scale before giving it a path.'); return false; }
    const f0 = this.frameOf(layer);
    const prop = pathProp(points.map(p => apply(inv, p)), f0, f0 + Math.max(1, Math.round(frames)), options.even);
    if (!prop) { this.app.onNotice?.('That path is too short. Draw a longer line.'); return false; }
    const made = this.edit('Animate along path', c => {
      const l = c.layers.find(x => x.id === id);
      if (!l) return;
      const centre = this.pathAnchor(layer);
      if (centre) { l.transform.anchor = { ...l.transform.anchor, value: centre }; l.anchorFixed = true; }
      l.transform.position = prop;
      if (options.orient) l.transform.orient = true; else delete l.transform.orient;
    });
    if (made) this.app.onNotice?.('Path set. Play to watch it travel; Edit motion path reshapes it.');
    return made;
  }

  /** Where a layer's anchor should be to travel a path: the centre of its artwork, or null to keep it. */
  private pathAnchor(l: Layer): Vec2 | null {
    if (l.anchorFixed || isAnimated(l.transform.anchor) || (l.kind !== 'drawings' && l.kind !== 'comp')) return null;
    const b = layerContentBox(this.app.project, this.comp, l, this.app.frame);
    if (!b) return null;
    const next: Vec2 = [b.x + b.w / 2, b.y + b.h / 2], [ax, ay] = l.transform.anchor.value;
    return Math.hypot(next[0] - ax, next[1] - ay) < 0.5 ? null : next;
  }

  /** Even speed on a layer's position path (on or off). One Undo step. */
  setEvenSpeed(id: string, on: boolean): void {
    const l = this.layer(id);
    if (!l || l.locked || l.transform.position.keys.length < 2 || !!l.transform.position.even === on) return;
    this.edit(on ? 'Even speed on path' : 'Key timing on path', c => {
      const x = c.layers.find(y => y.id === id);
      if (!x) return;
      if (on) x.transform.position.even = true; else delete x.transform.position.even;
    });
  }

  /** Orient along path (on or off). One Undo step. */
  setOrient(id: string, on: boolean): void {
    const l = this.layer(id);
    if (!l || l.locked || !!l.transform.orient === on) return;
    this.edit(on ? 'Orient along path' : 'Stop orienting along path', c => {
      const x = c.layers.find(y => y.id === id);
      if (!x) return;
      if (on) x.transform.orient = true; else delete x.transform.orient;
    });
  }

  setPathEditing(on: boolean): void {
    if (on && this.anchorEditing) this.setAnchorEditing(false);
    this.gestureEnd(true);
    if (!on) { this.pathEditing = false; this.pathFrame = null; if (this.pathView !== null) this.throughCamera = this.pathView; this.pathView = null; this.onChange(); this.app.requestRender(); return; }
    const layer = this.primary;
    if (!layer || layer.locked || layer.transform.position.keys.length < 2 || layer.transform.position.keys.length > 1000) { this.app.onNotice?.('Choose an unlocked layer with 2–1,000 position keys.'); return; }
    this.pathEditing = true; this.pathFrame = layer.transform.position.keys.reduce((a, b) => Math.abs(b.f - this.frameOf(layer)) < Math.abs(a.f - this.frameOf(layer)) ? b : a).f;
    if (layer.kind === 'camera') { this.pathView = this.throughCamera; this.throughCamera = false; }
    this.onChange(); this.app.requestRender();
  }
  changePath(smooth: boolean): void {
    const l = this.primary; if (!l || l.locked || l.transform.position.keys.length < 2) { this.app.onNotice?.('Select artwork with at least two position keys.'); return; }
    const p = l.transform.position; this.replaceProperty(l.id, 'position', JSON.stringify(p), smooth ? smoothPath(p) : straightPath(p), smooth ? 'Smooth motion path' : 'Straight motion path');
  }
  pathMatrix(layer: Layer): Mat { return mul(this.view(), this.parentMatrix(layer)); }
  private pathStart(pt: Vec2, zoom: number): boolean {
    const layer = this.primary; if (!layer || layer.locked || layer.transform.position.keys.length < 2 || layer.transform.position.keys.length > 1000) return false;
    const matrix = this.pathMatrix(layer); if (Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]) < 1e-10) { this.app.onNotice?.('Restore the parent scale before editing its path.'); return false; }
    const p = layer.transform.position; let hit: { index: number; side: 'point' | 'in' | 'out' } | null = null, distance = 17 / zoom;
    const pick = (v: Vec2, index: number, side: 'point' | 'in' | 'out') => { const q = apply(matrix, v), d = Math.hypot(q[0] - pt[0], q[1] - pt[1]); if (d < distance) { distance = d; hit = { index, side }; } };
    const selected = p.keys.findIndex(k => k.f === this.pathFrame);
    if (selected >= 0) for (const side of ['in', 'out'] as const) { if (side === 'in' && selected === 0 || side === 'out' && selected === p.keys.length - 1) continue; const k = p.keys[selected]!, handle = spatialHandle(p, selected, side); pick([k.v[0] + handle[0], k.v[1] + handle[1]], selected, side); }
    p.keys.forEach((k, i) => pick(k.v, i, 'point'));
    if (!hit) return false; const chosen = hit as { index: number; side: 'point' | 'in' | 'out' };
    this.pathFrame = p.keys[chosen.index]!.f; this.keys = new Set([keyId({ layer: layer.id, prop: 'position', f: this.pathFrame })]);
    this.pathDrag = { layer: layer.id, before: structuredClone(this.comp.layers), ...chosen, start: pt, original: structuredClone(p), moved: false }; this.onChange(); this.app.requestRender(); return true;
  }
  private pathMove(pt: Vec2): void {
    const d = this.pathDrag, layer = d ? this.layer(d.layer) : null; if (!d || !layer) return;
    const matrix = this.pathMatrix(layer), local = apply(invert(matrix), pt), prop = structuredClone(d.original), key = prop.keys[d.index]!;
    if (d.side === 'point') key.v = local;
    else { key.spatial = { in: spatialHandle(d.original, d.index, 'in'), out: spatialHandle(d.original, d.index, 'out') }; const offset: Vec2 = [local[0] - key.v[0], local[1] - key.v[1]]; key.spatial[d.side] = offset; if (this.pathLinked) key.spatial[d.side === 'in' ? 'out' : 'in'] = [-offset[0], -offset[1]]; }
    prop.value = [...prop.keys[0]!.v];
    try { validateProperty(prop); } catch { return; }
    layer.transform.position = prop; d.moved = JSON.stringify(prop) !== JSON.stringify(d.original); this.changedLive();
  }
  private pathEnd(cancel: boolean): void {
    const d = this.pathDrag; this.pathDrag = null; if (!d) return;
    if (cancel || !d.moved) { this.comp.layers = d.before; this.changedLive(); return; }
    this.push(d.side === 'point' ? 'Move motion path point' : 'Curve motion path', this.comp.id, d.before, structuredClone(this.comp.layers)); this.changed();
  }

  /** Stage space (what the canvas shows) → comp space, undoing the camera. */
  toComp(p: Vec2): Vec2 {
    return apply(invert(this.view()), p);
  }

  view(): Mat {
    return this.throughCamera ? viewMatrix(this.comp, this.app.frame, this.app.project.comps) : [1, 0, 0, 1, 0, 0];
  }

  /** The layer's page rectangle in its own space (the drawing paper, or the precomp's frame). */
  page(l: Layer): { x: number; y: number; w: number; h: number } {
    const p = this.app.project;
    if (l.kind === 'comp') {
      const n = p.comps.get(l.comp);
      return { x: 0, y: 0, w: n?.width ?? 100, h: n?.height ?? 100 };
    }
    return { x: 0, y: 0, w: p.width, h: p.height };
  }

  /**
   * The box handles and hit tests use, in the layer's own space: what the layer shows right now
   * (the drawing's ink and paint, or a precomp's visible content), not the whole page. An empty
   * frame gets a small box at the anchor; a parked drawing never measured falls back to the page.
   */
  bounds(l: Layer): { x: number; y: number; w: number; h: number } {
    if (l.kind === 'drawings' || l.kind === 'comp') {
      const b = layerContentBox(this.app.project, this.comp, l, this.app.frame);
      if (b === undefined) return this.page(l);
      if (b) return { x: b.x - CONTENT_PAD, y: b.y - CONTENT_PAD, w: b.w + CONTENT_PAD * 2, h: b.h + CONTENT_PAD * 2 };
      const [ax, ay] = valueAt(l.transform.anchor, this.frameOf(l));
      return { x: ax - NULL_HALF, y: ay - NULL_HALF, w: NULL_HALF * 2, h: NULL_HALF * 2 };
    }
    if (l.kind === 'camera') return { x: 0, y: 0, w: this.comp.width, h: this.comp.height };
    const [ax, ay] = valueAt(l.transform.anchor, this.frameOf(l));
    return { x: ax - NULL_HALF, y: ay - NULL_HALF, w: NULL_HALF * 2, h: NULL_HALF * 2 };
  }

  /** Layer space → stage space at the playhead. */
  matrixOf(l: Layer): Mat {
    return mul(this.view(), worldMatrix(this.comp, l, this.app.frame));
  }

  /** The four corners of a layer in stage space. */
  corners(l: Layer): Vec2[] {
    const b = this.bounds(l);
    const m = this.matrixOf(l);
    return [apply(m, [b.x, b.y]), apply(m, [b.x + b.w, b.y]), apply(m, [b.x + b.w, b.y + b.h]), apply(m, [b.x, b.y + b.h])];
  }

  /** Topmost active layer containing a stage point; locked layers need explicit permission. */
  hitLayer(p: Vec2, options: GestureOptions = {}): Layer | null {
    for (const l of this.comp.layers) {
      if (!l.visible || (l.locked && !options.allowLocked) || (options.accept && !options.accept(l))) continue;
      if (l.kind === 'camera' && this.throughCamera) continue;
      const end = layerEnd(l, this.app.project.comps, this.comp.fps);
      if (this.app.frame < l.in || this.app.frame >= end) continue;
      const q = apply(invert(this.matrixOf(l)), p);
      const b = this.bounds(l);
      if (q[0] >= b.x && q[0] <= b.x + b.w && q[1] >= b.y && q[1] <= b.y + b.h) return l;
    }
    return null;
  }

  /** Where the rotate handle sits (stage space): above the top edge, a fixed screen distance out. */
  rotateHandle(l: Layer, zoom: number): Vec2 {
    const [a, b] = this.corners(l);
    const mid: Vec2 = [(a![0] + b![0]) / 2, (a![1] + b![1]) / 2];
    const dx = b![0] - a![0];
    const dy = b![1] - a![1];
    const len = Math.hypot(dx, dy) || 1;
    const out = 34 / zoom;
    return [mid[0] + (dy / len) * out, mid[1] - (dx / len) * out];
  }

  /**
   * Scale and rotate turn around the drawing, not the middle of the page: a layer that still has
   * its untouched pivot (page centre, nothing animated) gets its anchor moved to the centre of
   * what it shows, with position compensated so nothing moves. Part of the gesture's undo step.
   * Once moved (or once anything is animated) the anchor stays put, so animation keeps one pivot.
   */
  private pivotOnContent(l: Layer): void {
    if (l.anchorFixed || l.kind !== 'drawings' && l.kind !== 'comp') return;
    const t = l.transform;
    if (isAnimated(t.anchor) || isAnimated(t.position) || isAnimated(t.scale) || isAnimated(t.rotation)) return;
    const pg = this.page(l);
    const [ax, ay] = t.anchor.value;
    if (Math.abs(ax - pg.w / 2) > 0.5 || Math.abs(ay - pg.h / 2) > 0.5) return;
    const b = layerContentBox(this.app.project, this.comp, l, this.app.frame);
    if (!b) return;
    const nx = b.x + b.w / 2;
    const ny = b.y + b.h / 2;
    const m = localMatrix(l, this.app.frame);
    const [dx, dy] = [nx - ax, ny - ay];
    const [px, py] = t.position.value;
    t.anchor = { ...t.anchor, value: [nx, ny] };
    t.position = { ...t.position, value: [px + m[0] * dx + m[2] * dy, py + m[1] * dx + m[3] * dy] };
  }

  private anchorStage(l: Layer): Vec2 {
    return apply(this.matrixOf(l), valueAt(l.transform.anchor, this.frameOf(l)));
  }

  /**
   * Start dragging at a stage point. `zoom` is screen px per stage unit (handle size). Returns
   * true when something was grabbed. Dragging the selected layer's rotate handle rotates; a corner
   * scales; anywhere else on a layer moves it (selecting it first).
   */
  gestureStart(pt: Vec2, zoom: number, add = false, options: GestureOptions = {}): boolean {
    if (this.anchorEditing && this.app.workspace === 'motion') return this.anchorStart(pt, zoom);
    if (this.drawingPath && this.app.workspace === 'motion') { this.pathStroke = [pt]; this.pathZoom = zoom; this.app.requestRender(); return true; }
    if (this.pathEditing && this.app.workspace === 'motion') return this.pathStart(pt, zoom);
    const near = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) * zoom <= HANDLE_PX;
    const sel = this.primary;
    let kind: GestureKind = 'move';
    let target: Layer | null = null;
    if (sel && sel.visible && (!sel.locked || options.allowLocked) && (!options.accept || options.accept(sel)) && this.app.frame >= sel.in && this.app.frame < layerEnd(sel, this.app.project.comps, this.comp.fps)) {
      if (!options.simple && near(this.rotateHandle(sel, zoom), pt)) [kind, target] = ['rotate', sel];
      else if (sel.kind !== 'null' && this.corners(sel).some((c) => near(c, pt))) [kind, target] = ['scale', sel];
    }
    // looking through the selected camera: any drag moves the camera (the picture follows the finger)
    if (!target && sel && sel.kind === 'camera' && this.throughCamera && sel.visible && !sel.locked && !add && (!options.accept || options.accept(sel))) target = sel;
    if (!target && this.selected.length > 1) target = this.hitLayer(pt, { ...options, accept: l => this.selected.includes(l.id) && (!options.accept || options.accept(l)) });
    if (!target) {
      target = this.hitLayer(pt, options);
      if (!target) {
        if (!add) this.select(null);
        return false;
      }
      if (!this.selected.includes(target.id) || add) this.select(target.id, add);
    }
    const before = structuredClone(this.comp.layers);
    if (kind !== 'move') this.pivotOnContent(target);
    const anchor = this.anchorStage(target);
    const movable = kind === 'move' && target.kind !== 'camera' ? this.selected.map(id => this.layer(id)).filter((l): l is Layer => !!l && l.visible && (!l.locked || !!options.allowLocked) && l.kind !== 'camera' && (!options.accept || options.accept(l))) : [target];
    if (!movable.length) return false;
    const moving = new Set(movable.map(l => l.id));
    const movesWithSelection = (l: Layer) => { const seen = new Set<string>(); let id: string | null = l.id; while (id && !seen.has(id)) { if (moving.has(id)) return true; seen.add(id); id = this.layer(id)?.parent ?? null; } return false; };
    const box = this.snap.on && target.kind !== 'camera' ? unionBoxes(movable.map(l => this.layoutBox(l))) : null;
    const targets: LayoutBox[] = [];
    if (this.snap.on && this.snap.canvas) targets.push({ x: 0, y: 0, w: this.comp.width, h: this.comp.height });
    if (this.snap.on && this.snap.layers) for (const l of this.comp.layers) if (!movesWithSelection(l) && l.visible && !l.guide && !l.adjust && l.kind !== 'camera' && this.app.frame >= l.in && this.app.frame < layerEnd(l, this.app.project.comps, this.comp.fps)) targets.push(this.layoutBox(l));
    this.snapGuides = [];
    this.gesture = {
      kind,
      layer: target.id,
      before,
      startPt: pt,
      anchorComp: anchor,
      startDist: Math.max(1e-6, Math.hypot(pt[0] - anchor[0], pt[1] - anchor[1])),
      startAngle: Math.atan2(pt[1] - anchor[1], pt[0] - anchor[0]),
      moved: false,
      zoom, simple: options.simple ?? false, autoKey: options.autoKey ?? this.autoKey, moveIds: movable.map(l => l.id), box, targets,
    };
    return true;
  }

  get dragging(): boolean {
    return this.gesture !== null || this.clipGesture !== null || this.pathDrag !== null || this.anchorDrag !== null;
  }

  gestureMove(pt: Vec2): void {
    if (this.pathStroke) { const last = this.pathStroke[this.pathStroke.length - 1]!; if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) >= 1.5) { this.pathStroke.push(pt); this.app.requestRender(); } return; }
    if (this.anchorDrag) { this.anchorMove(pt); return; }
    if (this.pathDrag) { this.pathMove(pt); return; }
    const g = this.gesture;
    if (!g) return;
    const c = this.comp;
    const original = g.before.find((l) => l.id === g.layer);
    const live = c.layers.find((l) => l.id === g.layer);
    if (!original || !live) return;
    if (!g.moved && Math.hypot(pt[0] - g.startPt[0], pt[1] - g.startPt[1]) * g.zoom < 3) return;
    g.moved = true;
    const f = this.frameOf(original);
    const set = (n: PropName, value: number | Vec2) => {
      const base = this.getProp(original, n);
      const p = isAnimated(base) || g.autoKey ? setKey(base, f, value as never, this.lastEase, this.keyAtStart && !isAnimated(base) ? 0 : undefined) : { ...base, value };
      this.setProp(live, n, p as Prop);
    };
    const dx = pt[0] - g.startPt[0];
    const dy = pt[1] - g.startPt[1];
    // a camera moves opposite to the picture: dragging the view drags the world with the finger
    if (original.kind === 'camera') {
      const pos = valueAt(original.transform.position, f);
      const rot = (valueAt(original.transform.rotation, f) * Math.PI) / 180;
      const z = Math.max(1, valueAt(original.zoom, f)) / 100;
      if (g.kind === 'move') {
        const cx = (Math.cos(rot) * dx - Math.sin(rot) * dy) / z;
        const cy = (Math.sin(rot) * dx + Math.cos(rot) * dy) / z;
        set('position', [pos[0] - cx, pos[1] - cy]);
      } else if (g.kind === 'scale') {
        set('zoom', Math.max(5, valueAt(original.zoom, f) * (Math.hypot(pt[0] - g.anchorComp[0], pt[1] - g.anchorComp[1]) / g.startDist)));
      } else {
        const ang = Math.atan2(pt[1] - g.anchorComp[1], pt[0] - g.anchorComp[0]) - g.startAngle;
        set('rotation', valueAt(original.transform.rotation, f) - (ang * 180) / Math.PI);
      }
      this.changedLive();
      return;
    }
    if (g.kind === 'move') {
      const from = this.fromStage(g.startPt), to = this.fromStage(pt); let delta: Vec2 = [to[0] - from[0], to[1] - from[1]];
      if (this.snap.on && g.box) {
        const v = this.view(), scale = Math.max(Math.hypot(v[0], v[1]), Math.hypot(v[2], v[3]), 1e-6);
        const snapped = snapBox({ ...g.box, x: g.box.x + delta[0], y: g.box.y + delta[1] }, g.targets, 7 / (g.zoom * scale), this.snap.grid ? this.snap.size : 0);
        delta = [delta[0] + snapped.delta[0], delta[1] + snapped.delta[1]]; this.snapGuides = snapped.guides;
      }
      try { const next = this.translatedLayers(g.before, new Map(g.moveIds.map(id => [id, delta])), g.autoKey); for (const layer of c.layers) { const changed = next.find(x => x.id === layer.id); if (changed) layer.transform.position = changed.transform.position; } }
      catch (e) { this.app.onNotice?.((e as Error).message); this.gestureEnd(true); return; }
    } else if (g.kind === 'scale') {
      const ratio = Math.hypot(pt[0] - g.anchorComp[0], pt[1] - g.anchorComp[1]) / g.startDist;
      const k = g.simple ? Math.max(0.01, ratio) : ratio;
      const s = valueAt(original.transform.scale, f);
      set('scale', [s[0] * k, s[1] * k]);
    } else {
      const ang = Math.atan2(pt[1] - g.anchorComp[1], pt[0] - g.anchorComp[0]) - g.startAngle;
      set('rotation', valueAt(original.transform.rotation, f) + (ang * 180) / Math.PI);
    }
    this.changedLive();
  }

  setSnap(patch: Partial<SnapPrefs>): void {
    this.snap = readSnap({ ...this.snap, ...patch }); this.snapGuides = [];
    try { localStorage.setItem('2dope.motion.snap.v1', JSON.stringify(this.snap)); } catch { /* session only */ }
    this.app.requestRender(); this.onChange();
  }
  /** Visible bounds in composition coordinates, excluding the selection-handle padding. */
  layoutBox(l: Layer, c = this.comp): LayoutBox {
    const b = l.kind === 'null' ? null : layerContentBox(this.app.project, c, l, this.app.frame);
    const local = l.kind === 'null' ? (() => { const a = valueAt(l.transform.anchor, layerFrame(l, this.app.frame)); return { x: a[0], y: a[1], w: 0, h: 0 }; })() : b === undefined ? this.page(l) : b ?? this.page(l);
    const m = worldMatrix(c, l, this.app.frame), pts = [[local.x, local.y], [local.x + local.w, local.y], [local.x + local.w, local.y + local.h], [local.x, local.y + local.h]].map(p => apply(m, p as Vec2));
    const x = Math.min(...pts.map(p => p[0])), y = Math.min(...pts.map(p => p[1])); return { x, y, w: Math.max(...pts.map(p => p[0])) - x, h: Math.max(...pts.map(p => p[1])) - y };
  }
  private layoutSelection(): Layer[] {
    if (this.app.strokeActive || this.app.playing || this.dragging) throw new Error('Finish the current edit first.');
    const layers = this.selected.map(id => this.layer(id)).filter((l): l is Layer => !!l);
    if (!layers.length) throw new Error('Select layers first.');
    if (layers.some(l => l.kind === 'camera' || l.adjust || l.guide || !l.visible || this.app.frame < l.in || this.app.frame >= layerEnd(l, this.app.project.comps, this.comp.fps))) throw new Error('Select visible artwork or anchors at the playhead.');
    if (layers.some(l => l.locked) && !this.app.arrangingAssets) throw new Error('Unlock the selected layers first.');
    return layers;
  }
  /** World translations are solved against moved parents, so parent/child selections never double-move. */
  private translatedLayers(source: Layer[], deltas: Map<string, Vec2>, autoKey = this.autoKey): Layer[] {
    const c = { ...this.comp, layers: source }, result = structuredClone(source);
    for (const l of source) {
      const delta = deltas.get(l.id); if (!delta) continue;
      const parent = l.parent ? source.find(x => x.id === l.parent) : null, matrix = parent ? worldMatrix(c, parent, this.app.frame) : [1, 0, 0, 1, 0, 0] as Mat;
      const seen = new Set<string>(); let ancestor = parent;
      while (ancestor && !seen.has(ancestor.id)) { seen.add(ancestor.id); const d = deltas.get(ancestor.id); if (d) { matrix[4] += d[0]; matrix[5] += d[1]; break; } ancestor = ancestor.parent ? source.find(x => x.id === ancestor!.parent) : null; }
      if (Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]) < 1e-10) throw new Error('A parent has zero scale. Restore its scale before positioning this layer.');
      const f = layerFrame(l, this.app.frame), anchor = apply(worldMatrix(c, l, this.app.frame), valueAt(l.transform.anchor, f));
      const value = apply(invert(matrix), [anchor[0] + delta[0], anchor[1] + delta[1]]), next = result.find(x => x.id === l.id)!;
      const oldPosition = valueAt(l.transform.position, f); if (Math.hypot(value[0] - oldPosition[0], value[1] - oldPosition[1]) < 1e-8) continue;
      next.transform.position = isAnimated(l.transform.position) || autoKey ? setKey(l.transform.position, f, value, this.lastEase, this.keyAtStart && !isAnimated(l.transform.position) ? 0 : undefined) : { ...l.transform.position, value };
    } return result;
  }
  arrange(mode: Alignment | Distribution, target: 'canvas' | 'selection' = 'canvas'): boolean {
    try {
      const layers = this.layoutSelection(), items = layers.map(l => ({ id: l.id, box: this.layoutBox(l) }));
      const deltas = mode === 'horizontal' || mode === 'vertical' ? distribution(items, mode) : alignment(items, target === 'canvas' ? { x: 0, y: 0, w: this.comp.width, h: this.comp.height } : unionBoxes(items.map(i => i.box)), mode);
      const next = this.translatedLayers(this.comp.layers, deltas); return this.edit(mode === 'horizontal' || mode === 'vertical' ? 'Distribute layers' : 'Align layers', c => { c.layers = next; });
    } catch (e) { this.app.onNotice?.((e as Error).message); return false; }
  }
  centerAnchor(): boolean {
    try {
      const layers = this.layoutSelection();
      return this.edit('Center anchors on artwork', c => {
        for (const original of layers) {
          const l = c.layers.find(x => x.id === original.id)!, b = this.bounds(original);
          l.transform = this.anchorTransform(original, [b.x + b.w / 2, b.y + b.h / 2]); l.anchorFixed = true;
        }
      });
    } catch (e) { this.app.onNotice?.((e as Error).message); return false; }
  }

  /** Stage point → comp point (undo the camera) for a layer-space computation. */
  private fromStage(p: Vec2): Vec2 {
    return apply(invert(this.view()), p);
  }

  private parentMatrix(l: Layer): Mat {
    const c = this.comp;
    return l.parent ? worldMatrix(c, c.layers.find((x) => x.id === l.parent) ?? l, this.app.frame) : [1, 0, 0, 1, 0, 0];
  }

  private changedLive(): void {
    this.rev++;
    this.app.requestRender();
    this.app.onFrameChange();
    this.onChange();
  }

  /** Finish (or cancel) a drag: one undo step if anything moved. */
  gestureEnd(cancel = false): void {
    if (this.pathStroke) {
      const line = this.pathStroke; this.pathStroke = null; this.app.requestRender();
      if (cancel) return;
      // a tap (not a drag) picks a vector line already drawn on another layer as the route
      let travel = 0;
      for (let i = 1; i < line.length; i++) travel += Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
      const tapped = travel * this.pathZoom < 8 ? this.lineAt(line[0]!, 18 / this.pathZoom) : null;
      if (tapped && tapped.layer === this.primary?.id) { this.app.onNotice?.(SAME_LAYER_LINE); return; }
      const route = travel * this.pathZoom < 8 ? tapped?.points ?? null : line.length > 1 ? line : null;
      if (!route) { if (travel * this.pathZoom < 8) this.app.onNotice?.('No vector line there. Draw the path, or tap a line drawn with Vector.'); return; }
      this.setDrawingPath(false); this.onPathDrawn?.(route);
      return;
    }
    this.anchorEnd(cancel);
    this.pathEnd(cancel);
    this.assetClipEnd(cancel);
    this.snapGuides = [];
    const g = this.gesture;
    this.gesture = null;
    if (!g) return;
    const c = this.comp;
    if (cancel || !g.moved) {
      c.layers = g.before;
      this.changedLive();
      return;
    }
    const after = structuredClone(c.layers);
    const label = g.kind === 'move' ? 'Move layer' : g.kind === 'scale' ? 'Scale layer' : 'Rotate layer';
    this.push(label, c.id, g.before, after);
    this.changed();
  }

  /** The comp's length (so the Motion view can size its time area). */
  length(): number {
    return compLength(this.comp, this.app.project.comps);
  }

  /** Does a camera layer exist? (the Motion view offers "Through camera" only then) */
  hasCamera(): boolean {
    return this.comp.layers.some((l) => l.kind === 'camera');
  }

  /** A fresh transform for the page size (used when a drawings layer is added). */
  static defaultTransform = newTransform;

  /** Easing sides for a name (re-exported so the UI needs one import). */
  static sides = easingSides;
}
