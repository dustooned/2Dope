import { describe, expect, it } from 'vitest';
import { anchorOf, timecodeBox, timecodeText } from './fxtimecode';
import { burnInLabel } from '../core/timecode';
import { effectsKey, EFFECT_TEXT_MAX, newEffect, readEffects, type LayerEffect } from '../core/effects';
import { drawingsLayer, newComp } from '../core/comp';
import { compFile, minimumDrawingSchema, migrate, SCHEMA } from '../io/schema';

const tc = (params: LayerEffect['params'] = {}): LayerEffect => ({ ...newEffect('timecode', 't1', 1), params });

describe('burn-in label', () => {
  it('reads frames from 1, seconds + frames, and SMPTE hh:mm:ss:ff', () => {
    expect(burnInLabel(0, 24, 'frames')).toBe('1');
    expect(burnInLabel(47, 24, 'frames')).toBe('48');
    expect(burnInLabel(25, 24, 'secFrames')).toBe('1+02');
    expect(burnInLabel(0, 24, 'timecode')).toBe('00:00:00:00');
    expect(burnInLabel(24 * 3661 + 5, 24, 'timecode')).toBe('01:01:01:05');
    expect(burnInLabel(29, 29.97, 'timecode')).toBe('00:00:00:29');
  });
  it('adds the start offset, signs times before zero and puts the label first', () => {
    expect(burnInLabel(0, 24, 'timecode', 24 * 3600)).toBe('01:00:00:00');
    expect(burnInLabel(0, 24, 'timecode', -12)).toBe('−00:00:00:12');
    expect(burnInLabel(0, 12, 'frames', -3)).toBe('−2');
    expect(burnInLabel(5, 12, 'frames', 0, '  SC 1 ')).toBe('SC 1 6');
  });
});

describe('timecode effect settings', () => {
  it('defaults to SMPTE at the bottom centre, full opacity', () => {
    const e = tc();
    expect(timecodeText(e, 12, 12)).toBe('00:00:01:00');
    expect(anchorOf('bc')).toEqual([0.5, 1]);
    expect(e.size).toBe(100);
  });
  it('keeps its text and number settings from a file, cleaned and clamped', () => {
    const [e] = readEffects([{ ...tc(), params: { format: 'frames', prefix: `A\u0007B${'x'.repeat(80)}`, start: 12.6, anchor: 'tl', bogus: 1 } }])!;
    expect(e!.type).toBe('timecode');
    expect(e!.params!.format).toBe('frames');
    expect(e!.params!.start).toBe(13);
    expect(String(e!.params!.prefix).startsWith('A B')).toBe(true);
    expect([...String(e!.params!.prefix)].length).toBe(EFFECT_TEXT_MAX);
    expect(e!.params!.bogus).toBeUndefined();
    const [bad] = readEffects([{ ...tc(), params: { format: 'nope', start: 'x', prefix: 5 } }])!;
    expect(bad!.params).toBeUndefined();
  });
  it('places the box on its anchor, inset by the margin and moved by Move across / down', () => {
    const page = [200, 100] as const;
    expect(timecodeBox(tc({ anchor: 'tl', margin: 10 }), page[0], page[1], 40, 20)).toEqual({ x: 10, y: 10 });
    expect(timecodeBox(tc({ anchor: 'br', margin: 10 }), page[0], page[1], 40, 20)).toEqual({ x: 150, y: 70 });
    expect(timecodeBox(tc({ anchor: 'mc', margin: 10 }), page[0], page[1], 40, 20)).toEqual({ x: 80, y: 40 });
    expect(timecodeBox(tc({ anchor: 'tl', margin: 0, x: 50, y: -10 }), page[0], page[1], 40, 20)).toEqual({ x: 100, y: -10 });
  });
  it('changes its cache key every frame and when its layer moves in the shot', () => {
    const l = { id: 'L', start: 0, effects: [tc()] };
    expect(effectsKey(l, 1)).not.toBe(effectsKey(l, 2));
    const moved = { ...l, start: 5 };
    expect(effectsKey(moved, 1)).not.toBe(effectsKey(l, 1));
  });
});

describe('format 12 gate', () => {
  it('needs reader 12 only when Timecode is used, and older files migrate up', () => {
    const c = newComp('c', 'Shot', 64, 64, 12);
    const l = drawingsLayer('a', 'Art', [{ drawing: 'd', length: 4 }], 64, 64);
    c.layers = [l];
    expect(minimumDrawingSchema({}, { c: compFile(c) })).toBeLessThan(12);
    l.effects = [tc()];
    expect(minimumDrawingSchema({}, { c: compFile(c) })).toBe(12);
    expect(SCHEMA).toBeGreaterThanOrEqual(12);
    expect(migrate({ format: '2dope', schema: 11 }).schema).toBe(SCHEMA);
  });
});
