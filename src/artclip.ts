/**
 * Copied art (Copy / Cut / Paste inside a drawing): the selected pixels of Line and Fill and the
 * vector lines inside. App owns the copy and the History steps; this module does the pixel work.
 */
import { makeCanvas } from './brush/raster';
import { drawVectorStroke } from './brush/vector';
import { planeCanvas, type Drawing } from './core/project';
import type { Rect } from './core/selxform';
import { newStrokeId, type StrokeRecord } from './core/stroke';
import type { Area } from './fill/fill';

export interface ArtClip { rect: Rect; line: ImageData; fill: ImageData | null; vectors: StrokeRecord[] }

export interface PixelStep { c: HTMLCanvasElement; before: ImageData; after: ImageData }

/** A transparent PNG-ready picture of the copy: Fill, then Line, then vectors. */
export function artClipCanvas(clip: ArtClip, lengthOf: (v: StrokeRecord) => number): HTMLCanvasElement {
  const { rect, fill, line, vectors } = clip;
  const canvas = makeCanvas(rect.w, rect.h), g = canvas.getContext('2d')!;
  if (fill) g.putImageData(fill, 0, 0);
  const ink = makeCanvas(rect.w, rect.h);
  ink.getContext('2d')!.putImageData(line, 0, 0);
  g.drawImage(ink, 0, 0);
  ink.width = 0;
  g.translate(-rect.x, -rect.y);
  for (const stroke of vectors) drawVectorStroke(g, stroke, lengthOf(stroke));
  return canvas;
}

/** Clear the selected pixels on Line and Fill (not yet applied: returns before/after). */
export function clearedPixels(d: Drawing, a: Area, docW: number): { rect: Rect; steps: PixelStep[] } {
  const rect = { x: a.x0, y: a.y0, w: a.x1 - a.x0 + 1, h: a.y1 - a.y0 + 1 };
  const steps = [d.line, d.fill].filter((c): c is HTMLCanvasElement => !!c).map((c) => {
    const before = c.getContext('2d')!.getImageData(rect.x, rect.y, rect.w, rect.h);
    const after = new ImageData(new Uint8ClampedArray(before.data), rect.w, rect.h);
    for (let y = 0; y < rect.h; y++)
      for (let x = 0; x < rect.w; x++) if (a.mask[(rect.y + y) * docW + rect.x + x]) after.data[(y * rect.w + x) * 4 + 3] = 0;
    return { c, before, after };
  });
  return { rect, steps };
}

/** Stamp the copy onto a drawing where it was copied from. Paints now; returns the undo data and the new vector lines. */
export function stampArtClip(d: Drawing, clip: ArtClip): { steps: PixelStep[]; added: StrokeRecord[] } {
  const r = clip.rect;
  const stamp = (canvas: HTMLCanvasElement, img: ImageData) => {
    const tmp = makeCanvas(r.w, r.h);
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    canvas.getContext('2d')!.drawImage(tmp, r.x, r.y);
    tmp.width = 0;
  };
  const planes: { c: HTMLCanvasElement; img: ImageData }[] = [{ c: d.line, img: clip.line }];
  if (clip.fill) planes.push({ c: planeCanvas(d, 'fill'), img: clip.fill });
  const steps = planes.map(({ c, img }) => {
    const before = c.getContext('2d')!.getImageData(r.x, r.y, r.w, r.h);
    stamp(c, img);
    return { c, before, after: c.getContext('2d')!.getImageData(r.x, r.y, r.w, r.h) };
  });
  const added = clip.vectors.map((v) => ({ ...structuredClone(v), id: newStrokeId() }));
  return { steps, added };
}

/** The pasted pixels as a selection mask (the whole box when vectors came along). */
export function artClipMask(clip: ArtClip, withVectors: boolean, W: number, H: number): Uint8Array {
  const r = clip.rect;
  const mask = new Uint8Array(W * H);
  const mark = (img: ImageData) => { for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) if (img.data[(y * r.w + x) * 4 + 3]) mask[(r.y + y) * W + r.x + x] = 1; };
  mark(clip.line);
  if (clip.fill) mark(clip.fill);
  if (withVectors) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) mask[y * W + x] = 1;
  return mask;
}
