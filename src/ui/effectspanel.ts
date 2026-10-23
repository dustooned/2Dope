import type { App } from '../app';
import type { Layer } from '../core/comp';
import { DITHER_METHODS, PALETTES, type DitherMethod, type PaletteId } from '../core/dither';
import { canMerge, duplicateEffect, EFFECT_TYPES, effectDef, effectPreview, mergeDown, moveEffect, newEffect, plainName, resetEffect, TARGET_NAMES, TEXTURE_STYLES, type EffectTarget, type LayerEffect, type TextureStyle } from '../core/effects';
import { newSeed } from '../core/rng';
import { showContextMenu, type CtxItem } from './contextmenu';
import { decorate } from './icons';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

const MODE_KEY = '2dope.fx.mode';
const SWIPE = 40;

/**
 * The Effects card of one layer, set out like Procreate's layers: a scrolling stack of effect
 * cards, each folded to one row (name, what it works on, an on/off switch) until you open it. Drag
 * the grip to reorder; swipe a card left (or tap ⋯) for Duplicate, Merge down, Reset and Delete.
 * Simple shows each effect's main slider; Advanced shows every setting. A slider previews live and
 * is one undo step when let go; every change is one undo step.
 */
export class EffectsPanel {
  private readonly root = el('div', { class: 'fxpanel', role: 'dialog', 'aria-label': 'Effects', hidden: '' });
  private layerId = '';
  private advanced = (() => { try { return localStorage.getItem(MODE_KEY) === 'advanced'; } catch { return false; } })();
  /** Cards that are open (by effect id); a new effect opens. */
  private readonly opened = new Set<string>();
  /** The card swiped open to its actions. */
  private swiped = '';

  constructor(private readonly app: App) {
    document.body.append(this.root);
    window.addEventListener('pointerdown', (e) => {
      if (this.root.hidden) return;
      const t = e.target as HTMLElement;
      if (this.root.contains(t) || t.closest?.('.ctxmenu, dialog, [data-fx-open]')) return;
      this.close();
    }, true);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.root.hidden) this.close(); });
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  show(layerId: string): void {
    const l = this.layer(layerId);
    if (!l || l.kind !== 'drawings') {
      this.app.onNotice?.('Pick a drawing layer to give it effects.');
      return;
    }
    if (layerId !== this.layerId) { this.opened.clear(); this.swiped = ''; }
    this.layerId = layerId;
    this.root.hidden = false;
    // one effect: open it straight away
    const list = this.effects();
    if (list.length === 1) this.opened.add(list[0]!.id);
    this.render();
  }

  close(): void {
    this.root.hidden = true;
    effectPreview.delete(this.layerId);
  }

  private layer(id = this.layerId): Layer | undefined {
    return this.app.editor.comp.layers.find((l) => l.id === id);
  }

  private effects(): LayerEffect[] {
    const l = this.layer();
    return l && l.kind === 'drawings' ? (l.effects ?? []) : [];
  }

  /** One undo step: the layer's effects become `next`. */
  private commit(label: string, next: LayerEffect[]): void {
    const id = this.layerId;
    effectPreview.delete(id);
    this.app.editor.edit(label, (c) => {
      const x = c.layers.find((y) => y.id === id);
      if (!x || x.kind !== 'drawings') return;
      if (next.length) x.effects = structuredClone(next);
      else delete x.effects;
    });
    this.app.requestRender();
    this.render();
  }

  private patch(i: number, p: Partial<LayerEffect>, label: string): void {
    const list = this.effects().map((e, k) => (k === i ? { ...e, ...p } : e));
    this.commit(label, list);
  }

  private newId(): string {
    return `fx${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  }

  /** What a card can do (the swipe actions, the ⋯ menu). */
  private actions(i: number): { label: string; run: () => void; danger?: boolean; disabled?: boolean; title?: string }[] {
    const list = this.effects();
    const e = list[i]!;
    const name = plainName(effectDef(e.type));
    const below = list[i + 1];
    return [
      { label: 'Duplicate', run: () => { const id = this.newId(); this.opened.add(id); this.swiped = ''; this.commit(`Duplicate ${name.toLowerCase()}`, duplicateEffect(list, i, id)); } },
      { label: 'Merge down', disabled: !canMerge(e, below), title: canMerge(e, below) ? 'Join with the effect under it (the amounts add up)' : 'Merge works with the same effect, on the same part, right under this one', run: () => { const m = mergeDown(list, i); this.swiped = ''; if (m) this.commit(`Merge ${name.toLowerCase()}`, m); } },
      { label: 'Reset', title: 'Back to the starting settings', run: () => this.patch(i, resetEffect(e), `Reset ${name.toLowerCase()}`) },
      { label: 'Delete', danger: true, run: () => { this.swiped = ''; this.commit(`Delete ${name.toLowerCase()}`, list.filter((_, k) => k !== i)); } },
    ];
  }

  private menu(i: number, x: number, y: number): void {
    const list = this.effects();
    const items: CtxItem[] = [
      { title: plainName(effectDef(list[i]!.type)) },
      ...this.actions(i).map((a) => ({ label: a.label, run: a.run, danger: a.danger, disabled: a.disabled })),
      { sep: true },
      { label: 'Move up', disabled: i === 0, run: () => this.commit('Move effect', moveEffect(list, i, i - 1)) },
      { label: 'Move down', disabled: i === list.length - 1, run: () => this.commit('Move effect', moveEffect(list, i, i + 1)) },
    ];
    showContextMenu(x, y, items);
  }

  private render(): void {
    const l = this.layer();
    if (!l || l.kind !== 'drawings') { this.close(); return; }
    const list = this.effects();
    const keepScroll = this.root.querySelector('.fx-list')?.scrollTop ?? 0;
    const r = this.root;
    r.replaceChildren();
    const head = el('div', { class: 'fx-head' });
    const x = el('button', { type: 'button', class: 'fx-x icon-only', 'aria-label': 'Close' }, 'Close');
    decorate(x, 'close');
    x.addEventListener('click', () => this.close());
    const mode = el('div', { class: 'fx-seg small fx-mode', role: 'group', 'aria-label': 'How many settings' });
    for (const [adv, label, title] of [[false, 'Simple', 'Just the main slider of each effect'], [true, 'Advanced', 'Every setting']] as const) {
      const b = el('button', { type: 'button', 'aria-pressed': String(this.advanced === adv), title }, label);
      b.addEventListener('click', () => { this.advanced = adv; try { localStorage.setItem(MODE_KEY, adv ? 'advanced' : 'simple'); } catch { /* optional */ } this.render(); });
      mode.append(b);
    }
    head.append(el('strong', {}, `Effects · ${l.name}`), mode, x);
    r.append(head);
    if (!list.length) r.append(el('p', { class: 'hint' }, 'No effects yet. Add one below: it shows in Motion, in Share and in every export; the layer you draw on stays clean while you draw.'));
    else r.append(el('p', { class: 'hint fx-order' }, 'Top runs first. Drag ☰ to reorder, swipe left for more.'));
    const box = el('div', { class: 'fx-list' });
    list.forEach((e, i) => box.append(this.card(e, i, list)));
    r.append(box);
    box.scrollTop = keepScroll;
    // add
    const add = el('div', { class: 'fx-add' });
    for (const t of EFFECT_TYPES) {
      const b = el('button', { type: 'button', title: t.hint }, plainName(t));
      decorate(b, 'plus');
      b.addEventListener('click', () => {
        const id = this.newId();
        this.opened.add(id);
        this.commit(`Add ${plainName(t).toLowerCase()}`, [...list, newEffect(t.id, id, newSeed())]);
        requestAnimationFrame(() => { const lb = this.root.querySelector('.fx-list'); if (lb) lb.scrollTop = lb.scrollHeight; });
      });
      add.append(b);
    }
    r.append(add);
  }

  private card(e: LayerEffect, i: number, list: LayerEffect[]): HTMLElement {
    const def = effectDef(e.type);
    const name = plainName(def);
    const open = this.opened.has(e.id);
    const card = el('div', { class: `fx-card${e.on ? '' : ' off'}${open ? ' open' : ''}${this.swiped === e.id ? ' swiped' : ''}`, 'data-i': String(i) });
    const top = el('div', { class: 'fx-top' });
    const grip = el('button', { type: 'button', class: 'fx-grip', title: 'Drag to reorder', 'aria-label': `Reorder ${name}` }, '☰');
    const title = el('button', { type: 'button', class: 'fx-title', 'aria-expanded': String(open), title: open ? 'Fold this effect' : 'Show its settings' });
    title.append(el('span', { class: 'fx-chev', 'aria-hidden': 'true' }, open ? '▾' : '▸'), el('span', { class: 'fx-name' }, name), el('span', { class: 'fx-badge' }, TARGET_NAMES[e.target]));
    title.addEventListener('click', () => { if (this.swiped) { this.swiped = ''; this.render(); return; } if (open) this.opened.delete(e.id); else this.opened.add(e.id); this.render(); });
    const sw = el('button', { type: 'button', class: `fx-switch${e.on ? ' on' : ''}`, role: 'switch', 'aria-checked': String(e.on), title: e.on ? 'Turn this effect off' : 'Turn this effect on', 'aria-label': `${name} on` });
    sw.append(el('span', { class: 'lc-switch-knob', 'aria-hidden': 'true' }));
    sw.addEventListener('click', () => this.patch(i, { on: !e.on }, e.on ? `${name} off` : `${name} on`));
    const more = el('button', { type: 'button', class: 'fx-more icon-only', title: 'More: duplicate, merge, reset, delete, move', 'aria-label': `More for ${name}` }, 'More');
    decorate(more, 'more');
    more.addEventListener('click', (ev) => this.menu(i, ev.clientX, ev.clientY));
    top.append(grip, title, sw, more);
    card.append(top);
    this.wireSwipe(top, e.id);
    this.wireReorder(grip, card, i, list);
    // swipe actions (Procreate style)
    if (this.swiped === e.id) {
      const acts = el('div', { class: 'fx-actions' });
      for (const a of this.actions(i)) {
        const b = el('button', { type: 'button', class: a.danger ? 'danger' : '', title: a.title ?? a.label }, a.label);
        if (a.disabled) b.disabled = true;
        if (a.label === 'Delete') decorate(b, 'trash');
        b.addEventListener('click', () => a.run());
        acts.append(b);
      }
      card.append(acts);
    }
    if (open) card.append(this.body(e, i, list));
    return card;
  }

  /** The settings of an open card: the main slider (Simple), or everything (Advanced). */
  private body(e: LayerEffect, i: number, list: LayerEffect[]): HTMLElement {
    const def = effectDef(e.type);
    const name = plainName(def);
    const adv = this.advanced;
    const body = el('div', { class: 'fx-body' });
    if (adv) {
      const seg = el('div', { class: 'fx-seg', role: 'group', 'aria-label': 'Works on' });
      for (const t of ['line', 'fill', 'layer'] as EffectTarget[]) {
        const b = el('button', { type: 'button', 'aria-pressed': String(e.target === t) }, TARGET_NAMES[t]);
        b.addEventListener('click', () => { if (e.target !== t) this.patch(i, { target: t }, `${name} on ${TARGET_NAMES[t].toLowerCase()}`); });
        seg.append(b);
      }
      body.append(seg);
    }
    const slider = (label: string, key: 'amount' | 'size', lim: readonly [number, number], step: number, unit: string) => {
      const row = el('label', { class: 'fx-row' });
      const input = el('input', { type: 'range', min: String(lim[0]), max: String(lim[1]), step: String(step), 'aria-label': label });
      input.value = String(e[key]);
      const out = el('output', {}, `${e[key]}${unit}`);
      input.addEventListener('input', () => {
        const v = Number(input.value);
        out.textContent = `${v}${unit}`;
        effectPreview.set(this.layerId, list.map((f, k) => (k === i ? { ...f, [key]: v } : f)));
        this.app.requestRender();
      });
      input.addEventListener('change', () => this.patch(i, { [key]: Number(input.value) }, `${name} ${label.toLowerCase()}`));
      row.append(el('span', {}, label), input, out);
      body.append(row);
    };
    if (e.type === 'texture') {
      const look = el('div', { class: 'fx-row' });
      look.append(el('span', {}, 'Look'));
      const looks = el('div', { class: 'fx-seg small' });
      for (const t of TEXTURE_STYLES) {
        const b = el('button', { type: 'button', 'aria-pressed': String((e.style ?? 'paper') === t.id) }, t.label);
        b.addEventListener('click', () => { if ((e.style ?? 'paper') !== t.id) this.patch(i, { style: t.id as TextureStyle }, `Texture ${t.label.toLowerCase()}`); });
        looks.append(b);
      }
      look.append(looks);
      body.append(look);
    }
    if (e.type === 'dither') {
      const pick = (label: string, options: { id: string; label: string }[], value: string, set: (v: string) => Partial<LayerEffect>, what: string) => {
        const row = el('label', { class: 'fx-row' });
        const sel = el('select', { 'aria-label': label });
        for (const o of options) sel.append(el('option', { value: o.id }, o.label));
        sel.value = value;
        sel.addEventListener('change', () => this.patch(i, set(sel.value), `Retro pixels ${what}`));
        row.append(el('span', {}, label), sel);
        body.append(row);
      };
      pick('Colours', PALETTES, e.palette ?? 'pico8', (v) => ({ palette: v as PaletteId }), 'colours');
      if (adv) {
        pick('Dots', DITHER_METHODS, e.method ?? 'bayer4', (v) => ({ method: v as DitherMethod }), 'dots');
        const gray = el('button', { type: 'button', class: `lc-switch fx-on${e.gray ? ' on' : ''}`, role: 'switch', 'aria-checked': String(!!e.gray), title: 'Turn the picture grey before the colours are picked' });
        gray.append(el('span', { class: 'lc-switch-name' }, 'Grey first'), el('span', { class: 'lc-switch-knob', 'aria-hidden': 'true' }));
        gray.addEventListener('click', () => this.patch(i, { gray: !e.gray }, 'Retro pixels grey'));
        body.append(gray);
      }
    }
    slider(def.amountLabel, 'amount', def.amountRange, def.amountUnit === '%' ? 1 : 0.1, def.amountUnit);
    if (adv) slider(def.sizeLabel, 'size', def.sizeRange, 1, def.sizeUnit);
    if (adv && def.animated) {
      // how often the pattern changes: on ones, twos, threes, fours
      const hold = el('div', { class: 'fx-row' });
      hold.append(el('span', {}, 'Changes'));
      const holds = el('div', { class: 'fx-seg small' });
      for (const [n, t] of [[1, 'Every frame'], [2, 'On 2s'], [3, 'On 3s'], [4, 'On 4s']] as const) {
        const b = el('button', { type: 'button', 'aria-pressed': String(e.hold === n), title: n === 1 ? 'A new pattern every frame' : `A new pattern every ${n} frames (boils like hand-drawn on ${n}s)` }, t);
        b.addEventListener('click', () => { if (e.hold !== n) this.patch(i, { hold: n }, `${name} on ${n}s`); });
        holds.append(b);
      }
      hold.append(holds);
      body.append(hold);
    }
    if (adv && !(e.type === 'texture' && (e.style ?? 'paper') !== 'paper') && e.type !== 'dither') {
      const reseed = el('button', { type: 'button', class: 'fx-reseed', title: 'A different random pattern' }, 'New pattern');
      reseed.addEventListener('click', () => this.patch(i, { seed: newSeed() }, `${name} new pattern`));
      body.append(reseed);
    }
    return body;
  }

  /** Swipe a card's top row left for its actions, right to put them away (like Procreate's layers). */
  private wireSwipe(top: HTMLElement, id: string): void {
    let s: { x: number; y: number; id: number } | null = null;
    top.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('.fx-grip, .fx-switch, .fx-more')) return;
      s = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    top.addEventListener('pointermove', (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.abs(dy) > Math.abs(dx)) { if (Math.abs(dy) > 10) s = null; return; }
      if (dx < -SWIPE && this.swiped !== id) { s = null; this.swiped = id; this.eatClick(); this.render(); }
      else if (dx > SWIPE && this.swiped === id) { s = null; this.swiped = ''; this.eatClick(); this.render(); }
    });
    const end = () => { s = null; };
    top.addEventListener('pointerup', end);
    top.addEventListener('pointercancel', end);
  }

  /** The click that ends a swipe should not also fold or open the card. */
  private eatClick(): void {
    const eat = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', eat, { capture: true }), 400);
  }

  /** Drag the grip up or down: the card follows the finger and lands between the others. */
  private wireReorder(grip: HTMLElement, card: HTMLElement, i: number, list: LayerEffect[]): void {
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      grip.setPointerCapture(e.pointerId);
      const box = card.parentElement!;
      const cards = [...box.querySelectorAll<HTMLElement>('.fx-card')];
      const mids = cards.map((c) => { const r = c.getBoundingClientRect(); return r.top + r.height / 2; });
      const y0 = e.clientY;
      let to = i;
      card.classList.add('dragging');
      const move = (ev: PointerEvent) => {
        const dy = ev.clientY - y0;
        card.style.transform = `translateY(${dy}px)`;
        const y = mids[i]! + dy;
        to = mids.filter((m, k) => k !== i && m < y).length;
        cards.forEach((c, k) => {
          if (k === i) return;
          const shift = k < i && k >= to ? card.offsetHeight + 6 : k > i && k <= to ? -(card.offsetHeight + 6) : 0;
          c.style.transform = shift ? `translateY(${shift}px)` : '';
        });
      };
      const up = () => {
        grip.removeEventListener('pointermove', move);
        grip.removeEventListener('pointerup', up);
        grip.removeEventListener('pointercancel', up);
        for (const c of cards) c.style.transform = '';
        card.classList.remove('dragging');
        if (to !== i) this.commit('Move effect', moveEffect(list, i, to));
      };
      grip.addEventListener('pointermove', move);
      grip.addEventListener('pointerup', up);
      grip.addEventListener('pointercancel', up);
    });
  }
}
