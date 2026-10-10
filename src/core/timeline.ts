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
export function neighborDrawings(ex: Exposure[], frame: number, before: number, after: number): { before: Neighbor[]; after: Neighbor[] } {
  const l = locate(ex, frame);
  const out = { before: [] as Neighbor[], after: [] as Neighbor[] };
  if (!l) return out;
  const current = ex[l.index]!.drawing;
  for (let i = l.index - 1, n = 1; i >= 0 && n <= before; i--) {
    const id = ex[i]!.drawing;
    if (id === current || out.before.some((b) => b.drawing === id)) continue;
    out.before.push({ drawing: id, distance: n++ });
  }
  for (let i = l.index + 1, n = 1; i < ex.length && n <= after; i++) {
    const id = ex[i]!.drawing;
    if (id === current || out.after.some((a) => a.drawing === id)) continue;
    out.after.push({ drawing: id, distance: n++ });
  }
  return out;
}
