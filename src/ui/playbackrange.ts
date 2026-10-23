import type { App } from '../app';
import { decorate, setLabel } from './icons';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) e.setAttribute(key, value);
  e.textContent = text; return e;
};

/** The same range control follows the shared clock in Flipbook, Clips/Timing and Motion. */
export class PlaybackRangeControl {
  readonly button = el('button', { type: 'button', class: 'playback-range-button', 'aria-haspopup': 'dialog' }, 'Range');
  private dismiss: (() => void) | null = null;
  private owner: { project: App['project']; comp: App['project']['comp']; workspace: App['workspace']; length: number } | null = null;

  constructor(private readonly app: App) {
    decorate(this.button, 'range');
    this.button.addEventListener('click', () => this.open()); this.update();
  }

  update(): void {
    const app = this.app, range = app.playbackRange, custom = !!app.project.comp.playbackRange;
    setLabel(this.button, custom ? `Range ${range.start + 1}–${range.end}` : 'Range');
    this.button.setAttribute('aria-label', custom ? `Playback range: frames ${range.start + 1} to ${range.end}` : 'Playback range: whole animation');
    this.button.title = custom ? `Loop frames ${range.start + 1}–${range.end}. Change playback range.` : 'Loop part of the animation';
    this.button.dataset.active = String(custom); this.button.disabled = app.strokeActive;
    const o = this.owner;
    if (o && (o.project !== app.project || o.comp !== app.project.comp || o.workspace !== app.workspace || o.length !== app.compEnd)) this.dismiss?.();
  }

  private open(): void {
    const app = this.app;
    if (app.strokeActive || this.dismiss) return;
    if (app.playing) app.togglePlay();
    const project = app.project, comp = project.comp, length = app.compEnd, workspace = app.workspace;
    this.owner = { project, comp, length, workspace };
    const dialog = el('dialog', { class: 'small playback-range-dialog', 'aria-label': 'Playback range' });
    const form = el('form'), body = el('div', { class: 'dbody' }), foot = el('div', { class: 'vfoot' });
    const description = el('p', {}, 'Loop a section while you work. Start and end frames are included. Your animation and exports keep their full length.');
    const gestureTip = el('p', { class: 'menu-note' }, app.rangeGestureEnabled ? 'Gesture: hold the ruler, then drag.' : 'Optional gesture in App settings → Gestures.');
    const fields = el('div', { class: 'playback-range-fields' });
    const range = app.playbackRange;
    const input = (label: string, value: number) => {
      const field = el('label', { class: 'playback-range-field' }, label);
      const number = el('input', { type: 'number', min: '1', max: String(Math.min(length, 1_000_000)), step: '1', required: '', value: String(value), 'aria-label': `${label} frame` });
      const current = el('button', { type: 'button', 'aria-label': `Set ${label.toLowerCase()} to current frame` }, 'Use current');
      current.addEventListener('click', () => { number.value = String(Math.min(length, Math.max(1, app.frame + 1))); validate(); number.focus(); });
      field.append(number, current); fields.append(field); return number;
    };
    const start = input('Start', range.start + 1), end = input('End', range.end);
    const error = el('p', { class: 'playback-range-error', 'aria-live': 'polite' });
    const whole = el('button', { type: 'button' }, 'Whole animation');
    const cancel = el('button', { type: 'button' }, 'Cancel');
    const apply = el('button', { type: 'submit', class: 'primary' }, 'Apply');
    const validOwner = () => app.project === project && app.project.comp === comp && app.workspace === workspace && app.compEnd === length;
    const close = () => {
      this.dismiss = null; this.owner = null;
      if (dialog.open) dialog.close(); dialog.remove();
      if (this.button.isConnected && this.button.getClientRects().length) this.button.focus({ preventScroll: true });
      else app.focusCanvas();
    };
    this.dismiss = close;
    const validate = () => {
      const a = start.valueAsNumber, b = end.valueAsNumber;
      const ok = start.validity.valid && end.validity.valid && a <= b;
      error.textContent = ok ? '' : `Use whole frames from 1 to ${length}, with End at or after Start.`;
      apply.disabled = !ok; return ok;
    };
    start.addEventListener('input', validate); end.addEventListener('input', validate);
    cancel.addEventListener('click', close);
    whole.addEventListener('click', () => { if (validOwner()) app.setPlaybackRange(null); close(); });
    form.addEventListener('submit', e => {
      e.preventDefault(); if (!validOwner()) { close(); return; }
      if (validate() && app.setPlaybackRange({ start: start.valueAsNumber - 1, end: end.valueAsNumber })) close();
    });
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(); });
    dialog.addEventListener('close', () => { if (this.dismiss === close) close(); });
    // Native form controls own Enter; all dialog keys stay out of canvas shortcuts.
    dialog.addEventListener('keydown', e => e.stopPropagation());
    dialog.addEventListener('keyup', e => e.stopPropagation());
    body.append(description, fields, error, gestureTip); foot.append(whole, cancel, apply);
    form.append(body, foot); dialog.append(el('h2', {}, 'Playback range'), form);
    document.body.append(dialog); dialog.showModal(); start.focus(); start.select(); validate();
  }
}

/** A non-interactive ruler band; all edits stay in the accessible range dialog. */
export function markPlaybackRange(app: App, parent: HTMLElement, cell: number, origin = 0, offset = 0): void {
  let band = parent.querySelector<HTMLElement>(':scope > .playback-range-band:not(.playback-range-preview)');
  if (!app.project.comp.playbackRange) { band?.remove(); return; }
  if (!band) { band = el('div', { class: 'playback-range-band', 'aria-hidden': 'true' }); parent.append(band); }
  const range = app.playbackRange, start = Math.max(range.start, origin);
  band.hidden = start >= range.end;
  band.style.left = `${offset + (start - origin) * cell}px`;
  band.style.width = `${Math.max(0, range.end - start) * cell}px`;
}
