/**
 * A drawing layer's timing, stored as run-length exposures: each entry shows one drawing for
 * `length` frames (a hold). Frame numbers are 0-based here; the UI shows them 1-based.
 * All functions are pure and return new arrays, so undo just keeps the old array.
 */
export interface Exposure {
  drawing: string;
  length: number;
}

export interface Located {
  /** Index of the exposure. */
  index: number;
  /** Frame offset inside the exposure. */
  offset: number;
  /** First frame of the exposure. */
  start: number;
}

export interface Edit {
  ex: Exposure[];
  /** Where the playhead should go after the edit. */
  frame: number;
}

export function totalFrames(ex: Exposure[]): number {
  let n = 0;
  for (const e of ex) n += e.length;
  return n;
}

export function locate(ex: Exposure[], frame: number): Located | null {
  let start = 0;
  for (let i = 0; i < ex.length; i++) {
    const len = ex[i]!.length;
    if (frame < start + len) return { index: i, offset: frame - start, start };
    start += len;
  }
  return null;
}

export function drawingAt(ex: Exposure[], frame: number): string | null {
  const l = locate(ex, frame);
  return l ? ex[l.index]!.drawing : null;
}

export function startOf(ex: Exposure[], index: number): number {
  let s = 0;
  for (let i = 0; i < index && i < ex.length; i++) s += ex[i]!.length;
  return s;
}

/**
 * Add a new drawing after the current frame.
 * - On the last frame of an exposure: insert the new drawing for 1 frame (later frames move right).
 * - Inside a hold: cut the hold at the current frame; the new drawing takes the rest of the hold,
 *   so the timing is unchanged (a hold on twos becomes two ones).
 */
export function addAfter(ex: Exposure[], frame: number, drawing: string): Edit {
  const l = locate(ex, frame);
  if (!l) return { ex: [...ex, { drawing, length: 1 }], frame: totalFrames(ex) };
  const cur = ex[l.index]!;
  const out = ex.slice();
  const remaining = cur.length - l.offset - 1;
  if (remaining > 0) {
    out.splice(l.index, 1, { ...cur, length: l.offset + 1 }, { drawing, length: remaining });
  } else {
    out.splice(l.index + 1, 0, { drawing, length: 1 });
  }
  return { ex: out, frame: frame + 1 };
}

/** Insert a copy (a new drawing id) right after the current exposure, with the same hold. */
export function duplicateAt(ex: Exposure[], frame: number, drawing: string): Edit {
  const l = locate(ex, frame);
  if (!l) return { ex, frame };
  const cur = ex[l.index]!;
  const out = ex.slice();
  out.splice(l.index + 1, 0, { drawing, length: cur.length });
  return { ex: out, frame: l.start + cur.length };
}

/** Remove the whole exposure under the frame (the drawing and its hold). */
export function removeAt(ex: Exposure[], frame: number): Edit {
  const l = locate(ex, frame);
  if (!l) return { ex, frame };
  const out = ex.slice();
  out.splice(l.index, 1);
  const total = totalFrames(out);
  return { ex: out, frame: Math.max(0, Math.min(l.start, total - 1)) };
}

/** Lengthen or shorten the hold under the frame (minimum 1). */
export function changeHold(ex: Exposure[], frame: number, delta: number): Edit {
  const l = locate(ex, frame);
  if (!l) return { ex, frame };
  const cur = ex[l.index]!;
  const length = Math.max(1, cur.length + delta);
  const out = ex.slice();
  out[l.index] = { ...cur, length };
  return { ex: out, frame: Math.min(frame, l.start + length - 1) };
}

/** First frame of the next drawing (stays put on the last one). */
export function nextDrawing(ex: Exposure[], frame: number): number {
  const l = locate(ex, frame);
  if (!l || l.index >= ex.length - 1) return frame;
  return l.start + ex[l.index]!.length;
}

/** First frame of this drawing, or of the previous one when already at its start. */
export function prevDrawing(ex: Exposure[], frame: number): number {
  const l = locate(ex, frame);
  if (!l) return frame;
  if (l.offset > 0) return l.start;
  if (l.index === 0) return 0;
  return startOf(ex, l.index - 1);
}

export interface Neighbor {
  drawing: string;
  /** 1 = the nearest distinct drawing on that side. */
  distance: number;
}

/**
 * The distinct drawings before and after the current one (holds are skipped, like flipping
 * through paper). Used for onion skins.
 */
export function neighborDrawings(
  ex: Exposure[],
  frame: number,
  before: number,
  after: number,
  /** Only count drawings this accepts (e.g. keys only). */
  accept: (drawing: string) => boolean = () => true,
): { before: Neighbor[]; after: Neighbor[] } {
  const l = locate(ex, frame);
  const out = { before: [] as Neighbor[], after: [] as Neighbor[] };
  if (!l) return out;
  const current = ex[l.index]!.drawing;
  for (let i = l.index - 1, n = 1; i >= 0 && n <= before; i--) {
    const id = ex[i]!.drawing;
    if (id === current || !accept(id) || out.before.some((b) => b.drawing === id)) continue;
    out.before.push({ drawing: id, distance: n++ });
  }
  for (let i = l.index + 1, n = 1; i < ex.length && n <= after; i++) {
    const id = ex[i]!.drawing;
    if (id === current || !accept(id) || out.after.some((a) => a.drawing === id)) continue;
    out.after.push({ drawing: id, distance: n++ });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Editing several exposures at once (selection, exposure, drag)

function uniqueSorted(indices: number[], n: number): number[] {
  return [...new Set(indices)].filter((i) => Number.isInteger(i) && i >= 0 && i < n).sort((a, b) => a - b);
}

/** Set the hold of every listed exposure to `length` frames (minimum 1). Returns the same array if nothing changed. */
export function setHolds(ex: Exposure[], indices: number[], length: number): Exposure[] {
  const len = Math.max(1, Math.round(length));
  const idx = uniqueSorted(indices, ex.length);
  if (!idx.some((i) => ex[i]!.length !== len)) return ex;
  const out = ex.slice();
  for (const i of idx) out[i] = { ...out[i]!, length: len };
  return out;
}

/** Add `delta` frames to every listed exposure's hold (each stays at least 1). */
export function adjustHolds(ex: Exposure[], indices: number[], delta: number): Exposure[] {
  const idx = uniqueSorted(indices, ex.length);
  const out = ex.slice();
  let changed = false;
  for (const i of idx) {
    const length = Math.max(1, ex[i]!.length + delta);
    if (length !== ex[i]!.length) {
      out[i] = { ...ex[i]!, length };
      changed = true;
    }
  }
  return changed ? out : ex;
}

/** Remove the listed exposures. */
export function removeIndices(ex: Exposure[], indices: number[]): Exposure[] {
  const idx = new Set(uniqueSorted(indices, ex.length));
  return idx.size ? ex.filter((_, i) => !idx.has(i)) : ex;
}

/** Move the exposure at `from` so it ends up at index `to` (in the resulting array). */
export function moveExposure(ex: Exposure[], from: number, to: number): Exposure[] {
  if (from < 0 || from >= ex.length) return ex;
  const t = Math.max(0, Math.min(ex.length - 1, to));
  if (t === from) return ex;
  const out = ex.slice();
  const [item] = out.splice(from, 1);
  out.splice(t, 0, item!);
  return out;
}

/** Where a dragged exposure lands if its center is at frame position `x` (fractional frames). */
export function dropIndex(ex: Exposure[], from: number, x: number): number {
  let pos = 0;
  let before = 0;
  for (let i = 0; i < ex.length; i++) {
    if (i === from) continue;
    const len = ex[i]!.length;
    if (pos + len / 2 < x) before++;
    pos += len;
  }
  return before;
}

/** Exposures that overlap the frame range [f0, f1] (inclusive, any order). */
export function indicesInFrames(ex: Exposure[], f0: number, f1: number): number[] {
  const a = Math.min(f0, f1);
  const b = Math.max(f0, f1);
  const out: number[] = [];
  let start = 0;
  for (let i = 0; i < ex.length; i++) {
    const end = start + ex[i]!.length - 1;
    if (end >= a && start <= b) out.push(i);
    start += ex[i]!.length;
  }
  return out;
}

/** The hold all listed exposures share, or null when they differ (shown as "mixed") or none are listed. */
export function commonHold(ex: Exposure[], indices: number[]): number | null {
  const idx = uniqueSorted(indices, ex.length);
  if (!idx.length) return null;
  const first = ex[idx[0]!]!.length;
  return idx.every((i) => ex[i]!.length === first) ? first : null;
}
