import { describe, expect, it, vi } from 'vitest';
vi.mock('../brush/raster', () => ({ makeCanvas: (width: number, height: number) => ({ width, height }) }));
vi.mock('../io/codec', () => ({ isBlank: vi.fn(() => false), encodePng: vi.fn(async () => new Uint8Array([1, 2])) }));
import { artworkDrawings, artworkGraph, copyArtworkGraph, snapshotArtwork } from './assetcopy';
import { Project } from './project';
import { compLayer, drawingsLayer, newComp } from './comp';
import { encodePng } from '../io/codec';

describe('independent artwork storage', () => {
  it('copies parked bytes without decoding and gives stored copies independent metadata and ownership', async () => {
    const p=new Project(16,16),d=p.newDrawing();d.role='key';
    d.parked={rev:4,line:{key:'assets/ink.png',bytes:new Uint8Array([8,9])},fill:{key:'assets/fill.png',bytes:null}};
    const residency={pin:vi.fn(),unpin:vi.fn()};
    const snapshot=await snapshotArtwork(d,residency),copy=p.cloneStoredDrawing(d,snapshot);
    expect(residency.pin).not.toHaveBeenCalled();expect(copy.line.width).toBe(0);expect(copy.role).toBe('key');expect(copy.id).not.toBe(d.id);
    expect(copy.parked?.rev).toBe(copy.rev);expect(copy.parked?.fill?.key).toBe('assets/fill.png');
    copy.parked!.line!.bytes![0]=0;expect(d.parked.line!.bytes![0]).toBe(8);
    expect(copy.vectors).not.toBe(d.vectors);
  });
  it('reuses valid saved immutable planes and encodes dirty Line and Fill with balanced residency',async()=>{
    const p=new Project(16,16),d=p.newDrawing();d.saved={rev:0,line:'line',fill:'fill'};
    const residency={pin:vi.fn(async()=>{}),unpin:vi.fn()};
    expect(await snapshotArtwork(d,residency)).toEqual({rev:0,line:{key:'line',bytes:null},fill:{key:'fill',bytes:null}});
    expect(residency.pin).not.toHaveBeenCalled();d.rev++;d.fill=p.newDrawing().line;
    const result=await snapshotArtwork(d,residency);expect(result.line?.bytes).toEqual(new Uint8Array([1,2]));expect(result.fill?.bytes).toEqual(new Uint8Array([1,2]));
    expect(residency.pin).toHaveBeenCalledExactlyOnceWith(d);expect(residency.unpin).toHaveBeenCalledExactlyOnceWith(d);
  });
  it('releases pins on PNG and residency failures',async()=>{
    const d=new Project(16,16).newDrawing(),residency={pin:vi.fn(async()=>{}),unpin:vi.fn()};
    vi.mocked(encodePng).mockRejectedValueOnce(new Error('PNG failed'));
    await expect(snapshotArtwork(d,residency)).rejects.toThrow('PNG failed');expect(residency.unpin).toHaveBeenCalledOnce();
    residency.pin.mockRejectedValueOnce(new Error('load failed'));await expect(snapshotArtwork(d,residency)).rejects.toThrow('load failed');expect(residency.unpin).toHaveBeenCalledTimes(2);
  });
});

describe('independent artwork graph',()=>{
  it('remaps nested sources, masks, holds, parents, cel groups, pins, overrides and audio links',()=>{
    const p=new Project(16,16),root=newComp('c2','Sky',16,16,12),child=newComp('c3','Birds',16,16,12);
    const d=p.newDrawing(),mask=p.newDrawing();
    const ink=drawingsLayer('L2','Ink',[{drawing:d.id,length:2},{drawing:d.id,length:1}],16,16);ink.mask=mask.id;ink.cel='cel1';
    const fill=structuredClone(ink);fill.id='L3';fill.parent=ink.id;
    child.layers.push(ink,fill);child.pins.push({layer:ink.id,prop:'opacity'});
    const nested=compLayer('L4','Birds',child,root);nested.overrides={'L2:opacity':{value:0.5,keys:[]}};root.layers.push(nested,compLayer('L5','Birds again',child,root));root.pins.push({layer:nested.id,prop:'opacity'});
    child.audio=[{id:'a1',asset:'sound',name:'Chirp',start:0,trimIn:0,trimOut:1,gain:1,muted:false,link:{layer:ink.id,drawing:d.id,occurrence:0,offset:0}}];
    p.comps.set(root.id,root);p.comps.set(child.id,child);
    const placement=compLayer('L6','Sky',root,p.comp);placement.overrides={'L4:opacity':{value:0.8,keys:[]}};p.comp.layers.push(placement);
    const graph=artworkGraph(p,root.id);expect(graph).toHaveLength(2);expect(artworkDrawings(p,graph)).toEqual([d,mask]);
    const copy=copyArtworkGraph(p,graph,root.id,new Map([[d.id,'d100'],[mask.id,'d101']]),placement);
    const c=copy.comps.find(c=>c.id===copy.root)!,ch=copy.comps.find(c=>c.id!==copy.root)!,a=ch.layers[0]!,b=ch.layers[1]!;
    expect(c.layers.map(l=>l.kind==='comp'?l.comp:'')).toEqual([ch.id,ch.id]);expect(a.id).not.toBe(ink.id);expect(b.parent).toBe(a.id);
    if(a.kind!=='drawings'||b.kind!=='drawings')throw new Error('Wrong kind');
    expect(a.exposures.map(e=>e.drawing)).toEqual(['d100','d100']);expect(a.mask).toBe('d101');expect(a.cel).toBe(b.cel);expect(a.cel).not.toBe(ink.cel);
    expect(ch.pins[0]!.layer).toBe(a.id);expect(c.layers[0]!.kind==='comp'&&Object.keys(c.layers[0]!.overrides)).toEqual([`${a.id}:opacity`]);
    expect(Object.keys(copy.overrides)).toEqual([`${c.layers[0]!.id}:opacity`]);
    expect(ch.audio![0]!.link).toEqual({layer:a.id,drawing:'d100',occurrence:0,offset:0});expect(ch.audio![0]!.id).not.toBe('a1');
    expect(root.layers[0]!.id).toBe('L4');expect(child.layers[0]!.id).toBe('L2');expect(copy.comps.map(c=>c.name)).toEqual(['Birds copy','Sky copy']);
  });
  it('refuses cycles, missing artwork and comp limit overflow before allocating drawings',()=>{
    const p=new Project(16,16);p.comp.layers.push(compLayer('L2','Cycle',p.comp,p.comp));
    expect(()=>artworkGraph(p,p.main)).toThrow('circular');p.comp.layers.pop();
    expect(()=>artworkGraph(p,'missing')).toThrow('missing');
    p.layer.exposures[0]!.drawing='missing';expect(()=>artworkDrawings(p,[p.comp])).toThrow('missing');
    for(let i=2;i<=500;i++)p.comps.set(`c${i}`,newComp(`c${i}`,'Empty',16,16,12));
    expect(()=>artworkGraph(p,p.main)).toThrow('500');
  });
  it('keeps copies within the same drawing and vector limits as saved files',()=>{
    const p=new Project(16,16),d=p.drawing(p.exposures[0]!.drawing);
    d.vectors.length=25_001;expect(()=>artworkDrawings(p,[p.comp])).toThrow('vector stroke limit');d.vectors=[];
    p.layer.exposures=Array.from({length:20_000},(_,i)=>{const id=`d${i+1}`;if(!p.drawings.has(id))p.adopt(id,i+1,[],null,{rev:0,line:null,fill:null});return {drawing:id,length:1};});
    expect(()=>artworkDrawings(p,[p.comp])).toThrow('drawing limit');
  });
});
