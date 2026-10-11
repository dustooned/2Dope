/** Small dialogs that work the same on iPad and desktop (window.prompt is awkward on touch). */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function modal(title: string): { dialog: HTMLDialogElement; body: HTMLElement; foot: HTMLElement } {
  const dialog = el('dialog', { class: 'small' });
  const body = el('div', { class: 'dbody' });
  const foot = el('div', { class: 'vfoot' });
  dialog.append(el('h2', {}, title), body, foot);
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  return { dialog, body, foot };
}

/** Ask for a line of text. Resolves to null when cancelled. */
export function askText(title: string, value = '', okLabel = 'OK'): Promise<string | null> {
  return new Promise((resolve) => {
    const { dialog, body, foot } = modal(title);
    const input = el('input', { type: 'text', maxlength: '80', value, 'aria-label': title, class: 'textbox' });
    body.append(input);
    const cancel = el('button', { type: 'button' }, 'Cancel');
    const ok = el('button', { type: 'button', class: 'primary' }, okLabel);
    foot.append(cancel, ok);
    let result: string | null = null;
    const accept = () => {
      result = input.value;
      dialog.close();
    };
    cancel.addEventListener('click', () => dialog.close());
    ok.addEventListener('click', accept);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') accept();
    });
    input.addEventListener('keyup', (e) => e.stopPropagation());
    dialog.addEventListener('close', () => resolve(result));
    dialog.showModal();
    input.focus();
    input.select();
  });
}

/** Ask a yes/no question. `danger` styles the confirm button as destructive. */
export function confirmBox(title: string, message: string, okLabel: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const { dialog, body, foot } = modal(title);
    body.append(el('p', {}, message));
    const cancel = el('button', { type: 'button' }, 'Cancel');
    const ok = el('button', { type: 'button', class: danger ? 'danger' : 'primary' }, okLabel);
    foot.append(cancel, ok);
    let result = false;
    cancel.addEventListener('click', () => dialog.close());
    ok.addEventListener('click', () => {
      result = true;
      dialog.close();
    });
    dialog.addEventListener('close', () => resolve(result));
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
    const { dialog, body, foot } = modal(title);
    let result: T | undefined;
    const list = el('div', { class: 'picklist' });
    for (const c of choices) {
      const b = el('button', { type: 'button' }, c.label);
      if (c.hint) b.append(el('span', { class: 'hint' }, c.hint));
      b.addEventListener('click', () => {
        result = c.value;
        dialog.close();
      });
      list.append(b);
    }
    body.append(list);
    const cancel = el('button', { type: 'button' }, 'Cancel');
    cancel.addEventListener('click', () => dialog.close());
    foot.append(cancel);
    if (extra) {
      const more = el('button', { type: 'button' }, extra.label);
      more.addEventListener('click', async () => {
        result = await extra.run();
        dialog.close();
      });
      foot.prepend(more);
    }
    dialog.addEventListener('close', () => resolve(result));
    dialog.showModal();
  });
}

/** Ask for one or more numbers (a position's x and y, say). Resolves to null when cancelled. */
export function askNumbers(title: string, fields: { label: string; value: number; step?: number; unit?: string }[], okLabel = 'Apply'): Promise<number[] | null> {
  return new Promise((resolve) => {
    const { dialog, body, foot } = modal(title);
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
    let result: number[] | null = null;
    const accept = () => {
      const nums = inputs.map((i) => Number(i.value));
      if (nums.every((n) => Number.isFinite(n))) result = nums;
      dialog.close();
    };
    cancel.addEventListener('click', () => dialog.close());
    ok.addEventListener('click', accept);
    for (const i of inputs) {
      i.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') accept();
      });
      i.addEventListener('keyup', (e) => e.stopPropagation());
    }
    dialog.addEventListener('close', () => resolve(result));
    dialog.showModal();
    inputs[0]?.focus();
    inputs[0]?.select();
  });
}
