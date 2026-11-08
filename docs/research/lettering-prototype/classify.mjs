// Prototype: classify a hand-drawn closed loop as a balloon kind.
// Pure geometry, no DOM. Not app code.

const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

export function resample(p, n) {
  const L = [0];
  for (let i = 1; i < p.length; i++) L.push(L[i - 1] + dist(p[i - 1], p[i]));
  const total = L[L.length - 1], out = [];
  let k = 1;
  for (let i = 0; i < n; i++) {
    const at = (total * i) / n;
    while (k < p.length - 1 && L[k] < at) k++;
    const a = p[k - 1], b = p[k], s = L[k] - L[k - 1], t = s > 0 ? (at - L[k - 1]) / s : 0;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

function polygonArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q.x * r.y - r.x * q.y; }
  return Math.abs(a) / 2;
}

function hull(points) {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], hi = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop(); hi.push(q); }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

/** Smallest-area rectangle around the hull (rotating calipers, brute over hull edges). */
function minRect(h) {
  let best = null;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length], len = dist(a, b) || 1, ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of h) { const u = q.x * ux + q.y * uy, v = -q.x * uy + q.y * ux; x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
    const area = (x1 - x0) * (y1 - y0);
    if (!best || area < best.area) best = { area, w: x1 - x0, h: y1 - y0, rot: Math.atan2(uy, ux) };
  }
  return best;
}

/** Peaks in a circular signal with prominence ≥ p (fraction of mean radius). Returns peak indices and widths. */
function peaks(r, prom) {
  const n = r.length, out = [];
  for (let i = 0; i < n; i++) {
    const v = r[i];
    if (!(v >= r[(i - 1 + n) % n] && v > r[(i + 1) % n])) continue;
    // walk to the lowest point before a higher value on each side (circular)
    let left = v, right = v, j;
    for (j = 1; j < n / 2; j++) { const w = r[(i - j + n) % n]; if (w > v) break; left = Math.min(left, w); }
    for (j = 1; j < n / 2; j++) { const w = r[(i + j) % n]; if (w > v) break; right = Math.min(right, w); }
    const p = v - Math.max(left, right);
    if (p >= prom) {
      // width at half prominence, in samples
      const half = v - p / 2;
      let a = 0, b = 0;
      while (a < n / 2 && r[(i - a - 1 + n) % n] > half) a++;
      while (b < n / 2 && r[(i + b + 1) % n] > half) b++;
      out.push({ i, p, width: a + b + 1 });
    }
  }
  return out;
}

/**
 * Classify a stroke. Returns { kind, why }. kind: 'open' | 'speech' | 'box' | 'cloud' | 'burst' | 'custom'.
 */
export function classify(raw) {
  if (raw.length < 8) return { kind: 'open', why: 'too few points' };
  let len = 0;
  for (let i = 1; i < raw.length; i++) len += dist(raw[i - 1], raw[i]);
  const gap = dist(raw[0], raw[raw.length - 1]);
  if (len < 20 || gap > len * 0.18) return { kind: 'open', why: `gap ${(gap / len).toFixed(2)} of length` };
  const N = 256, p = resample(raw, N);
  const cx = p.reduce((s, q) => s + q.x, 0) / N, cy = p.reduce((s, q) => s + q.y, 0) / N;
  const r0 = p.map(q => Math.hypot(q.x - cx, q.y - cy)), mean = r0.reduce((a, b) => a + b, 0) / N;
  // light smoothing removes pen jitter, keeps bumps and spikes
  const r = r0.map((_, i) => { let s = 0; for (let k = -2; k <= 2; k++) s += r0[(i + k + N) % N]; return s / 5 / mean; });
  const h = hull(p), area = polygonArea(p), hullArea = polygonArea(h), rect = minRect(h);
  const solidity = area / hullArea;          // 1 = convex; bursts and clouds dip in
  const rectFill = area / rect.area;          // box ≈ 1, ellipse ≈ 0.785
  const big = peaks(r, 0.18), small = peaks(r, 0.035);
  // how the line bends along its length: straight runs (box sides) and inward dents (cloud cusps)
  const sm = p.map((_, i) => { let x = 0, y = 0; for (let k = -3; k <= 3; k++) { const q = p[(i + k + N) % N]; x += q.x; y += q.y; } return { x: x / 7, y: y / 7 }; });
  let signed = 0;
  for (let i = 0; i < N; i++) { const q = sm[i], w = sm[(i + 1) % N]; signed += q.x * w.y - w.x * q.y; }
  const orient = signed >= 0 ? 1 : -1, S = 4;
  const turn = sm.map((_, i) => {
    const a = sm[(i - S + N) % N], b = sm[i], c = sm[(i + S) % N];
    const t = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    return orient * Math.atan2(Math.sin(t), Math.cos(t));
  });
  const straight = turn.filter(t => Math.abs(t) < 0.035).length / N;
  let dents = 0, inDent = false;
  for (let i = 0; i < N; i++) { const d = turn[i] < -0.06; if (d && !inDent) dents++; inDent = d; }
  if (inDent && turn[0] < -0.06 && dents > 1) dents--; // a dent across the start is one dent
  const f = { solidity: +solidity.toFixed(3), rectFill: +rectFill.toFixed(3), big: big.length, small: small.length, straight: +straight.toFixed(3), dents };
  // Burst: many strong spikes, deeply concave
  if (big.length >= 5 && solidity < 0.86) return { kind: 'burst', why: f };
  // Box: long straight sides
  if (straight >= 0.26 && solidity >= 0.95) return { kind: 'box', why: f };
  // Cloud: many inward dents between rounded bumps, only slightly concave overall, no straight runs
  if (dents >= 6 && dents <= 20 && solidity > 0.88 && straight < 0.1) return { kind: 'cloud', why: f };
  // Speech: almost perfectly convex with an ellipse's fill
  if (solidity >= 0.985 && rectFill >= 0.74 && rectFill < 0.84 && dents <= 4) return { kind: 'speech', why: f };
  return { kind: 'custom', why: f };
}
