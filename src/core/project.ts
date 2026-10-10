import { makeCanvas } from '../brush/raster';
import { drawVectorStroke } from '../brush/vector';
import { strokeLength, type StrokeRecord } from './stroke';
import { drawingAt, totalFrames, type Exposure } from './timeline';

/** Which pixel plane a tool writes to. */
export type Plane = 'line' | 'fill';

/**
 * One drawing (cel). To the rest of the app it is one image; inside it keeps separate planes:
 * `fill` (flat color, always under) and `line` (linework, on top), plus vector strokes (line-like,
 * drawn above the fill). Fills therefore never touch the lines, and recoloring a fill can't
 * change the line art. The fill plane is created on first use to save memory.
 */
export interface Drawing {
  id: string;
  /** Display number, like a cel number on an X-sheet. */
  num: number;
  line: HTMLCanvasElement;
  fill: HTMLCanvasElement | null;
  vectors: StrokeRecord[];
  /** Bumped on every change, so thumbnails and onion skins know when to redraw. */
  rev: number;
}

export const FPS_PRESETS = [12, 15, 24, 25, 30, 60];

/** Draw the whole drawing (fill, then line, then vectors) onto a context. */
export function paintDrawing(g: CanvasRenderingContext2D, d: Drawing): void {
  if (d.fill) g.drawImage(d.fill, 0, 0);
  g.drawImage(d.line, 0, 0);
  for (const v of d.vectors) drawVectorStroke(g, v, strokeLength(v.points));
}

/** The plane's canvas, creating the fill plane on demand. */
export function planeCanvas(d: Drawing, plane: Plane): HTMLCanvasElement {
  if (plane === 'line') return d.line;
  if (!d.fill) d.fill = makeCanvas(d.line.width, d.line.height);
  return d.fill;
}

/**
 * The project for the current slice: one drawing layer (its exposures) plus the drawings it shows.
 * Drawings are never deleted from the map while undo may still need them.
 */
export class Project {
  name = 'Untitled';
  created = new Date().toISOString();
  fps = 12;
  exposures: Exposure[];
  readonly drawings = new Map<string, Drawing>();
  private nextNum = 1;

  /** `blank = false` makes an empty shell for the loader to fill (no first drawing). */
  constructor(
    readonly width: number,
    readonly height: number,
    blank = true,
  ) {
    if (blank) {
      const d = this.newDrawing();
      this.exposures = [{ drawing: d.id, length: 1 }];
    } else {
      this.exposures = [];
    }
  }

  /** Add a drawing with a known id (used when loading a file). */
  adopt(id: string, num: number, vectors: StrokeRecord[]): Drawing {
    const d: Drawing = { id, num, line: makeCanvas(this.width, this.height), fill: null, vectors, rev: 0 };
    this.drawings.set(id, d);
    this.nextNum = Math.max(this.nextNum, num + 1);
    return d;
  }

  get length(): number {
    return totalFrames(this.exposures);
  }

  newDrawing(): Drawing {
    const num = this.nextNum++;
    const d: Drawing = { id: `d${num}`, num, line: makeCanvas(this.width, this.height), fill: null, vectors: [], rev: 0 };
    this.drawings.set(d.id, d);
    return d;
  }

  cloneDrawing(src: Drawing): Drawing {
    const d = this.newDrawing();
    d.line.getContext('2d')?.drawImage(src.line, 0, 0);
    if (src.fill) planeCanvas(d, 'fill').getContext('2d')?.drawImage(src.fill, 0, 0);
    d.vectors = [...src.vectors];
    return d;
  }

  drawing(id: string): Drawing {
    const d = this.drawings.get(id);
    if (!d) throw new Error(`unknown drawing ${id}`);
    return d;
  }

  drawingAtFrame(frame: number): Drawing {
    const id = drawingAt(this.exposures, frame) ?? this.exposures[0]!.drawing;
    return this.drawing(id);
  }
}
