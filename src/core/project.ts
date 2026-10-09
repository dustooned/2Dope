import { makeCanvas } from '../brush/raster';
import type { StrokeRecord } from './stroke';
import { drawingAt, totalFrames, type Exposure } from './timeline';

/** One drawing (cel): its raster pixels and its vector strokes. */
export interface Drawing {
  id: string;
  /** Display number, like a cel number on an X-sheet. */
  num: number;
  canvas: HTMLCanvasElement;
  vectors: StrokeRecord[];
  /** Bumped on every change, so thumbnails know when to redraw. */
  rev: number;
}

export const FPS_PRESETS = [12, 15, 24, 25, 30, 60];

/**
 * The project for slice 1: one drawing layer (its exposures) plus the drawings it shows.
 * Drawings are never deleted from the map while undo may still need them.
 */
export class Project {
  fps = 12;
  exposures: Exposure[];
  readonly drawings = new Map<string, Drawing>();
  private nextNum = 1;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    const d = this.newDrawing();
    this.exposures = [{ drawing: d.id, length: 1 }];
  }

  get length(): number {
    return totalFrames(this.exposures);
  }

  newDrawing(): Drawing {
    const num = this.nextNum++;
    const d: Drawing = { id: `d${num}`, num, canvas: makeCanvas(this.width, this.height), vectors: [], rev: 0 };
    this.drawings.set(d.id, d);
    return d;
  }

  cloneDrawing(src: Drawing): Drawing {
    const d = this.newDrawing();
    d.canvas.getContext('2d')?.drawImage(src.canvas, 0, 0);
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
