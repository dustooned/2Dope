/**
 * The Letter tool (Draw and Animate): captions without menus.
 * - Tap empty canvas: a new caption in the current style, ready to type.
 * - Draw a closed loop: it becomes the balloon (speech, box, thought, shout or kept as drawn).
 * - Draw a line out from a balloon's edge: its tail, following the line.
 * - Drag inside a balloon: move it (tails keep pointing where they point). Drag the tail tip: re-aim it.
 * - Double-tap a balloon: edit its words and look.
 * Every finished gesture is one Undo step; drags preview live.
 */
import type { App } from './app';
import { apply, drawingsLayer, invert, type DrawingsLayer } from './core/comp';
import { newId } from './io/persist';
import { detectBalloon, inside, type Pt } from './lettering/geometry';
import { defaultCaption, type BalloonStyle, type CaptionSpec } from './lettering/spec';
import { captionBalloon } from './view/caption';

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
  | { id: number; kind: 'move' | 'tip'; layer: string; tail: number; start: Pt; before: CaptionSpec; moved: boolean };

export class LetterTool {
  private drag: Drag | null = null;
  private lastTap = { layer: '', time: 0 };
  /** Set by the UI: open the caption editor for a layer (new = just created). */
  onEdit: ((layerId: string, isNew: boolean) => void) | null = null;
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

  down(id: number, stage: Pt): void {
    const app = this.app, zoom = app.view.zoom, near = 22 / zoom;
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
      if (this.lastTap.layer === hit.layer.id && now - this.lastTap.time < 350) { this.lastTap = { layer: '', time: 0 }; this.onEdit?.(hit.layer.id, false); return; }
      this.lastTap = { layer: hit.layer.id, time: now };
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
    const l = this.app.project.comp.layers.find(x => x.id === d.layer);
    if (l?.kind !== 'drawings' || !l.caption) return;
    const m = invert(this.app.editor.matrixOf(l));
    if (!m) return;
    const [x, y] = apply(m, [stage.x, stage.y]), dx = x - d.start.x, dy = y - d.start.y;
    if (Math.hypot(dx, dy) * this.app.view.zoom > 3) d.moved = true;
    if (!d.moved) return;
    const c = structuredClone(d.before);
    if (d.kind === 'tip') { const t = c.tails[d.tail]!; t.x += dx; t.y += dy; if (t.bend) t.bend = [t.bend[0] + dx / 2, t.bend[1] + dy / 2]; }
    else { c.x += dx; c.y += dy; if (c.path) c.path = c.path.map(([px, py]) => [px, py]); }
    this.preview(d.layer, c);
  }

  up(id: number, cancelled: boolean): void {
    const d = this.drag;
    if (!d || d.id !== id) return;
    this.drag = null;
    const app = this.app;
    if (d.kind !== 'stroke') {
      const l = app.project.comp.layers.find(x => x.id === d.layer);
      if (l?.kind !== 'drawings') return;
      const after = l.caption!;
      l.caption = d.before;
      if (cancelled || !d.moved) { app.requestRender(); return; }
      app.editor.edit(d.kind === 'tip' ? 'Aim caption tail' : 'Move caption', c => { const x = c.layers.find(y => y.id === d.layer); if (x?.kind === 'drawings') x.caption = after; });
      return;
    }
    app.requestRender();
    if (cancelled) return;
    const pts = d.points, zoom = app.view.zoom;
    let travel = 0;
    for (let i = 1; i < pts.length; i++) travel += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
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
      const path = pts.map(p => [p.x - cx, p.y - cy] as [number, number]);
      app.editor.edit('Keep balloon as drawn', cc => { const x = cc.layers.find(y => y.id === made); if (x?.kind === 'drawings' && x.caption) x.caption = { ...x.caption, path }; });
      app.history.combine(2, 'Draw caption balloon');
    }
    if (made) app.onNotice?.(`Recognised a ${style === 'custom' ? 'custom' : style === 'box' ? 'caption box' : style === 'thought' ? 'thought' : style === 'shout' ? 'shout' : 'speech'} balloon. Type its words; Undo removes it.`);
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
    const k = project.height / 720;
    c.tails = tails ? c.tails.map(t => ({ ...t, x: stage.x + (t.x - stage.x) * k, y: stage.y + (t.y - stage.y) * k })) : [];
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
    if (l?.kind === 'drawings' && l.caption) {
      const m = app.editor.matrixOf(l);
      for (const t of l.caption.tails) {
        const [x, y] = apply(m, [t.x, t.y]);
        g.beginPath(); g.arc(x, y, 8 / z, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill(); g.stroke();
      }
    }
    g.restore();
  }
}
