import { describe, expect, it } from 'vitest';
import { PRESETS } from './brush';
import { categoryOf, isBuiltIn, readBrush, uniqueName } from './brushlib';

describe('brush library', () => {
  it('sorts every built-in brush into a category', () => {
    for (const p of PRESETS) expect(['sketch', 'ink', 'paint']).toContain(categoryOf(p.name, []));
    expect(categoryOf('Ink', [])).toBe('ink');
    expect(categoryOf('My chalk', [{ ...PRESETS[0]!, name: 'My chalk' }])).toBe('mine');
    expect(isBuiltIn('Ink')).toBe(true);
    expect(isBuiltIn('My chalk')).toBe(false);
  });

  it('gives saved brushes names that are not taken', () => {
    expect(uniqueName('Ink copy', ['Ink'])).toBe('Ink copy');
    expect(uniqueName('Ink', ['Ink', 'Ink 2'])).toBe('Ink 3');
    expect(uniqueName('   ', [])).toBe('My brush');
  });

  it('reads saved brushes safely, filling anything missing', () => {
    expect(readBrush(null)).toBeNull();
    expect(readBrush({ size: 4 })).toBeNull();
    const b = readBrush({ name: 'Mine', size: 'big', hardness: 0.3 })!;
    expect(b.name).toBe('Mine');
    expect(b.size).toBe(PRESETS[0]!.size);
    expect(b.hardness).toBe(0.3);
    expect(typeof b.sizeDyn).toBe('object');
  });
});
