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
  /** Flip: the beginner drawing-only mode (a sub-mode of Draw). */
  flip?: { on(): boolean; set(on: boolean): void };
}

type ToolKey = 'brush' | 'pen' | 'eraser' | 'fill' | 'select' | 'color' | 'flip' | 'onion' | 'layers';

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

  constructor(private readonly app: App, stage: HTMLElement, private readonly hooks: BubbleHooks) {
    if (hooks.flip) {
      const flip = this.bubble('Flip', 'flipbook', 'Flip: just draw frame after frame, no timing yet');
      flip.dataset.mode = 'flip';
      flip.addEventListener('click', () => hooks.flip!.set(true));
      this.modes.append(flip);
    }
    const modes: [Workspace, string, string][] = [['draw', 'Draw', 'draw'], ['time', 'Animate', 'time'], ['motion', 'Move', 'motion'], ['board', 'Story', 'board']];
    for (const [ws, label, icon] of modes) {
      const b = this.bubble(label, icon, `${label}`);
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
    document.body.append(this.levelBtn);
    try {
      const v = localStorage.getItem(LEVEL_KEY);
      if (v === 'clean' || v === 'simple' || v === 'full') this.level = v;
    } catch { /* default */ }
    this.setLevel(this.level, false);
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

  /** Which tool bubble is lit. */
  private current(): ToolKey {
    const a = this.app;
    if (a.tool === 'fill') return a.fillMode === 'lasso' ? 'select' : 'fill';
    return a.tool as ToolKey;
  }

  private get flipOn(): boolean {
    return !!this.hooks.flip?.on() && this.app.workspace === 'draw';
  }

  private toolsFor(ws: Workspace): [ToolKey, string, string][] {
    if (this.flipOn) return [['brush', 'Brush', 'brush'], ['pen', 'Vector', 'pen'], ['eraser', 'Eraser', 'eraser'], ['fill', 'Fill', 'fill'], ['color', 'Colour', ''], ['layers', 'Layers', 'layers']];
    const draw: [ToolKey, string, string][] = [['brush', 'Brush', 'brush'], ['pen', 'Vector', 'pen'], ['eraser', 'Eraser', 'eraser'], ['fill', 'Fill', 'fill'], ['select', 'Select', 'lasso']];
    if (ws === 'draw') return [...draw, ['color', 'Colour', ''], ['layers', 'Layers', 'layers']];
    if (ws === 'time') return [['flip', 'Flipbook', 'flipbook'], ['onion', 'Onion', 'onion'], ['brush', 'Brush', 'brush'], ['eraser', 'Eraser', 'eraser'], ['color', 'Colour', ''], ['layers', 'Layers', 'layers']];
    return [];
  }

  private pickTool(k: ToolKey, b: HTMLButtonElement): void {
    const a = this.app;
    if (a.transforming && k !== 'select') a.cancelTransform();
    switch (k) {
      case 'brush': case 'pen': case 'eraser':
        if (a.tool === k) this.hooks.brushLibrary(b);
        else a.setTool(k as Tool);
        break;
      case 'fill':
        a.setTool('fill');
        if (a.fillMode === 'lasso') a.setFillMode('tap');
        break;
      case 'select':
        a.setTool('fill');
        a.setFillMode('lasso');
        break;
      case 'color': this.hooks.colorPanel(b); break;
      case 'layers': this.layersOpen = !this.layersOpen; break;
      case 'flip': a.flipToBlank(); break;
      case 'onion': a.toggleOnion(); break;
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
    const sig = [this.level, ws, flip, cur, editing, a.pointStroke?.id ?? '', a.pointSelMode ?? '', a.straightDefault, a.pointsAfterHold, a.snapPoints, a.mergeOnSnap, this.pointSettings, a.pointWidthScope, a.pointChoiceSig, a.drawing.vectors.length, this.layersOpen, a.project.activeLayer, cels.map((l) => `${l.id}:${l.name}:${l.visible}`).join(','), a.plane, a.fillMode, sel, a.blankPage, a.onion.enabled, a.color, xp ? JSON.stringify(xp) : '', a.uiHidden].join('|');
    for (const b of this.modes.querySelectorAll<HTMLButtonElement>('[data-ws]')) b.setAttribute('aria-pressed', String(b.dataset.ws === ws && !flip));
    this.modes.querySelector('[data-mode="flip"]')?.setAttribute('aria-pressed', String(flip));
    this.modeName.textContent = flip ? 'Flip' : { draw: 'Draw', time: 'Animate', motion: 'Move', board: 'Story' }[ws];
    if (sig === this.sig) return;
    this.sig = sig;

    // tool bubbles for this mode
    this.tools.replaceChildren();
    for (const [k, label, icon] of this.toolsFor(ws)) {
      const b = icon ? this.bubble(label, icon, label) : el('button', { type: 'button', class: 'bub bub-color', title: 'Colour', 'aria-label': 'Colour' });
      if (k === 'color') b.style.setProperty('--chip', a.color);
      const on = k === 'layers' ? this.layersOpen : k === cur || (k === 'onion' && a.onion.enabled) || (k === 'flip' && a.blankPage);
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', () => this.pickTool(k, b));
      this.tools.append(b);
    }

    // context: only what the chosen tool needs
    this.ctx.replaceChildren();
    const add = (...c: HTMLElement[]) => this.ctx.append(...c);
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
        step('− Size', 'Smaller', () => ({ scale: xp.scale / 1.1 })),
        step('+ Size', 'Bigger', () => ({ scale: xp.scale * 1.1 })),
        step('⟲ 15°', 'Rotate left', () => ({ rotate: xp.rotate - 15 })),
        step('⟳ 15°', 'Rotate right', () => ({ rotate: xp.rotate + 15 })),
        this.chip('Flip ↔', 'Mirror left to right', xp.flipH, () => a.flipTransform('h')),
        this.chip('Flip ↕', 'Mirror top to bottom', xp.flipV, () => a.flipTransform('v')),
        this.chip('✓ Apply', 'Keep it (Enter)', false, () => a.applyTransform()),
        this.chip('✕ Cancel', 'Put it back (Esc)', false, () => a.cancelTransform()),
      );
    } else if (flip) {
      if (cur === 'brush' || cur === 'eraser') add(this.chip('Brushes', 'Brush library', false, (b) => this.hooks.brushLibrary(b)));
      if (cur === 'pen' && a.drawing.vectors.some((v) => v.tool === 'pen')) add(this.chip('Edit points', 'Drag the corners and bends of a vector line; set its thickness', false, () => a.enterPointEdit()));
    } else if ((ws === 'draw' || ws === 'time') && (cur === 'brush' || cur === 'pen' || cur === 'eraser')) {
      add(
        this.chip('Brushes', 'Brush library', false, (b) => this.hooks.brushLibrary(b)),
        this.chip('Line', 'Paint on LINE: your ink', a.plane === 'line', () => a.setPlane('line')),
        this.chip('Fill', 'Paint on FILL: colour under the ink', a.plane === 'fill', () => a.setPlane('fill')),
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
      } else add(el('span', { class: 'bub-hint' }, 'Draw a loop around what you want'));
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
