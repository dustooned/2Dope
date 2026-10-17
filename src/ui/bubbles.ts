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

  constructor(private readonly app: App, stage: HTMLElement, private readonly hooks: BubbleHooks) {
    const modes: [Workspace, string, string][] = [['draw', 'Draw', 'draw'], ['time', 'Animate', 'flipbook'], ['motion', 'Move', 'motion'], ['board', 'Story', 'board']];
    for (const [ws, label, icon] of modes) {
      const b = this.bubble(label, icon, `${label}`);
      b.dataset.ws = ws;
      b.addEventListener('click', () => app.setWorkspace(ws));
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

  private chip(label: string, title: string, on: boolean, fn: (b: HTMLButtonElement) => void): HTMLButtonElement {
    const b = el('button', { type: 'button', class: `bub-chip${on ? ' on' : ''}`, title, 'aria-pressed': String(on) }, label);
    b.addEventListener('click', () => fn(b));
    return b;
  }

  /** Which tool bubble is lit. */
  private current(): ToolKey {
    const a = this.app;
    if (a.tool === 'fill') return a.fillMode === 'lasso' ? 'select' : 'fill';
    return a.tool as ToolKey;
  }

  private toolsFor(ws: Workspace): [ToolKey, string, string][] {
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
      case 'layers': this.hooks.layers(b); break;
      case 'flip': a.flipToBlank(); break;
      case 'onion': a.toggleOnion(); break;
    }
    this.sig = '';
    this.update();
  }

  /** Refresh after any tool, frame, selection or workspace change (cheap when nothing changed). */
  update(): void {
    const a = this.app;
    const ws = a.workspace;
    const cur = this.current();
    const sel = !!a.spatialSelection;
    const xp = a.transformParams;
    const sig = [this.level, ws, cur, a.plane, a.fillMode, sel, a.blankPage, a.onion.enabled, a.color, xp ? JSON.stringify(xp) : '', a.uiHidden].join('|');
    for (const b of this.modes.querySelectorAll<HTMLButtonElement>('[data-ws]')) b.setAttribute('aria-pressed', String(b.dataset.ws === ws));
    this.modeName.textContent = { draw: 'Draw', time: 'Animate', motion: 'Move', board: 'Story' }[ws];
    if (sig === this.sig) return;
    this.sig = sig;

    // tool bubbles for this mode
    this.tools.replaceChildren();
    for (const [k, label, icon] of this.toolsFor(ws)) {
      const b = icon ? this.bubble(label, icon, label) : el('button', { type: 'button', class: 'bub bub-color', title: 'Colour', 'aria-label': 'Colour' });
      if (k === 'color') b.style.setProperty('--chip', a.color);
      const on = k === cur || (k === 'onion' && a.onion.enabled) || (k === 'flip' && a.blankPage);
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', () => this.pickTool(k, b));
      this.tools.append(b);
    }

    // context: only what the chosen tool needs
    this.ctx.replaceChildren();
    const add = (...c: HTMLElement[]) => this.ctx.append(...c);
    if (xp) {
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
    } else if ((ws === 'draw' || ws === 'time') && (cur === 'brush' || cur === 'pen' || cur === 'eraser')) {
      add(
        this.chip('Brushes', 'Brush library', false, (b) => this.hooks.brushLibrary(b)),
        this.chip('Line', 'Paint on LINE: your ink', a.plane === 'line', () => a.setPlane('line')),
        this.chip('Fill', 'Paint on FILL: colour under the ink', a.plane === 'fill', () => a.setPlane('fill')),
      );
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
