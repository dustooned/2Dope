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
  // Play, the list and Fit stay the same elements while playing (only the list's bubbles are
  // rebuilt, and only when the drawings change), so a tap on Pause is never lost to a rebuild.
  private readonly play = el('button', { type: 'button', class: 'flip-btn' }, 'Play');
  private readonly list = el('div', { class: 'flip-list' });
  private readonly fit = el('button', { type: 'button', class: 'flip-btn flip-fit', title: 'Fit the page to the screen', 'aria-label': 'Fit to screen' }, '\u2922');
  private playing: boolean | null = null;
  private nudgeCount = -1;

  constructor(private readonly app: App, stage: HTMLElement, private readonly openTimeline: () => void) {
    this.play.addEventListener('click', () => this.app.togglePlay());
    this.fit.addEventListener('click', () => this.app.fit());
    this.row.append(this.play, this.list, this.fit);
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
    // every linked art layer of these cels, drawn back to front into each bubble
    const stack = [...app.celLayers].reverse();
    if (!stack.length) stack.push(p.layer as never);
    if (this.playing !== app.playing) {
      this.playing = app.playing;
      this.play.textContent = app.playing ? 'Pause' : 'Play';
      decorate(this.play, app.playing ? 'pause' : 'play');
      this.play.title = app.playing ? 'Pause' : 'Play your drawings';
      this.play.setAttribute('aria-label', this.play.title);
      this.play.setAttribute('aria-pressed', String(app.playing));
    }
    // the current bubble moves every frame while playing: only its highlight changes
    const mark = () => {
      const cels = this.list.querySelectorAll<HTMLElement>('.flip-cel');
      cels.forEach((b, i) => {
        const on = i === cels.length - 1 ? app.blankPage : i === cur;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      if (!app.playing) (this.list.querySelector('.on') as HTMLElement | null)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    const sig = `${p.layer.id}|` + stack.map((l) => l.exposures.map((e) => `${e.drawing}:${p.drawing(e.drawing).thumbRev}`).join(',')).join('/');
    if (sig === this.sig) {
      mark();
      this.nudgeCheck(ex.length);
      return;
    }
    this.sig = sig;

    const list = this.list;
    list.replaceChildren();
    let start = 0;
    ex.forEach((e, i) => {
      const b = el('button', { type: 'button', class: 'flip-cel', title: `Drawing ${i + 1}`, 'aria-label': `Drawing ${i + 1}` });
      const c = el('canvas', { width: '96', height: '72' });
      const g = c.getContext('2d');
      if (g) {
        g.fillStyle = '#fff'; g.fillRect(0, 0, 96, 72);
        for (const l of stack) {
          const le = l.exposures[i];
          const t = le ? p.drawing(le.drawing).thumb : null;
          if (!t) continue;
          const s = Math.min(96 / t.width, 72 / t.height);
          g.drawImage(t, (96 - t.width * s) / 2, (72 - t.height * s) / 2, t.width * s, t.height * s);
        }
      }
      b.append(c, el('span', { class: 'flip-num' }, String(i + 1)));
      const f = start;
      b.addEventListener('click', () => { if (app.playing) app.togglePlay(); app.setLayerFrame(f); });
      list.append(b);
      start += e.length;
    });
    const add = el('button', { type: 'button', class: 'flip-cel flip-add', title: 'A fresh page for the next drawing', 'aria-label': 'New page' }, '+');
    add.addEventListener('click', () => app.flipToBlank());
    list.append(add);
    setTimeout(mark, 0);
    this.nudgeCheck(ex.length);
  }

  private nudgeCheck(count: number): void {
    const app = this.app;
    const ex = { length: count };
    let nudged = false;
    try { nudged = localStorage.getItem(NUDGED) === '1'; } catch { /* show */ }
    if (!nudged && ex.length >= NUDGE_AT && !app.playing) {
      // rebuild only when the count changes, so its buttons are never swapped under a tap
      if (!this.nudge.hidden && this.nudgeCount === count) return;
      this.nudgeCount = count;
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
