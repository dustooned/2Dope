import {
  easingOf,
  easingSides,
  isAnimated,
  moveKey,
  removeKey,
  reverseKeys,
  setAllEasings,
  setKey,
  setSegmentEasing,
  valueAt,
  type Easing,
  type Prop,
  type Vec2,
} from './core/anim';
import {
  apply,
  cameraLayer,
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
import type { Command } from './core/history';
import type { App } from './app';

/** The properties the Motion view animates, by name. */
export type PropName = 'position' | 'scale' | 'rotation' | 'opacity' | 'anchor' | 'zoom';

export const PROP_LABEL: Record<PropName, string> = {
  position: 'Position',
  scale: 'Scale',
  rotation: 'Rotation',
  opacity: 'Opacity',
  anchor: 'Anchor',
  zoom: 'Zoom',
};

/** Which properties a layer shows, in order. */
export function propsOf(l: Layer): PropName[] {
  if (l.kind === 'camera') return ['position', 'rotation', 'zoom'];
  if (l.kind === 'null') return ['position', 'scale', 'rotation'];
  return ['position', 'scale', 'rotation', 'opacity'];
}

export function getProp(l: Layer, n: PropName): Prop {
  if (n === 'zoom') return l.kind === 'camera' ? l.zoom : (l.transform.opacity as Prop);
  return l.transform[n] as Prop;
}

function setPropOn(l: Layer, n: PropName, p: Prop): void {
  if (n === 'zoom' && l.kind === 'camera') l.zoom = p as Prop<number>;
  else (l.transform as unknown as Record<string, Prop>)[n] = p;
}

export interface KeyRef {
  layer: string;
  prop: PropName;
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

  /** The playhead in a layer's own time. */
  frameOf(l: Layer): number {
    return layerFrame(l, this.app.frame);
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
    for (const id of [...this.open]) if (!ids.has(id)) this.open.delete(id);
  }

  reset(): void {
    this.selected = [];
    this.keys.clear();
    this.open.clear();
    this.gesture = null;
  }

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
      this.app.project.activeComp = compId;
      this.tidy();
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
    const at = this.primary ? Math.max(0, c.layers.findIndex((l) => l.id === this.primary!.id)) : 0;
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
  valueNow(l: Layer, n: PropName): number | Vec2 {
    return valueAt(getProp(l, n), this.frameOf(l));
  }

  /** The prop after setting `value` at the playhead: a key if animated (or auto-key), else the still value. */
  private withValue(l: Layer, n: PropName, value: number | Vec2): Prop {
    const p = getProp(l, n);
    const f = this.frameOf(l);
    if (isAnimated(p) || this.autoKey) return setKey(p, f, value as never, this.lastEase, this.keyAtStart && !isAnimated(p) ? 0 : undefined) as Prop;
    return { ...p, value } as Prop;
  }

  setValue(id: string, n: PropName, value: number | Vec2, label = 'Change value'): void {
    this.edit(label, (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (l) setPropOn(l, n, this.withValue(l, n, value));
    });
  }

  /** The diamond: add a key at the playhead holding the current value, or remove the one there. */
  toggleKey(id: string, n: PropName): void {
    this.edit('Toggle keyframe', (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (!l) return;
      const p = getProp(l, n);
      const f = this.frameOf(l);
      if (p.keys.some((k) => k.f === f)) setPropOn(l, n, removeKey(p, f));
      else setPropOn(l, n, setKey(p, f, valueAt(p, f) as never, this.lastEase, this.keyAtStart && !isAnimated(p) ? 0 : undefined) as Prop);
    });
    this.keys.clear();
  }

  /** Drop all animation on a property, keeping what it shows now. */
  clearAnimation(id: string, n: PropName): void {
    this.edit('Clear animation', (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (!l) return;
      const p = getProp(l, n);
      setPropOn(l, n, { value: valueAt(p, this.frameOf(l)), keys: [] } as Prop);
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
      return { layer: layer!, prop: prop as PropName, f: Number(f) };
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
        setPropOn(l, r.prop, moveKey(getProp(l, r.prop), r.f, r.f + df));
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
        if (l) setPropOn(l, r.prop, removeKey(getProp(l, r.prop), r.f));
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
          if (l) setPropOn(l, r.prop, setSegmentEasing(getProp(l, r.prop), r.f, e));
        }
      });
    }
    this.onChange();
  }

  /** Dreams' "Set all easings" for a property's whole key row. */
  setAllEasing(id: string, n: PropName, e: Easing): void {
    this.lastEase = e;
    this.edit('Set all easings', (c) => {
      const l = c.layers.find((x) => x.id === id);
      if (l) setPropOn(l, n, setAllEasings(getProp(l, n), e));
    });
  }

  /** The easing shared by the selected keys' segments, or null when mixed / none. */
  easingOfSelection(): Easing | null {
    let common: Easing | null | undefined;
    for (const r of this.selectedKeys()) {
      const l = this.layer(r.layer);
      if (!l) continue;
      const p = getProp(l, r.prop);
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
        const p = getProp(l, list[0]!.prop);
        setPropOn(l, list[0]!.prop, reverseKeys(p, a, b));
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

  /** The layer's page rectangle in its own space. */
  bounds(l: Layer): { x: number; y: number; w: number; h: number } {
    const p = this.app.project;
    if (l.kind === 'drawings') return { x: 0, y: 0, w: p.width, h: p.height };
    if (l.kind === 'comp') {
      const n = p.comps.get(l.comp);
      return { x: 0, y: 0, w: n?.width ?? 100, h: n?.height ?? 100 };
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
    const anchor = this.anchorStage(target);
    this.gesture = {
      kind,
      layer: target.id,
      before: structuredClone(this.comp.layers),
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
      const base = getProp(original, n);
      const p = isAnimated(base) || this.autoKey ? setKey(base, f, value as never, this.lastEase, this.keyAtStart && !isAnimated(base) ? 0 : undefined) : { ...base, value };
      setPropOn(live, n, p as Prop);
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
