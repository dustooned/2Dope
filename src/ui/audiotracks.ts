import type { App } from '../app';
import type { AudioPlayback } from '../audio';
import { soundStart, type SoundClip } from '../core/audio';
import { locate } from '../core/timeline';
import { paintWaveform } from './waveform';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const e = document.createElement(tag); e.textContent = text; return e; };

/** One shared, foldable audio lane, shown under Board, Draw, Time and Motion. */
export class AudioTracks {
  private readonly root = el('details');
  private readonly body = el('div');
  private readonly summary = el('summary');
  private signature = '';
  private importing = false;
  private project: App['project'] | null = null;
  private openClips = new Set<string>();
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
    const project = app.project;
    const changedProject = this.project !== app.project;
    if (changedProject) { this.project = app.project; this.openClips.clear(); this.signature = ''; }
    if (changedProject && clips.length) this.root.open = true;
    this.root.hidden = app.uiHidden;
    this.summary.textContent = `Audio · ${clips.length ? `${clips.length} clip${clips.length === 1 ? '' : 's'}` : 'Import sound'}${this.importing ? ' · loading…' : ''}`;
    const positions = clips.map(clip => soundStart(clip, c));
    for (const id of this.openClips) if (!clips.some(clip => clip.id === id)) this.openClips.delete(id);
    const sig = `${c.id}:${c.fps}:${app.compEnd}:${positions}:${JSON.stringify(clips)}:${this.importing}`;
    // Playhead moves without rebuilding focused controls or waveform canvases.
    this.body.style.setProperty('--audio-playhead', `${Math.min(100, app.frame / app.compEnd * 100)}%`);
    const typing = this.body.contains(document.activeElement) && (document.activeElement as HTMLElement).matches('input:not([type=file])');
    if ((!force && (sig === this.signature || typing)) || !this.root.open) return;
    this.signature = sig;
    this.body.replaceChildren();
    const file = el('input'); file.type = 'file'; file.accept = 'audio/*,.wav,.mp3,.m4a,.ogg,.flac'; file.hidden = true;
    file.onchange = () => { const f = file.files?.[0]; if (f) void this.import(f); file.value = ''; };
    const add = el('button', this.importing ? 'Loading audio…' : '+ Audio'); add.type = 'button'; add.disabled = this.importing; add.onclick = () => file.click();
    const scrub = el('label', 'Hear while scrubbing'); scrub.className = 'audio-scrub';
    scrub.title = 'Play a short slice of sound at each frame you scrub to. Stops when you let go.';
    const box = el('input'); box.type = 'checkbox'; box.checked = this.playback.scrubOn; box.onchange = () => this.playback.setScrub(box.checked);
    scrub.prepend(box);
    const toolbar = el('div'); toolbar.className = 'audio-toolbar'; toolbar.append(add, scrub, el('span', 'One clock across Board, Draw, Time and Motion. Clip edges use seconds; Start uses frames.'));
    this.body.append(toolbar, file);
    for (const clip of clips) {
      const row = el('div'); row.className = 'audio-clip'; row.setAttribute('role', 'group'); row.setAttribute('aria-label', clip.name);
      const head = el('div'); head.className = 'audio-clip-head';
      head.append(el('span', `${clip.muted ? 'Muted · ' : ''}${clip.name} · ${clip.link ? 'panel linked' : 'fixed'} · ${(clip.trimOut - clip.trimIn).toFixed(2)}s`));
      const lane = el('div'); lane.className = 'audio-lane';
      const canvas = el('canvas'); canvas.width = 640; canvas.height = 36; canvas.setAttribute('aria-label', `${clip.name} waveform`);
      const start = soundStart(clip, c);
      const left = (start ?? clip.start) / app.compEnd;
      const width = (clip.trimOut - clip.trimIn) * c.fps / app.compEnd;
      canvas.style.left = `${left * 100}%`; canvas.style.width = `${width * 100}%`;
      const draw = () => {
        if (!canvas.isConnected || app.project !== project) return;
        const data = this.playback.bank.waveform(clip.asset);
        if (data) paintWaveform(canvas, data, clip);
      };
      void this.playback.bank.load(app.project, clip.asset).then(draw).catch(e => { if (head.isConnected) head.prepend(el('span', `Could not load waveform: ${e instanceof Error ? e.message : String(e)}`)); });
      lane.append(canvas); lane.title = 'Tap to move the shared playhead';
      lane.onclick = e => app.setFrame((e.clientX - lane.getBoundingClientRect().left) / lane.clientWidth * app.compEnd);
      const controls = el('div'); controls.className = 'audio-controls';
      controls.id = `audio-controls-${clip.id}`;
      controls.hidden = !this.openClips.has(clip.id);
      const settings = el('button', 'Settings'); settings.type = 'button'; settings.className = 'audio-settings';
      settings.setAttribute('aria-label', `${clip.name} settings`); settings.setAttribute('aria-controls', controls.id);
      settings.setAttribute('aria-expanded', String(!controls.hidden));
      settings.onclick = () => {
        controls.hidden = !controls.hidden;
        if (controls.hidden) this.openClips.delete(clip.id); else this.openClips.add(clip.id);
        settings.setAttribute('aria-expanded', String(!controls.hidden));
      };
      head.append(settings);
      this.fillControls(controls, clip, () => this.update(true));
      row.append(head, lane, controls); this.body.append(row);
    }
  }

  /** The clip's settings (start, trims, volume, mute, link, delete) into `controls`; `after` runs after each edit. */
  private fillControls(controls: HTMLElement, clip: SoundClip, after: () => void): void {
    const app = this.app; const c = app.project.comp;
    const start = soundStart(clip, c);
    const change = (patch: Partial<SoundClip>) => { this.edit('Edit audio clip', list => list.map(s => s.id === clip.id ? { ...s, ...patch } : s)); this.signature = ''; };
    const field = (name: string, value: number, min: number, max: number, step: string, apply: (n: number) => void) => {
      const label = el('label', name); const input = el('input'); input.type = 'number'; input.value = String(Math.round(value * 1000) / 1000); input.min = String(min); input.max = String(max); input.step = step; input.setAttribute('aria-label', `${clip.name} ${name}`);
      let committed = value;
      const commit = () => {
        const n = input.value.trim() ? Number(input.value) : NaN;
        if (Number.isFinite(n) && n >= min && n <= max) {
          if (n !== committed) { committed = n; apply(n); }
        } else input.value = String(committed);
        if (input.isConnected) after();
      };
      input.onchange = commit;
      input.onblur = commit;
      input.onkeydown = e => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); input.blur(); }
        if (e.key === 'Escape') { input.value = String(committed); input.blur(); }
      };
      label.append(input); controls.append(label);
    };
    field('Start frame', (start ?? clip.start) + 1, 1, 1000000, '1', n => change(clip.link ? { link: { ...clip.link, offset: clip.link.offset + Math.round(n) - 1 - (start ?? clip.start) } } : { start: Math.round(n) - 1 }));
    field('Source in', clip.trimIn, 0, clip.trimOut - 0.001, '0.01', n => change({ trimIn: n }));
    field('Source out', clip.trimOut, clip.trimIn + 0.001, app.project.sounds.get(clip.asset)?.duration ?? clip.trimOut, '0.01', n => change({ trimOut: n }));
    field('Volume %', clip.gain * 100, 0, 200, '1', n => change({ gain: n / 100 }));
    const button = (name: string, fn: () => void) => { const b = el('button', name); b.type = 'button'; b.onclick = () => { fn(); b.blur(); after(); }; controls.append(b); };
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
  }

  // ---- Tracks sheet: audio as rows in the shared track stack, settings in a floating card ----

  private card: HTMLElement | null = null;
  private cardClip = '';
  private picker: HTMLInputElement | null = null;
  private cardOff: () => void = () => {};

  /** Open the file picker to import a sound (the tracks sheet's + Audio). */
  pickFile(): void {
    if (!this.picker) {
      const f = el('input'); f.type = 'file'; f.accept = 'audio/*,.wav,.mp3,.m4a,.ogg,.flac'; f.hidden = true;
      f.onchange = () => { const file = f.files?.[0]; if (file) void this.import(file); f.value = ''; };
      document.body.append(f); this.picker = f;
    }
    this.picker.click();
  }

  /** Changes when the rows must be rebuilt. */
  railSig(): string {
    const c = this.app.project.comp;
    return `${c.id}:${c.fps}:${JSON.stringify(c.audio ?? [])}:${this.importing}`;
  }

  /** One row per clip under the drawing rails, lined up on the same clock (`x0` = frame at the left edge). */
  railRows(top: number, x0: number, cell: number, width: number): { nodes: HTMLElement[]; height: number } {
    const app = this.app; const c = app.project.comp; const project = app.project;
    const nodes: HTMLElement[] = [];
    let y = top;
    const H = 38;
    for (const clip of c.audio ?? []) {
      const row = el('div'); row.className = `rail audio${clip.muted ? ' off' : ''}`;
      row.style.top = `${y}px`; row.style.height = `${H}px`; row.style.width = `${width}px`;
      const tag = el('div'); tag.className = 'rail-tag';
      const mute = el('button', clip.muted ? 'Unmute' : 'Mute'); mute.type = 'button'; mute.className = 'rail-btn';
      mute.setAttribute('aria-pressed', String(clip.muted)); mute.title = clip.muted ? 'Unmute this sound' : 'Mute this sound';
      mute.onclick = () => this.edit(clip.muted ? 'Unmute audio' : 'Mute audio', list => list.map(s => s.id === clip.id ? { ...s, muted: !s.muted } : s));
      const name = el('button', `\u266A ${clip.name}`); name.type = 'button'; name.className = 'rail-name'; name.title = 'Sound settings';
      name.onclick = () => this.openCard(clip.id);
      tag.append(mute, name); row.append(tag);
      const start = soundStart(clip, c);
      const b = el('div'); b.className = 'rblock audio-block'; b.title = 'Tap for this sound\u2019s settings';
      b.style.left = `${((start ?? clip.start) - x0) * cell}px`;
      b.style.width = `${Math.max(6, (clip.trimOut - clip.trimIn) * c.fps * cell - 3)}px`;
      const canvas = el('canvas'); canvas.height = 28; canvas.setAttribute('aria-label', `${clip.name} waveform`);
      b.append(canvas);
      b.onclick = () => this.openCard(clip.id);
      const draw = () => {
        if (!canvas.isConnected || app.project !== project) return;
        const data = this.playback.bank.waveform(clip.asset);
        if (data) paintWaveform(canvas, data, clip);
      };
      void this.playback.bank.load(project, clip.asset).then(() => setTimeout(draw, 0)).catch(() => {});
      setTimeout(draw, 50);
      row.append(b); nodes.push(row); y += H;
    }
    return { nodes, height: y - top };
  }

  /** A floating card with one sound's settings. Closes with X, Escape, a tap outside, or a swipe down on its top. */
  openCard(clipId: string): void {
    this.closeCard();
    const card = el('div'); card.className = 'audio-card'; card.setAttribute('role', 'dialog');
    this.card = card; this.cardClip = clipId;
    document.body.append(card);
    this.renderCard();
    const outside = (e: PointerEvent) => { if (this.card && !this.card.contains(e.target as Node)) this.closeCard(); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && this.card) { e.stopPropagation(); this.closeCard(); } };
    setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
    document.addEventListener('keydown', esc, true);
    this.cardOff = () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', esc, true); };
  }

  get cardOpen(): boolean {
    return this.card !== null;
  }

  closeCard(): void {
    this.cardOff(); this.cardOff = () => {};
    this.card?.remove(); this.card = null; this.cardClip = '';
  }

  private renderCard(): void {
    const card = this.card; if (!card) return;
    const clip = (this.app.project.comp.audio ?? []).find(s => s.id === this.cardClip);
    if (!clip) { this.closeCard(); return; }
    card.replaceChildren();
    card.setAttribute('aria-label', `${clip.name} settings`);
    const head = el('div'); head.className = 'audio-card-head';
    head.append(el('span', `\u266A ${clip.name}`));
    const x = el('button', '\u2715'); x.type = 'button'; x.className = 'audio-card-x'; x.setAttribute('aria-label', 'Close');
    x.onclick = () => this.closeCard();
    head.append(x);
    let y0 = -1;
    head.addEventListener('pointerdown', e => { y0 = e.clientY; });
    head.addEventListener('pointerup', e => { if (y0 >= 0 && e.clientY - y0 > 50) this.closeCard(); y0 = -1; });
    const controls = el('div'); controls.className = 'audio-controls';
    this.fillControls(controls, clip, () => setTimeout(() => this.renderCard(), 0));
    const scrub = el('label', 'Hear while scrubbing'); scrub.className = 'audio-scrub';
    const box = el('input'); box.type = 'checkbox'; box.checked = this.playback.scrubOn; box.onchange = () => this.playback.setScrub(box.checked);
    scrub.prepend(box);
    card.append(head, controls, scrub);
  }
}
