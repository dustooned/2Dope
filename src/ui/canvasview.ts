import type { App } from '../app';
import { overviewEntries, type CanvasView } from '../core/canvasview';
import { isPaintingWorkspace } from '../core/workspace';
import { decorate } from './icons';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

const OPTIONS: [keyof CanvasView, string, string][] = [
  ['overscan', 'Overscan', 'Show art past the page edge (dimmed). Vector lines can be drawn, kept and erased there; Brush paint stops at the edge. Exports keep the page frame.'],
  ['safeAreas', 'Title and action safe', 'Action safe (90%) and title safe (80%) frames. Never exported.'],
  ['centre', 'Centre cross', 'Mark the middle of the page. Never exported.'],
  ['overview', 'Frame overview', 'Small thumbnails of the drawings around this one; tap one to go there.'],
];

const THUMB_W = 64, THUMB_H = 36;

/**
 * Draw and Animate's View button (canvas view options) and its frame overview strip. View-only:
 * every toggle is a device preference in App.canvasView, outside History and the project.
 */
export class CanvasViewUI {
  readonly button = el('button', { type: 'button', class: 'canvas-view-btn', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'canvas-view-options', title: 'Canvas view: Overscan, safe areas, centre and frame overview' }, 'View');
  private readonly pop = el('section', { id: 'canvas-view-options', class: 'canvas-view-pop', role: 'group', 'aria-label': 'Canvas view', hidden: '' });
  private readonly strip = el('nav', { class: 'canvas-overview', 'aria-label': 'Frame overview', hidden: '' });
  private sig = '';

  constructor(private readonly app: App, stage: HTMLElement) {
    decorate(this.button, 'eye');
    this.button.addEventListener('click', () => (this.pop.hidden ? this.open() : this.close(true)));
    stage.append(this.pop, this.strip);
    window.addEventListener('pointerdown', (e) => {
      if (this.pop.hidden || this.pop.contains(e.target as Node) || this.button.contains(e.target as Node)) return;
      this.close(false);
    }, true);
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || this.pop.hidden) return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.close(true);
    }, true);
  }

  private open(): void {
    this.render();
    this.pop.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    const r = this.button.getBoundingClientRect(), s = this.pop.parentElement!.getBoundingClientRect();
    this.pop.style.left = `${Math.max(8, Math.min(r.left - s.left, s.width - this.pop.offsetWidth - 8))}px`;
    this.pop.querySelector<HTMLButtonElement>('button')?.focus();
  }

  close(focusButton: boolean): void {
    if (this.pop.hidden) return;
    this.pop.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    if (focusButton) this.button.focus();
  }

  private render(): void {
    const v = this.app.canvasView;
    this.pop.replaceChildren(el('strong', {}, 'Canvas view'));
    for (const [k, label, title] of OPTIONS) {
      const b = el('button', { type: 'button', role: 'switch', 'aria-checked': String(v[k]), title, 'data-view': k });
      b.append(el('span', { class: 'canvas-view-name' }, label), el('span', { class: 'canvas-view-state' }, v[k] ? 'On' : 'Off'));
      b.addEventListener('click', () => { this.app.setCanvasView({ [k]: !this.app.canvasView[k] }); this.render(); this.pop.querySelector<HTMLButtonElement>(`[data-view="${k}"]`)?.focus(); });
      this.pop.append(b);
    }
    this.pop.append(el('p', { class: 'canvas-view-note' }, 'Guides and the pasteboard never appear in exports.'));
  }

  /** Refresh after a frame, tool, thumbnail or workspace change (cheap when nothing changed). */
  update(): void {
    const a = this.app;
    const active = isPaintingWorkspace(a.workspace);
    if (!active) this.close(false);
    const on = active && a.canvasView.overview && !a.arrangingAssets;
    const v = a.canvasView;
    this.button.classList.toggle('on', v.overscan || v.safeAreas || v.centre || v.overview);
    if (!this.pop.hidden) this.render();
    if (!on) { this.strip.hidden = true; this.sig = ''; return; }
    const entries = overviewEntries(a.project.exposures, a.layerFrame);
    const sig = [a.project.activeComp, a.project.activeLayer, ...entries.map((e) => {
      const d = a.project.drawings.get(e.drawing);
      return `${e.drawing}:${e.start}:${e.current}:${d?.thumbRev ?? -1}`;
    })].join('|');
    this.strip.hidden = false;
    if (sig === this.sig) return;
    this.sig = sig;
    this.strip.replaceChildren(...entries.map((e) => {
      const b = el('button', { type: 'button', title: `Frame ${e.start + 1}${e.length > 1 ? `–${e.start + e.length}` : ''}`, 'aria-label': `Go to frame ${e.start + 1}` });
      if (e.current) b.setAttribute('aria-current', 'true');
      const c = el('canvas', { width: String(THUMB_W), height: String(THUMB_H), 'aria-hidden': 'true' });
      const g = c.getContext('2d');
      const t = a.project.drawings.get(e.drawing)?.thumb;
      if (g) {
        g.fillStyle = '#ffffff';
        g.fillRect(0, 0, THUMB_W, THUMB_H);
        if (t && t.width && t.height) {
          const s = Math.min(THUMB_W / t.width, THUMB_H / t.height);
          g.drawImage(t, (THUMB_W - t.width * s) / 2, (THUMB_H - t.height * s) / 2, t.width * s, t.height * s);
        }
      }
      b.append(c, el('span', {}, String(e.start + 1)));
      b.addEventListener('click', () => { if (!a.strokeActive) a.setLayerFrame(e.start); });
      return b;
    }));
  }
}
