import type { App } from '../app';
import { BLEND_MODES, partOf, type BlendMode, type DrawingsLayer, type Layer, type PartName } from '../core/comp';
import type { PropKey } from '../compedit';
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
  /** Groups folded open in the list (view state only). */
  private openGroups = new Set<string>();
  /** A two-finger tap on this card (Procreate: the layer's opacity and options). */
  private twoTap: string | null = null;
  /**
   * Layers picked with the one you draw on (Procreate: swipe a layer right to add it). Group, Merge,
   * Hide, Duplicate and Delete then work on all of them; Motion sees the same selection.
   */
  private readonly picked = new Set<string>();
  /** Paint / art layer stacks folded shut (by stack id). */
  private readonly foldedStacks = new Set<string>();

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

  /** The selection: the layer you draw on first, then the picked ones (in stack order). */
  private selection(): string[] {
    const layers = this.app.project.comp.layers;
    const active = this.app.project.isPlaceholder ? '' : this.app.project.activeLayer;
    for (const id of [...this.picked]) if (!layers.some((l) => l.id === id) || id === active) this.picked.delete(id);
    const ids = layers.filter((l) => l.id === active || this.picked.has(l.id)).map((l) => l.id);
    return ids;
  }

  private togglePick(id: string): void {
    const active = this.app.project.isPlaceholder ? '' : this.app.project.activeLayer;
    if (id === active) return;
    if (this.picked.has(id)) this.picked.delete(id);
    else this.picked.add(id);
    // Motion works on the same layers
    const ed = this.app.editor;
    // the one you draw on goes last: the editor's main layer is its last selected one
    ed.select(null);
    for (const x of this.picked) ed.select(x, true);
    if (active) ed.select(active, true);
    this.menuFor = null;
    this.swiped = null;
    this.sig = '';
    this.update();
  }

  private clearPicks(): void {
    this.picked.clear();
    this.sig = '';
    this.update();
  }

  /** Linked art layers come along with a layer, so cels stay in step. */
  private withCels(ids: string[]): string[] {
    const layers = this.app.project.comp.layers;
    const out = new Set<string>();
    for (const id of ids) {
      const x = layers.find((l) => l.id === id);
      if (x && x.kind === 'drawings' && x.cel) for (const y of layers) { if (y.kind === 'drawings' && y.cel === x.cel) out.add(y.id); }
      else out.add(id);
    }
    return [...out];
  }

  /** The bar over the list while several layers are picked. */
  private batchBar(ids: string[]): HTMLElement {
    const app = this.app;
    const bar = el('div', { class: 'lc-batch', role: 'toolbar', 'aria-label': 'Selected layers' });
    const top = el('div', { class: 'lc-batch-top' });
    top.append(el('span', { class: 'lc-batch-n' }, `${ids.length} selected`));
    bar.append(top);
    const act = (label: string, icon: string, title: string, fn: () => void | Promise<void>, danger = false) => {
      const b = el('button', { type: 'button', class: `lc-opt${danger ? ' danger' : ''}`, title }, label);
      decorate(b, icon);
      b.addEventListener('click', () => void (async () => { await fn(); this.sig = ''; this.update(); })());
      bar.append(b);
    };
    act('Group', 'layers', 'Put the selected layers in a group (a folder)', () => {
      const made = app.editor.group(this.withCels(ids), 'Group');
      if (made) { this.openGroups.add(made); this.picked.clear(); }
    });
    act('Merge', 'collapseall', 'Merge the selected layers into one (they must sit next to each other, with the same frames and placement)', async () => {
      const layers = app.project.comp.layers;
      const idx = ids.map((id) => layers.findIndex((l) => l.id === id)).sort((a, b) => a - b);
      if (idx.some((v, k) => k > 0 && v !== idx[k - 1]! + 1)) { app.onNotice?.('Merge needs the selected layers next to each other. Drag them together first.'); return; }
      const order = idx.map((i) => layers[i]!.id);
      // top down: each merges into the one under it
      for (const id of order.slice(0, -1)) if (!(await app.mergeDown(id))) return;
      this.picked.clear();
    });
    const allShown = ids.every((id) => app.project.comp.layers.find((l) => l.id === id)?.visible);
    act(allShown ? 'Hide' : 'Show', 'eye', allShown ? 'Hide the selected layers' : 'Show the selected layers', () => {
      app.editor.edit(allShown ? 'Hide layers' : 'Show layers', (c) => { for (const l of c.layers) if (ids.includes(l.id)) l.visible = !allShown; });
      app.requestRender();
    });
    act('Duplicate', 'copy', 'Duplicate the selected layers', async () => { for (const id of ids) await app.duplicateLayer(id); });
    act('Delete', 'trash', 'Delete the selected layers', async () => {
      if (await confirmBox(`Delete ${ids.length} layers?`, 'You can undo this.', 'Delete', true)) { app.editor.deleteLayers(ids); this.picked.clear(); }
    }, true);
    const done = el('button', { type: 'button', class: 'lc-icon lc-batch-x', title: 'Clear the selection', 'aria-label': 'Clear the selection' }, '\u2715');
    done.addEventListener('click', () => this.clearPicks());
    top.append(done);
    return bar;
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
  private shownDrawing(l: Layer, offset = 0): string | null {
    if (l.kind !== 'drawings') return null;
    const f = this.app.frame - offset - l.start;
    if (l.still || l.play === 'loop') {
      const total = l.exposures.reduce((n, e) => n + e.length, 0) || 1;
      return drawingAt(l.exposures, ((f % total) + total) % total);
    }
    return drawingAt(l.exposures, f);
  }

  private thumb(l: Layer, offset = 0): HTMLCanvasElement {
    const c = el('canvas', { width: String(THUMB_W * 2), height: String(THUMB_H * 2), class: 'lc-thumb' });
    const g = c.getContext('2d');
    if (!g) return c;
    // a light checkerboard shows what is see-through
    const s = 12;
    for (let y = 0; y < c.height; y += s) for (let x = 0; x < c.width; x += s) {
      g.fillStyle = ((x + y) / s) % 2 ? '#e9e9ee' : '#ffffff';
      g.fillRect(x, y, s, s);
    }
    if (l.kind === 'comp') {
      // a group: its front-most drawing layer stands for it (on the group's clock)
      const inner = this.app.project.comps.get(l.comp)?.layers.find((x) => x.kind === 'drawings');
      if (!inner) return c;
      offset += l.start;
      l = inner;
    }
    if (l.kind !== 'drawings') return c;
    const id = this.shownDrawing(l, offset);
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
    if (this.menuFor && this.menuFor !== active && !layers.some((l) => l.id === this.menuFor && l.kind === 'comp')) this.menuFor = null;
    const me = layers.find((l) => l.id === active);
    const parts = me && me.kind === 'drawings' ? ['line', 'fill'].map((pt) => { const q = partOf(me, pt as PartName); return `${q.visible}:${app.editor.valueNow(me, `${pt}.opacity` as PropKey)}`; }).join('/') : '';
    const groupSig = [...this.openGroups].map((g) => { const gl = layers.find((l) => l.id === g); const inner = gl && gl.kind === 'comp' ? app.project.comps.get(gl.comp) : undefined; return inner ? inner.layers.map((x) => `${x.id}:${x.name}:${x.visible}:${x.kind === 'drawings' ? this.shownDrawing(x, gl!.start) : ''}`).join(';') : ''; }).join('|');
    const thumbs = layers.map((l) => {
      if (l.kind !== 'drawings') return '';
      const id = this.shownDrawing(l);
      return `${id}:${id ? app.project.drawings.get(id)?.thumbRev ?? '' : ''}`;
    });
    const sig = `${app.editor.crumbs().length}|${parts}|${groupSig}|${app.project.comp.id}|${active}|${app.plane}|${this.menuFor}|${this.addOpen}|${this.swiped}|${[...this.picked].join('+')}|${[...this.foldedStacks].join('+')}|${app.showLayers}|${app.otherAlpha}|${layers.map((l, i) => `${l.id}:${l.name}:${l.visible}:${l.locked}:${l.blend}:${this.app.editor.valueNow(l, 'opacity')}:${l.kind === 'drawings' ? `${l.cel ?? ''}${l.still ? 's' : ''}${l.clip ? 'c' : ''}${l.alphaLock ? 'a' : ''}${l.reference ? 'r' : ''}${l.mask ? `m${app.editingMask ? 'e' : ''}` : ''}` : ''}:${thumbs[i]}`).join(',')}`;
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
    const crumbs = app.editor.crumbs();
    if (crumbs.length > 1) {
      const back = el('button', { type: 'button', class: 'lc-back', title: 'Back out of this group' }, `\u2039 ${crumbs[crumbs.length - 2]!.comp.name}`);
      back.append(el('span', { class: 'lc-back-in' }, ` \u00b7 in ${crumbs[crumbs.length - 1]!.comp.name}`));
      back.addEventListener('click', () => { if (!app.strokeActive) { app.editor.exit(); this.menuFor = null; this.sig = ''; this.update(); } });
      this.root.append(back);
    }
    if (this.addOpen) {
      const menu = el('div', { class: 'lc-options lc-add', role: 'group', 'aria-label': 'New layer' });
      const choice = (label: string, icon: string, title: string, fn: () => void) => {
        const b = el('button', { type: 'button', class: 'lc-opt', title }, label);
        decorate(b, icon);
        b.addEventListener('click', () => { fn(); this.addOpen = false; this.sig = ''; this.update(); });
        menu.append(b);
      };
      // in Flip (the flipbook) a new layer is part of every page: same frames, its own drawing
      choice('Animation', 'flipbook', 'A layer you animate frame by frame (a new track in the flipbook)', () => app.addDrawLayer());
      choice('Background', 'gallery', 'One drawing behind everything, for the whole shot', () => app.addStillLayer('background'));
      choice('Object', 'draw', 'One drawing above this layer, for the whole shot (a prop, a sign, a set piece)', () => app.addStillLayer('object'));
      choice('Media', 'gallery', 'Bring in a picture, movie or sound: each becomes its own layer from frame 1', () => app.pickMedia?.());
      this.root.append(menu);
    }

    const sel = this.selection();
    if (sel.length > 1) this.root.append(this.batchBar(sel));
    else this.root.append(el('p', { class: 'hint lc-swipe-hint' }, 'Swipe a layer right to select more (then group or merge); left for quick actions; hold to drag.'));
    const list = el('div', { class: 'lc-list', role: 'listbox', 'aria-label': 'Layers', 'aria-multiselectable': 'true' });
    for (const l of layers) {
      const on = l.id === active;
      // linked layers (a background's paint layers, a drawing's art layers) are one stack
      // (a still layer from before stacks is a stack of one: adding to it links them the same way)
      const stackOf = (x: Layer) => (x.kind === 'drawings' ? (x.cel ?? (x.still ? x.id : null)) : null);
      const stackId = stackOf(l);
      const members = stackId ? layers.filter((x): x is DrawingsLayer => x.kind === 'drawings' && stackOf(x) === stackId) : [];
      const inStack = !!stackId && (members.length > 1 || (l.kind === 'drawings' && !!l.still));
      if (inStack && members[0] === l) list.append(this.stackHeader(stackId!, members, active));
      if (inStack && this.foldedStacks.has(stackId!) && !members.some((m) => m.id === active)) continue;
      const pick = this.picked.has(l.id);
      const card = el('div', { class: `lc-card${on ? ' on' : ''}${pick ? ' picked' : ''}${l.visible ? '' : ' off'}`, role: 'option', 'aria-selected': String(on || pick), tabindex: '0' });
      card.dataset.id = l.id;
      const linked = l.kind === 'drawings' && !!l.cel;
      const info = el('div', { class: 'lc-info' });
      info.append(el('span', { class: 'lc-name' }, l.name));
      const tags: string[] = [];
      if (l.kind === 'comp') tags.push(`group \u00b7 ${app.project.comps.get(l.comp)?.layers.length ?? 0} layers`);
      if (l.kind === 'drawings' && l.guide) tags.push('board');
      if (linked && !inStack) tags.push('linked');
      if (l.kind === 'drawings' && l.still) tags.push('still');
      if (l.kind === 'drawings' && l.alphaLock) tags.push('alpha lock');
      if (l.kind === 'drawings' && l.reference) tags.push('reference');
      if (l.kind === 'drawings' && l.mask) tags.push(on && app.editingMask ? 'editing mask' : 'mask');
      if (l.kind === 'drawings' && l.effects?.length) tags.push('✨ effects');
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
      if (linked && !inStack) card.classList.add('linked');
      if (inStack) card.classList.add('in-stack');
      if (l.kind === 'drawings' && l.clip) card.classList.add('clipped');
      if (l.kind === 'comp') {
        // a group folds open in place; its options are behind the dots
        card.classList.add('group');
        const open = this.openGroups.has(l.id);
        const fold = el('span', { class: 'lc-fold', 'aria-hidden': 'true' }, open ? '\u25be' : '\u25b8');
        const more = el('button', { type: 'button', class: 'lc-more', title: 'Group options', 'aria-label': `${l.name} options` }, '\u22ef');
        more.addEventListener('pointerdown', (e) => e.stopPropagation());
        more.addEventListener('click', (e) => { e.stopPropagation(); this.menuFor = this.menuFor === l.id ? null : l.id; this.sig = ''; this.update(); });
        card.append(fold, this.thumb(l), info, more, eye);
      } else card.append(this.thumb(l), info, eye);
      this.bindCard(card, l, on);
      list.append(card);
      if (this.swiped === l.id) list.append(this.quick(l));
      if (this.menuFor === l.id) list.append(this.options(l));
      if (l.kind === 'comp' && this.openGroups.has(l.id)) list.append(...this.children(l));
    }
    if (!layers.length) list.append(el('p', { class: 'hint' }, 'No layers yet. Draw, or tap +.'));
    this.root.append(list);
    this.place();
  }

  /** Tap: draw on it (or open its options if it is already the one). Hold, then drag: reorder. */
  private bindCard(card: HTMLElement, l: Layer, on: boolean): void {
    card.addEventListener('pointerdown', (e) => {
      if (this.app.strokeActive) return;
      // a second finger on the same card: the two-finger tap (layer options, opacity first)
      if (this.drag && this.drag.id === l.id && this.drag.pointer !== e.pointerId) {
        clearTimeout(this.drag.timer);
        this.twoTap = l.id;
        return;
      }
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
        // a swipe right adds the layer to the selection (Procreate), or takes it out again
        if (dx > 36 && Math.abs(dy) < 24 && !d.moved) {
          clearTimeout(d.timer);
          this.drag = null;
          this.togglePick(l.id);
          return;
        }
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
      if ((e.shiftKey || e.ctrlKey || e.metaKey) && !on) { this.togglePick(l.id); return; }
      if (this.twoTap === l.id) {
        this.twoTap = null;
        if (l.kind === 'drawings' && !on) this.app.pickLayer(l.id);
        this.menuFor = l.id;
        this.sig = '';
        this.update();
        this.root.querySelector<HTMLInputElement>('.lc-options input[type=range]')?.focus();
        return;
      }
      if (l.kind === 'comp') {
        if (this.openGroups.has(l.id)) this.openGroups.delete(l.id);
        else this.openGroups.add(l.id);
        this.sig = '';
        this.update();
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

  /**
   * The head of a stack of linked layers: its name, how many layers, + for another paint layer, one
   * eye for all of them, and a fold. Its layers sit under it and are painted on directly.
   */
  private stackHeader(id: string, members: DrawingsLayer[], active: string): HTMLElement {
    const app = this.app;
    const still = members.every((m) => m.still);
    const base = members[members.length - 1]!;
    const folded = this.foldedStacks.has(id) && !members.some((m) => m.id === active);
    const head = el('div', { class: `lc-stack${members.some((m) => m.id === active) ? ' here' : ''}`, role: 'group', 'aria-label': `${base.name} stack` });
    const fold = el('button', { type: 'button', class: 'lc-stack-fold', 'aria-expanded': String(!folded), title: folded ? 'Show its layers' : 'Fold its layers away' });
    fold.append(el('span', { class: 'lc-fold', 'aria-hidden': 'true' }, folded ? '\u25b8' : '\u25be'), el('span', { class: 'lc-stack-name' }, `${still ? '\ud83d\uddbc\ufe0f' : '\ud83c\udf9e\ufe0f'} ${base.name}`), el('span', { class: 'lc-tags' }, `${members.length} layer${members.length === 1 ? '' : 's'}`));
    fold.addEventListener('click', () => { if (this.foldedStacks.has(id)) this.foldedStacks.delete(id); else this.foldedStacks.add(id); this.sig = ''; this.update(); });
    const add = el('button', { type: 'button', class: 'lc-icon', title: still ? 'Add a paint layer to this stack (on top)' : 'Add an art layer to this drawing (same frames, its own paint)', 'aria-label': `Add a layer to ${base.name}` }, still ? 'Paint layer' : 'Art layer');
    decorate(add, 'plus');
    add.addEventListener('click', () => {
      if (!members.some((m) => m.id === active)) app.pickLayer(members[0]!.id);
      app.addCelLayer();
      this.foldedStacks.delete(id);
      this.sig = '';
      this.update();
    });
    const shown = members.some((m) => m.visible);
    const eye = el('button', { type: 'button', class: 'lc-eye', 'aria-pressed': String(shown), title: shown ? 'Hide the whole stack' : 'Show the whole stack', 'aria-label': `${shown ? 'Hide' : 'Show'} ${base.name}` }, shown ? 'Hide' : 'Show');
    decorate(eye, 'eye');
    eye.addEventListener('click', () => {
      const ids = members.map((m) => m.id);
      app.editor.edit(shown ? 'Hide stack' : 'Show stack', (c) => { for (const l of c.layers) if (ids.includes(l.id)) l.visible = !shown; });
      app.requestRender();
      this.sig = '';
      this.update();
    });
    head.append(fold, add, eye);
    return head;
  }

  /** A folded-open group's layers: tap one to draw on it (inside the group). */
  private children(g: Extract<Layer, { kind: 'comp' }>): HTMLElement[] {
    const app = this.app;
    const inner = app.project.comps.get(g.comp);
    if (!inner) return [];
    return inner.layers.filter((x) => x.kind === 'drawings' || x.kind === 'comp').map((x) => {
      const card = el('div', { class: `lc-card child${x.visible ? '' : ' off'}`, role: 'option', 'aria-selected': 'false', tabindex: '0', title: `Draw on ${x.name} (inside ${g.name})` });
      const info = el('div', { class: 'lc-info' });
      info.append(el('span', { class: 'lc-name' }, x.name));
      if (x.kind === 'comp') info.append(el('span', { class: 'lc-tags' }, 'group'));
      card.append(this.thumb(x, g.start), info);
      card.addEventListener('click', () => {
        if (app.strokeActive || !app.editor.enter(g.id)) return;
        if (x.kind === 'drawings') app.pickLayer(x.id);
        this.menuFor = null;
        this.sig = '';
        this.update();
      });
      return card;
    });
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

  /** Group a layer with the one below it (linked art layers come along, so they stay in step). */
  private groupWithBelow(l: Layer): void {
    const app = this.app;
    const layers = app.project.comp.layers;
    const at = layers.findIndex((x) => x.id === l.id);
    const below = layers.slice(at + 1).find((x) => (x.kind === 'drawings' && !x.guide) || x.kind === 'comp');
    const withCel = (x: Layer) => (x.kind === 'drawings' && x.cel ? layers.filter((y) => y.kind === 'drawings' && y.cel === x.cel).map((y) => y.id) : [x.id]);
    const ids = [...new Set([...withCel(l), ...(below ? withCel(below) : [])])];
    const made = app.editor.group(ids, 'Group');
    if (!made) return;
    this.openGroups.add(made);
    // keep drawing on the same layer: step into the group
    if (app.editor.enter(made)) app.pickLayer(l.id);
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
    const drawn = l.kind === 'drawings' && !l.guide;
    if (l.kind === 'drawings' && drawn) {
      // strokes and fills: which one brushes paint on, whether it shows, how strong
      for (const pt of ['line', 'fill'] as const) {
        const q = partOf(l, pt);
        const row = el('div', { class: `lc-part${app.plane === pt ? ' paint' : ''}` });
        const name = el('button', { type: 'button', class: 'lc-part-name', 'aria-pressed': String(app.plane === pt), title: pt === 'line' ? 'Paint on LINE: your strokes, on top' : 'Paint on FILL: colour under the strokes' }, pt === 'line' ? 'Line' : 'Fill');
        name.addEventListener('click', () => { app.setPlane(pt); this.sig = ''; this.update(); });
        const eye = el('button', { type: 'button', class: 'lc-part-eye', 'aria-pressed': String(q.visible), title: q.visible ? `Hide ${pt === 'line' ? 'Line' : 'Fill'}` : `Show ${pt === 'line' ? 'Line' : 'Fill'}` }, q.visible ? 'Hide' : 'Show');
        decorate(eye, 'eye');
        eye.addEventListener('click', () => { app.editor.setPart(l.id, pt, { visible: !q.visible }); this.sig = ''; this.update(); });
        const r = el('input', { type: 'range', min: '0', max: '100', step: '1', 'aria-label': `${pt === 'line' ? 'Line' : 'Fill'} opacity` });
        r.value = String(Math.round(Number(app.editor.valueNow(l, `${pt}.opacity` as PropKey))));
        const out = el('output', {}, `${r.value}%`);
        r.addEventListener('input', () => { out.textContent = `${r.value}%`; });
        r.addEventListener('change', () => { app.editor.setValue(l.id, `${pt}.opacity` as PropKey, Number(r.value), `${pt === 'line' ? 'Line' : 'Fill'} opacity`); this.sig = ''; this.update(); });
        row.append(name, eye, r, out);
        box.append(row);
      }
    }
    if (drawn) {
      // what the layer does: switches, so on and off read at a glance
      const sw = (label: string, title: string, on: boolean, fn: () => void) => {
        const b = el('button', { type: 'button', class: `lc-switch${on ? ' on' : ''}`, role: 'switch', 'aria-checked': String(on), title });
        b.append(el('span', { class: 'lc-switch-name' }, label), el('span', { class: 'lc-switch-knob', 'aria-hidden': 'true' }));
        b.addEventListener('click', () => { fn(); this.sig = ''; this.update(); });
        box.append(b);
      };
      const flip = (key: 'clip' | 'alphaLock', label: string) => () => app.editor.edit(l[key] ? `${label} off` : label, (c) => { const x = c.layers.find((y) => y.id === l.id); if (x && x.kind === 'drawings') { if (x[key]) delete x[key]; else x[key] = true; } });
      sw('Alpha Lock', 'Brushes change only pixels that already have paint', l.alphaLock === true, flip('alphaLock', 'Alpha Lock'));
      sw('Clipping mask', 'Show this layer only where the layer below has paint', l.clip === true, flip('clip', 'Clipping mask'));
      sw('Reference', 'Fill and ColorDrop on any layer use this layer\u2019s lines as their edges (one per shot)', l.reference === true, () => app.setReference(l.id, !l.reference));
      if (l.mask) sw('Edit mask', 'Brushes paint on the mask: paint hides, the eraser reveals (all frames of this layer)', app.editingMask, () => app.setMaskEditing(!app.editingMask));
    }
    // actions: icon tiles
    const grid = el('div', { class: 'lc-grid' });
    const tile = (label: string, icon: string, title: string, fn: () => unknown, danger = false, close = false) => {
      const b = el('button', { type: 'button', class: `lc-tile${danger ? ' danger' : ''}`, title }, label);
      decorate(b, icon);
      b.addEventListener('click', () => void (async () => { await fn(); if (close) this.menuFor = null; this.sig = ''; this.update(); })());
      grid.append(b);
    };
    if (drawn) {
      tile('Fill', 'fill', 'Fill this drawing with the current colour (on FILL, under the ink)', () => app.fillDrawing());
      tile('Clear', 'eraser', 'Clear this drawing: Line, Fill and vector lines (you can undo)', () => app.clearFrame());
      tile('Flip \u2194', 'fliph', 'Mirror this drawing left to right', () => app.flipDrawing('h'));
      tile('Flip \u2195', 'flipv', 'Mirror this drawing top to bottom', () => app.flipDrawing('v'));
      if (l.mask) tile('Delete mask', 'deselect', 'Remove the mask: everything shows again (you can undo)', () => app.deleteMask());
      else tile('Mask', 'invert', 'Add a mask: paint to hide parts of this layer without erasing them', () => app.addMask());
      tile('Effects', 'fx', 'Line boil and other effects (they show in Motion, Share and exports)', () => { this.close(); app.openEffects?.(l.id); });
      tile('Select', 'lasso', 'Select what this drawing has, ready to move, scale or fill inside', () => { this.close(); app.selectContents(); });
      tile('Group', 'layers', 'Group this layer with the one below (a folder; tap it to fold open)', () => this.groupWithBelow(l), false, true);
      tile('Merge', 'collapseall', 'Merge down: flatten this layer into the one below (same frames and placement)', () => app.mergeDown(l.id), false, true);
      tile('Art layer', 'plus', 'A linked art layer: the same frames and timing, its own drawing', () => app.addCelLayer(), false, true);
    }
    if (l.kind === 'comp') tile('Ungroup', 'expandall', 'Put the group\u2019s layers back in place of the group', () => { app.editor.ungroup(l.id); this.openGroups.delete(l.id); }, false, true);
    tile('Duplicate', 'copy', 'A copy of this layer above it, with its own drawings', () => app.duplicateLayer(l.id), false, true);
    tile('Rename', 'draw', 'Rename this layer', async () => {
      const n = await askText('Layer name', l.name, 'Rename');
      if (n !== null) app.editor.rename(l.id, n);
    });
    tile(l.locked ? 'Unlock' : 'Lock', 'lock', l.locked ? 'Allow drawing on it again' : 'Stop drawing on it', () => app.editor.setFlag(l.id, 'locked', !l.locked));
    tile('Delete', 'trash', 'Delete this layer (you can undo)', async () => {
      if (!(await confirmBox(`Delete \u201c${l.name}\u201d?`, 'You can undo this.', 'Delete', true))) return;
      app.editor.deleteLayers([l.id]);
      this.menuFor = null;
    }, true);
    box.append(grid);
    return box;
  }
}
