import { describe, expect, it } from 'vitest';
import { defaultQuickMenu, readQuickMenu } from './quickmenu';

describe('QuickMenu device preferences', () => {
  it('repairs malformed settings and independently repairs each unknown or missing action', () => {
    for (const value of [null, false, 'bad', 4, [], {}]) expect(readQuickMenu(value)).toEqual(defaultQuickMenu());
    expect(readQuickMenu({ showButton: 'false', edge: 'bottom', actions: ['colour', 'oldAction', null, 'brushes'] }))
      .toEqual({ showButton: true, edge: 'right', actions: ['colour', 'redo', 'eraser', 'brushes', 'newFrame', 'flipView'] });
  });
  it('round-trips six ordered actions, empty/repeated slots and hidden-button/edge choices', () => {
    const custom = { showButton: false, edge: 'left', actions: ['colour', 'layers', 'none', 'brush', 'brush', 'play'] };
    const clean = readQuickMenu(JSON.parse(JSON.stringify(custom))); expect(clean).toEqual(custom);
    custom.actions[0] = 'undo'; expect(clean.actions[0]).toBe('colour');
    expect(readQuickMenu({ actions: [...clean.actions, 'extra'] }).actions).toHaveLength(6);
  });
  it('restores fresh defaults without mutating previous settings', () => {
    const a = defaultQuickMenu(); a.actions[0] = 'none'; a.edge = 'left';
    expect(defaultQuickMenu()).toEqual({ showButton: true, edge: 'right', actions: ['undo', 'redo', 'eraser', 'eyedropper', 'newFrame', 'flipView'] });
    const b = readQuickMenu(a); b.actions[1] = 'none'; expect(a.actions[1]).toBe('redo');
  });
});
