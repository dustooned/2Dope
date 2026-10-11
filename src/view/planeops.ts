import { makeCanvas } from '../brush/raster';
import { paintDrawing, type Drawing } from '../core/project';
import type { PlaneOps } from '../core/residency';
import { decodePngInto, encodePng, isBlank } from '../io/codec';

/** Thumbnail box (16:9; other aspect ratios fit inside it). Shared by the timeline and the gallery. */
export const THUMB_W = 192;
export const THUMB_H = 108;

/** The browser implementation of the canvas operations the residency manager needs. */
export const domPlaneOps: PlaneOps = {
  isBlank,
  encode: encodePng,
  decodeInto: decodePngInto,
  resize(c, w, h) {
    c.width = w;
    c.height = h;
  },
  newCanvas: makeCanvas,
  thumb(d: Drawing, into: HTMLCanvasElement | null): HTMLCanvasElement {
    const w = d.line.width;
    const h = d.line.height;
    const s = Math.min(THUMB_W / w, THUMB_H / h);
    const tw = Math.max(1, Math.round(w * s));
    const th = Math.max(1, Math.round(h * s));
    const c = into ?? makeCanvas(tw, th);
    if (c.width !== tw || c.height !== th) {
      c.width = tw;
      c.height = th;
    }
    const g = c.getContext('2d');
    if (g) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, tw, th);
      g.imageSmoothingQuality = 'high';
      g.setTransform(s, 0, 0, s, 0, 0);
      paintDrawing(g, d);
    }
    return c;
  },
  defer(fn) {
    setTimeout(fn, 30);
  },
};
