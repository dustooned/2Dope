import type { App } from '../app';
import { isAnimated, type Vec2 } from '../core/anim';
import { BLEND_MODES, layerEnd, PART_LABEL, PART_NAMES, partOf, PLAY_MODES, type BlendMode, type DrawingsLayer, type Layer, type PartName, type PlayMode } from '../core/comp';
import { DITHER_METHODS, PALETTES } from '../core/dither';
import { CAPTION_TARGET_NAMES, effectDef, effectPreview, keyableSettings, outlineTrail, param, plainName, TARGET_NAMES, temporalEffect, TEXTURE_STYLES, type EffectTarget, type LayerEffect } from '../core/effects';
import { newSeed } from '../core/rng';
import { BALLOON_STYLES, CAPTION_KEYS, LETTER_SIZES, type CaptionSpec } from '../lettering/spec';
import { BUNDLED_FONTS } from '../lettering/fonts';
import { PROP_LABEL, propsOf, type PropKey } from '../compedit';
import { el } from './dom';

const OPEN_KEY = '2dope.motion.inspector';
const TAB_KEY = '2dope.motion.inspector.tab';

type Tab = 'layer' | 'timing' | 'transform' | 'drawing' | 'caption' | 'title' | 'clip' | 'camera' | 'parent' | 'path' | 'trail' | 'effects';
const TAB_LABEL: Record<Tab, string> = {
  layer: 'Layer', timing: 'Timing', transform: 'Transform', drawing: 'Drawing', caption: 'Caption', title: 'Title', clip: 'Clip', camera: 'Camera',
  parent: 'Parenting', path: 'Path', trail: 'Trail', effects: 'Effects',
};

/** The timeline label colours (index 0 = none), as in Motion. */
const LABELS = ['#9a9aa8', '#ff5a8a', '#ffd24a', '#4aa3ff', '#4ade80', '#c084fc', '#fb923c'];
const PLAY_LABEL: Record<PlayMode, string> = { once: 'Once', loop: 'Loop', pingpong: 'Ping-pong', single: 'Hold one frame' };
const STYLE_LABEL: Record<string, string> = { speech: 'Speech', thought: 'Thought', shout: 'Shout', whisper: 'Whisper', box: 'Caption box', sfx: 'Sound effect', custom: 'Custom shape' };
const cap1 = (s: string) => `${s[0]!.toUpperCase()}${s.slice(1)}`;

/** How a number row reads and how far its slider goes (no slider without a range). */
interface Range { min?: number; max?: number; step?: number; unit: string }

/** What Motion offers the Inspector (set after Motion is built, so read when used). */
export interface InspectorHost {
  editClip(id: string): void;
  openSymbol: ((id: string) => void) | null;
  clipPlayback: ((id: string, mode: 'once' | 'loop' | 'hold') => void) | null;
  openCameraMove: (() => void) | null;
}

/** Effects that leave a trail behind the art (Echo, Motion blur, Fringe, an Outline in Trail mode). */
const isTrail = (e: LayerEffect) => temporalEffect(e.type) || e.type === 'fringe' || outlineTrail(e);

/**
 * Motion's Inspector: everything about the selected layer in one panel on the right, ready to type,
 * pick, drag or key. Its tabs follow the layer: Layer, Timing and Transform for every layer; a tab of
 * its own kind (Drawing, Caption, Title, Clip or Camera) with the options only that kind has; and
 * Parenting, Path, Trail and Effects once it has them. Each ◆ keys a setting at the playhead.
 */
export class MotionInspector {
  readonly root = el('aside', { class: 'minspector', 'aria-label': 'Inspector', hidden: '' });
  private readonly tabsEl = el('div', { class: 'mi-tabs', role: 'tablist', 'aria-label': 'Inspector sections' });
  private readonly body = el('div', { class: 'mi-body', role: 'tabpanel' });
  private readonly title = el('strong', { class: 'mi-title' });
  private readonly kindEl = el('span', { class: 'mi-kind' });
  private tab: Tab = (() => { try { return (localStorage.getItem(TAB_KEY) as Tab | null) ?? 'transform'; } catch { return 'transform'; } })();
  private shown = (() => { try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; } })();
  private shape = '';
  private scrubbing = false;
  /** Called when the Inspector opens or closes (Motion's button shows it). */
  onToggle: () => void = () => {};

  constructor(private readonly app: App, host: HTMLElement, private readonly motion: InspectorHost) {
    const head = el('div', { class: 'mi-head' });
    const close = el('button', { type: 'button', class: 'mi-close', 'aria-label': 'Close the Inspector', title: 'Close the Inspector' }, '✕');
    close.addEventListener('click', () => this.toggle(false));
    const names = el('div', { class: 'mi-names' });
    names.append(this.title, this.kindEl);
    head.append(names, close);
    this.root.append(head, this.tabsEl, this.body);
    host.append(this.root);
    // a typed value goes in when you leave the box or press Enter (Escape puts it back)
    this.body.addEventListener('keydown', (e) => {
      const t = e.target as HTMLInputElement;
      if (t.tagName !== 'INPUT' || (t.type !== 'number' && t.type !== 'text')) return;
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

  /** What kind of layer this is, in words. */
  private kindOf(l: Layer): string {
    if (l.kind === 'camera') return 'Camera';
    if (l.kind === 'null') return 'Anchor (moves the layers linked to it)';
    if (l.kind === 'comp') {
      const n = this.app.project.comps.get(l.comp);
      return `${n?.asset ? 'Asset' : 'Clip'} · ${n?.name ?? '?'}`;
    }
    const tags = [l.caption ? (l.caption.style === 'sfx' ? 'Sound effect' : 'Caption') : l.title ? 'Title' : l.adjust ? 'Adjustment' : 'Drawing'];
    if (l.guide) tags.push(l.notes ? 'notes' : 'guide');
    if (l.still) tags.push('still');
    if (l.cel) tags.push('linked art');
    return tags.join(' · ');
  }

  /** The tabs this layer has, in order. */
  private tabsOf(l: Layer): Tab[] {
    const tabs: Tab[] = ['layer', 'timing', 'transform'];
    if (l.kind === 'drawings') {
      if (l.caption) tabs.push('caption');
      else if (l.title) tabs.push('title');
      else if (!l.adjust) tabs.push('drawing');
    }
    if (l.kind === 'comp') tabs.push('clip');
    if (l.kind === 'camera') tabs.push('camera');
    if (l.parent || this.ed.comp.layers.some((x) => x.parent === l.id)) tabs.push('parent');
    if (l.transform.position.keys.length > 1 || l.transform.orient) tabs.push('path');
    const fx = l.kind === 'drawings' || l.kind === 'comp' ? (l.effects ?? []) : [];
    if (fx.some(isTrail)) tabs.push('trail');
    if (fx.length) tabs.push('effects');
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
        this.kindEl.textContent = '';
        this.tabsEl.replaceChildren();
        this.body.replaceChildren(el('p', { class: 'hint' }, 'Select a layer to see all of its settings here.'));
      }
      return;
    }
    const tabs = this.tabsOf(l);
    const tab = tabs.includes(this.tab) ? this.tab : 'transform';
    const shape = `${l.id}|${this.ed.comp.id}|${this.ed.rev}|${tab}|${tabs.join(',')}|${this.ed.throughCamera}|${this.ed.pathEditing}`;
    if (shape !== this.shape && !this.scrubbing) {
      this.shape = shape;
      this.build(l, tabs, tab);
    }
    this.refresh(l);
  }

  // -------------------------------------------------------------------------------------------
  // Building blocks

  private build(l: Layer, tabs: Tab[], tab: Tab): void {
    // keep the box you were typing in (an edit rebuilds the panel)
    const active = document.activeElement as HTMLElement | null;
    const focusKey = active && this.root.contains(active) ? active.dataset.focus : undefined;
    const scroll = this.body.scrollTop;
    this.title.textContent = l.name;
    this.kindEl.textContent = this.kindOf(l);
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
      timing: () => this.timingTab(box, l),
      transform: () => this.transformTab(box, l),
      drawing: () => this.drawingTab(box, l),
      caption: () => this.captionTab(box, l),
      title: () => this.titleTab(box, l),
      clip: () => this.clipTab(box, l),
      camera: () => this.cameraTab(box, l),
      parent: () => this.parentTab(box, l),
      path: () => this.pathTab(box, l),
      trail: () => this.effectsTab(box, l, true),
      effects: () => this.effectsTab(box, l, false),
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

  private field(box: HTMLElement, label: string, control: HTMLElement, hint = ''): void {
    const r = el('label', { class: 'mi-field' });
    if (hint) r.title = hint;
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

  private actions(box: HTMLElement): HTMLElement {
    const a = el('div', { class: 'mi-actions' });
    box.append(a);
    return a;
  }

  private check(box: HTMLElement, label: string, on: boolean, set: (v: boolean) => void, disabled = false, hint = ''): void {
    const c = el('input', { type: 'checkbox', class: 'mi-check', 'aria-label': label });
    c.checked = on; c.disabled = disabled;
    c.addEventListener('change', () => set(c.checked));
    this.field(box, label, c, hint);
  }

  private select<T extends string>(box: HTMLElement, label: string, options: readonly (readonly [T, string])[], value: T, set: (v: T) => void, disabled = false): HTMLSelectElement {
    const s = el('select', { class: 'mi-select', 'aria-label': label });
    for (const [v, t] of options) s.append(el('option', { value: v }, t));
    s.value = value; s.disabled = disabled;
    s.addEventListener('change', () => set(s.value as T));
    this.field(box, label, s);
    return s;
  }

  private colour(box: HTMLElement, label: string, value: string, set: (v: string) => void, disabled = false): void {
    const c = el('input', { type: 'color', class: 'mi-color', 'aria-label': label });
    c.value = value; c.disabled = disabled;
    c.addEventListener('change', () => set(c.value));
    this.field(box, label, c);
  }

  /** A plain (not keyable) number, set when you leave the box. */
  private number(box: HTMLElement, label: string, value: number, set: (v: number) => void, o: { min?: number; max?: number; step?: number; unit?: string; focus: string; disabled?: boolean }): void {
    const wrap = el('span', { class: 'mi-nums' });
    const i = el('input', { type: 'number', class: 'mi-num', step: String(o.step ?? 1), 'data-focus': o.focus, 'aria-label': label, 'data-own-keys': '' });
    if (o.min !== undefined) i.min = String(o.min);
    if (o.max !== undefined) i.max = String(o.max);
    i.value = String(Math.round(value * 1000) / 1000); i.disabled = !!o.disabled;
    i.addEventListener('change', () => {
      let v = Number(i.value);
      if (!Number.isFinite(v)) { this.shape = ''; this.update(); return; }
      if (o.min !== undefined) v = Math.max(o.min, v);
      if (o.max !== undefined) v = Math.min(o.max, v);
      set(v);
    });
    wrap.append(i);
    if (o.unit) wrap.append(el('span', { class: 'mi-unit' }, o.unit));
    this.field(box, label, wrap);
  }

  /** One undo step on the layer itself. */
  private editLayer(l: Layer, label: string, fn: (x: Layer) => void): void {
    this.ed.edit(label, (c) => { const x = c.layers.find((y) => y.id === l.id); if (x) fn(x); });
    this.app.requestRender();
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
    return { unit: 'px', step: 1 };
  }

  // -------------------------------------------------------------------------------------------
  // Tabs every layer has

  private layerTab(box: HTMLElement, l: Layer): void {
    const ed = this.ed, app = this.app, locked = l.locked;
    const name = el('input', { type: 'text', class: 'mi-text', 'data-focus': 'name', 'data-own-keys': '', 'aria-label': 'Layer name' });
    name.value = l.name;
    name.addEventListener('change', () => { const v = name.value.trim(); if (v && v !== l.name) ed.rename(l.id, v); });
    this.field(box, 'Name', name);
    this.check(box, 'Visible', l.visible, (v) => ed.setFlag(l.id, 'visible', v));
    this.check(box, 'Locked', l.locked, (v) => ed.setFlag(l.id, 'locked', v));
    const label = this.select(box, 'Colour label', LABELS.map((_, i) => [String(i), i ? `Colour ${i}` : 'None'] as const), String(l.label), (v) => ed.setLabel(l.id, Number(v)));
    label.style.borderLeft = `6px solid ${LABELS[l.label] ?? LABELS[0]}`;
    if (l.kind !== 'camera' && l.kind !== 'null') {
      this.select<BlendMode>(box, 'Blend', BLEND_MODES.map((b) => [b, cap1(b)] as const), l.blend, (m) => this.editLayer(l, 'Blend mode', (x) => { x.blend = m; }), locked);
    }
    this.field(box, 'Parent', this.parentSelect(l));
    this.button(this.actions(box), 'Duplicate', () => ed.duplicate(l.id), locked);
    if (l.kind === 'drawings') {
      const g = this.group(box, 'Drawing layer options');
      const flip = (key: 'clip' | 'alphaLock', label: string) => (v: boolean) => this.editLayer(l, v ? label : `${label} off`, (x) => { if (x.kind !== 'drawings') return; if (v) x[key] = true; else delete x[key]; });
      if (!l.guide && !l.adjust) this.check(g, 'Clipping mask', !!l.clip, flip('clip', 'Clipping mask'), locked, 'Show only where the layer below has paint');
      if (!l.adjust && !l.caption && !l.title) this.check(g, 'Alpha lock', !!l.alphaLock, flip('alphaLock', 'Alpha Lock'), locked, 'Brushes change only pixels that already have paint');
      if (!l.adjust && !l.caption) this.check(g, 'Reference', !!l.reference, (v) => app.setReference(l.id, v), locked, 'Fill and ColorDrop on any layer use this layer’s lines as edges');
      this.check(g, 'Adjustment layer', !!l.adjust, (v) => ed.setAdjust(l.id, v), locked, 'Its effects work on everything below it');
      if (l.guide) this.check(g, 'Include in exports', !!l.guideExport, (v) => this.editLayer(l, v ? 'Guide in exports' : 'Guide left out of exports', (x) => { if (v) x.guideExport = true; else delete x.guideExport; }), locked, 'A guide layer is left out of exports unless this is on');
      if (!l.guide && !l.adjust) {
        const m = this.actions(g);
        if (l.mask) {
          this.button(m, 'Edit mask', () => { app.focusLayer(l.id); app.setWorkspace('draw'); app.setMaskEditing(true); });
          this.button(m, 'Delete mask', () => { app.focusLayer(l.id); app.deleteMask(); });
        } else this.button(m, 'Add a mask…', () => { app.focusLayer(l.id); app.addMask(); app.setWorkspace('draw'); app.setMaskEditing(true); }, locked);
      }
    }
    const more = this.actions(box);
    if (l.kind === 'drawings' || l.kind === 'comp') this.button(more, (l.effects ?? []).length ? 'Effects card…' : 'Add an effect…', () => app.openEffects?.(l.id));
    this.button(more, 'Animate along a path…', () => { ed.select(l.id); ed.setDrawingPath(true); }, locked);
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

  /** Where the layer sits in time and how its own frames play. Frames count from 1, as on the timeline. */
  private timingTab(box: HTMLElement, l: Layer): void {
    const ed = this.ed, locked = l.locked, comps = this.app.project.comps;
    const end = layerEnd(l, comps, ed.comp.fps);
    const g = this.group(box, 'On the timeline');
    this.number(g, 'Starts at frame', l.start + 1, (v) => ed.setTiming(l.id, { start: v - 1 }, 'Move layer'), { focus: 'start', disabled: locked });
    this.number(g, 'Shows from frame', l.in + 1, (v) => ed.setTiming(l.id, { in: Math.max(0, v - 1) }, 'Trim layer start'), { min: 1, focus: 'in', disabled: locked });
    if (l.out !== null || Number.isFinite(end)) {
      this.number(g, 'Shows to frame', (l.out ?? end) as number, (v) => ed.setTiming(l.id, { out: v }, 'Trim layer end'), { min: l.in + 1, focus: 'out', disabled: locked });
    }
    this.check(g, 'Ends with its content', l.out === null, (v) => ed.setTiming(l.id, { out: v ? null : (Number.isFinite(end) ? end : l.in + ed.comp.fps) }, v ? 'Layer ends with its content' : 'Set layer end'), locked, l.kind === 'camera' || l.kind === 'null' ? 'Cameras and anchors last the whole shot' : 'Off: the layer ends where you set it (a one-shot then holds its last frame)');
    if (l.kind === 'drawings' || l.kind === 'comp') {
      const len = ed.contentLength(l);
      const p = this.group(box, 'Playback of its own frames');
      p.append(el('p', { class: 'hint' }, `${len} frame${len === 1 ? '' : 's'} of its own.`));
      this.select<PlayMode>(p, 'Plays', PLAY_MODES.map((m) => [m, PLAY_LABEL[m]] as const), l.play, (m) => ed.setPlay(l.id, m), locked || !!l.timeRemap?.keys.length);
      this.number(p, 'Speed', l.speed, (v) => ed.setPlay(l.id, l.play, { speed: v }), { min: 0.05, max: 8, step: 0.05, unit: '×', focus: 'speed', disabled: locked });
      if (l.play === 'single') this.number(p, 'Held frame', l.single + 1, (v) => ed.setPlay(l.id, 'single', { single: Math.max(0, Math.min(len - 1, Math.round(v) - 1)) }), { min: 1, max: len, unit: `of ${len}`, focus: 'single', disabled: locked });
      if (!(l.kind === 'drawings' && l.adjust)) {
        p.append(el('p', { class: 'hint' }, 'Show frame picks a frame from the playhead on (key it to swap poses or mouths). With keys it takes over from Plays and Speed.'));
        this.prop(p, l, 'remap', 'Show frame', { min: 1, unit: `of ${len}` });
        if (l.timeRemap?.keys.length) this.button(this.actions(p), 'Stop picking frames', () => ed.clearAnimation(l.id, 'remap'), locked);
      }
    }
  }

  private transformTab(box: HTMLElement, l: Layer): void {
    for (const n of propsOf(l).filter((x) => x !== 'remap')) this.prop(box, l, n, PROP_LABEL[n], this.range(n));
    if (l.kind !== 'camera') this.prop(box, l, 'anchor', PROP_LABEL.anchor, { unit: 'px' });
    const a = this.actions(box);
    if (l.kind !== 'camera') this.button(a, 'Move the anchor on the canvas', () => { this.ed.select(l.id); this.ed.setAnchorEditing(true); this.app.focusCanvas(); }, l.locked || !l.visible);
  }

  // -------------------------------------------------------------------------------------------
  // A tab for each kind of layer

  /** A drawing layer: its frames, and its Ink and Colour parts (show, fade, recolour, shift). */
  private drawingTab(box: HTMLElement, l: Layer): void {
    if (l.kind !== 'drawings') return;
    const ed = this.ed, app = this.app, locked = l.locked;
    const drawings = new Set(l.exposures.map((e) => e.drawing)).size, frames = l.exposures.reduce((n, e) => n + e.length, 0);
    box.append(el('p', { class: 'hint' }, `${drawings} drawing${drawings === 1 ? '' : 's'} over ${frames} frame${frames === 1 ? '' : 's'}${l.still ? ', held for the whole shot' : ''}.`));
    if (!l.guide) this.check(box, 'Tween vector lines', !!l.tweenVectors, (v) => ed.setVectorTween(l.id, v), locked, 'Vector lines that match move smoothly from one drawing to the next');
    for (const part of [...PART_NAMES].reverse()) this.partGroup(box, l, part);
    const a = this.actions(box);
    if (!l.guide) this.button(a, 'Edit in Flipbook', () => app.openFlipbook?.(l.id));
    this.button(a, 'Draw on it', () => { app.focusLayer(l.id); app.setWorkspace('draw'); });
  }

  private partGroup(box: HTMLElement, l: DrawingsLayer, part: PartName): void {
    const ed = this.ed, p = partOf(l, part), label = PART_LABEL[part], locked = l.locked;
    const g = this.group(box, label, !!p.tint || !p.visible);
    this.check(g, `Show ${label.toLowerCase()}`, p.visible, (v) => ed.setPart(l.id, part, { visible: v }), locked);
    this.prop(g, l, `${part}.opacity`, `${label} opacity`, { min: 0, max: 100, unit: '%' });
    this.prop(g, l, `${part}.offset`, `${label} offset`, { unit: 'px' });
    this.check(g, 'Recolour', !!p.tint, (v) => ed.setPart(l.id, part, v ? { tint: part === 'line' ? '#222222' : '#888888' } : { tint: null, grad: null }), locked);
    if (p.tint) {
      this.colour(g, 'Colour', p.tint, (v) => ed.setPart(l.id, part, { tint: v }), locked);
      const style = p.grad?.kind ?? 'flat';
      this.select<'flat' | 'linear' | 'radial'>(g, 'Style', [['flat', 'One colour'], ['linear', 'Linear gradient'], ['radial', 'Radial gradient']], style,
        (k) => ed.setPart(l.id, part, { grad: k === 'flat' ? null : { kind: k, color2: p.grad?.color2 ?? '#ffffff', angle: p.grad?.angle ?? 90 } }), locked);
      if (p.grad) {
        const grad = p.grad;
        this.colour(g, 'Second colour', grad.color2, (v) => ed.setPart(l.id, part, { grad: { ...grad, color2: v } }), locked);
        if (grad.kind === 'linear') this.number(g, 'Direction', grad.angle, (v) => ed.setPart(l.id, part, { grad: { ...grad, angle: v } }), { min: 0, max: 360, step: 5, unit: '°', focus: `${part}.angle`, disabled: locked });
      }
    }
  }

  /** A caption: its words, lettering, balloon and colours, and every setting that animates. */
  private captionTab(box: HTMLElement, l: Layer): void {
    if (l.kind !== 'drawings' || !l.caption) return;
    const c = l.caption, locked = l.locked;
    const set = (label: string, patch: Partial<CaptionSpec>) => this.editLayer(l, label, (x) => { if (x.kind === 'drawings' && x.caption) x.caption = { ...x.caption, ...patch }; });
    const words = el('textarea', { class: 'mi-words', rows: '3', 'data-focus': 'words', 'data-own-keys': '', 'aria-label': 'Caption words' });
    words.value = c.text; words.disabled = locked;
    words.addEventListener('change', () => { if (words.value.trim() && words.value !== c.text) set('Edit caption words', { text: words.value }); });
    box.append(words);
    const letters = this.group(box, 'Lettering');
    const project = this.app.project;
    const fonts: [string, string][] = [...BUNDLED_FONTS.map((f) => [f.id, f.label] as [string, string]), ...[...project.fonts.entries()].map(([id, f]) => [`custom:${id}`, f.name] as [string, string])];
    this.select(letters, 'Font', fonts, c.font, (v) => set('Caption font', { font: v }), locked);
    this.select(letters, 'Size', LETTER_SIZES.map((s) => [s, cap1(s)] as const), c.size, (v) => set('Letter size', { size: v }), locked);
    this.number(letters, 'Size fine-tune', Math.round((c.scale ?? 1) * 100), (v) => set('Letter size', { scale: v / 100 }), { min: 50, max: 300, step: 5, unit: '%', focus: 'scale', disabled: locked });
    this.check(letters, 'Bold', c.bold, (v) => set(v ? 'Bold letters' : 'Plain letters', { bold: v }), locked);
    this.check(letters, 'Italic', c.italic, (v) => set(v ? 'Italic letters' : 'Upright letters', { italic: v }), locked);
    this.check(letters, 'Capitals', c.caps, (v) => set('Capitals', { caps: v }), locked);
    this.select(letters, 'Align', [['center', 'Centre'], ['left', 'Left'], ['right', 'Right']] as const, c.align, (v) => set('Align words', { align: v }), locked);
    this.colour(letters, 'Text colour', c.textColor, (v) => set('Text colour', { textColor: v }), locked);
    this.check(letters, 'Letter outline', !!c.textOutline, (v) => set('Letter outline', { textOutline: v ? '#111111' : null }), locked);
    if (c.textOutline) {
      this.colour(letters, 'Outline colour', c.textOutline, (v) => set('Letter outline colour', { textOutline: v }), locked);
      this.number(letters, 'Outline width', Math.round(c.textOutlineWidth * 100), (v) => set('Letter outline width', { textOutlineWidth: v / 100 }), { min: 0, max: 60, unit: '%', focus: 'tow', disabled: locked });
    }
    const balloon = this.group(box, 'Balloon');
    const styles = BALLOON_STYLES.filter((s) => s !== 'custom' || c.style === 'custom');
    this.select(balloon, 'Style', styles.map((s) => [s, STYLE_LABEL[s] ?? s] as const), c.style, (v) => set('Balloon style', { style: v }), locked);
    this.number(balloon, 'Width', Math.round((c.shape ?? 1) * 100), (v) => set('Balloon width', { shape: v / 100 }), { min: 50, max: 250, step: 5, unit: '%', focus: 'shape', disabled: locked });
    this.colour(balloon, 'Fill', c.fill, (v) => set('Balloon fill', { fill: v }), locked);
    this.colour(balloon, 'Ink', c.ink, (v) => set('Balloon ink', { ink: v }), locked);
    this.number(balloon, 'Ink width', Math.round(c.inkWidth * 100), (v) => set('Balloon ink width', { inkWidth: v / 100 }), { min: 0, max: 60, unit: '%', focus: 'ink', disabled: locked });
    balloon.append(el('p', { class: 'hint' }, `${c.tails.length} tail${c.tails.length === 1 ? '' : 's'}${c.links?.length ? `, ${c.links.length} joined balloon${c.links.length === 1 ? '' : 's'}` : ''}. Tails are shaped on the canvas or in the Caption panel.`));
    const anim = this.group(box, 'Animates');
    for (const k of CAPTION_KEYS) this.prop(anim, l, `cap:${k.key}`, k.label, { min: k.min, max: k.max, unit: k.unit });
    const a = this.actions(box);
    this.button(a, 'Caption panel…', () => this.app.editCaption(l.id));
    this.button(a, 'Export SVG', () => void this.app.exportCaptionSvg(l.id));
    this.button(a, 'Convert to vector lines…', () => void this.app.convertCaptionToVectors(l.id), locked);
  }

  /** A title card: what it says and how it looks (edited in its own panel). */
  private titleTab(box: HTMLElement, l: Layer): void {
    if (l.kind !== 'drawings' || !l.title) return;
    const t = l.title;
    box.append(el('p', { class: 'hint mi-quote' }, `“${t.text.replace(/\n/g, ' / ')}”`));
    const facts: [string, string][] = [['Size', `${t.size} px`], ['Weight', t.weight === 700 ? 'Bold' : 'Regular'], ['Align', cap1(t.align === 'center' ? 'centre' : t.align)], ['Colour', t.fill], ['Outline', t.stroke ? `${t.stroke}, ${t.strokeWidth} px` : 'None']];
    const dl = el('dl', { class: 'mi-facts' });
    for (const [k, v] of facts) dl.append(el('dt', {}, k), el('dd', {}, v));
    box.append(dl);
    const a = this.actions(box);
    this.button(a, 'Edit title…', () => this.app.editTitle?.(l.id), l.locked);
    this.button(a, 'Convert to paint…', () => this.app.convertTitle?.(l.id), l.locked);
  }

  /** A clip or Asset: what it holds, how it plays, its pinned properties, and going inside. */
  private clipTab(box: HTMLElement, l: Layer): void {
    if (l.kind !== 'comp') return;
    const ed = this.ed, n = this.app.project.comps.get(l.comp), locked = l.locked;
    const count = ed.instances(l.comp);
    box.append(el('p', { class: 'hint' }, `${n?.asset ? 'Asset' : 'Clip'} “${n?.name ?? '?'}”: ${n?.layers.length ?? 0} layer${n?.layers.length === 1 ? '' : 's'}, ${n ? `${n.width}×${n.height}, ${n.fps} fps` : ''}. Used ${count} time${count === 1 ? '' : 's'}.`));
    if (n?.asset && this.motion.clipPlayback) {
      const playback = l.timeRemap?.keys.length ? '' : l.play === 'loop' ? 'loop' : l.play === 'once' && l.out !== null && l.out > layerEnd({ ...l, out: null }, this.app.project.comps, ed.comp.fps) ? 'hold' : l.play === 'once' ? 'once' : '';
      this.select<'once' | 'loop' | 'hold' | ''>(box, 'Asset playback', [['once', 'Once'], ['loop', 'Loop'], ['hold', 'Hold last frame'], ...(playback ? [] : [['', 'Custom'] as const])], playback as 'once' | 'loop' | 'hold' | '', (m) => { if (m) this.motion.clipPlayback?.(l.id, m); }, locked || !playback);
    }
    const pins = ed.rowsOf(l).filter((x) => x.startsWith('pin:'));
    if (pins.length) {
      const g = this.group(box, 'Pinned properties');
      for (const p of pins) {
        this.prop(g, l, p, ed.rowLabel(l, p), this.range(ed.rowProp(p)));
        if (ed.isOverridden(l, p)) this.button(this.actions(g), 'Back to the clip’s own value', () => ed.resetPin(l.id, p), locked);
      }
    }
    const a = this.actions(box);
    this.button(a, 'Go inside', () => ed.enter(l.id));
    this.button(a, 'Edit clip', () => this.motion.editClip(l.id));
    if (n?.asset && this.motion.openSymbol) this.button(a, 'Symbol options…', () => this.motion.openSymbol?.(l.id));
    if (count > 1) this.button(a, 'Make unique', () => ed.makeUnique(l.id), locked);
    this.button(a, 'Ungroup', () => { if (!ed.ungroup(l.id)) this.app.onNotice?.('This clip runs at a different frame rate. Change one of them first.'); }, locked);
  }

  private cameraTab(box: HTMLElement, l: Layer): void {
    if (l.kind !== 'camera') return;
    const ed = this.ed;
    box.append(el('p', { class: 'hint' }, 'The top visible camera frames the shot. Zoom 100% shows it as it is.'));
    this.check(box, 'Look through the camera', ed.throughCamera, (v) => { if (ed.pathEditing) ed.setPathEditing(false); ed.throughCamera = v; this.app.requestRender(); ed.onChange(); });
    const a = this.actions(box);
    if (this.motion.openCameraMove) this.button(a, 'Camera move…', () => this.motion.openCameraMove?.(), l.locked);
  }

  // -------------------------------------------------------------------------------------------
  // Tabs that appear when the layer has them

  private parentTab(box: HTMLElement, l: Layer): void {
    const ed = this.ed;
    this.field(box, 'Follows', this.parentSelect(l));
    if (l.parent) {
      const p = ed.layer(l.parent);
      if (p) this.button(this.actions(box), `Select ${p.name}`, () => ed.select(p.id));
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
    this.check(box, 'Even speed', !!pos.even, (v) => ed.setEvenSpeed(l.id, v), l.locked || pos.keys.length < 2);
    this.check(box, 'Turn along the path', !!l.transform.orient, (v) => ed.setOrient(l.id, v), l.locked);
    const more = this.actions(box);
    this.button(more, ed.pathEditing ? 'Finish editing the path' : 'Edit the path on the canvas', () => { ed.select(l.id); ed.setPathEditing(!ed.pathEditing); this.app.requestRender(); }, l.locked || pos.keys.length < 2);
    this.button(more, 'Draw a new path…', () => { ed.select(l.id); ed.setDrawingPath(true); }, l.locked);
  }

  /** Every effect (or only the trail ones), each a group of all its settings; keyable ones have a ◆. */
  private effectsTab(box: HTMLElement, l: Layer, trailsOnly: boolean): void {
    if (l.kind !== 'drawings' && l.kind !== 'comp') return;
    const all = l.effects ?? [], locked = l.locked;
    const caption = l.kind === 'drawings' && !!l.caption;
    for (const e of all.filter((x) => !trailsOnly || isTrail(x))) {
      const def = effectDef(e.type), name = plainName(def), i = all.indexOf(e);
      const g = this.group(box, `${name}${e.on ? '' : ' (off)'}`);
      g.title = def.hint;
      this.check(g, 'On', e.on, (v) => this.setEffect(l, e.id, (x) => { x.on = v; }, v ? `${name} on` : `${name} off`), locked);
      if (l.kind === 'drawings' && !l.adjust && !temporalEffect(e.type)) {
        const names = caption ? CAPTION_TARGET_NAMES : TARGET_NAMES;
        const targets = (caption ? ['text', 'line', 'fill', 'layer'] : ['line', 'fill', 'layer']) as EffectTarget[];
        this.select<EffectTarget>(g, 'Works on', targets.map((t) => [t, names[t]] as const), e.target, (t) => this.setEffect(l, e.id, (x) => { x.target = t; }, `${name} on ${names[t].toLowerCase()}`), locked);
      }
      for (const s of keyableSettings(e.type)) {
        const x = def.extras?.find((d) => d.key === s.key);
        this.prop(g, l, `fx:${e.id}:${s.key}`, s.label, { min: s.min, max: s.max, step: x?.kind === 'range' ? x.step : undefined, unit: s.unit.trim() });
      }
      if (e.type === 'texture') this.select(g, 'Look', TEXTURE_STYLES.map((t) => [t.id, t.label] as const), e.style ?? 'paper', (v) => this.setEffect(l, e.id, (y) => { y.style = v; }, `Texture ${v}`), locked);
      if (e.type === 'dither') {
        this.select(g, 'Colours', PALETTES.map((p) => [p.id, p.label] as const), e.palette ?? 'pico8', (v) => this.setEffect(l, e.id, (y) => { y.palette = v; }, 'Retro pixels colours'), locked);
        this.select(g, 'Dots', DITHER_METHODS.map((p) => [p.id, p.label] as const), e.method ?? 'bayer4', (v) => this.setEffect(l, e.id, (y) => { y.method = v; }, 'Retro pixels dots'), locked);
        this.check(g, 'Grey first', !!e.gray, (v) => this.setEffect(l, e.id, (y) => { y.gray = v; }, 'Retro pixels grey'), locked);
      }
      for (const x of def.extras ?? []) {
        if (x.kind === 'choice') this.select(g, x.label, x.options.map((o) => [o.id, o.label] as const), String(param<string>(e, x.key)), (v) => this.setEffect(l, e.id, (y) => { y.params = { ...y.params, [x.key]: v }; }, `${name} ${x.label.toLowerCase()}`), locked);
        else if (x.kind === 'toggle') this.check(g, x.label, !!param<boolean>(e, x.key), (v) => this.setEffect(l, e.id, (y) => { y.params = { ...y.params, [x.key]: v }; }, `${name} ${x.label.toLowerCase()}`), locked);
        else if (x.kind === 'color') this.colour(g, x.label, String(param<string>(e, x.key) || x.def), (v) => this.setEffect(l, e.id, (y) => { y.params = { ...y.params, [x.key]: v }; }, `${name} ${x.label.toLowerCase()}`), locked);
        else if (x.kind === 'asset') {
          const assets = [...this.app.project.comps.values()].filter((c) => c.asset);
          this.select(g, x.label, [['', 'None'] as const, ...assets.map((c) => [c.id, c.name] as const)], String(param<string>(e, x.key) ?? ''), (v) => this.setEffect(l, e.id, (y) => { y.params = { ...y.params, [x.key]: v }; }, `${name} ${x.label.toLowerCase()}`), locked);
        }
      }
      if (def.animated) this.select(g, 'Changes', [['1', 'Every frame'], ['2', 'On 2s'], ['3', 'On 3s'], ['4', 'On 4s']] as const, String(e.hold) as '1', (v) => this.setEffect(l, e.id, (y) => { y.hold = Number(v); }, `${name} on ${v}s`), locked);
      const a = this.actions(g);
      if ((def.seeded ?? def.animated) || e.type === 'texture') this.button(a, 'New pattern', () => this.setEffect(l, e.id, (y) => { y.seed = newSeed(); }, `${name} new pattern`), locked);
      this.button(a, 'Remove', () => this.editLayer(l, `Remove ${name.toLowerCase()}`, (y) => { if (y.kind === 'drawings' || y.kind === 'comp') { y.effects = (y.effects ?? []).filter((z) => z.id !== e.id); if (!y.effects.length) delete y.effects; } }), locked);
      void i;
    }
    this.button(this.actions(box), 'Open the Effects card…', () => this.app.openEffects?.(l.id));
  }

  /** One undo step on one effect's still settings. */
  private setEffect(l: Layer, id: string, patch: (e: LayerEffect) => void, label: string): void {
    effectPreview.delete(l.id);
    this.editLayer(l, label, (x) => {
      const e = x.kind === 'drawings' || x.kind === 'comp' ? x.effects?.find((y) => y.id === id) : undefined;
      if (e) patch(e);
    });
  }
}
