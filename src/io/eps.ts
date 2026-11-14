const EPS_MAX = 8_000_000;
const latin1 = (bytes: Uint8Array) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return s; };

/**
 * EPS text from file bytes, read as ISO-8859-1 so binary previews cannot garble it. A DOS EPS
 * binary (C5 D0 D3 C6) holds the PostScript at the little-endian offset and length in bytes 4–11;
 * only that section is read.
 */
export function epsTextFromBytes(bytes: Uint8Array): string {
  if (bytes.length >= 4 && bytes[0] === 0xc5 && bytes[1] === 0xd0 && bytes[2] === 0xd3 && bytes[3] === 0xc6) {
    if (bytes.length < 30) throw new Error('This EPS file is incomplete');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const start = view.getUint32(4, true), length = view.getUint32(8, true);
    if (start < 30 || length === 0 || start + length > bytes.length) throw new Error('This EPS file is incomplete');
    if (length > EPS_MAX) throw new Error('Vector import is limited to 8 MB per file');
    return latin1(bytes.subarray(start, start + length));
  }
  if (bytes.length > EPS_MAX) throw new Error('Vector import is limited to 8 MB per file');
  return latin1(bytes);
}

const VENDORS: [RegExp, string][] = [[/Adobe_AGM_(?:Utils|Core)|Adobe_CoolType/, 'Adobe Illustrator'], [/wCorel|CorelDRAW/, 'CorelDRAW']];

/** Read a bounded EPS path subset as data; never execute PostScript or embedded programs. */
export function epsToSvg(text: string): string {
  const unsupported = (op: string): never => { throw new Error(`EPS uses unsupported “${op}”. Save it as plain SVG with text outlined and appearances expanded`); };
  if (!text.startsWith('%!PS-Adobe') || !/EPSF/.test(text.slice(0, 100))) throw new Error('This is not a readable EPS file');
  // These apps' EPS bodies call procedures defined in their own prologs, which 2Dope does not run.
  for (const [mark, app] of VENDORS) if (mark.test(text))
    throw new Error(`This EPS was saved by ${app} with its own PostScript procedures, which 2Dope does not run. Export an SVG (text outlined, effects expanded) or use the PNG`);
  const box = text.match(/%%(?:HiResBoundingBox|BoundingBox):\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)/);
  if (!box) throw new Error('EPS needs a numeric BoundingBox');
  const [x0, y0, x1, y1] = box.slice(1).map(Number) as [number, number, number, number];
  const w = x1 - x0, h = y1 - y0;
  if (![x0, y0, x1, y1].every(Number.isFinite) || w <= 0 || h <= 0 || w > 1e6 || h > 1e6) throw new Error('Invalid EPS bounding box');
  // Prologs define arbitrary procedures. Recognize standard drawing operators in the body only;
  // custom operators are rejected rather than guessed from those definitions.
  let body = text.replace(/%%BeginProlog[\s\S]*?%%EndProlog/g, '').replace(/%%BeginPreview[\s\S]*?%%EndPreview/g, '');
  body = body.replace(/%[^\r\n]*/g, '');
  const tokens = body.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?|[A-Za-z_][\w.*-]*|[^\s]/gi) ?? [];
  if (tokens.length > 300_000) throw new Error('EPS has too many drawing commands');
  const values: number[] = [], paths: string[] = [];
  type State = { fill: string; stroke: string; width: number; matrix: number[]; cap: string; join: string; miter: number };
  let state: State = { fill: '#000000', stroke: '#000000', width: 1, matrix: [1, 0, 0, 1, 0, 0], cap: 'butt', join: 'miter', miter: 10 };
  const states: { state: State; path: string; px: number; py: number }[] = [];
  let path = '', px = 0, py = 0;
  const pop = (n: number): number[] => {
    if (values.length < n) return unsupported('missing path operands');
    return values.splice(values.length - n, n);
  };
  const rgb = (...v: number[]) => `#${v.map((n) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0')).join('')}`;
  const emit = (fill: boolean, stroke: boolean, rule = 'nonzero') => {
    if (!path) return;
    paths.push(`<path d="${path}" transform="matrix(${state.matrix.join(' ')})" fill="${fill ? state.fill : 'none'}" stroke="${stroke ? state.stroke : 'none'}" stroke-width="${state.width}" fill-rule="${rule}" stroke-linecap="${state.cap}" stroke-linejoin="${state.join}" stroke-miterlimit="${state.miter}"/>`);
    path = '';
  };
  const cm = (b: number[]) => { const a = state.matrix; state.matrix = [a[0]! * b[0]! + a[2]! * b[1]!, a[1]! * b[0]! + a[3]! * b[1]!, a[0]! * b[2]! + a[2]! * b[3]!, a[1]! * b[2]! + a[3]! * b[3]!, a[0]! * b[4]! + a[2]! * b[5]! + a[4]!, a[1]! * b[4]! + a[3]! * b[5]! + a[5]!]; };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (/^[-+]?(?:\d|\.\d)/.test(t)) {
      const v = Number(t); if (!Number.isFinite(v) || Math.abs(v) > 1e7) throw new Error('EPS coordinate is too large');
      values.push(v); if (values.length > 64) unsupported('excess operands'); continue;
    }
    if (t === '[') { continue; } // only six-number concat matrices are accepted
    if (t === ']') { if (tokens[i + 1] !== 'concat') unsupported('array'); continue; }
    if (['moveto', 'm', 'lineto', 'l'].includes(t)) {
      const [x, y] = pop(2); path += `${t === 'm' || t === 'moveto' ? 'M' : 'L'}${x} ${y}`; px = x!; py = y!;
    } else if (t === 'curveto' || t === 'c') { const v = pop(6); path += `C${v.join(' ')}`; px = v[4]!; py = v[5]!; }
    else if (t === 'v' || t === 'y') { const v = pop(4); path += t === 'v' ? `C${px} ${py} ${v.join(' ')}` : `C${v.join(' ')} ${v[2]} ${v[3]}`; px = v[2]!; py = v[3]!; }
    else if (t === 'closepath' || t === 'h') path += 'Z';
    else if (['fill', 'f', 'F', 'eofill', 'f*'].includes(t)) emit(true, false, t === 'eofill' || t === 'f*' ? 'evenodd' : 'nonzero');
    else if (t === 'stroke' || t === 'S') emit(false, true);
    else if (['B', 'B*', 'b', 'b*', 's'].includes(t)) { if (t === 'b' || t === 'b*' || t === 's') path += 'Z'; emit(t !== 's', true, t.endsWith('*') ? 'evenodd' : 'nonzero'); }
    else if (t === 'newpath' || t === 'n') path = '';
    else if (['setrgbcolor', 'rg', 'RG'].includes(t)) { const c = rgb(...pop(3)); if (t !== 'RG') state.fill = c; if (t !== 'rg') state.stroke = c; }
    else if (['setgray', 'g', 'G'].includes(t)) { const [v] = pop(1), c = rgb(v!, v!, v!); if (t !== 'G') state.fill = c; if (t !== 'g') state.stroke = c; }
    else if (['setcmykcolor', 'k', 'K'].includes(t)) { const [c, m, y, k] = pop(4); const col = rgb(1 - Math.min(1, c! + k!), 1 - Math.min(1, m! + k!), 1 - Math.min(1, y! + k!)); if (t !== 'K') state.fill = col; if (t !== 'k') state.stroke = col; }
    else if (t === 'setlinewidth' || t === 'w') state.width = pop(1)[0]!;
    else if (t === 'setmiterlimit' || t === 'M') state.miter = pop(1)[0]!;
    else if (t === 'setlinecap' || t === 'J') state.cap = ['butt', 'round', 'square'][pop(1)[0]!] ?? unsupported('line cap');
    else if (t === 'setlinejoin' || t === 'j') state.join = ['miter', 'round', 'bevel'][pop(1)[0]!] ?? unsupported('line join');
    else if (t === 'gsave' || t === 'q') { if (states.length > 32) unsupported('graphics nesting'); states.push({ state: structuredClone(state), path, px, py }); }
    else if (t === 'grestore' || t === 'Q') { const saved = states.pop(); if (!saved) unsupported('unbalanced grestore'); else { state = saved.state; path = saved.path; px = saved.px; py = saved.py; } }
    else if (t === 'concat' || t === 'cm') { if (path) unsupported('transform inside a path'); cm(pop(6)); }
    else if (t === 'translate' || t === 'scale') { if (path) unsupported('transform inside a path'); const [x, y] = pop(2); cm(t === 'translate' ? [1, 0, 0, 1, x!, y!] : [x!, 0, 0, y!, 0, 0]); }
    else if (t === 'rotate') { if (path) unsupported('transform inside a path'); const a = pop(1)[0]! * Math.PI / 180; cm([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0]); }
    else if (t === 'showpage' || t === 'end' || t === '%%EOF') { /* no drawing */ }
    else unsupported(t);
  }
  if (values.length || states.length) throw new Error('EPS drawing commands are incomplete');
  if (!paths.length) throw new Error('EPS contains no supported painted paths');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><g transform="matrix(1 0 0 -1 ${-x0} ${y1})">${paths.join('')}</g></svg>`;
}
