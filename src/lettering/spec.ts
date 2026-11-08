/**
 * The caption model (LetterSpec): a balloon and its lettering, stored on a drawings layer and
 * rendered live (never baked). Pure data and validation, no DOM and no app imports, so the same
 * code can move into a comics app. Positions and sizes are page units (document pixels).
 */

export type BalloonStyle = 'speech' | 'thought' | 'shout' | 'whisper' | 'box' | 'sfx' | 'custom';
export const BALLOON_STYLES: readonly BalloonStyle[] = ['speech', 'thought', 'shout', 'whisper', 'box', 'sfx', 'custom'];
export type TailJoin = 'merged' | 'seam' | 'bubbles' | 'lightning' | 'none';
export const TAIL_JOINS: readonly TailJoin[] = ['merged', 'seam', 'bubbles', 'lightning', 'none'];
export type LetterSize = 'small' | 'body' | 'big';
export const LETTER_SIZES: readonly LetterSize[] = ['small', 'body', 'big'];
/** Lettering sizes as a fraction of the page height: the same for every caption, so lettering stays consistent. */
export const LETTER_SIZE_FRACTION: Record<LetterSize, number> = { small: 0.026, body: 0.034, big: 0.06 };
export type LetterAlign = 'center' | 'left' | 'right';

export interface CaptionTail {
  /** The tip, page units. */
  x: number;
  y: number;
  /** Where the tail bends (page units); absent = straight. */
  bend?: [number, number];
  join: TailJoin;
  /** Base width as a multiple of the lettering size. */
  width: number;
}

/** Keyable caption settings: Motion shows them as Caption rows. */
export type CaptionKey = 'reveal' | 'balloon' | 'textOpacity' | 'balloonOpacity' | 'inkEnd' | 'tracking' | 'leading';
export const CAPTION_KEYS: { key: CaptionKey; label: string; min: number; max: number; def: number; unit: string }[] = [
  { key: 'reveal', label: 'Reveal', min: 0, max: 100, def: 100, unit: '%' },
  { key: 'balloon', label: 'Balloon', min: 0, max: 150, def: 100, unit: '%' },
  { key: 'textOpacity', label: 'Text opacity', min: 0, max: 100, def: 100, unit: '%' },
  { key: 'balloonOpacity', label: 'Balloon opacity', min: 0, max: 100, def: 100, unit: '%' },
  { key: 'inkEnd', label: 'Ink length', min: 0, max: 100, def: 100, unit: '%' },
  { key: 'tracking', label: 'Tracking', min: -100, max: 300, def: 0, unit: '' },
  { key: 'leading', label: 'Line spacing', min: 80, max: 200, def: 115, unit: '%' },
];

/** A keyframe track for a caption setting (same shape as the app's Prop<number>). */
export interface CaptionTrack { value: number; keys: { f: number; v: number; in: unknown; out: unknown }[] }

export interface CaptionSpec {
  v: 1;
  text: string;
  /** A bundled font id (see fonts.ts) or `custom:<asset id>`. */
  font: string;
  bold: boolean;
  italic: boolean;
  caps: boolean;
  size: LetterSize;
  align: LetterAlign;
  /** Balloon centre, page units. */
  x: number;
  y: number;
  style: BalloonStyle;
  /** Custom balloons: the outline around the centre, page units (closed). */
  path?: [number, number][];
  tails: CaptionTail[];
  fill: string;
  ink: string;
  /** Balloon ink width as a fraction of the lettering size. */
  inkWidth: number;
  textColor: string;
  /** Outline behind the letters (sound effects); null = none. Width as a fraction of the lettering size. */
  textOutline: string | null;
  textOutlineWidth: number;
  /** Still values of the keyable settings (absent = default). */
  values?: Partial<Record<CaptionKey, number>>;
  /** Keyframes of the keyable settings, in layer time. */
  keys?: Partial<Record<CaptionKey, CaptionTrack>>;
}

export const MAX_CAPTION_CHARS = 600;
export const MAX_TAILS = 4;

const COLOR = /^#[0-9a-f]{6}$/i;

export function defaultCaption(x: number, y: number, style: BalloonStyle = 'speech'): CaptionSpec {
  return {
    v: 1, text: '', font: style === 'sfx' ? 'bangers' : 'comic-neue', bold: style === 'shout', italic: false, caps: true,
    size: style === 'sfx' ? 'big' : 'body', align: 'center', x, y, style,
    tails: style === 'sfx' || style === 'box' ? [] : [{ x: x - 40, y: y + 110, join: style === 'thought' ? 'bubbles' : 'merged', width: 1.2 }],
    fill: '#ffffff', ink: '#111111', inkWidth: 0.09, textColor: style === 'sfx' ? '#f2c230' : '#111111',
    textOutline: style === 'sfx' ? '#111111' : null, textOutlineWidth: 0.18,
  };
}

/** The value of a keyable setting: its still value, or its default. */
export function captionValue(c: CaptionSpec, key: CaptionKey): number {
  const d = CAPTION_KEYS.find(k => k.key === key)!;
  const v = c.values?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(d.max, Math.max(d.min, v)) : d.def;
}

/** Validate a stored caption (throws on what cannot be repaired; clamps the rest). */
export function readCaption(input: unknown): CaptionSpec {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid caption.');
  const r = input as Record<string, unknown>;
  if (r.v !== 1) throw new Error('Unsupported caption format.');
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const col = (v: unknown, d: string) => (typeof v === 'string' && COLOR.test(v) ? v : d);
  const text = typeof r.text === 'string' ? r.text.replace(/\r\n?/g, '\n').slice(0, MAX_CAPTION_CHARS) : '';
  const style = BALLOON_STYLES.includes(r.style as BalloonStyle) ? (r.style as BalloonStyle) : 'speech';
  const font = typeof r.font === 'string' && /^[a-z0-9:-]{1,64}$/i.test(r.font) ? r.font : 'comic-neue';
  const tails: CaptionTail[] = Array.isArray(r.tails) ? r.tails.slice(0, MAX_TAILS).flatMap((t): CaptionTail[] => {
    const q = t as Record<string, unknown> | null;
    if (!q || typeof q.x !== 'number' || typeof q.y !== 'number' || !Number.isFinite(q.x) || !Number.isFinite(q.y)) return [];
    const bend = Array.isArray(q.bend) && q.bend.length === 2 && q.bend.every(n => typeof n === 'number' && Number.isFinite(n)) ? (q.bend as [number, number]) : undefined;
    return [{ x: q.x, y: q.y, ...(bend ? { bend } : {}), join: TAIL_JOINS.includes(q.join as TailJoin) ? (q.join as TailJoin) : 'merged', width: num(q.width, 0.3, 4, 1.2) }];
  }) : [];
  const path = Array.isArray(r.path) && r.path.length >= 3 && r.path.length <= 2000 && r.path.every(p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && Number.isFinite(n))) ? (r.path as [number, number][]) : undefined;
  const values: Partial<Record<CaptionKey, number>> = {};
  if (r.values && typeof r.values === 'object') for (const k of CAPTION_KEYS) { const v = (r.values as Record<string, unknown>)[k.key]; if (typeof v === 'number' && Number.isFinite(v)) values[k.key] = Math.min(k.max, Math.max(k.min, v)); }
  const keys: Partial<Record<CaptionKey, CaptionTrack>> = {};
  if (r.keys && typeof r.keys === 'object') for (const k of CAPTION_KEYS) {
    const t = (r.keys as Record<string, unknown>)[k.key] as Record<string, unknown> | undefined;
    if (!t || typeof t.value !== 'number' || !Array.isArray(t.keys)) continue;
    const ks = (t.keys as Record<string, unknown>[]).filter(x => x && Number.isInteger(x.f) && typeof x.v === 'number' && Number.isFinite(x.v) && x.in && x.out).slice(0, 2000);
    if (ks.length) keys[k.key] = { value: t.value, keys: ks.map(x => ({ f: x.f as number, v: Math.min(k.max, Math.max(k.min, x.v as number)), in: x.in, out: x.out })).sort((a, b) => a.f - b.f) };
  }
  return {
    v: 1, text, font, bold: r.bold === true, italic: r.italic === true, caps: r.caps !== false,
    size: LETTER_SIZES.includes(r.size as LetterSize) ? (r.size as LetterSize) : 'body',
    align: r.align === 'left' || r.align === 'right' ? r.align : 'center',
    x: num(r.x, -1e6, 1e6, 0), y: num(r.y, -1e6, 1e6, 0), style, ...(style === 'custom' && path ? { path } : {}), tails,
    fill: col(r.fill, '#ffffff'), ink: col(r.ink, '#111111'), inkWidth: num(r.inkWidth, 0, 0.6, 0.09),
    textColor: col(r.textColor, '#111111'), textOutline: r.textOutline === null || r.textOutline === undefined ? null : col(r.textOutline, '#111111'), textOutlineWidth: num(r.textOutlineWidth, 0, 0.6, 0.18),
    ...(Object.keys(values).length ? { values } : {}), ...(Object.keys(keys).length ? { keys } : {}),
  };
}
