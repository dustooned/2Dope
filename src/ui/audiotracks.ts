import type { App } from '../app';
import type { AudioPlayback } from '../audio';
import { soundStart, type SoundClip } from '../core/audio';
import { locate } from '../core/timeline';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const e = document.createElement(tag); e.textContent = text; return e; };

/** One shared, foldable audio lane, shown under Board, Draw, Time and Motion. */
export class AudioTracks {
  private readonly root = el('details');
  private readonly body = el('div');
  private readonly summary = el('summary');
  private signature = '';
  private importing = false;
  constructor(private readonly app: App, private readonly playback: AudioPlayback, host: HTMLElement) {
    this.root.className = 'audio-tracks';
    this.root.setAttribute('data-own-keys', '');
    this.body.className = 'audio-body';
    this.root.append(this.summary, this.body); host.append(this.root);
    this.root.addEventListener('toggle', () => this.update(true));
    this.update();
  }
  private edit(label: string, fn: (clips: SoundClip[]) => SoundClip[]): void {
    if (this.app.strokeActive) return;
    if (this.app.playing) this.app.togglePlay();
    const p = this.app.project;
    const comp = p.comp;
    const before = structuredClone(comp.audio ?? []);
    const after = fn(structuredClone(before));
    const apply = (clips: SoundClip[]) => {
      const c = p.comps.get(comp.id);
      if (!c) return;
      c.audio = structuredClone(clips);
      this.app.requestRender(); this.app.onFrameChange(); this.app.onDocChanged();
    };
    this.app.history.push({ label, do: () => apply(after), undo: () => apply(before) }, false);
  }
  private async import(file: File): Promise<void> {
    if (this.importing || this.app.strokeActive) return;
    if (this.app.playing) this.app.togglePlay();
    this.importing = true;
    const p = this.app.project; const comp = p.comp; const frame = this.app.frame;
    this.update(true);
    try {
      const result = await this.playback.bank.import(p, file);
      if (this.app.project !== p || p.comp !== comp) throw new Error('The project changed while audio was loading. Import it again in the intended shot.');
      p.sounds.set(result.id, result.sound);
      const clip: SoundClip = { id: p.newId('a'), asset: result.id, name: file.name.slice(0, 120), start: frame, trimIn: 0, trimOut: result.sound.duration, gain: 1, muted: false, link: null };
      this.edit('Import audio', clips => [...clips, clip]);
      this.root.open = true;
      this.app.onNotice?.('Audio imported. Move or trim it here; link dialogue to a board panel to follow its timing.');
    } catch (e) { this.app.onNotice?.(e instanceof Error ? e.message : String(e)); }
    finally { this.importing = false; this.update(true); }
  }
  update(force = false): void {
    const app = this.app; const c = app.project.comp; const clips = c.audio ?? [];
    this.root.hidden = app.uiHidden;
    this.summary.textContent = `Audio · ${clips.length ? `${clips.length} clip${clips.length === 1 ? '' : 's'}` : 'Import sound'}${this.importing ? ' · loading…' : ''}`;
    const sig = `${c.id}:${c.fps}:${app.compEnd}:${JSON.stringify(clips)}:${this.importing}`;
    // Playhead moves without rebuilding focused controls or waveform canvases.
    this.body.style.setProperty('--audio-playhead', `${Math.min(100, app.frame / app.compEnd * 100)}%`);
    if ((!force && sig === this.signature) || !this.root.open || this.body.contains(document.activeElement)) return;
    this.signature = sig;
    this.body.replaceChildren();
    const file = el('input'); file.type = 'file'; file.accept = 'audio/*,.wav,.mp3,.m4a,.ogg,.flac'; file.hidden = true;
    file.onchange = () => { const f = file.files?.[0]; if (f) void this.import(f); file.value = ''; };
    const add = el('button', this.importing ? 'Loading audio…' : '+ Audio'); add.type = 'button'; add.disabled = this.importing; add.onclick = () => file.click();
    const toolbar = el('div'); toolbar.className = 'audio-toolbar'; toolbar.append(add, el('span', 'One clock across Board, Draw, Time and Motion. Clip edges use seconds; Start uses frames.'));
    this.body.append(toolbar, file);
    for (const clip of clips) {
      const row = el('details'); row.className = 'audio-clip';
      const head = el('summary', `${clip.muted ? 'Muted · ' : ''}${clip.name} · ${clip.link ? 'panel linked' : 'fixed'} · ${(clip.trimOut - clip.trimIn).toFixed(2)}s`);
      const lane = el('div'); lane.className = 'audio-lane';
      const canvas = el('canvas'); canvas.width = 640; canvas.height = 36; canvas.setAttribute('aria-label', `${clip.name} waveform`);
      const start = soundStart(clip, c);
      const left = (start ?? clip.start) / app.compEnd;
      const width = (clip.trimOut - clip.trimIn) * c.fps / app.compEnd;
      canvas.style.left = `${left * 100}%`; canvas.style.width = `${width * 100}%`;
      const draw = () => {
        const buffer = this.playback.bank.get(clip.asset); if (!buffer) return;
        const g = canvas.getContext('2d')!; g.clearRect(0, 0, 640, 36); g.fillStyle = clip.muted ? '#777887' : '#77d9ba';
        const data = buffer.getChannelData(0);
        for (let x = 0; x < 640; x++) {
          const from = Math.floor((clip.trimIn + x / 640 * (clip.trimOut - clip.trimIn)) * buffer.sampleRate);
          const until = Math.min(data.length, Math.ceil((clip.trimIn + (x + 1) / 640 * (clip.trimOut - clip.trimIn)) * buffer.sampleRate));
          let peak = 0; for (let i = from; i < until; i++) peak = Math.max(peak, Math.abs(data[i] ?? 0));
          g.fillRect(x, 18 - peak * 16, 1, Math.max(1, peak * 32));
        }
      };
      void this.playback.bank.load(app.project, clip.asset).then(draw).catch(e => { head.textContent = `${clip.name} · ${e instanceof Error ? e.message : String(e)}`; });
      lane.append(canvas); lane.title = 'Tap to move the shared playhead';
      lane.onclick = e => app.setFrame((e.clientX - lane.getBoundingClientRect().left) / lane.clientWidth * app.compEnd);
      const controls = el('div'); controls.className = 'audio-controls';
      const change = (patch: Partial<SoundClip>) => { this.edit('Edit audio clip', list => list.map(s => s.id === clip.id ? { ...s, ...patch } : s)); this.signature = ''; };
      const field = (name: string, value: number, min: number, max: number, step: string, apply: (n: number) => void) => {
        const label = el('label', name); const input = el('input'); input.type = 'number'; input.value = String(Math.round(value * 1000) / 1000); input.min = String(min); input.max = String(max); input.step = step; input.setAttribute('aria-label', `${clip.name} ${name}`);
        input.onchange = () => { const n = Number(input.value); if (Number.isFinite(n) && n >= min && n <= max) apply(n); else input.value = String(value); input.blur(); this.update(true); };
        label.append(input); controls.append(label);
      };
      field('Start frame', (start ?? clip.start) + 1, 1, 1000000, '1', n => change(clip.link ? { link: { ...clip.link, offset: clip.link.offset + Math.round(n) - 1 - (start ?? clip.start) } } : { start: Math.round(n) - 1 }));
      field('Source in', clip.trimIn, 0, clip.trimOut - 0.001, '0.01', n => change({ trimIn: n }));
      field('Source out', clip.trimOut, clip.trimIn + 0.001, app.project.sounds.get(clip.asset)?.duration ?? clip.trimOut, '0.01', n => change({ trimOut: n }));
      field('Volume %', clip.gain * 100, 0, 200, '1', n => change({ gain: n / 100 }));
      const button = (name: string, fn: () => void) => { const b = el('button', name); b.type = 'button'; b.onclick = () => { fn(); b.blur(); this.update(true); }; controls.append(b); };
      button(clip.muted ? 'Unmute' : 'Mute', () => change({ muted: !clip.muted }));
      button(clip.link ? 'Unlink panel' : 'Link current panel', () => {
        if (clip.link) { change({ start: Math.max(0, start ?? clip.start), link: null }); return; }
        const board = app.board; const at = board ? locate(board.exposures, app.frame - board.start) : null;
        if (!board || !at) { app.onNotice?.('Move the playhead onto a storyboard panel first.'); return; }
        const drawing = board.exposures[at.index]!.drawing;
        const occurrence = board.exposures.slice(0, at.index).filter(e => e.drawing === drawing).length;
        change({ link: { layer: board.id, drawing, occurrence, offset: clip.start - board.start - at.start } });
      });
      button('Delete clip', () => this.edit('Delete audio clip', list => list.filter(s => s.id !== clip.id)));
      if (start === null) controls.append(el('span', 'Linked panel removed: clip is silent. Unlink to place it manually.'));
      row.append(head, lane, controls); this.body.append(row);
    }
  }
}
