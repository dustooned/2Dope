import type { App } from '../app';
import type { Layer } from '../core/comp';
import { EFFECT_TYPES, effectDef, effectPreview, newEffect, TARGET_NAMES, TEXTURE_STYLES, type EffectTarget, type LayerEffect, type TextureStyle } from '../core/effects';
import { newSeed } from '../core/rng';
import { decorate } from './icons';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

/**
 * The Effects card of one layer: its effects in order, each on or off, aimed at the Line, the Fill
 * or the whole layer, with a few sliders. A slider previews live and is one undo step when let go.
 */
export class EffectsPanel {
  private readonly root = el('div', { class: 'fxpanel', role: 'dialog', 'aria-label': 'Effects', hidden: '' });
  private layerId = '';

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
    this.layerId = layerId;
    this.root.hidden = false;
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

  private render(): void {
    const l = this.layer();
    if (!l || l.kind !== 'drawings') { this.close(); return; }
    const list = this.effects();
    const r = this.root;
    r.replaceChildren();
    const head = el('div', { class: 'fx-head' });
    const x = el('button', { type: 'button', class: 'fx-x', 'aria-label': 'Close' }, '✕');
    x.addEventListener('click', () => this.close());
    head.append(el('strong', {}, `Effects · ${l.name}`), x);
    r.append(head);
    if (!list.length) r.append(el('p', { class: 'hint' }, 'No effects yet. Add one below: it shows in Motion, in Share and in every export; the layer you draw on stays clean while you draw.'));
    list.forEach((e, i) => {
      const def = effectDef(e.type);
      const card = el('div', { class: `fx-card${e.on ? '' : ' off'}` });
      const top = el('div', { class: 'fx-top' });
      const sw = el('button', { type: 'button', class: `lc-switch fx-on${e.on ? ' on' : ''}`, role: 'switch', 'aria-checked': String(e.on), title: e.on ? 'Turn this effect off' : 'Turn this effect on' });
      sw.append(el('span', { class: 'lc-switch-name' }, def.label), el('span', { class: 'lc-switch-knob', 'aria-hidden': 'true' }));
      sw.addEventListener('click', () => this.patch(i, { on: !e.on }, e.on ? `${def.label} off` : `${def.label} on`));
      const del = el('button', { type: 'button', class: 'fx-del', 'aria-label': `Delete ${def.label}`, title: 'Delete this effect' }, 'Delete');
      decorate(del, 'trash');
      del.addEventListener('click', () => this.commit(`Delete ${def.label.toLowerCase()}`, list.filter((_, k) => k !== i)));
      top.append(sw, del);
      card.append(top);
      // what it works on
      const seg = el('div', { class: 'fx-seg', role: 'group', 'aria-label': 'Works on' });
      for (const t of ['line', 'fill', 'layer'] as EffectTarget[]) {
        const b = el('button', { type: 'button', 'aria-pressed': String(e.target === t) }, TARGET_NAMES[t]);
        b.addEventListener('click', () => { if (e.target !== t) this.patch(i, { target: t }, `${def.label} on ${TARGET_NAMES[t].toLowerCase()}`); });
        seg.append(b);
      }
      card.append(seg);
      // sliders: live preview, one undo step when let go
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
        input.addEventListener('change', () => this.patch(i, { [key]: Number(input.value) }, `${def.label} ${label.toLowerCase()}`));
        row.append(el('span', {}, label), input, out);
        card.append(row);
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
        card.append(look);
      }
      slider(def.amountLabel, 'amount', def.amountRange, def.amountUnit === '%' ? 1 : 0.1, def.amountUnit);
      slider(def.sizeLabel, 'size', def.sizeRange, 1, def.sizeUnit);
      // how often the pattern changes: on ones, twos, threes, fours
      const hold = el('div', { class: `fx-row${def.animated ? '' : ' hidden'}`, ...(def.animated ? {} : { hidden: '' }) });
      hold.append(el('span', {}, 'Changes'));
      const holds = el('div', { class: 'fx-seg small' });
      for (const [n, t] of [[1, 'Every frame'], [2, 'On 2s'], [3, 'On 3s'], [4, 'On 4s']] as const) {
        const b = el('button', { type: 'button', 'aria-pressed': String(e.hold === n), title: n === 1 ? 'A new pattern every frame' : `A new pattern every ${n} frames (boils like hand-drawn on ${n}s)` }, t);
        b.addEventListener('click', () => { if (e.hold !== n) this.patch(i, { hold: n }, `${def.label} on ${n}s`); });
        holds.append(b);
      }
      hold.append(holds);
      card.append(hold);
      const reseed = el('button', { type: 'button', class: 'fx-reseed', title: 'A different random pattern' }, 'New pattern');
      if (e.type === 'texture' && (e.style ?? 'paper') !== 'paper') reseed.hidden = true;
      reseed.addEventListener('click', () => this.patch(i, { seed: newSeed() }, `${def.label} new pattern`));
      card.append(reseed);
      r.append(card);
    });
    // add
    const add = el('div', { class: 'fx-add' });
    for (const t of EFFECT_TYPES) {
      const b = el('button', { type: 'button', title: t.hint }, `+ ${t.label}`);
      b.addEventListener('click', () => this.commit(`Add ${t.label.toLowerCase()}`, [...list, newEffect(t.id, `fx${Date.now().toString(36)}${list.length}`, newSeed())]));
      add.append(b);
    }
    r.append(add);
  }
}
