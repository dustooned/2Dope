import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openModal } from './modal';

/** Just enough DOM for the modal shell (the unit suite runs in Node, without a browser). */
class FakeEvent {
  defaultPrevented = false;
  propagationStopped = false;
  constructor(readonly type: string) {}
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped = true; }
}
class FakeEl {
  readonly attrs = new Map<string, string>();
  readonly children: (FakeEl | string)[] = [];
  parent: FakeEl | null = null;
  textContent = '';
  open = false;
  focused = false;
  private listeners = new Map<string, ((e: FakeEvent) => void)[]>();
  constructor(readonly tagName: string) {}
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  getAttribute(k: string) { return this.attrs.get(k) ?? null; }
  append(...nodes: (FakeEl | string)[]) { for (const n of nodes) { if (typeof n !== 'string') n.parent = this; this.children.push(n); } }
  remove() { if (!this.parent) return; this.parent.children.splice(this.parent.children.indexOf(this), 1); this.parent = null; }
  addEventListener(type: string, fn: (e: FakeEvent) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  dispatch(type: string) { const e = new FakeEvent(type); for (const fn of this.listeners.get(type) ?? []) fn(e); return e; }
  click() { this.dispatch('click'); }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  /** Like a browser: the "close" event comes later, not inside close(). */
  close() { if (!this.open) return; this.open = false; queueMicrotask(() => this.dispatch('close')); }
  get isConnected(): boolean { return this.parent === body || !!this.parent?.isConnected; }
  find(tag: string): FakeEl[] { return this.children.flatMap((c) => typeof c === 'string' ? [] : [...(c.tagName === tag ? [c] : []), ...c.find(tag)]); }
}
let body: FakeEl;
const saved = (globalThis as { document?: unknown }).document;
beforeEach(() => {
  body = new FakeEl('body');
  (globalThis as { document?: unknown }).document = { body, createElement: (tag: string) => new FakeEl(tag) };
});
afterEach(() => { (globalThis as { document?: unknown }).document = saved; });
const fake = (n: unknown) => n as FakeEl;

describe('openModal', () => {
  it('builds title, body and footer in that order, opens, and answers with the clicked action', async () => {
    const field = document.createElement('input');
    const h = openModal({ title: 'Rename', className: 'small', content: ['Pick a name.', field], actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: 'Save', primary: true }], focus: field });
    const d = fake(h.dialog);
    expect(d.open).toBe(true);
    expect(d.isConnected).toBe(true);
    expect(d.getAttribute('class')).toBe('small');
    expect(d.children.map((c) => fake(c).tagName)).toEqual(['h2', 'div', 'div']);
    expect(fake(h.body).getAttribute('class')).toBe('dbody');
    expect(fake(h.body).children.map((c) => fake(c).tagName)).toEqual(['p', 'input']);
    expect(fake(h.foot).getAttribute('class')).toBe('vfoot');
    expect(fake(h.buttons.ok).getAttribute('class')).toBe('primary');
    expect(fake(h.buttons.cancel).getAttribute('class')).toBeNull();
    expect(fake(field).focused).toBe(true);
    fake(h.buttons.ok).click();
    expect(await h.done).toBe('ok');
    expect(d.open).toBe(false);
    expect(d.isConnected).toBe(false);
    expect(h.closed).toBe(true);
  });

  it('answers Escape with the cancel id and stops the browser closing it on its own', async () => {
    const h = openModal({ title: 'T', actions: [{ id: 'keep', label: 'Keep' }], cancelId: 'keep' });
    const e = fake(h.dialog).dispatch('cancel');
    expect(e.defaultPrevented).toBe(true);
    expect(await h.done).toBe('keep');
  });

  it('answers once: a later close, click or close event changes nothing', async () => {
    const closes: string[] = [];
    const h = openModal({ actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: 'OK' }], onClose: (id) => closes.push(id) });
    h.close('ok');
    h.close('cancel');
    fake(h.buttons.cancel).click();
    await Promise.resolve();
    expect(await h.done).toBe('ok');
    expect(closes).toEqual(['ok']);
  });

  it('treats an outside close of the <dialog> as cancel', async () => {
    const h = openModal({ title: 'T' });
    fake(h.dialog).close();
    expect(await h.done).toBe('cancel');
    expect(fake(h.dialog).isConnected).toBe(false);
  });

  it('keeps the dialog open when an action’s run returns false', async () => {
    let valid = false;
    const h = openModal({ actions: [{ id: 'ok', label: 'Apply', run: () => valid }] });
    fake(h.buttons.ok).click();
    expect(h.closed).toBe(false);
    expect(fake(h.dialog).open).toBe(true);
    valid = true;
    fake(h.buttons.ok).click();
    expect(await h.done).toBe('ok');
  });

  it('marks danger buttons, supports <footer> rows and unwrapped content', () => {
    const h = openModal({ title: 'Delete', bodyClass: null, content: 'Gone for good.', footer: 'footer', actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'go', label: 'Delete', danger: true }] });
    const d = fake(h.dialog);
    expect(h.body).toBe(h.dialog);
    expect(d.children.map((c) => fake(c).tagName)).toEqual(['h2', 'p', 'footer']);
    expect(fake(h.buttons.go).getAttribute('class')).toBe('danger');
    const custom = openModal({ footer: { tag: 'div', className: 'student-profile-actions' }, actions: [{ id: 'x', label: 'X' }] });
    expect(fake(custom.foot).getAttribute('class')).toBe('student-profile-actions');
  });

  it('has no footer without actions, and can keep keys away from the app', () => {
    const h = openModal({ title: 'Info', ownKeys: true });
    expect(h.foot).toBeNull();
    expect(fake(h.dialog).dispatch('keydown').propagationStopped).toBe(true);
    expect(fake(h.dialog).dispatch('keyup').propagationStopped).toBe(true);
    const plain = openModal({ title: 'Info' });
    expect(fake(plain.dialog).dispatch('keydown').propagationStopped).toBe(false);
  });
});
