/**
 * Pictures for the manual: small line drawings in the app's own style (current text colour, the
 * accent for what matters), so they read in the dark app and on paper. Gesture glyphs sit next to
 * table rows like the tool icons do.
 */

const A = 'var(--accent)';
const M = 'var(--muted)';

function svg(w: number, h: number, body: string, label: string): string {
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w * 1.6}px" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${label}">${body}</svg>`;
}

const txt = (x: number, y: number, s: string, fill = 'currentColor', anchor = 'middle') =>
  `<text x="${x}" y="${y}" fill="${fill}" stroke="none" font-size="9" font-family="system-ui, sans-serif" text-anchor="${anchor}">${s}</text>`;
const finger = (x: number, y: number, fill = 'none') => `<circle cx="${x}" cy="${y}" r="3.2" fill="${fill}"/>`;

/** Small glyphs for gesture rows (24 × 24, like the icons). */
export const GLYPHS: Record<string, string> = {
  pinch: `${finger(7, 7)}${finger(17, 17)}<path d="M9.5 9.5l2 2M14.5 14.5l-2-2"/><path d="M4 12a8 8 0 018-8" stroke="${A}"/>`,
  tap2: `${finger(9, 12, A)}${finger(15, 12, A)}`,
  tap3: `${finger(6, 12, A)}${finger(12, 10, A)}${finger(18, 12, A)}`,
  tap4: `${finger(4, 13, A)}${finger(9, 10, A)}${finger(15, 10, A)}${finger(20, 13, A)}`,
  hold: `${finger(12, 14, A)}<circle cx="12" cy="14" r="7" stroke-dasharray="2 2"/>`,
  shape: `<path d="M5 16c-1-6 4-10 8-9s6 6 3 9-8 3-10 1" stroke="${M}"/><circle cx="12" cy="12" r="6.5" stroke="${A}"/>`,
  scrub3: `${finger(6, 9, A)}${finger(12, 7, A)}${finger(18, 9, A)}<path d="M4 17l4-3 4 3 4-3 4 3"/>`,
  scrub: `<path d="M4 12h16M7 9l-3 3 3 3M17 9l3 3-3 3"/>${finger(12, 12, A)}`,
};

export function glyphSvg(name: string): string {
  const g = GLYPHS[name];
  return g ? `<svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">${g}</svg>` : '';
}

/** Larger pictures for sections. */
export const FIGURES: Record<string, () => string> = {
  // the five modes, left to right
  workspaces: () =>
    svg(
      320,
      70,
      ['Story', 'Draw', 'Timing', 'Motion', 'Share']
        .map((n, i) => {
          const x = 6 + i * 63;
          return `<rect x="${x}" y="12" width="52" height="36" rx="6" ${i === 1 ? `stroke="${A}"` : ''}/>${txt(x + 26, 34, n)}${i < 4 ? `<path d="M${x + 54} 30h7M${x + 58} 27l3 3-3 3" stroke="${M}"/>` : ''}`;
        })
        .join('') + txt(160, 64, 'plan → draw → time → put together → share', M),
      'The five modes: Story, Draw, Timing, Motion, Share',
    ),
  // a rough stroke held still snaps to a clean shape, then the end is dragged
  quickshape: () =>
    svg(
      320,
      90,
      `<path d="M30 60c-6-22 10-38 30-36s30 18 22 34-34 20-50 6" stroke="${M}"/>${txt(55, 84, '1 draw roughly', M)}
       <circle cx="82" cy="58" r="3" fill="${A}" stroke="none"/><circle cx="82" cy="58" r="8" stroke="${A}" stroke-dasharray="2 2"/>
       <path d="M108 45h18M121 41l5 4-5 4" stroke="${M}"/>
       <ellipse cx="170" cy="45" rx="28" ry="22" stroke="${A}" stroke-width="2.2"/>${txt(170, 84, '2 hold still: it snaps', M)}
       <path d="M210 45h18M223 41l5 4-5 4" stroke="${M}"/>
       <ellipse cx="270" cy="45" rx="40" ry="22" stroke="${A}" stroke-width="2.2"/><circle cx="230" cy="45" r="3" fill="currentColor" stroke="none"/><circle cx="310" cy="45" r="3" fill="${A}" stroke="none"/>${txt(270, 84, '3 drag: start stays put', M)}`,
      'QuickShape: draw roughly, hold still to snap, then drag the other end',
    ),
  // Line and Fill parts stacked
  linefill: () =>
    svg(
      320,
      96,
      `<g transform="translate(20 18) skewX(-20)"><rect x="20" y="0" width="90" height="34" rx="4" stroke="${M}"/><path d="M40 26c6-16 26-18 34-6 6 8 18 6 22-2" stroke="currentColor" stroke-width="2.4"/></g>${txt(150, 32, 'Line: your ink, on top', 'currentColor', 'start')}
       <g transform="translate(20 52) skewX(-20)"><rect x="20" y="0" width="90" height="34" rx="4" stroke="${M}"/><path d="M42 24c6-12 24-14 32-4 6 6 16 4 20-2v10H42z" fill="${A}" fill-opacity="0.45" stroke="none"/></g>${txt(150, 72, 'Fill: colour, always under the ink', 'currentColor', 'start')}`,
      'Every drawing has a Line part above a Fill part',
    ),
  // onion skin: previous and next drawings faintly around the current one
  onion: () =>
    svg(
      320,
      80,
      `<path d="M60 60c10-30 30-34 40-10" stroke="#e05555" stroke-opacity="0.45"/><path d="M90 60c10-30 30-34 40-10" stroke="currentColor" stroke-width="2.4"/><path d="M120 60c10-30 30-34 40-10" stroke="#4aa3e0" stroke-opacity="0.45"/>
       ${txt(80, 76, 'before', '#e05555')}${txt(110, 76, 'now')}${txt(145, 76, 'after', '#4aa3e0')}
       ${txt(190, 40, 'Onion skin shows the drawings', M, 'start')}${txt(190, 52, 'around this one, faintly.', M, 'start')}`,
      'Onion skin: the drawings before and after show faintly',
    ),
  // a frame bar: drawings with holds, an edge being dragged
  holds: () =>
    svg(
      320,
      70,
      `<rect x="10" y="20" width="58" height="26" rx="3"/>${txt(39, 37, '1  ×2')}<rect x="72" y="20" width="118" height="26" rx="3" stroke="${A}"/>${txt(131, 37, '2  ×4')}<rect x="194" y="20" width="58" height="26" rx="3"/>${txt(223, 37, '3  ×2')}
       <path d="M190 14v38" stroke="#f0c040" stroke-width="2"/>${txt(190, 10, 'drag the edge: longer hold', '#f0c040')}${txt(160, 64, 'A hold = how many frames a drawing stays on screen', M)}`,
      'The frame bar: each drawing is a block; drag its edge to change its hold',
    ),
  // ripple: lengthening one thing moves everything after it, on every layer
  ripple: () =>
    svg(
      320,
      104,
      `${txt(6, 22, 'Board', M, 'start')}<rect x="50" y="12" width="60" height="16" rx="3"/><rect x="114" y="12" width="40" height="16" rx="3" stroke="${A}"/><rect x="158" y="12" width="60" height="16" rx="3" stroke-dasharray="3 2"/><rect x="178" y="12" width="60" height="16" rx="3"/>
       ${txt(6, 50, 'Animation', M, 'start')}<rect x="50" y="40" width="60" height="16" rx="3"/><rect x="114" y="40" width="60" height="16" rx="3"/><rect x="178" y="40" width="60" height="16" rx="3"/>
       <path d="M154 8v54" stroke="#f0c040" stroke-width="2"/><path d="M160 20h14M170 16l4 4-4 4" stroke="${A}"/>
       <rect x="154" y="6" width="90" height="56" fill="#f0c040" fill-opacity="0.08" stroke="none"/>
       ${txt(160, 84, 'Panel 2 gets longer → everything after it moves along,', M)}${txt(160, 96, 'on every layer (Ripple on).', M)}`,
      'Ripple: making one panel longer moves everything after it on every layer',
    ),
  // a storyboard card
  board: () =>
    svg(
      320,
      110,
      `<rect x="10" y="6" width="130" height="98" rx="6"/>${txt(22, 20, '2', 'currentColor', 'start')}<rect x="34" y="11" width="28" height="12" rx="2" stroke="${M}"/>${txt(48, 20, '24', M)}
       <rect x="18" y="28" width="114" height="40" rx="2" stroke="${M}"/><path d="M40 60c8-18 22-20 30-8s20 6 26-6" stroke="currentColor"/>
       <path d="M18 76h80M18 84h60M18 92h70M18 100h40" stroke="${M}"/>
       ${txt(150, 20, '← panel number and length (frames)', M, 'start')}${txt(150, 50, '← the picture: draw it above', M, 'start')}${txt(150, 76, '← dialogue lines: who · what is said', M, 'start')}${txt(150, 88, '   then action, shot, camera, timing, notes', M, 'start')}${txt(150, 100, '   (Return = next line, then next panel)', M, 'start')}`,
      'A storyboard card: number, length, picture and captions',
    ),
  // Motion: a layer box with handles and keyframes on its bar
  motion: () =>
    svg(
      320,
      104,
      `<rect x="20" y="10" width="80" height="56" stroke="${A}" stroke-dasharray="4 3"/>${[
        [20, 10],
        [100, 10],
        [20, 66],
        [100, 66],
      ]
        .map(([x, y]) => `<rect x="${x! - 3}" y="${y! - 3}" width="6" height="6" fill="${A}" stroke="none"/>`)
        .join('')}<circle cx="60" cy="0" r="0"/><path d="M40 56c6-20 22-24 30-10s14 6 16-4" stroke="currentColor" stroke-width="2"/>
       ${txt(60, 82, 'drag, scale, turn', M)}
       <rect x="130" y="30" width="170" height="16" rx="3"/>${[150, 210, 270].map((x) => `<path d="M${x} 32l6 6-6 6-6-6z" fill="${A}" stroke="none"/>`).join('')}
       ${txt(215, 22, 'a layer’s bar with keyframes', M)}${txt(215, 64, 'change a value on another frame:', M)}${txt(215, 76, 'a key is made, it moves in between', M)}`,
      'Motion: a layer with its handles, and its bar with keyframes',
    ),
};
