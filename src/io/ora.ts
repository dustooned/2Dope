/**
 * OpenRaster (.ora) reader: the layered format Krita, MyPaint and GIMP share. It is a ZIP with a
 * stack.xml listing the layers (top first) and one PNG per layer. The PNGs are returned as bytes;
 * the caller turns them into pictures. Spec: https://www.openraster.org/
 */

import type { BlendMode } from '../core/comp';
import { readZip } from './zip';

export interface OraLayer {
  name: string;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  blend: BlendMode;
  png: Uint8Array;
}

export interface OraOut {
  width: number;
  height: number;
  /** Bottom first, as they stack. */
  layers: OraLayer[];
}

const OPS: Record<string, BlendMode> = {
  'svg:src-over': 'normal', 'svg:multiply': 'multiply', 'svg:screen': 'screen', 'svg:overlay': 'overlay',
  'svg:darken': 'darken', 'svg:lighten': 'lighten', 'svg:plus': 'add', 'svg:color-dodge': 'add',
};

/** The attributes of one XML tag, decoded. */
function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) {
    out[m[1]!] = m[2]!.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  }
  return out;
}

export async function readOra(bytes: Uint8Array): Promise<OraOut> {
  const files = await readZip(bytes, { lenient: true });
  const xml = files.get('stack.xml');
  if (!xml) throw new Error('not an OpenRaster file (no stack.xml)');
  const text = new TextDecoder().decode(xml);
  const image = text.match(/<image\b[^>]*>/);
  if (!image) throw new Error('this OpenRaster file has no image');
  const ia = attrs(image[0]);
  const width = Math.round(Number(ia.w)), height = Math.round(Number(ia.h));
  if (!(width > 0 && height > 0 && width <= 8192 && height <= 8192)) throw new Error('this OpenRaster image is too big or has no size');
  // layers in nested stacks come in too (their stack is flattened away); a hidden stack hides them
  const top: OraLayer[] = [];
  const hiddenStacks: boolean[] = [];
  for (const m of text.matchAll(/<(\/?)(stack|layer)\b([^>]*?)(\/?)>/g)) {
    const [, close, kind, body] = m;
    if (kind === 'stack') {
      if (close) hiddenStacks.pop();
      else if (!m[4]) hiddenStacks.push(attrs(body!).visibility === 'hidden');
      continue;
    }
    if (close) continue;
    const a = attrs(body!);
    const png = a.src ? files.get(a.src) : undefined;
    if (!png) continue;
    const op = Number(a.opacity ?? '1');
    top.push({
      name: (a.name ?? '').slice(0, 60) || `Layer ${top.length + 1}`,
      x: Math.round(Number(a.x ?? 0)) || 0,
      y: Math.round(Number(a.y ?? 0)) || 0,
      opacity: Number.isFinite(op) ? Math.max(0, Math.min(1, op)) : 1,
      visible: a.visibility !== 'hidden' && !hiddenStacks.some(Boolean),
      blend: OPS[a['composite-op'] ?? 'svg:src-over'] ?? 'normal',
      png,
    });
  }
  if (!top.length) throw new Error('this OpenRaster file has no layers');
  return { width, height, layers: top.reverse() };
}
