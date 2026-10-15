import { describe, expect, it, vi } from 'vitest';
import { guardTouchContextMenus } from './touchcontext';

function rig() {
  const root = new EventTarget();
  const canvas = new EventTarget();
  let clock = 100;
  const dispose = guardTouchContextMenus(root, canvas, () => clock);
  const opened = vi.fn();
  root.addEventListener('contextmenu', opened);
  const send = (type: string, props: object = {}, target = root) => {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, props);
    target.dispatchEvent(e);
    return e;
  };
  const finger = (type: string, id: number) => send(type, { pointerId: id, pointerType: 'touch', button: 0 });
  const tap = () => {
    finger('pointerdown', 1);
    finger('pointerdown', 2);
    finger('pointerup', 1);
    finger('pointerup', 2);
  };
  return { root, canvas, opened, send, finger, tap, dispose, advance: (ms: number) => (clock += ms) };
}

describe('touchscreen gestures do not also open a context menu', () => {
  it('blocks both native and app menus while two fingers are down', () => {
    const r = rig();
    r.finger('pointerdown', 1);
    r.finger('pointerdown', 2);
    expect(r.send('contextmenu', { pointerType: 'touch' }).defaultPrevented).toBe(true);
    expect(r.opened).not.toHaveBeenCalled();
  });

  it('blocks a delayed legacy mouse contextmenu after the undo tap has finished', () => {
    const r = rig();
    r.tap();
    r.advance(300);
    expect(r.send('contextmenu').defaultPrevented).toBe(true);
    expect(r.opened).not.toHaveBeenCalled();
    r.advance(1001);
    expect(r.send('contextmenu').defaultPrevented).toBe(false);
    expect(r.opened).toHaveBeenCalledTimes(1);
  });

  it('keeps blocking after the browser cancels touch pointers to show its menu', () => {
    const r = rig();
    r.finger('pointerdown', 1);
    r.finger('pointerdown', 2);
    r.finger('pointercancel', 1);
    r.finger('pointercancel', 2);
    expect(r.send('contextmenu').defaultPrevented).toBe(true);
    expect(r.opened).not.toHaveBeenCalled();
  });

  it('still blocks a long multi-touch hold and its final release', () => {
    const r = rig();
    r.finger('pointerdown', 1);
    r.finger('pointerdown', 2);
    r.advance(2000);
    expect(r.send('contextmenu').defaultPrevented).toBe(true);
    r.finger('pointerup', 1);
    r.finger('pointerup', 2);
    expect(r.send('contextmenu').defaultPrevented).toBe(true);
  });

  it.each(['mouse', 'pen'])('allows an intentional %s secondary click immediately after undo', (pointerType) => {
    const r = rig();
    r.tap();
    r.send('pointerdown', { pointerId: 9, pointerType, button: 2 });
    expect(r.send('contextmenu', { pointerType }).defaultPrevented).toBe(false);
    expect(r.opened).toHaveBeenCalledTimes(1);
  });

  it('does not mistake a touch-generated mouse press for an intentional right click', () => {
    const r = rig();
    r.tap();
    const props = { pointerId: 9, pointerType: 'mouse', button: 2, sourceCapabilities: { firesTouchEvents: true } };
    r.send('pointerdown', props);
    expect(r.send('contextmenu', props).defaultPrevented).toBe(true);
    expect(r.opened).not.toHaveBeenCalled();
  });

  it('preserves keyboard menus and one-finger holds', () => {
    const r = rig();
    r.finger('pointerdown', 1);
    expect(r.send('contextmenu', { pointerType: 'touch' }).defaultPrevented).toBe(false);
    r.finger('pointerup', 1);
    r.tap();
    r.send('keydown', { key: 'F10', shiftKey: true });
    expect(r.send('contextmenu').defaultPrevented).toBe(false);
  });

  it('prevents native multi-touch defaults only on the canvas and leaves pointer undo events intact', () => {
    const r = rig();
    const ups = vi.fn();
    r.root.addEventListener('pointerup', ups);
    r.tap();
    expect(ups).toHaveBeenCalledTimes(2);
    expect(r.send('touchstart', { touches: [{}, {}] }, r.canvas).defaultPrevented).toBe(true);
    expect(r.send('touchstart', { touches: [{}] }, r.canvas).defaultPrevented).toBe(false);
    expect(r.send('touchstart', { touches: [{}, {}] }).defaultPrevented).toBe(false);
    r.dispose();
    expect(r.send('contextmenu').defaultPrevented).toBe(false);
  });
});
