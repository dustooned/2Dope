/**
 * What Ask can find: builders that turn the app's own registries (effects, tools, commands and the
 * manual) into searchable entries. Pure: the UI passes the commands and the manual in.
 */
import type { AskEntry } from './ask';
import { EFFECT_WORDS, TOOL_ENTRIES } from './askdata';
import { EFFECT_TYPES, plainName } from './effects';
import { GESTURE_ACTIONS, GESTURES, gestureSentence } from './gestures';
import { MOTION_PRESETS } from './motionpresets';

export function effectEntries(): AskEntry[] {
  return EFFECT_TYPES.map((d) => ({ id: d.id, kind: 'effect', name: plainName(d), text: d.hint, words: EFFECT_WORDS[d.id] ?? '' }));
}

export function toolEntries(): AskEntry[] {
  return TOOL_ENTRIES.map((t) => ({ id: t.id, kind: 'tool', name: t.name, text: t.text, words: t.words }));
}

/** The plain text of a manual block (paragraphs, lists, steps, key tables, tips). */
export function blockText(b: unknown): string {
  if (typeof b === 'string') return b;
  if (!b || typeof b !== 'object') return '';
  const o = b as Record<string, unknown>;
  if (typeof o.tip === 'string') return o.tip;
  const list = (o.list ?? o.steps) as unknown;
  if (Array.isArray(list)) return list.join(' ');
  if (Array.isArray(o.keys)) return (o.keys as unknown[][]).map((k) => `${k[0] ?? ''} ${k[1] ?? ''}`).join(' ');
  return '';
}

export function manualEntries(sections: readonly { id: string; title: string; blocks: readonly unknown[] }[]): AskEntry[] {
  return sections.map((s) => ({ id: s.id, kind: 'manual', name: s.title, text: s.blocks.map(blockText).join(' ') }));
}

export interface CommandLike {
  id: string;
  label: string;
  name?: string;
  title: string;
  contexts: readonly string[];
}

export function commandEntries(commands: readonly CommandLike[], contextNames: Readonly<Record<string, string | undefined>>): AskEntry[] {
  const seen = new Set<string>();
  const out: AskEntry[] = [];
  for (const c of commands) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const ctx = c.contexts[0] ?? '';
    out.push({ id: c.id, kind: 'command', name: c.name ?? c.label, text: c.title, where: contextNames[ctx] ?? ctx });
  }
  return out;
}

/** The touch gestures that work today: the action as the name, how to do it as the text. */
export function gestureEntries(): AskEntry[] {
  return GESTURES.filter((g) => g.status === 'live').map((g) => {
    const label = GESTURE_ACTIONS[g.actionId] ?? g.actionId;
    return { id: g.id, kind: 'gesture' as const, name: label.charAt(0).toUpperCase() + label.slice(1), text: gestureSentence(g), words: 'gesture touch finger tap swipe pinch hold' };
  });
}

/** The Motion presets (Pop in, Bounce...): found like a command, with where to look. */
export function presetEntries(): AskEntry[] {
  return MOTION_PRESETS.map((p) => ({ id: `preset.${p.id}`, kind: 'command' as const, name: `${p.label} (motion preset)`, text: p.hint, words: `motion animate preset ${p.words}`, where: 'Motion, Presets menu' }));
}

/** Effects and tools: the part of the catalogue that needs nothing from the UI. */
export function effectAndToolEntries(): AskEntry[] {
  return [...toolEntries(), ...effectEntries(), ...gestureEntries(), ...presetEntries()];
}
