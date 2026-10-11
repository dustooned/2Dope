import type { App } from '../app';
import { FPS_PRESETS } from '../core/project';
import type { Tool } from '../core/stroke';

const KEY = '2dope.m1.quick';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * Quick Animate: the same project in a stripped-down view. Big canvas, a slim flipbook strip, and
 * one small floating bar with brush / eraser / fill, color, size, undo/redo, play, add frame,
 * exposure and onion. Everything else is one tap away under "More". The bar and strip fade out
 * while the pen is down and come back when it lifts. Tab toggles it.
 */
export class Quick {
  on = false;
  private readonly bar: HTMLElement;
  private readonly more: HTMLElement;
  private readonly toolBtns = new Map<Tool, HTMLButtonElement>();
  private readonly playBtn: HTMLButtonElement;
  private readonly onionBtn: HTMLButtonElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly redoBtn: HTMLButtonElement;
  private readonly size: HTMLInputElement;
  private readonly color: HTMLInputElement;
  private readonly fps: HTMLSelectElement;
  private readonly planeBtn: HTMLButtonElement;
  private readonly lockBtn: HTMLButtonElement;

  constructor(
    private readonly app: App,
    host: HTMLElement,
    private readonly actions: { exportPng: () => void; saveFile: () => void; exportSeq: () => void },
  ) {
    this.bar = host;
    host.classList.add('quickbar');
    host.setAttribute('role', 'toolbar');
    host.setAttribute('aria-label', 'Quick Animate');
    const btn = (label: string, title: string, fn: () => void, cls = '') => {
      const b = el('button', { type: 'button', title, class: cls }, label);
      b.addEventListener('click', fn);
      return b;
    };
    const group = (...kids: HTMLElement[]) => {
      const g = el('div', { class: 'group' });
      g.append(...kids);
      return g;
    };

    for (const [tool, label, key] of [
      ['brush', 'Brush', 'B'],
      ['eraser', 'Eraser', 'E'],
      ['fill', 'Fill', 'G'],
    ] as [Tool, string, string][]) {
      const b = btn(label, `${label} (${key})`, () => app.setTool(tool));
      this.toolBtns.set(tool, b);
    }
    this.color = el('input', { type: 'color', 'aria-label': 'Color', title: 'Color' });
    this.color.addEventListener('input', () => app.setColor(this.color.value));
    this.size = el('input', { type: 'range', min: '1', max: '150', step: '1', 'aria-label': 'Brush size', title: 'Brush size ( [ and ] )', class: 'quick-size' });
    this.size.addEventListener('input', () => {
      app.brush.size = Number(this.size.value);
      app.brushChanged();
    });
    this.undoBtn = btn('Undo', 'Undo', () => app.undo());
    this.redoBtn = btn('Redo', 'Redo', () => app.redo());
    this.playBtn = btn('Play', 'Play / pause (Enter)', () => app.togglePlay(), 'play');
    this.onionBtn = btn('Onion', 'Onion skin (O)', () => app.toggleOnion());
    this.fps = el('select', { 'aria-label': 'Frames per second', title: 'Frames per second' });
    for (const f of FPS_PRESETS) this.fps.append(el('option', { value: String(f) }, `${f}`));
    this.fps.addEventListener('change', () => app.setFps(Number(this.fps.value)));

    this.planeBtn = btn('Line', 'Drawing on the Line plane. Tap to draw color on the Fill plane (X).', () => app.togglePlane());
    this.lockBtn = btn('Lock', 'Scrub lock (L)', () => app.toggleLock());

    const moreBtn = btn('More ⋯', 'More tools', () => this.more.classList.toggle('open'));
    this.more = el('div', { class: 'quick-more' });
    this.more.append(
      btn('Vector pen', 'Vector pen (P)', () => app.setTool('pen')),
      this.planeBtn,
      btn('Duplicate', 'Duplicate drawing (D)', () => app.duplicateFrame()),
      btn('Delete', 'Delete drawing', () => app.deleteFrame()),
      this.lockBtn,
      btn('Fit view', 'Fit (F)', () => app.fit()),
      btn('Flip view', 'Flip view (H)', () => app.flipView()),
      btn('Export PNG', 'Export this frame as PNG with alpha', () => actions.exportPng()),
      btn('Export sequence…', 'Export the whole shot as PNG sequences', () => actions.exportSeq()),
      btn('Save .2dope', 'Save a project file', () => actions.saveFile()),
      btn('Exit Quick Animate', 'Back to the full interface (Tab)', () => this.set(false)),
    );

    host.append(
      group(...this.toolBtns.values()),
      group(this.color, this.size),
      group(this.undoBtn, this.redoBtn),
      group(btn('◀', 'Previous frame (←)', () => app.prevFrame()), this.playBtn, btn('▶', 'Next frame (→)', () => app.nextFrame()), btn('+ Frame', 'New drawing after this one (N)', () => app.addFrame())),
      group(
        btn('1s', 'Exposure on ones (1)', () => app.setExposure(1)),
        btn('2s', 'Exposure on twos (2)', () => app.setExposure(2)),
        btn('3s', 'Exposure on threes (3)', () => app.setExposure(3)),
        this.fps,
        this.onionBtn,
      ),
      moreBtn,
      this.more,
    );

    app.onStrokeState = (active) => {
      document.body.classList.toggle('drawing', active);
      if (active) this.more.classList.remove('open');
    };
    try {
      // First visit on a small screen (an iPad held upright, a phone): start in Quick Animate.
      const saved = localStorage.getItem(KEY);
      if (saved === '1' || (saved === null && window.innerWidth < 900)) this.set(true);
    } catch {
      // preference unavailable: start in the full interface
    }
    this.update();
  }

  toggle(): void {
    this.set(!this.on);
  }

  set(on: boolean): void {
    this.on = on;
    if (on) this.app.setWorkspace('draw');
    document.body.classList.toggle('quick', on);
    this.more.classList.remove('open');
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      // not persisted: fine
    }
    // the stage changes size; refit once the layout has settled
    setTimeout(() => this.app.fit(), 80);
    this.update();
  }

  /** Keep button states in step with the app. Cheap; call on any change. */
  update(): void {
    const app = this.app;
    for (const [tool, b] of this.toolBtns) b.setAttribute('aria-pressed', String(app.tool === tool));
    this.playBtn.textContent = app.playing ? 'Pause' : 'Play';
    this.playBtn.setAttribute('aria-pressed', String(app.playing));
    this.onionBtn.setAttribute('aria-pressed', String(app.onion.enabled));
    this.undoBtn.disabled = !app.history.canUndo;
    this.redoBtn.disabled = !app.history.canRedo;
    if (document.activeElement !== this.size) this.size.value = String(Math.round(app.brush.size));
    if (document.activeElement !== this.color) this.color.value = app.color;
    this.fps.value = String(app.project.fps);
    this.planeBtn.textContent = app.plane === 'line' ? 'Draw on: Line' : 'Draw on: Fill';
    this.planeBtn.setAttribute('aria-pressed', String(app.plane === 'fill'));
    this.lockBtn.textContent = app.lockFrame === null ? 'Lock' : `Home ${app.lockFrame + 1}`;
    this.lockBtn.setAttribute('aria-pressed', String(app.lockFrame !== null));
  }
}
