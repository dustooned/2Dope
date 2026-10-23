import { Project } from '../core/project';
import { newComp, drawingsLayer } from '../core/comp';
import { Residency } from '../core/residency';
import { domPlaneOps } from './planeops';
import { assetPreviewKey, renderAssetPreview } from './assetpreview';
import { AssetClipPreviews } from '../ui/assetclippreviews';
import { captureProject, loadProjectFile } from '../io/projectio';
import { parseProjectFile, stringifyProjectFile } from '../io/schema';
import type { App } from '../app';

let passed=0,failed=0;
function check(name:string,ok:boolean){const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${name}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++;}
const tick=()=>new Promise<void>(r=>requestAnimationFrame(()=>r()));
async function until(test:()=>boolean){for(let i=0;i<180;i++){if(test())return;await tick();}throw new Error('Preview did not settle');}
const p=new Project(32,16),source=newComp('source','Sky',32,16,12);source.asset=true;p.comps.set(source.id,source);
const blue=p.newDrawing(),red=p.newDrawing();
blue.line.getContext('2d')!.fillStyle='#0000ff';blue.line.getContext('2d')!.fillRect(0,0,32,16);blue.rev++;
red.line.getContext('2d')!.fillStyle='#ff0000';red.line.getContext('2d')!.fillRect(16,0,16,16);red.rev++;
const top=drawingsLayer('top','Top',[{drawing:red.id,length:1}],32,16);top.transform.opacity.value=50;
source.layers.push(top,drawingsLayer('bottom','Bottom',[{drawing:blue.id,length:1}],32,16));
const track=document.querySelector<HTMLElement>('#track')!;
function node(id=source.id){const n=document.createElement('span');n.className='asset-clip-art';n.dataset.assetSource=id;track.append(n);return n;}
function url(n:HTMLElement){return n.style.backgroundImage.slice(5,-2);}
async function pixel(data:string,x:number){const image=new Image();image.src=data;await image.decode();const c=document.createElement('canvas');c.width=192;c.height=108;const g=c.getContext('2d')!;g.drawImage(image,0,0);return [...g.getImageData(x,54,1,1).data];}
const near=(got:number[],expected:number[])=>got.every((v,i)=>Math.abs(v-expected[i]!)<=2);
try {
  const saved=await captureProject(p,{mode:'archive'}).settle();
  const loaded=loadProjectFile(parseProjectFile(stringifyProjectFile(saved.file))).project;
  let pinCalls=0,unpins=0,activePins=0;
  const residency=new Residency({...domPlaneOps,defer:()=>{}},async k=>saved.assets.get(k)??null);residency.setProject(loaded);
  const pin=residency.pin.bind(residency),unpin=residency.unpin.bind(residency);
  residency.pin=async d=>{pinCalls++;activePins++;await pin(d);};
  residency.unpin=d=>{unpins++;activePins--;unpin(d);};
  check('Reloaded preview sources begin parked',!!loaded.drawing(blue.id).parked&&!!loaded.drawing(red.id).parked);
  const before=JSON.stringify([...loaded.comps.values()]),revs=[...loaded.drawings.values()].map(d=>d.rev).join(',');
  const preview=await renderAssetPreview(loaded,source.id,residency,()=>true);
  check('Resident preview matches layered source pixels and opacity',!!preview&&near(await pixel(preview,40),[0,0,255,255])&&near(await pixel(preview,150),[128,0,127,255]));
  check('Only frame-needed drawings are pinned and all pins are released',pinCalls===2&&unpins===2&&activePins===0);
  check('Preview generation leaves document settings and pixel revisions unchanged',JSON.stringify([...loaded.comps.values()])===before&&[...loaded.drawings.values()].map(d=>d.rev).join(',')===revs);
  const cancelled=await renderAssetPreview(loaded,source.id,residency,()=>activePins===0);
  check('Cancellation after pinning returns no preview and releases its pins',cancelled===null&&activePins===0&&pinCalls===unpins);
  let failedPinReleased=false,threw=false;
  try {await renderAssetPreview(loaded,source.id,{pin:async()=>{throw new Error('Unreadable plane');},unpin:()=>{failedPinReleased=true;}} as unknown as Residency,()=>true);}catch{threw=true;}
  check('A decoding error also releases the acquired pin',threw&&failedPinReleased);
  const app={project:loaded,residency,workspace:'animate',flipbookView:false,strokeActive:false,playing:false} as unknown as App;
  const cache=new AssetClipPreviews(app,track),a=node(),b=node();const calls=pinCalls;
  cache.refresh();await until(()=>a.dataset.preview==='ready'&&b.dataset.preview==='ready');
  check('Two visible placements share one source render',pinCalls===calls+2&&a.style.backgroundImage===b.style.backgroundImage);
  const oldURL=a.style.backgroundImage;a.remove();b.remove();const replacement=node();cache.refresh();
  check('Rebuilt rail nodes reuse the cached preview immediately',replacement.dataset.preview==='ready'&&replacement.style.backgroundImage===oldURL&&pinCalls===calls+2);
  loaded.drawing(blue.id).line.getContext('2d')!.fillStyle='#00ff00';loaded.drawing(blue.id).line.getContext('2d')!.fillRect(0,0,32,16);loaded.drawing(blue.id).rev++;
  cache.refresh();await until(()=>replacement.dataset.preview==='ready');
  check('Source pixel edits invalidate the preview without replacing its rail node',replacement.isConnected&&replacement.style.backgroundImage!==oldURL&&near(await pixel(url(replacement),40),[0,255,0,255]));
  const other=newComp('other','Other',32,16,12);other.asset=true;other.background='#ffff00';loaded.comps.set(other.id,other);
  const hidden=node(other.id);hidden.style.marginTop='900px';const hiddenCalls=pinCalls;cache.refresh();
  for(let i=0;i<8;i++)await tick();
  check('Offscreen uncached clips stay deferred',hidden.dataset.preview!=='ready'&&pinCalls===hiddenCalls);
  Object.assign(app,{strokeActive:true});hidden.style.marginTop='0px';cache.refresh();for(let i=0;i<8;i++)await tick();
  check('Uncached previews wait while a drawing or clip gesture is active',hidden.dataset.preview!=='ready');
  Object.assign(app,{strokeActive:false});cache.refresh();await until(()=>hidden.dataset.preview==='ready');
  check('Deferred preview resumes after input is idle',near(await pixel(url(hidden),40),[255,255,0,255]));
  const another=loadProjectFile(parseProjectFile(stringifyProjectFile(saved.file))).project;
  // Same ids and revisions, different pixels: cache must be scoped by Project identity.
  const nextResidency=new Residency({...domPlaneOps,defer:()=>{}},async k=>saved.assets.get(k)??null);nextResidency.setProject(another);
  for(const d of another.drawings.values())await nextResidency.ensure(d);
  const green=another.drawing(blue.id);green.line.getContext('2d')!.fillStyle='#00ffff';green.line.getContext('2d')!.fillRect(0,0,32,16);
  check('New project intentionally reuses the same preview signature',assetPreviewKey(another,source.id)===assetPreviewKey(loadProjectFile(parseProjectFile(stringifyProjectFile(saved.file))).project,source.id));
  hidden.remove();app.project=another;Object.assign(app,{residency:nextResidency});cache.refresh();await until(()=>replacement.dataset.preview==='ready');
  check('Switching project clears cached artwork even with reused ids/revisions',near(await pixel(url(replacement),40),[0,255,255,255]));
  const unchanged=replacement.style.backgroundImage;app.workspace='draw';another.comps.get(source.id)!.background='#ff00ff';cache.refresh();
  for(let i=0;i<4;i++)await tick();check('Leaving Clips stops pending preview work',replacement.style.backgroundImage===unchanged);
}catch(e){check(String(e),false);}
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed`;
