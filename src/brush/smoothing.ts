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

/**
 * Post-correction: smooth a finished stroke (after the pen lifts) so wobbly hand-drawn lines come
 * out clean, like Clip Studio's post-correction. Points are averaged with Gaussian weights over
 * arc length; the window shrinks near both ends so the stroke starts and ends where the pen did.
 * `strength` 0 (off) .. 1 (strong, about a 12 px window). Pressure, tilt and time are kept.
 */
export function smoothStroke(points: StrokePoint[], strength: number): StrokePoint[] {
  const n = points.length;
  if (strength <= 0 || n < 3) return points;
  const sigma = 1 + strength * 11;
  // arc length at each point
  const s: number[] = [0];
  for (let i = 1; i < n; i++) s.push(s[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y));
  const total = s[n - 1]!;
  const out: StrokePoint[] = [];
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    // near the ends the window can only be as wide as the distance to the end
    const sg = Math.max(1e-6, Math.min(sigma, s[i]! / 2, (total - s[i]!) / 2));
    const reach = sg * 3;
    while (s[lo]! < s[i]! - reach) lo++;
    while (hi < n - 1 && s[hi + 1]! <= s[i]! + reach) hi++;
    let wx = 0;
    let wy = 0;
    let wsum = 0;
    for (let j = lo; j <= hi; j++) {
      const d = s[j]! - s[i]!;
      const w = Math.exp((-d * d) / (2 * sg * sg));
      wx += points[j]!.x * w;
      wy += points[j]!.y * w;
      wsum += w;
    }
    out.push({ ...points[i]!, x: wx / wsum, y: wy / wsum });
  }
  out[0] = { ...points[0]! };
  out[n - 1] = { ...points[n - 1]! };
  return out;
}
