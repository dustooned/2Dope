import type { Vec2 } from './anim';
export interface PathNode { cmd: 'M' | 'L' | 'C' | 'Q' | 'A' | 'Z'; values: number[] }
const counts: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
/** Expand relative/shorthand commands without flattening curves or arcs. */
export function parsePath(path: string, limit = 2000): PathNode[] {
  const tokens = path.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/g) ?? [];
  if (path.replace(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?|[\s,]/g, '')) throw new Error('Invalid path syntax.');
  let i = 0, command = '', previous = '', x = 0, y = 0, sx = 0, sy = 0, control: Vec2 = [0, 0]; const nodes: PathNode[] = [];
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i]!)) command = tokens[i++]!;
    const op = command.toUpperCase(), relative = command !== op, count = counts[op];
    if (count === undefined || !command || nodes.length >= limit) throw new Error('This path is unsupported or too complex for node editing (2,000 segments).');
    if (!nodes.length && op !== 'M') throw new Error('A path must start with Move.');
    if (!count) { nodes.push({ cmd: 'Z', values: [] }); x = sx; y = sy; previous = 'Z'; command = ''; continue; }
    const v: number[] = [];
    for (let j = 0; j < count; j++) {
      const token = tokens[i]; if (!token) throw new Error('Invalid path coordinates.');
      if (op === 'A' && (j === 3 || j === 4)) { if (!/^[01]/.test(token)) throw new Error('Invalid arc flags.'); v.push(Number(token[0])); if (token.length > 1) tokens[i] = token.slice(1); else i++; }
      else { v.push(Number(token)); i++; }
    }
    if (v.some(n => !Number.isFinite(n) || Math.abs(n) > 1e7)) throw new Error('Invalid path coordinates.');
    const pair = (at: number): Vec2 => [v[at]! + (relative ? x : 0), v[at + 1]! + (relative ? y : 0)];
    let node: PathNode;
    if (op === 'H' || op === 'V') node = { cmd: 'L', values: op === 'H' ? [v[0]! + (relative ? x : 0), y] : [x, v[0]! + (relative ? y : 0)] };
    else if (op === 'S') node = { cmd: 'C', values: [...(['C', 'S'].includes(previous) ? [2 * x - control[0], 2 * y - control[1]] : [x, y]), ...pair(0), ...pair(2)] };
    else if (op === 'T') node = { cmd: 'Q', values: [...(['Q', 'T'].includes(previous) ? [2 * x - control[0], 2 * y - control[1]] : [x, y]), ...pair(0)] };
    else if (op === 'A') { if (v[0]! < 0 || v[1]! < 0 || ![0, 1].includes(v[3]!) || ![0, 1].includes(v[4]!)) throw new Error('Invalid arc radii or flags.'); node = { cmd: 'A', values: [...v.slice(0, 5), ...pair(5)] }; }
    else { const values: number[] = []; for (let j = 0; j < count; j += 2) values.push(...pair(j)); node = { cmd: op as PathNode['cmd'], values }; }
    const n = node.values; x = n[n.length - 2]!; y = n[n.length - 1]!;
    if (op === 'M') { sx = x; sy = y; command = relative ? 'l' : 'L'; }
    control = node.cmd === 'C' ? [n[2]!, n[3]!] : node.cmd === 'Q' ? [n[0]!, n[1]!] : [x, y]; previous = op; nodes.push(node);
  }
  if (!nodes.length) throw new Error('The path is empty.'); return nodes;
}
export function writePath(nodes: PathNode[]): string { return nodes.map(n => n.cmd + n.values.map(v => String(Number(v.toFixed(6)))).join(' ')).join(' '); }
export function pathPoints(nodes: PathNode[]): { node: number; offset: number; point: Vec2; handle: boolean }[] {
  return nodes.flatMap((n, node) => { const offsets = n.cmd === 'Z' ? [] : n.cmd === 'A' ? [5] : Array.from({ length: n.values.length / 2 }, (_, i) => i * 2); return offsets.map(offset => ({ node, offset, point: [n.values[offset]!, n.values[offset + 1]!] as Vec2, handle: offset < n.values.length - 2 })); });
}
