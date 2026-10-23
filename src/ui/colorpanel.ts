import type { App } from '../app';
import { harmony, HARMONY_MODES, hexToHsv, hsvToHex, normalizeHex, paletteFromPixels, pushRecent, type HarmonyMode, type HSV } from '../core/color';
import { attachContextMenu, showContextMenu, type CtxItem } from './contextmenu';
import { askText, confirmBox } from './dialogs';
import { decorate } from './icons';

const RECENT_KEY = '2dope.color.recent';
const PALETTE_KEY = '2dope.color.palette';
const MODE_KEY = '2dope.color.mode';
const PALETTES_KEY = '2dope.color.palettes';
const PALETTE_AT_KEY = '2dope.color.paletteAt';
const HARMONY_KEY = '2dope.color.harmony';

interface Palette {
  name: string;
  colors: string[];
}

/** A starter palette: inks, skin, warm and cool, greys. */
const BASICS = [
  '#000000',
  '#3a3a44',
  '#7a7a86',
  '#b8b8c2',
  '#ffffff',
  '#f2d7c4',
  '#e0a98c',
  '#a8674a',
  '#5c3a2a',
  '#ff5a8a',
  '#e63946',
  '#f4a261',
  '#f6d860',
  '#8ac926',
  '#2a9d8f',
  '#3a86ff',
  '#264653',
  '#7b2cbf',
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function load<T>(key: string, fallback: T): T {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // not remembered: fine
  }
}

type Mode = 'disc' | 'values';

/**
 * The colour panel (Procreate Dreams style), opened from the colour circle: a hue ring around a
 * saturation / brightness square, or H / S / B sliders with a hex box; the colour before and
 * now; recent colours; and a palette you add to (hold a swatch to remove it). Changes apply live.
 */
export class ColorPanel {
  private readonly root = el('div', { class: 'colorpop', role: 'dialog', 'aria-label': 'Colour', hidden: '' });
  private anchor: HTMLElement | null = null;
  private anchorParent: HTMLElement | null = null;
  private anchorLabel: string | null = null;
  private readonly done = el('button', { type: 'button', class: 'cp-done', 'aria-label': 'Done choosing colour', title: 'Keep this colour and return to drawing' }, 'Done');
  private hsv: HSV = { h: 0, s: 0, v: 0 };
  private before = '#000000';
  private mode: Mode = load<Mode>(MODE_KEY, 'disc') === 'values' ? 'values' : 'disc';
  private recent: string[] = load<string[]>(RECENT_KEY, []).filter((c) => !!normalizeHex(c));
  /** Named palettes (Procreate): the first is Basics; the old single palette became "My palette". */
  private palettes: Palette[] = (() => {
    const saved = load<Palette[] | null>(PALETTES_KEY, null);
    if (Array.isArray(saved) && saved.length) return saved.filter((x) => x && typeof x.name === 'string' && Array.isArray(x.colors)).map((x) => ({ name: x.name.slice(0, 40), colors: x.colors.filter((c) => !!normalizeHex(c)).slice(0, 60) }));
    const old = load<string[] | null>(PALETTE_KEY, null);
    return [{ name: 'Basics', colors: [...BASICS] }, ...(old && old.join() !== BASICS.join() ? [{ name: 'My palette', colors: old }] : [])];
  })();
  private paletteAt = Math.max(0, Math.min(this.palettes.length - 1, load<number>(PALETTE_AT_KEY, 0)));
  private harmonyMode: HarmonyMode = load<HarmonyMode>(HARMONY_KEY, 'complementary');
  private readonly paletteSel = el('select', { class: 'cp-palsel', 'aria-label': 'Palette' });
  private readonly harmonyRow = el('div', { class: 'cp-swatches', 'aria-label': 'Harmony' });
  private readonly harmonySel = el('select', { class: 'cp-palsel', 'aria-label': 'Harmony' });

  private get palette(): string[] {
    return this.palettes[this.paletteAt]?.colors ?? [];
  }

  private set palette(colors: string[]) {
    const pal = this.palettes[this.paletteAt];
    if (pal) pal.colors = colors;
    this.savePalettes();
  }

  private savePalettes(): void {
    save(PALETTES_KEY, this.palettes);
    save(PALETTE_AT_KEY, this.paletteAt);
  }

  private readonly disc = el('canvas', { class: 'cp-disc', width: '440', height: '440', 'aria-label': 'Hue ring and saturation / brightness square' });
  private readonly values = el('div', { class: 'cp-values' });
  private readonly sliders: Record<'h' | 's' | 'v', HTMLInputElement> = {
    h: el('input', { type: 'range', min: '0', max: '360', step: '1', 'aria-label': 'Hue' }),
    s: el('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': 'Saturation' }),
    v: el('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': 'Brightness' }),
  };
  private readonly hex = el('input', { type: 'text', class: 'cp-hex', maxlength: '7', spellcheck: 'false', 'aria-label': 'Hex colour' });
  private readonly was = el('button', { type: 'button', class: 'cp-was', title: 'The colour before: tap to go back to it' });
  private readonly now = el('span', { class: 'cp-now' });
  private readonly recentRow = el('div', { class: 'cp-swatches', 'aria-label': 'Recent colours' });
  private readonly paletteRow = el('div', { class: 'cp-swatches cp-palette', 'aria-label': 'Palette' });
  private readonly tabs: HTMLButtonElement[] = [];
  private drag: 'ring' | 'square' | null = null;

  constructor(
    private readonly app: App,
    private readonly systemPicker: HTMLInputElement,
  ) {
    const titlebar = el('div', { class: 'cp-titlebar' });
    decorate(this.done, 'check');
    this.done.addEventListener('click', () => this.close(true));
    titlebar.append(el('strong', {}, 'Colour'), this.done);
    const head = el('div', { class: 'cp-head' });
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Picker' });
    for (const [m, label] of [
      ['disc', 'Disc'],
      ['values', 'Values'],
    ] as const) {
      const b = el('button', { type: 'button' }, label);
      b.addEventListener('click', () => {
        this.mode = m;
        save(MODE_KEY, m);
        this.render();
      });
      this.tabs.push(b);
      seg.append(b);
    }
    const sys = el('button', { type: 'button', title: 'The system colour picker (eyedropper on some devices)' }, 'System…');
    sys.addEventListener('click', () => {
      const p = this.systemPicker as HTMLInputElement & { showPicker?: () => void };
      if (p.showPicker) p.showPicker();
      else p.click();
    });
    const pair = el('div', { class: 'cp-pair' });
    pair.append(this.was, this.now);
    head.append(pair, seg, sys);

    for (const k of ['h', 's', 'v'] as const) {
      const row = el('label', { class: 'cp-slider' });
      row.append(el('span', {}, k === 'h' ? 'H' : k === 's' ? 'S' : 'B'), this.sliders[k]);
      this.sliders[k].addEventListener('input', () => {
        const n = Number(this.sliders[k].value);
        this.hsv = { ...this.hsv, [k]: k === 'h' ? n : n / 100 };
        this.apply();
      });
      this.sliders[k].addEventListener('change', () => this.remember());
      this.values.append(row);
    }
    const hexRow = el('label', { class: 'cp-slider' });
    hexRow.append(el('span', {}, '#'), this.hex);
    this.hex.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') this.hex.blur();
    });
    this.hex.addEventListener('change', () => {
      const c = normalizeHex(this.hex.value);
      if (c) {
        this.hsv = hexToHsv(c);
        this.apply();
        this.remember();
      } else this.hex.value = this.app.color;
    });
    this.values.append(hexRow);

    this.was.addEventListener('click', () => this.pick(this.before));
    this.disc.addEventListener('pointerdown', (e) => this.discDown(e));
    this.disc.addEventListener('pointermove', (e) => this.discMove(e));
    this.disc.addEventListener('pointerup', () => this.discUp());
    this.disc.addEventListener('pointercancel', () => this.discUp());

    const add = el('button', { type: 'button', class: 'cp-add', title: 'Add this colour to the palette' }, '+');
    add.addEventListener('click', () => {
      if (!this.palette.includes(this.app.color)) this.palette = [...this.palette, this.app.color].slice(-60);
      this.renderSwatches();
    });
    // palettes: pick one, make a new one (empty or from a picture), rename or delete it
    this.paletteSel.addEventListener('change', () => { this.paletteAt = Number(this.paletteSel.value); this.savePalettes(); this.renderSwatches(); });
    const picFile = el('input', { type: 'file', accept: 'image/*', hidden: '' });
    picFile.addEventListener('change', () => void (async () => {
      const f = picFile.files?.[0];
      picFile.value = '';
      if (!f) return;
      try {
        const bmp = await createImageBitmap(f);
        const k = Math.min(1, 160 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(bmp.width * k));
        c.height = Math.max(1, Math.round(bmp.height * k));
        c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
        const colors = paletteFromPixels(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data, 12);
        if (!colors.length) throw new Error('empty');
        this.palettes.push({ name: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'From picture', colors });
        this.paletteAt = this.palettes.length - 1;
        this.savePalettes();
        this.renderSwatches();
      } catch {
        this.app.onNotice?.('That picture could not be read.');
      }
    })());
    const palMenu = el('button', { type: 'button', class: 'cp-palbtn', title: 'New, from a picture, rename or delete a palette', 'aria-label': 'Palette options' }, '\u22ef');
    const palItems = (): CtxItem[] => [
      { label: 'New palette', run: () => void (async () => { const n = await askText('Palette name', `Palette ${this.palettes.length + 1}`, 'Create'); if (n === null) return; this.palettes.push({ name: n.slice(0, 40) || 'Palette', colors: [] }); this.paletteAt = this.palettes.length - 1; this.savePalettes(); this.renderSwatches(); })() },
      { label: 'New from picture\u2026', run: () => picFile.click() },
      { label: 'Rename palette', run: () => void (async () => { const pal = this.palettes[this.paletteAt]; if (!pal) return; const n = await askText('Palette name', pal.name, 'Rename'); if (n === null) return; pal.name = n.slice(0, 40) || pal.name; this.savePalettes(); this.renderSwatches(); })() },
      ...(this.palettes.length > 1 ? [{ label: 'Delete palette', danger: true, run: () => void (async () => { const pal = this.palettes[this.paletteAt]; if (!pal || !(await confirmBox(`Delete \u201c${pal.name}\u201d?`, 'Its colours are removed from this device.', 'Delete', true))) return; this.palettes.splice(this.paletteAt, 1); this.paletteAt = Math.max(0, this.paletteAt - 1); this.savePalettes(); this.renderSwatches(); })() }] : []),
    ];
    palMenu.addEventListener('click', () => { const r = palMenu.getBoundingClientRect(); showContextMenu(r.left, r.bottom + 4, palItems()); });
    const palHead = el('div', { class: 'cp-palhead' });
    palHead.append(this.paletteSel, palMenu, picFile);
    // harmony: colours that go with this one
    for (const m of HARMONY_MODES) this.harmonySel.append(el('option', { value: m.id }, m.label));
    this.harmonySel.value = this.harmonyMode;
    this.harmonySel.addEventListener('change', () => { this.harmonyMode = this.harmonySel.value as HarmonyMode; save(HARMONY_KEY, this.harmonyMode); this.renderSwatches(); });
    const harmHead = el('div', { class: 'cp-palhead' });
    harmHead.append(el('span', { class: 'cp-label' }, 'Harmony'), this.harmonySel);
    attachContextMenu(this.paletteRow, ({ target }) => {
      const s = (target as HTMLElement).closest<HTMLElement>('[data-c]');
      if (!s) return null;
      const c = s.dataset.c!;
      return [
        { label: 'Use this colour', run: () => this.pick(c) },
        {
          label: 'Remove from palette',
          run: () => {
            this.palette = this.palette.filter((x) => x !== c);
            this.renderSwatches();
          },
        },
        {
          label: 'Reset to Basics',
          run: () => {
            this.palette = [...BASICS];
            this.renderSwatches();
          },
        },
      ];
    });

    const body = el('div', { class: 'cp-body' });
    body.append(head, this.disc, this.values, harmHead, this.harmonyRow, el('div', { class: 'cp-label' }, 'Recent'), this.recentRow, palHead, this.paletteRow, add);
    this.root.append(titlebar, body);
    document.body.append(this.root);
    // tapping elsewhere closes it (not the circle that opened it, which toggles)
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
    // Disc/Values and new Recent rows change the panel height after it has opened.
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
    this.before = this.app.color;
    this.hsv = hexToHsv(this.app.color);
    this.root.hidden = false;
    this.render();
    this.place();
    this.done.focus({ preventScroll: true });
  }

  close(returnToCanvas = false): void {
    if (this.root.hidden) return;
    this.drag = null;
    this.root.hidden = true;
    this.remember();
    if (returnToCanvas) this.app.focusCanvas();
  }

  /** The app's colour changed elsewhere (eyedropper, system picker): follow it. */
  sync(): void {
    if (this.root.hidden || this.drag) return;
    if (hsvToHex(this.hsv) !== this.app.color) this.hsv = hexToHsv(this.app.color);
    this.render();
  }

  private pick(c: string): void {
    this.hsv = hexToHsv(c);
    this.apply();
    this.remember();
  }

  private apply(): void {
    const c = hsvToHex(this.hsv);
    if (c !== this.app.color) this.app.setColor(c);
    this.render();
  }

  /** Put the colour in Recent once a choice is made (not on every move). */
  private remember(): void {
    const next = pushRecent(this.recent, this.app.color);
    if (next.join() === this.recent.join()) return;
    this.recent = next;
    save(RECENT_KEY, next);
    this.renderSwatches();
  }

  private place(): void {
    const a = this.currentAnchor();
    if (!a || this.root.hidden) return;
    const r = a.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 16);
    this.root.style.width = `${w}px`;
    this.root.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))}px`;
    const h = this.root.offsetHeight;
    this.root.style.top = `${Math.max(8, Math.min(r.bottom + 6, window.innerHeight - h - 8))}px`;
  }

  /** Toolbars rebuild their colour button after a colour change; its parent stays in place. */
  private currentAnchor(): HTMLElement | null {
    if (this.anchor?.isConnected) return this.anchor;
    if (!this.anchorParent?.isConnected || !this.anchorLabel) return null;
    return [...this.anchorParent.children].find((e): e is HTMLElement => e instanceof HTMLElement && e.getAttribute('aria-label') === this.anchorLabel) ?? null;
  }

  private render(): void {
    if (this.root.hidden) return;
    const c = hsvToHex(this.hsv);
    this.tabs.forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0 ? 'disc' : 'values') === this.mode)));
    this.disc.hidden = this.mode !== 'disc';
    this.values.hidden = this.mode !== 'values';
    this.was.style.background = this.before;
    this.now.style.background = c;
    if (this.mode === 'disc') this.drawDisc();
    else {
      this.sliders.h.value = String(Math.round(this.hsv.h));
      this.sliders.s.value = String(Math.round(this.hsv.s * 100));
      this.sliders.v.value = String(Math.round(this.hsv.v * 100));
      const { h, s, v } = this.hsv;
      this.sliders.h.style.background = `linear-gradient(90deg, ${[0, 60, 120, 180, 240, 300, 360].map((x) => hsvToHex({ h: x, s: Math.max(s, 0.6), v: Math.max(v, 0.6) })).join(',')})`;
      this.sliders.s.style.background = `linear-gradient(90deg, ${hsvToHex({ h, s: 0, v })}, ${hsvToHex({ h, s: 1, v })})`;
      this.sliders.v.style.background = `linear-gradient(90deg, #000000, ${hsvToHex({ h, s, v: 1 })})`;
      if (document.activeElement !== this.hex) this.hex.value = c;
    }
    this.renderSwatches();
  }

  private renderSwatches(): void {
    const cur = this.app.color;
    const fill = (row: HTMLElement, list: string[], what: string) => {
      const sig = list.join() + cur;
      if (row.dataset.sig === sig) return;
      row.dataset.sig = sig;
      row.replaceChildren(
        ...list.map((c) => {
          const b = el('button', { type: 'button', class: `cp-sw${c === cur ? ' on' : ''}`, 'data-c': c, title: `${what} ${c}`, 'aria-label': `${what} ${c}` });
          b.style.background = c;
          b.addEventListener('click', () => this.pick(c));
          return b;
        }),
      );
    };
    fill(this.recentRow, this.recent, 'Recent colour');
    fill(this.paletteRow, this.palette, 'Palette colour');
    fill(this.harmonyRow, harmony(cur, this.harmonyMode), 'Harmony colour');
    const names = this.palettes.map((x) => x.name).join('|') + this.paletteAt;
    if (this.paletteSel.dataset.sig !== names) {
      this.paletteSel.dataset.sig = names;
      this.paletteSel.replaceChildren(...this.palettes.map((x, i) => el('option', { value: String(i) }, `${x.name} (${x.colors.length})`)));
      this.paletteSel.value = String(this.paletteAt);
    }
  }

  // the disc: an outer hue ring and a saturation (→) / brightness (↑) square inside it
  private geom() {
    const W = this.disc.width;
    const c = W / 2;
    const outer = c - 4;
    const inner = outer - 40;
    const half = (inner - 10) / Math.SQRT2;
    return { W, c, outer, inner, half };
  }

  private drawDisc(): void {
    const g = this.disc.getContext('2d');
    if (!g) return;
    const { W, c, outer, inner, half } = this.geom();
    g.clearRect(0, 0, W, W);
    // hue ring
    for (let a = 0; a < 360; a += 1) {
      g.beginPath();
      g.strokeStyle = hsvToHex({ h: a, s: 1, v: 1 });
      g.lineWidth = outer - inner;
      const r0 = ((a - 90 - 0.7) * Math.PI) / 180;
      const r1 = ((a - 90 + 0.7) * Math.PI) / 180;
      g.arc(c, c, (outer + inner) / 2, r0, r1);
      g.stroke();
    }
    // saturation / brightness square for this hue
    const x0 = c - half;
    const y0 = c - half;
    const s = half * 2;
    g.fillStyle = hsvToHex({ h: this.hsv.h, s: 1, v: 1 });
    g.fillRect(x0, y0, s, s);
    const white = g.createLinearGradient(x0, 0, x0 + s, 0);
    white.addColorStop(0, '#ffffff');
    white.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = white;
    g.fillRect(x0, y0, s, s);
    const black = g.createLinearGradient(0, y0, 0, y0 + s);
    black.addColorStop(0, 'rgba(0,0,0,0)');
    black.addColorStop(1, '#000000');
    g.fillStyle = black;
    g.fillRect(x0, y0, s, s);
    // markers
    const ring = ((this.hsv.h - 90) * Math.PI) / 180;
    const ringR = (outer + inner) / 2;
    const mark = (x: number, y: number, r: number) => {
      g.lineWidth = 4;
      g.strokeStyle = '#000000';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
      g.lineWidth = 2;
      g.strokeStyle = '#ffffff';
      g.stroke();
    };
    mark(c + Math.cos(ring) * ringR, c + Math.sin(ring) * ringR, 14);
    mark(x0 + this.hsv.s * s, y0 + (1 - this.hsv.v) * s, 10);
  }

  private discPoint(e: PointerEvent): { x: number; y: number } {
    const r = this.disc.getBoundingClientRect();
    const k = this.disc.width / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k };
  }

  private discDown(e: PointerEvent): void {
    const { c, inner, half } = this.geom();
    const p = this.discPoint(e);
    const d = Math.hypot(p.x - c, p.y - c);
    if (d >= inner - 4) this.drag = 'ring';
    else if (Math.abs(p.x - c) <= half + 8 && Math.abs(p.y - c) <= half + 8) this.drag = 'square';
    else return;
    try {
      this.disc.setPointerCapture(e.pointerId);
    } catch {
      // a pointer the browser no longer tracks: the drag still works while over the disc
    }
    e.preventDefault();
    this.discMove(e);
  }

  private discMove(e: PointerEvent): void {
    if (!this.drag) return;
    const { c, half } = this.geom();
    const p = this.discPoint(e);
    if (this.drag === 'ring') {
      const h = (Math.atan2(p.y - c, p.x - c) * 180) / Math.PI + 90;
      this.hsv = { ...this.hsv, h: (h + 360) % 360 };
    } else {
      const clamp = (n: number) => Math.max(0, Math.min(1, n));
      this.hsv = { ...this.hsv, s: clamp((p.x - (c - half)) / (2 * half)), v: clamp(1 - (p.y - (c - half)) / (2 * half)) };
    }
    this.apply();
  }

  private discUp(): void {
    if (!this.drag) return;
    this.drag = null;
    this.remember();
  }
}
