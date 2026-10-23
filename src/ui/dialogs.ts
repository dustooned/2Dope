/** Small dialogs that work the same on iPad and desktop (window.prompt is awkward on touch). */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

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
