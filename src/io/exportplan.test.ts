import { describe, expect, it } from 'vitest';
import { buildManifest, DEFAULT_EXPORT, entryPath, framesToExport, sanitizeName, scaledSize } from './exportplan';
import { readZip, writeZip } from './zip';

const ex = [
  { drawing: 'a', length: 2 },
  { drawing: 'b', length: 1 },
  { drawing: 'c', length: 3 },
];

describe('export plan', () => {
  it('lists every frame in order, with the drawing each one shows', () => {
    const f = framesToExport(ex, 'all', []);
    expect(f.map((x) => x.drawing).join('')).toBe('aabccc');
    expect(f.map((x) => x.frame)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('can limit to the selected drawings, and falls back to all when nothing is selected', () => {
    expect(framesToExport(ex, 'selected', [1, 2]).map((x) => x.drawing).join('')).toBe('bccc');
    expect(framesToExport(ex, 'selected', [2]).map((x) => x.frame)).toEqual([3, 4, 5]);
    expect(framesToExport(ex, 'selected', []).length).toBe(6);
  });

  it('names files with padded numbers starting where you ask', () => {
    expect(entryPath('shot', 'combined', 1)).toBe('shot/combined/shot_0001.png');
    expect(entryPath('shot', 'lines', 1001)).toBe('shot/lines/shot_lines_1001.png');
    expect(entryPath('shot', 'fills', 12)).toBe('shot/fills/shot_fills_0012.png');
    expect(entryPath('shot', 'matte', 123456)).toBe('shot/matte/shot_matte_123456.png');
  });

  it('cleans names so they are safe as folders and file names', () => {
    expect(sanitizeName('  My Walk Cycle! ')).toBe('My-Walk-Cycle');
    expect(sanitizeName('../../etc/passwd')).toBe('etcpasswd');
    expect(sanitizeName('???')).toBe('shot');
    expect(sanitizeName('x'.repeat(200)).length).toBe(60);
  });

  it('scales sizes and never goes below one pixel', () => {
    expect(scaledSize(1920, 1080, 0.5)).toEqual({ w: 960, h: 540 });
    expect(scaledSize(1920, 1080, 0.25)).toEqual({ w: 480, h: 270 });
    expect(scaledSize(10, 10, 0.001)).toEqual({ w: 1, h: 1 });
  });

  it('writes a manifest a reader can use to rebuild the timing', () => {
    const frames = framesToExport(ex, 'all', []);
    const m = buildManifest({
      opts: { ...DEFAULT_EXPORT, name: 'walk', passes: ['combined', 'lines'], scale: 0.5, start: 1001 },
      savedBy: 'test',
      fps: 24,
      width: 1920,
      height: 1080,
      frames,
      exposures: [{ drawing: 1, fromFrame: 0, length: 2, role: 'key' }],
    });
    expect(m.size).toEqual({ width: 960, height: 540 });
    expect(m.frames).toBe(6);
    expect(m.firstNumber).toBe(1001);
    expect(m.passes.combined!.pattern).toBe('walk_####.png');
    expect(m.passes.lines!.pattern).toBe('walk_lines_####.png');
    expect(Object.keys(m.passes)).toEqual(['combined', 'lines']);
  });

  it('a whole sequence survives the zip round trip, and held frames can share bytes', async () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([9, 9]);
    const files = framesToExport(ex, 'all', []).map((f, i) => ({ name: entryPath('s', 'combined', i + 1), data: f.drawing === 'a' ? a : b }));
    const zip = await readZip(writeZip(files));
    expect(zip.size).toBe(6);
    expect([...zip.get('s/combined/s_0001.png')!]).toEqual([1, 2, 3]);
    expect([...zip.get('s/combined/s_0002.png')!]).toEqual([1, 2, 3]);
    expect([...zip.get('s/combined/s_0006.png')!]).toEqual([9, 9]);
  });
});
