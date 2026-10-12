import { easingOf, easingSides, isAnimated, moveKey, removeKey, reverseKeys, setAllEasings, setKey, setSegmentEasing, valueAt, type Easing, type Prop, type Vec2 } from './core/anim';
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
import { defaultPart, localMatrix, nestedFrame, partOf, type PartName } from './core/comp';
import { contentFrameAt, type PinProp, type PlayMode } from './core/comp';
import { totalFrames } from './core/timeline';
import { layerContentBox } from './view/contentbox';
import type { Command } from './core/history';
import type { App } from './app';

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
export type PropKey = PropName | `pin:${string}`;

export const isPin = (k: string): k is `pin:${string}` => k.startsWith('pin:');

export interface KeyRef {
  layer: string;
  prop: PropKey;
  f: number;
}

export const keyId = (k: KeyRef) => `${k.layer}|${k.prop}|${k.f}`;

type GestureKind = 'move' | 'scale' | 'rotate';

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

  private gesture: Gesture | null = null;

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
    if (isPin(n)) {
      if (l.kind === 'comp') l.overrides = { ...l.overrides, [n.slice(4)]: p };
      return;
    }
    setPropOn(l, n, p);
  }

  /** The rows a layer shows: its own properties, then a precomp's pinned ones. */
  rowsOf(l: Layer): PropKey[] {
    const rows: PropKey[] = [...propsOf(l)];
    if (l.kind === 'comp') {
      const nested = this.app.project.comps.get(l.comp);
      for (const p of nested?.pins ?? []) if (nested?.layers.some((x) => x.id === p.layer)) rows.push(`pin:${p.layer}:${p.prop}`);
    }
    return rows;
  }

  /** "★ Ball Position" for a pin row, "Position" otherwise. */
  rowLabel(l: Layer, n: PropKey): string {
    if (!isPin(n)) return PROP_LABEL[n];
    const [, id, prop] = n.split(':') as [string, string, PropName];
    const inner = l.kind === 'comp' ? this.app.project.comps.get(l.comp)?.layers.find((x) => x.id === id) : undefined;
    return `★ ${inner?.name ?? '?'} ${PROP_LABEL[prop] ?? prop}`;
  }

  /** The value kind of a row (for formatting and the value editor). */
  rowProp(n: PropKey): PropName {
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
    this.selected = [];
    this.keys.clear();
    this.open.clear();
    this.gesture = null;
    this.trail = [];
  }

  // -------------------------------------------------------------------------------------------
  // Precomps: group, ungroup, make unique, go inside and back out

  /** How we got into the open comp: each step is a precomp layer of the comp above. */
  private trail: { comp: string; layer: string }[] = [];

  /** One undo step that may change several comps (group, ungroup, make unique). */
  editProject(label: string, fn: () => void): void {
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
    this.app.history.push({ label, do: () => set(after), undo: () => set(before) }, true);
    this.tidy();
    this.changed();
  }

  /**
   * Put layers into a new comp, replaced by one layer showing it (After Effects' "move all
   * attributes"). The new comp has this comp's size and speed, so nothing moves or retimes.
   * Layers left outside that were parented to a grouped layer keep their place, unparented.
   */
  group(ids: string[] = this.selected, name?: string): string | null {
    const c = this.comp;
    const p = this.app.project;
    const picked = c.layers.filter((l) => ids.includes(l.id));
    if (!picked.length) return null;
    const nid = p.newId('c');
    let made: string | null = null;
    this.editProject('Group into comp', () => {
      const set = new Set(ids);
      for (const l of c.layers) if (!set.has(l.id) && l.parent && set.has(l.parent)) setParent(c, l, null, this.app.frame);
      const nested = newComp(nid, name?.trim() || `${picked[0]!.name} comp`, c.width, c.height, c.fps);
      nested.folder = c.folder;
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

  /** How many layers (in all comps) show this comp. */
  instances(compId: string): number {
    let n = 0;
    for (const c of this.app.project.comps.values()) for (const l of c.layers) if (l.kind === 'comp' && l.comp === compId) n++;
    return n;
  }

  /** Go inside a precomp layer: its comp becomes the one you edit, at the frame it was showing. */
  enter(id: string): boolean {
    const c = this.comp;
    const l = c.layers.find((x) => x.id === id);
    if (!l || l.kind !== 'comp') return false;
    const p = this.app.project;
    const nested = p.comps.get(l.comp);
    if (!nested) return false;
    const nf = nestedFrame(l, this.app.frame, c.fps, nested, p.comps) ?? 0;
    this.gestureEnd(true);
    this.trail.push({ comp: c.id, layer: l.id });
    this.switchTo(nested.id, nf);
    return true;
  }

  /** Back out to the comp above (or to `depth` steps from the top: 0 = the shot). */
  exit(depth = this.crumbs().length - 2): boolean {
    const crumbs = this.crumbs();
    if (crumbs.length < 2 || depth < 0 || depth >= crumbs.length - 1) return false;
    const p = this.app.project;
    // map the playhead out through every level we leave
    let frame = this.app.frame;
    for (let i = crumbs.length - 1; i > depth; i--) {
      const via = crumbs[i]!.via!;
      const parent = crumbs[i - 1]!.comp;
      const inner = crumbs[i]!.comp;
      frame = via.start + Math.floor((frame * parent.fps) / inner.fps + 1e-9);
    }
    this.trail = this.trail.slice(0, depth);
    this.gestureEnd(true);
    this.switchTo(crumbs[depth]!.comp.id, frame);
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
    const set = (layers: Layer[]) => {
      const c = this.app.project.comps.get(compId);
      if (!c) return;
      c.layers = structuredClone(layers);
      const was = this.app.project.activeComp;
      this.app.project.activeComp = compId;
      this.tidy();
      if (was !== compId) this.app.onCompChange();
      this.changed();
    };
    const cmd: Command = { label, do: () => set(after), undo: () => set(before) };
    this.app.history.push(cmd, true);
  }

  // -------------------------------------------------------------------------------------------
  // Layers

  select(id: string | null, add = false): void {
    if (id === null) this.selected = [];
    else if (add) this.selected = this.selected.includes(id) ? this.selected.filter((x) => x !== id) : [...this.selected, id];
    else this.selected = [id];
    const l = this.primary;
    if (l && l.kind === 'drawings') this.app.focusLayer(l.id);
    if (l) this.open.add(l.id);
    this.keys.clear();
    this.onChange();
    this.app.requestRender();
  }

  /** A new layer above the selected one (or on top). */
  addLayer(kind: 'drawings' | 'null' | 'camera'): void {
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
      const id = p.newId('L');
      if (kind === 'camera') made = cameraLayer(id, cc);
      else if (kind === 'null') made = nullLayer(id, 'Null', cc);
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
      this.select(m.id);
    }
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
  setPart(id: string, part: PartName, patch: { visible?: boolean; tint?: string | null }): void {
    const what = patch.visible !== undefined ? `${patch.visible ? 'Show' : 'Hide'} ${part}s` : patch.tint ? `Recolour ${part}s` : `Original ${part} colours`;
    this.edit(what, (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (l?.kind === 'drawings') l.parts = { ...l.parts, [part]: { ...partOf(l, part), ...patch } };
    });
  }

  /** Back to the defaults for one part (visible, full opacity, own colours, no offset). */
  resetPart(id: string, part: PartName): void {
    this.edit(`Reset ${part}s`, (c) => {
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
    this.edit(label, (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (!l) return;
      if (t.start !== undefined) {
        const d = Math.round(t.start) - l.start;
        l.start += d;
        l.in += d;
        if (l.out !== null) l.out += d;
      }
      if (t.in !== undefined) l.in = Math.round(t.in);
      if (t.out !== undefined) l.out = t.out === null ? null : Math.round(t.out);
      if (l.out !== null && l.out <= l.in) l.out = l.in + 1;
    });
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
      if (l) this.setProp(l, n, this.withValue(l, n, value));
    });
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

  /** Topmost active, unlocked layer whose page contains a stage point. */
  hitLayer(p: Vec2): Layer | null {
    for (const l of this.comp.layers) {
      if (!l.visible || l.locked) continue;
      if (l.kind === 'camera' && this.throughCamera) continue;
      const end = layerEnd(l, this.app.project.comps);
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
    if (l.kind !== 'drawings' && l.kind !== 'comp') return;
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
  gestureStart(pt: Vec2, zoom: number, add = false): boolean {
    const near = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) * zoom <= HANDLE_PX;
    const sel = this.primary;
    let kind: GestureKind = 'move';
    let target: Layer | null = null;
    if (sel && sel.visible && !sel.locked) {
      if (near(this.rotateHandle(sel, zoom), pt)) [kind, target] = ['rotate', sel];
      else if (sel.kind !== 'null' && this.corners(sel).some((c) => near(c, pt))) [kind, target] = ['scale', sel];
    }
    // looking through the selected camera: any drag moves the camera (the picture follows the finger)
    if (!target && sel && sel.kind === 'camera' && this.throughCamera && sel.visible && !sel.locked && !add) target = sel;
    if (!target) {
      target = this.hitLayer(pt);
      if (!target) {
        if (!add) this.select(null);
        return false;
      }
      if (!this.selected.includes(target.id) || add) this.select(target.id, add);
    }
    const before = structuredClone(this.comp.layers);
    if (kind !== 'move') this.pivotOnContent(target);
    const anchor = this.anchorStage(target);
    this.gesture = {
      kind,
      layer: target.id,
      before,
      startPt: pt,
      anchorComp: anchor,
      startDist: Math.max(1e-6, Math.hypot(pt[0] - anchor[0], pt[1] - anchor[1])),
      startAngle: Math.atan2(pt[1] - anchor[1], pt[0] - anchor[0]),
      moved: false,
    };
    return true;
  }

  get dragging(): boolean {
    return this.gesture !== null;
  }

  gestureMove(pt: Vec2): void {
    const g = this.gesture;
    if (!g) return;
    const c = this.comp;
    const original = g.before.find((l) => l.id === g.layer);
    const live = c.layers.find((l) => l.id === g.layer);
    if (!original || !live) return;
    g.moved = true;
    const f = this.frameOf(original);
    const set = (n: PropName, value: number | Vec2) => {
      const base = this.getProp(original, n);
      const p = isAnimated(base) || this.autoKey ? setKey(base, f, value as never, this.lastEase, this.keyAtStart && !isAnimated(base) ? 0 : undefined) : { ...base, value };
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
      // the anchor follows the pointer; position is in the parent's space
      const parentWorld = this.parentMatrix(original);
      const target = this.fromStage([g.anchorComp[0] + dx, g.anchorComp[1] + dy]);
      set('position', apply(invert(parentWorld), target));
    } else if (g.kind === 'scale') {
      const k = Math.hypot(pt[0] - g.anchorComp[0], pt[1] - g.anchorComp[1]) / g.startDist;
      const s = valueAt(original.transform.scale, f);
      set('scale', [s[0] * k, s[1] * k]);
    } else {
      const ang = Math.atan2(pt[1] - g.anchorComp[1], pt[0] - g.anchorComp[0]) - g.startAngle;
      set('rotation', valueAt(original.transform.rotation, f) + (ang * 180) / Math.PI);
    }
    this.changedLive();
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
