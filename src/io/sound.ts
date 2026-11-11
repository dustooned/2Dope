import type { SoundAsset } from '../core/audio';
import { buildWaveform, type WaveformData } from '../core/waveform';
import type { Project } from '../core/project';
import { hashBytes } from './hash';

export const SOUND_RATE = 44100;
/** Longest sound (a whole animatic's soundtrack). */
export const SOUND_MAX_SECONDS = 600;
/** Sounds longer than this are kept mono at half rate, so ten minutes fit in memory. */
export const SOUND_LONG_SECONDS = 120;
export const LONG_RATE = 22050;
export const soundBudget = (lite: boolean) => (lite ? 96 : 192) * 1024 * 1024;
/** Decoded memory of a stored sound (float samples). */
export const soundBytes = (s: { duration: number }) => s.duration * (s.duration > SOUND_LONG_SECONDS ? LONG_RATE : SOUND_RATE * 2) * 4;
/** Largest audio file brought in on its own (a movie's sound is read from the movie). */
export const AUDIO_FILE_MAX_BYTES = 160 * 1024 * 1024;

/** A long sound as mono at half rate (a sound up to two minutes is kept as is). */
export function compactSound(b: AudioBuffer): AudioBuffer {
  if (b.duration <= SOUND_LONG_SECONDS) return b;
  const n = Math.ceil(b.duration * LONG_RATE), out = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: LONG_RATE });
  const chans = Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c)), mono = out.getChannelData(0), k = b.sampleRate / LONG_RATE;
  for (let i = 0; i < n; i++) {
    const pos = i * k, j = Math.floor(pos), f = pos - j;
    let v = 0;
    for (const ch of chans) v += (ch[j] ?? 0) * (1 - f) + (ch[j + 1] ?? 0) * f;
    mono[i] = v / chans.length;
  }
  return out;
}

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
  private waveforms = new Map<string, WaveformData>();
  private pending = new Map<string, Promise<AudioBuffer>>();
  private context: OfflineAudioContext | null = null;
  source: (path: string) => Promise<Uint8Array | null> = async () => null;
  constructor(private readonly lite: () => boolean) {}
  use(project: Project): void {
    if (this.project === project) return;
    this.project = project;
    this.buffers.clear(); this.waveforms.clear(); this.pending.clear(); this.context = null;
  }
  private get decoder() { return this.context ??= new OfflineAudioContext(2, 1, SOUND_RATE); }
  private longContext: OfflineAudioContext | null = null;
  /** Stored long sounds are WAVs at half rate: decode them at that rate (no doubling in memory). */
  private decoderFor(bytes: Uint8Array) {
    const rate = bytes.length > 28 ? new DataView(bytes.buffer, bytes.byteOffset).getUint32(24, true) : SOUND_RATE;
    return rate === LONG_RATE ? (this.longContext ??= new OfflineAudioContext(1, 1, LONG_RATE)) : this.decoder;
  }
  get(id: string): AudioBuffer | undefined { return this.buffers.get(id); }
  waveform(id: string): WaveformData | undefined {
    const cached = this.waveforms.get(id); if (cached) return cached;
    const b = this.buffers.get(id);
    if (!b) return undefined;
    const data = buildWaveform(Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c)), b.sampleRate);
    this.waveforms.set(id, data); return data;
  }
  async load(project: Project, id: string): Promise<AudioBuffer> {
    this.use(project);
    const found = this.buffers.get(id);
    if (found) return found;
    const active = this.pending.get(id);
    if (active) return active;
    const sound = project.sounds.get(id);
    if (!sound) throw new Error('The audio asset is missing.');
    const reserved = [...project.sounds.values()].reduce((n, s) => n + soundBytes(s), 0);
    if (reserved > soundBudget(this.lite())) throw new Error('This project’s audio exceeds this device’s playback memory limit. Use Full mode or shorter audio clips.');
    const task = (async () => {
      const bytes = sound.bytes ?? await this.source(sound.path);
      if (!bytes) throw new Error(`Audio file “${sound.name}” is missing.`);
      const b = await this.decoderFor(bytes).decodeAudioData(bytes.slice().buffer as ArrayBuffer);
      if (b.duration > SOUND_MAX_SECONDS + 0.01 || b.numberOfChannels > 2) throw new Error('This audio is too long or has too many channels.');
      if (this.project === project) this.buffers.set(id, b);
      return b;
    })();
    this.pending.set(id, task);
    try { return await task; } finally { if (this.project === project) this.pending.delete(id); }
  }
  /** A decoded sound as a stored asset (long sounds compacted), cached for playback. */
  adopt(project: Project, decoded: AudioBuffer, name: string): { id: string; sound: SoundAsset } {
    this.use(project);
    if (decoded.duration > SOUND_MAX_SECONDS + 0.5) throw new Error('Choose audio up to ten minutes long.');
    const kept = compactSound(decoded);
    if (kept.numberOfChannels > 2) throw new Error('Choose mono or stereo audio.');
    const used = [...project.sounds.values()].reduce((n, s) => n + soundBytes(s), 0);
    if (used + soundBytes({ duration: kept.duration }) > soundBudget(this.lite())) throw new Error('This sound would exceed the device\u2019s playback memory limit. Use a shorter clip, or remove sounds you no longer need.');
    const bytes = wavBytes(kept);
    const id = `s${hashBytes(bytes).replace(/[^A-Za-z0-9_-]/g, '')}`;
    if (this.project === project && !this.buffers.has(id)) this.buffers.set(id, kept);
    return { id, sound: { name: name.slice(0, 120), duration: Math.min(SOUND_MAX_SECONDS, kept.duration), path: `assets/${hashBytes(bytes)}.wav`, bytes } };
  }

  async import(project: Project, file: File): Promise<{ id: string; sound: SoundAsset }> {
    this.use(project);
    if (file.size > AUDIO_FILE_MAX_BYTES || !file.size) throw new Error('Choose an audio file smaller than 160 MB.');
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
      if (!Number.isFinite(duration) || duration <= 0 || duration > SOUND_MAX_SECONDS) throw new Error('Choose an audio clip up to ten minutes long.');
      const used = [...project.sounds.values()].reduce((n, s) => n + soundBytes(s), 0);
      if (used + soundBytes({ duration }) > soundBudget(this.lite())) throw new Error('This audio would exceed the device\u2019s playback memory limit. Use a shorter clip, or remove sounds you no longer need.');
      const decoded = await this.decoder.decodeAudioData(await file.arrayBuffer());
      return this.adopt(project, decoded, file.name);
    } finally { media.removeAttribute('src'); media.load(); URL.revokeObjectURL(url); }
  }

  /**
   * The sound of a movie file (its first audio track), as a stored asset; null when it has none.
   * The browser decodes it directly (MP4, MOV and WebM sound usually works); mediabunny is the fallback.
   */
  async importMovieSound(project: Project, bytes: Uint8Array, name: string): Promise<{ id: string; sound: SoundAsset } | null> {
    this.use(project);
    let decoded: AudioBuffer | null = null;
    try { decoded = await this.decoder.decodeAudioData(bytes.slice().buffer as ArrayBuffer); } catch { decoded = null; }
    if (!decoded) {
      const { Input, BufferSource, ALL_FORMATS, AudioBufferSink } = await import('mediabunny');
      const input = new Input({ source: new BufferSource(bytes.slice().buffer), formats: ALL_FORMATS });
      try {
        const track = await input.getPrimaryAudioTrack();
        if (!track || !(await track.canDecode())) return null;
        const duration = Math.min(SOUND_MAX_SECONDS, await input.computeDuration());
        const long = duration > SOUND_LONG_SECONDS, rate = long ? LONG_RATE : SOUND_RATE;
        const out = new AudioBuffer({ length: Math.max(1, Math.ceil(duration * rate)), numberOfChannels: long ? 1 : 2, sampleRate: rate });
        // each decoded piece resampled into place (linear), onto the output's channels
        for await (const piece of new AudioBufferSink(track).buffers(0, duration)) {
          const b = piece.buffer, k = b.sampleRate / rate, start = Math.round(piece.timestamp * rate), n = Math.floor(b.length / k);
          for (let c = 0; c < out.numberOfChannels; c++) {
            const dst = out.getChannelData(c), src = b.getChannelData(Math.min(c, b.numberOfChannels - 1));
            for (let i = 0; i < n && start + i < dst.length; i++) {
              if (start + i < 0) continue;
              const pos = i * k, j = Math.floor(pos), f = pos - j;
              dst[start + i] = (src[j] ?? 0) * (1 - f) + (src[j + 1] ?? 0) * f;
            }
          }
        }
        decoded = out;
      } catch { return null; } finally { input.dispose(); }
    }
    if (!decoded || decoded.duration <= 0.05) return null;
    // a movie longer than ten minutes keeps its first ten minutes of sound
    if (decoded.duration > SOUND_MAX_SECONDS) {
      const n = Math.floor(SOUND_MAX_SECONDS * decoded.sampleRate), cut = new AudioBuffer({ length: n, numberOfChannels: decoded.numberOfChannels, sampleRate: decoded.sampleRate });
      for (let c = 0; c < decoded.numberOfChannels; c++) cut.copyToChannel(decoded.getChannelData(c).subarray(0, n), c);
      decoded = cut;
    }
    return this.adopt(project, decoded, name);
  }
}
