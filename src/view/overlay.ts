import { valueAt, type Prop, type Vec2 } from '../core/anim';
import { spatialHandle } from '../core/precision';
import { apply } from '../core/comp';
import type { CompEditor } from '../compedit';
import type { Viewport } from './viewport';

const pathCache = new WeakMap<Prop<Vec2>, Vec2[]>();
function pathSamples(prop: Prop<Vec2>): Vec2[] {
  let points = pathCache.get(prop); if (points) return points; points = [];
  for (let i = 0; i < prop.keys.length - 1; i++) { const a = prop.keys[i]!, b = prop.keys[i + 1]!, steps = Math.max(2, Math.min(24, Math.floor(2000 / prop.keys.length))); for (let j = 0; j <= steps; j++) points.push(valueAt(prop, a.f + (b.f - a.f) * j / steps)); }
  pathCache.set(prop, points); return points;
}
const ACCENT = '#ff5a8a';

/**
 * Selection handles for the Motion workspace, drawn in screen pixels on top of the comp:
 * the selected layers' boxes, corner squares (scale), a round handle above the top edge (rotate)
 * and a cross at the anchor point. Nothing here is part of an export.
 */
export function drawMotionOverlay(g: CanvasRenderingContext2D, ed: CompEditor, view: Viewport, dpr: number, simple = false): void {
  g.save();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const scr = (p: [number, number]): [number, number] => {
    const q = view.docToScreen(p[0], p[1]);
    return [q.x, q.y];
  };
  // dim everything outside the frame (the "backstage": still there, not in the picture)
  const w = ed.comp.width;
  const h = ed.comp.height;
  const f = [scr([0, 0]), scr([w, 0]), scr([w, h]), scr([0, h])];
  g.beginPath();
  g.rect(0, 0, g.canvas.width / dpr, g.canvas.height / dpr);
  g.moveTo(f[0]![0], f[0]![1]);
  for (let i = 1; i < 4; i++) g.lineTo(f[i]![0], f[i]![1]);
  g.closePath();
  g.fillStyle = 'rgba(29, 29, 34, 0.78)';
  g.fill('evenodd');
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.moveTo(f[0]![0], f[0]![1]);
  for (let i = 1; i < 4; i++) g.lineTo(f[i]![0], f[i]![1]);
  g.closePath();
  g.stroke();
  g.lineWidth = 1.5;
  g.strokeStyle = '#60caff';
  for (const guide of ed.snapGuides) { const a = scr(apply(ed.view(), guide.axis === 'x' ? [guide.value, 0] : [0, guide.value])), b = scr(apply(ed.view(), guide.axis === 'x' ? [guide.value, h] : [w, guide.value])); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
  g.strokeStyle = ACCENT;
  g.fillStyle = '#ffffff';
  for (const id of ed.selected) {
    if (simple && id !== ed.primary?.id) continue;
    const l = ed.layer(id);
    if (!l || !l.visible) continue;
    if (simple && ed.contentFrame(l) === null) continue;
    if (l.kind === 'camera' && ed.throughCamera) continue;
    const c = ed.corners(l).map(scr);
    g.setLineDash(l.kind === 'camera' ? [6, 4] : []);
    g.beginPath();
    g.moveTo(c[0]![0], c[0]![1]);
    for (let i = 1; i < 4; i++) g.lineTo(c[i]![0], c[i]![1]);
    g.closePath();
    g.stroke();
    g.setLineDash([]);
    if (id !== ed.primary?.id) continue;
    // corner squares scale (not on nulls)
    if (l.kind !== 'null' && !ed.anchorEditing) {
      for (const p of c) {
        g.beginPath();
        g.rect(p![0] - 6, p![1] - 6, 12, 12);
        g.fill();
        g.stroke();
      }
    }
    if (simple) continue;
    if (!ed.anchorEditing) {
      // rotate handle
      const top: [number, number] = [(c[0]![0] + c[1]![0]) / 2, (c[0]![1] + c[1]![1]) / 2];
      const h = scr(ed.rotateHandle(l, view.zoom));
      g.beginPath();
      g.moveTo(top[0], top[1]);
      g.lineTo(h[0], h[1]);
      g.stroke();
      g.beginPath();
      g.arc(h[0], h[1], 8, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // anchor
    const a = scr(anchorStage(ed, l));
    if (ed.anchorEditing) {
      g.save(); g.strokeStyle = '#ffd24a'; g.fillStyle = '#26262d'; g.lineWidth = 2; g.beginPath(); g.arc(a[0], a[1], 12, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(a[0] - 18, a[1]); g.lineTo(a[0] + 18, a[1]); g.moveTo(a[0], a[1] - 18); g.lineTo(a[0], a[1] + 18); g.stroke(); g.fillStyle = '#ffd24a'; g.font = '12px system-ui'; g.fillText('Anchor', a[0] + 19, a[1] - 14); g.restore();
    }
    g.beginPath();
    g.moveTo(a[0] - 8, a[1]);
    g.lineTo(a[0] + 8, a[1]);
    g.moveTo(a[0], a[1] - 8);
    g.lineTo(a[0], a[1] + 8);
    g.stroke();
  }
  if (ed.pathStroke && ed.pathStroke.length > 1) {
    g.strokeStyle = '#60caff'; g.lineWidth = 3; g.setLineDash([8, 6]); g.beginPath();
    ed.pathStroke.forEach((v, i) => { const p = scr(v); if (i) g.lineTo(...p); else g.moveTo(...p); }); g.stroke(); g.setLineDash([]);
  }
  if (ed.pathEditing && !simple) {
    const layer = ed.primary, prop = layer?.transform.position;
    if (layer && prop && prop.keys.length >= 2 && prop.keys.length <= 1000) {
      const m = ed.pathMatrix(layer), point = (v: Vec2) => scr(apply(m, v)); g.strokeStyle = '#60caff'; g.lineWidth = 2; g.beginPath();
      pathSamples(prop).forEach((v, i) => { const p = point(v); if (i) g.lineTo(...p); else g.moveTo(...p); }); g.stroke();
      for (const [i, key] of prop.keys.entries()) { const p = point(key.v), selected = key.f === ed.pathFrame; if (selected) for (const side of ['in', 'out'] as const) { if (side === 'in' && i === 0 || side === 'out' && i === prop.keys.length - 1) continue; const h = spatialHandle(prop, i, side), q = point([key.v[0] + h[0], key.v[1] + h[1]]); g.beginPath(); g.moveTo(...p); g.lineTo(...q); g.stroke(); g.beginPath(); g.arc(q[0], q[1], 7, 0, Math.PI * 2); g.fillStyle = '#1d1d22'; g.fill(); g.stroke(); } g.beginPath(); g.rect(p[0] - 6, p[1] - 6, 12, 12); g.fillStyle = selected ? '#60caff' : '#fff'; g.fill(); g.stroke(); }
    }
  }
  g.restore();
}

function anchorStage(ed: CompEditor, l: NonNullable<ReturnType<CompEditor['layer']>>): [number, number] {
  const m = ed.matrixOf(l);
  const a = ed.valueNow(l, 'anchor') as [number, number];
  return [m[0] * a[0] + m[2] * a[1] + m[4], m[1] * a[0] + m[3] * a[1] + m[5]];
}
