import type { App } from '../app';
import { isAnimated, type Vec2 } from '../core/anim';
import { BLEND_MODES, PART_LABEL, PART_NAMES, type BlendMode, type Layer } from '../core/comp';
import { effectDef, effectPreview, keyableSettings, outlineTrail, param, plainName, temporalEffect, type LayerEffect } from '../core/effects';
import { CAPTION_KEYS } from '../lettering/spec';
import { PROP_LABEL, propsOf, type PropKey } from '../compedit';
import { el } from './dom';

const OPEN_KEY = '2dope.motion.inspector';
const TAB_KEY = '2dope.motion.inspector.tab';

type Tab = 'layer' | 'transform' | 'parent' | 'path' | 'trail' | 'effects' | 'caption' | 'instance';
const TAB_LABEL: Record<Tab, string> = {
  layer: 'Layer', transform: 'Transform', parent: 'Parenting', path: 'Path', trail: 'Trail', effects: 'Effects', caption: 'Caption', instance: 'Instance',
};

/** How a number row reads and how far its slider goes (no slider without a range). */
interface Range { min?: number; max?: number; step?: number; unit: string }

/** Effects that leave a trail behind the art (Echo, Motion blur, Fringe, an Outline in Trail mode). */
const isTrail = (e: LayerEffect) => temporalEffect(e.type) || e.type === 'fringe' || outlineTrail(e);

/**
 * Motion's Inspector: every setting of the selected layer in one panel on the right, ready to type,
 * drag or key. Its tabs follow the layer: Layer and Transform always; Parenting once it is linked;
 * Path once it moves along one; Trail, Effects and Caption once it has them; Instance for a
 * precomp's pinned properties. Each ◆ keys the setting at the playhead, as on a Motion row.
 */
export class MotionInspector {
  readonly root = el('aside', { class: 'minspector', 'aria-label': 'Inspector', hidden: '' });
  private readonly tabsEl = el('div', { class: 'mi-tabs', role: 'tablist', 'aria-label': 'Inspector sections' });
  private readonly body = el('div', { class: 'mi-body', role: 'tabpanel' });
  private readonly title = el('strong', { class: 'mi-title' });
  private tab: Tab = (() => { try { return (localStorage.getItem(TAB_KEY) as Tab | null) ?? 'transform'; } catch { return 'transform'; } })();
  private shown = (() => { try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; } })();
  private shape = '';
  private scrubbing = false;
  /** Called when the Inspector opens or closes (Motion's button shows it). */
  onToggle: () => void = () => {};

  constructor(private readonly app: App, host: HTMLElement) {
    const head = el('div', { class: 'mi-head' });
    const close = el('button', { type: 'button', class: 'mi-close', 'aria-label': 'Close the Inspector', title: 'Close the Inspector' }, '✕');
    close.addEventListener('click', () => this.toggle(false));
    head.append(this.title, close);
    this.root.append(head, this.tabsEl, this.body);
    host.append(this.root);
    // a typed value goes in when you leave the box or press Enter (Escape puts it back)
    this.body.addEventListener('keydown', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.tagName !== 'INPUT' || t.type !== 'number') return;
      if (e.key === 'Enter') { e.preventDefault(); t.blur(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.shape = ''; t.blur(); this.update(); }
    });
  }

  get isOpen(): boolean { return this.shown; }

  toggle(on = !this.shown): void {
    this.shown = on;
    try { localStorage.setItem(OPEN_KEY, on ? '1' : '0'); } catch { /* session only */ }
    this.shape = '';
    this.update();
    this.onToggle();
  }

  private get ed() { return this.app.editor; }

  /** The tabs this layer has, in order. */
  private tabsOf(l: Layer): Tab[] {
    const tabs: Tab[] = ['layer', 'transform'];
    if (l.parent || this.ed.comp.layers.some((x) => x.parent === l.id)) tabs.push('parent');
    if (l.transform.position.keys.length > 1 || l.transform.orient) tabs.push('path');
    const fx = l.kind === 'drawings' || l.kind === 'comp' ? (l.effects ?? []) : [];
    if (fx.some(isTrail)) tabs.push('trail');
    if (fx.length) tabs.push('effects');
    if (l.kind === 'drawings' && l.caption) tabs.push('caption');
    if (l.kind === 'comp' && this.ed.rowsOf(l).some((n) => n.startsWith('pin:'))) tabs.push('instance');
    return tabs;
  }

  update(): void {
    const app = this.app, l = app.workspace === 'motion' && this.shown ? this.ed.primary : undefined;
    const visible = app.workspace === 'motion' && this.shown;
    if (this.root.hidden === visible) this.root.hidden = !visible;
    document.body.classList.toggle('mi-open', visible);
    if (!visible) { this.shape = ''; return; }
    if (!l) {
      if (this.shape !== 'none') {
        this.shape = 'none';
        this.title.textContent = 'Inspector';
        this.tabsEl.replaceChildren();
        this.body.replaceChildren(el('p', { class: 'hint' }, 'Select a layer to see all of its settings here.'));
      }
      return;
    }
    const tabs = this.tabsOf(l);
    const tab = tabs.includes(this.tab) ? this.tab : 'transform';
    const shape = `${l.id}|${this.ed.comp.id}|${this.ed.rev}|${tab}|${tabs.join(',')}`;
    if (shape !== this.shape && !this.scrubbing) {
      this.shape = shape;
      this.build(l, tabs, tab);
    }
    this.refresh(l);
  }

  // -------------------------------------------------------------------------------------------
  // Building

  private build(l: Layer, tabs: Tab[], tab: Tab): void {
    // keep the box you were typing in (an edit rebuilds the panel)
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active && this.root.contains(active) ? active.dataset.focus : undefined;
    const scroll = this.body.scrollTop;
    this.title.textContent = l.name;
    this.tabsEl.replaceChildren(...tabs.map((t) => {
      const b = el('button', { type: 'button', role: 'tab', class: 'mi-tab', 'aria-selected': String(t === tab), 'data-tab': t }, TAB_LABEL[t]);
      b.addEventListener('click', () => {
        this.tab = t;
        try { localStorage.setItem(TAB_KEY, t); } catch { /* session only */ }
        this.shape = ''; this.update();
      });
      return b;
    }));
    const box = el('div', { class: 'mi-section' });
    ({
      layer: () => this.layerTab(box, l),
      transform: () => this.transformTab(box, l),
      parent: () => this.parentTab(box, l),
      path: () => this.pathTab(box, l),
      trail: () => this.effectsTab(box, l, true),
      effects: () => this.effectsTab(box, l, false),
      caption: () => this.captionTab(box, l),
      instance: () => this.instanceTab(box, l),
    })[tab]();
    this.body.replaceChildren(box);
    this.body.scrollTop = scroll;
    if (focusKey) this.body.querySelector<HTMLElement>(`[data-focus="${CSS.escape(focusKey)}"]`)?.focus();
  }

  private group(box: HTMLElement, label: string, open = true): HTMLElement {
    const d = el('details', { class: 'mi-group' });
    d.open = open;
    d.append(el('summary', {}, label));
    box.append(d);
    return d;
  }

  private field(box: HTMLElement, label: string, control: HTMLElement): void {
    const r = el('label', { class: 'mi-field' });
    r.append(el('span', { class: 'mi-label' }, label), control);
    box.append(r);
  }

  private button(box: HTMLElement, label: string, run: () => void, disabled = false): HTMLButtonElement {
    const b = el('button', { type: 'button', class: 'mi-btn' }, label);
    b.disabled = disabled;
    b.addEventListener('click', run);
    box.append(b);
    return b;
  }

  /**
   * One keyable setting: its name, a ◆ (key at the playhead), a number box per part (X / Y for a
   * point) and, when it has a range, a slider that drags live and is one undo step when let go.
   */
  private prop(box: HTMLElement, l: Layer, n: PropKey, label: string, r: Range): void {
    const ed = this.ed;
    const row = el('div', { class: 'mi-prop', 'data-prop': n });
    const key = el('button', { type: 'button', class: 'mi-key', 'data-key': n, 'aria-label': `Keyframe for ${label}` }, '◆');
    key.disabled = l.locked;
    key.addEventListener('click', () => ed.toggleKey(l.id, n));
    row.append(key, el('span', { class: 'mi-label' }, label));
    const v = ed.valueNow(l, n);
    const parts = Array.isArray(v) ? 2 : 1;
    const storedOf = (x: number) => (n === 'remap' ? Math.max(0, Math.min(ed.contentLength(l) - 1, Math.round(x) - 1)) : r.min !== undefined && r.max !== undefined && !Array.isArray(v) ? Math.max(r.min, Math.min(r.max, x)) : x);
    const nums = el('span', { class: 'mi-nums' });
    for (let i = 0; i < parts; i++) {
      const input = el('input', { type: 'number', class: 'mi-num', step: String(r.step ?? 1), 'data-val': n, 'data-i': String(i), 'data-focus': `${n}#${i}`, 'aria-label': parts > 1 ? `${label} ${i ? 'Y' : 'X'}` : label, 'data-own-keys': '' });
      input.disabled = l.locked;
      input.addEventListener('change', () => {
        const x = Number(input.value);
        if (!Number.isFinite(x)) { this.shape = ''; this.update(); return; }
        const now = ed.valueNow(l, n);
        const next: number | Vec2 = Array.isArray(now) ? (i ? [now[0], x] : [x, now[1]]) : storedOf(x);
        ed.setValue(l.id, n, next, `Change ${label.toLowerCase()}`);
      });
      if (parts > 1) nums.append(el('span', { class: 'mi-axis' }, i ? 'Y' : 'X'));
      nums.append(input);
    }
    if (r.unit) nums.append(el('span', { class: 'mi-unit' }, r.unit));
    row.append(nums);
    box.append(row);
    if (parts === 1 && r.min !== undefined && r.max !== undefined) {
      const s = el('input', { type: 'range', class: 'mi-slider', min: String(r.min), max: String(r.max), step: String(r.step ?? 1), 'data-slide': n, 'aria-label': label });
      s.disabled = l.locked;
      const begin = () => { if (!this.scrubbing) { this.scrubbing = true; ed.scrubStart(); } };
      s.addEventListener('pointerdown', begin);
      s.addEventListener('input', () => { begin(); ed.scrubSet(l.id, n, storedOf(Number(s.value))); this.refresh(l); });
      s.addEventListener('change', () => { this.scrubbing = false; ed.scrubEnd(`Change ${label.toLowerCase()}`); });
      s.addEventListener('pointercancel', () => { if (this.scrubbing) { this.scrubbing = false; ed.scrubEnd('', true); } });
      box.append(s);
    }
  }

  /** Live values and keys at the playhead (every update; boxes you are typing in are left alone). */
  private refresh(l: Layer): void {
    const ed = this.ed, active = document.activeElement;
    for (const input of this.body.querySelectorAll<HTMLInputElement>('input[data-val]')) {
      if (input === active) continue;
      const n = input.dataset.val as PropKey, v = ed.valueNow(l, n), i = Number(input.dataset.i);
      const x = Array.isArray(v) ? v[i]! : n === 'remap' ? v + 1 : v;
      input.value = String(Math.round(x * 100) / 100);
    }
    for (const s of this.body.querySelectorAll<HTMLInputElement>('input[data-slide]')) {
      if (s === active && this.scrubbing) continue;
      const v = ed.valueNow(l, s.dataset.slide as PropKey);
      if (!Array.isArray(v)) s.value = String(v);
    }
    for (const k of this.body.querySelectorAll<HTMLElement>('[data-key]')) {
      const n = k.dataset.key as PropKey, p = ed.getProp(l, n), on = p.keys.some((x) => x.f === ed.frameOf(l, n));
      k.classList.toggle('anim', isAnimated(p));
      k.classList.toggle('on', on);
      k.title = on ? 'Remove the keyframe at the playhead' : 'Add a keyframe at the playhead';
    }
  }

  private range(n: PropKey): Range {
    if (n === 'opacity' || n.endsWith('.opacity')) return { min: 0, max: 100, unit: '%' };
    if (n === 'scale') return { unit: '%' };
    if (n === 'rotation') return { min: -360, max: 360, unit: '°' };
    if (n === 'zoom') return { min: 10, max: 400, unit: '%' };
    if (n === 'remap') return { min: 1, unit: '' };
    return { unit: 'px', step: 1 };
  }

  // -------------------------------------------------------------------------------------------
  // Tabs

  private layerTab(box: HTMLElement, l: Layer): void {
    const ed = this.ed, app = this.app;
    const name = el('input', { type: 'text', class: 'mi-text', 'data-focus': 'name', 'data-own-keys': '' });
    name.value = l.name;
    name.addEventListener('change', () => { const v = name.value.trim(); if (v && v !== l.name) ed.rename(l.id, v); });
    this.field(box, 'Name', name);
    const check = (label: string, on: boolean, set: (v: boolean) => void, disabled = false) => {
      const c = el('input', { type: 'checkbox', class: 'mi-check' });
      c.checked = on; c.disabled = disabled;
      c.addEventListener('change', () => set(c.checked));
      this.field(box, label, c);
    };
    check('Visible', l.visible, (v) => ed.setFlag(l.id, 'visible', v));
    check('Locked', l.locked, (v) => ed.setFlag(l.id, 'locked', v));
    if (l.kind !== 'camera' && l.kind !== 'null') {
      const blend = el('select', { class: 'mi-select', 'aria-label': 'Blend mode' });
      for (const b of BLEND_MODES) blend.append(el('option', { value: b }, `${b[0]!.toUpperCase()}${b.slice(1)}`));
      blend.value = l.blend;
      blend.disabled = l.locked;
      blend.addEventListener('change', () => {
        const m = blend.value as BlendMode;
        ed.edit('Blend mode', (c) => { const x = c.layers.find((y) => y.id === l.id); if (x) x.blend = m; });
      });
      this.field(box, 'Blend', blend);
    }
    this.field(box, 'Parent', this.parentSelect(l));
    if (l.kind === 'drawings' && !l.adjust && !l.guide && !l.notes && !l.title) check('Tween vector lines', !!l.tweenVectors, (v) => ed.setVectorTween(l.id, v), l.locked);
    const more = el('div', { class: 'mi-actions' });
    if (l.kind === 'drawings' || l.kind === 'comp') this.button(more, (l.effects ?? []).length ? 'Effects card…' : 'Add an effect…', () => app.openEffects?.(l.id));
    if (l.kind === 'drawings' && l.caption) this.button(more, 'Edit caption…', () => app.editCaption(l.id));
    this.button(more, 'Animate along a path…', () => { ed.select(l.id); ed.setDrawingPath(true); }, l.locked);
    box.append(more);
  }

  /** A drop-down of the layers this one can follow ("No parent" first). */
  private parentSelect(l: Layer): HTMLSelectElement {
    const ed = this.ed;
    const s = el('select', { class: 'mi-select', 'aria-label': 'Parent layer' });
    s.append(el('option', { value: '' }, 'No parent'));
    for (const x of ed.comp.layers) if (x.id !== l.id) s.append(el('option', { value: x.id }, x.name));
    s.value = l.parent ?? '';
    s.disabled = l.locked;
    s.addEventListener('change', () => {
      if (!ed.setParentOf(l.id, s.value || null)) { this.app.onNotice?.('That layer already follows this one, so it cannot be its parent.'); this.shape = ''; this.update(); }
    });
    return s;
  }

  private transformTab(box: HTMLElement, l: Layer): void {
    const rows = propsOf(l).filter((n) => n !== 'remap');
    for (const n of rows) this.prop(box, l, n, PROP_LABEL[n], this.range(n));
    if (l.kind !== 'camera') this.prop(box, l, 'anchor', PROP_LABEL.anchor, { unit: 'px' });
    if ((l.kind === 'drawings' && !l.adjust) || l.kind === 'comp') this.prop(box, l, 'remap', 'Show frame', { min: 1, unit: `of ${this.ed.contentLength(l)}` });
    if (l.kind === 'drawings' && !l.adjust) {
      for (const part of PART_NAMES) {
        const g = this.group(box, PART_LABEL[part], false);
        this.prop(g, l, `${part}.opacity`, `${PART_LABEL[part]} opacity`, { min: 0, max: 100, unit: '%' });
        this.prop(g, l, `${part}.offset`, `${PART_LABEL[part]} offset`, { unit: 'px' });
      }
    }
  }

  private parentTab(box: HTMLElement, l: Layer): void {
    const ed = this.ed;
    this.field(box, 'Follows', this.parentSelect(l));
    if (l.parent) {
      const p = ed.layer(l.parent);
      if (p) this.button(box, `Select ${p.name}`, () => ed.select(p.id));
    }
    const kids = ed.comp.layers.filter((x) => x.parent === l.id);
    if (kids.length) {
      const g = this.group(box, `Followed by ${kids.length} layer${kids.length === 1 ? '' : 's'}`);
      for (const k of kids) {
        const r = el('div', { class: 'mi-child' });
        r.append(el('span', {}, k.name));
        this.button(r, 'Select', () => ed.select(k.id));
        this.button(r, 'Unlink', () => ed.setParentOf(k.id, null), k.locked);
        g.append(r);
      }
    }
  }

  private pathTab(box: HTMLElement, l: Layer): void {
    const ed = this.ed, pos = l.transform.position;
    box.append(el('p', { class: 'hint' }, `Moves through ${pos.keys.length} position key${pos.keys.length === 1 ? '' : 's'}.`));
    const check = (label: string, on: boolean, set: (v: boolean) => void, disabled = false) => {
      const c = el('input', { type: 'checkbox', class: 'mi-check' });
      c.checked = on; c.disabled = disabled || l.locked;
      c.addEventListener('change', () => set(c.checked));
      this.field(box, label, c);
    };
    check('Even speed', !!pos.even, (v) => ed.setEvenSpeed(l.id, v), pos.keys.length < 2);
    check('Turn along the path', !!l.transform.orient, (v) => ed.setOrient(l.id, v));
    const more = el('div', { class: 'mi-actions' });
    this.button(more, ed.pathEditing ? 'Finish editing the path' : 'Edit the path on the canvas', () => { ed.select(l.id); ed.setPathEditing(!ed.pathEditing); this.app.requestRender(); }, l.locked || pos.keys.length < 2);
    this.button(more, 'Draw a new path…', () => { ed.select(l.id); ed.setDrawingPath(true); }, l.locked);
    box.append(more);
  }

  /** Every effect (or only the trail ones), each a group of its settings, keyable ones with a ◆. */
  private effectsTab(box: HTMLElement, l: Layer, trailsOnly: boolean): void {
    if (l.kind !== 'drawings' && l.kind !== 'comp') return;
    const list = (l.effects ?? []).filter((e) => !trailsOnly || isTrail(e));
    for (const e of list) {
      const def = effectDef(e.type);
      const g = this.group(box, `${plainName(def)}${e.on ? '' : ' (off)'}`);
      const on = el('input', { type: 'checkbox', class: 'mi-check' });
      on.checked = e.on; on.disabled = l.locked;
      on.addEventListener('change', () => this.setEffect(l, e.id, (x) => { x.on = on.checked; }, on.checked ? 'Effect on' : 'Effect off'));
      this.field(g, 'On', on);
      for (const s of keyableSettings(e.type)) {
        const x = def.extras?.find((d) => d.key === s.key);
        this.prop(g, l, `fx:${e.id}:${s.key}`, s.label, { min: s.min, max: s.max, step: x?.kind === 'range' ? x.step : undefined, unit: s.unit.trim() });
      }
      for (const x of def.extras ?? []) {
        if (x.kind === 'choice') {
          const sel = el('select', { class: 'mi-select', 'aria-label': x.label });
          for (const o of x.options) sel.append(el('option', { value: o.id }, o.label));
          sel.value = String(param<string>(e, x.key));
          sel.disabled = l.locked;
          sel.addEventListener('change', () => this.setEffect(l, e.id, (y) => { y.params = { ...y.params, [x.key]: sel.value }; }, `Change ${x.label.toLowerCase()}`));
          this.field(g, x.label, sel);
        } else if (x.kind === 'toggle') {
          const c = el('input', { type: 'checkbox', class: 'mi-check' });
          c.checked = !!param<boolean>(e, x.key); c.disabled = l.locked;
          c.addEventListener('change', () => this.setEffect(l, e.id, (y) => { y.params = { ...y.params, [x.key]: c.checked }; }, `Change ${x.label.toLowerCase()}`));
          this.field(g, x.label, c);
        } else if (x.kind === 'color') {
          const c = el('input', { type: 'color', class: 'mi-color', 'aria-label': x.label });
          c.value = String(param<string>(e, x.key) || x.def); c.disabled = l.locked;
          c.addEventListener('change', () => this.setEffect(l, e.id, (y) => { y.params = { ...y.params, [x.key]: c.value }; }, `Change ${x.label.toLowerCase()}`));
          this.field(g, x.label, c);
        }
      }
    }
    const more = el('div', { class: 'mi-actions' });
    this.button(more, 'Open the Effects card…', () => this.app.openEffects?.(l.id));
    box.append(more);
  }

  /** One undo step on one effect's still settings. */
  private setEffect(l: Layer, id: string, patch: (e: LayerEffect) => void, label: string): void {
    effectPreview.delete(l.id);
    this.ed.edit(label, (c) => {
      const x = c.layers.find((y) => y.id === l.id);
      const e = x && (x.kind === 'drawings' || x.kind === 'comp') ? x.effects?.find((y) => y.id === id) : undefined;
      if (e) patch(e);
    });
    this.app.requestRender();
  }

  private captionTab(box: HTMLElement, l: Layer): void {
    if (l.kind !== 'drawings' || !l.caption) return;
    const text = l.caption.text.split('\n')[0] ?? '';
    box.append(el('p', { class: 'hint mi-quote' }, `“${text.length > 60 ? `${text.slice(0, 60)}…` : text}”`));
    for (const k of CAPTION_KEYS) {
      this.prop(box, l, `cap:${k.key}`, k.label, { min: k.min, max: k.max, unit: k.unit });
    }
    const more = el('div', { class: 'mi-actions' });
    this.button(more, 'Edit caption…', () => this.app.editCaption(l.id));
    box.append(more);
  }

  private instanceTab(box: HTMLElement, l: Layer): void {
    for (const n of this.ed.rowsOf(l).filter((x) => x.startsWith('pin:'))) {
      const kind = this.ed.rowProp(n);
      this.prop(box, l, n, this.ed.rowLabel(l, n), this.range(kind));
    }
  }
}
