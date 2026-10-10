import type { App } from '../app';
import { FRAME_FORMATS, frameLabel, isSecondBoundary, type FrameFormat } from '../core/timecode';
import { commonHold } from '../core/timeline';

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
  private dragging = false;
  private editing: HTMLInputElement | null = null;

  constructor(
    private readonly app: App,
    private readonly root: HTMLElement,
  ) {
    root.classList.add('xsheet');
    const bar = el('div', { class: 'xs-bar' });
    this.formatSel = el('select', { 'aria-label': 'Frame numbers', title: 'How frame numbers are shown' });
    for (const f of FRAME_FORMATS) this.formatSel.append(el('option', { value: f.id }, f.label));
    this.formatSel.value = this.format;
    this.formatSel.addEventListener('change', () => {
      this.format = this.formatSel.value as FrameFormat;
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

    this.head = el('div', { class: 'xs-head' });
    this.body = el('div', { class: 'xs-body', tabindex: '0', 'data-own-keys': '', 'aria-label': 'Exposure sheet' });
    root.append(bar, this.head, this.body);
    this.bind();
  }

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

  private bind(): void {
    const app = this.app;
    this.body.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || this.editing) return;
      const row = this.rowOf(e.target);
      if (!row) return;
      if ((e.target as HTMLElement).closest('.xs-note')) {
        this.editNote(row);
        return;
      }
      const frame = Number(row.dataset.frame);
      const index = Number(row.dataset.exp);
      this.body.focus();
      this.dragging = true;
      try {
        this.body.setPointerCapture(e.pointerId);
      } catch {
        // capture can fail for stale pointers
      }
      if (e.shiftKey && this.anchor !== null) {
        this.selectRange(this.anchor, index);
      } else {
        this.anchor = index;
        app.setSelection([index]);
      }
      app.setFrame(frame);
    });
    this.body.addEventListener('pointermove', (e) => {
      if (!this.dragging || this.anchor === null) return;
      const r = this.body.getBoundingClientRect();
      const rows = this.body.querySelectorAll<HTMLElement>('.xs-row');
      const first = rows[0];
      if (!first) return;
      const h = first.getBoundingClientRect().height || 26;
      const f = Math.max(0, Math.min(rows.length - 1, Math.floor((e.clientY - r.top + this.body.scrollTop) / h)));
      const row = rows[f];
      if (row) this.selectRange(this.anchor, Number(row.dataset.exp));
    });
    const stop = () => (this.dragging = false);
    this.body.addEventListener('pointerup', stop);
    this.body.addEventListener('pointercancel', stop);
    this.body.addEventListener('dblclick', (e) => {
      const row = this.rowOf(e.target);
      if (row && !(e.target as HTMLElement).closest('.xs-note')) this.editCell(row);
    });
    this.body.addEventListener('keydown', (e) => this.onKey(e));
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
    if (mod) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      app.setFrame(app.frame + (e.key === 'ArrowDown' ? 1 : -1));
      this.anchor = app.targets[0] ?? null;
      app.setSelection(app.targets.slice(0, 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = this.body.querySelector<HTMLElement>(`.xs-row[data-frame="${app.frame}"]`);
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
      const row = this.body.querySelector<HTMLElement>(`.xs-row[data-frame="${app.frame}"]`);
      if (row) this.editCell(row, e.key);
      return;
    }
    // everything else behaves as it does on the canvas (play, N, D, K/B/I...)
    if (e.key === ' ') {
      e.preventDefault();
      app.togglePlay();
    } else if (e.key === 'n' || e.key === 'N') app.addFrame();
    else if (e.key === 'd' || e.key === 'D') app.duplicateFrame();
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

  private editNote(row: HTMLElement): void {
    const noteEl = row.querySelector<HTMLElement>('.xs-note');
    if (!noteEl || this.editing) return;
    const index = Number(row.dataset.exp);
    const isStart = row.dataset.start === '1';
    if (!isStart) {
      // notes live on the first frame of a drawing
      this.app.setFrame(Number(row.dataset.frame));
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
    if (cur && Number(cur.dataset.frame) !== app.frame) cur.classList.remove('current');
    const row = this.body.querySelector<HTMLElement>(`.xs-row[data-frame="${app.frame}"]`);
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
      el('span', { class: 'xs-note' }, `Notes · ${p.fps} fps`),
    );
    const frag = document.createDocumentFragment();
    let frame = 0;
    p.exposures.forEach((e, i) => {
      const d = p.drawing(e.drawing);
      for (let k = 0; k < e.length; k++, frame++) {
        const row = el('div', { class: `xs-row${isSecondBoundary(frame, p.fps) ? ' second' : ''}${sel.has(i) ? ' selected' : ''}`, 'data-frame': String(frame), 'data-exp': String(i), 'data-start': k === 0 ? '1' : '0' });
        const cell = el('span', { class: `xs-cell${k === 0 ? '' : ' hold'}${d.role ? ` role-text-${d.role}` : ''}`, 'data-num': String(d.num) });
        if (k === 0) cell.textContent = String(d.num);
        row.append(el('span', { class: 'xs-fno' }, frameLabel(frame, p.fps, this.format)), cell, el('span', { class: 'xs-note' }, k === 0 ? (e.note ?? '') : ''));
        frag.append(row);
      }
    });
    this.body.replaceChildren(frag);
  }
}
