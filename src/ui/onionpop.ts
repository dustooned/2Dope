import type { App } from '../app';
import { HOLD_MS, swallowNextClick } from './contextmenu';
import { el } from './dom';

/**
 * Onion skin settings, one press-and-hold away: tap an Onion button to switch onion skin on or off
 * as before; hold it (or right-click) for how many drawings before and after it shows, how strong,
 * colours and keys only. Device settings (App.onion), never document History.
 */

let pop: HTMLElement | null = null;
let opener: HTMLElement | null = null;

function close(focusOpener: boolean): void {
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  opener?.setAttribute('aria-expanded', 'false');
  if (focusOpener) opener?.focus();
}

function render(app: App): void {
  const p = pop!;
  const o = app.onion;
  const max = app.device.limits.onionMax;
  const changed = () => { app.onionChanged(); render(app); };
  p.replaceChildren(el('strong', {}, 'Onion skin'));
  const sw = (label: string, title: string, on: boolean, flip: () => void, key: string) => {
    const b = el('button', { type: 'button', role: 'switch', 'aria-checked': String(on), title, 'data-onion': key });
    b.append(el('span', { class: 'onion-pop-name' }, label), el('span', { class: 'onion-pop-state' }, on ? 'On' : 'Off'));
    b.addEventListener('click', () => { flip(); changed(); p.querySelector<HTMLElement>(`[data-onion="${key}"]`)?.focus(); });
    p.append(b);
  };
  const count = (label: string, title: string, get: () => number, set: (n: number) => void, key: string) => {
    const row = el('div', { class: 'onion-pop-row', role: 'group', 'aria-label': title });
    const n = get();
    const less = el('button', { type: 'button', 'aria-label': `${label}: fewer`, 'data-onion': `${key}-` }, '−');
    const more = el('button', { type: 'button', 'aria-label': `${label}: more`, 'data-onion': `${key}+` }, '+');
    less.disabled = n <= 0; more.disabled = n >= max;
    less.addEventListener('click', () => { set(Math.max(0, get() - 1)); changed(); p.querySelector<HTMLElement>(`[data-onion="${key}-"]`)?.focus(); });
    more.addEventListener('click', () => { set(Math.min(max, get() + 1)); changed(); p.querySelector<HTMLElement>(`[data-onion="${key}+"]`)?.focus(); });
    row.append(el('span', { class: 'onion-pop-name', title }, label), less, el('output', { 'aria-live': 'polite' }, String(n)), more);
    p.append(row);
  };
  sw('Show onion skin', 'Tap the Onion button to do the same', o.enabled, () => { o.enabled = !o.enabled; }, 'enabled');
  count('Before', 'Earlier drawings shown (blue)', () => o.before, (n) => { o.before = n; }, 'before');
  count('After', 'Later drawings shown (red)', () => o.after, (n) => { o.after = n; }, 'after');
  const opRow = el('label', { class: 'onion-pop-row' });
  const op = el('input', { type: 'range', min: '0.1', max: '0.9', step: '0.05', 'aria-label': 'Onion opacity' });
  op.value = String(o.opacity);
  const out = el('output', {}, `${Math.round(o.opacity * 100)}%`);
  op.addEventListener('input', () => { o.opacity = Number(op.value); out.textContent = `${Math.round(o.opacity * 100)}%`; app.onionChanged(); });
  opRow.append(el('span', { class: 'onion-pop-name' }, 'Strength'), op, out);
  p.append(opRow);
  sw('Colours', 'Tint earlier drawings blue and later ones red', o.tint, () => { o.tint = !o.tint; }, 'tint');
  sw('Keys only', 'Show only drawings marked as keys', o.keysOnly, () => { o.keysOnly = !o.keysOnly; }, 'keys');
  sw('While playing', 'Keep the ghosts while scrubbing or playing', o.whileScrubbing, () => { o.whileScrubbing = !o.whileScrubbing; }, 'scrub');
  p.append(el('p', { class: 'onion-pop-note' }, 'Tap Onion to switch it on or off; hold it for these settings.'));
}

/** Open the settings next to `anchor` (the Onion button that was held). */
export function openOnionSettings(app: App, anchor: HTMLElement): void {
  if (!pop) {
    pop = el('section', { class: 'onion-pop', role: 'dialog', 'aria-label': 'Onion skin settings', hidden: '' });
    document.body.append(pop);
    window.addEventListener('pointerdown', (e) => {
      if (!pop || pop.hidden || pop.contains(e.target as Node) || opener?.contains(e.target as Node)) return;
      close(false);
    }, true);
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !pop || pop.hidden) return;
      e.preventDefault(); e.stopImmediatePropagation();
      close(true);
    }, true);
  }
  opener = anchor;
  render(app);
  pop.hidden = false;
  anchor.setAttribute('aria-expanded', 'true');
  // beside the button, kept on screen
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  const left = Math.max(8, Math.min(r.left, innerWidth - w - 8));
  const top = r.top - h - 8 >= 8 ? r.top - h - 8 : Math.min(r.bottom + 8, innerHeight - h - 8);
  pop.style.left = `${left}px`;
  pop.style.top = `${Math.max(8, top)}px`;
  pop.querySelector<HTMLButtonElement>('button')?.focus();
}

/** Tap still toggles (the button's own click); press and hold, or right-click, opens the settings. */
export function onionHold(app: App, b: HTMLElement): void {
  let timer = 0;
  b.setAttribute('aria-haspopup', 'dialog');
  if (!/hold/i.test(b.title)) b.title = `${b.title ? `${b.title}. ` : ''}Hold for onion settings`;
  const stop = () => clearTimeout(timer);
  b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    stop();
    timer = window.setTimeout(() => { swallowNextClick(); openOnionSettings(app, b); }, HOLD_MS);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel'] as const) b.addEventListener(ev, stop);
  b.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); stop(); openOnionSettings(app, b); });
}
