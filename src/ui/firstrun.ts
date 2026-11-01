/**
 * The first run: one screen, no tour. Five short tips (what the modes are, drawing, gestures,
 * keyframes, sharing), how much of the interface to show, and how to start: a blank project or
 * one of the samples. Shown once per device, when there are no projects yet; it can be reopened
 * from the gallery.
 */

import { SAMPLES, type SampleId } from '../io/samples';

const DONE_KEY = '2dope.firstrun.done';

export type FirstRunStart = 'blank' | SampleId;
export type FirstRunLevel = 'simple' | 'full';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

export const FIRST_RUN_TIPS: { icon: string; title: string; text: string }[] = [
  { icon: '🎬', title: 'Five modes, one project', text: 'Story plans the shots, Draw paints, Animate draws frames, Timing holds them, Motion moves layers. Switch at the top; everything stays in one project.' },
  { icon: '✏️', title: 'Draw', text: 'Pick a brush and draw with a pen, a mouse or a finger. Ink and Colour are separate, so you can colour under your lines.' },
  { icon: '🤏', title: 'Gestures', text: 'Two fingers pinch, move and turn the page. Tap with two fingers to undo, three to redo.' },
  { icon: '🔑', title: 'Keyframes', text: 'In Motion, move or turn a layer at two different frames and 2Dope fills in between. Easing makes it start or stop gently.' },
  { icon: '📤', title: 'Share', text: 'Share makes a video, a GIF, pictures or a project file. Your work also saves itself on this device as you go.' },
];

/** Whether the first-run screen still has to show on this device. */
export function firstRunPending(): boolean {
  try { return localStorage.getItem(DONE_KEY) !== '1'; } catch { return false; }
}

function markDone(): void {
  try { localStorage.setItem(DONE_KEY, '1'); } catch { /* optional */ }
}

/**
 * Show the first-run screen. Resolves with how to start and the interface chosen (the caller
 * applies them). Escape or closing it means a blank project with the current interface.
 */
export function showFirstRun(level: FirstRunLevel): Promise<{ start: FirstRunStart; level: FirstRunLevel }> {
  return new Promise((resolve) => {
    const dialog = el('dialog', { class: 'firstrun', 'aria-label': 'Welcome to 2Dope' });
    let chosen = level, answered = false;
    const done = (start: FirstRunStart) => {
      if (answered) return;
      answered = true;
      markDone();
      resolve({ start, level: chosen });
      if (dialog.open) dialog.close();
      dialog.remove();
    };
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); done('blank'); });
    dialog.append(el('h2', {}, 'Welcome to 2Dope'));
    const tips = el('ul', { class: 'fr-tips' });
    for (const t of FIRST_RUN_TIPS) {
      const li = el('li', {});
      li.append(el('span', { class: 'fr-ico', 'aria-hidden': 'true' }, t.icon), el('strong', {}, t.title), el('span', {}, t.text));
      tips.append(li);
    }
    dialog.append(tips);
    const lv = el('div', { class: 'fr-row' });
    lv.append(el('span', { class: 'name' }, 'Interface'));
    const seg = el('div', { class: 'fx-seg', role: 'group', 'aria-label': 'Interface' });
    const options: [FirstRunLevel, string, string][] = [['simple', 'Simple', 'The essentials, big buttons: best on a tablet or phone'], ['full', 'Full', 'Every tool and setting: best on a computer']];
    const buttons = options.map(([id, label, title]) => {
      const b = el('button', { type: 'button', title, 'aria-pressed': String(id === chosen) }, label);
      b.addEventListener('click', () => { chosen = id; for (const x of buttons) x.setAttribute('aria-pressed', String(x === b)); });
      seg.append(b);
      return b;
    });
    lv.append(seg, el('span', { class: 'hint' }, 'Change it any time with the ◐ interface button.'));
    dialog.append(lv);
    dialog.append(el('h3', {}, 'Start with'));
    const starts = el('div', { class: 'fr-starts' });
    const start = (id: FirstRunStart, label: string, hint: string, primary = false) => {
      const b = el('button', { type: 'button', class: primary ? 'primary' : '' });
      b.append(el('strong', {}, label), el('span', { class: 'hint' }, hint));
      b.addEventListener('click', () => done(id));
      starts.append(b);
    };
    start('blank', 'A blank project', 'Choose its size and frame rate next', true);
    for (const s of SAMPLES) start(s.id, `Sample: ${s.name}`, s.hint);
    dialog.append(starts);
    document.body.append(dialog);
    dialog.showModal();
    (starts.querySelector('button') as HTMLButtonElement | null)?.focus();
  });
}
