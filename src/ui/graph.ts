import type { App } from '../app';
import type { PropKey } from '../compedit';
import { CURVES, curveSides, HOLD, LINEAR, progress, valueAt, type Prop, type Vec2 } from '../core/anim';
import { editTiming, timingHandles, validateProperty } from '../core/precision';
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') { const n = document.createElement(tag); n.textContent = text; return n; }
/** Detached property editor: preview is local; Apply writes one history command. */
export class GraphUI {
  private dialog: HTMLDialogElement | null = null;
  constructor(private app: App) {}
  close(): void { this.dialog?.close(); this.dialog?.remove(); this.dialog = null; }
  show(): void {
    const app = this.app, ed = app.editor, project = app.project, comp = project.comp;
    if (app.strokeActive || ed.dragging || app.transforming || app.adjusting) { app.onNotice?.('Finish the current edit first.'); return; }
    const ref = ed.selectedKeys()[0], layer = ref ? ed.layer(ref.layer) : ed.primary;
    if (!layer || layer.locked) { app.onNotice?.('Select an unlocked animated layer.'); return; }
    const rows = ed.rowsOf(layer).filter(n => ed.getProp(layer, n).keys.length >= 2 && ed.getProp(layer, n).keys.length <= 1000);
    if (!rows.length) { app.onNotice?.('Choose a property with 2–1,000 keys for the graph editor.'); return; }
    if (app.playing) app.togglePlay(); ed.setPathEditing(false); this.close(); const opener = document.activeElement as HTMLElement;
    const d = el('dialog'); d.className = 'creation-dialog graph-dialog'; d.setAttribute('aria-label', 'Motion graph editor'); this.dialog = d;
    const property = el('select'), segment = el('select'), curve = el('select'), mode = el('select');
    property.setAttribute('aria-label', 'Animated property'); segment.setAttribute('aria-label', 'Keyframe segment'); curve.setAttribute('aria-label', 'Timing preset'); mode.setAttribute('aria-label', 'Graph view');
    rows.forEach(n => property.add(new Option(ed.rowLabel(layer, n), n))); property.value = ref && rows.includes(ref.prop) ? ref.prop : rows[0]!;
    curve.add(new Option('Custom timing', '')); CURVES.forEach(c => curve.add(new Option(c.label, c.id))); curve.add(new Option('Hold', 'hold'));
    mode.add(new Option('Timing handles', 'timing')); mode.add(new Option('Value X / scalar', 'x')); mode.add(new Option('Value Y', 'y')); mode.add(new Option('Speed', 'speed'));
    let name = property.value as PropKey, expected = JSON.stringify(ed.getProp(layer, name)), draft: Prop = structuredClone(ed.getProp(layer, name)), index = 0;
    const canvas = el('canvas'); canvas.width = 640; canvas.height = 300; canvas.className = 'precision-canvas'; canvas.setAttribute('aria-label', 'Timing graph. Drag the blue handles or use numeric controls below.');
    const status = el('p'); status.setAttribute('role', 'status'); const fields = el('div'); fields.className = 'precision-fields';
    const controls = el('div'); controls.className = 'precision-controls'; controls.append(property, segment, mode, curve);
    d.append(el('h2', `Motion graph · ${layer.name}`), el('p', 'Edit one segment at a time. Timing is shared by vector components; position paths are edited on the canvas. Values and frames use layer time. Apply saves one Undo step.'), controls, canvas, fields, status);
    const render = () => {
      const a = draft.keys[index]!, b = draft.keys[index + 1]!, g = canvas.getContext('2d')!;
      g.fillStyle = '#181b23'; g.fillRect(0, 0, 640, 300); g.strokeStyle = '#38404f'; g.lineWidth = 1;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(40 + i * 140, 25); g.lineTo(40 + i * 140, 270); g.moveTo(40, 270 - i * 61.25); g.lineTo(600, 270 - i * 61.25); g.stroke(); }
      const values: number[] = [], component = mode.value === 'y' ? 1 : 0;
      for (let i = 0; i <= 120; i++) {
        const f = a.f + (b.f - a.f) * i / 120, v = valueAt(draft, f), previous = valueAt(draft, Math.max(a.f, f - .01));
        values.push(mode.value === 'timing' ? progress(a.out, b.in, i / 120) : mode.value === 'speed' ? (Array.isArray(v) && Array.isArray(previous) ? Math.hypot(v[0] - previous[0], v[1] - previous[1]) : Math.abs(Number(v) - Number(previous))) / .01 : Array.isArray(v) ? v[component]! : v);
      }
      const lo = mode.value === 'timing' ? -.5 : Math.min(...values), hi = mode.value === 'timing' ? 1.5 : Math.max(...values), span = hi - lo || 1;
      const screen = (v: Vec2): Vec2 => [40 + v[0] * 560, 270 - (v[1] - lo) / span * 245];
      g.strokeStyle = '#69cbff'; g.lineWidth = 2; g.beginPath(); values.forEach((v, i) => { const p = screen([i / 120, v]); if (i) g.lineTo(...p); else g.moveTo(...p); }); g.stroke();
      if (mode.value === 'timing') timingHandles(a.out, b.in).forEach((h, i) => { const p = screen(h), origin = screen(i ? [1, 1] : [0, 0]); g.beginPath(); g.moveTo(...origin); g.lineTo(...p); g.stroke(); g.beginPath(); g.arc(p[0], p[1], 8, 0, Math.PI * 2); g.fillStyle = '#69cbff'; g.fill(); });
      g.fillStyle = '#cbd4e3'; g.font = '12px sans-serif'; g.fillText(`Frame ${a.f + 1}`, 40, 291); g.fillText(`Frame ${b.f + 1}`, 530, 291); g.fillText(`${lo.toFixed(2)} … ${hi.toFixed(2)}${mode.value === 'speed' ? ' units/frame' : ''}`, 40, 17);
      status.textContent = mode.value === 'timing' ? 'Blue handles control timing. Graph shows progress from 0 to 1; overshoot is allowed.' : 'Inspection view. Switch to Timing handles to edit the curve.';
    };
    const number = (label: string, value: number, commit: (v: number) => void, integer = false) => {
      const row = el('label', label), input = el('input'); input.type = 'number'; input.step = integer ? '1' : 'any'; input.value = String(value); input.setAttribute('aria-label', label);
      input.onchange = () => { const old = structuredClone(draft); try { if (!Number.isFinite(input.valueAsNumber)) throw new Error('Enter a finite number.'); commit(input.valueAsNumber); validateProperty(draft); curve.value = ''; render(); } catch (e) { draft = old; fillSegments(); rebuild(); status.textContent = (e as Error).message; } }; row.append(input); fields.append(row);
    };
    const rebuild = () => {
      fields.replaceChildren(); const a = draft.keys[index]!, b = draft.keys[index + 1]!;
      for (const [key, label] of [[a, 'Start'], [b, 'End']] as const) {
        number(`${label} frame`, key.f + 1, v => { key.f = v - 1; draft.value = structuredClone(draft.keys[0]!.v); fillSegments(); }, true);
        if (Array.isArray(key.v)) for (const dim of [0, 1] as const) number(`${label} ${dim ? 'Y' : 'X'}`, key.v[dim], v => { (key.v as Vec2)[dim] = v; draft.value = structuredClone(draft.keys[0]!.v); });
        else number(`${label} value`, key.v, v => { key.v = v; draft.value = structuredClone(draft.keys[0]!.v); });
      }
      const hs = timingHandles(a.out, b.in);
      for (const [side, label, h] of [['out', 'Outgoing', hs[0]], ['in', 'Incoming', hs[1]]] as const) {
        number(`${label} time %`, (side === 'out' ? h[0] : 1 - h[0]) * 100, v => { draft = editTiming(draft, a.f, side, [side === 'out' ? v / 100 : 1 - v / 100, h[1]]); rebuild(); });
        number(`${label} progress`, h[1], v => { draft = editTiming(draft, a.f, side, [h[0], v]); rebuild(); });
      }
      render();
    };
    const fillSegments = () => { segment.replaceChildren(); draft.keys.slice(0, -1).forEach((k, i) => segment.add(new Option(`${k.f + 1} → ${draft.keys[i + 1]!.f + 1}`, String(i)))); segment.value = String(index); };
    fillSegments(); rebuild(); property.onchange = () => { name = property.value as PropKey; expected = JSON.stringify(ed.getProp(layer, name)); draft = structuredClone(ed.getProp(layer, name)); index = 0; fillSegments(); rebuild(); };
    segment.onchange = () => { index = Number(segment.value); curve.value = ''; rebuild(); }; mode.onchange = render;
    curve.onchange = () => { if (!curve.value) return; const sides = curve.value === 'hold' ? { out: HOLD, in: LINEAR } : curveSides(curve.value as typeof CURVES[number]['id']); draft.keys[index]!.out = { ...sides.out }; draft.keys[index + 1]!.in = { ...sides.in }; rebuild(); };
    let drag: 'out' | 'in' | null = null;
    canvas.onpointerdown = e => {
      if (mode.value !== 'timing') return; const box = canvas.getBoundingClientRect(), x = (e.clientX - box.left) / box.width * 640, y = (e.clientY - box.top) / box.height * 300;
      const hs = timingHandles(draft.keys[index]!.out, draft.keys[index + 1]!.in); let distance = 26;
      hs.forEach((h, i) => { const d = Math.hypot(x - (40 + h[0] * 560), y - (270 - (h[1] + .5) / 2 * 245)); if (d < distance) { distance = d; drag = i ? 'in' : 'out'; } });
      if (drag) { canvas.setPointerCapture(e.pointerId); e.preventDefault(); }
    };
    canvas.onpointermove = e => { if (!drag) return; const b = canvas.getBoundingClientRect(); draft = editTiming(draft, draft.keys[index]!.f, drag, [((e.clientX - b.left) / b.width * 640 - 40) / 560, (270 - (e.clientY - b.top) / b.height * 300) / 245 * 2 - .5]); curve.value = ''; render(); };
    canvas.onpointerup = canvas.onpointercancel = () => { drag = null; rebuild(); };
    const footer = el('footer'), cancel = el('button', 'Cancel'), apply = el('button', 'Apply graph');
    const close = () => { this.close(); if (opener?.isConnected) opener.focus(); else app.focusCanvas(); };
    cancel.onclick = close; apply.onclick = () => { try { if (app.project !== project || project.comp !== comp) throw new Error('The shot changed. Reopen the graph.'); ed.replaceProperty(layer.id, name, expected, draft, 'Edit motion graph'); close(); } catch (e) { status.textContent = (e as Error).message; } };
    footer.append(cancel, apply); d.append(footer); document.body.append(d); d.addEventListener('cancel', e => { e.preventDefault(); close(); }); d.addEventListener('keydown', e => e.stopPropagation()); d.addEventListener('keyup', e => e.stopPropagation()); d.showModal();
  }
}
