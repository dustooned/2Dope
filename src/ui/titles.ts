import type { App } from '../app';
import { drawingsLayer } from '../core/comp';
import { planeCanvas, type Drawing } from '../core/project';
import { defaultTitle, paintTitle, readTitle, type TitleSpec } from '../core/title';
import { newId } from '../io/persist';
import { confirmBox } from './dialogs';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '') { const n = document.createElement(tag); n.textContent = text; return n; }
/** Text drafts have no project pixels or History until Apply. Saved pixels survive font changes. */
export class TitlesUI {
  private dialog: HTMLDialogElement | null = null;
  private opener: HTMLElement | null = null;
  constructor(private app: App) {}
  close(): void { this.dialog?.close(); this.dialog?.remove(); this.dialog = null; if (this.opener?.isConnected) this.opener.focus(); }
  async convert(id: string): Promise<void> {
    const app = this.app, project = app.project, comp = project.comp, target = comp.layers.find(l => l.id === id), signature = JSON.stringify(target);
    if (target?.kind !== 'drawings' || !target.title || target.locked || app.strokeActive || app.transforming || app.adjusting) return;
    if (!await confirmBox('Convert title to paint?', 'Keep its pixels and allow painting. Text will no longer be editable. Undo restores the editable title.', 'Convert to paint')) return;
    if (app.project !== project || project.comp !== comp || JSON.stringify(comp.layers.find(l => l.id === id)) !== signature) return;
    app.editor.edit('Convert title to paint', c => { const l = c.layers.find(l => l.id === id); if (l?.kind === 'drawings') delete l.title; });
    app.focusCanvas();
  }
  show(id?: string): void {
    const app = this.app;
    if (app.strokeActive || app.transforming || app.adjusting) { app.onNotice?.('Finish the current edit first.'); return; }
    if (app.playing) app.togglePlay(); this.close();
    const project = app.project, comp = project.comp, frame = app.frame, target = id ? comp.layers.find(l => l.id === id) : undefined;
    if (id && (target?.kind !== 'drawings' || !target.title || target.locked)) { app.onNotice?.('Select an unlocked title to edit.'); return; }
    this.opener = document.activeElement as HTMLElement;
    const signature = JSON.stringify(target), original = target?.kind === 'drawings' ? target.title : null;
    const d = el('dialog'); d.className = 'title-editor'; d.setAttribute('aria-label', original ? 'Edit title' : 'Create title'); this.dialog = d;
    const heading = el('h2', original ? 'Edit title' : 'Create title'), form = el('div'); form.className = 'title-fields';
    const label = (name: string, input: HTMLElement) => { const l = el('label', name); input.setAttribute('aria-label', name); l.append(input); form.append(l); };
    const text = el('textarea'); text.rows = 4; label('Text', text);
    const size = el('input'); size.type = 'number'; size.min = '8'; size.max = '512'; label('Size (pixels)', size);
    const weight = el('select'); weight.append(new Option('Regular', '400'), new Option('Bold', '700')); label('Weight', weight);
    const align = el('select'); for (const a of ['left', 'center', 'right']) align.append(new Option(a[0]!.toUpperCase() + a.slice(1), a)); label('Alignment', align);
    const fill = el('input'); fill.type = 'color'; label('Fill', fill);
    const outline = el('input'); outline.type = 'checkbox'; label('Outline', outline);
    const stroke = el('input'); stroke.type = 'color'; label('Outline colour', stroke);
    const width = el('input'); width.type = 'number'; width.min = '0'; width.max = '16'; label('Outline width', width);
    const canvas = el('canvas'); canvas.width = 480; canvas.height = 270; canvas.setAttribute('aria-label', 'Title preview');
    const status = el('p'); status.setAttribute('role', 'status');
    const note = el('p', 'Uses this device’s system font. Saved pixels keep their appearance on other devices; editing redraws the text with the current device’s font. Long text may extend beyond the canvas.'); note.className = 'hint';
    const foot = el('footer'), cancel = el('button', 'Cancel'), apply = el('button', original ? 'Apply title' : 'Create title'); apply.className = 'primary'; foot.append(cancel, apply);
    const preview = el('div'); preview.className = 'title-preview'; preview.append(canvas, note);
    const body = el('div'); body.className = 'title-body'; body.append(form, preview); d.append(heading, body, status, foot); document.body.append(d);
    const t = original ?? defaultTitle(); text.value = t.text; size.value = String(t.size); weight.value = String(t.weight); align.value = t.align; fill.value = t.fill; outline.checked = !!t.stroke; stroke.value = t.stroke ?? '#ffffff'; width.value = String(t.strokeWidth || 2);
    const draft = (): TitleSpec => readTitle({ v: 1, font: 'system-ui', text: text.value, size: Number(size.value), weight: Number(weight.value), align: align.value, fill: fill.value, stroke: outline.checked ? stroke.value : null, strokeWidth: outline.checked ? Number(width.value) : 0 });
    let scheduled = 0, busy = false;
    const current = () => this.dialog === d && app.project === project && project.comp === comp && app.frame === frame && JSON.stringify(id ? comp.layers.find(l => l.id === id) : undefined) === signature && !app.strokeActive && !app.transforming && !app.adjusting;
    const render = () => {
      cancelAnimationFrame(scheduled); scheduled = 0; stroke.disabled = width.disabled = !outline.checked;
      try {
        const value = draft(), g = canvas.getContext('2d')!; g.clearRect(0, 0, canvas.width, canvas.height); g.save();
        try { const s = Math.min(canvas.width / project.width, canvas.height / project.height); g.translate((canvas.width - project.width * s) / 2, (canvas.height - project.height * s) / 2); g.scale(s, s); paintTitle(g, value, project.width, project.height); } finally { g.restore(); }
        status.textContent = `${[...value.text].length} / 280 characters · ${value.text.split('\n').length} / 4 lines`; apply.disabled = busy;
      } catch (e) { status.textContent = (e as Error).message; apply.disabled = true; }
    };
    form.addEventListener('input', () => { cancelAnimationFrame(scheduled); scheduled = requestAnimationFrame(render); });
    cancel.onclick = () => this.close();
    apply.onclick = () => void (async () => {
      if (busy) return; busy = true; apply.disabled = true; let drawing: Drawing | null = null, committed = false;
      try {
        if (!current()) throw new Error('The project or layer changed. Close and reopen the title editor.');
        const value = draft();
        if (project.width * project.height > app.device.limits.maxPixels) throw new Error('This canvas exceeds the current device limit. Use a smaller canvas or change the device mode.');
        drawing = project.newDrawing(); await app.residency.pin(drawing);
        if (!current()) throw new Error('The project or layer changed. Reopen the title editor.');
        paintTitle(planeCanvas(drawing, 'fill').getContext('2d')!, value, project.width, project.height); drawing.rev++;
        const made = drawingsLayer(newId('title'), `Title · ${value.text.split('\n')[0]}`.slice(0, 80), [{ drawing: drawing.id, length: 1 }], project.width, project.height, comp.width, comp.height);
        made.start = made.in = frame; made.still = true; made.play = 'loop'; made.title = value;
        const old = target?.kind === 'drawings' ? target.exposures.map(e => project.drawing(e.drawing)) : [];
        app.editor.edit(original ? 'Edit title' : 'Create title', c => {
          if (target?.kind === 'drawings') { const l = c.layers.find(l => l.id === target.id); if (l?.kind === 'drawings') { l.title = value; l.exposures = made.exposures; } }
          else { const at = c.layers.findIndex(l => l.id === app.editor.primary?.id); c.layers.splice(Math.max(0, at), 0, made); }
        });
        const command = app.history.peekUndo(); if (command) command.drawings = [drawing, ...old]; committed = true;
        app.editor.select(target?.id ?? made.id); app.clearSpatialSelection(); app.setMaskEditing(false); app.setFrame(frame); app.setPlane('fill'); this.close(); app.focusCanvas();
      } catch (e) { if (this.dialog === d) status.textContent = (e as Error).message; }
      finally { if (drawing) { app.residency.unpin(drawing); if (!committed) { project.drawings.delete(drawing.id); drawing.line.width = 0; if (drawing.fill) drawing.fill.width = 0; } } busy = false; if (this.dialog === d) apply.disabled = false; }
    })();
    d.addEventListener('cancel', e => { e.preventDefault(); this.close(); }); d.addEventListener('close', () => cancelAnimationFrame(scheduled));
    d.addEventListener('keydown', e => e.stopPropagation()); d.addEventListener('keyup', e => e.stopPropagation()); render(); d.showModal(); text.focus();
  }
}
