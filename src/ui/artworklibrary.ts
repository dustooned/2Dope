import type { App } from '../app';
import type { ArtworkAssets } from '../core/assets';
import { isPaintingWorkspace } from '../core/workspace';
import { captureArtwork, packArtwork, readArtwork, libraryArtwork, type ArtworkPackage } from '../io/artwork';
import { DeviceArtworkStore, type ArtworkCard, type ArtworkEntry, type ArtworkStore } from '../io/artworkstore';
import { newId } from '../io/persist';
import { mainLength } from '../io/schema';
import { artworkPreview } from '../view/artworkpreview';
import { artworkKind, filterArtwork, packageKind } from '../core/artworkcatalog';
import { showArtworkPreview } from './artworkpreview';
import { decorate } from './icons';
import { askText, pickBox } from './dialogs';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) {
  const e = document.createElement(tag); e.className = cls; if (text !== undefined) e.textContent = text; return e;
}
function button(name: string, icon: string, run: () => void, label = name) {
  const b = el('button', '', label); b.type = 'button'; b.setAttribute('aria-label', name); b.title = name;
  decorate(b, icon); b.addEventListener('click', run); return b;
}
export function artworkFilename(name: string) { return `${name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'artwork'}.2dope`; }

/** Device-local snapshots. Live links remain scoped to the current project. */
export class ArtworkLibraryUI {
  busy = false;
  openProject: ((file: File) => Promise<void>) | null = null;
  private dialog: HTMLDialogElement | null = null;
  private project: App['project'] | null = null;
  private urls: string[] = [];
  private removed: ArtworkEntry | null = null;
  private load = 0;
  private cards: ArtworkCard[] = [];
  private query = '';
  private kind = 'all';
  private collection = '*';
  private sort = 'updated';
  private stopPreview: (() => void) | null = null;
  constructor(private app: App, private assets: ArtworkAssets, private back: () => void,
    private added: (id: string, placed?: boolean) => void, private closed: () => void,
    private store: ArtworkStore = new DeviceArtworkStore()) {}

  async saveSource(id: string, target?: string): Promise<ArtworkCard> {
    if (this.busy || this.app.strokeActive || this.app.playing) throw new Error('Finish the current action before saving artwork.');
    this.busy = true;
    try { return await this.save(await captureArtwork(this.app.project, id, key => this.app.assets(key)), target); }
    finally { this.busy = false; }
  }
  async updateSource(id: string): Promise<ArtworkCard | null> {
    if (this.busy || this.app.playing || this.app.strokeActive) return null;
    const project = this.app.project, comp = project.activeComp, cards = await this.store.list();
    if (this.app.project !== project || project.activeComp !== comp) return null;
    if (!cards.length) { this.app.onNotice?.('Save this artwork as new first. There are no saved assets to update.'); return null; }
    const target = await pickBox('Update an existing saved asset', cards.map(card => ({ label: card.name, value: card.id,
      hint: `${card.width}×${card.height} · replaces this library snapshot only; placed project copies stay independent.` })));
    if (!target || this.app.project !== project || project.activeComp !== comp) return null;
    return this.saveSource(id, target);
  }
  async downloadSource(id: string): Promise<void> {
    if (this.busy || this.app.strokeActive || this.app.playing) throw new Error('Finish the current action before downloading artwork.');
    this.busy = true;
    try {
      const bundle = await captureArtwork(this.app.project, id, key => this.app.assets(key));
      this.download(bundle, bundle.file.comps[bundle.file.main]!.name);
    } finally { this.busy = false; }
  }
  private download(bundle: ArtworkPackage, name: string): void {
    const url = URL.createObjectURL(new Blob([packArtwork(bundle) as BlobPart], { type: 'application/zip' }));
    const a = document.createElement('a'); a.href = url; a.download = artworkFilename(name); a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  private async save(bundle: ArtworkPackage, target?: string): Promise<ArtworkCard> {
    const f = bundle.file, c = f.comps[f.main]!;
    const card: ArtworkCard = { id: newId('art'), name: c.name, created: Date.now(), updated: Date.now(), width: f.canvas.width,
      height: f.canvas.height, fps: c.fps, frames: mainLength(f), layers: c.layers.length, thumb: null };
    const archive = packArtwork(bundle);
    card.kind = packageKind(bundle, card.frames);
    // A missing thumbnail must not prevent a complete source from being saved.
    try { card.thumb = await artworkPreview(bundle); } catch { /* complete package remains usable */ }
    if (target) {
      const saved = await this.store.replace(target, { card, archive });
      if (!saved) throw new Error('This saved asset was removed. Save as new instead.');
      return saved;
    }
    await this.store.put({ card, archive }); return card;
  }
  update(): void {
    if (this.dialog && (this.project !== this.app.project || !isPaintingWorkspace(this.app.workspace) && this.app.workspace !== 'motion')) this.close();
  }
  close(): void {
    if (!this.dialog) return;
    this.stopPreview?.(); this.stopPreview = null;
    this.dialog.close(); this.dialog.remove(); this.dialog = null; this.project = null;
    for (const url of this.urls) URL.revokeObjectURL(url); this.urls = [];
    this.closed();
  }
  show(): void {
    if (this.dialog || this.app.strokeActive) return;
    this.query = '';
    const d = el('dialog', 'artwork-shelf artwork-library'); this.dialog = d; this.project = this.app.project;
    d.setAttribute('aria-labelledby', 'my-artwork-title');
    const head = el('header', 'artwork-head'), title = el('h2', '', 'My Assets'); title.id = 'my-artwork-title';
    const close = button('Close My Assets', 'close', () => this.close()); close.classList.add('icon-only'); head.append(title, close);
    const nav = el('nav', 'artwork-library-nav'); nav.setAttribute('aria-label', 'Asset collections');
    nav.append(button('In this project', 'gallery', () => { this.close(); this.back(); }), button('Import artwork file', 'import', () => this.chooseFile()));
    const searchRow = el('div', 'artwork-library-search');
    const search = el('input', 'textbox'); search.type = 'search'; search.placeholder = 'Search My Assets'; search.setAttribute('aria-label', 'Search My Assets');
    search.setAttribute('data-own-keys', '');
    search.value = this.query;
    const clear = button('Clear asset search', 'close', () => { search.value = ''; this.filter(d); search.focus(); }); clear.classList.add('icon-only'); clear.hidden = true;
    search.addEventListener('input', () => this.filter(d)); searchRow.append(search, clear);
    const filters = el('div', 'asset-library-filters');
    const select = (label: string, options: [string, string][], value: string) => {
      const wrap = el('label', '', label), input = el('select', ''); input.setAttribute('aria-label', label);
      for (const [key, name] of options) input.append(new Option(name, key)); input.value = value;
      input.addEventListener('change', () => this.filter(d)); wrap.append(input); filters.append(wrap); return input;
    };
    select('Asset type', [['all', 'All types'], ['drawing', 'Drawings'], ['vector', 'Vectors'], ['clip', 'Animated clips']], this.kind);
    select('Asset collection', [['*', 'All collections'], ['', 'Unfiled']], '*');
    select('Sort assets', [['updated', 'Recently updated'], ['created', 'Newest saved'], ['name', 'Name'], ['duration', 'Duration']], this.sort);
    const undo = el('div', 'artwork-library-undo');
    const body = el('div', 'artwork-body');
    const note = el('p', 'artwork-note', 'Add independent copies to a project; placements can share that project source.');
    const status = el('p', 'artwork-note artwork-library-count', 'Loading artwork…'); status.setAttribute('role', 'status');
    body.append(note, status); d.append(head, nav, searchRow, filters, undo, body); this.undoMessage(d);
    d.addEventListener('cancel', e => { e.preventDefault(); this.close(); });
    d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) this.close(); } });
    document.body.append(d); d.showModal();
    void this.reload(d).catch(e => { if (this.dialog === d) this.error(e); });
  }
  private async reload(d: HTMLDialogElement): Promise<void> {
    const load = ++this.load, cards = await this.store.list();
    if (this.dialog !== d || load !== this.load) return;
    this.cards = cards;
    const collection = d.querySelector<HTMLSelectElement>('[aria-label="Asset collection"]')!;
    collection.replaceChildren(new Option('All collections', '*'), new Option('Unfiled', ''),
      ...[...new Set(cards.map(c => c.collection).filter((c): c is string => !!c))].sort().map(c => new Option(c, c)));
    collection.value = [...collection.options].some(o => o.value === this.collection) ? this.collection : '*';
    const body = d.querySelector<HTMLElement>('.artwork-body')!, scroll = body.scrollTop;
    body.querySelector('.artwork-library-status')?.remove();
    for (const node of body.querySelectorAll('.artwork-grid, .artwork-empty, .artwork-footnote')) node.remove();
    for (const url of this.urls) URL.revokeObjectURL(url); this.urls = [];
    const grid = el('div', 'artwork-grid'); body.append(grid);
    for (const card of cards) grid.append(this.card(card));
    body.append(el('div', 'artwork-empty'), el('p', 'artwork-note artwork-footnote', 'Saving keeps a snapshot. Later project edits do not change this library copy. Download .2dope for a backup or to share.'));
    this.filter(d); body.scrollTop = scroll;
  }
  private filter(d: HTMLDialogElement): void {
    const search = d.querySelector<HTMLInputElement>('.artwork-library-search input')!;
    this.query = search.value; this.kind = d.querySelector<HTMLSelectElement>('[aria-label="Asset type"]')!.value;
    this.collection = d.querySelector<HTMLSelectElement>('[aria-label="Asset collection"]')!.value;
    this.sort = d.querySelector<HTMLSelectElement>('[aria-label="Sort assets"]')!.value;
    const sorted = filterArtwork(this.cards, this.query, this.kind, this.collection, this.sort), ids = new Set(sorted.map(c => c.id));
    const cards = [...d.querySelectorAll<HTMLElement>('.artwork-grid > article')], found = sorted.length;
    for (const card of cards) card.hidden = !ids.has(card.dataset.assetId!);
    const grid = d.querySelector('.artwork-grid');
    for (const item of sorted) { const node = cards.find(c => c.dataset.assetId === item.id); if (node) grid?.append(node); }
    d.querySelector<HTMLButtonElement>('.artwork-library-search button')!.hidden = !search.value;
    d.querySelector('.artwork-library-count')!.textContent = this.query.trim() || this.kind !== 'all' || this.collection !== '*' ? `${found} of ${cards.length} assets` : `${cards.length} saved asset${cards.length === 1 ? '' : 's'}`;
    const empty = d.querySelector<HTMLElement>('.artwork-empty');
    if (empty) { empty.hidden = found > 0; empty.textContent = cards.length ? 'No matching artwork. Try another name or clear your search.' : 'Save a source from In this project, or import a shared artwork file.'; }
  }
  private undoMessage(d: HTMLDialogElement): void {
    const row = d.querySelector<HTMLElement>('.artwork-library-undo')!; row.replaceChildren(); row.hidden = !this.removed;
    if (!this.removed) return;
    const text = el('span', '', `Removed ${this.removed.card.name}`); text.setAttribute('role', 'status');
    row.append(text, button('Undo last asset removal', 'undo', () => void this.restore(), 'Undo'));
    row.title = 'Undo stays available until the next removal or this page reloads.';
  }
  private async manage(card: ArtworkCard, action: 'rename' | 'remove' | 'collection'): Promise<void> {
    if (this.busy || !this.dialog) return;
    const d = this.dialog; this.busy = true; d.setAttribute('aria-busy', 'true');
    try {
      if (action === 'rename') {
        const value = await askText('Rename saved artwork', card.name, 'Rename', 'Names future copies, opened projects and downloads. Artwork already in projects keeps its name.');
        if (value === null || this.dialog !== d) return;
        if (!await this.store.rename(card.id, value)) throw new Error('This artwork is no longer available.');
      } else if (action === 'collection') {
        const collections = [...new Set(this.cards.map(c => c.collection).filter((c): c is string => !!c))].sort();
        const value = await pickBox('Move saved asset to collection', [{ label: 'Unfiled', value: '' }, ...collections.map(c => ({ label: c, value: c }))],
          { label: 'New collection…', run: async () => (await askText('New asset collection', '', 'Create and move'))?.trim().slice(0, 80) || undefined });
        if (value === undefined || this.dialog !== d) return;
        if (!await this.store.move(card.id, value)) throw new Error('This artwork is no longer available.');
      } else {
        const entry = await this.store.remove(card.id);
        if (!entry) throw new Error('This artwork is no longer available.');
        this.removed = entry;
      }
      if (this.dialog !== d) return;
      this.undoMessage(d); await this.reload(d);
      if (this.dialog === d) {
        if (action === 'remove') d.querySelector<HTMLButtonElement>('.artwork-library-undo button')?.focus();
        else d.querySelector<HTMLInputElement>('.artwork-library-search input')?.focus();
      }
    } catch (e) { if (this.dialog === d) this.error(e); else this.app.onNotice?.(e instanceof Error ? e.message : String(e)); }
    finally { this.busy = false; d.removeAttribute('aria-busy'); }
  }
  private async restore(): Promise<void> {
    if (this.busy || !this.dialog || !this.removed) return;
    const d = this.dialog, entry = this.removed; this.busy = true; d.setAttribute('aria-busy', 'true');
    try {
      await this.store.put(entry); this.removed = null;
      if (this.dialog === d) { this.undoMessage(d); await this.reload(d); if (this.dialog === d) d.querySelector<HTMLInputElement>('.artwork-library-search input')?.focus(); }
    } catch (e) { this.error(e); }
    finally { this.busy = false; d.removeAttribute('aria-busy'); }
  }
  private card(card: ArtworkCard): HTMLElement {
    const article = el('article', 'artwork-card'); article.setAttribute('aria-label', `Saved ${card.name}`);
    article.dataset.assetId = card.id;
    article.dataset.search = card.name.normalize('NFKC').toLocaleLowerCase();
    const preview = button(`Preview saved ${card.name}`, 'play', () => void this.preview(card, preview), 'Preview');
    preview.className = 'artwork-preview artwork-library-preview'; preview.replaceChildren();
    if (card.thumb) { const img = el('img', ''); img.alt = ''; const url = URL.createObjectURL(new Blob([card.thumb as BlobPart], { type: 'image/png' })); this.urls.push(url); img.src = url; preview.append(img); }
    const info = el('div', 'artwork-info');
    info.append(el('strong', '', card.name), el('small', '', `${card.width}×${card.height} · ${card.layers} layer${card.layers === 1 ? '' : 's'}`),
      el('small', '', card.frames > 1 ? `${card.frames} frames · ${card.fps} fps · ${(card.frames / card.fps).toFixed(2)} s` : artworkKind(card) === 'vector' ? 'Vector artwork' : 'Still drawing'));
    if (card.collection) info.append(el('small', 'asset-collection-badge', card.collection));
    const actions = el('div', 'artwork-actions artwork-library-actions');
    const sameSize = card.width === this.app.project.width && card.height === this.app.project.height;
    const add = button(`Add copy of ${card.name}`, 'plus', () => void this.use(card, 'add'), 'Add copy');
    add.disabled = !sameSize || this.app.playing;
    const place = button(`Add and place ${card.name}`, 'plus', () => void this.use(card, 'place'), 'Add & place');
    place.hidden = !sameSize;
    place.disabled = !sameSize || this.app.playing || !!this.app.project.comp.asset;
    if (this.app.project.comp.asset) place.title = 'Return to your shot before placing artwork.';
    if (!sameSize) { add.title = 'Use Open as project to keep the original canvas size.'; info.append(el('small', 'artwork-size-note', 'Different canvas · open as project')); }
    const open = button(`Open ${card.name} as project`, 'draw', () => void this.use(card, 'open'), 'Open as project'); open.disabled = !this.openProject;
    const download = button(`Download ${card.name} artwork`, 'download', () => void this.use(card, 'download'), 'Download');
    download.classList.add('artwork-download');
    const manage = el('details', 'artwork-library-manage'), summary = el('summary', '', 'Manage'); summary.setAttribute('aria-label', `Manage ${card.name}`);
    const editing = el('div', 'artwork-actions artwork-library-management-buttons');
    if (sameSize) editing.append(open);
    editing.append(download, button(`Rename saved ${card.name}`, 'draw', () => void this.manage(card, 'rename'), 'Rename'),
      button(`Move saved ${card.name} to collection`, 'folder', () => void this.manage(card, 'collection'), 'Collection'),
      button(`Remove saved ${card.name}`, 'trash', () => void this.manage(card, 'remove'), 'Remove'));
    manage.append(summary, editing); actions.append(place, add); if (!sameSize) actions.prepend(open);
    article.append(preview, info, actions, manage); return article;
  }
  private async preview(card: ArtworkCard, opener: HTMLElement): Promise<void> {
    if (this.busy || !this.dialog) return;
    const dialog = this.dialog; this.busy = true;
    try {
      const entry = await this.store.get(card.id); if (!entry) throw new Error('This artwork is no longer available.');
      const bundle = await libraryArtwork(entry); if (this.dialog !== dialog) return;
      this.stopPreview?.(); this.stopPreview = showArtworkPreview(bundle, entry.card.name, opener);
    } catch (e) { this.error(e); } finally { this.busy = false; }
  }
  private error(e: unknown): void {
    const message = e instanceof Error ? e.message : String(e);
    const body = this.dialog?.querySelector('.artwork-body');
    if (body) { let status = body.querySelector<HTMLElement>('.artwork-library-status'); if (!status) { status = el('p', 'artwork-note artwork-library-status'); status.setAttribute('role', 'status'); body.prepend(status); } status.textContent = message; }
    else this.app.onNotice?.(message);
  }
  private async use(card: ArtworkCard, action: 'add' | 'place' | 'open' | 'download'): Promise<void> {
    if (this.busy || !this.dialog) return;
    const d = this.dialog, p = this.app.project, comp = p.activeComp, workspace = this.app.workspace; this.busy = true; d.setAttribute('aria-busy', 'true');
    try {
      const entry = await this.store.get(card.id);
      if (!entry) throw new Error('This artwork is no longer available.');
      if (this.dialog !== d || this.app.project !== p) return;
      const bundle = await libraryArtwork(entry);
      if (this.dialog !== d || this.app.project !== p) return;
      if (action === 'download') {
        this.download(bundle, entry.card.name); return;
      }
      if (action === 'open') { if (this.openProject) { this.close(); await this.openProject(new File([packArtwork(bundle) as BlobPart], artworkFilename(entry.card.name), { type: 'application/zip' })); } return; }
      if (this.dialog !== d || this.app.project !== p || p.activeComp !== comp || this.app.workspace !== workspace || this.app.strokeActive || this.app.playing) return;
      if (action === 'place' && p.comp.asset) return;
      const id = this.assets.addPackage(bundle);
      if (id) {
        const placed = action === 'place' && this.assets.place(id);
        if (placed) this.app.history.combine(2, 'Add and place library asset');
        this.busy = false; this.close(); this.added(id, placed);
      }
    } catch (e) { this.error(e); }
    finally { this.busy = false; d.removeAttribute('aria-busy'); }
  }
  private chooseFile(): void {
    if (this.busy || !this.dialog) return;
    const input = el('input', ''); input.type = 'file'; input.accept = '.2dope';
    input.addEventListener('change', () => { const file = input.files?.[0]; if (file) void this.importFile(file); }); input.click();
  }
  async importFile(file: File): Promise<void> {
    if (this.busy || !this.dialog) return;
    const d = this.dialog; this.busy = true; d.setAttribute('aria-busy', 'true');
    try {
      if (file.size > 1024 * 1024 * 1024) throw new Error('This artwork file is too large.');
      const bundle = await readArtwork(new Uint8Array(await file.arrayBuffer()));
      if (this.dialog !== d) return;
      await this.save(bundle);
      if (this.dialog === d) await this.reload(d);
    } catch (e) { this.error(e); }
    finally { this.busy = false; d.removeAttribute('aria-busy'); }
  }
}
