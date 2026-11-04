import type { App } from '../app';
import { compLength, exportComp } from '../core/comp';
import { BUNDLE_STEPS, planBundle, prepareBundle, type BundleOptions, type BundleSession, type BundleStep } from '../io/bundle';
import { planVideo, VIDEO_LITE_MAX_BYTES, VIDEO_MAX_BYTES } from '../io/videoplan';
import { videoSupport } from '../io/exportvideo';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') { const n = document.createElement(tag); n.textContent = text; return n; }
const labels: Record<BundleStep | 'zip', string> = { video: 'MP4 video with sound', poster: 'Transparent PNG poster', gif: 'Looping GIF excerpt', project: 'Editable .2dope project', zip: 'Package ZIP' };
export class BundleUI {
  private cleanup: (() => void) | null = null;
  constructor(private app: App, private otherFormats: () => void, private deps: { prepare?: typeof prepareBundle; support?: typeof videoSupport } = {}) {}
  close(): void { this.cleanup?.(); this.cleanup = null; }
  show(scopeId?: string): void {
    const app = this.app;
    if (app.strokeActive || app.transforming || app.adjusting) { app.onNotice?.('Finish the current edit first.'); return; }
    if (app.playing) app.togglePlay(); this.close();
    const project = app.project, comp = (scopeId ? project.comps.get(scopeId) : null) ?? exportComp(project) ?? project.comp, poster = app.frame, opener = document.activeElement as HTMLElement;
    const d = el('dialog'); d.className = 'creation-dialog bundle-dialog'; d.setAttribute('aria-label', 'Hand-in bundle');
    const form = el('div'); form.className = 'creation-fields'; const field = (name: string, n: HTMLElement) => { const l = el('label', name); n.setAttribute('aria-label', name); l.append(n); form.append(l); return l; };
    const start = el('input'), end = el('input'); for (const n of [start, end]) { n.type = 'number'; n.min = '1'; n.max = String(compLength(comp, project.comps)); }
    start.value = String((comp.playbackRange?.start ?? 0) + 1); end.value = String(comp.playbackRange?.end ?? compLength(comp, project.comps)); field('Bundle start frame', start); field('Bundle end frame', end);
    const quality = el('select'); quality.append(new Option('Fit 1080p · High', 'high'), new Option('Fit 720p · Standard', 'small')); field('Bundle video size', quality);
    const editable = el('input'); editable.type = 'checkbox'; const include = field('Include editable project', editable); include.className = 'creation-check';
    const summary = el('p'), note = el('p', 'Video uses the complete selected range. GIF has no sound and includes up to the first six seconds. The poster uses the current frame, clamped into the selected range. Nothing downloads until every required file is ready.'); note.className = 'hint';
    const steps = el('ol'); steps.className = 'bundle-steps'; steps.setAttribute('aria-label', 'Bundle file progress');
    const progress = el('progress'); progress.max = 1; progress.value = 0; progress.hidden = true; progress.setAttribute('aria-label', 'Making bundle');
    const status = el('p'); status.setAttribute('role', 'status');
    const foot = el('footer'), close = el('button', 'Close'), make = el('button', 'Make bundle'), partial = el('button', 'Save completed files'), download = el('button', 'Save bundle ZIP'), formats = el('button', 'Other Share formats'); make.className = 'primary'; download.className = 'primary'; partial.hidden = download.hidden = true;
    foot.append(close, partial, make, download); d.append(el('h2', 'Hand-in bundle'), form, summary, note, steps, progress, status, formats, foot); document.body.append(d);
    let session: BundleSession | null = null, controller: AbortController | null = null, busy = false, closed = false, serial = 0, ready: Blob | null = null;
    const options = (): BundleOptions => ({ comp: comp.id, start: Number(start.value) - 1, end: Number(end.value), poster, project: editable.checked, video: { format: 'mp4', size: quality.value === 'small' ? '720p' : '1080p', quality: quality.value === 'small' ? 'standard' : 'high', background: 'white' } });
    const reset = () => { session?.dispose(); session = null; ready = null; partial.hidden = download.hidden = true; make.hidden = false; };
    const showSteps = (active?: string) => { steps.replaceChildren(); for (const step of BUNDLE_STEPS.filter(s => s !== 'project' || editable.checked)) { const done = session?.queue.completed.has(step), li = el('li', `${done ? '✓ ' : active === step ? 'Making: ' : ''}${labels[step]}`); li.dataset.step = step; li.dataset.state = done ? 'done' : active === step ? 'making' : 'waiting'; steps.append(li); } };
    const inspect = async () => {
      const request = ++serial; make.disabled = true; make.textContent = 'Make bundle'; status.textContent = 'Checking MP4 support…'; showSteps();
      try {
        if (app.project !== project) throw new Error('The project changed. Close and reopen Hand-in bundle.');
        const o = options(), p = planBundle(project, o, app.device.lite), support = await (this.deps.support ?? videoSupport)(planVideo({ main: comp.id, activeComp: comp.id, comp, comps: project.comps }, o.video, app.device.lite ? VIDEO_LITE_MAX_BYTES : VIDEO_MAX_BYTES, p.frames));
        if (closed || request !== serial) return;
        summary.textContent = `${comp.name} · Video ${p.width}×${p.height}, ${p.duration.toFixed(2)} s at ${p.fps} fps · Poster frame ${p.poster + 1} · GIF ${p.gifWidth}×${p.gifHeight}, ${((p.gifEnd - p.start) / p.fps).toFixed(2)} s`;
        if (!support.codec) throw new Error(`${support.message} Use Other Share formats to export separately.`); make.disabled = false; status.textContent = 'Ready. Making the bundle freezes a copy of this project for all files.';
      } catch (e) { if (!closed && request === serial) status.textContent = (e as Error).message; }
    };
    const save = (blob: Blob, incomplete = false) => { const url = URL.createObjectURL(blob), a = el('a'); a.href = url; a.download = `${session?.queue.plan.name ?? '2Dope'}-${incomplete ? 'incomplete-' : ''}hand-in.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); };
    make.onclick = () => void (async () => {
      if (busy) { controller?.abort(); return; } busy = true; serial++; controller = new AbortController(); const signal = controller.signal; form.querySelectorAll('input,select').forEach(n => (n as HTMLInputElement).disabled = true); make.textContent = 'Cancel making'; make.disabled = false; formats.disabled = true; partial.hidden = true; progress.hidden = false; ready = null;
      try {
        if (app.project !== project) throw new Error('The project changed. Reopen Hand-in bundle.');
        status.textContent = 'Freezing the project…'; session ??= await (this.deps.prepare ?? prepareBundle)(project, options(), app.device.lite, app.device.limits.budget, k => app.assets(k), signal);
        if (closed || signal.aborted) return;
        ready = await session.queue.run(signal, p => { if (closed) return; progress.value = p.total ? p.done / p.total : 0; status.textContent = `${labels[p.step]} · ${p.done} / ${p.total}`; showSteps(p.step); });
        if (closed || signal.aborted) return; status.textContent = 'All files are ready. Save the complete bundle ZIP.'; make.hidden = true; download.hidden = false; showSteps();
      } catch (e) {
        if (!closed) { status.textContent = signal.aborted ? 'Cancelled. Nothing downloaded.' : `Could not finish: ${(e as Error).message}`; if (signal.aborted) reset(); else { make.textContent = 'Retry failed step'; partial.hidden = !session?.queue.completed.size; showSteps(); } }
      } finally {
        busy = false; controller = null; if (closed) session?.dispose();
        else { progress.hidden = true; formats.disabled = false; form.querySelectorAll('input,select').forEach(n => (n as HTMLInputElement).disabled = false); if (signal.aborted) { make.textContent = 'Make bundle'; make.disabled = false; } }
      }
    })();
    partial.onclick = () => void (async () => {
      if (!session || busy) return; busy = true; controller = new AbortController(); const signal = controller.signal; partial.disabled = true; make.textContent = 'Cancel making'; status.textContent = 'Packaging the completed files…';
      try { const blob = await session.queue.archive(true, signal); if (!closed && !signal.aborted) { save(blob, true); status.textContent = 'Saved an incomplete bundle. Its manifest lists the missing files.'; } }
      catch (e) { if (!closed) status.textContent = signal.aborted ? 'Cancelled. Nothing downloaded.' : (e as Error).message; }
      finally { busy = false; controller = null; if (closed) session?.dispose(); else { partial.disabled = false; make.textContent = 'Retry failed step'; } }
    })();
    download.onclick = () => { if (ready) save(ready); }; close.onclick = () => this.close(); formats.onclick = () => { if (!busy) { this.close(); this.otherFormats(); } };
    form.oninput = () => { if (!busy) { reset(); void inspect(); } }; form.onchange = () => { if (!busy) { reset(); void inspect(); } };
    this.cleanup = () => { closed = true; serial++; controller?.abort(); if (!busy) session?.dispose(); ready = null; d.close(); d.remove(); if (opener?.isConnected) opener.focus(); };
    d.addEventListener('cancel', e => { e.preventDefault(); this.close(); }); d.addEventListener('keydown', e => e.stopPropagation()); d.addEventListener('keyup', e => e.stopPropagation()); d.showModal(); void inspect();
  }
}
