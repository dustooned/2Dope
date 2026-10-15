/**
 * A touchscreen two-finger gesture can also emit a browser contextmenu, sometimes after
 * pointercancel/up. Stop that event before it reaches either an app menu or the browser menu.
 * One-finger holds still use the app's own hold timer; physical secondary clicks stay available.
 */
const AFTER_GESTURE_MS = 1000;
const EXPLICIT_MENU_MS = 500;

interface PointerInput {
  pointerId: number;
  pointerType: string;
  button: number;
  sourceCapabilities?: { firesTouchEvents?: boolean } | null;
}

export function guardTouchContextMenus(root: EventTarget, canvas: EventTarget, now: () => number = () => performance.now()): () => void {
  const touches = new Set<number>();
  let multi = false;
  let blockedUntil = -Infinity;
  let explicitUntil = -Infinity;

  const down = (event: Event) => {
    const e = event as unknown as PointerInput;
    if (e.pointerType === 'touch') {
      explicitUntil = -Infinity;
      touches.add(e.pointerId);
      if (touches.size >= 2) {
        multi = true;
        blockedUntil = now() + AFTER_GESTURE_MS;
      }
    } else if ((e.button === 2 || e.button === 5) && !e.sourceCapabilities?.firesTouchEvents) {
      // A real mouse/pen secondary press explicitly asks for a menu, even just after a tap.
      explicitUntil = now() + EXPLICIT_MENU_MS;
    }
  };
  const up = (event: Event) => {
    const e = event as unknown as PointerInput;
    if (!touches.delete(e.pointerId)) return;
    if (multi) blockedUntil = now() + AFTER_GESTURE_MS;
    if (!touches.size) multi = false;
  };
  const menu = (event: Event) => {
    const e = event as unknown as Partial<PointerInput>;
    const fromTouch = e.pointerType === 'touch' || e.sourceCapabilities?.firesTouchEvents;
    if (!fromTouch && now() < explicitUntil) return;
    if (!multi && now() >= blockedUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const key = (event: Event) => {
    const e = event as KeyboardEvent;
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) explicitUntil = now() + EXPLICIT_MENU_MS;
  };
  const touchStart = (event: Event) => {
    // Safari and Windows touch browsers may synthesize their menu independently of pointerdown.
    // Cancel the native multi-touch default, not the Pointer Events used by undo/pinch/redo.
    if ((event as TouchEvent).touches.length >= 2) event.preventDefault();
  };
  root.addEventListener('pointerdown', down, true);
  root.addEventListener('pointerup', up, true);
  root.addEventListener('pointercancel', up, true);
  root.addEventListener('contextmenu', menu, true);
  root.addEventListener('keydown', key, true);
  canvas.addEventListener('touchstart', touchStart, { passive: false });
  return () => {
    root.removeEventListener('pointerdown', down, { capture: true });
    root.removeEventListener('pointerup', up, { capture: true });
    root.removeEventListener('pointercancel', up, { capture: true });
    root.removeEventListener('contextmenu', menu, { capture: true });
    root.removeEventListener('keydown', key, { capture: true });
    canvas.removeEventListener('touchstart', touchStart);
  };
}
