import { describe, expect, it } from 'vitest';
import { HIDDEN_LIMIT, isCommandHidden, orderCommands, readCommandPrefs, setCommandHidden, setCommandOrder } from './commandprefs';

describe('command preferences', () => {
  it('recovers from garbage', () => {
    for (const saved of [null, undefined, 42, 'x', [], {}, { hidden: 'select.copy' }, { hidden: null }]) expect(readCommandPrefs(saved)).toEqual({ hidden: [] });
  });

  it('drops malformed ids and keeps valid ones in order', () => {
    const p = readCommandPrefs({ hidden: ['select.copy', 7, '', 'copy', 'Select.Copy', 'select.', '.copy', 'a.b.c', 'select.cut', `select.${'x'.repeat(80)}`] });
    expect(p.hidden).toEqual(['select.copy', 'select.cut']);
  });

  it('removes duplicates', () => {
    expect(readCommandPrefs({ hidden: ['select.copy', 'select.cut', 'select.copy'] }).hidden).toEqual(['select.copy', 'select.cut']);
  });

  it('caps the list', () => {
    const many = Array.from({ length: HIDDEN_LIMIT + 50 }, (_, i) => `row.c${i}`);
    expect(readCommandPrefs({ hidden: many }).hidden).toHaveLength(HIDDEN_LIMIT);
  });

  it('hides and shows a command without changing the original', () => {
    const start = readCommandPrefs({ hidden: ['select.cut'] });
    const hidden = setCommandHidden(start, 'select.copy', true);
    expect(isCommandHidden(hidden, 'select.copy')).toBe(true);
    expect(isCommandHidden(start, 'select.copy')).toBe(false);
    expect(setCommandHidden(hidden, 'select.copy', true).hidden).toEqual(['select.cut', 'select.copy']);
    const shown = setCommandHidden(hidden, 'select.copy', false);
    expect(shown).toEqual(start);
    expect(readCommandPrefs(JSON.parse(JSON.stringify(hidden)))).toEqual(hidden);
  });

  it('keeps a row order, drops bad entries, and survives hiding', () => {
    const p = readCommandPrefs({ hidden: [], order: { select: ['select.cut', 'select.cut', 7, 'Bad', 'select.copy'], 'Bad Row': ['select.cut'], fill: 'x' } });
    expect(p.order).toEqual({ select: ['select.cut', 'select.copy'] });
    expect(setCommandHidden(p, 'select.paste', true).order).toEqual(p.order);
    const cmds = [{ id: 'select.copy' }, { id: 'select.paste' }, { id: 'select.cut' }];
    // listed first as listed; the rest after them, in their built-in order
    expect(orderCommands(p, 'select', cmds).map((c) => c.id)).toEqual(['select.cut', 'select.copy', 'select.paste']);
    expect(orderCommands(p, 'fill', cmds)).toBe(cmds);
    expect(setCommandOrder(p, 'select', []).order).toBeUndefined();
    expect(readCommandPrefs(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
});
