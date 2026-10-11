import { describe, expect, it } from 'vitest';
import { ASPECTS, clampFps, clampSide, DEFAULT_NEW, fitPixels, framesFor, LENGTHS, MAX_SIDE, readNewSettings, sizeFor, sizeNote } from './newproject';

const a = (id: string) => ASPECTS.find((x) => x.id === id)!;

describe('new project presets', () => {
  it('sizes follow the short side, like 720p / 1080p', () => {
    expect(sizeFor(a('16:9'), 720)).toEqual({ width: 1280, height: 720 });
    expect(sizeFor(a('16:9'), 1080)).toEqual({ width: 1920, height: 1080 });
    expect(sizeFor(a('9:16'), 1080)).toEqual({ width: 1080, height: 1920 });
    expect(sizeFor(a('1:1'), 1440)).toEqual({ width: 1440, height: 1440 });
    expect(sizeFor(a('4:3'), 1080)).toEqual({ width: 1440, height: 1080 });
    expect(sizeFor(a('21:9'), 1080)).toEqual({ width: 2520, height: 1080 });
  });

  it('always gives even numbers inside the limits', () => {
    for (const asp of ASPECTS) {
      for (const t of [720, 1080, 1440]) {
        const s = sizeFor(asp, t);
        expect(s.width % 2).toBe(0);
        expect(s.height % 2).toBe(0);
        expect(Math.max(s.width, s.height)).toBeLessThanOrEqual(MAX_SIDE);
      }
    }
    expect(clampSide(1e9)).toBe(MAX_SIDE);
    expect(clampSide(-5)).toBe(64);
  });

  it('warns about pages that are heavy for an iPad, not about normal ones', () => {
    expect(sizeNote(1920, 1080)).toBeNull();
    expect(sizeNote(2560, 1440)?.level).toBe('heavy');
    expect(sizeNote(3840, 2160)?.level).toBe('heavy');
    expect(sizeNote(4096, 4096)?.level).toBe('too-big');
  });

  it('length is a hold of whole frames at the chosen fps', () => {
    const l = (id: string) => LENGTHS.find((x) => x.id === id)!;
    expect(framesFor(l('frame'), 24)).toBe(1);
    expect(framesFor(l('2s'), 12)).toBe(24);
    expect(framesFor(l('1s'), 25)).toBe(25);
  });

  it('remembered settings survive garbage', () => {
    expect(readNewSettings(null)).toEqual(DEFAULT_NEW);
    expect(readNewSettings({ aspect: 'nope', tier: 5, fps: 'x', length: 'x', custom: 3 })).toEqual(DEFAULT_NEW);
    const ok = readNewSettings({ aspect: '9:16', tier: 720, fps: 24.4, length: '5s', custom: { width: 900, height: 99999 } });
    expect(ok).toEqual({ aspect: '9:16', tier: 720, fps: 24, length: '5s', custom: { width: 900, height: MAX_SIDE } });
    expect(clampFps(500)).toBe(120);
  });
});

describe('device limits', () => {
  it('fitPixels scales a page down to the pixel cap, keeping its shape and even sides', () => {
    expect(fitPixels(1280, 720, 1280 * 720)).toEqual({ width: 1280, height: 720 });
    const r = fitPixels(3840, 2160, 1280 * 720);
    expect(r).toEqual({ width: 1280, height: 720 });
    const v = fitPixels(2000, 3000, 1280 * 720);
    expect(v.width * v.height).toBeLessThanOrEqual(1280 * 720);
    expect((v.width % 2) + (v.height % 2)).toBe(0);
    expect(v.width / v.height).toBeCloseTo(2 / 3, 2);
  });
});
