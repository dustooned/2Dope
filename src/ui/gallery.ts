import { storageEstimate, type FolderRecord, type ProjectMeta } from '../io/persist';
import type { NewProjectUI } from './newdialog';
import { askText, confirmBox, pickBox } from './dialogs';
import type { FileUI } from './files';

const SORT_KEY = '2dope.m2.sort';

type Sort = 'modified' | 'name' | 'created' | 'opened';
const SORTS: [Sort, string][] = [
  ['modified', 'Recently changed'],
  ['opened', 'Recently opened'],
  ['created', 'Newest first'],
  ['name', 'Name'],
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function ago(t: number): string {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.round(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString();
}

function bytes(n: number): string {
  if (n < 1024 * 1024 * 1024) return `${Math.max(1, Math.round(n / 1024 / 1024))} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

interface MenuItem {
  label: string;
  run: () => void | Promise<void>;
  danger?: boolean;
}

/**
 * The project gallery (Procreate Dreams calls it the Theater): every project on this device as a
 * card with its picture, sorted into folders. Tap to open. Press and hold a project, then drag it
 * onto a folder (or the Projects crumb to take it out). ⋯ opens the card's menu; Select works on
 * several at once.
 */
export class Gallery {
  private folder: string | null = null;
  private selecting = false;
  private readonly picked = new Set<string>();
  private sort: Sort = 'modified';
  private urls: string[] = [];
  private isOpen = false;
  private menu: HTMLElement | null = null;
  private drag: { id: string; ghost: HTMLElement; hover: HTMLElement | null } | null = null;
  private renderToken = 0;

  constructor(
    private readonly files: FileUI,
    private readonly newUI: NewProjectUI,
    private readonly root: HTMLElement,
  ) {
    try {
      const s = localStorage.getItem(SORT_KEY);
      if (SORTS.some(([k]) => k === s)) this.sort = s as Sort;
    } catch {
      // default sort
    }
    files.onLibraryChanged = () => {
      if (this.isOpen) void this.render();
    };
    files.onOpened = () => this.close();
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen && !this.menu && !document.querySelector('dialog[open]')) this.close();
    });
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (this.menu && !this.menu.contains(e.target as Node) && !(e.target as HTMLElement).closest('.more')) this.closeMenu();
      },
      true,
    );
    // While a card is being dragged, the page must not scroll under the finger.
    document.addEventListener('touchmove', (e) => this.drag && e.cancelable && e.preventDefault(), { passive: false });
  }

  get visible(): boolean {
    return this.isOpen;
  }

  async open(): Promise<void> {
    this.isOpen = true;
    this.root.hidden = false;
    document.body.classList.add('gallery-open');
    this.selecting = false;
    this.picked.clear();
    await this.render();
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.hidden = true;
    document.body.classList.remove('gallery-open');
    this.closeMenu();
    this.revoke();
    this.root.replaceChildren();
  }

  private revoke(): void {
    for (const u of this.urls) URL.revokeObjectURL(u);
    this.urls = [];
  }

  private url(png: Uint8Array | null): string | null {
    if (!png) return null;
    const u = URL.createObjectURL(new Blob([png as BlobPart], { type: 'image/png' }));
    this.urls.push(u);
    return u;
  }

  // -------------------------------------------------------------------------------------------

  private async render(): Promise<void> {
    const token = ++this.renderToken;
    const [all, folders] = await Promise.all([this.files.store.listProjects(), this.files.store.listFolders()]);
    if (token !== this.renderToken || !this.isOpen) return;
    folders.sort((a, b) => a.name.localeCompare(b.name));
    if (this.folder && !folders.some((f) => f.id === this.folder)) this.folder = null;
    for (const id of [...this.picked]) if (!all.some((p) => p.id === id)) this.picked.delete(id);
    this.revoke();
    this.root.replaceChildren(this.header(folders), this.grid(all, folders), this.footer());
    void this.fillStorage();
  }

  private sorted(list: ProjectMeta[]): ProjectMeta[] {
    const by: Record<Sort, (a: ProjectMeta, b: ProjectMeta) => number> = {
      modified: (a, b) => b.modified - a.modified,
      opened: (a, b) => b.opened - a.opened,
      created: (a, b) => b.created - a.created,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return [...list].sort(by[this.sort]);
  }

  private header(folders: FolderRecord[]): HTMLElement {
    const h = el('header', { class: 'ghead' });
    const back = el('button', { type: 'button', class: 'gback', title: 'Back to drawing (Esc)' }, '← Drawing');
    back.addEventListener('click', () => this.close());

    const crumbs = el('nav', { class: 'gcrumbs', 'aria-label': 'Folder' });
    const home = el('button', { type: 'button', class: 'crumb', 'data-drop': '' }, 'Projects');
    home.setAttribute('aria-current', String(this.folder === null));
    home.addEventListener('click', () => {
      this.folder = null;
      void this.render();
    });
    crumbs.append(home);
    const cur = folders.find((f) => f.id === this.folder);
    if (cur) {
      crumbs.append(el('span', { class: 'sep' }, '›'));
      const c = el('button', { type: 'button', class: 'crumb', 'aria-current': 'true', 'data-drop': cur.id }, cur.name);
      crumbs.append(c);
    }

    const sort = el('select', { 'aria-label': 'Sort', title: 'Sort projects' });
    for (const [k, label] of SORTS) sort.append(el('option', { value: k }, label));
    sort.value = this.sort;
    sort.addEventListener('change', () => {
      this.sort = sort.value as Sort;
      try {
        localStorage.setItem(SORT_KEY, this.sort);
      } catch {
        // not remembered: fine
      }
      void this.render();
    });

    const select = el('button', { type: 'button', 'aria-pressed': String(this.selecting), title: 'Pick several projects to move, copy or delete' }, this.selecting ? 'Done' : 'Select');
    select.addEventListener('click', () => {
      this.selecting = !this.selecting;
      this.picked.clear();
      void this.render();
    });

    const folderBtn = el('button', { type: 'button', title: 'Make a folder' }, 'New folder');
    folderBtn.addEventListener('click', async () => {
      const name = await askText('New folder', 'New folder', 'Create');
      if (name !== null) await this.files.newFolder(name);
    });

    const imp = el('button', { type: 'button', title: 'Bring a .2dope file into your projects' }, 'Import');
    imp.addEventListener('click', () => document.querySelector<HTMLInputElement>('#openfile')?.click());

    const add = el('button', { type: 'button', class: 'primary' }, '+ New project');
    add.addEventListener('click', () => void this.createNew());

    h.append(back, crumbs, el('span', { class: 'spacer' }), sort, select, folderBtn, imp, add);
    return h;
  }

  private async createNew(): Promise<void> {
    const opts = await this.newUI.open(this.folder);
    if (!opts) return;
    await this.files.newProject(opts);
  }

  private grid(all: ProjectMeta[], folders: FolderRecord[]): HTMLElement {
    const grid = el('main', { class: 'ggrid' });
    const known = new Set(folders.map((f) => f.id));
    const inView = all.filter((p) => (this.folder ? p.folder === this.folder : !p.folder || !known.has(p.folder)));
    if (!this.folder) for (const f of folders) grid.append(this.folderCard(f, this.sorted(all.filter((p) => p.folder === f.id))));
    for (const p of this.sorted(inView)) grid.append(this.projectCard(p, folders));
    if (!grid.children.length) {
      const empty = el('div', { class: 'gempty' });
      empty.append(el('p', {}, this.folder ? 'This folder is empty.' : 'No projects yet.'), el('p', { class: 'hint' }, 'Tap + New project to start one. Press and hold a project, then drag it onto a folder to file it.'));
      grid.append(empty);
    }
    return grid;
  }

  private thumbBox(png: Uint8Array | null): HTMLElement {
    const box = el('div', { class: 'gthumb' });
    const u = this.url(png);
    if (u) box.append(el('img', { src: u, alt: '' }));
    return box;
  }

  private folderCard(f: FolderRecord, items: ProjectMeta[]): HTMLElement {
    const card = el('div', { class: 'gcard folder', 'data-drop': f.id, role: 'button', tabindex: '0', 'aria-label': `Folder ${f.name}` });
    const box = el('div', { class: 'gthumb collage' });
    for (const p of items.slice(0, 4)) {
      const u = this.url(p.thumb);
      const cell = el('span', {});
      if (u) cell.append(el('img', { src: u, alt: '' }));
      box.append(cell);
    }
    if (!items.length) box.append(el('span', { class: 'folderglyph' }, '📁'));
    card.append(box);
    const body = el('div', { class: 'gbody' });
    body.append(el('strong', {}, f.name), el('span', { class: 'hint' }, `${items.length} project${items.length === 1 ? '' : 's'}`));
    card.append(body, this.moreButton(f.name, () => this.folderMenu(f, items)));
    const enter = () => {
      this.folder = f.id;
      void this.render();
    };
    card.addEventListener('click', (e) => {
      if (!(e.target as HTMLElement).closest('.more')) enter();
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') enter();
    });
    return card;
  }

  private projectCard(p: ProjectMeta, folders: FolderRecord[]): HTMLElement {
    const open = this.files.current?.id === p.id;
    const sel = this.picked.has(p.id);
    const card = el('div', { class: `gcard${open ? ' open' : ''}${sel ? ' picked' : ''}`, 'data-id': p.id, role: 'button', tabindex: '0', 'aria-label': p.name });
    card.append(this.thumbBox(p.thumb));
    if (this.selecting) card.append(el('span', { class: 'check' }, sel ? '✓' : ''));
    const body = el('div', { class: 'gbody' });
    body.append(
      el('strong', {}, p.name + (open ? ' · open' : '')),
      el('span', { class: 'hint' }, `${p.frames} frame${p.frames === 1 ? '' : 's'} · ${p.width}×${p.height} · ${p.fps} fps`),
      el('span', { class: 'hint' }, ago(p.modified)),
    );
    card.append(body, this.moreButton(p.name, () => this.projectMenu(p, folders)));
    const act = () => {
      if (this.selecting) {
        if (this.picked.has(p.id)) this.picked.delete(p.id);
        else this.picked.add(p.id);
        card.classList.toggle('picked', this.picked.has(p.id));
        const chk = card.querySelector('.check');
        if (chk) chk.textContent = this.picked.has(p.id) ? '✓' : '';
        this.updateFooter();
      } else if (open) this.close();
      else void this.files.openProject(p.id);
    };
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') act();
    });
    this.bindDrag(card, p, act);
    return card;
  }

  private moreButton(name: string, items: () => MenuItem[]): HTMLElement {
    const b = el('button', { type: 'button', class: 'more', 'aria-label': `More for ${name}`, 'aria-haspopup': 'true' }, '⋯');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showMenu(b, items());
    });
    return b;
  }

  // -------------------------------------------------------------------------------------------
  // Menus

  private closeMenu(): void {
    this.menu?.remove();
    this.menu = null;
  }

  private showMenu(anchor: HTMLElement, items: MenuItem[]): void {
    this.closeMenu();
    const m = el('div', { class: 'gmenu', role: 'menu' });
    for (const it of items) {
      const b = el('button', { type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '' }, it.label);
      b.addEventListener('click', async () => {
        this.closeMenu();
        await it.run();
      });
      m.append(b);
    }
    this.root.append(m);
    const r = anchor.getBoundingClientRect();
    const rr = this.root.getBoundingClientRect();
    const w = 200;
    m.style.left = `${Math.max(8, Math.min(rr.width - w - 8, r.right - rr.left - w))}px`;
    const below = r.bottom - rr.top + 4;
    m.style.top = `${Math.min(below, Math.max(8, rr.height - 8 - items.length * 44))}px`;
    this.menu = m;
  }

  private projectMenu(p: ProjectMeta, folders: FolderRecord[]): MenuItem[] {
    return [
      { label: 'Open', run: () => void this.files.openProject(p.id) },
      { label: 'Rename', run: () => this.rename(p) },
      { label: 'Move to…', run: () => this.moveTo([p.id], folders) },
      { label: 'Duplicate', run: () => this.files.duplicateProject(p.id) },
      { label: 'Export .2dope', run: () => this.files.exportStored(p.id) },
      { label: 'Delete', run: () => this.remove([p.id]), danger: true },
    ];
  }

  private folderMenu(f: FolderRecord, items: ProjectMeta[]): MenuItem[] {
    return [
      {
        label: 'Rename',
        run: async () => {
          const name = await askText('Folder name', f.name, 'Rename');
          if (name !== null) await this.files.renameFolder(f, name);
        },
      },
      {
        label: 'Remove folder',
        danger: true,
        run: async () => {
          const msg = items.length ? `The ${items.length} project${items.length === 1 ? '' : 's'} inside move back to Projects. Nothing is deleted.` : 'The folder is empty.';
          if (await confirmBox(`Remove “${f.name}”?`, msg, 'Remove folder', true)) await this.files.deleteFolder(f.id);
        },
      },
    ];
  }

  private async rename(p: ProjectMeta): Promise<void> {
    const name = await askText('Project name', p.name, 'Rename');
    if (name !== null) await this.files.renameProject(p.id, name);
  }

  private async moveTo(ids: string[], folders: FolderRecord[]): Promise<void> {
    const choice = await pickBox<string | null>(
      ids.length === 1 ? 'Move to' : `Move ${ids.length} projects to`,
      [{ label: 'Projects (no folder)', value: null }, ...folders.map((f) => ({ label: `📁 ${f.name}`, value: f.id as string | null }))],
      {
        label: 'New folder…',
        run: async () => {
          const name = await askText('New folder', 'New folder', 'Create');
          return name === null ? undefined : (await this.files.newFolder(name)).id;
        },
      },
    );
    if (choice === undefined) return;
    for (const id of ids) await this.files.moveProject(id, choice);
    this.picked.clear();
  }

  private async remove(ids: string[]): Promise<void> {
    const names = (await Promise.all(ids.map((id) => this.files.store.getProject(id)))).map((m) => m?.name ?? '?');
    const what = ids.length === 1 ? `“${names[0]}”` : `${ids.length} projects`;
    const ok = await confirmBox(`Delete ${what}?`, 'This removes the project and its versions from this device. Export a .2dope first if you want to keep a copy.', 'Delete', true);
    if (!ok) return;
    for (const id of ids) await this.files.deleteProject(id);
    this.picked.clear();
  }

  // -------------------------------------------------------------------------------------------
  // Drag a project onto a folder

  private bindDrag(card: HTMLElement, p: ProjectMeta, tap: () => void): void {
    let timer: number | null = null;
    let start = { x: 0, y: 0 };
    let pointerId = -1;
    let moved = false;

    const cancel = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const begin = (x: number, y: number) => {
      cancel();
      this.closeMenu();
      const ghost = card.cloneNode(true) as HTMLElement;
      ghost.classList.add('ghost');
      ghost.style.width = `${card.offsetWidth}px`;
      this.root.append(ghost);
      this.drag = { id: p.id, ghost, hover: null };
      card.classList.add('dragging');
      this.root.classList.add('dragging');
      try {
        card.setPointerCapture(pointerId);
      } catch {
        // synthetic pointers cannot be captured
      }
      place(x, y);
    };
    const place = (x: number, y: number) => {
      const d = this.drag;
      if (!d) return;
      d.ghost.style.left = `${x - 40}px`;
      d.ghost.style.top = `${y - 30}px`;
      d.ghost.style.pointerEvents = 'none';
      const under = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop]') ?? null;
      if (d.hover !== under) {
        d.hover?.classList.remove('drop-hover');
        under?.classList.add('drop-hover');
        d.hover = under;
      }
    };
    const end = async (drop: boolean) => {
      cancel();
      const d = this.drag;
      this.drag = null;
      card.classList.remove('dragging');
      this.root.classList.remove('dragging');
      if (!d) return;
      d.ghost.remove();
      d.hover?.classList.remove('drop-hover');
      if (drop && d.hover) {
        const target = d.hover.dataset.drop || null;
        await this.files.moveProject(d.id, target);
      }
    };

    card.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.more') || e.button > 0) return;
      pointerId = e.pointerId;
      start = { x: e.clientX, y: e.clientY };
      moved = false;
      if (this.selecting) return;
      // touch and pen: press and hold; mouse: a short drag
      if (e.pointerType !== 'mouse') timer = window.setTimeout(() => begin(e.clientX, e.clientY), 380);
    });
    card.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pointerId) return;
      if (this.drag) {
        place(e.clientX, e.clientY);
        return;
      }
      const dist = Math.hypot(e.clientX - start.x, e.clientY - start.y);
      if (dist > 8) {
        moved = true;
        if (e.pointerType === 'mouse' && !this.selecting && e.buttons === 1) begin(e.clientX, e.clientY);
        else cancel();
      }
    });
    card.addEventListener('pointerup', (e) => {
      if (e.pointerId !== pointerId) return;
      if (this.drag) {
        void end(true);
        return;
      }
      cancel();
      if (!moved && !(e.target as HTMLElement).closest('.more')) tap();
    });
    card.addEventListener('pointercancel', () => void end(false));
    card.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // -------------------------------------------------------------------------------------------

  private footer(): HTMLElement {
    const f = el('footer', { class: 'gfoot' });
    f.append(el('span', { class: 'hint gstorage' }), el('span', { class: 'spacer' }));
    const bar = el('div', { class: 'gselbar', hidden: '' });
    const label = el('span', { class: 'gsel' });
    const mk = (text: string, fn: () => Promise<void> | void, cls = '') => {
      const b = el('button', { type: 'button', class: cls }, text);
      b.addEventListener('click', () => void fn());
      return b;
    };
    bar.append(
      label,
      mk('Move…', async () => this.moveTo([...this.picked], await this.files.store.listFolders())),
      mk('Duplicate', async () => {
        for (const id of [...this.picked]) await this.files.duplicateProject(id);
        this.picked.clear();
      }),
      mk('Delete', () => this.remove([...this.picked]), 'danger'),
    );
    f.append(bar);
    queueMicrotask(() => this.updateFooter());
    return f;
  }

  private updateFooter(): void {
    const bar = this.root.querySelector<HTMLElement>('.gselbar');
    if (!bar) return;
    bar.hidden = !this.selecting;
    const label = bar.querySelector('.gsel');
    if (label) label.textContent = this.picked.size ? `${this.picked.size} selected` : 'Tap projects to select them';
    for (const b of bar.querySelectorAll('button')) b.disabled = this.picked.size === 0;
  }

  private async fillStorage(): Promise<void> {
    const e = await storageEstimate();
    const t = this.root.querySelector('.gstorage');
    if (t && e) t.textContent = `${bytes(e.used)} of ${bytes(e.quota)} used on this device`;
  }
}
