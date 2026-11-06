/**
 * The handle between the canvas and the timeline: drag it up or down (touch, pen or mouse) to
 * give the canvas or the timeline more room, or use the arrow keys. The size is remembered
 * separately for each timeline.
 */
interface SplitTarget {
  name: string;
  min: number;
  /** Null resets to the CSS layout default. */
  def: number | null;
  current?: number;
  max?: number;
}

export class Splitter {
  private drag: { id: number; y: number; h: number } | null = null;

  constructor(
    handle: HTMLElement,
    private readonly column: HTMLElement,
    /** Which CSS variable the visible timeline reads, for the current workspace. */
    private readonly target: () => SplitTarget,
  ) {
    handle.addEventListener('pointerdown', (e) => {
      if (this.drag || e.button !== 0) return;
      e.preventDefault();
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        // synthetic pointers cannot be captured
      }
      this.drag = { id: e.pointerId, y: e.clientY, h: this.current() };
      handle.classList.add('active');
    });
    handle.addEventListener('pointermove', (e) => {
      if (this.drag?.id !== e.pointerId) return;
      this.set(this.drag.h - (e.clientY - this.drag.y));
    });
    const end = (e: PointerEvent) => {
      if (this.drag?.id !== e.pointerId) return;
      this.drag = null;
      handle.classList.remove('active');
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', end);
    handle.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      e.stopPropagation();
      this.set(this.current() + (e.key === 'ArrowUp' ? 24 : -24));
    });
    handle.addEventListener('dblclick', () => {
      const t = this.target();
      if (t.def !== null) { this.set(t.def); return; }
      document.body.style.removeProperty(t.name);
      try { localStorage.removeItem(this.key()); } catch { /* optional */ }
    });
    this.restore();
  }

  private key(): string {
    return `2dope.m3.${this.target().name}`;
  }

  private current(): number {
    const t = this.target();
    if (t.current !== undefined) return t.current;
    const v = parseFloat(getComputedStyle(document.body).getPropertyValue(t.name));
    return Number.isFinite(v) ? v : t.def ?? t.min;
  }

  private set(h: number): void {
    const t = this.target();
    if (t.max === undefined && this.column.clientHeight < 300) return;
    const max = t.max ?? Math.max(t.min + 40, this.column.clientHeight - 220);
    const v = Math.round(Math.max(t.min, Math.min(max, h)));
    document.body.style.setProperty(t.name, `${v}px`);
    try {
      localStorage.setItem(this.key(), String(v));
    } catch {
      // not remembered
    }
  }

  /** Re-apply the remembered size for the current workspace. */
  restore(): void {
    const t = this.target();
    try {
      const n = Number(localStorage.getItem(this.key()));
      if (Number.isFinite(n) && n >= t.min) document.body.style.setProperty(t.name, `${n}px`);
    } catch {
      // default
    }
  }
}
