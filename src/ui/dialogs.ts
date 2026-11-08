import { el } from './dom';
/** Small dialogs that work the same on iPad and desktop (window.prompt is awkward on touch). */

/**
 * A modal with a title, a body and a footer. `done(value)` answers once: it resolves the promise
 * straight away, then closes and removes the dialog. (Answers never wait for the dialog's
 * "close" event, which browsers may hold back while the page is not on screen.) Escape answers
 * with `fallback`.
 */
function modal<T>(title: string, fallback: T, resolve: (v: T) => void): { dialog: HTMLDialogElement; body: HTMLElement; foot: HTMLElement; done: (v: T) => void } {
  const dialog = el('dialog', { class: 'small' });
  const body = el('div', { class: 'dbody' });
  const foot = el('div', { class: 'vfoot' });
  dialog.append(el('h2', {}, title), body, foot);
  document.body.append(dialog);
  let answered = false;
  const done = (v: T) => {
    if (answered) return;
    answered = true;
    resolve(v);
    if (dialog.open) dialog.close();
    dialog.remove();
  };
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    done(fallback);
  });
  dialog.addEventListener('close', () => done(fallback));
  return { dialog, body, foot, done };
}

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
  return new Promise((resolve) => {
    const { dialog, body, foot, done } = modal<string | null>(title, null, resolve);
    const input = el('input', { type: 'text', maxlength: '80', value, 'aria-label': title, class: 'textbox' });
    if(description) {body.append(el('p',{},description));input.setAttribute('aria-description',description);}
    body.append(input);
    const cancel = el('button', { type: 'button' }, 'Cancel');
    const ok = el('button', { type: 'button', class: 'primary' }, okLabel);
    foot.append(cancel, ok);
    cancel.addEventListener('click', () => done(null));
    ok.addEventListener('click', () => done(input.value));
    ownKeys(input, () => done(input.value));
    dialog.showModal();
    input.focus();
    input.select();
  });
}

/** Ask a yes/no question. `danger` styles the confirm button as destructive. */
export function confirmBox(title: string, message: string, okLabel: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const { dialog, body, foot, done } = modal<boolean>(title, false, resolve);
    body.append(el('p', {}, message));
    const cancel = el('button', { type: 'button' }, 'Cancel');
    const ok = el('button', { type: 'button', class: danger ? 'danger' : 'primary' }, okLabel);
    foot.append(cancel, ok);
    cancel.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));
    dialog.showModal();
    cancel.focus();
  });
}

export interface Choice<T> {
  label: string;
  value: T;
  hint?: string;
}

/** Pick one of a list. Resolves to undefined when cancelled. */
export function pickBox<T>(title: string, choices: Choice<T>[], extra?: { label: string; run: () => Promise<T | undefined> }): Promise<T | undefined> {
  return new Promise((resolve) => {
    const { dialog, body, foot, done } = modal<T | undefined>(title, undefined, resolve);
    const list = el('div', { class: 'picklist' });
    for (const c of choices) {
      const b = el('button', { type: 'button' }, c.label);
      if (c.hint) {b.classList.add('with-hint');b.append(el('span', { class: 'hint' }, c.hint));}
      b.addEventListener('click', () => done(c.value));
      list.append(b);
    }
    body.append(list);
    const cancel = el('button', { type: 'button' }, 'Cancel');
    cancel.addEventListener('click', () => done(undefined));
    foot.append(cancel);
    if (extra) {
      const more = el('button', { type: 'button' }, extra.label);
      more.addEventListener('click', async () => {
        // the follow-up question opens its own dialog on top; this one waits for its answer
        done(await extra.run());
      });
      foot.prepend(more);
    }
    dialog.showModal();
  });
}

/** Ask for one or more numbers (a position's x and y, say). Resolves to null when cancelled. */
export function askNumbers(title: string, fields: { label: string; value: number; step?: number; unit?: string }[], okLabel = 'Apply'): Promise<number[] | null> {
  return new Promise((resolve) => {
    const { dialog, body, foot, done } = modal<number[] | null>(title, null, resolve);
    const inputs = fields.map((f) => {
      const row = el('label', { class: 'nfield' });
      const input = el('input', { type: 'number', step: String(f.step ?? 1), value: String(Math.round(f.value * 1000) / 1000), 'aria-label': f.label, class: 'textbox' });
      row.append(el('span', { class: 'name' }, f.label), input, el('span', { class: 'hint' }, f.unit ?? ''));
      body.append(row);
      return input;
    });
    const cancel = el('button', { type: 'button' }, 'Cancel');
    const ok = el('button', { type: 'button', class: 'primary' }, okLabel);
    foot.append(cancel, ok);
    const accept = () => {
      const nums = inputs.map((i) => Number(i.value));
      done(nums.every((n) => Number.isFinite(n)) ? nums : null);
    };
    cancel.addEventListener('click', () => done(null));
    ok.addEventListener('click', accept);
    for (const i of inputs) ownKeys(i, accept);
    dialog.showModal();
    inputs[0]?.focus();
    inputs[0]?.select();
  });
}

/**
 * Ask for a block of text (a pasted script), with a live line under it saying what it will make.
 * `describe` returns that line and whether the text can be used. Resolves to null when cancelled.
 */
export function askLongText(title: string, intro: string, placeholder: string, okLabel: string, describe: (text: string) => { summary: string; ok: boolean }): Promise<string | null> {
  return new Promise((resolve) => {
    const { dialog, body, foot, done } = modal<string | null>(title, null, resolve);
    dialog.classList.add('long-text');
    const area = el('textarea', { rows: '12', 'aria-label': title, placeholder, class: 'textbox long-textbox', spellcheck: 'false' });
    const summary = el('p', { class: 'hint', 'aria-live': 'polite' });
    body.append(el('p', {}, intro), area, summary);
    const cancel = el('button', { type: 'button' }, 'Cancel');
    const ok = el('button', { type: 'button', class: 'primary' }, okLabel);
    foot.append(cancel, ok);
    const refresh = () => { const d = describe(area.value); summary.textContent = d.summary; ok.disabled = !d.ok; };
    area.addEventListener('input', refresh);
    // the app's shortcuts stay out of the box; Return makes new lines (Ctrl / ⌘ + Return adds)
    area.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !ok.disabled) done(area.value); });
    area.addEventListener('keyup', (e) => e.stopPropagation());
    cancel.addEventListener('click', () => done(null));
    ok.addEventListener('click', () => done(area.value));
    refresh();
    dialog.showModal();
    area.focus();
  });
}

/** Animate along a path: how long the trip takes, and how the layer travels. Null when cancelled. */
export function askPathOptions(seconds: number, replacing: boolean): Promise<{ seconds: number; even: boolean; orient: boolean } | null> {
  return new Promise((resolve) => {
    const { dialog, body, foot, done } = modal<{ seconds: number; even: boolean; orient: boolean } | null>('Animate along the path', null, resolve);
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
    body.append(el('p', { class: 'hint' }, 'The trip starts at the playhead.'), row, even.box, orient.box);
    if (replacing) body.append(el('p', { class: 'hint' }, 'This replaces the layer’s current position keys. Undo brings them back.'));
    body.append(el('p', { class: 'hint' }, 'Turning assumes the artwork faces right.'));
    const cancel = el('button', { type: 'button' }, 'Cancel');
    const ok = el('button', { type: 'button', class: 'primary' }, 'Animate');
    foot.append(cancel, ok);
    const accept = () => {
      const s = Number(time.value);
      if (!Number.isFinite(s) || s <= 0) { time.focus(); return; }
      done({ seconds: s, even: even.input.checked, orient: orient.input.checked });
    };
    cancel.addEventListener('click', () => done(null));
    ok.addEventListener('click', accept);
    ownKeys(time, accept);
    dialog.showModal();
    time.focus();
    time.select();
  });
}
