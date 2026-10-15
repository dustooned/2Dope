import type { App } from '../app';
import type { SoundBank } from '../io/sound';
import { exportVideo, videoSupport } from '../io/exportvideo';
import { sanitizeName } from '../io/exportplan';
import { planVideo, videoOptions, VIDEO_LITE_MAX_BYTES, VIDEO_MAX_BYTES, type VideoOptions } from '../io/videoplan';

const KEY = '2dope.video-export';
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, value);
  if (text !== undefined) e.textContent = text;
  return e;
}
function load(): VideoOptions {
  try { return videoOptions(JSON.parse(localStorage.getItem(KEY) ?? 'null')); }
  catch { return videoOptions(null); }
}
const fileSize = (n: number) => n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

/** An independent modal; it never changes timing, guide flags, the playhead or project storage. */
export class VideoExportUI {
  private readonly dialog = el('dialog', { class: 'video-export', 'aria-label': 'Export video', 'data-own-keys': '' });
  private opts = load();
  private abort: AbortController | null = null;
  private checkId = 0;
  private url: string | null = null;

  constructor(private readonly app: App, private readonly toast: (message: string) => void, private readonly sounds: SoundBank) {
    document.body.append(this.dialog);
    this.dialog.addEventListener('cancel', (e) => {
      if (this.abort) { e.preventDefault(); this.abort.abort(); }
    });
    this.dialog.addEventListener('close', () => {
      this.checkId++;
      this.abort?.abort();
      this.releaseUrl();
    });
  }

  open(): void {
    if (this.dialog.open) return;
    if (this.app.strokeActive) return this.toast('Finish the stroke before exporting video.');
    if (this.app.playing) this.app.togglePlay();
    this.render();
    this.dialog.showModal();
    void this.summary();
  }

  private get maxBytes(): number { return this.app.device.lite ? VIDEO_LITE_MAX_BYTES : VIDEO_MAX_BYTES; }
  private releaseUrl(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  private render(): void {
    this.releaseUrl();
    const d = this.dialog;
    d.replaceChildren(el('h2', {}, 'Export video'));
    d.append(el('p', { class: 'hint' }, 'A video of the whole shot, with its layers, camera, timing and unmuted audio.'));
    const select = <K extends keyof VideoOptions>(label: string, key: K, choices: [VideoOptions[K], string][]) => {
      const row = el('label', { class: 'xrow' });
      const input = el('select', { 'aria-label': label });
      for (const [value, text] of choices) input.append(el('option', { value }, text));
      input.value = this.opts[key];
      input.addEventListener('change', () => {
        this.opts = videoOptions({ ...this.opts, [key]: input.value });
        void this.summary();
      });
      row.append(el('span', { class: 'name' }, label), input);
      d.append(row);
    };
    select('Format', 'format', [['mp4', 'MP4 · most apps'], ['webm', 'WebM · alternative']]);
    select('Size', 'size', [['720p', '720p · smaller file'], ['1080p', '1080p · full HD'], ['original', 'Original size']]);
    select('Quality', 'quality', [['standard', 'Standard'], ['high', 'High']]);
    select('Background', 'background', [['white', 'White'], ['black', 'Black']]);
    d.append(el('p', { class: 'hint' }, 'Background fills transparent areas; comp backgrounds are kept. For transparent output, use Export sequence. The storyboard follows its existing Include the storyboard setting.'));
    d.append(el('p', { class: 'hint video-summary', 'aria-live': 'polite' }));
    d.append(el('progress', { class: 'xprogress', hidden: '', max: '1', value: '0', 'aria-label': 'Video export progress' }));
    d.append(el('p', { class: 'hint video-status', role: 'status' }));
    const footer = el('div', { class: 'vfoot' });
    const close = el('button', { type: 'button', class: 'video-cancel' }, 'Close');
    close.addEventListener('click', () => this.abort ? this.abort.abort() : d.close());
    const go = el('button', { type: 'button', class: 'video-go', disabled: '' }, 'Export video');
    go.addEventListener('click', () => void this.run());
    footer.append(close, go);
    d.append(footer);
  }

  private async summary(): Promise<void> {
    const id = ++this.checkId;
    const summary = this.dialog.querySelector<HTMLElement>('.video-summary');
    const status = this.dialog.querySelector<HTMLElement>('.video-status');
    const go = this.dialog.querySelector<HTMLButtonElement>('.video-go');
    if (!summary || !status || !go) return;
    go.disabled = true;
    status.textContent = 'Checking video support…';
    try {
      const plan = planVideo(this.app.project, this.opts, this.maxBytes);
      summary.textContent = `${plan.frames} frames · ${plan.duration.toFixed(2)} seconds · ${plan.fps} fps · ${plan.width}×${plan.height} · estimated ${fileSize(plan.estimatedBytes)}.`;
      const support = await videoSupport(plan);
      if (id !== this.checkId || !this.dialog.open) return;
      status.textContent = support.message;
      go.disabled = !support.codec;
    } catch (error) {
      if (id !== this.checkId) return;
      summary.textContent = '';
      status.textContent = error instanceof Error ? error.message : String(error);
    }
  }

  private async run(): Promise<void> {
    if (this.abort) return;
    const d = this.dialog;
    const status = d.querySelector<HTMLElement>('.video-status')!;
    const bar = d.querySelector<HTMLProgressElement>('progress')!;
    const cancel = d.querySelector<HTMLButtonElement>('.video-cancel')!;
    const go = d.querySelector<HTMLButtonElement>('.video-go')!;
    this.checkId++;
    try { localStorage.setItem(KEY, JSON.stringify(this.opts)); } catch { /* preferences are optional */ }
    const controller = new AbortController();
    this.abort = controller;
    d.querySelectorAll<HTMLSelectElement>('select').forEach((e) => e.disabled = true);
    go.disabled = true;
    bar.hidden = false;
    bar.value = 0;
    cancel.textContent = 'Cancel';
    try {
      const result = await exportVideo(this.app.project, this.opts, (p) => {
        bar.max = p.total;
        bar.value = p.done;
        status.textContent = p.label;
      }, controller.signal, this.app.residency, this.maxBytes, this.sounds);
      if (controller.signal.aborted || !d.open) return;
      this.url = URL.createObjectURL(result.blob);
      d.replaceChildren(el('h2', {}, 'Video ready'));
      d.append(el('p', { class: 'hint', role: 'status' }, `${result.frames} frames · ${result.duration.toFixed(2)} seconds · ${fileSize(result.blob.size)}. Preview it, then save a copy.`));
      const video = el('video', { controls: '', playsinline: '', preload: 'metadata', src: this.url, 'aria-label': 'Exported video preview' });
      d.append(video);
      const footer = el('div', { class: 'vfoot' });
      const close = el('button', { type: 'button' }, 'Close');
      close.addEventListener('click', () => d.close());
      const again = el('button', { type: 'button' }, 'Export another');
      again.addEventListener('click', () => { this.render(); void this.summary(); });
      const save = el('a', { class: 'video-save', href: this.url, download: `${sanitizeName(this.app.project.name)}.${result.extension}` }, 'Save video');
      footer.append(close, again, save);
      d.append(footer);
      save.focus();
    } catch (error) {
      if (!d.open) return;
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        status.textContent = 'Video export cancelled. You can change the settings and try again.';
      } else {
        status.textContent = `Could not export: ${error instanceof Error ? error.message : String(error)}`;
      }
      d.querySelectorAll<HTMLSelectElement>('select').forEach((e) => e.disabled = false);
      go.disabled = false;
      cancel.textContent = 'Close';
      bar.hidden = true;
    } finally {
      this.abort = null;
    }
  }
}
