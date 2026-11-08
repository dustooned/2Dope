import { trace } from './trace.mjs';
process.env.SEED = process.env.SEED ?? '77';
const { shapes } = await import('./bench.mjs?trace');
const kinds = ['speech', 'box', 'cloud', 'burst', 'custom'], N = 60, res = {}, gaps = [];
for (const k of kinds) {
  res[k] = { right: 0, leaks: 0, other: {} };
  for (let i = 0; i < N; i++) {
    let pts = shapes[k]();
    // fit into a 420×320 page with margin
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y), s = 260 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    pts = pts.map(p => ({ x: 210 + (p.x - (Math.max(...xs) + Math.min(...xs)) / 2) * s, y: 160 + (p.y - (Math.max(...ys) + Math.min(...ys)) / 2) * s }));
    const r = trace(pts); if (r.gap) gaps.push(r.gap);
    if (r.kind === k) res[k].right++; else if (r.kind === 'leaks') res[k].leaks++; else res[k].other[r.kind] = (res[k].other[r.kind] ?? 0) + 1;
  }
}
for (const k of kinds) console.log(`${k.padEnd(7)} ${res[k].right}/${N} right, ${res[k].leaks} not closed even with gap closing, others ${JSON.stringify(res[k].other)}`);
gaps.sort((a, b) => a - b); console.log(`gap closing used: median ${gaps[gaps.length >> 1]} px, 90th ${gaps[Math.floor(gaps.length * 0.9)]} px`);
