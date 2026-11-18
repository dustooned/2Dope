import { el } from './dom';
import { openModal, type ModalHandle } from './modal';
/** Small dialogs that work the same on iPad and desktop (window.prompt is awkward on touch). */

/** Stop the app's shortcuts from firing while typing in a dialog field. */
function ownKeys(input: HTMLElement, onEnter: () => void): void {
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') onEnter();
  });
  input.addEventListener('keyup', (e) => e.stopPropagation());
}

/** Ask for a line of text. Resolves to null when cancelled. */
export function askText(title: string, value = '', okLabel = 'OK', description?: string): Promise<string | null> {
  const input = el('input', { type: 'text', maxlength: '80', value, 'aria-label': title, class: 'textbox' });
  const content: Node[] = [];
  if (description) { content.push(el('p', {}, description)); input.setAttribute('aria-description', description); }
  content.push(input);
  const modal: ModalHandle<'cancel' | 'ok'> = openModal({ title, className: 'small', content, actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: okLabel, primary: true }] });
  ownKeys(input, () => modal.close('ok'));
  input.focus();
  input.select();
  return modal.done.then((id) => (id === 'ok' ? input.value : null));
}

/** Ask a yes/no question. `danger` styles the confirm button as destructive. */
export function confirmBox(title: string, message: string, okLabel: string, danger = false): Promise<boolean> {
  const modal = openModal<'cancel' | 'ok'>({ title, className: 'small', content: message, actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: okLabel, primary: !danger, danger }] });
  modal.buttons.cancel.focus();
  return modal.done.then((id) => id === 'ok');
}

export interface Choice<T> {
  label: string;
  value: T;
  hint?: string;
}

/** Pick one of a list. Resolves to undefined when cancelled. */
export function pickBox<T>(title: string, choices: Choice<T>[], extra?: { label: string; run: () => Promise<T | undefined> }): Promise<T | undefined> {
  let picked: T | undefined;
  const list = el('div', { class: 'picklist' });
  const actions: { id: 'cancel' | 'more'; label: string; run?: () => boolean | void }[] = [{ id: 'cancel', label: 'Cancel' }];
  if (extra) {
    // the follow-up question opens its own dialog on top; this one waits for its answer
    actions.unshift({ id: 'more', label: extra.label, run: () => { void (async () => { picked = await extra.run(); modal.close('more'); })(); return false; } });
  }
  const modal = openModal<'cancel' | 'more' | 'pick'>({ title, className: 'small', content: list, actions });
  for (const c of choices) {
    const b = el('button', { type: 'button' }, c.label);
    if (c.hint) { b.classList.add('with-hint'); b.append(el('span', { class: 'hint' }, c.hint)); }
    b.addEventListener('click', () => { picked = c.value; modal.close('pick'); });
    list.append(b);
  }
  return modal.done.then((id) => (id === 'cancel' ? undefined : picked));
}

/** Ask for one or more numbers (a position's x and y, say). Resolves to null when cancelled. */
export function askNumbers(title: string, fields: { label: string; value: number; step?: number; unit?: string }[], okLabel = 'Apply'): Promise<number[] | null> {
  const rows: HTMLElement[] = [];
  const inputs = fields.map((f) => {
    const row = el('label', { class: 'nfield' });
    const input = el('input', { type: 'number', step: String(f.step ?? 1), value: String(Math.round(f.value * 1000) / 1000), 'aria-label': f.label, class: 'textbox' });
    row.append(el('span', { class: 'name' }, f.label), input, el('span', { class: 'hint' }, f.unit ?? ''));
    rows.push(row);
    return input;
  });
  const modal = openModal<'cancel' | 'ok'>({ title, className: 'small', content: rows, actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: okLabel, primary: true }] });
  for (const i of inputs) ownKeys(i, () => modal.close('ok'));
  inputs[0]?.focus();
  inputs[0]?.select();
  return modal.done.then((id) => {
    if (id !== 'ok') return null;
    const nums = inputs.map((i) => Number(i.value));
    return nums.every((n) => Number.isFinite(n)) ? nums : null;
  });
}

/**
 * Ask for a block of text (a pasted script), with a live line under it saying what it will make.
 * `describe` returns that line and whether the text can be used. Resolves to null when cancelled.
 */
export function askLongText(title: string, intro: string, placeholder: string, okLabel: string, describe: (text: string) => { summary: string; ok: boolean }): Promise<string | null> {
  const area = el('textarea', { rows: '12', 'aria-label': title, placeholder, class: 'textbox long-textbox', spellcheck: 'false' });
  const summary = el('p', { class: 'hint', 'aria-live': 'polite' });
  const modal = openModal<'cancel' | 'ok'>({ title, className: 'small long-text', content: [intro, area, summary], actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: okLabel, primary: true }] });
  const ok = modal.buttons.ok;
  const refresh = () => { const d = describe(area.value); summary.textContent = d.summary; ok.disabled = !d.ok; };
  area.addEventListener('input', refresh);
  // the app's shortcuts stay out of the box; Return makes new lines (Ctrl / ⌘ + Return adds)
  area.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !ok.disabled) modal.close('ok'); });
  area.addEventListener('keyup', (e) => e.stopPropagation());
  refresh();
  area.focus();
  return modal.done.then((id) => (id === 'ok' ? area.value : null));
}

/** Animate along a path: how long the trip takes, and how the layer travels. Null when cancelled. */
export function askPathOptions(seconds: number, replacing: boolean): Promise<{ seconds: number; even: boolean; orient: boolean } | null> {
  const row = el('label', { class: 'nfield' });
  const time = el('input', { type: 'number', step: '0.25', min: '0.1', value: String(seconds), 'aria-label': 'Travel time', class: 'textbox' });
  row.append(el('span', { class: 'name' }, 'Time'), time, el('span', { class: 'hint' }, 's'));
  const check = (label: string, on: boolean) => {
    const box = el('label', { class: 'cfield' });
    const input = el('input', { type: 'checkbox', 'aria-label': label });
    input.checked = on;
    box.append(input, document.createTextNode(` ${label}`));
    return { box, input };
  };
  const even = check('Even speed (steady all the way along)', true);
  const orient = check('Turn to face the way it travels', false);
  const content: Node[] = [el('p', { class: 'hint' }, 'The trip starts at the playhead.'), row, even.box, orient.box];
  if (replacing) content.push(el('p', { class: 'hint' }, 'This replaces the layer’s current position keys. Undo brings them back.'));
  content.push(el('p', { class: 'hint' }, 'Turning assumes the artwork faces right.'));
  const valid = () => { const s = Number(time.value); if (!Number.isFinite(s) || s <= 0) { time.focus(); return false; } return true; };
  const modal = openModal<'cancel' | 'ok'>({ title: 'Animate along the path', className: 'small', content, actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'ok', label: 'Animate', primary: true, run: valid }] });
  ownKeys(time, () => { if (valid()) modal.close('ok'); });
  time.focus();
  time.select();
  return modal.done.then((id) => (id === 'ok' ? { seconds: Number(time.value), even: even.input.checked, orient: orient.input.checked } : null));
}
