import type { Exposure } from './timeline';

/**
 * A panel's dialogue as subtitle lines. It is stored in the panel's existing `dialogue` caption,
 * one line per subtitle, "SPEAKER: words" when someone is named, so old projects (free text) and
 * older builds (which show the text as written) keep working without a schema change.
 */
export interface DialogueLine {
  who: string;
  text: string;
}

/** A subtitle on the shot's clock: comp frames [start, end), with its panel (0-based). */
export interface Cue extends DialogueLine {
  start: number;
  end: number;
  panel: number;
}

export const SPEAKER_MAX = 30;
/** "NAME: words": a short name that starts with a letter, then a colon and a space. */
const SPEAKER = /^([\p{L}][\p{L}\p{N} .'’()-]{0,29}?)\s*:\s+(.+)$/u;

/** Split stored dialogue into lines. A line without a recognisable speaker keeps all its text. */
export function parseDialogue(s: string | undefined): DialogueLine[] {
  if (!s) return [];
  const out: DialogueLine[] = [];
  for (const raw of s.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim();
    if (!line) continue;
    const m = SPEAKER.exec(line);
    if (m && !/[.!?]$/.test(m[1]!.trim())) out.push({ who: m[1]!.trim(), text: m[2]!.trim() });
    else out.push({ who: '', text: line });
  }
  return out;
}

/** One line of text for a speaker name (no colons or line breaks). */
export function cleanSpeaker(s: string): string {
  return s.replace(/[:\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, SPEAKER_MAX);
}

/** Store lines back as the panel's dialogue text (empty lines are dropped). */
export function formatDialogue(lines: readonly DialogueLine[]): string {
  return lines
    .map((l) => ({ who: cleanSpeaker(l.who), text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text)
    .map((l) => (l.who ? `${l.who}: ${l.text}` : l.text))
    .join('\n');
}

/** The way a line reads as a subtitle: "SPEAKER: words". */
export function cueText(l: DialogueLine): string {
  return l.who ? `${l.who}: ${l.text}` : l.text;
}

/**
 * Share a panel's frames between its lines, longer lines getting longer (every line at least one
 * frame while there are frames). Returns [start, end) offsets inside the panel; lines that get no
 * frame (more lines than frames) are left out.
 */
export function splitPanel(lines: readonly DialogueLine[], length: number): { line: DialogueLine; start: number; end: number }[] {
  const n = Math.min(lines.length, Math.max(0, Math.floor(length)));
  if (!n) return [];
  const used = lines.slice(0, n);
  const weight = used.map((l) => Math.max(8, l.text.length + l.who.length));
  const total = weight.reduce((a, b) => a + b, 0);
  const out: { line: DialogueLine; start: number; end: number }[] = [];
  let at = 0;
  let acc = 0;
  used.forEach((line, i) => {
    acc += weight[i]!;
    // the end follows the running weight, leaving at least one frame for each line still to come
    let end = i === n - 1 ? length : Math.round((acc / total) * length);
    end = Math.max(at + 1, Math.min(end, length - (n - 1 - i)));
    out.push({ line, start: at, end });
    at = end;
  });
  return out;
}

/** Every subtitle of a board on the comp clock (the board layer starts at `start`). */
export function boardCues(exposures: readonly Exposure[], start = 0): Cue[] {
  const out: Cue[] = [];
  let at = start;
  exposures.forEach((e, i) => {
    for (const s of splitPanel(parseDialogue(e.dialogue), e.length)) out.push({ ...s.line, start: at + s.start, end: at + s.end, panel: i });
    at += e.length;
  });
  return out;
}

/** The subtitle showing at comp frame `frame`, or null. */
export function cueAt(cues: readonly Cue[], frame: number): Cue | null {
  for (const c of cues) if (frame >= c.start && frame < c.end) return c;
  return null;
}

/** Every speaker named on the board, in first-use order (for the name picker). */
export function boardSpeakers(exposures: readonly Exposure[]): string[] {
  const seen = new Map<string, string>();
  for (const e of exposures) for (const l of parseDialogue(e.dialogue)) if (l.who && !seen.has(l.who.toLowerCase())) seen.set(l.who.toLowerCase(), l.who);
  return [...seen.values()];
}

function stamp(frame: number, fps: number, sep: ',' | '.'): string {
  const ms = Math.max(0, Math.round((frame / fps) * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(ms % 1000, 3)}`;
}

/** Cues as SubRip (.srt), which video players, YouTube and editors read. Times start at frame `offset`. */
export function toSrt(cues: readonly Cue[], fps: number, offset = 0): string {
  return cues
    .map((c, i) => `${i + 1}\r\n${stamp(c.start - offset, fps, ',')} --> ${stamp(c.end - offset, fps, ',')}\r\n${cueText(c)}\r\n`)
    .join('\r\n');
}

/** Cues as WebVTT (.vtt) for web video players; speakers become voice tags. */
export function toVtt(cues: readonly Cue[], fps: number, offset = 0): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = cues.map((c) => `${stamp(c.start - offset, fps, '.')} --> ${stamp(c.end - offset, fps, '.')}\n${c.who ? `<v ${esc(c.who)}>` : ''}${esc(c.text)}\n`);
  return ['WEBVTT\n', ...body].join('\n');
}
