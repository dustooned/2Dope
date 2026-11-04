import type { App } from '../app';
import { cameraMove, type CameraMove } from '../core/cameramove';
import { activeCamera, compLength, type CameraLayer } from '../core/comp';
import { CompDraftPreview } from '../view/compdraft';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') { const n = document.createElement(tag); n.textContent = text; return n; }
export class CameraMoveUI {
  private cleanup: (() => void) | null = null;
  close(): void { this.cleanup?.(); this.cleanup = null; }
  constructor(private app: App) {}
  show(): void {
    const app = this.app;
    if (app.strokeActive || app.transforming || app.adjusting) { app.onNotice?.('Finish the current edit first.'); return; }
    if (app.playing) app.togglePlay(); this.close();
    const project = app.project, comp = project.comp, signature = JSON.stringify(comp), opener = document.activeElement as HTMLElement;
    const id = project.newId('camera'), d = el('dialog'); d.className = 'creation-dialog camera-move'; d.setAttribute('aria-label', 'Camera move');
    const form = el('div'); form.className = 'creation-fields';
    const field = (name: string, input: HTMLElement) => { const label = el('label', name); input.setAttribute('aria-label', name); label.append(input); form.append(label); return label; };
    const camera = el('select'); camera.append(new Option('New camera', 'new')); for (const l of comp.layers) if (l.kind === 'camera') camera.append(new Option(`${l.name}${l.locked ? ' · Locked' : ''}`, l.id)); camera.value = app.editor.primary?.kind === 'camera' ? app.editor.primary.id : 'new'; field('Camera', camera);
    const kind = el('select'); for (const [v, name] of [['push', 'Push in'], ['pull', 'Pull out'], ['pan', 'Pan']]) kind.append(new Option(name, v)); field('Move', kind);
    const start = el('input'), end = el('input'), strength = el('input'); for (const n of [start, end, strength]) n.type = 'number'; start.min = end.min = '1'; start.max = end.max = String(compLength(comp, project.comps));
    start.value = String((comp.playbackRange?.start ?? 0) + 1); end.value = String(comp.playbackRange?.end ?? compLength(comp, project.comps)); field('Start frame', start); field('End frame', end);
    strength.min = '0'; strength.max = '30'; strength.step = '1'; strength.value = '15'; field('Strength (%)', strength);
    const direction = el('select'); for (const v of ['right', 'left', 'up', 'down']) direction.append(new Option(v[0]!.toUpperCase() + v.slice(1), v)); const directionLabel = field('Direction', direction);
    const ease = el('select'); for (const [v, name] of [['easeInOut', 'Smooth'], ['linear', 'Linear'], ['easeIn', 'Ease in'], ['easeOut', 'Ease out']]) ease.append(new Option(name, v)); field('Easing', ease);
    const replace = el('input'); replace.type = 'checkbox'; const replacement = field('Replace keys in this range', replace); replacement.className = 'creation-check';
    const canvas = el('canvas'); canvas.width = 480; canvas.height = 270; canvas.setAttribute('aria-label', 'Camera move preview');
    const seek = el('input'); seek.type = 'range'; seek.setAttribute('aria-label', 'Camera preview frame');
    const play = el('button', 'Play preview'), readout = el('output'), transport = el('div'); transport.className = 'creation-transport'; transport.append(play, seek, readout);
    const status = el('p'); status.setAttribute('role', 'status'); const preview = el('section'); preview.className = 'creation-preview'; preview.append(canvas, transport, el('p', 'Preview has its own clock. Apply adds ordinary camera keys in one Undo step.'));
    const body = el('div'); body.className = 'creation-body'; body.append(form, preview);
    const foot = el('footer'), cancel = el('button', 'Cancel'), apply = el('button', 'Apply camera move'); apply.className = 'primary'; foot.append(cancel, apply); d.append(el('h2', 'Camera move'), body, status, foot); document.body.append(d);
    let closed = false, playing = false, timer = 0, playSerial = 0, started = 0, first = 0, renderSerial = 0;
    const current = () => !closed && app.project === project && project.comp === comp && JSON.stringify(comp) === signature && !app.strokeActive && !app.transforming && !app.adjusting;
    const session = new CompDraftPreview(project, app.residency, current);
    const stop = () => { playing = false; playSerial++; clearTimeout(timer); play.textContent = 'Play preview'; };
    const options = (): CameraMove => ({ kind: kind.value as CameraMove['kind'], start: Number(start.value) - 1, end: Number(end.value) - 1, strength: Number(strength.value), direction: direction.value as CameraMove['direction'], ease: ease.value as CameraMove['ease'], replace: replace.checked });
    const candidate = () => {
      if (!current()) throw new Error('The shot changed. Close and reopen Camera move.');
      const target = camera.value === 'new' ? null : comp.layers.find(l => l.id === camera.value && l.kind === 'camera') as CameraLayer | undefined;
      if (camera.value !== 'new' && !target) throw new Error('This camera is no longer available.');
      return cameraMove(comp, project.comps, target ?? null, options(), id);
    };
    const paint = async () => {
      const request = ++renderSerial; apply.disabled = true; directionLabel.hidden = kind.value !== 'pan';
      try {
        const next = candidate(), layers = camera.value === 'new' ? [next, ...comp.layers] : comp.layers.map(l => l.id === next.id ? next : l), snapshot = { ...comp, layers };
        const o = options(), f = Math.max(o.start, Math.min(o.end, Number(seek.value))); readout.textContent = `${f + 1}`;
        await session.render(canvas, snapshot, f);
        if (closed || request !== renderSerial || !current()) return;
        const active = activeCamera(snapshot, f, project.comps); status.textContent = active?.id !== next.id ? `Preview uses ${active?.name ?? 'the shot view'}. A camera above this one can override its view.` : 'Ready to apply.'; apply.disabled = false;
      } catch (e) { if (!closed && request === renderSerial) { stop(); status.textContent = (e as Error).message; } }
    };
    const tick = () => { const epoch = playSerial; if (!playing || closed) return; const o = options(), n = o.end - o.start + 1; seek.value = String(o.start + (first - o.start + Math.floor((performance.now() - started) * comp.fps / 1000)) % n); void paint().then(() => { if (playing && epoch === playSerial) timer = window.setTimeout(tick, 1000 / Math.min(24, comp.fps)); }); };
    const update = () => { stop(); const o = options(); seek.min = String(o.start); seek.max = String(o.end); seek.value = String(o.start); void paint(); };
    form.addEventListener('input', update); form.addEventListener('change', update); seek.oninput = () => { stop(); void paint(); };
    play.onclick = () => { if (playing) stop(); else { playing = true; started = performance.now(); first = Number(seek.value); play.textContent = 'Pause preview'; tick(); } };
    cancel.onclick = () => this.close(); apply.onclick = () => {
      try { const next = candidate(); app.editor.edit('Camera move', c => { if (camera.value === 'new') c.layers.unshift(next); else c.layers = c.layers.map(l => l.id === next.id ? next : l); }); app.editor.select(next.id); app.editor.throughCamera = true; this.close(); app.requestRender(); app.focusCanvas(); }
      catch (e) { status.textContent = (e as Error).message; }
    };
    this.cleanup = () => { closed = true; renderSerial++; stop(); session.close(); d.close(); d.remove(); if (opener?.isConnected) opener.focus(); };
    d.addEventListener('cancel', e => { e.preventDefault(); this.close(); }); d.addEventListener('keydown', e => e.stopPropagation()); d.addEventListener('keyup', e => e.stopPropagation()); d.showModal(); update();
  }
}
