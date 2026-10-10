import { describe, expect, it } from 'vitest';
import { addAfter, changeHold, drawingAt, duplicateAt, locate, neighborDrawings, nextDrawing, prevDrawing, removeAt, totalFrames, type Exposure } from './timeline';

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
