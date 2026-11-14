import { planeCanvas, type Drawing, type Project, type Role } from './project';
import { transformVector } from './vectorstyle';
import type { StrokeRecord } from './stroke';
import type { Layer } from './comp';
import type { AssetSource } from './residency';

/**
 * Copying between projects. A copy keeps its own pictures (PNG bytes made at Copy, so a big copy
 * stays small in memory) and vector lines, so it can be pasted into another project after the
 * first one is closed. Pasting makes new drawings there; when the canvases differ in size the art
 * keeps its pixel size and is centred.
 */
export interface DrawingSnap { line: Uint8Array; fill: Uint8Array | null; vectors: StrokeRecord[]; role: Role | null; w: number; h: number }

/** The most drawings one copy carries to another project. */
export const SNAP_MAX = 240;

const encode = async (b: ImageBitmap): Promise<Uint8Array> => {
  try {
    const c = document.createElement('canvas'); c.width = b.width; c.height = b.height;
    c.getContext('2d')!.drawImage(b, 0, 0);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png')); c.width = c.height = 0;
    if (!blob) throw new Error('Could not copy a drawing.');
    return new Uint8Array(await blob.arrayBuffer());
  } finally { b.close(); }
};

/**
 * Snapshots of these drawings. The pictures are taken the moment this is called (a canvas is
 * captured as a bitmap, a packed-away drawing by its stored bytes), so opening another project
 * straight after Copy is safe; the PNG encoding finishes afterwards. Resolves to null when a
 * picture could not be read.
 */
export function snapDrawings(p: Project, ids: Iterable<string>, load: AssetSource): Promise<Map<string, DrawingSnap> | null> {
  const unique = [...new Set(ids)];
  // a very long copy stays a same-project copy; a .2dope file or My Assets moves that much
  if (unique.length > SNAP_MAX || unique.some((id) => !p.drawings.has(id))) return Promise.resolve(null);
  const plane = (d: Drawing, which: 'line' | 'fill'): Promise<Uint8Array> | null => {
    if (d.parked) {
      const ref = d.parked[which];
      if (!ref) return null;
      if (ref.bytes) return Promise.resolve(ref.bytes.slice());
      return load(ref.key!).then((b) => { if (!b) throw new Error('missing'); return b; });
    }
    const c = which === 'line' ? d.line : d.fill;
    return c && c.width && c.height ? createImageBitmap(c).then(encode) : null;
  };
  // every capture starts now, before anything awaits
  const jobs = unique.map((id) => {
    const d = p.drawings.get(id)!;
    return { id, line: plane(d, 'line'), fill: plane(d, 'fill'), vectors: structuredClone(d.vectors), role: d.role };
  });
  return (async () => {
    const out = new Map<string, DrawingSnap>();
    try {
      for (const j of jobs) {
        if (!j.line) return null;
        out.set(j.id, { line: await j.line, fill: j.fill ? await j.fill : null, vectors: j.vectors, role: j.role, w: p.width, h: p.height });
      }
      return out;
    } catch { return null; } finally { for (const j of jobs) { j.line?.catch(() => {}); j.fill?.catch(() => {}); } }
  })();
}

/** New drawings in `p` from snapshots: old id → new id. Same-size pictures decode lazily, as My Assets copies do. */
export async function adoptSnaps(p: Project, snaps: Map<string, DrawingSnap>): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const [id, s] of snaps) {
    if (s.w === p.width && s.h === p.height) {
      const plane = (bytes: Uint8Array | null) => bytes ? { key: null, bytes: bytes.slice() } : null;
      ids.set(id, p.cloneStoredDrawing(s, { rev: 0, line: plane(s.line), fill: plane(s.fill) }).id);
      continue;
    }
    const dx = Math.round((p.width - s.w) / 2), dy = Math.round((p.height - s.h) / 2);
    const draw = async (bytes: Uint8Array, into: HTMLCanvasElement) => {
      const b = await createImageBitmap(new Blob([bytes as BlobPart], { type: 'image/png' }));
      try { into.getContext('2d')!.drawImage(b, dx, dy); } finally { b.close(); }
    };
    const d = p.newDrawing();
    await draw(s.line, d.line);
    if (s.fill) await draw(s.fill, planeCanvas(d, 'fill'));
    d.vectors = s.vectors.map((v) => transformVector(v, [1, 0, 0, 1, dx, dy]));
    d.role = s.role;
    d.rev++;
    ids.set(id, d.id);
  }
  return ids;
}

/** The drawings a layer shows (its exposures and its mask). */
export function layerDrawings(l: Layer): string[] {
  if (l.kind !== 'drawings') return [];
  return [...l.exposures.map((e) => e.drawing), ...(l.mask ? [l.mask] : [])];
}

/**
 * Why these layers cannot be pasted into another project, or null when they can. Movies and
 * nested artwork live in the project's own stores; My Assets or a .2dope file carries them.
 */
export function crossPasteBlocked(layers: Layer[]): string | null {
  if (layers.some((l) => l.kind === 'comp')) return 'Artwork and groups move between projects through My Assets: Save to My Assets, then Add copy here';
  if (layers.some((l) => l.kind === 'drawings' && l.video)) return 'Movie layers need their movie file: import the movie in this project, or move the shot as a .2dope file';
  return null;
}
