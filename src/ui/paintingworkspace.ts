import type { App } from '../app';
import { isPaintingWorkspace } from '../core/workspace';
import type { FlipMode } from './flipmode';
import { defaultWorkspaceLayout } from '../core/workspacelayout';
import { decorate } from './icons';

type Fold = 'tools' | 'options' | 'brush' | 'editor';
type Prefs = Record<Fold, boolean>;
const FOLD_TITLES: Record<Fold, string> = { tools: 'the tool bar', options: 'the current tool’s settings row', brush: 'the size and opacity sliders', editor: 'the flipbook / clips editor' };
const defaults = (): Prefs => ({ tools: false, options: true, brush: false, editor: false });

/**
 * The two painting layouts: view-only controls, independent of document history and assets.
 * Switching workspaces is the shared mode bubbles' job (as everywhere else); the header here only
 * carries the artwork asset buttons.
 */
export class PaintingWorkspaceUI {
  onReset: () => void = () => {};
  editWorkspace: (anchor: HTMLElement) => void = () => {};
  private header = document.createElement('nav');
  private footer = document.createElement('nav');
  private viewButtons: HTMLButtonElement[] = [];
  private handles = new Map<Fold, HTMLButtonElement>();
  private prefs = { draw: defaults(), animate: defaults() };

  constructor(private app: App, private flip: FlipMode, stage: HTMLElement, private refresh: () => void) {
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
        for (const k of Object.keys(this.prefs[ws]) as Fold[]) if (typeof saved?.[k] === 'boolean') this.prefs[ws][k] = saved[k];
      } catch { /* defaults */ }
    }
    this.header.className = 'painting-header'; this.header.setAttribute('aria-label', 'Artwork assets');
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
      if (key === 'brush') decorate(b, 'brush');
      // not the toolbar's ••• (More tools): this one hides or shows the whole tool bar
      if (key === 'tools') decorate(b, 'panel');
      b.setAttribute('aria-label', `Toggle ${label.toLowerCase()}`);
      this.handles.set(key, b);
      this.footer.append(b);
    }
    const customize = button('Workspace', () => this.editWorkspace(customize)); customize.setAttribute('aria-label', 'Edit workspace'); decorate(customize, 'gear');
    this.customize = customize;
    this.footer.append(customize, button('Fit canvas', () => app.fit()));
    stage.after(this.footer);
    this.update();
  }

  private customize: HTMLButtonElement | null = null;

  /** Canvas view options sit with the other view controls, before Workspace. */
  addViewButton(b: HTMLButtonElement): void {
    this.footer.insertBefore(b, this.customize);
  }

  reset(): void {
    if (!isPaintingWorkspace(this.app.workspace)) return;
    const layouts = { ...this.app.workspaceLayouts, [this.app.workspace]: defaultWorkspaceLayout(this.app.workspace) };
    if (!this.app.setWorkspaceLayouts(layouts)) return;
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
    const essential = active && (this.app.transforming || !!this.app.adjusting || this.app.pointEditing || this.app.arrangingAssets || this.app.gradEditing || this.app.guideEdit || (this.app.tool === 'fill' && this.app.fillMode === 'lasso'));
    for (const [key, handle] of this.handles) {
      const folded = active && this.prefs[ws][key];
      document.body.classList.toggle(`painting-${key}-folded`, folded);
      handle.hidden = !active; handle.disabled = key === 'options' && !!essential;
      const shown = !folded || (key === 'options' && !!essential);
      handle.setAttribute('aria-expanded', String(shown));
      // a hidden part looks hidden here too, and the title says what a tap does
      handle.classList.toggle('folded', !shown);
      handle.title = `${shown ? 'Hide' : 'Show'} ${FOLD_TITLES[key]}${key === 'options' && essential ? ' (kept open while this edit is in progress)' : ''}`;
    }
    document.body.classList.toggle('painting-still', active && ws === 'draw' && !this.flip.on);
    if (!active) return;
    const layout = this.app.workspaceLayouts[ws];
    document.body.classList.toggle('workspace-brush-right', layout.brushEdge === 'right');
    document.body.classList.toggle('workspace-advanced-targets', layout.advancedTargets);
    for (const b of this.viewButtons) {
      b.hidden = ws === 'draw' ? b.textContent === 'Clips' : b.textContent === 'Canvas';
      b.setAttribute('aria-pressed', String(this.flip.on ? b.textContent === 'Flipbook' : b.textContent === (ws === 'draw' ? 'Canvas' : 'Clips')));
    }
    const a = this.app;
    const tool = a.arrangingAssets ? 'Move placement' : a.transforming ? 'Transform' : a.adjusting ? 'Adjust artwork' : a.tool === 'pen' ? 'Vector' : a.tool === 'fill' ? a.fillMode === 'lasso' ? 'Select area' : 'Bucket fill' : a.smudging ? 'Smudge' : a.tool === 'eraser' ? 'Eraser' : 'Brush';
    const target = a.editingMask ? 'Mask' : a.project.isPlaceholder ? 'New paint layer' : `${a.project.layer.name} · ${a.plane === 'line' ? 'Ink' : 'Colour'}`;
    const hint = this.footer.querySelector<HTMLElement>('.painting-purpose')!;
    hint.textContent = `${tool} on ${target}`; hint.title = `${a.project.comp.name} · ${hint.textContent}`;
    this.handles.get('options')!.textContent = 'Tool settings';
    this.handles.get('options')!.setAttribute('aria-label', 'Toggle tool settings');
  }
}
