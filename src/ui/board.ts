import type { App } from '../app';
import { CAPTION_FIELDS, type CaptionField } from '../core/timeline';
import type { AudioPlayback } from '../audio';
import { openBoardExport } from './boardexport';
import { BoardTimeline } from './boardtimeline';
import { attachContextMenu, type CtxItem } from './contextmenu';
import { frameMenu } from './framemenu';
import { autoIcon, decorate, setLabel } from './icons';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

const ROWS: Record<CaptionField, number> = { shot: 1, camera: 1, dialogue: 2, action: 2, slug: 1, note: 2 };
const HINT: Record<CaptionField, string> = { shot: 'Shot (e.g. Sc 1 \u00b7 Sh 2)', camera: 'Camera (e.g. Wide, pan left)', dialogue: 'What is said', action: 'What happens', slug: 'Timing (e.g. hold, beat)', note: 'Notes' };
const WRITING_LABEL: Record<CaptionField, string> = { shot: 'Shot / scene', camera: 'Camera / framing', dialogue: 'Dialogue / narration', action: 'Action', slug: 'Timing / beats', note: 'Production notes' };
/** Quick picks for the camera field (type anything, or pick one). */
const CAMERA_PICKS = ['Wide', 'Medium', 'Close-up', 'Extreme close-up', 'Over the shoulder', 'Point of view', 'Bird\u2019s eye', 'Low angle', 'Static', 'Pan left', 'Pan right', 'Tilt up', 'Tilt down', 'Dolly in', 'Dolly out', 'Zoom in', 'Zoom out', 'Truck left', 'Truck right', 'Shake'];

/**
 * The Board workspace's storyboard (doc 16): one card per panel with its picture, duration and
 * captions (dialogue, action, slugging, notes). Type straight into a card; Return moves to the same
 * field of the next panel, so a scene's dialogue goes in one run. The canvas above draws on the
 * selected panel. Panels are the frames of the board's guide layer, so retiming here is retiming
 * everywhere, and the board stays out of final renders.
 */
export class BoardPanel {
  private readonly bar = el('div', { class: 'board-bar' });
  private readonly cards = el('div', { class: 'board-cards', role: 'list', 'aria-label': 'Panels' });
  private readonly info = el('span', { class: 'hint board-info' });
  private readonly playBtn: HTMLButtonElement;
  private readonly fileIn = el('input', { type: 'file', accept: 'image/*', multiple: '', hidden: '' });
  private sig = '';
  private thumbs = new Map<string, number>();
  /** Panels (cards), Timeline (blocks on the clock, with audio) or Split (both). Remembered per device. */
  private view: 'panels' | 'timeline' | 'split' = 'panels';
  private readonly timeline: BoardTimeline;
  private readonly viewBtns: HTMLButtonElement[] = [];

  constructor(
    private readonly app: App,
    private readonly root: HTMLElement,
  ) {
    const btn = (label: string, title: string, fn: () => unknown, icon?: string) => {
      const b = el('button', { type: 'button', title }, label);
      b.addEventListener('click', () => void fn());
      if (icon) decorate(b, icon);
      else autoIcon(b);
      return b;
    };
    this.timeline = new BoardTimeline(app);
    try {
      const v = localStorage.getItem('2dope.board.view');
      if (v === 'timeline' || v === 'split') this.view = v;
    } catch {
      // default view
    }
    const views = el('div', { class: 'seg board-views', role: 'group', 'aria-label': 'Board view' });
    for (const [v, label, hint] of [
      ['panels', '▦ Panels', 'Cards: picture, timing and captions for each panel'],
      ['timeline', '▭ Timeline', 'Panels on the clock, as long as they last, with the audio underneath'],
      ['split', '◫ Split', 'Timeline on top, cards below'],
    ] as const) {
      const b = el('button', { type: 'button', title: hint }, label);
      b.addEventListener('click', () => this.setView(v));
      this.viewBtns.push(b);
      views.append(b);
    }
    this.playBtn = btn('Play', 'Play the animatic (dialogue shows as subtitles)', () => app.togglePlay());
    this.playBtn.classList.add('icon-only');
    this.fileIn.addEventListener('change', async () => {
      const files = [...(this.fileIn.files ?? [])];
      this.fileIn.value = '';
      if (!app.board) app.createBoard();
      const n = await app.importPanels(files);
      if (n) app.onNotice?.(`${n} panel${n > 1 ? 's' : ''} imported.`);
    });
    this.bar.append(
      el('span', { class: 'board-title' }, 'Storyboard'),
      this.info,
      views,
      btn('Panel', 'New panel after this one', () => app.addPanel(), 'plus'),
      btn('Duplicate', 'Duplicate the selected panels', () => app.duplicateSelection()),
      btn('Delete', 'Delete the selected panels', () => app.deleteFrame()),
      btn('Earlier', 'Move the selected panels earlier', () => app.moveSelection(-1), 'prev'),
      btn('Later', 'Move the selected panels later', () => app.moveSelection(1), 'next'),
      btn('Images', 'Import images as panels (board sketches, photos)', () => this.fileIn.click(), 'export'),
      this.playBtn,
      btn('Export', 'Export the storyboard as PDF pages or panel PNGs with captions', () => openBoardExport(app, (m) => app.onNotice?.(m)), 'export'),
      btn('Animate this shot', 'Draw the animation on top of the board', () => app.animateShot(), 'draw'),
    );
    for (const b of this.bar.querySelectorAll<HTMLButtonElement>('button')) if (['Duplicate', 'Delete', 'Earlier', 'Later'].includes(b.getAttribute('aria-label') ?? '')) b.classList.add('icon-only');
    root.append(this.bar, this.timeline.root, this.cards, this.fileIn);
    this.applyView();
    attachContextMenu(this.cards, ({ target }) => {
      const card = (target as HTMLElement | null)?.closest<HTMLElement>('.bcard');
      if (!card || (target as HTMLElement).closest('textarea, input')) return null;
      const i = Number(card.dataset.i);
      if (!app.selection.includes(i)) app.goPanel(i);
      return frameMenu(app);
    });
    this.update();
  }

  /** The shared audio playback (for waveforms on the timeline view). */
  setAudio(a: AudioPlayback): void {
    this.timeline.setAudio(a);
    this.update();
  }

  /** A sound's hold menu on the board timeline (settings, mute, delete). */
  setSoundMenu(menu: (id: string) => CtxItem[] | null): void {
    this.timeline.soundMenu = menu;
  }

  /** The board view shown now (the bubbles light the matching chip). */
  get currentView(): 'panels' | 'timeline' | 'split' {
    return this.view;
  }

  /** Open the image picker: each image becomes a panel. */
  pickImages(): void {
    this.fileIn.click();
  }

  setView(v: 'panels' | 'timeline' | 'split'): void {
    this.view = v;
    try {
      localStorage.setItem('2dope.board.view', v);
    } catch {
      // not remembered
    }
    this.applyView();
    this.update();
  }

  private applyView(): void {
    this.root.dataset.view = this.view;
    this.viewBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(['panels', 'timeline', 'split'][i] === this.view)));
    this.timeline.root.hidden = this.view === 'panels' || !this.app.board;
    this.cards.hidden = this.view === 'timeline' && !!this.app.board;
  }

  /** Refresh: rebuild the cards when panels change (never while typing in one). */
  update(): void {
    const app = this.app;
    const b = app.board;
    this.applyView();
    this.timeline.update();
    setLabel(this.playBtn, app.playing ? 'Pause' : 'Play', app.playing ? 'pause' : 'play');
    if (!b) {
      if (this.sig !== 'empty') {
        this.sig = 'empty';
        this.info.textContent = '';
        const empty = el('div', { class: 'board-empty' });
        const start = el('button', { type: 'button', class: 'primary' }, 'Start a storyboard');
        start.addEventListener('click', () => app.createBoard());
        const imp = el('button', { type: 'button' }, 'Import board images…');
        imp.addEventListener('click', () => this.fileIn.click());
        empty.append(
          el('p', {}, 'Plan the shot first: rough panels, dialogue, action and timing.'),
          el('p', { class: 'hint' }, 'The board plays under your drawing as a guide and stays out of the final render. You can also skip it and go straight to Draw.'),
          start,
          imp,
        );
        this.cards.replaceChildren(empty);
      }
      this.bar.classList.add('none');
      return;
    }
    this.bar.classList.remove('none');
    const p = app.project;
    const ex = b.exposures;
    const fps = p.comp.fps;
    const total = ex.reduce((n, e) => n + e.length, 0);
    this.info.textContent = `${ex.length} panel${ex.length === 1 ? '' : 's'} · ${app.fmtDur(total)}`;
    const typing = this.cards.contains(document.activeElement) && (document.activeElement as HTMLElement).matches('textarea, input');
    const sig =
      `${b.id}|${fps}|${app.timeFormat}|` +
      ex.map((e) => `${e.drawing}:${e.length}:${CAPTION_FIELDS.map((f) => e[f.key] ?? '').join(':')}:${p.drawings.get(e.drawing)?.thumbRev ?? 0}`).join('|');
    if (sig !== this.sig && !typing) {
      this.sig = sig;
      this.rebuild();
    }
    // current and selected panels
    const cur = app.lf;
    let at = 0;
    this.cards.querySelectorAll<HTMLElement>('.bcard').forEach((c, i) => {
      const len = ex[i]?.length ?? 0;
      c.classList.toggle('on', cur >= at && cur < at + len);
      c.classList.toggle('selected', app.selection.includes(i));
      at += len;
    });
  }

  private rebuild(): void {
    const app = this.app;
    const b = app.board!;
    const p = app.project;
    const frag = document.createDocumentFragment();
    let startAt = b.start;
    b.exposures.forEach((e, i) => {
      if (i > 0) startAt += b.exposures[i - 1]!.length;
      const card = el('div', { class: 'bcard', role: 'listitem', 'data-i': String(i) });
      const head = el('div', { class: 'bhead' });
      head.append(el('span', { class: 'bnum' }, String(i + 1)));
      const dur = el('input', {
        type: 'number',
        min: '1',
        max: '9999',
        step: '1',
        value: String(e.length),
        class: 'bdur',
        'aria-label': `Panel ${i + 1} duration in frames`,
        title: 'Duration in frames',
      });
      dur.addEventListener('change', () => app.setPanelDuration(i, Number(dur.value)));
      dur.addEventListener('keydown', (k) => k.stopPropagation());
      head.append(dur, el('span', { class: 'hint', title: 'Starts at · lasts' }, `f · @${app.fmt(startAt)} · ${app.fmtDur(e.length)}`));
      card.append(head);
      // the picture: tap to go to this panel (the canvas above draws on it)
      const thumb = el('canvas', { class: 'bthumb', width: '192', height: String(Math.round((192 * p.height) / p.width)) });
      this.paintThumb(thumb, e.drawing);
      thumb.addEventListener('click', () => app.goPanel(i));
      card.append(thumb);
      for (const f of CAPTION_FIELDS) {
        // shot and camera are one line (camera offers quick picks); the rest are small text boxes
        const line = f.key === 'shot' || f.key === 'camera';
        const t = line
          ? el('input', { type: 'text', class: `bfield bline${f.key === 'camera' ? ' bcam' : ''}`, placeholder: HINT[f.key], 'aria-label': `Panel ${i + 1} ${WRITING_LABEL[f.key]}`, 'data-field': f.key, maxlength: String(f.max), ...(f.key === 'camera' ? { list: 'board-camera-picks' } : {}) })
          : el('textarea', { class: 'bfield', rows: String(ROWS[f.key]), placeholder: HINT[f.key], 'aria-label': `Panel ${i + 1} ${WRITING_LABEL[f.key]}`, 'data-field': f.key, maxlength: String(f.max) });
        t.value = e[f.key] ?? '';
        t.addEventListener('focus', () => {
          if (!app.selection.includes(i) || app.selection.length > 1) app.goPanel(i);
          // the on-screen keyboard can cover it: keep the box you type in in view
          setTimeout(() => t.scrollIntoView({ block: 'nearest', inline: 'nearest' }), 250);
        });
        const commit = () => {
          if ((app.board?.exposures[i]?.[f.key] ?? '') !== t.value.trim()) app.setCaption(i, f.key, t.value);
        };
        t.addEventListener('change', commit);
        (t as HTMLElement).addEventListener('keydown', (k) => {
          k.stopPropagation();
          if (k.key === 'Enter' && !k.shiftKey) {
            // Return: on to the same field of the next panel (Shift+Return for a new line)
            k.preventDefault();
            commit();
            const next = this.cards.querySelector<HTMLTextAreaElement | HTMLInputElement>(`.bcard[data-i="${i + 1}"] [data-field="${f.key}"]`);
            if (next) next.focus();
            else t.blur();
          } else if (k.key === 'Escape') {
            t.value = app.board?.exposures[i]?.[f.key] ?? '';
            t.blur();
          }
        });
        t.addEventListener('blur', () => setTimeout(() => this.update(), 0));
        const field = el('label', { class: 'board-writing-field' });
        field.append(el('span', {}, WRITING_LABEL[f.key]), t);
        card.append(field);
      }
      frag.append(card);
    });
    // the camera quick picks (one list for every panel)
    if (!document.getElementById('board-camera-picks')) {
      const dl = el('datalist', { id: 'board-camera-picks' });
      for (const c of CAMERA_PICKS) dl.append(el('option', { value: c }));
      document.body.append(dl);
    }
    this.cards.replaceChildren(frag);
    // keep the current panel in view
    const at = this.cards.querySelector<HTMLElement>('.bcard.on');
    at?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private paintThumb(c: HTMLCanvasElement, drawingId: string): void {
    const g = c.getContext('2d');
    const d = this.app.project.drawings.get(drawingId);
    if (!g) return;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    const t = d?.thumb;
    if (t) g.drawImage(t, 0, 0, c.width, c.height);
    if (d) this.thumbs.set(drawingId, d.thumbRev);
  }
}
