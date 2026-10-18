import type { App, Workspace } from '../app';
import { compLength } from '../core/comp';
import { soundStart } from '../core/audio';
import { exportGif, planGif } from '../io/exportgif';
import { sanitizeName } from '../io/exportplan';
import { exportVideo, videoSupport } from '../io/exportvideo';
import type { SoundBank } from '../io/sound';
import { planVideo, videoOptions, VIDEO_LITE_MAX_BYTES, VIDEO_MAX_BYTES, type VideoOptions } from '../io/videoplan';
import { drawComp } from '../view/composite';
import { decorate } from './icons';

const VIDEO_KEY = '2dope.video-export';
const KIND_KEY = '2dope.share.kind';
const GIF_ALPHA_KEY = '2dope.gif.alpha';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}
const fileSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

type Kind = 'video' | 'gif';

export interface ShareHooks {
  sounds: SoundBank;
  /** PNG sequence, storyboard, Blender, backup: the older export list. */
  moreFormats(): void;
  onOpenChange(open: boolean): void;
}

/**
 * Share (the last mode): watch the whole shot as it will come out, pick how to make it, check for
 * surprises, make it, look at the result, then save it or send it (the system share sheet on iPad).
 * The preview is the same compositor the export uses, on the shared clock (sound plays along).
 */
export class ShareView {
  private readonly root = el('div', { class: 'share', role: 'dialog', 'aria-label': 'Share', hidden: '', 'data-own-keys': '' });
  private readonly canvas = el('canvas', { class: 'share-canvas', 'aria-label': 'Preview of the shot' });
  private readonly side = el('div', { class: 'share-side' });
  private readonly scrub = el('input', { type: 'range', min: '0', max: '0', step: '1', 'aria-label': 'Preview position', class: 'share-scrub' });
  private readonly time = el('span', { class: 'share-time' });
  private readonly playBtn = el('button', { type: 'button', class: 'share-play', 'aria-label': 'Play' }, 'Play');
  private kind: Kind = (() => { try { return localStorage.getItem(KIND_KEY) === 'gif' ? 'gif' : 'video'; } catch { return 'video'; } })();
  private opts: VideoOptions = (() => { try { return videoOptions(JSON.parse(localStorage.getItem(VIDEO_KEY) ?? 'null')); } catch { return videoOptions(null); } })();
  private gifAlpha = (() => { try { return localStorage.getItem(GIF_ALPHA_KEY) === '1'; } catch { return false; } })();
  private prevWs: Workspace | null = null;
  private abort: AbortController | null = null;
  private url: string | null = null;
  private raf = 0;
  private checkId = 0;

  constructor(private readonly app: App, private readonly hooks: ShareHooks) {
    const head = el('div', { class: 'share-head' });
    const back = el('button', { type: 'button', class: 'share-back', title: 'Back to your work (Esc)' }, 'Back');
    decorate(back, 'close');
    back.addEventListener('click', () => this.close());
    head.append(back, el('span', { class: 'share-title' }, 'Share'), el('span', { class: 'share-sub' }, 'Watch it, check it, then make your movie'));

    const stage = el('div', { class: 'share-stage' });
    const transport = el('div', { class: 'share-transport' });
    decorate(this.playBtn, 'play');
    this.playBtn.addEventListener('click', () => this.togglePlay());
    const first = el('button', { type: 'button', class: 'share-first', 'aria-label': 'Back to the start', title: 'Back to the start' }, 'Start');
    decorate(first, 'first');
    first.addEventListener('click', () => this.app.setFrame(0));
    this.scrub.addEventListener('input', () => { if (this.app.playing) this.app.togglePlay(); this.app.setFrame(Number(this.scrub.value)); });
    transport.append(first, this.playBtn, this.scrub, this.time);
    stage.append(this.canvas, transport);

    const body = el('div', { class: 'share-body' });
    body.append(stage, this.side);
    this.root.append(head, body);
    document.body.append(this.root);

    window.addEventListener('keydown', (e) => {
      if (this.root.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (this.abort) this.abort.abort(); else this.close(); }
      else if (e.key === ' ' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement)) { e.preventDefault(); e.stopPropagation(); this.togglePlay(); }
    }, true);
    window.addEventListener('resize', () => { if (!this.root.hidden) this.draw(); });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    if (this.open || this.app.strokeActive) return;
    const app = this.app;
    // always the whole shot: step out of any group, and let Motion keep the shot's drawings loaded
    while (app.editor.crumbs().length > 1) if (!app.editor.exit()) break;
    this.prevWs = app.workspace;
    if (app.workspace !== 'motion') app.setWorkspace('motion');
    this.root.hidden = false;
    document.body.classList.add('share-open');
    this.renderSide();
    this.loop();
    this.hooks.onOpenChange(true);
  }

  close(): void {
    if (!this.open) return;
    this.abort?.abort();
    if (this.app.playing) this.app.togglePlay();
    cancelAnimationFrame(this.raf);
    this.root.hidden = true;
    document.body.classList.remove('share-open');
    this.releaseUrl();
    if (this.prevWs && this.prevWs !== this.app.workspace) this.app.setWorkspace(this.prevWs);
    this.prevWs = null;
    this.hooks.onOpenChange(false);
  }

  private releaseUrl(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }

  private togglePlay(): void {
    if (this.abort) return;
    this.app.togglePlay();
    this.syncTransport();
  }

  private get comp() {
    const p = this.app.project;
    return p.comps.get(p.main) ?? p.comp;
  }

  /** Redraw while open (the shot's drawings may still be coming back from storage). */
  private loop(): void {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      if (this.root.hidden) return;
      this.draw();
      this.syncTransport();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private draw(): void {
    const c = this.comp;
    const host = this.canvas.parentElement!;
    const availW = Math.max(80, host.clientWidth - 24);
    const availH = Math.max(80, host.clientHeight - 80);
    const k = Math.min(availW / c.width, availH / c.height);
    const cssW = Math.max(1, Math.round(c.width * k)), cssH = Math.max(1, Math.round(c.height * k));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cssW * dpr), h = Math.round(cssH * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    const g = this.canvas.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = this.kind === 'gif' && this.gifAlpha ? '#e9e9ee' : this.opts.background === 'black' ? '#000' : '#fff';
    g.fillRect(0, 0, w, h);
    g.setTransform(w / c.width, 0, 0, h / c.height, 0, 0);
    drawComp(g, this.app.project, c.id, Math.min(this.app.frame, compLength(c, this.app.project.comps) - 1), { camera: true, export: true });
  }

  private syncTransport(): void {
    const c = this.comp;
    const len = Math.max(1, compLength(c, this.app.project.comps));
    this.scrub.max = String(len - 1);
    if (document.activeElement !== this.scrub) this.scrub.value = String(Math.min(this.app.frame, len - 1));
    this.time.textContent = `${(this.app.frame / c.fps).toFixed(1)} s / ${(len / c.fps).toFixed(1)} s`;
    const playing = this.app.playing;
    if (this.playBtn.dataset.state !== String(playing)) {
      this.playBtn.dataset.state = String(playing);
      this.playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      decorate(this.playBtn, playing ? 'pause' : 'play');
    }
  }

  /** What could surprise you in the movie: hidden layers, muted sounds, sound past the end. */
  private checks(): { ok: boolean; text: string }[] {
    const c = this.comp;
    const comps = this.app.project.comps;
    const len = compLength(c, comps);
    const out: { ok: boolean; text: string }[] = [];
    out.push({ ok: len / c.fps >= 1, text: `${len} frames · ${(len / c.fps).toFixed(1)} seconds at ${c.fps} fps${len / c.fps < 1 ? ' (very short)' : ''}` });
    const hidden = c.layers.filter((l) => (l.kind === 'drawings' || l.kind === 'comp') && !l.visible && !(l.kind === 'drawings' && l.guide));
    if (hidden.length) out.push({ ok: false, text: `Hidden, so not in the movie: ${hidden.map((l) => l.name).slice(0, 4).join(', ')}${hidden.length > 4 ? ` and ${hidden.length - 4} more` : ''}` });
    const board = c.layers.find((l) => l.kind === 'drawings' && l.guide);
    if (board && board.kind === 'drawings') out.push({ ok: true, text: board.guideExport ? 'The storyboard is included' : 'The storyboard stays out (it is a guide)' });
    const clips = c.audio ?? [];
    const muted = clips.filter((s) => s.muted);
    if (muted.length) out.push({ ok: false, text: `Muted sound: ${muted.map((s) => s.name).join(', ')}` });
    const late = clips.filter((s) => { const st = soundStart(s, c); return st !== null && st + (s.trimOut - s.trimIn) * c.fps > len + 1; });
    if (late.length) out.push({ ok: false, text: `Sound runs past the end and is cut: ${late.map((s) => s.name).join(', ')}` });
    if (this.kind === 'gif' && clips.some((s) => !s.muted)) out.push({ ok: false, text: 'GIFs have no sound: make a video to keep it' });
    if (!clips.length && this.kind === 'video') out.push({ ok: true, text: 'No sound' });
    return out;
  }

  private renderSide(): void {
    this.releaseUrl();
    const s = this.side;
    s.replaceChildren();
    // how to make it
    const seg = el('div', { class: 'share-seg', role: 'group', 'aria-label': 'Make a' });
    for (const [k, label, hint] of [['video', 'Video', 'MP4 with sound'], ['gif', 'GIF', 'a looping picture']] as const) {
      const b = el('button', { type: 'button', 'aria-pressed': String(this.kind === k) });
      b.append(el('strong', {}, label), el('span', {}, hint));
      b.addEventListener('click', () => { this.kind = k; try { localStorage.setItem(KIND_KEY, k); } catch { /* optional */ } this.renderSide(); });
      seg.append(b);
    }
    s.append(el('h3', {}, 'Make a'), seg);
    const settings = el('div', { class: 'share-settings' });
    if (this.kind === 'video') {
      const select = <K extends keyof VideoOptions>(label: string, key: K, choices: [VideoOptions[K], string][]) => {
        const row = el('label', { class: 'share-row' });
        const input = el('select', { 'aria-label': label });
        for (const [value, text] of choices) input.append(el('option', { value }, text));
        input.value = this.opts[key];
        input.addEventListener('change', () => {
          this.opts = videoOptions({ ...this.opts, [key]: input.value });
          try { localStorage.setItem(VIDEO_KEY, JSON.stringify(this.opts)); } catch { /* optional */ }
          void this.summary();
        });
        row.append(el('span', {}, label), input);
        settings.append(row);
      };
      select('Size', 'size', [['720p', '720p · smaller file'], ['1080p', '1080p · full HD'], ['original', 'Original size']]);
      select('Quality', 'quality', [['standard', 'Standard'], ['high', 'High']]);
      select('Background', 'background', [['white', 'White'], ['black', 'Black']]);
      select('File', 'format', [['mp4', 'MP4 · plays everywhere'], ['webm', 'WebM']]);
    } else {
      const row = el('label', { class: 'share-row toggle' });
      const box = el('input', { type: 'checkbox' });
      box.checked = this.gifAlpha;
      box.addEventListener('change', () => { this.gifAlpha = box.checked; try { localStorage.setItem(GIF_ALPHA_KEY, box.checked ? '1' : '0'); } catch { /* optional */ } this.draw(); });
      row.append(box, el('span', {}, 'See-through background (hard edges)'));
      settings.append(row);
    }
    s.append(settings);
    // checks
    const list = el('ul', { class: 'share-checks', 'aria-label': 'Checks' });
    for (const c of this.checks()) list.append(el('li', { class: c.ok ? 'ok' : 'warn' }, c.text));
    s.append(el('h3', {}, 'Check'), list);
    s.append(el('p', { class: 'share-summary', 'aria-live': 'polite' }));
    s.append(el('progress', { class: 'share-progress', hidden: '', max: '1', value: '0', 'aria-label': 'Making progress' }));
    s.append(el('p', { class: 'share-status', role: 'status' }));
    const go = el('button', { type: 'button', class: 'share-go primary', disabled: '' }, this.kind === 'video' ? 'Make video' : 'Make GIF');
    go.addEventListener('click', () => void this.make());
    const more = el('button', { type: 'button', class: 'share-more', title: 'PNG frames, storyboard PDF, Blender, project backup' }, 'More formats…');
    more.addEventListener('click', () => { this.close(); this.hooks.moreFormats(); });
    const foot = el('div', { class: 'share-foot' });
    foot.append(go, more);
    s.append(foot);
    void this.summary();
  }

  private async summary(): Promise<void> {
    const id = ++this.checkId;
    const sum = this.side.querySelector<HTMLElement>('.share-summary');
    const status = this.side.querySelector<HTMLElement>('.share-status');
    const go = this.side.querySelector<HTMLButtonElement>('.share-go');
    if (!sum || !status || !go) return;
    go.disabled = true;
    status.textContent = '';
    try {
      if (this.kind === 'video') {
        const plan = planVideo(this.app.project, this.opts, this.maxBytes);
        sum.textContent = `${plan.width} × ${plan.height} · about ${fileSize(plan.estimatedBytes)}`;
        status.textContent = 'Checking this device can make video…';
        const support = await videoSupport(plan);
        if (id !== this.checkId) return;
        status.textContent = support.message;
        go.disabled = !support.codec;
      } else {
        const p = planGif(this.app.project, this.app.device.lite);
        sum.textContent = `${p.width} × ${p.height} · ${p.samples} pictures · loops forever`;
        go.disabled = false;
      }
    } catch (e) {
      if (id !== this.checkId) return;
      sum.textContent = '';
      status.textContent = e instanceof Error ? e.message : String(e);
    }
  }

  private get maxBytes(): number {
    return this.app.device.lite ? VIDEO_LITE_MAX_BYTES : VIDEO_MAX_BYTES;
  }

  private async make(): Promise<void> {
    if (this.abort) return;
    if (this.app.playing) this.app.togglePlay();
    const s = this.side;
    const status = s.querySelector<HTMLElement>('.share-status')!;
    const bar = s.querySelector<HTMLProgressElement>('.share-progress')!;
    const go = s.querySelector<HTMLButtonElement>('.share-go')!;
    const controller = new AbortController();
    this.abort = controller;
    s.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>('.share-seg button, select, input').forEach((e) => (e.disabled = true));
    go.textContent = 'Cancel';
    go.disabled = false;
    go.onclick = () => controller.abort();
    bar.hidden = false;
    bar.value = 0;
    const name = sanitizeName(this.app.project.name);
    try {
      let blob: Blob, file: string;
      if (this.kind === 'video') {
        const r = await exportVideo(this.app.project, this.opts, (p) => { bar.max = p.total; bar.value = p.done; status.textContent = p.label; }, controller.signal, this.app.residency, this.maxBytes, this.hooks.sounds);
        blob = r.blob;
        file = `${name}.${r.extension}`;
      } else {
        blob = await exportGif(this.app.project, this.app.device.lite, controller.signal, this.app.residency, (n, total) => { bar.max = total; bar.value = n; status.textContent = `Making GIF: ${n} of ${total}`; }, this.gifAlpha);
        file = `${name}.gif`;
      }
      if (controller.signal.aborted || !this.open) return;
      this.result(blob, file);
    } catch (e) {
      if (!this.open) return;
      status.textContent = controller.signal.aborted || (e instanceof DOMException && e.name === 'AbortError') ? 'Stopped. Change the settings and try again.' : `Could not make it: ${e instanceof Error ? e.message : String(e)}`;
      bar.hidden = true;
      this.abort = null;
      this.renderSide();
      s.querySelector<HTMLElement>('.share-status')!.textContent = status.textContent;
      return;
    } finally {
      this.abort = null;
    }
  }

  /** The finished movie: watch it, then save it or send it. */
  private result(blob: Blob, file: string): void {
    this.releaseUrl();
    this.url = URL.createObjectURL(blob);
    const s = this.side;
    s.replaceChildren(el('h3', {}, 'Ready'));
    const media = this.kind === 'video'
      ? el('video', { controls: '', playsinline: '', loop: '', src: this.url, class: 'share-result', 'aria-label': 'Your video' })
      : el('img', { src: this.url, class: 'share-result', alt: 'Your GIF' });
    s.append(media, el('p', { class: 'share-summary' }, `${file} · ${fileSize(blob.size)}`));
    const foot = el('div', { class: 'share-foot' });
    const save = el('a', { class: 'share-save primary', href: this.url, download: file }, 'Save');
    foot.append(save);
    const asFile = new File([blob], file, { type: blob.type || (this.kind === 'gif' ? 'image/gif' : 'video/mp4') });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [asFile] })) {
      const send = el('button', { type: 'button', class: 'share-send', title: 'Send it with the device’s share sheet (Photos, AirDrop, Classroom…)' }, 'Share…');
      send.addEventListener('click', () => void nav.share({ files: [asFile], title: this.app.project.name }).catch(() => { /* dismissed */ }));
      foot.append(send);
    }
    const again = el('button', { type: 'button' }, 'Make another');
    again.addEventListener('click', () => this.renderSide());
    foot.append(again);
    s.append(foot);
  }
}
