import type { App } from '../app';

const MAX_SIZE = 200;

/** Brush size ↔ slider position: squared, so small sizes get most of the travel. */
export const sizeToT = (size: number) => Math.sqrt(Math.max(0, (size - 1) / (MAX_SIZE - 1)));
export const tToSize = (t: number) => Math.max(1, Math.round(1 + (MAX_SIZE - 1) * t * t));

/**
 * The floating sidebar on the canvas (as in Procreate Dreams): brush size on top, opacity below,
 * then undo and redo. Sliders work by touch: touch anywhere to jump there, drag up or down to
 * change. Dragging sideways first slows the slider to a quarter for fine steps. Arrow keys work
 * when focused.
 */
export class Sidebar {
  private readonly size: HTMLElement;
  private readonly opacity: HTMLElement;

  constructor(
    private readonly app: App,
    root: HTMLElement,
  ) {
    this.size = root.querySelector<HTMLElement>('[data-slider="size"]')!;
    this.opacity = root.querySelector<HTMLElement>('[data-slider="opacity"]')!;
    this.bind(
      this.size,
      (t) => {
        app.brush.size = tToSize(t);
        app.brushChanged();
      },
      () => sizeToT(app.brush.size),
    );
    this.bind(
      this.opacity,
      (t) => {
        app.brush.opacity = Math.max(0.02, Math.round(t * 100) / 100);
        app.brushChanged();
      },
      () => app.brush.opacity,
    );
    this.update();
    // The stage can shrink when the timeline or Audio lane grows, independently of the window.
    const stage = root.parentElement;
    if (stage) new ResizeObserver(() => root.classList.toggle('compact', stage.clientHeight < 220)).observe(stage);
  }

  private bind(el: HTMLElement, set: (t: number) => void, get: () => number): void {
    let drag: { id: number; y0: number; x0: number; t0: number; fine: boolean; moved: boolean } | null = null;
    const tAt = (clientY: number) => {
      const r = el.getBoundingClientRect();
      return Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // capture can fail for stale pointers
      }
      drag = { id: e.pointerId, y0: e.clientY, x0: e.clientX, t0: get(), fine: false, moved: false };
      el.classList.add('active');
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = Math.abs(e.clientX - drag.x0);
      const dy = e.clientY - drag.y0;
      // slide sideways first for fine control (a quarter of the speed)
      if (!drag.moved && dx > 24 && Math.abs(dy) < 8) drag.fine = true;
      if (Math.abs(dy) > 3) drag.moved = true;
      if (!drag.moved) return;
      const r = el.getBoundingClientRect();
      const t = drag.fine ? drag.t0 - (dy / r.height) * 0.25 : tAt(e.clientY);
      set(Math.max(0, Math.min(1, t)));
      this.update();
    });
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      // a tap jumps to where it touched
      if (!drag.moved) set(tAt(e.clientY));
      drag = null;
      el.classList.remove('active');
      this.update();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', (e) => {
      drag = null;
      el.classList.remove('active');
      void e;
    });
    el.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.1 : 0.02;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(Math.min(1, get() + step));
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(Math.max(0, get() - step));
      else return;
      e.preventDefault();
      this.update();
    });
  }

  /** Show the brush's current size and opacity. */
  update(): void {
    const b = this.app.brush;
    const show = (el: HTMLElement, t: number, text: string) => {
      (el.querySelector('.vfill') as HTMLElement).style.height = `${Math.round(t * 100)}%`;
      (el.querySelector('.vval') as HTMLElement).textContent = text;
      el.setAttribute('aria-valuenow', text);
    };
    show(this.size, sizeToT(b.size), `${Math.round(b.size)}`);
    show(this.opacity, b.opacity, `${Math.round(b.opacity * 100)}%`);
  }
}
