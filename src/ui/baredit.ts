import { decorate } from './icons';

/**
 * Edit a bar like the Mac Dock or an iPad home screen: the bar's items wiggle and a tray shows what
 * can be added. Drag an item along the bar to reorder it, drag it off the bar (or onto the tray) to
 * remove it, drag a tray item onto the bar (or tap it) to add it. A tap on an item picks it for
 * Remove and ◀ ▶ in the tray; arrow keys move the focused item, Delete removes it. One set of
 * Pointer Events serves the mouse, a pen and a finger alike; Done or Escape ends.
 */

export interface BarItem {
  id: string;
  label: string;
  icon?: string;
}

export interface BarEditTarget {
  /** What the tray calls the bar: "Brush row", "Animate tools". */
  name: string;
  /** The bar element (read again after every rebuild). */
  bar(): HTMLElement;
  /** The bar's editable items, in order. */
  items(bar: HTMLElement): HTMLElement[];
  idOf(item: HTMLElement): string;
  /** Everything that can be on the bar, in its built-in order. */
  available(): BarItem[];
  /** The ids on the bar now, in order. */
  shown(): string[];
  /** Save a new bar (the caller rebuilds it; `refresh()` decorates the new one). */
  apply(shown: string[]): void;
  reset(): void;
  /** Items that cannot leave the bar, with why. */
  keep?: Partial<Record<string, string>>;
  notice?(text: string): void;
  /** Editing ended (Done, Escape, or another bar). */
  onClose?(): void;
}

const MOVE = 6;
/** How far outside the bar a dragged item still counts as on it. */
const SLACK = 28;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};

interface Drag {
  pointerId: number;
  x: number;
  y: number;
  /** The bar item being dragged, or the tray item's id for an add. */
  item: HTMLElement | null;
  id: string;
  moving: boolean;
  ghost: HTMLElement | null;
  /** A gap in the bar where a tray item would land. */
  gap: HTMLElement | null;
  off: boolean;
}

export class BarEditor {
  private target: BarEditTarget | null = null;
  private readonly tray = el('section', 'bar-tray');
  private picked: string | null = null;
  private drag: Drag | null = null;
  /** Until then, the click that follows a tap or drag handled here must not run the tool. */
  private swallowUntil = 0;
  private set swallowClick(on: boolean) { this.swallowUntil = on ? performance.now() + 500 : 0; }

  constructor() {
    this.tray.hidden = true;
    this.tray.setAttribute('role', 'dialog');
    this.tray.setAttribute('aria-label', 'Edit bar');
    document.addEventListener('pointerdown', (e) => this.down(e), true);
    document.addEventListener('pointermove', (e) => this.move(e), true);
    document.addEventListener('pointerup', (e) => this.up(e, false), true);
    document.addEventListener('pointercancel', (e) => this.up(e, true), true);
    document.addEventListener('click', (e) => {
      if (!this.target) return;
      const fresh = performance.now() < this.swallowUntil;
      if ((fresh && !(e.target instanceof Element && e.target.closest('.bar-tray-foot, .bar-tray-pick'))) || this.itemAt(e.target)) { e.stopPropagation(); e.preventDefault(); this.swallowClick = false; }
    }, true);
    document.addEventListener('contextmenu', (e) => { if (this.target && this.itemAt(e.target)) { e.preventDefault(); e.stopPropagation(); } }, true);
    document.addEventListener('keydown', (e) => this.key(e), true);
    window.addEventListener('resize', () => this.place());
  }

  get editing(): boolean {
    return this.target !== null;
  }

  /** The bar being edited is this one (by name). */
  isEditing(name: string): boolean {
    return this.target?.name === name;
  }

  open(target: BarEditTarget): void {
    if (this.target) this.close();
    const r = target.bar().getBoundingClientRect();
    if (!r.width && !r.height) { target.notice?.(`Show ${target.name} first, then edit them.`); target.onClose?.(); return; }
    this.target = target;
    this.picked = null;
    if (!this.tray.isConnected) document.body.append(this.tray);
    this.tray.hidden = false;
    this.refresh();
    this.tray.querySelector<HTMLButtonElement>('.bar-tray-done')?.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.target) return;
    this.cancelDrag();
    this.undecorate();
    const done = this.target.onClose;
    this.target = null;
    this.tray.hidden = true;
    done?.();
  }

  /** After the bar was rebuilt (or the bar changed): decorate it again and redraw the tray. */
  refresh(): void {
    const t = this.target;
    if (!t || this.drag?.moving) return;
    const bar = t.bar();
    if (!bar.isConnected) { this.close(); return; }
    bar.classList.add('bar-editing');
    const shown = t.shown();
    if (this.picked && !shown.includes(this.picked)) this.picked = null;
    for (const item of t.items(bar)) {
      const id = t.idOf(item);
      item.classList.add('bar-edit-item');
      item.classList.toggle('bar-picked', id === this.picked);
      item.tabIndex = 0;
      item.setAttribute('aria-roledescription', 'movable item');
    }
    this.renderTray();
    this.place();
  }

  private undecorate(): void {
    const t = this.target;
    if (!t) return;
    const bar = t.bar();
    bar.classList.remove('bar-editing');
    for (const item of t.items(bar)) {
      item.classList.remove('bar-edit-item', 'bar-picked', 'bar-dragging');
      item.removeAttribute('aria-roledescription');
    }
  }

  private renderTray(): void {
    const t = this.target!;
    const shown = t.shown();
    const avail = t.available();
    const name = (id: string) => avail.find((x) => x.id === id)?.label ?? id;
    const head = el('div', 'bar-tray-head');
    head.append(el('strong', '', `Edit ${t.name}`), el('span', 'bar-tray-hint', 'Drag along the bar to move · drag off to remove · drag ＋ onto the bar, or tap it to put it back'));
    const add = el('div', 'bar-tray-items');
    add.setAttribute('aria-label', 'Add to the bar');
    const missing = avail.filter((x) => !shown.includes(x.id));
    for (const x of missing) {
      const b = el('button', 'bar-tray-item', x.label);
      b.type = 'button';
      b.dataset.add = x.id;
      b.title = `Add ${x.label}: drag it onto the bar, or tap to add it at the end`;
      b.setAttribute('aria-label', `Add ${x.label}`);
      if (x.icon) decorate(b, x.icon);
      add.append(b);
    }
    if (!missing.length) add.append(el('span', 'bar-tray-empty', 'Everything is on the bar. Drag an item off it to put it here.'));
    const pick = el('div', 'bar-tray-pick');
    if (this.picked) {
      const at = shown.indexOf(this.picked);
      const btn = (label: string, aria: string, fn: () => void, disabled = false) => {
        const b = el('button', '', label); b.type = 'button'; b.setAttribute('aria-label', aria); b.disabled = disabled;
        b.addEventListener('click', fn); pick.append(b);
      };
      pick.append(el('span', 'bar-tray-picked', name(this.picked)));
      btn('◀', `Move ${name(this.picked)} earlier`, () => this.shift(this.picked!, -1), at <= 0);
      btn('▶', `Move ${name(this.picked)} later`, () => this.shift(this.picked!, 1), at >= shown.length - 1);
      btn('Remove', `Remove ${name(this.picked)} from the bar`, () => this.remove(this.picked!));
    } else pick.append(el('span', 'bar-tray-hint', 'Tap an item on the bar to move or remove it with buttons.'));
    const foot = el('div', 'bar-tray-foot');
    const reset = el('button', 'bar-tray-reset', 'Reset'); reset.type = 'button'; reset.title = 'Put the built-in bar back';
    reset.addEventListener('click', () => { this.picked = null; t.reset(); this.refresh(); });
    const done = el('button', 'bar-tray-done', 'Done'); done.type = 'button';
    done.addEventListener('click', () => this.close());
    foot.append(reset, done);
    this.tray.replaceChildren(head, add, pick, foot);
    this.tray.classList.toggle('dropping', !!this.drag?.off);
  }

  /** Below the bar when there is room, else above it; always inside the window. */
  private place(): void {
    const t = this.target;
    if (!t || this.tray.hidden) return;
    const r = t.bar().getBoundingClientRect();
    const w = Math.min(420, window.innerWidth - 16);
    this.tray.style.width = `${w}px`;
    const h = this.tray.offsetHeight || 180;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
    const below = r.bottom + 10;
    const top = below + h < window.innerHeight - 8 ? below : Math.max(8, r.top - h - 10);
    this.tray.style.left = `${left}px`;
    this.tray.style.top = `${top}px`;
  }

  // -------------------------------------------------------------------------------------------
  // Changes

  private save(shown: string[]): void {
    const t = this.target!;
    t.apply(shown);
    this.refresh();
  }

  private remove(id: string): void {
    const t = this.target!;
    const why = t.keep?.[id];
    if (why) { t.notice?.(why); return; }
    if (this.picked === id) this.picked = null;
    this.save(t.shown().filter((x) => x !== id));
  }

  private shift(id: string, by: number): void {
    const list = this.target!.shown();
    const at = list.indexOf(id), to = at + by;
    if (at < 0 || to < 0 || to >= list.length) return;
    list.splice(at, 1);
    list.splice(to, 0, id);
    this.save(list);
    this.focusItem(id);
  }

  /** Add an item at `at`, or (a tap) back in its built-in place among what is shown. */
  private add(id: string, at?: number): void {
    const t = this.target!;
    const list = t.shown().filter((x) => x !== id);
    if (at === undefined) {
      const builtIn = t.available().map((x) => x.id);
      const mine = builtIn.indexOf(id);
      const next = list.findIndex((x) => builtIn.indexOf(x) > mine);
      at = next < 0 ? list.length : next;
    }
    list.splice(at, 0, id);
    this.save(list);
  }

  private focusItem(id: string): void {
    const t = this.target;
    if (!t) return;
    t.items(t.bar()).find((x) => t.idOf(x) === id)?.focus({ preventScroll: true });
  }

  // -------------------------------------------------------------------------------------------
  // Pointer: the same for a mouse, a pen and a finger

  private itemAt(node: EventTarget | null): HTMLElement | null {
    const t = this.target;
    if (!t || !(node instanceof Element)) return null;
    const bar = t.bar();
    return t.items(bar).find((x) => x === node || x.contains(node)) ?? null;
  }

  private down(e: PointerEvent): void {
    const t = this.target;
    if (!t || this.drag || e.button > 0) return;
    const item = this.itemAt(e.target);
    const addBtn = e.target instanceof Element ? e.target.closest<HTMLElement>('.bar-tray-item') : null;
    if (!item && !addBtn) return;
    // the bar's own handlers (a tool, a colour drag) must not run while editing
    e.stopPropagation();
    if (item) e.preventDefault();
    this.drag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, item, id: item ? t.idOf(item) : addBtn!.dataset.add!, moving: false, ghost: null, gap: null, off: false };
  }

  private move(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.moving) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < MOVE) return;
      d.moving = true;
      const src = d.item ?? this.tray.querySelector<HTMLElement>(`[data-add="${CSS.escape(d.id)}"]`);
      if (!src) { this.drag = null; return; }
      const g = src.cloneNode(true) as HTMLElement;
      const r = src.getBoundingClientRect();
      g.classList.add('bar-ghost');
      g.classList.remove('bar-picked');
      g.style.width = `${r.width}px`;
      g.style.height = `${r.height}px`;
      document.body.append(g);
      d.ghost = g;
      if (d.item) d.item.classList.add('bar-dragging');
      else { d.gap = el('span', 'bar-gap'); d.gap.style.width = `${r.width}px`; d.gap.style.height = `${r.height}px`; }
    }
    e.preventDefault();
    const g = d.ghost!;
    g.style.left = `${e.clientX - g.offsetWidth / 2}px`;
    g.style.top = `${e.clientY - g.offsetHeight / 2}px`;
    const t = this.target!;
    const bar = t.bar();
    const r = bar.getBoundingClientRect();
    const onBar = e.clientX > r.left - SLACK && e.clientX < r.right + SLACK && e.clientY > r.top - SLACK && e.clientY < r.bottom + SLACK;
    d.off = !onBar;
    g.classList.toggle('removing', d.off && !!d.item);
    this.tray.classList.toggle('dropping', d.off && !!d.item);
    const moving = d.item ?? d.gap!;
    if (!onBar) { if (d.gap) d.gap.remove(); return; }
    // the item whose middle the pointer is before, along the bar's long side
    const across = r.height > r.width * 1.5;
    const others = t.items(bar).filter((x) => x !== d.item);
    const pos = across ? e.clientY : e.clientX;
    const before = others.find((x) => { const b = x.getBoundingClientRect(); return pos < (across ? b.top + b.height / 2 : b.left + b.width / 2); });
    if (before) { if (moving.nextElementSibling !== before) before.before(moving); }
    else { const last = others.at(-1); if (last && last.nextElementSibling !== moving) last.after(moving); else if (!last) bar.prepend(moving); }
  }

  private up(e: PointerEvent, cancel: boolean): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    this.drag = null;
    const t = this.target!;
    d.ghost?.remove();
    this.tray.classList.remove('dropping');
    if (!d.moving) {
      // a tap: pick a bar item (for the tray's buttons), or add a tray item at the end
      if (cancel) return;
      this.swallowClick = !!d.item;
      if (d.item) { this.picked = this.picked === d.id ? null : d.id; this.refresh(); }
      else { this.add(d.id); this.swallowClick = true; }
      return;
    }
    this.swallowClick = true;
    const bar = t.bar();
    if (cancel) { d.gap?.remove(); d.item?.classList.remove('bar-dragging'); t.apply(t.shown()); this.refresh(); return; }
    if (d.item) {
      d.item.classList.remove('bar-dragging');
      if (d.off) { this.remove(d.id); if (t.keep?.[d.id]) this.save(t.shown()); return; }
      this.save(t.items(bar).map((x) => t.idOf(x)));
      this.focusItem(d.id);
      return;
    }
    // a tray item dropped on the bar: where its gap is
    const gap = d.gap;
    if (!gap?.isConnected) return;
    const ids = t.items(bar).map((x) => t.idOf(x));
    const at = [...bar.children].filter((x) => x === gap || t.items(bar).includes(x as HTMLElement)).indexOf(gap);
    gap.remove();
    ids.splice(Math.max(0, at), 0, d.id);
    this.save([...new Set(ids)]);
  }

  private cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    d.ghost?.remove();
    d.gap?.remove();
    d.item?.classList.remove('bar-dragging');
    this.drag = null;
  }

  // -------------------------------------------------------------------------------------------
  // Keys: the focused item moves with the arrows, Delete removes it, Escape ends

  private key(e: KeyboardEvent): void {
    const t = this.target;
    if (!t) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
    const item = this.itemAt(document.activeElement);
    if (!item) return;
    const id = t.idOf(item);
    const back = e.key === 'ArrowLeft' || e.key === 'ArrowUp', fwd = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    if (back || fwd) { e.preventDefault(); e.stopPropagation(); this.shift(id, back ? -1 : 1); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); this.remove(id); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this.picked = this.picked === id ? null : id; this.refresh(); this.focusItem(id); }
  }
}
