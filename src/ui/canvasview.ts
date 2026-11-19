import type { App } from '../app';
import { overviewEntries, overviewPage, type CanvasView } from '../core/canvasview';
import { isPaintingWorkspace } from '../core/workspace';
import { decorate } from './icons';
import { el } from './dom';


const OPTIONS: [keyof CanvasView, string, string][] = [
  ['transparency', 'Transparency grid', 'Show transparent page pixels as a checkerboard. Screen only; imported PNG alpha and exports stay unchanged.'],
  ['overscan', 'Overscan', 'Show art past the page edge (dimmed). Vector lines can be drawn, kept and erased there; Brush paint stops at the edge. Exports keep the page frame.'],
  ['safeAreas', 'Title and action safe', 'Action safe (90%) and title safe (80%) frames. Never exported.'],
  ['centre', 'Centre cross', 'Mark the middle of the page. Never exported.'],
  ['overview', 'Frame overview', 'Small thumbnails of the drawings around this one; tap one to go there.'],
];

const THUMB_W = 64, THUMB_H = 36;
/** Drawings shown at once in the frame overview; the arrows page by this many. */
const OVERVIEW_SIZE = 5;

/**
 * Draw and Animate's View button (canvas view options) and its frame overview strip. View-only:
 * every toggle is a device preference in App.canvasView, outside History and the project.
 */
export class CanvasViewUI {
  readonly button = el('button', { type: 'button', class: 'canvas-view-btn', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'canvas-view-options', title: 'Canvas view: fit, overscan, safe areas, centre and frame overview' }, 'View');
  private readonly pop = el('section', { id: 'canvas-view-options', class: 'canvas-view-pop', role: 'group', 'aria-label': 'Canvas view', hidden: '' });
  private readonly strip = el('nav', { class: 'canvas-overview', 'aria-label': 'Frame overview', hidden: '' });
  private sig = '';
  /** Overview page offset from centred, in drawings; reset when the current drawing changes. */
  private shift = 0;
  private at = '';

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
    // Motion while drawing: hold a layer Motion moves still, or preview the move (strokes still land)
    const motion = el('div', { class: 'canvas-view-motion', role: 'group', 'aria-label': 'Motion while drawing' });
    motion.append(el('span', { class: 'canvas-view-name' }, 'Motion while drawing'));
    const modes = el('div', { class: 'canvas-view-modes' });
    for (const [mode, label, title] of [['hold', 'Hold still', 'Draw a layer that Motion moves on the spot: it and the shot stay still (walk cycles in place)'], ['show', 'Show the move', 'See the layer move as it plays over a still page; strokes still land on its drawing']] as const) {
      const b = el('button', { type: 'button', 'aria-pressed': String(this.app.motionWhileDrawing === mode), title, 'data-motion': mode }, label);
      b.addEventListener('click', () => { this.app.setMotionWhileDrawing(mode); this.render(); this.pop.querySelector<HTMLButtonElement>(`[data-motion="${mode}"]`)?.focus(); });
      modes.append(b);
    }
    motion.append(modes);
    this.pop.append(motion);
    // Fit lives here with the other view choices (F does the same), not as its own bottom-bar button
    const fit = el('button', { type: 'button', class: 'canvas-view-fit', title: 'Fit the page to the screen (F)' }, 'Fit canvas');
    decorate(fit, 'fit');
    fit.addEventListener('click', () => { this.app.fit(); this.close(true); });
    this.pop.append(fit, el('p', { class: 'canvas-view-note' }, 'Guides and the pasteboard never appear in exports.'));
  }

  /** Refresh after a frame, tool, thumbnail or workspace change (cheap when nothing changed). */
  update(): void {
    const a = this.app;
    const active = isPaintingWorkspace(a.workspace);
    if (!active) this.close(false);
    const on = active && a.canvasView.overview && !a.arrangingAssets;
    const v = a.canvasView;
    this.button.classList.toggle('on', v.transparency || v.overscan || v.safeAreas || v.centre || v.overview);
    if (!this.pop.hidden) this.render();
    if (!on) { this.strip.hidden = true; this.sig = ''; return; }
    // A frame change brings the page back around the current drawing; the arrows only look.
    const at = `${a.project.activeComp}|${a.project.activeLayer}|${overviewEntries(a.project.exposures, a.layerFrame, 0)[0]?.start ?? -1}`;
    if (at !== this.at) { this.at = at; this.shift = 0; }
    const page = overviewPage(a.project.exposures, a.layerFrame, OVERVIEW_SIZE, this.shift);
    this.shift = page.first - overviewPage(a.project.exposures, a.layerFrame, OVERVIEW_SIZE).first;
    const sig = [at, page.first, page.total, ...page.entries.map((e) => {
      const d = a.project.drawings.get(e.drawing);
      return `${e.drawing}:${e.start}:${e.current}:${d?.thumbRev ?? -1}`;
    })].join('|');
    this.strip.hidden = false;
    if (sig === this.sig) return;
    this.sig = sig;
    const tool = (label: string, title: string, icon: string, cls: string, run: () => void, enabled = true) => {
      const b = el('button', { type: 'button', class: `canvas-overview-tool ${cls}`, title, 'aria-label': title }, label);
      if (icon) { decorate(b, icon); b.classList.add('icon-only'); }
      b.disabled = !enabled;
      b.addEventListener('click', () => { if (!a.strokeActive) run(); });
      return b;
    };
    const move = (by: number) => { this.shift += by; this.update(); };
    const back = tool('Back', `Earlier drawings (${page.first} before)`, 'prev', 'canvas-overview-back', () => move(-OVERVIEW_SIZE), page.canBack);
    const after = page.total - page.first - page.entries.length;
    const forward = tool('Forward', `Later drawings (${after} after)`, 'next', 'canvas-overview-forward', () => move(OVERVIEW_SIZE), page.canForward);
    const add = tool('+', 'New drawing after this one (N)', '', 'canvas-overview-add', () => a.addFrame());
    const remove = tool('−', 'Delete this drawing (Delete)', '', 'canvas-overview-delete', () => a.deleteFrame());
    const thumbs = el('div', { class: 'canvas-overview-thumbs' });
    thumbs.append(...page.entries.map((e) => {
      const b = el('button', { type: 'button', class: 'canvas-overview-thumb', title: `Frame ${e.start + 1}${e.length > 1 ? `–${e.start + e.length}` : ''}`, 'aria-label': `Go to frame ${e.start + 1}` });
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
    const keepFocus = this.strip.contains(document.activeElement) ? (document.activeElement as HTMLElement).className : '';
    this.strip.replaceChildren(back, thumbs, forward, add, remove);
    if (keepFocus.includes('canvas-overview-tool')) {
      const again = this.strip.querySelector<HTMLButtonElement>(`.${keepFocus.split(' ')[1]}`);
      (again && !again.disabled ? again : thumbs.querySelector<HTMLButtonElement>('[aria-current=true]') ?? thumbs.querySelector('button'))?.focus();
    }
  }
}
