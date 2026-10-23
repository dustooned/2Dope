import type { App } from '../app';
import { compLength } from '../core/comp';
import { drawComp } from '../view/composite';
import { decorate } from './icons';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

const PLACE_KEY = '2dope.ref.place';
const MODE_KEY = '2dope.ref.mode';
type Mode = 'images' | 'canvas';

/**
 * Reference (Procreate style): a small floating window you can move and resize. Images shows the
 * pictures you load (several at once; ‹ › or a swipe steps through them; the dropper picks a
 * colour from them). Canvas shows the whole frame you are drawing, live, so you can see all of it
 * while you work zoomed in. The pictures stay for this session; they are not part of the project.
 */
export class ReferenceWindow {
  private readonly root = el('div', { class: 'refwin', role: 'dialog', 'aria-label': 'Reference', hidden: '' });
  private readonly view = el('canvas', { class: 'ref-view' });
  private readonly count = el('span', { class: 'ref-count' });
  private readonly hint = el('div', { class: 'ref-empty' });
  private readonly images: { name: string; bmp: ImageBitmap }[] = [];
  private at = 0;
  private mode: Mode = (() => { try { return localStorage.getItem(MODE_KEY) === 'canvas' ? 'canvas' : 'images'; } catch { return 'images'; } })();
  private dropper = false;
  private queued = false;
  private readonly file = el('input', { type: 'file', accept: 'image/*', multiple: '', hidden: '' });

  constructor(private readonly app: App) {
    const head = el('div', { class: 'ref-head' });
    const seg = el('div', { class: 'ref-seg', role: 'group', 'aria-label': 'What it shows' });
    for (const [m, label, title] of [['images', 'Images', 'Your reference pictures'], ['canvas', 'Canvas', 'The whole frame you are drawing, live']] as const) {
      const b = el('button', { type: 'button', 'data-mode': m, title }, label);
      decorate(b, m === 'images' ? 'image' : 'canvas');
      b.addEventListener('click', () => this.setMode(m));
      seg.append(b);
    }
    const btn = (label: string, title: string, run: () => void, icon?: string, cls = '') => {
      const b = el('button', { type: 'button', class: `ref-btn ${cls}`, title, 'aria-label': title }, label);
      if (icon) decorate(b, icon);
      b.addEventListener('click', run);
      return b;
    };
    const prev = btn('Previous picture', 'Previous picture (←)', () => this.step(-1), 'prev', 'ref-img');
    const next = btn('Next picture', 'Next picture (→)', () => this.step(1), 'next', 'ref-img');
    const add = btn('', 'Add pictures (you can pick several)', () => this.file.click(), 'plus', 'ref-img');
    const drop = btn('Eyedropper', 'Dropper: tap the picture to take its colour', () => { this.dropper = !this.dropper; this.sync(); }, 'eyedrop', 'ref-img ref-drop');
    const del = btn('', 'Remove this picture', () => this.remove(), 'trash', 'ref-img');
    const close = btn('Close', 'Close the reference', () => this.close(), 'close', 'ref-x');
    head.append(seg, prev, this.count, next, add, drop, del, close);
    const grip = el('div', { class: 'ref-grip', title: 'Drag to resize', 'aria-hidden': 'true' });
    const body = el('div', { class: 'ref-body' });
    body.append(this.view, this.hint);
    this.root.append(head, body, grip, this.file);
    document.body.append(this.root);
    this.file.addEventListener('change', () => { if (this.file.files) void this.add([...this.file.files]); this.file.value = ''; });
    this.wireMove(head);
    this.wireResize(grip);
    this.wireBody(body);
    window.addEventListener('keydown', (e) => {
      if (this.root.hidden || this.mode !== 'images' || !this.root.matches(':hover')) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.step(1); }
    });
    window.addEventListener('resize', () => this.clamp());
    this.restore();
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show();
  }

  show(): void {
    this.root.hidden = false;
    this.clamp();
    this.sync();
  }

  close(): void {
    this.root.hidden = true;
    this.dropper = false;
  }

  /** The canvas mode follows the drawing: call when the frame or the art changes. */
  refresh(): void {
    if (this.root.hidden || this.mode !== 'canvas' || this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => { this.queued = false; this.draw(); });
  }

  async add(files: File[]): Promise<void> {
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      try {
        // big photos are scaled down: the window is small, and memory matters on an iPad
        const probe = await createImageBitmap(f);
        const k = Math.min(1, 2048 / Math.max(probe.width, probe.height));
        const bmp = k < 1 ? await createImageBitmap(probe, { resizeWidth: Math.round(probe.width * k), resizeHeight: Math.round(probe.height * k), resizeQuality: 'high' }) : probe;
        if (bmp !== probe) probe.close();
        this.images.push({ name: f.name, bmp });
      } catch {
        this.app.onNotice?.(`“${f.name}” could not be opened as a picture.`);
      }
    }
    if (this.images.length) this.at = this.images.length - 1;
    this.setMode('images');
    this.show();
  }

  private remove(): void {
    const cur = this.images[this.at];
    if (!cur) return;
    cur.bmp.close();
    this.images.splice(this.at, 1);
    this.at = Math.max(0, Math.min(this.at, this.images.length - 1));
    this.sync();
  }

  private step(d: number): void {
    const n = this.images.length;
    if (n < 2) return;
    this.at = (this.at + d + n) % n;
    this.sync();
  }

  private setMode(m: Mode): void {
    this.mode = m;
    try { localStorage.setItem(MODE_KEY, m); } catch { /* optional */ }
    if (m === 'canvas') this.dropper = false;
    this.sync();
  }

  private sync(): void {
    const imgs = this.mode === 'images';
    this.root.classList.toggle('mode-images', imgs);
    this.root.classList.toggle('mode-canvas', !imgs);
    for (const b of this.root.querySelectorAll<HTMLElement>('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === this.mode));
    this.root.querySelector('.ref-drop')?.setAttribute('aria-pressed', String(this.dropper));
    this.root.classList.toggle('dropping', this.dropper);
    this.count.textContent = imgs && this.images.length ? `${this.at + 1} / ${this.images.length}` : '';
    const empty = imgs && !this.images.length;
    this.hint.hidden = !empty;
    this.hint.textContent = empty ? 'Tap + to add pictures, or drop them here. Add several and step through them with ‹ › or a swipe.' : '';
    this.draw();
  }

  /** Draw what the window shows, fitted inside it. */
  private draw(): void {
    if (this.root.hidden) return;
    const c = this.view;
    const box = c.parentElement!.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(box.width * dpr)), h = Math.max(1, Math.round(box.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const g = c.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    let sw: number, sh: number;
    if (this.mode === 'images') {
      const cur = this.images[this.at];
      if (!cur) return;
      sw = cur.bmp.width; sh = cur.bmp.height;
      const k = Math.min(w / sw, h / sh);
      g.imageSmoothingQuality = 'high';
      g.drawImage(cur.bmp, (w - sw * k) / 2, (h - sh * k) / 2, sw * k, sh * k);
      return;
    }
    // the whole frame (through the camera, as it will be seen)
    const p = this.app.project;
    const comp = p.comps.get(p.main) ?? p.comp;
    sw = comp.width; sh = comp.height;
    const k = Math.min(w / sw, h / sh);
    const ox = (w - sw * k) / 2, oy = (h - sh * k) / 2;
    g.fillStyle = comp.background ?? '#ffffff';
    g.fillRect(ox, oy, sw * k, sh * k);
    g.setTransform(k, 0, 0, k, ox, oy);
    try {
      drawComp(g, p, comp.id, Math.min(this.app.frame, Math.max(0, compLength(comp, p.comps) - 1)), { camera: true });
    } catch { /* a drawing still loading: the next refresh draws it */ }
  }

  /** Where the window is and how big (remembered). */
  private restore(): void {
    let place = { x: window.innerWidth - 330, y: 170, w: 300, h: 250 };
    try { const v = JSON.parse(localStorage.getItem(PLACE_KEY) ?? 'null'); if (v && Number.isFinite(v.x)) place = v; } catch { /* default */ }
    Object.assign(this.root.style, { left: `${place.x}px`, top: `${place.y}px`, width: `${place.w}px`, height: `${place.h}px` });
  }

  private save(): void {
    const r = this.root.getBoundingClientRect();
    try { localStorage.setItem(PLACE_KEY, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) })); } catch { /* optional */ }
  }

  /** Keep it on screen. */
  private clamp(): void {
    if (this.root.hidden) return;
    const r = this.root.getBoundingClientRect();
    const w = Math.min(r.width, window.innerWidth - 16), h = Math.min(r.height, window.innerHeight - 16);
    const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)), y = Math.max(8, Math.min(window.innerHeight - h - 8, r.top));
    Object.assign(this.root.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
  }

  private wireMove(head: HTMLElement): void {
    head.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      const r = this.root.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      head.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        Object.assign(this.root.style, { left: `${ev.clientX - dx}px`, top: `${ev.clientY - dy}px` });
      };
      const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); this.clamp(); this.save(); };
      head.addEventListener('pointermove', move);
      head.addEventListener('pointerup', up);
    });
  }

  private wireResize(grip: HTMLElement): void {
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = this.root.getBoundingClientRect();
      const x0 = e.clientX, y0 = e.clientY;
      grip.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        Object.assign(this.root.style, { width: `${Math.max(180, r.width + ev.clientX - x0)}px`, height: `${Math.max(150, r.height + ev.clientY - y0)}px` });
        this.draw();
      };
      const up = () => { grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); this.clamp(); this.save(); this.draw(); };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
    });
  }

  /** Swipe to step through pictures; with the dropper, tap to take a colour; drop files to add them. */
  private wireBody(body: HTMLElement): void {
    let s: { x: number; y: number } | null = null;
    body.addEventListener('pointerdown', (e) => { s = { x: e.clientX, y: e.clientY }; });
    body.addEventListener('pointerup', (e) => {
      const start = s;
      s = null;
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (this.mode === 'images' && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { this.step(dx < 0 ? 1 : -1); return; }
      if (this.dropper && Math.hypot(dx, dy) < 8) this.pick(e.clientX, e.clientY);
    });
    body.addEventListener('dragover', (e) => { e.preventDefault(); body.classList.add('over'); });
    body.addEventListener('dragleave', () => body.classList.remove('over'));
    body.addEventListener('drop', (e) => {
      e.preventDefault();
      body.classList.remove('over');
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length) void this.add(files);
    });
  }

  private pick(x: number, y: number): void {
    const r = this.view.getBoundingClientRect();
    const px = Math.round(((x - r.left) / r.width) * this.view.width), py = Math.round(((y - r.top) / r.height) * this.view.height);
    const d = this.view.getContext('2d')!.getImageData(px, py, 1, 1).data;
    if (!d[3]) return;
    const hex = `#${[d[0]!, d[1]!, d[2]!].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    this.app.setColor(hex);
    this.app.onNotice?.(`Colour picked: ${hex}`);
  }
}
