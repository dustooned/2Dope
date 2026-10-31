import { cueText, parseDialogue } from '../core/dialogue';
import type { App } from '../app';
import type { AudioPlayback } from '../audio';
import { paintWaveform } from './waveform';
import { soundStart, type SoundClip } from '../core/audio';
import { blockDropIndex, startOf } from '../core/timeline';
import { rulerStep } from '../core/timecode';
import { attachContextMenu, showContextMenu, swallowNextClick, HOLD_MS, type CtxItem } from './contextmenu';
import { frameMenu } from './framemenu';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

const ZOOM_KEY = '2dope.board.zoom';

type Drag =
  | { kind: 'edge'; index: number; x0: number; len0: number; len: number }
  | { kind: 'move'; index: number; x0: number; dx: number; moved: boolean; hold: number }
  | { kind: 'audio'; id: string; x0: number; dx: number; start0: number }
  | { kind: 'scrub' };

/**
 * The Board's timeline view (Storyboard Pro style): panels as blocks as long as they last, on the
 * shot's clock, with their picture, number and dialogue; the shot's audio clips underneath, so a
 * line of dialogue can be lined up with its panel. Drag a panel's right edge to retime it (ripple
 * moves everything after it, the animation too), drag a panel to reorder, drag a sound to move
 * it, tap to go there. Pinch or Ctrl + wheel zooms time.
 */
export class BoardTimeline {
  readonly root = el('div', { class: 'btl', role: 'region', 'aria-label': 'Storyboard timeline' });
  private readonly inner = el('div', { class: 'btl-inner' });
  private readonly playhead = el('div', { class: 'btl-playhead' });
  private cell: number;
  private sig = '';
  private drag: Drag | null = null;
  private audio: AudioPlayback | null = null;
  /** A sound's hold / right-click menu (settings, mute, delete), from the Audio tracks. */
  soundMenu: ((id: string) => CtxItem[] | null) | null = null;

  constructor(private readonly app: App) {
    let z = 6;
    try {
      z = Number(localStorage.getItem(ZOOM_KEY)) || 6;
    } catch {
      // default zoom
    }
    this.cell = Math.max(1, Math.min(40, z));
    this.root.append(this.inner);
    this.bind();
  }

  /** Audio comes from the shared playback (set once main has made it). */
  setAudio(a: AudioPlayback): void {
    this.audio = a;
    this.sig = '';
  }

  private zoomTo(cell: number, clientX: number): void {
    const next = Math.max(1, Math.min(40, cell));
    if (Math.abs(next - this.cell) < 0.01) return;
    const r = this.root.getBoundingClientRect();
    const frame = (this.root.scrollLeft + clientX - r.left) / this.cell;
    this.cell = next;
    try {
      localStorage.setItem(ZOOM_KEY, String(next));
    } catch {
      // not remembered
    }
    this.sig = '';
    this.update();
    this.root.scrollLeft = frame * this.cell - (clientX - r.left);
  }

  private bind(): void {
    const app = this.app;
    // pinch and Ctrl / ⌘ + wheel zoom time
    let pinch: { d: number; cell: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    this.root.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 2) {
          pinch = { d: Math.max(1, dist(e.touches)), cell: this.cell };
          this.drag = null;
        }
      },
      { passive: true },
    );
    this.root.addEventListener(
      'touchmove',
      (e) => {
        if (!pinch || e.touches.length !== 2) return;
        e.preventDefault();
        this.zoomTo((pinch.cell * dist(e.touches)) / pinch.d, (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2);
      },
      { passive: false },
    );
    this.root.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) pinch = null;
    });
    this.root.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        this.zoomTo(this.cell * Math.exp(-e.deltaY * 0.004), e.clientX);
      },
      { passive: false },
    );

    const x = (e: PointerEvent) => e.clientX - this.inner.getBoundingClientRect().left;
    this.inner.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || pinch) return;
      const t = e.target as HTMLElement;
      const b = app.board;
      if (!b) return;
      const edge = t.closest<HTMLElement>('.btl-edge');
      const panel = t.closest<HTMLElement>('.btl-panel');
      const sound = t.closest<HTMLElement>('.btl-sound');
      try {
        this.inner.setPointerCapture(e.pointerId);
      } catch {
        // stale pointer: dragging still works while over the timeline
      }
      if (edge && panel) {
        const i = Number(panel.dataset.i);
        const len = b.exposures[i]?.length ?? 1;
        this.drag = { kind: 'edge', index: i, x0: x(e), len0: len, len };
      } else if (panel) {
        const i = Number(panel.dataset.i);
        const at = { x: e.clientX, y: e.clientY };
        const hold = window.setTimeout(() => {
          const d = this.drag;
          if (!d || d.kind !== 'move' || d.moved) return;
          this.drag = null;
          if (!app.selection.includes(i)) app.goPanel(i);
          swallowNextClick();
          showContextMenu(at.x, at.y, frameMenu(app));
        }, HOLD_MS);
        this.drag = { kind: 'move', index: i, x0: x(e), dx: 0, moved: false, hold };
      } else if (sound) {
        const clip = (app.project.comp.audio ?? []).find((c) => c.id === sound.dataset.id);
        if (!clip) return;
        this.drag = { kind: 'audio', id: clip.id, x0: x(e), dx: 0, start0: soundStart(clip, app.project.comp) ?? clip.start };
      } else {
        this.drag = { kind: 'scrub' };
        app.setFrame(Math.floor(x(e) / this.cell));
      }
    });
    this.inner.addEventListener('pointermove', (e) => {
      const d = this.drag;
      const b = app.board;
      if (!d || !b) return;
      if (d.kind === 'scrub') app.setFrame(Math.max(0, Math.floor(x(e) / this.cell)));
      else if (d.kind === 'edge') {
        d.len = Math.max(1, Math.round(d.len0 + (x(e) - d.x0) / this.cell));
        const el = this.inner.querySelector<HTMLElement>(`.btl-panel[data-i="${d.index}"]`);
        if (el) el.style.width = `${d.len * this.cell - 2}px`;
        app.setEditLine({ frame: b.start + startOf(b.exposures, d.index) + d.len, edge: 'out', delta: d.len - d.len0 });
      } else if (d.kind === 'move') {
        d.dx = x(e) - d.x0;
        if (Math.abs(d.dx) > 8) d.moved = true;
        const el = this.inner.querySelector<HTMLElement>(`.btl-panel[data-i="${d.index}"]`);
        if (el && d.moved) {
          el.style.transform = `translateX(${d.dx}px)`;
          el.classList.add('dragging');
        }
      } else if (d.kind === 'audio') {
        d.dx = x(e) - d.x0;
        const el = this.inner.querySelector<HTMLElement>(`.btl-sound[data-id="${d.id}"]`);
        if (el) el.style.transform = `translateX(${Math.round(d.dx / this.cell) * this.cell}px)`;
      }
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      const d = this.drag;
      this.drag = null;
      const b = app.board;
      if (!d || !b) return;
      if (d.kind === 'edge') {
        app.setEditLine(null);
        if (!cancelled && d.len !== d.len0) app.setPanelDuration(d.index, d.len);
        else this.sig = '';
      } else if (d.kind === 'move') {
        clearTimeout(d.hold);
        if (!d.moved) {
          if (!cancelled) app.goPanel(d.index);
        } else if (!cancelled) {
          const center = startOf(b.exposures, d.index) + b.exposures[d.index]!.length / 2 + d.dx / this.cell;
          app.setSelection([d.index]);
          app.moveSelectionTo(blockDropIndex(b.exposures, [d.index], center));
        }
        this.sig = '';
      } else if (d.kind === 'audio') {
        const frames = Math.round(d.dx / this.cell);
        if (!cancelled && frames) this.moveSound(d.id, frames);
        this.sig = '';
      }
      this.update();
      void e;
    };
    this.inner.addEventListener('pointerup', (e) => end(e, false));
    this.inner.addEventListener('pointercancel', (e) => end(e, true));
  }

  /** Move an audio clip by whole frames (a linked clip keeps its panel and changes its offset). One undo step. */
  private moveSound(id: string, frames: number): void {
    const app = this.app;
    const comp = app.project.comp;
    const before = structuredClone(comp.audio ?? []);
    const after = before.map((c): SoundClip => (c.id !== id ? c : c.link ? { ...c, link: { ...c.link, offset: c.link.offset + frames } } : { ...c, start: Math.max(0, c.start + frames) }));
    const apply = (clips: SoundClip[]) => {
      const c = app.project.comps.get(comp.id);
      if (!c) return;
      c.audio = structuredClone(clips);
      app.requestRender();
      app.onFrameChange();
      app.onDocChanged();
    };
    app.history.push({ label: 'Move audio clip', do: () => apply(after), undo: () => apply(before) }, false);
  }

  update(): void {
    const app = this.app;
    const b = app.board;
    if (!b || this.root.hidden) return;
    const p = app.project;
    const clips = p.comp.audio ?? [];
    const sig = `${this.cell}|${app.timeFormat}|${b.start}|${b.exposures.map((e) => `${e.drawing}:${e.length}:${e.dialogue ?? ''}:${p.drawings.get(e.drawing)?.thumbRev ?? 0}`).join('|')}|${JSON.stringify(clips)}|${app.selection.join(',')}|${!!this.audio}`;
    if (sig !== this.sig && !this.drag) {
      this.sig = sig;
      this.rebuild();
    }
    const total = app.compEnd;
    this.playhead.style.transform = `translateX(${Math.min(app.frame, total) * this.cell}px)`;
    this.playhead.style.width = `${Math.max(2, this.cell)}px`;
    // the current panel
    const cur = app.frame - b.start;
    this.inner.querySelectorAll<HTMLElement>('.btl-panel').forEach((el) => {
      const i = Number(el.dataset.i);
      const s = startOf(b.exposures, i);
      el.classList.toggle('on', cur >= s && cur < s + (b.exposures[i]?.length ?? 0));
    });
  }

  private rebuild(): void {
    const app = this.app;
    const b = app.board!;
    const p = app.project;
    const cell = this.cell;
    const total = Math.max(app.compEnd, b.start + b.exposures.reduce((n, e) => n + e.length, 0));
    const width = Math.max(total * cell + 120, this.root.clientWidth);
    this.inner.replaceChildren();
    this.inner.style.width = `${width}px`;
    this.inner.style.setProperty('--btl-audio-height', `${Math.max(38, clips(app).length * 36 + 4)}px`);
    // ruler
    const ruler = el('div', { class: 'btl-ruler' });
    const step = Math.max(1, rulerStep(cell, p.fps, app.timeFormat));
    for (let f = 0; f <= total; f += step) {
      const n = el('span', {}, app.fmt(f));
      n.style.left = `${f * cell}px`;
      ruler.append(n);
    }
    this.inner.append(ruler);
    // panels
    const sel = new Set(app.selection);
    let at = b.start;
    b.exposures.forEach((e, i) => {
      // the dialogue lines as they read in subtitles, one after another
      const said = parseDialogue(e.dialogue).map(cueText).join(' / ');
      const blk = el('div', { class: `btl-panel${sel.has(i) ? ' selected' : ''}`, 'data-i': String(i), title: `Panel ${i + 1} · ${app.fmtDur(e.length)}${said ? ` · “${said}”` : ''}` });
      blk.style.left = `${at * cell}px`;
      blk.style.width = `${Math.max(2, e.length * cell - 2)}px`;
      const w = e.length * cell;
      const d = p.drawings.get(e.drawing);
      if (w >= 40 && d?.thumb) {
        const c = el('canvas', { class: 'btl-thumb', width: '96', height: String(Math.round((96 * p.height) / p.width)) });
        const g = c.getContext('2d');
        if (g) {
          g.fillStyle = '#ffffff';
          g.fillRect(0, 0, c.width, c.height);
          g.drawImage(d.thumb, 0, 0, c.width, c.height);
        }
        blk.append(c);
      }
      blk.append(el('span', { class: 'btl-num' }, String(i + 1)));
      if (w >= 60) blk.append(el('span', { class: 'btl-len' }, app.fmtDur(e.length)));
      if (said && w >= 50) blk.append(el('span', { class: 'btl-line' }, said));
      blk.append(el('span', { class: 'btl-edge', title: 'Drag to make this panel longer or shorter' }));
      this.inner.append(blk);
      at += e.length;
    });
    // audio, lined up on the same clock
    const lane = el('div', { class: 'btl-audio' });
    if (!clips(app).length) lane.append(el('span', { class: 'hint btl-noaudio' }, 'No audio yet: add a sound in the Audio lane below, then drag it here to line it up with a panel.'));
    for (const [index, clip] of clips(app).entries()) {
      const start = soundStart(clip, p.comp);
      if (start === null) continue;
      const len = (clip.trimOut - clip.trimIn) * p.comp.fps;
      const s = el('div', {
        class: `btl-sound${clip.muted ? ' muted' : ''}${clip.link ? ' linked' : ''}`,
        'data-id': clip.id,
        title: `${clip.name}${clip.link ? ' · follows its panel' : ''} · drag to move · hold or right-click to delete`,
      });
      attachContextMenu(s, () => this.soundMenu?.(clip.id) ?? null);
      s.style.left = `${start * cell}px`;
      s.style.top = `${4 + index * 36}px`;
      s.style.width = `${Math.max(4, len * cell)}px`;
      const c = el('canvas', { width: '400', height: '30' });
      s.append(c, el('span', { class: 'btl-sname' }, `${clip.link ? '🔗 ' : ''}${clip.name}`));
      const draw = () => {
        if (!c.isConnected || app.project !== p) return;
        const data = this.audio?.bank.waveform(clip.asset);
        if (data) paintWaveform(c, data, clip);
      };
      if (this.audio) void this.audio.bank.load(p, clip.asset).then(draw, () => {});
      lane.append(s);
    }
    this.inner.append(lane, this.playhead);
  }
}

const clips = (app: App) => app.project.comp.audio ?? [];
