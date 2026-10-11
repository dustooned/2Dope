import { describe, expect, it } from 'vitest';
import { blockDropIndex, duplicateBlock, exposeAt, insertAt, moveBlock, normalize, setNote, shiftBlock } from './timeline';
import { frameLabel, isSecondBoundary } from './timecode';
import {
  addAfter,
  adjustHolds,
  changeHold,
  commonHold,
  dropIndex,
  indicesInFrames,
  moveExposure,
  removeIndices,
  setHolds,
  drawingAt,
  duplicateAt,
  locate,
  neighborDrawings,
  nextDrawing,
  prevDrawing,
  removeAt,
  totalFrames,
  type Exposure,
} from './timeline';

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

describe('x-sheet editing', () => {
  const e: Exposure[] = [
    { drawing: 'a', length: 2, note: 'hello' },
    { drawing: 'b', length: 3 },
    { drawing: 'c', length: 1 },
  ];

  it('typing a drawing at the start of an exposure replaces it, keeping its note and hold', () => {
    const r = exposeAt(e, 2, 'z');
    expect(r.map((x) => x.drawing)).toEqual(['a', 'z', 'c']);
    expect(r[1]!.length).toBe(3);
    expect(totalFrames(r)).toBe(6);
  });

  it('typing inside a hold splits it so later frames keep their timing', () => {
    const r = exposeAt(e, 3, 'z'); // b holds frames 2..4; z takes 3..4
    expect(r.map((x) => [x.drawing, x.length])).toEqual([
      ['a', 2],
      ['b', 1],
      ['z', 2],
      ['c', 1],
    ]);
    expect(totalFrames(r)).toBe(6);
    expect(r[0]!.note).toBe('hello');
  });

  it('typing the drawing that is already there changes nothing; matching a neighbor merges', () => {
    expect(exposeAt(e, 3, 'b')).toBe(e);
    const r = exposeAt(e, 2, 'a'); // b's slot becomes a, merges with the previous a
    expect(r.map((x) => [x.drawing, x.length])).toEqual([
      ['a', 5],
      ['c', 1],
    ]);
    expect(r[0]!.note).toBe('hello');
    expect(exposeAt(e, 99, 'z')).toBe(e);
  });

  it('normalize merges equal neighbors and leaves other arrays alone', () => {
    expect(normalize(e)).toBe(e);
    expect(
      normalize([
        { drawing: 'a', length: 1 },
        { drawing: 'a', length: 2, note: 'n' },
      ]),
    ).toEqual([{ drawing: 'a', length: 3, note: 'n' }]);
  });

  it('sets, trims and clears notes', () => {
    expect(setNote(e, 1, '  walk in ')[1]!.note).toBe('walk in');
    expect(setNote(e, 0, '')[0]!.note).toBeUndefined();
    expect(setNote(e, 0, 'hello')).toBe(e);
    expect(setNote(e, 9, 'x')).toBe(e);
    expect(setNote(e, 1, 'x'.repeat(500))[1]!.note!.length).toBe(200);
  });
});

describe('frame labels', () => {
  it('formats frames, seconds+frames and timecode (frame is 0-based)', () => {
    expect(frameLabel(0, 24, 'frames')).toBe('1');
    expect(frameLabel(23, 24, 'frames')).toBe('24');
    expect(frameLabel(0, 24, 'secFrames')).toBe('0+01');
    expect(frameLabel(24, 24, 'secFrames')).toBe('1+01');
    expect(frameLabel(35, 24, 'secFrames')).toBe('1+12');
    expect(frameLabel(0, 24, 'timecode')).toBe('00:00:00:00');
    expect(frameLabel(24 * 61 + 5, 24, 'timecode')).toBe('00:01:01:05');
    expect(frameLabel(24 * 3600, 24, 'timecode')).toBe('01:00:00:00');
  });
  it('marks second boundaries', () => {
    expect(isSecondBoundary(0, 12)).toBe(true);
    expect(isSecondBoundary(12, 12)).toBe(true);
    expect(isSecondBoundary(13, 12)).toBe(false);
  });
});

describe('block editing by touch', () => {
  const four: Exposure[] = [
    { drawing: 'a', length: 2 },
    { drawing: 'b', length: 1, note: 'hey' },
    { drawing: 'c', length: 3 },
    { drawing: 'd', length: 1 },
  ];
  const names = (x: Exposure[]) => x.map((e) => `${e.drawing}${e.length}`).join(' ');

  it('inserts at an index and selects what was inserted', () => {
    const r = insertAt(four, 1, [{ drawing: 'n', length: 1 }]);
    expect(names(r.ex)).toBe('a2 n1 b1 c3 d1');
    expect(r.selection).toEqual([1]);
    expect(r.frame).toBe(2);
    expect(names(insertAt(four, 99, [{ drawing: 'n', length: 2 }]).ex)).toBe('a2 b1 c3 d1 n2');
  });

  it('duplicates a block after its last exposure, keeping holds, dropping notes', () => {
    const r = duplicateBlock(four, [2, 1], ['b2', 'c2']);
    expect(names(r.ex)).toBe('a2 b1 c3 b21 c23 d1');
    expect(r.ex[3]!.note).toBeUndefined();
    expect(r.selection).toEqual([3, 4]);
    expect(r.frame).toBe(6);
  });

  it('moves a block (even a scattered one) as one piece; notes travel', () => {
    const r = moveBlock(four, [1, 3], 0);
    expect(names(r.ex)).toBe('b1 d1 a2 c3');
    expect(r.ex[0]!.note).toBe('hey');
    expect(r.selection).toEqual([0, 1]);
    expect(names(shiftBlock(four, [1], 1).ex)).toBe('a2 c3 b1 d1');
    expect(names(shiftBlock(four, [1], -5).ex)).toBe('b1 a2 c3 d1');
    expect(shiftBlock(four, [3], 1).ex).toBe(four); // already last: nothing changes
  });

  it('a dragged block lands by its centre', () => {
    // without b: a2 (mid 1) c3 (mid 3.5) d1 (mid 5.5)
    expect(blockDropIndex(four, [1], 0.5)).toBe(0);
    expect(blockDropIndex(four, [1], 1.5)).toBe(1);
    expect(blockDropIndex(four, [1], 4)).toBe(2);
    expect(blockDropIndex(four, [1], 9)).toBe(3);
  });
});
