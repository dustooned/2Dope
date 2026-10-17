import type { App } from '../app';
import type { Layer } from '../core/comp';
import { drawingAt } from '../core/timeline';
import { askText, confirmBox } from './dialogs';
import { decorate } from './icons';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

const THUMB_W = 72;
const THUMB_H = 48;
/** Hold this long before a card can be dragged to a new place (a quick tap just picks it). */
const HOLD_MS = 280;

/**
 * Layer cards (Procreate style) for Draw: one card per layer, front on top, each with a thumbnail of
 * the frame on screen, its name and an eye. Tap a card to draw on it; tap the one you draw on for its
 * options; hold a card and drag it to reorder; + adds a layer. Linked art layers are marked. Every
 * change goes through the comp editor, so it is undoable.
 */
export class LayerCards {
  private readonly root = el('div', { class: 'layercards', role: 'dialog', 'aria-label': 'Layers', hidden: '' });
  private anchor: HTMLElement | null = null;
  private sig = '';
  private menuFor: string | null = null;
  private drag: { id: string; y0: number; card: HTMLElement; ready: boolean; timer: number; pointer: number; moved: boolean } | null = null;

  constructor(private readonly app: App) {
    document.body.append(this.root);
    window.addEventListener('pointerdown', (e) => {
      if (this.root.hidden) return;
      const t = e.target as Node;
      if (this.root.contains(t) || this.anchor?.contains(t)) return;
      this.close();
    }, true);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.root.hidden) this.close(); });
    window.addEventListener('resize', () => this.place());
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(anchor: HTMLElement): void {
    if (this.open && this.anchor === anchor) return this.close();
    this.anchor = anchor;
    this.root.hidden = false;
    this.menuFor = null;
    this.sig = '';
    this.update();
    this.place();
  }

  close(): void {
    this.root.hidden = true;
    this.menuFor = null;
  }

  private place(): void {
    const a = this.anchor;
    if (!a || this.root.hidden) return;
    const r = a.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 16);
    this.root.style.width = `${w}px`;
    this.root.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))}px`;
    this.root.style.top = `${Math.min(r.bottom + 8, window.innerHeight - 160)}px`;
    this.root.style.maxHeight = `${Math.max(160, window.innerHeight - (r.bottom + 8) - 12)}px`;
  }

  private thumb(l: Layer): HTMLCanvasElement {
    const c = el('canvas', { width: String(THUMB_W * 2), height: String(THUMB_H * 2), class: 'lc-thumb' });
    const g = c.getContext('2d');
    if (!g) return c;
    // a light checkerboard shows what is see-through
    const s = 12;
    for (let y = 0; y < c.height; y += s) for (let x = 0; x < c.width; x += s) {
      g.fillStyle = ((x + y) / s) % 2 ? '#e9e9ee' : '#ffffff';
      g.fillRect(x, y, s, s);
    }
    if (l.kind !== 'drawings') return c;
    const id = drawingAt(l.exposures, this.app.frame - l.start);
    const d = id ? this.app.project.drawings.get(id) : undefined;
    const t = d?.thumb;
    if (t) {
      const k = Math.min(c.width / t.width, c.height / t.height);
      g.drawImage(t, (c.width - t.width * k) / 2, (c.height - t.height * k) / 2, t.width * k, t.height * k);
    }
    return c;
  }

  /** Rebuild when something shown changed (cheap; only while open). */
  update(): void {
    if (this.root.hidden || this.drag) return;
    const app = this.app;
    const layers = app.project.comp.layers.filter((l) => l.kind === 'drawings' || l.kind === 'comp');
    const active = app.project.isPlaceholder ? '' : app.project.activeLayer;
    // options belong to the layer you draw on; picking another closes them
    if (this.menuFor && this.menuFor !== active) this.menuFor = null;
    const thumbs = layers.map((l) => {
      if (l.kind !== 'drawings') return '';
      const id = drawingAt(l.exposures, app.frame - l.start);
      return `${id}:${id ? app.project.drawings.get(id)?.thumbRev ?? '' : ''}`;
    });
    const sig = `${app.project.comp.id}|${active}|${app.plane}|${this.menuFor}|${app.showLayers}|${app.otherAlpha}|${layers.map((l, i) => `${l.id}:${l.name}:${l.visible}:${l.locked}:${l.kind === 'drawings' ? l.cel ?? '' : ''}:${thumbs[i]}`).join(',')}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.root.replaceChildren();

    const head = el('div', { class: 'lc-head' });
    head.append(el('span', { class: 'lc-title' }, 'Layers'));
    const others = el('button', { type: 'button', class: 'lc-icon', title: 'Other layers: show, fade or hide while you draw', 'aria-label': 'Other layers' }, 'Others');
    decorate(others, 'eye');
    others.dataset.state = !app.showLayers ? 'hide' : app.otherAlpha < 0.99 ? 'fade' : 'show';
    others.addEventListener('click', () => {
      // show -> fade -> hide -> show
      if (!app.showLayers) app.setShowLayers(true, 1);
      else if (app.otherAlpha > 0.99) app.setShowLayers(true, 0.4);
      else app.setShowLayers(false, app.otherAlpha);
      this.update();
    });
    const add = el('button', { type: 'button', class: 'lc-icon', title: 'New layer above the one you draw on', 'aria-label': 'New layer' }, 'Add');
    decorate(add, 'plus');
    add.addEventListener('click', () => { app.addDrawLayer(); this.update(); });
    head.append(others, add);
    this.root.append(head);

    const list = el('div', { class: 'lc-list', role: 'listbox', 'aria-label': 'Layers' });
    for (const l of layers) {
      const on = l.id === active;
      const card = el('div', { class: `lc-card${on ? ' on' : ''}${l.visible ? '' : ' off'}`, role: 'option', 'aria-selected': String(on), tabindex: '0' });
      card.dataset.id = l.id;
      const linked = l.kind === 'drawings' && !!l.cel;
      const info = el('div', { class: 'lc-info' });
      info.append(el('span', { class: 'lc-name' }, l.name));
      const tags: string[] = [];
      if (l.kind === 'comp') tags.push('group');
      if (l.kind === 'drawings' && l.guide) tags.push('board');
      if (linked) tags.push('linked');
      if (l.locked) tags.push('locked');
      if (on && l.kind === 'drawings') tags.push(app.plane === 'fill' ? 'painting Fill' : 'painting Line');
      if (tags.length) info.append(el('span', { class: 'lc-tags' }, tags.join(' · ')));
      const eye = el('button', { type: 'button', class: 'lc-eye', 'aria-pressed': String(l.visible), title: l.visible ? 'Hide this layer' : 'Show this layer', 'aria-label': l.visible ? `Hide ${l.name}` : `Show ${l.name}` }, l.visible ? 'Hide' : 'Show');
      decorate(eye, 'eye');
      eye.addEventListener('pointerdown', (e) => e.stopPropagation());
      eye.addEventListener('click', (e) => { e.stopPropagation(); app.editor.setFlag(l.id, 'visible', !l.visible); this.update(); });
      if (linked) card.classList.add('linked');
      card.append(this.thumb(l), info, eye);
      this.bindCard(card, l, on);
      list.append(card);
      if (this.menuFor === l.id) list.append(this.options(l));
    }
    if (!layers.length) list.append(el('p', { class: 'hint' }, 'No layers yet. Draw, or tap +.'));
    this.root.append(list);
    this.place();
  }

  /** Tap: draw on it (or open its options if it is already the one). Hold, then drag: reorder. */
  private bindCard(card: HTMLElement, l: Layer, on: boolean): void {
    card.addEventListener('pointerdown', (e) => {
      if (this.app.strokeActive) return;
      const pointer = e.pointerId;
      const timer = window.setTimeout(() => {
        if (this.drag && this.drag.pointer === pointer && !this.drag.moved) {
          this.drag.ready = true;
          card.classList.add('lifting');
          try { card.setPointerCapture(pointer); } catch { /* synthetic */ }
        }
      }, HOLD_MS);
      this.drag = { id: l.id, y0: e.clientY, card, ready: false, timer, pointer, moved: false };
    });
    card.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.pointer !== e.pointerId) return;
      const dy = e.clientY - d.y0;
      if (!d.ready) {
        // moving before the hold is a scroll of the list, not a drag
        if (Math.abs(dy) > 8) { d.moved = true; clearTimeout(d.timer); }
        return;
      }
      e.preventDefault();
      d.card.style.transform = `translateY(${dy}px)`;
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      const d = this.drag;
      if (!d || d.pointer !== e.pointerId) return;
      clearTimeout(d.timer);
      this.drag = null;
      d.card.classList.remove('lifting');
      d.card.style.transform = '';
      if (cancelled) return this.update();
      if (d.ready) {
        // drop: move by however many cards the finger travelled
        const h = d.card.getBoundingClientRect().height + 6;
        const steps = Math.round((e.clientY - d.y0) / h);
        if (steps) this.app.editor.reorder(l.id, steps);
        this.sig = '';
        this.update();
        return;
      }
      if (d.moved) return;
      if (l.kind === 'comp') {
        this.close();
        this.app.editor.enter(l.id);
        return;
      }
      if (on) this.menuFor = this.menuFor === l.id ? null : l.id;
      else { this.menuFor = null; this.app.pickLayer(l.id); }
      this.sig = '';
      this.update();
    };
    card.addEventListener('pointerup', (e) => end(e, false));
    card.addEventListener('pointercancel', (e) => end(e, true));
  }

  /** The options of the layer you draw on. */
  private options(l: Layer): HTMLElement {
    const app = this.app;
    const box = el('div', { class: 'lc-options', role: 'group', 'aria-label': `${l.name} options` });
    const opt = (label: string, icon: string, title: string, fn: () => void | Promise<void>, danger = false) => {
      const b = el('button', { type: 'button', class: `lc-opt${danger ? ' danger' : ''}`, title }, label);
      decorate(b, icon);
      b.addEventListener('click', () => void fn());
      box.append(b);
    };
    if (l.kind === 'drawings' && !l.guide) {
      opt(app.plane === 'line' ? 'Paint Fill' : 'Paint Line', app.plane === 'line' ? 'fillplane' : 'lineplane', 'Switch what brushes paint on: LINE (ink, on top) or FILL (colour, under)', () => { app.setPlane(app.plane === 'line' ? 'fill' : 'line'); this.sig = ''; this.update(); });
      opt('Art layer', 'plus', 'A linked art layer: the same frames and timing, its own drawing', () => { app.addCelLayer(); this.menuFor = null; this.sig = ''; this.update(); });
    }
    opt('Rename', 'draw', 'Rename this layer', async () => {
      const n = await askText('Layer name', l.name, 'Rename');
      if (n !== null) app.editor.rename(l.id, n);
      this.sig = '';
      this.update();
    });
    opt(l.locked ? 'Unlock' : 'Lock', 'lock', l.locked ? 'Allow drawing on it again' : 'Stop drawing on it', () => { app.editor.setFlag(l.id, 'locked', !l.locked); this.update(); });
    opt('Delete', 'trash', 'Delete this layer (you can undo)', async () => {
      if (!(await confirmBox(`Delete “${l.name}”?`, 'You can undo this.', 'Delete', true))) return;
      app.editor.deleteLayers([l.id]);
      this.menuFor = null;
      this.sig = '';
      this.update();
    }, true);
    return box;
  }
}
