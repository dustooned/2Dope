import { describe, expect, it, vi } from 'vitest';
vi.mock('../brush/raster', () => ({ makeCanvas: (width: number, height: number) => ({ width, height }) }));
import { ArtworkAssets } from './assets';
import { Project } from './project';
import { History } from './history';
import { CompEditor } from '../compedit';
import { compLength, compLayer, newComp, layerEnd } from './comp';
import { staticProp, LINEAR } from './anim';
import { referencedKeys } from './residency';
import { compFile, compsFromFile, parseProjectFile, stringifyProjectFile, SCHEMA, FORMAT } from '../io/schema';
import type { App, Workspace } from '../app';

function rig() {
  const p = new Project(64, 64);
  const a = {
    project: p, history: new History(), frame: 0, workspace: 'animate' as Workspace,
    strokeActive: false, playing: false, transforming: false, adjusting: null, selection: [] as number[],
    requestRender() {}, onCompChange() {}, onFrameChange() {}, onDocChanged: vi.fn(),
    setWorkspace(w: Workspace) { this.workspace = w; }, setFrame(f: number) { this.frame = f; },
    setArrangeAssets() {},
    clearSpatialSelection() {}, exitPointEdit() {}, setMaskEditing() {},
    partnerDrawing() { throw new Error('Not a cel edit'); },
    get compEnd() { return compLength(p.comp, p.comps); },
  };
  const app = a as unknown as App;
  Object.assign(app, { editor: new CompEditor(app) });
  return { a, p, assets: new ArtworkAssets(app) };
}
describe('local artwork assets', () => {
  it('replaces only one source with one Undo, keeping timing, transform keys, parent, name and sibling links',()=>{
    const {a,p,assets}=rig(),sky=assets.create('Sky')!;assets.place(sky);assets.place(sky);
    const target=p.comp.layers.find(l=>l.kind==='comp')!;
    target.name='Foreground';target.start=2;target.in=3;target.out=16;target.parent='L1';target.speed=0.5;
    target.transform.position={value:[10,20],keys:[{f:4,v:[30,40],in:LINEAR,out:LINEAR}]};
    target.overrides={'L2:opacity':staticProp(30)};const before=structuredClone(target),sibling=structuredClone(p.comp.layers.filter(l=>l.kind==='comp')[1]!);
    const clouds=assets.create('Clouds')!;assets.done();const drawingCount=p.drawings.size;const graph=JSON.stringify([...p.comps.values()].filter(c=>c.asset));
    a.history.clear();a.onDocChanged.mockClear();expect(assets.replaceSource(target.id,clouds)).toBe(true);
    expect(p.comp.layers.find(l=>l.id===target.id)).toEqual({...before,comp:clouds,overrides:{}});expect(p.comp.layers.find(l=>l.id===sibling.id)).toEqual(sibling);
    expect(p.drawings.size).toBe(drawingCount);expect(JSON.stringify([...p.comps.values()].filter(c=>c.asset))).toBe(graph);expect(a.history.peekUndo()!.drawings).toBeUndefined();
    a.history.undo();expect(p.comp.layers.find(l=>l.id===target.id)).toEqual(before);expect(a.history.canUndo).toBe(false);
    a.history.redo();expect(p.comp.layers.find(l=>l.id===target.id)).toEqual({...before,comp:clouds,overrides:{}});expect(a.onDocChanged).toHaveBeenCalledTimes(3);
  });
  it('keeps shot-following loops automatic and materializes a one-shot natural end before replacing duration/fps',()=>{
    const {p,assets}=rig(),sky=assets.create('Sky')!;p.comp.duration=12;assets.place(sky);p.comp.duration=null;
    const target=p.comp.layers.find(l=>l.kind==='comp')!,clouds=assets.create('Clouds')!;p.comp.duration=60;p.comp.fps=24;assets.done();
    target.play='once';target.start=2;target.in=2;expect(layerEnd(target,p.comps,p.comp.fps)).toBe(14);
    expect(assets.replaceSource(target.id,clouds)).toBe(true);expect(target.out).toBe(14);expect(compLength(p.comp,p.comps)).toBe(14);
    target.play='loop';target.out=null;expect(assets.replaceSource(target.id,sky)).toBe(true);expect(target.out).toBeNull();
  });
  it('undoes replacement by id after comp snapshots have replaced objects',()=>{
    const {a,p,assets}=rig(),sky=assets.create('Sky')!;assets.place(sky);const id=p.comp.layers.find(l=>l.kind==='comp')!.id;
    const clouds=assets.create('Clouds')!;assets.done();a.history.clear();assets.replaceSource(id,clouds);
    (a as unknown as App).editor.editProject('Other metadata',()=>{p.comp.background='#ffffff';});a.history.undo();a.history.undo();
    const restored=p.comp.layers.find(l=>l.id===id)!;expect(restored.kind==='comp'&&restored.comp).toBe(sky);
    a.history.redo();const redone=p.comp.layers.find(l=>l.id===id)!;expect(redone.kind==='comp'&&redone.comp).toBe(clouds);
  });
  it('refuses same, missing, nonasset, cyclic, dangling, busy, playing and copying targets without history',()=>{
    const {a,p,assets}=rig(),sky=assets.create('Sky')!;assets.place(sky);const target=p.comp.layers.find(l=>l.kind==='comp')!;
    const clouds=assets.create('Clouds')!;assets.done();a.history.clear();
    for(const id of [sky,p.main,'missing'])expect(assets.replaceSource(target.id,id)).toBe(false);
    const ordinary=newComp('c99','Ordinary',64,64,12);p.comps.set(ordinary.id,ordinary);expect(assets.replaceSource(target.id,ordinary.id)).toBe(false);
    expect(assets.replaceSource(p.layer.id,clouds)).toBe(false);
    const c=p.comps.get(clouds)!;c.layers.push(compLayer('L99','Shot',p.comp,c));expect(assets.replaceSource(target.id,clouds)).toBe(false);
    c.layers.pop();c.layers.push(compLayer('L99','Cycle',c,c));expect(assets.replaceSource(target.id,clouds)).toBe(false);
    const dangling=c.layers.at(-1)!;if(dangling.kind==='comp')dangling.comp='missing';expect(assets.replaceSource(target.id,clouds)).toBe(false);c.layers.pop();
    a.strokeActive=true;expect(assets.replaceSource(target.id,clouds)).toBe(false);a.strokeActive=false;a.playing=true;expect(assets.replaceSource(target.id,clouds)).toBe(false);
    a.playing=false;assets.copying=true;expect(assets.replaceSource(target.id,clouds)).toBe(false);expect(a.history.canUndo).toBe(false);
  });
  it('makes one placement independent and restores its source link in one Undo, with metadata-only Redo',async()=>{
    const {a,p,assets}=rig(),id=assets.create('Sky')!;assets.place(id);assets.place(id);
    const original=p.comps.get(id)!,d=p.drawings.get(original.layers[0]!.kind==='drawings'?original.layers[0]!.exposures[0]!.drawing:'')!;
    d.parked={rev:0,line:{key:'ink',bytes:null},fill:{key:'fill',bytes:null}};d.role='breakdown';
    const placements=p.comp.layers.filter(l=>l.kind==='comp'),first=placements[0]!,sibling=structuredClone(placements[1]!);
    first.name='Foreground';first.start=3;first.in=4;first.out=12;const before=structuredClone(first);
    a.history.clear();a.onDocChanged.mockClear();const independent=await assets.makeIndependent(first.id);
    expect(independent).not.toBeNull();expect(p.comp.layers.find(l=>l.id===first.id)).toEqual({...before,comp:independent});
    expect(p.comp.layers.find(l=>l.id===sibling.id)).toEqual(sibling);expect(p.comps.get(independent!)!.name).toBe('Sky copy');
    const copied=p.comps.get(independent!)!.layers[0]!;if(copied.kind!=='drawings')throw new Error('Expected drawing');
    const copy=p.drawings.get(copied.exposures[0]!.drawing)!;expect(copy.id).not.toBe(d.id);expect(copy.role).toBe('breakdown');
    expect(a.history.peekUndo()!.drawings).toBeUndefined();a.history.undo();expect(p.comp.layers.find(l=>l.id===first.id)).toEqual(before);expect(p.comps.has(independent!)).toBe(false);expect(a.history.canUndo).toBe(false);
    copy.parked!.line!.key='undo-only-ink';expect(referencedKeys(p).has('undo-only-ink')).toBe(true);copy.parked!.line!.key='ink';
    a.history.redo();expect(p.comps.has(independent!)).toBe(true);expect(p.drawings.get(copy.id)).toBe(copy);expect(a.onDocChanged).toHaveBeenCalledTimes(3);
    copy.parked!.line!.key='new ink';expect(d.parked.line!.key).toBe('ink');
  });
  it('abandons a stale copy without pool, history or comp changes',async()=>{
    const {a,p,assets}=rig(),id=assets.create('Sky')!;assets.place(id);const placement=p.comp.layers.find(l=>l.kind==='comp')!;
    const sourceLayer=p.comps.get(id)!.layers[0]!;
    const d=p.drawings.get(sourceLayer.kind==='drawings'?sourceLayer.exposures[0]!.drawing:'')!;d.parked={rev:0,line:null,fill:null};
    const count=p.drawings.size,comps=p.comps.size;a.history.clear();const pending=assets.makeIndependent(placement.id);
    d.rev++;expect(await pending).toBeNull();expect(p.drawings.size).toBe(count);expect(p.comps.size).toBe(comps);expect(a.history.canUndo).toBe(false);expect(assets.copying).toBe(false);
  });
  it.each(['project','source'] as const)('rejects %s navigation or metadata changes during preparation',async(change)=>{
    const {a,p,assets}=rig(),id=assets.create('Sky')!;assets.place(id);
    const l=p.comps.get(id)!.layers[0]!;if(l.kind!=='drawings')throw new Error('Expected drawing');
    p.drawing(l.exposures[0]!.drawing).parked={rev:0,line:null,fill:null};a.history.clear();
    const count=p.drawings.size,comps=p.comps.size,pending=assets.makeIndependent(p.comp.layers.find(l=>l.kind==='comp')!.id);
    if(change==='project')a.project=new Project(64,64);else p.comps.get(id)!.name='Edited during copy';
    expect(await pending).toBeNull();expect(a.history.canUndo).toBe(false);expect(p.drawings.size).toBe(count);expect(p.comps.size).toBe(comps);expect(assets.copying).toBe(false);
  });
  it('resolves the live placement after an identical comp snapshot is restored during preparation',async()=>{
    const {a,p,assets}=rig(),id=assets.create('Sky')!;assets.place(id);
    const l=p.comps.get(id)!.layers[0]!;if(l.kind!=='drawings')throw new Error('Expected drawing');
    p.drawing(l.exposures[0]!.drawing).parked={rev:0,line:null,fill:null};
    const target=p.comp.layers.find(l=>l.kind==='comp')!.id,pending=assets.makeIndependent(target);
    (a as unknown as App).editor.editProject('Other metadata',()=>{p.comp.background='#ffffff';});a.history.undo();a.history.clear();
    const copied=await pending,live=p.comp.layers.find(l=>l.id===target)!;
    expect(copied).not.toBeNull();expect(live.kind==='comp'&&live.comp).toBe(copied);a.history.undo();
    const restored=p.comp.layers.find(l=>l.id===target)!;expect(restored.kind==='comp'&&restored.comp).toBe(id);
  });
  it('renames only one locked placement with one Undo step, preserving source, siblings and timing',()=>{
    const {a,p,assets}=rig(),id=assets.create('Sky')!;assets.place(id);assets.place(id);
    const [first,second]=p.comp.layers.filter(l=>l.kind==='comp');
    const source=JSON.stringify(p.comps.get(id)),before=structuredClone(first!);a.history.clear();a.onDocChanged.mockClear();
    expect(assets.renamePlacement(first!.id,'  Foreground trees  ')).toBe(true);
    expect(p.comp.layers.find(l=>l.id===first!.id)).toEqual({...before,name:'Foreground trees'});
    expect(p.comp.layers.find(l=>l.id===second!.id)!.name).toBe('Sky');expect(JSON.stringify(p.comps.get(id))).toBe(source);
    expect(a.onDocChanged).toHaveBeenCalledTimes(1);a.history.undo();expect(p.comp.layers.find(l=>l.id===first!.id)!.name).toBe('Sky');expect(a.history.canUndo).toBe(false);
    a.history.redo();expect(p.comp.layers.find(l=>l.id===first!.id)!.name).toBe('Foreground trees');
  });
  it('renames shared sources without rewriting placement names and undoes by id after snapshots are restored',()=>{
    const {a,p,assets}=rig(),id=assets.create('Sky')!;assets.place(id);assets.place(id);
    const placements=p.comp.layers.filter(l=>l.kind==='comp'),names=placements.map(l=>l.name),links=placements.map(l=>l.kind==='comp'?l.comp:'');
    a.history.clear();expect(assets.renameSource(id,'Sunset')).toBe(true);
    const app=a as unknown as App;app.editor.editProject('Other edit',()=>{p.comp.background='#fff';});a.history.undo();
    expect(p.comps.get(id)!.name).toBe('Sunset');a.history.undo();expect(p.comps.get(id)!.name).toBe('Sky');expect(a.history.canUndo).toBe(false);
    a.history.redo();expect(p.comps.get(id)!.name).toBe('Sunset');
    expect(p.comp.layers.filter(l=>l.kind==='comp').map(l=>l.name)).toEqual(names);
    expect(p.comp.layers.filter(l=>l.kind==='comp').map(l=>l.comp)).toEqual(links);
  });
  it('ignores empty, unchanged, busy, playing and invalid rename targets without adding history',()=>{
    const {a,p,assets}=rig(),id=assets.create('Sky')!;assets.place(id);const l=p.comp.layers.find(l=>l.kind==='comp')!;a.history.clear();
    for(const name of ['','   ',' Sky ']) {expect(assets.renameSource(id,name)).toBe(false);expect(assets.renamePlacement(l.id,name)).toBe(false);}
    expect(assets.renameSource(p.main,'No')).toBe(false);expect(assets.renamePlacement(p.layer.id,'No')).toBe(false);
    a.strokeActive=true;expect(assets.renameSource(id,'No')).toBe(false);expect(assets.renamePlacement(l.id,'No')).toBe(false);
    a.strokeActive=false;a.playing=true;expect(assets.renameSource(id,'No')).toBe(false);expect(assets.renamePlacement(l.id,'No')).toBe(false);
    expect(a.history.canUndo).toBe(false);
  });
  it('renames an unplaced source in Draw without leaving it and bounds stored name length',()=>{
    const {a,p,assets}=rig(),id=assets.create('Sky')!;a.history.clear();const active=p.activeComp;
    expect(assets.renameSource(id,'x'.repeat(100))).toBe(true);expect(p.comps.get(id)!.name).toHaveLength(80);
    expect(p.activeComp).toBe(active);expect(a.workspace).toBe('draw');a.history.undo();expect(p.comps.get(id)!.name).toBe('Sky');
    assets.done();expect(p.activeComp).toBe(p.main);
  });
  it('creates a layered source without placing it, returns to the same shot/frame', () => {
    const { a, p, assets } = rig();
    p.exposures[0]!.length = 12; a.frame = 5;
    const id = assets.create('Sky')!;
    expect(a.workspace).toBe('draw'); expect(p.comp.asset).toBe(true);
    expect(p.comp.layers[0]!.kind).toBe('drawings'); expect(p.main).toBe('c1');
    expect(p.comps.get('c1')!.layers).toHaveLength(1);
    assets.done();
    expect([p.activeComp, a.frame, a.workspace]).toEqual(['c1', 5, 'animate']);
    expect(assets.list().map(c => c.id)).toEqual([id]);
  });
  it('two placements share source edits and do not extend the shot arbitrarily', () => {
    const { p, assets } = rig(); const id = assets.create('Sky')!;
    assets.place(id); assets.place(id);
    const links = p.comp.layers.filter(l => l.kind === 'comp');
    expect(links.map(l => l.comp)).toEqual([id, id]);
    expect(links.every(l => l.locked)).toBe(true);
    expect(compLength(p.comp, p.comps)).toBe(1);
    assets.open(id); p.comp.layers[0]!.name = 'Clouds'; assets.done(true);
    expect(p.comps.get(links[0]!.comp)!.layers[0]!.name).toBe('Clouds');
  });
  it('undo/redo removes and restores placements and new sources without flattening', () => {
    const { a, p, assets } = rig(); const id = assets.create('Sky')!;
    assets.done(); assets.place(id);
    a.history.undo(); expect(p.comp.layers.some(l => l.kind === 'comp')).toBe(false);
    a.history.redo(); expect(p.comp.layers.some(l => l.kind === 'comp')).toBe(true);
    a.history.undo(); a.history.undo(); expect(p.comps.has(id)).toBe(false);
    a.history.redo(); expect(p.comps.get(id)?.asset).toBe(true);
    expect(a.onDocChanged).toHaveBeenCalled();
  });
  it('blocks asset actions during a stroke and refuses invalid sources', () => {
    const { a, p, assets } = rig(); a.strokeActive = true;
    expect(assets.create('Sky')).toBeNull(); expect(assets.open('c1')).toBe(false);
    expect(assets.place('c1')).toBe(false); expect(p.comps.size).toBe(1);
  });
  it('can exit a source before it has any placement', () => {
    const { a, p, assets } = rig(); assets.create('Unplaced');
    const app = a as unknown as App;
    expect(() => app.editor.exit()).not.toThrow();
    expect(p.activeComp).toBe(p.main);
  });
  it('returns through frame callbacks without reentering source navigation', () => {
    const { a, p, assets } = rig(); assets.create('Sky');
    a.workspace = 'animate';
    a.onFrameChange = () => { if (assets.editing) assets.done(true); };
    // App.setFrame also notifies listeners before the active comp changes.
    a.setFrame = function (f: number) { this.frame = f; this.onFrameChange(); };
    expect(() => assets.done(true)).not.toThrow();
    expect(p.activeComp).toBe(p.main);
    expect(a.workspace).toBe('animate');
  });
  it('round-trips source markers, drawing references and linked placements through validated JSON', () => {
    const { p, assets } = rig(); const id = assets.create('Sky')!;
    assets.place(id); assets.place(id);
    assets.renameSource(id,'Sunset');const placement=p.comp.layers.find(l=>l.kind==='comp')!;assets.renamePlacement(placement.id,'Trees');
    const file = parseProjectFile(stringifyProjectFile({
      format: FORMAT, schema: SCHEMA, savedBy: 'test', name: 'Assets', created: new Date().toISOString(), modified: new Date().toISOString(),
      canvas: { width: 64, height: 64 }, fps: 12, main: p.main, folders: {},
      comps: Object.fromEntries([...p.comps].map(([id, c]) => [id, compFile(c)])),
      drawings: Object.fromEntries([...p.drawings].map(([id, d]) => [id, { num: d.num, line: null, fill: null, vectors: [] }])),
    }));
    const comps = compsFromFile(file);
    expect(comps.get(id)?.asset).toBe(true);
    expect(comps.get(id)?.name).toBe('Sunset');expect(comps.get('c1')!.layers.find(l=>l.id===placement.id)?.name).toBe('Trees');
    expect(comps.get('c1')!.layers.filter(l => l.kind === 'comp').map(l => l.comp)).toEqual([id, id]);
    expect(comps.get(id)!.layers).toEqual(p.comps.get(id)!.layers);
  });
});
