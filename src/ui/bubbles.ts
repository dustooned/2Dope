import type { SymmetryMode } from '../core/adjust';
import type { SelectShape } from '../app';
import { GUIDE_NAMES, type GuideMode } from '../core/guides';
import { EASINGS } from '../core/anim';
import type { App, Workspace } from '../app';
import type { Tool } from '../core/stroke';
import { decorate } from './icons';
import { STUDENT_TOOLS, type StudentTool } from '../core/studentprefs';
import { isPaintingWorkspace, optionsRow, toolChoice, type OptionsState } from '../core/workspace';
import { isCommandHidden, orderCommands } from '../core/commandprefs';
import { commandById, commandName, commandPrefs, commandsFor, commandsIn, CONTEXT_NAMES, onCommandPrefsChange, orderRow, setHidden, setRowLayout, type Command, type CommandContext } from './commands';
import { BarEditor } from './baredit';
import { attachContextMenu } from './contextmenu';
import { onionHold } from './onionpop';
import type { BoardView } from './board';
import type { BalloonStyle } from '../lettering/spec';
import { defaultWorkspaceLayout, WORKSPACE_NAMES, WORKSPACE_TOOLS, WORKSPACE_TOOL_NAMES, type WorkspaceTool } from '../core/workspacelayout';
import { el } from './dom';

/** Option rows whose actions the user can reorder (their command context has the same name). */
const ORDERED_ROWS: string[] = ['select', 'transform', 'time', 'fill', 'smudge', 'paint', 'points'];

export type UiLevel = 'clean' | 'simple' | 'full';
const LEVEL_KEY = '2dope.ui.level';
const LEVELS: UiLevel[] = ['clean', 'simple', 'full'];


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
  story?: { view(): BoardView; setView(v: BoardView): void; images(): void; exportBoard(): void; controlsInPanel?: boolean };
  /** Motion actions the bubbles reach. */
  motion?: { group(): void; split(): void; controlsInPanel?: boolean };
  /** Draw's bottom view: the flipbook (on) or the timeline. */
  flip?: { on(): boolean; set(on: boolean): void };
  /** Share: the last mode, preview and make the movie. */
  share?: { open(): boolean; show(): void };
  /** Hold the interface button: put the whole screen back to its starting layout. */
  resetUi?: () => void;
  editWorkspace?: (anchor: HTMLElement) => void;
}

/**
 * Draw and Animate's toolbar standard: a tool button selects that tool and stays pressed while it is
 * current; Brush, Smudge, Vector and Eraser open their brushes on a second tap; Move assets is a mode
 * that a second tap (or Done) ends. Colour, Layers, Reference and More open a panel and are never
 * "current". Each title says which, so a tap is never a surprise.
 */
const TOOL_HELP: Partial<Record<string, string>> = {
  brush: 'Paint on the Ink or Colour target', smudge: 'Blend paint that is already there', pen: 'Editable vector lines (they can run past the page with Overscan)',
  eraser: 'Erase paint, and cut vector lines on Ink', fill: 'Fill closed areas', select: 'Select an area to move, copy or fill',
  transform: 'Move, size or rotate the selection, or the whole drawing', adjust: 'Colour and blur adjustments to the current drawing',
  assets: 'Tap placed artwork, drag to move, corners to resize',
  eyedrop: 'Tap the canvas to take the colour you see there (or hold a finger still on it)',
  play: 'Play or pause the shot', onion: 'Show the drawings before and after (hold for its settings)', prevdraw: 'Go to the previous drawing', nextdraw: 'Go to the next drawing',
  safeareas: 'Show or hide the title and action safe frames (never exported)', centrecross: 'Show or hide the centre cross (never exported)',
  overscan: 'Show the art past the page edge, dimmed (exports keep the page)',
  insert: 'A new blank drawing after this one', dup: 'Duplicate this drawing', del: 'Delete this drawing', fx: 'Effects of the layer you draw on',
};
/** Animation actions on a painting tool bar: they act at once, they are not a current tool. */
const ACTION_KEYS = new Set(['play', 'onion', 'prevdraw', 'nextdraw', 'insert', 'dup', 'del', 'fx', 'safeareas', 'centrecross', 'overscan']);
/** Canvas view switches a bar can carry (Motion has them by default). */
const VIEW_TOOLS: [ToolKey, string, string][] = [['safeareas', 'Title safe', 'safearea'], ['centrecross', 'Centre cross', 'centrecross'], ['overscan', 'Overscan', 'overscan']];
const PANEL_HELP: Partial<Record<string, string>> = {
  color: 'Opens the colour panel; drag it onto the canvas to fill an area', layers: 'Opens the layer list', reference: 'Opens the reference window', more: 'Browse tools by task',
};
const SECOND_TAP: Partial<Record<string, string>> = { brush: 'Tap again for brushes', smudge: 'Tap again for brushes', pen: 'Tap again for brushes', eraser: 'Tap again for brushes', assets: 'Tap again (or Done) to go back to drawing' };

type ToolKey = 'assets' | 'more' | 'transform' | 'brush' | 'pen' | 'eraser' | 'fill' | 'select' | 'color' | 'onion' | 'layers'
  | 'smudge' | 'letter' | 'adjust' | 'insert' | 'fx' | 'flipbook' | 'reference' | 'panel' | 'images' | 'dup' | 'del' | 'play' | 'export' | 'addlayer' | 'camera' | 'group' | 'split' | 'autokey' | 'look'
  | 'prevdraw' | 'nextdraw' | 'eyedrop' | 'safeareas' | 'centrecross' | 'overscan';

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
  private readonly extraTools = el('section', { class: 'bub-tool-drawer', 'aria-label': 'More tools', hidden: '' });
  private readonly levelBtn = el('button', { type: 'button', class: 'bub bub-level' });
  level: UiLevel = 'simple';
  private sig = '';
  /** The Layers bubble shows this cel's linked layers in the context bar. */
  private layersOpen = false;
  private moreTools = false;
  private transformOptions = false;
  /** Point editing's on/off settings, folded behind one chip. */
  private pointSettings = false;
  /** Dock-style editing of the tool bar or an options row. */
  readonly barEdit = new BarEditor();
  /** The tool bar is being edited: it shows exactly the pinned tools. */
  private editingTools = false;

  /** How far down the bubble rows reach (px from the stage top); the canvas fits below it. */
  private topClear = -1;
  private lastWorkspace: Workspace | null = null;

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
    // the interface level: a small menu that says what each choice shows (not a blind cycle)
    const menu = el('div', { class: 'bub-levelmenu', role: 'menu', hidden: '' });
    const choices: [UiLevel, string, string][] = [
      ['clean', 'Focus', 'Just the canvas and your tools'],
      ['simple', 'Simple', 'Modes, tools and the timeline'],
      ['full', 'Full', 'Classic panels and detailed timeline controls'],
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
    stage.append(this.modes, this.tools, this.ctx, this.extraTools);
    stage.addEventListener('pointerdown', e => {
      if (this.moreTools && !this.extraTools.contains(e.target as Node) && !this.tools.contains(e.target as Node)) {
        this.moreTools = false; this.sig = ''; this.update();
      }
    }, true);
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.moreTools) { e.preventDefault(); e.stopImmediatePropagation(); this.moreTools = false; this.sig = ''; this.update(); this.tools.querySelector<HTMLButtonElement>('[data-tool-key="more"]')?.focus(); }
    }, true);
    // inside the stage, so it never sits on a side panel
    stage.append(this.levelBtn);
    this.level = app.interfaceLevel;
    const levelChanged = app.onInterfaceLevelChange;
    app.onInterfaceLevelChange = () => { levelChanged(); this.setLevel(app.interfaceLevel); };
    this.setLevel(this.level, false);
    // hiding or showing a command (here or in App settings) redraws the row
    onCommandPrefsChange(() => { this.sig = ''; this.update(); });
    window.addEventListener('resize', () => setTimeout(() => { this.measure(); this.revealMode(); }, 0));
  }

  /** Keep the active mode in the scrollable header after navigation or a viewport resize. */
  private revealMode(): void {
    const active = this.modes.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!active || !this.modes.clientWidth) return;
    const r = active.getBoundingClientRect(), box = this.modes.getBoundingClientRect();
    if (r.right > box.right - 6) this.modes.scrollLeft += r.right - box.right + 6;
    else if (r.left < box.left + 6) this.modes.scrollLeft -= box.left - r.left + 6;
  }

  /**
   * Measure the bubble rows (they wrap on narrow screens) and publish it to the stage as CSS
   * variables: --tools-bottom (where the context row goes on a phone), --top-clear (what the
   * canvas, layer label and sidebar keep clear of) and --side-top (the sidebar's top edge).
   */
  private measure(): void {
    const s = this.stage.getBoundingClientRect();
    const bottomOf = (e: HTMLElement | null) => (e?.offsetParent && !e.hidden ? e.getBoundingClientRect().bottom - s.top : 0);
    const narrow = window.innerWidth <= 700;
    const painting = document.body.classList.contains('painting-workspace');
    if (painting) this.placePaintingRows(s);
    if (this.app.workspace === 'board') this.stage.style.setProperty('--story-tool-left', `${Math.round(this.modes.getBoundingClientRect().right - s.left + 8)}px`);
    this.stage.style.setProperty('--edge-tool-width', `${this.tools.offsetWidth}px`);
    let left = 8, right = 8;
    if (painting || this.app.workspace === 'board') {
      const obstacles = [...this.stage.querySelectorAll<HTMLElement>('.sidebar:not(.compact)')];
      if (this.app.workspaceLayouts[this.app.workspace].toolDock !== 'top') obstacles.push(this.tools);
      for (const e of obstacles) {
        if (!e.offsetParent || e.hidden) continue;
        const r = e.getBoundingClientRect();
        if (r.left + r.width / 2 < s.left + s.width / 2) left = Math.max(left, r.right - s.left + 8);
        else right = Math.max(right, s.right - r.left + 8);
      }
    }
    this.stage.style.setProperty('--context-left', `${left}px`); this.stage.style.setProperty('--context-right', `${right}px`);
    // the mode and tool rows side by side need the stage's width; when they do not fit (a tablet
    // upright, a split screen) the tools go under the modes, as on a phone
    const mw = this.modes.offsetParent ? this.modes.offsetWidth : 0, tw = this.tools.offsetParent && !this.tools.hidden ? this.tools.offsetWidth : 0;
    const stack = !painting && !narrow && mw > 0 && tw > 0 && mw + tw + 60 + 60 + 12 > s.width;
    if (stack !== this.stage.classList.contains('bub-stack')) this.stage.classList.toggle('bub-stack', stack);
    const tools = Math.max(bottomOf(this.modes), this.app.workspaceLayouts[this.app.workspace].toolDock === 'top' ? bottomOf(this.tools) : 0);
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
    const clear = Math.round(painting ? Math.max(bottomOf(this.modes), bottomOf(this.stage.querySelector<HTMLElement>('.painting-header')!),
      this.app.workspaceLayouts[this.app.workspace].toolDock === 'top' ? bottomOf(this.tools) : 0) + 8
      : Math.max(tools + 8, bottomOf(this.ctx) + 6));
    const label = 0; // the layer label is kept clear by the fit itself
    this.stage.style.setProperty('--tools-bottom', `${painting ? clear : Math.round(tools + 6)}px`);
    this.stage.style.setProperty('--chrome-bottom', `${clear}px`);
    if (!painting) this.stage.style.setProperty('--dock-top', `${bottomOf(this.modes) + 8}px`);
    this.stage.style.setProperty('--side-top', `${clear + (narrow && !painting && this.app.workspace !== 'board' ? 40 : 0)}px`);
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
    const compact = innerHeight <= 500 && s.width >= 600;
    const top = compact ? 8 : Math.round(this.modes.getBoundingClientRect().bottom - s.top + 4);
    this.stage.style.setProperty('--mode-top', '8px');
    this.stage.style.setProperty('--ph-top', `${top}px`);
    this.stage.style.setProperty('--pt-top', `${top}px`);
    const shown = !!header && !header.hidden && header.offsetParent !== null;
    const natural = header ? [...header.children].filter((e): e is HTMLElement => e instanceof HTMLElement && !e.hidden).reduce((sum, e) => sum + e.getBoundingClientRect().width + 6, 6) : 0;
    const width = shown ? Math.min(natural, Math.max(100, s.width * (compact ? .25 : .45))) : 0;
    this.stage.style.setProperty('--asset-header-width', `${Math.round(width)}px`);
    this.stage.style.setProperty('--ph-left', `${Math.round(s.width - width - (compact ? 60 : 8))}px`);
    this.stage.style.setProperty('--pt-left', `${compact ? Math.round(this.modes.getBoundingClientRect().right - s.left + 8) : 8}px`);
    this.stage.style.setProperty('--tool-row-right', `${Math.round(compact ? width + 68 : width ? width + 16 : 8)}px`);
    this.stage.style.setProperty('--dock-top', `${Math.round(top + (shown ? header.offsetHeight : 44) + 6)}px`);
  }

  setLevel(l: UiLevel, remember = true): void {
    this.level = l;
    this.app.interfaceLevel = l;
    for (const x of LEVELS) document.body.classList.toggle(`ui-${x}`, x === l);
    this.levelBtn.textContent = 'Interface';
    decorate(this.levelBtn, 'layout');
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
    // A command may change state no App callback reports. Redraw if the row changed.
    const b = this.chip(f.label ?? c.label, f.title ?? c.title, c.isOn?.(a) ?? false, () => { c.run(a); this.update(); }, f.icon ?? c.icon);
    b.dataset.command = c.id;
    // right-click or hold: take it off this row (Customize brings it back)
    attachContextMenu(b, () => [{ label: `Hide “${commandName(c)}” from this row`, run: () => setHidden(c.id, true) }]);
    return b;
  }

  private customize(context: CommandContext, _anchor: HTMLElement): void {
    this.editRow(context);
  }

  /** Edit an options row: drag its actions to reorder, off the row to hide, from the tray to show. */
  editRow(context: CommandContext): void {
    const a = this.app;
    const items = (bar: HTMLElement) => [...bar.querySelectorAll<HTMLElement>(':scope > [data-command]')];
    const shown = () => { const p = commandPrefs(); return orderCommands(p, context, commandsIn(context)).filter((c) => !isCommandHidden(p, c.id)).map((c) => c.id); };
    const redraw = () => { this.sig = ''; this.update(); };
    this.barEdit.open({
      name: CONTEXT_NAMES[context] ?? 'row',
      bar: () => this.ctx,
      items,
      idOf: (x) => x.dataset.command!,
      available: () => commandsIn(context).map((c) => ({ id: c.id, label: commandName(c), icon: c.icon })),
      shown,
      apply: (ids) => {
        // actions not on the row right now (Paste with nothing copied) keep their place on it
        const rendered = new Set(items(this.ctx).map((x) => x.dataset.command!));
        const resting = shown().filter((id) => !rendered.has(id) && !ids.includes(id));
        setRowLayout(context, [...ids, ...resting]);
        redraw();
      },
      reset: () => { setRowLayout(context, [], true); redraw(); },
      notice: (t) => a.onNotice?.(t),
    });
  }

  /** Edit this mode's tool bar: drag tools along it, off it, or onto it from the tray. */
  editTools(): void {
    const a = this.app, ws = a.workspace;
    const allowed: readonly string[] = WORKSPACE_TOOLS[ws];
    const save = (tools: string[]) => { a.setWorkspaceLayouts({ ...a.workspaceLayouts, [ws]: { ...a.workspaceLayouts[ws], tools: tools as WorkspaceTool[] } }); this.sig = ''; this.update(); };
    this.moreTools = false;
    this.editingTools = true;
    this.sig = '';
    this.update();
    this.barEdit.open({
      name: `${WORKSPACE_NAMES[ws]} tools`,
      bar: () => this.tools,
      items: (bar) => [...bar.querySelectorAll<HTMLElement>(':scope > [data-tool-key]')].filter((x) => x.dataset.toolKey !== 'more'),
      idOf: (x) => x.dataset.toolKey!,
      available: () => this.toolsFor(ws, true).filter(([k]) => allowed.includes(k)).map(([k, label, icon]) => ({ id: k, label: WORKSPACE_TOOL_NAMES[k as WorkspaceTool] ?? label, icon: icon || 'palette' })),
      shown: () => [...a.workspaceLayouts[ws].tools],
      apply: save,
      reset: () => save(defaultWorkspaceLayout(ws).tools),
      keep: isPaintingWorkspace(ws) || ws === 'board' ? { brush: 'Brush stays on the bar, so there is always a way to draw.' } : undefined,
      notice: (t) => a.onNotice?.(t),
      onClose: () => { this.editingTools = false; this.sig = ''; this.update(); },
    });
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
      transforming: a.transforming, pointEditing: a.pointEditing, arranging: a.arrangingAssets, layersOpen: this.layersOpen, lettering: a.lettering,
    };
  }

  /** Which tool bubble is lit (an adjustment in progress wins over the Fill or Select tool under it). */
  private current(): ToolKey {
    return toolChoice(this.optionsState());
  }

  private get flipOn(): boolean {
    return !!this.hooks.flip?.on() && (this.app.workspace === 'draw' || this.app.workspace === 'animate');
  }

  /** The Letter tool's row: balloon styles (what a tap makes; restyles the selected caption), edit, and In/Out presets. */
  private letterChips(): HTMLElement[] {
    const a = this.app, cap = a.selectedCaption;
    const styles: [BalloonStyle, string, string, string][] = [['speech', 'Speech', 'Oval with a tail', 'balloonSpeech'], ['thought', 'Thought', 'Cloud with bubbles', 'balloonThought'], ['shout', 'Shout', 'Jagged burst', 'balloonShout'], ['whisper', 'Whisper', 'Dashed outline', 'balloonWhisper'], ['box', 'Box', 'Narration box', 'balloonBox'], ['sfx', 'Sound effect', 'Big lettering, no balloon', 'sfx']];
    const out: HTMLElement[] = styles.map(([s, label, title, icon]) => this.chip(label, `${title}. Tap the canvas to add one${cap ? '; restyles the selected caption' : ''}`, (cap?.style ?? a.letters.style) === s, () => { a.letters.style = s; if (cap) a.setCaptionStyle(s); else a.onToolChange(); }, icon));
    if (cap) {
      out.push(this.chip('Edit caption', 'Words, font, size, balloon and colours: the Caption panel (or double-tap the balloon)', false, () => a.letters.onEdit?.(a.project.activeLayer, false), 'editCaption'));
      out.push(this.chip('Fade in', 'Fade the caption in from the playhead', false, () => a.captionPreset('fadeIn'), 'fadeIn'));
      out.push(this.chip('Pop in', 'The balloon pops in from its tail', false, () => a.captionPreset('popIn'), 'popIn'));
      out.push(this.chip('Type on', 'Letters appear one at a time', false, () => a.captionPreset('typeOn'), 'typeOn'));
      out.push(this.chip('Fade out', 'Fade the caption out, ending at the playhead', false, () => a.captionPreset('fadeOut'), 'fadeOut'));
    } else out.push(el('span', { class: 'bub-hint' }, "Tap to add a caption, or draw a balloon shape. Draw out from a balloon's edge for its tail."));
    return out;
  }

  private toolsFor(ws: Workspace, expanded = false): [ToolKey, string, string][] {
    const draw: [ToolKey, string, string][] = [['brush', 'Brush', 'brush'], ['smudge', 'Smudge', 'smudge'], ['pen', 'Vector', 'pen'], ['eraser', 'Eraser', 'eraser'], ['eyedrop', 'Eyedropper', 'eyedrop'], ['fill', 'Bucket fill', 'fill'], ['select', 'Select', 'lasso'], ['transform', 'Transform', 'transform'], ['adjust', 'Adjustments', 'adjust'], ['letter', 'Letter (captions)', 'letter']];
    // Draw and Flip (the flipbook) draw with every tool; Flip's layers are pages' layers
    // Focus: what a flipbook needs (Procreate Dreams' simplest drawing screen)
    const assets: [ToolKey, string, string] = ['assets', 'Move assets', 'freeform'];
    if (ws === 'draw' || ws === 'animate') {
      const anim: [ToolKey, string, string][] = [['play', 'Play', 'play'], ['onion', 'Onion skin', 'onion'], ['prevdraw', 'Previous drawing', 'prev'], ['nextdraw', 'Next drawing', 'next'], ['insert', 'New drawing', 'newframe'], ['dup', 'Duplicate drawing', 'dupframe'], ['del', 'Delete drawing', 'delframe'], ['fx', 'Effects', 'fx'], ...VIEW_TOOLS];
      const all: [ToolKey, string, string][] = [...draw, ...(ws === 'animate' ? [assets] : []), ['color', 'Colour', ''], ['layers', 'Layers', 'layers'], ['reference', 'Reference', 'image'], ...anim];
      if (expanded) return all;
      const pinned = this.app.workspaceLayouts[ws].tools;
      return [...pinned.flatMap(id => all.filter(([k]) => k === id)), ['more', 'More tools', 'more']];
    }
    // Timing is for timing and review: no brushes; the canvas scrubs (drag) and plays (tap)
    if (ws === 'time') return [['play', 'Play', 'play'], ['onion', 'Onion', 'onion'], ['insert', 'New drawing after this one', 'plus'], ['dup', 'Duplicate the drawing', 'copy'], ['del', 'Delete the drawing', 'trash'], ['layers', 'Layers: whose timing you edit', 'layers']];
    if (ws === 'board') return [['brush', 'Brush', 'brush'], ['eraser', 'Eraser', 'eraser'], ['color', 'Colour', ''], ['panel', 'New panel', 'plus'], ['images', 'Import images as panels', 'gallery'], ['dup', 'Duplicate panels', 'copy'], ['del', 'Delete panels', 'trash'], ['play', 'Play the animatic', 'play'], ['export', 'Share the storyboard or an animatic', 'export']];
    if (ws === 'motion') return [['addlayer', 'New drawing layer', 'plus'], ['camera', 'Add a camera', 'camera'], ['group', 'Group the selected layers', 'layers'], ['split', 'Split at the playhead', 'scissors'], ['autokey', 'Auto-key: every change writes a keyframe', 'key'], ['look', 'Look through the camera', 'viewfinder'], ['flipbook', 'Edit the selected drawing layer as a flipbook (Flip)', 'flipbook'], ['fx', 'Effects of the selected layer (line boil...)', 'fx'], ...VIEW_TOOLS];
    return [];
  }

  private pickTool(k: ToolKey, b: HTMLButtonElement): void {
    const a = this.app;
    const arranging = a.arrangingAssets;
    const transforming = a.transforming;
    if (k === 'assets') { this.moreTools = false; a.setArrangeAssets(!a.arrangingAssets); this.update(); return; }
    if (a.arrangingAssets && ['brush', 'pen', 'eraser', 'smudge', 'fill', 'select', 'adjust'].includes(k)) a.setArrangeAssets(false);
    if (k === 'more') {
      this.moreTools = !this.moreTools;
      this.update();
      const target = this.moreTools ? this.extraTools.querySelector<HTMLButtonElement>('[data-extra-tool]:not(:disabled)')
        : this.tools.querySelector<HTMLButtonElement>('[data-tool-key="more"]');
      target?.focus({ preventScroll: true });
      return;
    }
    this.moreTools = false;
    if (a.transforming && ['brush', 'eraser', 'pen', 'smudge', 'fill', 'select', 'adjust'].includes(k)) a.applyTransform();
    if (a.adjusting && k !== 'adjust' && k !== 'color' && k !== 'layers') a.applyAdjust();
    switch (k) {
      case 'adjust': if (!a.adjusting) a.beginAdjust('hsb'); break;
      case 'transform': a.toggleDrawTransform(); break;
      case 'brush': case 'pen': case 'eraser':
        if (a.tool === k && !arranging && !transforming && !(k === 'brush' && a.smudging)) this.hooks.brushLibrary(b);
        else { a.setTool(k as Tool); if (k === 'brush') a.setSmudging(false); }
        break;
      case 'smudge':
        // like Brush: the second tap opens the brushes Smudge carries paint with
        if (a.smudging && a.tool === 'brush' && !arranging && !transforming) this.hooks.brushLibrary(b);
        else a.setSmudging(true);
        break;
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
      case 'eyedrop': a.armEyedropper(); break;
      case 'letter': a.setLettering(!a.lettering); break;
      case 'safeareas': a.setCanvasView({ safeAreas: !a.canvasView.safeAreas }); break;
      case 'centrecross': a.setCanvasView({ centre: !a.canvasView.centre }); break;
      case 'overscan': a.setCanvasView({ overscan: !a.canvasView.overscan }); break;
      case 'prevdraw': a.prevDrawing(); break;
      case 'nextdraw': a.nextDrawing(); break;
      case 'fx': {
        if (isPaintingWorkspace(a.workspace) && !a.project.isPlaceholder) { a.openEffects?.(a.project.layer.id); break; }
        const id = a.editor.selected.find((s) => a.editor.comp.layers.some((l) => l.id === s && (l.kind === 'drawings' || l.kind === 'comp'))) ?? a.editor.comp.layers.find((l) => l.kind === 'drawings')?.id;
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
    if (ws !== this.lastWorkspace) { this.moreTools = false; this.layersOpen = false; this.lastWorkspace = ws; this.barEdit.close(); setTimeout(() => this.revealMode(), 0); }
    const layout = a.workspaceLayouts[ws];
    this.stage.dataset.toolDock = layout.toolDock;
    this.stage.classList.toggle('workspace-tool-labels', layout.labels);
    const cur = this.current();
    const sel = !!a.spatialSelection;
    const xp = a.transformParams;
    if (!xp) this.transformOptions = false;
    const size = a.transformDimensions;
    for (const field of this.ctx.querySelectorAll<HTMLInputElement>('[data-transform-dimension]')) {
      const key = field.dataset.transformDimension as 'width' | 'height' | 'angle';
      if (size && document.activeElement !== field) field.value = String(Number(size[key].toFixed(2)));
    }
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
    const transform = xp ? [a.transformMode, a.transformInterpolation, a.transformSnap, a.transformMagnetics, xp.flipH, xp.flipV].join(',') : '';
    const sig = [!!a.board, shape, sharing, a.lastShape?.choice ?? '', a.editor.autoKey, a.editor.throughCamera, a.editor.keyAtStart, this.hooks.story?.view() ?? '', a.playing, perFrame, this.level, ws, flip, cur, editing, a.pointStroke?.id ?? '', a.pointSelMode ?? '', a.straightDefault, a.pointsAfterHold, a.snapPoints, a.mergeOnSnap, this.pointSettings, a.pointWidthScope, a.pointChoiceSig, this.layersOpen, a.project.activeLayer, cels.map((l) => `${l.id}:${l.name}:${l.visible}`).join(','), a.plane, a.fillMode, sel, a.blankPage, a.onion.enabled, a.color, transform, a.uiHidden, a.adjusting?.kind ?? '', a.symmetry, a.eyedropArmed, JSON.stringify(a.canvasView), a.editor.keys.size, a.selectShape, a.selectOp, a.canReselect, a.hasArtClip, commandPrefs().hidden.join(','), a.smudgeStrength, a.guide.mode, a.assist, a.guideEdit, a.fillStyle, a.color2, a.gradEditing].join('|');
    setTimeout(() => this.measure(), 0);
    for (const b of this.modes.querySelectorAll<HTMLButtonElement>('[data-ws]')) b.setAttribute('aria-pressed', String(!sharing && b.dataset.ws === ws));
    const shareMode = this.modes.querySelector<HTMLButtonElement>('[data-mode="share"]');
    if (shareMode) { shareMode.setAttribute('aria-pressed', String(sharing)); shareMode.hidden = ws === 'board' && !!this.hooks.story?.controlsInPanel && !sharing; }
    const paintingSig = `${sig}|${a.inkPaint.enabled}|${a.inkPaint.ink}|${a.autoPaintSupported}|${JSON.stringify(a.studentUI)}|${JSON.stringify(layout)}|${this.moreTools}|${this.editingTools}|${this.transformOptions}|${ws === 'animate' && a.tool === 'pen' ? a.nextPoseBlocked ?? 'pose' : ''}`;
    if (paintingSig === this.sig) return;
    this.sig = paintingSig;

    // tool bubbles for this mode
    this.tools.replaceChildren();
    const tools = drawWs ? this.toolsFor(ws) : [...layout.tools.flatMap(id => this.toolsFor(ws, true).filter(([k]) => k === id)), ['more', 'More tools', 'more'] as [ToolKey, string, string]];
    if (drawWs && !this.editingTools && !tools.some(([k]) => k === cur)) {
      const active = this.toolsFor(ws, true).find(([k]) => k === cur); if (active) tools.splice(Math.max(0, tools.length - 1), 0, active);
    }
    for (const [k, label0, icon0] of tools) {
      // (while editing, every pinned tool shows, so a drag never unpins one a profile hides)
      if (!this.editingTools && (ws === 'draw' || ws === 'animate') && STUDENT_TOOLS.some(([id]) => id === k) && !a.studentUI.tools[k as StudentTool] && k !== cur) continue;
      const pause = k === 'play' && a.playing;
      const label = pause ? 'Pause' : label0, icon = pause ? 'pause' : icon0;
      const b = icon ? this.bubble(label, icon, label) : el('button', { type: 'button', class: 'bub bub-color', title: 'Colour', 'aria-label': 'Colour' });
      const visibleLabel = b.querySelector('.lbl');
      if (visibleLabel) visibleLabel.textContent = pause ? label : WORKSPACE_TOOL_NAMES[k as WorkspaceTool] ?? label;
      b.dataset.toolKey = k;
      if (ws === 'board' && !a.board && (k === 'brush' || k === 'eraser' || k === 'color')) b.disabled = true;
      if (k === 'onion') onionHold(a, b);
      if (k === 'more') { b.setAttribute('aria-expanded', String(this.moreTools)); b.setAttribute('aria-controls', 'workspace-extra-tools'); }
      if (k === 'color') {
        b.style.setProperty('--chip', a.color);
        this.bindColorDrop(b);
      }
      const on = k === 'layers' ? this.layersOpen
        : k === 'autokey' ? a.editor.autoKey
        : k === 'look' ? a.editor.throughCamera
        : k === 'play' ? a.playing
        : k === 'more' ? this.moreTools : k === 'eyedrop' ? a.eyedropArmed : k === 'safeareas' ? a.canvasView.safeAreas : k === 'centrecross' ? a.canvasView.centre : k === 'overscan' ? a.canvasView.overscan : k === 'transform' ? a.transforming : k === cur || (k === 'onion' && a.onion.enabled);
      b.setAttribute('aria-pressed', String(on));
      if (drawWs) {
        // one wording for every painting tool: what it does, then what a tap (or a second tap) does
        const name = WORKSPACE_TOOL_NAMES[k as WorkspaceTool] ?? label;
        const panel = PANEL_HELP[k], action = ACTION_KEYS.has(k);
        b.title = panel ? `${name}: ${panel}` : action ? `${name}: ${TOOL_HELP[k] ?? label}.` : `${name}${on ? ' (current)' : ''}: ${TOOL_HELP[k] ?? label}. ${on ? SECOND_TAP[k] ?? 'In use' : 'Tap to use'}.`;
        b.dataset.kind = panel ? 'panel' : action ? 'action' : 'tool';
        // tools first, then the panels, divided once
        const prev = this.tools.lastElementChild as HTMLElement | null;
        if (panel && k !== 'more' && prev?.dataset.kind === 'tool') this.tools.append(el('span', { class: 'bub-sep bub-tools-sep', 'aria-hidden': 'true' }));
      }
      b.addEventListener('click', () => this.pickTool(k, b));
      // right-click or hold a tool: edit the bar (the colour drags paint, Onion holds its own menu)
      if (k !== 'color' && k !== 'onion' && k !== 'more') attachContextMenu(b, () => [{ label: 'Edit tool bar…', run: () => this.editTools() }, ...(k !== 'brush' || !drawWs ? [{ label: `Remove ${WORKSPACE_TOOL_NAMES[k as WorkspaceTool] ?? label} from the bar`, run: () => a.setWorkspaceLayouts({ ...a.workspaceLayouts, [ws]: { ...layout, tools: layout.tools.filter((t) => t !== k) } }) }] : [])]);
      this.tools.append(b);
    }
    this.extraTools.id = 'workspace-extra-tools'; this.extraTools.hidden = !this.moreTools;
    this.extraTools.replaceChildren();
    if (this.moreTools) {
      const header = el('header', { class: 'tool-drawer-header' });
      header.append(el('strong', {}, `${WORKSPACE_NAMES[ws]} tools`), this.chip('Close tools', 'Close additional tools', false, () => {
        this.moreTools = false; this.update();
        this.tools.querySelector<HTMLButtonElement>('[data-tool-key="more"]')?.focus();
      }, 'close'));
      this.extraTools.append(header);
      const groups = new Map<string, HTMLElement>();
      for (const [k, label, icon] of this.toolsFor(ws, true)) {
        if (drawWs && STUDENT_TOOLS.some(([id]) => id === k) && !a.studentUI.tools[k as StudentTool] && k !== cur) continue;
        const name = ['safeareas', 'centrecross', 'overscan', 'look'].includes(k) ? 'Canvas view'
          : ws === 'board' ? ['brush', 'eraser', 'color'].includes(k) ? 'Sketch' : 'Panels and sharing'
          : ['color', 'layers', 'reference', 'assets'].includes(k) ? 'Artwork'
          : ACTION_KEYS.has(k) || ws === 'time' || ws === 'motion' ? 'Animation' : 'Drawing tools';
        let group = groups.get(name);
        if (!group) {
          group = el('section', { class: 'tool-drawer-group', 'aria-label': name });
          group.append(el('h3', { class: 'tool-section-label' }, name));
          groups.set(name, group);
          this.extraTools.append(group);
        }
        const b = this.chip(WORKSPACE_TOOL_NAMES[k as WorkspaceTool] ?? label, TOOL_HELP[k] ?? PANEL_HELP[k] ?? label,
          k === cur, b => this.pickTool(k, b), icon || 'palette');
        b.dataset.extraTool = k;
        if (ws === 'board' && !a.board && ['brush', 'eraser', 'color'].includes(k)) b.disabled = true;
        if (k === 'color') b.style.setProperty('--drawer-swatch', a.color);
        group.append(b);
      }
      const footer = el('footer', { class: 'tool-drawer-footer' });
      footer.append(this.chip('Edit tool bar', 'Pin and reorder your tools', false, () => this.editTools(), 'gear'));
      if (!drawWs && this.hooks.editWorkspace) footer.append(this.chip('Edit workspace', 'Set the dock and tool labels', false, () => {
        this.moreTools = false; this.update(); this.hooks.editWorkspace!(this.tools);
      }, 'layout'));
      this.extraTools.append(footer);
    }

    // context: only what the chosen tool needs, and only in the workspace it belongs to
    this.ctx.replaceChildren();
    const row = optionsRow(this.optionsState());
    this.ctx.dataset.essential = String(['select', 'transform', 'adjust', 'points', 'assets'].includes(row) || !!a.gradEditing || a.guideEdit || shape);
    this.ctx.dataset.row = row;
    const add = (...c: HTMLElement[]) => this.ctx.append(...c);
    // the row starts with whose settings these are, so they are never mistaken for tools
    const rowTitle = drawWs ? ({ paint: `${a.tool === 'pen' ? 'Vector' : a.tool === 'eraser' ? 'Eraser' : 'Brush'} settings`, fill: 'Bucket fill settings', smudge: 'Smudge settings', select: 'Selection settings', assets: 'Placement settings', points: 'Vector point settings', transform: 'Transform selection', adjust: 'Artwork adjustment' } as Partial<Record<string, string>>)[row] : undefined;
    if (rowTitle) add(el('span', { class: 'bub-hint bub-row-title' }, rowTitle));
    // right after a snap: change the shape from here (no floating button on the simple screen)
    if (shape) add(this.chip('Edit shape', 'Change what the stroke snapped to, or keep your own stroke', false, (b) => this.hooks.editShape!(b), 'editpoints'));
    if (row === 'assets') {
      add(...this.cmd('assets.layout'));
      add(el('span', { class: 'bub-hint' }, 'Tap artwork · drag to move · corners resize · Done or Move assets again to draw'));
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
      add(this.chip('Add layer', 'A new art layer for these cels: same frames and timing, its own drawing', false, () => { a.addCelLayer(); this.sig = ''; this.update(); }, 'plus'));
      if (!flip) add(this.chip('All layers', 'Every layer of the shot', false, (b) => this.hooks.layers(b), 'layers'));
    } else if (row === 'transform' && xp && size) {
      const essentials = ['uniform', 'freeform', 'distort', 'warp', 'apply', 'cancel'];
      const chips = this.commandChips('transform');
      const primary = (b: HTMLButtonElement) => essentials.includes(b.dataset.command?.split('.')[1] ?? '');
      add(...chips.filter(primary));
      const options = this.chip('Transform options', 'Show precision, snapping and transform options', this.transformOptions, () => {
        if (this.transformOptions) this.barEdit.close();
        this.transformOptions = !this.transformOptions;
        this.update();
        this.ctx.querySelector<HTMLButtonElement>('[aria-label="Transform options"]')?.focus();
      }, 'gear');
      options.setAttribute('aria-expanded', String(this.transformOptions));
      add(options);
      if (this.transformOptions) {
        add(...chips.filter(b => !primary(b)));
        const fields = el('div', { class: 'transform-fields' });
        for (const [key, label] of [['width', 'Width (px)'], ['height', 'Height (px)'], ['angle', 'Angle (°)']] as const) {
          const input = el('input', { type: 'number', step: 'any', 'data-transform-dimension': key });
          input.value = String(Number(size[key].toFixed(2)));
          input.onchange = () => {
            a.setTransformDimension(key, input.valueAsNumber);
            const result = a.transformDimensions;
            if (result) input.value = String(Number(result[key].toFixed(2)));
          };
          input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } };
          const row = el('label', {}, label);
          row.append(input);
          fields.append(row);
        }
        const sampling = el('select', { class: 'transform-sampling' });
        for (const [value, label] of [['nearest', 'Nearest Neighbor'], ['bilinear', 'Bilinear'], ['bicubic', 'Bicubic']] as const)
          sampling.add(new Option(label, value));
        sampling.value = a.transformInterpolation;
        sampling.onchange = () => a.setTransformInterpolation(sampling.value as typeof a.transformInterpolation);
        const distance = el('input', { type: 'number', min: '2', max: '32', step: '1' });
        distance.value = String(a.transformSnapDistance);
        distance.onchange = () => { a.setTransformSnapDistance(distance.valueAsNumber); distance.value = String(a.transformSnapDistance); };
        const interpolation = el('label', {}, 'Interpolation'), snapping = el('label', {}, 'Snap distance (px)');
        interpolation.append(sampling);
        snapping.append(distance);
        fields.append(interpolation, snapping);
        add(fields);
      }
    } else if (row === 'adjust') {
      add(el('span', { class: 'bub-hint adjustment-scope' }, a.adjusting?.mask ? 'Adjust: selected area · current drawing' : 'Adjust: current drawing · ink + colour'));
      add(...this.adjustControls());
    } else if (row === 'letter') {
      add(...this.letterChips());
    } else if (row === 'smudge') {
      add(
        this.chip('Ink target', 'Smudge the Ink', a.plane === 'line', () => { a.setPlane('line'); a.setSmudging(true); }, 'lineplane'),
        this.chip('Colour target', 'Smudge the Colour', a.plane === 'fill', () => { a.setPlane('fill'); a.setSmudging(true); }, 'fillplane'),
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
      if (a.studentUI.controls.planes) add(
        this.chip('Ink target', 'Paint on Ink: your lines', a.plane === 'line', () => a.setPlane('line'), 'lineplane'),
        this.chip('Colour target', 'Paint on Colour: colour under the ink', a.plane === 'fill', () => a.setPlane('fill'), 'fillplane'),
      );
      if (a.studentUI.controls.symmetry) add(this.symmetryChip());
      if (a.studentUI.controls.guides || a.guideEdit) add(...this.guideChips());
      add(...(ws === 'animate' && a.tool === 'pen' ? this.cmd('paint.nextpose') : []), ...this.cmd('paint.editpoints'), ...this.cmd('paint.objects'), ...this.cmd('paint.svg'), ...this.cmd('paint.rasterize'), this.customizeChip('paint'));
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
      if (st && !st.controlsInPanel) {
        for (const [v, label, show] of [['grid', 'Grid', 'Grid'], ['panels', 'Panels', 'Panels'], ['timeline', 'Timeline', 'Timeline'], ['split', 'Split', 'Both']] as const) add(this.chip(show, `Board view: ${label}`, st.view() === v, () => { st.setView(v); this.sig = ''; this.update(); }));
      }
      if (!st?.controlsInPanel) {
        add(this.chip('\u25c0 Earlier', 'Move the selected panels earlier', false, () => a.moveSelection(-1)), this.chip('Later \u25b6', 'Move the selected panels later', false, () => a.moveSelection(1)));
        add(this.chip('Animate this shot', 'Draw the animation on top of the board', false, () => a.animateShot(), 'draw'));
      }
    } else if (row === 'motion' && !this.hooks.motion?.controlsInPanel) {
      // easing, reverse and delete only when keys are selected; otherwise just how new keys start
      if (a.editor.keys.size) {
        for (const e of EASINGS) add(this.chip(e.label, `Easing of the selected keys: ${e.label}`, false, () => a.editor.setEasing(e.id)));
        add(this.chip('Reverse', 'Play the selected keys backwards', false, () => a.editor.reverse()));
        add(this.chip('Delete key', 'Delete the selected keys', false, () => a.editor.deleteKeys(), 'trash'));
      }
      add(this.chip('Move from start', 'On: your first key also keeps where things were at the first frame, so they move from the start. Off: they jump straight to the key.', a.editor.keyAtStart, () => { a.editor.keyAtStart = !a.editor.keyAtStart; a.editor.onChange(); }));
    }
    // the user's order of this row's actions (each moves into a slot the row's actions held)
    if (ORDERED_ROWS.includes(row)) orderRow(this.ctx, row as CommandContext);
    this.ctx.hidden = !this.ctx.querySelector(':scope > :not(.scroll-arrow)');
    this.barEdit.refresh();
  }
}
