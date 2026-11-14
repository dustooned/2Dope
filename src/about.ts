/**
 * Who made 2Dope, shown in the manual's About section and on the projects screen. One place, so
 * every mention says the same thing. Every "Long Beach City College" links to the college's
 * Digital Media Arts program page.
 */
export const LBCC_NAME = 'Long Beach City College';
export const LBCC_URL = 'https://www.lbcc.edu/digitalmedia';

export const ABOUT_CREDIT = `Designed, programmed and developed by Professor T at ${LBCC_NAME}`;

export const ABOUT_TEXT: readonly string[] = [
  `2Dope was designed, programmed and developed by Professor T at ${LBCC_NAME}.`,
  'It is tested and updated regularly so that students have open access to creative software: drawing, animation, storyboarding, motion and sound in the browser, with nothing to install or buy.',
  'Your projects stay on your own device. Use Share and Download to keep copies or hand in work.',
];

/** A link to LBCC Digital Media Arts, opening in a new tab. */
export function lbccLink(className = ''): HTMLAnchorElement {
  const a = document.createElement('a');
  a.href = LBCC_URL; a.target = '_blank'; a.rel = 'noopener noreferrer';
  a.textContent = LBCC_NAME; a.title = 'Digital Media Arts at Long Beach City College (opens in a new tab)';
  if (className) a.className = className;
  return a;
}

/** Text with every mention of the college as a link. */
export function withLbccLinks(text: string): (string | HTMLAnchorElement)[] {
  const parts = text.split(LBCC_NAME), out: (string | HTMLAnchorElement)[] = [];
  parts.forEach((p, i) => { if (p) out.push(p); if (i < parts.length - 1) out.push(lbccLink()); });
  return out;
}
