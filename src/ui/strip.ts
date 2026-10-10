import type { App } from '../app';
import { drawVectorStroke } from '../brush/vector';
import { FPS_PRESETS, type Drawing } from '../core/project';
import { strokeLength } from '../core/stroke';
import { locate, startOf } from '../core/timeline';

const CELL = 64;
const THUMB_W = 56;
const THUMB_H = 32;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * The flipbook strip: one block per drawing, stretched over its hold, with a thumbnail and its
 * drawing number. Click or drag to scrub. Holds show as a line through the extra frames.
 */
export class Strip {
  private readonly track: HTMLElement;
  private readonly inner: HTMLElement;
  private readonly playhead: HTMLElement;
  private readonly frameLabel: HTMLElement;
  private readonly holdLabel: HTMLElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly fpsSel: HTMLSelectElement;
  private readonly onionBtn: HTMLButtonElement;
  private readonly lockBtn: HTMLButtonElement;
  private readonly beforeSel: HTMLSelectElement;
  private readonly afterSel: HTMLSelectElement;
  private readonly opacityRange: HTMLInputElement;
  private readonly lockMark: HTMLElement;
  private readonly thumbs = new Map<string, { rev: number; canvas: HTMLCanvasElement }>();
  private signature = '';

  constructor(
    private readonly app: App,
    root: HTMLElement,
  ) {
    const bar = el('div', { class: 'strip-bar' });
    const btn = (label: string, title: string, fn: () => void, cls = '') => {
      const b = el('button', { type: 'button', title, class: cls }, label);
      b.addEventListener('click', fn);
      return b;
    };
    this.playBtn = btn('Play', 'Play / pause (Enter or tap Space)', () => app.togglePlay(), 'play');
    this.frameLabel = el('span', { class: 'readout frame-readout' });
    this.fpsSel = el('select', { 'aria-label': 'Frames per second', title: 'Frames per second' });
    for (const f of FPS_PRESETS) this.fpsSel.append(el('option', { value: String(f) }, `${f} fps`));
    this.fpsSel.addEventListener('change', () => app.setFps(Number(this.fpsSel.value)));
    this.holdLabel = el('span', { class: 'readout hold-readout', title: 'Frames this drawing is held' });

    const nav = el('div', { class: 'group' });
    nav.append(
      btn('⏮', 'Previous drawing (↓)', () => app.prevDrawing()),
      btn('◀', 'Previous frame (←)', () => app.prevFrame()),
      this.playBtn,
      btn('▶', 'Next frame (→)', () => app.nextFrame()),
      btn('⏭', 'Next drawing (↑)', () => app.nextDrawing()),
    );
    const edit = el('div', { class: 'group' });
    edit.append(
      btn('+ Frame', 'New drawing after this frame (N)', () => app.addFrame()),
      btn('Duplicate', 'Duplicate drawing (D)', () => app.duplicateFrame()),
      btn('Delete', 'Delete drawing and its hold (Delete)', () => app.deleteFrame()),
    );
    const hold = el('div', { class: 'group' });
    hold.append(
      el('span', { class: 'name' }, 'Hold'),
      btn('−', 'Shorter hold (−)', () => app.changeHold(-1)),
      this.holdLabel,
      btn('+', 'Longer hold (=)', () => app.changeHold(1)),
    );
    const onion = el('div', { class: 'group' });
    this.onionBtn = btn('Onion', 'Onion skin on/off (O)', () => app.toggleOnion());
    const count = (label: string, title: string, get: () => number, set: (n: number) => void) => {
      const sel = el('select', { 'aria-label': title, title });
      for (let n = 0; n <= 5; n++) sel.append(el('option', { value: String(n) }, String(n)));
      sel.value = String(get());
      sel.addEventListener('change', () => {
        set(Number(sel.value));
        app.onionChanged();
      });
      onion.append(el('span', { class: 'name' }, label), sel);
      return sel;
    };
    onion.append(this.onionBtn);
    this.beforeSel = count('◀', 'Previous drawings shown (blue)', () => app.onion.before, (n) => (app.onion.before = n));
    this.afterSel = count('▶', 'Next drawings shown (red)', () => app.onion.after, (n) => (app.onion.after = n));
    this.opacityRange = el('input', { type: 'range', min: '0.1', max: '0.9', step: '0.05', 'aria-label': 'Onion opacity', title: 'Onion opacity', class: 'onion-opacity' });
    this.opacityRange.value = String(app.onion.opacity);
    this.opacityRange.addEventListener('input', () => {
      app.onion.opacity = Number(this.opacityRange.value);
      app.onionChanged();
    });
    onion.append(this.opacityRange);
    this.lockBtn = btn('Lock', 'Scrub lock (L): mark this frame as home. Drag the strip or hold Shift + arrows to flip; it snaps back when you let go.', () => app.toggleLock());
    onion.append(this.lockBtn);
    bar.append(nav, this.frameLabel, this.fpsSel, edit, hold, onion);

    this.track = el('div', { class: 'strip-track', role: 'slider', 'aria-label': 'Frames', tabindex: '0' });
    this.inner = el('div', { class: 'strip-inner' });
    this.playhead = el('div', { class: 'strip-playhead' });
    this.lockMark = el('div', { class: 'strip-lock', title: 'Scrub lock home frame' }, '⌂');
    this.track.append(this.inner);
    root.append(bar, this.track);

    let scrubbing = false;
    const frameAt = (e: PointerEvent) => {
      const r = this.inner.getBoundingClientRect();
      return Math.floor((e.clientX - r.left) / CELL);
    };
    this.track.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      scrubbing = true;
      try {
        this.track.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      app.beginScrub();
      app.setFrame(Math.min(frameAt(e), app.project.length - 1));
    });
    this.track.addEventListener('pointermove', (e) => {
      if (scrubbing) app.setFrame(Math.max(0, Math.min(frameAt(e), app.project.length - 1)));
    });
    const stop = () => {
      if (!scrubbing) return;
      scrubbing = false;
      app.endScrub();
    };
    this.track.addEventListener('pointerup', stop);
    this.track.addEventListener('pointercancel', stop);

    this.update();
  }

  /** Call when the frame or the timeline changes. Rebuilds blocks only when needed. */
  update(): void {
    const app = this.app;
    const p = app.project;
    const sig = p.exposures.map((e) => `${e.drawing}:${e.length}:${p.drawing(e.drawing).rev}`).join('|');
    if (sig !== this.signature) {
      this.signature = sig;
      this.rebuild();
    }
    const total = p.length;
    this.frameLabel.textContent = `${app.frame + 1} / ${total}`;
    const l = locate(p.exposures, app.frame);
    this.holdLabel.textContent = l ? String(p.exposures[l.index]!.length) : '-';
    this.playBtn.textContent = app.playing ? 'Pause' : 'Play';
    this.playBtn.setAttribute('aria-pressed', String(app.playing));
    this.fpsSel.value = String(p.fps);
    this.playhead.style.transform = `translateX(${app.frame * CELL}px)`;
    this.onionBtn.setAttribute('aria-pressed', String(app.onion.enabled));
    this.lockBtn.setAttribute('aria-pressed', String(app.lockFrame !== null));
    this.lockBtn.textContent = app.lockFrame === null ? 'Lock' : `Home ${app.lockFrame + 1}`;
    this.beforeSel.value = String(app.onion.before);
    this.afterSel.value = String(app.onion.after);
    this.opacityRange.value = String(app.onion.opacity);
    this.lockMark.style.display = app.lockFrame === null ? 'none' : 'block';
    this.lockMark.style.transform = `translateX(${(app.lockFrame ?? 0) * CELL}px)`;
    for (const b of this.inner.querySelectorAll<HTMLElement>('.block')) {
      b.classList.toggle('current', l !== null && b.dataset.index === String(l.index));
    }
    this.keepVisible();
  }

  private rebuild(): void {
    const p = this.app.project;
    this.inner.replaceChildren();
    this.inner.style.width = `${p.length * CELL}px`;
    const ruler = el('div', { class: 'strip-ruler' });
    for (let f = 0; f < p.length; f++) {
      const n = el('span', {}, String(f + 1));
      n.style.left = `${f * CELL}px`;
      ruler.append(n);
    }
    this.inner.append(ruler);
    p.exposures.forEach((e, i) => {
      const d = p.drawing(e.drawing);
      const block = el('div', { class: 'block', 'data-index': String(i) });
      block.style.left = `${startOf(p.exposures, i) * CELL}px`;
      block.style.width = `${e.length * CELL - 4}px`;
      block.append(this.thumb(d), el('span', { class: 'num' }, String(d.num)));
      if (e.length > 1) block.append(el('span', { class: 'hold-line' }));
      this.inner.append(block);
    });
    this.inner.append(this.lockMark, this.playhead);
    // Forget thumbnails of drawings no longer on the strip.
    const used = new Set(p.exposures.map((e) => e.drawing));
    for (const id of this.thumbs.keys()) if (!used.has(id)) this.thumbs.delete(id);
  }

  private thumb(d: Drawing): HTMLCanvasElement {
    const hit = this.thumbs.get(d.id);
    if (hit && hit.rev === d.rev) return hit.canvas;
    const c = hit?.canvas ?? el('canvas', { width: String(THUMB_W * 2), height: String(THUMB_H * 2), class: 'thumb' });
    const g = c.getContext('2d');
    if (g) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, c.width, c.height);
      const s = Math.min(c.width / d.canvas.width, c.height / d.canvas.height);
      g.setTransform(s, 0, 0, s, 0, 0);
      g.drawImage(d.canvas, 0, 0);
      for (const v of d.vectors) drawVectorStroke(g, v, strokeLength(v.points));
    }
    this.thumbs.set(d.id, { rev: d.rev, canvas: c });
    return c;
  }

  private keepVisible(): void {
    const x = this.app.frame * CELL;
    const t = this.track;
    if (x < t.scrollLeft) t.scrollLeft = x - CELL;
    else if (x + CELL > t.scrollLeft + t.clientWidth) t.scrollLeft = x + CELL * 2 - t.clientWidth;
  }
}
