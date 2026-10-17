import type { App } from '../app';
import { decorate } from './icons';

const KEY = '2dope.flip.on';
const NUDGED = '2dope.flip.nudged';
/** After this many drawings, invite the student to time them on the timeline. */
const NUDGE_AT = 6;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

/**
 * Flip: the first step for new animators. A big canvas, brush / eraser / colour, and a row of
 * little drawing bubbles at the bottom: one per drawing, in order, with a + for a fresh page. No
 * holds, ruler or tracks: just draw the next frame. Play loops it. After a few drawings a nudge
 * offers the timeline (Animate) for timing. View only: it edits nothing the other modes do not.
 */
export class FlipMode {
  readonly row = el('div', { class: 'flip-row', role: 'toolbar', 'aria-label': 'Drawings' });
  private readonly nudge = el('div', { class: 'flip-nudge', role: 'status', hidden: '' });
  on = false;
  private sig = '';
  onChange: () => void = () => {};

  constructor(private readonly app: App, stage: HTMLElement, private readonly openTimeline: () => void) {
    stage.append(this.row, this.nudge);
    try { this.on = localStorage.getItem(KEY) === '1'; } catch { /* default */ }
    this.apply();
  }

  set(on: boolean): void {
    this.on = on;
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* optional */ }
    if (on) {
      if (this.app.workspace !== 'draw') this.app.setWorkspace('draw');
      if (this.app.tool !== 'brush' && this.app.tool !== 'eraser') this.app.setTool('brush');
      // seeing the last drawing faintly is what makes drawing the next one easy
      if (!this.app.onion.enabled) this.app.toggleOnion();
    }
    this.apply();
    this.onChange();
  }

  private apply(): void {
    document.body.classList.toggle('flipmode', this.on);
    this.sig = '';
    this.update();
  }

  update(): void {
    const app = this.app;
    const active = this.on && app.workspace === 'draw' && !app.uiHidden;
    this.row.hidden = !active;
    if (!active) { this.nudge.hidden = true; return; }
    const p = app.project;
    const ex = p.exposures;
    let at = 0, cur = -1;
    const lf = app.lf;
    for (let i = 0; i < ex.length; i++) { if (lf >= at && lf < at + ex[i]!.length) cur = i; at += ex[i]!.length; }
    if (app.blankPage) cur = -1;
    const sig = `${p.layer.id}|${cur}|${app.blankPage}|${app.playing}|` + ex.map((e) => `${e.drawing}:${p.drawing(e.drawing).thumbRev}`).join(',');
    if (sig === this.sig) return;
    this.sig = sig;

    this.row.replaceChildren();
    const play = el('button', { type: 'button', class: 'flip-btn', title: app.playing ? 'Pause' : 'Play your drawings', 'aria-label': app.playing ? 'Pause' : 'Play' }, app.playing ? 'Pause' : 'Play');
    decorate(play, app.playing ? 'pause' : 'play');
    play.addEventListener('click', () => app.togglePlay());
    const list = el('div', { class: 'flip-list' });
    let start = 0;
    ex.forEach((e, i) => {
      const d = p.drawing(e.drawing);
      const b = el('button', { type: 'button', class: `flip-cel${i === cur ? ' on' : ''}`, title: `Drawing ${i + 1}`, 'aria-label': `Drawing ${i + 1}`, 'aria-pressed': String(i === cur) });
      const c = el('canvas', { width: '96', height: '72' });
      const g = c.getContext('2d');
      if (g) {
        g.fillStyle = '#fff'; g.fillRect(0, 0, 96, 72);
        if (d.thumb) { const s = Math.min(96 / d.thumb.width, 72 / d.thumb.height); g.drawImage(d.thumb, (96 - d.thumb.width * s) / 2, (72 - d.thumb.height * s) / 2, d.thumb.width * s, d.thumb.height * s); }
      }
      b.append(c, el('span', { class: 'flip-num' }, String(i + 1)));
      const f = start;
      b.addEventListener('click', () => { if (app.playing) app.togglePlay(); app.setLayerFrame(f); });
      list.append(b);
      start += e.length;
    });
    const add = el('button', { type: 'button', class: `flip-cel flip-add${app.blankPage ? ' on' : ''}`, title: 'A fresh page for the next drawing', 'aria-label': 'New page' }, '+');
    add.addEventListener('click', () => app.flipToBlank());
    list.append(add);
    const fit = el('button', { type: 'button', class: 'flip-btn flip-fit', title: 'Fit the page to the screen', 'aria-label': 'Fit to screen' }, '⤢');
    fit.addEventListener('click', () => app.fit());
    this.row.append(play, list, fit);
    // keep the current bubble in view
    setTimeout(() => (list.querySelector('.on') as HTMLElement | null)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }), 0);

    let nudged = false;
    try { nudged = localStorage.getItem(NUDGED) === '1'; } catch { /* show */ }
    if (!nudged && ex.length >= NUDGE_AT && !app.playing) {
      this.nudge.replaceChildren(el('span', {}, `${ex.length} drawings! Ready to time them?`));
      const go = el('button', { type: 'button', class: 'bub-chip on' }, 'Open the timeline');
      go.addEventListener('click', () => { this.dismiss(); this.set(false); this.openTimeline(); });
      const x = el('button', { type: 'button', class: 'bub-chip', 'aria-label': 'Not now' }, 'Not now');
      x.addEventListener('click', () => this.dismiss());
      this.nudge.append(go, x);
      this.nudge.hidden = false;
    } else this.nudge.hidden = true;
  }

  private dismiss(): void {
    try { localStorage.setItem(NUDGED, '1'); } catch { /* fine */ }
    this.nudge.hidden = true;
  }
}
