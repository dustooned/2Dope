import type { App } from '../app';
import { ArtworkAssets } from '../core/assets';
import { assetTiming, type AssetTimingField } from '../core/assettiming';
import { assetLabel } from '../core/assetlabels';
import { activeAt, compLength, frameContent, type Comp } from '../core/comp';
import type { Project, Drawing } from '../core/project';
import { isPaintingWorkspace } from '../core/workspace';
import { drawComp } from '../view/composite';
import { askText, pickBox } from './dialogs';
import { decorate } from './icons';
import { ArtworkLibraryUI } from './artworklibrary';
import type { ArtworkStore } from '../io/artworkstore';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
function button(label: string, icon: string, action: () => void, accessible = label): HTMLButtonElement {
  const b = element('button', '', label); b.type = 'button';
  decorate(b, icon); b.setAttribute('aria-label', accessible); b.title = accessible;
  b.addEventListener('click', action); return b;
}
const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/** Project-local artwork, styled like the existing layer cards and edge panels. */
export class ArtworkAssetsUI {
  readonly assets: ArtworkAssets;
  readonly library: ArtworkLibraryUI;
  private create: HTMLButtonElement;
  private browse: HTMLButtonElement;
  private done: HTMLButtonElement;
  private context = element('div', 'asset-context');
  private label = element('span', 'asset-editing-name');
  private editingStatus = element('small', 'asset-editing-status');
  private badge = element('span', 'asset-count');
  private dialog: HTMLDialogElement | null = null;
  private opener: HTMLElement | null = null;
  private shelfProject: Project | null = null;
  private placement = element('div', 'asset-placement-tools');
  private details = element('div','asset-placement-details');
  private optionsToggle: HTMLButtonElement;
  private optionsOpen = false;
  private placedPicker = element('select', '');
  private editPlaced: HTMLButtonElement;
  private replacePlaced: HTMLButtonElement;
  private replacing: { project: Project; comp: string; id: string; source: string } | null = null;
  private duplicatePlaced: HTMLButtonElement;
  private finishPlacement: HTMLButtonElement;
  private placementUndo: HTMLButtonElement;
  private placementRedo: HTMLButtonElement;
  private placedSig = '';
  private timing = element('div', 'asset-timing');
  private timingToggle: HTMLButtonElement;
  private timingOpen = false;
  private timingInputs = new Map<AssetTimingField, HTMLInputElement>();
  private follow = element('input', '');
  private timingNote = element('small', 'asset-timing-note');
  private timingSelection = '';
  private timingProject: Project | null = null;
  private sourceInfo = element('small','asset-source-info');
  private names: HTMLButtonElement;
  private renaming = false;
  private choosingCopy = false;
  constructor(private app: App, private header: HTMLElement, store?: ArtworkStore) {
    this.assets = new ArtworkAssets(app);
    this.create = button('New asset', 'plus', () => void this.newAsset());
    this.create.className += ' asset-create';
    this.browse = button('Assets', 'gallery', () => this.show());
    this.browse.setAttribute('aria-haspopup', 'dialog');
    this.browse.setAttribute('aria-expanded', 'false');
    this.browse.append(this.badge);
    this.library = new ArtworkLibraryUI(app, this.assets, () => this.show(), (id, placed) => {
      if (placed) { this.update(); app.focusCanvas(); app.onNotice?.('Placed an independent copy from My Assets. Project placements can share this new source.'); return; }
      this.update(); this.show();
      const c = app.project.comps.get(id);
      if (c) this.dialog?.querySelector<HTMLButtonElement>(`button[aria-label=${CSS.escape(`Edit ${c.name}`)}]`)?.focus();
    }, () => { this.browse.setAttribute('aria-expanded', 'false'); if (this.app.workspace === 'motion') this.opener?.focus(); else if (!this.browse.hidden) this.browse.focus(); }, store);
    this.done = button('Done', 'check', () => { this.assets.done(); this.update(); app.focusCanvas(); }, 'Done editing asset');
    this.done.title = 'Done editing source: return to your shot and frame';
    this.done.className += ' asset-done';
    const sourceIdentity = element('div', 'asset-editing-info');
    sourceIdentity.append(this.label, this.editingStatus);
    this.context.append(sourceIdentity, this.done);
    this.context.setAttribute('role', 'group');
    header.append(this.create, this.browse, this.context);
    this.placement.setAttribute('role', 'toolbar'); this.placement.setAttribute('aria-label', 'Asset placement');
    this.placedPicker.setAttribute('aria-label', 'Placed asset');
    this.placedPicker.addEventListener('change', () => {
      if (!this.app.strokeActive) this.app.editor.select(this.placedPicker.value || null);
      this.update();
    });
    this.editPlaced = button('Edit source', 'draw', () => { const l = app.placedAsset; if (l && !app.strokeActive) this.openSource(l.comp); });
    this.editPlaced.classList.add('asset-edit-source');
    this.editPlaced.querySelector('.lbl')!.replaceChildren(document.createTextNode('Edit'), element('span', 'asset-source-word', ' source'));
    this.replacePlaced = button('Replace', 'gallery', () => {
      const l = app.placedAsset;
      if (l && !app.strokeActive && !app.playing && !this.assets.copying)
        this.show({ project: app.project, comp: app.project.activeComp, id: l.id, source: l.comp });
    }, 'Replace artwork source');
    this.replacePlaced.setAttribute('aria-haspopup','dialog');
    this.replacePlaced.setAttribute('aria-expanded','false');
    this.duplicatePlaced = button('Copies', 'copy', () => void this.copySelected(), 'Asset copies');
    this.duplicatePlaced.setAttribute('aria-haspopup','dialog');
    this.finishPlacement = button('Done', 'check', () => { app.setArrangeAssets(false); app.focusCanvas(); }, 'Done arranging assets');
    this.finishPlacement.classList.add('asset-done');
    this.optionsToggle = button('Options','more',()=>{
      if(app.strokeActive)return;
      app.preserveCanvasView(); this.optionsOpen=!this.optionsOpen;this.update();
      if(!this.optionsOpen)this.optionsToggle.focus();
    },'Asset options');
    this.optionsToggle.setAttribute('aria-controls','asset-placement-details');
    this.names = button('Names','draw',()=>void this.renameSelected(),'Rename artwork');
    this.names.setAttribute('aria-haspopup','dialog');
    this.placementUndo = button('Undo', 'undo', () => app.undo(), 'Undo last edit');
    this.placementRedo = button('Redo', 'redo', () => app.redo(), 'Redo last edit');
    this.placementUndo.classList.add('placement-history'); this.placementRedo.classList.add('placement-history');
    const choice = element('div', 'asset-placement-choice');
    this.timingToggle = button('Timing', 'time', () => { if(app.strokeActive)return;app.preserveCanvasView();this.timingOpen = !this.timingOpen; this.update(); }, 'Asset timing');
    this.timingToggle.classList.add('asset-timing-toggle'); this.timingToggle.setAttribute('aria-controls', 'asset-timing');
    choice.append(this.placedPicker,this.editPlaced,this.optionsToggle,this.finishPlacement);
    const actions=element('div','asset-placement-actions');
    actions.append(this.replacePlaced,this.duplicatePlaced,this.names);
    const secondary=element('div','asset-placement-secondary');
    secondary.append(this.timingToggle,this.placementUndo,this.placementRedo);
    this.details.id='asset-placement-details';
    this.details.append(actions,this.sourceInfo,secondary);
    this.placement.append(choice,this.details);
    this.timing.id = 'asset-timing'; this.timing.setAttribute('role', 'group'); this.timing.setAttribute('aria-label', 'Asset timing');
    this.timing.setAttribute('data-own-keys', '');
    for (const [field, label] of [['start','Start'],['hold','Hold'],['end','End']] as const) {
      const wrap = element('label', '', label);
      const input = element('input', ''); input.type = 'number'; input.min = '1'; input.max = '1000000'; input.step = '1';
      input.setAttribute('aria-label', `Asset ${field} frame${field === 'hold' ? 's' : ''}`);
      const commit = () => {
        const l = app.placedAsset;
        if (l && input.value && Number.isFinite(input.valueAsNumber)) app.editor.setAssetTiming(l.id, field, input.valueAsNumber);
        this.syncTiming(true);
      };
      input.addEventListener('change', commit);
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', e => {
        if (e.key === 'Escape') { this.syncTiming(true); input.blur(); e.preventDefault(); }
        if (e.key === 'Enter') { commit(); input.blur(); e.preventDefault(); }
      });
      wrap.append(input); this.timingInputs.set(field,input); this.timing.append(wrap);
    }
    const followLabel = element('label', 'asset-follow'); this.follow.type = 'checkbox';
    this.follow.addEventListener('change', () => {
      const l = app.placedAsset; if (!l) return;
      app.editor.setAssetTiming(l.id, this.follow.checked ? 'shot' : 'hold', assetTiming(l, app.project.comp, app.project.comps).hold);
      this.syncTiming(true);
    });
    followLabel.append(this.follow, document.createTextNode('Follow shot end'));
    const jumps = element('div', 'asset-timing-jumps');
    jumps.append(button('Show start', 'first', () => { const l = app.placedAsset; if (l) app.setFrame(Math.min(l.in,app.compEnd-1)); }), button('Show end', 'last', () => { const l = app.placedAsset; if (l) app.setFrame(Math.min(assetTiming(l,app.project.comp,app.project.comps).end-1,app.compEnd-1)); }));
    this.timing.append(followLabel, jumps, this.timingNote); this.details.append(this.timing);
    header.parentElement!.append(this.placement);
    this.update();
  }
  resetLayout(): void {
    this.optionsOpen=false;this.timingOpen=false;this.update();
  }
  update(): void {
    const a = this.app;
    this.library.update();
    this.create.hidden = a.workspace !== 'draw' || this.assets.editing;
    this.browse.hidden = !isPaintingWorkspace(a.workspace);
    this.context.hidden = !this.assets.editing;
    this.header.classList.toggle('editing-asset', this.assets.editing);
    this.label.replaceChildren();
    if (this.assets.editing) this.label.append(element('span', 'asset-source-prefix', 'Source: '), document.createTextNode(a.project.comp.name));
    const linked = this.assets.editing ? a.editor.instances(a.project.activeComp) : 0;
    this.editingStatus.textContent = !this.assets.editing ? '' : linked ? `Updates ${count(linked,'placement')}` : 'Not placed yet';
    this.label.title = this.assets.editing ? `Editing source: ${a.project.comp.name}. ${linked ? `Edits update all ${count(linked,'linked placement')} in this project.` : 'Edits stay in this source until you place it.'}` : '';
    this.editingStatus.title = this.label.title;
    this.context.setAttribute('aria-label', this.label.title || 'Asset editing');
    const n = this.assets.list().length;
    this.badge.textContent = String(n); this.badge.hidden = n === 0;
    this.browse.setAttribute('aria-label', `Assets (${n})`);
    this.placement.hidden = !a.arrangingAssets;
    this.details.hidden = !this.optionsOpen;
    this.optionsToggle.setAttribute('aria-expanded',String(this.optionsOpen));
    this.optionsToggle.setAttribute('aria-pressed',String(this.optionsOpen));
    this.optionsToggle.disabled=a.strokeActive;
    document.body.classList.toggle('arranging-assets', a.arrangingAssets);
    if (a.arrangingAssets) {
      const layers = a.project.comp.layers.filter(l => l.kind === 'comp' && a.project.comps.get(l.comp)?.asset);
      const labels = layers.map(l => l.kind === 'comp' ? assetLabel(a.project,a.project.comp,l) : null);
      const sig = layers.map((l,i) => `${l.id}:${labels[i]?.picker}`).join('|');
      if (sig !== this.placedSig || !this.placedPicker.options.length) {
        this.placedSig = sig;
        this.placedPicker.replaceChildren(new Option(layers.length ? 'Select placement' : 'No placed assets', ''), ...layers.map((l, i) => new Option(labels[i]!.picker, l.id)));
      }
      this.placedPicker.value = a.placedAsset?.id ?? '';
      this.placedPicker.title = a.placedAsset ? assetLabel(a.project,a.project.comp,a.placedAsset).description : 'Select a placement';
      this.placedPicker.disabled = a.strokeActive;
      this.editPlaced.disabled = this.duplicatePlaced.disabled = !a.placedAsset || a.strokeActive;
      this.replacePlaced.disabled = !a.placedAsset || a.strokeActive || a.playing || this.assets.copying;
      this.duplicatePlaced.disabled ||= a.playing || this.choosingCopy || this.assets.copying;
      this.names.disabled = !a.placedAsset || a.strokeActive || a.playing || this.renaming;
      this.finishPlacement.disabled = a.strokeActive;
      this.placementUndo.disabled = !a.history.canUndo || a.strokeActive;
      this.placementRedo.disabled = !a.history.canRedo || a.strokeActive;
      const identity = a.placedAsset ? assetLabel(a.project,a.project.comp,a.placedAsset) : null;
      this.sourceInfo.textContent = this.assets.copying ? 'Copying editable artwork…' : identity ? `Source: ${identity.source} · ${count(identity.count,'linked placement')} in this shot` : 'Choose a placement to move or time it.';
      this.editPlaced.title = identity ? `Edit shared source ${identity.source}. Changes update every linked placement, including other shots.` : 'Edit shared source';
    }
    this.syncTiming();
    // Close stale artwork when another project is opened or the workspace leaves painting.
    if (this.dialog && ((!isPaintingWorkspace(a.workspace) && a.workspace !== 'motion') || this.shelfProject !== a.project)) this.close();
    if (this.replacing && !this.replacementCurrent(this.replacing)) this.close();
  }
  private syncTiming(force = false): void {
    const a = this.app, l = a.placedAsset, clips = a.arrangingAssets && !a.flipbookView;
    this.timingToggle.hidden = !clips;
    this.timing.hidden = !clips || !this.timingOpen;
    this.timingToggle.setAttribute('aria-expanded', String(clips && this.timingOpen));
    this.timingToggle.setAttribute('aria-pressed', String(clips && this.timingOpen));
    const selected = `${a.project.created}:${a.project.activeComp}:${l?.id ?? ''}`;
    force ||= selected !== this.timingSelection || this.timingProject !== a.project;
    this.timingSelection = selected; this.timingProject = a.project;
    const t = l ? assetTiming(l, a.project.comp, a.project.comps) : null;
    const busy = a.strokeActive || a.playing;
    for (const [field, input] of this.timingInputs) {
      input.disabled = !t || busy;
      input.max = String(a.project.comp.duration ?? 1000000);
      if (force || document.activeElement !== input) input.value = t ? String(t[field as 'start'|'hold'|'end']) : '';
    }
    this.follow.checked = t?.follow ?? false; this.follow.disabled = !t || busy;
    for (const b of this.timing.querySelectorAll<HTMLButtonElement>('button')) b.disabled = !l || busy;
    this.timingNote.textContent = !l ? 'Choose a placed asset to adjust its timing.' : `${activeAt(l,a.frame,a.project.comps,a.project.comp.fps) ? 'On this frame' : 'Off this frame'} · ${count(t!.hold,'frame')} on screen. Animated artwork keeps playing.`;
  }
  private close(): void {
    if (!this.dialog) return;
    const replacement = this.replacing; this.replacing = null;
    this.dialog.close(); this.dialog.remove(); this.dialog = null; this.shelfProject = null;
    this.browse.setAttribute('aria-expanded', 'false');
    this.replacePlaced.setAttribute('aria-expanded','false');
    if (replacement && this.replacementCurrent(replacement)) this.replacePlaced.focus();
    else if (this.opener?.isConnected && this.opener.getClientRects().length) this.opener.focus();
    else if (!this.browse.hidden) this.browse.focus();
  }
  private async newAsset(): Promise<void> {
    if (this.app.strokeActive || this.app.playing) return;
    const project = this.app.project;
    const name = await askText('New asset name', 'Background', 'Create asset', `Editable artwork on a transparent ${project.width}×${project.height} canvas. Draw a still or add frames in Flipbook, then Done returns to your shot.`);
    if (name?.trim() && this.app.project === project && !this.app.strokeActive && !this.app.playing) {
      this.assets.create(name); this.app.focusCanvas();
    }
    this.update();
  }
  showAssets(opener?: HTMLElement): void { this.opener = opener ?? document.activeElement as HTMLElement; this.show(); }
  async createFromSelection(): Promise<void> {
    const a = this.app, project = a.project, comp = project.activeComp, ids = [...a.editor.selected];
    if (!ids.length || a.strokeActive || a.playing) return;
    const name = await askText('Create asset from selection', a.editor.primary?.name ?? 'Artwork', 'Create asset',
      'Move the selected layers into one reusable source. The shot keeps a linked placement with the same timing. Adjustments, clipping and blending will use the layers inside this source. One Undo restores the stack.');
    if (!name?.trim() || a.project !== project || project.activeComp !== comp || a.strokeActive || a.playing) return;
    const id = this.assets.fromSelection(ids, name);
    if (id) { a.onNotice?.(`Created ${project.comps.get(id)!.name}. Use Assets to edit, place, save or download it.`); this.showAssets(); }
    this.update();
  }
  /** Draw in a source (on one of its layers, when given). */
  /** `here`: stay in Animate (a layer tapped in Animate's Layers; the header says how many places it updates). */
  /** Send an asset to another project (set by the app: pick the project, then where). */
  sendTo: ((comp: string, name: string) => void) | null = null;
  openSource(id: string, layer?: string, here = false): void {
    if (this.assets.open(id, layer, here)) { this.update(); this.app.focusCanvas(); }
  }
  private async renameSelected(): Promise<void> {
    const a=this.app,l=a.placedAsset,project=a.project,comp=project.activeComp;
    if(!l||a.strokeActive||a.playing||this.renaming)return;
    this.renaming=true;this.update();
    try {
      const choice=await pickBox('Rename artwork',[
        {label:'Rename placement',value:'placement' as const,hint:'This copy only. Shared source and other placement names stay the same.'},
        {label:'Rename source',value:'source' as const,hint:'The shared artwork name throughout this project. Existing placement names stay the same.'},
      ]);
      if(!choice||a.project!==project||project.activeComp!==comp||a.strokeActive||a.playing)return;
      await this.renameText(choice,choice==='source'?l.comp:l.id,project,comp);
    } finally {this.renaming=false;this.update();if(a.project===project&&a.arrangingAssets)this.names.focus();}
  }
  private async copySelected(): Promise<void> {
    const a=this.app,l=a.placedAsset,project=a.project,comp=project.activeComp;
    if(!l||a.strokeActive||a.playing||this.choosingCopy||this.assets.copying)return;
    this.choosingCopy=true;this.update();
    try {
      const choice=await pickBox('Copy artwork',[
        {label:'Duplicate placement',value:'duplicate' as const,hint:'Add another placement linked to the same editable source.'},
        {label:'Make independent',value:'independent' as const,hint:'Give this placement its own editable artwork. Other placements keep their shared source.'},
        ...(this.sendTo?[{label:'Send to another project\u2026',value:'send' as const,hint:'A copy of this asset in another of your projects: at its start, or in its asset library.'}]:[]),
      ]);
      if(!choice||a.project!==project||project.activeComp!==comp||a.placedAsset?.id!==l.id||a.strokeActive||a.playing)return;
      if(choice==='send'){const src=project.comps.get(l.comp);if(src)this.sendTo?.(src.id,src.name);}
      else if(choice==='duplicate')a.duplicatePlacedAsset();
      else {
        const pending=this.assets.makeIndependent(l.id);this.update();
        const source=await pending;
        if(a.project===project) a.onNotice?.(source?'Independent artwork ready. Edit source to change this copy.':'Artwork changed while copying. Try again.');
      }
    } catch(e) {if(a.project===project)a.onNotice?.(e instanceof Error?e.message:String(e));}
    finally {this.choosingCopy=false;this.update();if(a.project===project&&a.arrangingAssets)this.duplicatePlaced.focus();}
  }
  private async renameSource(id: string): Promise<void> {
    const a=this.app,project=a.project,comp=project.activeComp;
    if(this.renaming||a.strokeActive||a.playing)return;
    this.renaming=true;
    try {await this.renameText('source',id,project,comp);}
    finally {
      this.renaming=false;this.update();
      if(a.project===project&&project.activeComp===comp&&isPaintingWorkspace(a.workspace))this.show();
    }
  }
  private async renameText(kind: 'source'|'placement',id: string,project: Project,comp: string): Promise<void> {
    const a=this.app,target=kind==='source'?project.comps.get(id):project.comp.layers.find(l=>l.id===id);
    if(!target)return;
    const title=kind==='source'?'Rename source':'Rename placement';
    const description=kind==='source'?'Change the shared artwork name across this project. Existing placement names and artwork stay the same.':'Change the name of this placement only. Its source, other copies and artwork stay the same.';
    const name=await askText(title,target.name,'Save name',description);
    if(name===null||a.project!==project||project.activeComp!==comp||a.strokeActive||a.playing)return;
    if(kind==='source')this.assets.renameSource(id,name);else this.assets.renamePlacement(id,name);
  }
  private replacementCurrent(target: NonNullable<ArtworkAssetsUI['replacing']>): boolean {
    const a=this.app,l=a.placedAsset;
    return a.project===target.project && a.project.activeComp===target.comp && a.arrangingAssets &&
      l?.id===target.id && l.comp===target.source && !a.strokeActive && !a.playing && !this.assets.copying;
  }
  private showLibrary(): void {
    this.close(); this.library.show(); this.browse.setAttribute('aria-expanded', 'true');
  }
  private async saveToLibrary(id: string, control: HTMLButtonElement): Promise<void> {
    const dialog = this.dialog, project = this.app.project;
    control.disabled = true; control.setAttribute('aria-busy', 'true');
    try {
      const card = await this.library.saveSource(id);
      if (this.dialog === dialog && this.app.project === project) this.showLibrary();
      this.app.onNotice?.(`Saved ${card.name} to My Assets on this device.`);
    } catch (e) { this.app.onNotice?.(`Could not save artwork: ${e instanceof Error ? e.message : String(e)}`); }
    finally { control.disabled = false; control.removeAttribute('aria-busy'); }
  }
  private async updateInLibrary(id: string, control: HTMLButtonElement): Promise<void> {
    const dialog = this.dialog, project = this.app.project; control.disabled = true;
    try {
      const card = await this.library.updateSource(id);
      if (card) {
        if (this.dialog === dialog && this.app.project === project) this.showLibrary();
        this.app.onNotice?.(`Updated ${card.name} in My Assets. Placed copies keep their artwork.`);
      }
    } catch (e) { this.app.onNotice?.(`Could not update artwork: ${e instanceof Error ? e.message : String(e)}`); }
    finally { control.disabled = false; }
  }
  private show(replacement: ArtworkAssetsUI['replacing'] = null): void {
    if (this.app.strokeActive || this.dialog) return;
    if (replacement && !this.replacementCurrent(replacement)) return;
    const project = this.app.project;
    const d = element('dialog', 'artwork-shelf'); this.dialog = d;
    this.replacing = replacement;
    this.shelfProject = project;
    d.setAttribute('aria-labelledby', 'artwork-shelf-title');
    const action = (label: string, icon: string, run: () => void, accessible = label) => button(label, icon, () => {
      this.close();
      if (this.app.project === project && !this.app.strokeActive) run();
      this.update();
    }, accessible);
    const head = element('header', 'artwork-head');
    const title = element('h2', '', replacement ? 'Replace source' : 'Assets'); title.id = 'artwork-shelf-title';
    const add = action('New asset', 'plus', () => void this.newAsset()); add.classList.add('artwork-add');
    add.hidden = !!replacement;
    add.disabled = this.app.playing;
    const close = button('Close assets', 'close', () => this.close()); close.classList.add('icon-only');
    head.append(title, add, close);
    const collections = element('nav', 'artwork-library-nav'); collections.setAttribute('aria-label', 'Asset collections');
    collections.append(button('My Assets', 'gallery', () => this.showLibrary())); collections.hidden = !!replacement;
    if (!replacement && this.app.workspace === 'motion') {
      const selected = action('From selection', 'layers', () => void this.createFromSelection(), 'Create asset from selected layers');
      selected.disabled = !this.app.editor.selected.length || this.app.playing || this.app.editor.selected.some(id => {
        const l = this.app.editor.layer(id); return l?.kind === 'camera' || l?.kind === 'drawings' && l.guide;
      }); collections.append(selected);
    }
    const artworkProject = project.activeComp === project.main && project.comp.asset;
    if (artworkProject && !replacement) {
      const save = button('Save current artwork', 'save', () => void this.saveToLibrary(project.main, save));
      save.disabled = this.app.playing || this.library.busy; collections.append(save);
      const update = button('Update existing', 'save', () => void this.updateInLibrary(project.main, update));
      update.disabled = this.app.playing || this.library.busy; collections.append(update);
    }
    const body = element('div', 'artwork-body');
    const note = element('p', 'artwork-note', replacement ? `Choose artwork for ${this.app.placedAsset!.name}. This placement keeps its name, timing and transform. Other placements stay linked to their current source.` : 'In this project · edit once, update every placement.');
    const grid = element('div', 'artwork-grid');
    const searchRow = element('div', 'artwork-library-search asset-project-search');
    const search = element('input', 'textbox'); search.type = 'search'; search.placeholder = 'Find project assets'; search.setAttribute('aria-label', 'Find project assets'); search.setAttribute('data-own-keys', '');
    const kind = element('select', ''); kind.setAttribute('aria-label', 'Project asset type');
    for (const [value, label] of [['all', 'All assets'], ['still', 'Stills'], ['animated', 'Animated']]) kind.append(new Option(label, value));
    const status = element('p', 'artwork-note asset-project-count'); status.setAttribute('role', 'status');
    const noMatch = element('p', 'artwork-empty', 'No matching assets. Clear the search or choose All assets.'); noMatch.hidden = true;
    const filter = () => {
      const words = search.value.trim().normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const card of grid.querySelectorAll<HTMLElement>('.artwork-card')) {
        card.hidden = !words.every(word => card.dataset.search!.includes(word)) || kind.value !== 'all' && card.dataset.kind !== kind.value;
        if (!card.hidden) shown++;
      }
      status.textContent = `${shown} of ${assets.length} project assets`; noMatch.hidden = shown > 0 || !assets.length;
    };
    search.addEventListener('input', filter); kind.addEventListener('change', filter); searchRow.append(search, kind); searchRow.hidden = !!replacement;
    const previews: { comp: Comp; canvas: HTMLCanvasElement }[] = [];
    const assets = this.assets.list();
    if (!assets.length) {
      const empty = element('div', 'artwork-empty');
      const art = element('span', ''); decorate(art, 'brush');
      empty.append(art, element('strong', '', artworkProject ? 'Your artwork project' : 'Make something to reuse'), element('p', '', artworkProject ? 'Save current artwork keeps a fresh copy in My Assets, with all your layers and frames.' : 'Paint a background or prop in Draw, then place it in your animation.'));
      if (!artworkProject) empty.append(action('New asset', 'plus', () => void this.newAsset()));
      grid.append(empty);
    }
    for (const c of assets) {
      const card = element('article', 'artwork-card'); card.setAttribute('aria-label', c.name);
      card.dataset.search = c.name.normalize('NFKC').toLocaleLowerCase();
      card.dataset.kind = compLength(c, project.comps) > 1 ? 'animated' : 'still';
      const canReplace = !!replacement && this.assets.canReplaceSource(replacement.id,c.id);
      const replace = () => {
        if (!replacement || !this.replacementCurrent(replacement)) { this.close(); return; }
        this.close(); this.assets.replaceSource(replacement.id,c.id); this.update();
        if (this.app.arrangingAssets) this.replacePlaced.focus();
      };
      const thumb = button(replacement ? `Use ${c.name} artwork` : `Open ${c.name} artwork`, 'draw', () => {
        if (replacement) replace();
        else {this.close(); if (this.app.project === project && !this.app.strokeActive) this.openSource(c.id);}
      });
      thumb.disabled = !!replacement && !canReplace;
      thumb.className = 'artwork-preview'; thumb.replaceChildren();
      const canvas = element('canvas', ''); canvas.width = 256; canvas.height = 144;
      canvas.setAttribute('aria-hidden', 'true'); thumb.append(canvas);
      const info = element('div', 'artwork-info');
      const frames = compLength(c, project.comps), placed = this.app.editor.instances(c.id);
      info.append(element('strong', '', c.name), element('small', '', `${count(c.layers.length, 'layer')} · ${frames > 1 ? count(frames, 'frame') : 'Still'}`), element('small', 'artwork-linked', placed ? count(placed,'linked placement') : 'Not placed yet'));
      const actions = element('div', 'artwork-actions');
      if (replacement) {
        const current = c.id === replacement.source;
        const use = button(current ? 'Current source' : 'Use source','gallery',replace, current ? `Current source ${c.name}` : `Replace with ${c.name}`);
        use.disabled = !canReplace; actions.append(use);
      } else {
        actions.classList.add('artwork-project-actions');
        const place = action('Place', 'plus', () => { this.assets.place(c.id); if (this.app.workspace === 'motion') this.app.focusCanvas(); else this.placedPicker.focus(); }, `Place ${c.name}`);
        place.disabled = this.app.playing || !!artworkProject || this.app.workspace === 'motion' && !!project.comp.asset;
        if (place.disabled && !this.app.playing) place.title = 'Return to your shot to place linked artwork.';
        actions.append(action('Edit', 'draw', () => this.openSource(c.id), `Edit ${c.name}`), place);
        const more = element('details', 'artwork-library-manage artwork-source-files'), summary = element('summary', '', 'Save / files / manage'); summary.setAttribute('aria-label', `Files and actions for ${c.name}`);
        const files = element('div', 'artwork-project-actions');
        const rename=action('Rename','draw',()=>void this.renameSource(c.id),`Rename source ${c.name}`);
        rename.disabled=this.app.playing;
        const save = button('Save as new', 'save', () => void this.saveToLibrary(c.id, save), `Save ${c.name} to My Assets`);
        save.disabled = this.app.playing || this.library.busy;
        const update = button('Update existing…', 'save', () => void this.updateInLibrary(c.id, update), `Update saved asset from ${c.name}`);
        update.disabled = this.app.playing || this.library.busy;
        const download = button('Download .2dope', 'download', () => {
          download.disabled = true;
          void this.library.downloadSource(c.id).catch(e => this.app.onNotice?.(`Could not download artwork: ${e instanceof Error ? e.message : String(e)}`)).finally(() => { download.disabled = false; });
        }, `Download ${c.name} asset file`);
        download.disabled = this.app.playing || this.library.busy;
        files.append(save, update, download, rename);
        if (this.sendTo) { const send = action('Send to\u2026', 'folder', () => this.sendTo?.(c.id, c.name), `Send ${c.name} to another project`); send.disabled = this.app.playing; files.append(send); }
        more.append(summary, files); card.append(more);
      }
      card.prepend(thumb, info, actions); grid.append(card); previews.push({comp:c, canvas});
    }
    body.append(note, status, grid, noMatch); filter(); status.hidden = !!replacement;
    const placements = project.comp.layers.filter(l => l.kind === 'comp' && project.comps.get(l.comp)?.asset);
    if (placements.length && !replacement) {
      const group = element('details', 'artwork-placements');
      const summary = element('summary', '', `Placed in this shot · ${placements.length}`); group.append(summary);
      for (const l of placements) {
        if (l.kind !== 'comp') continue;
        const row = element('div', 'artwork-placement');
        const target = project.activeComp;
        const edit = action('Edit source', 'draw', () => this.openSource(l.comp), `Edit source of ${l.name}`); edit.classList.add('icon-only');
        const arrange = action('Move', 'freeform', () => {
          if (this.app.workspace === 'motion') { this.app.editor.select(l.id); this.app.focusCanvas(); }
          else this.app.setArrangeAssets(true, l.id);
        }, `Move placement of ${l.name}`); arrange.classList.add('icon-only');
        const remove = action('Remove placement', 'trash', () => this.app.editor.editProject('Remove asset placement', () => {
          const c = project.comps.get(target); if (c) c.layers = c.layers.filter(x => x.id !== l.id);
        }), `Remove placement of ${l.name}`); remove.classList.add('icon-only');
        row.append(element('span', '', assetLabel(project,project.comp,l).picker), arrange, edit, remove); group.append(row);
      }
      body.append(group);
    }
    const footnote = replacement ? 'One Undo restores the previous source. Settings for layers inside the old source reset; position, size and animation timing stay. Both sources remain editable in Assets.'
      : artworkProject || this.app.workspace === 'motion' && project.comp.asset ? 'Return to your shot to place artwork. You can edit, save and download these sources here.'
      : this.app.workspace === 'motion' ? 'Place adds an editable linked layer on this timeline. Edit opens Draw; Done returns to this shot and frame.'
      : 'Place adds linked artwork behind your drawing tracks. Source layers stay editable.';
    body.append(element('p', 'artwork-note artwork-footnote', footnote));
    d.append(head, collections, searchRow, body);
    d.addEventListener('cancel', e => { e.preventDefault(); this.close(); });
    d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) this.close(); } });
    document.body.append(d); d.showModal(); (replacement ? this.replacePlaced : this.browse).setAttribute('aria-expanded', 'true');
    // Sequential, resident previews: no parallel decoding of an entire shelf on a tablet.
    void this.previews(project, previews, d);
  }
  private async previews(project: Project, previews: {comp: Comp; canvas: HTMLCanvasElement}[], dialog: HTMLDialogElement): Promise<void> {
    for (const {comp, canvas} of previews) {
      if (this.dialog !== dialog || this.app.project !== project) return;
      const pinned: Drawing[] = [];
      try {
        for (const id of frameContent(project.comps, comp, 0).drawings) {
          if (this.dialog !== dialog || this.app.project !== project) return;
          const drawing = project.drawings.get(id); if (!drawing) continue;
          pinned.push(drawing); await this.app.residency.pin(drawing);
        }
        if (this.dialog !== dialog || this.app.project !== project) return;
        const g = canvas.getContext('2d')!;
        const s = Math.min(canvas.width / comp.width, canvas.height / comp.height);
        g.translate((canvas.width - comp.width * s) / 2, (canvas.height - comp.height * s) / 2); g.scale(s, s);
        drawComp(g, project, comp, 0, {export:true});
      } catch { canvas.setAttribute('aria-label', 'Preview unavailable'); }
      finally { for (const drawing of pinned) this.app.residency.unpin(drawing); }
    }
  }
}
