import { decorate } from './icons';
import type { App } from '../app';
import { FRAME_FORMATS, frameLabel, isSecondBoundary, type FrameFormat } from '../core/timecode';
import { blockDropIndex, commonHold, startOf, totalFrames } from '../core/timeline';
import { HOLD_MS, HOLD_SLOP, showContextMenu, swallowNextClick } from './contextmenu';
import { frameMenu } from './framemenu';

const FORMAT_KEY = '2dope.m1.framefmt';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function loadFormat(): FrameFormat {
  try {
    const v = localStorage.getItem(FORMAT_KEY);
    if (v === 'frames' || v === 'secFrames' || v === 'timecode') return v;
  } catch {
    // storage unavailable
  }
  return 'frames';
}

/**
 * The exposure sheet: one row per frame, with the drawing number on the frame where a drawing
 * starts, a line through the frames it is held, and a notes column. It is another view of the
 * same timeline: selecting, exposure, reordering and undo all work on the same data.
 *
 * - Click or drag down the rows to select drawings. Up/Down moves the frame.
 * - Type a number (or double-click a cell, or press Enter) to show that drawing from this frame on.
 * - Click the note column to type a note; it stays with the drawing when you retime.
 */
export class XSheet {
  private readonly head: HTMLElement;
  private readonly body: HTMLElement;
  private readonly formatSel: HTMLSelectElement;
  private readonly infoEl: HTMLElement;
  private format = loadFormat();
  private signature = '';
  private visible = false;
  private anchor: number | null = null;
  private editing: HTMLInputElement | null = null;

  constructor(
    private readonly app: App,
    root: HTMLElement,
  ) {
    root.classList.add('xsheet');
    const bar = el('div', { class: 'xs-bar' });
    this.formatSel = el('select', { 'aria-label': 'Frame numbers', title: 'How frame numbers are shown' });
    for (const f of FRAME_FORMATS) this.formatSel.append(el('option', { value: f.id }, f.label));
    this.formatSel.value = this.format;
    this.formatSel.addEventListener('change', () => {
      this.format = this.formatSel.value as FrameFormat;
      app.setTimeFormat(this.format);
      try {
        localStorage.setItem(FORMAT_KEY, this.format);
      } catch {
        // not persisted: fine
      }
      this.signature = '';
      this.update();
    });
    this.infoEl = el('span', { class: 'hint' });
    bar.append(this.formatSel, this.infoEl);

    // touch actions on the selection (the same ones are in the press-and-hold menu)
    const acts = el('div', { class: 'xs-acts', role: 'toolbar', 'aria-label': 'Frame actions' });
    // icons in small groups: add, copy, move, delete (holds are in the Hold row above)
    let group = el('div', { class: 'xs-group' });
    acts.append(group);
    const act = (label: string, icon: string, title: string, run: () => unknown, cls = '') => {
      const b = el('button', { type: 'button', title, class: `icon-only ${cls}`, 'aria-label': label }, label);
      decorate(b, icon);
      b.addEventListener('click', () => void run());
      group.append(b);
    };
    const gap = () => { group = el('div', { class: 'xs-group' }); acts.append(group); };
    act('Blank before', 'insbefore', 'Insert a blank drawing before the selection', () => app.insertBlank('before'));
    act('Blank after', 'insafter', 'Insert a blank drawing after the selection (N)', () => app.insertBlank('after'));
    gap();
    act('Duplicate', 'copy', 'Duplicate the selected drawings (D)', () => app.duplicateSelection());
    act('Copy', 'layers', 'Copy the selected drawings (Ctrl+C)', () => app.copySelection());
    act('Paste', 'paste', 'Paste after the selection, showing the same drawings (Ctrl+V)', () => app.paste());
    gap();
    act('Earlier', 'up', 'Move the selection earlier (Alt+\u2191)', () => app.moveSelection(-1));
    act('Later', 'down', 'Move the selection later (Alt+\u2193)', () => app.moveSelection(1));
    gap();
    act('Delete', 'trash', 'Delete the selected drawings (Delete)', () => app.deleteFrame(), 'danger');

    this.head = el('div', { class: 'xs-head' });
    this.body = el('div', { class: 'xs-body', tabindex: '0', 'data-own-keys': '', 'aria-label': 'Exposure sheet' });
    this.dropLine = el('div', { class: 'xs-drop' });
    root.append(bar, acts, this.head, this.body);
    this.bind();
  }

  private readonly dropLine: HTMLElement;
  /** The press being tracked: pending (could be a tap, a scroll or a hold), selecting a range, lifted (held), or moving the lifted block. */
  private press: { id: number; x: number; y: number; type: string; mode: 'pending' | 'select' | 'lift' | 'moving'; canSelect: boolean; timer: number; to: number | null; numTap?: HTMLElement } | null = null;
  /** Sliding on a hold number: the drawing, where the finger started, the hold before and now. */
  private holdSlide: { id: number; index: number; x: number; len0: number; len: number; moved: boolean; badge: HTMLElement } | null = null;
  private lastHold = 0;

  show(on: boolean): void {
    this.visible = on;
    if (on) {
      this.signature = '';
      this.update();
    }
  }

  reset(): void {
    this.signature = '';
    this.anchor = null;
    this.update();
  }

  // -------------------------------------------------------------------------------------------

  private rowOf(target: EventTarget | null): HTMLElement | null {
    return (target as HTMLElement | null)?.closest?.<HTMLElement>('.xs-row') ?? null;
  }

  /**
   * Touch first:
   * - tap a row: select that drawing and go to the frame (Shift+click extends);
   * - drag on the frame-number column (or with a mouse anywhere): select a range;
   * - drag a finger on the cells: scroll;
   * - press and hold: the selection lifts; drag it to move it, or let go for the menu;
   * - right-click: the menu.
   */
  private bind(): void {
    const app = this.app;
    this.body.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.editing) return;
      if (!e.isPrimary) return this.endPress(true);
      const row = this.rowOf(e.target);
      if (!row) return;
      if ((e.target as HTMLElement).closest('.xs-note')) {
        this.editNote(row);
        return;
      }
      // the hold number: slide sideways to change it, tap it to type it
      const badge = (e.target as HTMLElement).closest<HTMLElement>('.xs-hold');
      if (badge) {
        e.stopPropagation();
        const index = Number(row.dataset.exp);
        const len = app.project.exposures[index]?.length ?? 1;
        this.holdSlide = { id: e.pointerId, index, x: e.clientX, len0: len, len, moved: false, badge };
        try { badge.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
        return;
      }
      const frame = Number(row.dataset.frame);
      const index = Number(row.dataset.exp);
      this.body.focus({ preventScroll: true });
      try {
        this.body.setPointerCapture(e.pointerId);
      } catch {
        // capture can fail for stale pointers
      }
      const inSel = app.selection.includes(index);
      if (e.shiftKey && this.anchor !== null) {
        this.selectRange(this.anchor, index);
      } else if (!inSel) {
        this.anchor = index;
        app.setSelection([index]);
      }
      app.setLayerFrame(frame);
      const canSelect = e.pointerType !== 'touch' || !!(e.target as HTMLElement).closest('.xs-fno');
      // a tap on the number of a drawing that was already selected: change which drawing shows
      const numTap = inSel && row.dataset.start === '1' && !!(e.target as HTMLElement).closest('.xs-cell') ? row : undefined;
      const press = { id: e.pointerId, x: e.clientX, y: e.clientY, type: e.pointerType, mode: 'pending' as const, canSelect, timer: 0, to: null, numTap };
      press.timer = window.setTimeout(() => this.lift(), HOLD_MS);
      this.press = press;
    });
    this.body.addEventListener('pointermove', (e) => {
      const hs = this.holdSlide;
      if (hs && e.pointerId === hs.id) {
        const dx = e.clientX - hs.x;
        if (!hs.moved && Math.abs(dx) < 6) return;
        hs.moved = true;
        hs.len = Math.max(1, Math.min(99, hs.len0 + Math.round(dx / 14)));
        hs.badge.textContent = String(hs.len);
        hs.badge.classList.add('sliding');
        return;
      }
      const p = this.press;
      if (!p || e.pointerId !== p.id) return;
      const moved = Math.hypot(e.clientX - p.x, e.clientY - p.y) > HOLD_SLOP;
      if (p.mode === 'pending' && moved) {
        clearTimeout(p.timer);
        if (p.canSelect) p.mode = 'select';
        else return this.endPress(false); // a finger on the cells scrolls
      }
      if (p.mode === 'select' && this.anchor !== null) {
        const row = this.rowAtY(e.clientY);
        if (row) this.selectRange(this.anchor, Number(row.dataset.exp));
      } else if ((p.mode === 'lift' && moved) || p.mode === 'moving') {
        p.mode = 'moving';
        this.dragTo(e.clientY);
      }
    });
    this.body.addEventListener('pointerup', (e) => {
      const hs = this.holdSlide;
      if (hs && e.pointerId === hs.id) {
        this.holdSlide = null;
        hs.badge.classList.remove('sliding');
        if (hs.moved) {
          if (hs.len !== hs.len0) {
            app.setSelection([hs.index]);
            app.setExposure(hs.len);
          }
          this.signature = '';
          this.update();
        } else this.editHold(hs.index, hs.badge);
        return;
      }
      const p = this.press;
      if (!p || e.pointerId !== p.id) return;
      if (p.mode === 'pending' && p.numTap) {
        const row = p.numTap;
        this.endPress(true);
        this.editCell(row);
        return;
      }
      if (p.mode === 'lift') {
        this.endPress(true);
        showContextMenu(e.clientX, e.clientY, frameMenu(this.app));
        return;
      }
      const to = p.mode === 'moving' ? p.to : null;
      this.endPress(true);
      if (to !== null) app.moveSelectionTo(to);
    });
    this.body.addEventListener('pointercancel', () => {
      if (this.holdSlide) { this.holdSlide = null; this.signature = ''; this.update(); }
      this.endPress(true);
    });
    // keep the page from scrolling while a lifted block or a range is being dragged
    this.body.addEventListener(
      'touchmove',
      (e) => {
        if (this.press && this.press.mode !== 'pending') e.preventDefault();
      },
      { passive: false },
    );
    this.body.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (Date.now() - this.lastHold < 1000) return; // the hold already opened it (Android sends both)
      const row = this.rowOf(e.target);
      if (row && !app.selection.includes(Number(row.dataset.exp))) {
        this.anchor = Number(row.dataset.exp);
        app.setSelection([this.anchor]);
        app.setLayerFrame(Number(row.dataset.frame));
      }
      showContextMenu(e.clientX, e.clientY, frameMenu(this.app));
    });
    this.body.addEventListener('dblclick', (e) => {
      const row = this.rowOf(e.target);
      if (row && !(e.target as HTMLElement).closest('.xs-note')) this.editCell(row);
    });
    this.body.addEventListener('keydown', (e) => this.onKey(e));
  }

  /** The row under a screen y (clamped to the first and last rows). */
  private rowAtY(clientY: number): HTMLElement | null {
    const rows = this.body.querySelectorAll<HTMLElement>('.xs-row');
    const first = rows[0];
    if (!first) return null;
    const r = this.body.getBoundingClientRect();
    const h = first.getBoundingClientRect().height || 26;
    const f = Math.max(0, Math.min(rows.length - 1, Math.floor((clientY - r.top + this.body.scrollTop) / h)));
    return rows[f] ?? null;
  }

  /** Held still: pick up the selection. */
  private lift(): void {
    const p = this.press;
    if (!p || p.mode !== 'pending') return;
    p.mode = 'lift';
    this.lastHold = Date.now();
    swallowNextClick();
    navigator.vibrate?.(10);
    for (const r of this.body.querySelectorAll('.xs-row.selected')) r.classList.add('lifted');
  }

  /** Show where the lifted block would land if let go at this screen y. */
  private dragTo(clientY: number): void {
    const p = this.press;
    if (!p) return;
    const app = this.app;
    const ex = app.project.exposures;
    const sel = app.targets;
    const rows = this.body.querySelectorAll<HTMLElement>('.xs-row');
    const first = rows[0];
    if (!first || !sel.length) return;
    const h = first.getBoundingClientRect().height || 26;
    // scroll when dragging near the top or bottom edge
    const br = this.body.getBoundingClientRect();
    if (clientY < br.top + 30) this.body.scrollTop -= 10;
    else if (clientY > br.bottom - 30) this.body.scrollTop += 10;
    const blockStart = startOf(ex, sel[0]!);
    const blockLen = sel.reduce((n, i) => n + ex[i]!.length, 0);
    const centre = blockStart + blockLen / 2 + (clientY - p.y) / h;
    const to = blockDropIndex(ex, sel, centre);
    p.to = to;
    // the line goes above the first exposure left after the drop point (in today's layout)
    const pick = new Set(sel);
    const rest = ex.map((_, i) => i).filter((i) => !pick.has(i));
    const before = rest[to];
    const frame = before === undefined ? totalFrames(ex) : startOf(ex, before);
    this.dropLine.style.top = `${frame * h}px`;
    if (!this.dropLine.isConnected) this.body.append(this.dropLine);
  }

  private endPress(clearLift: boolean): void {
    const p = this.press;
    if (p) clearTimeout(p.timer);
    this.press = null;
    this.dropLine.remove();
    if (clearLift) for (const r of this.body.querySelectorAll('.xs-row.lifted')) r.classList.remove('lifted');
  }

  private selectRange(a: number, b: number): void {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    this.app.setSelection(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
  }

  private onKey(e: KeyboardEvent): void {
    const app = this.app;
    if (this.editing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) app.redo();
      else app.undo();
      return;
    }
    if (mod && e.code === 'KeyA') {
      e.preventDefault();
      app.selectAll();
      return;
    }
    if (mod && (e.code === 'KeyC' || e.code === 'KeyX' || e.code === 'KeyV')) {
      e.preventDefault();
      if (e.code === 'KeyC') app.copySelection();
      else if (e.code === 'KeyX') app.cutSelection();
      else void app.paste(e.shiftKey);
      return;
    }
    if (mod) return;
    if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      app.moveSelection(e.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      app.setLayerFrame(app.lf + (e.key === 'ArrowDown' ? 1 : -1));
      this.anchor = app.targets[0] ?? null;
      app.setSelection(app.targets.slice(0, 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = this.body.querySelector<HTMLElement>(`.xs-row[data-frame="${app.lf}"]`);
      if (row) this.editCell(row);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      app.deleteFrame();
      return;
    }
    if (e.key === 'Escape') {
      app.setSelection([]);
      return;
    }
    // typing a digit starts typing a drawing number into the current frame
    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      const row = this.body.querySelector<HTMLElement>(`.xs-row[data-frame="${app.lf}"]`);
      if (row) this.editCell(row, e.key);
      return;
    }
    // everything else behaves as it does on the canvas (play, N, D, K/B/I...)
    if (e.key === ' ') {
      e.preventDefault();
      app.togglePlay();
    } else if (e.key === 'n' || e.key === 'N') app.addFrame();
    else if (e.key === 'd' || e.key === 'D') void app.duplicateSelection();
  }

  private editCell(row: HTMLElement, first?: string): void {
    const cell = row.querySelector<HTMLElement>('.xs-cell');
    if (!cell || this.editing) return;
    const frame = Number(row.dataset.frame);
    const input = el('input', { type: 'text', inputmode: 'numeric', maxlength: '4', 'aria-label': 'Drawing number', class: 'xs-input' });
    input.value = first ?? cell.dataset.num ?? '';
    this.editing = input;
    cell.replaceChildren(input);
    input.focus();
    if (first === undefined) input.select();
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      const n = Number(input.value.trim());
      this.editing = null;
      if (commit && Number.isInteger(n)) this.app.exposeDrawingAt(frame, n);
      this.signature = '';
      this.update();
      this.body.focus();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        finish(true);
      } else if (e.key === 'Escape') {
        finish(false);
      }
    });
    input.addEventListener('blur', () => finish(true));
  }

  /** Tap a hold number: a small editor with - and + and the number (Enter or tapping away keeps it). */
  private editHold(index: number, badge: HTMLElement): void {
    if (this.editing) return;
    const len = this.app.project.exposures[index]?.length ?? 1;
    const box = el('span', { class: 'xs-holdedit' });
    const input = el('input', { type: 'number', inputmode: 'numeric', min: '1', max: '99', step: '1', 'aria-label': 'Hold in frames', class: 'xs-input' });
    input.value = String(len);
    const step = (d: number) => { input.value = String(Math.max(1, Math.min(99, (Number(input.value) || len) + d))); input.focus(); };
    const minus = el('button', { type: 'button', 'aria-label': 'One frame shorter' }, '\u2212');
    const plus = el('button', { type: 'button', 'aria-label': 'One frame longer' }, '+');
    for (const [b, d] of [[minus, -1], [plus, 1]] as const) {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); step(d); });
    }
    box.append(minus, input, plus);
    this.editing = input;
    badge.replaceWith(box);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      this.editing = null;
      const n = Math.round(Number(input.value));
      if (commit && Number.isInteger(n) && n >= 1 && n <= 99 && n !== len) {
        this.app.setSelection([index]);
        this.app.setExposure(n);
      }
      this.signature = '';
      this.update();
      this.body.focus();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => setTimeout(() => { if (!box.contains(document.activeElement)) finish(true); }, 0));
  }

  private editNote(row: HTMLElement): void {
    const noteEl = row.querySelector<HTMLElement>('.xs-note');
    if (!noteEl || this.editing) return;
    const index = Number(row.dataset.exp);
    const isStart = row.dataset.start === '1';
    if (!isStart) {
      // notes live on the first frame of a drawing
      this.app.setLayerFrame(Number(row.dataset.frame));
      const start = this.body.querySelector<HTMLElement>(`.xs-row[data-exp="${index}"][data-start="1"] .xs-note`);
      start?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return;
    }
    const input = el('input', { type: 'text', maxlength: '200', 'aria-label': 'Note', class: 'xs-input xs-note-input', placeholder: 'note…' });
    input.value = this.app.project.exposures[index]?.note ?? '';
    this.editing = input;
    noteEl.replaceChildren(input);
    input.focus();
    let done = false;
    const finish = (commit: boolean) => {
      if (done) return;
      done = true;
      this.editing = null;
      if (commit) this.app.setExposureNote(index, input.value);
      this.signature = '';
      this.update();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  // -------------------------------------------------------------------------------------------

  /** Call when the frame, selection or timeline changes. Does nothing while the sheet is hidden. */
  update(): void {
    if (!this.visible || this.editing) return;
    const app = this.app;
    // one time format for every timeline (set here, in the strip, or in Motion)
    if (app.timeFormat !== this.format) {
      this.format = app.timeFormat;
      this.formatSel.value = this.format;
    }
    const marked = this.body.querySelector('.xs-row.edit-at');
    const e = app.editLine;
    const at = e ? this.body.querySelector(`.xs-row[data-frame="${e.frame - app.project.layer.start}"]`) : null;
    if (marked !== at) {
      marked?.classList.remove('edit-at');
      at?.classList.add('edit-at');
    }
    const p = app.project;
    const sel = new Set(app.selection);
    const sig =
      `${this.format}|${p.fps}|${p.name}|` +
      p.exposures.map((e, i) => `${e.drawing}:${e.length}:${p.drawing(e.drawing).num}:${p.drawing(e.drawing).role ?? ''}:${e.note ?? ''}:${sel.has(i) ? 1 : 0}`).join('|');
    if (sig !== this.signature) {
      this.signature = sig;
      this.rebuild();
    }
    const cur = this.body.querySelector<HTMLElement>('.xs-row.current');
    if (cur && Number(cur.dataset.frame) !== app.lf) cur.classList.remove('current');
    const row = this.body.querySelector<HTMLElement>(`.xs-row[data-frame="${app.lf}"]`);
    if (row && !row.classList.contains('current')) {
      row.classList.add('current');
      const top = row.offsetTop;
      const b = this.body;
      if (top < b.scrollTop + 26) b.scrollTop = Math.max(0, top - 52);
      else if (top + row.offsetHeight > b.scrollTop + b.clientHeight - 26) b.scrollTop = top - b.clientHeight + row.offsetHeight + 52;
    }
    const targets = app.targets;
    const hold = commonHold(p.exposures, targets);
    this.infoEl.textContent = `${p.length} frames · ${p.fps} fps · exposure ${targets.length === 0 ? '-' : hold === null ? 'mixed' : hold}`;
  }

  private rebuild(): void {
    const app = this.app;
    const p = app.project;
    const sel = new Set(app.selection);
    this.head.replaceChildren(
      el('span', { class: 'xs-fno' }, 'Frame'),
      el('span', { class: 'xs-cell', title: 'Drawing number' }, p.name === 'Untitled' ? 'Drawing' : p.name.slice(0, 12)),
      el('span', { class: 'xs-holdcol', title: 'How many frames the drawing stays: slide sideways or tap to change' }, 'Hold'),
      el('span', { class: 'xs-note' }, `Notes · ${p.fps} fps`),
    );
    const frag = document.createDocumentFragment();
    let frame = 0;
    p.exposures.forEach((e, i) => {
      const d = p.drawing(e.drawing);
      for (let k = 0; k < e.length; k++, frame++) {
        const row = el('div', {
          class: `xs-row${isSecondBoundary(frame, p.fps) ? ' second' : ''}${sel.has(i) ? ' selected' : ''}`,
          'data-frame': String(frame),
          'data-exp': String(i),
          'data-start': k === 0 ? '1' : '0',
        });
        const cell = el('span', { class: `xs-cell${k === 0 ? '' : ' hold'}${d.role ? ` role-text-${d.role}` : ''}`, 'data-num': String(d.num) });
        if (k === 0) cell.textContent = String(d.num);
        const holdCell = el('span', { class: 'xs-holdcol' });
        if (k === 0) holdCell.append(el('button', { type: 'button', class: 'xs-hold', title: `Held ${e.length} frame${e.length === 1 ? '' : 's'}: slide sideways to change, or tap to type`, 'aria-label': `Hold ${e.length} frames` }, String(e.length)));
        row.append(el('span', { class: 'xs-fno' }, frameLabel(frame, p.fps, this.format)), cell, holdCell, el('span', { class: 'xs-note' }, k === 0 ? (e.note ?? '') : ''));
        frag.append(row);
      }
    });
    this.body.replaceChildren(frag);
  }
}
