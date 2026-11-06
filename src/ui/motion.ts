import { AnchorControls } from './anchors';
import { layerPresentation } from '../core/layerpresentation';
import type { App } from '../app';
import { PlaybackRangeControl } from './playbackrange';
import { autoIcon, decorate, iconSvg, setLabel } from './icons';
import { CURVES, curveOf, easingOf, EASINGS, isAnimated, spacingTicks, type Curve, type Easing, type Prop, type Vec2 } from '../core/anim';
import { BLEND_MODES, compLength, layerEnd, PART_LABEL, PART_NAMES, partOf, playsOn, type BlendMode, type DrawingsLayer, type Layer, type PartName, type PlayMode } from '../core/comp';
import { FPS_PRESETS } from '../core/project';
import { newEffect } from '../core/effects';
import { newSeed } from '../core/rng';
import { WIGGLE_DEFAULTS, type LoopMode, type StaggerOrder, type WiggleDims, type WiggleOptions } from '../core/keytools';
import { isFx, isPartProp, isPin, keyId, PROP_LABEL, type KeyRef, type PropKey, type PropName } from '../compedit';
import { askNumbers, askText, confirmBox, pickBox } from './dialogs';
import { reactToAudio } from './audioreactdialog';
import type { SoundBank } from '../io/sound';
import { attachContextMenu, lastMenuPoint, showContextMenu, type CtxItem } from './contextmenu';
import { rulerStep } from '../core/timecode';

const ZOOM_KEY = '2dope.m3.mcell';
const ROW_KEY = '2dope.m3.mrow';
/** The layer column's width: drag its right edge (or the ruler corner's grip); remembered on this device. */
const LEFT_KEY = '2dope.motion.leftw';
const LEFT_DEFAULT = 196, LEFT_MIN = 140, LEFT_MAX = 520;
const leftWidth = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(LEFT_MAX, Math.max(LEFT_MIN, v))) : LEFT_DEFAULT);
const DRAG = 4;
const LABELS = ['#9a9aa8', '#ff5a8a', '#ffd24a', '#4aa3ff', '#4ade80', '#c084fc', '#fb923c'];
const KIND_COLOR: Record<Layer['kind'], string> = { drawings: '#6f82e8', comp: '#3fbf8f', camera: '#e0a83c', null: '#8f8fa3' };
const blendName = (b: BlendMode) => `${b[0]!.toUpperCase()}${b.slice(1)}`;
type LayerAct = 'rename' | 'up' | 'down' | 'parent' | 'lock' | 'colour' | 'play' | 'delete' | 'enter' | 'ungroup' | 'dup' | 'unique' | 'effects' | 'blend' | 'clip' | 'mask' | 'editmask' | 'unmask';

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

/** An effect setting's value (its unit is in the row's name). */
const fxText = (v: number | Vec2) => fmt(v as number);

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
  private leftW = leftWidth((() => { try { return Number(localStorage.getItem(LEFT_KEY) ?? LEFT_DEFAULT); } catch { return LEFT_DEFAULT; } })());
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
  private readonly animatedBtn: HTMLButtonElement;
  private readonly anchors: AnchorControls;
  private readonly effectsBtn: HTMLButtonElement;
  private readonly easeBtns = new Map<Easing, HTMLButtonElement>();
  private readonly sideBtns: HTMLButtonElement[];
  private readonly curveSel: HTMLSelectElement;
  private readonly multiBtn: HTMLButtonElement;
  private readonly crumbsEl = el('nav', { class: 'mcrumbs', 'aria-label': 'Where you are' });
  private filter = '';
  private filterProject: App['project'] | null = null;
  private filterComp = '';
  private animatedOnly = false;
  private lastClipTap: { comp: string; layer: string; x: number; y: number; time: number } | null = null;
  openAssets: ((opener: HTMLElement) => void) | null = null;
  createAsset: (() => void) | null = null;
  makeClip: ((save: boolean) => void) | null = null;
  clipPlayback: ((id: string, mode: 'once' | 'loop' | 'hold') => void) | null = null;
  removeClip: ((id: string) => void) | null = null;
  openPresets: (() => void) | null = null;
  openGraph: (() => void) | null = null;
  openCameraMove: (() => void) | null = null;
  openSymbol: ((id: string) => void) | null = null;
  private readonly selectionInfo = el('span', { class: 'motion-selection', role: 'status' });
  private readonly compName = el('span', { class: 'motion-comp-name' });

  constructor(
    private readonly app: App,
    private readonly root: HTMLElement,
  ) {
    const ed = app.editor;
    root.classList.add('motion-workflow');
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
    this.multiBtn = btn('Select', 'Tap layers to pick several (to group or stagger them)', () => {
      this.ed.multiSelect = !this.ed.multiSelect; this.update();
    });
    const menu = (label: string, title: string, icon: string, items: () => CtxItem[]) => {
      const b = btn(label, title, () => {
        const box = b.getBoundingClientRect(); showContextMenu(box.left, box.bottom, items());
      });
      decorate(b, icon);
      b.setAttribute('aria-label', title); b.setAttribute('aria-haspopup', 'menu'); return b;
    };
    const addLayer = menu('New layer', 'New Motion layer', 'plus', () => [
      { title: 'New layer' },
      { label: 'Title…', icon: 'text', run: () => app.editTitle?.() },
      ...([['drawings', 'Drawing', 'draw'], ['adjustment', 'Adjustment', 'fx'], ['null', 'Anchor', 'centrecross'], ['camera', 'Camera', 'camera']] as const).map(([kind, label, icon]) => ({ label, icon, run: () => ed.addLayer(kind, ed.primary?.id) })),
    ]);
    const layer = menu('Selected layer', 'Layer actions', 'layers', () => ed.primary ? this.layerItems(ed.primary) : this.layerListItems());
    const tools = menu('Animation', 'Motion tools', 'motion', () => this.animationItems());
    const view = menu('View', 'Motion view options', 'viewfinder', () => this.viewItems());
    const assets = btn('Assets', 'Project assets and reusable files', () => {
      if (this.openAssets) this.openAssets(assets); else app.onNotice?.('The asset browser is unavailable.');
    });
    assets.setAttribute('aria-label', 'Motion assets'); assets.setAttribute('aria-haspopup', 'dialog');
    this.effectsBtn = btn('Effects', 'Effects of the selected drawing, adjustment or group', () => {
      const l = ed.primary;
      if (l?.kind === 'drawings' || l?.kind === 'comp') app.openEffects?.(l.id);
      else app.onNotice?.('Select a drawing, adjustment or group layer first.');
    });
    const help = btn('Motion help', 'Motion help', () => app.onOpenManual('motion'), 'panel-help icon-only');
    decorate(help, 'help');
    const transport = group(this.playBtn, btn('◀', 'Previous frame (←)', () => app.prevFrame()), this.frameLabel, btn('▶', 'Next frame (→)', () => app.nextFrame()), this.range.button);
    transport.classList.add('motion-transport');
    const heading = row(this.compName, this.crumbsEl, transport, help); heading.classList.add('motion-heading');
    const presets = btn('Presets', 'Motion and Effects presets', () => this.openPresets?.()); presets.setAttribute('aria-label', 'Motion presets');
    this.anchors = new AnchorControls(app);
    const importMedia = btn('Import', 'Import pictures, SVG/EPS vectors, movies or sounds', () => app.pickMedia?.());
    const paste = btn('Paste', 'Paste artwork from the clipboard', () => app.pasteMedia?.());
    const layout = btn('Layout', 'Align and snap selected layers', () => app.openLayout?.());
    const graph = btn('Graph', 'Edit animation curves', () => this.openGraph?.());
    const menus = row(
      group(addLayer, importMedia, paste, assets),
      group(graph, layer, this.anchors.button, this.effectsBtn, layout),
      group(tools, presets, view),
    );
    menus.classList.add('motion-menus'); menus.setAttribute('role', 'group'); menus.setAttribute('aria-label', 'Motion commands');
    decorate(importMedia, 'import');
    decorate(paste, 'paste');
    decorate(assets, 'folder');
    decorate(layout, 'layout');
    decorate(graph, 'graph');
    decorate(presets, 'save');
    decorate(this.effectsBtn, 'fx');
    const filter = el('input', { type: 'search', class: 'motion-search', placeholder: 'Find a layer…', 'aria-label': 'Find Motion layers', 'data-own-keys': '' });
    filter.addEventListener('input', () => { this.filter = filter.value.trim().toLowerCase(); this.signature = ''; this.update(); });
    this.animatedBtn = btn('Animated', 'Show only properties that have keyframes', () => { this.animatedOnly = !this.animatedOnly; this.signature = ''; this.update(); });
    this.animatedBtn.setAttribute('aria-pressed', 'false');
    decorate(this.animatedBtn, 'filter');
    this.autoBtn = btn('Auto-key', 'Every change you make writes a keyframe at the playhead', () => {
      ed.autoKey = !ed.autoKey;
      this.update();
    });
    decorate(this.autoBtn, 'key');
    this.startBtn = btn('Move from start', 'On: your first key also keeps where things were at the first frame, so they move from the start. Off: they jump straight to the key.', () => {
      ed.keyAtStart = !ed.keyAtStart;
      this.update();
    });
    this.camBtn = btn('Through camera', 'Look through the camera (off: see the whole comp and the camera frame)', () => {
      if (ed.pathEditing) ed.setPathEditing(false); ed.throughCamera = !ed.throughCamera;
      app.requestRender();
      this.update();
    });
    decorate(this.startBtn, 'first');
    decorate(this.camBtn, 'camera');

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
    // one side only (After Effects' Easy Ease Out / In on the first / next key), and the named curves
    this.sideBtns = [
      btn('Ease in only', 'Starts slow; the end of the segment keeps its easing. Applies to the selected keys.', () => ed.setEaseSide('out')),
      btn('Ease out only', 'Slows down into the next key; the start keeps its easing. Applies to the selected keys.', () => ed.setEaseSide('in')),
    ];
    this.curveSel = el('select', { 'aria-label': 'More easing curves', title: 'More curves for the selected keys: smooth, strong, accelerate, decelerate, expo' });
    this.curveSel.append(el('option', { value: '' }, 'More…'));
    for (const c of CURVES) this.curveSel.append(el('option', { value: c.id }, c.label));
    this.curveSel.addEventListener('change', () => {
      const id = this.curveSel.value as Curve | '';
      if (id) ed.setCurve(id);
      this.update();
    });
    ease.append(...this.sideBtns, this.curveSel);
    const workspace = row(filter, this.animatedBtn, this.multiBtn, this.autoBtn, this.selectionInfo);
    workspace.classList.add('motion-workspace-tools');
    const rowC = row(
      group(this.startBtn, this.camBtn, this.fpsSel), ease,
      group(this.slider('Zoom', 'Time zoom', 8, 80, this.cell, (n) => this.setCell(n)),
        this.slider('Rows', 'Row height', 32, 72, this.rowH, (n) => this.setRowH(n))),
    );

    const extra = el('details', { class: 'motion-extra' });
    extra.append(el('summary', {}, 'Easing and timeline settings'), rowC);
    try { extra.open = localStorage.getItem('2dope.motion.extra') === '1'; } catch { /* folded */ }
    extra.addEventListener('toggle', () => {
      try { localStorage.setItem('2dope.motion.extra', extra.open ? '1' : '0'); } catch { /* optional */ }
    });
    this.bar.append(heading, menus, this.anchors.root, workspace, extra);
    this.scroll.append(this.grid);
    root.append(this.bar, this.scroll);
    this.scroll.style.setProperty('--mleft-w', `${this.leftW}px`);
    this.resizeLeft();
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
    return Math.max(0, Math.floor((clientX - r.left - this.leftW) / this.cell));
  }

  /** Redraw what depends on the frame, and rebuild the rows when anything structural changed. */
  update(): void {
    const app = this.app;
    const ed = this.ed;
    const c = ed.comp;
    if (this.filterProject !== app.project || this.filterComp !== c.id) {
      this.filterProject = app.project; this.filterComp = c.id; this.filter = '';
      const input = this.bar.querySelector<HTMLInputElement>('.motion-search'); if (input) input.value = '';
      this.signature = '';
    }
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
    this.anchors.update();
    this.frameLabel.textContent = `${app.fmt(app.frame)} / ${app.fmtDur(app.compEnd)}`;
    this.drawEditLine();
    for (const name of this.grid.querySelectorAll<HTMLElement>('.lname[data-act=name]')) {
      const id = name.closest<HTMLElement>('[data-layer]')?.dataset.layer, layer = id ? ed.layer(id) : null;
      if (layer) { const facts = layerPresentation(layer, app.project.comps, app.frame, Number(ed.valueNow(layer, 'opacity'))); name.setAttribute('aria-label', facts.label); name.title = `${facts.label}. Tap to select. Double-tap to rename.`; }
    }
    setLabel(this.playBtn, app.playing ? 'Pause' : 'Play', app.playing ? 'pause' : 'play');
    this.playBtn.setAttribute('aria-pressed', String(app.playing));
    this.range.update();
    this.fpsSel.value = String(c.fps);
    this.autoBtn.setAttribute('aria-pressed', String(ed.autoKey));
    this.startBtn.setAttribute('aria-pressed', String(ed.keyAtStart));
    this.camBtn.setAttribute('aria-pressed', String(ed.throughCamera));
    this.camBtn.hidden = !ed.hasCamera();
    this.multiBtn.setAttribute('aria-pressed', String(this.ed.multiSelect));
    this.animatedBtn.setAttribute('aria-pressed', String(this.animatedOnly));
    this.effectsBtn.disabled = ed.primary?.kind !== 'drawings' && ed.primary?.kind !== 'comp';
    this.compName.textContent = c.name;
    this.compName.hidden = ed.crumbs().length > 1;
    this.compName.title = `${c.name} · ${c.width}×${c.height} · ${c.fps} fps`;
    const nk = ed.selectedKeys().length;
    this.selectionInfo.textContent = ed.anchorEditing ? `Anchor · tap/drag canvas · Esc to finish` : ed.pathEditing ? `Path · drag nodes/handles · Esc to finish` : `${ed.selected.length === 1 ? ed.primary?.name ?? '1 layer' : `${ed.selected.length} layers`} · ${nk} key${nk === 1 ? '' : 's'}`;
    this.renderCrumbs();
    const cur = ed.easingOfSelection();
    for (const [e, b] of this.easeBtns) b.setAttribute('aria-pressed', String(ed.keys.size ? cur === e : ed.lastEase === e));
    for (const b of this.sideBtns) b.disabled = !ed.keys.size;
    this.curveSel.disabled = !ed.keys.size;
    this.curveSel.value = (ed.keys.size ? ed.curveOfSelection() : null) ?? '';
    // playhead and live values
    this.playhead.style.width = `${this.cell}px`;
    this.playhead.style.transform = `translateX(${this.leftW + app.frame * this.cell}px)`;
    for (const v of this.grid.querySelectorAll<HTMLElement>('[data-val]')) {
      const l = ed.layer(v.dataset.layer ?? '');
      if (l) v.textContent = isFx(v.dataset.val!) ? fxText(ed.valueNow(l, v.dataset.val as PropKey)) : show(ed.rowProp(v.dataset.val as PropKey), ed.valueNow(l, v.dataset.val as PropKey));
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
    const x = this.leftW + e.frame * this.cell;
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
    const x = this.leftW + this.app.frame * this.cell;
    const s = this.scroll;
    if (this.app.playing || !this.pointers.size) {
      if (x + this.cell > s.scrollLeft + s.clientWidth) s.scrollLeft = x - s.clientWidth / 2;
      else if (x < s.scrollLeft + this.leftW) s.scrollLeft = Math.max(0, x - this.leftW - this.cell * 2);
    }
  }

  /** Set the layer column's width (clamped), keep it, and redraw the rows at it. */
  setLeftWidth(w: number, save = true): void {
    const next = leftWidth(w);
    if (next === this.leftW) return;
    this.leftW = next;
    this.scroll.style.setProperty('--mleft-w', `${next}px`);
    if (save) { try { localStorage.setItem(LEFT_KEY, String(next)); } catch { /* this session only */ } }
    this.signature = '';
    this.update();
  }

  get leftWidth(): number {
    return this.leftW;
  }

  /**
   * Drag the layer column's right edge on any row (or its grip in the ruler corner) to read more of
   * the layer names and controls, or to give the timeline more room. Double-click resets; with the
   * grip focused, the arrow keys step it.
   */
  private resizeLeft(): void {
    const s = this.scroll;
    const atEdge = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('.mleft-grip')) return true;
      const left = t.closest<HTMLElement>('.mleft');
      if (!left) return false;
      const r = left.getBoundingClientRect();
      return e.clientX > r.right - 8 && e.clientX <= r.right + 2;
    };
    s.addEventListener('pointermove', (e) => {
      if (e.buttons) return;
      s.classList.toggle('mleft-resizable', atEdge(e));
    });
    s.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || !atEdge(e)) return;
      e.preventDefault();
      e.stopPropagation();
      const x0 = e.clientX, w0 = this.leftW, id = e.pointerId;
      try { s.setPointerCapture(id); } catch { /* a pointer that is already gone */ }
      s.classList.add('mleft-resizing');
      const move = (m: PointerEvent) => { if (m.pointerId === id) this.setLeftWidth(w0 + m.clientX - x0, false); };
      const up = (u: PointerEvent) => {
        if (u.pointerId !== id) return;
        s.removeEventListener('pointermove', move); s.removeEventListener('pointerup', up); s.removeEventListener('pointercancel', up);
        s.classList.remove('mleft-resizing');
        try { localStorage.setItem(LEFT_KEY, String(this.leftW)); } catch { /* this session only */ }
      };
      s.addEventListener('pointermove', move); s.addEventListener('pointerup', up); s.addEventListener('pointercancel', up);
    }, true);
    s.addEventListener('dblclick', (e) => { if ((e.target as HTMLElement).closest('.mleft-grip') || (e.target as HTMLElement).closest('.mleft') && atEdge(e as PointerEvent)) this.setLeftWidth(LEFT_DEFAULT); }, true);
    s.addEventListener('keydown', (e) => {
      if (!(e.target as HTMLElement).closest('.mleft-grip')) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); this.setLeftWidth(this.leftW + (e.key === 'ArrowRight' ? 24 : -24)); this.scroll.querySelector<HTMLElement>('.mleft-grip')?.focus(); }
    }, true);
  }

  private rebuild(): void {
    const ed = this.ed;
    const app = this.app;
    const c = ed.comp;
    const comps = app.project.comps;
    const end = Math.max(compLength(c, comps), 24) + 24;
    const width = this.leftW + end * this.cell;
    this.grid.replaceChildren();
    this.grid.style.width = `${width}px`;

    // ruler
    const ruler = el('div', { class: 'mrow ruler' });
    const corner = el('div', { class: 'mleft' });
    corner.append(el('span', { class: 'hint' }, `${c.name} · ${c.width}×${c.height}`));
    corner.append(el('span', { class: 'mleft-grip', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Layer column width', tabindex: '0', title: 'Drag to show more or less of the layer column (double-click: back to normal)' }));
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
    const shown = this.filter ? c.layers.filter((l) => l.name.toLowerCase().includes(this.filter)) : folding && !this.allRows ? c.layers.filter(keep) : c.layers;
    for (const l of shown) {
      this.grid.append(this.layerRow(l, end));
      if (ed.open.has(l.id) || this.animatedOnly) {
        for (const n of ed.rowsOf(l)) if (!this.animatedOnly || ed.getProp(l, n).keys.length) this.grid.append(this.propRow(l, n, end));
        if (l.kind === 'drawings' && !l.adjust && !this.animatedOnly) {
          for (const part of PART_NAMES.slice().reverse()) {
            this.grid.append(this.partRow(l, part, end));
            if (ed.open.has(`${l.id}#${part}`)) for (const n of [`${part}.opacity`, `${part}.offset`] as PropKey[]) this.grid.append(this.propRow(l, n, end));
          }
        }
      }
    }
    if (hidden && !this.filter) {
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
    if (this.filter && !shown.length) {
      const empty = el('div', { class: 'mempty' }, 'No matching layers. Clear Find a layer to show the stack.');
      this.grid.append(empty);
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
    const marks = `${l.kind === 'drawings' && l.clip ? ' ↳' : ''}${l.kind === 'drawings' && l.mask ? ' ◐' : ''}`;
    const how = [l.kind === 'drawings' && l.clip ? 'clipping mask' : '', l.kind === 'drawings' && l.mask ? 'has a mask' : '', l.blend !== 'normal' ? `${blendName(l.blend)} blend` : ''].filter(Boolean).join(', ');
    const name = el('button', { type: 'button', class: 'lname', 'data-act': 'name', title: `${how ? `${how[0]!.toUpperCase()}${how.slice(1)}. ` : ''}Tap to select. Double-tap to rename. ▸ shows its properties.` }, `${KIND_ICON[l.kind]} ${l.name}${marks}`);
    const presentation = layerPresentation(l, comps, this.app.frame, Number(ed.valueNow(l, 'opacity'))); name.setAttribute('aria-label', presentation.label); name.title = `${presentation.label}. Tap to select. Double-tap to rename.`; if (presentation.kind === 'Title') name.textContent = `T ${l.name}${marks}`;
    const eye = el('button', { type: 'button', class: 'leye', 'aria-label': `${l.visible ? 'Hide' : 'Show'} ${l.name}`, 'aria-pressed': String(l.visible), title: l.visible ? 'Hide this layer' : 'Show this layer', 'data-act': 'eye' }, l.visible ? '' : '–');
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
    const stop = layerEnd(l, comps, ed.comp.fps);
    const last = Number.isFinite(stop) ? stop : Math.max(compLength(ed.comp, comps), l.in + 1);
    const b = el('div', { class: 'mbar-el', 'data-bar': l.id });
    if (l.kind === 'comp') {
      b.title = 'Double-click to edit clip';
      b.addEventListener('dblclick', event => {
        if (!(event.target as HTMLElement).closest('[data-handle]')) this.editClip(l.id);
      });
    }
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
    const label = PART_LABEL[part];
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
      el('span', { class: `pname${isPin(n) ? ' pin' : ''}${isFx(n) ? ' fx' : ''}`, title: ed.rowLabel(l, n) }, isPin(n) || isFx(n) ? ed.rowLabel(l, n) : PROP_LABEL[kind]),
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
        isFx(n) ? fxText(ed.valueNow(l, n)) : show(kind, ed.valueNow(l, n)),
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
          const named = e ? null : curveOf(k.out, next.in);
          const lab = el('span', { class: 'mease' }, e ? (EASINGS.find((z) => z.id === e)?.label ?? '') : named ? (CURVES.find((z) => z.id === named)?.label ?? '') : 'Custom');
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
    } else if (isFx(n)) {
      const r = await askNumbers(title, [{ label: 'Value', value: v, unit: '' }]);
      if (r) this.ed.setValue(l.id, n, r[0]!, `Change ${this.ed.rowLabel(l, n).replace(/^✨ /, '').toLowerCase()}`);
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

  /** Wiggle between the selected keys: frequency, amount, smoothness, seed (and which way, for a point). */
  private async askWiggle(ref: KeyRef): Promise<void> {
    const ed = this.ed, l = ed.layer(ref.layer);
    const point = !!l && typeof ed.getProp(l, ref.prop).value !== 'number';
    const w = this.wiggleLast;
    const r = await askNumbers('Wiggle', [
      { label: 'Frequency', value: w.frequency, step: 0.5, unit: 'keys a second (0.5–10)' },
      { label: 'Amount', value: w.magnitude, step: 1, unit: 'most it moves away' },
      { label: 'Smoothness', value: Math.round(w.smooth * 100), step: 10, unit: '% (0 jagged, 100 smooth)' },
      { label: 'Seed', value: w.seed, step: 1, unit: 'another number, another wiggle' },
    ], 'Wiggle');
    if (!r) return;
    const dims = point ? await pickBox<WiggleDims>('Wiggle which way', [{ label: 'Both ways', value: 'both' }, { label: 'Only across (X)', value: 'x' }, { label: 'Only up and down (Y)', value: 'y' }]) : 'both';
    if (!dims) return;
    this.wiggleLast = { frequency: Math.min(10, Math.max(0.5, r[0]!)), magnitude: Math.abs(r[1]!), smooth: Math.min(1, Math.max(0, r[2]! / 100)), seed: Math.round(r[3]!) >>> 0, dims };
    ed.wiggleKeys(this.wiggleLast);
  }

  private wiggleLast: WiggleOptions = { ...WIGGLE_DEFAULTS, seed: 1 };

  /** The shot's decoded audio (set by the app), for React to audio. */
  sounds: SoundBank | null = null;

  private async askSmooth(): Promise<void> {
    const r = await askNumbers('Smooth keys', [{ label: 'Tolerance', value: 1, step: 0.5, unit: 'how far the motion may drift' }], 'Smooth');
    if (r) this.ed.smoothSelectedKeys(Math.max(0, r[0]!));
  }

  private async askLoop(): Promise<void> {
    const mode = await pickBox<LoopMode>('Loop keys', [
      { label: 'Cycle', value: 'cycle', hint: 'repeat them' },
      { label: 'Ping-pong', value: 'pingpong', hint: 'forwards, then backwards' },
      { label: 'Offset', value: 'offset', hint: 'each pass carries on from the last (a walk)' },
    ]);
    if (!mode) return;
    const r = await askNumbers('Loop keys', [{ label: 'Repeats', value: 2, step: 1, unit: 'times' }], 'Loop');
    if (r) this.ed.loopSelectedKeys(mode, Math.min(50, Math.max(1, Math.round(r[0]!))));
  }

  private async askStagger(): Promise<void> {
    const r = await askNumbers('Stagger', [{ label: 'Frames apart', value: 2, step: 1, unit: 'between each layer' }], 'Next');
    if (!r) return;
    const order = await pickBox<StaggerOrder>('Stagger order', [
      { label: 'Top to bottom', value: 'order' },
      { label: 'Bottom to top', value: 'reverse' },
      { label: 'Random', value: 'random' },
    ]);
    if (order) this.ed.staggerLayers(Math.round(r[0]!), order, newSeed());
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
        { label: 'Wiggle…', run: () => void this.askWiggle(ref) },
        { label: 'Smooth keys…', run: () => void this.askSmooth() },
        { label: 'Loop keys…', run: () => void this.askLoop() },
        { label: 'React to audio…', run: () => reactToAudio(this.app, this.sounds) },
        { label: 'Copy easing', run: () => ed.copyEasing() },
        { label: 'Paste easing', disabled: !ed.easeClipboard, run: () => ed.pasteEasing() },
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
      const name = PART_LABEL[part];
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
  private animationItems(): CtxItem[] {
    const ed = this.ed, ref = ed.selectedKeys()[0];
    return [
      { title: 'Curves and paths' },
      { label: 'Graph editor…', icon: 'graph', run: () => this.openGraph?.() },
      { label: ed.pathEditing ? 'Done editing motion path' : 'Edit motion path on canvas', checked: ed.pathEditing, run: () => ed.setPathEditing(!ed.pathEditing) },
      { label: 'Smooth motion path', run: () => ed.changePath(true) },
      { label: 'Straight motion path', run: () => ed.changePath(false) },
      { label: 'Link motion path handles', checked: ed.pathLinked, run: () => { ed.pathLinked = !ed.pathLinked; } },
      { title: 'Camera' },
      { label: 'Camera move…', icon: 'camera', disabled: !this.openCameraMove, run: () => this.openCameraMove?.() },
      { title: 'Keyframe assistants' },
      { label: 'Wiggle…', disabled: !ref, run: () => ref && void this.askWiggle(ref) },
      { label: 'Smooth keys…', disabled: !ref, run: () => void this.askSmooth() },
      { label: 'Loop keys…', icon: 'recent', disabled: !ref, run: () => void this.askLoop() },
      { label: 'Stagger layers…', disabled: ed.selected.length < 2, run: () => void this.askStagger() },
      { label: 'React to audio…', disabled: !ed.selected.length, run: () => reactToAudio(this.app, this.sounds) },
      { title: 'Easing' },
      ...EASINGS.map(e => ({ label: e.label, disabled: !ref, checked: ed.easingOfSelection() === e.id, run: () => ed.setEasing(e.id) })),
      { label: 'More easing curves…', disabled: !ref, run: () => {
        const box = this.bar.getBoundingClientRect();
        showContextMenu(box.left, box.bottom, [{ title: 'Easing curves' }, ...CURVES.map(c => ({ label: c.label, run: () => ed.setCurve(c.id) }))]);
      } },
      { sep: true },
      { label: 'Copy easing', icon: 'copy', disabled: !ref, run: () => ed.copyEasing() },
      { label: 'Paste easing', icon: 'paste', disabled: !ref || !ed.easeClipboard, run: () => ed.pasteEasing() },
      { label: 'Reverse keys', disabled: !ref, run: () => ed.reverse() },
      { label: 'Delete selected keys', icon: 'trash', disabled: !ref, danger: true, run: () => ed.deleteKeys() },
    ];
  }

  private viewItems(): CtxItem[] {
    const a = this.app, ed = this.ed;
    return [
      { title: 'Canvas' },
      { label: 'Snapping', checked: a.editor.snap.on, run: () => a.editor.setSnap({ on: !a.editor.snap.on }) },
      ...([['transparency', 'Transparency grid'], ['safeAreas', 'Title and action safe'], ['centre', 'Centre cross'], ['overscan', 'Overscan']] as const).map(([key, label]) => ({ label, checked: a.canvasView[key], run: () => a.setCanvasView({ [key]: !a.canvasView[key] }) })),
      { label: 'Fit canvas', run: () => a.fit() },
      ...(ed.hasCamera() ? [{ label: 'Through camera', checked: ed.throughCamera, run: () => { if (ed.pathEditing) ed.setPathEditing(false); ed.throughCamera = !ed.throughCamera; a.requestRender(); this.update(); } }] : []),
      { title: 'Timeline' },
      { label: 'Show all layers in Simple mode', checked: this.allRows, run: () => {
        this.allRows = !this.allRows; try { localStorage.setItem('2dope.motion.allRows', this.allRows ? '1' : '0'); } catch { /* session only */ }
        this.signature = ''; this.update();
      } },
      { label: 'Expand selected properties', disabled: !ed.selected.length, run: () => { for (const id of ed.selected) ed.open.add(id); this.update(); } },
      { label: 'Collapse all properties', run: () => { ed.open.clear(); this.animatedOnly = false; this.signature = ''; this.update(); } },
      { label: 'Reset timeline zoom', run: () => this.setCell(28) },
    ];
  }

  layerItems(l: Layer): CtxItem[] {
    const ed = this.ed;
    const asset = l.kind === 'comp' && this.app.project.comps.get(l.comp)?.asset;
    const playback = l.kind === 'comp' ? l.timeRemap?.keys.length ? null : l.play === 'loop' ? 'loop' :
      l.play === 'once' && l.out !== null && l.out > layerEnd({ ...l, out: null }, this.app.project.comps, ed.comp.fps) ? 'hold' : l.play : null;
    const actions = this.layerActions(l);
    const action = (a: { label: string; value: LayerAct }): CtxItem => ({ label: a.label, run: () => this.runLayerAction(l, a.value), danger: a.value === 'delete' || a.value === 'unmask' });
    const family = (label: string, ids: LayerAct[]): CtxItem[] => {
      const items = actions.filter(a => ids.includes(a.value));
      if (!items.length) return [];
      return [{ label, run: () => {
        const point = lastMenuPoint();
        showContextMenu(point.x, point.y, [{ title: `${l.name} · ${label.replace(/…$/, '')}` }, ...items.map(action), { sep: true },
          { label: 'Back to layer actions', run: () => { const live = ed.layer(l.id); if (live) showContextMenu(point.x, point.y, this.layerItems(live)); } }]);
      } }];
    };
    return [
      { title: l.name },
      { label: 'Transform', icon: 'transform', run: () => {
        if (ed.primary?.id !== l.id) ed.select(l.id);
        this.animatedOnly = false; ed.open.add(l.id); this.signature = ''; this.update();
        const row = this.grid.querySelector<HTMLElement>(`.mrow.layer[data-layer="${CSS.escape(l.id)}"]`);
        row?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } },
      { label: 'Anchor', icon: 'centrecross', disabled: l.kind === 'camera' || l.locked || !l.visible || l.kind === 'drawings' && !!l.adjust,
        run: () => { if (ed.primary?.id !== l.id) ed.select(l.id); ed.setAnchorEditing(true); this.app.focusCanvas(); } },
      ...(l.kind === 'drawings' || l.kind === 'comp' ? [{ label: 'Effects', icon: 'fx', run: () => this.app.openEffects?.(l.id) }] : []),
      { label: 'Graph', icon: 'graph', run: () => { if (ed.primary?.id !== l.id) ed.select(l.id); this.openGraph?.(); } },
      ...(l.kind === 'comp' ? [{ label: 'Edit Clip', icon: 'time', run: () => this.editClip(l.id) }] : []),
      ...(l.kind === 'drawings' && !l.adjust && !l.guide && !l.notes && !l.title ? [{
        label: 'Tween vector points', icon: 'editpoints', checked: !!l.tweenVectors, disabled: l.locked,
        run: () => ed.setVectorTween(l.id, !l.tweenVectors),
      }] : []),
      ...(asset && this.clipPlayback ? [
        { title: 'Clip playback' },
        ...([['once', 'Once', 'play'], ['loop', 'Loop', 'recent'], ['hold', 'Hold Last Frame', 'last']] as const)
          .map(([mode, label, icon]) => ({ label, icon, checked: playback === mode, disabled: playback === null, run: () => this.clipPlayback?.(l.id, mode) })),
      ] : []),
      ...(this.makeClip ? [
        { title: 'Reuse selected tracks' },
        { label: 'Make Clip…', icon: 'layers', disabled: !ed.selected.length || this.app.playing, run: () => this.makeClip?.(false) },
        { label: 'Save as Asset…', icon: 'save', disabled: !ed.selected.length || this.app.playing, run: () => this.makeClip?.(true) },
      ] : []),
      ...(l.kind === 'comp' && this.app.project.comps.get(l.comp)?.asset ? [{ label: 'Symbol options…', disabled: !this.openSymbol, run: () => this.openSymbol?.(l.id) }] : []),
      ...(l.kind === 'drawings' && l.title ? [{ label: 'Edit title…', run: () => this.app.editTitle?.(l.id) }, { label: 'Convert to paint…', run: () => this.app.convertTitle?.(l.id) }] : []),
      ...(!this.makeClip && this.createAsset ? [{ label: 'Create asset from selection…', disabled: this.app.playing || ed.selected.some(id => { const x = ed.layer(id); return x?.kind === 'camera' || x?.kind === 'drawings' && x.guide; }), run: () => this.createAsset?.() }] : []),
      ...(l.kind === 'drawings' && !l.adjust && !l.guide ? [{ label: 'Edit in Flipbook', run: () => this.app.openFlipbook?.(l.id) }] : []),
      { title: 'Organize' },
      { label: l.visible ? 'Hide' : 'Show', run: () => ed.setFlag(l.id, 'visible', !l.visible) },
      ...actions.filter(a => ['rename', 'dup', 'lock'].includes(a.value)).map(action),
      ...(l.kind === 'drawings' || l.kind === 'comp' ? [{ label: 'Split at the playhead', hint: 'Ctrl+Shift+D', run: () => this.splitAt() }] : []),
      ...(ed.selected.length > 1 || l.kind !== 'camera' ? [{ label: ed.selected.length > 1 ? `Group ${ed.selected.length} layers` : 'Group into a comp', run: () => void this.groupSelected() }] : []),
      ...(ed.selected.length > 1 ? [{ label: `Stagger ${ed.selected.length} layers…`, run: () => void this.askStagger() }] : []),
      ...family('Arrange and parent…', ['up', 'down', 'parent', 'colour']),
      ...family('Source and playback…', ['ungroup', 'unique', 'play']),
      ...family('Blending and masks…', ['blend', 'clip', 'mask', 'editmask', 'unmask']),
      { sep: true },
      ...(l.kind === 'drawings' && l.adjust ? [{ label: 'Make it a normal layer', run: () => ed.setAdjust(l.id, false) }] : [{ label: 'New adjustment layer above', run: () => ed.addLayer('adjustment', l.id) }]),
      ...(asset && this.removeClip ? [{ label: 'Remove from Shot', icon: 'trash', danger: true, run: () => this.removeClip?.(l.id) }] : actions.filter(a => a.value === 'delete').map(action)),
    ];
  }

  private editClip(id: string): void {
    if (this.app.strokeActive || this.ed.dragging) return;
    if (this.app.playing) this.app.togglePlay();
    if (this.ed.enter(id, true)) this.app.focusCanvas();
  }

  /** Context menu on empty space: add layers, view options. */
  layerListItems(): CtxItem[] {
    const ed = this.ed;
    const add = (kind: 'drawings' | 'null' | 'camera' | 'adjustment', label: string) => ({ label, run: () => ed.addLayer(kind) });
    return [
      { title: 'Comp' },
      { label: '+ Title…', run: () => this.app.editTitle?.() },
      { chips: [add('drawings', '+ Drawing'), add('null', '+ Anchor'), add('camera', '+ Camera'), add('adjustment', '+ Adjustment')] },
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
    if (l.kind === 'drawings' || l.kind === 'comp') items.push({ label: `Effects…${l.effects?.length ? ` (${l.effects.length})` : ''}`, value: 'effects' });
    // blending and masking, the same as a layer's options in Draw (one undo step each)
    if (l.kind !== 'camera' && l.kind !== 'null') items.push({ label: `Blend mode… (${blendName(l.blend)})`, value: 'blend' });
    if (l.kind === 'drawings' && !l.guide && !l.adjust) {
      items.push({ label: l.clip ? 'Clipping mask: on (turn off)' : 'Clipping mask (show only over the layer below)', value: 'clip' });
      if (l.mask) items.push({ label: 'Edit mask (paint it in Draw)', value: 'editmask' }, { label: 'Delete mask', value: 'unmask' });
      else items.push({ label: 'Add mask (paint to hide parts, in Draw)', value: 'mask' });
    }
    items.push({ label: 'Delete', value: 'delete' });
    return items;
  }

  private layerMenu(l: Layer): void {
    if (!this.ed.selected.includes(l.id)) this.ed.select(l.id);
    const box = this.grid.querySelector(`[data-layer="${CSS.escape(l.id)}"] .lmore`)?.getBoundingClientRect() ?? this.bar.getBoundingClientRect();
    showContextMenu(box.left, box.bottom, this.layerItems(l));
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
      case 'blend': {
        const m = await pickBox<BlendMode>(`${l.name}: blend mode`, BLEND_MODES.map((b) => ({ label: `${b === l.blend ? '● ' : ''}${blendName(b)}`, value: b })));
        if (m && m !== l.blend) ed.edit('Blend mode', (c) => { const x = c.layers.find((y) => y.id === l.id); if (x) x.blend = m; });
        break;
      }
      case 'clip':
        ed.edit(l.kind === 'drawings' && l.clip ? 'Clipping mask off' : 'Clipping mask', (c) => {
          const x = c.layers.find((y) => y.id === l.id);
          if (x && x.kind === 'drawings') { if (x.clip) delete x.clip; else x.clip = true; }
        });
        break;
      case 'mask':
      case 'editmask':
        // a mask is painted with the brushes: draw on this layer, in Draw, with mask painting on
        this.app.focusLayer(l.id);
        if (pick === 'mask') this.app.addMask();
        this.app.setWorkspace('draw');
        this.app.setMaskEditing(true);
        break;
      case 'unmask':
        this.app.focusLayer(l.id);
        this.app.deleteMask();
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
      if (!cancelled && d.kind === 'bar' && d.mode === 'move' && !e.shiftKey && this.ed.layer(d.layer)?.kind === 'comp') {
        const tap = { comp: this.ed.comp.id, layer: d.layer, x: e.clientX, y: e.clientY, time: e.timeStamp };
        const last = this.lastClipTap;
        if (last?.comp === tap.comp && last.layer === tap.layer && tap.time - last.time < 400 &&
            Math.hypot(tap.x - last.x, tap.y - last.y) < 12) {
          this.lastClipTap = null;
          this.editClip(d.layer);
          return;
        }
        this.lastClipTap = tap;
      } else this.lastClipTap = null;
      if (d.kind === 'key') d.el.style.transform = '';
      else if (d.moved) d.el.style.transform = '';
      this.signature = '';
      this.update();
      return;
    }
    this.lastClipTap = null;
    if (d.kind === 'key') {
      d.el.style.transform = '';
      this.ed.nudgeKeys(df);
    } else {
      const l = this.ed.layer(d.layer);
      if (!l) return;
      if (d.mode === 'move') this.ed.setTiming(l.id, { start: l.start + df });
      else if (d.mode === 'in') this.ed.setTiming(l.id, { in: Math.max(0, l.in + df) }, 'Trim layer start');
      else {
        const natural = layerEnd({ ...l, out: null }, this.app.project.comps, this.ed.comp.fps);
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
