import type { App, Workspace } from '../app';
import { compLength, frameContent } from '../core/comp';
import { soundStart } from '../core/audio';
import type { Drawing } from '../core/project';
import { DEFAULT_APNG, exportApng, planApng, type ApngOptions } from '../io/apng';
import { exportGif, planGif } from '../io/exportgif';
import { DEFAULT_EXPORT, PASSES, sanitizeName, type ExportOptions, type Pass } from '../io/exportplan';
import { exportSequence } from '../io/exportseq';
import { exportVideo, videoSupport } from '../io/exportvideo';
import type { SoundBank } from '../io/sound';
import { planVideo, videoOptions, VIDEO_LITE_MAX_BYTES, VIDEO_MAX_BYTES, type VideoOptions } from '../io/videoplan';
import { drawComp, releaseScratch } from '../view/composite';
import { decorate } from './icons';

const VIDEO_KEY = '2dope.video-export';
const KIND_KEY = '2dope.share.kind';
const GIF_ALPHA_KEY = '2dope.gif.alpha';
const APNG_KEY = '2dope.share.apng';
const FRAMES_KEY = '2dope.share.frames';
const PICTURE_KEY = '2dope.share.picture';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}
const fileSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
function load<T>(key: string, fallback: T): T {
  try { const v = JSON.parse(localStorage.getItem(key) ?? 'null') as T | null; return v && typeof v === 'object' ? { ...fallback, ...v } : fallback; } catch { return fallback; }
}
function save(key: string, v: unknown): void {
  try { localStorage.setItem(key, typeof v === 'string' ? v : JSON.stringify(v)); } catch { /* optional */ }
}

type Kind = 'video' | 'gif' | 'apng' | 'frames' | 'picture' | 'board' | 'blender' | 'backup';
const KINDS: { id: Kind; label: string; hint: string; icon: string }[] = [
  { id: 'video', label: 'Video', hint: 'MP4 or WebM, with sound', icon: 'play' },
  { id: 'gif', label: 'GIF', hint: 'looping, plays anywhere', icon: 'flipbook' },
  { id: 'apng', label: 'Animated PNG', hint: 'looping, see-through, full colour', icon: 'layers' },
  { id: 'frames', label: 'PNG frames', hint: 'a ZIP of numbered pictures', icon: 'copy' },
  { id: 'picture', label: 'Picture', hint: 'this frame as a PNG', icon: 'gallery' },
  { id: 'board', label: 'Storyboard', hint: 'PDF or panel images', icon: 'board' },
  { id: 'blender', label: 'Blender', hint: 'an editable scene package', icon: 'motion' },
  { id: 'backup', label: 'Project file', hint: 'a .2dope backup to keep', icon: 'export' },
];

interface FrameOpts { passes: Pass[]; scale: number; background: 'transparent' | 'white'; start: number; name: string }
interface PictureOpts { scale: number; background: 'transparent' | 'white' }

export interface ShareHooks {
  sounds: SoundBank;
  board(): void;
  blender(): void;
  backup(): void;
  onOpenChange(open: boolean): void;
}

/**
 * Share (the last mode): watch the whole shot as it will come out, pick a format (every export is
 * here), set its one main choice, with the rest under Advanced, check for surprises, make it, look
 * at the result, then save it or send it (the system share sheet on iPad).
 */
export class ShareView {
  private readonly root = el('div', { class: 'share', role: 'dialog', 'aria-label': 'Share', hidden: '', 'data-own-keys': '' });
  private readonly canvas = el('canvas', { class: 'share-canvas', 'aria-label': 'Preview of the shot' });
  private readonly side = el('div', { class: 'share-side' });
  private readonly scrub = el('input', { type: 'range', min: '0', max: '0', step: '1', 'aria-label': 'Preview position', class: 'share-scrub' });
  private readonly time = el('span', { class: 'share-time' });
  private readonly playBtn = el('button', { type: 'button', class: 'share-play', 'aria-label': 'Play' }, 'Play');
  private kind: Kind = (() => { try { const k = localStorage.getItem(KIND_KEY); return KINDS.some((x) => x.id === k) ? (k as Kind) : 'video'; } catch { return 'video'; } })();
  private opts: VideoOptions = (() => { try { return videoOptions(JSON.parse(localStorage.getItem(VIDEO_KEY) ?? 'null')); } catch { return videoOptions(null); } })();
  private gifAlpha = (() => { try { return localStorage.getItem(GIF_ALPHA_KEY) === '1'; } catch { return false; } })();
  private apng: ApngOptions = load(APNG_KEY, DEFAULT_APNG);
  private frames: FrameOpts = load(FRAMES_KEY, { passes: ['combined'] as Pass[], scale: 1, background: 'transparent' as const, start: 1, name: '' });
  private picture: PictureOpts = load(PICTURE_KEY, { scale: 1, background: 'transparent' as const });
  private advancedOpen = false;
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

  /** Does the chosen format keep see-through areas? (The preview shows a checkerboard then.) */
  private get seeThrough(): boolean {
    switch (this.kind) {
      case 'video': return this.opts.background === 'transparent';
      case 'gif': return this.gifAlpha;
      case 'apng': return this.apng.background === 'transparent';
      case 'frames': return this.frames.background === 'transparent';
      case 'picture': return this.picture.background === 'transparent';
      default: return false;
    }
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
    if (this.seeThrough) {
      // a checkerboard shows what will be see-through
      const s = Math.max(8, Math.round(12 * dpr));
      for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) { g.fillStyle = ((x + y) / s) % 2 ? '#d7d7de' : '#f4f4f7'; g.fillRect(x, y, s, s); }
    } else {
      const black = (this.kind === 'video' && this.opts.background === 'black') || (this.kind === 'apng' && this.apng.background === 'black');
      g.fillStyle = black ? '#000' : '#fff';
      g.fillRect(0, 0, w, h);
    }
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
    if (hidden.length) out.push({ ok: false, text: `Hidden, so not included: ${hidden.map((l) => l.name).slice(0, 4).join(', ')}${hidden.length > 4 ? ` and ${hidden.length - 4} more` : ''}` });
    const board = c.layers.find((l) => l.kind === 'drawings' && l.guide);
    if (board && board.kind === 'drawings') out.push({ ok: true, text: board.guideExport ? 'The storyboard is included' : 'The storyboard stays out (it is a guide)' });
    const clips = c.audio ?? [];
    if (this.kind === 'video') {
      const muted = clips.filter((s) => s.muted);
      if (muted.length) out.push({ ok: false, text: `Muted sound: ${muted.map((s) => s.name).join(', ')}` });
      const late = clips.filter((s) => { const st = soundStart(s, c); return st !== null && st + (s.trimOut - s.trimIn) * c.fps > len + 1; });
      if (late.length) out.push({ ok: false, text: `Sound runs past the end and is cut: ${late.map((s) => s.name).join(', ')}` });
      if (!clips.length) out.push({ ok: true, text: 'No sound' });
      if (this.opts.background === 'transparent') out.push({ ok: true, text: 'See-through video is WebM: it plays in browsers and video editors; for Photos use a background' });
    } else if (clips.some((s) => !s.muted) && (this.kind === 'gif' || this.kind === 'apng' || this.kind === 'frames')) {
      out.push({ ok: false, text: 'This format has no sound: make a video to keep it' });
    }
    return out;
  }

  private renderSide(): void {
    this.releaseUrl();
    const s = this.side;
    s.replaceChildren();
    // every format, one tap each
    const grid = el('div', { class: 'share-kinds', role: 'radiogroup', 'aria-label': 'Make a' });
    for (const k of KINDS) {
      const b = el('button', { type: 'button', role: 'radio', 'aria-checked': String(this.kind === k.id), title: k.hint });
      decorate(b, k.icon);
      b.append(el('strong', {}, k.label), el('span', {}, k.hint));
      b.addEventListener('click', () => { this.kind = k.id; save(KIND_KEY, k.id); this.renderSide(); });
      grid.append(b);
    }
    s.append(el('h3', {}, 'Make a'), grid);

    const main = el('div', { class: 'share-settings' });
    const adv = el('details', { class: 'share-advanced' });
    if (this.advancedOpen) adv.setAttribute('open', '');
    adv.addEventListener('toggle', () => { this.advancedOpen = adv.open; });
    adv.append(el('summary', {}, 'Advanced'));
    const advBody = el('div', { class: 'share-settings' });
    adv.append(advBody);
    const select = (into: HTMLElement, label: string, value: string, choices: [string, string][], change: (v: string) => void) => {
      const row = el('label', { class: 'share-row' });
      const input = el('select', { 'aria-label': label });
      for (const [v, t] of choices) input.append(el('option', { value: v }, t));
      input.value = value;
      input.addEventListener('change', () => { change(input.value); this.draw(); void this.summary(); });
      row.append(el('span', {}, label), input);
      into.append(row);
      return input;
    };
    const setVideo = (patch: Partial<VideoOptions>) => { this.opts = videoOptions({ ...this.opts, ...patch }); save(VIDEO_KEY, this.opts); };
    const bg3: [string, string][] = [['transparent', 'See-through'], ['white', 'White'], ['black', 'Black']];

    let movie = true;
    if (this.kind === 'video') {
      select(main, 'Background', this.opts.background, [['white', 'White'], ['black', 'Black'], ['transparent', 'See-through (WebM)']], (v) => { setVideo({ background: v as VideoOptions['background'] }); this.renderSide(); });
      select(advBody, 'Size', this.opts.size, [['720p', '720p · smaller file'], ['1080p', '1080p · full HD'], ['original', 'Original size']], (v) => setVideo({ size: v as VideoOptions['size'] }));
      select(advBody, 'Quality', this.opts.quality, [['standard', 'Standard'], ['high', 'High']], (v) => setVideo({ quality: v as VideoOptions['quality'] }));
      const file = select(advBody, 'File', this.opts.format, [['mp4', 'MP4 · plays everywhere'], ['webm', 'WebM']], (v) => setVideo({ format: v as VideoOptions['format'] }));
      if (this.opts.background === 'transparent') { file.value = 'webm'; file.disabled = true; file.title = 'See-through video is always WebM: MP4 cannot hold transparency'; }
    } else if (this.kind === 'gif') {
      const row = el('label', { class: 'share-row toggle' });
      const box = el('input', { type: 'checkbox' });
      box.checked = this.gifAlpha;
      box.addEventListener('change', () => { this.gifAlpha = box.checked; save(GIF_ALPHA_KEY, box.checked ? '1' : '0'); this.draw(); });
      row.append(box, el('span', {}, 'See-through background (hard edges)'));
      main.append(row);
      advBody.append(el('p', { class: 'hint' }, `GIF uses 256 colours, up to ${this.app.device.lite ? 320 : 480} px and 12 pictures a second. For soft see-through edges, use Animated PNG.`));
    } else if (this.kind === 'apng') {
      select(main, 'Background', this.apng.background, bg3, (v) => { this.apng = { ...this.apng, background: v as ApngOptions['background'] }; save(APNG_KEY, this.apng); });
      select(advBody, 'Size', String(this.apng.size), [['480', '480 px'], ['720', '720 px'], ['1080', '1080 px'], ['0', 'Original size']], (v) => { this.apng = { ...this.apng, size: Number(v) }; save(APNG_KEY, this.apng); });
      advBody.append(el('p', { class: 'hint' }, 'Plays in web browsers, Discord and many apps; held drawings become longer frames, so the file stays small.'));
    } else if (this.kind === 'frames') {
      select(main, 'Background', this.frames.background, [['transparent', 'See-through'], ['white', 'White']], (v) => { this.frames = { ...this.frames, background: v as FrameOpts['background'] }; save(FRAMES_KEY, this.frames); });
      const passes = el('fieldset', { class: 'share-passes' });
      passes.append(el('legend', {}, 'Passes (one folder each)'));
      for (const p of PASSES) {
        const row = el('label', { class: 'share-row toggle', title: p.hint });
        const box = el('input', { type: 'checkbox' });
        box.checked = this.frames.passes.includes(p.id);
        box.addEventListener('change', () => {
          const next = box.checked ? [...new Set([...this.frames.passes, p.id])] : this.frames.passes.filter((x) => x !== p.id);
          this.frames = { ...this.frames, passes: next.length ? next : ['combined'] };
          save(FRAMES_KEY, this.frames);
          if (!next.length) box.checked = p.id === 'combined';
        });
        row.append(box, el('span', {}, `${p.label} · ${p.hint.toLowerCase()}`));
        passes.append(row);
      }
      advBody.append(passes);
      select(advBody, 'Size', String(this.frames.scale), [['1', 'Full size'], ['0.5', 'Half'], ['0.25', 'Quarter'], ['2', 'Double']], (v) => { this.frames = { ...this.frames, scale: Number(v) }; save(FRAMES_KEY, this.frames); });
      const numRow = el('label', { class: 'share-row' });
      const num = el('input', { type: 'number', min: '0', max: '99999', step: '1', 'aria-label': 'First file number' });
      num.value = String(this.frames.start);
      num.addEventListener('change', () => { this.frames = { ...this.frames, start: Math.max(0, Math.min(99999, Math.round(Number(num.value) || 0))) }; save(FRAMES_KEY, this.frames); });
      numRow.append(el('span', {}, 'First number (1001 for VFX)'), num);
      const nameRow = el('label', { class: 'share-row' });
      const nm = el('input', { type: 'text', maxlength: '60', placeholder: sanitizeName(this.app.project.name), 'aria-label': 'File name' });
      nm.value = this.frames.name;
      nm.addEventListener('change', () => { this.frames = { ...this.frames, name: nm.value.trim() }; save(FRAMES_KEY, this.frames); });
      nameRow.append(el('span', {}, 'File name'), nm);
      advBody.append(numRow, nameRow);
    } else if (this.kind === 'picture') {
      movie = false;
      select(main, 'Background', this.picture.background, [['transparent', 'See-through'], ['white', 'White']], (v) => { this.picture = { ...this.picture, background: v as PictureOpts['background'] }; save(PICTURE_KEY, this.picture); });
      select(advBody, 'Size', String(this.picture.scale), [['1', 'Full size'], ['0.5', 'Half'], ['2', 'Double']], (v) => { this.picture = { ...this.picture, scale: Number(v) }; save(PICTURE_KEY, this.picture); });
      main.append(el('p', { class: 'hint' }, 'The frame the preview shows: move the slider under it to pick one.'));
    } else {
      movie = false;
      const text = { board: 'Panels with their captions and timing, as a PDF or panel pictures.', blender: 'The shot as an editable Blender scene: layers, drawings as images, camera and timing.', backup: 'The whole project as one .2dope file, to keep or to open on another device.' }[this.kind];
      main.append(el('p', { class: 'hint' }, text));
    }
    s.append(main);
    if (advBody.childElementCount) s.append(adv);
    if (movie) {
      const list = el('ul', { class: 'share-checks', 'aria-label': 'Checks' });
      for (const c of this.checks()) list.append(el('li', { class: c.ok ? 'ok' : 'warn' }, c.text));
      s.append(el('h3', {}, 'Check'), list);
    }
    s.append(el('p', { class: 'share-summary', 'aria-live': 'polite' }));
    s.append(el('progress', { class: 'share-progress', hidden: '', max: '1', value: '0', 'aria-label': 'Making progress' }));
    s.append(el('p', { class: 'share-status', role: 'status' }));
    const label = { video: 'Make video', gif: 'Make GIF', apng: 'Make animated PNG', frames: 'Make ZIP of frames', picture: 'Make picture', board: 'Storyboard export…', blender: 'Make Blender package', backup: 'Save project file' }[this.kind];
    const go = el('button', { type: 'button', class: 'share-go primary', disabled: '' }, label);
    go.addEventListener('click', () => void this.make());
    const foot = el('div', { class: 'share-foot' });
    foot.append(go);
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
    sum.textContent = '';
    const c = this.comp;
    try {
      if (this.kind === 'video') {
        const plan = planVideo(this.app.project, this.opts, this.maxBytes);
        sum.textContent = `${plan.width} × ${plan.height} · ${plan.options.format.toUpperCase()} · about ${fileSize(plan.estimatedBytes)}`;
        status.textContent = 'Checking this device can make it…';
        const support = await videoSupport(plan);
        if (id !== this.checkId) return;
        status.textContent = support.message;
        go.disabled = !support.codec;
      } else if (this.kind === 'gif') {
        const p = planGif(this.app.project, this.app.device.lite);
        sum.textContent = `${p.width} × ${p.height} · ${p.samples} pictures · loops forever`;
        go.disabled = false;
      } else if (this.kind === 'apng') {
        const p = planApng(this.app.project, this.apng, this.app.device.lite);
        sum.textContent = `${p.width} × ${p.height} · ${p.frames} frames · loops forever`;
        go.disabled = false;
      } else if (this.kind === 'frames') {
        const len = compLength(c, this.app.project.comps);
        sum.textContent = `${len} frames × ${this.frames.passes.length} pass${this.frames.passes.length === 1 ? '' : 'es'} · ${Math.round(c.width * this.frames.scale)} × ${Math.round(c.height * this.frames.scale)} · one ZIP`;
        go.disabled = false;
      } else if (this.kind === 'picture') {
        sum.textContent = `Frame ${this.app.frame + 1} · ${Math.round(c.width * this.picture.scale)} × ${Math.round(c.height * this.picture.scale)} PNG`;
        go.disabled = false;
      } else go.disabled = false;
    } catch (e) {
      if (id !== this.checkId) return;
      status.textContent = e instanceof Error ? e.message : String(e);
    }
  }

  private get maxBytes(): number {
    return this.app.device.lite ? VIDEO_LITE_MAX_BYTES : VIDEO_MAX_BYTES;
  }

  /** The current frame of the shot as a PNG (pinned drawings, the export compositor). */
  private async picturePng(): Promise<Blob> {
    const p = this.app.project, c = this.comp, frame = Math.min(this.app.frame, compLength(c, p.comps) - 1);
    const w = Math.max(1, Math.round(c.width * this.picture.scale)), h = Math.max(1, Math.round(c.height * this.picture.scale));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d')!;
    const pinned: Drawing[] = [];
    try {
      for (const id of frameContent(p.comps, c.id, frame).drawings) {
        const d = p.drawings.get(id);
        if (!d) continue;
        pinned.push(d);
        await this.app.residency.pin(d);
      }
      if (this.picture.background === 'white') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
      g.setTransform(this.picture.scale, 0, 0, this.picture.scale, 0, 0);
      drawComp(g, p, c.id, frame, { backgrounds: true, export: true });
      const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/png'));
      if (!blob) throw new Error('The browser could not make a PNG.');
      return blob;
    } finally {
      for (const d of pinned) this.app.residency.unpin(d);
      releaseScratch();
    }
  }

  private async make(): Promise<void> {
    if (this.abort) return;
    // the formats with their own flow
    if (this.kind === 'board') return this.hooks.board();
    if (this.kind === 'blender') return this.hooks.blender();
    if (this.kind === 'backup') return this.hooks.backup();
    if (this.app.playing) this.app.togglePlay();
    const s = this.side;
    const status = s.querySelector<HTMLElement>('.share-status')!;
    const bar = s.querySelector<HTMLProgressElement>('.share-progress')!;
    const go = s.querySelector<HTMLButtonElement>('.share-go')!;
    const controller = new AbortController();
    this.abort = controller;
    s.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>('.share-kinds button, select, input').forEach((e) => (e.disabled = true));
    go.textContent = 'Cancel';
    go.disabled = false;
    go.onclick = () => controller.abort();
    bar.hidden = false;
    bar.value = 0;
    const name = sanitizeName(this.app.project.name);
    const progress = (n: number, total: number, label: string) => { bar.max = total; bar.value = n; status.textContent = label; };
    try {
      let blob: Blob, file: string;
      if (this.kind === 'video') {
        const r = await exportVideo(this.app.project, this.opts, (p) => progress(p.done, p.total, p.label), controller.signal, this.app.residency, this.maxBytes, this.hooks.sounds);
        blob = r.blob;
        file = `${name}.${r.extension}`;
      } else if (this.kind === 'gif') {
        blob = await exportGif(this.app.project, this.app.device.lite, controller.signal, this.app.residency, (n, t) => progress(n, t, `Making GIF: ${n} of ${t}`), this.gifAlpha);
        file = `${name}.gif`;
      } else if (this.kind === 'apng') {
        blob = await exportApng(this.app.project, this.apng, this.app.device.lite, controller.signal, this.app.residency, (n, t) => progress(n, t, `Making animated PNG: ${n} of ${t}`));
        file = `${name}.png`;
      } else if (this.kind === 'frames') {
        const opts: ExportOptions = { ...DEFAULT_EXPORT, name: sanitizeName(this.frames.name || this.app.project.name), passes: this.frames.passes, scale: this.frames.scale, background: this.frames.background, range: 'all', start: this.frames.start };
        const r = await exportSequence(this.app.project, opts, [], (p) => progress(p.done, p.total, p.label ?? `Frame ${p.done} of ${p.total}`), controller.signal, this.app.residency);
        blob = new Blob([r.zip as BlobPart], { type: 'application/zip' });
        file = `${opts.name}.zip`;
      } else {
        status.textContent = 'Making the picture…';
        blob = await this.picturePng();
        file = `${name}_${String(this.app.frame + 1).padStart(4, '0')}.png`;
      }
      if (controller.signal.aborted || !this.open) return;
      this.abort = null;
      this.result(blob, file);
    } catch (e) {
      if (!this.open) return;
      const msg = controller.signal.aborted || (e instanceof DOMException && e.name === 'AbortError') ? 'Stopped. Change the settings and try again.' : `Could not make it: ${e instanceof Error ? e.message : String(e)}`;
      this.abort = null;
      this.renderSide();
      this.side.querySelector<HTMLElement>('.share-status')!.textContent = msg;
    } finally {
      this.abort = null;
    }
  }

  /** The finished file: look at it, then save it or send it. */
  private result(blob: Blob, file: string): void {
    this.releaseUrl();
    this.url = URL.createObjectURL(blob);
    const s = this.side;
    s.replaceChildren(el('h3', {}, 'Ready'));
    let media: HTMLElement;
    if (this.kind === 'video') media = el('video', { controls: '', playsinline: '', loop: '', src: this.url, class: 'share-result', 'aria-label': 'Your video' });
    else if (this.kind === 'frames') media = el('p', { class: 'share-zip' }, 'A ZIP of numbered PNG frames, one folder per pass.');
    else media = el('img', { src: this.url, class: `share-result${this.seeThrough ? ' checker' : ''}`, alt: 'Your file' });
    s.append(media, el('p', { class: 'share-summary' }, `${file} · ${fileSize(blob.size)}`));
    const foot = el('div', { class: 'share-foot' });
    foot.append(el('a', { class: 'share-save primary', href: this.url, download: file }, 'Save'));
    const type = blob.type || 'application/octet-stream';
    const asFile = new File([blob], file, { type });
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
