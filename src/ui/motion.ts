import type { App } from '../app';
import { PlaybackRangeControl } from './playbackrange';
import { autoIcon, iconSvg, setLabel } from './icons';
import { easingOf, EASINGS, isAnimated, spacingTicks, type Easing, type Prop, type Vec2 } from '../core/anim';
import { compLength, layerEnd, PART_NAMES, partOf, playsOn, type DrawingsLayer, type Layer, type PartName, type PlayMode } from '../core/comp';
import { FPS_PRESETS } from '../core/project';
import { newEffect } from '../core/effects';
import { newSeed } from '../core/rng';
import { isPartProp, isPin, keyId, PROP_LABEL, type PropKey, type PropName } from '../compedit';
import { askNumbers, askText, confirmBox, pickBox } from './dialogs';
import { attachContextMenu, type CtxItem } from './contextmenu';
import { rulerStep } from '../core/timecode';

const ZOOM_KEY = '2dope.m3.mcell';
const ROW_KEY = '2dope.m3.mrow';
const LEFT_W = 196;
const DRAG = 4;
const LABELS = ['#9a9aa8', '#ff5a8a', '#ffd24a', '#4aa3ff', '#4ade80', '#c084fc', '#fb923c'];
const KIND_COLOR: Record<Layer['kind'], string> = { drawings: '#6f82e8', comp: '#3fbf8f', camera: '#e0a83c', null: '#8f8fa3' };
type LayerAct = 'rename' | 'up' | 'down' | 'parent' | 'lock' | 'colour' | 'play' | 'delete' | 'enter' | 'ungroup' | 'dup' | 'unique' | 'effects';

const KIND_ICON: Record<Layer['kind'], string> = { drawings: '✎', comp: '▣', camera: '🎥', null: '✛' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function loadNum(key: string, def: number, lo: number, hi: number): number {
  try {
    const n = Number(localStorage.getItem(key));
    if (n >= lo && n <= hi) return n;
  } catch {
    // default
  }
  return def;
}

/** Keep receiving a pointer's events outside the element (synthetic pointers cannot be captured). */
function capture(el: HTMLElement, id: number): void {
  try {
    el.setPointerCapture(id);
  } catch {
    // not capturable: the drag still works while the pointer stays over the grid
  }
}

function fmt(n: number): string {
  return String(Math.round(n * 10) / 10);
}

function show(n: PropName, v: number | Vec2): string {
  if (n === 'remap') return `#${Math.round(v as number) + 1}`;
  if (Array.isArray(v)) return n === 'scale' ? `${fmt(v[0])}, ${fmt(v[1])} %` : `${fmt(v[0])}, ${fmt(v[1])}`;
  if (n === 'rotation') return `${fmt(v)}°`;
  return `${fmt(v)} %`;
}

type Drag =
  | { kind: 'scrub' }
  | { kind: 'bar'; layer: string; mode: 'move' | 'in' | 'out'; x0: number; el: HTMLElement; l0: number; w0: number; moved: boolean }
  | { kind: 'key'; ref: { layer: string; prop: PropKey; f: number }; x0: number; el: HTMLElement; moved: boolean; shift: boolean };

/**
 * The Motion view: the comp's layers as rows with timing bars, twirl-down property rows with
 * keyframes, easing and spacing ticks. It only edits through CompEditor, so everything is
 * undoable and the other views stay in step.
 */
export class MotionPanel {
  private readonly bar = el('div', { class: 'mbar' });
  private readonly scroll = el('div', { class: 'mscroll', tabindex: '0', role: 'region', 'aria-label': 'Layers and keyframes' });
  private readonly grid = el('div', { class: 'mgrid' });
  private readonly playhead = el('div', { class: 'mplayhead' });
  private cell = loadNum(ZOOM_KEY, 28, 8, 80);
  private rowH = loadNum(ROW_KEY, 44, 32, 72);
  private signature = '';
  /** Sounds as rows under the layers (set by the shell). */
  audio: { sig: () => string; rows: (cell: number, end: number) => HTMLElement[] } | null = null;
  /** Simple screen: every layer row shows (otherwise the selected layers, their linked layers and cameras). */
  private allRows = (() => { try { return localStorage.getItem('2dope.motion.allRows') === '1'; } catch { return false; } })();
  private drag: Drag | null = null;
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private pinch: { dist: number; cell: number } | null = null;

  // toolbar bits updated on every change
  private readonly playBtn: HTMLButtonElement;
  private readonly range: PlaybackRangeControl;
  private readonly frameLabel = el('button', { type: 'button', class: 'readout frame-readout', title: 'Frame / length of this comp. Tap to set the length.' });
  private readonly fpsSel: HTMLSelectElement;
  private readonly autoBtn: HTMLButtonElement;
  private readonly startBtn: HTMLButtonElement;
  private readonly camBtn: HTMLButtonElement;
  private readonly easeBtns = new Map<Easing, HTMLButtonElement>();
  private readonly delBtn: HTMLButtonElement;
  private readonly splitBtn: HTMLButtonElement;
  private readonly groupBtn: HTMLButtonElement;
  private readonly multiBtn: HTMLButtonElement;
  private readonly crumbsEl = el('nav', { class: 'mcrumbs', 'aria-label': 'Where you are' });

  constructor(
    private readonly app: App,
    private readonly root: HTMLElement,
  ) {
    const ed = app.editor;
    app.motionMenu = (l) => (l ? this.layerItems(l) : this.layerListItems());
    const btn = (label: string, title: string, fn: () => void, cls = '') => {
      const b = el('button', { type: 'button', title, class: cls }, label);
      b.addEventListener('click', fn);
      return autoIcon(b);
    };
    const group = (...kids: HTMLElement[]) => {
      const g = el('div', { class: 'group' });
      g.append(...kids);
      return g;
    };
    const row = (...kids: HTMLElement[]) => {
      const r = el('div', { class: 'mrowbar' });
      r.append(...kids);
      return r;
    };

    // Transport
    this.playBtn = btn('Play', 'Play / pause (Enter)', () => app.togglePlay(), 'play');
    this.range = new PlaybackRangeControl(app);
    this.frameLabel.addEventListener('click', async () => {
      const c = ed.comp;
      const r = await askNumbers(`${c.name}: length`, [{ label: 'Frames', value: c.duration ?? compLength(c, app.project.comps), unit: c.duration === null ? '(auto)' : '' }]);
      if (r) ed.setDuration(r[0]! > 0 ? r[0]! : null);
    });
    this.fpsSel = el('select', { 'aria-label': 'Frames per second', title: 'Frames per second' });
    for (const f of FPS_PRESETS) this.fpsSel.append(el('option', { value: String(f) }, `${f} fps`));
    this.fpsSel.addEventListener('change', () => app.setFps(Number(this.fpsSel.value)));
    // Row 1: layers
    this.delBtn = btn('Delete', 'Delete the selected layers (Delete)', () => ed.deleteLayers());
    this.splitBtn = btn('Split', 'Split the selected layers at the playhead (Ctrl+Shift+D)', () => this.splitAt());
    this.multiBtn = btn('Select', 'Tap layers to pick several (to group them into a comp)', () => {
      this.ed.multiSelect = !this.ed.multiSelect;
      this.update();
    });
    this.groupBtn = btn('Group', 'Put the selected layers into a new comp (a precomp)', () => void this.groupSelected());
    // the Motion bubbles already offer these: the simple screen hides them here
    const dup = (b: HTMLElement) => { b.dataset.dup = ''; return b; };
    const rowA = row(
      this.crumbsEl,
      group(
        btn('◀', 'Previous frame (←)', () => app.prevFrame()),
        this.playBtn,
        this.range.button,
        btn('▶', 'Next frame (→)', () => app.nextFrame()),
        this.frameLabel,
        this.fpsSel,
      ),
      group(
        dup(btn('+ Drawing', 'A new drawings layer at the playhead', () => ed.addLayer('drawings'))),
        btn('+ Media', 'Bring in a picture, movie or sound: each becomes its own track from frame 1', () => app.pickMedia?.()),
        btn('+ Anchor', 'An invisible anchor other layers can follow (a \u201cnull\u201d): move it and they move with it', () => ed.addLayer('null')),
        dup(btn('+ Camera', 'A camera: pan, rotate and zoom the whole shot', () => ed.addLayer('camera'))),
      ),
      group(
        btn('Flipbook', 'Edit the selected drawing layer frame by frame in Draw’s flipbook', () => app.openFlipbook?.(ed.primary?.kind === 'drawings' ? ed.primary.id : undefined)),
        dup(btn('Effects', 'Effects of the selected drawing layer (line boil, ripple, grain...)', () => {
          const id = ed.primary?.kind === 'drawings' ? ed.primary.id : ed.comp.layers.find((l) => l.kind === 'drawings')?.id;
          if (id) app.openEffects?.(id);
          else app.onNotice?.('Add a drawing layer first, then give it effects.');
        })),
        btn('↑ Up', 'Move the selected layer up (in front)', () => ed.primary && ed.reorder(ed.primary.id, -1)),
        btn('↓ Down', 'Move the selected layer down (behind)', () => ed.primary && ed.reorder(ed.primary.id, 1)),
        this.multiBtn,
        dup(this.groupBtn),
        dup(this.splitBtn),
        this.delBtn,
      ),
    );

    this.autoBtn = btn('● Auto-key', 'Every change you make writes a keyframe at the playhead', () => {
      ed.autoKey = !ed.autoKey;
      this.update();
    });
    this.startBtn = btn('Move from start', 'On: your first key also keeps where things were at the first frame, so they move from the start. Off: they jump straight to the key.', () => {
      ed.keyAtStart = !ed.keyAtStart;
      this.update();
    });
    this.camBtn = btn('Through camera', 'Look through the camera (off: see the whole comp and the camera frame)', () => {
      ed.throughCamera = !ed.throughCamera;
      app.requestRender();
      this.update();
    });

    // Row 3: easing and the key actions
    const ease = el('div', { class: 'group', role: 'group', 'aria-label': 'Easing of the selected keys' });
    ease.append(el('span', { class: 'name' }, 'Easing'));
    for (const e of EASINGS) {
      const b = btn(
        e.label,
        `${e.label}: ${e.id === 'linear' ? 'steady speed' : e.id === 'easeIn' ? 'starts slow, speeds up' : e.id === 'easeOut' ? 'slows down into the next key' : e.id === 'easeInOut' ? 'slow at both ends' : 'jumps at the next key'}. Applies to the selected keys and to new ones.`,
        () => ed.setEasing(e.id),
      );
      this.easeBtns.set(e.id, b);
      ease.append(b);
    }
    const rowC = row(
      group(this.autoBtn, this.startBtn, this.camBtn),
      ease,
      group(
        btn('Reverse', 'Play the selected keys backwards (mirror them in time)', () => ed.reverse()),
        btn('Delete key', 'Delete the selected keys', () => ed.deleteKeys()),
      ),
      group(
        this.slider('Zoom', 'Time zoom', 8, 80, this.cell, (n) => this.setCell(n)),
        this.slider('Rows', 'Row height', 32, 72, this.rowH, (n) => this.setRowH(n)),
      ),
    );

    const extra = el('details', { class: 'motion-extra' });
    extra.append(el('summary', {}, 'Keyframes, easing and view options'), rowC);
    try { extra.open = localStorage.getItem('2dope.motion.extra') === '1'; } catch { /* folded */ }
    extra.addEventListener('toggle', () => {
      try { localStorage.setItem('2dope.motion.extra', extra.open ? '1' : '0'); } catch { /* optional */ }
    });
    this.bar.append(rowA, extra);
    this.scroll.append(this.grid);
    root.append(this.bar, this.scroll);
    root.style.setProperty('--row-h', `${this.rowH}px`);
    this.bind();
    ed.onChange = () => this.update();
  }

  private slider(label: string, title: string, min: number, max: number, value: number, set: (n: number) => void): HTMLElement {
    const g = el('div', { class: 'group' });
    const r = el('input', { type: 'range', min: String(min), max: String(max), step: '1', 'aria-label': title, title, class: 'onion-opacity' });
    r.value = String(value);
    r.addEventListener('input', () => set(Number(r.value)));
    g.append(el('span', { class: 'name' }, label), r);
    return g;
  }

  private setCell(n: number): void {
    this.cell = Math.max(8, Math.min(80, n));
    try {
      localStorage.setItem(ZOOM_KEY, String(this.cell));
    } catch {
      // not remembered
    }
    this.signature = '';
    this.update();
  }

  private setRowH(n: number): void {
    this.rowH = Math.max(32, Math.min(72, n));
    this.root.style.setProperty('--row-h', `${this.rowH}px`);
    try {
      localStorage.setItem(ROW_KEY, String(this.rowH));
    } catch {
      // not remembered
    }
  }

  // -------------------------------------------------------------------------------------------

  private get ed() {
    return this.app.editor;
  }

  private frameAtX(clientX: number): number {
    const r = this.grid.getBoundingClientRect();
    return Math.max(0, Math.floor((clientX - r.left - LEFT_W) / this.cell));
  }

  /** Redraw what depends on the frame, and rebuild the rows when anything structural changed. */
  update(): void {
    const app = this.app;
    const ed = this.ed;
    const c = ed.comp;
    ed.tidy();
    // cheap signature: a counter for edits, plus what else changes how rows look
    let content = 0;
    for (const l of c.layers) if (l.kind === 'drawings') for (const e of l.exposures) content += e.length + 1;
    const simple = !document.body.classList.contains('ui-full');
    const sig = `${simple}|${this.allRows}|${c.id}|${c.fps}|${app.timeFormat}|${ed.rev}|${ed.selected.join(',')}|${[...ed.keys].join(',')}|${[...ed.open].join(',')}|${this.cell}|${this.rowH}|${content}|${app.compEnd}|${this.audio?.sig() ?? ''}`;
    // never rebuild the rows under a finger that is dragging one of them
    if (sig !== this.signature && !this.drag && !this.scrubbing) {
      this.signature = sig;
      this.rebuild();
    }
    // toolbar
    this.frameLabel.textContent = `${app.fmt(app.frame)} / ${app.fmtDur(app.compEnd)}`;
    this.drawEditLine();
    setLabel(this.playBtn, app.playing ? 'Pause' : 'Play', app.playing ? 'pause' : 'play');
    this.playBtn.setAttribute('aria-pressed', String(app.playing));
    this.range.update();
    this.fpsSel.value = String(c.fps);
    this.autoBtn.setAttribute('aria-pressed', String(ed.autoKey));
    this.startBtn.setAttribute('aria-pressed', String(ed.keyAtStart));
    this.camBtn.setAttribute('aria-pressed', String(ed.throughCamera));
    this.camBtn.hidden = !ed.hasCamera();
    this.delBtn.disabled = !ed.selected.length;
    this.splitBtn.disabled = !ed.selected.length;
    this.groupBtn.disabled = !ed.selected.length;
    this.multiBtn.setAttribute('aria-pressed', String(this.ed.multiSelect));
    this.renderCrumbs();
    const cur = ed.easingOfSelection();
    for (const [e, b] of this.easeBtns) b.setAttribute('aria-pressed', String(ed.keys.size ? cur === e : ed.lastEase === e));
    // playhead and live values
    this.playhead.style.width = `${this.cell}px`;
    this.playhead.style.transform = `translateX(${LEFT_W + app.frame * this.cell}px)`;
    for (const v of this.grid.querySelectorAll<HTMLElement>('[data-val]')) {
      const l = ed.layer(v.dataset.layer ?? '');
      if (l) v.textContent = show(ed.rowProp(v.dataset.val as PropKey), ed.valueNow(l, v.dataset.val as PropKey));
    }
    for (const k of this.grid.querySelectorAll<HTMLElement>('[data-diamond]')) {
      const l = ed.layer(k.dataset.layer ?? '');
      if (!l) continue;
      const n = k.dataset.diamond as PropKey;
      const p = ed.getProp(l, n);
      const on = p.keys.some((x) => x.f === ed.frameOf(l, n));
      k.classList.toggle('on', on);
      k.title = on ? 'Remove the keyframe at the playhead' : 'Add a keyframe at the playhead';
    }
    this.keepVisible();
  }

  /** "Shot › Walk cycle": tap a step to go back out to it. Hidden at the top level. */
  private renderCrumbs(): void {
    const crumbs = this.ed.crumbs();
    const sig = crumbs.map((c) => `${c.comp.id}:${c.comp.name}`).join('/');
    if (this.crumbsEl.dataset.sig === sig) return;
    this.crumbsEl.dataset.sig = sig;
    this.crumbsEl.replaceChildren();
    this.crumbsEl.hidden = crumbs.length < 2;
    crumbs.forEach((c, i) => {
      if (i) this.crumbsEl.append(el('span', { class: 'sep' }, '›'));
      const last = i === crumbs.length - 1;
      const b = el('button', { type: 'button', class: 'crumb', 'aria-current': String(last), title: last ? 'You are editing this comp' : `Back out to ${c.comp.name}` }, c.comp.name);
      if (!last) b.addEventListener('click', () => this.ed.exit(i));
      this.crumbsEl.append(b);
    });
  }

  private readonly editLineEl = el('div', { class: 'editline' });
  private readonly editShiftEl = el('div', { class: 'editshift' });

  /** The edge being changed (from any timeline), as a line on this one, with what will shift shaded. */
  private drawEditLine(): void {
    const e = this.app.editLine;
    if (!e) {
      this.editLineEl.remove();
      this.editShiftEl.remove();
      return;
    }
    const x = LEFT_W + e.frame * this.cell;
    this.editLineEl.style.left = `${x}px`;
    this.editLineEl.dataset.label = this.app.editLineLabel();
    this.editLineEl.classList.toggle('flip', x > this.grid.offsetWidth - 180);
    if (!this.editLineEl.isConnected) this.grid.append(this.editLineEl);
    if (e.shift) {
      this.editShiftEl.style.left = `${x}px`;
      this.editShiftEl.style.width = `${Math.max(0, this.grid.offsetWidth - x)}px`;
      if (!this.editShiftEl.isConnected) this.grid.append(this.editShiftEl);
    } else this.editShiftEl.remove();
  }

  /** Group the selected layers into a comp (the bubbles' Group). */
  group(): void {
    if (!this.ed.selected.length) {
      this.app.onNotice?.('Select the layers to group first (tap Select, then the layers).');
      return;
    }
    void this.groupSelected();
  }

  /** Split the selected layers at the playhead (the bubbles' Split). */
  split(): void {
    this.splitAt();
  }

  private async groupSelected(): Promise<void> {
    const ed = this.ed;
    if (!ed.selected.length) return;
    const first = ed.layer(ed.selected[0]!);
    const name = await askText('Group into a comp', `${first?.name ?? 'Layers'} comp`, 'Group');
    if (name === null) return;
    ed.group([...ed.selected], name);
    this.ed.multiSelect = false;
    this.update();
  }

  private keepVisible(): void {
    if (this.drag) return;
    const x = LEFT_W + this.app.frame * this.cell;
    const s = this.scroll;
    if (this.app.playing || !this.pointers.size) {
      if (x + this.cell > s.scrollLeft + s.clientWidth) s.scrollLeft = x - s.clientWidth / 2;
      else if (x < s.scrollLeft + LEFT_W) s.scrollLeft = Math.max(0, x - LEFT_W - this.cell * 2);
    }
  }

  private rebuild(): void {
    const ed = this.ed;
    const app = this.app;
    const c = ed.comp;
    const comps = app.project.comps;
    const end = Math.max(compLength(c, comps), 24) + 24;
    const width = LEFT_W + end * this.cell;
    this.grid.replaceChildren();
    this.grid.style.width = `${width}px`;

    // ruler
    const ruler = el('div', { class: 'mrow ruler' });
    const corner = el('div', { class: 'mleft' });
    corner.append(el('span', { class: 'hint' }, `${c.name} · ${c.width}×${c.height}`));
    const rr = el('div', { class: 'mright' });
    rr.style.width = `${end * this.cell}px`;
    const step = rulerStep(this.cell, c.fps, app.timeFormat);
    for (let f = 0; f < end; f += step) {
      const t = el('span', { class: f % c.fps === 0 ? 'tick sec' : 'tick' }, app.fmt(f));
      t.style.left = `${f * this.cell}px`;
      rr.append(t);
    }
    // the comp's end
    const stop = compLength(c, comps);
    const endMark = el('div', { class: 'mend' });
    endMark.style.left = `${stop * this.cell}px`;
    rr.append(endMark);
    ruler.append(corner, rr);
    this.grid.append(ruler);

    // layers. On the simple screen only the ones you work with show (the selected layers, their
    // linked art layers, cameras); the rest fold into one row, like Draw's timeline
    const simple = !document.body.classList.contains('ui-full');
    const picked = new Set(ed.selected);
    const cels = new Set(c.layers.filter((l) => picked.has(l.id) && l.kind === 'drawings' && l.cel).map((l) => (l.kind === 'drawings' ? l.cel : '')));
    const keep = (l: (typeof c.layers)[number]) => picked.has(l.id) || l.kind === 'camera' || (l.kind === 'drawings' && !!l.cel && cels.has(l.cel));
    const folding = simple && c.layers.length > 4 && picked.size > 0;
    const hidden = folding ? c.layers.filter((l) => !keep(l)).length : 0;
    const shown = folding && !this.allRows ? c.layers.filter(keep) : c.layers;
    for (const l of shown) {
      this.grid.append(this.layerRow(l, end));
      if (ed.open.has(l.id)) {
        for (const n of ed.rowsOf(l)) this.grid.append(this.propRow(l, n, end));
        if (l.kind === 'drawings') {
          for (const part of PART_NAMES.slice().reverse()) {
            this.grid.append(this.partRow(l, part, end));
            if (ed.open.has(`${l.id}#${part}`)) for (const n of [`${part}.opacity`, `${part}.offset`] as PropKey[]) this.grid.append(this.propRow(l, n, end));
          }
        }
      }
    }
    if (hidden) {
      const more = el('div', { class: 'mrow mmore' });
      const b = el('button', { type: 'button', class: 'mmore-btn', title: this.allRows ? 'Show only the selected layers, their linked layers and cameras' : 'Show every layer' }, this.allRows ? '\u25be Fewer layers' : `\u25b8 ${hidden} more layer${hidden === 1 ? '' : 's'}`);
      b.addEventListener('click', () => {
        this.allRows = !this.allRows;
        try { localStorage.setItem('2dope.motion.allRows', this.allRows ? '1' : '0'); } catch { /* optional */ }
        this.signature = '';
        this.update();
      });
      more.append(b);
      this.grid.append(more);
    }
    // sounds: rows on the same clock, drag to move or trim (the top comp's sounds)
    if (this.audio && c === app.project.comp) for (const r of this.audio.rows(this.cell, end)) this.grid.append(r);
    if (!c.layers.length) {
      const empty = el('div', { class: 'mempty' });
      empty.append(el('p', {}, 'No layers yet.'), el('p', { class: 'hint' }, 'Add a drawing layer, a null or a camera above. Then drag things on the canvas to move, scale and rotate them.'));
      this.grid.append(empty);
    }
    this.grid.append(this.playhead);
  }

  private layerRow(l: Layer, end: number): HTMLElement {
    const ed = this.ed;
    const comps = this.app.project.comps;
    const sel = ed.selected.includes(l.id);
    const row = el('div', { class: `mrow layer${sel ? ' selected' : ''}${l.visible ? '' : ' off'}`, 'data-layer': l.id });
    const left = el('div', { class: 'mleft' });
    const chev = el('button', { type: 'button', class: 'chev', 'aria-label': ed.open.has(l.id) ? 'Hide properties' : 'Show properties', 'data-act': 'twirl' }, ed.open.has(l.id) ? '▾' : '▸');
    const dot = el('span', { class: 'ldot' });
    dot.style.background = LABELS[l.label] ?? LABELS[0]!;
    const name = el('button', { type: 'button', class: 'lname', 'data-act': 'name', title: 'Tap to select. Double-tap to rename.' }, `${KIND_ICON[l.kind]} ${l.name}`);
    const eye = el('button', { type: 'button', class: 'leye', 'aria-pressed': String(l.visible), title: l.visible ? 'Hide this layer' : 'Show this layer', 'data-act': 'eye' }, l.visible ? '' : '–');
    if (l.visible) eye.innerHTML = iconSvg('eye');
    const more = el('button', { type: 'button', class: 'lmore', 'aria-label': `More for ${l.name}`, 'data-act': 'more' }, '⋯');
    left.append(chev, dot, name);
    if (l.parent) {
      const pn = ed.layer(l.parent)?.name ?? '?';
      left.append(el('button', { type: 'button', class: 'lparent', title: `Parented to ${pn}. Tap to change.`, 'data-act': 'parent' }, `⤷ ${pn}`));
    }
    left.append(eye, more);

    const right = el('div', { class: 'mright' });
    right.style.width = `${end * this.cell}px`;
    const stop = layerEnd(l, comps);
    const last = Number.isFinite(stop) ? stop : Math.max(compLength(ed.comp, comps), l.in + 1);
    const b = el('div', { class: 'mbar-el', 'data-bar': l.id });
    b.style.left = `${l.in * this.cell}px`;
    b.style.width = `${Math.max(1, last - l.in) * this.cell}px`;
    b.style.background = l.label ? (LABELS[l.label] ?? LABELS[0]!) : KIND_COLOR[l.kind];
    b.append(el('span', { class: 'mh in', 'data-handle': 'in' }), el('span', { class: 'mh out', 'data-handle': 'out' }));
    if (l.kind === 'drawings' || l.kind === 'comp') {
      // content cycle marks help when a layer loops or starts later than its in point
      const mark = l.timeRemap?.keys.length ? '⇄' : { once: '', loop: '↻', pingpong: '⇋', single: '▣' }[l.play];
      if (mark) b.append(el('span', { class: 'mloop', title: l.timeRemap?.keys.length ? 'Frames picked by the Frame row' : `Plays: ${l.play}` }, mark));
    }
    right.append(b);
    row.append(left, right);
    return row;
  }

  /** The header of one part (Line or Fill) under a drawings layer: eye, name, colour, and its rows. */
  private partRow(l: DrawingsLayer, part: PartName, end: number): HTMLElement {
    const ed = this.ed;
    const p = partOf(l, part);
    const key = `${l.id}#${part}`;
    const open = ed.open.has(key);
    const label = part === 'line' ? 'Line' : 'Fill';
    const row = el('div', { class: `mrow part${ed.selected.includes(l.id) ? ' selected' : ''}${p.visible ? '' : ' off'}`, 'data-layer': l.id, 'data-part': part });
    const left = el('div', { class: 'mleft' });
    const chev = el('button', { type: 'button', class: 'chev', 'aria-label': open ? `Hide ${label} properties` : `Show ${label} properties`, 'data-act': 'parttwirl' }, open ? '▾' : '▸');
    const eye = el(
      'button',
      {
        type: 'button',
        class: 'leye',
        'aria-pressed': String(p.visible),
        title: p.visible ? `Hide the ${label.toLowerCase()} of this layer` : `Show the ${label.toLowerCase()}`,
        'data-act': 'parteye',
      },
      p.visible ? '' : '–',
    );
    if (p.visible) eye.innerHTML = iconSvg('eye');
    const name = el('button', { type: 'button', class: 'lname part-name', 'data-act': 'parttwirl', title: `${label} part: tap to show its opacity and offset rows` }, label);
    // colour: tapping opens the system picker; a small ✕ goes back to the drawing's own colours
    const tint = el('input', {
      type: 'color',
      class: `ptint${p.tint ? ' on' : ''}`,
      value: p.tint ?? (part === 'line' ? '#222222' : '#888888'),
      title: p.tint ? `${label} recoloured (tap to change)` : `Recolour the ${label.toLowerCase()} of the whole layer`,
      'aria-label': `${label} colour`,
    });
    tint.addEventListener('change', () => ed.setPart(l.id, part, { tint: tint.value }));
    left.append(chev, eye, name, tint);
    // recolour style, like the Fill tool: one colour, or a gradient (linear / radial) to a second
    const style = p.grad?.kind ?? 'flat';
    const next = { flat: 'linear', linear: 'radial', radial: 'flat' } as const;
    const glyph = { flat: '\u25ac', linear: '\u25e2', radial: '\u25ce' }[style];
    const styleBtn = el('button', { type: 'button', class: `pgrad${p.grad ? ' on' : ''}`, title: `${label} colour: ${style === 'flat' ? 'one colour' : `${style} gradient`}. Tap for ${next[style] === 'flat' ? 'one colour' : `a ${next[style]} gradient`} (hold or right-click for more)`, 'aria-label': `${label} colour style` }, glyph);
    styleBtn.addEventListener('click', () => this.setPartStyle(l, part, next[style]));
    left.append(styleBtn);
    if (p.grad) {
      const c2 = el('input', { type: 'color', class: 'ptint on', value: p.grad.color2, title: `The colour the ${label.toLowerCase()} gradient goes to`, 'aria-label': `${label} second colour` });
      c2.addEventListener('change', () => ed.setPart(l.id, part, { grad: { ...p.grad!, color2: c2.value } }));
      left.append(c2);
    }
    if (p.tint) left.append(el('button', { type: 'button', class: 'pstar', 'data-act': 'parttintclear', title: 'Back to the drawing’s own colours' }, '✕'));
    const right = el('div', { class: 'mright' });
    right.style.width = `${end * this.cell}px`;
    row.append(left, right);
    return row;
  }

  private propRow(l: Layer, n: PropKey, end: number): HTMLElement {
    const ed = this.ed;
    const p = ed.getProp(l, n);
    const kind = ed.rowProp(n);
    // inside a precomp, a ★ pins a property so every instance of this comp gets a control for it
    const inside = ed.crumbs().length > 1 || ed.instances(ed.comp.id) > 0;
    const row = el('div', { class: `mrow prop${ed.selected.includes(l.id) ? ' selected' : ''}`, 'data-layer': l.id, 'data-prop': n });
    const left = el('div', { class: 'mleft' });
    left.append(
      el('span', { class: `pname${isPin(n) ? ' pin' : ''}`, title: ed.rowLabel(l, n) }, isPin(n) ? ed.rowLabel(l, n) : PROP_LABEL[kind]),
      el(
        'button',
        {
          type: 'button',
          class: `pval${ed.isOverridden(l, n) ? ' over' : ''}`,
          'data-val': n,
          'data-layer': l.id,
          'data-act': 'value',
          title: isPin(n) ? "This instance's value. Tap to type one." : 'Tap to type a value',
        },
        show(kind, ed.valueNow(l, n)),
      ),
    );
    (left.lastElementChild as HTMLElement).title = 'Drag left / right to change (Shift ×10, Alt fine). Tap to type a value.';
    if (isPin(n) && ed.isOverridden(l, n)) left.append(el('button', { type: 'button', class: 'pstar', 'data-act': 'reset', 'data-row': n, title: "Back to the comp's own value" }, '↺'));
    else if (!isPin(n) && n !== 'remap' && !isPartProp(n) && inside) {
      const on = ed.isPinned(l.id, n as PropName);
      left.append(
        el(
          'button',
          {
            type: 'button',
            class: `pstar${on ? ' on' : ''}`,
            'data-act': 'pin',
            'data-row': n,
            'aria-pressed': String(on),
            title: on ? 'Pinned: every instance of this comp shows this property. Tap to unpin.' : 'Pin: show this property on every instance of this comp',
          },
          '★',
        ),
      );
    }
    left.append(
      el(
        'button',
        { type: 'button', class: `pkey${isAnimated(p) ? ' anim' : ''}`, 'data-diamond': n, 'data-layer': l.id, 'data-act': 'diamond', 'aria-label': `Keyframe for ${ed.rowLabel(l, n)}` },
        '◆',
      ),
    );
    const right = el('div', { class: 'mright' });
    right.style.width = `${end * this.cell}px`;
    const off = this.keyOffset(l, n);
    const x = (f: number) => (f + off) * this.cell + this.cell / 2;
    // segments, spacing ticks and easing label for segments that start at a selected key
    for (let i = 0; i < p.keys.length; i++) {
      const k = p.keys[i]!;
      const next = p.keys[i + 1];
      if (next) {
        const seg = el('div', { class: 'mseg' });
        seg.style.left = `${x(k.f)}px`;
        seg.style.width = `${(next.f - k.f) * this.cell}px`;
        right.append(seg);
        if (ed.keys.has(keyId({ layer: l.id, prop: n, f: k.f }))) {
          for (const t of spacingTicks(p, k.f)) {
            const tick = el('i', { class: 'mtick' });
            tick.style.left = `${x(k.f) + t * (next.f - k.f) * this.cell}px`;
            right.append(tick);
          }
          const e = easingOf(k.out, next.in);
          const lab = el('span', { class: 'mease' }, e ? (EASINGS.find((z) => z.id === e)?.label ?? '') : 'Custom');
          lab.style.left = `${(x(k.f) + x(next.f)) / 2}px`;
          right.append(lab);
        }
      }
    }
    for (const k of p.keys) {
      const ref = { layer: l.id, prop: n, f: k.f };
      const d = el('div', {
        class: `mkey${ed.keys.has(keyId(ref)) ? ' selected' : ''}${k.out.interp === 'hold' ? ' hold' : k.out.interp === 'bezier' || k.in.interp === 'bezier' ? ' eased' : ''}`,
        'data-key': keyId(ref),
        title: 'Tap to select, drag to retime',
      });
      d.style.left = `${x(k.f)}px`;
      right.append(d);
    }
    row.append(left, right);
    return row;
  }

  // -------------------------------------------------------------------------------------------
  // Input

  private bind(): void {
    const g = this.grid;
    g.addEventListener('click', (e) => void this.onClick(e));
    g.addEventListener('pointerdown', (e) => this.scrubDown(e));
    g.addEventListener('pointerdown', (e) => this.onDown(e));
    g.addEventListener('pointermove', (e) => this.onMove(e));
    g.addEventListener('pointerup', (e) => this.onUp(e, false));
    g.addEventListener('pointercancel', (e) => this.onUp(e, true));
    // right-click, or press and hold: the menu for the key, property or layer under the finger
    attachContextMenu(g, ({ target }) => this.contextItems(target as HTMLElement), {
      onHold: () => {
        if (this.drag?.kind === 'scrub') this.app.endScrub();
        this.drag = null;
      },
    });
    this.scroll.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey && !e.altKey) return;
        e.preventDefault();
        this.setCell(this.cell * Math.exp(-e.deltaY * 0.01));
      },
      { passive: false },
    );
    this.scroll.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        if (this.ed.keys.size) this.ed.deleteKeys();
        else this.ed.deleteLayers();
      }
    });
  }

  // -------------------------------------------------------------------------------------------
  // Scrub a value: press on a number and drag left / right (After Effects' hot text). A tap with
  // no drag still opens the type-a-value box. On a pair (position, scale) the half you press picks
  // x or y; scale moves both when they were equal.

  private scrubbing: { id: number; el: HTMLElement; x0: number; layer: string; prop: PropKey; start: number | Vec2; part: 0 | 1; moved: boolean } | null = null;
  private eatClick = false;

  private scrubDown(e: PointerEvent): void {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.pval');
    if (!b || e.button !== 0) return;
    const l = this.ed.layer(b.dataset.layer ?? '');
    if (!l || l.locked) return;
    const n = b.dataset.val as PropKey;
    const r = b.getBoundingClientRect();
    this.scrubbing = { id: e.pointerId, el: b, x0: e.clientX, layer: l.id, prop: n, start: this.ed.valueNow(l, n), part: e.clientX > r.left + r.width / 2 ? 1 : 0, moved: false };
    capture(b, e.pointerId);
    b.addEventListener('pointermove', this.scrubMove);
    b.addEventListener('pointerup', this.scrubUp);
    b.addEventListener('pointercancel', this.scrubUp);
  }

  private readonly scrubMove = (e: PointerEvent): void => {
    const s = this.scrubbing;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x0;
    if (!s.moved && Math.abs(dx) < 4) return;
    if (!s.moved) {
      s.moved = true;
      this.ed.scrubStart();
      s.el.classList.add('scrubbing');
    }
    const kind = this.ed.rowProp(s.prop);
    const per = kind === 'position' || kind === 'anchor' ? 1 : kind === 'remap' ? 1 / 8 : 0.5;
    const mod = e.shiftKey ? 10 : e.altKey || e.ctrlKey || e.metaKey ? 0.1 : 1;
    const d = dx * per * mod;
    let v: number | Vec2;
    if (Array.isArray(s.start)) {
      const [x, y] = s.start;
      if (kind === 'scale' && Math.abs(x - y) < 1e-6) v = [x + d, y + d];
      else v = s.part === 0 ? [x + d, y] : [x, y + d];
    } else {
      v = s.start + d;
      if (kind === 'opacity') v = Math.max(0, Math.min(100, v));
      else if (kind === 'zoom') v = Math.max(1, v);
      else if (kind === 'remap') {
        const l = this.ed.layer(s.layer);
        v = Math.max(0, Math.min((l ? this.ed.contentLength(l) : 1) - 1, Math.round(v)));
      }
    }
    this.ed.scrubSet(s.layer, s.prop, v);
  };

  private readonly scrubUp = (e: PointerEvent): void => {
    const s = this.scrubbing;
    if (!s || e.pointerId !== s.id) return;
    this.scrubbing = null;
    s.el.removeEventListener('pointermove', this.scrubMove);
    s.el.removeEventListener('pointerup', this.scrubUp);
    s.el.removeEventListener('pointercancel', this.scrubUp);
    s.el.classList.remove('scrubbing');
    if (!s.moved) return; // a tap: the click opens the type-a-value box
    this.eatClick = true;
    const l = this.ed.layer(s.layer);
    this.ed.scrubEnd(`Change ${l ? this.ed.rowLabel(l, s.prop).toLowerCase() : 'value'}`, e.type === 'pointercancel');
    this.signature = '';
    this.update();
  };

  private async onClick(e: MouseEvent): Promise<void> {
    if (this.eatClick) {
      this.eatClick = false;
      return;
    }
    const t = e.target as HTMLElement;
    const act = t.closest<HTMLElement>('[data-act]');
    if (!act) return;
    const row = act.closest<HTMLElement>('[data-layer]');
    const id = (row?.dataset.layer ?? act.dataset.layer) as string;
    const l = this.ed.layer(id);
    if (!l) return;
    const ed = this.ed;
    switch (act.dataset.act) {
      case 'twirl':
        if (ed.open.has(id)) ed.open.delete(id);
        else ed.open.add(id);
        this.signature = '';
        this.update();
        break;
      case 'name':
        if (e.detail >= 2) {
          // double-tap: go inside a precomp; rename anything else
          if (l.kind === 'comp') ed.enter(id);
          else {
            const name = await askText('Layer name', l.name, 'Rename');
            if (name !== null) ed.rename(id, name);
          }
        } else {
          ed.select(id, ed.multiSelect || e.shiftKey || e.ctrlKey || e.metaKey);
          ed.open.add(id);
          this.signature = '';
          this.update();
        }
        break;
      case 'eye':
        ed.setFlag(id, 'visible', !l.visible);
        break;
      case 'parttwirl':
      case 'parteye':
      case 'parttintclear': {
        const part = row?.dataset.part as PartName | undefined;
        if (!part || l.kind !== 'drawings') break;
        const key = `${id}#${part}`;
        if (act.dataset.act === 'parttwirl') {
          if (ed.open.has(key)) ed.open.delete(key);
          else ed.open.add(key);
          this.signature = '';
          this.update();
        } else if (act.dataset.act === 'parteye') ed.setPart(id, part, { visible: !partOf(l, part).visible });
        else ed.setPart(id, part, { tint: null });
        break;
      }
      case 'more':
        await this.layerMenu(l);
        break;
      case 'parent':
        await this.pickParent(l);
        break;
      case 'diamond':
        ed.toggleKey(id, act.dataset.diamond as PropKey);
        break;
      case 'value':
        await this.editValue(l, act.dataset.val as PropKey);
        break;
      case 'pin':
        ed.togglePin(id, act.dataset.row as PropName);
        break;
      case 'reset':
        ed.resetPin(id, act.dataset.row as PropKey);
        break;
    }
  }

  /** Playback of a drawings or precomp layer: once, loop, ping-pong, hold one frame; speed. */
  private async playMenu(l: Layer): Promise<void> {
    if (l.kind !== 'drawings' && l.kind !== 'comp') return;
    const ed = this.ed;
    const len = ed.contentLength(l);
    type P = PlayMode | 'speed';
    const pick = await pickBox<P>(`${l.name}: playback`, [
      { label: `${l.play === 'once' ? '● ' : ''}Once`, value: 'once', hint: ' play it through, then it ends (or holds its last frame if you make the layer longer)' },
      { label: `${l.play === 'loop' ? '● ' : ''}Loop`, value: 'loop', hint: ' repeat it' },
      { label: `${l.play === 'pingpong' ? '● ' : ''}Ping-pong`, value: 'pingpong', hint: ' forwards, then backwards' },
      { label: `${l.play === 'single' ? '● ' : ''}Hold one frame…`, value: 'single', hint: ' always show the same frame (a pose or a mouth)' },
      { label: `Speed… (now ${l.speed}×)`, value: 'speed' },
    ]);
    if (!pick) return;
    if (pick === 'speed') {
      const r = await askNumbers(`${l.name}: speed`, [{ label: 'Speed', value: l.speed, step: 0.05, unit: '×' }]);
      if (r) ed.setPlay(l.id, l.play, { speed: r[0]! });
    } else if (pick === 'single') {
      const r = await askNumbers(`${l.name}: hold frame`, [{ label: 'Frame', value: (ed.contentFrame(l) ?? 0) + 1, unit: `of ${len}` }]);
      if (r) ed.setPlay(l.id, 'single', { single: Math.max(0, Math.min(len - 1, Math.round(r[0]!) - 1)) });
    } else ed.setPlay(l.id, pick);
  }

  private async editValue(l: Layer, n: PropKey): Promise<void> {
    const v = this.ed.valueNow(l, n);
    const kind = this.ed.rowProp(n);
    if (kind === 'remap') {
      // a swap: show this frame of the layer's own timeline from the playhead on
      const len = this.ed.contentLength(l);
      const r = await askNumbers(`${l.name}: show frame`, [{ label: 'Frame', value: (v as number) + 1, unit: `of ${len}` }]);
      if (r) this.ed.setValue(l.id, n, Math.max(0, Math.min(len - 1, Math.round(r[0]!) - 1)), 'Pick frame');
      return;
    }
    const title = `${l.name}: ${this.ed.rowLabel(l, n)}`;
    if (Array.isArray(v)) {
      const unit = kind === 'scale' ? '%' : 'px';
      const r = await askNumbers(title, [
        { label: 'X', value: v[0], unit },
        { label: 'Y', value: v[1], unit },
      ]);
      if (r) this.ed.setValue(l.id, n, [r[0]!, r[1]!], `Change ${PROP_LABEL[kind].toLowerCase()}`);
    } else {
      const r = await askNumbers(title, [{ label: PROP_LABEL[kind], value: v, unit: kind === 'rotation' ? '°' : '%' }]);
      if (r) this.ed.setValue(l.id, n, kind === 'opacity' ? Math.max(0, Math.min(100, r[0]!)) : r[0]!, `Change ${PROP_LABEL[kind].toLowerCase()}`);
    }
  }

  /**
   * Where a row's keys sit on this comp's time: a layer's keys are in its own time (shift by its
   * start); a pinned property's keys are in the time of the layer inside the precomp.
   */
  private keyOffset(l: Layer, n: PropKey): number {
    if (!isPin(n) || l.kind !== 'comp') return l.start;
    const nested = this.app.project.comps.get(l.comp);
    const inner = nested?.layers.find((x) => x.id === n.split(':')[1]);
    if (!nested || !inner) return l.start;
    // same fps is the normal case; otherwise this is approximate (the playhead mapping is exact)
    return l.start + Math.round((inner.start * this.ed.comp.fps) / nested.fps);
  }

  private async pickParent(l: Layer): Promise<void> {
    const others = this.ed.comp.layers.filter((x) => x.id !== l.id);
    const choice = await pickBox<string | null>('Parent to', [{ label: 'No parent', value: null }, ...others.map((x) => ({ label: `${KIND_ICON[x.kind]} ${x.name}`, value: x.id as string | null }))]);
    if (choice === undefined) return;
    if (!this.ed.setParentOf(l.id, choice)) this.app.editor.onChange();
  }

  /** The context menu for what is under the pointer in the layer list / time area. */
  private contextItems(t: HTMLElement): CtxItem[] | null {
    const ed = this.ed;
    const key = t.closest<HTMLElement>('[data-key]');
    if (key) {
      const [layer, prop, f] = key.dataset.key!.split('|');
      const ref = { layer: layer!, prop: prop as PropKey, f: Number(f) };
      if (!ed.keys.has(keyId(ref))) ed.selectKey(ref);
      const n = ed.keys.size;
      const ease = (label: string, e: Easing) => ({ label, title: `Easing: ${label}`, run: () => ed.setEasing(e) });
      return [
        { title: n > 1 ? `${n} keys` : 'Key' },
        { chips: [ease('Linear', 'linear'), ease('Ease in', 'easeIn'), ease('Ease out', 'easeOut'), ease('In & out', 'easeInOut'), ease('Hold', 'hold')] },
        { label: 'Reverse', run: () => ed.reverse() },
        { label: 'Go to this key', run: () => this.app.setFrame((ed.layer(ref.layer)?.start ?? 0) + ref.f) },
        { sep: true },
        { label: n > 1 ? 'Delete keys' : 'Delete key', run: () => ed.deleteKeys(), danger: true, hint: 'Del' },
      ];
    }
    const row = t.closest<HTMLElement>('[data-layer], [data-bar]');
    const id = row?.dataset.layer ?? row?.dataset.bar;
    const l = id ? ed.layer(id) : null;
    if (!l) return this.layerListItems();
    const part = row?.dataset.part as PartName | undefined;
    if (part && l.kind === 'drawings') {
      const p = partOf(l, part);
      const name = part === 'line' ? 'Line' : 'Fill';
      return [
        { title: `${name} of ${l.name}` },
        { label: p.visible ? `Hide ${name.toLowerCase()}` : `Show ${name.toLowerCase()}`, run: () => ed.setPart(l.id, part, { visible: !p.visible }) },
        ...(p.tint ? [{ label: 'Original colours', run: () => ed.setPart(l.id, part, { tint: null, grad: null }) }] : []),
        { title: 'Colour' },
        { chips: (['flat', 'linear', 'radial'] as const).map((k) => ({ label: k === 'flat' ? '\u25ac One colour' : k === 'linear' ? '\u25e2 Linear' : '\u25ce Radial', on: (p.grad?.kind ?? (p.tint ? 'flat' : '')) === k, run: () => this.setPartStyle(l, part, k) })) },
        ...(p.grad?.kind === 'linear' ? [{ title: 'Direction' }, { chips: [[0, '\u2192'], [45, '\u2198'], [90, '\u2193'], [135, '\u2199'], [180, '\u2190'], [225, '\u2196'], [270, '\u2191'], [315, '\u2197']].map(([deg, g]) => ({ label: String(g), title: `${deg}\u00b0`, on: p.grad!.angle === deg, run: () => ed.setPart(l.id, part, { grad: { ...p.grad!, angle: Number(deg) } }) })) }] : []),
        { sep: true },
        { label: `Add a texture to the ${name.toLowerCase()}\u2026`, run: () => this.addPartTexture(l, part) },
        { label: `Reset ${name.toLowerCase()} settings`, run: () => ed.resetPart(l.id, part), danger: true },
      ];
    }
    const prop = row?.dataset.prop as PropKey | undefined;
    if (prop) {
      return [
        { title: ed.rowLabel(l, prop) },
        { label: 'Key at the playhead (add / remove)', run: () => ed.toggleKey(l.id, prop) },
        { label: 'Type a value…', run: () => this.editValue(l, prop) },
        { label: 'Clear animation (keep the value here)', run: () => ed.clearAnimation(l.id, prop), danger: true },
      ];
    }
    if (!ed.selected.includes(l.id)) ed.select(l.id);
    return this.layerItems(l);
  }

  /** One colour, or a gradient from the recolour to a second colour (a recolour is made if needed). */
  private setPartStyle(l: DrawingsLayer, part: PartName, k: 'flat' | 'linear' | 'radial'): void {
    const ed = this.ed;
    const p = partOf(l, part);
    if (k === 'flat') { ed.setPart(l.id, part, { grad: null }); return; }
    const tint = p.tint ?? (part === 'line' ? '#222222' : '#ff5a8a');
    const grad = { kind: k, color2: p.grad?.color2 ?? (part === 'line' ? '#5a7dff' : '#5ad1ff'), angle: p.grad?.angle ?? 90 };
    if (!p.tint) ed.setPart(l.id, part, { tint });
    ed.setPart(l.id, part, { grad });
  }

  /** A Texture effect aimed at this part, then the Effects card to tune it. */
  private addPartTexture(l: DrawingsLayer, part: PartName): void {
    const fx = newEffect('texture', `fx${Date.now().toString(36)}`, newSeed());
    fx.target = part;
    this.ed.edit(`Texture on ${part}`, (c) => {
      const x = c.layers.find((y) => y.id === l.id);
      if (x && x.kind === 'drawings') x.effects = [...(x.effects ?? []), fx];
    });
    this.app.requestRender();
    this.app.openEffects?.(l.id);
  }

  /** Split the selected layers at the playhead; says so when nothing spans it. */
  private splitAt(): void {
    if (!this.ed.split()) this.app.onNotice?.('Move the playhead inside a layer to split it there.');
  }

  /** Context menu entries for one layer (the canvas in Motion uses them too). */
  layerItems(l: Layer): CtxItem[] {
    const ed = this.ed;
    return [
      { title: l.name },
      { label: l.visible ? 'Hide' : 'Show', run: () => ed.setFlag(l.id, 'visible', !l.visible) },
      ...(l.kind === 'drawings' || l.kind === 'comp' ? [{ label: 'Split at the playhead', hint: 'Ctrl+Shift+D', run: () => this.splitAt() }] : []),
      ...(ed.selected.length > 1 || l.kind !== 'camera' ? [{ label: ed.selected.length > 1 ? `Group ${ed.selected.length} layers` : 'Group into a comp', run: () => void ed.group() }] : []),
      ...this.layerActions(l).map((a) => ({ label: a.label, run: () => this.runLayerAction(l, a.value), danger: a.value === 'delete' })),
    ];
  }

  /** Context menu on empty space: add layers, view options. */
  layerListItems(): CtxItem[] {
    const ed = this.ed;
    const add = (kind: 'drawings' | 'null' | 'camera', label: string) => ({ label, run: () => ed.addLayer(kind) });
    return [
      { title: 'Comp' },
      { chips: [add('drawings', '+ Drawing'), add('null', '+ Anchor'), add('camera', '+ Camera')] },
      { label: 'Auto-key', checked: ed.autoKey, run: () => ((ed.autoKey = !ed.autoKey), ed.onChange()) },
      ...(ed.hasCamera() ? [{ label: 'Look through camera', checked: ed.throughCamera, run: () => ((ed.throughCamera = !ed.throughCamera), this.app.requestRender(), ed.onChange()) }] : []),
      ...(ed.crumbs().length > 1 ? [{ label: 'Back out of this comp', run: () => ed.exit(ed.crumbs().length - 2) }] : []),
    ];
  }

  private layerActions(l: Layer): { label: string; value: LayerAct }[] {
    const ed = this.ed;
    type Act = LayerAct;
    const items: { label: string; value: Act }[] = [];
    if (l.kind === 'comp') {
      items.push({ label: 'Go inside', value: 'enter' }, { label: 'Ungroup (put its layers back here)', value: 'ungroup' }, { label: 'Duplicate (another instance)', value: 'dup' });
      if (ed.instances(l.comp) > 1) items.push({ label: 'Make unique (its own copy)', value: 'unique' });
    } else if (l.kind !== 'drawings') items.push({ label: 'Duplicate', value: 'dup' });
    items.push(
      { label: 'Rename', value: 'rename' },
      { label: 'Move up', value: 'up' },
      { label: 'Move down', value: 'down' },
      { label: 'Parent to…', value: 'parent' },
      { label: l.locked ? 'Unlock' : 'Lock', value: 'lock' },
      { label: 'Colour…', value: 'colour' },
    );
    if (l.kind === 'drawings' || l.kind === 'comp') items.push({ label: 'Playback (once, loop, ping-pong, hold a frame, speed)…', value: 'play' });
    if (l.kind === 'drawings') items.push({ label: `Effects…${l.effects?.length ? ` (${l.effects.length})` : ''}`, value: 'effects' });
    items.push({ label: 'Delete', value: 'delete' });
    return items;
  }

  private async layerMenu(l: Layer): Promise<void> {
    const pick = await pickBox<LayerAct>(l.name, this.layerActions(l));
    if (pick) await this.runLayerAction(l, pick);
  }

  private async runLayerAction(l: Layer, pick: LayerAct): Promise<void> {
    const ed = this.ed;
    switch (pick) {
      case 'enter':
        ed.enter(l.id);
        break;
      case 'ungroup':
        if (!ed.ungroup(l.id)) await confirmBox('Cannot ungroup', 'This comp runs at a different frame rate than the one it is in. Change one of them first.', 'OK');
        break;
      case 'dup':
        ed.duplicate(l.id);
        break;
      case 'unique':
        ed.makeUnique(l.id);
        break;
      case 'rename': {
        const name = await askText('Layer name', l.name, 'Rename');
        if (name !== null) ed.rename(l.id, name);
        break;
      }
      case 'up':
        ed.reorder(l.id, -1);
        break;
      case 'down':
        ed.reorder(l.id, 1);
        break;
      case 'parent':
        await this.pickParent(l);
        break;
      case 'effects':
        this.app.openEffects?.(l.id);
        break;
      case 'lock':
        ed.setFlag(l.id, 'locked', !l.locked);
        break;
      case 'colour': {
        const c = await pickBox<number>(
          'Colour',
          LABELS.map((_, i) => ({ label: i === 0 ? 'None' : `Colour ${i}`, value: i })),
        );
        if (c !== undefined) ed.setLabel(l.id, c);
        break;
      }
      case 'play':
        await this.playMenu(l);
        break;
      case 'delete':
        if (await confirmBox(`Delete “${l.name}”?`, 'You can undo this.', 'Delete', true)) ed.deleteLayers([l.id]);
        break;
    }
  }

  private onDown(e: PointerEvent): void {
    const t = e.target as HTMLElement;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // two fingers on the time area: pinch to zoom time
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      this.pinch = { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), cell: this.cell };
      this.drag = null;
      return;
    }
    if (t.closest('[data-act]') || t.closest('.mleft')) return;
    const key = t.closest<HTMLElement>('[data-key]');
    const handle = t.closest<HTMLElement>('[data-handle]');
    const barEl = t.closest<HTMLElement>('[data-bar]');
    if (key) {
      const [layer, prop, f] = key.dataset.key!.split('|');
      const ref = { layer: layer!, prop: prop as PropKey, f: Number(f) };
      const add = e.shiftKey || e.ctrlKey || e.metaKey;
      this.drag = { kind: 'key', ref, x0: e.clientX, el: key, moved: false, shift: add };
      if (!this.ed.keys.has(keyId(ref)) || add) this.ed.selectKey(ref, add);
      capture(key, e.pointerId);
      return;
    }
    if (barEl) {
      const id = barEl.dataset.bar!;
      const l = this.ed.layer(id);
      if (!l || l.locked) return;
      const mode = handle ? (handle.dataset.handle as 'in' | 'out') : 'move';
      this.drag = { kind: 'bar', layer: id, mode, x0: e.clientX, el: barEl, l0: parseFloat(barEl.style.left), w0: parseFloat(barEl.style.width), moved: false };
      this.ed.select(id, e.shiftKey);
      capture(barEl, e.pointerId);
      return;
    }
    // empty time area / ruler: scrub
    if (t.closest('.mright')) {
      this.drag = { kind: 'scrub' };
      this.app.beginScrub();
      this.app.setFrame(this.frameAtX(e.clientX));
      capture(this.grid, e.pointerId);
    }
  }

  private onMove(e: PointerEvent): void {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      this.setCell(this.pinch.cell * (Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.dist));
      return;
    }
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'scrub') {
      this.app.setFrame(this.frameAtX(e.clientX));
      return;
    }
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < DRAG) return;
    d.moved = true;
    const snap = Math.round(dx / this.cell) * this.cell;
    if (d.kind === 'key') {
      d.el.style.transform = `translate(${snap}px, -50%)`;
    } else if (d.mode === 'move') {
      d.el.style.transform = `translateX(${snap}px)`;
    } else if (d.mode === 'in') {
      const s = Math.min(snap, d.w0 - this.cell);
      d.el.style.left = `${d.l0 + s}px`;
      d.el.style.width = `${d.w0 - s}px`;
    } else {
      d.el.style.width = `${Math.max(this.cell, d.w0 + snap)}px`;
    }
    if (d.kind === 'bar') {
      // the edge being moved, as a line across the timelines (frames from the bar's pixels)
      const left = parseFloat(d.el.style.left) + (d.mode === 'move' ? snap : 0);
      const right = left + parseFloat(d.el.style.width);
      const frame = Math.round((d.mode === 'out' ? right : left) / this.cell);
      d.el.querySelector(`.mh.${d.mode === 'in' ? 'in' : 'out'}`)?.classList.toggle('active', d.mode !== 'move');
      this.app.setEditLine({ frame, edge: d.mode, delta: Math.round(snap / this.cell) });
    }
  }

  private onUp(e: PointerEvent, cancelled: boolean): void {
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    if (this.app.editLine) this.app.setEditLine(null);
    if (d.kind === 'scrub') {
      this.app.endScrub();
      return;
    }
    const df = Math.round((e.clientX - d.x0) / this.cell);
    if (cancelled || !d.moved) {
      if (d.kind === 'key') d.el.style.transform = '';
      else if (d.moved) d.el.style.transform = '';
      this.signature = '';
      this.update();
      return;
    }
    if (d.kind === 'key') {
      d.el.style.transform = '';
      this.ed.nudgeKeys(df);
    } else {
      const l = this.ed.layer(d.layer);
      if (!l) return;
      if (d.mode === 'move') this.ed.setTiming(l.id, { start: l.start + df });
      else if (d.mode === 'in') this.ed.setTiming(l.id, { in: Math.max(0, l.in + df) }, 'Trim layer start');
      else {
        const natural = layerEnd({ ...l, out: null }, this.app.project.comps);
        const cur = l.out ?? (Number.isFinite(natural) ? natural : this.ed.length());
        let out = cur + df;
        if (Number.isFinite(natural) && !playsOn(l)) out = Math.max(out, l.in + 1); // a "once" layer made longer holds its last frame
        this.ed.setTiming(l.id, { out }, 'Trim layer end');
      }
    }
    this.signature = '';
    this.update();
  }

  /** A long-press on a key row's label cell resets its animation (kept off the main taps). */
  clearRow(l: Layer, n: PropKey): void {
    this.ed.clearAnimation(l.id, n);
  }

  /** Is this property animated? (used by tests) */
  isAnimated(l: Layer, n: PropKey): boolean {
    return isAnimated(this.ed.getProp(l, n) as Prop);
  }
}
