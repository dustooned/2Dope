/**
 * The handle between the canvas and the timeline: drag it up or down (touch, pen or mouse) to
 * give the canvas or the timeline more room, or use the arrow keys. The size is remembered
 * separately for the flipbook strip and the Motion view.
 */
export class Splitter {
  private drag: { y: number; h: number } | null = null;

  constructor(
    private readonly handle: HTMLElement,
    private readonly column: HTMLElement,
    /** Which CSS variable the visible timeline reads, for the current workspace. */
    private readonly target: () => { name: string; min: number; def: number },
  ) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        // synthetic pointers cannot be captured
      }
      this.drag = { y: e.clientY, h: this.current() };
      handle.classList.add('active');
    });
    handle.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.set(this.drag.h - (e.clientY - this.drag.y));
    });
    const end = () => {
      this.drag = null;
      handle.classList.remove('active');
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      e.stopPropagation();
      this.set(this.current() + (e.key === 'ArrowUp' ? 24 : -24));
    });
    handle.addEventListener('dblclick', () => this.set(this.target().def));
    this.restore();
  }

  private key(): string {
    return `2dope.m3.${this.target().name}`;
  }

  private current(): number {
    const t = this.target();
    const v = parseFloat(getComputedStyle(document.body).getPropertyValue(t.name));
    return Number.isFinite(v) ? v : t.def;
  }

  private set(h: number): void {
    const t = this.target();
    if (this.column.clientHeight < 300) return; // not laid out yet (or a tiny window): leave it alone
    const max = Math.max(t.min + 40, this.column.clientHeight - 220);
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
      if (n >= t.min) document.body.style.setProperty(t.name, `${n}px`);
    } catch {
      // default
    }
  }
}
