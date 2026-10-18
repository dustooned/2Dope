import type { App } from '../app';
import { BLEND_MODES, type BlendMode, type Layer } from '../core/comp';
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
  /** The card swiped left: its quick actions show. */
  private swiped: string | null = null;
  /** The + menu: animation, background or object layer. */
  private addOpen = false;
  private drag: { id: string; y0: number; x0: number; card: HTMLElement; ready: boolean; timer: number; pointer: number; moved: boolean } | null = null;

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

  /** The drawing a layer shows at the playhead (a still layer always shows its one drawing). */
  private shownDrawing(l: Layer): string | null {
    if (l.kind !== 'drawings') return null;
    const f = this.app.frame - l.start;
    if (l.still || l.play === 'loop') {
      const total = l.exposures.reduce((n, e) => n + e.length, 0) || 1;
      return drawingAt(l.exposures, ((f % total) + total) % total);
    }
    return drawingAt(l.exposures, f);
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
    const id = this.shownDrawing(l);
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
      const id = this.shownDrawing(l);
      return `${id}:${id ? app.project.drawings.get(id)?.thumbRev ?? '' : ''}`;
    });
    const sig = `${app.project.comp.id}|${active}|${app.plane}|${this.menuFor}|${this.addOpen}|${this.swiped}|${app.showLayers}|${app.otherAlpha}|${layers.map((l, i) => `${l.id}:${l.name}:${l.visible}:${l.locked}:${l.blend}:${this.app.editor.valueNow(l, 'opacity')}:${l.kind === 'drawings' ? `${l.cel ?? ''}${l.still ? 's' : ''}${l.clip ? 'c' : ''}${l.alphaLock ? 'a' : ''}` : ''}:${thumbs[i]}`).join(',')}`;
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
    const add = el('button', { type: 'button', class: 'lc-icon', title: 'New layer: animation, background or object', 'aria-label': 'New layer', 'aria-expanded': String(this.addOpen) }, 'Add');
    decorate(add, 'plus');
    add.addEventListener('click', () => { this.addOpen = !this.addOpen; this.sig = ''; this.update(); });
    head.append(others, add);
    this.root.append(head);
    if (this.addOpen) {
      const menu = el('div', { class: 'lc-options lc-add', role: 'group', 'aria-label': 'New layer' });
      const choice = (label: string, icon: string, title: string, fn: () => void) => {
        const b = el('button', { type: 'button', class: 'lc-opt', title }, label);
        decorate(b, icon);
        b.addEventListener('click', () => { fn(); this.addOpen = false; this.sig = ''; this.update(); });
        menu.append(b);
      };
      choice('Animation', 'flipbook', 'A layer you animate frame by frame', () => app.addDrawLayer());
      choice('Background', 'gallery', 'One drawing behind everything, for the whole shot', () => app.addStillLayer('background'));
      choice('Object', 'draw', 'One drawing above this layer, for the whole shot (a prop, a sign, a set piece)', () => app.addStillLayer('object'));
      choice('Media', 'gallery', 'Bring in a picture, movie or sound: each becomes its own layer from frame 1', () => app.pickMedia?.());
      this.root.append(menu);
    }

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
      if (l.kind === 'drawings' && l.still) tags.push('still');
      if (l.kind === 'drawings' && l.alphaLock) tags.push('alpha lock');
      if (l.blend !== 'normal') tags.push(l.blend);
      const op = Math.round(Number(this.app.editor.valueNow(l, 'opacity')));
      if (op < 100) tags.push(`${op}%`);
      if (l.locked) tags.push('locked');
      if (on && l.kind === 'drawings') tags.push(app.plane === 'fill' ? 'painting Fill' : 'painting Line');
      if (tags.length) info.append(el('span', { class: 'lc-tags' }, tags.join(' · ')));
      const eye = el('button', { type: 'button', class: 'lc-eye', 'aria-pressed': String(l.visible), title: l.visible ? 'Hide this layer' : 'Show this layer', 'aria-label': l.visible ? `Hide ${l.name}` : `Show ${l.name}` }, l.visible ? 'Hide' : 'Show');
      decorate(eye, 'eye');
      eye.addEventListener('pointerdown', (e) => e.stopPropagation());
      eye.addEventListener('click', (e) => { e.stopPropagation(); app.editor.setFlag(l.id, 'visible', !l.visible); this.update(); });
      if (linked) card.classList.add('linked');
      if (l.kind === 'drawings' && l.clip) card.classList.add('clipped');
      card.append(this.thumb(l), info, eye);
      this.bindCard(card, l, on);
      list.append(card);
      if (this.swiped === l.id) list.append(this.quick(l));
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
      this.drag = { id: l.id, y0: e.clientY, x0: e.clientX, card, ready: false, timer, pointer, moved: false };
    });
    card.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.pointer !== e.pointerId) return;
      const dy = e.clientY - d.y0;
      const dx = e.clientX - d.x0;
      if (!d.ready) {
        // a swipe left shows the quick actions (Procreate); moving up or down is a scroll of the list
        if (dx < -36 && Math.abs(dy) < 24 && !d.moved) {
          clearTimeout(d.timer);
          this.drag = null; // the swipe is done: let the list redraw with the actions showing
          this.swiped = this.swiped === l.id ? null : l.id;
          this.menuFor = null;
          this.sig = '';
          this.update();
          return;
        }
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

  /** Quick actions after a swipe left: Lock, Duplicate, Delete. */
  private quick(l: Layer): HTMLElement {
    const app = this.app;
    const box = el('div', { class: 'lc-options lc-quick', role: 'group', 'aria-label': `${l.name} quick actions` });
    const act = (label: string, icon: string, fn: () => void | Promise<void>, danger = false) => {
      const b = el('button', { type: 'button', class: `lc-opt${danger ? ' danger' : ''}`, title: label }, label);
      decorate(b, icon);
      b.addEventListener('click', () => void (async () => { await fn(); this.swiped = null; this.sig = ''; this.update(); })());
      box.append(b);
    };
    act(l.locked ? 'Unlock' : 'Lock', 'lock', () => app.editor.setFlag(l.id, 'locked', !l.locked));
    act('Duplicate', 'copy', () => app.duplicateLayer(l.id));
    act('Delete', 'trash', async () => {
      if (await confirmBox(`Delete \u201c${l.name}\u201d?`, 'You can undo this.', 'Delete', true)) app.editor.deleteLayers([l.id]);
    }, true);
    return box;
  }

  /** The options of the layer you draw on. */
  private options(l: Layer): HTMLElement {
    const app = this.app;
    const box = el('div', { class: 'lc-options', role: 'group', 'aria-label': `${l.name} options` });
    // opacity (applied when you let go: one undo step) and blend mode, like Procreate's layer N menu
    const opRow = el('label', { class: 'lc-row' });
    const op = el('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': 'Layer opacity' });
    op.value = String(Math.round(Number(app.editor.valueNow(l, 'opacity'))));
    const opOut = el('output', {}, `${op.value}%`);
    op.addEventListener('input', () => { opOut.textContent = `${op.value}%`; });
    op.addEventListener('change', () => { app.editor.setValue(l.id, 'opacity', Number(op.value), 'Layer opacity'); this.sig = ''; this.update(); });
    opRow.append(el('span', {}, 'Opacity'), op, opOut);
    const blRow = el('label', { class: 'lc-row' });
    const bl = el('select', { 'aria-label': 'Blend mode' });
    for (const m of BLEND_MODES) bl.append(el('option', { value: m }, m[0]!.toUpperCase() + m.slice(1)));
    bl.value = l.blend;
    bl.addEventListener('change', () => { app.editor.edit('Blend mode', (c) => { const x = c.layers.find((y) => y.id === l.id); if (x) x.blend = bl.value as BlendMode; }); this.sig = ''; this.update(); });
    blRow.append(el('span', {}, 'Blend'), bl);
    box.append(opRow, blRow);
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
    if (l.kind === 'drawings' && !l.guide) {
      const flag = (label: string, title: string, key: 'clip' | 'alphaLock') => {
        const on = l[key] === true;
        const b = el('button', { type: 'button', class: `lc-opt${on ? ' on' : ''}`, title, 'aria-pressed': String(on) }, label);
        b.addEventListener('click', () => {
          app.editor.edit(on ? `${label} off` : label, (c) => { const x = c.layers.find((y) => y.id === l.id); if (x && x.kind === 'drawings') { if (on) delete x[key]; else x[key] = true; } });
          this.sig = '';
          this.update();
        });
        box.append(b);
      };
      flag('Clipping mask', 'Show this layer only where the layer below has paint', 'clip');
      flag('Alpha Lock', 'Brushes change only pixels that already have paint', 'alphaLock');
    }
    if (l.kind === 'drawings' && !l.guide) opt('Merge down', 'collapseall', 'Flatten this layer into the one below (same frames and placement)', async () => { if (await app.mergeDown(l.id)) { this.menuFor = null; } this.sig = ''; this.update(); });
    opt('Duplicate', 'copy', 'A copy of this layer above it, with its own drawings', async () => { await app.duplicateLayer(l.id); this.menuFor = null; this.sig = ''; this.update(); });
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
