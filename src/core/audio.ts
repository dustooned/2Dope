import type { Comp } from './comp';
import { startOf } from './timeline';

/** An immutable WAV asset. Bytes are loaded on demand from the shared asset store. */
export interface SoundAsset {
  name: string;
  path: string;
  duration: number;
  bytes: Uint8Array | null;
}

export interface SoundClip {
  id: string;
  asset: string;
  name: string;
  /** Comp frames, independent of source trim (which is in seconds). */
  start: number;
  trimIn: number;
  trimOut: number;
  gain: number;
  muted: boolean;
  /** A board drawing is a panel identity; repeated references are disambiguated by occurrence. */
  link: { layer: string; drawing: string; occurrence: number; offset: number } | null;
}

/** The clips without one sound; an unknown id changes nothing. The sound's stored audio stays in the project for Undo. */
export function withoutClip(clips: readonly SoundClip[], id: string): SoundClip[] {
  return clips.filter((c) => c.id !== id);
}

/** Linked clips follow their panel after retiming/reordering. A removed panel silences its clip. */
export function soundStart(clip: SoundClip, comp: Comp): number | null {
  const link = clip.link;
  if (!link) return clip.start;
  const layer = comp.layers.find(l => l.id === link.layer);
  if (!layer || layer.kind !== 'drawings') return null;
  let occurrence = 0;
  const index = layer.exposures.findIndex(e => e.drawing === link.drawing && occurrence++ === link.occurrence);
  return index < 0 ? null : layer.start + startOf(layer.exposures, index) + link.offset;
}

export function soundWindow(clip: SoundClip, comp: Comp, from: number, until: number) {
  const frame = soundStart(clip, comp);
  if (frame === null || clip.muted || clip.gain <= 0) return null;
  const start = frame / comp.fps;
  const end = start + clip.trimOut - clip.trimIn;
  const at = Math.max(0, start, from);
  const stop = Math.min(end, until);
  return stop > at ? { at, offset: clip.trimIn + at - start, duration: stop - at, gain: clip.gain } : null;
}

/** Small, bounded waveform overview; independent of project persistence. */
export function waveform(channels: readonly Float32Array[], bins = 256): number[] {
  const length = channels[0]?.length ?? 0;
  return Array.from({ length: bins }, (_, b) => {
    let peak = 0;
    for (const data of channels) for (let i = Math.floor(b * length / bins); i < Math.floor((b + 1) * length / bins); i++) peak = Math.max(peak, Math.abs(data[i] ?? 0));
    return peak;
  });
}
