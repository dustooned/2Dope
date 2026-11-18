import type { App } from '../app';
import type { ArtworkAssets } from '../core/assets';
import { layerEnd, type CompLayer } from '../core/comp';
import type { PropKey } from '../compedit';
import { CompDraftPreview } from '../view/compdraft';
import { elText as el } from './dom';
import { openModal, type ModalAction, type ModalHandle } from './modal';

function button(name: string, run: () => void) { const b = el('button', name); b.type = 'button'; b.onclick = run; return b; }
export class SymbolUI {
  private cleanup: (() => void) | null = null;
  constructor(private app: App, private assets: ArtworkAssets, private editSource: (source: string) => void) {}
  close(): void { this.cleanup?.(); this.cleanup = null; }
  show(id: string): void {
    const app = this.app, project = app.project, comp = project.comp, layer = comp.layers.find(l => l.id === id);
    if (app.strokeActive || app.transforming || app.adjusting || this.assets.copying || layer?.kind !== 'comp') return;
    const source = project.comps.get(layer.comp); if (!source?.asset) return;
    if (app.playing) app.togglePlay(); this.close();
    const count = app.editor.instances(source.id), status = el('p'); status.setAttribute('role', 'status');
    const intro = [el('p', `Symbol · Source: ${source.name}`), el('p', `Editing the source updates ${count} linked placement${count === 1 ? '' : 's'} in this project. Make independent gives only this placement its own editable source.`)];
    const controls = el('div'); controls.className = 'symbol-actions';
    const valid = () => app.project === project && project.comp === comp && !app.strokeActive && !app.playing && comp.layers.some(l => l.id === id && l.kind === 'comp' && l.comp === source.id);
    controls.append(button('Edit shared source', () => { if (!valid()) return; this.close(); this.editSource(source.id); }), button('Swap source…', () => { if (valid()) this.swap(id); }), button('Make independent', () => void (async () => {
      if (!valid()) return; controls.querySelectorAll('button').forEach(b => b.disabled = true); status.textContent = 'Making an independent copy…';
      try { const made = await this.assets.makeIndependent(id); if (!modal.dialog.isConnected) return; if (!made) throw new Error('The placement changed. Reopen Symbol options and try again.'); this.show(id); }
      catch (e) { if (modal.dialog.isConnected) { status.textContent = (e as Error).message; controls.querySelectorAll('button').forEach(b => b.disabled = false); } }
    })())); const pinsHeading = el('h3', 'Exposed pins');
    const pins = el('div'); pins.className = 'symbol-pins';
    for (const pin of source.pins) {
      const key = `pin:${pin.layer}:${pin.prop}` as PropKey, row = el('div'); row.className = 'symbol-pin';
      const current = app.editor.valueNow(layer, key), inner = source.layers.find(l => l.id === pin.layer); if (!inner) continue;
      row.append(el('span', `${inner.name} · ${pin.prop}`), el('output', Array.isArray(current) ? current.map(n => Math.round(n * 100) / 100).join(', ') : String(Math.round(current * 100) / 100)));
      const reset = button('Reset override', () => { if (valid()) { app.editor.resetPin(id, key); this.show(id); } }); reset.disabled = !app.editor.isOverridden(layer, key); reset.setAttribute('aria-label', `Reset ${inner.name} ${pin.prop} override`); row.append(reset); pins.append(row);
    }
    if (!pins.childElementCount) pins.append(el('p', 'No exposed pins. In the source, pin a Motion property to make it available on each placement.'));
    else pins.append(button('Edit pins in Motion', () => { if (!valid()) return; this.close(); app.setWorkspace('motion'); app.editor.select(id); app.editor.open.add(id); app.editor.onChange(); }));
    const modal = this.open({ title: layer.name, ariaLabel: 'Symbol options', className: 'creation-dialog symbol-options', content: [...intro, controls, pinsHeading, pins, status], actions: [{ id: 'done', label: 'Done' }], cancelId: 'done' });
  }
  swap(id: string): void {
    const app = this.app, project = app.project, comp = project.comp, target = comp.layers.find(l => l.id === id) as CompLayer | undefined;
    if (!target || target.kind !== 'comp' || app.strokeActive || app.playing || this.assets.copying) return;
    this.close(); const signature = JSON.stringify(target), sources = this.assets.list().filter(c => this.assets.canReplaceSource(id, c.id));
    const select = el('select'); select.setAttribute('aria-label', 'Replacement source'); for (const c of sources) select.append(new Option(`${c.name} · ${c.width}×${c.height}`, c.id));
    const label = el('label', 'Replacement source'); label.append(select); const canvas = el('canvas'); canvas.width = 480; canvas.height = 270; canvas.setAttribute('aria-label', 'Source swap preview');
    const description = el('p', `Placement: ${target.name}. Position, transforms, parent and timing stay the same. Applying resets this placement’s pin overrides. Other placements keep their current source.`), status = el('p'); status.setAttribute('role', 'status');
    const preview = el('section'); preview.className = 'creation-preview'; preview.append(canvas); const body = el('div'); body.className = 'creation-body'; body.append(label, preview);
    const applySwap = () => { try { if (!valid()) throw new Error('The placement changed. Reopen Symbol options.'); if (!this.assets.replaceSource(id, select.value)) throw new Error('This source can no longer be used here.'); this.close(); app.editor.select(id); app.focusCanvas(); } catch (e) { status.textContent = (e as Error).message; } };
    let serial = 0, session: CompDraftPreview | null = null;
    const modal = this.open({ title: 'Swap source', ariaLabel: 'Swap symbol source', className: 'creation-dialog symbol-swap', content: [description, body, status], cancel: () => { serial++; session?.close(); },
      actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'apply', label: 'Apply source swap', primary: true, run: () => { applySwap(); return false; } }] });
    const apply = modal.buttons.apply; apply.disabled = true;
    const valid = () => modal.dialog.isConnected && app.project === project && project.comp === comp && JSON.stringify(comp.layers.find(l => l.id === id)) === signature && !app.strokeActive && !app.playing;
    session = new CompDraftPreview(project, app.residency, valid);
    const paint = async () => {
      const request = ++serial; apply.disabled = true;
      try {
        if (!valid() || !this.assets.canReplaceSource(id, select.value)) throw new Error(sources.length ? 'The placement or source changed. Reopen Symbol options.' : 'Create another reusable asset before swapping this source.');
        const end = layerEnd(target, project.comps, comp.fps), next = { ...target, comp: select.value, overrides: {}, out: target.out === null && Number.isFinite(end) ? end : target.out };
        await session!.render(canvas, { ...comp, layers: comp.layers.map(l => l.id === id ? next : l) }, app.frame, app.editor.throughCamera);
        if (request !== serial || !valid()) return; status.textContent = `Preview: ${project.comps.get(select.value)?.name}. Apply changes this placement only.`; apply.disabled = false;
      } catch (e) { if (modal.dialog.isConnected && request === serial) status.textContent = (e as Error).message; }
    };
    select.onchange = () => void paint(); void paint();
  }
  /** Open one of the symbol dialogs; closing it any way runs `cancel`, restores focus and clears `cleanup`. */
  private open<Id extends string>(o: { title: string; ariaLabel: string; className: string; content: Node[]; actions: ModalAction<Id | 'closed'>[]; cancelId?: Id | 'closed'; cancel?: () => void }): ModalHandle<Id | 'closed'> {
    const opener = document.activeElement as HTMLElement;
    const modal: ModalHandle<Id | 'closed'> = openModal<Id | 'closed'>({
      title: o.title, ariaLabel: o.ariaLabel, className: o.className, bodyClass: null, content: o.content, footer: 'footer', ownKeys: true, actions: o.actions, cancelId: o.cancelId,
      onClose: () => { o.cancel?.(); this.cleanup = null; if (opener?.isConnected) opener.focus(); else this.app.focusCanvas(); },
    });
    this.cleanup = () => modal.close('closed' as Id | 'closed');
    return modal;
  }
}
