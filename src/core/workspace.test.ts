import { describe, expect, it } from 'vitest';
import { isPaintingWorkspace, paintingView } from './workspace';
describe('painting workspace preferences', () => {
  it('opens Draw as a still canvas and Animate as a flipbook', () => {
    expect(paintingView('draw', null)).toBe('still');
    expect(paintingView('animate', null)).toBe('flipbook');
  });
  it('keeps Draw optional animation independent from Animate clips', () => {
    expect(paintingView('draw', 'flipbook')).toBe('flipbook');
    expect(paintingView('draw', 'clips')).toBe('still');
    expect(paintingView('animate', 'clips')).toBe('clips');
    expect(paintingView('animate', 'timeline')).toBe('clips');
    expect(paintingView('animate', 'broken')).toBe('flipbook');
  });
  it('both painting modes permit painting without making Timing or Motion painting modes', () => {
    expect(['board', 'draw', 'animate', 'time', 'motion'].map(w => isPaintingWorkspace(w as Parameters<typeof isPaintingWorkspace>[0])))
      .toEqual([false, true, true, false, false]);
  });
});
