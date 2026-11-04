import type { App } from '../app';
import { BUILTIN_PRESETS, captureEffects, captureMotion, MAX_PRESET_BYTES, presetLayer, readPreset, type Preset } from '../core/presets';
import { compLength, frameContent, layerEnd, type Layer } from '../core/comp';
import { Project, type Drawing } from '../core/project';
import { drawComp } from '../view/composite';
import { DevicePresetStore, type PresetStore } from '../io/presetstore';
import { newId } from '../io/persist';
import { askText, pickBox } from './dialogs';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', cls = '') { const node = document.createElement(tag); node.textContent = text; node.className = cls; return node; }
function button(label: string, run: () => void) { const node = el('button', label); node.type = 'button'; node.addEventListener('click', run); return node; }
/** Saved presets are snapshots. Preview is detached; only Apply changes the project. */
export class PresetLibraryUI {
  private dialog: HTMLDialogElement | null = null;
  private cancelPreview: (() => void) | null = null;
  constructor(private app: App, private store: PresetStore = new DevicePresetStore()) {}
  close(): void { this.cancelPreview?.(); this.cancelPreview = null; this.dialog?.close(); this.dialog?.remove(); this.dialog = null; }
  show(kind: Preset['kind'] = 'motion', layerId = this.app.editor.primary?.id): void {
    if (this.app.strokeActive || this.app.transforming || this.app.adjusting) { this.app.onNotice?.('Finish the current edit first.'); return; }
    if (this.app.playing) this.app.togglePlay(); this.close();
    const app = this.app, project = app.project, comp = project.comp, frame = app.frame;
    const target = comp.layers.find(l => l.id === layerId), signature = JSON.stringify(target), opener = document.activeElement as HTMLElement;
    const d = el('dialog', '', 'preset-library'); this.dialog = d; d.setAttribute('aria-label', 'Motion and Effects presets');
    const head = el('header', '', 'artwork-head'), title = el('h2', 'Presets'), done = button('Done', () => this.close());
    head.append(title, done); const body = el('div', '', 'preset-body'), controls = el('div', '', 'preset-controls');
    const type = el('select'); type.setAttribute('aria-label', 'Preset type'); type.append(new Option('Motion', 'motion'), new Option('Effects', 'effects')); type.value = kind;
    const search = el('input'); search.type = 'search'; search.placeholder = 'Find a preset'; search.setAttribute('aria-label', 'Find a preset');
    const name = el('input'); name.type = 'text'; name.maxLength = 40; name.value = `${target?.name ?? 'My'} ${kind === 'effects' ? 'look' : 'move'}`.slice(0, 40); name.setAttribute('aria-label', 'New preset name');
    const status = el('p', '', 'preset-status'); status.setAttribute('role', 'status');
    const list = el('div', '', 'preset-list'); list.setAttribute('aria-label', 'Available presets');
    const preview = el('section', '', 'preset-preview'), caption = el('h3', 'Choose a preset to preview');
    const canvas = el('canvas'); canvas.width = 480; canvas.height = 270; canvas.setAttribute('aria-label', 'Preset preview');
    const details = el('p', target ? `Target: ${target.name}. Preview does not edit the project.` : 'Select a layer, then reopen Presets to apply a move or look.');
    const mode = el('select'); mode.setAttribute('aria-label', 'Effect preset application'); mode.append(new Option('Replace effects', 'replace'), new Option('Append effects', 'append'));
    const duration = el('input'); duration.type = 'number'; duration.min = '1'; duration.max = '36000'; duration.setAttribute('aria-label', 'Motion preset duration in frames');
    const durationLabel = el('label', 'Duration (frames)'); durationLabel.append(duration);
    const replaceKeys = el('input'); replaceKeys.type = 'checkbox'; replaceKeys.setAttribute('aria-label', 'Replace keys in this range');
    const replaceLabel = el('label', 'Replace keys in this range'); replaceLabel.prepend(replaceKeys);
    const play = button('Play preview', () => { if (playing) stop(); else { playing = true; started = performance.now(); previewStart = Number(seek.value); play.textContent = 'Pause preview'; tick(); } });
    const seek = el('input'); seek.type = 'range'; seek.min = '0'; seek.max = '24'; seek.value = '0'; seek.setAttribute('aria-label', 'Preset preview frame');
    const readout = el('output', '');
    const transport = el('div', '', 'preset-transport'); transport.append(play, seek, readout);
    const apply = button('Apply preset', () => {
      try {
        if (!current() || !selected || !target) throw new Error('The target changed. Close and reopen Presets.');
        const next = candidate();
        app.editor.edit(`Apply ${selected.name}`, c => { const i = c.layers.findIndex(l => l.id === target.id); if (i >= 0) c.layers[i] = next; });
        this.close(); app.focusCanvas();
      } catch (e) { error(e); }
    }); apply.className = 'primary'; apply.disabled = true;
    const footer = el('footer', '', 'preset-footer'); footer.append(details, mode, durationLabel, replaceLabel, apply);
    const save = button('Save current as preset', () => void saveCurrent()); save.disabled = !target;
    const importer = button('Import preset', () => { const input = el('input'); input.type = 'file'; input.accept = '.json,.2dope-preset.json'; input.addEventListener('change', () => { const file = input.files?.[0]; if (file) void importFile(file); }); input.click(); });
    controls.append(type, search, importer, name, save); preview.append(caption, canvas, transport); body.append(list, preview); d.append(head, controls, status, body, footer);
    document.body.append(d); d.showModal();
    let records: Preset[] = [], selected: Preset | null = null, playing = false, started = 0, previewStart = 0, timer = 0, serial = 0, playSerial = 0, closed = false, tail = Promise.resolve();
    const current = () => this.dialog === d && app.project === project && project.comp === comp && app.frame === frame && project.activeComp === comp.id && JSON.stringify(comp.layers.find(l => l.id === target?.id)) === signature && !app.strokeActive;
    const error = (e: unknown) => { status.textContent = e instanceof Error ? e.message : String(e); };
    const stop = () => { playing = false; playSerial++; clearTimeout(timer); play.textContent = 'Play preview'; };
    const candidate = (): Layer => {
      if (!selected || !target) throw new Error('Select a target layer first.');
      const span = Number(duration.value);
      if (selected.kind === 'motion' && (!Number.isInteger(span) || span < 1 || frame < target.in || frame + span >= Math.min(compLength(comp, project.comps), layerEnd(target, project.comps, comp.fps)))) throw new Error('Keep the move inside this layer and shot. Extend the shot or shorten the duration.');
      if (selected.kind === 'motion' && !replaceKeys.checked && Object.keys(selected.props).some(n => { const p = n === 'zoom' && target.kind === 'camera' ? target.zoom : target.transform[n as 'position' | 'scale' | 'rotation' | 'opacity']; return p?.keys.some(k => k.f >= frame - target.start && k.f <= frame - target.start + span); })) throw new Error('This range already has keys. Enable Replace keys in this range to continue.');
      return presetLayer(selected, target, comp, { frame, duration: span, append: mode.value === 'append' }, () => newId('fx'));
    };
    const paint = () => {
      const request = ++serial;
      tail = tail.then(async () => {
        if (closed || request !== serial || !current()) return;
        const pinned: Drawing[] = [];
        try {
          const next = candidate(), time = selected?.kind === 'motion' ? frame + Number(seek.value) : frame;
          const snapshot = new Project(project.width, project.height, false); snapshot.main = snapshot.activeComp = comp.id;
          for (const [id, c] of project.comps) snapshot.comps.set(id, id === comp.id ? { ...comp, layers: comp.layers.map(l => l.id === next.id ? next : l) } : c);
          for (const [id, drawing] of project.drawings) snapshot.drawings.set(id, drawing);
          for (const id of frameContent(snapshot.comps, comp.id, time).drawings) {
            if (closed || request !== serial || !current()) return;
            const drawing = project.drawing(id); pinned.push(drawing); await app.residency.pin(drawing);
          }
          if (closed || request !== serial || !current()) return;
          const g = canvas.getContext('2d')!; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
          const s = Math.min(canvas.width / comp.width, canvas.height / comp.height); g.save();
          try { g.translate((canvas.width - comp.width * s) / 2, (canvas.height - comp.height * s) / 2); g.scale(s, s); drawComp(g, snapshot, comp.id, time, { export: true, camera: next.kind === 'camera' || app.editor.throughCamera }); } finally { g.restore(); }
          apply.disabled = false; readout.textContent = `${Number(seek.value) + 1} / ${Number(seek.max) + 1}`; status.textContent = '';
        } catch (e) { stop(); apply.disabled = true; error(e); }
        finally { for (const drawing of pinned) app.residency.unpin(drawing); }
      }); return tail;
    };
    const tick = () => { const epoch = playSerial; if (!playing || closed) return; seek.value = String((previewStart + Math.floor((performance.now() - started) * comp.fps / 1000)) % (Number(seek.max) + 1)); void paint().then(() => { if (playing && !closed && epoch === playSerial) timer = window.setTimeout(tick, 1000 / Math.min(24, comp.fps)); }); };
    const choose = (preset: Preset) => {
      stop(); selected = preset; caption.textContent = preset.name; mode.hidden = preset.kind !== 'effects'; durationLabel.hidden = replaceLabel.hidden = preset.kind !== 'motion'; replaceKeys.checked = false; transport.hidden = preset.kind !== 'motion';
      const available = target ? Math.min(compLength(comp, project.comps), layerEnd(target, project.comps, comp.fps)) - frame - 1 : 24;
      duration.value = String(preset.kind === 'motion' ? Math.max(1, Math.min(available, Math.round(preset.duration * comp.fps / preset.fps))) : 1);
      seek.max = duration.value; seek.value = '0'; apply.disabled = true; void paint(); renderList(); list.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
    };
    const renderList = () => {
      list.replaceChildren();
      const items = [...BUILTIN_PRESETS, ...records].filter(p => p.kind === type.value && p.name.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()));
      for (const p of items) {
        const article = el('article', '', 'preset-card'), pick = button(p.name, () => choose(p)); pick.setAttribute('aria-pressed', String(selected?.id === p.id));
        article.append(pick, el('small', `${records.some(x => x.id === p.id) ? 'Saved' : 'Starter'} · ${p.kind === 'effects' ? `${p.effects.length} effects` : p.camera ? 'Camera move' : 'Motion'}`));
        if (records.some(x => x.id === p.id)) {
          const download = button(`Download ${p.name}`, () => { const url = URL.createObjectURL(new Blob([JSON.stringify(p)], { type: 'application/json' })); const a = el('a'); a.href = url; a.download = `${p.name.replace(/[^\w-]+/g, '-')}.2dope-preset.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); });
          const rename = button(`Rename ${p.name}`, () => void (async () => { const name = await askText('Preset name', p.name, 'Rename'); if (name && this.dialog === d) { try { await this.store.put({ ...p, name }, true); await reload(); } catch (e) { error(e); } } })());
          const remove = button(`Remove ${p.name}`, () => void this.store.remove(p.id).then(reload).catch(error)); article.append(rename, download, remove);
        }
        list.append(article);
      }
      if (!items.length) list.append(el('p', 'No matching presets. Save the selected layer or import a preset file.'));
    };
    const reload = async () => { try { records = await this.store.list(); if (this.dialog === d) renderList(); } catch (e) { error(e); } };
    const saveRecord = async (input: Preset) => {
      let preset = input, replace = false; const all = await this.store.list(), collision = all.find(p => p.kind === preset.kind && p.name.toLocaleLowerCase() === preset.name.toLocaleLowerCase());
      if (collision) {
        const choice = await pickBox('A preset with this name exists', [{ label: 'Replace saved preset', value: 'replace' }, { label: 'Save a copy', value: 'copy' }]);
        if (!choice || this.dialog !== d) return;
        if (choice === 'replace') { preset = { ...preset, id: collision.id }; replace = true; }
        else { const copy = await askText('Copy preset name', `${preset.name.slice(0, 34)} copy`, 'Save copy'); if (!copy || this.dialog !== d) return; preset = { ...preset, id: newId('preset'), name: copy }; }
      }
      if (this.dialog !== d) return;
      await this.store.put(preset, replace); await reload(); status.textContent = `Saved ${preset.name} on this device.`;
    };
    const saveCurrent = async () => {
      try { if (!current() || !target) throw new Error('The target changed. Reopen Presets.');
        const preset = type.value === 'effects' ? captureEffects(target, app.editor.frameOf(target), newId('preset'), name.value) : captureMotion(target, comp, newId('preset'), name.value);
        await saveRecord(preset);
      } catch (e) { error(e); }
    };
    const importFile = async (file: File) => { try { if (file.size > MAX_PRESET_BYTES) throw new Error('Preset files must be under 1 MiB.'); const p = readPreset(JSON.parse(await file.text())); await saveRecord({ ...p, id: newId('preset') }); } catch (e) { error(e); } };
    type.addEventListener('change', () => { stop(); serial++; selected = null; apply.disabled = true; caption.textContent = 'Choose a preset to preview'; canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height); mode.hidden = durationLabel.hidden = replaceLabel.hidden = transport.hidden = true; renderList(); }); search.addEventListener('input', renderList);
    replaceKeys.addEventListener('change', () => void paint());
    mode.addEventListener('change', () => void paint()); duration.addEventListener('change', () => { stop(); seek.max = duration.value; seek.value = '0'; void paint(); }); seek.addEventListener('input', () => { stop(); void paint(); });
    this.cancelPreview = () => { closed = true; serial++; stop(); if (opener?.isConnected) opener.focus(); };
    d.addEventListener('cancel', e => { e.preventDefault(); this.close(); }); d.addEventListener('keydown', e => e.stopPropagation()); d.addEventListener('keyup', e => e.stopPropagation());
    mode.hidden = durationLabel.hidden = replaceLabel.hidden = transport.hidden = true; void reload(); renderList();
  }
}
