import { describe, expect, it } from 'vitest';
import type { App } from '../app';
import { COMMANDS, MENU_ENTRIES, commandById, commandName, commandsFor, commandsIn, controlInfo, customizable } from './commands';

/** Just the App state the Select commands read. */
const app = (state: { selection?: boolean; reselect?: boolean; clip?: boolean }) =>
  ({ spatialSelection: state.selection ? {} : null, canReselect: !!state.reselect, hasArtClip: !!state.clip }) as unknown as App;
const ids = (cs: { id: string }[]) => cs.map((c) => c.id);

describe('command registry', () => {
  it('has unique, namespaced ids', () => {
    const all = [...COMMANDS, ...MENU_ENTRIES].map((c) => c.id);
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
    for (const ctx of ['select', 'transform', 'time', 'fill', 'smudge', 'paint', 'points'] as const) {
      const row = commandsIn(ctx);
      expect(row.length).toBeGreaterThan(0);
      expect(row.every((c) => c.contexts.includes(ctx) && c.id.startsWith(`${ctx}.`))).toBe(true);
      const orders = row.map((c) => c.order);
      expect(new Set(orders).size).toBe(orders.length);
    }
    expect(commandsIn('layers')).toEqual([]);
  });

  it('names symbol chips in words for menus', () => {
    for (const c of COMMANDS) expect(commandName(c)).toMatch(/[A-Za-z]{2}/);
    expect(commandName(commandById('transform.smaller')!)).toBe('Smaller');
    expect(commandName(commandById('time.hold2')!)).toBe('Hold for 2');
  });

  it('keeps the transform and timing rows in their order', () => {
    const t = { transformParams: { scale: 1, rotate: 0, flipH: false, flipV: false } } as unknown as App;
    expect(ids(commandsFor('transform', t))).toEqual(['transform.apply', 'transform.cancel', 'transform.freeform', 'transform.smaller', 'transform.bigger', 'transform.rotateleft', 'transform.rotateright', 'transform.fliph', 'transform.flipv', 'transform.fit', 'transform.reset']);
    expect(commandsFor('transform', { transformParams: null } as unknown as App)).toEqual([]);
    expect(ids(commandsIn('time'))).toEqual(['time.hold1', 'time.hold2', 'time.hold3', 'time.hold4', 'time.shorter', 'time.longer', 'time.key', 'time.breakdown', 'time.inbetween']);
  });

  it('shows the state in the chip face', () => {
    const p = (pointSelMode: string | null, pointWidthScope: string) => ({ pointSelMode, pointWidthScope }) as unknown as App;
    const toggle = commandById('points.toggle')!, width = commandById('points.widthscope')!;
    expect(toggle.face!(p(null, 'all'))).toEqual({});
    expect(toggle.face!(p('straight', 'all')).label).toBe('Straight point');
    expect(width.face!(p(null, 'point')).label).toBe('Width: this point');
    expect(width.face!(p(null, 'section')).icon).toBe('wsection');
    const freeform = commandById('transform.freeform')!;
    expect(freeform.face!({ transformFreeform: true } as unknown as App).title).toMatch(/^Freeform/);
  });

  it('drops disabled commands, matching the row today', () => {
    expect(ids(commandsFor('select', app({ selection: true })))).toEqual(['select.transform', 'select.fill', 'select.copy', 'select.cut', 'select.duplicate', 'select.copytolayer', 'select.cuttolayer', 'select.delete', 'select.invert', 'select.deselect']);
    expect(ids(commandsFor('select', app({ selection: true, clip: true }))).at(-1)).toBe('select.paste');
    expect(ids(commandsFor('select', app({})))).toEqual(['select.moveall', 'select.selectall']);
    expect(ids(commandsFor('select', app({ reselect: true, clip: true })))).toEqual(['select.reselect', 'select.moveall', 'select.selectall', 'select.paste']);
  });

  it('lists rows and menus for Customize, in order', () => {
    expect(customizable('smudge')).toEqual([{ id: 'smudge.softer', name: 'Softer' }, { id: 'smudge.stronger', name: 'Stronger' }]);
    expect(customizable('frame').map((e) => e.id).slice(0, 3)).toEqual(['frame.duplicate', 'frame.insertafter', 'frame.insertbefore']);
    expect(customizable('canvas').at(-1)!.id).toBe('canvas.flipview');
  });

  it('names a hidden control and where it lives', () => {
    expect(controlInfo('transform.smaller')).toEqual({ name: 'Smaller', where: 'Transform row' });
    expect(controlInfo('frame.delete')).toEqual({ name: 'Delete', where: 'frame menu' });
    expect(controlInfo('gone.thing')).toBeNull();
  });
});
