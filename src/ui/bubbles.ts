import type { SymmetryMode } from '../core/adjust';
import type { SelectShape } from '../app';
import { GUIDE_NAMES, type GuideMode } from '../core/guides';
import { EASINGS } from '../core/anim';
import type { App, Workspace } from '../app';
import type { Tool } from '../core/stroke';
import type { XParams } from '../core/selxform';
import { decorate } from './icons';
import { STUDENT_TOOLS, type StudentTool } from '../core/studentprefs';
import { isPaintingWorkspace, optionsRow, toolChoice, type OptionsState } from '../core/workspace';
import { isCommandHidden } from '../core/commandprefs';
import { commandById, commandName, commandPrefs, commandsFor, commandsIn, onCommandPrefsChange, setHidden, type Command, type CommandContext } from './commands';
import { attachContextMenu, showContextMenu } from './contextmenu';

export type UiLevel = 'clean' | 'simple' | 'full';
const LEVEL_KEY = '2dope.ui.level';
const LEVELS: UiLevel[] = ['clean', 'simple', 'full'];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text) e.textContent = text;
  return e;
};

export interface BubbleHooks {
  brushLibrary(anchor: HTMLElement): void;
  /** The floating reference window (pictures, or the whole canvas). */
  reference?: () => void;
  colorPanel(anchor: HTMLElement): void;
  layers(anchor: HTMLElement): void;
  fit(): void;
  /** The QuickShape Edit shape menu (shown in the context bar right after a snap). */
  editShape?: (anchor: HTMLElement) => void;
  /** Layer cards with thumbnails (Draw); without it, Layers shows the linked layers as chips. */
  layerCards?: (anchor: HTMLElement) => void;
  /** Story (Board) actions the bubbles reach. */
  story?: { view(): 'panels' | 'timeline' | 'split'; setView(v: 'panels' | 'timeline' | 'split'): void; images(): void; exportBoard(): void };
  /** Motion actions the bubbles reach. */
  motion?: { group(): void; split(): void };
  /** Draw's bottom view: the flipbook (on) or the timeline. */
  flip?: { on(): boolean; set(on: boolean): void };
  /** Share: the last mode, preview and make the movie. */
  share?: { open(): boolean; show(): void };
  /** Hold the interface button: put the whole screen back to its starting layout. */
  resetUi?: () => void;
}

type ToolKey = 'assets' | 'more' | 'brush' | 'pen' | 'eraser' | 'fill' | 'select' | 'color' | 'onion' | 'layers'
  | 'smudge' | 'adjust' | 'insert' | 'fx' | 'flipbook' | 'reference' | 'panel' | 'images' | 'dup' | 'del' | 'play' | 'export' | 'addlayer' | 'camera' | 'group' | 'split' | 'autokey' | 'look';

/**
 * Bubbles: a simpler way around the app. Mode bubbles (Draw, Animate, Move, Story) at the top left,
 * the tools for that mode at the top right, and a context bar with only what the chosen tool needs.
 * One level button steps clean → simple → full (full is the classic layout with every button).
 * View only: every bubble calls the same App commands as the classic buttons.
 */
export class Bubbles {
  private readonly modes = el('div', { class: 'bub-modes', role: 'toolbar', 'aria-label': 'Mode' });
  private readonly tools = el('div', { class: 'bub-tools', role: 'toolbar', 'aria-label': 'Tools' });
  private readonly ctx = el('div', { class: 'bub-ctx', role: 'toolbar', 'aria-label': 'Options' });
  private readonly levelBtn = el('button', { type: 'button', class: 'bub bub-level' });
  private readonly modeName = el('span', { class: 'bub-name' });
  level: UiLevel = 'simple';
  private sig = '';
  /** The Layers bubble shows this cel's linked layers in the context bar. */
  private layersOpen = false;
  private moreTools = false;
  /** Point editing's on/off settings, folded behind one chip. */
  private pointSettings = false;

  /** How far down the bubble rows reach (px from the stage top); the canvas fits below it. */
  private topClear = -1;

  constructor(private readonly app: App, private readonly stage: HTMLElement, private readonly hooks: BubbleHooks) {
    // the order of a shot: plan it (Story), draw it (frame by frame, in the flipbook), time it, move it
    const modes: [Workspace, string, string, string][] = [
      ['board', 'Story', 'board', 'Story: panels, captions and the animatic'],
      ['draw', 'Draw', 'draw', 'Draw: painting, backgrounds and assets'],
      ['animate', 'Animate', 'flipbook', 'Animate: draw frames and arrange clips'],
      ['time', 'Timing', 'time', 'Timing: holds, marks and the exposure sheet'],
      ['motion', 'Motion', 'motion', 'Motion: move layers, keyframes and the camera'],
    ];
    // Share comes last: watch the movie, then make it
    for (const [ws, label, icon, title] of modes) {
      const b = this.bubble(label, icon, title);
      b.dataset.ws = ws;
      b.addEventListener('click', () => {
        app.setWorkspace(ws);
        this.sig = '';
        this.update();
      });
      this.modes.append(b);
    }
    if (hooks.share) {
      const share = this.bubble('Share', 'export', 'Share: watch the movie, check it, then save or send it');
      share.dataset.mode = 'share';
      share.addEventListener('click', () => hooks.share!.show());
      this.modes.append(share);
    }
    this.modes.append(this.modeName);
    // the interface level: a small menu that says what each choice shows (not a blind cycle)
    const menu = el('div', { class: 'bub-levelmenu', role: 'menu', hidden: '' });
    const choices: [UiLevel, string, string][] = [
      ['clean', 'Focus', 'Just the canvas and your tools'],
      ['simple', 'Simple', 'Modes, tools and the timeline'],
      ['full', 'Full', 'Every control, the classic layout'],
    ];
    const fill = () => {
      menu.replaceChildren(...choices.map(([id, name, what]) => {
        const b = el('button', { type: 'button', role: 'menuitemradio', 'aria-checked': String(this.level === id) });
        b.append(el('strong', {}, name), el('span', {}, what));
        b.addEventListener('click', () => { menu.hidden = true; this.setLevel(id); });
        return b;
      }));
    };
    // a tap opens the menu; holding it (about half a second) resets the screen
    let held = 0, didHold = false;
    this.levelBtn.addEventListener('pointerdown', () => {
      didHold = false;
      clearTimeout(held);
      held = window.setTimeout(() => {
        didHold = true;
        menu.hidden = true;
        this.setLevel('simple');
        this.hooks.resetUi?.();
      }, 650);
    });
    const cancelHold = () => clearTimeout(held);
    this.levelBtn.addEventListener('pointerup', cancelHold);
    this.levelBtn.addEventListener('pointercancel', cancelHold);
    this.levelBtn.addEventListener('pointerleave', cancelHold);
    this.levelBtn.addEventListener('click', () => { if (didHold) { didHold = false; return; } fill(); menu.hidden = !menu.hidden; });
    window.addEventListener('pointerdown', (e) => {
      if (menu.hidden || menu.contains(e.target as Node) || this.levelBtn.contains(e.target as Node)) return;
      menu.hidden = true;
    }, true);
    stage.append(menu);
    stage.append(this.modes, this.tools, this.ctx);
    // inside the stage, so it never sits on a side panel
    stage.append(this.levelBtn);
    this.level = app.interfaceLevel;
    const levelChanged = app.onInterfaceLevelChange;
    app.onInterfaceLevelChange = () => { levelChanged(); this.setLevel(app.interfaceLevel); };
    this.setLevel(this.level, false);
    // hiding or showing a command (here or in App settings) redraws the row
    onCommandPrefsChange(() => { this.sig = ''; this.update(); });
    window.addEventListener('resize', () => setTimeout(() => this.measure(), 0));
  }

  /**
   * Measure the bubble rows (they wrap on narrow screens) and publish it to the stage as CSS
   * variables: --tools-bottom (where the context row goes on a phone), --top-clear (what the
   * canvas, layer label and sidebar keep clear of) and --side-top (the sidebar's top edge).
   */
  private measure(): void {
    const s = this.stage.getBoundingClientRect();
    const bottomOf = (e: HTMLElement) => (e.offsetParent && !e.hidden ? e.getBoundingClientRect().bottom - s.top : 0);
    const narrow = window.innerWidth <= 700;
    const painting = document.body.classList.contains('painting-workspace');
    if (painting) this.placePaintingRows(s);
    // the mode and tool rows side by side need the stage's width; when they do not fit (a tablet
    // upright, a split screen) the tools go under the modes, as on a phone
    const mw = this.modes.offsetParent ? this.modes.offsetWidth : 0, tw = this.tools.offsetParent && !this.tools.hidden ? this.tools.offsetWidth : 0;
    const stack = !painting && !narrow && mw > 0 && tw > 0 && mw + tw + 60 + 60 + 12 > s.width;
    if (stack !== this.stage.classList.contains('bub-stack')) this.stage.classList.toggle('bub-stack', stack);
    const tools = Math.max(bottomOf(this.modes), bottomOf(this.tools));
    if (!tools) {
      // Full level with its top bar: only the options row floats over the stage
      const ctx = bottomOf(this.ctx);
      const clear = ctx ? Math.round(ctx + 6) : 0;
      if (clear === this.topClear) return;
      this.topClear = clear;
      this.stage.style.setProperty('--top-clear', `${clear}px`);
      this.stage.style.setProperty('--fit-top', `${clear}px`);
      this.hooks.fit();
      return;
    }
    // on a phone the context row sits under the tools, and the layer label under that; elsewhere
    // the page is kept clear of the context row too (Timing's and Fill's rows reach the middle)
    const clear = Math.round(narrow ? tools + 58 : Math.max(tools + 8, bottomOf(this.ctx) + 6));
    const label = 0; // the layer label is kept clear by the fit itself
    this.stage.style.setProperty('--tools-bottom', `${Math.round(tools + 6)}px`);
    this.stage.style.setProperty('--side-top', `${clear + (narrow ? 40 : 0)}px`);
    if (clear + label === this.topClear) return;
    this.topClear = clear + label;
    this.stage.style.setProperty('--top-clear', `${clear}px`);
    this.stage.style.setProperty('--fit-top', `${clear + label}px`);
    this.hooks.fit();
  }

  /**
   * Draw and Animate: the mode row sits top left like everywhere else, the asset buttons follow it
   * on the same row when there is room (else on the row under it), and the tool row goes under
   * them on the right, dropping a row only when it would run into the asset buttons.
   */
  private placePaintingRows(s: DOMRect): void {
    const header = this.stage.querySelector<HTMLElement>('.painting-header');
    if (!this.modes.offsetParent) return;
    const m = this.modes.getBoundingClientRect();
    const modesLeft = Math.round(m.left - s.left), modesRight = Math.round(m.right - s.left), modesBottom = Math.round(m.bottom - s.top);
    const shown = !!header && !header.hidden && header.offsetParent !== null;
    const hw = shown ? header.offsetWidth : 0, hh = shown ? header.offsetHeight : 0;
    // the level button keeps the top right corner (60px)
    const row1 = shown && modesRight + 8 + hw <= s.width - 60;
    const hLeft = row1 ? modesRight + 8 : modesLeft;
    const hTop = row1 ? 8 : modesBottom + 6;
    this.stage.style.setProperty('--ph-left', `${hLeft}px`);
    this.stage.style.setProperty('--ph-top', `${hTop}px`);
    let top = modesBottom + 6;
    if (shown && !row1) {
      // tools hang from the right edge (70px clear of the Tools / Options handles)
      const tw = this.tools.offsetWidth, toolsLeft = s.width - 70 - tw;
      if (toolsLeft < hLeft + hw + 8) top = hTop + hh + 6;
    }
    this.stage.style.setProperty('--pt-top', `${top}px`);
  }

  setLevel(l: UiLevel, remember = true): void {
    this.level = l;
    this.app.interfaceLevel = l;
    for (const x of LEVELS) document.body.classList.toggle(`ui-${x}`, x === l);
    this.levelBtn.textContent = l === 'clean' ? '○' : l === 'simple' ? '◐' : '●';
    this.levelBtn.title = `Interface: ${l === 'clean' ? 'Focus' : l === 'simple' ? 'Simple' : 'Full'}. Tap to choose how much shows; hold to reset the screen.`;
    this.levelBtn.setAttribute('aria-label', this.levelBtn.title);
    if (remember) {
      try { localStorage.setItem(LEVEL_KEY, l); } catch { /* optional */ }
    }
    this.sig = '';
    this.app.onToolChange(); // labels that depend on the level (the paint target) refresh too
    this.update();
    setTimeout(() => this.hooks.fit(), 60);
  }

  private bubble(label: string, icon: string, title: string): HTMLButtonElement {
    const b = el('button', { type: 'button', class: 'bub', title, 'aria-label': label }, label);
    decorate(b, icon);
    return b;
  }

  private chip(label: string, title: string, on: boolean, fn: (b: HTMLButtonElement) => void, icon?: string): HTMLButtonElement {
    const b = el('button', { type: 'button', class: `bub-chip${on ? ' on' : ''}${icon ? ' icon' : ''}`, title, 'aria-pressed': String(on), 'aria-label': label }, label);
    if (icon) decorate(b, icon);
    b.addEventListener('click', () => fn(b));
    return b;
  }

  /** A row's registry commands as chips (hidden ones left out), then Customize. */
  private commandChips(context: CommandContext): HTMLButtonElement[] {
    const a = this.app, prefs = commandPrefs();
    const chips = commandsFor(context, a).filter((c) => !isCommandHidden(prefs, c.id)).map((c) => this.commandChip(c));
    return [...chips, this.customizeChip(context)];
  }

  /** One registry command as a chip, or nothing while it is disabled or hidden (for rows that mix in other controls). */
  private cmd(id: string): HTMLButtonElement[] {
    const c = commandById(id);
    if (!c || !(c.isEnabled?.(this.app) ?? true) || isCommandHidden(commandPrefs(), c.id)) return [];
    return [this.commandChip(c)];
  }

  private customizeChip(context: CommandContext): HTMLButtonElement {
    return this.chip('Customize', 'Choose which actions this row shows', false, (b) => this.customize(context, b), 'more');
  }

  private commandChip(c: Command): HTMLButtonElement {
    const a = this.app, f = c.face?.(a) ?? {};
    // a command may change state no App callback reports (Freeform, Smudge strength): redraw if the row changed
    const b = this.chip(f.label ?? c.label, f.title ?? c.title, c.isOn?.(a) ?? false, () => { c.run(a); this.update(); }, f.icon ?? c.icon);
    b.dataset.command = c.id;
    // right-click or hold: take it off this row (Customize brings it back)
    attachContextMenu(b, () => [{ label: `Hide “${commandName(c)}” from this row`, run: () => setHidden(c.id, true) }]);
    return b;
  }

  /** Every command of a row, ticked when shown: tap to hide or show it. */
  private customize(context: CommandContext, anchor: HTMLElement): void {
    const prefs = commandPrefs(), r = anchor.getBoundingClientRect();
    showContextMenu(r.left, r.bottom, [
      { title: 'Show in this row' },
      ...commandsIn(context).map((c) => {
        const hidden = isCommandHidden(prefs, c.id);
        return { label: commandName(c), checked: !hidden, hint: hidden ? 'Show' : 'Hide', run: () => setHidden(c.id, !hidden) };
      }),
    ]);
  }

  /** Drawing Guide: one button that steps through the symmetries. */
  private symmetryChip(): HTMLButtonElement {
    const a = this.app;
    const order: SymmetryMode[] = ['off', 'vertical', 'horizontal', 'quadrant', 'radial'];
    const names: Record<SymmetryMode, string> = { off: 'Symmetry', vertical: 'Mirror \u2194', horizontal: 'Mirror \u2195', quadrant: 'Quadrant', radial: 'Radial' };
    const next = order[(order.indexOf(a.symmetry) + 1) % order.length]!;
    return this.chip(names[a.symmetry], `Symmetry: ${a.symmetry}. Tap for ${next}.`, a.symmetry !== 'off', () => a.setSymmetry(next), 'symmetry');
  }

  /** Drawing Guide: a button that steps through the guides, then Assist and Edit while one is on. */
  private guideChips(): HTMLButtonElement[] {
    const a = this.app;
    const order: GuideMode[] = ['off', 'grid', 'iso', 'persp1', 'persp2'];
    const next = order[(order.indexOf(a.guide.mode) + 1) % order.length]!;
    const out = [this.chip(GUIDE_NAMES[a.guide.mode], `Drawing guide: ${GUIDE_NAMES[a.guide.mode]}. Tap for ${GUIDE_NAMES[next]}.`, a.guide.mode !== 'off', () => a.setGuide({ mode: next }), 'guide')];
    if (a.guide.mode !== 'off') {
      out.push(this.chip('Assist', a.assist ? 'Assisted drawing: strokes follow the guide. Tap to draw freely' : 'Assisted drawing off: tap so strokes follow the guide', a.assist, () => a.setAssist(!a.assist)));
      out.push(this.chip('Edit', a.guideEdit ? 'Done editing the guide' : a.guide.mode === 'persp1' || a.guide.mode === 'persp2' ? 'Drag the vanishing points and the horizon' : 'Drag up or down to change the grid size', a.guideEdit, () => a.setGuideEdit(!a.guideEdit)));
    }
    return out;
  }

  /** Adjustments: Colour (hue, saturation, brightness) or Blur, live sliders, Apply / Cancel. */
  private adjustControls(): HTMLElement[] {
    const a = this.app;
    const adj = a.adjusting!;
    const slider = (label: string, min: number, max: number, value: number, set: (n: number) => void) => {
      const wrap = el('label', { class: 'bub-slider' });
      const name = el('span', {}, label);
      const r = el('input', { type: 'range', min: String(min), max: String(max), step: '1', 'aria-label': label });
      r.value = String(value);
      const num = el('span', { class: 'bub-num' }, String(value));
      r.addEventListener('input', () => { num.textContent = r.value; set(Number(r.value)); });
      // double-tap the name to reset it
      wrap.addEventListener('dblclick', () => { r.value = '0'; num.textContent = '0'; set(0); });
      wrap.append(name, r, num);
      return wrap;
    };
    // Apply / Cancel first, so they stay in view when the sliders run past the edge
    const out: HTMLElement[] = [
      this.chip('Apply', 'Keep the change', false, () => a.applyAdjust(), 'check'),
      this.chip('Cancel', 'Put it back', false, () => a.cancelAdjust(), 'close'),
      this.chip('Colour', 'Hue, saturation and brightness', adj.kind === 'hsb', () => a.beginAdjust('hsb')),
      this.chip('Blur', 'Gaussian blur', adj.kind === 'blur', () => a.beginAdjust('blur')),
    ];
    if (adj.kind === 'hsb') {
      out.push(
        slider('Hue', -180, 180, adj.hsb.hue, (n) => a.setAdjust({ hue: n })),
        slider('Sat', -100, 100, adj.hsb.sat, (n) => a.setAdjust({ sat: n })),
        slider('Bright', -100, 100, adj.hsb.bright, (n) => a.setAdjust({ bright: n })),
      );
    } else out.push(slider('Radius', 0, 40, adj.blur, (n) => a.setAdjust({ blur: n })));
    return out;
  }

  /** A gradient just filled: drag its handles on the canvas, then keep it or put it back. */
  private gradChips(): HTMLButtonElement[] {
    const a = this.app;
    if (!a.gradEditing) return [];
    return [
      this.chip('Done', 'Keep the gradient (or tap elsewhere)', false, () => a.applyGradEdit(), 'check'),
      this.chip('Cancel', 'Put the area back', false, () => a.cancelGradEdit(), 'close'),
    ];
  }

  private optionsState(): OptionsState {
    const a = this.app;
    return {
      workspace: a.workspace, tool: a.tool, fillMode: a.fillMode, smudging: a.smudging, adjusting: !!a.adjusting,
      transforming: a.transforming, pointEditing: a.pointEditing, arranging: a.arrangingAssets, layersOpen: this.layersOpen,
    };
  }

  /** Which tool bubble is lit (an adjustment in progress wins over the Fill or Select tool under it). */
  private current(): ToolKey {
    return toolChoice(this.optionsState());
  }

  private get flipOn(): boolean {
    return !!this.hooks.flip?.on() && (this.app.workspace === 'draw' || this.app.workspace === 'animate');
  }

  private toolsFor(ws: Workspace, expanded = false): [ToolKey, string, string][] {
    const draw: [ToolKey, string, string][] = [['brush', 'Brush', 'brush'], ['smudge', 'Smudge', 'smudge'], ['pen', 'Vector', 'pen'], ['eraser', 'Eraser', 'eraser'], ['fill', 'Fill', 'fill'], ['select', 'Select', 'lasso'], ['adjust', 'Adjust: hue, saturation, brightness, blur', 'adjust']];
    // Draw and Flip (the flipbook) draw with every tool; Flip's layers are pages' layers
    // Focus: what a flipbook needs (Procreate Dreams' simplest drawing screen)
    const assets: [ToolKey, string, string] = ['assets', 'Move assets', 'freeform'];
    if (expanded && (ws === 'draw' || ws === 'animate')) return [...draw, ...(ws === 'animate' ? [assets] : []), ['color', 'Colour', ''], ['layers', 'Layers', 'layers'], ['reference', 'Reference: pictures to draw from, or the whole canvas', 'image']];
    if ((ws === 'draw' || ws === 'animate') && this.level === 'clean') return [['brush', 'Brush', 'brush'], ['eraser', 'Eraser', 'eraser'], ['fill', 'Fill', 'fill'], ...(ws === 'animate' ? [assets] : []), ['color', 'Colour', '']];
    if (ws === 'animate' && this.level !== 'full' && !this.moreTools) return [draw[0]!, draw[3]!, draw[4]!, draw[5]!, assets, ['color', 'Colour', ''], ['layers', 'Layers', 'layers'], ['more', 'More tools', 'gear']];
    if (ws === 'animate') return [...draw, assets, ['color', 'Colour', ''], ['layers', 'Layers', 'layers'], ['reference', 'Reference: pictures to draw from, or the whole canvas', 'image'], ['more', 'Fewer tools', 'gear']];
    if (ws === 'draw') return [...draw, ['color', 'Colour', ''], ['layers', 'Layers', 'layers'], ['reference', 'Reference: pictures to draw from, or the whole canvas', 'image']];
    // Timing is for timing and review: no brushes; the canvas scrubs (drag) and plays (tap)
    if (ws === 'time') return [['play', 'Play', 'play'], ['onion', 'Onion', 'onion'], ['insert', 'New drawing after this one', 'plus'], ['dup', 'Duplicate the drawing', 'copy'], ['del', 'Delete the drawing', 'trash'], ['layers', 'Layers: whose timing you edit', 'layers']];
    if (ws === 'board') return [['panel', 'New panel', 'plus'], ['images', 'Import images as panels', 'gallery'], ['dup', 'Duplicate panels', 'copy'], ['del', 'Delete panels', 'trash'], ['play', 'Play the animatic', 'play'], ['export', 'Export the storyboard', 'export']];
    if (ws === 'motion') return [['addlayer', 'New drawing layer', 'plus'], ['camera', 'Add a camera', 'camera'], ['group', 'Group the selected layers', 'layers'], ['split', 'Split at the playhead', 'scissors'], ['autokey', 'Auto-key: every change writes a keyframe', 'key'], ['look', 'Look through the camera', 'eye'], ['flipbook', 'Edit the selected drawing layer as a flipbook (Flip)', 'flipbook'], ['fx', 'Effects of the selected layer (line boil...)', 'fx']];
    return [];
  }

  private pickTool(k: ToolKey, b: HTMLButtonElement): void {
    const a = this.app;
    const arranging = a.arrangingAssets;
    if (k === 'assets') { a.setArrangeAssets(!a.arrangingAssets); return; }
    if (a.arrangingAssets && ['brush', 'pen', 'eraser', 'smudge', 'fill', 'select', 'adjust'].includes(k)) a.setArrangeAssets(false);
    if (k === 'more') { this.moreTools = !this.moreTools; this.sig = ''; this.update(); return; }
    if (a.transforming && k !== 'select') a.cancelTransform();
    if (a.adjusting && k !== 'adjust' && k !== 'color' && k !== 'layers') a.applyAdjust();
    switch (k) {
      case 'adjust': if (!a.adjusting) a.beginAdjust('hsb'); break;
      case 'brush': case 'pen': case 'eraser':
        if (a.tool === k && !arranging && !(k === 'brush' && a.smudging)) this.hooks.brushLibrary(b);
        else { a.setTool(k as Tool); if (k === 'brush') a.setSmudging(false); }
        break;
      case 'smudge': a.setSmudging(true); break;
      case 'fill':
        a.setTool('fill');
        if (a.fillMode === 'lasso') a.setFillMode('tap');
        break;
      case 'select':
        a.setTool('fill');
        a.setFillMode('lasso');
        break;
      case 'color': this.hooks.colorPanel(b); break;
      case 'layers':
        // anchored to the tool bar itself: the bubble is rebuilt when tools change
        if (this.hooks.layerCards) this.hooks.layerCards(this.tools);
        else this.layersOpen = !this.layersOpen;
        break;
      case 'insert': a.insertBlank('after'); break;
      case 'onion': a.toggleOnion(); break;
      case 'panel': if (!a.board) a.createBoard(); else a.addPanel(); break;
      case 'images': this.hooks.story?.images(); break;
      case 'dup': void a.duplicateSelection(); break;
      case 'del': a.deleteFrame(); break;
      case 'play': a.togglePlay(); break;
      case 'export': this.hooks.story?.exportBoard(); break;
      case 'addlayer': a.editor.addLayer('drawings'); break;
      case 'camera': a.editor.addLayer('camera'); break;
      case 'group': this.hooks.motion?.group(); break;
      case 'split': this.hooks.motion?.split(); break;
      case 'autokey': a.editor.autoKey = !a.editor.autoKey; a.editor.onChange(); break;
      case 'look': a.editor.throughCamera = !a.editor.throughCamera; a.requestRender(); a.editor.onChange(); break;
      case 'reference': this.hooks.reference?.(); break;
      case 'flipbook': {
        const id = a.editor.selected.find((s) => a.editor.comp.layers.some((l) => l.id === s && l.kind === 'drawings'));
        a.openFlipbook?.(id);
        break;
      }
      case 'fx': {
        const id = a.editor.selected.find((s) => a.editor.comp.layers.some((l) => l.id === s && l.kind === 'drawings')) ?? a.editor.comp.layers.find((l) => l.kind === 'drawings')?.id;
        if (id) a.openEffects?.(id);
        else a.onNotice?.('Add a drawing layer first, then give it effects.');
        break;
      }
    }
    this.sig = '';
    this.update();
  }

  /**
   * Point editing: thinner / thicker steps, and a meter you pull up (thicker) or down (thinner).
   * The meter is never rebuilt during a pull, so the gesture is not lost.
   */
  private widthControls(): HTMLElement[] {
    const a = this.app;
    const readout = el('span', { class: 'bub-hint' });
    const show = () => { readout.textContent = a.pointWidthLabel; };
    show();
    const meter = el('div', { class: 'bub-meter', role: 'slider', tabindex: '0', 'aria-label': 'Line thickness: pull up for thicker, down for thinner', title: 'Pull up: thicker. Pull down: thinner.' });
    meter.append(el('span', { class: 'bub-meter-fill' }));
    let y0: number | null = null;
    meter.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!a.pointWidthReady()) return;
      try { meter.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      y0 = e.clientY;
      meter.classList.add('active');
    });
    meter.addEventListener('pointermove', (e) => {
      if (y0 === null) return;
      a.setPointWidthLive(Math.exp(-(e.clientY - y0) / 90));
      show();
    });
    const end = () => {
      if (y0 === null) return;
      y0 = null;
      meter.classList.remove('active');
      a.commitPointWidth();
      show();
    };
    meter.addEventListener('pointerup', end);
    meter.addEventListener('pointercancel', end);
    meter.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); a.nudgePointWidth(e.key === 'ArrowUp' ? 1.15 : 1 / 1.15); show(); }
    });
    return [
      ...this.cmd('points.toggle'),
      ...this.cmd('points.allstraight'),
      this.chip('Point settings', 'Point settings: straight by default, snapping, joining, points after hold', this.pointSettings, () => { this.pointSettings = !this.pointSettings; this.sig = ''; this.update(); }, 'gear'),
      ...(this.pointSettings
        ? [
            this.chip('New points straight', 'Points start straight instead of curved', a.straightDefault, () => a.setStraightDefault(!a.straightDefault)),
            this.chip('Snap points', 'A dragged point snaps onto other points of the lines here', a.snapPoints, () => a.setSnapPoints(!a.snapPoints)),
            this.chip('Merge on snap', 'Drop a line\u2019s end on another line\u2019s end to join them into one', a.mergeOnSnap, () => a.setMergeOnSnap(!a.mergeOnSnap)),
            this.chip('Points after hold', 'Show a vector line\u2019s points right after a hold snaps it', a.pointsAfterHold, () => a.setPointsAfterHold(!a.pointsAfterHold)),
          ]
        : []),
      ...this.cmd('points.widthscope'),
      // the width meter and its steps stay together, outside the registry
      this.chip('Thinner', 'A step thinner', false, () => { a.nudgePointWidth(1 / 1.15); show(); }, 'thinner'),
      meter,
      this.chip('Thicker', 'A step thicker', false, () => { a.nudgePointWidth(1.15); show(); }, 'thicker'),
      readout,
      ...this.cmd('points.done'),
      this.customizeChip('points'),
    ];
  }

  /** Drag the colour bubble onto the canvas and let go: ColorDrop fills the area there. A tap still opens the colour panel. */
  private bindColorDrop(b: HTMLButtonElement): void {
    let start: { id: number; x: number; y: number } | null = null;
    let dot: HTMLElement | null = null;
    let dragged = false;
    b.addEventListener('pointerdown', (e) => {
      start = { id: e.pointerId, x: e.clientX, y: e.clientY };
      dragged = false;
      try { b.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    });
    b.addEventListener('pointermove', (e) => {
      if (!start || start.id !== e.pointerId) return;
      if (!dragged && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 12) return;
      dragged = true;
      if (!dot) {
        dot = el('div', { class: 'colordrop-dot' });
        dot.style.background = this.app.color;
        document.body.append(dot);
      }
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
    });
    const end = (e: PointerEvent, cancel: boolean) => {
      if (!start || start.id !== e.pointerId) return;
      start = null;
      dot?.remove();
      dot = null;
      if (dragged && !cancel && !this.app.colorDropAt(e.clientX, e.clientY)) this.app.onNotice?.('Drop the colour inside an area of the drawing to fill it.');
    };
    b.addEventListener('pointerup', (e) => end(e, false));
    b.addEventListener('pointercancel', (e) => end(e, true));
    // a drag is not a tap: keep the colour panel shut
    b.addEventListener('click', (e) => { if (dragged) { e.stopImmediatePropagation(); dragged = false; } }, true);
  }

  /** Refresh after any tool, frame, selection or workspace change (cheap when nothing changed). */
  update(): void {
    const a = this.app;
    const ws = a.workspace;
    const cur = this.current();
    const sel = !!a.spatialSelection;
    const xp = a.transformParams;
    const flip = this.flipOn;
    const cels = this.layersOpen && (ws === 'draw' || ws === 'animate' || ws === 'time') ? a.celLayers : [];
    const editing = a.pointEditing;
    // drawing tools and their temporary states only belong to Draw and Animate: Timing, Motion and
    // Story keep their own options even when the last drawing tool was Fill, Select or Smudge
    const drawWs = isPaintingWorkspace(ws);
    const sharing = !!this.hooks.share?.open();
    const shape = drawWs && !!this.hooks.editShape && !a.arrangingAssets && a.shapeEditable && !editing && !a.transforming && (a.tool === 'brush' || a.tool === 'pen');
    // what changes from frame to frame: frozen while playing, so the bubbles are not rebuilt on every
    // frame (a tap on a bubble that is replaced between finger down and up is lost: Pause did nothing)
    const perFrame = a.playing ? 'playing' : [a.currentHold, a.currentRole, a.lf, a.drawing.vectors.length].join(',');
    const sig = [shape, sharing, a.lastShape?.choice ?? '', a.editor.autoKey, a.editor.throughCamera, a.editor.keyAtStart, this.hooks.story?.view() ?? '', a.playing, perFrame, this.level, ws, flip, cur, editing, a.pointStroke?.id ?? '', a.pointSelMode ?? '', a.straightDefault, a.pointsAfterHold, a.snapPoints, a.mergeOnSnap, this.pointSettings, a.pointWidthScope, a.pointChoiceSig, this.layersOpen, a.project.activeLayer, cels.map((l) => `${l.id}:${l.name}:${l.visible}`).join(','), a.plane, a.fillMode, sel, a.blankPage, a.onion.enabled, a.color, xp ? JSON.stringify(xp) : '', a.uiHidden, a.adjusting?.kind ?? '', a.symmetry, a.editor.keys.size, a.selectShape, a.selectOp, a.canReselect, a.hasArtClip, commandPrefs().hidden.join(','), a.transformFreeform, a.smudgeStrength, a.guide.mode, a.assist, a.guideEdit, a.fillStyle, a.color2, a.gradEditing].join('|');
    setTimeout(() => this.measure(), 0);
    for (const b of this.modes.querySelectorAll<HTMLButtonElement>('[data-ws]')) b.setAttribute('aria-pressed', String(!sharing && b.dataset.ws === ws));
    this.modes.querySelector<HTMLButtonElement>('[data-mode="share"]')?.setAttribute('aria-pressed', String(sharing));
    this.modeName.textContent = sharing ? 'Share' : { animate: 'Animate', draw: 'Draw', time: 'Timing', motion: 'Motion', board: 'Story' }[ws];
    const paintingSig = `${sig}|${a.inkPaint.enabled}|${a.inkPaint.ink}|${a.autoPaintSupported}|${JSON.stringify(a.studentUI)}`;
    if (paintingSig === this.sig) return;
    this.sig = paintingSig;

    // tool bubbles for this mode
    this.tools.replaceChildren();
    const tools = this.toolsFor(ws);
    if ((ws === 'draw' || ws === 'animate') && !tools.some(([k]) => k === cur) && STUDENT_TOOLS.some(([id]) => id === cur) && !a.studentUI.tools[cur as StudentTool]) {
      const active = this.toolsFor(ws, true).find(([k]) => k === cur); if (active) tools.push(active);
    }
    for (const [k, label0, icon0] of tools) {
      if ((ws === 'draw' || ws === 'animate') && STUDENT_TOOLS.some(([id]) => id === k) && !a.studentUI.tools[k as StudentTool] && k !== cur) continue;
      const pause = k === 'play' && a.playing;
      const label = pause ? 'Pause' : label0, icon = pause ? 'pause' : icon0;
      const b = icon ? this.bubble(label, icon, label) : el('button', { type: 'button', class: 'bub bub-color', title: 'Colour', 'aria-label': 'Colour' });
      if (k === 'color') {
        b.style.setProperty('--chip', a.color);
        this.bindColorDrop(b);
      }
      const on = k === 'layers' ? this.layersOpen
        : k === 'autokey' ? a.editor.autoKey
        : k === 'look' ? a.editor.throughCamera
        : k === 'play' ? a.playing
        : k === cur || (k === 'onion' && a.onion.enabled);
      b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', () => this.pickTool(k, b));
      this.tools.append(b);
    }

    // context: only what the chosen tool needs, and only in the workspace it belongs to
    this.ctx.replaceChildren();
    const row = optionsRow(this.optionsState());
    const add = (...c: HTMLElement[]) => this.ctx.append(...c);
    // right after a snap: change the shape from here (no floating button on the simple screen)
    if (shape) add(this.chip('Edit shape', 'Change what the stroke snapped to, or keep your own stroke', false, (b) => this.hooks.editShape!(b), 'editpoints'));
    if (row === 'assets') {
      add(el('span', { class: 'bub-hint' }, 'Tap artwork · drag to move · corners resize'));
    } else if (row === 'points') {
      add(...this.widthControls());
    } else if (row === 'time') {
      // holds: how many frames the drawing stays (tap a number); marks; frame by frame
      const hold = a.currentHold;
      add(el('span', { class: 'bub-hint' }, '\u23f1 Hold'));
      for (const n of [1, 2, 3, 4]) add(...this.cmd(`time.hold${n}`));
      add(...this.cmd('time.shorter'));
      add(el('span', { class: 'bub-hint bub-hold' }, hold === null ? 'mixed' : `${hold} frame${hold === 1 ? '' : 's'}`));
      add(...this.cmd('time.longer'));
      add(el('span', { class: 'bub-sep', 'aria-hidden': 'true' }));
      add(...this.cmd('time.key'), ...this.cmd('time.breakdown'), ...this.cmd('time.inbetween'), this.customizeChip('time'));
    } else if (row === 'layers') {
      // tight layer control: only this cel's linked layers, front first; tap one to draw on it
      const me = a.project.isPlaceholder ? '' : a.project.activeLayer;
      cels.forEach((l) => {
        add(this.chip(l.name, l.id === me ? 'You draw on this layer' : `Draw on ${l.name}`, l.id === me, () => { if (l.id !== me) a.pickLayer(l.id); this.sig = ''; this.update(); }));
      });
      add(this.chip('+ Layer', 'A new art layer for these cels: same frames and timing, its own drawing', false, () => { a.addCelLayer(); this.sig = ''; this.update(); }));
      if (!flip) add(this.chip('All layers', 'Every layer of the shot', false, (b) => this.hooks.layers(b)));
    } else if (row === 'transform' && xp) {
      add(...this.commandChips('transform'));
    } else if (row === 'adjust') {
      add(...this.adjustControls());
    } else if (row === 'smudge') {
      add(
        this.chip('Line', 'Smudge the LINE', a.plane === 'line', () => { a.setPlane('line'); a.setSmudging(true); }),
        this.chip('Fill', 'Smudge the FILL', a.plane === 'fill', () => { a.setPlane('fill'); a.setSmudging(true); }),
        ...this.cmd('smudge.softer'),
        el('span', { class: 'bub-hint' }, `Strength ${Math.round(a.smudgeStrength * 100)}%`),
        ...this.cmd('smudge.stronger'),
        this.customizeChip('smudge'),
      );
    } else if (row === 'paint') {
      add(...this.cmd('paint.inkpaint'));
      if (a.inkPaint.enabled && a.studentUI.controls.inkPaint) {
        const ink = el('label', { class: 'ink-paint-colour', title: 'Ink colour (automatic paint uses the main Colour)' }, 'Ink');
        const input = el('input', { type: 'color', 'aria-label': 'Ink colour', value: a.inkPaint.ink });
        input.addEventListener('change', () => a.setInkColor(input.value)); ink.append(input); add(ink);
        add(this.chip('Paint colour', `Automatic paint: ${a.color}. Choose paint colour.`, false, b => this.hooks.colorPanel(b), 'palette'));
      }
      add(this.chip('Brushes', 'Brush library', false, (b) => this.hooks.brushLibrary(b), 'brushes'));
      if (a.studentUI.controls.planes) add(this.chip('Line', 'Paint on LINE: your ink', a.plane === 'line', () => a.setPlane('line')), this.chip('Fill', 'Paint on FILL: colour under the ink', a.plane === 'fill', () => a.setPlane('fill')));
      if (a.studentUI.controls.symmetry) add(this.symmetryChip());
      if (a.studentUI.controls.guides || a.guideEdit) add(...this.guideChips());
      add(...this.cmd('paint.editpoints'), this.customizeChip('paint'));
    } else if (row === 'fill') {
      add(...this.gradChips());
      add(
        this.chip('Tap / drag', 'Fill the areas you tap or drag across', a.fillMode === 'tap', () => a.setFillMode('tap')),
        this.chip('Leftovers', 'Clean up specks the fill missed', a.fillMode === 'leftover', () => a.setFillMode('leftover')),
      );
      add(el('span', { class: 'bub-sep', 'aria-hidden': 'true' }));
      for (const [k, label, title] of [['solid', 'Solid', 'One colour'], ['linear', 'Linear', 'A gradient: tap fills top to bottom, drag to set the direction'], ['radial', 'Radial', 'A gradient from the middle: drag from the centre to the edge']] as const) add(this.chip(label, title, a.fillStyle === k, () => a.setFillStyle(k)));
      if (a.fillStyle !== 'solid') {
        // the second colour (the gradient goes from your colour to this one) and a swap
        const second = el('label', { class: 'bub-color2', title: 'The second colour of the gradient' });
        second.style.setProperty('--chip', a.color2);
        const input = el('input', { type: 'color', 'aria-label': 'Second gradient colour' });
        input.value = a.color2;
        input.addEventListener('input', () => { second.style.setProperty('--chip', input.value); });
        input.addEventListener('change', () => a.setColor2(input.value));
        second.append(input);
        add(second, ...this.cmd('fill.swap'));
      }
      add(...this.cmd('fill.selection'), this.customizeChip('fill'));
    } else if (row === 'select') {
      // how to select (Procreate's modes) and how a new selection combines with this one
      const shapes: [SelectShape, string, string, string][] = [
        ['free', 'Freehand', 'Draw round what you want', 'lasso'],
        ['rect', 'Rectangle', 'Drag a rectangle', 'selrect'],
        ['ellipse', 'Ellipse', 'Drag an ellipse', 'selellipse'],
        ['auto', 'Automatic', 'Tap an area between lines', 'selauto'],
        ['color', 'Colour', 'Tap a colour; drag sideways before lifting to take more or fewer shades', 'palette'],
      ];
      // one chip per choice, the current one pressed
      const shapeChips = shapes.map(([k, label, title, icon]) => this.chip(label, `${label}: ${title.toLowerCase()}`, a.selectShape === k, () => a.setSelectShape(k), icon));
      const ops = [['new', 'New', 'Start a new selection', 'selnew'], ['add', 'Add', 'Add to the selection', 'seladd'], ['subtract', 'Subtract', 'Take away from the selection', 'selsub']] as const;
      const opChips = ops.map(([k, label, title, icon]) => this.chip(label, title, a.selectOp === k, () => a.setSelectOp(k), icon));
      const sep = () => el('span', { class: 'bub-sep', 'aria-hidden': 'true' });
      // Fill in the selection with a gradient style starts a gradient edit here too
      add(...this.gradChips(), ...shapeChips, sep(), ...opChips, sep());
      // the actions come from the command registry, minus the ones this device hides
      add(...this.commandChips('select'));
    } else if (row === 'board') {
      const st = this.hooks.story;
      if (st) {
        for (const [v, label, show] of [['panels', 'Panels', 'Panels'], ['timeline', 'Timeline', 'Timeline'], ['split', 'Split', 'Both']] as const) add(this.chip(show, `Board view: ${label}`, st.view() === v, () => { st.setView(v); this.sig = ''; this.update(); }));
      }
      add(this.chip('\u25c0 Earlier', 'Move the selected panels earlier', false, () => a.moveSelection(-1)), this.chip('Later \u25b6', 'Move the selected panels later', false, () => a.moveSelection(1)));
      add(this.chip('Animate this shot', 'Draw the animation on top of the board', false, () => a.animateShot(), 'draw'));
    } else if (row === 'motion') {
      // easing, reverse and delete only when keys are selected; otherwise just how new keys start
      if (a.editor.keys.size) {
        for (const e of EASINGS) add(this.chip(e.label, `Easing of the selected keys: ${e.label}`, false, () => a.editor.setEasing(e.id)));
        add(this.chip('Reverse', 'Play the selected keys backwards', false, () => a.editor.reverse()));
        add(this.chip('Delete key', 'Delete the selected keys', false, () => a.editor.deleteKeys(), 'trash'));
      }
      add(this.chip('Move from start', 'On: your first key also keeps where things were at the first frame, so they move from the start. Off: they jump straight to the key.', a.editor.keyAtStart, () => { a.editor.keyAtStart = !a.editor.keyAtStart; a.editor.onChange(); }));
    }
    this.ctx.hidden = !this.ctx.querySelector(':scope > :not(.scroll-arrow)');
  }
}
