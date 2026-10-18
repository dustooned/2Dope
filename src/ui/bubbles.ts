import type { SymmetryMode } from '../core/adjust';
import { EASINGS } from '../core/anim';
import type { App, Workspace } from '../app';
import type { Tool } from '../core/stroke';
import type { XParams } from '../core/selxform';
import { decorate } from './icons';

export type UiLevel = 'clean' | 'simple' | 'full';
const LEVEL_KEY = '2dope.ui.level';
const LEVELS: UiLevel[] = ['clean', 'simple', 'full'];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

export interface BubbleHooks {
  brushLibrary(anchor: HTMLElement): void;
  colorPanel(anchor: HTMLElement): void;
  layers(anchor: HTMLElement): void;
  fit(): void;
  /** The QuickShape Edit shape menu (shown in the context bar right after a snap). */
  editShape?: (anchor: HTMLElement) => void;
  /** Layer cards with thumbnails (Draw); without it, Layers shows the linked layers as chips. */
  layerCards?: (anchor: HTMLElement) => void;
  /** Story (Board) actions the bubbles reach. */
  story?: { view(): 'panels' | 'timeline' | 'split'; setView(v: 'panels' | 'timeline' | 'split'): void; images(): void; exportBoard(): void };
  /** Motion actions the bubbles reach. */
  motion?: { group(): void; split(): void };
  /** Flip: the beginner drawing-only mode (a sub-mode of Draw). */
  flip?: { on(): boolean; set(on: boolean): void };
}

type ToolKey = 'brush' | 'pen' | 'eraser' | 'fill' | 'select' | 'color' | 'flip' | 'onion' | 'layers'
  | 'smudge' | 'adjust' | 'panel' | 'images' | 'dup' | 'del' | 'play' | 'export' | 'addlayer' | 'camera' | 'group' | 'split' | 'autokey' | 'look';

/**
 * Bubbles: a simpler way around the app. Mode bubbles (Draw, Animate, Move, Story) at the top left,
 * the tools for that mode at the top right, and a context bar with only what the chosen tool needs.
 * One level button steps clean → simple → full (full is the classic layout with every button).
 * View only: every bubble calls the same App commands as the classic buttons.
 */
export class Bubbles {
  private readonly modes = el('div', { class: 'bub-modes', role: 'toolbar', 'aria-label': 'Mode' });
  private readonly tools = el('div', { class: 'bub-tools', role: 'toolbar', 'aria-label': 'Tools' });
  private readonly ctx = el('div', { class: 'bub-ctx', role: 'toolbar', 'aria-label': 'Options' });
  private readonly levelBtn = el('button', { type: 'button', class: 'bub bub-level' });
  private readonly modeName = el('span', { class: 'bub-name' });
  level: UiLevel = 'simple';
  private sig = '';
  /** The Layers bubble shows this cel's linked layers in the context bar. */
  private layersOpen = false;
  /** Point editing's on/off settings, folded behind one chip. */
  private pointSettings = false;

  /** How far down the bubble rows reach (px from the stage top); the canvas fits below it. */
  private topClear = -1;

  constructor(private readonly app: App, private readonly stage: HTMLElement, private readonly hooks: BubbleHooks) {
    // the order of a shot: plan it (Story), sketch it (Flip), draw it, time it, move it
    const modes: [Workspace | 'flip', string, string, string][] = [
      ['board', 'Story', 'board', 'Story: panels, captions and the animatic'],
      ['flip', 'Flip', 'flipbook', 'Flip: just draw frame after frame, no timing yet'],
      ['draw', 'Draw', 'draw', 'Draw: your art, layer by layer'],
      ['time', 'Timing', 'time', 'Timing: holds, marks and the exposure sheet'],
      ['motion', 'Motion', 'motion', 'Motion: move layers, keyframes and the camera'],
    ];
    for (const [ws, label, icon, title] of modes) {
      if (ws === 'flip') {
        if (!hooks.flip) continue;
        const flip = this.bubble(label, icon, title);
        flip.dataset.mode = 'flip';
        flip.addEventListener('click', () => hooks.flip!.set(true));
        this.modes.append(flip);
        continue;
      }
      const b = this.bubble(label, icon, title);
      b.dataset.ws = ws;
      b.addEventListener('click', () => {
        hooks.flip?.set(false);
        app.setWorkspace(ws);
        this.sig = '';
        this.update();
      });
      this.modes.append(b);
    }
    this.modes.append(this.modeName);
    this.levelBtn.addEventListener('click', () => this.setLevel(LEVELS[(LEVELS.indexOf(this.level) + 1) % LEVELS.length]!));
    stage.append(this.modes, this.tools, this.ctx);
    // inside the stage, so it never sits on a side panel
    stage.append(this.levelBtn);
    try {
      const v = localStorage.getItem(LEVEL_KEY);
      if (v === 'clean' || v === 'simple' || v === 'full') this.level = v;
    } catch { /* default */ }
    this.setLevel(this.level, false);
    window.addEventListener('resize', () => setTimeout(() => this.measure(), 0));
  }

  /**
   * Measure the bubble rows (they wrap on narrow screens) and publish it to the stage as CSS
   * variables: --tools-bottom (where the context row goes on a phone), --top-clear (what the
   * canvas, layer label and sidebar keep clear of) and --side-top (the sidebar's top edge).
   */
  private measure(): void {
    const s = this.stage.getBoundingClientRect();
    const bottomOf = (e: HTMLElement) => (e.offsetParent && !e.hidden ? e.getBoundingClientRect().bottom - s.top : 0);
    const tools = Math.max(bottomOf(this.modes), bottomOf(this.tools));
    if (!tools) return;
    const narrow = window.innerWidth <= 700;
    // on a phone the context row sits under the tools, and the layer label under that
    const clear = Math.round(tools + (narrow ? 58 : 8));
    this.stage.style.setProperty('--tools-bottom', `${Math.round(tools + 6)}px`);
    this.stage.style.setProperty('--side-top', `${clear + (narrow ? 40 : 0)}px`);
    if (clear === this.topClear) return;
    this.topClear = clear;
    this.stage.style.setProperty('--top-clear', `${clear}px`);
    this.hooks.fit();
  }

  setLevel(l: UiLevel, remember = true): void {
    this.level = l;
    for (const x of LEVELS) document.body.classList.toggle(`ui-${x}`, x === l);
    this.levelBtn.textContent = l === 'clean' ? '○' : l === 'simple' ? '◐' : '●';
    this.levelBtn.title = `Interface: ${l}. Tap for ${LEVELS[(LEVELS.indexOf(l) + 1) % LEVELS.length]}.`;
    this.levelBtn.setAttribute('aria-label', this.levelBtn.title);
    if (remember) {
      try { localStorage.setItem(LEVEL_KEY, l); } catch { /* optional */ }
    }
    this.sig = '';
    this.app.onToolChange(); // labels that depend on the level (the paint target) refresh too
    this.update();
    setTimeout(() => this.hooks.fit(), 60);
  }

  private bubble(label: string, icon: string, title: string): HTMLButtonElement {
    const b = el('button', { type: 'button', class: 'bub', title, 'aria-label': label }, label);
    decorate(b, icon);
    return b;
  }

  private chip(label: string, title: string, on: boolean, fn: (b: HTMLButtonElement) => void, icon?: string): HTMLButtonElement {
    const b = el('button', { type: 'button', class: `bub-chip${on ? ' on' : ''}${icon ? ' icon' : ''}`, title, 'aria-pressed': String(on), 'aria-label': label }, label);
    if (icon) decorate(b, icon);
    b.addEventListener('click', () => fn(b));
    return b;
  }

  /** Drawing Guide: one button that steps through the symmetries. */
  private symmetryChip(): HTMLButtonElement {
    const a = this.app;
    const order: SymmetryMode[] = ['off', 'vertical', 'horizontal', 'quadrant', 'radial'];
    const names: Record<SymmetryMode, string> = { off: 'Symmetry', vertical: 'Mirror \u2194', horizontal: 'Mirror \u2195', quadrant: 'Quadrant', radial: 'Radial' };
    const next = order[(order.indexOf(a.symmetry) + 1) % order.length]!;
    return this.chip(names[a.symmetry], `Symmetry: ${a.symmetry}. Tap for ${next}.`, a.symmetry !== 'off', () => a.setSymmetry(next), 'symmetry');
  }

  /** Adjustments: Colour (hue, saturation, brightness) or Blur, live sliders, Apply / Cancel. */
  private adjustControls(): HTMLElement[] {
    const a = this.app;
    const adj = a.adjusting!;
    const slider = (label: string, min: number, max: number, value: number, set: (n: number) => void) => {
      const wrap = el('label', { class: 'bub-slider' });
      const name = el('span', {}, label);
      const r = el('input', { type: 'range', min: String(min), max: String(max), step: '1', 'aria-label': label });
      r.value = String(value);
      const num = el('span', { class: 'bub-num' }, String(value));
      r.addEventListener('input', () => { num.textContent = r.value; set(Number(r.value)); });
      // double-tap the name to reset it
      wrap.addEventListener('dblclick', () => { r.value = '0'; num.textContent = '0'; set(0); });
      wrap.append(name, r, num);
      return wrap;
    };
    // Apply / Cancel first, so they stay in view when the sliders run past the edge
    const out: HTMLElement[] = [
      this.chip('Apply', 'Keep the change', false, () => a.applyAdjust(), 'check'),
      this.chip('Cancel', 'Put it back', false, () => a.cancelAdjust(), 'close'),
      this.chip('Colour', 'Hue, saturation and brightness', adj.kind === 'hsb', () => a.beginAdjust('hsb')),
      this.chip('Blur', 'Gaussian blur', adj.kind === 'blur', () => a.beginAdjust('blur')),
    ];
    if (adj.kind === 'hsb') {
      out.push(
        slider('Hue', -180, 180, adj.hsb.hue, (n) => a.setAdjust({ hue: n })),
        slider('Sat', -100, 100, adj.hsb.sat, (n) => a.setAdjust({ sat: n })),
        slider('Bright', -100, 100, adj.hsb.bright, (n) => a.setAdjust({ bright: n })),
      );
    } else out.push(slider('Radius', 0, 40, adj.blur, (n) => a.setAdjust({ blur: n })));
    return out;
  }

  /** Which tool bubble is lit. */
  private current(): ToolKey {
    const a = this.app;
    if (a.tool === 'fill') return a.fillMode === 'lasso' ? 'select' : 'fill';
    if (a.adjusting) return 'adjust';
    if (a.tool === 'brush' && a.smudging) return 'smudge';
    return a.tool as ToolKey;
  }

  private get flipOn(): boolean {
    return !!this.hooks.flip?.on() && this.app.workspace === 'draw';
  }

  private toolsFor(ws: Workspace): [ToolKey, string, string][] {
    if (this.flipOn) return [['brush', 'Brush', 'brush'], ['pen', 'Vector', 'pen'], ['eraser', 'Eraser', 'eraser'], ['fill', 'Fill', 'fill'], ['color', 'Colour', ''], ['layers', 'Layers', 'layers']];
    const draw: [ToolKey, string, string][] = [['brush', 'Brush', 'brush'], ['smudge', 'Smudge', 'smudge'], ['pen', 'Vector', 'pen'], ['eraser', 'Eraser', 'eraser'], ['fill', 'Fill', 'fill'], ['select', 'Select', 'lasso'], ['adjust', 'Adjust: hue, saturation, brightness, blur', 'adjust']];
    if (ws === 'draw') return [...draw, ['color', 'Colour', ''], ['layers', 'Layers', 'layers']];
    if (ws === 'time') return [['flip', 'Flipbook', 'flipbook'], ['onion', 'Onion', 'onion'], ['brush', 'Brush', 'brush'], ['eraser', 'Eraser', 'eraser'], ['color', 'Colour', ''], ['layers', 'Layers', 'layers']];
    if (ws === 'board') return [['panel', 'New panel', 'plus'], ['images', 'Import images as panels', 'gallery'], ['dup', 'Duplicate panels', 'copy'], ['del', 'Delete panels', 'trash'], ['play', 'Play the animatic', 'play'], ['export', 'Export the storyboard', 'export']];
    if (ws === 'motion') return [['addlayer', 'New drawing layer', 'plus'], ['camera', 'Add a camera', 'camera'], ['group', 'Group the selected layers', 'layers'], ['split', 'Split at the playhead', 'scissors'], ['autokey', 'Auto-key: every change writes a keyframe', 'key'], ['look', 'Look through the camera', 'eye']];
    return [];
  }

  private pickTool(k: ToolKey, b: HTMLButtonElement): void {
    const a = this.app;
    if (a.transforming && k !== 'select') a.cancelTransform();
    if (a.adjusting && k !== 'adjust' && k !== 'color' && k !== 'layers') a.applyAdjust();
    switch (k) {
      case 'adjust': if (!a.adjusting) a.beginAdjust('hsb'); break;
      case 'brush': case 'pen': case 'eraser':
        if (a.tool === k && !(k === 'brush' && a.smudging)) this.hooks.brushLibrary(b);
        else { a.setTool(k as Tool); if (k === 'brush') a.setSmudging(false); }
        break;
      case 'smudge': a.setSmudging(true); break;
      case 'fill':
        a.selectMoves = false;
        a.setTool('fill');
        if (a.fillMode === 'lasso') a.setFillMode('tap');
        break;
      case 'select':
        a.setTool('fill');
        a.setFillMode('lasso');
        a.selectMoves = true;
        break;
      case 'color': this.hooks.colorPanel(b); break;
      case 'layers':
        // anchored to the tool bar itself: the bubble is rebuilt when tools change
        if (this.hooks.layerCards) this.hooks.layerCards(this.tools);
        else this.layersOpen = !this.layersOpen;
        break;
      case 'flip': a.flipToBlank(); break;
      case 'onion': a.toggleOnion(); break;
      case 'panel': if (!a.board) a.createBoard(); else a.addPanel(); break;
      case 'images': this.hooks.story?.images(); break;
      case 'dup': void a.duplicateSelection(); break;
      case 'del': a.deleteFrame(); break;
      case 'play': a.togglePlay(); break;
      case 'export': this.hooks.story?.exportBoard(); break;
      case 'addlayer': a.editor.addLayer('drawings'); break;
      case 'camera': a.editor.addLayer('camera'); break;
      case 'group': this.hooks.motion?.group(); break;
      case 'split': this.hooks.motion?.split(); break;
      case 'autokey': a.editor.autoKey = !a.editor.autoKey; a.editor.onChange(); break;
      case 'look': a.editor.throughCamera = !a.editor.throughCamera; a.requestRender(); a.editor.onChange(); break;
    }
    this.sig = '';
    this.update();
  }

  /**
   * Point editing: thinner / thicker steps, and a meter you pull up (thicker) or down (thinner).
   * The meter is never rebuilt during a pull, so the gesture is not lost.
   */
  private widthControls(): HTMLElement[] {
    const a = this.app;
    const readout = el('span', { class: 'bub-hint' });
    const show = () => { readout.textContent = a.pointWidthLabel; };
    show();
    const meter = el('div', { class: 'bub-meter', role: 'slider', tabindex: '0', 'aria-label': 'Line thickness: pull up for thicker, down for thinner', title: 'Pull up: thicker. Pull down: thinner.' });
    meter.append(el('span', { class: 'bub-meter-fill' }));
    let y0: number | null = null;
    meter.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!a.pointWidthReady()) return;
      try { meter.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      y0 = e.clientY;
      meter.classList.add('active');
    });
    meter.addEventListener('pointermove', (e) => {
      if (y0 === null) return;
      a.setPointWidthLive(Math.exp(-(e.clientY - y0) / 90));
      show();
    });
    const end = () => {
      if (y0 === null) return;
      y0 = null;
      meter.classList.remove('active');
      a.commitPointWidth();
      show();
    };
    meter.addEventListener('pointerup', end);
    meter.addEventListener('pointercancel', end);
    meter.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); a.nudgePointWidth(e.key === 'ArrowUp' ? 1.15 : 1 / 1.15); show(); }
    });
    const sel = a.pointSelMode;
    return [
      this.chip(sel === 'straight' ? 'Straight point' : 'Curved point', sel ? 'Switch this point between straight and curved (or hold the point)' : 'Tap a point first; hold a point to switch it', sel === 'straight', () => a.togglePoint(), sel === 'straight' ? 'straightpt' : 'curvept'),
      this.chip('All straight', 'Make every point straight: clean lines between the corners', false, () => a.straightenAllPoints(), 'allstraight'),
      this.chip('Point settings', 'Point settings: straight by default, snapping, joining, points after hold', this.pointSettings, () => { this.pointSettings = !this.pointSettings; this.sig = ''; this.update(); }, 'gear'),
      ...(this.pointSettings
        ? [
            this.chip('New points straight', 'Points start straight instead of curved', a.straightDefault, () => a.setStraightDefault(!a.straightDefault)),
            this.chip('Snap points', 'A dragged point snaps onto other points of the lines here', a.snapPoints, () => a.setSnapPoints(!a.snapPoints)),
            this.chip('Merge on snap', 'Drop a line\u2019s end on another line\u2019s end to join them into one', a.mergeOnSnap, () => a.setMergeOnSnap(!a.mergeOnSnap)),
            this.chip('Points after hold', 'Show a vector line\u2019s points right after a hold snaps it', a.pointsAfterHold, () => a.setPointsAfterHold(!a.pointsAfterHold)),
          ]
        : []),
      this.chip(
        a.pointWidthScope === 'point' ? 'Width: this point' : a.pointWidthScope === 'section' ? 'Width: sections' : 'Width: whole line',
        `Width for ${a.pointWidthScope === 'point' ? 'the chosen point' : a.pointWidthScope === 'section' ? 'the sections you tap' : 'the whole line'}. Tap to switch: whole line, point, sections`,
        a.pointWidthScope !== 'all',
        () => a.setPointWidthScope(a.pointWidthScope === 'all' ? 'point' : a.pointWidthScope === 'point' ? 'section' : 'all'),
        a.pointWidthScope === 'point' ? 'wpoint' : a.pointWidthScope === 'section' ? 'wsection' : 'wline',
      ),
      this.chip('Thinner', 'A step thinner', false, () => { a.nudgePointWidth(1 / 1.15); show(); }, 'thinner'),
      meter,
      this.chip('Thicker', 'A step thicker', false, () => { a.nudgePointWidth(1.15); show(); }, 'thicker'),
      readout,
      this.chip('Done', 'Finish editing points (Enter, or tap empty canvas)', false, () => a.exitPointEdit(), 'check'),
    ];
  }

  /** Drag the colour bubble onto the canvas and let go: ColorDrop fills the area there. A tap still opens the colour panel. */
  private bindColorDrop(b: HTMLButtonElement): void {
    let start: { id: number; x: number; y: number } | null = null;
    let dot: HTMLElement | null = null;
    let dragged = false;
    b.addEventListener('pointerdown', (e) => {
      start = { id: e.pointerId, x: e.clientX, y: e.clientY };
      dragged = false;
      try { b.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    });
    b.addEventListener('pointermove', (e) => {
      if (!start || start.id !== e.pointerId) return;
      if (!dragged && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 12) return;
      dragged = true;
      if (!dot) {
        dot = el('div', { class: 'colordrop-dot' });
        dot.style.background = this.app.color;
        document.body.append(dot);
      }
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
    });
    const end = (e: PointerEvent, cancel: boolean) => {
      if (!start || start.id !== e.pointerId) return;
      start = null;
      dot?.remove();
      dot = null;
      if (dragged && !cancel && !this.app.colorDropAt(e.clientX, e.clientY)) this.app.onNotice?.('Drop the colour inside an area of the drawing to fill it.');
    };
    b.addEventListener('pointerup', (e) => end(e, false));
    b.addEventListener('pointercancel', (e) => end(e, true));
    // a drag is not a tap: keep the colour panel shut
    b.addEventListener('click', (e) => { if (dragged) { e.stopImmediatePropagation(); dragged = false; } }, true);
  }

  /** Refresh after any tool, frame, selection or workspace change (cheap when nothing changed). */
  update(): void {
    const a = this.app;
    const ws = a.workspace;
    const cur = this.current();
    const sel = !!a.spatialSelection;
    const xp = a.transformParams;
    const flip = this.flipOn;
    const cels = this.layersOpen && (ws === 'draw' || ws === 'time') ? a.celLayers : [];
    const editing = a.pointEditing;
    const shape = !!this.hooks.editShape && a.shapeEditable && !editing && !a.transforming && (a.tool === 'brush' || a.tool === 'pen');
    const sig = [shape, a.lastShape?.choice ?? '', a.editor.autoKey, a.editor.throughCamera, a.editor.keyAtStart, this.hooks.story?.view() ?? '', ws === 'board' ? a.playing : '', this.level, ws, flip, cur, editing, a.pointStroke?.id ?? '', a.pointSelMode ?? '', a.straightDefault, a.pointsAfterHold, a.snapPoints, a.mergeOnSnap, this.pointSettings, a.pointWidthScope, a.pointChoiceSig, a.drawing.vectors.length, this.layersOpen, a.project.activeLayer, cels.map((l) => `${l.id}:${l.name}:${l.visible}`).join(','), a.plane, a.fillMode, sel, a.blankPage, a.onion.enabled, a.color, xp ? JSON.stringify(xp) : '', a.uiHidden, a.adjusting?.kind ?? '', a.symmetry, a.editor.keys.size].join('|');
    setTimeout(() => this.measure(), 0);
    for (const b of this.modes.querySelectorAll<HTMLButtonElement>('[data-ws]')) b.setAttribute('aria-pressed', String(b.dataset.ws === ws && !flip));
    this.modes.querySelector('[data-mode="flip"]')?.setAttribute('aria-pressed', String(flip));
    this.modeName.textContent = flip ? 'Flip' : { draw: 'Draw', time: 'Timing', motion: 'Motion', board: 'Story' }[ws];
    if (sig === this.sig) return;
    this.sig = sig;

    // tool bubbles for this mode
    this.tools.replaceChildren();
    for (const [k, label, icon] of this.toolsFor(ws)) {
      const b = icon ? this.bubble(label, icon, label) : el('button', { type: 'button', class: 'bub bub-color', title: 'Colour', 'aria-label': 'Colour' });
      if (k === 'color') {
        b.style.setProperty('--chip', a.color);
        this.bindColorDrop(b);
      }
      const on = k === 'layers' ? this.layersOpen
        : k === 'autokey' ? a.editor.autoKey
        : k === 'look' ? a.editor.throughCamera
        : k === 'play' ? a.playing
        : k === cur || (k === 'onion' && a.onion.enabled) || (k === 'flip' && a.blankPage);
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', () => this.pickTool(k, b));
      this.tools.append(b);
    }

    // context: only what the chosen tool needs
    this.ctx.replaceChildren();
    const add = (...c: HTMLElement[]) => this.ctx.append(...c);
    // right after a snap: change the shape from here (no floating button on the simple screen)
    if (shape) add(this.chip('Edit shape', 'Change what the stroke snapped to, or keep your own stroke', false, (b) => this.hooks.editShape!(b), 'editpoints'));
    if (editing) {
      add(...this.widthControls());
    } else if (this.layersOpen && (ws === 'draw' || ws === 'time') && !xp) {
      // tight layer control: only this cel's linked layers, front first; tap one to draw on it
      const me = a.project.isPlaceholder ? '' : a.project.activeLayer;
      cels.forEach((l) => {
        add(this.chip(l.name, l.id === me ? 'You draw on this layer' : `Draw on ${l.name}`, l.id === me, () => { if (l.id !== me) a.pickLayer(l.id); this.sig = ''; this.update(); }));
      });
      add(this.chip('+ Layer', 'A new art layer for these cels: same frames and timing, its own drawing', false, () => { a.addCelLayer(); this.sig = ''; this.update(); }));
      if (!flip) add(this.chip('All layers', 'Every layer of the shot', false, (b) => this.hooks.layers(b)));
    } else if (xp) {
      const step = (label: string, title: string, patch: () => Partial<XParams>) => this.chip(label, title, false, () => a.setTransform(patch()));
      add(
        step('\u2212', 'Smaller', () => ({ scale: xp.scale / 1.1 })),
        step('+', 'Bigger', () => ({ scale: xp.scale * 1.1 })),
        step('\u27f2', 'Rotate left 15\u00b0', () => ({ rotate: xp.rotate - 15 })),
        step('\u27f3', 'Rotate right 15\u00b0', () => ({ rotate: xp.rotate + 15 })),
        this.chip('\u2194', 'Mirror left to right', xp.flipH, () => a.flipTransform('h')),
        this.chip('\u2195', 'Mirror top to bottom', xp.flipV, () => a.flipTransform('v')),
        this.chip('Apply', 'Keep it (Enter)', false, () => a.applyTransform(), 'check'),
        this.chip('Cancel', 'Put it back (Esc)', false, () => a.cancelTransform(), 'close'),
      );
    } else if (cur === 'adjust' && a.adjusting) {
      add(...this.adjustControls());
    } else if (cur === 'smudge') {
      const lbl = el('span', { class: 'bub-hint' }, `Strength ${Math.round(a.smudgeStrength * 100)}%`);
      add(
        this.chip('Line', 'Smudge the LINE', a.plane === 'line', () => { a.setPlane('line'); a.setSmudging(true); }),
        this.chip('Fill', 'Smudge the FILL', a.plane === 'fill', () => { a.setPlane('fill'); a.setSmudging(true); }),
        this.chip('Softer', 'Carry less paint', false, () => { a.smudgeStrength = Math.max(0.1, a.smudgeStrength - 0.1); lbl.textContent = `Strength ${Math.round(a.smudgeStrength * 100)}%`; }, 'thinner'),
        lbl,
        this.chip('Stronger', 'Carry more paint', false, () => { a.smudgeStrength = Math.min(1, a.smudgeStrength + 0.1); lbl.textContent = `Strength ${Math.round(a.smudgeStrength * 100)}%`; }, 'thicker'),
      );
    } else if (flip) {
      if (cur === 'brush' || cur === 'eraser') add(this.chip('Brushes', 'Brush library', false, (b) => this.hooks.brushLibrary(b)));
      if (cur === 'pen' && a.drawing.vectors.some((v) => v.tool === 'pen')) add(this.chip('Edit points', 'Drag the corners and bends of a vector line; set its thickness', false, () => a.enterPointEdit()));
    } else if ((ws === 'draw' || ws === 'time') && (cur === 'brush' || cur === 'pen' || cur === 'eraser')) {
      add(
        this.chip('Brushes', 'Brush library', false, (b) => this.hooks.brushLibrary(b)),
        this.chip('Line', 'Paint on LINE: your ink', a.plane === 'line', () => a.setPlane('line')),
        this.chip('Fill', 'Paint on FILL: colour under the ink', a.plane === 'fill', () => a.setPlane('fill')),
        this.symmetryChip(),
      );
      if (cur === 'pen' && a.drawing.vectors.some((v) => v.tool === 'pen')) add(this.chip('Edit points', 'Drag the corners and bends of a vector line; set its thickness', false, () => a.enterPointEdit()));
    } else if (cur === 'fill') {
      add(
        this.chip('Tap / drag', 'Fill the areas you tap or drag across', a.fillMode === 'tap', () => a.setFillMode('tap')),
        this.chip('Leftovers', 'Clean up specks the fill missed', a.fillMode === 'leftover', () => a.setFillMode('leftover')),
      );
      if (sel) add(this.chip('Fill selection', 'Colour everything inside the selection', false, () => a.fillSelectedArea()));
    } else if (cur === 'select') {
      if (sel) {
        add(
          this.chip('Transform', 'Move, size, rotate or flip what is selected (drag the canvas to move)', false, () => a.beginTransform()),
          this.chip('Fill', 'Colour everything inside the selection', false, () => a.fillSelectedArea()),
          this.chip('Clear', 'Drop the selection', false, () => a.clearSpatialSelection()),
        );
      } else add(el('span', { class: 'bub-hint' }, 'Draw a loop to move it, or'));
      add(this.chip('Move all', 'Move, size or rotate the whole drawing', false, () => a.moveAll(), 'motion'));
    } else if (ws === 'board') {
      const st = this.hooks.story;
      if (st) {
        for (const [v, label] of [['panels', 'Panels'], ['timeline', 'Timeline'], ['split', 'Split']] as const) add(this.chip(label, `Board view: ${label}`, st.view() === v, () => { st.setView(v); this.sig = ''; this.update(); }));
      }
      add(this.chip('Earlier', 'Move the selected panels earlier', false, () => a.moveSelection(-1)), this.chip('Later', 'Move the selected panels later', false, () => a.moveSelection(1)));
      add(this.chip('Animate this shot', 'Draw the animation on top of the board', false, () => a.animateShot(), 'draw'));
    } else if (ws === 'motion') {
      // easing, reverse and delete only when keys are selected; otherwise just how new keys start
      if (a.editor.keys.size) {
        for (const e of EASINGS) add(this.chip(e.label, `Easing of the selected keys: ${e.label}`, false, () => a.editor.setEasing(e.id)));
        add(this.chip('Reverse', 'Play the selected keys backwards', false, () => a.editor.reverse()));
        add(this.chip('Delete key', 'Delete the selected keys', false, () => a.editor.deleteKeys(), 'trash'));
      }
      add(this.chip('Key at start', 'The first key also keeps the old value at frame 0, so motion begins at once', a.editor.keyAtStart, () => { a.editor.keyAtStart = !a.editor.keyAtStart; a.editor.onChange(); }));
    } else if (ws === 'time') {
      add(
        this.chip('New page', 'A fresh blank page after the last drawing', a.blankPage, () => a.flipToBlank()),
        this.chip('◀', 'Previous frame', false, () => a.prevFrame()),
        this.chip('▶', 'Next frame', false, () => a.nextFrame()),
      );
    }
    this.ctx.hidden = !this.ctx.childElementCount;
  }
}
