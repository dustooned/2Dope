/**
 * The app's icons: simple line drawings on a 24 px grid, drawn in the current text colour, so they
 * look the same on an iPad, a phone and Windows (emoji do not). Buttons get one with
 * `data-icon="name"`; their text stays as the label (shown or hidden by CSS, always the
 * accessible name).
 */

const P: Record<string, string> = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  gallery:
    '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  draw: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z"/><path d="M14.5 6.5l3 3"/>',
  time: '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M5 8h14M5 12.5h14M5 17h14M10 3.5v17"/>',
  motion: '<path d="M3 12h18"/><path d="M7 8.5L10.5 12 7 15.5 3.5 12z"/><path d="M17 8.5l3.5 3.5-3.5 3.5-3.5-3.5z"/>',
  brush: '<path d="M14 4l6 6-6.5 6.5-6-6z"/><path d="M7.5 10.5L5 13c-1.5 1.5-1 4-3 6 3 .5 5.5 0 7-1.5l2.5-2.5"/>',
  eraser: '<path d="M8 20h12"/><path d="M4.5 15.5l9-9a2 2 0 012.8 0l2.2 2.2a2 2 0 010 2.8L11 19H8z"/><path d="M9 11l5 5"/>',
  pen: '<path d="M12 3l5 9-5 9-5-9z"/><path d="M12 12v9"/><circle cx="12" cy="11" r="1.4"/>',
  fill: '<path d="M5 11l7-7 7 7-7 7z"/><path d="M5 11h14"/><path d="M20 15c0 1.5-1 2.5-1 3.5a1 1 0 002 0c0-1-1-2-1-3.5z"/>',
  lineplane: '<path d="M3 16c3-8 5-8 7-3s4 5 6 0 3-6 5-5"/>',
  fillplane: '<path d="M12 3.5c3 4 6 7 6 10.5a6 6 0 01-12 0c0-3.5 3-6.5 6-10.5z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 000 12h3"/>',
  panel: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  quick: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
  export: '<path d="M12 15V3.5"/><path d="M7.5 8L12 3.5 16.5 8"/><path d="M5 12v7a1.5 1.5 0 001.5 1.5h11A1.5 1.5 0 0019 19v-7"/>',
  collapse: '<path d="M6 15l6-6 6 6"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  first: '<path d="M6 5v14"/><path d="M17 5l-7 7 7 7"/>',
  last: '<path d="M18 5v14"/><path d="M7 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5.5A1.5 1.5 0 0014.5 4h-9A1.5 1.5 0 004 5.5v9A1.5 1.5 0 005.5 16H8"/>',
  trash: '<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v5.5M14 11v5.5"/>',
  onion: '<circle cx="9.5" cy="12" r="5.5"/><circle cx="14.5" cy="12" r="5.5" opacity=".55"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 018 0v2.5"/>',
  flipbook: '<rect x="7" y="3.5" width="12" height="15" rx="1.5"/><path d="M5 6.5v13.5a.5.5 0 00.5.5H16"/><path d="M13 8v6M10 11h6"/>',
  layers: '<path d="M12 4l9 4.5-9 4.5-9-4.5z"/><path d="M3 13l9 4.5 9-4.5"/>',
  camera: '<rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10.5l5-3v9l-5-3z"/>',
  more: '<circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/>',
  board: '<rect x="3" y="4" width="8" height="6" rx="1"/><rect x="13" y="4" width="8" height="6" rx="1"/><path d="M3 14h8M3 17h6M13 14h8M13 17h6"/>',
  ripple: '<path d="M3 12h7"/><path d="M14 6v12"/><path d="M17 9l3 3-3 3"/><path d="M20 12h-6"/><path d="M7 9l3 3-3 3"/>',
  scissors: '<circle cx="6" cy="6.5" r="2.5"/><circle cx="6" cy="17.5" r="2.5"/><path d="M8 8l12 9M8 16L20 7"/>',
  lasso: '<path d="M7 17c-3-1.5-4-4-3-6.5C5.5 6 10 4 14.5 4.5S21 8 20 11.5 14 17 10 16.5"/><path d="M7 17c.5 1.5-.5 3-2 3.5"/>',
};

/** The SVG markup for an icon (empty for an unknown name). */
export function iconSvg(name: string): string {
  const body = P[name];
  if (!body) return '';
  return `<svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

/** Put the icon in a button (once), keeping its text as the label. */
export function decorate(b: HTMLElement, name = b.dataset.icon ?? ''): void {
  if (!P[name]) return;
  b.dataset.icon = name;
  let label = b.querySelector<HTMLElement>(':scope > .lbl');
  if (!label) {
    label = document.createElement('span');
    label.className = 'lbl';
    label.textContent = b.textContent?.trim() ?? '';
    b.textContent = '';
    b.append(label);
  }
  b.querySelector(':scope > svg.ico')?.remove();
  b.insertAdjacentHTML('afterbegin', iconSvg(name));
  b.classList.add('has-ico');
  if (!b.getAttribute('aria-label') && label.textContent) b.setAttribute('aria-label', label.textContent);
}

/** Change an icon button's label (and optionally its icon) without losing the icon. */
export function setLabel(b: HTMLElement, text: string, icon?: string): void {
  const label = b.querySelector<HTMLElement>(':scope > .lbl');
  if (!label) {
    b.textContent = text;
    if (icon) decorate(b, icon);
    return;
  }
  if (label.textContent !== text) {
    label.textContent = text;
    b.setAttribute('aria-label', text);
  }
  if (icon && b.dataset.icon !== icon) decorate(b, icon);
}

/** Decorate every `[data-icon]` button under a root. */
export function applyIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((b) => {
    if (!b.classList.contains('has-ico')) decorate(b);
  });
}

/** Text buttons that get an icon automatically: label → icon, and whether the icon replaces the word. */
const AUTO: Record<string, [string, boolean]> = {
  '⏮': ['first', true],
  '◀': ['prev', true],
  Play: ['play', true],
  Pause: ['pause', true],
  '▶': ['next', true],
  '⏭': ['last', true],
  '+ Frame': ['plus', false],
  Duplicate: ['copy', true],
  Delete: ['trash', true],
  Onion: ['onion', false],
  Lock: ['lock', false],
  Flipbook: ['flipbook', false],
  Undo: ['undo', true],
  Redo: ['redo', true],
  Brush: ['brush', true],
  Eraser: ['eraser', true],
  Fill: ['fill', true],
  'More ⋯': ['more', true],
  '+ Drawing': ['plus', false],
  '+ Null': ['plus', false],
  '+ Camera': ['camera', false],
  Split: ['scissors', false],
};

/** Give a text button its icon when its label is a known one (strip, Quick bar, Motion toolbar). */
export function autoIcon<T extends HTMLElement>(b: T): T {
  const label = b.textContent?.trim() ?? '';
  const hit = AUTO[label];
  if (!hit) return b;
  // glyph labels get a word as their accessible name
  const words: Record<string, string> = { '⏮': 'Previous drawing', '◀': 'Previous frame', '▶': 'Next frame', '⏭': 'Next drawing', 'More ⋯': 'More' };
  if (words[label]) b.textContent = words[label]!;
  decorate(b, hit[0]);
  if (hit[1]) b.classList.add('icon-only');
  return b;
}
