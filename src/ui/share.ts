import type { App, Workspace } from '../app';
import { compLength, frameContent } from '../core/comp';
import { soundStart } from '../core/audio';
import type { Drawing } from '../core/project';
import { boardCues, toSrt } from '../core/dialogue';
import { animaticLength, animaticOptions, animaticPicture, boardOf, paintAnimatic, type AnimaticOptions } from '../io/animatic';
import { DEFAULT_APNG, exportApng, planApng, type ApngOptions } from '../io/apng';
import { exportGif, planGif } from '../io/exportgif';
import { DEFAULT_EXPORT, PASSES, sanitizeName, type ExportOptions, type Pass } from '../io/exportplan';
import { exportSequence } from '../io/exportseq';
import { exportVideo, videoSupport } from '../io/exportvideo';
import type { SoundBank } from '../io/sound';
import { planVideo, videoOptions, VIDEO_LITE_MAX_BYTES, VIDEO_MAX_BYTES, type VideoOptions } from '../io/videoplan';
import { DEFAULT_STORYBOARD, type StoryboardOptions } from '../io/storyboard';
import { storyboardPdf, storyboardPngs } from '../io/storyboardexport';
import { drawComp, releaseScratch, setExportStamp } from '../view/composite';
import { decorate } from './icons';

const VIDEO_KEY = '2dope.video-export';
const KIND_KEY = '2dope.share.kind';
const GIF_ALPHA_KEY = '2dope.gif.alpha';
const APNG_KEY = '2dope.share.apng';
const FRAMES_KEY = '2dope.share.frames';
const PICTURE_KEY = '2dope.share.picture';
const STAMP_KEY = '2dope.share.stamp';
const ANIMATIC_KEY = '2dope.share.animatic';
/** The storyboard sheet settings (the key the Story export dialog used, so earlier choices carry over). */
const BOARD_KEY = '2dope.board.export';

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

export type ShareKind = 'video' | 'animatic' | 'gif' | 'apng' | 'frames' | 'picture' | 'board' | 'blender' | 'backup';
type Kind = ShareKind;
const KINDS: { id: Kind; label: string; hint: string; icon: string }[] = [
  { id: 'video', label: 'Video', hint: 'MP4 or WebM, with sound', icon: 'play' },
  { id: 'animatic', label: 'Animatic', hint: 'board panels on their timing, with sound', icon: 'board' },
  { id: 'gif', label: 'GIF', hint: 'looping, plays anywhere', icon: 'flipbook' },
  { id: 'apng', label: 'Animated PNG', hint: 'looping, see-through, full colour', icon: 'layers' },
  { id: 'frames', label: 'PNG frames', hint: 'a ZIP of numbered pictures', icon: 'copy' },
  { id: 'picture', label: 'Picture', hint: 'this frame as a PNG', icon: 'gallery' },
  { id: 'board', label: 'Storyboard', hint: 'PDF sheets or panel images', icon: 'board' },
  { id: 'blender', label: 'Blender', hint: 'an editable scene package', icon: 'motion' },
  { id: 'backup', label: 'Project file', hint: 'a .2dope backup to keep', icon: 'export' },
];

interface FrameOpts { passes: Pass[]; scale: number; background: 'transparent' | 'white'; start: number; name: string }
interface PictureOpts { scale: number; background: 'transparent' | 'white' }
interface BoardOpts extends StoryboardOptions { format: 'pdf' | 'png' }

function boardOpts(raw: unknown): BoardOpts {
  const r = raw && typeof raw === 'object' ? (raw as Partial<BoardOpts>) : {};
  return {
    format: r.format === 'png' ? 'png' : 'pdf',
    paper: r.paper === 'a4' ? 'a4' : DEFAULT_STORYBOARD.paper,
    perPage: r.perPage === 2 || r.perPage === 6 ? r.perPage : 4,
    captions: r.captions !== false,
    picture: r.picture === 'shot' ? 'shot' : 'board',
  };
}

export interface ShareHooks {
  sounds: SoundBank;
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
  /** The assignment label (burned into video, GIF, animated PNG and pictures when on). */
  private stamp: { on: boolean; name: string; klass: string } = load(STAMP_KEY, { on: false, name: '', klass: '' });
  private get stampText(): string | null {
    const s = this.stamp;
    if (!s.on || !(s.name.trim() || s.klass.trim())) return null;
    const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    return [s.name.trim(), s.klass.trim(), date].filter(Boolean).join(' \u00b7 ');
  }
  private frames: FrameOpts = load(FRAMES_KEY, { passes: ['combined'] as Pass[], scale: 1, background: 'transparent' as const, start: 1, name: '' });
  private picture: PictureOpts = load(PICTURE_KEY, { scale: 1, background: 'transparent' as const });
  /** One set of animatic and storyboard choices, whichever mode Share was opened from. */
  private animatic: AnimaticOptions = (() => { try { return animaticOptions(JSON.parse(localStorage.getItem(ANIMATIC_KEY) ?? 'null')); } catch { return animaticOptions(null); } })();
  private sheets: BoardOpts = (() => { try { return boardOpts(JSON.parse(localStorage.getItem(BOARD_KEY) ?? 'null')); } catch { return boardOpts(null); } })();
  private extraUrl: string | null = null;
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

  /** The format picked last (Story opens on its own formats: Storyboard or Animatic). */
  get lastKind(): ShareKind {
    return this.kind;
  }

  show(kind?: ShareKind): void {
    if (this.open || this.app.strokeActive) return;
    if (kind && kind !== this.kind) { this.kind = kind; save(KIND_KEY, kind); }
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
    if (this.extraUrl) URL.revokeObjectURL(this.extraUrl);
    this.url = this.extraUrl = null;
  }

  /** The shot's storyboard (the main comp's guide layer), or null. */
  private get board() {
    return boardOf(this.comp);
  }

  /** The animatic's video settings: the Video choices, never see-through (the panels sit on paper). */
  private get animaticVideo(): VideoOptions {
    return videoOptions({ ...this.opts, background: this.opts.background === 'transparent' ? 'white' : this.opts.background });
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
      const black = ((this.kind === 'video' || this.kind === 'animatic') && this.opts.background === 'black') || (this.kind === 'apng' && this.apng.background === 'black');
      g.fillStyle = black ? '#000' : '#fff';
      g.fillRect(0, 0, w, h);
    }
    g.setTransform(w / c.width, 0, 0, h / c.height, 0, 0);
    const stamped = this.kind === 'video' || this.kind === 'animatic' || this.kind === 'gif' || this.kind === 'apng' || this.kind === 'picture';
    setExportStamp(stamped ? this.stampText : null);
    const board = this.board;
    try {
      if ((this.kind === 'animatic' || this.kind === 'board') && board) {
        // what the animatic (or a sheet's picture) shows at this frame, subtitles included
        g.setTransform(1, 0, 0, 1, 0, 0);
        const o = this.kind === 'animatic' ? this.animatic : { picture: this.sheets.picture, burn: false, srt: false };
        const frame = Math.min(this.app.frame, Math.max(0, animaticLength(board) - 1));
        paintAnimatic(g, this.app.project, c, board, frame, o, boardCues(board.exposures, board.start), w, h);
        return;
      }
      drawComp(g, this.app.project, c.id, Math.min(this.app.frame, compLength(c, this.app.project.comps) - 1), { camera: true, export: true });
    } finally {
      setExportStamp(null);
    }
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
    const board = this.board;
    const clips = c.audio ?? [];
    if (this.kind === 'animatic') {
      out.length = 0;
      if (!board) return [{ ok: false, text: 'No storyboard yet: add panels in Story first' }];
      const n = board.exposures.length, end = animaticLength(board);
      out.push({ ok: true, text: `${n} panel${n === 1 ? '' : 's'} · ${(end / c.fps).toFixed(1)} seconds at ${c.fps} fps` });
      const cues = boardCues(board.exposures, board.start);
      const said = new Set(cues.map((q) => q.panel)).size;
      out.push(cues.length ? { ok: true, text: `${cues.length} subtitle line${cues.length === 1 ? '' : 's'} on ${said} of ${n} panels` } : { ok: false, text: 'No dialogue lines yet: type them on the Story cards' });
      if (end < len) out.push({ ok: true, text: `It ends with the last panel (the shot runs ${((len - end) / c.fps).toFixed(1)} s longer)` });
    } else if (board) out.push({ ok: true, text: board.guideExport ? 'The storyboard is included' : 'The storyboard stays out (it is a guide)' });
    if (this.kind === 'video' || this.kind === 'animatic') {
      const muted = clips.filter((s) => s.muted);
      if (muted.length) out.push({ ok: false, text: `Muted sound: ${muted.map((s) => s.name).join(', ')}` });
      const late = clips.filter((s) => { const st = soundStart(s, c); return st !== null && st + (s.trimOut - s.trimIn) * c.fps > len + 1; });
      if (late.length) out.push({ ok: false, text: `Sound runs past the end and is cut: ${late.map((s) => s.name).join(', ')}` });
      if (!clips.length) out.push({ ok: true, text: 'No sound' });
      if (this.kind === 'video' && this.opts.background === 'transparent') out.push({ ok: true, text: 'See-through video is WebM: it plays in browsers and video editors; for Photos use a background' });
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
    } else if (this.kind === 'animatic') {
      const setAnim = (patch: Partial<AnimaticOptions>) => { this.animatic = animaticOptions({ ...this.animatic, ...patch }); save(ANIMATIC_KEY, this.animatic); };
      if (!this.board) main.append(el('p', { class: 'hint' }, 'An animatic plays the storyboard panels on their timing. Make some panels in Story first.'));
      select(main, 'Picture', this.animatic.picture, [['board', 'Board panels'], ['shot', 'Board + animation']], (v) => setAnim({ picture: v as AnimaticOptions['picture'] }));
      const subs = el('fieldset', { class: 'share-passes share-subtitles' });
      subs.append(el('legend', {}, 'Subtitles (the dialogue lines)'));
      for (const [key, text] of [['burn', 'Burn into the picture'], ['srt', 'Also save a subtitle file (.srt)']] as const) {
        const row = el('label', { class: 'share-row toggle' });
        const box = el('input', { type: 'checkbox', 'data-sub': key });
        box.checked = this.animatic[key];
        box.addEventListener('change', () => { setAnim({ [key]: box.checked }); this.draw(); });
        row.append(box, el('span', {}, text));
        subs.append(row);
      }
      main.append(subs);
      select(advBody, 'Background', this.animaticVideo.background, [['white', 'White'], ['black', 'Black']], (v) => setVideo({ background: v as VideoOptions['background'] }));
      select(advBody, 'Size', this.opts.size, [['720p', '720p · smaller file'], ['1080p', '1080p · full HD'], ['original', 'Original size']], (v) => setVideo({ size: v as VideoOptions['size'] }));
      select(advBody, 'File', this.animaticVideo.format, [['mp4', 'MP4 · plays everywhere'], ['webm', 'WebM']], (v) => setVideo({ format: v as VideoOptions['format'] }));
      advBody.append(el('p', { class: 'hint' }, 'Size, file and background are the Video settings: changing them here changes them there too.'));
    } else if (this.kind === 'board') {
      movie = false;
      const setSheets = (patch: Partial<BoardOpts>) => { this.sheets = boardOpts({ ...this.sheets, ...patch }); save(BOARD_KEY, this.sheets); };
      if (!this.board) main.append(el('p', { class: 'hint' }, 'No storyboard yet. Make some panels in Story first.'));
      select(main, 'Format', this.sheets.format, [['pdf', 'PDF sheets'], ['png', 'Panel PNGs + captions (ZIP)']], (v) => { setSheets({ format: v as BoardOpts['format'] }); this.renderSide(); });
      select(main, 'Picture', this.sheets.picture, [['board', 'Board drawing'], ['shot', 'Board + animation']], (v) => setSheets({ picture: v as BoardOpts['picture'] }));
      if (this.sheets.format === 'pdf') {
        select(advBody, 'Layout', String(this.sheets.perPage), [['2', '2 per page, captions beside'], ['4', '4 per page'], ['6', '6 per page']], (v) => setSheets({ perPage: Number(v) as BoardOpts['perPage'] }));
        select(advBody, 'Paper', this.sheets.paper, [['letter', 'Letter, landscape'], ['a4', 'A4, landscape']], (v) => setSheets({ paper: v as BoardOpts['paper'] }));
        const row = el('label', { class: 'share-row toggle' });
        const box = el('input', { type: 'checkbox', 'data-captions': '' });
        box.checked = this.sheets.captions;
        box.addEventListener('change', () => setSheets({ captions: box.checked }));
        row.append(box, el('span', {}, 'Captions: shot, camera, dialogue lines, action, timing, notes'));
        main.append(row);
      } else main.append(el('p', { class: 'hint' }, 'Each panel as a PNG, captions.csv for a spreadsheet and, when panels have dialogue, subtitles.srt on the panel timing.'));
    } else {
      movie = false;
      const text = { blender: 'The shot as an editable Blender scene: layers, drawings as images, camera and timing.', backup: 'The whole project as one .2dope file, to keep or to open on another device.' }[this.kind];
      main.append(el('p', { class: 'hint' }, text));
    }
    const board = this.board;
    if (board && (this.kind === 'video' || this.kind === 'gif' || this.kind === 'apng' || this.kind === 'frames' || this.kind === 'picture')) {
      // one project setting (an undo step), so Motion, Blender and every final render follow it
      const row = el('label', { class: 'share-row toggle' });
      const box = el('input', { type: 'checkbox', 'data-include-board': '' });
      box.checked = !!board.guideExport;
      box.addEventListener('change', () => { this.app.setBoardExport(box.checked); this.renderSide(); this.draw(); });
      row.append(box, el('span', {}, 'Put the storyboard in it (for every export, not just this one)'));
      main.append(row);
    }
    if (this.kind === 'video' || this.kind === 'animatic' || this.kind === 'gif' || this.kind === 'apng' || this.kind === 'picture') {
      // for handing in: the student's name, class and the date, burned into the corner
      const box = el('fieldset', { class: 'share-stamp' });
      box.append(el('legend', {}, 'Hand in'));
      const on = el('label', { class: 'share-row toggle' });
      const tick = el('input', { type: 'checkbox' });
      tick.checked = this.stamp.on;
      on.append(tick, el('span', {}, 'Put my name, class and the date in the corner'));
      const field = (label: string, key: 'name' | 'klass', hint: string) => {
        const row = el('label', { class: 'share-row' });
        const input = el('input', { type: 'text', maxlength: '50', placeholder: hint, 'aria-label': label });
        input.value = this.stamp[key];
        input.addEventListener('input', () => { this.stamp = { ...this.stamp, [key]: input.value }; save(STAMP_KEY, this.stamp); this.draw(); });
        input.addEventListener('keydown', (k) => k.stopPropagation());
        row.append(el('span', {}, label), input);
        return row;
      };
      const name = field('Name', 'name', 'Your name');
      const klass = field('Class', 'klass', 'Class or assignment');
      const sync = () => { name.hidden = klass.hidden = !this.stamp.on; };
      tick.addEventListener('change', () => { this.stamp = { ...this.stamp, on: tick.checked }; save(STAMP_KEY, this.stamp); sync(); this.draw(); });
      sync();
      box.append(on, name, klass);
      main.append(box);
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
    const label = { video: 'Make video', animatic: 'Make animatic', gif: 'Make GIF', apng: 'Make animated PNG', frames: 'Make ZIP of frames', picture: 'Make picture', board: this.sheets.format === 'pdf' ? 'Make storyboard PDF' : 'Make panel ZIP', blender: 'Make Blender package', backup: 'Save project file' }[this.kind];
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
      if (this.kind === 'video' || this.kind === 'animatic') {
        const anim = this.kind === 'animatic';
        const board = this.board;
        if (anim && !board) return;
        const plan = planVideo(this.app.project, anim ? this.animaticVideo : this.opts, this.maxBytes, anim && board ? animaticLength(board) : undefined);
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
      } else if (this.kind === 'board') {
        const board = this.board;
        if (!board) return;
        const n = board.exposures.length, pages = Math.ceil(n / this.sheets.perPage);
        sum.textContent = this.sheets.format === 'pdf' ? `${n} panel${n === 1 ? '' : 's'} on ${pages} page${pages === 1 ? '' : 's'}` : `${n} PNG${n === 1 ? '' : 's'} at ${this.app.project.width} × ${this.app.project.height} and captions.csv, in a ZIP`;
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
    // the hand-in label goes on what you watch (not on PNG frames: those are for compositing)
    if (this.kind === 'video' || this.kind === 'animatic' || this.kind === 'gif' || this.kind === 'apng' || this.kind === 'picture') setExportStamp(this.stampText);
    let extra: { blob: Blob; file: string } | undefined;
    try {
      let blob: Blob, file: string;
      if (this.kind === 'animatic') {
        const pic = animaticPicture(this.app.project, this.animatic);
        const r = await exportVideo(this.app.project, this.animaticVideo, (p) => progress(p.done, p.total, p.label), controller.signal, this.app.residency, this.maxBytes, this.hooks.sounds, pic);
        blob = r.blob;
        file = `${name}-animatic.${r.extension}`;
        const board = this.board!;
        const cues = boardCues(board.exposures, board.start);
        if (this.animatic.srt && cues.length) extra = { blob: new Blob([toSrt(cues, this.comp.fps)], { type: 'application/x-subrip' }), file: `${name}-animatic.srt` };
      } else if (this.kind === 'board') {
        const board = this.board;
        if (!board) throw new Error('There is no storyboard yet. Make some panels in Story first.');
        const ctx = {
          project: this.app.project, board, compId: this.comp.id,
          fmt: (f: number) => this.app.fmt(f), fmtDur: (n: number) => this.app.fmtDur(n),
          hold: this.app.residency, signal: controller.signal,
          onProgress: (n: number, t: number) => progress(n, t, `Panel ${n} of ${t}`),
        };
        if (this.sheets.format === 'pdf') {
          const r = await storyboardPdf(ctx, this.sheets, this.app.project.name);
          blob = new Blob([r.pdf as BlobPart], { type: 'application/pdf' });
          file = `${name}-storyboard.pdf`;
        } else {
          const r = await storyboardPngs(ctx, this.sheets, name);
          blob = new Blob([r.zip as BlobPart], { type: 'application/zip' });
          file = `${name}-storyboard.zip`;
        }
      } else if (this.kind === 'video') {
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
      this.result(blob, file, extra);
    } catch (e) {
      if (!this.open) return;
      const msg = controller.signal.aborted || (e instanceof DOMException && e.name === 'AbortError') ? 'Stopped. Change the settings and try again.' : `Could not make it: ${e instanceof Error ? e.message : String(e)}`;
      this.abort = null;
      this.renderSide();
      this.side.querySelector<HTMLElement>('.share-status')!.textContent = msg;
    } finally {
      this.abort = null;
      setExportStamp(null);
    }
  }

  /** The finished file: look at it, then save it or send it. */
  private result(blob: Blob, file: string, extra?: { blob: Blob; file: string }): void {
    this.releaseUrl();
    this.url = URL.createObjectURL(blob);
    const s = this.side;
    s.replaceChildren(el('h3', {}, 'Ready'));
    let media: HTMLElement;
    if (this.kind === 'board') media = el('p', { class: 'share-zip' }, this.sheets.format === 'pdf' ? 'Storyboard sheets: each panel with its number, timing, picture and captions.' : 'A ZIP of panel PNGs with captions.csv (and subtitles.srt when panels have dialogue).');
    else if (this.kind === 'video' || this.kind === 'animatic') media = el('video', { controls: '', playsinline: '', loop: '', src: this.url, class: 'share-result', 'aria-label': 'Your video' });
    else if (this.kind === 'frames') media = el('p', { class: 'share-zip' }, 'A ZIP of numbered PNG frames, one folder per pass.');
    else media = el('img', { src: this.url, class: `share-result${this.seeThrough ? ' checker' : ''}`, alt: 'Your file' });
    s.append(media, el('p', { class: 'share-summary' }, `${file} · ${fileSize(blob.size)}`));
    const foot = el('div', { class: 'share-foot' });
    foot.append(el('a', { class: 'share-save primary', href: this.url, download: file }, 'Save'));
    if (extra) {
      this.extraUrl = URL.createObjectURL(extra.blob);
      foot.append(el('a', { class: 'share-save-subs', href: this.extraUrl, download: extra.file, title: 'The dialogue lines as subtitles, timed to the panels' }, 'Save subtitles (.srt)'));
    }
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
