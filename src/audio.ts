import type { App } from './app';
import { SoundBank, SOUND_RATE } from './io/sound';
import { mixSound, soundVoices, type SoundVoice } from './io/soundmix';

/** A short look-ahead queue follows the shared comp clock through seeks, loops and nested sound. */
export class AudioPlayback {
  readonly bank: SoundBank;
  private context: AudioContext | null = null;
  private nodes = new Set<AudioBufferSourceNode>();
  private generation = 0;
  private key = '';
  private queued = 0;
  private voices: SoundVoice[] = [];
  private origin = { t: 0, f: 0, fps: 12, len: 1 };
  private starting = false;
  private project: App['project'] | null = null;
  constructor(private readonly app: App) {
    this.bank = new SoundBank(() => app.device.lite);
    document.addEventListener('visibilitychange', () => { if (document.hidden && app.playing) app.togglePlay(); });
    setInterval(() => { if (app.playing) this.sync(); }, 75);
  }
  invalidate(): void { this.key = ''; }
  stop(): void {
    this.generation++; this.starting = false;
    for (const n of this.nodes) { try { n.stop(); } catch { /* ended */ } n.disconnect(); }
    this.nodes.clear(); this.queued = 0;
  }
  sync(): void {
    const app = this.app, p = app.project, c = p.comp;
    this.bank.use(p);
    if (!app.playing) { if (this.nodes.size || this.starting) this.stop(); this.key = ''; return; }
    const key = `${c.id}:${c.fps}:${app.compEnd}`;
    const expected = this.context ? (this.origin.f + (this.context.currentTime - this.origin.t) * this.origin.fps) % this.origin.len : -10;
    const restart = this.project !== p || this.key !== key || (!this.starting && Math.abs(expected - app.frame) > 1.5);
    if (restart) {
      this.stop(); this.project = p; this.key = key; this.starting = true;
      this.voices = soundVoices(p, c.id);
      if (!this.voices.length) { this.starting = false; return; }
      const ctx = this.context ??= new AudioContext();
      const generation = this.generation;
      void ctx.resume().catch(() => {});
      void Promise.all([...new Set(this.voices.map(v => v.asset))].map(id => this.bank.load(p, id))).then(() => {
        if (generation !== this.generation || !app.playing || app.project !== p || p.comp.id !== c.id) return;
        this.starting = false;
        this.origin = { t: ctx.currentTime + 0.015, f: app.frame, fps: c.fps, len: app.compEnd };
        this.fillQueue();
      }).catch(e => {
        if (generation !== this.generation) return;
        this.stop(); if (app.playing) app.togglePlay(); app.onNotice?.(e instanceof Error ? e.message : String(e));
      });
    } else if (!this.starting && this.voices.length) this.fillQueue();
  }
  private fillQueue(): void {
    const ctx = this.context!;
    while (this.origin.t + this.queued < ctx.currentTime + 0.4) {
      const data = mixSound(this.voices, this.bank, this.origin.f / this.origin.fps + this.queued, Math.round(SOUND_RATE / 4), SOUND_RATE, this.origin.len / this.origin.fps);
      const buffer = ctx.createBuffer(2, data[0].length, SOUND_RATE);
      buffer.copyToChannel(data[0], 0); buffer.copyToChannel(data[1], 1);
      const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(ctx.destination);
      source.onended = () => { source.disconnect(); this.nodes.delete(source); };
      source.start(Math.max(ctx.currentTime, this.origin.t + this.queued)); this.nodes.add(source); this.queued += buffer.duration;
    }
  }
}
