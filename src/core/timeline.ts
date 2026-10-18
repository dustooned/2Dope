/**
 * A drawing layer's timing, stored as run-length exposures: each entry shows one drawing for
 * `length` frames (a hold). Frame numbers are 0-based here; the UI shows them 1-based.
 * All functions are pure and return new arrays, so undo just keeps the old array.
 */
export interface Exposure {
  drawing: string;
  length: number;
  /** Optional text on the exposure sheet (dialogue, an action note). It travels with the drawing. */
  note?: string;
  /** Storyboard captions (Storyboard Pro's defaults): what is said, what happens, timing notes. */
  dialogue?: string;
  action?: string;
  slug?: string;
  /** Storyboard shot info for the hand-off (to animators, to 3D): which shot, and the camera. */
  shot?: string;
  camera?: string;
}

/** The caption fields of an exposure (a storyboard panel), in the order they are shown. */
export type CaptionField = 'shot' | 'camera' | 'dialogue' | 'action' | 'slug' | 'note';
export const CAPTION_FIELDS: { key: CaptionField; label: string; max: number }[] = [
  { key: 'shot', label: 'Shot', max: 60 },
  { key: 'camera', label: 'Camera', max: 200 },
  { key: 'dialogue', label: 'Dialogue', max: 1000 },
  { key: 'action', label: 'Action', max: 1000 },
  { key: 'slug', label: 'Slugging', max: 300 },
  { key: 'note', label: 'Notes', max: 1000 },
];

/** An exposure without its captions (a fresh copy of a panel). */
function withoutCaptions(e: Exposure): Exposure {
  const { note: _n, dialogue: _d, action: _a, slug: _s, ...rest } = e;
  void _n;
  void _d;
  void _a;
  void _s;
  return rest;
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
  /** Exposures to select after the edit (omitted: the caller decides). */
  selection?: number[];
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

// ---------------------------------------------------------------------------------------------
// Block editing by touch: insert, duplicate, paste, move. The result selects what was made or
// moved, so a second tap (move again, delete, copy) acts on the same block.

/** Insert exposures at `index` (0 = before the first, `ex.length` = at the end). */
export function insertAt(ex: Exposure[], index: number, items: Exposure[]): Edit {
  const at = Math.max(0, Math.min(ex.length, Math.round(index)));
  if (!items.length) return { ex, frame: startOf(ex, at), selection: [] };
  const out = ex.slice();
  out.splice(at, 0, ...items.map((e) => ({ ...e, length: Math.max(1, Math.round(e.length)) })));
  return { ex: out, frame: startOf(out, at), selection: items.map((_, i) => at + i) };
}

/**
 * Copy the listed exposures, in order and with their holds, right after the last of them.
 * `ids` are the drawings the copies show (new drawings for "duplicate", the same ids to repeat).
 */
export function duplicateBlock(ex: Exposure[], indices: number[], ids: string[]): Edit {
  const idx = uniqueSorted(indices, ex.length);
  if (!idx.length || ids.length !== idx.length) return { ex, frame: 0 };
  const items = idx.map((i, k) => ({ ...withoutCaptions(ex[i]!), drawing: ids[k]! }));
  return insertAt(ex, idx[idx.length - 1]! + 1, items);
}

/**
 * Take the listed exposures out (they close up into one block, keeping their order) and put the
 * block back so it starts at `to`, an index into what is left. Holds and notes travel along.
 */
export function moveBlock(ex: Exposure[], indices: number[], to: number): Edit {
  const idx = uniqueSorted(indices, ex.length);
  if (!idx.length) return { ex, frame: 0 };
  const pick = new Set(idx);
  const block = idx.map((i) => ex[i]!);
  const rest = ex.filter((_, i) => !pick.has(i));
  const at = Math.max(0, Math.min(rest.length, Math.round(to)));
  const out = [...rest.slice(0, at), ...block, ...rest.slice(at)];
  const selection = block.map((_, k) => at + k);
  if (out.every((e, i) => e === ex[i])) return { ex, frame: startOf(ex, idx[0]!), selection: idx };
  return { ex: out, frame: startOf(out, at), selection };
}

/** Move the listed exposures `delta` places earlier (−) or later (+) as one block. */
export function shiftBlock(ex: Exposure[], indices: number[], delta: number): Edit {
  const idx = uniqueSorted(indices, ex.length);
  if (!idx.length) return { ex, frame: 0 };
  return moveBlock(ex, idx, idx[0]! + Math.round(delta));
}

/** Where a dragged block lands (index into the exposures left without it) when its centre is at frame position `x`. */
export function blockDropIndex(ex: Exposure[], indices: number[], x: number): number {
  const pick = new Set(uniqueSorted(indices, ex.length));
  let pos = 0;
  let before = 0;
  for (let i = 0; i < ex.length; i++) {
    if (pick.has(i)) continue;
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

// ---------------------------------------------------------------------------------------------
// X-sheet style editing: type a drawing into a frame, per-drawing notes

/** Merge neighbors that show the same drawing (a note on the second one is kept only if the first has none). */
export function normalize(ex: Exposure[]): Exposure[] {
  const out: Exposure[] = [];
  let changed = false;
  for (const e of ex) {
    const last = out[out.length - 1];
    if (last && last.drawing === e.drawing) {
      // the first keeps its captions; an empty field takes the second's
      const merged: Exposure = { ...last, length: last.length + e.length };
      for (const f of CAPTION_FIELDS) if (!merged[f.key] && e[f.key]) merged[f.key] = e[f.key];
      out[out.length - 1] = merged;
      changed = true;
    } else {
      out.push(e);
    }
  }
  return changed ? out : ex;
}

/**
 * Show `drawing` starting at `frame`, the way typing a number into an exposure-sheet cell works:
 * it replaces the exposure from that frame to the end of its hold (splitting the hold if the frame
 * is in the middle of it), and neighbors showing the same drawing merge. Later frames keep their timing.
 */
export function exposeAt(ex: Exposure[], frame: number, drawing: string): Exposure[] {
  const l = locate(ex, frame);
  if (!l) return ex;
  const cur = ex[l.index]!;
  if (cur.drawing === drawing) return ex;
  const out = ex.slice();
  if (l.offset === 0) {
    out[l.index] = { ...cur, drawing };
  } else {
    out.splice(l.index, 1, { ...cur, length: l.offset }, { drawing, length: cur.length - l.offset });
  }
  return normalize(out);
}

/** Set (or clear, with empty text) the note on one exposure. */
export function setNote(ex: Exposure[], index: number, note: string): Exposure[] {
  return setCaption(ex, index, 'note', note);
}

/** Set (or clear, with empty text) one caption of an exposure (a storyboard panel). */
export function setCaption(ex: Exposure[], index: number, field: CaptionField, text: string): Exposure[] {
  const cur = ex[index];
  if (!cur) return ex;
  const max = CAPTION_FIELDS.find((f) => f.key === field)?.max ?? 1000;
  const value = text.trim().slice(0, max);
  if ((cur[field] ?? '') === value) return ex;
  const out = ex.slice();
  const next: Exposure = { ...cur };
  if (value) next[field] = value;
  else delete next[field];
  out[index] = next;
  return out;
}

/**
 * Flip's Add frame (Procreate Dreams style): a new one-frame drawing right after the frame you are
 * on. On a held drawing the hold ends at this frame (the rest of it gives way to the new page);
 * with `toEnd` the hold stays whole and the new page goes after it.
 */
export function addFrameHere(ex: Exposure[], frame: number, drawing: string, toEnd = false): Edit {
  const l = locate(ex, frame);
  if (!l) return { ex: [...ex, { drawing, length: 1 }], frame: totalFrames(ex), selection: [] };
  const e = ex[l.index]!;
  const keep = toEnd ? e.length : l.offset + 1;
  const next = [...ex.slice(0, l.index), { ...e, length: keep }, { drawing, length: 1 }, ...ex.slice(l.index + 1)];
  return { ex: next, frame: l.start + keep, selection: [] };
}

/** Fill duration: the drawing at `index` holds until the layer reaches `total` frames. */
export function fillHold(ex: Exposure[], index: number, total: number): Edit | null {
  const e = ex[index];
  const extra = total - totalFrames(ex);
  if (!e || extra <= 0) return null;
  const next = ex.map((x, i) => (i === index ? { ...x, length: x.length + extra } : x));
  let start = 0;
  for (let i = 0; i < index; i++) start += ex[i]!.length;
  return { ex: next, frame: start, selection: [] };
}
