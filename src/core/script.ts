import { cleanSpeaker, formatDialogue, type DialogueLine } from './dialogue';

/**
 * Script → panels: a pasted script (plain text or Fountain) as storyboard panels. Each scene heading
 * starts a scene; each action paragraph and each spoken block becomes one panel with its Action or
 * Dialogue filled in, and Shot / scene numbered "Sc 1 · Sh 2". Lengths are a first guess from the
 * words (people can retime in Story). Transitions, notes, sections, synopses and the title page are
 * left out.
 */
export interface ScriptPanel {
  shot: string;
  action?: string;
  dialogue?: string;
  /** Frames. */
  length: number;
}

export interface ScriptResult {
  panels: ScriptPanel[];
  scenes: number;
  /** Panels dropped past the limit. */
  dropped: number;
}

export const SCRIPT_MAX_PANELS = 300;
const SHOT_MAX = 60;
const TEXT_MAX = 1000;

const HEADING = /^(?:\.(?!\.)\s*(.+)|((?:INT|EXT|EST|INT\.?\/EXT|I\/E)[.\s].*))$/i;
const TRANSITION = /^(?:>(?!.*<\s*$).*|[A-Z0-9 .'-]+ TO:|FADE (?:IN|OUT)[.:]?|CUT TO BLACK\.?|THE END\.?)$/;
const TITLE_KEY = /^(title|credit|author|authors|source|draft date|date|contact|copyright|notes|revision)\s*:/i;
/** "SAM", "MRS. LEE (V.O.)", "@McCLANE": a character cue (Fountain). */
const CUE = /^(?:@(.+)|([^a-z]*[A-Z][^a-z]*))$/;
/** "Sam: words" in plain text. */
const PLAIN_LINE = /^([A-Z][\w .'’-]{0,29}):\s+(.+)$/;

/** "MRS. LEE (V.O.)^" → "Mrs. Lee" (subtitles read better without shouting). */
export function speakerName(cue: string): string {
  const bare = cue.replace(/\^\s*$/, '').replace(/\(.*?\)/g, '').trim();
  const name = bare === bare.toUpperCase() ? bare.toLowerCase().replace(/(^|[\s.'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()) : bare;
  return cleanSpeaker(name);
}

/** Seconds a panel needs: speech at ~2.5 words a second, action at ~3, between 2 and 8 seconds. */
export function guessSeconds(text: string, spoken: boolean): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  const s = spoken ? words / 2.5 + 0.5 : words / 3;
  return Math.max(2, Math.min(8, Math.round(s * 2) / 2));
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function parseScript(text: string, fps: number): ScriptResult {
  // drop boneyard /* */ and notes [[ ]], then work in blank-line separated blocks
  const clean = text.replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\[\[[\s\S]*?\]\]/g, '');
  const blocks = clean.split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
  const panels: ScriptPanel[] = [];
  let scene = 0, shot = 0, heading = '', dropped = 0;
  const frames = (s: number) => Math.max(1, Math.round(s * (fps > 0 ? fps : 24)));
  const push = (p: Omit<ScriptPanel, 'shot' | 'length'>, seconds: number) => {
    if (panels.length >= SCRIPT_MAX_PANELS) { dropped++; return; }
    if (!scene) scene = 1;
    shot++;
    const label = `Sc ${scene} · Sh ${shot}`;
    panels.push({ shot: clip(shot === 1 && heading ? `${label} · ${heading}` : label, SHOT_MAX), ...p, length: frames(seconds) });
  };
  // a title page (Key: value lines) only counts at the very start
  if (blocks[0] && TITLE_KEY.test(blocks[0][0]!)) blocks.shift();
  for (const lines of blocks) {
    const first = lines[0]!;
    if (/^={3,}$/.test(first) || /^#/.test(first) || /^=(?!=)/.test(first)) continue; // page break, section, synopsis
    const h = lines.length === 1 ? HEADING.exec(first) : null;
    if (h) {
      scene++;
      shot = 0;
      heading = (h[1] ?? h[2] ?? '').replace(/\s+#.*#$/, '').trim().toUpperCase();
      continue;
    }
    if (lines.length === 1 && TRANSITION.test(first)) continue;
    // Fountain dialogue: a cue line, then (parentheticals and) speech
    const cue = lines.length > 1 && !/^!/.test(first) ? CUE.exec(first) : null;
    if (cue && /\p{L}/u.test(first)) {
      const who = speakerName(cue[1] ?? cue[2] ?? '');
      const said = lines.slice(1).filter((l) => !/^\(.*\)$/.test(l)).join(' ').replace(/^~/, '').trim();
      if (said) {
        const dialogue = formatDialogue([{ who, text: clip(said, TEXT_MAX - who.length - 2) }]);
        push({ dialogue }, guessSeconds(said, true));
        continue;
      }
    }
    // plain text: "Sam: words" lines are one spoken panel
    const plain = lines.map((l) => PLAIN_LINE.exec(l));
    if (plain.every(Boolean)) {
      const said: DialogueLine[] = plain.map((m) => ({ who: cleanSpeaker(m![1]!), text: m![2]! }));
      push({ dialogue: clip(formatDialogue(said), TEXT_MAX) }, guessSeconds(said.map((l) => l.text).join(' '), true));
      continue;
    }
    const action = lines.map((l) => l.replace(/^!/, '')).join(' ').replace(/\s+/g, ' ').trim();
    if (action) push({ action: clip(action, TEXT_MAX) }, guessSeconds(action, false));
  }
  return { panels, scenes: panels.length ? Math.max(1, scene) : 0, dropped };
}
