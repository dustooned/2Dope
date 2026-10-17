import { evalDynamic } from '../core/brush';
import { hash01 } from '../core/rng';
import { tiltAmount, type StrokePoint, type StrokeRecord } from '../core/stroke';

/**
 * Vector pen: the stroke stays as points with a per-point width (from pressure), drawn as one
 * filled outline with round caps. Editable later (point editing, smoothing, width profiles).
 */
export function vectorWidths(rec: StrokeRecord, totalLength: number): number[] {
  const b = rec.brush;
  const out: number[] = [];
  let dist = 0;
  for (let i = 0; i < rec.points.length; i++) {
    const p = rec.points[i]!;
    if (i > 0) {
      const q = rec.points[i - 1]!;
      dist += Math.hypot(p.x - q.x, p.y - q.y);
    }
    const s = { pressure: p.pressure, tilt: tiltAmount(p), speed: 0 };
    let w = (b.size / 2) * evalDynamic(b.sizeDyn, s, hash01(rec.seed, i, 1)) * (p.w ?? 1);
    let f = 1;
    if (b.taperStart > 0) f = Math.min(f, Math.sqrt(Math.min(1, dist / b.taperStart)));
    if (b.taperEnd > 0 && Number.isFinite(totalLength)) {
      f = Math.min(f, Math.sqrt(Math.max(0, Math.min(1, (totalLength - dist) / b.taperEnd))));
    }
    w *= Math.max(0.05, f);
    out.push(Math.max(0.3, w));
  }
  return out;
}

/** Drop points closer than `minDist` so the outline doesn't wobble on dense input. */
function thin(points: StrokePoint[], minDist: number): StrokePoint[] {
  if (points.length < 3) return points;
  const out: StrokePoint[] = [points[0]!];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const last = out[out.length - 1]!;
    if (Math.hypot(p.x - last.x, p.y - last.y) >= minDist) out.push(p);
  }
  out.push(points[points.length - 1]!);
  return out;
}

export function drawVectorStroke(ctx: CanvasRenderingContext2D, rec: StrokeRecord, totalLength = Infinity): void {
  const pts = thin(rec.points, 1.5);
  if (pts.length === 0) return;
  const widths = vectorWidths({ ...rec, points: pts }, totalLength);
  ctx.save();
  ctx.globalAlpha = rec.brush.opacity;
  ctx.fillStyle = rec.color;
  ctx.beginPath();
  if (pts.length === 1) {
    const p = pts[0]!;
    ctx.arc(p.x, p.y, widths[0]!, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const n = pts.length;
  const L: [number, number][] = [];
  const R: [number, number][] = [];
  const ang: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(n - 1, i + 1)]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const p = pts[i]!;
    const w = widths[i]!;
    L.push([p.x + nx * w, p.y + ny * w]);
    R.push([p.x - nx * w, p.y - ny * w]);
    ang.push(Math.atan2(ny, nx));
  }
  const side = (S: [number, number][], reverse: boolean) => {
    const s = reverse ? [...S].reverse() : S;
    for (let i = 1; i < s.length - 1; i++) {
      const c = s[i]!;
      const nx = s[i + 1]!;
      ctx.quadraticCurveTo(c[0], c[1], (c[0] + nx[0]) / 2, (c[1] + nx[1]) / 2);
    }
    const last = s[s.length - 1]!;
    ctx.lineTo(last[0], last[1]);
  };
  ctx.moveTo(L[0]![0], L[0]![1]);
  side(L, false);
  // End cap: from the left edge round the tip to the right edge.
  const pe = pts[n - 1]!;
  const ae = ang[n - 1]!;
  ctx.arc(pe.x, pe.y, widths[n - 1]!, ae, ae + Math.PI, true);
  side(R, true);
  // Start cap: from the right edge round the back to the left edge.
  const p0 = pts[0]!;
  const a0 = ang[0]!;
  ctx.arc(p0.x, p0.y, widths[0]!, a0 + Math.PI, a0, true);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
