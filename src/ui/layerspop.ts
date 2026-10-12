import type { App } from '../app';
import { askText, confirmBox } from './dialogs';
import { decorate } from './icons';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * The Draw view's layer list (a popover, like Procreate's Layers panel): every drawings layer of
 * the comp, top first. Tap a layer to draw on it; eye shows / hides, lock stops drawing, arrows
 * reorder, + adds a layer. "Others" sets how the layers you are not drawing on show. Every change
 * goes through the comp editor, so it is undoable and Motion stays in step.
 */
export class LayersPopover {
  private readonly root = el('div', { class: 'layerspop', role: 'dialog', 'aria-label': 'Layers', hidden: '' });
  private anchor: HTMLElement | null = null;
  private sig = '';

  constructor(private readonly app: App) {
    document.body.append(this.root);
    // tapping elsewhere closes it (but not the button that opened it, which toggles)
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (this.root.hidden) return;
        const t = e.target as Node;
        if (this.root.contains(t) || this.anchor?.contains(t)) return;
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
    if (this.open && this.anchor === anchor) return this.close();
    this.anchor = anchor;
    this.root.hidden = false;
    this.sig = '';
    this.update();
    this.place();
  }

  close(): void {
    this.root.hidden = true;
  }

  private place(): void {
    const a = this.anchor;
    if (!a || this.root.hidden) return;
    const r = a.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 16);
    this.root.style.width = `${w}px`;
    this.root.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))}px`;
    const below = r.bottom + 6;
    const h = this.root.offsetHeight;
    // open upward from the strip, downward from the toolbar
    this.root.style.top = `${below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below}px`;
  }

  /** Rebuild the list (cheap; only while open). */
  update(): void {
    if (this.root.hidden) return;
    const app = this.app;
    const ed = app.editor;
    const layers = app.drawLayers();
    const active = app.project.isPlaceholder ? '' : app.project.activeLayer;
    // rebuild only when something it shows changed (keeps double-taps and focus intact)
    const sig = `${app.project.comp.id}|${active}|${app.plane}|${app.partVisible('line')}|${app.partVisible('fill')}|${app.showLayers}|${app.otherAlpha}|${app.boardAlpha}|${app.board?.id ?? ''}|${layers.map((l) => `${l.id}:${l.name}:${l.visible}:${l.locked}`).join(',')}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.root.replaceChildren();
    const head = el('div', { class: 'lp-head' });
    head.append(el('span', { class: 'lp-title' }, `Layers · ${app.project.comp.name}`));
    const add = el('button', { type: 'button', class: 'lp-add', title: 'New layer above the one you draw on' }, 'Layer');
    decorate(add, 'plus');
    add.addEventListener('click', () => {
      app.addDrawLayer();
      this.update();
    });
    head.append(add);
    this.root.append(head);

    const list = el('div', { class: 'lp-list', role: 'listbox', 'aria-label': 'Layers' });
    if (!layers.length) list.append(el('p', { class: 'hint' }, 'No drawing layers yet. Draw, or add one.'));
    layers.forEach((l, i) => {
      const row = el('div', { class: `lp-row${l.id === active ? ' on' : ''}${l.visible ? '' : ' off'}`, role: 'option', 'aria-selected': String(l.id === active) });
      const eye = el('button', { type: 'button', class: 'lp-eye', 'aria-pressed': String(l.visible), title: l.visible ? 'Hide this layer' : 'Show this layer' }, l.visible ? 'Hide' : 'Show');
      decorate(eye, 'eye');
      eye.classList.add('icon-only');
      eye.addEventListener('click', () => ed.setFlag(l.id, 'visible', !l.visible));
      const lock = el(
        'button',
        { type: 'button', class: 'lp-lock', 'aria-pressed': String(l.locked), title: l.locked ? 'Unlock: allow drawing on it' : 'Lock: stop drawing on it' },
        l.locked ? 'Unlock' : 'Lock',
      );
      decorate(lock, 'lock');
      lock.classList.add('icon-only');
      lock.addEventListener('click', () => ed.setFlag(l.id, 'locked', !l.locked));
      const name = el('button', { type: 'button', class: 'lp-name', title: 'Tap to draw on this layer. Double-tap to rename.' }, l.guide ? `${l.name} · board` : l.name);
      name.addEventListener('click', async (e) => {
        if (e.detail >= 2) {
          const n = await askText('Layer name', l.name, 'Rename');
          if (n !== null) ed.rename(l.id, n);
        } else app.pickLayer(l.id);
        this.update();
      });
      const up = el('button', { type: 'button', class: 'lp-move', title: 'Move up (in front)', 'aria-label': `Move ${l.name} up` }, '▲');
      up.disabled = i === 0;
      up.addEventListener('click', () => ed.reorder(l.id, -1));
      const down = el('button', { type: 'button', class: 'lp-move', title: 'Move down (behind)', 'aria-label': `Move ${l.name} down` }, '▼');
      down.disabled = i === layers.length - 1;
      down.addEventListener('click', () => ed.reorder(l.id, 1));
      row.append(eye, lock, name, up, down);
      list.append(row);
      // the layer you draw on: its LINE and FILL, each shown or hidden, and which one brushes paint on
      if (l.id === active && !l.guide) {
        const parts = el('div', { class: 'lp-parts', role: 'group', 'aria-label': `${l.name}: Line and Fill` });
        for (const part of ['line', 'fill'] as const) {
          const vis = app.partVisible(part);
          const chip = el('div', { class: `lp-part${app.plane === part ? ' paint' : ''}` });
          const pe = el(
            'button',
            { type: 'button', class: 'icon-only', 'aria-pressed': String(vis), title: `${vis ? 'Hide' : 'Show'} ${part === 'line' ? 'LINE (ink)' : 'FILL (colour)'}` },
            vis ? 'Hide' : 'Show',
          );
          decorate(pe, 'eye');
          pe.addEventListener('click', () => {
            app.togglePart(part);
            this.sig = '';
            this.update();
          });
          const pick = el(
            'button',
            { type: 'button', class: 'lp-part-name', 'aria-pressed': String(app.plane === part), title: `Paint on ${part === 'line' ? 'LINE: your ink' : 'FILL: colour under the ink'}` },
            part === 'line' ? 'Line' : 'Fill',
          );
          pick.addEventListener('click', () => {
            app.setPlane(part);
            this.sig = '';
            this.update();
          });
          chip.append(pe, pick, el('span', { class: 'hint' }, part === 'line' ? 'ink, on top' : 'colour, under'));
          parts.append(chip);
        }
        list.append(parts);
      }
    });
    this.root.append(list);

    // how the other layers show while drawing
    const others = el('div', { class: 'lp-others', role: 'group', 'aria-label': 'Other layers' });
    others.append(el('span', { class: 'name' }, 'Others'));
    for (const [label, on, alpha] of [
      ['Show', true, 1],
      ['Fade', true, 0.4],
      ['Hide', false, app.otherAlpha],
    ] as const) {
      const b = el('button', { type: 'button' }, label);
      const pressed = on ? app.showLayers && Math.abs(app.otherAlpha - alpha) < 0.01 : !app.showLayers;
      b.setAttribute('aria-pressed', String(pressed));
      b.addEventListener('click', () => {
        app.setShowLayers(on, alpha);
        this.update();
      });
      others.append(b);
    }
    this.root.append(others);

    if (app.board) {
      const board = el('div', { class: 'lp-others', role: 'group', 'aria-label': 'Storyboard' });
      board.append(el('span', { class: 'name' }, 'Board'));
      for (const [label, a] of [
        ['Show', 1],
        ['Fade', 0.35],
        ['Hide', 0],
      ] as const) {
        const b = el('button', { type: 'button' }, label);
        b.setAttribute('aria-pressed', String(Math.abs(app.boardAlpha - a) < 0.01));
        b.addEventListener('click', () => {
          app.setBoardAlpha(a);
          this.update();
        });
        board.append(b);
      }
      this.root.append(board);
    }

    if (active) {
      const del = el('button', { type: 'button', class: 'lp-del danger', title: 'Delete the layer you are drawing on (undoable)' }, 'Delete layer');
      decorate(del, 'trash');
      del.addEventListener('click', async () => {
        const l = app.project.layer;
        if (!(await confirmBox(`Delete “${l.name}”?`, 'You can undo this.', 'Delete', true))) return;
        ed.deleteLayers([l.id]);
        this.update();
      });
      this.root.append(del);
    }
    this.place();
  }
}
