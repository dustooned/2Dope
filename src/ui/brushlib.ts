import { BrushImportError, readBrushFile, type ImportedBrush, type ImportedTip } from '../io/brushimport';
import { loadTip } from '../brush/raster';
import type { App } from '../app';
import { cloneBrush, PRESETS, type BrushSettings } from '../core/brush';
import { CATEGORIES, categoryOf, isBuiltIn, readBrush, uniqueName, type BrushCategory } from '../core/brushlib';
import type { StrokePoint, StrokeRecord } from '../core/stroke';
import { strokeLength } from '../core/stroke';
import { dabsForStroke } from '../brush/dabs';
import { RasterEngine } from '../brush/raster';
import { drawVectorStroke } from '../brush/vector';
import { attachContextMenu } from './contextmenu';
import { askText, confirmBox } from './dialogs';

const MINE_KEY = '2dope.brushes.mine';
const CAT_KEY = '2dope.brushes.category';
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
 * duplicate, rename or delete. Opens by tapping the active Brush / Vector / Eraser tool again.
 */
export class BrushLibrary {
  private readonly root = el('div', { class: 'brushlib', role: 'dialog', 'aria-label': 'Brush library', hidden: '' });
  private readonly cats = el('div', { class: 'bl-cats', role: 'tablist' });
  private readonly list = el('div', { class: 'bl-list', role: 'listbox', 'aria-label': 'Brushes' });
  private anchor: HTMLElement | null = null;
  private cat: BrushCategory;
  private mine: BrushSettings[];
  private readonly engine = new RasterEngine(PW, PH);
  private lastTap = { name: '', at: 0 };

  constructor(
    private readonly app: App,
    private readonly openStudio: () => void,
  ) {
    this.mine = this.loadMine();
    let c: BrushCategory = categoryOf(app.brush.name, this.mine);
    try {
      const saved = localStorage.getItem(CAT_KEY);
      if (CATEGORIES.some((x) => x.id === saved)) c = saved as BrushCategory;
    } catch {
      // default category
    }
    this.cat = c;
    const head = el('div', { class: 'bl-head' });
    const save = el('button', { type: 'button', class: 'primary', title: 'Save the brush you are using (with your changes) into My brushes' }, '＋ Save brush');
    save.addEventListener('click', () => void this.saveCurrent());
    const studio = el('button', { type: 'button', title: 'Every setting of this brush (Brush Studio)' }, '⚙ Studio');
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
    const imp = el('button', { type: 'button', title: 'Bring in brushes from Procreate (.brushset, .brush) or Photoshop (.abr)' }, '\u2913 Import');
    imp.addEventListener('click', () => picker.click());
    head.append(el('span', { class: 'bl-title' }, 'Brushes'), imp, studio, save, picker);
    const main = el('div', { class: 'bl-main' });
    main.append(this.cats, this.list);
    this.root.append(head, main, el('p', { class: 'hint bl-hint' }, 'Tap to use · double-tap for all settings · hold for more'));
    document.body.append(this.root);

    attachContextMenu(this.list, ({ target }) => {
      const card = (target as HTMLElement).closest<HTMLElement>('[data-name]');
      if (!card) return null;
      const name = card.dataset.name!;
      const b = this.find(name);
      if (!b) return null;
      const own = !isBuiltIn(name);
      return [
        { label: 'Use this brush', run: () => this.use(b) },
        { label: 'Open in Studio', run: () => this.studio(b) },
        { label: 'Duplicate', run: () => this.add({ ...cloneBrush(b), name: uniqueName(`${name} copy`, this.names()) }) },
        ...(own ? [{ label: 'Rename…', run: () => void this.rename(b) }, { sep: true as const }, { label: 'Delete', run: () => void this.remove(b), danger: true }] : []),
      ];
    });
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (this.root.hidden) return;
        const t = e.target as Node;
        if (this.root.contains(t) || this.anchor?.contains(t) || (t as HTMLElement).closest?.('.ctxmenu, dialog')) return;
        this.close();
      },
      true,
    );
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.root.hidden) this.close();
    });
    window.addEventListener('resize', () => this.place());
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(anchor: HTMLElement): void {
    if (this.open) return this.close();
    this.anchor = anchor;
    this.root.hidden = false;
    this.render();
    this.place();
  }

  close(): void {
    this.root.hidden = true;
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

  private loadMine(): BrushSettings[] {
    try {
      const raw = JSON.parse(localStorage.getItem(MINE_KEY) ?? '[]') as unknown[];
      const out: BrushSettings[] = [];
      for (const r of Array.isArray(raw) ? raw : []) {
        const b = readBrush(r);
        if (b && !isBuiltIn(b.name) && !out.some((x) => x.name === b.name)) out.push(b);
      }
      return out.slice(0, 200);
    } catch {
      return [];
    }
  }

  private saveMine(): void {
    try {
      localStorage.setItem(MINE_KEY, JSON.stringify(this.mine));
    } catch {
      this.app.onNotice?.('Could not save your brushes on this device (storage is full or blocked).');
    }
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

  /** Brushes from other apps into My brushes: each tip becomes a small picture tip. */
  private async importFiles(files: File[]): Promise<void> {
    let added = 0;
    const names: string[] = [];
    for (const f of files) {
      try {
        if (f.size > 64 * 1024 * 1024) throw new BrushImportError(`${f.name} is too large to bring in.`);
        const found = await readBrushFile(new Uint8Array(await f.arrayBuffer()), f.name);
        const room = Math.max(0, 200 - this.mine.length);
        for (const ib of found.slice(0, Math.min(IMPORT_MAX, room))) {
          const tip = await tipDataUrl(ib.tip);
          if (!tip) continue;
          const b = importedBrush(ib, tip, [...this.names(), ...names]);
          this.mine = [...this.mine, b];
          names.push(b.name);
          added++;
          void loadTip(tip);
        }
        if (found.length > IMPORT_MAX) this.app.onNotice?.(`${f.name} has ${found.length} brushes; the first ${IMPORT_MAX} came in.`);
      } catch (e) {
        this.app.onNotice?.(e instanceof BrushImportError ? e.message : `${f.name} could not be read as a brush file.`);
      }
    }
    if (!added) return;
    this.saveMine();
    this.cat = 'mine';
    this.render();
    this.app.onNotice?.(`${added} brush${added === 1 ? '' : 'es'} added to My brushes. Tips and the main settings come across; textures and special dynamics do not.`);
    setTimeout(() => this.render(), 300); // previews again once the tips have decoded
  }

  private add(b: BrushSettings): void {
    this.mine = [...this.mine, b];
    this.saveMine();
    this.cat = 'mine';
    this.use(b);
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
    if (this.app.brush.name === b.name) this.app.setBrush({ ...cloneBrush(this.app.brush), name: next });
    this.render();
  }

  private async remove(b: BrushSettings): Promise<void> {
    if (!(await confirmBox(`Delete “${b.name}”?`, 'It is removed from My brushes on this device. Drawings made with it are not changed.', 'Delete', true))) return;
    this.mine = this.mine.filter((x) => x.name !== b.name);
    this.saveMine();
    this.render();
  }

  private place(): void {
    const a = this.anchor;
    if (!a || this.root.hidden) return;
    const r = a.getBoundingClientRect();
    const w = Math.min(520, window.innerWidth - 16);
    this.root.style.width = `${w}px`;
    this.root.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    this.root.style.top = `${Math.min(r.bottom + 6, Math.max(8, window.innerHeight - this.root.offsetHeight - 8))}px`;
  }

  private render(): void {
    if (this.root.hidden) return;
    this.cats.replaceChildren(
      ...CATEGORIES.map((c) => {
        const count = this.all().filter((b) => categoryOf(b.name, this.mine) === c.id).length;
        const b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(c.id === this.cat) }, c.label);
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
    );
    const shown = this.all().filter((b) => categoryOf(b.name, this.mine) === this.cat);
    const cur = this.app.brush.name;
    this.list.replaceChildren(
      ...(shown.length
        ? shown.map((b) => {
            const card = el('button', { type: 'button', class: `bl-card${b.name === cur ? ' on' : ''}`, role: 'option', 'aria-selected': String(b.name === cur), 'data-name': b.name, title: b.name });
            card.append(this.preview(b), el('span', { class: 'bl-name' }, b.name));
            card.addEventListener('click', () => {
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

/** At most this many brushes from one file (they are kept on the device). */
const IMPORT_MAX = 60;

/** An imported tip as a small PNG data URL (fits the engine's 128 px tip), or null. */
async function tipDataUrl(tip: ImportedTip): Promise<string | null> {
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
    const k = Math.min(1, 128 / Math.max(w, h));
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w * k));
    out.height = Math.max(1, Math.round(h * k));
    out.getContext('2d')!.drawImage(src, 0, 0, out.width, out.height);
    return out.toDataURL('image/png');
  } catch {
    return null;
  }
}

/** 2Dope brush settings for an imported brush: a picture tip on a plain base, plus what maps. */
function importedBrush(ib: ImportedBrush, tip: string, taken: string[]): BrushSettings {
  const b = cloneBrush(PRESETS[0]!);
  b.name = uniqueName(ib.name, taken);
  b.tipImage = tip;
  b.hardness = 1;
  b.roundness = 1;
  b.angle = 0;
  b.grain = 0;
  b.spacing = ib.spacing ?? 0.15;
  if (ib.size !== undefined) b.size = ib.size;
  if (ib.opacity !== undefined) b.opacity = ib.opacity;
  b.flow = 1;
  b.scatter = ib.scatter ?? 0;
  if (ib.pressureSize !== undefined) b.sizeDyn = { ...b.sizeDyn, control: 'pressure', min: Math.max(0, 1 - ib.pressureSize) };
  return b;
}

