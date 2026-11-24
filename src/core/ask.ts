/**
 * Ask: find a tool, effect, command or manual section from the words a student remembers, with
 * spelling slips, plural forms and everyday words ("wiggle", "broken screen") allowed. Pure and
 * local: nothing is sent anywhere. The catalogue (what can be found) is built by the UI from the
 * app's own registries; the word lists live in core/askdata.ts.
 */
import { SYNONYM_GROUPS } from './askdata';

export type AskKind = 'effect' | 'command' | 'manual' | 'tool' | 'gesture';

/** One thing that can be found. `words` are extra student words for it (weighted below the name). */
export interface AskEntry {
  id: string;
  kind: AskKind;
  name: string;
  /** Its description (or, for a manual section, its text): the weakest evidence. */
  text: string;
  words?: string;
  /** Where it lives, for a command (the row or menu that shows it). */
  where?: string;
}

export interface AskHit {
  entry: AskEntry;
  score: number;
}

const STOP = new Set(('a an and are as at be but by can do does for from get got has have how i if in into is it its just like make me my of on or so some that the then there these they this to up use want was what when where which who why will with would you your please can\'t cant dont isnt thing thingy').split(' '));

/** A word reduced to its root: plurals and -ing / -ed endings off, British and American spellings alike. */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  w = w.replace(/colour/g, 'color').replace(/grey/g, 'gray');
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 4 && w.endsWith('ing')) { w = w.slice(0, -3); if (/(.)\1$/.test(w)) w = w.slice(0, -1); return w; }
  if (w.length > 3 && w.endsWith('ed')) { w = w.slice(0, -2); if (/(.)\1$/.test(w)) w = w.slice(0, -1); return w; }
  if (w.length > 3 && w.endsWith('es') && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

/** The stems of the meaningful words of some text (stop words and one-letter words dropped). */
export function tokens(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-z0-9']+/)) {
    if (!raw || STOP.has(raw)) continue;
    const s = stem(raw);
    if (s.length > 1 && !STOP.has(s)) out.push(s);
  }
  return out;
}

/** Edit distance (insert, delete, change, swap neighbours) between two words, or max+1 when over `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = [], prev: number[] = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const row: number[] = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2]! + 1);
      row[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev2.splice(0, prev2.length, ...prev);
    prev.splice(0, prev.length, ...row);
  }
  return prev[b.length]!;
}

/**
 * How well a typed word matches a word of an entry, 0..1: the same word 1, the start of a longer
 * word (typing as you go) 0.85, one slip (two in a long word) 0.7. Short words must match exactly.
 */
export function wordMatch(q: string, w: string, typos = true): number {
  if (q === w) return 1;
  if (q.length >= 3 && w.length > q.length && w.startsWith(q)) return 0.85;
  if (typos && q.length >= 4 && w.length >= 4) {
    const max = q.length >= 8 ? 2 : 1;
    if (editDistance(q, w, max) <= max) return 0.7;
  }
  return 0;
}

const GROUPS: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const g of SYNONYM_GROUPS) {
    const stems = [...new Set(g.flatMap((w) => tokens(w)))];
    for (const s of stems) m.set(s, [...(m.get(s) ?? []), ...stems.filter((x) => x !== s)]);
  }
  return m;
})();

/** A query word and the everyday words that mean about the same, the others counting for less. */
export function expand(token: string): { word: string; weight: number }[] {
  const out = [{ word: token, weight: 1 }];
  for (const s of GROUPS.get(token) ?? []) out.push({ word: s, weight: 0.6 });
  return out;
}

interface Indexed {
  entry: AskEntry;
  name: string[];
  words: string[];
  text: Set<string>;
}

const cache = new WeakMap<AskEntry, Indexed>();
function indexed(e: AskEntry): Indexed {
  let x = cache.get(e);
  if (!x) {
    x = { entry: e, name: tokens(e.name), words: tokens(e.words ?? ''), text: new Set(tokens(e.text)) };
    cache.set(e, x);
  }
  return x;
}

/** A small lean towards what students most often want: effects and tools, then pages, then commands. */
const BIAS: Record<AskKind, number> = { effect: 1.1, tool: 1.1, gesture: 1, manual: 0.95, command: 0.9 };

/** How much each part of an entry counts for. */
const W = { name: 5, words: 3.5, text: 1 };

function best(q: { word: string; weight: number }[], list: readonly string[], typos: boolean): number {
  let top = 0;
  // an everyday-word stand-in (weight under 1) must match exactly or by its start: slips on top of a guess match too much
  for (const { word, weight } of q) for (const w of list) { const m = wordMatch(word, w, typos && weight === 1) * weight; if (m > top) top = m; }
  return top;
}

/** Entries for what the student typed, best first. Every kind is mixed; the caller may filter by kind. */
export function searchAsk(entries: readonly AskEntry[], query: string, limit = 8): AskHit[] {
  const q = tokens(query);
  if (!q.length) return [];
  const expanded = q.map(expand);
  const hits: AskHit[] = [];
  for (const entry of entries) {
    const x = indexed(entry);
    let score = 0, matched = 0;
    for (const e of expanded) {
      const n = best(e, x.name, true) * W.name;
      const w = best(e, x.words, true) * W.words;
      // the long text only takes the typed word itself (or its start): other words and slips there would match everything
      let t = 0;
      for (const { word, weight } of e.slice(0, 1)) {
        if (x.text.has(word)) t = Math.max(t, weight);
        else if (word.length >= 3) { for (const w of x.text) if (w.startsWith(word)) { t = Math.max(t, 0.6 * weight); break; } }
      }
      const s = Math.max(n, w) + t * W.text;
      if (s > 0) { score += s; matched++; }
    }
    if (!matched) continue;
    // matching more of what was typed counts for more
    // a short name that was typed in full ("undo") beats a long one that only mentions the word
    const whole = x.name.length > 0 && x.name.every((n) => q.includes(n)) ? 1.3 : 1;
    hits.push({ entry, score: score * Math.sqrt(matched / q.length) * BIAS[entry.kind] * whole / (1 + 0.04 * Math.max(0, x.name.length - 1)) });
  }
  return hits.sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name)).slice(0, limit);
}
