import type { App } from '../app';
import { parseDialogue } from '../core/dialogue';
import { elText as el } from './dom';

/** Small panel navigator. Only visible thumbnail canvases allocate pixels. */
export class StoryNavigator {
  readonly root = el('nav');
  private signature = '';
  private project: App['project'] | null = null;
  private current = '';
  private readonly observer: IntersectionObserver;
  constructor(private app: App, private paint: (c: HTMLCanvasElement, id: string) => void) {
    this.root.className = 'story-panel-nav'; this.root.setAttribute('aria-label', 'Story panel navigator');
    this.observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const c = entry.target as HTMLCanvasElement;
        if (entry.isIntersecting && c.isConnected && !this.root.hidden) { c.width = 96; c.height = 64; this.paint(c, c.dataset.drawing!); }
        else { c.width = 0; c.height = 0; }
      }
    }, { root: this.root, rootMargin: '40px' });
    this.root.addEventListener('keydown', e => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-panel]'); if (!button) return;
      const i = Number(button.dataset.panel), end = (app.board?.exposures.length ?? 1) - 1;
      const next = ['ArrowRight', 'ArrowDown'].includes(e.key) ? i + 1 : ['ArrowLeft', 'ArrowUp'].includes(e.key) ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? end : null;
      if (next === null) return; e.preventDefault(); e.stopPropagation(); const target = Math.max(0, Math.min(end, next)); app.goPanel(target); this.root.querySelector<HTMLButtonElement>(`[data-panel="${target}"]`)?.focus({ preventScroll: true });
    });
  }
  update(current: number): void {
    const app = this.app, panels = app.board?.exposures ?? [];
    if (this.project !== app.project) { this.project = app.project; this.signature = ''; this.current = ''; }
    const signature = `${app.project.activeComp}|${app.timeFormat}|${app.project.comp.fps}|` + panels.map(e => `${e.drawing}:${e.length}:${e.shot ?? ''}:${e.dialogue ?? ''}:${e.action ?? ''}:${app.project.drawings.get(e.drawing)?.thumbRev}`).join('|');
    if (signature !== this.signature) {
      const focused = this.root.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.panel : undefined;
      this.signature = signature; this.observer.disconnect(); const fragment = document.createDocumentFragment();
      panels.forEach((e, i) => {
        const b = el('button'); b.type = 'button'; b.dataset.panel = String(i); b.setAttribute('aria-label', `Select story panel ${i + 1}`);
        const c = el('canvas'); c.width = 0; c.height = 0; c.dataset.drawing = e.drawing; c.setAttribute('aria-hidden', 'true');
        const text = el('span'), title = el('strong', `Panel ${i + 1}`), caption = parseDialogue(e.dialogue)[0], hint = el('small', caption?.text || e.action || e.shot || 'Untitled panel');
        const duration = el('small', app.fmtDur(e.length)); duration.className = 'story-nav-duration'; text.append(title, hint, duration); b.title = `${title.textContent}${e.shot ? ` · ${e.shot}` : ''} · ${hint.textContent} · ${duration.textContent}`;
        b.append(c, text); b.onclick = () => app.goPanel(i); fragment.append(b);
      });
      this.root.replaceChildren(fragment); this.root.querySelectorAll('canvas').forEach(c => this.observer.observe(c));
      if (focused !== undefined) this.root.querySelector<HTMLButtonElement>(`[data-panel="${focused}"]`)?.focus({ preventScroll: true });
    }
    this.root.querySelectorAll<HTMLButtonElement>('button').forEach(b => { const on = Number(b.dataset.panel) === current; b.classList.toggle('on', on); b.setAttribute('aria-current', String(on)); });
    const key = `${app.project.activeComp}:${current}`;
    if (!this.root.closest('[hidden]') && key !== this.current) { this.current = key; this.root.querySelector<HTMLElement>(`[data-panel="${current}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }
}
