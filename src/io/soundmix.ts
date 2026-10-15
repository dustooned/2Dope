import { soundStart } from '../core/audio';
import { compLength } from '../core/comp';
import { valueAt } from '../core/anim';
import type { Project } from '../core/project';
import type { SoundBank } from './sound';

export interface SoundVoice { asset: string; gain: number; sourceTime(t: number): number | null }
const mod = (x: number, n: number) => ((x % n) + n) % n;

/** Compile the shared comp hierarchy into continuous audio time. Frozen images hold silence. */
export function soundVoices(project: Project, compId: string): SoundVoice[] {
  const voices: SoundVoice[] = [];
  const walk = (id: string, map: (t: number) => number | null, path: Set<string>) => {
    const c = project.comps.get(id); if (!c || path.has(id) || path.size > 8) return;
    const next = new Set(path).add(id);
    for (const clip of c.audio ?? []) {
      const start = soundStart(clip, c); if (start === null || clip.muted || clip.gain <= 0) continue;
      voices.push({ asset: clip.asset, gain: clip.gain, sourceTime(t) {
        const at = map(t); if (at === null) return null;
        const offset = clip.trimIn + at - start / c.fps;
        return offset >= clip.trimIn && offset < clip.trimOut ? offset : null;
      } });
    }
    for (const layer of c.layers) {
      if (layer.kind !== 'comp' || !layer.visible || layer.play === 'single') continue;
      const child = project.comps.get(layer.comp); if (!child) continue;
      const length = compLength(child, project.comps) / child.fps;
      walk(child.id, t => {
        const time = map(t); if (time === null || time * c.fps < layer.in || (layer.out !== null && time * c.fps >= layer.out)) return null;
        const local = time - layer.start / c.fps;
        if (local < 0) return null;
        if (layer.timeRemap?.keys.length) {
          const frame = local * c.fps;
          const a = valueAt(layer.timeRemap, frame), b = valueAt(layer.timeRemap, frame + 0.001);
          return Math.abs(b - a) < 1e-9 ? null : Math.max(0, Math.min(length, a / child.fps));
        }
        const at = local * layer.speed;
        if (layer.play === 'loop') return mod(at, length);
        if (layer.play === 'pingpong') {
          const last = Math.max(1 / child.fps, length - 1 / child.fps);
          const phase = mod(at, last * 2); return phase <= last ? phase : last * 2 - phase;
        }
        return at < length ? at : null;
      }, next);
    }
  };
  walk(compId, t => t, new Set()); return voices;
}

/** Bounded mixer shared by live playback and export. Linear sampling and hard peak limiting. */
export function mixSound(voices: SoundVoice[], bank: Pick<SoundBank, 'get'>, at: number, samples: number, rate: number, loopSeconds?: number): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
  const left = new Float32Array(samples), right = new Float32Array(samples);
  for (const voice of voices) {
    const buffer = bank.get(voice.asset); if (!buffer) throw new Error('Audio is still loading. Try playback again.');
    const a = buffer.getChannelData(0), b = buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1));
    for (let i = 0; i < samples; i++) {
      const t = at + i / rate;
      const time = voice.sourceTime(loopSeconds ? mod(t, loopSeconds) : t); if (time === null) continue;
      const pos = time * buffer.sampleRate, index = Math.floor(pos), frac = pos - index;
      const l = (a[index] ?? 0) * (1 - frac) + (a[index + 1] ?? 0) * frac;
      const r = (b[index] ?? 0) * (1 - frac) + (b[index + 1] ?? 0) * frac;
      left[i] = left[i]! + l * voice.gain; right[i] = right[i]! + r * voice.gain;
    }
  }
  for (let i = 0; i < samples; i++) { left[i] = Math.max(-1, Math.min(1, left[i]!)); right[i] = Math.max(-1, Math.min(1, right[i]!)); }
  return [left, right];
}
