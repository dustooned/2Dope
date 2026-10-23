import type { App, Workspace } from '../app';
import { isPaintingWorkspace } from '../core/workspace';
import type { FlipMode } from './flipmode';
import { decorate, setLabel } from './icons';

type Fold = 'tools' | 'options' | 'brush' | 'editor';
type Prefs = Record<Fold, boolean>;
const defaults = (): Prefs => ({ tools: false, options: false, brush: false, editor: false });

/** The two painting layouts: view-only controls, independent of document history and assets. */
export class PaintingWorkspaceUI {
  onReset: () => void = () => {};
  private header = document.createElement('nav');
  private footer = document.createElement('nav');
  private picker = document.createElement('select');
  private switcher: HTMLButtonElement;
  private viewButtons: HTMLButtonElement[] = [];
  private handles = new Map<Fold, HTMLButtonElement>();
  private prefs = { draw: defaults(), animate: defaults() };

  constructor(private app: App, private flip: FlipMode, stage: HTMLElement, private refresh: () => void, share: () => void) {
    const button = (label: string, run: () => void) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.addEventListener('click', () => {
        if (app.strokeActive) return;
        if (['Tools', 'Options', 'Brush controls', 'Editor'].includes(label)) app.preserveCanvasView();
        run();
      });
      return b;
    };
    for (const ws of ['draw', 'animate'] as const) {
      try {
        const saved = JSON.parse(localStorage.getItem(`2dope.painting.layout.${ws}`) ?? '{}');
        for (const k of Object.keys(this.prefs[ws]) as Fold[]) this.prefs[ws][k] = saved?.[k] === true;
      } catch { /* defaults */ }
    }
    this.header.className = 'painting-header'; this.header.setAttribute('aria-label', 'Painting workspace');
    this.picker.setAttribute('aria-label', 'Workspace');
    for (const [value, label] of [['board', 'Story'], ['draw', 'Draw'], ['animate', 'Animate'], ['time', 'Timing'], ['motion', 'Motion'], ['share', 'Share']]) {
      const o = document.createElement('option'); o.value = value!; o.textContent = label!; this.picker.append(o);
    }
    this.picker.addEventListener('change', () => {
      if (app.strokeActive) return this.update();
      if (this.picker.value === 'share') share(); else app.setWorkspace(this.picker.value as Workspace);
    });
    this.switcher = button('Animate →', () => app.setWorkspace(app.workspace === 'draw' ? 'animate' : 'draw'));
    this.switcher.className = 'painting-switcher';
    decorate(this.switcher, 'flipbook');
    this.header.append(this.picker, this.switcher);
    stage.append(this.header);
    this.footer.className = 'painting-views'; this.footer.setAttribute('aria-label', 'Drawing views');
    for (const label of ['Canvas', 'Flipbook', 'Clips']) {
      const b = button(label, () => {
        if (!isPaintingWorkspace(app.workspace)) return;
        this.prefs[app.workspace].editor = false;
        document.body.classList.remove('painting-editor-folded');
        flip.set(label === 'Flipbook'); this.save(); this.update(); this.refresh();
      });
      this.viewButtons.push(b); this.footer.append(b);
    }
    const hint = document.createElement('span'); hint.className = 'painting-purpose';
    this.footer.append(hint);
    for (const [key, label] of [['tools', 'Tools'], ['options', 'Options'], ['brush', 'Brush controls'], ['editor', 'Editor']] as [Fold, string][]) {
      const b = button(label, () => {
        if (!isPaintingWorkspace(app.workspace)) return;
        this.prefs[app.workspace][key] = !this.prefs[app.workspace][key];
        this.save(); this.update(); this.refresh();
      });
      b.className = `painting-handle painting-${key}-handle`;
      b.setAttribute('aria-label', `Toggle ${label.toLowerCase()}`);
      this.handles.set(key, b);
      if (key === 'editor') this.footer.append(b); else stage.append(b);
    }
    this.footer.append(button('Fit canvas', () => app.fit()), button('Reset layout', () => this.reset()));
    stage.after(this.footer);
    this.update();
  }

  reset(): void {
    if (!isPaintingWorkspace(this.app.workspace)) return;
    this.prefs[this.app.workspace] = defaults(); this.save(); this.update(); this.refresh();
    this.onReset();
    setTimeout(() => this.app.fit(), 60);
  }
  private save(): void {
    if (isPaintingWorkspace(this.app.workspace)) {
      try { localStorage.setItem(`2dope.painting.layout.${this.app.workspace}`, JSON.stringify(this.prefs[this.app.workspace])); } catch { /* optional */ }
    }
  }
  update(): void {
    const ws = this.app.workspace, active = isPaintingWorkspace(ws);
    document.body.classList.toggle('painting-workspace', active);
    this.header.hidden = this.footer.hidden = !active;
    for (const [key, handle] of this.handles) {
      const folded = active && this.prefs[ws][key];
      document.body.classList.toggle(`painting-${key}-folded`, folded);
      handle.hidden = !active; handle.setAttribute('aria-expanded', String(!folded));
    }
    document.body.classList.toggle('painting-still', active && ws === 'draw' && !this.flip.on);
    if (!active) return;
    this.picker.value = ws;
    setLabel(this.switcher, ws === 'draw' ? 'Animate' : 'Draw', ws === 'draw' ? 'flipbook' : 'draw');
    this.switcher.setAttribute('aria-label', ws === 'draw' ? 'Go to Animate' : 'Go to Draw');
    for (const b of this.viewButtons) {
      b.hidden = ws === 'draw' ? b.textContent === 'Clips' : b.textContent === 'Canvas';
      b.setAttribute('aria-pressed', String(this.flip.on ? b.textContent === 'Flipbook' : b.textContent === (ws === 'draw' ? 'Canvas' : 'Clips')));
    }
    this.footer.querySelector('.painting-purpose')!.textContent = ws === 'draw' ? 'Paint · backgrounds · assets' : 'Draw frames · arrange clips';
  }
}
