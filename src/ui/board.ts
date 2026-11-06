import { StoryNavigator } from './storynav';
import type { App } from '../app';
import { boardSpeakers, formatDialogue, parseDialogue, splitPanel, SPEAKER_MAX, type DialogueLine } from '../core/dialogue';
import { CAPTION_FIELDS, type CaptionField } from '../core/timeline';
import type { AudioPlayback } from '../audio';
import { BoardTimeline } from './boardtimeline';
import { BoardGrid } from './boardgrid';
import { parseScript, SCRIPT_MAX_PANELS } from '../core/script';
import { MOVE_STICKERS, SHOT_STICKERS, sceneColour, scenesOf, stickersOf, toggleMove, toggleShot } from '../core/scenes';
import { askLongText } from './dialogs';
import { attachContextMenu, showContextMenu, type CtxItem } from './contextmenu';
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
/** Story's views of the one board: Grid (pictures), Panels (cards to write on), Timeline, or Both. */
export type BoardView = 'grid' | 'panels' | 'timeline' | 'split';
const BOARD_VIEWS: BoardView[] = ['grid', 'panels', 'timeline', 'split'];

export class BoardPanel {
  private readonly bar = el('div', { class: 'board-bar' });
  private readonly canvasStatus = el('div', { class: 'story-canvas-status', 'aria-label': 'Current story sketch' });
  private readonly panelWorkspace = el('div', { class: 'story-panel-workspace' });
  private readonly navigator: StoryNavigator;
  private readonly cards = el('div', { class: 'board-cards', role: 'list', 'aria-label': 'Panels' });
  private readonly info = el('span', { class: 'hint board-info' });
  private readonly playBtn: HTMLButtonElement;
  private readonly readout = el('span', { class: 'story-readout', 'aria-live': 'off' });
  private readonly addBtn: HTMLButtonElement;
  private readonly storyTools: HTMLButtonElement;
  private readonly shareBtn: HTMLButtonElement;
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly openDetails = new Set<string>();
  private detailProject: App['project'] | null = null;
  private readonly fileIn = el('input', { type: 'file', accept: 'image/*', multiple: '', hidden: '' });
  private sig = '';
  private currentCard = '';
  private thumbs = new Map<string, number>();
  /** Panels (cards), Timeline (blocks on the clock, with audio) or Split (both). Remembered per device. */
  private view: BoardView = 'panels';
  private readonly grid: BoardGrid;
  private readonly timeline: BoardTimeline;
  private readonly viewSelect = el('select', { class: 'story-view-select', 'aria-label': 'Story view' });
  private readonly viewBtns: HTMLButtonElement[] = [];

  constructor(
    private readonly app: App,
    private readonly root: HTMLElement,
    /** Export: Share, opened on the story formats (Storyboard sheets or an Animatic). */
    private readonly exportStory: () => void = () => {},
    /** Present: the board full screen for pitching (StoryPresent). */
    private readonly present: () => void = () => {},
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
      if (v === 'panels' || v === 'grid' || v === 'timeline' || v === 'split') this.view = v;
    } catch {
      // default view
    }
    const views = el('div', { class: 'seg board-views', role: 'group', 'aria-label': 'Story view' });
    for (const [v, label, icon, hint] of [
      ['grid', 'Grid', 'gallery', 'A wall of panel pictures in story order'],
      ['panels', 'Panels', 'board', 'Write dialogue and action on panel cards'],
      ['timeline', 'Timeline', 'time', 'Panel timing with audio underneath'],
      ['split', 'Split', 'splitview', 'Timeline and panel cards together'],
    ] as const) {
      const b = el('button', { type: 'button', title: hint }, label);
      decorate(b, icon);
      b.addEventListener('click', () => this.setView(v));
      this.viewSelect.append(el('option', {value:v}, label));
      this.viewBtns.push(b);
      views.append(b);
    }
    this.viewSelect.onchange = () => this.setView(this.viewSelect.value as BoardView);
    this.playBtn = btn('Play', 'Play the animatic (dialogue lines show as subtitles)', () => app.togglePlay());
    this.playBtn.classList.add('icon-only');
    this.prevBtn = btn('Previous panel', 'Go to the previous story panel', () => this.stepPanel(-1), 'prev');
    this.nextBtn = btn('Next panel', 'Go to the next story panel', () => this.stepPanel(1), 'next');
    this.prevBtn.classList.add('icon-only'); this.nextBtn.classList.add('icon-only');
    this.fileIn.addEventListener('change', async () => {
      const files = [...(this.fileIn.files ?? [])];
      this.fileIn.value = '';
      if (!app.board) app.createBoard();
      const n = await app.importPanels(files);
      if (n) app.onNotice?.(`${n} panel${n > 1 ? 's' : ''} imported.`);
    });
    this.addBtn = btn('New panel', 'Add a panel after this one', () => app.board ? app.addPanel() : app.createBoard(), 'plus');
    this.storyTools = btn('Story tools', 'Import, edit, present or animate your storyboard', () => {
      const box = this.storyTools.getBoundingClientRect(), hasBoard = !!app.board, selected = hasBoard && !!app.targets.length;
      showContextMenu(box.left, box.bottom, [
        { title: 'Bring in a story' },
        { label: 'Import panel images…', icon: 'import', run: () => this.pickImages() },
        { label: 'Paste a script…', icon: 'paste', run: () => void this.pasteScript() },
        { sep: true }, { title: 'Selected panels' },
        { label: 'Duplicate panels', icon: 'copy', disabled: !selected || app.playing, run: () => app.duplicateSelection() },
        { label: 'Move earlier', icon: 'prev', disabled: !selected || app.playing, run: () => app.moveSelection(-1) },
        { label: 'Move later', icon: 'next', disabled: !selected || app.playing, run: () => app.moveSelection(1) },
        { label: 'Delete panels', icon: 'trash', disabled: !selected || app.playing, danger: true, run: () => app.deleteFrame() },
        { sep: true }, { title: 'Use this story' },
        { label: 'Present storyboard', icon: 'play', disabled: !hasBoard, run: () => this.present() },
        { label: 'Animate this shot', icon: 'flipbook', disabled: !hasBoard || app.playing, run: () => app.animateShot() },
      ]);
    }, 'more');
    this.storyTools.setAttribute('aria-haspopup', 'menu');
    this.shareBtn = btn('Share', 'Share storyboard sheets, panel images or an animatic video', () => this.exportStory(), 'export');
    this.shareBtn.setAttribute('aria-label', 'Share storyboard');
    const help = btn('Story help', 'Story help', () => app.onOpenManual('board'), 'help'); help.classList.add('panel-help', 'icon-only');
    const transport = el('div', { class: 'story-transport', role: 'group', 'aria-label': 'Story playback' });
    transport.append(this.playBtn, this.prevBtn, this.readout, this.nextBtn);
    const heading = el('div', { class: 'story-heading' }), identity = el('div', { class: 'story-identity' });
    identity.append(el('strong', { class: 'board-title' }, 'Story'), this.info);
    const actions = el('div', { class: 'story-actions', role: 'toolbar', 'aria-label': 'Story actions' }); actions.append(this.addBtn, this.storyTools, this.shareBtn);
    heading.append(identity, actions);
    const controls = el('div', { class: 'story-controls', role: 'toolbar', 'aria-label': 'Story views' });
    controls.append(views, this.viewSelect);
    const playback = el('div', { class: 'story-playback-row' }); playback.append(transport, help);
    this.bar.append(heading, controls, playback);
    this.grid = new BoardGrid(app, (c, id) => this.paintThumb(c, id), (i) => this.writeOn(i));
    this.navigator = new StoryNavigator(app, (c, id) => this.paintThumb(c, id));
    this.panelWorkspace.append(this.navigator.root, this.cards);
    root.append(this.bar, this.timeline.root, this.grid.root, this.panelWorkspace, this.fileIn);
    if (root.parentElement?.classList.contains('stage-col')) root.parentElement.querySelector('.stage')?.append(this.canvasStatus);
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
  get currentView(): BoardView {
    return this.view;
  }

  /** Open the image picker: each image becomes a panel. */
  pickImages(): void {
    this.fileIn.click();
  }

  private stepPanel(delta: number): void {
    const board = this.app.board; if (!board) return;
    let at = 0, index = board.exposures.length - 1;
    for (let i = 0; i < board.exposures.length; i++) { at += board.exposures[i]!.length; if (this.app.lf < at) { index = i; break; } }
    this.app.goPanel(Math.max(0, Math.min(board.exposures.length - 1, index + delta)));
  }

  setView(v: BoardView): void {
    this.view = v;
    try {
      localStorage.setItem('2dope.board.view', v);
    } catch {
      // not remembered
    }
    this.applyView();
    this.update();
    this.onView();
  }

  /** Told when the view changes (the Story chips in the options row follow it). */
  onView: () => void = () => {};

  private applyView(): void {
    this.root.dataset.view = this.view; this.viewSelect.value = this.view; this.viewSelect.disabled = !this.app.board;
    this.viewBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(BOARD_VIEWS[i] === this.view)));
    this.timeline.root.hidden = this.view === 'panels' || this.view === 'grid' || !this.app.board;
    this.grid.root.hidden = this.view !== 'grid' || !this.app.board;
    this.panelWorkspace.hidden = this.cards.hidden = (this.view === 'timeline' || this.view === 'grid') && !!this.app.board;
    this.navigator.root.hidden = !this.app.board;
  }

  /** Refresh: rebuild the cards when panels change (never while typing in one). */
  update(): void {
    const app = this.app;
    const b = app.board;
    if (this.detailProject !== app.project) { this.detailProject = app.project; this.openDetails.clear(); this.sig = ''; this.currentCard = ''; this.cards.scrollTop = 0; }
    this.applyView();
    this.timeline.update();
    this.grid.update();
    setLabel(this.playBtn, app.playing ? 'Pause' : 'Play', app.playing ? 'pause' : 'play');
    this.playBtn.setAttribute('aria-pressed', String(app.playing));
    this.playBtn.disabled = !b;
    this.shareBtn.disabled = !b;
    this.addBtn.disabled = app.playing;
    for (const button of this.viewBtns) button.disabled = !b;
    this.prevBtn.disabled = !b || app.playing || app.lf <= 0;
    const end = b?.exposures.reduce((n, e) => n + e.length, 0) ?? 0;
    const lastStart = end - (b?.exposures.at(-1)?.length ?? 0);
    this.nextBtn.disabled = !b || app.playing || app.lf >= lastStart;
    this.readout.textContent = b ? `${app.fmt(app.frame)} / ${app.fmtDur(end)}` : 'No storyboard';
    if (!b) {
      this.canvasStatus.textContent = 'STORY SKETCH · Start a storyboard to draw panels';
      if (this.sig !== 'empty') {
        this.sig = 'empty';
        this.info.textContent = '';
        const empty = el('div', { class: 'board-empty' });
        const start = el('button', { type: 'button', class: 'primary' }, 'Start a storyboard');
        start.addEventListener('click', () => app.createBoard());
        const imp = el('button', { type: 'button' }, 'Import board images…');
        imp.addEventListener('click', () => this.fileIn.click());
        const script = el('button', { type: 'button' }, 'Paste a script…');
        script.addEventListener('click', () => void this.pasteScript());
        empty.append(
          el('p', {}, 'Plan the shot first: rough panels, dialogue, action and timing.'),
          el('p', { class: 'hint' }, 'The board plays under your drawing as a guide and stays out of the final render. You can also skip it and go straight to Draw.'),
          start,
          imp,
          script,
        );
        this.cards.replaceChildren(empty);
      }
      return;
    }
    const p = app.project;
    const ex = b.exposures;
    const fps = p.comp.fps;
    const total = ex.reduce((n, e) => n + e.length, 0);
    this.info.textContent = `${ex.length} panel${ex.length === 1 ? '' : 's'} · ${app.fmtDur(total)}`;
    const picked = app.targets.length;
    this.info.title = `${this.info.textContent} · ${picked} selected`;
    this.info.setAttribute('aria-label', this.info.title);
    this.cards.setAttribute('aria-label', `Story panels · ${picked} selected`);
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
    let current = ex.length - 1, clock = 0;
    for (let i = 0; i < ex.length; i++) { clock += ex[i]!.length; if (cur < clock) { current = i; break; } }
    this.canvasStatus.replaceChildren(el('strong', {}, `Sketch · Panel ${current + 1} / ${ex.length}`), el('span', {}, ex[current]?.shot || 'Draw on the canvas · write in Story'));
    this.navigator.update(current);
    this.root.dataset.currentPanel = String(current);
    const cardKey = `${app.project.activeComp}:${current}`;
    const resetScroll = cardKey !== this.currentCard && !this.cards.contains(document.activeElement);
    this.currentCard = cardKey;
    this.cards.querySelectorAll<HTMLElement>('.bcard').forEach((c, i) => {
      c.classList.toggle('on', i === current); c.hidden = i !== current;
      c.setAttribute('aria-label', `Editing story panel ${i + 1}`);
      c.classList.toggle('selected', app.selection.includes(i));
    });
    if (resetScroll) this.cards.scrollTop = 0;
  }

  private rebuild(): void {
    const app = this.app;
    const b = app.board!;
    const p = app.project;
    const frag = document.createDocumentFragment();
    let startAt = b.start;
    const scenes = scenesOf(b.exposures.map((x) => x.shot));
    b.exposures.forEach((e, i) => {
      if (i > 0) startAt += b.exposures[i - 1]!.length;
      const card = el('div', { class: 'bcard', role: 'listitem', 'data-i': String(i) });
      // the scene's colour along the top (scenes come from "Sc N" in Shot / scene)
      if (scenes[i]) { card.style.setProperty('--scene', sceneColour(scenes[i]!)); card.classList.add('in-scene'); }
      const head = el('div', { class: 'bhead' });
      const number = el('button', { type: 'button', class: 'bnum', 'aria-label': `Draw on panel ${i + 1}`, title: 'Return to the drawing canvas for this panel' }, `Panel ${i + 1}`);
      decorate(number, 'draw');
      number.onclick = () => { app.goPanel(i); app.focusCanvas(); }; head.append(number);
      head.append(el('span', { class: 'story-duration-label' }, 'Duration'));
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
      head.append(dur, el('span', { class: 'bunit', 'aria-hidden': 'true' }, 'fr'), el('span', { class: 'hint bwhen', title: 'Starts at · lasts' }, `@ ${app.fmt(startAt)} · ${app.fmtDur(e.length)}`));
      const more = el('button', { type: 'button', class: 'story-panel-more icon-only', 'aria-label': `Panel ${i + 1} actions`, 'aria-haspopup': 'menu', title: 'Panel actions' }, 'More');
      decorate(more, 'more');
      more.addEventListener('click', () => {
        if (!app.selection.includes(i)) app.goPanel(i);
        const box = more.getBoundingClientRect(); showContextMenu(box.left, box.bottom, [
          { title: app.targets.length > 1 ? `${app.targets.length} panels` : `Panel ${i + 1}` },
          { label: 'New panel after', icon: 'plus', run: () => app.addPanel() },
          { label: 'Duplicate panels', icon: 'copy', run: () => app.duplicateSelection() },
          { label: 'Move earlier', icon: 'prev', run: () => app.moveSelection(-1) },
          { label: 'Move later', icon: 'next', run: () => app.moveSelection(1) },
          { sep: true }, { label: 'Delete panels', icon: 'trash', danger: true, run: () => app.deleteFrame() },
        ]);
      });
      head.append(more);
      card.append(head);
      // the picture: tap to go to this panel (the canvas above draws on it)
      const thumb = el('canvas', { class: 'bthumb', width: '192', height: String(Math.round((192 * p.height) / p.width)), role: 'img', 'aria-label': `Panel ${i + 1} picture`, title: 'Go to this panel (draw on it above)' });
      this.paintThumb(thumb, e.drawing);
      const picture = el('button', { type: 'button', class: 'story-panel-picture', 'aria-label': `Preview and draw on panel ${i + 1}`, title: 'Select this panel to draw on the canvas' });
      picture.append(thumb, el('span', { class: 'story-picture-label' }, 'Draw on canvas')); picture.addEventListener('click', () => { app.goPanel(i); app.focusCanvas(); });
      picture.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); });
      card.append(picture);
      // the dialogue lines first (what the animatic subtitles), then the other captions
      card.append(this.dialogueBlock(i, e.dialogue, e.length));
      const details = el('details', { class: 'story-panel-details' });
      const detailKey = `${p.activeComp}:${e.drawing}`;
      details.open = this.openDetails.has(detailKey);
      details.append(el('summary', {}, 'Panel details'));
      details.addEventListener('toggle', () => { if (!details.isConnected) return; if (details.open) this.openDetails.add(detailKey); else this.openDetails.delete(detailKey); });
      for (const f of CAPTION_FIELDS) {
        if (f.key === 'dialogue') continue;
        // shot and camera are one line (camera offers quick picks); the rest are small text boxes
        const line = f.key === 'shot' || f.key === 'camera';
        const t = line
          ? el('input', { type: 'text', class: `bfield bline${f.key === 'camera' ? ' bcam' : ''}`, placeholder: HINT[f.key], 'aria-label': `Panel ${i + 1} ${WRITING_LABEL[f.key]}`, 'data-field': f.key, maxlength: String(f.max), ...(f.key === 'camera' ? { list: 'board-camera-picks' } : {}) })
          : el('textarea', { class: 'bfield', rows: String(ROWS[f.key]), placeholder: HINT[f.key], 'aria-label': `Panel ${i + 1} ${WRITING_LABEL[f.key]}`, 'data-field': f.key, maxlength: String(f.max) });
        t.value = e[f.key] ?? '';
        t.addEventListener('focus', () => {
          if (!app.selection.includes(i) || app.selection.length > 1) app.goPanel(i);
          // the on-screen keyboard can cover it: keep the box you type in in view
          setTimeout(() => { if (t.isConnected && document.activeElement === t) t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, 250);
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
            if (next) { app.goPanel(i + 1); const live = this.cards.querySelector<HTMLElement>(`.bcard[data-i="${i + 1}"] [data-field="${f.key}"]`); const folded = live?.closest('details'); if (folded) folded.open = true; live?.focus(); }
            else t.blur();
          } else if (k.key === 'Escape') {
            t.value = app.board?.exposures[i]?.[f.key] ?? '';
            t.blur();
          }
        });
        t.addEventListener('blur', () => setTimeout(() => this.update(), 0));
        const field = el('label', { class: 'board-writing-field' });
        field.append(el('span', {}, WRITING_LABEL[f.key]), t);
        const into = f.key === 'action' ? card : details;
        into.append(field);
        if (f.key === 'camera') details.append(this.stickers(i, e.camera));
        if (f.key === 'shot') {
          const scene = el('button', { type: 'button', class: 'bscene-new', title: 'This panel starts a new scene; every Shot / scene is renumbered (one Undo)', 'aria-label': `Panel ${i + 1}: new scene here` }, 'New scene here');
          scene.addEventListener('click', () => app.newSceneAt(i));
          details.append(scene);
        }
      }
      card.append(details);
      frag.append(card);
    });
    // the camera quick picks (one list for every panel)
    if (!document.getElementById('board-camera-picks')) {
      const dl = el('datalist', { id: 'board-camera-picks' });
      for (const c of CAMERA_PICKS) dl.append(el('option', { value: c }));
      document.body.append(dl);
    }
    // the speakers already named on the board, offered for every line
    let who = document.getElementById('board-speakers');
    if (!who) {
      who = el('datalist', { id: 'board-speakers' });
      document.body.append(who);
    }
    who.replaceChildren(...boardSpeakers(b.exposures).map((n) => el('option', { value: n })));
    this.cards.replaceChildren(frag);
    // keep the current panel in view
    const at = this.cards.querySelector<HTMLElement>('.bcard.on');
    at?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  /**
   * A panel's dialogue as subtitle lines: who speaks and what they say, one row per subtitle, each
   * with the time it gets in the animatic. Return goes to the next line (then the next panel's first
   * line); Shift+Return or + Line adds a line. Stored in the panel's dialogue caption.
   */
  private dialogueBlock(i: number, stored: string | undefined, length: number): HTMLElement {
    const app = this.app;
    const n = i + 1;
    const box = el('div', { class: 'board-writing-field bdialogue', role: 'group', 'aria-label': `Panel ${n} dialogue and subtitles` });
    const list = el('ol', { class: 'blines' });
    const add = el('button', { type: 'button', class: 'bline-add', title: 'Add a subtitle line to this panel (Shift+Return)' }, '+ Line');
    decorate(add, 'plus');
    box.append(el('span', {}, 'Dialogue / subtitles'), list, add);
    const rows = () => [...list.querySelectorAll<HTMLLIElement>('.bline-row')];
    const read = (): DialogueLine[] => rows().map((r) => ({ who: r.querySelector<HTMLInputElement>('.bspeaker')!.value, text: r.querySelector<HTMLTextAreaElement>('.bsay')!.value }));
    let reverting = false;
    const commit = () => {
      if (reverting) return;
      const next = formatDialogue(read());
      const max = CAPTION_FIELDS.find((f) => f.key === 'dialogue')!.max;
      if (next.length > max) app.onNotice?.(`Panel ${n} holds up to ${max} characters of dialogue: the end was cut. Split the scene over more panels.`);
      if ((app.board?.exposures[i]?.dialogue ?? '') !== next.slice(0, max).trim()) app.setCaption(i, 'dialogue', next);
      times();
    };
    // how long each line shows in the animatic (the panel's time, shared by length of line)
    const times = () => {
      const lines = read();
      const parts = splitPanel(lines.map((l) => ({ who: l.who.trim(), text: l.text.trim() || ' ' })), length);
      rows().forEach((r, j) => {
        const t = r.querySelector<HTMLElement>('.btime')!;
        const part = lines[j]!.text.trim() ? parts[j] : undefined;
        t.textContent = part ? app.fmtDur(part.end - part.start) : '';
      });
    };
    const renumber = () => rows().forEach((r, j) => {
      r.querySelector('.bspeaker')!.setAttribute('aria-label', `Panel ${n} line ${j + 1} speaker`);
      r.querySelector('.bsay')!.setAttribute('aria-label', `Panel ${n} line ${j + 1} words`);
      r.querySelector('.bline-del')!.setAttribute('aria-label', `Remove line ${j + 1} of panel ${n}`);
      r.querySelector('.bsay')!.toggleAttribute('data-field', false);
      if (j === 0) r.querySelector('.bsay')!.setAttribute('data-field', 'dialogue');
    });
    const focusPanel = () => {
      if (!app.selection.includes(i) || app.selection.length > 1) app.goPanel(i);
    };
    const row = (line: DialogueLine, after?: HTMLLIElement): HTMLLIElement => {
      const r = el('li', { class: 'bline-row' });
      const who = el('input', { type: 'text', class: 'bfield bspeaker', list: 'board-speakers', placeholder: 'Who', maxlength: String(SPEAKER_MAX), autocomplete: 'off' });
      const say = el('textarea', { class: 'bfield bsay', rows: '1', placeholder: 'What is said (or a sound)', maxlength: '500' });
      const del = el('button', { type: 'button', class: 'bline-del icon-only', title: 'Remove this line' }, 'Remove line');
      decorate(del, 'close');
      who.value = line.who;
      say.value = line.text;
      r.append(who, say, el('span', { class: 'btime hint', title: 'How long this line shows in the animatic' }), del);
      for (const f of [who, say] as HTMLElement[]) {
        f.addEventListener('focus', () => {
          focusPanel();
          setTimeout(() => { if (f.isConnected && document.activeElement === f) f.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, 250);
        });
        f.addEventListener('change', commit);
        f.addEventListener('blur', () => setTimeout(() => this.update(), 0));
      }
      who.addEventListener('keydown', (k) => {
        k.stopPropagation();
        if (k.key === 'Enter') {
          k.preventDefault();
          say.focus();
        } else if (k.key === 'Escape') {
          reverting = true;
          this.revert();
        }
      });
      say.addEventListener('keydown', (k) => {
        k.stopPropagation();
        if (k.key === 'Enter' && k.shiftKey) {
          k.preventDefault();
          commit();
          row({ who: '', text: '' }, r).querySelector<HTMLInputElement>('.bspeaker')!.focus();
        } else if (k.key === 'Enter') {
          // Return: the next line of this panel, else the first line of the next panel
          k.preventDefault();
          commit();
          const next = r.nextElementSibling?.querySelector<HTMLTextAreaElement>('.bsay') ?? this.cards.querySelector<HTMLTextAreaElement>(`.bcard[data-i="${i + 1}"] [data-field="dialogue"]`);
          if (next) { if (!r.nextElementSibling) app.goPanel(i + 1); next.focus(); }
          else say.blur();
        } else if (k.key === 'Escape') {
          reverting = true;
          this.revert();
        }
      });
      del.addEventListener('click', () => {
        r.remove();
        if (!rows().length) row({ who: '', text: '' });
        renumber();
        commit();
      });
      if (after) after.after(r);
      else list.append(r);
      renumber();
      return r;
    };
    const lines = parseDialogue(stored);
    for (const l of lines.length ? lines : [{ who: '', text: '' }]) row(l);
    add.addEventListener('click', () => {
      focusPanel();
      row({ who: '', text: '' }).querySelector<HTMLInputElement>('.bspeaker')!.focus();
    });
    times();
    return box;
  }

  /** Escape: drop the typing and show the stored text again. */
  private revert(): void {
    (document.activeElement as HTMLElement | null)?.blur();
    this.sig = '';
    this.update();
  }

  /**
   * Shot and camera stickers: tap a shot type (one per panel) or camera moves (any number). They
   * write the Camera / framing words, so they print in the storyboard PDF; typed words stay.
   */
  private stickers(i: number, camera: string | undefined): HTMLElement {
    const app = this.app;
    const on = stickersOf(camera);
    const row = el('div', { class: 'bstickers', role: 'group', 'aria-label': `Panel ${i + 1} shot and camera stickers` });
    const chip = (label: string, title: string, pressed: boolean, next: () => string, kind: string) => {
      const b = el('button', { type: 'button', class: `bsticker ${kind}`, title, 'aria-pressed': String(pressed) }, label);
      b.addEventListener('click', () => {
        app.setCaption(i, 'camera', next(), pressed ? 'Remove sticker' : 'Add sticker');
        // keep the keyboard on the same sticker after the cards rebuild
        setTimeout(() => this.cards.querySelector<HTMLElement>(`.bcard[data-i="${i}"] .bsticker[title="${title}"]`)?.focus(), 0);
      });
      row.append(b);
    };
    for (const [k, name] of SHOT_STICKERS) chip(k, name, on.shot === k, () => toggleShot(app.board?.exposures[i]?.camera, k), 'shot');
    for (const [k, arrow] of MOVE_STICKERS) chip(arrow, k, on.moves.includes(k), () => toggleMove(app.board?.exposures[i]?.camera, k), 'move');
    return row;
  }

  /** Script → panels: paste, see what it makes, add (after the selected panel). */
  async pasteScript(): Promise<void> {
    const app = this.app;
    const fps = app.project.comp.fps;
    const text = await askLongText(
      'Script to panels',
      'Paste a script. Scene headings (INT. / EXT.) start scenes; each action paragraph and each spoken line (SAM on its own line, or Sam: words) becomes a panel with its caption. Lengths are a first guess you can change.',
      'INT. HALLWAY - NIGHT\n\nSam creeps toward the door.\n\nSAM\nIs anyone there?',
      'Add panels',
      (t) => {
        const r = parseScript(t, fps);
        if (!r.panels.length) return { summary: t.trim() ? 'No panels found yet: separate actions and lines with blank lines.' : 'Nothing pasted yet.', ok: false };
        const frames = r.panels.reduce((n, p) => n + p.length, 0);
        const more = r.dropped ? ` (the first ${SCRIPT_MAX_PANELS}; ${r.dropped} more left out)` : '';
        return { summary: `${r.panels.length} panel${r.panels.length === 1 ? '' : 's'} in ${r.scenes} scene${r.scenes === 1 ? '' : 's'}, about ${app.fmtDur(frames)}${more}.`, ok: true };
      },
    );
    if (text === null) return;
    const n = app.addScriptPanels(parseScript(text, fps).panels);
    if (n) {
      app.onNotice?.(`${n} panel${n === 1 ? '' : 's'} added from the script. Undo takes them out.`);
      this.update();
    }
  }

  /** Open a panel to write on: the Panels view, scrolled to its card, its first line focused. */
  private writeOn(i: number): void {
    this.app.goPanel(i);
    this.setView('panels');
    const card = this.cards.querySelector<HTMLElement>(`.bcard[data-i="${i}"]`);
    card?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    card?.querySelector<HTMLElement>('input:not(.bdur), textarea')?.focus();
  }

  private paintThumb(c: HTMLCanvasElement, drawingId: string): void {
    const g = c.getContext('2d');
    const d = this.app.project.drawings.get(drawingId);
    if (!g) return;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    const t = d?.thumb;
    if (t?.width && t.height) { const scale = Math.min(c.width / t.width, c.height / t.height), w = t.width * scale, h = t.height * scale; g.drawImage(t, (c.width - w) / 2, (c.height - h) / 2, w, h); }
    if (d) this.thumbs.set(drawingId, d.thumbRev);
  }
}
