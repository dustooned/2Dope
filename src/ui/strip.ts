import type { ExtraRows } from './rails';
import type { App } from '../app';
import { ACTIVE_H, buildRails, foldKeys, drawRailState } from './rails';
import { autoIcon, decorate, setLabel } from './icons';
import { FPS_PRESETS, ROLES, type Drawing, type Role } from '../core/project';
import { blockDropIndex, commonHold, dropIndex, indicesInFrames, locate, moveBlock, moveExposure, setHolds, startOf, totalFrames, type Exposure } from '../core/timeline';
import { rulerStep } from '../core/timecode';
import { HOLD_MS, HOLD_SLOP, showContextMenu, swallowNextClick } from './contextmenu';
import { frameMenu } from './framemenu';

const THUMB_W = 56;
const THUMB_H = 32;
const RULER_H = 18;
const HANDLE_W = 9;
const DRAG_THRESHOLD = 4;
const ZOOM_KEY = '2dope.m1.cell';

const ROLE_LETTER: Record<Role, string> = { key: 'K', breakdown: 'B', inbetween: 'I' };
const ROLE_NAME: Record<Role, string> = { key: 'Key', breakdown: 'Breakdown', inbetween: 'Inbetween' };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function loadCell(): number {
  try {
    const n = Number(localStorage.getItem(ZOOM_KEY));
    if (n >= 20 && n <= 120) return n;
  } catch {
    // storage unavailable: use the default
  }
  return 64;
}

type Drag =
  | { kind: 'scrub' }
  | { kind: 'resize'; index: number; before: Exposure[]; startX: number; moved: boolean }
  | { kind: 'move'; index: number; before: Exposure[]; startX: number; moved: boolean; shift: boolean }
  | { kind: 'marquee'; x0: number; y0: number; base: number[]; moved: boolean };

/**
 * The timeline strip. One block per drawing, as wide as its hold.
 * - Drag a block's right edge to change its hold (all selected blocks follow).
 * - Drag a block to reorder it. Click selects; Shift+click adds; drag on empty space to marquee-select.
 * - Drag on the ruler to scrub.
 * - Exposure buttons (1s 2s 3s 4s or a number) re-space the selected drawings without deleting any.
 * - K / B / I mark drawings as key, breakdown or inbetween.
 */
export class Strip {
  private readonly track: HTMLElement;
  private readonly inner: HTMLElement;
  private readonly playhead: HTMLElement;
  private readonly marquee: HTMLElement;
  private readonly frameLabel: HTMLElement;
  private readonly expLabel: HTMLElement;
  private readonly expInput: HTMLInputElement;
  private readonly playBtn: HTMLButtonElement;
  private readonly fpsSel: HTMLSelectElement;
  private readonly onionBtn: HTMLButtonElement;
  private readonly keysBtn: HTMLButtonElement;
  private readonly lockBtn: HTMLButtonElement;
  private readonly beforeSel: HTMLSelectElement;
  private readonly afterSel: HTMLSelectElement;
  private readonly opacityRange: HTMLInputElement;
  private readonly zoomRange: HTMLInputElement;
  private readonly lockMark: HTMLElement;
  private readonly roleBtns = new Map<Role, HTMLButtonElement>();
  private readonly thumbs = new Map<string, { rev: number; canvas: HTMLCanvasElement }>();
  private signature = '';
  /** Sounds as rows under the layers (the tracks sheet); set by main. */
  audio: { active(): boolean; sig(): string; rows: ExtraRows } | null = null;
  private cell = loadCell();
  private drag: Drag | null = null;
  private flipBtn!: HTMLButtonElement;
  /** Which rail rows are folded open (groups, LINE / FILL). */
  private readonly rails = drawRailState;
  private readonly smallThumbs = new Map<string, { rev: number; canvas: HTMLCanvasElement }>();
  private selBtn!: HTMLButtonElement;
  /** Holds, marks, onion settings and layer toggles (shown in the Time workspace). */
  readonly timingBar: HTMLElement;
  private readonly togglesRow: HTMLElement;
  private togglesSig = '';
  private layerChip!: HTMLButtonElement;
  /** The flipbook's blank page after the last drawing (tap it, then draw). */
  private readonly blank = el('div', { class: 'blankpage', title: 'Add a frame at the end' }, '+');

  constructor(
    private readonly app: App,
    root: HTMLElement,
  ) {
    const bar = el('div', { class: 'strip-bar' });
    const btn = (label: string, title: string, fn: () => void, cls = '') => {
      const b = el('button', { type: 'button', title, class: cls }, label);
      b.addEventListener('click', fn);
      return autoIcon(b);
    };
    this.playBtn = btn('Play', 'Play / pause (Enter or tap Space)', () => app.togglePlay(), 'play');
    this.frameLabel = el('span', { class: 'readout frame-readout', role: 'button', tabindex: '0', title: 'Frame / length. Tap to show frames, seconds + frames, or timecode.' });
    this.frameLabel.addEventListener('click', () => app.cycleTimeFormat());
    this.fpsSel = el('select', { 'aria-label': 'Frames per second', title: 'Frames per second' });
    for (const f of FPS_PRESETS) this.fpsSel.append(el('option', { value: String(f) }, `${f} fps`));
    this.fpsSel.addEventListener('change', () => app.setFps(Number(this.fpsSel.value)));

    const nav = el('div', { class: 'group' });
    nav.append(
      btn('⏮', 'Previous drawing (↓)', () => app.prevDrawing()),
      btn('◀', 'Previous frame (←)', () => app.prevFrame()),
      this.playBtn,
      btn('▶', 'Next frame (→)', () => app.nextFrame()),
      btn('⏭', 'Next drawing (↑)', () => app.nextDrawing()),
    );

    const edit = el('div', { class: 'group' });
    edit.append(
      btn('+ Frame', 'New drawing after this frame (N)', () => app.addFrame()),
      btn('Duplicate', 'Duplicate drawing (D)', () => void app.duplicateSelection()),
      btn('Delete', 'Delete the selected drawings, or this one (Delete)', () => app.deleteFrame()),
      btn('Split', 'Split the hold at the playhead: the rest gets a copy of the drawing to redraw', () => void app.splitHold()),
      (this.selBtn = btn('Select', 'Select several: tap frames to add or remove them (Shift+click on a computer)', () => app.setMultiSelect(!app.multiSelect))),
      (this.flipBtn = btn('Flipbook', 'Flipbook: a fresh blank page after the last drawing. Draw on it to add the frame, tap again for the next.', () => app.flipToBlank())),
    );

    // Exposure: how many frames each selected drawing is held (on ones, twos, threes...).
    const exposure = el('div', { class: 'group', role: 'group', 'aria-label': 'Exposure' });
    exposure.append(el('span', { class: 'name' }, 'Hold'));
    for (const n of [1, 2, 3, 4]) exposure.append(btn(`${n}s`, `Hold the selected drawings for ${n} frame${n > 1 ? 's' : ''} each (${n})`, () => app.setExposure(n)));
    this.expInput = el('input', { type: 'number', min: '1', max: '99', step: '1', 'aria-label': 'Exposure in frames', title: 'Type a number of frames and press Enter', class: 'exp-input' });
    this.expInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.stopPropagation();
      const n = Math.round(Number(this.expInput.value));
      if (n >= 1 && n <= 99) app.setExposure(n);
      this.expInput.blur();
    });
    this.expInput.addEventListener('keyup', (e) => e.stopPropagation());
    this.expLabel = el('span', { class: 'readout exp-readout', title: 'Exposure of the selected drawings (or the current one)' });
    exposure.append(
      this.expInput,
      this.expLabel,
      btn('−', 'One frame shorter (−)', () => app.changeHold(-1)),
      btn('+', 'One frame longer (=)', () => app.changeHold(1)),
    );

    // Roles: what each drawing is for.
    const roles = el('div', { class: 'group', role: 'group', 'aria-label': 'Drawing role' });
    roles.append(el('span', { class: 'name' }, 'Mark'));
    for (const r of ROLES) {
      const b = btn(ROLE_LETTER[r], `${ROLE_NAME[r]}: mark the selected drawings as a ${r} (click again to clear)`, () => app.setRole(r), `role role-${r}`);
      this.roleBtns.set(r, b);
      roles.append(b);
    }

    const onion = el('div', { class: 'group' });
    this.onionBtn = btn('Onion', 'Onion skin on/off (O)', () => app.toggleOnion());
    const count = (label: string, title: string, get: () => number, set: (n: number) => void) => {
      const sel = el('select', { 'aria-label': title, title });
      for (let n = 0; n <= app.device.limits.onionMax; n++) sel.append(el('option', { value: String(n) }, String(n)));
      sel.value = String(get());
      sel.addEventListener('change', () => {
        set(Number(sel.value));
        app.onionChanged();
      });
      onion.append(el('span', { class: 'name' }, label), sel);
      return sel;
    };
    this.beforeSel = count(
      '◀',
      'Previous drawings shown (blue)',
      () => app.onion.before,
      (n) => (app.onion.before = n),
    );
    this.afterSel = count(
      '▶',
      'Next drawings shown (red)',
      () => app.onion.after,
      (n) => (app.onion.after = n),
    );
    this.opacityRange = el('input', { type: 'range', min: '0.1', max: '0.9', step: '0.05', 'aria-label': 'Onion opacity', title: 'Onion opacity', class: 'onion-opacity' });
    this.opacityRange.value = String(app.onion.opacity);
    this.opacityRange.addEventListener('input', () => {
      app.onion.opacity = Number(this.opacityRange.value);
      app.onionChanged();
    });
    onion.append(this.opacityRange);
    this.keysBtn = btn('Keys only', 'Onion skin shows only drawings marked as keys', () => {
      app.onion.keysOnly = !app.onion.keysOnly;
      app.onionChanged();
    });
    onion.append(this.keysBtn);
    this.lockBtn = btn('Lock', 'Scrub lock (L): mark this frame as home. Drag the ruler or hold Shift + arrows to flip; it snaps back when you let go.', () => app.toggleLock());
    // Draw keeps the two things you flip while drawing: onion on/off and the scrub lock
    const flip = el('div', { class: 'group' });
    flip.append(this.onionBtn, this.lockBtn);

    const zoom = el('div', { class: 'group' });
    this.zoomRange = el('input', { type: 'range', min: '20', max: '120', step: '2', 'aria-label': 'Timeline zoom', title: 'Timeline zoom', class: 'onion-opacity' });
    this.zoomRange.value = String(this.cell);
    this.zoomRange.addEventListener('input', () => {
      this.cell = Number(this.zoomRange.value);
      try {
        localStorage.setItem(ZOOM_KEY, String(this.cell));
      } catch {
        // not persisted: fine
      }
      this.signature = '';
      this.update();
    });
    zoom.append(el('span', { class: 'name' }, 'Zoom'), this.zoomRange);
    // rails: fold every group and LINE / FILL open or closed (folding only hides rows)
    const fold = el('div', { class: 'group', role: 'group', 'aria-label': 'Layer rows' });
    fold.append(
      btn('▾ All', 'Expand all: show every group and LINE / FILL row', () => {
        this.rails.setAll(foldKeys(app), true);
        this.signature = '';
        this.update();
      }),
      btn('▸ All', 'Collapse all: one row per layer', () => {
        this.rails.setAll([], false);
        this.signature = '';
        this.update();
      }),
    );
    zoom.append(fold);

    const rowA = el('div', { class: 'strip-row' });
    // which layer the strip shows (and you draw on); tap for the layer list
    this.layerChip = btn('Layer', 'The layer you draw on. Tap for all layers.', () => app.openLayers?.(this.layerChip), 'layerchip');
    decorate(this.layerChip, 'layers');
    rowA.append(this.layerChip, nav, this.frameLabel, this.fpsSel, edit, flip, zoom);
    // On the simple screen the row keeps what you use while drawing (previous / next frame, new,
    // duplicate, delete, flipbook, onion) as icons; the rest waits behind More.
    const extra = (e: Element | null | undefined) => e?.setAttribute('data-extra', '');
    extra(this.layerChip);
    extra(nav.firstElementChild);
    extra(nav.lastElementChild);
    extra(this.frameLabel);
    extra(this.fpsSel);
    for (const b of edit.querySelectorAll('button')) if (/^(Split|Select)/.test(b.textContent?.trim() ?? '')) extra(b);
    extra(this.lockBtn);
    extra(this.playBtn); // Play lives on the tracks bar
    extra(zoom);
    const more = btn('More \u22ef', 'More timeline tools: layer, frame count, fps, split, select, scrub lock, zoom', () => {
      bar.classList.toggle('show-extra');
      more.setAttribute('aria-pressed', String(bar.classList.contains('show-extra')));
    }, 'strip-more');
    rowA.append(more);
    bar.append(rowA);

    // Timing tools live in the Time workspace (mounted into the X-sheet by main.ts): holds,
    // marks, onion settings, and quick on/off toggles for layers and their Line / Fill parts.
    this.timingBar = el('div', { class: 'timing-controls' });
    const rowB = el('div', { class: 'strip-row' });
    rowB.append(exposure, roles, onion);
    this.togglesRow = el('div', { class: 'strip-row layer-toggles', role: 'group', 'aria-label': 'Show or hide layers' });
    this.timingBar.append(rowB, this.togglesRow);

    this.track = el('div', { class: 'strip-track', role: 'region', 'aria-label': 'Timeline', tabindex: '0' });
    this.inner = el('div', { class: 'strip-inner' });
    this.playhead = el('div', { class: 'strip-playhead' });
    this.marquee = el('div', { class: 'strip-marquee' });
    this.lockMark = el('div', { class: 'strip-lock', title: 'Scrub lock home frame' }, '⌂');
    this.track.append(this.inner);
    root.append(bar, this.track);

    this.bindPointer();
    this.update();
  }

  // -------------------------------------------------------------------------------------------
  // Pointer interaction

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.inner.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private frameAtX(x: number): number {
    return Math.max(0, Math.min(Math.floor(x / this.cell), this.app.project.length - 1));
  }

  /** Time zoom around a point: pinch with two fingers, or Ctrl / ⌘ + wheel. */
  private zoomAt(cell: number, clientX: number): void {
    const next = Math.max(20, Math.min(120, Math.round(cell)));
    if (next === this.cell) return;
    const r = this.track.getBoundingClientRect();
    const frame = (this.track.scrollLeft + clientX - r.left) / this.cell;
    this.cell = next;
    try {
      localStorage.setItem(ZOOM_KEY, String(this.cell));
    } catch {
      // not persisted: fine
    }
    this.signature = '';
    this.update();
    this.track.scrollLeft = frame * this.cell - (clientX - r.left);
  }

  private bindZoom(): void {
    let pinch: { d: number; cell: number } | null = null;
    const dist = (t: TouchList) => Math.hypot(t[0]!.clientX - t[1]!.clientX, t[0]!.clientY - t[1]!.clientY);
    this.track.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 2) pinch = { d: Math.max(1, dist(e.touches)), cell: this.cell };
      },
      { passive: true },
    );
    this.track.addEventListener(
      'touchmove',
      (e) => {
        if (!pinch || e.touches.length !== 2) return;
        e.preventDefault();
        this.zoomAt((pinch.cell * dist(e.touches)) / pinch.d, (e.touches[0]!.clientX + e.touches[1]!.clientX) / 2);
      },
      { passive: false },
    );
    this.track.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) pinch = null;
    });
    this.track.addEventListener(
      'wheel',
      (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        this.zoomAt(this.cell * Math.exp(-e.deltaY * 0.004), e.clientX);
      },
      { passive: false },
    );
  }

  private bindPointer(): void {
    this.bindZoom();
    const app = this.app;
    this.track.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // the rails' name tags and the other layers' rows handle their own taps
      if (target.closest('.rail-tag, .rblock')) return;
      const p = this.local(e);
      try {
        this.track.setPointerCapture(e.pointerId);
      } catch {
        // capture can fail for stale pointers; dragging still works while over the strip
      }
      if (target.closest('.blankpage')) {
        app.appendFrame();
        return;
      }
      const blockEl = target.closest<HTMLElement>('.block');
      if (blockEl) {
        const index = Number(blockEl.dataset.index);
        const before = app.project.exposures;
        if (target.classList.contains('handle')) {
          this.drag = { kind: 'resize', index, before, startX: p.x, moved: false };
          // dragging the edge of an unselected block acts on that block only
          if (!app.selection.includes(index)) app.setSelection([index]);
        } else if (app.multiSelect) {
          // Select mode: a tap adds or removes this drawing
          const sel = app.selection.includes(index) ? app.selection.filter((x) => x !== index) : [...app.selection, index].sort((a, b) => a - b);
          app.setSelection(sel);
          return;
        } else {
          this.drag = { kind: 'move', index, before, startX: p.x, moved: false, shift: e.shiftKey };
          // press and hold (still) on a drawing: its menu
          const at = { x: e.clientX, y: e.clientY };
          clearTimeout(this.holdTimer);
          this.holdTimer = window.setTimeout(() => {
            const d = this.drag;
            if (!d || d.kind !== 'move' || d.moved) return;
            this.drag = null;
            if (!app.selection.includes(index)) app.setSelection([index]);
            this.lastHold = Date.now();
            swallowNextClick();
            showContextMenu(at.x, at.y, frameMenu(app));
          }, HOLD_MS);
        }
        return;
      }
      if (p.y < RULER_H) {
        this.drag = { kind: 'scrub' };
        app.beginScrub();
        app.setLayerFrame(this.frameAtX(p.x));
        return;
      }
      this.drag = { kind: 'marquee', x0: p.x, y0: p.y, base: e.shiftKey ? [...app.selection] : [], moved: false };
    });

    this.track.addEventListener('pointermove', (e) => {
      const d = this.drag;
      if (!d) return;
      const p = this.local(e);
      if (d.kind === 'scrub') {
        app.setLayerFrame(this.frameAtX(p.x));
      } else if (d.kind === 'resize') {
        if (Math.abs(p.x - d.startX) > 1) d.moved = true;
        const startFrame = startOf(d.before, d.index);
        const length = Math.max(1, Math.round(p.x / this.cell - startFrame));
        const group = app.selection.includes(d.index) ? app.selection : [d.index];
        const next = setHolds(d.before, group, length);
        app.previewExposures(next);
        app.setEditLine({ frame: app.project.layer.start + startFrame + length, edge: 'out', delta: totalFrames(next) - totalFrames(d.before) });
      } else if (d.kind === 'move') {
        if (!d.moved && Math.abs(p.x - d.startX) < Math.max(DRAG_THRESHOLD, e.pointerType === 'touch' ? HOLD_SLOP : 0)) return;
        d.moved = true;
        clearTimeout(this.holdTimer);
        // a selected block drags the whole selection along
        const group = app.selection.includes(d.index) && app.selection.length > 1 ? app.selection : null;
        if (group) {
          const start = startOf(d.before, group[0]!);
          const len = group.reduce((n, i) => n + d.before[i]!.length, 0);
          const to = blockDropIndex(d.before, group, start + len / 2 + (p.x - d.startX) / this.cell);
          app.previewExposures(moveBlock(d.before, group, to).ex);
        } else {
          const to = dropIndex(d.before, d.index, p.x / this.cell);
          app.previewExposures(moveExposure(d.before, d.index, to));
        }
      } else if (d.kind === 'marquee') {
        if (!d.moved && Math.hypot(p.x - d.x0, p.y - d.y0) < DRAG_THRESHOLD) return;
        d.moved = true;
        const left = Math.min(p.x, d.x0);
        const top = Math.min(p.y, d.y0);
        Object.assign(this.marquee.style, { display: 'block', left: `${left}px`, top: `${top}px`, width: `${Math.abs(p.x - d.x0)}px`, height: `${Math.abs(p.y - d.y0)}px` });
        const f0 = Math.floor(Math.min(p.x, d.x0) / this.cell);
        const f1 = Math.floor(Math.max(p.x, d.x0) / this.cell);
        app.setSelection([...d.base, ...indicesInFrames(app.project.exposures, f0, f1)]);
      }
    });

    const finish = (e: PointerEvent, cancelled: boolean) => {
      clearTimeout(this.holdTimer);
      if (app.editLine) app.setEditLine(null);
      const d = this.drag;
      this.drag = null;
      this.marquee.style.display = 'none';
      if (!d) return;
      const p = this.local(e);
      if (d.kind === 'scrub') {
        app.endScrub();
      } else if (d.kind === 'resize') {
        if (cancelled) app.previewExposures(d.before);
        else app.commitExposures('Change hold', d.before, app.project.exposures);
      } else if (d.kind === 'move') {
        if (cancelled) {
          app.previewExposures(d.before);
        } else if (d.moved) {
          const moved = (app.selection.includes(d.index) && app.selection.length > 1 ? app.selection : [d.index]).map((i) => d.before[i]);
          app.commitExposures(moved.length > 1 ? 'Move drawings' : 'Move drawing', d.before, app.project.exposures);
          app.setSelection(moved.map((x) => app.project.exposures.indexOf(x!)).filter((i) => i >= 0));
        } else {
          // a click: select (Shift toggles) and jump to the clicked frame
          const sel = new Set(app.selection);
          if (d.shift) {
            if (sel.has(d.index)) sel.delete(d.index);
            else sel.add(d.index);
            app.setSelection([...sel]);
          } else {
            app.setSelection([d.index]);
          }
          const start = startOf(app.project.exposures, d.index);
          const len = app.project.exposures[d.index]!.length;
          app.setLayerFrame(Math.max(start, Math.min(start + len - 1, Math.floor(p.x / this.cell))));
        }
      } else if (d.kind === 'marquee' && !d.moved && !cancelled) {
        // a click on empty space: clear the selection and move the playhead
        if (!d.base.length) app.setSelection([]);
        app.setLayerFrame(this.frameAtX(p.x));
      }
    };
    this.track.addEventListener('pointerup', (e) => finish(e, false));
    this.track.addEventListener('pointercancel', (e) => finish(e, true));
    this.track.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (Date.now() - this.lastHold < 1000) return; // the hold already opened it
      const blockEl = (e.target as HTMLElement).closest<HTMLElement>('.block');
      if (!blockEl) return;
      const index = Number(blockEl.dataset.index);
      if (!app.selection.includes(index)) app.setSelection([index]);
      showContextMenu(e.clientX, e.clientY, frameMenu(app));
    });
  }

  private holdTimer = 0;
  private readonly editLineEl = el('div', { class: 'editline' });
  private readonly editShiftEl = el('div', { class: 'editshift' });

  /** The edge being changed (from any timeline), as a line on this one, with what will shift shaded. */
  private drawEditLine(): void {
    const e = this.app.editLine;
    if (!e) {
      this.editLineEl.remove();
      this.editShiftEl.remove();
      return;
    }
    const x = (e.frame - this.app.project.layer.start) * this.cell;
    this.editLineEl.style.left = `${x}px`;
    this.editLineEl.dataset.label = this.app.editLineLabel();
    this.editLineEl.classList.toggle('flip', x > this.inner.offsetWidth - 180);
    if (!this.editLineEl.isConnected) this.inner.append(this.editLineEl);
    if (e.shift) {
      this.editShiftEl.style.left = `${x}px`;
      this.editShiftEl.style.width = `${Math.max(0, this.inner.offsetWidth - x)}px`;
      if (!this.editShiftEl.isConnected) this.inner.append(this.editShiftEl);
    } else this.editShiftEl.remove();
  }
  private lastHold = 0;

  // -------------------------------------------------------------------------------------------

  /** Forget cached thumbnails and layout (a different project was loaded). */
  reset(): void {
    this.thumbs.clear();
    this.signature = '';
    this.update();
  }

  /** Call when the frame, selection or timeline changes. Rebuilds blocks only when needed. */
  update(): void {
    const app = this.app;
    const p = app.project;
    const sel = new Set(app.selection);
    const sig =
      `${this.cell}#${app.timeFormat}#${this.railSig()}#${this.audio?.active() ? this.audio.sig() : ''}#` +
      p.exposures.map((e, i) => `${e.drawing}:${e.length}:${p.drawing(e.drawing).thumbRev}:${p.drawing(e.drawing).role ?? ''}:${sel.has(i) ? 1 : 0}`).join('|');
    if (sig !== this.signature) {
      this.signature = sig;
      this.rebuild();
    }
    const cell = this.cell;
    setLabel(this.layerChip, app.project.isPlaceholder ? 'New layer' : app.project.layer.name);
    this.frameLabel.textContent = app.blankPage ? `new · ${app.fmtDur(p.length)}` : `${app.fmt(app.lf)} / ${app.fmtDur(p.length)}`;
    this.drawEditLine();
    const l = locate(p.exposures, app.lf);
    const targets = app.targets;
    const common = commonHold(p.exposures, targets);
    this.expLabel.textContent = targets.length === 0 ? '-' : common === null ? 'mixed' : `${common}`;
    this.expLabel.title = `${targets.length} drawing${targets.length === 1 ? '' : 's'} ${app.selection.length ? 'selected' : '(current)'}`;
    setLabel(this.playBtn, app.playing ? 'Pause' : 'Play', app.playing ? 'pause' : 'play');
    this.playBtn.setAttribute('aria-pressed', String(app.playing));
    this.fpsSel.value = String(p.fps);
    this.playhead.style.width = `${cell}px`;
    this.playhead.style.transform = `translateX(${(app.blankPage ? p.length : app.lf) * cell}px)`;
    this.flipBtn.setAttribute('aria-pressed', String(app.blankPage));
    this.selBtn.setAttribute('aria-pressed', String(app.multiSelect));
    this.blank.style.display = '';
    this.blank.style.left = `${p.length * cell}px`;
    this.blank.style.width = `${cell - 4}px`;
    this.blank.classList.toggle('current', app.blankPage);
    this.onionBtn.setAttribute('aria-pressed', String(app.onion.enabled));
    this.keysBtn.setAttribute('aria-pressed', String(app.onion.keysOnly));
    this.lockBtn.setAttribute('aria-pressed', String(app.lockFrame !== null));
    setLabel(this.lockBtn, app.lockFrame === null ? 'Lock' : `Home ${app.lockFrame + 1}`);
    this.beforeSel.value = String(app.onion.before);
    this.afterSel.value = String(app.onion.after);
    this.opacityRange.value = String(app.onion.opacity);
    this.zoomRange.value = String(cell);
    this.lockMark.style.display = app.lockFrame === null ? 'none' : 'block';
    this.lockMark.style.width = `${cell}px`;
    this.lockMark.style.transform = `translateX(${(app.lockFrame ?? 0) * cell}px)`;
    // role buttons show the role shared by the targeted drawings
    const roles = targets.map((i) => p.drawing(p.exposures[i]!.drawing).role);
    for (const [r, b] of this.roleBtns) b.setAttribute('aria-pressed', String(roles.length > 0 && roles.every((x) => x === r)));
    for (const b of this.inner.querySelectorAll<HTMLElement>('.block')) {
      b.classList.toggle('current', l !== null && b.dataset.index === String(l.index));
    }
    this.updateToggles();
    this.keepVisible();
  }

  /** On/off chips for each drawing layer and the active layer's Line / Fill (Time workspace). */
  private updateToggles(): void {
    const app = this.app;
    const layers = app.drawLayers();
    const active = app.project.isPlaceholder ? '' : app.project.activeLayer;
    const cur = app.project.isPlaceholder ? null : app.project.layer;
    const sig = layers.map((l) => `${l.id}:${l.name}:${l.visible}:${l.id === active}`).join('|') + `#${cur ? `${cur.parts?.line?.visible !== false}${cur.parts?.fill?.visible !== false}` : ''}`;
    if (sig === this.togglesSig) return;
    this.togglesSig = sig;
    const row = this.togglesRow;
    // one compact line, however many layers there are: the layer cards hold every eye
    row.replaceChildren(el('span', { class: 'name' }, 'Show'));
    const shown = layers.filter((l) => l.visible).length;
    const open = el('button', { type: 'button', class: 'lchip', title: 'Every layer, with its eye: the layer cards' }, `Layers ${shown}/${layers.length}`);
    decorate(open, 'layers');
    open.addEventListener('click', () => app.openLayers?.(open));
    row.append(open);
    if (shown < layers.length) {
      const all = el('button', { type: 'button', title: 'Show every layer again' }, 'Show all');
      all.addEventListener('click', () => app.editor.edit('Show all layers', (c) => { for (const l of c.layers) if (l.kind === 'drawings') l.visible = true; }));
      row.append(all);
    }
    void active;
    if (cur) {
      row.append(el('span', { class: 'name' }, `${cur.name}:`));
      for (const part of ['line', 'fill'] as const) {
        const on = cur.parts?.[part]?.visible !== false;
        const b = el(
          'button',
          { type: 'button', 'aria-pressed': String(on), title: `${on ? 'Hide' : 'Show'} the ${part === 'line' ? 'LINE (ink)' : 'FILL (colour)'} of ${cur.name}` },
          part === 'line' ? 'Line' : 'Fill',
        );
        b.addEventListener('click', () => app.togglePart(part));
        row.append(b);
      }
    }
  }

  private rebuild(): void {
    const p = this.app.project;
    const cell = this.cell;
    const sel = new Set(this.app.selection);
    this.inner.replaceChildren();
    // wide enough for the layer, and for the board's panels when they run longer
    const boardEnd = this.app.board && p.layer.id !== this.app.board.id ? this.app.panelMarks.reduce((n, m) => Math.max(n, m.start + m.length), 0) - p.layer.start : 0;
    this.inner.style.width = `${Math.max(Math.max(p.length, boardEnd) * cell + cell * 2, 200)}px`;
    const ruler = el('div', { class: 'strip-ruler' });
    const step = rulerStep(cell, p.fps, this.app.timeFormat);
    for (let f = 0; f < p.length; f++) {
      if (f % step !== 0) continue;
      const n = el('span', {}, this.app.fmt(f));
      n.style.left = `${f * cell}px`;
      n.style.width = `${cell}px`;
      ruler.append(n);
    }
    this.inner.append(ruler);
    // every layer as a rail (front on top); the layer you draw on is the editable row
    const rails = buildRails(
      this.app,
      this.rails,
      cell,
      RULER_H,
      p.layer.start,
      Math.max(p.length * cell + cell * 2, 200),
      (d) => this.smallThumb(d),
      () => {
        this.signature = '';
        this.update();
      },
      this.audio?.active() ? this.audio.rows : undefined,
    );
    this.inner.append(...rails.nodes);
    this.inner.style.setProperty('--active-top', `${rails.activeTop}px`);
    this.inner.style.height = `${Math.max(rails.height + 4, RULER_H + ACTIVE_H)}px`;
    // the storyboard's panels, so drawings can be lined up with them (not on the board itself)
    const b = this.app.board;
    if (b && p.layer.id !== b.id) {
      for (const m of this.app.panelMarks) {
        const f = m.start - p.layer.start;
        if (f + m.length <= 0) continue;
        const mark = el('span', { class: 'panel-mark', title: `Board panel ${m.n}: ${this.app.fmt(m.start)}, ${this.app.fmtDur(m.length)}` }, `P${m.n}`);
        mark.style.left = `${f * cell}px`;
        mark.style.width = `${m.length * cell}px`;
        this.inner.append(mark);
      }
    }
    p.exposures.forEach((e, i) => {
      const d = p.drawing(e.drawing);
      const width = e.length * cell - 4;
      const block = el('div', { class: `block${sel.has(i) ? ' selected' : ''}`, 'data-index': String(i) });
      block.style.left = `${startOf(p.exposures, i) * cell}px`;
      block.style.width = `${width}px`;
      if (width >= 52) block.append(this.thumb(d));
      block.append(el('span', { class: 'num' }, String(d.num)));
      if (e.length > 1 && width >= 90) block.append(el('span', { class: 'hold-line' }));
      if (e.length > 1) block.append(el('span', { class: 'len' }, `×${e.length}`));
      if (d.role) block.append(el('span', { class: `badge role-${d.role}`, title: ROLE_NAME[d.role] }, ROLE_LETTER[d.role]));
      // the edge being dragged lights up (blocks are rebuilt while a hold is dragged)
      const dr = this.drag;
      const active = dr && dr.kind === 'resize' && (dr.index === i || (this.app.selection.includes(dr.index) && sel.has(i)));
      block.append(el('span', { class: `handle${active ? ' active' : ''}`, title: 'Drag to change the hold' }));
      this.inner.append(block);
    });
    this.inner.append(this.blank, this.lockMark, this.playhead, this.marquee);
    const used = new Set(p.exposures.map((x) => x.drawing));
    for (const id of this.thumbs.keys()) if (!used.has(id)) this.thumbs.delete(id);
  }

  /** What the rails show, for the rebuild check. */
  private railSig(): string {
    const app = this.app;
    const c = app.project.comp;
    return `${c.id}|${app.project.activeLayer}|${app.plane}|${[...this.rails.open].join(',')}|${c.layers
      .map(
        (l) =>
          `${l.id}:${l.name}:${l.visible ? 1 : 0}${l.locked ? 1 : 0}:${l.start}:${l.in}:${l.out}:${l.label}:${l.kind === 'drawings' ? `${l.exposures.map((e) => `${e.drawing}.${e.length}`).join('/')}:${l.parts?.line?.visible !== false}${l.parts?.fill?.visible !== false}` : l.kind === 'comp' ? l.comp : ''}`,
      )
      .join('|')}`;
  }

  /** A small preview for a rail block (separate from the editable row's thumbnails). */
  private smallThumb(d: Drawing): HTMLCanvasElement {
    const hit = this.smallThumbs.get(d.id);
    if (hit && hit.rev === d.thumbRev) return hit.canvas.cloneNode(true) as HTMLCanvasElement;
    const c = el('canvas', { width: '48', height: '28', class: 'rthumb' });
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 48, 28);
      const t = d.thumb;
      if (t) {
        const s = Math.min(48 / t.width, 28 / t.height);
        g.drawImage(t, 0, 0, t.width * s, t.height * s);
      }
    }
    this.smallThumbs.set(d.id, { rev: d.thumbRev, canvas: c });
    const copy = c.cloneNode(true) as HTMLCanvasElement;
    copy.getContext('2d')?.drawImage(c, 0, 0);
    return copy;
  }

  private thumb(d: Drawing): HTMLCanvasElement {
    const hit = this.thumbs.get(d.id);
    if (hit && hit.rev === d.thumbRev) return hit.canvas;
    const c = hit?.canvas ?? el('canvas', { width: String(THUMB_W * 2), height: String(THUMB_H * 2), class: 'thumb' });
    const g = c.getContext('2d');
    if (g) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, c.width, c.height);
      // the drawing keeps its own small preview, even while its pixels are parked
      const t = d.thumb;
      if (t) {
        const s = Math.min(c.width / t.width, c.height / t.height);
        g.drawImage(t, 0, 0, t.width * s, t.height * s);
      }
    }
    this.thumbs.set(d.id, { rev: d.thumbRev, canvas: c });
    return c;
  }

  private keepVisible(): void {
    if (this.drag) return; // do not scroll under the user's pointer
    const x = this.app.lf * this.cell;
    const t = this.track;
    if (x < t.scrollLeft) t.scrollLeft = x - this.cell;
    else if (x + this.cell > t.scrollLeft + t.clientWidth) t.scrollLeft = x + this.cell * 2 - t.clientWidth;
  }
}
