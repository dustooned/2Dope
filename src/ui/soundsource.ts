/**
 * Where the Sound wave effect reads sound: the shot that holds the layer, its sound clips mixed to
 * mono (gain, mute, trims and linked panels respected, through `soundWindow`). The mix is cached
 * until the clips or the decoded sounds change. A sound that is not decoded yet is loaded in the
 * background and the canvas redraws when it arrives; until then the wave is flat.
 */
import type { App } from '../app';
import { soundWindow } from '../core/audio';
import { compLength, type Comp } from '../core/comp';
import type { SoundBank } from '../io/sound';
import type { SoundAt, SoundSource } from '../view/fxextra';

const RATE = 22050;
/** The longest mix kept (seconds): Sound wave on a longer shot reads silence past this. */
const MAX_SECONDS = 10 * 60;

/** Decode every sound used by a comp that has a Sound wave effect (exports await this before rendering). */
export async function preloadShotSounds(app: App, bank: SoundBank): Promise<void> {
  const p = app.project, ids = new Set<string>();
  for (const c of p.comps.values()) {
    if (!c.layers.some(l => l.effects?.some(e => e.on && e.type === 'soundwave'))) continue;
    for (const clip of c.audio ?? []) ids.add(clip.asset);
  }
  await Promise.all([...ids].map(id => bank.load(p, id).catch(() => undefined)));
}

export function shotSoundSource(app: App, bank: SoundBank): SoundSource {
  let cache: { key: string; samples: Float32Array } | null = null;
  const loading = new Set<string>();
  const mix = (comp: Comp): Float32Array => {
    const p = app.project, clips = comp.audio ?? [];
    const loaded = clips.map(c => (bank.get(c.asset) ? c.asset : '')).join(',');
    const key = `${p.comp.id === comp.id ? '' : comp.id}|${comp.fps}|${JSON.stringify(clips)}|${loaded}`;
    if (cache?.key === key) return cache.samples;
    const seconds = Math.min(MAX_SECONDS, compLength(comp, p.comps) / Math.max(1, comp.fps));
    const out = new Float32Array(Math.max(1, Math.ceil(seconds * RATE)));
    for (const clip of clips) {
      const buf = bank.get(clip.asset);
      if (!buf) {
        if (!loading.has(clip.asset)) {
          loading.add(clip.asset);
          void bank.load(p, clip.asset).then(() => app.requestRender(), () => {}).finally(() => loading.delete(clip.asset));
        }
        continue;
      }
      const win = soundWindow(clip, comp, 0, seconds);
      if (!win) continue;
      const chans = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)), sr = buf.sampleRate;
      const from = Math.floor(win.at * RATE), n = Math.floor(win.duration * RATE);
      for (let i = 0; i < n && from + i < out.length; i++) {
        const t = (win.offset + i / RATE) * sr, k = Math.floor(t), f = t - k;
        let v = 0;
        for (const ch of chans) v += (ch[k] ?? 0) * (1 - f) + (ch[k + 1] ?? 0) * f;
        out[from + i] = out[from + i]! + (v / chans.length) * win.gain;
      }
    }
    cache = { key, samples: out };
    return out;
  };
  return (layerId, layerFrame, fps): SoundAt | null => {
    const p = app.project;
    // the comp that holds the layer (the open shot first)
    const comp = p.comp.layers.some(l => l.id === layerId) ? p.comp : [...p.comps.values()].find(c => c.layers.some(l => l.id === layerId));
    if (!comp || !(comp.audio ?? []).length) return null;
    const layer = comp.layers.find(l => l.id === layerId)!;
    // layer time back to shot time (normal speed; a retimed layer reads its own frame)
    const time = (layer.start + layerFrame) / Math.max(1, comp.fps || fps);
    return { samples: mix(comp), rate: RATE, time };
  };
}
