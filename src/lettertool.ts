/**
 * The Letter tool (Draw and Animate): captions without menus.
 * - Tap empty canvas: a new caption in the current style, ready to type.
 * - Draw a closed loop: it becomes the balloon (speech, box, thought, shout or kept as drawn).
 * - Draw a line out from a balloon's edge: its tail, following the line.
 * - Drag inside a balloon: move it (tails keep pointing where they point). Drag the tail tip: re-aim it.
 * - The selected caption shows handles: the tail tip, the tail's bend (double-tap to straighten)
 *   and the balloon's width (drag sideways for fewer, longer lines or more, shorter ones).
 * - Double-tap a balloon: edit its words and look.
 * Every finished gesture is one Undo step; drags preview live.
 */
import type { App } from './app';
import { apply, drawingsLayer, invert, localMatrix, type DrawingsLayer, type Layer } from './core/comp';
import { isAnimated, setKey, valueAt, type Prop, type Vec2 } from './core/anim';
import { newId } from './io/persist';
import { detectBalloon, inside, reshapeOutline, shapeForText, type Pt } from './lettering/geometry';
import { defaultCaption, LETTER_SIZE_FRACTION, type BalloonStyle, type CaptionSpec } from './lettering/spec';
import { captionBalloon, captionLayout } from './view/caption';

/** Distance from a point to a closed outline. */
function edgeDistance(outline: Pt[], p: Pt): number {
  let best = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!, b = outline[(i + 1) % outline.length]!, dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

type Drag =
  | { id: number; kind: 'stroke'; points: Pt[] }
  | { id: number; kind: 'move' | 'tip' | 'bend' | 'width' | 'shape'; layer: string; tail: number; start: Pt; before: CaptionSpec; moved: boolean }
  /** Turn or scale the whole caption (its layer's rotation and scale, around the balloon's centre). */
  | { id: number; kind: 'turn' | 'scale'; layer: string; startStage: Pt; centre: Pt; before: Layer['transform']; moved: boolean };

type CaptionEdit = Extract<Drag, { kind: 'move' | 'tip' | 'bend' | 'width' | 'shape' }>;
const isCaptionEdit = (d: Drag): d is CaptionEdit => d.kind === 'move' || d.kind === 'tip' || d.kind === 'bend' || d.kind === 'width' || d.kind === 'shape';

/** A caption's on-canvas handles, in its layer's page units. */
export interface CaptionHandles { outline: Pt[]; tips: Pt[]; bends: Pt[]; width: Pt | null; turn: Pt; scale: Pt }

export class LetterTool {
  private drag: Drag | null = null;
  private lastTap = { layer: '', time: 0, kind: '' };
  /** Set by the UI: open the caption editor for a layer (new = just created). */
  onEdit: ((layerId: string, isNew: boolean) => void) | null = null;
  /** A caption whose balloon the next closed loop redraws (Draw shape in the Caption panel). */
  shapeTarget: string | null = null;
  /** A caption whose custom shape shows reshape handles (Edit shape in the Caption panel). */
  shapeEditing: string | null = null;
  /** How many reshape handles a custom balloon shows. */
  static readonly SHAPE_HANDLES = 16;
  /** The style a tap makes. */
  style: BalloonStyle = 'speech';

  constructor(private readonly app: App) {}

  get pointer(): number | null { return this.drag?.id ?? null; }
  get stroke(): Pt[] | null { return this.drag?.kind === 'stroke' ? this.drag.points : null; }

  /** Caption layers visible at this frame, front first, with a stage point mapped into each one's page. */
  private captionsAt(stage: Pt): { layer: DrawingsLayer; local: Pt; outline: Pt[]; tips: Pt[] }[] {
    const app = this.app, comp = app.project.comp, out = [];
    for (const l of comp.layers) {
      if (l.kind !== 'drawings' || !l.caption || !l.visible || l.locked || app.frame < l.in) continue;
      const m = invert(app.editor.matrixOf(l));
      if (!m) continue;
      const [lx, ly] = apply(m, [stage.x, stage.y]), lf = app.frame - l.start;
      const { shapes } = captionBalloon(l.caption, lf, app.project.width, app.project.height);
      out.push({ layer: l, local: { x: lx, y: ly }, outline: shapes.outline, tips: l.caption.tails.map(t => ({ x: t.x, y: t.y })) });
    }
    return out;
  }

  /** Change one caption layer (live preview, no History). */
  private preview(id: string, c: CaptionSpec): void {
    const l = this.app.project.comp.layers.find(x => x.id === id);
    if (l?.kind === 'drawings') { l.caption = c; this.app.requestRender(); }
  }

  /** Handles of a caption layer at the current frame: tail tips, bends and the balloon-width grip. */
  handles(l: DrawingsLayer): CaptionHandles | null {
    const c = l.caption, app = this.app;
    if (!c) return null;
    const { lay, outline, shapes } = captionBalloon(c, app.frame - l.start, app.project.width, app.project.height);
    const tips: Pt[] = [], bends: Pt[] = [];
    for (const t of c.tails) {
      tips.push({ x: t.x, y: t.y });
      if (t.bend) { bends.push({ x: t.bend[0], y: t.bend[1] }); continue; }
      // a straight tail: the grip sits halfway from the balloon's edge to the tip
      const ang = Math.atan2(t.y - c.y, t.x - c.x);
      // (the plain balloon, without tails merged in, so the base is on the balloon's edge)
      let base = { x: c.x + outline[0]!.x, y: c.y + outline[0]!.y }, best = Infinity;
      for (const o of outline) { const p = { x: c.x + o.x, y: c.y + o.y }; const d = Math.abs(Math.atan2(Math.sin(Math.atan2(p.y - c.y, p.x - c.x) - ang), Math.cos(Math.atan2(p.y - c.y, p.x - c.x) - ang))); if (d < best) { best = d; base = p; } }
      bends.push({ x: (base.x + t.x) / 2, y: (base.y + t.y) / 2 });
    }
    const sizable = c.style !== 'sfx' && (c.style !== 'custom' || !!c.look?.outline) && !c.text.includes('\n');
    // turn: a round handle above the balloon; scale: a square at its lower-right corner (screen sizes)
    const sc = this.layerScale(l), z = app.view.zoom;
    return { outline: shapes.outline, tips, bends, width: sizable ? { x: c.x + lay.fit.a, y: c.y } : null,
      turn: { x: c.x, y: c.y - lay.fit.b - 34 / (z * sc) }, scale: { x: c.x + lay.fit.a * 0.92 + 10 / (z * sc), y: c.y + lay.fit.b * 0.92 + 10 / (z * sc) } };
  }

  /** How much a layer is scaled on screen (its own scale and its parents'), for handle sizes. */
  private layerScale(l: DrawingsLayer): number {
    const m = this.app.editor.matrixOf(l);
    return Math.max(0.05, Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) / this.app.view.zoom);
  }

  /** A custom balloon's reshape handles (page units of its layer), with the outline index each moves. */
  shapeHandles(l: DrawingsLayer): { p: Pt; index: number }[] {
    const c = l.caption, outline = c?.look?.outline;
    if (!c || !outline || this.shapeEditing !== l.id) return [];
    const { fit } = captionLayout(c, this.app.frame - l.start, this.app.project.width, this.app.project.height), n = LetterTool.SHAPE_HANDLES;
    return Array.from({ length: n }, (_, i) => { const index = Math.round((i / n) * outline.length) % outline.length, [x, y] = outline[index]!; return { p: { x: c.x + x * fit.a, y: c.y + y * fit.b }, index }; });
  }

  /** Draw shape: the next closed loop becomes this caption's balloon shape. */
  armShape(layerId: string | null): void {
    this.shapeTarget = layerId;
    if (layerId) { this.app.setLettering(true); this.app.onNotice?.('Draw the balloon’s new shape as one closed loop. It will stretch to fit the words.'); }
    this.app.requestRender();
  }

  down(id: number, stage: Pt): void {
    const app = this.app, zoom = app.view.zoom, near = 22 / zoom;
    // drawing a new shape for a caption: every stroke is that drawing
    if (this.shapeTarget) { this.drag = { id, kind: 'stroke', points: [stage] }; return; }
    // the selected caption's handles come first
    const active = app.project.comp.layers.find(x => x.id === app.project.activeLayer);
    if (active?.kind === 'drawings' && active.caption && this.shapeEditing === active.id && active.visible && !active.locked) {
      const m = invert(app.editor.matrixOf(active));
      if (m) {
        const [lx, ly] = apply(m, [stage.x, stage.y]), hit = this.shapeHandles(active).map(h => ({ ...h, d: Math.hypot(h.p.x - lx, h.p.y - ly) })).filter(h => h.d < near).sort((u, v) => u.d - v.d)[0];
        if (hit) { this.drag = { id, kind: 'shape', layer: active.id, tail: hit.index, start: { x: lx, y: ly }, before: structuredClone(active.caption), moved: false }; return; }
      }
    }
    if (active?.kind === 'drawings' && active.caption && active.visible && !active.locked) {
      const m = invert(app.editor.matrixOf(active)), h = this.handles(active);
      if (m && h) {
        const [lx, ly] = apply(m, [stage.x, stage.y]), local = { x: lx, y: ly }, close = (p: Pt) => Math.hypot(p.x - lx, p.y - ly) < near;
        const start = (kind: 'tip' | 'bend' | 'width', tail: number) => { this.drag = { id, kind, layer: active.id, tail, start: local, before: structuredClone(active.caption!), moved: false }; };
        // turning and scaling the whole caption
        const stageNear = (p: Pt) => { const q = apply(app.editor.matrixOf(active), [p.x, p.y]); return Math.hypot(q[0] - stage.x, q[1] - stage.y) < near; };
        const transformFrom = (kind: 'turn' | 'scale') => {
          const c = active.caption!, q = apply(app.editor.matrixOf(active), [c.x, c.y]);
          this.drag = { id, kind, layer: active.id, startStage: stage, centre: { x: q[0], y: q[1] }, before: structuredClone(active.transform), moved: false };
        };
        if (stageNear(h.turn)) { transformFrom('turn'); return; }
        if (stageNear(h.scale)) { transformFrom('scale'); return; }
        // the nearest handle wins (a short tail's bend sits close to its tip)
        const all = [...h.tips.map((p, i) => ({ p, kind: 'tip' as const, i })), ...h.bends.map((p, i) => ({ p, kind: 'bend' as const, i })), ...(h.width ? [{ p: h.width, kind: 'width' as const, i: -1 }] : [])];
        const pick = all.filter(x => close(x.p)).sort((u, v) => Math.hypot(u.p.x - lx, u.p.y - ly) - Math.hypot(v.p.x - lx, v.p.y - ly))[0];
        if (pick?.kind === 'tip') { start('tip', pick.i); return; }
        if (pick?.kind === 'width') { start('width', -1); return; }
        const bend = pick?.kind === 'bend' ? pick.i : -1;
        if (bend >= 0) {
          const now = performance.now();
          if (this.lastTap.kind === `bend${bend}` && this.lastTap.layer === active.id && now - this.lastTap.time < 350) {
            this.lastTap = { layer: '', time: 0, kind: '' };
            if (active.caption.tails[bend]?.bend) app.editor.edit('Straighten caption tail', cc => { const x = cc.layers.find(y => y.id === active.id); if (x?.kind === 'drawings' && x.caption) x.caption = { ...x.caption, tails: x.caption.tails.map((t, i) => { if (i !== bend) return t; const { bend: _drop, ...rest } = t; return rest; }) }; });
            return;
          }
          start('bend', bend); return;
        }
      }
    }
    for (const c of this.captionsAt(stage)) {
      const tail = c.tips.findIndex(t => Math.hypot(t.x - c.local.x, t.y - c.local.y) < near);
      if (tail >= 0) { this.drag = { id, kind: 'tip', layer: c.layer.id, tail, start: c.local, before: structuredClone(c.layer.caption!), moved: false }; return; }
    }
    const rim = 16 / zoom, found = this.captionsAt(stage);
    // pressing on a balloon's edge draws its tail; deeper inside moves it
    if (found.some(c => edgeDistance(c.outline, c.local) < rim)) { this.drag = { id, kind: 'stroke', points: [stage] }; return; }
    const hit = found.find(c => inside(c.outline, c.local));
    if (hit) {
      const now = performance.now();
      if (this.lastTap.kind === 'move' && this.lastTap.layer === hit.layer.id && now - this.lastTap.time < 350) { this.lastTap = { layer: '', time: 0, kind: '' }; this.onEdit?.(hit.layer.id, false); return; }
      this.lastTap = { layer: hit.layer.id, time: now, kind: 'move' };
      if (app.project.activeLayer !== hit.layer.id) app.focusLayer(hit.layer.id);
      this.drag = { id, kind: 'move', layer: hit.layer.id, tail: -1, start: hit.local, before: structuredClone(hit.layer.caption!), moved: false };
      return;
    }
    this.drag = { id, kind: 'stroke', points: [stage] };
  }

  move(id: number, stage: Pt): void {
    const d = this.drag;
    if (!d || d.id !== id) return;
    if (d.kind === 'stroke') {
      const last = d.points[d.points.length - 1]!;
      if (Math.hypot(stage.x - last.x, stage.y - last.y) >= 1.5 / this.app.view.zoom) { d.points.push(stage); this.app.requestRender(); }
      return;
    }
    if (d.kind === 'turn' || d.kind === 'scale') {
      const t = this.app.project.comp.layers.find(x => x.id === d.layer);
      if (t?.kind === 'drawings' && t.caption) this.transformMove(d, t, stage);
      return;
    }
    if (!isCaptionEdit(d)) return;
    const layerId = d.layer, l = this.app.project.comp.layers.find(x => x.id === layerId);
    if (l?.kind !== 'drawings' || !l.caption) return;
    const m = invert(this.app.editor.matrixOf(l));
    if (!m) return;
    const [x, y] = apply(m, [stage.x, stage.y]), dx = x - d.start.x, dy = y - d.start.y;
    if (Math.hypot(dx, dy) * this.app.view.zoom > 3) d.moved = true;
    if (!d.moved) return;
    const c = structuredClone(d.before);
    if (d.kind === 'tip') { const t = c.tails[d.tail]!; t.x += dx; t.y += dy; if (t.bend) t.bend = [t.bend[0] + dx / 2, t.bend[1] + dy / 2]; }
    else if (d.kind === 'bend') c.tails[d.tail]!.bend = [x, y];
    else if (d.kind === 'shape' && d.before.look?.outline) {
      // reshape: the handle's outline point follows the finger; its neighbours follow smoothly
      const { fit } = captionLayout(d.before, this.app.frame - l.start, this.app.project.width, this.app.project.height);
      c.look = { ...c.look, outline: reshapeOutline(d.before.look.outline, d.tail, dx / fit.a, dy / fit.b) };
    }
    else if (d.kind === 'width') {
      // drag the grip sideways: the balloon's half-width follows the finger (within the shape limits)
      const from = Math.max(1, Math.abs(d.start.x - d.before.x)), to = Math.max(1, Math.abs(x - d.before.x));
      const shape = Math.min(2.5, Math.max(0.5, (d.before.shape ?? 1) * to / from));
      if (Math.abs(shape - 1) < 0.03) delete c.shape; else c.shape = Math.round(shape * 100) / 100;
    }
    else { c.x += dx; c.y += dy; }
    this.preview(d.layer, c);
  }

  up(id: number, cancelled: boolean): void {
    const d = this.drag;
    if (!d || d.id !== id) return;
    this.drag = null;
    const app = this.app;
    if (d.kind === 'turn' || d.kind === 'scale') {
      const l = app.project.comp.layers.find(x => x.id === d.layer);
      if (!l) return;
      const after = l.transform;
      l.transform = d.before;
      if (cancelled || !d.moved) { app.requestRender(); return; }
      app.editor.edit(d.kind === 'turn' ? 'Turn caption' : 'Scale caption', c => { const x = c.layers.find(y => y.id === d.layer); if (x) { x.transform = after; x.anchorFixed = true; } });
      return;
    }
    if (isCaptionEdit(d)) {
      const l = app.project.comp.layers.find(x => x.id === d.layer);
      if (l?.kind !== 'drawings') return;
      const after = l.caption!;
      l.caption = d.before;
      // a bend grip pressed without moving is a tap (two make a double-tap that straightens)
      if (!cancelled && !d.moved && d.kind === 'bend') this.lastTap = { layer: d.layer, time: performance.now(), kind: `bend${d.tail}` };
      if (cancelled || !d.moved) { app.requestRender(); return; }
      app.editor.edit(d.kind === 'tip' ? 'Aim caption tail' : d.kind === 'bend' ? 'Bend caption tail' : d.kind === 'width' ? 'Change balloon width' : d.kind === 'shape' ? 'Reshape balloon' : 'Move caption', c => { const x = c.layers.find(y => y.id === d.layer); if (x?.kind === 'drawings') x.caption = after; });
      return;
    }
    app.requestRender();
    if (cancelled || d.kind !== 'stroke') return;
    const pts = d.points, zoom = app.view.zoom;
    let travel = 0;
    for (let i = 1; i < pts.length; i++) travel += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    const target = this.shapeTarget;
    if (target) {
      // Draw shape: a closed loop becomes the target caption's balloon (anything else is ignored)
      if (travel * zoom < 8 || detectBalloon(pts) === 'open') { app.onNotice?.('Draw one closed loop for the balloon’s shape (end near where you started). Esc stops.'); return; }
      this.shapeTarget = null;
      const outline = shapeForText(pts);
      app.editor.edit('Draw balloon shape', cc => { const x = cc.layers.find(y => y.id === target); if (x?.kind === 'drawings' && x.caption) x.caption = { ...x.caption, ...(x.caption.style === 'box' || x.caption.style === 'sfx' ? { style: 'custom' as const } : {}), look: { ...x.caption.look, outline, wobble: x.caption.look?.wobble ?? 0 } }; });
      app.onNotice?.('New balloon shape. Turn on Edit shape in the Caption panel to adjust it.');
      return;
    }
    if (travel * zoom < 8) { this.create(pts[0]!, this.style); return; }
    const kind = detectBalloon(pts);
    if (kind === 'open') {
      // a line that starts on (or in) a balloon is its tail
      const owner = this.captionsAt(pts[0]!).find(c => inside(c.outline, c.local) || edgeDistance(c.outline, c.local) < 16 / zoom);
      if (!owner) { app.onNotice?.("Draw a closed shape for a balloon, or start on a balloon's edge to draw its tail."); return; }
      const m = invert(app.editor.matrixOf(owner.layer))!, local = pts.map(p => { const [x, y] = apply(m, [p.x, p.y]); return { x, y }; });
      const tip = local[local.length - 1]!, mid = local[Math.floor(local.length / 2)]!;
      const straight = Math.abs((tip.x - local[0]!.x) * (mid.y - local[0]!.y) - (tip.y - local[0]!.y) * (mid.x - local[0]!.x)) / (Math.hypot(tip.x - local[0]!.x, tip.y - local[0]!.y) || 1) < 6;
      const zig = local.length > 8 && this.zigzag(local);
      const c = owner.layer.caption!, old = c.tails[0];
      const tail = { x: tip.x, y: tip.y, ...(straight || zig ? {} : { bend: [mid.x, mid.y] as [number, number] }), join: zig ? 'lightning' as const : old?.join && old.join !== 'none' && old.join !== 'lightning' ? old.join : c.style === 'thought' ? 'bubbles' as const : 'merged' as const, width: old?.width ?? 1.2 };
      app.editor.edit('Draw caption tail', cc => { const x = cc.layers.find(y => y.id === owner.layer.id); if (x?.kind === 'drawings' && x.caption) x.caption = { ...x.caption, tails: [tail, ...x.caption.tails.slice(1)] }; });
      return;
    }
    // a closed loop: the balloon, recognised (or kept as drawn), at the loop's centre
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const style: BalloonStyle = kind === 'custom' ? 'custom' : kind;
    const made = this.create({ x: cx, y: cy }, style, false);
    if (made && style === 'custom') {
      // the drawn shape, normalised: it stretches to fit the words like the built-in balloons
      const outline = shapeForText(pts);
      app.editor.edit('Keep balloon as drawn', cc => { const x = cc.layers.find(y => y.id === made); if (x?.kind === 'drawings' && x.caption) x.caption = { ...x.caption, look: { outline, wobble: 0 } }; });
      app.history.combine(2, 'Draw caption balloon');
    }
    if (made) app.onNotice?.(`Recognised a ${style === 'custom' ? 'custom' : style === 'box' ? 'caption box' : style === 'thought' ? 'thought' : style === 'shout' ? 'shout' : 'speech'} balloon. Type its words; Undo removes it.`);
  }

  /**
   * The caption's layer turned or scaled around the balloon's centre (on screen it stays put):
   * the anchor moves to the centre first, with position compensated, then rotation or scale change.
   * Animated properties get a key at the playhead instead.
   */
  private transformMove(d: Extract<Drag, { kind: 'turn' | 'scale' }>, l: DrawingsLayer, stage: Pt): void {
    const app = this.app, dx = stage.x - d.startStage.x, dy = stage.y - d.startStage.y;
    if (Math.hypot(dx, dy) * app.view.zoom > 3) d.moved = true;
    if (!d.moved) return;
    const t = structuredClone(d.before), f = app.frame - l.start, c = l.caption!;
    const write = <T extends number | Vec2>(p: Prop<T>, v: T): Prop<T> => (isAnimated(p) ? setKey(p, f, v) : { ...p, value: v });
    // pivot on the balloon: anchor to its centre, position compensated so nothing jumps
    const anchor = valueAt(t.anchor, f), pos = valueAt(t.position, f), lm = localMatrix({ ...l, transform: d.before }, app.frame);
    const ax = c.x - anchor[0], ay = c.y - anchor[1];
    t.anchor = write(t.anchor, [c.x, c.y] as Vec2);
    t.position = write(t.position, [pos[0] + lm[0] * ax + lm[2] * ay, pos[1] + lm[1] * ax + lm[3] * ay] as Vec2);
    if (d.kind === 'turn') {
      const a0 = Math.atan2(d.startStage.y - d.centre.y, d.startStage.x - d.centre.x), a1 = Math.atan2(stage.y - d.centre.y, stage.x - d.centre.x);
      let deg = valueAt(d.before.rotation, f) + ((a1 - a0) * 180) / Math.PI;
      // snap to 15° steps when close (straight up, level, diagonals)
      const snap = Math.round(deg / 15) * 15;
      if (Math.abs(deg - snap) < 3) deg = snap;
      t.rotation = write(t.rotation, Math.round(deg * 10) / 10);
    } else {
      const r0 = Math.max(1, Math.hypot(d.startStage.x - d.centre.x, d.startStage.y - d.centre.y)), r1 = Math.hypot(stage.x - d.centre.x, stage.y - d.centre.y);
      const s0 = valueAt(d.before.scale, f), k = Math.min(10, Math.max(0.1, r1 / r0));
      t.scale = write(t.scale, [Math.round(s0[0] * k * 10) / 10, Math.round(s0[1] * k * 10) / 10] as Vec2);
    }
    l.transform = t;
    app.requestRender();
  }

  private zigzag(pts: Pt[]): boolean {
    let flips = 0, prev = 0;
    for (let i = 2; i < pts.length; i += 2) {
      const a = pts[i - 2]!, b = pts[i - 1]!, c = pts[i]!, s = Math.sign((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
      if (s && prev && s !== prev) flips++;
      if (s) prev = s;
    }
    return flips >= 4;
  }

  /** A new caption layer at a stage point (as a still from the playhead on). Returns its id. */
  create(stage: Pt, style: BalloonStyle, tails = true, edit = true): string | null {
    const app = this.app, project = app.project, comp = project.comp;
    if (app.playing) return null;
    const c = defaultCaption(stage.x, stage.y, style);
    // the starting tail is sized to the page, like the letters
    // (in lettering sizes, long enough to clear a balloon of three or four lines)
    const size = LETTER_SIZE_FRACTION[c.size] * project.height;
    c.tails = tails ? c.tails.map(t => ({ ...t, x: stage.x - size * 3, y: stage.y + size * 7.5 })) : [];
    const drawing = project.newDrawing();
    const made = drawingsLayer(newId('caption'), 'Caption', [{ drawing: drawing.id, length: 1 }], project.width, project.height, comp.width, comp.height);
    made.start = made.in = app.frame; made.still = true; made.play = 'loop'; made.caption = c;
    const ok = app.editor.edit('Add caption', cc => { const at = cc.layers.findIndex(l => l.id === app.editor.primary?.id); cc.layers.splice(Math.max(0, at), 0, made); });
    if (!ok) { project.drawings.delete(drawing.id); return null; }
    app.editor.select(made.id);
    // its settings show in Motion straight away, ready to key
    app.editor.open.add(made.id);
    app.focusLayer(made.id);
    if (edit) this.onEdit?.(made.id, true);
    return made.id;
  }

  /** The live stroke and the active caption's tail handles. */
  drawOverlay(g: CanvasRenderingContext2D): void {
    const app = this.app, z = app.view.zoom;
    g.save();
    g.lineWidth = 2 / z; g.strokeStyle = '#4aa3ff'; g.setLineDash([6 / z, 5 / z]);
    const s = this.stroke;
    if (s && s.length > 1) { g.beginPath(); s.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); }
    g.setLineDash([]);
    const l = app.project.comp.layers.find(x => x.id === app.project.activeLayer);
    const h = l?.kind === 'drawings' && l.caption ? this.handles(l) : null;
    if (l && h) {
      const m = app.editor.matrixOf(l), at = (p: Pt) => { const [x, y] = apply(m, [p.x, p.y]); return { x, y }; };
      // the selected balloon's outline
      g.setLineDash([5 / z, 4 / z]); g.lineWidth = 1.5 / z;
      g.beginPath(); h.outline.forEach((p, i) => { const q = at(p); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }); g.closePath(); g.stroke();
      g.setLineDash([]); g.lineWidth = 2 / z; g.fillStyle = '#fff';
      // tail bends: small diamonds (double-tap to straighten)
      for (const b of h.bends) { const q = at(b), r = 7 / z; g.beginPath(); g.moveTo(q.x, q.y - r); g.lineTo(q.x + r, q.y); g.lineTo(q.x, q.y + r); g.lineTo(q.x - r, q.y); g.closePath(); g.fill(); g.stroke(); }
      // tail tips: round dots
      for (const t of h.tips) { const q = at(t); g.beginPath(); g.arc(q.x, q.y, 8 / z, 0, Math.PI * 2); g.fill(); g.stroke(); }
      // balloon width: a tall grip on the right edge
      if (h.width) { const q = at(h.width), w = 8 / z, hh = 22 / z; g.beginPath(); g.roundRect(q.x - w / 2, q.y - hh / 2, w, hh, w / 2); g.fillStyle = '#4aa3ff'; g.fill(); g.strokeStyle = '#fff'; g.stroke(); }
      // turn (a dot on a stick above) and scale (a corner square)
      { const top = at(h.turn), c = l.kind === 'drawings' && l.caption ? at({ x: l.caption.x, y: l.caption.y - (h.turn.y < l.caption.y ? 0 : 0) }) : top, edge = h.outline.reduce((m, p) => (p.y < m.y ? p : m), h.outline[0]!), e = at(edge);
        g.setLineDash([]); g.strokeStyle = '#4aa3ff'; g.lineWidth = 1.5 / z; g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(top.x, top.y); g.stroke();
        g.beginPath(); g.arc(top.x, top.y, 7 / z, 0, Math.PI * 2); g.fillStyle = '#4aa3ff'; g.fill(); g.strokeStyle = '#fff'; g.stroke();
        const sq = at(h.scale), r = 6 / z; g.fillStyle = '#fff'; g.strokeStyle = '#4aa3ff'; g.fillRect(sq.x - r, sq.y - r, r * 2, r * 2); g.strokeRect(sq.x - r, sq.y - r, r * 2, r * 2); void c; }
      // reshape handles (Edit shape): small squares on the outline
      if (l.kind === 'drawings') for (const sh of this.shapeHandles(l)) { const q = at(sh.p), r = 6 / z; g.fillStyle = '#ffcc33'; g.strokeStyle = '#222'; g.fillRect(q.x - r, q.y - r, r * 2, r * 2); g.strokeRect(q.x - r, q.y - r, r * 2, r * 2); }
    }
    g.restore();
  }
}
