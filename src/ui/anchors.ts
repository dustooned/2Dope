import type { App } from '../app';
import { frameContent } from '../core/comp';
import type { Drawing } from '../core/project';
import { showContextMenu } from './contextmenu';
import { decorate } from './icons';

/** Compact canvas-tool controls; presets use resident artwork bounds, never parked pixels. */
export class AnchorControls {
  readonly button = document.createElement('button');
  readonly root = document.createElement('div');
  private readonly hint = document.createElement('span');
  private readonly center = document.createElement('button');
  private readonly presets = document.createElement('button');
  private busy = false;
  constructor(private app: App) {
    const ed = app.editor;
    this.button.type = 'button'; this.button.textContent = 'Anchor'; this.button.title = 'Move the anchor point while keeping this frame in place (Y)'; this.button.setAttribute('aria-label', 'Move anchor point'); this.button.setAttribute('aria-controls', 'motion-anchor-controls');
    this.button.onclick = () => { if (app.playing) app.togglePlay(); ed.setAnchorEditing(!ed.anchorEditing); };
    this.root.id = 'motion-anchor-controls'; this.root.className = 'motion-anchor-controls'; this.root.setAttribute('role', 'toolbar'); this.root.setAttribute('aria-label', 'Anchor placement');
    this.center.type = 'button'; this.center.textContent = 'Center'; this.center.setAttribute('aria-label', 'Center anchor on artwork'); this.center.onclick = () => void this.place(.5, .5);
    this.presets.type = 'button'; this.presets.textContent = 'Presets'; this.presets.setAttribute('aria-label', 'Anchor presets'); this.presets.setAttribute('aria-haspopup', 'menu');
    this.presets.onclick = () => { const r = this.presets.getBoundingClientRect(); showContextMenu(r.left, r.bottom, [
      { title: 'Anchor on artwork bounds' },
      ...[0, .5, 1].map((y, row) => ({ chips: [0, .5, 1].map((x, column) => { const label = [['Top left', 'Top center', 'Top right'], ['Middle left', 'Center', 'Middle right'], ['Bottom left', 'Bottom center', 'Bottom right']][row]![column]!; return { label, title: `Anchor ${label.toLowerCase()}`, run: () => void this.place(x, y) }; }) })),
    ]); };
    const done = document.createElement('button'); done.type = 'button'; done.textContent = 'Done'; done.setAttribute('aria-label', 'Finish anchor editing'); done.onclick = () => ed.setAnchorEditing(false);
    decorate(this.button, 'centrecross');
    decorate(this.center, 'fit');
    decorate(this.presets, 'gallery');
    decorate(done, 'check');
    this.root.append(this.hint, this.center, this.presets, done); this.update();
  }
  update(): void {
    const ed = this.app.editor; this.root.hidden = !ed.anchorEditing; this.button.setAttribute('aria-pressed', String(ed.anchorEditing)); this.button.disabled = !ed.anchorEditing && !ed.canEditAnchor;
    this.center.disabled = this.presets.disabled = this.busy || !ed.canEditAnchor;
    if (!this.busy) {
      const p = ed.primary ? ed.valueNow(ed.primary, 'anchor') as [number, number] : [0, 0];
      this.hint.textContent = `Tap or drag canvas · Anchor ${p[0]!.toFixed(1)}, ${p[1]!.toFixed(1)}`;
      this.hint.title = 'Keeps the artwork in place at this frame. Animated layers use normal Auto-key rules; other frames can change. Esc or Y finishes.';
    }
  }
  private async place(x: number, y: number): Promise<void> {
    if (this.busy) return;
    const app = this.app, ed = app.editor, project = app.project, comp = project.comp, frame = app.frame, target = ed.primary?.id, signature = JSON.stringify(comp.layers), pins: Drawing[] = [];
    this.busy = true; this.update(); this.hint.textContent = 'Loading artwork bounds…';
    try {
      for (const id of frameContent(project.comps, comp, frame).drawings) { const d = project.drawing(id); pins.push(d); await app.residency.pin(d); }
      if (!ed.anchorEditing || app.workspace !== 'motion' || app.project !== project || project.comp !== comp || app.frame !== frame || ed.primary?.id !== target || JSON.stringify(comp.layers) !== signature) throw new Error('The target changed. Choose the anchor preset again.');
      ed.anchorPreset(x, y);
    } catch (e) { app.onNotice?.((e as Error).message); }
    finally { pins.forEach(d => app.residency.unpin(d)); this.busy = false; this.update(); }
  }
}
