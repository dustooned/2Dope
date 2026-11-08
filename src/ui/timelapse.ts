/**
 * Time-lapse: a small picture of the shot after each change, so the making-of can be replayed
 * and saved as a GIF (Procreate's time-lapse, without video encoding). Pictures are kept for the
 * open project in this session only (memory, not the project file); a long session keeps every
 * other picture so it never grows past `MAX`. Recording can be switched off on this device.
 */

import type { App } from '../app';
import type { Project } from '../core/project';
import { gifFrame, gifHeader } from '../io/gif';
import { drawComp } from '../view/composite';
import { el } from './dom';

const OFF_KEY = '2dope.timelapse.off';
const SIDE = 360, MAX = 600, IDLE_MS = 700;

/** Keep at most `max` items by dropping every other one (the whole history stays, at half the rate). */
export function thinOut<T>(list: T[], max: number): T[] {
  return list.length <= max ? list : list.filter((_, i) => i % 2 === 0 || i === list.length - 1);
}

export class TimeLapse {
  private readonly shots = new WeakMap<Project, Blob[]>();
  private timer = 0;
  on = (() => { try { return localStorage.getItem(OFF_KEY) !== '1'; } catch { return true; } })();

  constructor(private readonly app: App) {}

  /** The pictures of the open project so far. */
  get frames(): Blob[] {
    return this.shots.get(this.app.project) ?? [];
  }

  /** Something changed: take a picture once things are quiet. */
  changed(): void {
    if (!this.on) return;
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.capture(), IDLE_MS);
  }

  setOn(on: boolean): void {
    this.on = on;
    try { if (on) localStorage.removeItem(OFF_KEY); else localStorage.setItem(OFF_KEY, '1'); } catch { /* optional */ }
  }

  /** The shot at the playhead, small, as a JPEG. */
  async capture(): Promise<void> {
    const app = this.app, p = app.project;
    if (app.strokeActive) { this.changed(); return; }
    const c = p.comp, k = Math.min(1, SIDE / Math.max(c.width, c.height));
    const cv = el('canvas');
    cv.width = Math.max(1, Math.round(c.width * k));
    cv.height = Math.max(1, Math.round(c.height * k));
    const g = cv.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, cv.width, cv.height);
    g.setTransform(k, 0, 0, k, 0, 0);
    drawComp(g, p, c, app.frame, { backgrounds: true, export: true });
    const blob = await new Promise<Blob | null>((r) => cv.toBlob(r, 'image/jpeg', 0.7));
    if (!blob) return;
    this.shots.set(p, thinOut([...this.frames, blob], MAX));
  }

  /** The replay: play, scrub, save as GIF, and the recording switch. */
  show(): void {
    const frames = this.frames;
    const dialog = el('dialog', { class: 'timelapse', 'aria-label': 'Time-lapse' });
    dialog.append(el('h2', {}, 'Time-lapse'));
    const close = () => { stop(); if (dialog.open) dialog.close(); dialog.remove(); };
    dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    const view = el('canvas', { class: 'tl-view', 'aria-label': 'Time-lapse picture' });
    const scrub = el('input', { type: 'range', min: '0', max: String(Math.max(0, frames.length - 1)), value: '0', 'aria-label': 'Picture' });
    const count = el('span', { class: 'hint' });
    const play = el('button', { type: 'button', class: 'primary' }, 'Play');
    const gif = el('button', { type: 'button' }, 'Save as GIF');
    const done = el('button', { type: 'button' }, 'Close');
    const rec = el('label', { class: 'share-row toggle' });
    const box = el('input', { type: 'checkbox' });
    box.checked = this.on;
    box.addEventListener('change', () => this.setOn(box.checked));
    rec.append(box, el('span', {}, 'Record a time-lapse on this device (kept until you close the tab)'));
    let timer = 0;
    const stop = () => { clearInterval(timer); timer = 0; play.textContent = 'Play'; };
    const showAt = async (i: number) => {
      const b = frames[i];
      if (!b) return;
      const bmp = await createImageBitmap(b);
      view.width = bmp.width; view.height = bmp.height;
      view.getContext('2d')!.drawImage(bmp, 0, 0);
      bmp.close();
      scrub.value = String(i);
      count.textContent = `${i + 1} of ${frames.length}`;
    };
    scrub.addEventListener('input', () => { stop(); void showAt(Number(scrub.value)); });
    play.addEventListener('click', () => {
      if (timer) { stop(); return; }
      let i = Number(scrub.value) >= frames.length - 1 ? 0 : Number(scrub.value);
      play.textContent = 'Pause';
      timer = window.setInterval(() => { void showAt(i); if (++i >= frames.length) stop(); }, 1000 / 12);
    });
    gif.addEventListener('click', () => void this.saveGif(frames, gif));
    done.addEventListener('click', close);
    const bar = el('div', { class: 'tl-bar' });
    bar.append(play, scrub, count);
    const foot = el('div', { class: 'vfoot' });
    foot.append(gif, done);
    if (frames.length) dialog.append(view, bar);
    else dialog.append(el('p', {}, this.on ? 'Nothing recorded yet in this project: draw something, and each change adds a picture.' : 'Recording is off.'));
    play.disabled = gif.disabled = frames.length < 2;
    dialog.append(rec, foot);
    document.body.append(dialog);
    dialog.showModal();
    if (frames.length) void showAt(frames.length - 1);
  }

  /** The pictures as a looping GIF (12 a second), downloaded. */
  private async saveGif(frames: Blob[], button: HTMLButtonElement): Promise<void> {
    button.disabled = true;
    try {
      const first = await createImageBitmap(frames[0]!);
      const w = Math.min(480, first.width), h = Math.min(480, first.height);
      first.close();
      const cv = el('canvas');
      cv.width = w; cv.height = h;
      const g = cv.getContext('2d', { willReadFrequently: true })!;
      const parts: BlobPart[] = [gifHeader(w, h) as BlobPart];
      for (const f of frames) {
        const bmp = await createImageBitmap(f);
        g.drawImage(bmp, 0, 0, w, h);
        bmp.close();
        parts.push(gifFrame(g.getImageData(0, 0, w, h).data, w, h, 8) as BlobPart);
      }
      parts.push(new Uint8Array([0x3b]));
      const url = URL.createObjectURL(new Blob(parts, { type: 'image/gif' }));
      const a = el('a', { href: url, download: `${this.app.project.name || 'Untitled'} time-lapse.gif` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } finally {
      button.disabled = false;
    }
  }
}
