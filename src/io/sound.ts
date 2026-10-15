import type { SoundAsset } from '../core/audio';
import { waveform } from '../core/audio';
import type { Project } from '../core/project';
import { hashBytes } from './hash';

export const SOUND_RATE = 44100;
export const SOUND_MAX_SECONDS = 120;
export const soundBudget = (lite: boolean) => (lite ? 32 : 64) * 1024 * 1024;

/** Normalized PCM WAV keeps project audio portable without depending on the original codec. */
export function wavBytes(buffer: AudioBuffer): Uint8Array {
  const channels = buffer.numberOfChannels;
  const bytes = new Uint8Array(44 + buffer.length * channels * 2);
  const v = new DataView(bytes.buffer);
  const text = (at: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i); };
  text(0, 'RIFF'); v.setUint32(4, bytes.length - 8, true); text(8, 'WAVEfmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true);
  v.setUint32(24, buffer.sampleRate, true); v.setUint32(28, buffer.sampleRate * channels * 2, true);
  v.setUint16(32, channels * 2, true); v.setUint16(34, 16, true); text(36, 'data'); v.setUint32(40, bytes.length - 44, true);
  const data = Array.from({ length: channels }, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) for (let c = 0; c < channels; c++) {
    const sample = Math.max(-1, Math.min(1, data[c]![i]!));
    v.setInt16(44 + (i * channels + c) * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

/** Small cache owned by one project; decoded memory is bounded independently of drawing residency. */
export class SoundBank {
  private project: Project | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer>>();
  private context: OfflineAudioContext | null = null;
  source: (path: string) => Promise<Uint8Array | null> = async () => null;
  constructor(private readonly lite: () => boolean) {}
  use(project: Project): void {
    if (this.project === project) return;
    this.project = project;
    this.buffers.clear(); this.pending.clear(); this.context = null;
  }
  private get decoder() { return this.context ??= new OfflineAudioContext(2, 1, SOUND_RATE); }
  get(id: string): AudioBuffer | undefined { return this.buffers.get(id); }
  peaks(id: string): number[] {
    const b = this.buffers.get(id);
    return b ? waveform(Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c))) : [];
  }
  async load(project: Project, id: string): Promise<AudioBuffer> {
    this.use(project);
    const found = this.buffers.get(id);
    if (found) return found;
    const active = this.pending.get(id);
    if (active) return active;
    const sound = project.sounds.get(id);
    if (!sound) throw new Error('The audio asset is missing.');
    const reserved = [...project.sounds.values()].reduce((n, s) => n + s.duration * SOUND_RATE * 2 * 4, 0);
    if (reserved > soundBudget(this.lite())) throw new Error('This project’s audio exceeds this device’s playback memory limit. Use Full mode or shorter audio clips.');
    const task = (async () => {
      const bytes = sound.bytes ?? await this.source(sound.path);
      if (!bytes) throw new Error(`Audio file “${sound.name}” is missing.`);
      const b = await this.decoder.decodeAudioData(bytes.slice().buffer as ArrayBuffer);
      if (b.duration > SOUND_MAX_SECONDS + 0.01 || b.numberOfChannels > 2) throw new Error('This audio is too long or has too many channels.');
      if (this.project === project) this.buffers.set(id, b);
      return b;
    })();
    this.pending.set(id, task);
    try { return await task; } finally { if (this.project === project) this.pending.delete(id); }
  }
  async import(project: Project, file: File): Promise<{ id: string; sound: SoundAsset }> {
    this.use(project);
    if (file.size > 16 * 1024 * 1024 || !file.size) throw new Error('Choose an audio file smaller than 16 MB.');
    // Inspect container metadata before asking the browser to decode the full source.
    const media = document.createElement('audio');
    const url = URL.createObjectURL(file);
    try {
      const duration = await new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(() => { reject(new Error('Audio metadata took too long to load. Try WAV or MP3.')); }, 10000);
        media.onloadedmetadata = () => { clearTimeout(timeout); resolve(media.duration); };
        media.onerror = () => { clearTimeout(timeout); reject(new Error('This browser cannot read that audio file. Try WAV or MP3.')); };
        media.preload = 'metadata'; media.src = url;
      });
      const used = [...project.sounds.values()].reduce((n, s) => n + s.duration * SOUND_RATE * 2 * 4, 0);
      if (!Number.isFinite(duration) || duration <= 0 || duration > SOUND_MAX_SECONDS) throw new Error('Choose an audio clip up to two minutes long.');
      if (used + duration * SOUND_RATE * 2 * 4 > soundBudget(this.lite())) throw new Error('This audio would exceed the device’s playback memory limit. Use a shorter clip or Full mode.');
      const decoded = await this.decoder.decodeAudioData(await file.arrayBuffer());
      if (decoded.duration > SOUND_MAX_SECONDS || decoded.numberOfChannels > 2) throw new Error('Choose mono or stereo audio up to two minutes long.');
      const bytes = wavBytes(decoded);
      const id = `s${hashBytes(bytes).replace(/[^A-Za-z0-9_-]/g, '')}`;
      if (this.project === project) this.buffers.set(id, decoded);
      return { id, sound: { name: file.name.slice(0, 120), duration: decoded.duration, path: `assets/${hashBytes(bytes)}.wav`, bytes } };
    } finally { media.removeAttribute('src'); media.load(); URL.revokeObjectURL(url); }
  }
}
