// Prototype: the text sets the balloon. Lettering size is fixed (a named size); we find the
// smallest speech ellipse that holds the words, breaking lines so they follow the oval (the comic
// "diamond"). Guard rails: the balloon never exceeds a share of the frame; text never shrinks.

/**
 * @param words   the words
 * @param measure (text) => width in page units at the lettering size
 * @param size    lettering size, page units
 * @param opts    { aspect: wanted width/height, maxW, maxH: frame limits, pad: fraction of size }
 */
export function fitSpeech(words, measure, size, opts = {}) {
  const aspect = opts.aspect ?? 1.5, pad = (opts.pad ?? 0.9) * size, lead = size * 1.25;
  const maxW = opts.maxW ?? Infinity, maxH = opts.maxH ?? Infinity, space = measure(' ');
  const W = words.length, wordW = words.map(measure);
  // width of words i..j-1 on one line
  const span = (i, j) => { let w = 0; for (let k = i; k < j; k++) w += wordW[k] + (k > i ? space : 0); return w; };
  /** Line capacities for n lines in an ellipse a × b (inset by padding), or null when a line has no room. */
  const caps = (n, a, b) => {
    const top = -((n - 1) * lead) / 2, out = [];
    for (let i = 0; i < n; i++) {
      const y = top + i * lead, yy = Math.abs(y) + size / 2; // the line's outer edge
      const inner = 1 - (yy / (b - pad * 0.6)) ** 2;
      if (inner <= 0) return null;
      out.push({ y, cap: 2 * (a * Math.sqrt(inner) - pad) });
    }
    return out;
  };
  /**
   * Balanced breaking (dynamic programming): every line non-empty and within its capacity, and the
   * unused room is spread so each line follows the oval (squared slack, so no line is left very short).
   */
  const breakLines = (c) => {
    const n = c.length, INF = Infinity;
    const cost = Array.from({ length: n + 1 }, () => new Array(W + 1).fill(INF)), from = Array.from({ length: n + 1 }, () => new Array(W + 1).fill(-1));
    cost[0][0] = 0;
    for (let l = 1; l <= n; l++)
      for (let j = l; j <= W; j++)
        for (let i = l - 1; i < j; i++) {
          if (cost[l - 1][i] === INF) continue;
          const w = span(i, j), slack = c[l - 1].cap - w;
          if (slack < 0) continue;
          const v = cost[l - 1][i] + (slack / c[l - 1].cap) ** 2;
          if (v < cost[l][j]) { cost[l][j] = v; from[l][j] = i; }
        }
    if (cost[n][W] === INF) return null;
    const lines = [];
    for (let l = n, j = W; l > 0; l--) { const i = from[l][j]; lines.unshift({ text: words.slice(i, j).join(' '), width: span(i, j), y: c[l - 1].y, cap: c[l - 1].cap }); j = i; }
    return lines;
  };
  let best = null;
  for (let n = 1; n <= Math.min(14, W); n++) {
    // fitting is monotonic in size now (more room never hurts), so a binary search finds the smallest b
    let lo = size * 0.6, hi = 6000, found = null;
    for (let it = 0; it < 40; it++) {
      const b = (lo + hi) / 2, a = Math.min(aspect * b, maxW / 2 - 1e-9), c = caps(n, a, b);
      const lines = c && breakLines(c);
      if (lines) { found = { a, b, lines }; hi = b; } else lo = b;
    }
    if (!found || found.b * 2 > maxH) continue;
    const area = found.a * found.b;
    if (!best || area < best.area * 0.97) best = { ...found, n, area };
  }
  // past the frame limits the text is never squeezed: the caller offers to split into two balloons
  return best ?? { tooLong: true };
}

// Demo measure: 0.6 em per character, so an SVG with a monospace font shows the result exactly.
export const mono = size => t => t.length * size * 0.6;
