import { describe, expect, it } from 'vitest';
import { cloneBrush, PRESETS } from './brush';
import { favoriteBrush, forgetBrush, readBrushPreferences, recalledBrush, rememberBrush, renameBrush, usedBrush } from './brushprefs';

describe('device brush workflow', () => {
  const empty = () => readBrushPreferences(null);
  it('restores only working size and opacity without changing the brush definition', () => {
    const ink = cloneBrush(PRESETS.find(b => b.name === 'Ink')!);
    const memory = rememberBrush(empty(), { ...ink, size: 83, opacity: 0, grain: .8 });
    const recalled = recalledBrush(memory, ink);
    expect(recalled.size).toBe(83);
    expect(recalled.opacity).toBe(0);
    expect(recalled.grain).toBe(ink.grain);
    expect(ink.size).not.toBe(83);
    expect(recalledBrush(memory, PRESETS[0]!)).toBe(PRESETS[0]);
    expect(readBrushPreferences(JSON.parse(JSON.stringify(memory)))).toEqual(memory);
  });
  it('keeps the last five unique choices, with the latest choice first', () => {
    let p = empty();
    for (const n of ['A', 'B', 'C', 'D', 'E', 'F', 'C']) p = usedBrush(p, n);
    expect(p.recent).toEqual(['C', 'F', 'E', 'D', 'B']);
    expect(rememberBrush(p, { ...PRESETS[0]!, name: 'A', size: 40 }).recent).toEqual(p.recent);
  });
  it('favorites are independent of recency and working settings', () => {
    const p = usedBrush(rememberBrush(empty(), PRESETS[0]!), 'Ink');
    const starred = favoriteBrush(p, 'Pencil');
    expect(starred.favorites).toEqual(['Pencil']);
    expect(starred.recent).toEqual(p.recent);
    expect(starred.memory).toEqual(p.memory);
    expect(favoriteBrush(starred, 'Pencil')).toEqual(p);
  });
  it('renaming and deleting personal brushes carry or remove all their shortcuts', () => {
    let p = favoriteBrush(usedBrush(rememberBrush(empty(), { ...PRESETS[0]!, name: 'Chalk', size: 35, opacity: .4 }), 'Chalk'), 'Chalk');
    p = renameBrush(p, 'Chalk', 'Soft chalk');
    expect(p.favorites).toEqual(['Soft chalk']);
    expect(p.recent).toEqual(['Soft chalk']);
    expect(p.memory).toEqual([{ name: 'Soft chalk', size: 35, opacity: .4 }]);
    expect(forgetBrush(p, 'Soft chalk')).toEqual(empty());
  });
  it('ignores malformed and future preferences and bounds stored metadata', () => {
    expect(readBrushPreferences({ version: 2, favorites: ['A'] })).toEqual(empty());
    const p = readBrushPreferences({ version: 1, favorites: ['Ink', 'Ink', null, '', 12], recent: ['A','B','C','D','E','F'], memory: [null, { name: 'Ink', size: 0, opacity: .5 }, { name: 'A', size: 40, opacity: 0 }, { name: 'A', size: 20, opacity: 1 }, { name: 'B', size: NaN, opacity: 1 }, { name: 'C', size: 20, opacity: 2 }] });
    expect(p.favorites).toEqual(['Ink']);
    expect(p.recent).toHaveLength(5);
    expect(p.memory).toEqual([{ name: 'A', size: 40, opacity: 0 }]);
    const huge = Array.from({ length: 1000 }, (_, i) => ({ name: `b${i}`, size: 2, opacity: 1 }));
    const bounded = readBrushPreferences({ version: 1, memory: huge, favorites: huge.map(b => b.name) });
    expect(bounded.memory).toHaveLength(610);
    expect(bounded.favorites).toHaveLength(610);
    expect(rememberBrush(p, { ...PRESETS[0]!, size: Infinity })).toBe(p);
    expect(rememberBrush(p, { ...PRESETS[0]!, size: 1000, opacity: -1 }).memory[0]).toMatchObject({ size: 500, opacity: 0 });
  });
});
