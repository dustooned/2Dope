import type { App } from '../app';
import type { BlendMode, DrawingsLayer } from '../core/comp';
import { attachContextMenu, HOLD_MS, showContextMenu, swallowNextClick, type CtxItem } from './contextmenu';
import { askText, confirmBox } from './dialogs';
import { frameMenu } from './framemenu';
import { decorate } from './icons';

/** Draw's bottom view: 'flipbook' (the default) or 'timeline'. (The old Flip mode's key is not read.) */
const KEY = '2dope.draw.view';
/** The mini flipbook: floating (with where it was), or docked at the bottom. */
const MINI_KEY = '2dope.flip.mini';
/** One frame of time on the strip, and one track row (Procreate Dreams shows three at a time). */
const CELL = 44;
const ROW = 50;
const LABEL = 46;
/** Track colours (the same tags as Motion and the rails), and how they read in a menu. */
const TAGS = ['#9a9aa8', '#ff5a8a', '#ffd24a', '#4aa3ff', '#4ade80', '#c084fc', '#fb923c'];
const TAG_DOTS = ['\u26aa', '\ud83d\udd34', '\ud83d\udfe1', '\ud83d\udd35', '\ud83d\udfe2', '\ud83d\udfe3', '\ud83d\udfe0'];
const BLENDS: [BlendMode, string][] = [['normal', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['add', 'Add']];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

/**
 * Draw's flipbook (Procreate Dreams' Draw & Paint with its Flipbook): under the canvas a strip shows
 * every frame of time for up to three tracks (the shot's drawing layers, front first), with held
 * drawings spanning their frames. Swipe the strip to move through time, tap a frame to go there,
 * tap it again (or press and hold) for its options, and drag the handle on the current frame to
 * make it hold longer. + Frame adds a page after this frame (on a held drawing it ends the hold
 * here; hold the button to add after the whole hold). It is Draw's default view; Timeline swaps in
 * the traditional strip, and the Focus level always shows the flipbook. Everything edits the same
 * layers and timing that Timing and Motion show.
 */
export class FlipMode {
  readonly row = el('div', { class: 'flip-row', role: 'region', 'aria-label': 'Flipbook' });
  on = false;
  private sig = '';
  onChange: () => void = () => {};
  // the header's buttons stay the same elements while playing, so a tap on Pause is never lost
  private readonly head = el('div', { class: 'flip-head', role: 'toolbar', 'aria-label': 'Flipbook controls' });
  private readonly play = el('button', { type: 'button', class: 'flip-btn' });
  private readonly count = el('span', { class: 'flip-count', 'aria-live': 'off' });
  private readonly scroll = el('div', { class: 'flip-scroll' });
  private readonly grid = el('div', { class: 'flip-grid' });
  private readonly playhead = el('div', { class: 'flip-playhead', 'aria-hidden': 'true' });
  private playing: boolean | null = null;
  /** Floating mini flipbook (its top-left in the stage), or null when docked at the bottom. */
  private mini: { x: number; y: number } | null = null;
  /** Set while a swipe or trim is under way: the strip does not scroll itself then. */
  private dragging = false;
  private dragged = false;

  constructor(private readonly app: App, stage: HTMLElement) {
    const btn = (label: string, title: string, icon: string, run: () => void, hold?: () => void, cls = 'flip-btn', show = label) => {
      const b = el('button', { type: 'button', class: cls, title, 'aria-label': label }, show);
      decorate(b, icon);
      let timer = 0, held = false;
      if (hold) {
        b.addEventListener('pointerdown', () => { held = false; clearTimeout(timer); timer = window.setTimeout(() => { held = true; hold(); }, HOLD_MS); });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearTimeout(timer));
      }
      b.addEventListener('click', () => { if (held) { held = false; return; } run(); });
      return b;
    };
    const done = btn('Timeline', 'Show the timeline under the canvas instead (tracks, ruler, holds)', 'time', () => this.set(false), undefined, 'flip-btn flip-adv flip-view');
    this.play.addEventListener('click', () => this.app.togglePlay());
    const prev = btn('Previous drawing', 'Previous drawing (hold: the first frame)', 'prev', () => this.app.prevDrawing(), () => this.app.setLayerFrame(0), 'flip-btn flip-icon', '');
    const next = btn('Next drawing', 'Next drawing (hold: the last frame)', 'next', () => this.app.nextDrawing(), () => this.app.setLayerFrame(this.app.project.length - 1), 'flip-btn flip-icon', '');
    const add = btn('Frame', 'Add a frame after this one. On a held drawing the hold ends here; hold the button to add after the whole hold.', 'plus', () => this.app.flipAddFrame(false), () => this.app.flipAddFrame(true), 'flip-btn flip-add');
    const track = btn('Track', 'Add a track right above this one, from frame 1 (drag a track\u2019s box up or down to reorder)', 'layers', () => this.app.addFlipTrack(), undefined, 'flip-btn flip-adv');
    const onion = btn('Onion', 'Onion skin: see the drawings before and after faintly', 'onion', () => this.app.toggleOnion());
    onion.classList.add('flip-onion');
    const fit = btn('Fit', 'Fit the page to the screen', 'fit', () => this.app.fit(), undefined, 'flip-btn flip-icon flip-adv', '');
    this.head.append(this.play, prev, this.count, next, add, onion, track, fit, done);
    this.grid.append(this.playhead);
    this.scroll.append(this.grid);
    // the handle (Procreate Dreams): drag it up to float a mini flipbook, back down to dock it
    const handle = el('div', { class: 'flip-handle', role: 'button', tabindex: '0', title: 'Drag up to float a mini flipbook anywhere; drag it to the bottom (or double-tap) to dock it', 'aria-label': 'Flipbook handle' });
    handle.append(el('span', { class: 'flip-handle-bar', 'aria-hidden': 'true' }));
    this.row.append(handle, this.head, this.scroll);
    stage.append(this.row);
    this.wireStrip();
    this.wireHandle(handle, stage);
    try { const m = JSON.parse(localStorage.getItem(MINI_KEY) ?? 'null'); if (m && Number.isFinite(m.x)) this.mini = m; } catch { /* docked */ }
    // the flipbook is Draw's view unless you picked the timeline
    try { this.on = localStorage.getItem(KEY) !== 'timeline'; } catch { /* default */ }
    this.update();
  }

  /** Draw's bottom view: the flipbook (true) or the timeline. */
  set(on: boolean): void {
    this.on = on;
    try { localStorage.setItem(KEY, on ? 'flipbook' : 'timeline'); } catch { /* optional */ }
    // seeing the last drawing faintly is what makes drawing the next one easy
    if (on && !this.app.onion.enabled) this.app.toggleOnion();
    this.sig = '';
    this.update();
    this.onChange();
  }

  /** The flipbook shows in Draw when it is the chosen view, and always at the Focus level. */
  private get shown(): boolean {
    const b = document.body.classList;
    return this.app.workspace === 'draw' && !b.contains('quick') && (this.on || b.contains('ui-clean'));
  }

  /** The tracks: the shot's drawing layers (not guides), front first. */
  private tracks(): DrawingsLayer[] {
    return this.app.drawLayers().filter((l) => !l.guide);
  }

  update(): void {
    const app = this.app;
    const shown = this.shown;
    if (document.body.classList.contains('flipmode') !== shown) {
      document.body.classList.toggle('flipmode', shown);
      this.sig = '';
      // the page fits above (or back below) the flipbook
      setTimeout(() => this.onChange(), 0);
    }
    const active = shown && !app.uiHidden;
    this.row.hidden = !active;
    if (!active) return;
    if (this.playing !== app.playing) {
      this.playing = app.playing;
      this.play.textContent = app.playing ? 'Pause' : 'Play';
      decorate(this.play, app.playing ? 'pause' : 'play');
      this.play.title = app.playing ? 'Pause' : 'Play your drawings (loops)';
      this.play.setAttribute('aria-label', this.play.title);
      this.play.setAttribute('aria-pressed', String(app.playing));
    }
    this.head.querySelector('.flip-onion')?.setAttribute('aria-pressed', String(app.onion.enabled));
    const p = app.project;
    const tracks = this.tracks();
    const len = Math.max(1, app.compEnd);
    const sig = `${len}|${p.activeLayer}|${app.editingMask}|` + tracks.map((l) => `${l.id}:${l.visible}:${l.start}:${l.name}:${l.label ?? 0}:${l.clip ? 1 : 0}:${l.mask ?? ''}:${l.blend}:` + l.exposures.map((e) => `${e.drawing}.${e.length}.${p.drawing(e.drawing).thumbRev}`).join(',')).join('/');
    // mid-drag the strip is not rebuilt: that would pull the handle out from under the finger
    if (sig !== this.sig && !this.dragging) {
      this.sig = sig;
      this.build(tracks, len);
    }
    this.mark(len);
  }

  /** The strip: one row per track, each drawing a cell as wide as it is held. */
  private build(tracks: DrawingsLayer[], len: number): void {
    const app = this.app;
    const p = app.project;
    this.grid.replaceChildren(this.playhead);
    this.grid.style.width = `${LABEL + len * CELL + CELL}px`;
    // a ruler: frame numbers every frame, seconds stand out
    const ruler = el('div', { class: 'flip-ruler', 'aria-hidden': 'true' });
    const fps = app.project.fps || 24;
    for (let f = 0; f < len; f++) {
      const t = el('span', { class: f % fps === 0 ? 'sec' : '' }, String(f + 1));
      t.style.left = `${LABEL + f * CELL}px`;
      ruler.append(t);
    }
    this.grid.append(ruler);
    for (const l of tracks) {
      const row = el('div', { class: `flip-track${l.id === p.activeLayer ? ' active' : ''}${l.visible ? '' : ' off'}`, 'data-id': l.id });
      const eye = el('button', { type: 'button', class: 'flip-eye', 'aria-pressed': String(l.visible), title: `${l.name}: tap to ${l.visible ? 'hide' : 'show'}, hold for track options`, 'aria-label': `${l.visible ? 'Hide' : 'Show'} ${l.name}` });
      if (l.label) eye.style.setProperty('--tag', TAGS[l.label % TAGS.length]!);
      if (l.clip) row.classList.add('clip');
      if (l.mask) row.classList.add('masked');
      eye.append(el('span', { class: 'flip-check', 'aria-hidden': 'true' }, l.visible ? '✓' : ''), el('span', { class: 'flip-name' }, l.name));
      eye.addEventListener('click', () => { if (this.dragged) { this.dragged = false; return; } app.editor.setFlag(l.id, 'visible', !l.visible); });
      this.wireTrackDrag(eye, row, l.id);
      attachContextMenu(eye, () => this.trackMenu(l, eye));
      const cells = el('div', { class: 'flip-cells' });
      let start = l.start;
      l.exposures.forEach((e, i) => {
        const c = el('div', { class: 'flip-cel', 'data-i': String(i), 'data-start': String(start), 'data-len': String(e.length) });
        c.style.left = `${start * CELL}px`;
        c.style.width = `${e.length * CELL - 3}px`;
        const d = p.drawing(e.drawing);
        const t = d.thumb;
        if (t) {
          const cv = el('canvas', { width: '80', height: '60' });
          const g = cv.getContext('2d');
          if (g) {
            g.fillStyle = '#fff'; g.fillRect(0, 0, 80, 60);
            const s = Math.min(80 / t.width, 60 / t.height);
            g.drawImage(t, (80 - t.width * s) / 2, (60 - t.height * s) / 2, t.width * s, t.height * s);
          }
          c.append(cv);
        } else c.classList.add('empty');
        if (e.length > 1) c.append(el('span', { class: 'flip-hold' }, `×${e.length}`));
        if (d.role === 'key') c.append(el('span', { class: 'flip-role', title: 'Key drawing' }, '🔑'));
        cells.append(c);
        start += e.length;
      });
      row.append(eye, cells);
      this.grid.append(row);
    }
    // the strip shows three tracks at a time (the rest scroll); the mini one shows the track you draw on
    this.scroll.style.maxHeight = this.mini ? `${22 + ROW + 2}px` : `${22 + Math.min(3, Math.max(1, tracks.length)) * ROW + 2}px`;
    this.placeMini();
    // the page fits above the docked panel (a floating one leaves the page its full height)
    requestAnimationFrame(() => {
      const h = this.row.offsetHeight;
      const stage = this.row.parentElement;
      if (stage) stage.style.setProperty('--flip-h', this.mini ? '0px' : `${h + 16}px`);
      this.app.refit();
    });
  }

  /** Float (at a place in the stage) or dock the flipbook. */
  private setMini(m: { x: number; y: number } | null): void {
    this.mini = m;
    try { localStorage.setItem(MINI_KEY, JSON.stringify(m)); } catch { /* optional */ }
    this.sig = '';
    this.update();
  }

  private placeMini(): void {
    const r = this.row;
    r.classList.toggle('mini', !!this.mini);
    if (!this.mini) { r.style.left = r.style.top = ''; return; }
    const stage = r.parentElement;
    const sw = stage?.clientWidth ?? window.innerWidth, sh = stage?.clientHeight ?? window.innerHeight;
    const w = Math.min(380, sw - 16);
    const x = Math.max(8, Math.min(sw - w - 8, this.mini.x)), y = Math.max(8, Math.min(sh - 140, this.mini.y));
    r.style.left = `${x}px`;
    r.style.top = `${y}px`;
  }

  private wireHandle(handle: HTMLElement, stage: HTMLElement): void {
    let last = 0;
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const now = performance.now();
      // double-tap: dock it (or float it where it is)
      if (now - last < 350) {
        last = 0;
        const r = this.row.getBoundingClientRect(), s = stage.getBoundingClientRect();
        this.setMini(this.mini ? null : { x: r.left - s.left + 40, y: r.top - s.top - 160 });
        return;
      }
      last = now;
      const s = stage.getBoundingClientRect();
      const r0 = this.row.getBoundingClientRect();
      const dx = e.clientX - r0.left, dy = e.clientY - r0.top;
      handle.setPointerCapture(e.pointerId);
      let moved = false;
      const move = (ev: PointerEvent) => {
        const x = ev.clientX - s.left - dx, y = ev.clientY - s.top - dy;
        if (!this.mini) {
          // undock once it is pulled clearly up
          if (r0.top - ev.clientY + dy < 40 && !moved) return;
          moved = true;
          this.mini = { x, y };
          this.sig = '';
          this.update();
        } else {
          moved = true;
          this.mini = { x, y };
          this.placeMini();
        }
      };
      const up = (ev: PointerEvent) => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        if (!moved) return;
        // dropped near the bottom: dock it again
        const docked = ev.clientY > s.bottom - 70;
        this.setMini(docked ? null : this.mini);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
    handle.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.setMini(this.mini ? null : { x: 40, y: 80 }); } });
  }

  /** Per frame: the playhead, the current cells and the counter (no rebuild while playing). */
  private mark(len: number): void {
    const app = this.app;
    const f = app.frame;
    this.count.textContent = `${Math.min(f + 1, len)} / ${len}`;
    this.playhead.style.left = `${LABEL + f * CELL}px`;
    const activeId = app.project.activeLayer;
    for (const row of this.grid.querySelectorAll<HTMLElement>('.flip-track')) {
      const mine = row.dataset.id === activeId;
      for (const c of row.querySelectorAll<HTMLElement>('.flip-cel')) {
        const s = Number(c.dataset.start), n = Number(c.dataset.len);
        const here = f >= s && f < s + n;
        c.classList.toggle('on', here && mine && !app.blankPage);
        c.classList.toggle('here', here && !mine);
        const trim = c.querySelector('.flip-trim');
        if (here && mine && !app.playing) { if (!trim) c.append(this.trimHandle(c)); }
        else trim?.remove();
      }
    }
    if (!this.dragging) {
      // keep the playhead in view (centred while playing, nearest otherwise)
      const x = LABEL + f * CELL, w = this.scroll.clientWidth;
      const left = this.scroll.scrollLeft;
      if (app.playing || x < left + LABEL + CELL || x > left + w - CELL * 2) this.scroll.scrollLeft = Math.max(0, x - w / 2);
    }
  }

  /** The frame under a point of the strip, and its track. */
  private hit(x: number, y: number): { layer: DrawingsLayer; frame: number } | null {
    const rowEl = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('.flip-track');
    const layer = rowEl ? this.tracks().find((l) => l.id === rowEl.dataset.id) : undefined;
    if (!rowEl || !layer) return null;
    const r = this.grid.getBoundingClientRect();
    const frame = Math.max(0, Math.min(this.app.compEnd - 1, Math.floor((x - r.left - LABEL) / CELL)));
    return { layer, frame };
  }

  /** Go to a frame of a track (drawing on that track from now on). */
  private go(layer: DrawingsLayer, frame: number): void {
    const app = this.app;
    if (app.playing) app.togglePlay();
    if (layer.id !== app.project.activeLayer) app.pickLayer(layer.id);
    app.setFrame(frame);
  }

  private wireStrip(): void {
    const s = this.scroll;
    let start: { x: number; y: number; id: number; frame: number; mode: '' | 'scrub' | 'scroll' } | null = null;
    s.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.flip-eye, .flip-trim') || !e.isPrimary || e.button > 0) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, frame: this.app.frame, mode: '' };
      this.dragged = false;
    });
    s.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.mode) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          start.mode = 'scrub';
          this.dragging = this.dragged = true;
          s.setPointerCapture(e.pointerId);
          this.app.beginScrub();
        } else if (Math.abs(dy) > 8) start.mode = 'scroll';
      }
      if (start.mode === 'scrub') {
        // swipe left to go forward in time, right to go back (the strip moves under your finger)
        const f = Math.max(0, Math.min(this.app.compEnd - 1, start.frame - Math.round(dx / CELL)));
        if (f !== this.app.frame) this.app.setFrame(f);
        const x = LABEL + f * CELL;
        s.scrollLeft = Math.max(0, x - s.clientWidth / 2);
      }
    });
    const end = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      if (start.mode === 'scrub') this.app.endScrub();
      start = null;
      this.dragging = false;
    };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
    // tap: go to that frame; tap the current frame again for its options
    s.addEventListener('click', (e) => {
      if (this.dragged) { this.dragged = false; return; }
      if ((e.target as HTMLElement).closest('.flip-eye, .flip-trim')) return;
      const h = this.hit(e.clientX, e.clientY);
      if (!h) return;
      const app = this.app;
      if (h.layer.id === app.project.activeLayer && h.frame === app.frame && !app.playing) {
        showContextMenu(e.clientX, e.clientY, this.frameItems(h.layer));
        return;
      }
      this.go(h.layer, h.frame);
    });
    // press and hold (or right-click) a frame: its options
    attachContextMenu(s, ({ x, y, target }) => {
      if ((target as HTMLElement | null)?.closest?.('.flip-eye')) return null;
      const h = this.hit(x, y);
      if (!h || this.dragged) return null;
      this.go(h.layer, h.frame);
      return this.frameItems(h.layer);
    });
  }

  private frameItems(layer: DrawingsLayer): CtxItem[] {
    this.app.setSelection([]);
    return frameMenu(this.app, [{ sep: true }, { label: `Track options (${layer.name})…`, run: () => this.app.openLayers?.(this.row) }]);
  }

  /**
   * Track options (Procreate Dreams): show, opacity, blend, a colour tag, clipping mask, a mask to
   * paint, name, effects, duplicate and delete. Every change is one undo step.
   */
  private trackMenu(l: DrawingsLayer, anchor: HTMLElement): CtxItem[] {
    const app = this.app;
    const ed = app.editor;
    const op = Math.round(Number(ed.valueNow(l, 'opacity')));
    const set = (label: string, fn: (x: DrawingsLayer) => void) => ed.edit(label, (c) => { const x = c.layers.find((y) => y.id === l.id); if (x && x.kind === 'drawings') fn(x); });
    // the mask belongs to the track you draw on: go to this one first
    const mine = (fn: () => void) => () => { if (l.id !== app.project.activeLayer) app.pickLayer(l.id); fn(); };
    const painting = app.editingMask && l.id === app.project.activeLayer;
    return [
      { title: l.name },
      { label: 'Draw on this track', run: () => app.pickLayer(l.id), disabled: l.id === app.project.activeLayer },
      { label: l.visible ? 'Hide' : 'Show', run: () => ed.setFlag(l.id, 'visible', !l.visible) },
      { title: `Opacity · ${op}%` },
      { chips: [25, 50, 75, 100].map((v) => ({ label: `${v}%`, on: op === v, run: () => ed.setValue(l.id, 'opacity', v, 'Track opacity') })) },
      { title: 'Blend' },
      { chips: BLENDS.map(([b, name]) => ({ label: name, on: l.blend === b, run: () => set(`Blend ${name.toLowerCase()}`, (x) => { x.blend = b; }) })) },
      { title: 'Colour' },
      { chips: TAG_DOTS.map((dot, i) => ({ label: dot, title: i ? 'Colour tag' : 'No colour', on: (l.label ?? 0) === i, run: () => ed.setLabel(l.id, i) })) },
      { sep: true },
      { label: 'Clipping mask (show only over the track below)', checked: l.clip === true, run: () => set(l.clip ? 'Clipping mask off' : 'Clipping mask', (x) => { x.clip = !x.clip; }) },
      ...(l.mask
        ? [
            { label: 'Paint the mask (paint hides, eraser shows)', checked: painting, run: mine(() => app.setMaskEditing(!painting)) },
            { label: 'Delete the mask', run: mine(() => app.deleteMask()) },
          ]
        : [{ label: 'Add a mask (paint to hide parts of this track)', run: mine(() => app.addMask()) }]),
      { sep: true },
      { label: 'Rename…', run: async () => { const n = await askText('Track name', l.name, 'Rename'); if (n !== null) ed.rename(l.id, n); } },
      { label: '✨ Effects…', run: () => app.openEffects?.(l.id) },
      { label: '\u2191 Move up', run: () => app.moveTrack(l.id, -1) },
      { label: '\u2193 Move down', run: () => app.moveTrack(l.id, 1) },
      { label: 'Duplicate track', run: () => void app.duplicateLayer(l.id) },
      { label: 'All layer options…', run: () => { app.pickLayer(l.id); app.openLayers?.(anchor); } },
      { label: 'Delete track', danger: true, run: async () => { if (await confirmBox(`Delete “${l.name}”?`, 'You can undo this.', 'Delete', true)) ed.deleteLayers([l.id]); } },
    ];
  }

  /** Drag a track's box up or down to move the track (the row follows the finger). */
  private wireTrackDrag(eye: HTMLElement, row: HTMLElement, id: string): void {
    eye.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      const y0 = e.clientY;
      let moving = false;
      const move = (ev: PointerEvent) => {
        const dy = ev.clientY - y0;
        if (!moving && Math.abs(dy) < 10) return;
        if (!moving) {
          moving = true;
          this.dragging = this.dragged = true;
          try { eye.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
          row.classList.add('lifting');
        }
        row.style.transform = `translateY(${dy}px)`;
      };
      const up = (ev: PointerEvent) => {
        eye.removeEventListener('pointermove', move);
        eye.removeEventListener('pointerup', up);
        eye.removeEventListener('pointercancel', up);
        row.style.transform = '';
        row.classList.remove('lifting');
        this.dragging = false;
        if (!moving) return;
        swallowNextClick();
        const steps = Math.round((ev.clientY - y0) / ROW);
        if (steps) this.app.moveTrack(id, steps);
        this.sig = '';
        this.update();
      };
      eye.addEventListener('pointermove', move);
      eye.addEventListener('pointerup', up);
      eye.addEventListener('pointercancel', up);
    });
  }

  /** The handle on the current frame's right edge: drag to hold it for more or fewer frames. */
  private trimHandle(cell: HTMLElement): HTMLElement {
    const h = el('div', { class: 'flip-trim', title: 'Drag to show this drawing for more or fewer frames', role: 'slider', 'aria-label': 'Frame duration' });
    h.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const app = this.app;
      const i = Number(cell.dataset.i);
      const before = app.project.exposures;
      const len0 = before[i]?.length ?? 1;
      let after = before;
      this.dragging = this.dragged = true;
      h.setPointerCapture(e.pointerId);
      const x0 = e.clientX;
      const move = (ev: PointerEvent) => {
        const n = Math.max(1, len0 + Math.round((ev.clientX - x0) / CELL));
        if (n === (after[i]?.length ?? len0)) return;
        after = before.map((x, k) => (k === i ? { ...x, length: n } : x));
        cell.style.width = `${n * CELL - 3}px`;
        cell.dataset.len = String(n);
        app.previewExposures(after);
      };
      const up = () => {
        h.removeEventListener('pointermove', move);
        h.removeEventListener('pointerup', up);
        h.removeEventListener('pointercancel', up);
        this.dragging = false;
        swallowNextClick();
        app.commitExposures('Frame duration', before, after);
        this.sig = '';
        this.update();
      };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up);
      h.addEventListener('pointercancel', up);
    });
    return h;
  }
}
