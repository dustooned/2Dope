import type { App } from '../app';
import { QUICK_ACTIONS, QUICK_MENU_KEY, readQuickMenu, type QuickAction, type QuickMenuPrefs } from '../core/quickmenu';
import { isPaintingWorkspace } from '../core/workspace';
import { decorate } from './icons';
import { AppSettingsUI } from './settings';

export interface QuickMenuHooks {
  beforeOpen?(): void;
  colour(anchor: HTMLElement): void;
  brushes(anchor: HTMLElement): void;
  layers(anchor: HTMLElement): void;
  assets(): void;
}
const button = (name: string, icon: string, run: () => void) => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = name; b.setAttribute('aria-label', name); decorate(b, icon); b.addEventListener('click', run); return b;
};
/** Six existing actions, with no canvas gesture, document state or independent command path. */
export class QuickMenu {
  readonly trigger: HTMLButtonElement;
  readonly settings: AppSettingsUI;
  private prefs: QuickMenuPrefs;
  private popup: HTMLElement | null = null;
  private backdrop: HTMLElement | null = null;
  private owner: { project: App['project']; comp: string; layer: string; frame: number; workspace: App['workspace'] } | null = null;
  private observer: MutationObserver;
  private resize: ResizeObserver;
  constructor(private app: App, stage: HTMLElement, private canvas: HTMLCanvasElement, private hooks: QuickMenuHooks) {
    let saved: unknown = null; try { saved = JSON.parse(localStorage.getItem(QUICK_MENU_KEY) ?? 'null'); } catch { /* defaults */ }
    this.prefs = readQuickMenu(saved);
    this.settings = new AppSettingsUI(app, canvas, () => readQuickMenu(this.prefs), prefs => {
      this.prefs = readQuickMenu(prefs);
      try { localStorage.setItem(QUICK_MENU_KEY, JSON.stringify(this.prefs)); }
      catch { app.onNotice?.('QuickMenu changed for this session. This browser could not save your settings.'); }
      this.update();
    });
    this.trigger = button('QuickMenu', 'quick', () => this.toggle()); this.trigger.classList.add('quick-menu-trigger');
    this.trigger.title = 'QuickMenu (Q) · customize in App settings'; this.trigger.setAttribute('aria-haspopup', 'dialog');
    this.trigger.setAttribute('aria-controls', 'quick-menu-popup'); this.trigger.setAttribute('aria-expanded', 'false');
    stage.append(this.trigger);
    const frame = app.onFrameChange; app.onFrameChange = () => { frame(); this.update(); };
    const workspace = app.onWorkspaceChange; app.onWorkspaceChange = () => { workspace(); this.close(false); this.update(); };
    const tool = app.onToolChange; app.onToolChange = () => { tool(); this.update(); };
    const history = app.history.onChange; app.history.onChange = () => { history(); this.update(); };
    const comp = app.onCompChanged; app.onCompChanged = () => { comp(); this.update(); };
    const project = app.onProjectLoaded; app.onProjectLoaded = () => { project(); this.close(false); this.update(); };
    const stroke = app.onStrokeState; app.onStrokeState = active => { stroke(active); if (active) this.close(false); this.update(); };
    window.addEventListener('keydown', this.key, true); window.addEventListener('blur', () => this.close(false));
    window.addEventListener('resize', () => this.close(false));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.close(false); });
    this.observer = new MutationObserver(() => this.update()); this.observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    this.resize = new ResizeObserver(() => this.placeTrigger()); this.resize.observe(stage); this.update();
  }
  private blocked(): boolean {
    return !isPaintingWorkspace(this.app.workspace) || this.app.strokeActive || !!document.querySelector('dialog[open]') || document.body.matches('.gallery-open, .share-open');
  }
  update(): void {
    this.trigger.hidden = !this.prefs.showButton || !isPaintingWorkspace(this.app.workspace);
    this.trigger.dataset.edge = this.prefs.edge; this.placeTrigger();
    const a = this.app, o = this.owner;
    if (this.popup && (this.blocked() || !o || o.project !== a.project || o.comp !== a.project.activeComp || o.layer !== a.project.activeLayer || o.workspace !== a.workspace || (!a.playing && o.frame !== a.frame))) this.close(false);
    if (this.popup) this.syncActions();
  }
  /** Pick clear space on the chosen edge without moving the canvas or editor. */
  private placeTrigger(): void {
    if (this.trigger.hidden) return;
    const stage = this.trigger.parentElement!, bounds = stage.getBoundingClientRect();
    const trigger = this.trigger.getBoundingClientRect();
    const left = trigger.width ? trigger.left : bounds.left + 8, right = trigger.width ? trigger.right : left + 100;
    const obstacles = [...stage.querySelectorAll<HTMLElement>('.painting-header, .bub-tools, .bub-ctx, .painting-handle, .sidebar, .asset-placement-tools, .flip-row')]
      .filter(e => !e.hidden && e.getBoundingClientRect().height && getComputedStyle(e).display !== 'none')
      .map(e => e.getBoundingClientRect()).filter(r => r.left < right + 4 && r.right > left - 4);
    const max = Math.max(8, bounds.height - 52), candidates: number[] = [];
    // Prefer the lower edge, moving up only to clear existing controls/flipbook.
    for (let top = max; top >= 8; top -= 4) candidates.push(top);
    const top = candidates.find(y => obstacles.every(r => bounds.top + y + 48 <= r.top - 4 || bounds.top + y >= r.bottom + 4)) ?? max;
    if (this.trigger.style.top !== `${top}px`) this.trigger.style.top = `${top}px`;
  }
  toggle(): void {
    if (this.popup) return this.close();
    if (this.blocked()) return;
    this.hooks.beforeOpen?.();
    const a = this.app;
    this.owner = { project: a.project, comp: a.project.activeComp, layer: a.project.activeLayer, frame: a.frame, workspace: a.workspace };
    const backdrop = document.createElement('div'); backdrop.className = 'quick-menu-backdrop'; this.backdrop = backdrop;
    const popup = document.createElement('section'); popup.className = 'quick-menu-popup'; popup.id = 'quick-menu-popup'; this.popup = popup;
    popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', 'QuickMenu'); popup.setAttribute('data-own-keys', '');
    const header = document.createElement('header'); header.className = 'quick-menu-head';
    const title = document.createElement('strong'); title.textContent = 'QuickMenu';
    const close = button('Close QuickMenu', 'close', () => this.close()); close.classList.add('icon-only'); header.append(title, close);
    const ring = document.createElement('div'); ring.className = 'quick-menu-ring';
    this.prefs.actions.forEach((id, i) => {
      const spec = QUICK_ACTIONS.find(a => a.id === id)!;
      const b = button(spec.label, spec.icon, () => this.run(id)); b.dataset.quickAction = id; b.dataset.slot = String(i); ring.append(b);
    });
    const customize = button('Customize QuickMenu', 'gear', () => { this.close(false); this.settings.show(this.trigger, 'quickmenu'); });
    customize.className = 'quick-menu-customize'; ring.append(customize); popup.append(header, ring);
    backdrop.addEventListener('pointerdown', e => { if (e.target === backdrop) { e.preventDefault(); e.stopPropagation(); this.close(); } });
    backdrop.append(popup); document.body.append(backdrop); this.trigger.setAttribute('aria-expanded', 'true'); this.syncActions();
    const measured = this.trigger.getBoundingClientRect(), rect = popup.getBoundingClientRect();
    const anchor = measured.height ? measured : { left: (innerWidth - rect.width) / 2, right: (innerWidth + rect.width) / 2, top: innerHeight / 2 };
    popup.style.left = `${Math.max(8, Math.min(innerWidth - rect.width - 8, this.prefs.edge === 'right' ? anchor.right - rect.width : anchor.left))}px`;
    popup.style.top = `${Math.max(8, Math.min(innerHeight - rect.height - 8, anchor.top - rect.height / 2))}px`;
    (popup.querySelector<HTMLButtonElement>('[data-quick-action]:not(:disabled)') ?? customize).focus({ preventScroll: true });
  }
  close(focus = true): void {
    if (!this.popup) return;
    this.backdrop?.remove(); this.backdrop = this.popup = null; this.owner = null;
    this.trigger.setAttribute('aria-expanded', 'false');
    if (focus) this.canvas.focus({ preventScroll: true });
  }
  private available(id: QuickAction): boolean {
    const a = this.app;
    if (id === 'none') return false;
    if (id === 'undo') return !a.playing && a.history.canUndo;
    if (id === 'redo') return !a.playing && a.history.canRedo;
    if (['newFrame', 'duplicate'].includes(id)) return !a.playing && !a.arrangingAssets && !a.project.layer.locked && !a.editingMask;
    if (['brush', 'eraser', 'pen', 'smudge', 'fill', 'plane', 'inkPaint', 'eyedropper', 'previous', 'next', 'assets'].includes(id)) return !a.playing;
    return true;
  }
  private syncActions(): void {
    const a = this.app;
    for (const b of this.popup!.querySelectorAll<HTMLButtonElement>('[data-quick-action]')) {
      const id = b.dataset.quickAction as QuickAction; b.disabled = !this.available(id);
      if (id === 'play' && b.dataset.icon !== (a.playing ? 'pause' : 'play')) decorate(b, a.playing ? 'pause' : 'play');
      if (['brush', 'eraser', 'pen', 'smudge', 'onion', 'play', 'inkPaint'].includes(id)) b.setAttribute('aria-pressed', String(id === 'inkPaint' ? a.inkPaint.enabled : id === 'smudge' ? a.smudging : id === 'onion' ? a.onion.enabled : id === 'play' ? a.playing : a.tool === id && !a.smudging));
    }
  }
  private run(id: QuickAction): void {
    this.update();
    if (!this.popup || this.blocked() || !this.available(id)) return;
    const a = this.app, anchor = this.trigger.getBoundingClientRect().height ? this.trigger : this.canvas;
    this.close();
    switch (id) {
      case 'undo': a.undo(); break;
      case 'redo': a.redo(); break;
      case 'brush': a.setSmudging(false); a.setTool('brush'); break;
      case 'eraser': case 'pen': a.setTool(id); break;
      case 'smudge': a.setSmudging(true); break;
      case 'fill': a.selectMoves = false; a.setFillMode('tap'); a.setTool('fill'); break;
      case 'eyedropper': a.armEyedropper(); break;
      case 'newFrame': a.flipAddFrame(true); break;
      case 'flipView': a.flipView(); break;
      case 'fitView': a.fit(); break;
      case 'resetRotation': a.resetRotation(); break;
      case 'plane': a.togglePlane(); break;
      case 'inkPaint': a.setInkPaint(!a.inkPaint.enabled); break;
      case 'colour': this.hooks.colour(anchor); break;
      case 'brushes': this.hooks.brushes(anchor); break;
      case 'layers': this.hooks.layers(anchor); break;
      case 'assets': this.hooks.assets(); break;
      case 'duplicate': void a.duplicateSelection(); break;
      case 'previous': a.prevFrame(); break;
      case 'next': a.nextFrame(); break;
      case 'play': a.togglePlay(); break;
      case 'onion': a.toggleOnion(); break;
    }
  }
  private key = (e: KeyboardEvent): void => {
    // a key sent to the document or window has no element to look inside
    const target = e.target instanceof Element ? e.target as HTMLElement : null;
    if (e.defaultPrevented || document.querySelector('dialog[open]') || target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    if (e.code === 'KeyQ' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      if (target?.closest('[data-own-keys]') && !this.popup?.contains(target)) return;
      if (this.blocked()) return;
      e.preventDefault(); e.stopPropagation(); if (!e.repeat) this.toggle(); return;
    }
    if (!this.popup) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
    const buttons = [...this.popup.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Tab') {
      if (e.shiftKey ? at <= 0 : at === buttons.length - 1) { e.preventDefault(); buttons[e.shiftKey ? buttons.length - 1 : 0]?.focus(); }
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) {
      e.preventDefault(); e.stopPropagation();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (at + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus({ preventScroll: true });
    }
  };
}
