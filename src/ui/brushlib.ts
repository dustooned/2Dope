import { BrushImportError, readBrushFile, type ImportedBrush, type ImportedTip } from '../io/brushimport';
import { loadGrain, loadTip } from '../brush/raster';
import { loadBrushes, saveBrushes } from '../io/brushstore';
import type { App } from '../app';
import { cloneBrush, PRESETS, type BrushSettings } from '../core/brush';
import { addSet, allCategories, categoryOf, forget, isBuiltIn, moveTo, readBrush, readSets, removeSet, renamedIn, renameSet, uniqueName, type BrushCategory, type BrushSets } from '../core/brushlib';
import type { StrokePoint, StrokeRecord } from '../core/stroke';
import { strokeLength } from '../core/stroke';
import { dabsForStroke } from '../brush/dabs';
import { RasterEngine } from '../brush/raster';
import { drawVectorStroke } from '../brush/vector';
import { attachContextMenu } from './contextmenu';
import { askText, confirmBox } from './dialogs';
import { decorate } from './icons';

const MINE_KEY = '2dope.brushes.mine';
const CAT_KEY = '2dope.brushes.category';
/** Your brush collections (Procreate brush sets) and which brushes are in them. */
const SETS_KEY = '2dope.brushes.sets';
const PW = 220;
const PH = 54;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * The brush library (Procreate Dreams style): categories on the left, brushes as cards with a
 * live stroke preview on the right. Tap a card to draw with it; double-tap to open all its
 * settings (the Brush Studio). Save the brush you tuned into My brushes; hold a card to
 * duplicate, rename, delete, or move or copy it to a collection. Make your own collections (＋ New)
 * and drag a brush sideways onto one to move it there (a built-in brush is copied). Opens by
 * tapping the active Brush / Vector / Eraser tool again.
 */
export class BrushLibrary {
  private readonly root = el('div', { class: 'brushlib', role: 'dialog', 'aria-label': 'Brush library', hidden: '' });
  private readonly cats = el('div', { class: 'bl-cats', role: 'tablist' });
  private readonly list = el('div', { class: 'bl-list', role: 'listbox', 'aria-label': 'Brushes' });
  private anchor: HTMLElement | null = null;
  private anchorParent: HTMLElement | null = null;
  private anchorLabel: string | null = null;
  private readonly done = el('button', { type: 'button', class: 'bl-done', 'aria-label': 'Done choosing brush', title: 'Keep this brush and return to drawing' }, 'Done');
  private readonly current = el('span', { class: 'bl-current', role: 'status', 'aria-label': 'Current brush and painting target' });
  private cancelDrag = () => {};
  private cat: BrushCategory;
  private mine: BrushSettings[];
  private sets: BrushSets = (() => { try { return readSets(JSON.parse(localStorage.getItem(SETS_KEY) ?? 'null')); } catch { return readSets(null); } })();
  /** The click after a drag does not also pick the brush. */
  private dragged = false;
  private readonly engine = new RasterEngine(PW, PH);
  private lastTap = { name: '', at: 0 };

  constructor(
    private readonly app: App,
    private readonly openStudio: () => void,
  ) {
    this.mine = this.loadMine();
    // My brushes live in IndexedDB (picture tips are too big for localStorage); older lists move over
    void loadBrushes()
      .then((list) => {
        if (list) {
          this.mine = this.readList(list);
          for (const b of this.mine) { if (b.tipImage) void loadTip(b.tipImage); if (b.grainImage) void loadGrain(b.grainImage); }
          this.render();
        } else if (this.mine.length) this.saveMine();
      })
      .catch(() => { /* localStorage stays the store */ });
    let c: BrushCategory = categoryOf(app.brush.name, this.mine, this.sets);
    try {
      const saved = localStorage.getItem(CAT_KEY);
      if (allCategories(this.sets).some((x) => x.id === saved)) c = saved as BrushCategory;
    } catch {
      // default category
    }
    this.cat = c;
    const head = el('div', { class: 'bl-head' });
    const identity = el('div', { class: 'bl-identity' });
    identity.append(el('span', { class: 'bl-title' }, 'Brushes'), this.current);
    decorate(this.done, 'check');
    this.done.addEventListener('click', () => this.close(true));
    head.append(identity, this.done);
    const actions = el('div', { class: 'bl-actions' });
    const save = el('button', { type: 'button', class: 'primary', title: 'Save the brush you are using (with your changes) into My brushes' }, 'Save brush');
    decorate(save, 'plus');
    save.addEventListener('click', () => void this.saveCurrent());
    const studio = el('button', { type: 'button', title: 'Every setting of this brush (Brush Studio)' }, 'Studio');
    decorate(studio, 'gear');
    studio.addEventListener('click', () => {
      this.close();
      this.openStudio();
    });
    // Procreate (.brushset, .brush) and Photoshop (.abr) brushes; no accept filter, since iPad
    // Safari greys out file types it does not know
    const picker = el('input', { type: 'file', multiple: '', hidden: '' });
    picker.addEventListener('change', () => {
      const files = [...(picker.files ?? [])];
      picker.value = '';
      if (files.length) void this.importFiles(files);
    });
    const imp = el('button', { type: 'button', title: 'Bring in brushes from Procreate (.brushset, .brush) or Photoshop (.abr)' }, 'Import');
    decorate(imp, 'import');
    imp.addEventListener('click', () => picker.click());
    actions.append(imp, studio, save, picker);
    const main = el('div', { class: 'bl-main' });
    main.append(this.cats, this.list);
    this.root.append(head, actions, main, el('p', { class: 'hint bl-hint' }, 'Tap to choose · Done to draw · double-tap for Studio · hold for more'));
    document.body.append(this.root);

    attachContextMenu(this.list, ({ target }) => {
      const card = (target as HTMLElement).closest<HTMLElement>('[data-name]');
      if (!card) return null;
      const name = card.dataset.name!;
      const b = this.find(name);
      if (!b) return null;
      const own = !isBuiltIn(name);
      const here = categoryOf(name, this.mine, this.sets);
      // where a brush can go: My brushes and your collections
      const places = allCategories(this.sets).filter((c) => c.own || c.id === 'mine');
      return [
        { label: 'Use this brush', run: () => this.use(b) },
        { label: 'Open in Studio', run: () => this.studio(b) },
        { label: 'Duplicate', run: () => this.add({ ...cloneBrush(b), name: uniqueName(`${name} copy`, this.names()) }) },
        ...(own && places.length > 1 ? [{ title: 'Move to' }, { chips: places.filter((c) => c.id !== here).map((c) => ({ label: c.label, run: () => this.moveBrush(name, c.id) })) }] : []),
        { title: 'Copy to' },
        { chips: [...places.map((c) => ({ label: c.label, run: () => this.copyBrush(b, c.id) })), { label: '\uff0b New collection', run: () => void this.newSet([b], true) }] },
        ...(own ? [{ sep: true as const }, { label: 'Rename…', run: () => void this.rename(b) }, { label: 'Delete', run: () => void this.remove(b), danger: true }] : []),
      ];
    });
    this.wireDrag();
    attachContextMenu(this.cats, ({ target }) => {
      const t = (target as HTMLElement).closest<HTMLElement>('[data-cat]');
      return t && t.dataset.own === '1' ? this.setMenu(t.dataset.cat!) : null;
    });
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (this.root.hidden) return;
        const t = e.target as Node;
        if (this.root.contains(t) || this.currentAnchor()?.contains(t) || (t as HTMLElement).closest?.('.ctxmenu, dialog')) return;
        this.close();
      },
      true,
    );
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || this.root.hidden || document.querySelector('dialog[open], .ctxmenu')) return;
      e.preventDefault(); e.stopPropagation(); this.close(true);
    }, true);
    window.addEventListener('resize', () => this.place());
    new ResizeObserver(() => this.place()).observe(this.root);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(anchor: HTMLElement): void {
    if (this.open) return this.close(true);
    this.anchor = anchor;
    this.anchorParent = anchor.parentElement;
    this.anchorLabel = anchor.getAttribute('aria-label');
    this.root.hidden = false;
    this.render();
    this.place();
    this.done.focus({ preventScroll: true });
  }

  close(returnToCanvas = false): void {
    this.cancelDrag();
    this.dragged = false;
    this.lastTap = { name: '', at: 0 };
    this.root.hidden = true;
    if (returnToCanvas) this.app.focusCanvas();
  }

  /** Every brush: the built-in ones, then yours. */
  all(): BrushSettings[] {
    return [...PRESETS, ...this.mine];
  }

  private names(): string[] {
    return this.all().map((b) => b.name);
  }

  private find(name: string): BrushSettings | undefined {
    return this.all().find((b) => b.name === name);
  }

  private readList(raw: unknown[]): BrushSettings[] {
    const out: BrushSettings[] = [];
    for (const r of raw) {
      const b = readBrush(r);
      if (b && !isBuiltIn(b.name) && !out.some((x) => x.name === b.name)) out.push(b);
    }
    return out.slice(0, MINE_MAX);
  }

  private loadMine(): BrushSettings[] {
    try {
      const raw = JSON.parse(localStorage.getItem(MINE_KEY) ?? '[]') as unknown[];
      return this.readList(Array.isArray(raw) ? raw : []);
    } catch {
      return [];
    }
  }

  private saveMine(): void {
    const list = this.mine;
    void saveBrushes(list)
      .then(() => {
        // saved in IndexedDB: the old copy no longer takes localStorage space
        try { localStorage.removeItem(MINE_KEY); } catch { /* fine */ }
      })
      .catch(() => {
        try {
          localStorage.setItem(MINE_KEY, JSON.stringify(list));
        } catch {
          this.app.onNotice?.('Could not save your brushes on this device (storage is full or blocked).');
        }
      });
  }

  private use(b: BrushSettings): void {
    this.app.setBrush(cloneBrush(b));
    this.render();
  }

  private studio(b: BrushSettings): void {
    this.use(b);
    this.close();
    this.openStudio();
  }

  /** Brushes from other apps into My brushes: tips and grains become small pictures. */
  private async importFiles(files: File[]): Promise<void> {
    let added = 0, round = 0, grained = 0, failed = 0, full = 0;
    const names: string[] = [];
    let lastSet: string | null = null;
    for (const f of files) {
      const before = names.length;
      try {
        if (f.size > 256 * 1024 * 1024) throw new BrushImportError(`${f.name} is too large to bring in.`);
        const found = await readBrushFile(new Uint8Array(await f.arrayBuffer()), f.name);
        for (const ib of found) {
          if (this.mine.length >= MINE_MAX) { full++; continue; }
          // a tip picture that will not decode: the brush still comes in, with the round tip
          const tip = ib.tip ? await picDataUrl(ib.tip, 128, ib.tipInvert) : null;
          if (ib.tip && !tip) failed++;
          const grain = ib.grain ? await picDataUrl({ kind: 'png', bytes: ib.grain.bytes }, 256, ib.grain.invert) : null;
          const b = importedBrush(ib, tip, grain, [...this.names(), ...names]);
          this.mine = [...this.mine, b];
          names.push(b.name);
          added++;
          if (!tip) round++;
          if (grain) grained++;
          if (tip) void loadTip(tip);
          if (grain) void loadGrain(grain);
        }
      } catch (e) {
        this.app.onNotice?.(e instanceof BrushImportError ? e.message : `${f.name} could not be read as a brush file.`);
      }
      // a brush set (several brushes in one file) gets a collection named after the file
      const got = names.slice(before);
      if (got.length > 1) {
        const id = `set${Date.now().toString(36)}${before}`;
        this.setSets(moveTo(addSet(this.sets, f.name.replace(/\.[a-z0-9]+$/i, ''), id), got, id));
        lastSet = id;
      }
    }
    if (!added) return;
    this.saveMine();
    this.cat = lastSet ?? 'mine';
    this.render();
    const bits = [round ? `${round} with the round tip` : '', grained ? `${grained} with their grain` : '', failed ? `${failed} tip picture${failed === 1 ? '' : 's'} could not be read` : '', full ? `${full} left out (My brushes is full)` : ''].filter(Boolean);
    this.app.onNotice?.(`${added} brush${added === 1 ? '' : 'es'} added to My brushes${bits.length ? ` (${bits.join(', ')})` : ''}. Close to the originals, not identical: wet mixing and dual brushes are not carried over.`);
    setTimeout(() => this.render(), 300); // previews again once the tips have decoded
  }

  private add(b: BrushSettings, into: BrushCategory = this.sets.sets.some((s) => s.id === this.cat) ? this.cat : 'mine'): void {
    this.mine = [...this.mine, b];
    this.saveMine();
    if (into !== 'mine') this.setSets(moveTo(this.sets, [b.name], into));
    this.cat = into;
    this.use(b);
  }

  private setSets(s: BrushSets): void {
    this.sets = s;
    try { localStorage.setItem(SETS_KEY, JSON.stringify(s)); } catch { /* not remembered */ }
  }

  /** Move one of your brushes to a collection (or back to My brushes). */
  private moveBrush(name: string, to: BrushCategory): void {
    this.setSets(moveTo(this.sets, [name], to));
    this.render();
    this.app.onNotice?.(`Moved \u201c${name}\u201d to ${allCategories(this.sets).find((c) => c.id === to)?.label ?? 'My brushes'}.`);
  }

  /** A copy of a brush (yours or built in) in a collection. */
  private copyBrush(b: BrushSettings, to: BrushCategory): void {
    const copy = { ...cloneBrush(b), name: uniqueName(isBuiltIn(b.name) ? b.name : `${b.name} copy`, this.names()) };
    this.mine = [...this.mine, copy];
    this.saveMine();
    this.setSets(moveTo(this.sets, [copy.name], to));
    this.render();
    this.app.onNotice?.(`Copied to ${allCategories(this.sets).find((c) => c.id === to)?.label ?? 'My brushes'} as \u201c${copy.name}\u201d.`);
  }

  /** A new collection; with brushes, they go in (copied when `copy`, or when built in). */
  private async newSet(brushes: BrushSettings[] = [], copy = false): Promise<void> {
    const name = await askText('New collection', 'My brushes 2', 'Make it');
    if (name === null) return;
    const id = `set${Date.now().toString(36)}`;
    this.setSets(addSet(this.sets, name, id));
    for (const b of brushes) {
      if (copy || isBuiltIn(b.name)) this.copyBrush(b, id);
      else this.setSets(moveTo(this.sets, [b.name], id));
    }
    this.cat = id;
    this.render();
  }

  /** The menu of one of your collections: rename or delete it. */
  private setMenu(id: string): import('./contextmenu').CtxItem[] | null {
    const s = this.sets.sets.find((x) => x.id === id);
    if (!s) return null;
    return [
      { title: s.name },
      { label: 'Rename…', run: async () => { const n = await askText('Rename collection', s.name, 'Rename'); if (n !== null) { this.setSets(renameSet(this.sets, id, n)); this.render(); } } },
      { label: 'Delete collection (its brushes go to My brushes)', danger: true, run: async () => {
        if (!(await confirmBox(`Delete the collection \u201c${s.name}\u201d?`, 'Its brushes are kept: they go back to My brushes.', 'Delete', true))) return;
        this.setSets(removeSet(this.sets, id));
        if (this.cat === id) this.cat = 'mine';
        this.render();
      } },
    ];
  }

  /**
   * Drag a brush card sideways onto a collection: yours move, built-in ones are copied. A mostly
   * up-and-down move is the list scrolling, so it is left alone.
   */
  private wireDrag(): void {
    let s: { x: number; y: number; id: number; name: string; card: HTMLElement } | null = null;
    let ghost: HTMLElement | null = null;
    let over: HTMLElement | null = null;
    const end = () => {
      const id = s?.id;
      ghost?.remove();
      ghost = null;
      over?.classList.remove('drop');
      over = null;
      s = null;
      if (id !== undefined && this.list.hasPointerCapture(id)) this.list.releasePointerCapture(id);
    };
    this.cancelDrag = end;
    this.list.addEventListener('pointerdown', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('.bl-card');
      if (!card || e.button > 0) return;
      s = { x: e.clientX, y: e.clientY, id: e.pointerId, name: card.dataset.name!, card };
      this.dragged = false;
    });
    this.list.addEventListener('pointermove', (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!ghost) {
        if (Math.abs(dx) < 14 || Math.abs(dx) < Math.abs(dy) * 1.2) { if (Math.abs(dy) > 14) end(); return; }
        ghost = s.card.cloneNode(true) as HTMLElement;
        ghost.classList.add('bl-ghost');
        document.body.append(ghost);
        try { this.list.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
        this.dragged = true;
      }
      ghost.style.left = `${e.clientX - 40}px`;
      ghost.style.top = `${e.clientY - 20}px`;
      ghost.hidden = true;
      const t = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-cat]') ?? null;
      ghost.hidden = false;
      const ok = !!t && (t.dataset.own === '1' || t.dataset.cat === 'mine');
      if (over !== t) { over?.classList.remove('drop'); over = ok ? t : null; over?.classList.add('drop'); }
    });
    const up = (e: PointerEvent) => {
      if (!s || e.pointerId !== s.id) return;
      const name = s.name, target = over?.dataset.cat;
      const was = !!ghost;
      end();
      if (!was || !target) return;
      const b = this.find(name);
      if (!b) return;
      if (isBuiltIn(name)) this.copyBrush(b, target);
      else if (categoryOf(name, this.mine, this.sets) !== target) this.moveBrush(name, target);
    };
    this.list.addEventListener('pointerup', up);
    this.list.addEventListener('pointercancel', () => end());
    this.list.addEventListener('lostpointercapture', (e) => { if (s?.id === e.pointerId) end(); });
    // the click that ends a drag is not a pick
    this.list.addEventListener('click', (e) => { if (this.dragged) { e.stopPropagation(); e.preventDefault(); this.dragged = false; } }, true);
  }

  private async saveCurrent(): Promise<void> {
    const cur = this.app.brush;
    const name = await askText('Save brush as', uniqueName(isBuiltIn(cur.name) ? `My ${cur.name}` : cur.name, this.names()), 'Save');
    if (name === null) return;
    const own = this.mine.findIndex((b) => b.name === name.trim());
    if (own >= 0) {
      // saving under your own brush's name updates it
      this.mine = this.mine.map((b, i) => (i === own ? { ...cloneBrush(cur), name: b.name } : b));
      this.saveMine();
      this.use(this.mine[own]!);
      return;
    }
    this.add({ ...cloneBrush(cur), name: uniqueName(name, this.names()) });
  }

  private async rename(b: BrushSettings): Promise<void> {
    const name = await askText('Rename brush', b.name, 'Rename');
    if (name === null || name.trim() === b.name) return;
    const next = uniqueName(name, this.names());
    this.mine = this.mine.map((x) => (x.name === b.name ? { ...x, name: next } : x));
    this.saveMine();
    this.setSets(renamedIn(this.sets, b.name, next));
    if (this.app.brush.name === b.name) this.app.setBrush({ ...cloneBrush(this.app.brush), name: next });
    this.render();
  }

  private async remove(b: BrushSettings): Promise<void> {
    if (!(await confirmBox(`Delete “${b.name}”?`, 'It is removed from My brushes on this device. Drawings made with it are not changed.', 'Delete', true))) return;
    this.mine = this.mine.filter((x) => x.name !== b.name);
    this.saveMine();
    this.setSets(forget(this.sets, b.name));
    this.render();
  }

  private place(): void {
    const a = this.currentAnchor();
    if (!a || this.root.hidden) return;
    const r = a.getBoundingClientRect();
    const w = Math.min(520, window.innerWidth - 16);
    this.root.style.width = `${w}px`;
    this.root.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    this.root.style.top = `${Math.max(8, Math.min(r.bottom + 6, window.innerHeight - this.root.offsetHeight - 8))}px`;
  }

  private currentAnchor(): HTMLElement | null {
    if (this.anchor?.isConnected) return this.anchor;
    if (!this.anchorParent?.isConnected || !this.anchorLabel) return null;
    return [...this.anchorParent.children].find((e): e is HTMLElement => e instanceof HTMLElement && e.getAttribute('aria-label') === this.anchorLabel) ?? null;
  }

  private render(): void {
    if (this.root.hidden) return;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusName = focused?.closest<HTMLElement>('.bl-card')?.dataset.name;
    const focusCat = focused?.closest<HTMLElement>('[data-cat]')?.dataset.cat;
    const listScroll = this.list.scrollTop, catsScroll = this.cats.scrollTop, catsLeft = this.cats.scrollLeft;
    const tool = this.app.smudging ? 'Smudge' : this.app.tool === 'eraser' ? 'Eraser' : this.app.tool === 'pen' ? 'Vector' : 'Brush';
    this.current.textContent = `${this.app.brush.name} · ${tool} · ${this.app.plane === 'line' ? 'Line' : 'Fill'}`;
    this.current.title = this.current.textContent;
    if (!allCategories(this.sets).some((c) => c.id === this.cat)) this.cat = 'mine';
    const newSet = el('button', { type: 'button', class: 'bl-new', title: 'A new collection for your brushes (like a Procreate brush set)' }, 'New');
    decorate(newSet, 'plus');
    newSet.addEventListener('click', () => void this.newSet());
    this.cats.replaceChildren(
      ...allCategories(this.sets).map((c) => {
        const count = this.all().filter((b) => categoryOf(b.name, this.mine, this.sets) === c.id).length;
        const b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(c.id === this.cat), 'data-cat': c.id, 'data-own': c.own ? '1' : '0', title: c.own ? 'Your collection: hold for rename or delete; drop a brush here to move it in' : c.id === 'mine' ? 'Your brushes; drop a brush here to move it back' : c.label }, c.label);
        decorate(b, c.own ? 'folder' : c.id === 'sketch' ? 'draw' : c.id === 'ink' ? 'pen' : c.id === 'paint' ? 'brush' : 'brushes');
        b.append(el('span', { class: 'bl-count' }, String(count)));
        b.addEventListener('click', () => {
          this.cat = c.id;
          try {
            localStorage.setItem(CAT_KEY, c.id);
          } catch {
            // not remembered
          }
          this.render();
        });
        return b;
      }),
      newSet,
    );
    const shown = this.all().filter((b) => categoryOf(b.name, this.mine, this.sets) === this.cat);
    const cur = this.app.brush.name;
    this.list.replaceChildren(
      ...(shown.length
        ? shown.map((b) => {
            const card = el('button', { type: 'button', class: `bl-card${b.name === cur ? ' on' : ''}`, role: 'option', 'aria-selected': String(b.name === cur), 'data-name': b.name, title: b.name });
            card.append(this.preview(b), el('span', { class: 'bl-name' }, b.name));
            card.addEventListener('click', () => {
              if (this.root.hidden) return;
              const now = performance.now();
              const double = this.lastTap.name === b.name && now - this.lastTap.at < 400;
              this.lastTap = { name: b.name, at: now };
              if (double) this.studio(b);
              else this.use(b);
            });
            return card;
          })
        : [el('p', { class: 'hint bl-empty' }, 'No brushes saved yet. Tune a brush, then tap ＋ Save brush.')]),
    );
    // Selecting a brush/category rebuilds its controls: keep keyboard and scrolling in place.
    if (focusName || focusCat) {
      const replacement = [...this.root.querySelectorAll<HTMLElement>('[data-name], [data-cat]')].find(e => focusName ? e.dataset.name === focusName : e.dataset.cat === focusCat);
      replacement?.focus({ preventScroll: true });
    }
    this.list.scrollTop = listScroll;
    this.cats.scrollTop = catsScroll;
    this.cats.scrollLeft = catsLeft;
  }

  /** A stroke drawn with the brush: thin to thick to thin, in the current colour. */
  private preview(b: BrushSettings): HTMLCanvasElement {
    const c = el('canvas', { class: 'bl-preview', width: String(PW), height: String(PH) });
    const g = c.getContext('2d');
    if (!g) return c;
    const pts: StrokePoint[] = [];
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push({ x: 14 + t * (PW - 28), y: PH / 2 + Math.sin(t * Math.PI * 2) * (PH * 0.26), pressure: 0.15 + 0.85 * Math.sin(t * Math.PI), tiltX: 0, tiltY: 0, t: i * 8 });
    }
    // previews show the brush at a size that fits the card
    const shown = { ...cloneBrush(b), size: Math.min(b.size, 14) };
    const rec: StrokeRecord = { id: 'preview', tool: this.app.tool === 'pen' ? 'pen' : 'brush', brush: shown, color: '#e8e8ee', seed: 7, points: pts };
    const len = strokeLength(pts);
    if (rec.tool === 'pen') drawVectorStroke(g, rec, len);
    else {
      this.engine.begin(rec);
      this.engine.addDabs(dabsForStroke(shown, 7, pts, len));
      g.drawImage(this.engine.displaySource(), 0, 0);
      this.engine.cancel();
    }
    return c;
  }
}

/** My brushes holds at most this many (kept on the device, in IndexedDB). */
const MINE_MAX = 600;

/** A picture (tip or grain) as a small PNG data URL, at most `max` px across; null if it will not decode. */
async function picDataUrl(tip: ImportedTip, max: number, invert = false): Promise<string | null> {
  try {
    let src: CanvasImageSource;
    let w: number, h: number;
    if (tip.kind === 'png') {
      const bmp = await createImageBitmap(new Blob([tip.bytes as BlobPart], { type: 'image/png' }));
      src = bmp;
      w = bmp.width;
      h = bmp.height;
    } else {
      // white where it paints: the alpha is the tip
      const c = document.createElement('canvas');
      c.width = tip.w;
      c.height = tip.h;
      const g = c.getContext('2d')!;
      const img = g.createImageData(tip.w, tip.h);
      for (let i = 0; i < tip.alpha.length; i++) {
        img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = 255;
        img.data[i * 4 + 3] = tip.alpha[i]!;
      }
      g.putImageData(img, 0, 0);
      src = c;
      w = tip.w;
      h = tip.h;
    }
    const k = Math.min(1, max / Math.max(w, h));
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w * k));
    out.height = Math.max(1, Math.round(h * k));
    const og = out.getContext('2d')!;
    og.drawImage(src, 0, 0, out.width, out.height);
    if (invert) {
      // Procreate's Invert: dark becomes light (an opaque picture reads its brightness)
      const d = og.getImageData(0, 0, out.width, out.height);
      for (let i = 0; i < d.data.length; i += 4) { d.data[i] = 255 - d.data[i]!; d.data[i + 1] = 255 - d.data[i + 1]!; d.data[i + 2] = 255 - d.data[i + 2]!; }
      og.putImageData(d, 0, 0);
    }
    return out.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** 2Dope brush settings for an imported brush: its tip and grain pictures on a plain base, plus what maps. */
function importedBrush(ib: ImportedBrush, tip: string | null, grain: string | null, taken: string[]): BrushSettings {
  const b = cloneBrush(PRESETS[0]!);
  b.name = uniqueName(ib.name, taken);
  if (tip) b.tipImage = tip;
  else delete b.tipImage;
  b.hardness = tip ? 1 : 0.85;
  b.roundness = ib.roundness ?? 1;
  b.angle = 0;
  b.followDirection = ib.follow ?? false;
  // the grain picture is the paper texture; its depth is how strongly it holds paint back
  if (grain) {
    b.grainImage = grain;
    b.grain = ib.grain?.depth ?? 0.8;
    b.grainScale = Math.max(0.1, Math.min(4, ib.grain?.scale ? ib.grain.scale * 2 : 1));
  } else {
    delete b.grainImage;
    b.grain = 0;
  }
  b.spacing = ib.spacing ?? 0.15;
  if (ib.size !== undefined) b.size = ib.size;
  if (ib.opacity !== undefined) b.opacity = ib.opacity;
  b.flow = 1;
  b.scatter = ib.scatter ?? 0;
  if (ib.pressureSize !== undefined) b.sizeDyn = { ...b.sizeDyn, control: ib.pressureSize > 0 ? 'pressure' : 'off', min: Math.max(0, 1 - ib.pressureSize) };
  if (ib.sizeJitter !== undefined) b.sizeDyn = { ...b.sizeDyn, jitter: ib.sizeJitter };
  if (ib.pressureOpacity !== undefined) b.opacityDyn = { ...b.opacityDyn, control: ib.pressureOpacity > 0 ? 'pressure' : 'off', min: Math.max(0, 1 - ib.pressureOpacity) };
  if (ib.opacityJitter !== undefined) b.opacityDyn = { ...b.opacityDyn, jitter: ib.opacityJitter };
  // tapers: a fraction of a long stroke, as document pixels
  if (ib.taperStart !== undefined) b.taperStart = Math.round(ib.taperStart * 160);
  if (ib.taperEnd !== undefined) b.taperEnd = Math.round(ib.taperEnd * 160);
  if (ib.smoothing !== undefined) b.smoothing = ib.smoothing;
  for (const k of ['hueJitter', 'satJitter', 'brightJitter', 'wetPull'] as const) if (ib[k] !== undefined) b[k] = ib[k];
  if (ib.strokeColor) b.strokeColor = true;
  return b;
}

