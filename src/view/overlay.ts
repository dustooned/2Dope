import type { CompEditor } from '../compedit';
import type { Viewport } from './viewport';

const ACCENT = '#ff5a8a';

/**
 * Selection handles for the Motion workspace, drawn in screen pixels on top of the comp:
 * the selected layers' boxes, corner squares (scale), a round handle above the top edge (rotate)
 * and a cross at the anchor point. Nothing here is part of an export.
 */
export function drawMotionOverlay(g: CanvasRenderingContext2D, ed: CompEditor, view: Viewport, dpr: number): void {
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
  g.strokeStyle = ACCENT;
  g.fillStyle = '#ffffff';
  for (const id of ed.selected) {
    const l = ed.layer(id);
    if (!l || !l.visible) continue;
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
    if (l.kind !== 'null') {
      for (const p of c) {
        g.beginPath();
        g.rect(p![0] - 6, p![1] - 6, 12, 12);
        g.fill();
        g.stroke();
      }
    }
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
    // anchor
    const a = scr(anchorStage(ed, l));
    g.beginPath();
    g.moveTo(a[0] - 8, a[1]);
    g.lineTo(a[0] + 8, a[1]);
    g.moveTo(a[0], a[1] - 8);
    g.lineTo(a[0], a[1] + 8);
    g.stroke();
  }
  g.restore();
}

function anchorStage(ed: CompEditor, l: NonNullable<ReturnType<CompEditor['layer']>>): [number, number] {
  const m = ed.matrixOf(l);
  const a = ed.valueNow(l, 'anchor') as [number, number];
  return [m[0] * a[0] + m[2] * a[1] + m[4], m[1] * a[0] + m[3] * a[1] + m[5]];
}
