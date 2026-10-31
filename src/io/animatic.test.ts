import { describe, expect, it } from 'vitest';
import { drawingsLayer, newComp } from '../core/comp';
import { animaticLength, animaticOptions, boardOf, DEFAULT_ANIMATIC } from './animatic';
import { DEFAULT_VIDEO, planVideo } from './videoplan';

function shot() {
  const c = newComp('shot', 'Shot', 1920, 1080, 24);
  c.layers.push(drawingsLayer('L1', 'Drawing', [{ drawing: 'd1', length: 96 }], 1920, 1080));
  const board = drawingsLayer('B', 'Storyboard', [{ drawing: 'p1', length: 24, dialogue: 'A: hi' }, { drawing: 'p2', length: 36 }], 1920, 1080);
  board.guide = true;
  board.start = 6;
  c.layers.push(board);
  return { main: c.id, comp: c, comps: new Map([[c.id, c]]) };
}

describe('animatic export', () => {
  it('reads stored choices safely, burning subtitles in by default', () => {
    expect(animaticOptions(null)).toEqual(DEFAULT_ANIMATIC);
    expect(DEFAULT_ANIMATIC).toEqual({ picture: 'board', burn: true, srt: false });
    expect(animaticOptions({ picture: 'shot', burn: false, srt: true })).toEqual({ picture: 'shot', burn: false, srt: true });
    expect(animaticOptions({ picture: 'nope', burn: 'x', srt: 1 })).toEqual(DEFAULT_ANIMATIC);
  });

  it('finds the board and ends with its last panel', () => {
    const p = shot();
    const board = boardOf(p.comp);
    expect(board?.id).toBe('B');
    expect(animaticLength(board!)).toBe(66);
    expect(boardOf(newComp('x', 'X', 10, 10, 24))).toBeNull();
  });

  it('plans the video on the shot clock for the animatic length', () => {
    const p = shot();
    const full = planVideo(p, DEFAULT_VIDEO);
    const anim = planVideo(p, DEFAULT_VIDEO, undefined, animaticLength(boardOf(p.comp)!));
    expect(full.frames).toBe(96);
    expect([anim.frames, anim.fps, anim.width, anim.height]).toEqual([66, 24, 1280, 720]);
    expect(anim.estimatedBytes).toBeLessThan(full.estimatedBytes);
  });
});
