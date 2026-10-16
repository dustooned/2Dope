import type { App } from '../app';
import { autoIcon } from './icons';

export type SheetState = 'peek' | 'half' | 'full';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = '') => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

/**
 * The tracks sheet: a touch-first handle bar on top of the timeline (Draw and Time). Tap the bar
 * to step closed → half → full → closed, drag it to any height, or swipe it down to close. Closed
 * still shows Play and the time, so playback never needs the timeline open. Each workspace
 * remembers its own state. View only: no document changes, history or timing edits.
 */
export class TracksSheet {
  readonly bar = el('div', { class: 'tracks-handle', role: 'toolbar', 'aria-label': 'Tracks' });
  private readonly play: HTMLButtonElement;
  private readonly readout = el('span', { class: 'readout tracks-time', role: 'status' });
  private readonly size: HTMLButtonElement;
  private drag: { id: number; y: number; h: number; t: number; moved: boolean } | null = null;
  private state: SheetState = 'half';
  /** Workspaces that use the sheet (the rest keep the plain splitter). */
  static readonly WORKSPACES = new Set(['draw', 'time']);

  constructor(private readonly app: App, private readonly column: HTMLElement, before: HTMLElement, private readonly onResize: () => void) {
    this.bar.append(el('span', { class: 'tracks-grip', 'aria-hidden': 'true' }));
    const btn = (label: string, title: string, fn: () => void, cls: string) => {
      const b = el('button', { type: 'button', title, class: cls }, label) as HTMLButtonElement;
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      return autoIcon(b);
    };
    this.play = btn('Play', 'Play / pause (Enter)', () => app.togglePlay(), 'play');
    this.size = btn('Tracks', 'Tracks: closed, half or full height', () => this.step(), 'tracks-size');
    this.readout.addEventListener('click', (e) => { e.stopPropagation(); app.cycleTimeFormat(); });
    this.readout.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.bar.append(this.play, this.readout, el('span', { class: 'spacer' }), this.size);
    column.insertBefore(this.bar, before);
    this.bindDrag();
  }

  get active(): boolean {
    return TracksSheet.WORKSPACES.has(this.app.workspace);
  }

  private key(): string {
    return `2dope.sheet.${this.app.workspace}`;
  }

  /** Re-read the remembered state for the current workspace (call on workspace change). */
  restore(): void {
    let s: SheetState = 'half';
    try {
      const v = localStorage.getItem(this.key());
      if (v === 'peek' || v === 'half' || v === 'full') s = v;
    } catch { /* default */ }
    this.set(s, false);
  }

  /** Tap: closed → half → full → closed. */
  step(): void {
    this.set(this.state === 'peek' ? 'half' : this.state === 'half' ? 'full' : 'peek');
  }

  /** Open or close (the Timeline button and two-finger shortcuts use this). */
  toggle(): void {
    this.set(this.state === 'peek' ? 'half' : 'peek');
  }

  get current(): SheetState {
    return this.state;
  }

  set(s: SheetState, remember = true): void {
    this.state = s;
    const on = this.active;
    document.body.classList.toggle('sheet-peek', on && s === 'peek');
    document.body.classList.toggle('sheet-full', on && s === 'full');
    if (on && s === 'full') document.body.style.setProperty('--track-h', `${Math.round(this.column.clientHeight * 0.7)}px`);
    else if (on && s === 'half') this.restoreHalf();
    this.size.setAttribute('aria-expanded', String(s !== 'peek'));
    this.size.dataset.state = s;
    this.size.title = s === 'peek' ? 'Open the tracks' : s === 'half' ? 'Tracks to full height' : 'Close the tracks';
    if (remember && on) {
      try { localStorage.setItem(this.key(), s); } catch { /* optional */ }
    }
    if (on && s !== 'peek') setTimeout(() => this.fitCanvas(), 0);
    this.onResize();
  }

  /**
   * Keep enough canvas: full leaves it about 30% of the column, half at least 55%. Measured after
   * layout, so the strip buttons and audio lane are counted whatever their size.
   */
  private fitCanvas(): void {
    const stage = document.getElementById('stage');
    const track = this.column.querySelector<HTMLElement>('.strip-track');
    if (!stage || !track || this.state === 'peek' || !this.active) return;
    const col = this.column.clientHeight;
    if (col < 300) return;
    const stageH = stage.getBoundingClientRect().height;
    const trackH = track.getBoundingClientRect().height;
    const want = this.state === 'full' ? Math.max(160, col * 0.3) : Math.max(220, col * 0.55);
    if (this.state === 'half' && stageH >= want) return;
    const h = Math.max(60, Math.round(trackH + stageH - want));
    document.body.style.setProperty('--track-h', `${h}px`);
    this.onResize();
  }

  /** Playhead readout and play state, cheap enough for every frame change. */
  update(): void {
    this.bar.hidden = !this.active || this.app.uiHidden;
    this.readout.textContent = `${this.app.fmt(this.app.frame)} / ${this.app.fmtDur(this.app.compEnd)}`;
    this.play.setAttribute('aria-pressed', String(this.app.playing));
    this.play.title = this.app.playing ? 'Pause (Enter)' : 'Play (Enter)';
  }

  private fullHeight(): number {
    // leave the canvas about 240 px (the handle and strip buttons take the rest)
    return Math.max(160, this.column.clientHeight - 340);
  }

  private restoreHalf(): void {
    let h = 112;
    try {
      const n = Number(localStorage.getItem('2dope.m3.--track-h'));
      if (n >= 60) h = n;
    } catch { /* default */ }
    document.body.style.setProperty('--track-h', `${h}px`);
  }

  private bindDrag(): void {
    const bar = this.bar;
    bar.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      e.preventDefault();
      try { bar.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      const cur = parseFloat(getComputedStyle(document.body).getPropertyValue('--track-h')) || 112;
      this.drag = { id: e.pointerId, y: e.clientY, h: this.state === 'peek' ? 0 : cur, t: e.timeStamp, moved: false };
      bar.classList.add('active');
    });
    bar.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dy) < 8) return;
      d.moved = true;
      const h = d.h - dy;
      // live resize; below 50 px the tracks close on release
      document.body.classList.toggle('sheet-peek', h < 50);
      document.body.classList.toggle('sheet-full', h > this.fullHeight() * 0.85);
      if (h >= 50) document.body.style.setProperty('--track-h', `${Math.round(Math.min(h, this.fullHeight()))}px`);
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      bar.classList.remove('active');
      if (cancelled) return this.set(this.state, false);
      if (!d.moved) return this.step();
      const dy = e.clientY - d.y;
      const speed = dy / Math.max(1, e.timeStamp - d.t);
      const h = d.h - dy;
      // a quick swipe down closes, a quick swipe up opens fully
      if (speed > 0.6 || h < 50) return this.set('peek');
      if (speed < -0.6 || h > this.fullHeight() * 0.85) return this.set('full');
      try { localStorage.setItem('2dope.m3.--track-h', String(Math.round(h))); } catch { /* optional */ }
      this.set('half');
    };
    bar.addEventListener('pointerup', (e) => end(e, false));
    bar.addEventListener('pointercancel', (e) => end(e, true));
  }
}
