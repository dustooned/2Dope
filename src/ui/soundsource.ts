/**
 * Where the Sound wave effect reads sound: the shot that holds the layer, its sound clips mixed to
 * mono (gain, mute, trims and linked panels respected, through `soundWindow`). The mix is cached
 * until the clips or the decoded sounds change. A sound that is not decoded yet is loaded in the
 * background and the canvas redraws when it arrives; until then the wave is flat.
 */
import type { App } from '../app';
import { soundWindow } from '../core/audio';
import { compLength, frameContent, type Comp } from '../core/comp';
import { drawComp } from '../view/composite';
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

/**
 * Outline's Picture paint: the first frame of a project Asset, drawn at its own size and kept
 * until the asset's drawings change.
 */
export function assetPicture(app: App): (id: string) => HTMLCanvasElement | null {
  const kept = new Map<string, { key: string; canvas: HTMLCanvasElement }>();
  return (id: string) => {
    const p = app.project, comp = p.comps.get(id);
    if (!comp?.asset) return null;
    const key = frameContent(p.comps, comp, 0).key;
    const hit = kept.get(id);
    if (hit && hit.key === key) return hit.canvas;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.min(1024, comp.width)); canvas.height = Math.max(1, Math.min(1024, comp.height));
    const g = canvas.getContext('2d')!;
    g.scale(canvas.width / comp.width, canvas.height / comp.height);
    drawComp(g, p, comp, 0, { export: true });
    if (kept.size > 8) kept.delete(kept.keys().next().value!);
    kept.set(id, { key, canvas });
    return canvas;
  };
}
