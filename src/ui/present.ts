import type { App } from '../app';
import { locate } from '../core/timeline';
import { decorate } from './icons';
import { el } from './dom';

/**
 * Story → Present: the board full screen for pitching to the class. Panels play at their timing on
 * the shared clock (the live dialogue subtitle shows underneath, with the panel's action below it).
 * Tap the picture to play or pause, swipe or ← → for the previous / next panel, Escape or Done to
 * leave. Viewing only: it never draws on the board or changes the project.
 */

const SWIPE = 50;

export class StoryPresent {
  private readonly layer = el('div', { class: 'present-layer', role: 'region', 'aria-label': 'Present: tap to play or pause, swipe for the next panel' });
  private readonly bar = el('div', { class: 'present-bar' });
  private readonly count = el('span', { class: 'present-count', 'aria-live': 'polite' });
  private readonly action = el('p', { class: 'present-action' });
  private readonly done = el('button', { type: 'button', class: 'present-done', title: 'Stop presenting (Escape)' }, 'Done');
  private readonly playBtn = el('button', { type: 'button', class: 'present-play', title: 'Play or pause (Space)' }, 'Play');
  private sig = '';
  active = false;

  constructor(private readonly app: App, stage: HTMLElement, private readonly fit: () => void) {
    decorate(this.done, 'close');
    decorate(this.playBtn, 'play');
    const prev = el('button', { type: 'button', title: 'Previous panel (←)' }, 'Previous panel');
    const next = el('button', { type: 'button', title: 'Next panel (→)' }, 'Next panel');
    decorate(prev, 'prev');
    decorate(next, 'next');
    prev.classList.add('icon-only');
    next.classList.add('icon-only');
    prev.addEventListener('click', () => this.step(-1));
    next.addEventListener('click', () => this.step(1));
    this.playBtn.addEventListener('click', () => app.togglePlay());
    this.done.addEventListener('click', () => this.stop());
    this.bar.append(this.playBtn, prev, this.count, next, this.done);
    this.layer.append(this.action, this.bar);
    stage.append(this.layer);
    this.layer.hidden = true;

    // one finger: a tap plays or pauses, a sideways swipe changes panel; nothing reaches the canvas
    let down: { id: number; x: number; y: number } | null = null;
    this.layer.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      down = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    this.layer.addEventListener('pointerup', (e) => {
      if (!down || down.id !== e.pointerId) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      down = null;
      if (Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy)) this.step(dx < 0 ? 1 : -1);
      else if (Math.hypot(dx, dy) < 12) app.togglePlay();
    });
    this.layer.addEventListener('pointercancel', () => { down = null; });
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.key === 'Escape') this.stop();
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') this.step(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') this.step(-1);
      else if (e.key === ' ' || e.key === 'Enter') { if ((e.target as HTMLElement).closest?.('button')) return; app.togglePlay(); }
      else return;
      e.preventDefault();
      e.stopImmediatePropagation();
    }, true);
    document.addEventListener('fullscreenchange', () => { if (this.active && !document.fullscreenElement && this.wentFull) { this.wentFull = false; this.stop(); } });
  }

  private wentFull = false;

  start(): void {
    if (this.active || !this.app.board) return;
    this.active = true;
    this.sig = '';
    document.body.classList.add('presenting');
    this.layer.hidden = false;
    // the whole screen when the browser allows it (iPad Safari may not: the page still fills the window)
    const root = document.documentElement;
    if (root.requestFullscreen && !document.fullscreenElement) root.requestFullscreen().then(() => { this.wentFull = true; setTimeout(this.fit, 60); }, () => {});
    const i = this.index();
    if (i < 0) this.app.goPanel(0);
    this.update();
    setTimeout(this.fit, 30);
    this.playBtn.focus();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    if (this.app.playing) this.app.togglePlay();
    document.body.classList.remove('presenting');
    this.layer.hidden = true;
    if (this.wentFull && document.fullscreenElement) { this.wentFull = false; void document.exitFullscreen().catch(() => {}); }
    setTimeout(this.fit, 30);
  }

  private index(): number {
    return locate(this.app.project.exposures, this.app.lf)?.index ?? -1;
  }

  private step(d: number): void {
    const n = this.app.project.exposures.length;
    if (!n) return;
    const i = Math.max(0, Math.min(n - 1, this.index() + d));
    const wasPlaying = this.app.playing;
    if (wasPlaying) this.app.togglePlay();
    this.app.goPanel(i);
    if (wasPlaying) this.app.togglePlay();
    this.update();
  }

  /** Panel counter, the action line and the play state (cheap; call on every frame change). */
  update(): void {
    if (!this.active) return;
    const app = this.app;
    if (!app.board || app.workspace !== 'board') { this.stop(); return; }
    const ex = app.project.exposures;
    const i = this.index();
    const action = i >= 0 ? (ex[i]!.action ?? '').trim() : '';
    const sig = `${i}|${ex.length}|${action}|${app.playing}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.count.textContent = `${i + 1} / ${ex.length}`;
    this.action.textContent = action;
    this.action.hidden = !action;
    this.playBtn.textContent = app.playing ? 'Pause' : 'Play';
    decorate(this.playBtn, app.playing ? 'pause' : 'play');
    this.playBtn.setAttribute('aria-pressed', String(app.playing));
  }
}
