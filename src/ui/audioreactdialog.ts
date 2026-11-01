/**
 * "React to audio…" (Motion's key actions): pick a clip in the shot, a frequency band and a
 * reactor, then Bake writes one key per frame onto the selected property rows (one undo step).
 * The analysis is offline (decode + FFT), cached per clip and settings; long clips are capped.
 */

import type { App } from '../app';
import { soundStart, type SoundClip } from '../core/audio';
import { bake, bandEnvelope, MAX_REACT_FRAMES, monoMix, REACTORS, type BakeOptions, type OscShape, type Reactor } from '../core/audioreact';
import type { SoundBank } from '../io/sound';

const KEY = '2dope.audioreact';

export interface ReactSettings {
  startHz: number; endHz: number; reactor: Reactor; intensity: number; decay: number; smoothing: number;
  offset: number; master: number; seed: number; elasticity: number; speed: number; shape: OscShape;
  axis: 'both' | 'x' | 'y'; range: 'keys' | 'work' | 'shot';
}

export const REACT_DEFAULTS: ReactSettings = { startHz: 10, endHz: 250, reactor: 'pulse', intensity: 20, decay: 40, smoothing: 20, offset: 0, master: 100, seed: 1, elasticity: 50, speed: 2, shape: 'sine', axis: 'both', range: 'keys' };

/** Saved settings, validated (anything odd falls back to the default). */
export function readReactSettings(v: unknown): ReactSettings {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>, d = REACT_DEFAULTS;
  const num = (k: keyof ReactSettings, lo: number, hi: number) => (typeof r[k] === 'number' && Number.isFinite(r[k]) ? Math.min(hi, Math.max(lo, r[k] as number)) : (d[k] as number));
  const pick = <T extends string>(k: keyof ReactSettings, ok: readonly T[]) => (ok.includes(r[k] as T) ? (r[k] as T) : (d[k] as T));
  return {
    startHz: num('startHz', 1, 20000), endHz: num('endHz', 1, 20000), reactor: pick('reactor', ['pulse', 'elastic', 'oscillate', 'flicker'] as const),
    intensity: num('intensity', -5000, 5000), decay: num('decay', 0, 100), smoothing: num('smoothing', 0, 100), offset: num('offset', -500, 500),
    master: num('master', -1000, 1000), seed: Math.round(num('seed', 0, 2 ** 31)), elasticity: num('elasticity', 1, 100), speed: num('speed', 0.1, 35),
    shape: pick('shape', ['sine', 'triangle', 'square', 'saw'] as const), axis: pick('axis', ['both', 'x', 'y'] as const), range: pick('range', ['keys', 'work', 'shot'] as const),
  };
}
const load = () => { try { return readReactSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return REACT_DEFAULTS; } };
const save = (s: ReactSettings) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* optional */ } };

/** Envelopes already worked out (clip placement + band + settings + range). */
const cache = new Map<string, Float32Array>();

/**
 * The envelope of `clip` for comp frames `from`..`to` (one value per frame; silence outside the
 * clip). `capped` says the range was cut at `MAX_REACT_FRAMES`.
 */
export async function clipEnvelope(app: App, bank: SoundBank, clip: SoundClip, from: number, to: number, s: ReactSettings): Promise<{ env: Float32Array; capped: boolean }> {
  const p = app.project, comp = p.comp, fps = comp.fps, start = soundStart(clip, comp);
  const frames = Math.min(MAX_REACT_FRAMES, to - from + 1), capped = to - from + 1 > MAX_REACT_FRAMES;
  const key = `${clip.asset}|${clip.trimIn}|${clip.trimOut}|${start}|${fps}|${from}|${frames}|${s.startHz}|${s.endHz}|${s.decay}|${s.smoothing}`;
  const hit = cache.get(key);
  if (hit) return { env: hit, capped };
  const buffer = await bank.load(p, clip.asset);
  const mono = monoMix(Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c)));
  const rate = buffer.sampleRate, out = new Float32Array(Math.ceil(((frames + 1) / fps) * rate));
  // the slice of the clip under these frames, in its own time (trimmed; silence before and after)
  if (start !== null && !clip.muted) {
    const t0 = clip.trimIn + (from - start) / fps;
    for (let i = 0; i < out.length; i++) {
      const t = t0 + i / rate;
      if (t < clip.trimIn || t >= clip.trimOut) continue;
      const k = Math.round(t * rate);
      if (k >= 0 && k < mono.length) out[i] = mono[k]! * clip.gain;
    }
  }
  const env = bandEnvelope(out, rate, fps, s.startHz, s.endHz, { decay: s.decay, smoothing: s.smoothing, frames });
  if (cache.size > 24) cache.delete(cache.keys().next().value!);
  cache.set(key, env);
  return { env, capped };
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Open the dialog for the selected property rows; Bake writes the keys (one undo step). */
export function reactToAudio(app: App, bank: SoundBank | null): void {
  const ed = app.editor, rows = ed.selectedRows(), clips = ed.comp.audio ?? [];
  if (!rows.length) { app.onNotice?.('Select a key on the property that should react (position, scale, rotation, opacity…), then choose React to audio.'); return; }
  if (!clips.length || !bank) { app.onNotice?.('This shot has no audio clip yet. Add music or a sound first (Media).'); return; }
  const point = rows.some((r) => { const l = ed.layer(r.layer); return !!l && typeof ed.getProp(l, r.prop).value !== 'number'; });
  let s = load();
  const dialog = el('dialog', { class: 'small audioreact', 'aria-label': 'React to audio' });
  dialog.append(el('h2', {}, 'React to audio'));
  const body = el('div', { class: 'dbody' }), foot = el('div', { class: 'vfoot' });
  const row = (label: string, input: HTMLElement, hint = '') => { const r = el('label', { class: 'nfield' }); r.append(el('span', { class: 'name' }, label), input, el('span', { class: 'hint' }, hint)); body.append(r); return input; };
  const select = (label: string, value: string, options: [string, string][], hint = '') => {
    const x = el('select', { 'aria-label': label });
    for (const [v, t] of options) x.append(el('option', { value: v }, t));
    x.value = value;
    return row(label, x, hint) as HTMLSelectElement;
  };
  const number = (label: string, value: number, step: number, hint = '') => {
    const x = el('input', { type: 'number', step: String(step), value: String(value), 'aria-label': label, class: 'textbox' });
    x.addEventListener('keydown', (e) => e.stopPropagation());
    return row(label, x, hint) as HTMLInputElement;
  };
  const source = select('Source', clips[0]!.id, clips.map((c) => [c.id, c.name]));
  const reactor = select('Reactor', s.reactor, REACTORS.map((r) => [r.id, `${r.label} · ${r.hint}`]));
  const startHz = number('Band start', s.startHz, 10, 'Hz (10 to 250 is the bass and the beat)');
  const endHz = number('Band end', s.endHz, 10, 'Hz');
  const intensity = number('Intensity', s.intensity, 1, 'the biggest change, in the property’s units');
  const decay = number('Decay', s.decay, 5, '0–100: how long a hit lingers');
  const smoothing = number('Smoothing', s.smoothing, 5, '0–100');
  const offset = number('Time offset', s.offset, 1, 'frames (+ later, − earlier)');
  const master = number('Master', s.master, 5, '% (negative flips it)');
  const elasticity = number('Elasticity', s.elasticity, 5, 'Elastic: 1–100');
  const speed = number('Speed', s.speed, 0.5, 'Oscillate: swings a second');
  const shape = select('Wave', s.shape, [['sine', 'Smooth'], ['triangle', 'Triangle'], ['square', 'Square'], ['saw', 'Saw']], 'Oscillate');
  const seed = number('Seed', s.seed, 1, 'Flicker: another number, another pattern');
  const axis = point ? select('Direction', s.axis, [['both', 'Both ways'], ['x', 'Across (X)'], ['y', 'Up and down (Y)']]) : null;
  const range = select('Range', s.range, [['keys', 'Between the selected keys'], ['work', 'The work area (play range)'], ['shot', 'The whole shot']]);
  const show = () => {
    const r = reactor.value as Reactor;
    for (const [x, on] of [[elasticity, r === 'elastic'], [speed, r === 'oscillate'], [shape, r === 'oscillate'], [seed, r === 'flicker']] as const) (x.parentElement as HTMLElement).hidden = !on;
  };
  reactor.addEventListener('change', show);
  show();
  const status = el('p', { class: 'hint', role: 'status' });
  body.append(status);
  const cancel = el('button', { type: 'button' }, 'Cancel'), go = el('button', { type: 'button', class: 'primary' }, 'Bake');
  foot.append(cancel, go);
  dialog.append(body, foot);
  const close = () => { if (dialog.open) dialog.close(); dialog.remove(); };
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  cancel.addEventListener('click', close);
  go.addEventListener('click', () => void (async () => {
    s = readReactSettings({ startHz: +startHz.value, endHz: +endHz.value, reactor: reactor.value, intensity: +intensity.value, decay: +decay.value, smoothing: +smoothing.value, offset: +offset.value, master: +master.value, seed: +seed.value, elasticity: +elasticity.value, speed: +speed.value, shape: shape.value, axis: axis?.value ?? s.axis, range: range.value });
    save(s);
    const clip = clips.find((c) => c.id === source.value)!, comp = ed.comp;
    // the frames to bake, in comp time
    let from: number, to: number;
    if (s.range === 'work') { const pr = app.playbackRange; from = pr.start; to = pr.end - 1; }
    else if (s.range === 'shot') { from = 0; to = app.compEnd - 1; }
    else {
      const starts = rows.map((r) => (ed.layer(r.layer)?.start ?? 0));
      from = Math.min(...rows.map((r, i) => r.from + starts[i]!)); to = Math.max(...rows.map((r, i) => r.to + starts[i]!));
      if (to <= from) { from = 0; to = app.compEnd - 1; }
    }
    go.disabled = true;
    status.textContent = 'Listening to the clip…';
    try {
      const { env, capped } = await clipEnvelope(app, bank, clip, from, to, s);
      const o: BakeOptions = { reactor: s.reactor, intensity: s.intensity, master: s.master, offset: s.offset, fps: comp.fps, seed: s.seed, elasticity: s.elasticity, speed: s.speed, shape: s.shape };
      const values = bake(env, from, Math.min(to, from + env.length - 1), o);
      ed.bakeReaction(rows.map((r) => ({ layer: r.layer, prop: r.prop })), values, s.axis);
      app.requestRender();
      close();
      app.onNotice?.(`Baked ${values.length} keys from “${clip.name}”${capped ? ` (only the first ${MAX_REACT_FRAMES} frames: a shorter range bakes the rest)` : ''}. Undo takes them all back.`);
    } catch (e) {
      status.textContent = e instanceof Error ? e.message : String(e);
      go.disabled = false;
    }
  })());
  document.body.append(dialog);
  dialog.showModal();
}
