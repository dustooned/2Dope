import { PRESETS } from '../core/brush';
import { newStrokeId, type StrokeRecord } from '../core/stroke';
import { readVectorShape, type VectorShape } from '../core/vectorshape';
import { multiply, UNIT } from '../core/vectorstyle';
import type { Mat } from '../core/selxform';
import { epsToSvg } from './eps';

export interface ImportedVectors { width: number; height: number; strokes: StrokeRecord[] }
const NS = 'http://www.w3.org/2000/svg';
const PAINT = ['fill', 'stroke', 'stroke-width', 'fill-rule', 'fill-opacity', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'color', 'visibility'] as const;
const fail = (what: string): never => { throw new Error(`${what}. Export a plain SVG with text converted to paths and appearances expanded`); };

/** SVGs are parsed as data. No source markup, scripts, styles or external images enter the page. */
export function importVectorDocument(text: string, eps = false): ImportedVectors {
  if (text.length > 8_000_000) throw new Error('Vector import is limited to 8 MB per file');
  if (eps) text = epsToSvg(text);
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error('This SVG could not be read');
  const vb = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  const dimension = (name: string) => {
    const value = root.getAttribute(name) ?? '';
    const m = value.match(/^\s*(\d*\.?\d+)\s*(px|pt|pc|in|cm|mm)?\s*$/i);
    if (!m) return 0;
    return Number(m[1]) * ({ px: 1, pt: 96 / 72, pc: 16, in: 96, cm: 96 / 2.54, mm: 96 / 25.4 }[m[2]?.toLowerCase() ?? 'px'] ?? 1);
  };
  const view = vb.length === 4 && vb.every(Number.isFinite) && vb[2]! > 0 && vb[3]! > 0 ? vb : [0, 0, dimension('width'), dimension('height')];
  const width = view[2]!, height = view[3]!;
  if (!(width > 0 && height > 0 && width <= 1e6 && height <= 1e6)) throw new Error('SVG needs a finite, positive viewBox or width and height');

  // Parse stylesheet declarations without attaching a stylesheet (or fetching its URLs).
  const rules: { selector: string; style: CSSStyleDeclaration }[] = [];
  for (const style of doc.querySelectorAll('style')) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync((style.textContent ?? '').replace(/@import[^;]*;/gi, ''));
    for (const rule of sheet.cssRules) if ('selectorText' in rule && 'style' in rule) rules.push({ selector: String(rule.selectorText), style: (rule as CSSStyleRule).style });
  }
  const css = (node: Element, parent: Record<string, string>) => {
    const props: Record<string, string> = { ...parent, opacity: '1', display: '', filter: '', 'clip-path': '', mask: '' };
    const keys = [...PAINT, 'opacity', 'display', 'filter', 'clip-path', 'mask', 'stroke-dasharray', 'vector-effect'];
    for (const k of keys) if (node.hasAttribute(k)) props[k] = node.getAttribute(k)!;
    for (const rule of rules) { try { if (node.matches(rule.selector)) for (const k of keys) if (rule.style.getPropertyValue(k)) props[k] = rule.style.getPropertyValue(k).trim(); } catch { /* invalid selector */ } }
    const inline = document.createElement('span').style;
    inline.cssText = node.getAttribute('style') ?? '';
    for (const k of keys) if (inline.getPropertyValue(k)) props[k] = inline.getPropertyValue(k).trim();
    return props;
  };
  const transform = (s: string | null): Mat => {
    if (!s) return UNIT;
    const g = document.createElementNS(NS, 'g'); g.setAttribute('transform', s);
    const m = g.transform.baseVal.consolidate()?.matrix;
    return m ? [m.a, m.b, m.c, m.d, m.e, m.f] : fail('Unsupported SVG transform');
  };
  const number = (s: string | null, def = 0) => {
    if (s === null) return def;
    if (!/^[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?(?:px)?$/i.test(s.trim())) return fail('Unsupported SVG length');
    const n = parseFloat(s); if (!Number.isFinite(n) || Math.abs(n) > 1e7) return fail('Invalid SVG coordinate'); return n;
  };
  const colorCanvas = document.createElement('canvas').getContext('2d')!;
  const color = (s: string, opacity: string, current: string): string | null => {
    if (s === 'none') return null;
    if (s === 'currentColor') s = current;
    if (!CSS.supports('color', s) || /var\(|url\(/i.test(s)) return fail('SVG gradients, patterns or unresolved colours need expanding');
    colorCanvas.clearRect(0, 0, 1, 1); colorCanvas.fillStyle = s; colorCanvas.fillRect(0, 0, 1, 1);
    const rgba = [...colorCanvas.getImageData(0, 0, 1, 1).data];
    rgba[3] = Math.round(rgba[3]! * Math.min(1, Math.max(0, number(opacity, 1))));
    return `#${rgba.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };
  const host = document.createElementNS(NS, 'svg');
  host.setAttribute('width', '1'); host.setAttribute('height', '1');
  host.style.cssText = 'position:fixed;left:-10000px;top:-10000px;visibility:hidden;pointer-events:none';
  document.body.append(host);
  const strokes: StrokeRecord[] = [];
  let visited = 0; const groupPrefix = newStrokeId(); const groups = new Map<string, string>();
  const groupName = (key: string) => { let name = groups.get(key); if (!name) { name = `${groupPrefix}_${groups.size}`; groups.set(key, name); } return name; };
  const walk = (node: Element, parent: Record<string, string>, matrix: Mat, opacity: number, depth: number, group?: string) => {
    if (++visited > 8000 || depth > 32) throw new Error('This SVG has too many objects or nested groups');
    const tag = node.localName, p = css(node, parent);
    if (['defs', 'style', 'title', 'desc', 'metadata', 'namedview'].includes(tag)) return;
    if (p.display === 'none' || p.visibility === 'hidden' || p.visibility === 'collapse') return;
    if ([p.filter, p['clip-path'], p.mask].some((v) => v && v !== 'none')) fail('SVG filters, masks and clipping need expanding');
    if (p['stroke-dasharray'] && p['stroke-dasharray'] !== 'none' || p['vector-effect'] && p['vector-effect'] !== 'none') fail('Dashed or non-scaling SVG strokes need expanding');
    matrix = multiply(matrix, transform(node.getAttribute('transform')));
    const localOpacity = Math.min(1, Math.max(0, number(p.opacity!, 1)));
    if (localOpacity === 0) return;
    opacity *= localOpacity;
    if (tag === 'svg' && node === root || tag === 'g' || tag === 'a') {
      if (localOpacity < 1 && node.children.length > 1) fail('SVG group opacity needs expanding');
      if (tag === 'g') group = groupName(`g${visited}`);
      for (const child of node.children) walk(child, p, matrix, opacity, depth + 1, group);
      return;
    }
    if (tag === 'use') {
      const ref = node.getAttribute('href') ?? node.getAttribute('xlink:href') ?? '';
      const target = ref.startsWith('#') ? doc.getElementById(ref.slice(1)) : null;
      if (!target) fail('SVG linked objects must refer to a local path or group');
      walk(target!, p, multiply(matrix, [1, 0, 0, 1, number(node.getAttribute('x')), number(node.getAttribute('y'))]), opacity, depth + 1, group);
      return;
    }
    const n = (k: string, def = 0) => number(node.getAttribute(k), def);
    let path = '';
    if (tag === 'path') path = node.getAttribute('d') ?? '';
    else if (tag === 'rect') {
      const x = n('x'), y = n('y'), w = n('width'), h = n('height');
      if (w <= 0 || h <= 0) return;
      const rx = Math.max(0, Math.min(w / 2, n('rx', n('ry')))), ry = Math.max(0, Math.min(h / 2, n('ry', rx)));
      path = rx && ry ? `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z` : `M${x} ${y}h${w}v${h}h${-w}Z`;
    } else if (tag === 'circle' || tag === 'ellipse') {
      const x = n('cx'), y = n('cy'), rx = n(tag === 'circle' ? 'r' : 'rx'), ry = tag === 'circle' ? rx : n('ry');
      if (rx <= 0 || ry <= 0) return;
      path = `M${x - rx} ${y}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
    } else if (tag === 'line') path = `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`;
    else if (tag === 'polygon' || tag === 'polyline') {
      const values = (node.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
      if (values.length < 4 || values.length % 2 || !values.every(Number.isFinite)) fail('Invalid SVG polygon');
      path = values.map((v, i) => `${i % 2 ? ' ' : i ? 'L' : 'M'}${v}`).join('') + (tag === 'polygon' ? 'Z' : '');
    } else fail(`SVG ${tag === 'text' ? 'text must be converted to paths' : `object “${tag}” is unsupported`}`);
    if (!path.trim()) return;
    const shape: VectorShape = readVectorShape({ ...(node.getAttribute('data-2dope-group') || group ? { group: node.getAttribute('data-2dope-group') ? groupName(node.getAttribute('data-2dope-group')!) : group } : {}), path: path.trim(), matrix, fill: color(p.fill!, p['fill-opacity']!, p.color!), stroke: color(p.stroke!, p['stroke-opacity']!, p.color!), width: number(p['stroke-width']!, 1), rule: p['fill-rule'], cap: p['stroke-linecap'], join: p['stroke-linejoin'], miter: number(p['stroke-miterlimit']!, 4) });
    if (!shape.fill && !shape.stroke) return;
    const measure = document.createElementNS(NS, 'path'); measure.setAttribute('d', path); host.append(measure);
    const b = measure.getBBox(); measure.remove();
    const pad = shape.stroke ? shape.width / 2 * (shape.join === 'miter' ? shape.miter : 1) : 0;
    const points = [[b.x - pad, b.y - pad], [b.x + b.width + pad, b.y - pad], [b.x + b.width + pad, b.y + b.height + pad], [b.x - pad, b.y + b.height + pad]].map(([x, y]) => ({ x: matrix[0] * x! + matrix[2] * y! + matrix[4], y: matrix[1] * x! + matrix[3] * y! + matrix[5], pressure: 1, tiltX: 0, tiltY: 0, t: 0 }));
    const brush = { ...structuredClone(PRESETS[0]!), size: 0.1, opacity, taperStart: 0, taperEnd: 0 };
    strokes.push({ id: newStrokeId(), tool: 'pen', color: '#000000', seed: 0, brush, points, shape });
    if (strokes.length > 2000) throw new Error('Vector import is limited to 2,000 painted paths');
  };
  try {
    walk(root, { fill: 'black', stroke: 'none', 'stroke-width': '1', 'fill-rule': 'nonzero', 'fill-opacity': '1', 'stroke-opacity': '1', 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter', 'stroke-miterlimit': '4', color: 'black', visibility: 'visible' }, [1, 0, 0, 1, -view[0]!, -view[1]!], 1, 0);
    if (!strokes.length) throw new Error('This file has no visible vector paths');
    return { width, height, strokes };
  } finally { host.remove(); }
}
