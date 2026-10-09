import { describe, expect, it } from 'vitest';
import { DabWalker, dabsForStroke } from '../brush/dabs';
import { Smoother } from '../brush/smoothing';
import { dyn, evalDynamic, PRESETS } from './brush';
import { History } from './history';
import { hash01 } from './rng';
import { strokeLength, type StrokePoint } from './stroke';

const line = (n: number, step = 2): StrokePoint[] =>
  Array.from({ length: n }, (_, i) => ({ x: i * step, y: 0, pressure: i / (n - 1), tiltX: 0, tiltY: 0, t: i * 8 }));

describe('rng', () => {
  it('is deterministic and in [0, 1)', () => {
    for (let i = 0; i < 1000; i++) {
      const v = hash01(7, i, 2);
      expect(v).toBe(hash01(7, i, 2));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(hash01(7, 1)).not.toBe(hash01(8, 1));
  });
});

describe('dynamics', () => {
  it('maps input through min and curve', () => {
    const s = { pressure: 0, tilt: 0, speed: 0 };
    expect(evalDynamic(dyn('pressure', 0.25), s, 0)).toBeCloseTo(0.25);
    expect(evalDynamic(dyn('pressure', 0.25), { ...s, pressure: 1 }, 0)).toBeCloseTo(1);
    expect(evalDynamic(dyn('pressure', 0, 2), { ...s, pressure: 0.5 }, 0)).toBeCloseTo(0.25);
    expect(evalDynamic(dyn('pressure', 0, 1, 0, true), { ...s, pressure: 1 }, 0)).toBeCloseTo(0);
    expect(evalDynamic(dyn('off'), s, 0)).toBe(1);
  });
});

describe('dab walker', () => {
  const brush = { ...PRESETS[0]!, sizeDyn: dyn('off'), spacing: 0.5, size: 10, taperStart: 0, taperEnd: 0, scatter: 0 };

  it('spaces dabs by spacing × size', () => {
    const dabs = dabsForStroke(brush, 1, line(51), Infinity); // 100 px long
    // first dab + one every 5 px
    expect(dabs.length).toBe(21);
    expect(dabs[1]!.x - dabs[0]!.x).toBeCloseTo(5);
  });

  it('gives the same dabs however the points are chunked (incremental)', () => {
    const pts = line(40, 3.3);
    const all = dabsForStroke(brush, 9, pts, Infinity);
    const w = new DabWalker(brush, 9);
    const chunked = pts.flatMap((p) => w.push(p));
    expect(chunked).toEqual(all);
  });

  it('is deterministic with jitter and scatter', () => {
    const b = { ...brush, scatter: 1, flowDyn: dyn('off', 0, 1, 0.8) };
    expect(dabsForStroke(b, 5, line(30), Infinity)).toEqual(dabsForStroke(b, 5, line(30), Infinity));
    expect(dabsForStroke(b, 5, line(30), Infinity)).not.toEqual(dabsForStroke(b, 6, line(30), Infinity));
  });

  it('tapers both ends when the length is known', () => {
    const b = { ...brush, spacing: 0.1, taperStart: 20, taperEnd: 20 };
    const pts = line(51);
    const dabs = dabsForStroke(b, 1, pts, strokeLength(pts));
    const mid = dabs[Math.floor(dabs.length / 2)]!;
    expect(dabs[0]!.size).toBeLessThan(mid.size);
    expect(dabs[dabs.length - 1]!.size).toBeLessThan(mid.size);
  });
});

describe('smoother', () => {
  it('pulled string does not move until the string is taut', () => {
    const s = new Smoother(0.5, true, 1); // 30 px string
    expect(s.push({ x: 0, y: 0, pressure: 1, tiltX: 0, tiltY: 0, t: 0 })).toHaveLength(1);
    expect(s.push({ x: 20, y: 0, pressure: 1, tiltX: 0, tiltY: 0, t: 8 })).toHaveLength(0);
    const out = s.push({ x: 50, y: 0, pressure: 1, tiltX: 0, tiltY: 0, t: 16 });
    expect(out[0]!.x).toBeCloseTo(20);
    const end = s.finish({ x: 50, y: 0, pressure: 1, tiltX: 0, tiltY: 0, t: 20 });
    expect(end[0]!.x).toBe(50);
  });
});

describe('history', () => {
  it('undoes and redoes in order and clears redo on a new command', () => {
    const log: number[] = [];
    const h = new History();
    const cmd = (n: number) => ({ label: String(n), do: () => log.push(n), undo: () => log.push(-n) });
    h.push(cmd(1), false);
    h.push(cmd(2), false);
    h.undo();
    h.redo();
    h.undo();
    h.push(cmd(3), false);
    expect(h.canRedo).toBe(false);
    expect(log).toEqual([1, 2, -2, 2, -2, 3]);
  });
});
