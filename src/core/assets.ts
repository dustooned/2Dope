import type { App, Workspace } from '../app';
import { compLayer, compLength, drawingsLayer, layerEnd, newComp } from './comp';
import type { Parked, Project } from './project';
import { artworkDrawings, artworkGraph, copyArtworkGraph, snapshotArtwork } from './assetcopy';
import type { ArtworkPackage } from '../io/artwork';
import { loadProjectFile } from '../io/projectio';
import { MAX_COMPS, MAX_DRAWINGS, MAX_VECTORS, validateProjectFile } from '../io/schema';

/** Assets are normal editable comps. Placement and source changes use existing History commands. */
export class ArtworkAssets {
  private origin: { project: Project; comp: string; layer: string; frame: number; workspace: Workspace } | null = null;
  private switching = false;
  private readonly positions = new WeakMap<Project, Map<string, { layer: string; frame: number }>>();
  copying = false;
  constructor(private app: App) {}
  get editing(): boolean { return this.app.project.activeComp !== this.app.project.main && this.app.project.comp.asset === true; }
  list() { return [...this.app.project.comps.values()].filter(c => c.asset && c.id !== this.app.project.main); }

  create(name: string): string | null {
    const a = this.app, p = a.project;
    if (a.strokeActive || !name.trim()) return null;
    const d = p.newDrawing(), id = p.newId('c');
    const c = newComp(id, name.trim().slice(0, 80), p.width, p.height, p.comps.get(p.main)!.fps);
    c.asset = true;
    const l = drawingsLayer(p.newId('L'), 'Paint layer', [{ drawing: d.id, length: 1 }], p.width, p.height);
    l.play = 'loop'; c.layers.push(l);
    a.editor.editProject('New artwork asset', () => p.comps.set(id, c));
    const cmd = a.history.peekUndo(); if (cmd) cmd.drawings = [d];
    this.open(id);
    return id;
  }

  /** Draw in a source: on `layerId` when given, else where you last were in it. */
  open(id: string, layerId?: string): boolean {
    const a = this.app, p = a.project, c = p.comps.get(id);
    if (a.strokeActive || !c?.asset || id === p.main) return false;
    this.rememberPosition();
    if (!this.editing || this.origin?.project !== p) this.origin = {
      project: p, comp: p.activeComp, layer: p.activeLayer, frame: a.frame, workspace: a.workspace,
    };
    a.setWorkspace('draw');
    const position = this.positions.get(p)?.get(id);
    const chosen = c.layers.find(l => l.kind === 'drawings' && l.id === layerId);
    const layer = c.layers.find(l => l.kind === 'drawings' && l.id === position?.layer);
    this.switchTo(id, chosen?.id ?? layer?.id ?? c.layers.find(l => l.kind === 'drawings')?.id, layer ? position!.frame : 0);
    return true;
  }

  done(animate = false): void {
    const a = this.app, p = a.project;
    if (this.switching || a.strokeActive || !this.editing) return;
    this.rememberPosition();
    const origin = this.origin?.project === p ? this.origin : null;
    const target = origin && p.comps.has(origin.comp) && !p.comps.get(origin.comp)?.asset ? origin.comp : p.main;
    this.origin = null;
    this.switchTo(target, origin?.layer, origin?.frame ?? 0);
    a.setWorkspace(animate ? 'animate' : origin?.workspace ?? 'animate');
  }

  place(id: string): boolean {
    const a = this.app, p = a.project, asset = p.comps.get(id);
    if (a.strokeActive || !asset?.asset || id === p.main) return false;
    if (this.editing) this.done(true);
    const target = p.comp;
    if (target.id === id || target.asset) return false;
    const l = compLayer(p.newId('L'), asset.name, asset, target);
    l.play = 'loop'; // one-frame assets hold; optional flipbooks cycle on the shot clock
    l.locked = true;
    a.editor.editProject('Place artwork asset', () => target.layers.push(l));
    a.setWorkspace('animate');
    a.setArrangeAssets(true, l.id);
    a.requestRender(); a.onFrameChange();
    return true;
  }

  /** Adopt an independent library snapshot; document Undo removes all its source comps together. */
  addPackage(bundle: ArtworkPackage): string | null {
    const a = this.app, p = a.project;
    if (a.strokeActive || a.playing || this.copying) return null;
    const file = validateProjectFile(bundle.file);
    if (!file.comps[file.main]?.asset) throw new Error('Choose a saved artwork source.');
    if (file.canvas.width !== p.width || file.canvas.height !== p.height)
      throw new Error(`This artwork uses a ${file.canvas.width}×${file.canvas.height} canvas. Open it as a project to keep its original size.`);
    // Validate bytes before allocating anything. Keep every hidden exposure and mask.
    for (const d of Object.values(file.drawings)) for (const path of [d.line, d.fill])
      if (path && !bundle.assets.get(path)?.length) throw new Error('An artwork image is missing.');
    for (const sound of Object.values(file.sounds ?? {}))
      if (!bundle.assets.get(sound.path)?.length) throw new Error('An artwork sound is missing.');
    const from = loadProjectFile(file).project, graph = artworkGraph(from, file.main, false);
    const ids = new Set<string>(), soundIds = new Set<string>();
    for (const c of graph) {
      for (const l of c.layers) if (l.kind === 'drawings') {
        l.exposures.forEach(e => ids.add(e.drawing)); if (l.mask) ids.add(l.mask);
      }
      for (const clip of c.audio ?? []) soundIds.add(clip.asset);
    }
    const used = [...p.usedDrawings()];
    if (p.comps.size + graph.length > MAX_COMPS || used.length + ids.size > MAX_DRAWINGS)
      throw new Error('This artwork would exceed the project size limit.');
    const vectors = used.reduce((n, id) => n + (p.drawings.get(id)?.vectors.length ?? 0), 0) +
      [...ids].reduce((n, id) => n + from.drawing(id).vectors.length, 0);
    if (vectors > MAX_VECTORS) throw new Error('This artwork would exceed the project vector stroke limit.');
    const usedSounds = new Set([...p.comps.values()].flatMap(c => (c.audio ?? []).map(s => s.asset)));
    if (usedSounds.size + soundIds.size > 64) throw new Error('This artwork would exceed the project audio limit.');
    const drawings = new Map<string, string>();
    for (const id of ids) {
      const d = from.drawing(id), f = file.drawings[id]!;
      // Incoming keys are not yet in this project's store. Null keeps residency from treating
      // decoded pixels as already saved; the first autosave stores/hash-addresses these bytes.
      const plane = (path: string | null) => path ? { key: null, bytes: bundle.assets.get(path)!.slice() } : null;
      drawings.set(id, p.cloneStoredDrawing(d, { rev: 0, line: plane(f.line), fill: plane(f.fill) }).id);
    }
    const placeholder = compLayer('library', '', from.comp, p.comp);
    const copy = copyArtworkGraph(p, graph, file.main, drawings, placeholder, true);
    const sounds = new Map<string, string>(); let nextSound = 1;
    for (const id of soundIds) {
      let fresh: string; do { fresh = `sound${nextSound++}`; } while (p.sounds.has(fresh));
      const sound = from.sounds.get(id)!;
      p.sounds.set(fresh, { ...sound, bytes: bundle.assets.get(sound.path)!.slice() }); sounds.set(id, fresh);
    }
    for (const c of copy.comps) {
      c.folder = null; c.asset = c.id === copy.root;
      for (const clip of c.audio ?? []) clip.asset = sounds.get(clip.asset)!;
    }
    a.editor.editProject('Add artwork from My Assets', () => { for (const c of copy.comps) p.comps.set(c.id, c); });
    const cmd = a.history.peekUndo(); if (cmd) cmd.drawings = [...drawings.values()].map(id => p.drawing(id));
    return copy.root;
  }

  /** Names are metadata edits; preserve links, pixels, timing and all instance-specific names. */
  renameSource(id: string, name: string): boolean {
    const a=this.app,p=a.project,source=p.comps.get(id),clean=name.trim().slice(0,80);
    if(a.strokeActive||a.playing||!source?.asset||id===p.main||!clean||clean===source.name) return false;
    const before=source.name;
    const set=(value:string)=>{
      if(a.project!==p) return;
      const live=p.comps.get(id);if(!live?.asset)return;
      live.name=value;a.editor.changed();
    };
    a.history.push({label:'Rename artwork source',do:()=>set(clean),undo:()=>set(before)},false);
    return true;
  }

  renamePlacement(id: string, name: string): boolean {
    const a=this.app,p=a.project,comp=p.comp,l=comp.layers.find(x=>x.id===id),clean=name.trim().slice(0,80);
    if(a.strokeActive||a.playing||!l||l.kind!=='comp'||!p.comps.get(l.comp)?.asset||!clean||clean===l.name)return false;
    const before=l.name;
    const set=(value:string)=>{
      if(a.project!==p) return;
      const live=p.comps.get(comp.id)?.layers.find(x=>x.id===id);if(!live)return;
      live.name=value;a.editor.changed();
    };
    a.history.push({label:'Rename asset placement',do:()=>set(clean),undo:()=>set(before)},false);
    return true;
  }

  /** Replacement must not introduce a comp cycle or a dangling nested source. */
  canReplaceSource(id: string, source: string): boolean {
    const p = this.app.project, target = p.comp, l = target.layers.find(x => x.id === id);
    if (!l || l.kind !== 'comp' || !p.comps.get(l.comp)?.asset || l.comp === source ||
      !p.comps.get(source)?.asset || source === p.main) return false;
    const seen = new Set<string>(), visiting = new Set<string>();
    const safe = (next: string): boolean => {
      if (next === target.id || visiting.has(next)) return false;
      if (seen.has(next)) return true;
      const c = p.comps.get(next); if (!c) return false;
      visiting.add(next);
      for (const layer of c.layers) if (layer.kind === 'comp' && !safe(layer.comp)) return false;
      visiting.delete(next); seen.add(next); return true;
    };
    return safe(source);
  }

  replaceSource(id: string, source: string): boolean {
    const a = this.app, p = a.project, comp = p.comp;
    if (a.strokeActive || a.playing || this.copying || !this.canReplaceSource(id, source)) return false;
    const l = comp.layers.find(x => x.id === id)!;
    if (l.kind !== 'comp') return false;
    const before = { comp: l.comp, overrides: structuredClone(l.overrides), out: l.out };
    // Pinned overrides name layers inside the old source; they do not transfer to other artwork.
    const end = layerEnd(l,p.comps,comp.fps);
    const after = { comp: source, overrides: {}, out: l.out === null && Number.isFinite(end) ? end : l.out };
    const set = (state: typeof before) => {
      if (a.project !== p) return;
      const live = p.comps.get(comp.id)?.layers.find(x => x.id === id);
      if (!live || live.kind !== 'comp') return;
      live.comp = state.comp; live.overrides = structuredClone(state.overrides); live.out = state.out;
      a.editor.changed();
    };
    a.history.push({ label: 'Replace artwork source', do: () => set(after), undo: () => set(before) }, false);
    return true;
  }

  async makeIndependent(id: string): Promise<string | null> {
    const a = this.app, p = a.project, comp = p.comp, l = comp.layers.find(x => x.id === id);
    if (this.copying || a.strokeActive || a.playing || !l || l.kind !== 'comp' || !p.comps.get(l.comp)?.asset) return null;
    this.copying = true;
    try {
      const graph = artworkGraph(p, l.comp), drawings = artworkDrawings(p, graph);
      const signature = JSON.stringify(graph), placement = JSON.stringify(l);
      const revisions = drawings.map(d => d.rev);
      const available = () => a.project === p && p.activeComp === comp.id && !a.strokeActive && !a.playing;
      const current = () => available() &&
        JSON.stringify(p.comps.get(comp.id)?.layers.find(x => x.id === id)) === placement &&
        JSON.stringify(graph.map(c => p.comps.get(c.id))) === signature && drawings.every((d, i) => p.drawings.get(d.id) === d && d.rev === revisions[i]);
      const snapshots: Parked[] = [];
      for (const d of drawings) {
        snapshots.push(await snapshotArtwork(d, a.residency));
        if (!available()) return null;
      }
      if (!current()) return null;
      artworkGraph(p, l.comp); // Recheck the comp limit after asynchronous encoding.
      artworkDrawings(p, graph);
      // Undo may have replaced comp objects with identical snapshots while encoding.
      const live = p.comp.layers.find(x => x.id === id);
      if (!live || live.kind !== 'comp') return null;
      // Pool drawings survive Undo, like other cel edits; immutable keys stay GC-protected.
      const ids = new Map(drawings.map((d, i) => [d.id, p.cloneStoredDrawing(d, snapshots[i]!).id]));
      const copy = copyArtworkGraph(p, graph, live.comp, ids, live);
      a.editor.editProject('Make artwork independent', () => {
        for (const c of copy.comps) p.comps.set(c.id, c);
        live.comp = copy.root; live.overrides = copy.overrides;
      });
      return copy.root;
    } finally { this.copying = false; }
  }

  private rememberPosition(): void {
    if (!this.editing) return;
    const a = this.app, p = a.project;
    let positions = this.positions.get(p);
    if (!positions) { positions = new Map(); this.positions.set(p, positions); }
    positions.set(p.activeComp, { layer: p.activeLayer, frame: a.frame });
  }

  private switchTo(id: string, layer: string | undefined, frame: number): void {
    const a = this.app, p = a.project;
    this.switching = true;
    try {
      if (a.playing) a.togglePlay();
      a.editor.gestureEnd(true); a.setFrame(a.frame);
      if (a.transforming) a.cancelTransform();
      if (a.adjusting) a.applyAdjust();
      a.clearSpatialSelection(); a.exitPointEdit();
      a.setMaskEditing(false);
      p.activeComp = id;
      p.activeLayer = p.comp.layers.some(l => l.id === layer && l.kind === 'drawings') ? layer! : p.comp.layers.find(l => l.kind === 'drawings')?.id ?? '';
      a.frame = Math.max(0, Math.min(frame, compLength(p.comp, p.comps) - 1)); a.selection = []; a.editor.reset();
      a.onCompChange(); a.onFrameChange(); a.requestRender();
    } finally { this.switching = false; }
  }
}
