/**
 * One context menu for the whole app: right-click with a mouse or pen button, or press and hold
 * with a finger. Each area builds its own items for what is under the pointer, so the menu always
 * shows what makes sense in that mode (frames on the X-sheet, layers in Motion, tools on the canvas).
 * On a narrow screen it opens as a sheet from the bottom, within thumb reach.
 */

export type CtxItem =
  | { label: string; run: () => unknown; hint?: string; danger?: boolean; disabled?: boolean; checked?: boolean }
  | { chips: { label: string; run: () => unknown; title?: string; on?: boolean }[] }
  | { title: string }
  | { sep: true };

/** How long a finger must stay still to count as press-and-hold. */
export const HOLD_MS = 450;
/** How far (css px) a finger may drift and still be holding still. */
export const HOLD_SLOP = 10;

let open: { root: HTMLElement; close: () => void } | null = null;

export function closeContextMenu(): void {
  open?.close();
}

export function contextMenuOpen(): boolean {
  return open !== null;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Show a menu at a screen point (css px). Empty lists show nothing. */
export function showContextMenu(x: number, y: number, items: CtxItem[]): void {
  closeContextMenu();
  if (!items.length) return;
  const sheet = window.innerWidth < 600;
  const root = el('div', `ctxmenu${sheet ? ' sheet' : ''}`);
  root.setAttribute('role', 'menu');
  const close = () => {
    if (open?.root !== root) return;
    open = null;
    root.remove();
    window.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('resize', close);
    window.removeEventListener('blur', close);
  };
  const run = (fn: () => unknown) => {
    close();
    void fn();
  };
  for (const it of items) {
    if ('sep' in it) root.append(el('div', 'ctx-sep'));
    else if ('title' in it) root.append(el('div', 'ctx-title', it.title));
    else if ('chips' in it) {
      const row = el('div', 'ctx-chips');
      for (const c of it.chips) {
        const b = el('button', c.on ? 'on' : '', c.label);
        b.type = 'button';
        if (c.title) b.title = c.title;
        b.addEventListener('click', () => run(c.run));
        row.append(b);
      }
      root.append(row);
    } else {
      const b = el('button', it.danger ? 'danger' : '', `${it.checked ? '✓ ' : ''}${it.label}`);
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      if (it.disabled) b.disabled = true;
      if (it.hint) b.append(el('span', 'ctx-hint', it.hint));
      b.addEventListener('click', () => run(it.run));
      root.append(b);
    }
  }
  document.body.append(root);
  if (!sheet) {
    const r = root.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - r.width - 8, x));
    const top = y + r.height + 8 > window.innerHeight ? Math.max(8, y - r.height) : y;
    root.style.left = `${left}px`;
    root.style.top = `${Math.min(top, Math.max(8, window.innerHeight - r.height - 8))}px`;
  }
  const outside = (e: PointerEvent) => {
    if (!root.contains(e.target as Node)) {
      close();
      // the tap that closes the menu does nothing else (like Procreate Dreams)
      e.stopPropagation();
      e.preventDefault();
    }
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  // attach after this event finishes, so the press that opened the menu does not close it
  setTimeout(() => {
    if (open?.root !== root) return;
    window.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
  }, 0);
  open = { root, close };
  (root.querySelector('button:not([disabled])') as HTMLButtonElement | null)?.focus({ preventScroll: true });
}

/**
 * Give an element a context menu: right-click, plus press-and-hold for fingers. `items` returns
 * the menu for the point (or null for none). `onHold` runs when a hold starts, so the element can
 * cancel whatever the press began (a drag, a stroke). Pens are left alone (they draw), except for
 * the barrel button, which arrives as a right-click.
 */
export function attachContextMenu(target: HTMLElement, items: (e: { x: number; y: number; target: EventTarget | null }) => CtxItem[] | null, opts: { onHold?: () => void; hold?: boolean } = {}): void {
  target.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const list = items({ x: e.clientX, y: e.clientY, target: e.target });
    if (list) showContextMenu(e.clientX, e.clientY, list);
  });
  if (opts.hold === false) return;
  let timer = 0;
  let start: { x: number; y: number; id: number; target: EventTarget | null } | null = null;
  const cancel = () => {
    clearTimeout(timer);
    start = null;
  };
  target.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || !e.isPrimary) return cancel();
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, target: e.target };
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const s = start;
      start = null;
      if (!s) return;
      const list = items({ x: s.x, y: s.y, target: s.target });
      if (!list) return;
      opts.onHold?.();
      swallowNextClick();
      showContextMenu(s.x, s.y, list);
    }, HOLD_MS);
  });
  target.addEventListener('pointermove', (e) => {
    if (start && e.pointerId === start.id && Math.hypot(e.clientX - start.x, e.clientY - start.y) > HOLD_SLOP) cancel();
  });
  target.addEventListener('pointerup', cancel);
  target.addEventListener('pointercancel', cancel);
  // a second finger means a pinch or a gesture, not a hold
  target.addEventListener('pointerdown', (e) => {
    if (start && e.pointerId !== start.id) cancel();
  });
}

/** The click that follows a press-and-hold should not also press a button. */
export function swallowNextClick(): void {
  const eat = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };
  window.addEventListener('click', eat, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', eat, true), 600);
}
