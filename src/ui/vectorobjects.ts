import type { App } from '../app';
import { paintDrawing } from '../core/project';
import type { StrokeRecord } from '../core/stroke';
import { parsePath, pathPoints, writePath, type PathNode } from '../core/pathgeometry';
import { readVectorShape } from '../core/vectorshape';
import { apply, invert } from '../core/comp';
import type { Vec2 } from '../core/anim';
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') { const n = document.createElement(tag); n.textContent = text; return n; }
/** Exact imported paths, edited on a detached drawing until Apply. */
export class VectorObjectsUI {
  private dialog: HTMLDialogElement | null = null;
  private generation = 0;
  constructor(private app: App) {}
  close(): void { this.generation++; this.dialog?.close(); this.dialog?.remove(); this.dialog = null; }
  async show(initial?: string): Promise<void> {
    const app = this.app, project = app.project, comp = project.comp, layer = project.layer, drawing = app.drawing, frame = app.frame;
    if (app.strokeActive || app.transforming || app.adjusting || app.editor.dragging || layer.locked || app.playing || app.pointEditing) { app.onNotice?.('Finish the current edit and choose an unlocked drawing.'); return; }
    if ('title' in layer && layer.title) { app.onNotice?.('Convert the title to paint before editing its artwork.'); return; }
    if (!drawing.vectors.some(v => v.shape)) { app.onNotice?.('Import an SVG or EPS drawing first.'); return; }
    this.close(); const generation = this.generation; const opener = document.activeElement as HTMLElement;
    await app.residency.pin(drawing);
    if (generation !== this.generation || app.project !== project || project.comp !== comp || app.drawing !== drawing || app.frame !== frame) { app.residency.unpin(drawing); return; }
    const rev = drawing.rev, expected = JSON.stringify(drawing.vectors), draft = structuredClone(drawing.vectors), selected = new Set([initial && draft.some(v => v.id === initial && v.shape) ? initial : draft.find(v => v.shape)!.id]);
    const d = el('dialog'); d.className = 'creation-dialog vector-dialog'; d.setAttribute('aria-label', 'Vector objects'); this.dialog = d;
    let released = false; const close = () => { if (!released) { released = true; app.residency.unpin(drawing); } if (this.dialog === d) this.dialog = null; d.close(); d.remove(); if (opener?.isConnected) opener.focus(); else app.focusCanvas(); };
    // Also release the drawing when another caller closes this editor.
    d.addEventListener('close', () => { if (!released) { released = true; app.residency.unpin(drawing); } });
    const status = el('p'); status.setAttribute('role', 'status'); const list = el('select'); list.multiple = true; list.size = 5; list.setAttribute('aria-label', 'Vector path list');
    const individual = el('input'); individual.type = 'checkbox'; individual.setAttribute('aria-label', 'Select individual paths'); const individualLabel = el('label', 'Select individual paths'); individualLabel.prepend(individual);
    const canvas = el('canvas'); canvas.width = 640; canvas.height = 360; canvas.className = 'precision-canvas'; canvas.setAttribute('aria-label', 'Vector object preview. Select a path, then drag its square nodes or round curve handles.');
    const controls = el('div'); controls.className = 'precision-fields'; const nodesUI = el('div'); nodesUI.className = 'precision-fields';
    const scale = Math.min(600 / project.width, 320 / project.height), ox = (640 - project.width * scale) / 2, oy = (360 - project.height * scale) / 2;
    let nodes: PathNode[] = [], points = pathPoints(nodes), picked = 0, drag: number | null = null;
    const current = () => draft.find(v => v.id === [...selected][0])!;
    const screen = (p: Vec2): Vec2 => [ox + p[0] * scale, oy + p[1] * scale];
    const render = () => {
      const g = canvas.getContext('2d')!; g.fillStyle = '#1a1d25'; g.fillRect(0, 0, 640, 360); g.save(); g.translate(ox, oy); g.scale(scale, scale); paintDrawing(g, { ...drawing, vectors: draft }); g.restore();
      g.lineWidth = 1.5; g.strokeStyle = '#69cbff';
      for (const rec of draft) if (selected.has(rec.id)) { const ps = rec.points.map(p => screen([p.x, p.y])); if (ps.length) { g.beginPath(); g.moveTo(...ps[0]!); ps.slice(1).forEach(p => g.lineTo(...p)); g.closePath(); g.stroke(); } }
      if (selected.size !== 1) return; const shape = current().shape!;
      for (const [i, p] of points.entries()) { const q = screen(apply([...shape.matrix], p.point)); g.beginPath(); if (p.handle) g.arc(q[0], q[1], 5, 0, Math.PI * 2); else g.rect(q[0] - 5, q[1] - 5, 10, 10); g.fillStyle = picked === i ? '#69cbff' : '#fff'; g.fill(); g.stroke(); }
    };
    const refreshNodes = () => {
      nodesUI.replaceChildren(); nodes = []; points = []; if (selected.size !== 1) { render(); return; }
      try { nodes = parsePath(current().shape!.path); points = pathPoints(nodes); } catch (e) { status.textContent = `${(e as Error).message} Paint, grouping and placement remain available.`; render(); return; }
      const choices = el('select'); choices.setAttribute('aria-label', 'Path node'); points.forEach((p, i) => choices.add(new Option(`${p.handle ? 'Handle' : 'Node'} ${p.node + 1} · ${nodes[p.node]!.cmd}`, String(i)))); picked = Math.min(picked, points.length - 1); choices.value = String(picked);
      const numeric = el('div'); numeric.className = 'precision-fields';
      const update = () => { numeric.replaceChildren(); const point = points[picked]; if (!point) return; for (const dim of [0, 1] as const) {
        const label = el('label', dim ? 'Node Y' : 'Node X'), input = el('input'); input.type = 'number'; input.step = 'any'; input.value = String(point.point[dim]); input.setAttribute('aria-label', dim ? 'Node Y' : 'Node X'); input.onchange = () => { try { movePoint(picked, [dim ? point.point[0] : input.valueAsNumber, dim ? input.valueAsNumber : point.point[1]]); update(); } catch (e) { status.textContent = (e as Error).message; } }; label.append(input); numeric.append(label);
      } };
      choices.onchange = () => { picked = Number(choices.value); update(); render(); }; nodesUI.append(choices, numeric); update(); render();
    };
    const movePoint = (i: number, local: Vec2) => {
      if (local.some(v => !Number.isFinite(v) || Math.abs(v) > 1e7)) throw new Error('Use finite coordinates within 10 million pixels.');
      const p = points[i]!, node = nodes[p.node]!; node.values[p.offset] = local[0]; node.values[p.offset + 1] = local[1]; current().shape!.path = writePath(nodes); points = pathPoints(nodes); render();
    };
    const edit = (fn: (rec: StrokeRecord) => void) => { const before = structuredClone(draft); try { draft.filter(v => selected.has(v.id)).forEach(fn); draft.filter(v => v.shape).forEach(v => readVectorShape(v.shape)); status.textContent = 'Preview updated. Apply saves all changes in one Undo.'; render(); } catch (e) { draft.splice(0, draft.length, ...before); status.textContent = (e as Error).message; rebuild(); } };
    const rebuild = () => {
      list.replaceChildren(); draft.filter(v => v.shape).forEach((v, i) => { const opt = new Option(`Path ${i + 1}${v.shape!.group ? ' · grouped' : ''}`, v.id); opt.selected = selected.has(v.id); list.add(opt); }); controls.replaceChildren(); const first = current(); if (!first) return;
      for (const key of ['fill', 'stroke'] as const) { const label = el('label', `${key === 'fill' ? 'Fill' : 'Stroke'} (#hex or none)`), input = el('input'); input.value = first.shape![key] ?? 'none'; input.setAttribute('aria-label', key === 'fill' ? 'Vector fill' : 'Vector stroke'); input.onchange = () => edit(rec => { rec.shape![key] = input.value.trim() === 'none' ? null : input.value.trim(); }); label.append(input); controls.append(label); }
      for (const [key, labelText, value] of [['width', 'Stroke width', first.shape!.width], ['opacity', 'Object opacity %', first.brush.opacity * 100], ['x', 'Move objects X', 0], ['y', 'Move objects Y', 0]] as const) {
        const label = el('label', labelText), input = el('input'); input.type = 'number'; input.step = 'any'; input.value = String(value); input.setAttribute('aria-label', labelText); input.onchange = () => { const n = input.valueAsNumber; if (!Number.isFinite(n) || key === 'opacity' && (n < 0 || n > 100) || Math.abs(n) > 1e7) { status.textContent = 'Enter a finite value; opacity is 0–100%.'; return; } edit(rec => { if (key === 'width') rec.shape!.width = n; else if (key === 'opacity') rec.brush.opacity = n / 100; else { const matrix = [...rec.shape!.matrix] as [number, number, number, number, number, number]; matrix[key === 'x' ? 4 : 5] += n; rec.shape!.matrix = matrix; rec.points = rec.points.map(p => ({ ...p, x: p.x + (key === 'x' ? n : 0), y: p.y + (key === 'y' ? n : 0) })); } }); if (key === 'x' || key === 'y') input.value = '0'; }; label.append(input); controls.append(label);
      }
      refreshNodes();
    };
    list.onchange = () => { selected.clear(); [...list.selectedOptions].forEach(o => selected.add(o.value)); if (!individual.checked) for (const id of [...selected]) { const group = draft.find(v => v.id === id)?.shape?.group; if (group) draft.filter(v => v.shape?.group === group).forEach(v => selected.add(v.id)); } if (!selected.size) selected.add(draft.find(v => v.shape)!.id); rebuild(); };
    const group = el('button', 'Group selected paths'), ungroup = el('button', 'Ungroup selected paths'); group.onclick = () => { if (selected.size < 2) { status.textContent = 'Select two or more paths first.'; return; } const id = `g${crypto.randomUUID().replaceAll('-', '')}`; edit(rec => { rec.shape!.group = id; }); rebuild(); }; ungroup.onclick = () => { edit(rec => { delete rec.shape!.group; }); rebuild(); };
    canvas.onpointerdown = e => {
      if (selected.size !== 1 || !points.length) return; const rect = canvas.getBoundingClientRect(), p: Vec2 = [(e.clientX - rect.left) / rect.width * 640, (e.clientY - rect.top) / rect.height * 360]; let distance = 22;
      for (const [i, point] of points.entries()) { const q = screen(apply([...current().shape!.matrix], point.point)), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < distance) { distance = d; drag = i; } } if (drag !== null) { picked = drag; canvas.setPointerCapture(e.pointerId); render(); e.preventDefault(); }
    };
    canvas.onpointermove = e => { if (drag === null) return; const m = current().shape!.matrix; if (Math.abs(m[0] * m[3] - m[1] * m[2]) < 1e-10) { status.textContent = 'This object has a zero scale. Use numeric node controls.'; return; } const b = canvas.getBoundingClientRect(); try { movePoint(drag, apply(invert([...m]), [((e.clientX - b.left) / b.width * 640 - ox) / scale, ((e.clientY - b.top) / b.height * 360 - oy) / scale])); } catch (e) { status.textContent = (e as Error).message; } };
    canvas.onpointerup = canvas.onpointercancel = () => { drag = null; refreshNodes(); };
    const footer = el('footer'), cancel = el('button', 'Cancel'), save = el('button', 'Apply vectors'); cancel.onclick = close;
    save.onclick = () => {
      const host = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); host.style.cssText = 'position:fixed;left:-10000px;visibility:hidden'; document.body.append(host);
      try {
        if (app.project !== project || project.comp !== comp || project.layer !== layer || app.drawing !== drawing || app.frame !== frame || drawing.rev !== rev || JSON.stringify(drawing.vectors) !== expected || layer.locked) throw new Error('The drawing changed. Close and reopen Vector objects.');
        for (const rec of draft) if (rec.shape) {
          rec.shape = readVectorShape(rec.shape); const shape = rec.shape, p = document.createElementNS(host.namespaceURI, 'path') as SVGPathElement; p.setAttribute('d', shape.path); host.append(p); const box = p.getBBox(); p.remove(); const pad = shape.stroke ? shape.width / 2 * (shape.join === 'miter' ? shape.miter : 1) : 0;
          rec.points = [[box.x - pad, box.y - pad], [box.x + box.width + pad, box.y - pad], [box.x + box.width + pad, box.y + box.height + pad], [box.x - pad, box.y + box.height + pad]].map(v => { const q = apply([...shape.matrix], v as Vec2); return { x: q[0], y: q[1], pressure: 1, tiltX: 0, tiltY: 0, t: 0 }; });
        }
        if (!app.commitVectorObjects(drawing, rev, expected, draft)) throw new Error('No vector changes were applied.'); close();
      } catch (e) { status.textContent = (e as Error).message; } finally { host.remove(); }
    };
    footer.append(cancel, save); const grouping = el('div'); grouping.className = 'precision-controls'; grouping.append(individualLabel, group, ungroup);
    d.append(el('h2', 'Vector objects'), el('p', 'Edit imported paths inside this drawing. Select several paths to paint or move them together. Groups keep paths together for selection; their drawing order stays fixed.'), list, grouping, canvas, controls, nodesUI, status, footer); document.body.append(d); rebuild();
    d.addEventListener('cancel', e => { e.preventDefault(); close(); }); d.addEventListener('keydown', e => e.stopPropagation()); d.addEventListener('keyup', e => e.stopPropagation()); d.showModal();
  }
}
