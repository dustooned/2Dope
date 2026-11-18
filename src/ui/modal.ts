import { el } from './dom';

/**
 * The shared shell for 2Dope's modal dialogs: a <dialog> with an optional title, the caller's
 * content and a row of buttons. The primitive owns showModal, Escape, closing and removal;
 * callers keep their own fields, previews and validation.
 *
 * Each dialog answers once, with the id of the button that closed it (or `cancelId` for
 * Escape, or when something else closes the <dialog>). `done` resolves as soon as the answer
 * is given; it never waits for the dialog's "close" event, which browsers may hold back while
 * the page is not on screen.
 */

export interface ModalAction<Id extends string = string> {
  id: Id;
  label: string;
  /** Styles the button as the main action (`.primary`). */
  primary?: boolean;
  /** Styles the button as destructive (`.danger`). */
  danger?: boolean;
  /** Runs on click before the dialog closes. Return false to keep it open (validation, async work). */
  run?: () => boolean | void;
}

export interface ModalOptions<Id extends string = string> {
  /** The dialog's <h2>. Omit when the content brings its own heading. */
  title?: string;
  ariaLabel?: string;
  className?: string;
  /** A string becomes a paragraph; nodes are appended as they are. */
  content?: string | Node | (string | Node)[];
  /** Wraps the content in <div class="…">. Default `dbody`; null appends it straight into the dialog. */
  bodyClass?: string | null;
  actions?: ModalAction<Id>[];
  /** The button row: `vfoot` (a div.vfoot, the default) or `footer` (a <footer>), or any tag and class. */
  footer?: 'vfoot' | 'footer' | { tag: 'div' | 'footer'; className: string };
  /** The answer for Escape and outside closes. Default `cancel`. */
  cancelId?: Id;
  /** Keep the app's keyboard shortcuts from seeing keys pressed inside the dialog. */
  ownKeys?: boolean;
  /** Focused once the dialog is open. */
  focus?: HTMLElement | null;
  /** Runs once after the dialog has closed and left the page, with the answer. */
  onClose?: (id: Id) => void;
}

export interface ModalHandle<Id extends string = string> {
  dialog: HTMLDialogElement;
  /** Where the content went: the body wrapper, or the dialog itself when `bodyClass` is null. */
  body: HTMLElement;
  /** The button row, or null when there are no actions. */
  foot: HTMLElement | null;
  buttons: Record<Id, HTMLButtonElement>;
  /** Answer with `id` (default `cancelId`), close and remove the dialog. Later calls do nothing. */
  close(id?: Id): void;
  readonly closed: boolean;
  done: Promise<Id>;
}

function footerOf(kind: ModalOptions['footer']): HTMLElement {
  if (kind === 'footer') return el('footer');
  if (kind && typeof kind === 'object') return el(kind.tag, { class: kind.className });
  return el('div', { class: 'vfoot' });
}

export function openModal<Id extends string = string>(options: ModalOptions<Id>): ModalHandle<Id> {
  const cancelId = (options.cancelId ?? 'cancel') as Id;
  const attrs: Record<string, string> = {};
  if (options.className) attrs.class = options.className;
  if (options.ariaLabel) attrs['aria-label'] = options.ariaLabel;
  const dialog = el('dialog', attrs);
  if (options.title !== undefined) dialog.append(el('h2', {}, options.title));
  const bodyClass = options.bodyClass === undefined ? 'dbody' : options.bodyClass;
  const body = bodyClass === null ? dialog : el('div', { class: bodyClass });
  const content = options.content === undefined ? [] : Array.isArray(options.content) ? options.content : [options.content];
  for (const c of content) body.append(typeof c === 'string' ? el('p', {}, c) : c);
  if (body !== dialog) dialog.append(body);

  let resolve!: (id: Id) => void;
  const done = new Promise<Id>((r) => { resolve = r; });
  let answered = false;
  const close = (id: Id = cancelId) => {
    if (answered) return;
    answered = true;
    if (dialog.open) dialog.close();
    dialog.remove();
    resolve(id);
    options.onClose?.(id);
  };

  const buttons = {} as Record<Id, HTMLButtonElement>;
  let foot: HTMLElement | null = null;
  if (options.actions?.length) {
    foot = footerOf(options.footer);
    for (const a of options.actions) {
      const cls = a.danger ? 'danger' : a.primary ? 'primary' : '';
      const b = el('button', cls ? { type: 'button', class: cls } : { type: 'button' }, a.label);
      b.addEventListener('click', () => { if (a.run?.() !== false) close(a.id); });
      buttons[a.id] = b;
      foot.append(b);
    }
    dialog.append(foot);
  }

  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(cancelId); });
  dialog.addEventListener('close', () => close(cancelId));
  if (options.ownKeys) {
    dialog.addEventListener('keydown', (e) => e.stopPropagation());
    dialog.addEventListener('keyup', (e) => e.stopPropagation());
  }
  document.body.append(dialog);
  dialog.showModal();
  options.focus?.focus();
  return { dialog, body, foot, buttons, close, get closed() { return answered; }, done };
}
