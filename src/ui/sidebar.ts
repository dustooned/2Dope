import type { App } from '../app';

const MAX_SIZE = 500;

/** Brush size ↔ slider position: squared, so small sizes get most of the travel. */
export const sizeToT = (size: number) => Math.sqrt(Math.max(0, Math.min(1, (size - 1) / (MAX_SIZE - 1))));
export const tToSize = (t: number) => Math.round(1 + (MAX_SIZE - 1) * Math.max(0, Math.min(1, t)) ** 2);

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
      () => app.brush.size,
      n => { app.brush.size = Math.max(1, Math.min(MAX_SIZE, n)); app.brushChanged(); },
      1, MAX_SIZE, 1,
    );
    this.bind(
      this.opacity,
      (t) => {
        app.brush.opacity = Math.max(0, Math.round(t * 100) / 100);
        app.brushChanged();
      },
      () => app.brush.opacity,
      () => Math.round(app.brush.opacity * 100),
      n => { app.brush.opacity = Math.max(0, Math.min(100, n)) / 100; app.brushChanged(); },
      0, 100, 1,
    );
    this.update();
    // The stage can shrink when the timeline or Audio lane grows, independently of the window.
    const stage = root.parentElement;
    const fit = () => {
      if (!stage) return;
      const style = getComputedStyle(root);
      const top = Number.parseFloat(style.getPropertyValue('--sidebar-top')) || 8;
      const bottom = Number.parseFloat(style.getPropertyValue('--sidebar-bottom')) || 0;
      root.classList.toggle('compact', stage.clientHeight - top - bottom - 10 < 300);
    };
    const observer = new ResizeObserver(fit);
    if (stage) {
      observer.observe(stage);
      new MutationObserver(fit).observe(stage, { attributes: true, attributeFilter: ['style'] });
    }
    observer.observe(root);
  }

  private bind(el: HTMLElement, set: (t: number) => void, get: () => number, value: () => number, setValue: (n: number) => void, min: number, max: number, step: number): void {
    el.setAttribute('aria-orientation', 'vertical');
    el.setAttribute('aria-valuemin', String(min));
    el.setAttribute('aria-valuemax', String(max));
    el.setAttribute('data-own-keys', '');
    const label = document.createElement('span'); label.className = 'vlabel'; label.setAttribute('aria-hidden', 'true');
    label.textContent = el.dataset.slider === 'size' ? 'Size' : 'Opacity'; el.append(label);
    let drag: { id: number; y0: number; x0: number; t0: number; fine: boolean; moved: boolean } | null = null;
    const stop = () => {
      const id = drag?.id;
      drag = null; el.classList.remove('active');
      if (id !== undefined && el.hasPointerCapture(id)) el.releasePointerCapture(id);
    };
    const tAt = (clientY: number) => {
      const r = el.getBoundingClientRect();
      return Math.max(0, Math.min(1, 1 - (clientY - r.top) / r.height));
    };
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || drag) return;
      e.preventDefault();
      e.stopPropagation();
      el.focus({ preventScroll: true });
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
      stop();
      this.update();
    };
    el.addEventListener('pointerup', end);
    const cancel = (e: PointerEvent) => {
      if (drag?.id !== e.pointerId) return;
      stop();
    };
    el.addEventListener('pointercancel', cancel);
    el.addEventListener('lostpointercapture', cancel);
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    el.addEventListener('keydown', (e) => {
      const delta = step * (e.shiftKey ? 10 : 1);
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') setValue(value() + delta);
      else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') setValue(value() - delta);
      else if (e.key === 'Home') setValue(min);
      else if (e.key === 'End') setValue(max);
      else if (e.key === 'Escape' || e.key === 'Enter') {
        e.preventDefault(); stop(); this.app.focusCanvas(); return;
      }
      else return;
      e.preventDefault();
      this.update();
    });
  }

  /** Show the brush's current size and opacity. */
  update(): void {
    const b = this.app.brush;
    const show = (el: HTMLElement, t: number, n: number, text: string) => {
      (el.querySelector('.vfill') as HTMLElement).style.height = `${Math.round(t * 100)}%`;
      (el.querySelector('.vval') as HTMLElement).textContent = text;
      el.setAttribute('aria-valuenow', String(n));
      el.setAttribute('aria-valuetext', text);
    };
    show(this.size, sizeToT(b.size), b.size, `${Math.round(b.size)} px`);
    show(this.opacity, b.opacity, Math.round(b.opacity * 100), `${Math.round(b.opacity * 100)}%`);
  }
}
