import { describe, expect, it } from 'vitest';
import { addFrameHere, fillHold } from './timeline';

const ex = () => [{ drawing: 'a', length: 1 }, { drawing: 'b', length: 4 }, { drawing: 'c', length: 1 }];

describe('Flip add frame and fill (Procreate Dreams style)', () => {
  it('adds a page right after a one-frame drawing', () => {
    const r = addFrameHere(ex(), 0, 'n');
    expect(r.ex.map((e) => `${e.drawing}${e.length}`)).toEqual(['a1', 'n1', 'b4', 'c1']);
    expect(r.frame).toBe(1);
  });

  it('ends a hold at the current frame and adds the page there', () => {
    const r = addFrameHere(ex(), 2, 'n'); // second frame of b
    expect(r.ex.map((e) => `${e.drawing}${e.length}`)).toEqual(['a1', 'b2', 'n1', 'c1']);
    expect(r.frame).toBe(3);
  });

  it('with toEnd keeps the hold and adds after it', () => {
    const r = addFrameHere(ex(), 2, 'n', true);
    expect(r.ex.map((e) => `${e.drawing}${e.length}`)).toEqual(['a1', 'b4', 'n1', 'c1']);
    expect(r.frame).toBe(5);
  });

  it('past the end appends', () => {
    const r = addFrameHere(ex(), 99, 'n');
    expect(r.ex.at(-1)).toEqual({ drawing: 'n', length: 1 });
    expect(r.frame).toBe(6);
  });

  it('fills a drawing to the shot length, or does nothing when there is no room', () => {
    const r = fillHold(ex(), 1, 10)!;
    expect(r.ex.map((e) => e.length)).toEqual([1, 8, 1]);
    expect(r.frame).toBe(1);
    expect(fillHold(ex(), 1, 6)).toBeNull();
  });
});
