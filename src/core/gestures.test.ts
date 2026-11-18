import { describe, expect, it } from 'vitest';
import { DISABLEABLE_GESTURES, GESTURES, GESTURE_ACTIONS, gestureSentence, type GestureDef } from './gestures';
import { GESTURES_KEY, GESTURE_PREFS_LIMIT, isGestureEnabled, readGesturePrefs, setGestureEnabled } from './gestureprefs';

const byId = (id: string) => GESTURES.find((g) => g.id === id)!;

describe('gesture registry', () => {
  it('has unique ids and an action sentence for every row', () => {
    expect(new Set(GESTURES.map((g) => g.id)).size).toBe(GESTURES.length);
    for (const g of GESTURES) expect(GESTURE_ACTIONS[g.actionId], g.id).toBeTruthy();
  });

  it('lets the user turn off only the three global taps', () => {
    expect([...DISABLEABLE_GESTURES].sort()).toEqual(['tap2', 'tap3', 'tap4']);
  });

  it('generates the help sentence from the binding', () => {
    expect(gestureSentence(byId('tap2'))).toBe('Tapping with two fingers will undo.');
    expect(gestureSentence(byId('tap3'))).toBe('Tapping with three fingers will redo.');
    expect(gestureSentence(byId('tap4'))).toBe('Tapping with four fingers will hide or show the interface.');
    expect(gestureSentence(byId('hold1-canvas'))).toBe('Holding one finger still on the canvas will pick the colour under your finger.');
    expect(gestureSentence(byId('double1-ruler'))).toBe('Double-tapping on the timeline ruler will zoom in closer to that spot.');
    expect(gestureSentence(byId('swipe3h-timeline'))).toBe('Swiping left or right with three fingers on the timeline will change how much time is visible.');
  });

  it('changes the sentence when the binding changes', () => {
    const rebound: GestureDef = { ...byId('tap2'), fingers: 3, actionId: 'edit.redo' };
    expect(gestureSentence(rebound)).toBe('Tapping with three fingers will redo.');
    const swipe: GestureDef = { ...byId('swipe3h-timeline'), axis: 'v', fingers: 2 };
    expect(gestureSentence(swipe)).toBe('Swiping up or down with two fingers on the timeline will change how much time is visible.');
  });
});

describe('gesture preferences', () => {
  it('reads nothing off for missing or malformed input', () => {
    for (const bad of [undefined, null, 5, 'tap2', [], {}, { disabled: 'tap2' }, { disabled: { 0: 'tap2' } }]) expect(readGesturePrefs(bad)).toEqual({ disabled: [] });
  });

  it('rejects unknown ids, non-strings, ids that cannot be turned off and duplicates', () => {
    expect(readGesturePrefs({ disabled: ['tap2', 'tap2', 'nope', 7, null, 'pinch2-canvas', 'x'.repeat(100), 'tap4'] })).toEqual({ disabled: ['tap2', 'tap4'] });
  });

  it('caps the list and ignores a huge array', () => {
    const many = Array.from({ length: 5000 }, () => 'tap3');
    expect(readGesturePrefs({ disabled: many }).disabled.length).toBeLessThanOrEqual(GESTURE_PREFS_LIMIT);
    expect(readGesturePrefs({ disabled: [...many, 'tap2'] }).disabled).toEqual(['tap3']);
  });

  it('turns a gesture off and back on, and keeps its own storage key', () => {
    let prefs = readGesturePrefs(null);
    expect(isGestureEnabled(prefs, 'tap2')).toBe(true);
    prefs = setGestureEnabled(prefs, 'tap2', false);
    expect(isGestureEnabled(prefs, 'tap2')).toBe(false);
    expect(isGestureEnabled(prefs, 'tap3')).toBe(true);
    prefs = setGestureEnabled(prefs, 'tap2', true);
    expect(prefs.disabled).toEqual([]);
    expect(setGestureEnabled(prefs, 'pinch2-canvas', false).disabled).toEqual([]);
    expect(GESTURES_KEY).toBe('2dope.gestures.v1');
  });
});
