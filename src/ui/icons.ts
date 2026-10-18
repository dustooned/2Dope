/**
 * The app's icons: simple line drawings on a 24 px grid, drawn in the current text colour, so they
 * look the same on an iPad, a phone and Windows (emoji do not). Buttons get one with
 * `data-icon="name"`; their text stays as the label (shown or hidden by CSS, always the
 * accessible name).
 */

const P: Record<string, string> = {
  editpoints: '<path d="M4 18C8 6 16 6 20 18"/><rect x="2.5" y="16.5" width="3" height="3"/><circle cx="12" cy="9" r="1.8"/><rect x="18.5" y="16.5" width="3" height="3"/>',
  curvept: '<path d="M3 17C7 7 17 7 21 17"/><circle cx="12" cy="9.5" r="2.6"/>',
  straightpt: '<path d="M3 17l9-8 9 8"/><rect x="9.4" y="6.4" width="5.2" height="5.2"/>',
  allstraight: '<path d="M3 18l5-9 5 6 4-8 4 4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  wline: '<path d="M3 12h18" stroke-width="4"/>',
  wpoint: '<path d="M3 12h18"/><circle cx="12" cy="12" r="3.5"/>',
  wsection: '<path d="M3 12h4M17 12h4"/><path d="M8 12h8" stroke-width="5"/>',
  thinner: '<path d="M3 8h18" stroke-width="1.2"/><path d="M8 16h8"/>',
  thicker: '<path d="M3 8h18" stroke-width="4"/><path d="M8 16h8M12 12v8"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  key: '<path d="M12 3.5l8.5 8.5-8.5 8.5L3.5 12z"/>',
  adjust: '<path d="M4 20L15 9"/><path d="M14 4v3M19 9h-3M17.5 5.5l-2 2M12 2.5v0M21.5 12v0"/><path d="M18 13l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/>',
  symmetry: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 7C5 8 4 12 6 16l3-1z"/><path d="M15 7c4 1 5 5 3 9l-3-1z"/>',
  fliph: '<path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 7L4 12l5 5z"/><path d="M15 7l5 5-5 5z"/>',
  flipv: '<path d="M3 12h18" stroke-dasharray="2 2"/><path d="M7 9l5-5 5 5z"/><path d="M7 15l5 5 5-5z"/>',
  insbefore: '<rect x="6" y="11" width="12" height="9" rx="2"/><path d="M12 2v6M9 5h6"/>',
  insafter: '<rect x="6" y="4" width="12" height="9" rx="2"/><path d="M12 16v6M9 19h6"/>',
  paste: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V2.5h6V4"/><path d="M9 11h6M9 15h4"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  selrect: '<rect x="4" y="5" width="16" height="14" rx="1" stroke-dasharray="3 2"/>',
  selellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5" stroke-dasharray="3 2"/>',
  selauto: '<path d="M5 19l7-7"/><path d="M15 3.5l1.4 2.9 2.9 1.4-2.9 1.4L15 12.1l-1.4-2.9-2.9-1.4 2.9-1.4z"/>',
  selnew: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  seladd: '<rect x="3" y="3" width="12" height="12" rx="2"/><path d="M17 13v8M13 17h8"/>',
  selsub: '<rect x="3" y="3" width="12" height="12" rx="2"/><path d="M13 17h8"/>',
  invert: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 4h8v16H4z" fill="currentColor" stroke="none"/>',
  deselect: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 2"/><path d="M9 9l6 6M15 9l-6 6"/>',
  freeform: '<rect x="4" y="7" width="16" height="10" rx="1"/><path d="M1 12h3M20 12h3"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  guide: '<path d="M3 18L12 6l9 12"/><path d="M3 18h18M7.5 12h9"/>',
  fx: '<path d="M10 3l1.8 4.7L16.5 9.5l-4.7 1.8L10 16l-1.8-4.7L3.5 9.5l4.7-1.8z"/><path d="M18 13l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/><path d="M17 3v3M15.5 4.5h3"/>',
  smudge: '<path d="M9 21v-6.5a2 2 0 014 0V11a2 2 0 014 0v3"/><path d="M13 11V6a2 2 0 00-4 0v8"/><path d="M17 14v-1a2 2 0 014 0v3a7 7 0 01-7 7h-1"/><path d="M3 7c2-1 3 1 5 0"/>',
  eyedrop: '<path d="M14.5 4.5l5 5"/><path d="M17 2.5a2.1 2.1 0 013 3L17.5 8 16 6.5z"/><path d="M15 7.5l-9.5 9.5L4 20l3-1.5L16.5 9"/>',
  select: '<rect x="4" y="4" width="13" height="13" rx="1.5" stroke-dasharray="3 2.4"/><path d="M13 13l7 3-3 1-1 3z"/>',
  expandall: '<path d="M6 5l6 6 6-6"/><path d="M6 13l6 6 6-6"/>',
  collapseall: '<path d="M6 11l6-6 6 6"/><path d="M6 19l6-6 6 6"/>',
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
    // a plus icon already says "+": "+ Null" reads Null next to it, not "+ + Null"
    label.textContent = (b.textContent?.trim() ?? '').replace(name === 'plus' ? /^\+\s*/ : /^$/, '');
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
  Select: ['select', false],
  '▾ All': ['expandall', true],
  '▸ All': ['collapseall', true],
};

/** Give a text button its icon when its label is a known one (strip, Quick bar, Motion toolbar). */
export function autoIcon<T extends HTMLElement>(b: T): T {
  const label = b.textContent?.trim() ?? '';
  const hit = AUTO[label];
  if (!hit) return b;
  // glyph labels get a word as their accessible name
  const words: Record<string, string> = { '⏮': 'Previous drawing', '◀': 'Previous frame', '▶': 'Next frame', '⏭': 'Next drawing', 'More ⋯': 'More', '▾ All': 'Expand all', '▸ All': 'Collapse all' };
  if (words[label]) b.textContent = words[label]!;
  decorate(b, hit[0]);
  if (hit[1]) b.classList.add('icon-only');
  return b;
}
