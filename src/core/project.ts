import { makeCanvas } from '../brush/raster';
import { drawVectorStroke } from '../brush/vector';
import { strokeLength, type StrokeRecord } from './stroke';
import { drawingsLayer, newComp, type BinFolder, type Comp, type DrawingsLayer } from './comp';
import { drawingAt, totalFrames, type Exposure } from './timeline';

/** What a drawing is for in the animation: a key pose, a breakdown between keys, or an inbetween. */
export type Role = 'key' | 'breakdown' | 'inbetween';
export const ROLES: Role[] = ['key', 'breakdown', 'inbetween'];

/** Which pixel plane a tool writes to. */
export type Plane = 'line' | 'fill';

/** Where a parked plane's pixels are: a stored asset key, or PNG bytes held in memory until stored. */
export interface PlaneRef {
  key: string | null;
  bytes: Uint8Array | null;
}

/**
 * A drawing that is not on screen gives its canvases back to the browser (they shrink to 0×0) and
 * keeps its pixels compressed instead. `null` planes were blank. See core/residency.ts.
 */
export interface Parked {
  rev: number;
  line: PlaneRef | null;
  fill: PlaneRef | null;
}

/** The asset keys this drawing's planes were last stored under, valid while `rev` matches. */
export interface SavedKeys {
  rev: number;
  line: string | null;
  fill: string | null;
}

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
  /** Optional label shown on the timeline; does not change how the drawing looks. */
  role: Role | null;
  /** Bumped on every change, so thumbnails and onion skins know when to redraw. */
  rev: number;
  /** Non-null while the pixels are packed away (canvases are 0×0). Use the residency manager to bring them back. */
  parked: Parked | null;
  /** Where autosave last stored the planes (lets saves skip unchanged drawings). */
  saved: SavedKeys | null;
  /** Small preview kept even while parked (timeline thumbnails, placeholders). */
  thumb: HTMLCanvasElement | null;
  /** The `rev` the thumbnail shows. */
  thumbRev: number;
}

/** Are the drawing's pixels in its canvases right now? */
export function isResident(d: Drawing): boolean {
  return d.parked === null;
}

export const FPS_PRESETS = [12, 15, 24, 25, 30, 50, 60];

/** Draw the whole drawing (fill, then line, then vectors) onto a context. */
export function paintDrawing(g: CanvasRenderingContext2D, d: Drawing): void {
  if (d.parked) return; // pixels packed away: callers bring the drawing back first
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

function blankDrawing(id: string, num: number): Omit<Drawing, 'line'> {
  return { id, num, fill: null, vectors: [], role: null, rev: 0, parked: null, saved: null, thumb: null, thumbRev: -1 };
}

/**
 * A project: comps (the shot and its precomps), the drawings their layers show, and the bin
 * folders. Drawings live in one pool and are referenced by id, so a drawing can appear in several
 * layers. Drawings are never deleted from the pool while undo may still need them.
 *
 * The flipbook strip and X-sheet edit one **active drawings layer** of one **active comp**;
 * `exposures`, `fps` and `length` are shortcuts to them, so those views did not have to change.
 */
export class Project {
  name = 'Untitled';
  created = new Date().toISOString();
  readonly drawings = new Map<string, Drawing>();
  readonly comps = new Map<string, Comp>();
  folders: BinFolder[] = [];
  /** The comp that is "the shot" (what export and Blender take by default). */
  main = 'c1';
  /** The comp being edited. */
  activeComp = 'c1';
  /** The drawings layer the strip and X-sheet edit. */
  activeLayer = 'L1';
  private nextNum = 1;

  /**
   * `width`×`height` is the page size of every drawing. A blank project gets one comp of that
   * size with one drawings layer showing one empty drawing. `blank = false` makes an empty shell
   * for the loader to fill.
   */
  constructor(
    readonly width: number,
    readonly height: number,
    blank = true,
  ) {
    if (blank) {
      const d = this.newDrawing();
      const c = newComp('c1', 'Shot', width, height, 12);
      c.layers.push(drawingsLayer('L1', 'Drawing', [{ drawing: d.id, length: 1 }], width, height));
      this.comps.set(c.id, c);
    }
  }

  /** The comp being edited. */
  get comp(): Comp {
    const c = this.comps.get(this.activeComp) ?? this.comps.get(this.main) ?? this.comps.values().next().value;
    if (!c) throw new Error('the project has no comps');
    return c;
  }

  /** The drawings layer being edited (the first one of the comp if the chosen one is gone). */
  get layer(): DrawingsLayer {
    const c = this.comp;
    const chosen = c.layers.find((l) => l.id === this.activeLayer);
    if (chosen && chosen.kind === 'drawings') return chosen;
    const first = c.layers.find((l): l is DrawingsLayer => l.kind === 'drawings');
    if (first) {
      this.activeLayer = first.id;
      return first;
    }
    // A comp without drawings: the strip shows a blank placeholder. It joins the comp only when
    // someone draws or edits timing on it (editLayer), so looking never changes the project.
    if (!this.ghost || this.ghostComp !== c.id) {
      const d = this.newDrawing();
      this.ghost = drawingsLayer('__new', 'Drawing', [{ drawing: d.id, length: 1 }], this.width, this.height, c.width, c.height);
      this.ghostComp = c.id;
    }
    return this.ghost;
  }

  private ghost: DrawingsLayer | null = null;
  private ghostComp = '';

  /** Is the strip showing the placeholder of a comp that has no drawings layer yet? */
  get isPlaceholder(): boolean {
    return this.layer === this.ghost;
  }

  /** The layer the editors write to: the placeholder becomes a real layer of the comp here. */
  editLayer(): DrawingsLayer {
    const l = this.layer;
    if (l === this.ghost) {
      l.id = this.newId('L');
      this.comp.layers.push(l);
      this.activeLayer = l.id;
      this.ghost = null;
    }
    return l;
  }

  /** The active layer's exposures. */
  get exposures(): Exposure[] {
    return this.layer.exposures;
  }

  set exposures(ex: Exposure[]) {
    this.editLayer().exposures = ex;
  }

  /** The active comp's frame rate. */
  get fps(): number {
    return this.comp.fps;
  }

  set fps(n: number) {
    this.comp.fps = n;
  }

  /** Frames in the active layer (the strip's length). */
  get length(): number {
    return totalFrames(this.exposures);
  }

  /** A fresh id with a prefix (c = comp, L = layer, f = folder) not used anywhere in the project. */
  newId(prefix: string): string {
    const used = new Set<string>([...this.comps.keys(), ...this.folders.map((f) => f.id)]);
    for (const c of this.comps.values()) for (const l of c.layers) used.add(l.id);
    for (let i = 1; ; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
  }

  /** Every drawing id some drawings layer shows (the ones a save must keep). */
  usedDrawings(): Set<string> {
    const used = new Set<string>();
    for (const c of this.comps.values()) for (const l of c.layers) if (l.kind === 'drawings') for (const e of l.exposures) used.add(e.drawing);
    return used;
  }

  /**
   * Add a drawing with a known id (used when loading a file). With `parked`, the pixels stay in
   * storage until the drawing is needed, so opening a long shot costs almost no memory.
   */
  adopt(id: string, num: number, vectors: StrokeRecord[], role: Role | null = null, parked: Parked | null = null): Drawing {
    const size = parked ? 0 : 1;
    const d: Drawing = { ...blankDrawing(id, num), line: makeCanvas(this.width * size, this.height * size), vectors, role, parked };
    this.drawings.set(id, d);
    this.nextNum = Math.max(this.nextNum, num + 1);
    return d;
  }

  /** A drawing with this cel number, if one exists. */
  drawingByNum(num: number): Drawing | null {
    for (const d of this.drawings.values()) if (d.num === num) return d;
    return null;
  }

  newDrawing(): Drawing {
    let num = this.nextNum++;
    while (this.drawings.has(`d${num}`)) num = this.nextNum++;
    const d: Drawing = { ...blankDrawing(`d${num}`, num), line: makeCanvas(this.width, this.height) };
    this.drawings.set(d.id, d);
    return d;
  }

  /** Copy a drawing. `src` must be resident. */
  cloneDrawing(src: Drawing): Drawing {
    if (src.parked) throw new Error('cannot copy a drawing whose pixels are packed away');
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

  /** The drawing the active layer shows at a frame of its own time. */
  drawingAtFrame(frame: number): Drawing {
    const id = drawingAt(this.exposures, frame) ?? this.exposures[0]!.drawing;
    return this.drawing(id);
  }
}
