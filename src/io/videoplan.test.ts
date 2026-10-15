import { describe, expect, it } from 'vitest';
import { drawingsLayer, newComp } from '../core/comp';
import { DEFAULT_VIDEO, planVideo, videoOptions, videoSize } from './videoplan';

function project() {
  const shot = newComp('shot', 'Shot', 1920, 1080, 24);
  shot.layers.push(drawingsLayer('L1', 'Drawing', [{ drawing: 'd1', length: 48 }], 1920, 1080));
  const nested = newComp('inside', 'Inside', 400, 300, 12);
  nested.duration = 12;
  return { main: shot.id, comp: nested, comps: new Map([[shot.id, shot], [nested.id, nested]]) };
}

describe('video planning', () => {
  it('uses main-shot dimensions, length and fps while editing a precomp', () => {
    const p = planVideo(project(), DEFAULT_VIDEO);
    expect([p.comp, p.frames, p.fps, p.duration, p.width, p.height]).toEqual(['shot', 48, 24, 2, 1280, 720]);
  });

  it('fits portrait and ultrawide shots without upscaling or stretching', () => {
    expect(videoSize(1080, 1920, '720p')).toMatchObject({ width: 720, height: 1280, scale: 2 / 3 });
    const wide = videoSize(2520, 1080, '1080p');
    expect(wide.width).toBe(1920);
    expect(wide.scale).toBe(1920 / 2520);
    expect(wide.height % 2).toBe(0);
    expect(videoSize(400, 300, '1080p')).toMatchObject({ width: 400, height: 300, scale: 1 });
  });

  it('pads odd-sized and tiny pages to even dimensions instead of changing their aspect', () => {
    expect(videoSize(301, 199, 'original')).toEqual({ width: 302, height: 200, scale: 1, x: 0.5, y: 0.5 });
    expect(videoSize(1, 1, 'original')).toEqual({ width: 2, height: 2, scale: 1, x: 0.5, y: 0.5 });
  });

  it('validates stored options rather than trusting their shape or values', () => {
    expect(videoOptions(null)).toEqual(DEFAULT_VIDEO);
    expect(videoOptions({ size: '4k', format: 5, quality: {}, background: 'transparent' })).toEqual(DEFAULT_VIDEO);
    expect(videoOptions({ size: 'original', format: 'webm', quality: 'high', background: 'black' }))
      .toEqual({ size: 'original', format: 'webm', quality: 'high', background: 'black' });
  });

  it('derives bitrate from output size, quality and fps, and rejects exports over the device budget', () => {
    const normal = planVideo(project(), DEFAULT_VIDEO);
    const high = planVideo(project(), { ...DEFAULT_VIDEO, quality: 'high' });
    expect(high.bitrate).toBe(normal.bitrate * 2);
    expect(high.estimatedBytes).toBeGreaterThan(normal.estimatedBytes);
    expect(() => planVideo(project(), DEFAULT_VIDEO, 1024)).toThrow(/smaller size/);
  });

  it('rejects broken dimensions and timing before allocating canvases', () => {
    expect(() => videoSize(NaN, 300, '720p')).toThrow(/dimensions/);
    expect(() => videoSize(0, 300, '720p')).toThrow(/dimensions/);
    const p = project();
    p.comps.get('shot')!.fps = 0;
    expect(() => planVideo(p, DEFAULT_VIDEO)).toThrow(/timing/);
  });
});
