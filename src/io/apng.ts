import { makeCanvas } from '../brush/raster';
import { compLength, frameContent } from '../core/comp';
import type { Drawing, Project } from '../core/project';
import { drawComp, releaseScratch } from '../view/composite';
import { crc32 } from './zip';

/**
 * Animated PNG: full colour and soft transparency in one looping file (GIF has 256 colours and
 * hard edges). Frames are PNGs from the canvas; their image data is re-wrapped as APNG frames.
 * Consecutive identical frames (a drawing held on twos, threes...) become one longer frame.
 */

export interface ApngOptions {
  /** Longest side in pixels (0 = the shot's own size). */
  size: number;
  background: 'transparent' | 'white' | 'black';
}

export const DEFAULT_APNG: ApngOptions = { size: 720, background: 'transparent' };

export function planApng(project: Pick<Project, 'comp' | 'comps' | 'main'>, opts: ApngOptions, lite: boolean) {
  const comp = project.comps.get(project.main) ?? project.comp;
  const frames = compLength(comp, project.comps), fps = comp.fps;
  if (!Number.isInteger(frames) || frames < 1 || !Number.isFinite(fps) || fps < 1 || fps > 120) throw new Error('Invalid shot timing.');
  const edge = opts.size > 0 ? opts.size : Math.max(comp.width, comp.height);
  const scale = Math.min(1, edge / Math.max(comp.width, comp.height));
  const width = Math.max(1, Math.round(comp.width * scale)), height = Math.max(1, Math.round(comp.height * scale));
  const maxBytes = (lite ? 48 : 128) * 1024 * 1024;
  // a rough worst case: about half a byte a pixel per distinct frame
  if (width * height * frames * 0.5 > maxBytes * 2) throw new Error('This animated PNG would be too large for this device. Choose a smaller size, or make a video.');
  return { comp: comp.id, frames, fps, duration: frames / fps, width, height, scale, maxBytes };
}

interface Chunk { type: string; data: Uint8Array }

function readChunks(png: Uint8Array): Chunk[] {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const out: Chunk[] = [];
  for (let p = 8; p + 12 <= png.length;) {
    const len = v.getUint32(p);
    const type = String.fromCharCode(...png.subarray(p + 4, p + 8));
    out.push({ type, data: png.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
    if (type === 'IEND') break;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const u32 = (...n: number[]) => { const b = new Uint8Array(n.length * 4); const v = new DataView(b.buffer); n.forEach((x, i) => v.setUint32(i * 4, x)); return b; };

/** Assemble APNG bytes from per-frame PNGs and how many shot frames each one lasts. */
export function assembleApng(frames: { png: Uint8Array; hold: number }[], fps: number, width: number, height: number): Uint8Array {
  const parts: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  const first = readChunks(frames[0]!.png);
  const ihdr = first.find((c) => c.type === 'IHDR');
  if (!ihdr) throw new Error('The browser made an unreadable PNG.');
  parts.push(chunk('IHDR', ihdr.data));
  parts.push(chunk('acTL', u32(frames.length, 0))); // 0 = loop forever
  let seq = 0;
  frames.forEach((f, i) => {
    // delay as a fraction: hold / fps seconds; full-frame replace (dispose none, blend source)
    const fc = new Uint8Array(26);
    const v = new DataView(fc.buffer);
    v.setUint32(0, seq++);
    v.setUint32(4, width);
    v.setUint32(8, height);
    v.setUint32(12, 0);
    v.setUint32(16, 0);
    v.setUint16(20, Math.min(65535, f.hold));
    v.setUint16(22, Math.min(65535, fps));
    fc[24] = 0;
    fc[25] = 0;
    parts.push(chunk('fcTL', fc));
    for (const c of readChunks(f.png)) {
      if (c.type !== 'IDAT') continue;
      if (i === 0) parts.push(chunk('IDAT', c.data));
      else {
        const d = new Uint8Array(4 + c.data.length);
        new DataView(d.buffer).setUint32(0, seq++);
        d.set(c.data, 4);
        parts.push(chunk('fdAT', d));
      }
    }
  });
  parts.push(chunk('IEND', new Uint8Array(0)));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** The whole shot as an animated PNG (main shot, shared compositor, one pinned frame at a time). */
export async function exportApng(project: Project, opts: ApngOptions, lite: boolean, signal: AbortSignal,
  hold: { pin(d: Drawing): Promise<void>; unpin(d: Drawing): void }, progress: (done: number, total: number) => void): Promise<Blob> {
  const p = planApng(project, opts, lite);
  const check = () => { if (signal.aborted) throw new DOMException('Animated PNG export cancelled', 'AbortError'); };
  const canvas = makeCanvas(p.width, p.height);
  const g = canvas.getContext('2d');
  const frames: { png: Uint8Array; hold: number }[] = [];
  let bytes = 0;
  let lastKey = '';
  try {
    if (!g) throw new Error('2D canvas unavailable.');
    for (let frame = 0; frame < p.frames; frame++) {
      check();
      const content = frameContent(project.comps, p.comp, frame);
      // the same picture as the frame before (a held drawing): make that frame last longer
      if (frames.length && content.key === lastKey) {
        frames[frames.length - 1]!.hold++;
        progress(frame + 1, p.frames);
        continue;
      }
      lastKey = content.key;
      const pinned: Drawing[] = [];
      try {
        for (const id of content.drawings) {
          const d = project.drawings.get(id);
          if (!d) continue;
          pinned.push(d);
          await hold.pin(d);
        }
        check();
        g.setTransform(1, 0, 0, 1, 0, 0);
        if (opts.background === 'transparent') g.clearRect(0, 0, p.width, p.height);
        else {
          g.fillStyle = opts.background === 'black' ? '#000' : '#fff';
          g.fillRect(0, 0, p.width, p.height);
        }
        g.setTransform(p.scale, 0, 0, p.scale, 0, 0);
        drawComp(g, project, p.comp, frame, { backgrounds: true, export: true });
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
        if (!blob) throw new Error('The browser could not make a PNG.');
        const png = new Uint8Array(await blob.arrayBuffer());
        bytes += png.length;
        if (bytes > p.maxBytes) throw new Error('The animated PNG reached this device’s size limit. Choose a smaller size, or make a video.');
        frames.push({ png, hold: 1 });
      } finally {
        for (const d of pinned) hold.unpin(d);
      }
      progress(frame + 1, p.frames);
    }
    check();
    return new Blob([assembleApng(frames, p.fps, p.width, p.height) as BlobPart], { type: 'image/apng' });
  } finally {
    canvas.width = canvas.height = 0;
    releaseScratch();
  }
}
