import type { App } from '../app';
import { isPaintingWorkspace, paintingView } from '../core/workspace';
import type { BlendMode, DrawingsLayer } from '../core/comp';
import type { Drawing } from '../core/project';
import { attachContextMenu, HOLD_MS, HOLD_SLOP, showContextMenu, swallowNextClick, type CtxItem } from './contextmenu';
import { cutPoints, dropIndex, edgeScrollSpeed, glide, moveExposure, snapEdge, startOf, trimStart, type Exposure } from '../core/timeline';
import { askText, confirmBox } from './dialogs';
import { frameMenu } from './framemenu';
import { decorate } from './icons';
import { onionHold } from './onionpop';
import { PlaybackRangeControl, markPlaybackRange } from './playbackrange';
import { PlaybackRangeGesture } from './playbackrangegesture';
import { Splitter } from './splitter';
import { el } from './dom';

/** Draw's saved Canvas/Flipbook view. (The old Flip mode's key is not read.) */
const KEY = '2dope.draw.view';
/** One frame of time on the strip, and one track row (Procreate Dreams shows three at a time). */
/** A frame's width on the strip at the start (pinch, Alt+= / Alt+− or a double-tap on the ruler zoom it). */
const CELL = 44;
const CELL_MIN = 4, CELL_MAX = 140;
/** A track row: a 50 px cel (above the 44 px touch minimum) and a gap. */
const ROW = 58;
/** The track header: room for a readable name (narrow screens keep the old compact box). */
const labelWidth = () => (typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches ? 56 : 104);
/** What a track holds, for its colour and the header's second line. */
type TrackKind = 'anim' | 'still' | 'movie' | 'text' | 'notes';
const KIND_NAME: Record<TrackKind, string> = { anim: 'Animation', still: 'Still', movie: 'Movie', text: 'Text', notes: 'Notes' };
export function trackKind(l: DrawingsLayer): TrackKind {
  if (l.video) return 'movie';
  if (l.caption || l.title) return 'text';
  if (l.notes) return 'notes';
  if (l.still) return 'still';
  return 'anim';
}
/** Track colours (the same tags as Motion and the rails), and how they read in a menu. */
const TAGS = ['#9a9aa8', '#ff5a8a', '#ffd24a', '#4aa3ff', '#4ade80', '#c084fc', '#fb923c'];
const TAG_DOTS = ['\u26aa', '\ud83d\udd34', '\ud83d\udfe1', '\ud83d\udd35', '\ud83d\udfe2', '\ud83d\udfe3', '\ud83d\udfe0'];
const BLENDS: [BlendMode, string][] = [['normal', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['add', 'Add']];


/**
 * Draw's flipbook (Procreate Dreams' Draw & Paint with its Flipbook): under the canvas a strip shows
 * every frame of time for the shot's drawing layers (front first), with held
 * drawings spanning their frames. Swipe the strip to move through time, tap a frame to go there,
 * tap it again (or press and hold) for its options, and drag the handle on the current frame to
 * make it hold longer. + Frame adds a page after the whole hold; hold the button to end the hold
 * here instead. Draw offers Canvas/Flipbook, Animate offers Flipbook/Clips. The divider resizes
 * the docked track area. Everything edits
 * the same layers and timing that Timing and Motion show.
 */
const thumbs = new WeakMap<Drawing, { rev: number; url: string }>();
const thumbCanvas = document.createElement('canvas');
/** A drawing's strip picture (white page, letterboxed), made once per thumbnail change and shared by every cel showing it. */
function thumbURL(d: Drawing): string | null {
  const t = d.thumb;
  if (!t || !t.width || !t.height) return null;
  const hit = thumbs.get(d);
  if (hit && hit.rev === d.thumbRev) return hit.url;
  thumbCanvas.width = 80; thumbCanvas.height = 60;
  const g = thumbCanvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#fff'; g.fillRect(0, 0, 80, 60);
  const s = Math.min(80 / t.width, 60 / t.height);
  g.drawImage(t, (80 - t.width * s) / 2, (60 - t.height * s) / 2, t.width * s, t.height * s);
  const url = thumbCanvas.toDataURL();
  thumbs.set(d, { rev: d.thumbRev, url });
  return url;
}

export class FlipMode {
  readonly row = el('div', { class: 'flip-row', role: 'region', 'aria-label': 'Flipbook' });
  private views = { draw: false, animate: true };
  get on(): boolean { return isPaintingWorkspace(this.app.workspace) ? this.views[this.app.workspace] : false; }
  private sig = '';
  onChange: () => void = () => {};
  // the header's buttons stay the same elements while playing, so a tap on Pause is never lost
  private readonly head = el('div', { class: 'flip-head', role: 'toolbar', 'aria-label': 'Flipbook controls' });
  private readonly actions = el('div', { class: 'flip-actions' });
  private readonly play = el('button', { type: 'button', class: 'flip-btn' });
  private readonly count = el('span', { class: 'flip-count', 'aria-live': 'off' });
  private readonly scroll = el('div', { class: 'flip-scroll' });
  private readonly grid = el('div', { class: 'flip-grid' });
  private readonly playhead = el('div', { class: 'flip-playhead', 'aria-hidden': 'true' });
  /** A short line where a trim snapped (the playhead, another track's cut). */
  private readonly snapMark = el('div', { class: 'flip-snap', 'aria-hidden': 'true' });
  private playing: boolean | null = null;
  private readonly range: PlaybackRangeControl;
  private rangeGesture?: PlaybackRangeGesture;
  /** How wide one frame is on the strip (zoom). */
  private cell = CELL;
  /** The track header's width (px): the strip's frames start after it. */
  private label = labelWidth();
  /** Set while a swipe or trim is under way: the strip does not scroll itself then. */
  private dragging = false;
  private dragged = false;
  private activeTrack = '';
  /**
   * The strip is virtual: every track keeps its exposures here, and only the cels (and ruler
   * numbers) near the visible frames exist as elements. Long shots stay fast to build, zoom and play.
   */
  private rows: { layer: DrawingsLayer; cells: HTMLElement; items: { i: number; start: number; len: number; drawing: string }[]; shown: Map<number, HTMLElement> }[] = [];
  private shownFrames: [number, number] = [0, -1];
  private windowQueued = 0;

  constructor(private readonly app: App, stage: HTMLElement) {
    this.range = new PlaybackRangeControl(app); this.range.button.classList.add('flip-btn');
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
    const done = btn('Close flipbook', 'Draw: return to painting. Animate: switch to Clips.', 'time', () => this.set(false), undefined, 'flip-btn flip-adv flip-view');
    this.play.addEventListener('click', () => this.app.togglePlay());
    const prev = btn('Previous drawing', 'Previous drawing (hold: the first frame)', 'prev', () => this.app.prevDrawing(), () => this.app.setLayerFrame(0), 'flip-btn flip-icon', '');
    const next = btn('Next drawing', 'Next drawing (hold: the last frame)', 'next', () => this.app.nextDrawing(), () => this.app.setLayerFrame(this.app.project.length - 1), 'flip-btn flip-icon', '');
    const add = btn('Frame', 'Add a frame right after this drawing (after its whole hold). Hold the button to end the hold here instead.', 'plus', () => this.app.flipAddFrame(true), () => this.app.flipAddFrame(false), 'flip-btn flip-add');
    // tracks are added here, on the timeline: tap for an animation track, hold or right-click for every kind
    const trackKinds = (): CtxItem[] => [
      { title: 'New track' },
      { label: 'Animation', hint: 'Shift+N', run: () => this.app.addFlipTrack() },
      { label: 'Background', run: () => this.app.addStillLayer('background') },
      { label: 'Object', run: () => this.app.addStillLayer('object') },
      { label: 'Notes', run: () => this.app.addNotesLayer() },
      { label: 'Adjustment', run: () => this.app.editor.addLayer('adjustment', this.app.project.isPlaceholder ? undefined : this.app.project.activeLayer) },
      { label: 'Media\u2026', run: () => this.app.pickMedia?.() },
    ];
    const track = btn('Track', 'Add an animation track above this one, from frame 1. Hold (or right-click) for a background, object, notes or media track. Drag a track\u2019s box up or down to reorder.', 'layers', () => this.app.addFlipTrack(), () => { const r = track.getBoundingClientRect(); showContextMenu(r.left, r.bottom, trackKinds()); }, 'flip-btn flip-adv');
    attachContextMenu(track, () => trackKinds());
    const onion = btn('Onion', 'Onion skin: see the drawings before and after faintly', 'onion', () => this.app.toggleOnion());
    onion.classList.add('flip-onion');
    onionHold(this.app, onion);
    const fit = btn('Fit', 'Fit the page to the screen', 'fit', () => this.app.fit(), undefined, 'flip-btn flip-icon flip-adv', '');
    this.actions.append(prev, this.count, next, this.range.button, add, onion, track, fit, done);
    this.head.append(this.play, this.actions);
    this.grid.append(this.playhead);
    this.scroll.id = 'flipbook-tracks';
    this.scroll.append(this.grid);
    this.scroll.addEventListener('scroll', () => { if (!this.windowQueued) this.windowQueued = requestAnimationFrame(() => { this.windowQueued = 0; this.renderWindow(); }); }, { passive: true });
    const handle = el('div', {
      class: 'splitter flip-handle', role: 'separator', tabindex: '0', 'aria-orientation': 'horizontal',
      'aria-controls': this.scroll.id, 'aria-label': 'Resize Flipbook',
      title: 'Drag or use Up and Down to resize Flipbook. Double-click to reset.',
    });
    this.row.append(handle, this.head, this.scroll);
    stage.append(this.row);
    new Splitter(handle, stage, () => ({
      name: '--flipbook-h', min: 70, def: null,
      current: this.scroll.clientHeight, max: stage.clientHeight,
    }));
    new ResizeObserver(() => {
      if (this.row.hidden) return;
      stage.style.setProperty('--flip-h', `${this.row.offsetHeight + 16}px`);
      this.revealActiveTrack();
      app.refit();
    }).observe(this.row);
    this.wireStrip();
    // the flipbook is Draw's view unless you picked the timeline
    try {
      this.views.draw = paintingView('draw', localStorage.getItem(KEY)) === 'flipbook';
      this.views.animate = paintingView('animate', localStorage.getItem('2dope.animate.view')) === 'flipbook';
    } catch { /* defaults */ }
    this.update();
  }

  /** Draw's bottom view: the flipbook (true) or the timeline. */
  set(on: boolean): void {
    const ws = this.app.workspace;
    if (!isPaintingWorkspace(ws) || this.app.strokeActive) return;
    this.views[ws] = on;
    try { localStorage.setItem(ws === 'draw' ? KEY : '2dope.animate.view', on ? 'flipbook' : ws === 'draw' ? 'still' : 'clips'); } catch { /* optional */ }
    // seeing the last drawing faintly is what makes drawing the next one easy
    if (on && !this.app.onion.enabled) this.app.toggleOnion();
    this.sig = '';
    this.update();
    this.onChange();
  }

  /** The flipbook shows in Draw when it is the chosen view, and always at the Focus level. */
  private get shown(): boolean {
    const b = document.body.classList;
    return isPaintingWorkspace(this.app.workspace) && !b.contains('quick') && this.on && !b.contains('painting-editor-folded');
  }

  /** The tracks: the shot's drawing layers (not guides), front first. */
  private tracks(): DrawingsLayer[] {
    // adjustment layers have nothing to draw: they are effects, set in Motion or Layers
    return this.app.drawLayers().filter((l) => !l.guide && !l.adjust);
  }

  update(): void {
    const app = this.app;
    this.range.update();
    this.rangeGesture?.update();
    const shown = this.shown;
    if (document.body.classList.contains('flipmode') !== shown) {
      document.body.classList.toggle('flipmode', shown);
      this.sig = '';
      // the page fits above (or back below) the flipbook
      setTimeout(() => this.onChange(), 0);
    }
    const active = shown && !app.uiHidden;
    this.row.hidden = !active;
    if (!active) { this.row.parentElement?.style.setProperty('--flip-h', '0px'); return; }
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
    markPlaybackRange(app, this.grid, this.cell, 0, this.label);
  }

  /** The strip: one row per track, each drawing a cell as wide as it is held. */
  private build(tracks: DrawingsLayer[], len: number): void {
    const app = this.app;
    const p = app.project;
    this.label = labelWidth();
    this.grid.style.setProperty('--flip-label', `${this.label}px`);
    this.grid.replaceChildren(this.playhead, this.snapMark);
    this.grid.append(el('div', { class: 'flip-ruler', 'aria-hidden': 'true' }));
    this.size(len);
    this.rows = [];
    this.shownFrames = [0, -1];
    for (const l of tracks) {
      const kind = trackKind(l);
      const row = el('div', { class: `flip-track${l.id === p.activeLayer ? ' active' : ''}${l.visible ? '' : ' off'}`, 'data-id': l.id, 'data-kind': kind });
      const eye = el('button', { type: 'button', class: 'flip-eye', 'aria-pressed': String(l.visible), title: `${l.name}: tap to ${l.visible ? 'hide' : 'show'}, hold for track options`, 'aria-label': `${l.visible ? 'Hide' : 'Show'} ${l.name}` });
      // a colour tag wins over the kind's colour, on the header bar and the track's cels
      if (l.label) row.style.setProperty('--kind', TAGS[l.label % TAGS.length]!);
      if (l.label) eye.style.setProperty('--tag', TAGS[l.label % TAGS.length]!);
      if (l.clip) row.classList.add('clip');
      if (l.mask) row.classList.add('masked');
      eye.append(el('span', { class: 'flip-check', 'aria-hidden': 'true' }, l.visible ? '✓' : ''), el('span', { class: 'flip-name' }, l.name), el('span', { class: 'flip-kind' }, KIND_NAME[kind]));
      eye.addEventListener('click', () => { if (this.dragged) { this.dragged = false; return; } app.editor.setFlag(l.id, 'visible', !l.visible); });
      this.wireTrackDrag(eye, row, l.id);
      attachContextMenu(eye, () => this.trackMenu(l, eye));
      const cells = el('div', { class: 'flip-cells' });
      const items: { i: number; start: number; len: number; drawing: string }[] = [];
      let start = l.start;
      l.exposures.forEach((e, i) => { items.push({ i, start, len: e.length, drawing: e.drawing }); start += e.length; });
      this.rows.push({ layer: l, cells, items, shown: new Map() });
      row.append(eye, cells);
      this.grid.append(row);
    }
    // The default shows up to three tracks. The divider overrides that height.
    this.scroll.style.setProperty('--flip-tracks-height', `${24 + Math.min(3, Math.max(1, tracks.length)) * ROW}px`);
    this.renderWindow();
  }

  /** One cel: the drawing's thumbnail across its hold. */
  private makeCel(item: { i: number; start: number; len: number; drawing: string }): HTMLElement {
    const c = el('div', { class: 'flip-cel', 'data-i': String(item.i), 'data-start': String(item.start), 'data-len': String(item.len) });
    c.style.setProperty('--s', String(item.start));
    c.style.setProperty('--n', String(item.len));
    const d = this.app.project.drawing(item.drawing);
    const url = thumbURL(d);
    if (url) c.append(el('img', { src: url, alt: '', draggable: 'false' }));
    else c.classList.add('empty');
    if (item.len > 1) c.append(el('span', { class: 'flip-hold' }, `×${item.len}`));
    if (d.role === 'key') c.append(el('span', { class: 'flip-role', title: 'Key drawing' }, '◆'));
    return c;
  }

  /** Frames on screen, with half a screen to spare either side so a swipe never shows gaps. */
  private visibleFrames(): [number, number] {
    const w = this.scroll.clientWidth || 1200, left = this.scroll.scrollLeft;
    const spare = Math.max(w / 2, 300);
    return [Math.max(0, Math.floor((left - this.label - spare) / this.cell)), Math.ceil((left + w + spare) / this.cell)];
  }

  /** Make the cels and ruler numbers near the visible frames, and drop the ones far away. */
  private renderWindow(force = false): void {
    if (this.dragging && !force) return;
    const [from, to] = this.visibleFrames();
    const [a, b] = this.shownFrames;
    // what is needed is already drawn: nothing to do
    if (!force && from >= a && to <= b) return;
    this.shownFrames = [from, to];
    for (const r of this.rows) {
      const keep = new Set<number>();
      // exposures are in time order: skip to the first that ends after `from`
      let lo = 0, hi = r.items.length;
      while (lo < hi) { const m = (lo + hi) >> 1; const it = r.items[m]!; if (it.start + it.len <= from) lo = m + 1; else hi = m; }
      for (let k = lo; k < r.items.length; k++) {
        const it = r.items[k]!;
        if (it.start > to) break;
        keep.add(it.i);
        if (!r.shown.has(it.i)) {
          const c = this.makeCel(it);
          r.shown.set(it.i, c);
          r.cells.append(c);
        }
      }
      for (const [i, c] of r.shown) if (!keep.has(i) && !c.classList.contains('held')) { c.remove(); r.shown.delete(i); }
    }
    this.grid.querySelector('.flip-ruler')?.replaceWith(this.ruler(Math.max(1, this.app.compEnd), from, to));
    this.markCels();
  }

  /** Everything that follows the zoom: cels are placed by --flip-cell, so a zoom touches one property. */
  private size(len: number): void {
    this.grid.style.width = `${this.label + len * this.cell + this.cell}px`;
    this.grid.style.setProperty('--flip-cell', `${this.cell}px`);
    this.grid.style.setProperty('--flip-sec', `${this.cell * (this.app.project.fps || 24)}px`);
    this.grid.classList.toggle('thin', this.cell < 24);
    this.playhead.style.width = `${this.cell}px`;
  }

  /** After a zoom: the playhead and range marks at the new cell width (the strip itself is unchanged). */
  private remark(): void {
    if (!this.sig) { this.update(); return; }
    const len = Math.max(1, this.app.compEnd);
    this.mark(len);
    markPlaybackRange(this.app, this.grid, this.cell, 0, this.label);
  }

  /** A new zoom on the strip already built: resize it; the caller scrolls, then draws the window. */
  private relayout(): void {
    this.size(Math.max(1, this.app.compEnd));
  }

  private ruler(len: number, from = 0, to = len): HTMLElement {
    const app = this.app;
    // a ruler: frame numbers every frame, seconds stand out
    const ruler = el('div', { class: 'flip-ruler', 'aria-hidden': 'true' });
    const fps = app.project.fps || 24;
    // zoomed far out the numbers thin out (every 2, 3, 6... frames, then whole seconds) so they
    // never overlap; the steps divide a second, so the seconds always keep their number
    const steps = [...Array.from({ length: fps }, (_, k) => k + 1).filter((n) => fps % n === 0), fps * 2, fps * 5, fps * 10];
    const every = steps.find((n) => n * this.cell >= 26) ?? fps * 20;
    for (let f = Math.max(0, from - (from % every)); f < Math.min(len, to + 1); f++) {
      if (f % every) continue;
      const t = el('span', { class: f % fps === 0 ? 'sec' : '' }, String(f + 1));
      t.style.left = `${this.label + f * this.cell}px`;
      t.style.width = `${Math.max(this.cell, 22)}px`;
      ruler.append(t);
    }
    return ruler;
  }

  /**
   * Zoom the strip: `cell` px per frame, keeping `frame` (default the playhead) where it is on screen,
   * or, with `at` (client x), putting it under that point (a pinch that also pans).
   */
  zoomTo(cell: number, frame = this.app.frame, at?: number): void {
    const s = this.scroll;
    const before = at === undefined ? this.label + frame * this.cell - s.scrollLeft : at - s.getBoundingClientRect().left;
    this.cell = Math.max(CELL_MIN, Math.min(CELL_MAX, cell));
    this.relayout();
    this.remark();
    s.scrollLeft = Math.max(0, this.label + frame * this.cell - before);
    this.renderWindow(true);
  }

  /** The whole shot on the strip (a quick pinch, Alt+0). */
  zoomFit(): void {
    const len = Math.max(1, this.app.compEnd);
    this.cell = Math.max(CELL_MIN, Math.min(CELL_MAX, (this.scroll.clientWidth - this.label - 12) / len));
    this.relayout();
    this.remark();
    this.scroll.scrollLeft = 0;
    this.renderWindow(true);
  }

  /** Put the playhead in the middle of the strip. */
  centre(): void {
    const s = this.scroll;
    s.scrollLeft = Math.max(0, this.label + this.app.frame * this.cell - s.clientWidth / 2);
  }

  /**
   * Flipbook hotkeys (after Procreate Dreams' commands). Returns true when the key was used.
   * Only while the flipbook is showing; typing in a box never reaches here.
   */
  onKey(e: KeyboardEvent): boolean {
    const app = this.app;
    const mod = e.ctrlKey || e.metaKey;
    const tracks = this.tracks();
    const at = tracks.findIndex((l) => l.id === app.project.activeLayer);
    const goTrack = (i: number) => { const l = tracks[Math.max(0, Math.min(tracks.length - 1, i))]; if (l && l.id !== app.project.activeLayer) app.pickLayer(l.id); };
    const fps = app.project.fps || 24;
    switch (e.code) {
      case 'KeyN':
        if (mod) return false;
        if (e.shiftKey) app.addFlipTrack();
        else app.flipAddFrame(true);
        return true;
      case 'ArrowUp':
      case 'ArrowDown': {
        const up = e.code === 'ArrowUp';
        if (mod) { goTrack(up ? 0 : tracks.length - 1); return true; }
        if (e.shiftKey && !e.altKey) { goTrack(at + (up ? -1 : 1)); return true; }
        return false;
      }
      case 'ArrowLeft':
      case 'ArrowRight':
        // one second at a time (a scrub lock keeps Shift + arrows for flipping back home)
        if (!e.shiftKey || e.altKey || mod || app.lockFrame !== null) return false;
        app.setFrame(Math.max(0, Math.min(app.compEnd - 1, app.frame + (e.code === 'ArrowRight' ? fps : -fps))));
        return true;
      case 'Home':
        app.setLayerFrame(0);
        return true;
      case 'End':
        app.setLayerFrame(app.project.length - 1);
        return true;
      case 'KeyS':
        if (mod) return false;
        void app.splitHold();
        return true;
      case 'Equal':
        if (!e.altKey) return false;
        this.zoomTo(this.cell * 1.4);
        return true;
      case 'Minus':
        if (!e.altKey) return false;
        this.zoomTo(this.cell / 1.4);
        return true;
      case 'KeyF':
        // Shift+F fills the drawing to the end of the shot (F alone still fits the page)
        if (!e.shiftKey || mod || e.altKey) return false;
        app.setSelection([]);
        app.fillDuration();
        return true;
      case 'Digit0':
        if (!e.altKey) return false;
        this.zoomFit();
        return true;
      case 'KeyV': {
        if (mod) return false;
        const l = tracks[at];
        if (l) app.editor.setFlag(l.id, 'visible', !l.visible);
        return true;
      }
      case 'F2': {
        const l = tracks[at];
        if (l) void askText('Track name', l.name, 'Rename').then((n) => { if (n !== null) app.editor.rename(l.id, n); });
        return true;
      }
      case 'KeyM': {
        if (mod) return false;
        const cur = this.grid.querySelector<HTMLElement>('.flip-cel.on') ?? this.playhead;
        const r = cur.getBoundingClientRect();
        const l = tracks[at];
        if (l) showContextMenu(r.left + 10, r.top + 10, this.frameItems(l));
        return true;
      }
      case 'KeyC':
        if (mod) return false;
        this.centre();
        return true;
    }
    return false;
  }

  /** Per frame: the playhead, the current cells and the counter (no rebuild while playing). */
  private mark(len: number): void {
    const app = this.app;
    const f = app.frame;
    this.count.textContent = `${Math.min(f + 1, len)} / ${len}`;
    this.playhead.style.left = `${this.label + f * this.cell}px`;
    this.playhead.dataset.f = String(Math.min(f + 1, len));
    const activeId = app.project.activeLayer;
    const activeTrack = `${app.project.activeComp}:${activeId}`;
    if (this.activeTrack !== activeTrack) {
      this.activeTrack = activeTrack;
      this.revealActiveTrack();
    }
    this.markCels();
    if (!this.dragging) {
      // keep the playhead in view (centred while playing, nearest otherwise)
      const x = this.label + f * this.cell, w = this.scroll.clientWidth;
      const left = this.scroll.scrollLeft;
      if (app.playing || x < left + this.label + this.cell || x > left + w - this.cell * 2) this.scroll.scrollLeft = Math.max(0, x - w / 2);
    }
  }

  /**
   * The current cel of every track is highlighted. Every cel has its trim handle (not only the one
   * under the playhead): drag any drawing's right edge to hold it longer or shorter, on any track.
   */
  private markCels(): void {
    const app = this.app, f = app.frame, activeId = app.project.activeLayer;
    for (const r of this.rows) {
      const mine = r.layer.id === activeId;
      for (const c of r.shown.values()) {
        const s = Number(c.dataset.start), n = Number(c.dataset.len);
        const here = f >= s && f < s + n;
        c.classList.toggle('on', here && mine && !app.blankPage);
        c.classList.toggle('here', here && !mine);
        // room for 44 px touch grips at both ends (a short drawing keeps its body for taps)
        c.classList.toggle('roomy', n * this.cell >= 132);
        const trim = c.querySelector<HTMLElement>('.flip-trim:not(.start)');
        const lead = c.querySelector<HTMLElement>('.flip-trim.start');
        if (!app.playing && !r.layer.locked) {
          const h = trim ?? c.appendChild(this.trimHandle(c));
          h.classList.toggle('quiet', !(here && mine));
          // the start grip: only on the current drawing (and not the first: nothing comes before it)
          if (here && mine && Number(c.dataset.i) > 0) { if (!lead) c.append(this.trimHandle(c, 'start')); }
          else lead?.remove();
        } else { trim?.remove(); lead?.remove(); }
      }
    }
  }

  private revealActiveTrack(): void {
    const row = [...this.grid.querySelectorAll<HTMLElement>('.flip-track')].find(r => r.dataset.id === this.app.project.activeLayer);
    if (row && (row.offsetTop < this.scroll.scrollTop || row.offsetTop + ROW > this.scroll.scrollTop + this.scroll.clientHeight))
      this.scroll.scrollTop = Math.max(0, row.offsetTop + ROW - this.scroll.clientHeight);
  }

  /** The frame under a point of the strip, and its track. */
  private hit(x: number, y: number): { layer: DrawingsLayer; frame: number } | null {
    const rowEl = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('.flip-track');
    const layer = rowEl ? this.tracks().find((l) => l.id === rowEl.dataset.id) : undefined;
    if (!rowEl || !layer) return null;
    const r = this.grid.getBoundingClientRect();
    const frame = Math.max(0, Math.min(this.app.compEnd - 1, Math.floor((x - r.left - this.label) / this.cell)));
    return { layer, frame };
  }

  /** Go to a frame of a track (drawing on that track from now on). */
  private go(layer: DrawingsLayer, frame: number): void {
    const app = this.app;
    if (app.playing) app.togglePlay();
    if (layer.id !== app.project.activeLayer) app.pickLayer(layer.id);
    app.setFrame(frame);
  }

  /** A flick of the strip keeps scrubbing and slows down (Procreate Dreams' momentum). */
  private glideRaf = 0;
  /** True while a flick is still gliding (tests read it). */
  get gliding(): boolean { return this.glideRaf !== 0; }
  stopGlide(): void {
    cancelAnimationFrame(this.glideRaf);
    this.glideRaf = 0;
  }
  private startGlide(speed: number): void {
    this.stopGlide();
    let v = speed, t = performance.now(), acc = 0;
    const from = this.app.frame;
    const step = (now: number) => {
      const dt = Math.min(48, Math.max(1, now - t));
      t = now;
      v = glide(v, dt);
      acc += v * dt;
      const app = this.app;
      const f = Math.max(0, Math.min(app.compEnd - 1, from - Math.round(acc / this.cell)));
      if (f !== app.frame) app.setFrame(f);
      // it stops at either end of the shot, or when it has slowed down
      if (!v || app.playing || f === 0 || f === app.compEnd - 1) { this.glideRaf = 0; return; }
      this.glideRaf = requestAnimationFrame(step);
    };
    this.glideRaf = requestAnimationFrame(step);
  }

  private wireStrip(): void {
    const s = this.scroll;
    type Lift = { i: number; cel: HTMLElement; cells: HTMLElement; before: Exposure[]; grab: number; start: number; len: number; layerStart: number; to: number; moved: boolean };
    let start: { x: number; y: number; id: number; frame: number; mode: '' | 'scrub' | 'scroll' | 'ruler' | 'lift'; lastX: number; lastT: number; acc: number; v: number; lift?: Lift } | null = null;
    let holdTimer = 0;
    /** The frame under a point of the strip (on the ruler or any track). */
    const frameAt = (x: number) => {
      const r = this.grid.getBoundingClientRect();
      return Math.max(0, Math.min(this.app.compEnd - 1, Math.floor((x - r.left - this.label) / this.cell)));
    };
    const onRuler = (y: number) => y - this.grid.getBoundingClientRect().top < 20;
    // two fingers on the strip: pinch to zoom time and drag to pan, together (a quick pinch fits the whole shot)
    const fingers = new Map<number, number>();
    let pinch: { d0: number; cell0: number; t0: number; frame: number } | null = null;
    const spread = () => { const xs = [...fingers.values()]; return Math.abs(xs[0]! - xs[1]!); };
    const middle = () => { const xs = [...fingers.values()]; return (xs[0]! + xs[1]!) / 2; };
    /** Put a lifted drawing back where it was. */
    const drop = (l: Lift) => {
      l.cel.classList.remove('lifted', 'held');
      l.cel.style.transform = '';
      l.cells.classList.remove('lifting');
    };
    s.addEventListener('pointerdown', (e) => {
      this.stopGlide();
      if (e.pointerType === 'touch') fingers.set(e.pointerId, e.clientX);
      if (fingers.size === 2) {
        clearTimeout(holdTimer);
        if (start?.mode === 'scrub' || start?.mode === 'ruler') this.app.endScrub();
        if (start?.lift) { drop(start.lift); this.stopEdge(); this.dragging = false; this.sig = ''; }
        start = null;
        pinch = { d0: Math.max(20, spread()), cell0: this.cell, t0: e.timeStamp, frame: this.framePos(middle()) };
        // (the strip may rebuild while pinching: nothing is held under the fingers)
        this.dragged = true;
      }
    });
    s.addEventListener('pointermove', (e) => {
      if (!fingers.has(e.pointerId)) return;
      fingers.set(e.pointerId, e.clientX);
      // the frame that was between the fingers stays between them, wherever they go
      if (pinch && fingers.size === 2) this.zoomTo(pinch.cell0 * (Math.max(20, spread()) / pinch.d0), pinch.frame, middle());
    });
    const lift = (e: PointerEvent) => {
      if (!fingers.delete(e.pointerId) || !pinch) return;
      if (fingers.size < 2) {
        const p = pinch;
        pinch = null;
        // a fast pinch in: the whole shot
        if (e.timeStamp - p.t0 < 300 && this.cell < p.cell0 * 0.8) this.zoomFit();
      }
    };
    s.addEventListener('pointerup', lift);
    s.addEventListener('pointercancel', lift);

    /** Touch and hold a drawing: it lifts, ready to drag to another time on its track. */
    const pickUp = (st: NonNullable<typeof start>, celEl: HTMLElement) => {
      const app = this.app;
      const trackId = celEl.closest<HTMLElement>('.flip-track')?.dataset.id ?? '';
      const cells = celEl.parentElement;
      if (!trackId || !cells || app.playing || app.strokeActive) return false;
      const layer = this.tracks().find((l) => l.id === trackId);
      if (!layer || layer.locked) return false;
      this.dragging = this.dragged = true;
      if (trackId !== app.project.activeLayer) app.pickLayer(trackId);
      const i = Number(celEl.dataset.i);
      const before = app.project.exposures;
      const layerStart = app.project.layer.start;
      const st0 = layerStart + startOf(before, i);
      st.mode = 'lift';
      st.lift = { i, cel: celEl, cells, before, grab: this.framePos(st.x) - st0, start: st0, len: before[i]?.length ?? 1, layerStart, to: i, moved: false };
      celEl.classList.add('lifted', 'held');
      cells.classList.add('lifting');
      try { s.setPointerCapture(st.id); } catch { /* synthetic */ }
      return true;
    };
    /** Follow the finger with a lifted drawing; the others slide aside to show where it will land. */
    const carry = (l: Lift, clientX: number) => {
      const at = this.framePos(clientX) - l.grab; // where its start is now, in shot frames
      l.cel.style.transform = `translateX(${(at - l.start) * this.cell}px)`;
      const to = dropIndex(l.before, l.i, at - l.layerStart + l.len / 2);
      if (Math.abs(at - l.start) > 0.3) l.moved = true;
      if (to === l.to) return;
      l.to = to;
      const order = moveExposure(l.before, l.i, to);
      for (const c of l.cells.querySelectorAll<HTMLElement>('.flip-cel')) {
        const k = Number(c.dataset.i);
        if (k === l.i) continue;
        const at2 = order.indexOf(l.before[k]!);
        if (at2 >= 0) c.style.setProperty('--s', String(l.layerStart + startOf(order, at2)));
      }
    };
    let rulerTap = 0;
    s.addEventListener('pointerdown', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.flip-eye, .flip-trim') || !e.isPrimary || e.button > 0 || pinch) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId, frame: this.app.frame, mode: '', lastX: e.clientX, lastT: e.timeStamp, acc: 0, v: 0 };
      this.dragged = false;
      clearTimeout(holdTimer);
      // the frame numbers are a timeline ruler: touch it and the playhead jumps there and follows
      if (onRuler(e.clientY)) {
        // a double-tap on the ruler zooms in there (Procreate Dreams' double-tap to focus)
        if (e.timeStamp - rulerTap < 320) {
          rulerTap = 0;
          start = null;
          this.dragged = true;
          this.zoomTo(this.cell * 1.8, frameAt(e.clientX));
          return;
        }
        rulerTap = e.timeStamp;
        start.mode = 'ruler';
        this.dragging = this.dragged = true;
        try { s.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
        this.app.beginScrub();
        this.app.setFrame(frameAt(e.clientX));
        return;
      }
      // press and hold, still: a drawing lifts (release without moving for its options);
      // a finger on an empty spot gets the frame's options
      const celEl = target.closest<HTMLElement>('.flip-cel');
      if (!celEl && e.pointerType !== 'touch') return;
      const st = start;
      holdTimer = window.setTimeout(() => {
        if (start !== st || st.mode) return;
        if (celEl && pickUp(st, celEl)) return;
        const h = this.hit(st.x, st.y);
        if (!h) return;
        start = null;
        this.dragged = true;
        swallowNextClick();
        this.go(h.layer, h.frame);
        showContextMenu(st.x, st.y, this.frameItems(h.layer));
      }, HOLD_MS);
    });
    s.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (start.mode === 'lift') {
        const l = start.lift!;
        const apply = () => carry(l, e.clientX);
        apply();
        this.followEdge(e.clientX, apply);
        return;
      }
      if (start.mode === 'ruler') {
        const f = frameAt(e.clientX);
        if (f !== this.app.frame) this.app.setFrame(f);
        start.acc = (e.clientX - start.lastX) / Math.max(1, e.timeStamp - start.lastT); // speed, px per ms
        start.lastX = e.clientX;
        start.lastT = e.timeStamp;
        return;
      }
      if (!start.mode) {
        if (Math.hypot(dx, dy) > HOLD_SLOP) clearTimeout(holdTimer);
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          clearTimeout(holdTimer);
          start.mode = 'scrub';
          this.dragging = this.dragged = true;
          try { s.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
          this.app.beginScrub();
        } else if (Math.abs(dy) > 8) { clearTimeout(holdTimer); start.mode = 'scroll'; }
      }
      if (start.mode === 'scrub') {
        // swipe left to go forward in time, right to go back (the strip moves under your finger);
        // a quick swipe goes further, as in Procreate Dreams
        const step = e.clientX - start.lastX, dt = Math.max(1, e.timeStamp - start.lastT);
        const speed = Math.abs(step) / dt; // px per ms
        const gain = speed > 0.9 ? Math.min(6, 1 + (speed - 0.9) * 3) : 1;
        start.acc += step * gain;
        start.v = start.v * 0.5 + (step / dt) * 0.5;
        start.lastX = e.clientX;
        start.lastT = e.timeStamp;
        const f = Math.max(0, Math.min(this.app.compEnd - 1, start.frame - Math.round(start.acc / this.cell)));
        if (f !== this.app.frame) this.app.setFrame(f);
        const x = this.label + f * this.cell;
        s.scrollLeft = Math.max(0, x - s.clientWidth / 2);
      }
    });
    const end = (e: PointerEvent, cancelled = false) => {
      if (!start || e.pointerId !== start.id) return;
      clearTimeout(holdTimer);
      const st = start;
      start = null;
      if (st.mode === 'lift') {
        const l = st.lift!;
        this.stopEdge();
        drop(l);
        this.dragging = false;
        this.dragged = true;
        swallowNextClick();
        const app = this.app;
        if (!cancelled && l.moved && l.to !== l.i) {
          const after = moveExposure(l.before, l.i, l.to);
          app.previewExposures(after);
          app.commitExposures('Move drawing', l.before, after);
          app.setFrame(l.layerStart + startOf(after, l.to));
        } else if (!cancelled && !l.moved) {
          // held and let go without moving: the drawing's options
          app.setFrame(Math.max(l.start, Math.min(l.start + l.len - 1, frameAt(st.x))));
          const layer = this.tracks().find((x) => x.id === app.project.activeLayer);
          if (layer) showContextMenu(st.x, st.y, this.frameItems(layer));
        }
        this.sig = '';
        this.update();
        return;
      }
      if (st.mode === 'scrub' || st.mode === 'ruler') this.app.endScrub();
      // a quick flick of the playhead to the left: play from the start
      if (st.mode === 'ruler' && st.acc < -1.5 && e.clientX - st.x < -60) {
        this.app.setFrame(0);
        if (!this.app.playing) this.app.togglePlay();
      }
      this.dragging = false;
      // a flick keeps the frames turning, slowing down (only if the finger was still moving)
      if (st.mode === 'scrub' && !cancelled && Math.abs(st.v) > 0.35 && e.timeStamp - st.lastT < 80) this.startGlide(st.v);
    };
    s.addEventListener('pointerup', (e) => end(e));
    s.addEventListener('pointercancel', (e) => end(e, true));
    this.rangeGesture = new PlaybackRangeGesture(this.app, s, () => ({ parent: this.grid, cell: this.cell, origin: 0, offset: this.label }), () => {
      clearTimeout(holdTimer); start = null; rulerTap = 0; this.dragging = false; this.dragged = true;
    });
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
    // right-click a frame: its options (a press and hold is handled above: it lifts a drawing)
    attachContextMenu(s, ({ x, y, target }) => {
      if ((target as HTMLElement | null)?.closest?.('.flip-eye')) return null;
      const h = this.hit(x, y);
      if (!h || this.dragging) return null;
      this.go(h.layer, h.frame);
      return this.frameItems(h.layer);
    }, { hold: false });
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
      { label: 'Effects…', run: () => app.openEffects?.(l.id) },
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

  // -------------------------------------------------------------------------------------------
  // Dragging near the strip's ends scrolls it (faster closer to the edge), for trims and lifts.
  private edgeRaf = 0;
  private edgeX = 0;
  private edgeTick: (() => void) | null = null;
  /** Keep scrolling while `x` (client px) is near an end; `tick` re-applies the drag after each step. */
  private followEdge(x: number, tick: () => void): void {
    this.edgeX = x;
    this.edgeTick = tick;
    if (!this.edgeRaf) this.edgeRaf = requestAnimationFrame(this.edgeLoop);
  }
  private readonly edgeLoop = (): void => {
    this.edgeRaf = 0;
    const tick = this.edgeTick;
    if (!tick) return;
    const r = this.scroll.getBoundingClientRect();
    const v = edgeScrollSpeed(this.edgeX, r.left + this.label, r.right);
    if (!v) return;
    const was = this.scroll.scrollLeft;
    this.scroll.scrollLeft = was + v;
    if (this.scroll.scrollLeft !== was) {
      this.renderWindow(true);
      tick();
    }
    this.edgeRaf = requestAnimationFrame(this.edgeLoop);
  };
  private stopEdge(): void {
    cancelAnimationFrame(this.edgeRaf);
    this.edgeRaf = 0;
    this.edgeTick = null;
  }

  /** A pointer's position on the strip in frames (fractional; scrolling is already counted). */
  private framePos(clientX: number): number {
    return (clientX - this.grid.getBoundingClientRect().left - this.label) / this.cell;
  }

  /** Where an edge may snap: the playhead's edges and every other track's cuts. */
  private magnets(except: string): number[] {
    const f = this.app.frame;
    const out = [f, f + 1];
    for (const r of this.rows) if (r.layer.id !== except) out.push(...cutPoints(r.layer.exposures, r.layer.start));
    return out;
  }

  /** Show (frame) or hide (null) the snap line. */
  private showSnap(frame: number | null): void {
    this.snapMark.classList.toggle('show', frame !== null);
    if (frame !== null) this.snapMark.style.left = `${this.label + frame * this.cell}px`;
  }

  /**
   * A trim grip. The end grip (every drawing) changes how long the drawing holds; the start grip
   * (the current drawing, not the first) moves its start and gives or takes the frames from the
   * drawing before, so its end stays put. Edges snap to the playhead and the other tracks' cuts
   * (Shift, or moving fast, skips the magnets); dragging near the strip's ends scrolls it.
   */
  private trimHandle(cell: HTMLElement, side: 'start' | 'end' = 'end'): HTMLElement {
    const length = Number(cell.dataset.len);
    const isStart = side === 'start';
    const h = el('div', {
      class: `flip-trim${isStart ? ' start' : ''}`,
      title: isStart ? 'Drag or use arrow keys to move where this drawing starts (the drawing before gives or takes the frames)' : 'Drag or use arrow keys to change the number of frames',
      role: 'slider', tabindex: '0', 'data-own-keys': '',
      'aria-label': isStart ? 'Drawing start' : 'Frame duration', 'aria-orientation': 'horizontal',
      'aria-valuemin': '1', 'aria-valuemax': String(Math.max(1000000, length)), 'aria-valuenow': String(length), 'aria-valuetext': `${length} frame${length === 1 ? '' : 's'}`,
    });
    const focusAfter = () => this.grid.querySelector<HTMLElement>(`.flip-cel.on .flip-trim${isStart ? '.start' : ':not(.start)'}`)?.focus({ preventScroll: true });
    h.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const track = cell.closest<HTMLElement>('.flip-track')?.dataset.id;
      if (track && track !== this.app.project.activeLayer && !['Enter', 'Escape', 'Tab'].includes(e.key)) this.app.pickLayer(track);
      if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); this.app.focusCanvas(); return; }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(e.key)) return;
      e.preventDefault();
      const app = this.app;
      if (app.strokeActive || app.playing) return;
      const i = Number(cell.dataset.i), before = app.project.exposures, current = before[i];
      if (!current) return;
      const delta = (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 1) * (e.shiftKey ? 10 : 1);
      let after: typeof before;
      if (isStart) after = trimStart(before, i, e.key === 'Home' ? current.length - 1 : delta);
      else {
        const n = e.key === 'Home' ? 1 : Math.max(1, Math.min(Math.max(1000000, current.length), current.length + delta));
        after = n === current.length ? before : before.map((x, k) => k === i ? { ...x, length: n } : x);
      }
      if (after === before) return;
      app.previewExposures(after);
      app.commitExposures(isStart ? 'Drawing start' : 'Frame duration', before, after);
      this.sig = ''; this.update();
      focusAfter();
    });
    h.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      h.focus({ preventScroll: true });
      const app = this.app;
      if (app.strokeActive || app.playing) return;
      this.stopGlide();
      const i = Number(cell.dataset.i);
      // a handle on another track: draw on that track first (the strip waits to rebuild until let go)
      this.dragging = true;
      const track = cell.closest<HTMLElement>('.flip-track')?.dataset.id ?? '';
      if (track && track !== app.project.activeLayer) app.pickLayer(track);
      const before = app.project.exposures;
      const len0 = before[i]?.length ?? 1;
      const start0 = app.project.layer.start + startOf(before, i);
      let after = before;
      this.dragging = this.dragged = true;
      cell.classList.add('held');
      try { h.setPointerCapture(e.pointerId); } catch { /* a stale pointer: dragging still works over the handle */ }
      // the edge follows the finger from where it was grabbed
      const grab = this.framePos(e.clientX) - (isStart ? start0 : start0 + len0);
      // Free Trim (Procreate Dreams): another finger down, or Alt, and the next drawing gives or
      // takes the frames, so everything after it stays where it is
      let free = false;
      const other = (ev: PointerEvent) => { if (ev.pointerId !== e.pointerId) free = true; };
      window.addEventListener('pointerdown', other, true);
      const next0 = before[i + 1]?.length ?? 0;
      const prevCel = cell.parentElement?.querySelector<HTMLElement>(`.flip-cel[data-i="${i - 1}"]`);
      const nextCel = cell.parentElement?.querySelector<HTMLElement>(`.flip-cel[data-i="${i + 1}"]`);
      let last = { x: e.clientX, t: e.timeStamp, shift: e.shiftKey, alt: e.altKey };
      let speed = 0;
      const apply = () => {
        const edge = this.framePos(last.x) - grab;
        const radius = last.shift || speed > 1.2 ? 0 : 10 / this.cell;
        const snap = snapEdge(edge, this.magnets(track), radius);
        this.showSnap(snap.snapped);
        if (isStart) {
          after = trimStart(before, i, snap.frame - start0);
          const n = after[i]?.length ?? len0;
          cell.style.setProperty('--s', String(start0 + len0 - n));
          cell.style.setProperty('--n', String(n));
          if (prevCel) prevCel.style.setProperty('--n', String(after[i - 1]?.length ?? 1));
          h.setAttribute('aria-valuenow', String(n));
          h.setAttribute('aria-valuetext', `${n} frame${n === 1 ? '' : 's'}`);
        } else {
          let n = Math.max(1, Math.min(Math.max(1000000, len0), snap.frame - start0));
          const roll = (free || last.alt) && next0 > 0;
          if (roll) n = Math.min(n, len0 + next0 - 1);
          after = before.map((x, k) => (k === i ? { ...x, length: n } : roll && k === i + 1 ? { ...x, length: next0 - (n - len0) } : x));
          cell.style.setProperty('--n', String(n));
          cell.dataset.len = String(n);
          h.setAttribute('aria-valuenow', String(n));
          h.setAttribute('aria-valuetext', `${n} frame${n === 1 ? '' : 's'}`);
          // free trim: the next drawing starts later (or earlier) and ends where it did
          if (nextCel) {
            nextCel.style.setProperty('--s', String(start0 + n));
            nextCel.style.setProperty('--n', String(after[i + 1]?.length ?? next0));
          }
        }
        app.previewExposures(after);
      };
      const move = (ev: PointerEvent) => {
        const dt = Math.max(1, ev.timeStamp - last.t);
        speed = speed * 0.6 + (Math.abs(ev.clientX - last.x) / dt) * 0.4;
        last = { x: ev.clientX, t: ev.timeStamp, shift: ev.shiftKey, alt: ev.altKey };
        apply();
        this.followEdge(ev.clientX, apply);
      };
      const up = () => {
        const focused = document.activeElement === h;
        h.removeEventListener('pointermove', move);
        h.removeEventListener('pointerup', up);
        h.removeEventListener('pointercancel', up);
        window.removeEventListener('pointerdown', other, true);
        this.stopEdge();
        this.showSnap(null);
        cell.classList.remove('held');
        this.dragging = false;
        swallowNextClick();
        app.commitExposures(isStart ? 'Drawing start' : 'Frame duration', before, after);
        this.sig = '';
        this.update();
        if (focused) focusAfter();
      };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up);
      h.addEventListener('pointercancel', up);
    });
    return h;
  }
}
