import type { App } from '../app';
import { attachContextMenu, HOLD_MS, showContextMenu, swallowNextClick } from './contextmenu';
import { frameMenu } from './framemenu';
import { parseDialogue } from '../core/dialogue';
import { MOVE_STICKERS, parseShot, sceneColour, scenesOf, stickersOf } from '../core/scenes';
import { el } from './dom';

/**
 * Story → Grid: the board as a wall of pictures (the panels' order at a glance). Each tile shows its
 * number, length and first line. Tap goes to a panel, double-tap opens it in Panels to write, hold
 * (or right-click) opens its menu, drag reorders. Size (− / +), pinch or Ctrl + wheel sets how many
 * fit per row, remembered on this device. The same panels as every other view: nothing is copied.
 */

const COLS_KEY = '2dope.board.gridcols';
export const GRID_COLS = { min: 2, max: 8, default: 4 };

/** The panel's first line for the tile: the first spoken line ("Sam: …"), else its action. */
export function tileLine(dialogue: string | undefined, action: string | undefined): string {
  const first = parseDialogue(dialogue ?? '')[0];
  if (first) return first.who ? `${first.who}: ${first.text}` : first.text;
  return (action ?? '').trim().split('\n')[0] ?? '';
}

export class BoardGrid {
  readonly root = el('div', { class: 'bgrid-wrap' });
  private readonly list = el('div', { class: 'bgrid', role: 'list', 'aria-label': 'Panels as a grid' });
  private readonly colsOut = el('output', { class: 'bgrid-cols', 'aria-live': 'polite' });
  private cols = GRID_COLS.default;
  private sig = '';
  /** Scenes folded shut in this grid (this session only). */
  private readonly folded = new Set<number>();
  private drag: { i: number; x: number; y: number; id: number; moved: boolean; hold: number; over: number } | null = null;

  constructor(
    private readonly app: App,
    private readonly paint: (c: HTMLCanvasElement, drawingId: string) => void,
    /** Double-tap: write on this panel (Panels view, its first field). */
    private readonly edit: (i: number) => void,
  ) {
    try {
      const n = Number(localStorage.getItem(COLS_KEY));
      if (n >= GRID_COLS.min && n <= GRID_COLS.max) this.cols = n;
    } catch { /* default size */ }
    const less = el('button', { type: 'button', 'aria-label': 'Bigger pictures (fewer per row)', title: 'Fewer per row (pinch out, Ctrl + wheel)' }, '−');
    const more = el('button', { type: 'button', 'aria-label': 'Smaller pictures (more per row)', title: 'More per row (pinch in, Ctrl + wheel)' }, '+');
    less.addEventListener('click', () => this.setCols(this.cols - 1));
    more.addEventListener('click', () => this.setCols(this.cols + 1));
    const head = el('div', { class: 'bgrid-head' });
    head.append(el('span', { class: 'hint' }, 'Per row'), less, this.colsOut, more, el('span', { class: 'hint bgrid-tip' }, 'Tap to go · double-tap to write · drag to reorder'));
    this.root.append(head, this.list);
    this.applyCols();

    // Ctrl / ⌘ + wheel and pinch change how many fit per row
    this.list.addEventListener('wheel', (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      if (Math.abs(e.deltaY) > 2) this.setCols(this.cols + (e.deltaY > 0 ? 1 : -1));
    }, { passive: false });
    let pinch: { d: number; cols: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    this.list.addEventListener('touchstart', (e) => { if (e.touches.length === 2) { pinch = { d: Math.max(1, dist(e.touches)), cols: this.cols }; this.cancelDrag(); } }, { passive: true });
    this.list.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      this.setCols(Math.round(pinch.cols / (dist(e.touches) / pinch.d)));
    }, { passive: false });
    this.list.addEventListener('touchend', (e) => { if (e.touches.length < 2) pinch = null; });

    // tap, hold, drag (one pointer; the hold menu is the same as the cards')
    this.list.addEventListener('pointerdown', (e) => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>('.btile');
      if (!tile || e.button !== 0 || pinch) return;
      const i = Number(tile.dataset.i);
      const at = { x: e.clientX, y: e.clientY };
      const hold = window.setTimeout(() => {
        if (!this.drag || this.drag.moved) return;
        this.drag = null;
        if (!app.selection.includes(i)) app.goPanel(i);
        swallowNextClick();
        showContextMenu(at.x, at.y, frameMenu(app));
      }, HOLD_MS);
      this.drag = { i, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, hold, over: i };
    });
    this.list.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 8) return;
      if (!d.moved) {
        d.moved = true;
        clearTimeout(d.hold);
        try { this.list.setPointerCapture(e.pointerId); } catch { /* still works over the grid */ }
        this.list.querySelector(`.btile[data-i="${d.i}"]`)?.classList.add('dragging');
      }
      const over = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('.btile');
      if (over && over.parentElement === this.list) d.over = Number(over.dataset.i);
      this.list.querySelectorAll('.btile').forEach((t) => t.classList.toggle('drop', Number((t as HTMLElement).dataset.i) === d.over && d.over !== d.i));
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      const d = this.drag;
      if (!d || d.id !== e.pointerId) return;
      this.drag = null;
      clearTimeout(d.hold);
      this.list.querySelectorAll('.btile').forEach((t) => t.classList.remove('dragging', 'drop'));
      if (!d.moved) return; // a tap: the click handler goes there
      swallowNextClick();
      if (cancelled || d.over === d.i) return;
      app.setSelection([d.i]);
      // with this panel taken out, the drop tile's index is how many panels come before it
      app.moveSelectionTo(d.over);
    };
    this.list.addEventListener('pointerup', (e) => end(e, false));
    this.list.addEventListener('pointercancel', (e) => end(e, true));
    this.list.addEventListener('click', (e) => {
      const head = (e.target as HTMLElement).closest<HTMLElement>('.bgrid-scene');
      if (head) {
        const sc = Number(head.dataset.scene);
        if (this.folded.has(sc)) this.folded.delete(sc);
        else this.folded.add(sc);
        this.sig = '';
        this.update();
        this.list.querySelector<HTMLElement>(`.bgrid-scene[data-scene="${sc}"]`)?.focus();
        return;
      }
      const tile = (e.target as HTMLElement).closest<HTMLElement>('.btile');
      if (tile) app.goPanel(Number(tile.dataset.i));
    });
    this.list.addEventListener('dblclick', (e) => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>('.btile');
      if (tile) this.edit(Number(tile.dataset.i));
    });
    this.list.addEventListener('keydown', (e) => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>('.btile');
      if (!tile) return;
      const i = Number(tile.dataset.i);
      const n = this.list.querySelectorAll('.btile').length;
      const go = (j: number) => { if (j < 0 || j >= n) return; e.preventDefault(); e.stopPropagation(); app.goPanel(j); this.list.querySelector<HTMLElement>(`.btile[data-i="${j}"]`)?.focus(); };
      if (e.key === 'ArrowRight') go(i + 1);
      else if (e.key === 'ArrowLeft') go(i - 1);
      else if (e.key === 'ArrowDown') go(Math.min(n - 1, i + this.cols));
      else if (e.key === 'ArrowUp') go(Math.max(0, i - this.cols));
      else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); this.edit(i); }
    });
    attachContextMenu(this.list, ({ target }) => {
      const tile = (target as HTMLElement | null)?.closest<HTMLElement>('.btile');
      if (!tile) return null;
      const i = Number(tile.dataset.i);
      if (!app.selection.includes(i)) app.goPanel(i);
      return frameMenu(app);
    });
  }

  private cancelDrag(): void {
    if (!this.drag) return;
    clearTimeout(this.drag.hold);
    this.drag = null;
    this.list.querySelectorAll('.btile').forEach((t) => t.classList.remove('dragging', 'drop'));
  }

  setCols(n: number): void {
    const c = Math.max(GRID_COLS.min, Math.min(GRID_COLS.max, Math.round(n)));
    if (c === this.cols) return;
    this.cols = c;
    try { localStorage.setItem(COLS_KEY, String(c)); } catch { /* not remembered */ }
    this.applyCols();
  }

  private applyCols(): void {
    this.list.style.setProperty('--cols', String(this.cols));
    this.colsOut.textContent = String(this.cols);
    const [less, more] = this.root.querySelectorAll<HTMLButtonElement>('.bgrid-head button');
    if (less) less.disabled = this.cols <= GRID_COLS.min;
    if (more) more.disabled = this.cols >= GRID_COLS.max;
  }

  /** Rebuild the tiles when the panels change; mark the current and selected ones every time. */
  update(): void {
    const app = this.app;
    const b = app.board;
    if (!b || this.root.hidden) return;
    const p = app.project;
    const ex = b.exposures;
    const sig = `${b.id}|${p.comp.fps}|${app.timeFormat}|${[...this.folded].join(',')}|` + ex.map((e) => `${e.drawing}:${e.length}:${e.dialogue ?? ''}:${e.action ?? ''}:${e.shot ?? ''}:${e.camera ?? ''}:${p.drawings.get(e.drawing)?.thumbRev ?? 0}`).join('|');
    if (sig !== this.sig && !this.drag) {
      this.sig = sig;
      const h = Math.round((192 * p.height) / p.width);
      const scenes = scenesOf(ex.map((e) => e.shot));
      const items: HTMLElement[] = [];
      ex.forEach((e, i) => {
        const sc = scenes[i]!;
        // a scene's header before its first panel: colour, heading, how many panels and how long
        if (sc && scenes[i - 1] !== sc) {
          let n = 0, len = 0;
          for (let j = i; j < ex.length && scenes[j] === sc; j++) { n++; len += ex[j]!.length; }
          const heading = parseShot(e.shot)?.rest ?? '';
          const open = !this.folded.has(sc);
          const head = el('button', { type: 'button', class: 'bgrid-scene', 'data-scene': String(sc), 'aria-expanded': String(open), title: open ? 'Fold this scene' : 'Show this scene’s panels' }, `${open ? '▾' : '▸'} Scene ${sc}${heading ? ` · ${heading}` : ''} · ${n} panel${n === 1 ? '' : 's'} · ${app.fmtDur(len)}`);
          head.style.setProperty('--scene', sceneColour(sc));
          items.push(head);
        }
        if (sc && this.folded.has(sc)) return;
        const line = tileLine(e.dialogue, e.action);
        const tile = el('div', { class: 'btile', role: 'listitem', tabindex: '0', 'data-i': String(i), 'aria-label': `Panel ${i + 1}, ${app.fmtDur(e.length)}${line ? `: ${line}` : ''}`, title: line || `Panel ${i + 1}` });
        const pic = el('canvas', { class: 'btile-pic', width: '192', height: String(h), 'aria-hidden': 'true' });
        this.paint(pic, e.drawing);
        const meta = el('div', { class: 'btile-meta' });
        meta.append(el('span', { class: 'btile-num' }, String(i + 1)), el('span', { class: 'btile-len' }, app.fmtDur(e.length)));
        tile.append(pic, meta, el('p', { class: 'btile-line' }, line));
        // shot and camera stickers as small badges on the picture
        const st = stickersOf(e.camera);
        if (st.shot || st.moves.length) {
          const badges = el('span', { class: 'btile-stickers', 'aria-hidden': 'true' });
          if (st.shot) badges.append(el('span', { class: 'shot' }, st.shot));
          for (const m of st.moves) badges.append(el('span', { class: 'move', title: m }, MOVE_STICKERS.find(([k]) => k === m)?.[1] ?? m));
          tile.append(badges);
        }
        if (sc) { tile.style.setProperty('--scene', sceneColour(sc)); tile.classList.add('in-scene'); }
        items.push(tile);
      });
      this.list.replaceChildren(...items);
    }
    let at = 0;
    const cur = app.lf;
    const tiles = new Map([...this.list.querySelectorAll<HTMLElement>('.btile')].map((t) => [Number(t.dataset.i), t]));
    ex.forEach((e, i) => {
      const t = tiles.get(i);
      const on = cur >= at && cur < at + e.length;
      at += e.length;
      if (!t) return;
      t.classList.toggle('on', on);
      t.classList.toggle('selected', app.selection.includes(i));
      t.setAttribute('aria-current', String(on));
    });
  }
}
