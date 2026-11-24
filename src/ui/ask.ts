import type { App } from '../app';
import { searchAsk, type AskEntry, type AskKind } from '../core/ask';
import { commandEntries, effectEntries, gestureEntries, manualEntries, toolEntries } from '../core/askcatalog';
import { effectIcon, iconSvg } from './icons';
import { el } from './dom';
import { openModal } from './modal';

/**
 * Ask: type a word you remember (or the way you would say it) and 2Dope shows the tool, effect,
 * command or manual page it could be. Everything runs on this device (core/ask.ts); nothing is
 * sent anywhere. "Show me" opens the effect, switches to the tool or opens the manual page; a
 * command only says where it lives, so searching can never delete or change anything.
 */

const KIND_LABEL: Record<AskKind, string> = { effect: 'Effect', tool: 'Tool', command: 'Command', manual: 'Manual', gesture: 'Gesture' };
const FILTERS: { id: AskKind | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'effect', label: 'Effects' },
  { id: 'tool', label: 'Tools' },
  { id: 'command', label: 'Commands' },
  { id: 'gesture', label: 'Gestures' },
  { id: 'manual', label: 'Manual' },
];
const TOOL_ICON: Record<string, string> = { brush: 'draw', eraser: 'eraser', pen: 'curvept', fill: 'fill', select: 'lasso' };

export interface AskHooks {
  showManual(section: string): void;
}

let catalog: AskEntry[] | null = null;

/** Everything findable, built once: effects, tools, every command and the manual (loaded on first use). */
async function load(): Promise<AskEntry[]> {
  if (catalog) return catalog;
  const [{ MANUAL }, { COMMANDS, CONTEXT_NAMES }] = await Promise.all([import('./manualtext'), import('./commands')]);
  catalog = [...toolEntries(), ...effectEntries(), ...gestureEntries(), ...commandEntries(COMMANDS, CONTEXT_NAMES), ...manualEntries(MANUAL)];
  return catalog;
}

/** What "Show me" does for an entry, or null when it only tells you where to look. */
function action(app: App, hooks: AskHooks, e: AskEntry): { label: string; run: () => void } | null {
  if (e.kind === 'effect') {
    return { label: 'Show me', run: () => {
      if (app.project.isPlaceholder) { app.onNotice?.('Draw something first, then add the effect to that layer.'); return; }
      app.openEffects?.(app.project.activeLayer);
    } };
  }
  if (e.kind === 'tool') {
    return { label: 'Use it', run: () => {
      if (e.id === 'select') { app.setTool('fill'); app.setFillMode('lasso'); } else app.setTool(e.id as 'brush' | 'eraser' | 'pen' | 'fill');
    } };
  }
  if (e.kind === 'manual') return { label: 'Read', run: () => hooks.showManual(e.id) };
  return null;
}

function icon(e: AskEntry): string {
  if (e.kind === 'effect') return iconSvg(effectIcon(e.id));
  if (e.kind === 'tool') return iconSvg(TOOL_ICON[e.id] ?? 'draw');
  return iconSvg(e.kind === 'manual' ? 'board' : 'transform');
}

export async function openAsk(app: App, hooks: AskHooks): Promise<void> {
  const entries = await load();
  let kind: AskKind | 'all' = 'all';
  const input = el('input', { type: 'search', class: 'ask-input', placeholder: 'Type a word you remember', 'aria-label': 'Ask 2Dope', autocomplete: 'off', spellcheck: 'false' });
  const chips = el('div', { class: 'ask-chips', role: 'group', 'aria-label': 'Show only' });
  const results = el('div', { class: 'ask-results', role: 'list', 'aria-live': 'polite' });
  const modal = openModal({
    title: 'Ask',
    className: 'ask',
    ariaLabel: 'Ask 2Dope',
    bodyClass: 'ask-body',
    content: [el('p', { class: 'hint' }, 'Find a tool, effect or help page from a word you remember. Spelling doesn’t have to be perfect.'), input, chips, results],
    actions: [{ id: 'close', label: 'Close', primary: true }],
    cancelId: 'close',
    ownKeys: true,
    focus: input,
  });
  const go = (e: AskEntry, a: { run: () => void }) => { modal.close(); a.run(); };
  const draw = () => {
    for (const b of chips.querySelectorAll('button')) b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.kind === kind));
    results.replaceChildren();
    const q = input.value.trim();
    if (!q) { results.append(el('p', { class: 'hint ask-empty' }, 'Try a word like wiggle, glow, erase, layer or old tv.')); return; }
    const hits = searchAsk(entries, q, 60).filter((h) => kind === 'all' || h.entry.kind === kind).slice(0, 8);
    if (!hits.length) {
      results.append(el('p', { class: 'hint ask-empty' }, 'Nothing yet. Try the thing you want to change (line, colour, layer) or how it should look (glow, broken, old).'));
      return;
    }
    for (const h of hits) {
      const e = h.entry, a = action(app, hooks, e);
      const row = el('div', { class: 'ask-row', role: 'listitem' });
      const ic = el('span', { class: 'ask-ico', 'aria-hidden': 'true' });
      ic.innerHTML = icon(e);
      const text = el('div', { class: 'ask-tx' });
      const head = el('div', { class: 'ask-tt' }, e.name);
      head.append(el('span', { class: 'ask-kind' }, KIND_LABEL[e.kind]));
      // a long description is cut at a word, so every result stays about two lines
      const desc = e.text.length > 120 ? `${e.text.slice(0, 118).replace(/\s+\S*$/, '')}…` : e.text;
      text.append(head, el('div', { class: 'ask-ds' }, e.kind === 'command' && e.where ? `${desc} · Find it in: ${e.where}` : desc));
      row.append(ic, text);
      if (a) {
        const b = el('button', { type: 'button', class: 'ask-go', 'aria-label': `${a.label}: ${e.name}` }, a.label);
        b.addEventListener('click', () => go(e, a));
        row.append(b);
      }
      results.append(row);
    }
  };
  for (const f of FILTERS) {
    const b = el('button', { type: 'button', class: 'ask-chip', 'data-kind': f.id, 'aria-pressed': String(f.id === kind) }, f.label);
    b.addEventListener('click', () => { kind = f.id; draw(); input.focus(); });
    chips.append(b);
  }
  input.addEventListener('input', draw);
  // Enter does what the best result's button does
  input.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter') return;
    ev.preventDefault();
    results.querySelector<HTMLButtonElement>('.ask-go')?.click();
  });
  draw();
}
