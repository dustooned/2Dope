import type { App } from '../app';
import type { PropKey } from '../compedit';
import { CURVES, curveSides, HOLD, LINEAR, progress, valueAt, type Prop, type Vec2 } from '../core/anim';
import { editTiming, timingHandles, validateProperty } from '../core/precision';
import { decorate } from './icons';
import { elText as el } from './dom';

const TRANSFORM_CHANNELS = ['position', 'rotation', 'scale', 'anchor', 'opacity', 'zoom'] as const;
const CHANNEL_COLORS = ['#69cbff', '#ffc575', '#c1a3ff', '#ff9eac', '#8fddaa', '#f9dd79'];

/** Detached property editor: preview is local; Apply writes one history command. */
export class GraphUI {
  private panel: HTMLElement | null = null;
  private refresh: (() => void) | null = null;
  constructor(private app: App, private host?: HTMLElement) {}
  close(): void { this.panel?.remove(); this.panel = null; this.refresh = null; }
  update(): void { this.refresh?.(); }

  show(): void {
    if (this.panel) { this.panel.querySelector('button')?.focus(); return; }
    const app = this.app, ed = app.editor, project = app.project, comp = project.comp;
    if (app.strokeActive || ed.dragging || app.transforming || app.adjusting) { app.onNotice?.('Finish the current edit first.'); return; }
    const ref = ed.selectedKeys()[0], layer = ref ? ed.layer(ref.layer) : ed.primary;
    if (!layer || layer.locked) { app.onNotice?.('Select an unlocked animated layer.'); return; }
    const rows = ed.rowsOf(layer).filter(n => ed.getProp(layer, n).keys.length >= 2 && ed.getProp(layer, n).keys.length <= 1000);
    if (!rows.length) { app.onNotice?.('Choose a property with 2–1,000 keys for the graph editor.'); return; }
    if (app.playing) app.togglePlay(); ed.setPathEditing(false);
    const opener = document.activeElement as HTMLElement;
    const host = this.host && matchMedia('(min-width: 1100px) and (min-height: 650px)').matches ? this.host : undefined;
    const modal = host ? null : el('dialog');
    const d = modal ?? el('aside');
    d.className = 'creation-dialog graph-dialog'; d.setAttribute('aria-label', 'Motion graph editor'); this.panel = d;
    if (host) d.classList.add('graph-dock');
    const property = el('select'), segment = el('select'), curve = el('select'), mode = el('select');
    property.setAttribute('aria-label', 'Animated property'); segment.setAttribute('aria-label', 'Keyframe segment'); curve.setAttribute('aria-label', 'Timing preset'); mode.setAttribute('aria-label', 'Graph view');
    rows.forEach(n => property.add(new Option(ed.rowLabel(layer, n), n))); property.value = ref && rows.includes(ref.prop) ? ref.prop : rows[0]!;
    curve.add(new Option('Custom timing', '')); CURVES.forEach(c => curve.add(new Option(c.label, c.id))); curve.add(new Option('Hold', 'hold'));
    mode.add(new Option('Timing handles', 'timing')); mode.add(new Option('Value X / scalar', 'x')); mode.add(new Option('Value Y', 'y')); mode.add(new Option('Speed', 'speed'));
    let name = property.value as PropKey, expected = JSON.stringify(ed.getProp(layer, name)), draft: Prop = structuredClone(ed.getProp(layer, name)), index = 0;
    const canvas = el('canvas'); canvas.width = 640; canvas.height = 300; canvas.className = 'precision-canvas'; canvas.setAttribute('aria-label', 'Timing graph. Drag the blue handles or use numeric controls below.');
    const status = el('p'); status.setAttribute('role', 'status'); const fields = el('div'); fields.className = 'precision-fields';
    const controls = el('div'); controls.className = 'precision-controls'; controls.append(property, segment, mode, curve);
    const head = el('header'), closeButton = el('button', 'Close graph');
    closeButton.title = 'Close graph'; decorate(closeButton, 'close'); closeButton.classList.add('icon-only');
    head.append(el('h2', `Motion graph · ${layer.name}`), closeButton);
    const channels = el('div'); channels.className = 'graph-channels'; channels.setAttribute('role', 'group'); channels.setAttribute('aria-label', 'Transform curves');
    d.append(head);
    if (host) d.append(channels);
    d.append(controls, canvas, fields, status);

    // Each lane fits its own value range. Time is shared across the transform lanes.
    const transformRows = TRANSFORM_CHANNELS.filter(n => rows.includes(n));
    const lanes = new Map<PropKey, { button: HTMLButtonElement; plot: HTMLCanvasElement }>();
    for (const channel of host ? transformRows : []) {
      const button = el('button'), label = el('span', ed.rowLabel(layer, channel)), plot = el('canvas');
      plot.width = 240; plot.height = 26; plot.setAttribute('aria-hidden', 'true');
      button.append(label, plot); button.onclick = () => chooseProperty(channel);
      channels.append(button); lanes.set(channel, { button, plot });
    }
    let overviewEnd = 1;
    const renderOverview = () => {
      if (!lanes.size) return;
      const live = ed.layer(layer.id);
      if (!live) return;
      const curves = transformRows.map(n => n === name ? draft : ed.getProp(live, n));
      overviewEnd = Math.max(1, ...curves.map(p => p.keys.at(-1)?.f ?? 0));
      for (const [i, n] of transformRows.entries()) {
        const { plot, button } = lanes.get(n)!;
        const g = plot.getContext('2d')!, p = curves[i]!;
        const samples = Array.from({ length: 81 }, (_, j) => valueAt(p, overviewEnd * j / 80));
        const lo = Math.min(...samples.flat()), hi = Math.max(...samples.flat());
        g.clearRect(0, 0, plot.width, plot.height);
        g.strokeStyle = CHANNEL_COLORS[i]!; g.lineWidth = 1.5;
        for (let dim = 0; dim < (Array.isArray(p.value) ? 2 : 1); dim++) {
          g.setLineDash(dim ? [4, 3] : []); g.beginPath();
          samples.forEach((sample, j) => {
            const v = Array.isArray(sample) ? sample[dim]! : sample;
            const x = j / 80 * (plot.width - 2) + 1, y = hi === lo ? 13 : 23 - (v - lo) / (hi - lo) * 20;
            if (j) g.lineTo(x, y); else g.moveTo(x, y);
          });
          g.stroke();
        }
        button.setAttribute('aria-pressed', String(n === name));
      }
      syncPlayhead();
    };
    const syncPlayhead = () => {
      const live = ed.layer(layer.id);
      if (!live) return;
      const time = Math.min(overviewEnd, Math.max(0, ed.frameOf(live)));
      channels.style.setProperty('--graph-playhead', `${100 * time / overviewEnd}%`);
    };
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
      renderOverview();
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
    const usePlayhead = () => {
      const f = ed.frameOf(ed.layer(layer.id) ?? layer, name);
      const next = draft.keys.findIndex(k => k.f > f);
      index = next === -1 ? draft.keys.length - 2 : Math.max(0, next - 1);
    };
    const readProperty = (key: PropKey): Prop | undefined => {
      const live = ed.layer(layer.id);
      if (!live || !ed.rowsOf(live).includes(key)) return undefined;
      const prop = ed.getProp(live, key);
      return prop.keys.length >= 2 && prop.keys.length <= 1000 ? prop : undefined;
    };
    const loadDraft = (prop: Prop) => {
      expected = JSON.stringify(prop); draft = structuredClone(prop);
      curve.value = ''; usePlayhead(); fillSegments(); rebuild();
    };
    const chooseProperty = (next: PropKey) => {
      property.value = name;
      if (next === name) return;
      if (JSON.stringify(draft) !== expected) { status.textContent = 'Apply or reset your edits before switching properties.'; return; }
      const prop = readProperty(next);
      if (!prop) { status.textContent = 'The property changed. Reopen the graph.'; return; }
      name = next; property.value = next; loadDraft(prop);
    };
    if (ref?.prop === name) {
      const selected = draft.keys.findIndex(k => k.f === ref.f);
      if (selected !== -1) index = Math.min(selected, draft.keys.length - 2); else usePlayhead();
    } else usePlayhead();
    fillSegments(); rebuild(); property.onchange = () => chooseProperty(property.value as PropKey);
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
    const footer = el('footer'), cancel = el('button', host ? 'Reset edits' : 'Cancel'), apply = el('button', 'Apply graph');
    decorate(cancel, host ? 'undo' : 'close'); decorate(apply, 'check');
    const close = () => { this.close(); if (opener?.isConnected) opener.focus(); else app.focusCanvas(); };
    closeButton.onclick = close;
    cancel.onclick = host ? () => {
      const prop = readProperty(name);
      if (prop) loadDraft(prop); else status.textContent = 'The property changed. Reopen the graph.';
    } : close;
    apply.onclick = () => {
      try {
        if (app.project !== project || project.comp !== comp) throw new Error('The shot changed. Reopen the graph.');
        const live = ed.layer(layer.id);
        if (!live || !ed.rowsOf(live).includes(name)) throw new Error('The property changed. Reopen the graph.');
        ed.replaceProperty(layer.id, name, expected, draft, 'Edit motion graph');
        if (!host) { close(); return; }
        expected = JSON.stringify(draft);
        status.textContent = 'Graph saved. Undo is available.';
      } catch (e) { status.textContent = (e as Error).message; }
    };
    footer.append(cancel, apply); d.append(footer);
    (host ?? document.body).append(d);
    d.addEventListener('cancel', e => { e.preventDefault(); close(); });
    d.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); close(); } });
    d.addEventListener('keyup', e => e.stopPropagation());
    if (host) {
      let revision = ed.rev;
      this.refresh = () => {
        if (app.workspace !== 'motion' || app.project !== project || project.comp !== comp || !ed.layer(layer.id)) { this.close(); return; }
        if (ed.rev === revision) { syncPlayhead(); return; }
        revision = ed.rev;
        const prop = readProperty(name);
        if (prop && JSON.stringify(draft) === expected && JSON.stringify(prop) !== expected) loadDraft(prop);
        else renderOverview();
      };
      closeButton.focus();
    } else modal?.showModal();
  }
}
