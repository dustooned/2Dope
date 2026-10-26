import { describe, expect, it } from 'vitest';
import type { App } from '../app';
import { COMMANDS, commandsFor, commandsIn } from './commands';

/** Just the App state the Select commands read. */
const app = (state: { selection?: boolean; reselect?: boolean; clip?: boolean }) =>
  ({ spatialSelection: state.selection ? {} : null, canReselect: !!state.reselect, hasArtClip: !!state.clip }) as unknown as App;
const ids = (cs: { id: string }[]) => cs.map((c) => c.id);

describe('command registry', () => {
  it('has unique, namespaced ids', () => {
    const all = COMMANDS.map((c) => c.id);
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(id).toMatch(/^[a-z][a-z0-9]*\.[a-z][a-z0-9-]*$/);
  });

  it('keeps a stable order with gaps', () => {
    const row = commandsIn('select');
    expect(ids(row)).toEqual(['select.transform', 'select.fill', 'select.copy', 'select.cut', 'select.duplicate', 'select.copytolayer', 'select.cuttolayer', 'select.delete', 'select.invert', 'select.deselect', 'select.reselect', 'select.moveall', 'select.selectall', 'select.paste']);
    const orders = row.map((c) => c.order);
    expect(new Set(orders).size).toBe(orders.length);
    for (const o of orders) expect(o % 10).toBe(0);
  });

  it('filters by context', () => {
    expect(commandsIn('transform')).toEqual([]);
    expect(commandsIn('select').every((c) => c.contexts.includes('select'))).toBe(true);
  });

  it('drops disabled commands, matching the row today', () => {
    expect(ids(commandsFor('select', app({ selection: true })))).toEqual(['select.transform', 'select.fill', 'select.copy', 'select.cut', 'select.duplicate', 'select.copytolayer', 'select.cuttolayer', 'select.delete', 'select.invert', 'select.deselect']);
    expect(ids(commandsFor('select', app({ selection: true, clip: true }))).at(-1)).toBe('select.paste');
    expect(ids(commandsFor('select', app({})))).toEqual(['select.moveall', 'select.selectall']);
    expect(ids(commandsFor('select', app({ reselect: true, clip: true })))).toEqual(['select.reselect', 'select.moveall', 'select.selectall', 'select.paste']);
  });
});
