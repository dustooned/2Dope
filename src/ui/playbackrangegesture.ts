import type { App } from '../app';
import type { PlaybackRange } from '../core/playback';
import { HOLD_MS, HOLD_SLOP } from './contextmenu';

interface Ruler {
  parent: HTMLElement;
  cell: number;
  origin: number;
  offset: number;
}
interface Hold {
  id: number; x: number; y: number; anchor: number; end: number; active: boolean;
  project: App['project']; comp: App['project']['comp']; layer: string; workspace: App['workspace']; length: number;
  saved: string; ruler: Ruler;
}

/** Observe normal ruler scrubbing; take over only after a stationary hold. No document preview. */
export class PlaybackRangeGesture {
  private hold: Hold | null = null;
  private timer = 0;
  private pointers = new Set<number>();
  private swallowUntil = 0;
  private readonly band = document.createElement('div');
  private readonly hint = document.createElement('div');

  constructor(private app: App, private host: HTMLElement, private ruler: () => Ruler, private takeOver: () => void) {
    this.band.className = 'playback-range-band playback-range-preview'; this.band.setAttribute('aria-hidden', 'true');
    this.hint.className = 'playback-range-gesture-hint'; this.hint.setAttribute('role', 'status');
    host.addEventListener('pointerdown', e => {
      this.pointers.add(e.pointerId);
      if (this.pointers.size > 1) { this.cancel(); return; }
      if (!app.rangeGestureEnabled || !e.isPrimary || e.button !== 0 || app.strokeActive || document.querySelector('dialog[open]')) return;
      const ruler = this.ruler(), r = ruler.parent.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY >= r.top + 18 || e.clientX < r.left + ruler.offset) return;
      const anchor = this.frameAt(e.clientX, ruler);
      const h: Hold = { id: e.pointerId, x: e.clientX, y: e.clientY, anchor, end: anchor, active: false,
        project: app.project, comp: app.project.comp, layer: app.project.activeLayer, workspace: app.workspace,
        length: app.compEnd, saved: JSON.stringify(app.project.comp.playbackRange), ruler };
      this.hold = h;
      this.timer = window.setTimeout(() => {
        if (this.hold !== h || !this.valid(h) || !app.scrubbing) { this.cancel(); return; }
        h.active = true; this.takeOver();
        // Do not snap to scrub-lock home while switching to a range gesture.
        app.scrubbing = false; app.requestRender();
        this.paint(h); app.onFrameChange();
        try { host.setPointerCapture(h.id); } catch { /* synthetic or already released */ }
      }, HOLD_MS);
    }, true);
    // Native pointer handlers run first, retaining pinch bookkeeping and ordinary scrubbing.
    host.addEventListener('pointermove', e => {
      const h = this.hold; if (!h || h.id !== e.pointerId) return;
      if (!this.valid(h)) { this.cancel(); return; }
      if (!h.active) { if (Math.hypot(e.clientX - h.x, e.clientY - h.y) > HOLD_SLOP) this.cancel(); return; }
      e.preventDefault(); h.end = this.frameAt(e.clientX, h.ruler); this.paint(h);
    });
    host.addEventListener('pointerup', e => {
      this.pointers.delete(e.pointerId);
      const h = this.hold; if (!h || h.id !== e.pointerId) return;
      const commit = h.active && this.valid(h);
      if (commit) h.end = this.frameAt(e.clientX, h.ruler);
      this.cancel();
      if (commit) app.setPlaybackRange(this.interval(h));
    });
    const interrupted = (e: PointerEvent) => { this.pointers.delete(e.pointerId); if (this.hold?.id === e.pointerId) this.cancel(); };
    host.addEventListener('pointercancel', interrupted); host.addEventListener('lostpointercapture', interrupted);
    for (const name of ['pointerup', 'pointercancel'] as const) window.addEventListener(name, e => this.pointers.delete(e.pointerId), true);
    host.addEventListener('click', e => { if (performance.now() < this.swallowUntil) { e.preventDefault(); e.stopImmediatePropagation(); this.swallowUntil = 0; } }, true);
    host.addEventListener('contextmenu', e => { if (this.hold || performance.now() < this.swallowUntil) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    window.addEventListener('keydown', e => { if (e.key === 'Escape' && this.hold?.active) { this.cancel(); e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    window.addEventListener('blur', () => { this.cancel(); this.pointers.clear(); });
    window.addEventListener('resize', () => this.cancel());
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.cancel(); this.pointers.clear(); } });
  }

  update(): void {
    this.host.classList.toggle('range-gesture-enabled', this.app.rangeGestureEnabled);
    if (this.hold && !this.valid(this.hold)) this.cancel();
  }

  private valid(h: Hold): boolean {
    const app = this.app, r = this.ruler();
    return app.rangeGestureEnabled && !app.uiHidden && !app.playing && !app.strokeActive && !document.hidden && !document.querySelector('dialog[open]') &&
      this.host.isConnected && this.host.getClientRects().length > 0 && h.project === app.project && h.comp === app.project.comp &&
      h.layer === app.project.activeLayer && h.workspace === app.workspace && h.length === app.compEnd &&
      h.saved === JSON.stringify(app.project.comp.playbackRange) && h.ruler.cell === r.cell && h.ruler.origin === r.origin;
  }

  private frameAt(x: number, r: Ruler): number {
    const frame = r.origin + Math.floor((x - r.parent.getBoundingClientRect().left - r.offset) / r.cell);
    return Math.max(0, Math.min(Math.min(this.app.compEnd, 1_000_000) - 1, frame));
  }

  private interval(h: Hold): PlaybackRange { return { start: Math.min(h.anchor, h.end), end: Math.max(h.anchor, h.end) + 1 }; }

  private paint(h: Hold): void {
    const range = this.interval(h), r = h.ruler;
    this.band.style.left = `${r.offset + (range.start - r.origin) * r.cell}px`;
    this.band.style.width = `${(range.end - range.start) * r.cell}px`;
    if (!this.band.isConnected) r.parent.append(this.band);
    this.hint.textContent = `Loop ${range.start + 1}–${range.end} · lift to apply`;
    if (!this.hint.isConnected) document.body.append(this.hint);
    const host = this.host.getBoundingClientRect();
    this.hint.style.left = `${Math.max(4, Math.min(h.x - 60, innerWidth - this.hint.offsetWidth - 4))}px`;
    this.hint.style.top = `${Math.max(4, host.top - this.hint.offsetHeight - 6)}px`;
  }

  private cancel(): void {
    clearTimeout(this.timer);
    if (this.hold?.active) this.swallowUntil = performance.now() + 600;
    this.hold = null; this.band.remove(); this.hint.remove();
  }
}
