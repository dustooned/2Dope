/**
 * Pick whip (After Effects): drag from a Motion layer's whip handle and let go on
 * - another layer (its row in the list, or its artwork on the canvas) to parent to it, or
 * - a line drawn with Vector on another layer to travel along it (Animate along a path).
 * A line stretches from the handle to the pointer and a label says what letting go will do.
 * Letting go anywhere else, Escape or a cancelled pointer changes nothing.
 */
import type { App } from '../app';
import type { Vec2 } from '../core/anim';
import { SAME_LAYER_LINE } from '../compedit';

export type WhipTarget =
  | { kind: 'parent'; id: string; name: string }
  | { kind: 'path'; points: Vec2[] }
  | { kind: 'same-line' }
  | { kind: 'none'; hint: string };

const SVG = 'http://www.w3.org/2000/svg';

/** What letting go at a client point would do for the whip dragged from `source`. */
export function whipTarget(app: App, source: string, clientX: number, clientY: number): WhipTarget {
  const ed = app.editor;
  const under = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  const row = under?.closest<HTMLElement>('#motion [data-layer]');
  if (row) {
    const id = row.dataset.layer!;
    if (id === source) return { kind: 'none', hint: 'Drag to another layer, or to a line on the canvas' };
    const l = ed.layer(id);
    return l ? { kind: 'parent', id, name: l.name } : { kind: 'none', hint: 'Let go to cancel' };
  }
  if (under && (under === app.canvasElement || under.closest('#stage'))) {
    const p = app.stageAt(clientX, clientY), zoom = app.view.zoom;
    const line = ed.lineAt(p, 18 / zoom);
    if (line) return line.layer === source ? { kind: 'same-line' } : { kind: 'path', points: line.points };
    const hit = ed.hitLayer(p, { allowLocked: true, accept: l => l.id !== source });
    if (hit) return { kind: 'parent', id: hit.id, name: hit.name };
  }
  return { kind: 'none', hint: 'Let go to cancel' };
}

/**
 * Start a whip drag from `handle` for layer `source`. `follow` gets a route (stage points) to animate
 * along; parenting happens here, as one Undo step.
 */
export function startWhip(app: App, source: string, handle: HTMLElement, e: PointerEvent, follow: (points: Vec2[]) => void): void {
  e.preventDefault();
  e.stopPropagation();
  const ed = app.editor;
  try { handle.setPointerCapture(e.pointerId); } catch { /* the drag still works without capture */ }
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'whip-line');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'line');
  svg.append(path);
  const label = document.createElement('div');
  label.className = 'whip-label';
  label.setAttribute('role', 'status');
  document.body.append(svg, label);
  handle.classList.add('whipping');
  let target: WhipTarget = { kind: 'none', hint: 'Drag to a layer or a line' };
  let lit: HTMLElement | null = null;
  const light = (row: HTMLElement | null) => {
    if (lit === row) return;
    lit?.classList.remove('whip-target');
    lit = row;
    lit?.classList.add('whip-target');
  };
  const move = (ev: PointerEvent) => {
    if (ev.pointerId !== e.pointerId) return;
    const r = handle.getBoundingClientRect();
    path.setAttribute('x1', String(r.left + r.width / 2));
    path.setAttribute('y1', String(r.top + r.height / 2));
    path.setAttribute('x2', String(ev.clientX));
    path.setAttribute('y2', String(ev.clientY));
    target = whipTarget(app, source, ev.clientX, ev.clientY);
    label.textContent = target.kind === 'parent' ? `Parent to ${target.name}` : target.kind === 'path' ? 'Follow this line' : target.kind === 'same-line' ? 'This line is part of the same layer' : target.hint;
    label.dataset.kind = target.kind;
    label.style.left = `${Math.min(ev.clientX + 14, innerWidth - label.offsetWidth - 6)}px`;
    label.style.top = `${Math.max(6, ev.clientY - 40)}px`;
    light(target.kind === 'parent' ? document.querySelector<HTMLElement>(`#motion .mrow.layer[data-layer="${CSS.escape(target.id)}"]`) : null);
    // the line it would follow lights up on the canvas (the path overlay draws it dashed)
    ed.pathStroke = target.kind === 'path' ? target.points : null;
    app.requestRender();
  };
  let done = false;
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', cancel);
    handle.removeEventListener('lostpointercapture', lost);
    window.removeEventListener('keydown', key, true);
    handle.classList.remove('whipping');
    light(null);
    svg.remove();
    label.remove();
    ed.pathStroke = null;
    app.requestRender();
    if (!commit) return;
    const t = target;
    if (t.kind === 'parent') {
      if (!ed.setParentOf(source, t.id)) app.onNotice?.(`Can’t parent to ${t.name}: it is already linked to this layer, so they would loop.`);
      else app.onNotice?.(`Parented to ${t.name}. It now moves with ${t.name}.`);
    } else if (t.kind === 'path') {
      if (!ed.selected.includes(source) || ed.primary?.id !== source) ed.select(source);
      follow(t.points);
    } else if (t.kind === 'same-line') app.onNotice?.(SAME_LAYER_LINE);
  };
  const up = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) finish(true); };
  const cancel = (ev: PointerEvent) => { if (ev.pointerId === e.pointerId) finish(false); };
  // the list redrew under the finger (or capture was refused): the drag ends without a change
  const lost = () => finish(false);
  const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); } };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', cancel);
  handle.addEventListener('lostpointercapture', lost);
  window.addEventListener('keydown', key, true);
  move(e);
}
