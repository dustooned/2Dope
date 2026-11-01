import { describe, expect, it } from 'vitest';
import { parseShot, renumberScenes, scenesOf, stickersOf, toggleMove, toggleShot } from './scenes';

describe('stickers in the Camera field', () => {
  it('sets one shot type and toggles moves, keeping other words', () => {
    let c = toggleShot('', 'CU');
    expect(c).toBe('CU');
    c = toggleMove(c, 'Pan left');
    expect(c).toBe('CU · Pan left');
    c = toggleShot(`${c} · slow`, 'WS');
    expect(c).toBe('WS · Pan left · slow');
    expect(stickersOf(c)).toEqual({ shot: 'WS', moves: ['Pan left'] });
    expect(toggleShot(c, 'WS')).toBe('Pan left · slow');
    expect(toggleMove(c, 'pan left')).toBe('WS · slow');
  });
});

describe('scenes from Shot / scene', () => {
  it('reads scene and shot numbers and carries the scene forward', () => {
    expect(parseShot('Sc 2 · Sh 3 · INT. KITCHEN')).toEqual({ scene: 2, shot: 3, rest: 'INT. KITCHEN' });
    expect(parseShot('Wide')).toBeNull();
    expect(scenesOf(['Wide', 'Sc 1 · Sh 1', '', 'Sc 2 · Sh 1', 'x'])).toEqual([0, 1, 1, 2, 2]);
  });
  it('starts a scene at a panel and renumbers the rest', () => {
    const shots = ['Sc 1 · Sh 1 · INT. HALL', 'Sc 1 · Sh 2', 'Sc 1 · Sh 3', 'Sc 2 · Sh 1 · EXT. ST', 'Sc 2 · Sh 2'];
    expect(renumberScenes(shots, 2)).toEqual(['Sc 1 · Sh 1 · INT. HALL', 'Sc 1 · Sh 2', 'Sc 2 · Sh 1', 'Sc 3 · Sh 1 · EXT. ST', 'Sc 3 · Sh 2']);
    expect(renumberScenes(['', 'notes', 'Sc 5'], null)).toEqual(['', 'notes', 'Sc 1 · Sh 1']);
    expect(renumberScenes(['Wide', 'Close'], 0)).toEqual(['Sc 1 · Sh 1 · Wide', 'Sc 1 · Sh 2 · Close']);
  });
});
