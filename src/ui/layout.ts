import type { App } from '../app';
import { frameContent } from '../core/comp';
import type { Drawing } from '../core/project';
import type { Alignment, Distribution } from '../core/layout';
import { elText as el } from './dom';
/** One-step layout actions, shared by Motion and Animate's explicit placement tool. */
export class LayoutUI {
  private dialog: HTMLDialogElement | null = null;
  constructor(private app: App) {}
  close(): void { this.dialog?.close(); this.dialog?.remove(); this.dialog = null; }
  show(): void {
    const app = this.app, ed = app.editor, project = app.project, comp = project.comp;
    if (app.strokeActive || ed.dragging || app.transforming || app.adjusting) { app.onNotice?.('Finish the current edit first.'); return; }
    if (app.playing) app.togglePlay(); this.close(); const opener = document.activeElement as HTMLElement;
    const d = el('dialog'); d.className = 'creation-dialog layout-dialog'; d.setAttribute('aria-label', 'Align and snap'); this.dialog = d;
    const status = el('p'); status.setAttribute('role', 'status'); const reference = el('select'); reference.setAttribute('aria-label', 'Align relative to'); reference.append(new Option('Composition canvas', 'canvas'), new Option('Selection bounds', 'selection'));
    d.append(el('h2', 'Align and snap'), el('p', `${ed.selected.length} selected · Frame ${app.frame + 1}. Layout uses visible artwork bounds in composition space. Each action is one Undo step.`), reference);
    const actions = el('div'); actions.className = 'layout-actions'; let busy = false;
    const run = async (action: () => boolean) => {
      if (busy) return; busy = true; const frame = app.frame, ids = JSON.stringify(ed.selected), signature = JSON.stringify(comp.layers), pinned: Drawing[] = [];
      actions.querySelectorAll('button').forEach(b => b.disabled = true); status.textContent = 'Loading artwork bounds…';
      try {
        for (const id of frameContent(project.comps, comp, frame).drawings) { const drawing = project.drawing(id); pinned.push(drawing); await app.residency.pin(drawing); }
        if (this.dialog !== d || app.project !== project || project.comp !== comp || app.frame !== frame || JSON.stringify(ed.selected) !== ids || JSON.stringify(comp.layers) !== signature) throw new Error('The selection changed. Reopen Align and snap.');
        status.textContent = action() ? 'Applied. Undo restores the previous layout.' : 'No layout change. Select unlocked artwork or anchors at the playhead.';
      } catch (e) { if (this.dialog === d) status.textContent = (e as Error).message; }
      finally { for (const drawing of pinned) app.residency.unpin(drawing); busy = false; actions.querySelectorAll('button').forEach(b => b.disabled = ed.selected.length < Number(b.dataset.required ?? 1)); }
    };
    for (const [mode, name] of [['left', 'Align left'], ['centerX', 'Center horizontally'], ['right', 'Align right'], ['top', 'Align top'], ['centerY', 'Center vertically'], ['bottom', 'Align bottom'], ['horizontal', 'Distribute horizontal gaps'], ['vertical', 'Distribute vertical gaps']] as [Alignment | Distribution, string][]) {
      const button = el('button', name); button.type = 'button'; button.dataset.required = mode === 'horizontal' || mode === 'vertical' ? '3' : '1'; button.disabled = ed.selected.length < Number(button.dataset.required); button.onclick = () => void run(() => ed.arrange(mode, reference.value as 'canvas' | 'selection')); actions.append(button);
    }
    const anchor = el('button', 'Center anchors on artwork'); anchor.type = 'button'; anchor.disabled = !ed.selected.length; anchor.title = 'Keep this frame in place while moving each anchor to the centre of its artwork.'; anchor.onclick = () => void run(() => ed.centerAnchor()); actions.append(anchor);
    d.append(actions, el('p', 'Anchor centering keeps the current frame in place. Animated layers use their normal keyframing rules; other frames can follow the new anchor.'));
    const snaps = el('fieldset'); snaps.append(el('legend', 'Canvas snapping'));
    for (const [key, name] of [['on', 'Enable snapping'], ['canvas', 'Canvas edges and centre'], ['layers', 'Other layers'], ['grid', 'Grid']] as const) {
      const label = el('label', name), input = el('input'); input.type = 'checkbox'; input.checked = ed.snap[key]; input.setAttribute('aria-label', name); input.onchange = () => ed.setSnap({ [key]: input.checked }); label.prepend(input); snaps.append(label);
    }
    const label = el('label', 'Grid spacing (pixels)'), size = el('input'); size.type = 'number'; size.min = '1'; size.max = '1024'; size.value = String(ed.snap.size); size.setAttribute('aria-label', 'Grid spacing (pixels)'); size.onchange = () => { ed.setSnap({ size: Number(size.value) }); size.value = String(ed.snap.size); }; label.append(size); snaps.append(label);
    d.append(snaps, status); const footer = el('footer'), done = el('button', 'Done'); done.onclick = () => { this.close(); if (opener?.isConnected) opener.focus(); else app.focusCanvas(); }; footer.append(done); d.append(footer); document.body.append(d);
    d.addEventListener('cancel', e => { e.preventDefault(); done.click(); }); d.addEventListener('keydown', e => e.stopPropagation()); d.addEventListener('keyup', e => e.stopPropagation()); d.showModal();
  }
}
