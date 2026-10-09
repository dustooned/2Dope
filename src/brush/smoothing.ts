import type { StrokePoint } from '../core/stroke';

/**
 * Stroke stabilizer. Two modes:
 * - exponential: each output point moves part of the way to the pointer (amount = lag);
 * - pulled string (lazy mouse): the line only moves when the pointer pulls a string taut.
 * On pen-up, `finish` catches up to the final pointer position so the line ends where the pen did.
 * Incremental and deterministic: the same input sequence gives the same output.
 */
export class Smoother {
  private last: StrokePoint | null = null;

  /** `zoom` keeps the pulled-string length constant on screen. */
  constructor(
    private readonly amount: number,
    private readonly pulledString: boolean,
    private readonly zoom = 1,
  ) {}

  push(p: StrokePoint): StrokePoint[] {
    const last = this.last;
    if (!last) {
      this.last = { ...p };
      return [{ ...p }];
    }
    if (this.amount <= 0) {
      this.last = { ...p };
      return [{ ...p }];
    }
    if (this.pulledString) {
      const len = (this.amount * 60) / this.zoom;
      const dx = p.x - last.x;
      const dy = p.y - last.y;
      const d = Math.hypot(dx, dy);
      if (d <= len) {
        // Pressure still follows the pen while the string is slack.
        last.pressure = p.pressure;
        return [];
      }
      const k = (d - len) / d;
      const q: StrokePoint = { ...p, x: last.x + dx * k, y: last.y + dy * k };
      this.last = q;
      return [{ ...q }];
    }
    const a = 1 - Math.min(0.95, this.amount * 0.92);
    const q: StrokePoint = {
      ...p,
      x: last.x + (p.x - last.x) * a,
      y: last.y + (p.y - last.y) * a,
      pressure: last.pressure + (p.pressure - last.pressure) * Math.max(a, 0.35),
    };
    this.last = q;
    return [{ ...q }];
  }

  /** Catch up to the final pointer position. */
  finish(p: StrokePoint): StrokePoint[] {
    const last = this.last;
    if (!last || this.amount <= 0) return [];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 0.5) return [];
    const q = { ...p, pressure: last.pressure };
    this.last = q;
    return [{ ...q }];
  }
}
