import type { App } from '../app';
import type { AudioPlayback } from '../audio';
import { soundStart, withoutClip, type SoundClip } from '../core/audio';
import { attachContextMenu, type CtxItem } from './contextmenu';
import { decorate } from './icons';
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
  /** Import a sound as a clip from frame 1. `quiet`: no message when it has no sound (a silent movie). */
  /** Delete one sound: one Undo step, from its row, its card, the Audio panel or its hold menu. */
  deleteClip(id: string): void {
    const clip = (this.app.project.comp.audio ?? []).find(s => s.id === id);
    if (!clip || this.app.strokeActive) return;
    if (this.cardClip === id) this.closeCard();
    this.edit('Delete sound', list => withoutClip(list, id));
    this.signature = '';
    this.update(true);
    this.app.onNotice?.(`Deleted “${clip.name}”. Undo brings it back.`);
  }

  /** Press and hold (or right-click) a sound: its settings, mute and delete. */
  soundMenu(id: string): CtxItem[] | null {
    const clip = (this.app.project.comp.audio ?? []).find(s => s.id === id);
    if (!clip) return null;
    return [
      { title: `♪ ${clip.name}` },
      { label: 'Settings…', run: () => this.openCard(id) },
      { label: clip.muted ? 'Unmute' : 'Mute', run: () => this.edit(clip.muted ? 'Unmute audio' : 'Mute audio', list => list.map(s => s.id === id ? { ...s, muted: !s.muted } : s)) },
      { sep: true },
      { label: 'Delete sound', danger: true, run: () => this.deleteClip(id) },
    ];
  }

  /** A small trash button that deletes this sound (rows are too tight for a label). */
  private deleteButton(clip: SoundClip, className: string): HTMLButtonElement {
    const b = el('button', 'Delete'); b.type = 'button'; b.className = className;
    b.title = `Delete ${clip.name} (Undo brings it back)`;
    b.setAttribute('aria-label', `Delete ${clip.name}`);
    decorate(b, 'trash');
    b.onclick = (e) => { e.stopPropagation(); this.deleteClip(clip.id); };
    return b;
  }

  async import(file: File, quiet = false): Promise<void> {
    if (this.importing || this.app.strokeActive) return;
    if (this.app.playing) this.app.togglePlay();
    this.importing = true;
    const p = this.app.project; const comp = p.comp; const frame = 0;
    this.update(true);
    try {
      const result = await this.playback.bank.import(p, file);
      if (this.app.project !== p || p.comp !== comp) throw new Error('The project changed while audio was loading. Import it again in the intended shot.');
      p.sounds.set(result.id, result.sound);
      const clip: SoundClip = { id: p.newId('a'), asset: result.id, name: file.name.slice(0, 120), start: frame, trimIn: 0, trimOut: result.sound.duration, gain: 1, muted: false, link: null };
      this.edit('Import audio', clips => [...clips, clip]);
      this.root.open = true;
      if (!quiet) this.app.onNotice?.('Sound added at frame 1. Drag it on the timeline to move it; drag its ends to trim. Its trash button (or hold it) deletes it.');
    } catch (e) { if (!quiet) this.app.onNotice?.(e instanceof Error ? e.message : String(e)); }
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
      head.append(settings, this.deleteButton(clip, 'audio-delete'));
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
    const del = el('button', 'Delete sound'); del.type = 'button'; del.className = 'danger';
    del.onclick = () => this.deleteClip(clip.id); controls.append(del);
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
    const app = this.app; const c = app.project.comp;
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
      tag.append(mute, name, this.deleteButton(clip, 'rail-btn icon-only rail-del')); row.append(tag);
      row.append(this.clipBlock(clip, x0, cell)); nodes.push(row); y += H;
    }
    return { nodes, height: y - top };
  }

  /** Motion: one row per sound under the layers, on Motion's clock (frame 0 at the left of the lanes). */
  motionRows(cell: number, end: number): HTMLElement[] {
    return (this.app.project.comp.audio ?? []).map((clip) => {
      const row = el('div'); row.className = `mrow audio${clip.muted ? ' off' : ''}`;
      const left = el('div'); left.className = 'mleft';
      const name = el('button', `\u266A ${clip.name}`); name.type = 'button'; name.className = 'lname'; name.title = 'Sound settings';
      name.onclick = () => this.openCard(clip.id);
      const mute = el('button', clip.muted ? '\u2013' : '\u266A'); mute.type = 'button'; mute.className = 'leye';
      mute.setAttribute('aria-pressed', String(!clip.muted)); mute.title = clip.muted ? 'Unmute this sound' : 'Mute this sound';
      mute.onclick = () => this.edit(clip.muted ? 'Unmute audio' : 'Mute audio', list => list.map(s => s.id === clip.id ? { ...s, muted: !s.muted } : s));
      left.append(name, mute, this.deleteButton(clip, 'leye icon-only ldel'));
      const right = el('div'); right.className = 'mright'; right.style.width = `${end * cell}px`;
      right.append(this.clipBlock(clip, 0, cell));
      row.append(left, right);
      return row;
    });
  }

  /**
   * One sound on the timeline (Procreate Dreams style): drag it to move it, drag an end to trim it,
   * tap it for its settings. Snaps to frames; one undo step per drag.
   */
  private clipBlock(clip: SoundClip, x0: number, cell: number): HTMLElement {
    const app = this.app; const c = app.project.comp; const project = app.project; const fps = c.fps;
    const start = soundStart(clip, c) ?? clip.start;
    const duration = project.sounds.get(clip.asset)?.duration ?? clip.trimOut;
    const b = el('div'); b.className = 'rblock audio-block'; b.title = 'Drag to move \u00b7 drag an end to trim \u00b7 tap for settings';
    const place = (s: number, tin: number, tout: number) => {
      b.style.left = `${(s - x0) * cell}px`;
      b.style.width = `${Math.max(6, (tout - tin) * fps * cell - 3)}px`;
    };
    place(start, clip.trimIn, clip.trimOut);
    const canvas = el('canvas'); canvas.height = 28; canvas.setAttribute('aria-label', `${clip.name} waveform`);
    const edgeIn = el('span'); edgeIn.className = 'ab-edge in'; edgeIn.dataset.edge = 'in'; edgeIn.title = 'Drag to trim the start';
    const edgeOut = el('span'); edgeOut.className = 'ab-edge out'; edgeOut.dataset.edge = 'out'; edgeOut.title = 'Drag to trim the end';
    b.append(canvas, edgeIn, edgeOut);
    const draw = () => {
      if (!canvas.isConnected || app.project !== project) return;
      const data = this.playback.bank.waveform(clip.asset);
      if (data) paintWaveform(canvas, data, clip);
    };
    void this.playback.bank.load(project, clip.asset).then(() => setTimeout(draw, 0)).catch(() => {});
    setTimeout(draw, 50);

    let drag: { id: number; x: number; what: 'move' | 'in' | 'out'; moved: boolean; patch: Partial<SoundClip> } | null = null;
    let dragged = false;
    b.addEventListener('pointerdown', (e) => {
      // the timeline under it must not scrub or select while a sound is held
      e.stopPropagation();
      if (e.button > 0 || app.strokeActive) return;
      const edge = (e.target as HTMLElement).dataset.edge as 'in' | 'out' | undefined;
      drag = { id: e.pointerId, x: e.clientX, what: edge ?? 'move', moved: false, patch: {} };
      try { b.setPointerCapture(e.pointerId); } catch { /* still works without capture */ }
    });
    b.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) < 5) return;
      drag.moved = true;
      b.classList.add('dragging');
      let df = Math.round(dx / cell);
      if (drag.what === 'move') {
        df = Math.max(df, -start);
        drag.patch = { start: start + df };
        place(start + df, clip.trimIn, clip.trimOut);
      } else if (drag.what === 'in') {
        // trim the front: the sound stays put, its beginning is cut (or brought back)
        df = Math.min(Math.floor((clip.trimOut - clip.trimIn) * fps) - 1, Math.max(-start, Math.ceil(-clip.trimIn * fps), df));
        const tin = Math.max(0, clip.trimIn + df / fps);
        drag.patch = { start: start + df, trimIn: tin };
        place(start + df, tin, clip.trimOut);
      } else {
        const tout = Math.min(duration, Math.max(clip.trimIn + 1 / fps, clip.trimOut + df / fps));
        drag.patch = { trimOut: tout };
        place(start, clip.trimIn, tout);
      }
    });
    const end = (e: PointerEvent, cancel: boolean) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      b.classList.remove('dragging');
      if (!d.moved) return;
      dragged = true;
      setTimeout(() => { dragged = false; }, 0);
      if (cancel) { place(start, clip.trimIn, clip.trimOut); return; }
      const patch = { ...d.patch };
      if ((patch.start ?? start) === start && (patch.trimIn ?? clip.trimIn) === clip.trimIn && (patch.trimOut ?? clip.trimOut) === clip.trimOut) return;
      // a sound linked to a board panel moves by its offset, so it keeps following the panel
      if (clip.link && patch.start !== undefined) {
        patch.link = { ...clip.link, offset: clip.link.offset + patch.start - start };
        delete patch.start;
      }
      this.edit(d.what === 'move' ? 'Move sound' : 'Trim sound', list => list.map(s => s.id === clip.id ? { ...s, ...patch } : s));
    };
    b.addEventListener('pointerup', (e) => end(e, false));
    b.addEventListener('pointercancel', (e) => end(e, true));
    b.addEventListener('click', (e) => { e.stopPropagation(); if (!dragged) this.openCard(clip.id); });
    attachContextMenu(b, () => this.soundMenu(clip.id));
    return b;
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
    head.append(this.deleteButton(clip, 'audio-card-del'), x);
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
