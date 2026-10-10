import { describe, expect, it } from 'vitest';
import { addAfter, adjustHolds, changeHold, commonHold, dropIndex, indicesInFrames, moveExposure, removeIndices, setHolds, drawingAt, duplicateAt, locate, neighborDrawings, nextDrawing, prevDrawing, removeAt, totalFrames, type Exposure } from './timeline';

const ex: Exposure[] = [
  { drawing: 'a', length: 2 },
  { drawing: 'b', length: 1 },
  { drawing: 'c', length: 3 },
];

describe('timeline', () => {
  it('locates frames inside holds', () => {
    expect(totalFrames(ex)).toBe(6);
    expect(locate(ex, 0)).toEqual({ index: 0, offset: 0, start: 0 });
    expect(locate(ex, 1)).toEqual({ index: 0, offset: 1, start: 0 });
    expect(locate(ex, 5)).toEqual({ index: 2, offset: 2, start: 3 });
    expect(locate(ex, 6)).toBeNull();
    expect(drawingAt(ex, 4)).toBe('c');
  });

  it('adds after the last frame of an exposure by inserting one frame', () => {
    const r = addAfter(ex, 2, 'n');
    expect(r.ex.map((e) => e.drawing)).toEqual(['a', 'b', 'n', 'c']);
    expect(totalFrames(r.ex)).toBe(7);
    expect(r.frame).toBe(3);
  });

  it('adds inside a hold by splitting it, keeping the timing', () => {
    const r = addAfter(ex, 3, 'n'); // first frame of c (held 3)
    expect(r.ex).toEqual([
      { drawing: 'a', length: 2 },
      { drawing: 'b', length: 1 },
      { drawing: 'c', length: 1 },
      { drawing: 'n', length: 2 },
    ]);
    expect(totalFrames(r.ex)).toBe(6);
    expect(r.frame).toBe(4);
  });

  it('duplicates with the same hold and moves to the copy', () => {
    const r = duplicateAt(ex, 1, 'a2');
    expect(r.ex.slice(0, 2)).toEqual([
      { drawing: 'a', length: 2 },
      { drawing: 'a2', length: 2 },
    ]);
    expect(r.frame).toBe(2);
  });

  it('removes the whole exposure', () => {
    const r = removeAt(ex, 4);
    expect(r.ex.map((e) => e.drawing)).toEqual(['a', 'b']);
    expect(r.frame).toBe(2);
  });

  it('changes holds with a minimum of 1', () => {
    expect(changeHold(ex, 2, 2).ex[1]).toEqual({ drawing: 'b', length: 3 });
    expect(changeHold(ex, 2, -5).ex[1]).toEqual({ drawing: 'b', length: 1 });
    expect(changeHold(ex, 5, -2).frame).toBe(3);
  });

  it('jumps between drawings, skipping holds', () => {
    expect(nextDrawing(ex, 0)).toBe(2);
    expect(nextDrawing(ex, 2)).toBe(3);
    expect(nextDrawing(ex, 4)).toBe(4);
    expect(prevDrawing(ex, 5)).toBe(3);
    expect(prevDrawing(ex, 3)).toBe(2);
    expect(prevDrawing(ex, 0)).toBe(0);
  });
});

describe('onion neighbors', () => {
  const ex2: Exposure[] = [
    { drawing: 'a', length: 2 },
    { drawing: 'b', length: 3 },
    { drawing: 'c', length: 1 },
    { drawing: 'd', length: 2 },
  ];
  it('skips holds and counts distinct drawings on each side', () => {
    const r = neighborDrawings(ex2, 3, 2, 2); // inside b's hold
    expect(r.before).toEqual([{ drawing: 'a', distance: 1 }]);
    expect(r.after).toEqual([
      { drawing: 'c', distance: 1 },
      { drawing: 'd', distance: 2 },
    ]);
  });
  it('limits to the requested counts and handles the ends', () => {
    expect(neighborDrawings(ex2, 0, 3, 1).before).toEqual([]);
    expect(neighborDrawings(ex2, 6, 1, 3).after).toEqual([]);
    expect(neighborDrawings(ex2, 5, 1, 1).before).toEqual([{ drawing: 'b', distance: 1 }]);
  });
});

describe('multi-exposure editing', () => {
  const e: Exposure[] = [
    { drawing: 'a', length: 1 },
    { drawing: 'b', length: 3 },
    { drawing: 'c', length: 2 },
    { drawing: 'd', length: 1 },
  ];

  it('sets exposure on a selection without deleting any drawing, and restores by setting back', () => {
    const twos = setHolds(e, [0, 1, 3], 2);
    expect(twos.map((x) => x.drawing)).toEqual(['a', 'b', 'c', 'd']);
    expect(twos.map((x) => x.length)).toEqual([2, 2, 2, 2]);
    expect(setHolds(twos, [0, 1, 3], 1).map((x) => x.length)).toEqual([1, 1, 2, 1]);
    expect(setHolds(e, [0], 1)).toBe(e); // unchanged -> same array
    expect(setHolds(e, [0], 0)[0]!.length).toBe(1); // minimum 1
    expect(setHolds(e, [99, -1], 2)).toBe(e); // ignores bad indices
  });

  it('adjusts holds by a delta and keeps them at least 1', () => {
    expect(adjustHolds(e, [0, 1], 1).map((x) => x.length)).toEqual([2, 4, 2, 1]);
    expect(adjustHolds(e, [0, 3], -1)).toBe(e);
    expect(adjustHolds(e, [1], -5).map((x) => x.length)).toEqual([1, 1, 2, 1]);
  });

  it('removes and moves exposures', () => {
    expect(removeIndices(e, [1, 3]).map((x) => x.drawing)).toEqual(['a', 'c']);
    expect(moveExposure(e, 0, 2).map((x) => x.drawing)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveExposure(e, 3, 0).map((x) => x.drawing)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveExposure(e, 1, 1)).toBe(e);
    expect(moveExposure(e, 1, 99).map((x) => x.drawing)).toEqual(['a', 'c', 'd', 'b']);
  });

  it('finds the drop slot from the pointer position', () => {
    // dragging 'a' (index 0): others are b[0..3) c[3..5) d[5..6); centers 1.5, 4, 5.5
    expect(dropIndex(e, 0, 0.2)).toBe(0);
    expect(dropIndex(e, 0, 2)).toBe(1);
    expect(dropIndex(e, 0, 4.5)).toBe(2);
    expect(dropIndex(e, 0, 9)).toBe(3);
  });

  it('selects exposures overlapping a frame range and reports mixed holds', () => {
    expect(indicesInFrames(e, 1, 3)).toEqual([1]);
    expect(indicesInFrames(e, 3, 4)).toEqual([1, 2]);
    expect(indicesInFrames(e, 4, 3)).toEqual([1, 2]);
    expect(indicesInFrames(e, 0, 0)).toEqual([0]);
    expect(indicesInFrames(e, 100, 200)).toEqual([]);
    expect(commonHold(e, [0, 3])).toBe(1);
    expect(commonHold(e, [0, 1])).toBeNull();
    expect(commonHold(e, [])).toBeNull();
  });

  it('onion neighbors can be limited to accepted drawings (keys only)', () => {
    const keys = new Set(['a', 'd']);
    const r = neighborDrawings(e, 4, 3, 3, (id) => keys.has(id)); // inside c
    expect(r.before.map((n) => n.drawing)).toEqual(['a']);
    expect(r.after.map((n) => n.drawing)).toEqual(['d']);
  });
});
