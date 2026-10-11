import type { App } from '../app';
import { DEFAULT_EXPORT, framesToExport, PASSES, sanitizeName, scaledSize, type ExportOptions, type Pass } from '../io/exportplan';
import { exportSequence } from '../io/exportseq';
import { compLength, isPlainFlipbook } from '../core/comp';

const KEY = '2dope.m1.export';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function load(): ExportOptions {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<ExportOptions>;
    const passes = (raw.passes ?? []).filter((p): p is Pass => PASSES.some((x) => x.id === p));
    return {
      ...DEFAULT_EXPORT,
      scale: [1, 0.75, 0.5, 0.25].includes(raw.scale ?? 1) ? (raw.scale ?? 1) : 1,
      background: raw.background === 'white' ? 'white' : 'transparent',
      range: raw.range === 'selected' ? 'selected' : 'all',
      start: Number.isInteger(raw.start) && (raw.start ?? 1) >= 0 && (raw.start ?? 1) < 100000 ? (raw.start as number) : 1,
      passes: passes.length ? passes : ['combined'],
    };
  } catch {
    return { ...DEFAULT_EXPORT };
  }
}

function size(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The export dialog: pick the passes (combined / lines / fills / matte), scale, background,
 * which frames and the first file number. Writes a ZIP of PNG sequences with alpha, one folder
 * per pass, and an export.json with the timing. The dialog is modal while it runs, so the
 * project cannot change underneath it; Cancel stops cleanly.
 */
export class ExportUI {
  private readonly dialog: HTMLDialogElement;
  private opts = load();
  private abort: AbortController | null = null;

  constructor(
    private readonly app: App,
    dialog: HTMLDialogElement,
    private readonly toast: (message: string) => void,
  ) {
    this.dialog = dialog;
  }

  open(): void {
    this.opts = { ...this.opts, name: sanitizeName(this.app.project.name === 'Untitled' ? this.opts.name : this.app.project.name) };
    this.render();
    this.dialog.showModal();
  }

  private save(): void {
    try {
      const { name: _n, ...rest } = this.opts;
      void _n;
      localStorage.setItem(KEY, JSON.stringify(rest));
    } catch {
      // not persisted: fine
    }
  }

  private render(): void {
    const d = this.dialog;
    const o = this.opts;
    d.replaceChildren();
    d.append(el('h2', {}, 'Export PNG sequence'));

    const row = (label: string, control: HTMLElement, hint?: string) => {
      const r = el('label', { class: 'xrow' });
      r.append(el('span', { class: 'name' }, label), control);
      if (hint) r.title = hint;
      return r;
    };
    const name = el('input', { type: 'text', maxlength: '60', value: o.name, 'aria-label': 'Name' });
    name.addEventListener('input', () => {
      o.name = sanitizeName(name.value);
      this.summary();
    });
    d.append(row('Name', name, 'Used for the folder and file names'));

    const passBox = el('div', { class: 'xpasses' });
    for (const p of PASSES) {
      const l = el('label', { class: 'check', title: p.hint });
      const c = el('input', { type: 'checkbox' });
      c.checked = o.passes.includes(p.id);
      c.addEventListener('change', () => {
        o.passes = PASSES.filter((x) => (x.id === p.id ? c.checked : o.passes.includes(x.id))).map((x) => x.id);
        this.summary();
      });
      l.append(c, el('span', {}, p.label));
      passBox.append(l);
    }
    d.append(row('Passes', passBox));

    const scale = el('select', { 'aria-label': 'Size' });
    for (const s of [1, 0.75, 0.5, 0.25]) scale.append(el('option', { value: String(s) }, `${Math.round(s * 100)}%`));
    scale.value = String(o.scale);
    scale.addEventListener('change', () => {
      o.scale = Number(scale.value);
      this.summary();
    });
    d.append(row('Size', scale));

    const bg = el('select', { 'aria-label': 'Background' });
    bg.append(el('option', { value: 'transparent' }, 'Transparent'), el('option', { value: 'white' }, 'White'));
    bg.value = o.background;
    bg.addEventListener('change', () => {
      o.background = bg.value === 'white' ? 'white' : 'transparent';
      this.summary();
    });
    d.append(row('Background', bg, 'Applies to the Combined pass. Lines, Fills and Matte always keep their alpha so they can be composited.'));

    const range = el('select', { 'aria-label': 'Frames' });
    range.append(el('option', { value: 'all' }, 'All frames'), el('option', { value: 'selected' }, 'Selected drawings'));
    range.value = o.range;
    range.addEventListener('change', () => {
      o.range = range.value === 'selected' ? 'selected' : 'all';
      this.summary();
    });
    d.append(row('Frames', range));

    const start = el('input', { type: 'number', min: '0', max: '99999', step: '1', value: String(o.start), 'aria-label': 'First number', class: 'exp-input' });
    start.addEventListener('input', () => {
      const n = Math.round(Number(start.value));
      o.start = Number.isFinite(n) && n >= 0 && n < 100000 ? n : 1;
      this.summary();
    });
    d.append(row('First number', start, 'Number of the first file (1001 is common for compositing)'));

    d.append(el('p', { class: 'hint xsummary', 'aria-live': 'polite' }));
    const bar = el('progress', { class: 'xprogress', max: '1', value: '0', hidden: '' });
    d.append(bar, el('p', { class: 'hint xstatus', hidden: '' }));

    const foot = el('div', { class: 'vfoot' });
    const cancel = el('button', { type: 'button', class: 'xcancel' }, 'Close');
    const go = el('button', { type: 'button', class: 'xgo' }, 'Export');
    cancel.addEventListener('click', () => {
      if (this.abort) this.abort.abort();
      else d.close();
    });
    go.addEventListener('click', () => void this.run());
    foot.append(cancel, go);
    d.append(foot);
    this.summary();
  }

  private summary(): void {
    const o = this.opts;
    const p = this.app.project;
    const plain = isPlainFlipbook(p.comp);
    const picked = framesToExport(p.exposures, o.range, this.app.selection);
    const frames = plain || o.range === 'selected' ? picked : Array.from({ length: compLength(p.comp, p.comps) });
    const unique = plain ? new Set(picked.map((f) => f.drawing)).size : frames.length;
    const sz = plain ? scaledSize(p.width, p.height, o.scale) : scaledSize(p.comp.width, p.comp.height, o.scale);
    const s = this.dialog.querySelector<HTMLElement>('.xsummary');
    const go = this.dialog.querySelector<HTMLButtonElement>('.xgo');
    if (go) go.disabled = !frames.length || !o.passes.length;
    if (s)
      s.textContent = !o.passes.length
        ? 'Pick at least one pass.'
        : `${frames.length} frames × ${o.passes.length} pass${o.passes.length === 1 ? '' : 'es'} = ${frames.length * o.passes.length} images, ${sz.w}×${sz.h}. ${plain ? `${unique} distinct drawing${unique === 1 ? '' : 's'} to render.` : `The whole shot (layers, motion, camera) is rendered; frames that do not change are written once.`} Saved as ${o.name}/…/${o.name}_${String(o.start).padStart(4, '0')}.png in a .zip.`;
  }

  private async run(): Promise<void> {
    const d = this.dialog;
    const progress = d.querySelector<HTMLProgressElement>('.xprogress');
    const status = d.querySelector<HTMLElement>('.xstatus');
    const go = d.querySelector<HTMLButtonElement>('.xgo');
    const cancel = d.querySelector<HTMLButtonElement>('.xcancel');
    if (!progress || !status || !go || !cancel) return;
    this.save();
    const controls = d.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select');
    controls.forEach((c) => (c.disabled = true));
    go.disabled = true;
    cancel.textContent = 'Cancel';
    progress.hidden = false;
    status.hidden = false;
    this.abort = new AbortController();
    const t0 = performance.now();
    try {
      const r = await exportSequence(
        this.app.project,
        this.opts,
        this.app.selection,
        (p) => {
          progress.max = Math.max(1, p.total);
          progress.value = p.done;
          status.textContent = `${p.done} of ${p.total} · ${p.label}`;
        },
        this.abort.signal,
        this.app.residency,
      );
      const blob = new Blob([r.zip as BlobPart], { type: 'application/zip' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${this.opts.name}-sequence.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      d.close();
      this.toast(`Exported ${r.images} images (${r.frames} frames, ${size(r.zip.length)}) in ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        d.close();
        this.toast('Export cancelled. Nothing was saved.');
      } else {
        status.textContent = `Could not export: ${e instanceof Error ? e.message : String(e)}`;
        controls.forEach((c) => (c.disabled = false));
        go.disabled = false;
        cancel.textContent = 'Close';
      }
    } finally {
      this.abort = null;
    }
  }
}
