import { MANUAL, UPDATES, type Block } from './manualtext';

const SEEN_KEY = '2dope.updates.seen';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function block(b: Block): HTMLElement {
  if (typeof b === 'string') return el('p', {}, b);
  if ('tip' in b) return el('p', { class: 'man-tip' }, b.tip);
  if ('list' in b || 'steps' in b) {
    const items = 'list' in b ? b.list : b.steps;
    const l = el('steps' in b ? 'ol' : 'ul');
    for (const t of items) l.append(el('li', {}, t));
    return l;
  }
  const t = el('table', { class: 'man-keys' });
  for (const [k, v] of b.keys) {
    const r = el('tr');
    r.append(el('th', { scope: 'row' }, k), el('td', {}, v));
    t.append(r);
  }
  return t;
}

/** Are there update notes this device has not opened yet? */
export function hasNewUpdates(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) !== UPDATES[0]?.date;
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    if (UPDATES[0]) localStorage.setItem(SEEN_KEY, UPDATES[0].date);
  } catch {
    // not remembered: the dot shows again next time
  }
}

/**
 * The manual: an overview, every workspace and feature in plain steps, gestures and shortcuts,
 * and What's new. Contents on the side (a dropdown on phones), a search box that filters the
 * sections, and Print / Save as PDF for a paper copy. Opens on a section or on the updates.
 */
export function openManual(start: 'overview' | 'updates' | string = 'overview', onClose?: () => void): void {
  document.querySelector('dialog.manual')?.remove();
  const dialog = el('dialog', { class: 'manual', 'aria-label': '2Dope manual' });
  const head = el('div', { class: 'man-head' });
  const search = el('input', { type: 'search', placeholder: 'Search the manual', 'aria-label': 'Search the manual', class: 'man-search' });
  const print = el('button', { type: 'button', title: 'Print it, or save it as a PDF' }, 'Print / PDF');
  const close = el('button', { type: 'button', class: 'primary' }, 'Close');
  head.append(el('h2', {}, '2Dope manual'), search, print, close);

  const toc = el('nav', { class: 'man-toc', 'aria-label': 'Contents' });
  const pick = el('select', { class: 'man-pick', 'aria-label': 'Go to section' });
  const body = el('div', { class: 'man-body' });
  const sections: { id: string; node: HTMLElement; text: string }[] = [];
  const add = (id: string, title: string, content: HTMLElement[]) => {
    const s = el('section', { id: `man-${id}` });
    s.append(el('h3', {}, title), ...content);
    body.append(s);
    sections.push({ id, node: s, text: s.textContent?.toLowerCase() ?? '' });
    const a = el('button', { type: 'button', 'data-id': id }, title);
    a.addEventListener('click', () => go(id));
    toc.append(a);
    pick.append(el('option', { value: id }, title));
  };
  for (const s of MANUAL) add(s.id, s.title, s.blocks.map(block));
  add(
    'updates',
    'What’s new',
    UPDATES.flatMap((u) => {
      const h = el('h4', {}, `${u.date} · ${u.title}`);
      const l = el('ul');
      for (const t of u.items) l.append(el('li', {}, t));
      return [h, l];
    }),
  );
  const empty = el('p', { class: 'hint man-empty', hidden: '' }, 'Nothing found. Try another word.');
  body.append(empty);

  const main = el('div', { class: 'man-main' });
  main.append(toc, el('div', { class: 'man-col' }));
  main.lastElementChild!.append(pick, body);
  dialog.append(head, main);
  document.body.append(dialog);

  function go(id: string): void {
    search.value = '';
    filter();
    const s = sections.find((x) => x.id === id);
    s?.node.scrollIntoView({ block: 'start' });
    pick.value = id;
    for (const b of toc.querySelectorAll<HTMLElement>('button')) b.classList.toggle('on', b.dataset.id === id);
    if (id === 'updates') markSeen();
  }
  function filter(): void {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const s of sections) {
      const hit = !q || q.split(/\s+/).every((w) => s.text.includes(w));
      s.node.hidden = !hit;
      (toc.querySelector(`[data-id="${s.id}"]`) as HTMLElement).hidden = !hit;
      if (hit) shown++;
    }
    empty.hidden = shown > 0;
  }
  search.addEventListener('input', filter);
  // typing in the manual must not trigger the app's shortcuts
  dialog.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') e.stopPropagation();
  });
  pick.addEventListener('change', () => go(pick.value));
  // the contents follow the reading position
  body.addEventListener('scroll', () => {
    const top = body.getBoundingClientRect().top + 40;
    let cur = sections[0]?.id ?? '';
    for (const s of sections) if (!s.node.hidden && s.node.getBoundingClientRect().top <= top) cur = s.id;
    pick.value = cur;
    for (const b of toc.querySelectorAll<HTMLElement>('button')) b.classList.toggle('on', b.dataset.id === cur);
    if (cur === 'updates') markSeen();
  });
  print.addEventListener('click', () => {
    search.value = '';
    filter();
    document.body.classList.add('printing-manual');
    window.print();
    document.body.classList.remove('printing-manual');
  });
  const done = () => {
    if (dialog.open) dialog.close();
    dialog.remove();
    onClose?.();
  };
  close.addEventListener('click', done);
  dialog.addEventListener('close', done);
  dialog.showModal();
  go(start);
}
