import { App } from '../app';
import { PRESETS, cloneBrush } from '../core/brush';
import { Project, paintDrawing } from '../core/project';
import type { StrokeRecord } from '../core/stroke';
import { prepareVectorStroke, transformVector } from '../core/vectorstyle';
import { clipStrokeToMask } from '../core/vectorclip';
import { drawVectorStroke, drawLegacyVectorStroke } from './vector';
import { captureProject, loadProjectFile } from '../io/projectio';
import { parseProjectFile, stringifyProjectFile } from '../io/schema';
import { saveBrushes, loadBrushes } from '../io/brushstore';
import { exportSequence } from '../io/exportseq';
import { readZip } from '../io/zip';
import { buildPanel } from '../ui/panel';
import { BrushLibrary } from '../ui/brushlib';
import { readBrush } from '../core/brushlib';
import { newComp, compLayer } from '../core/comp';
import { drawComp, releaseScratch } from '../view/composite';
import { captureArtwork, packArtwork, readArtwork } from '../io/artwork';

let passed=0,failed=0;
function check(name:string,ok:boolean){const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${name}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++;}
const settle=(ms=70)=>new Promise<void>(r=>setTimeout(r,ms));
const make=(w=320,h=240)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const pixels=(c:HTMLCanvasElement)=>c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;
const render=(rec:StrokeRecord)=>{const c=make();drawVectorStroke(c.getContext('2d')!,rec);return c;};
const same=(a:HTMLCanvasElement,b:HTMLCanvasElement)=>a.toDataURL()===b.toDataURL();
const maxAlpha=(c:HTMLCanvasElement)=>{let max=0;const a=pixels(c);for(let i=3;i<a.length;i+=4)max=Math.max(max,a[i]!);return max;};
const rec=(name:string):StrokeRecord=>{
  const brush=cloneBrush(PRESETS.find(b=>b.name===name)!);brush.size=20;brush.opacity=1;brush.flow=1;brush.sizeDyn.control='off';brush.opacityDyn.control='off';brush.flowDyn.control='off';brush.taperStart=brush.taperEnd=0;
  return prepareVectorStroke({id:'demo',tool:'pen',brush,color:'#193b53',seed:42,points:[{x:35,y:140,pressure:.3,tiltX:0,tiltY:0,t:0},{x:110,y:65,pressure:1,tiltX:20,tiltY:0,t:70},{x:210,y:165,pressure:.7,tiltX:0,tiltY:0,t:160},{x:285,y:90,pressure:.2,tiltX:0,tiltY:0,t:240}]});
};
const styles=['Vector Ink','Vector Chisel','Vector Dry Ink','Vector Dots'];
let specimens=styles.map(rec);
const cards=specimens.map((_,i)=>{
  const fig=document.createElement('figure'),label=document.createElement('figcaption');label.textContent=styles[i]!;
  const c=make();fig.append(label,c);document.querySelector('#specimens')!.append(fig);
  let drag=false;
  c.onpointerdown=e=>{drag=true;c.setPointerCapture(e.pointerId);};c.onpointerup=()=>{drag=false;};
  c.onpointermove=e=>{if(!drag)return;const box=c.getBoundingClientRect();move((e.clientX-box.left)*320/box.width,(e.clientY-box.top)*240/box.height);};
  return c;
});
function redraw(){cards.forEach((c,i)=>{c.getContext('2d')!.clearRect(0,0,c.width,c.height);drawVectorStroke(c.getContext('2d')!,specimens[i]!);});}
function move(x:number,y:number){specimens=specimens.map(v=>({...v,points:v.points.map((p,i)=>i===1?{...p,x,y}:p)}));redraw();}
document.querySelector<HTMLButtonElement>('#move')!.onclick=()=>move(140,110);redraw();

const canvas=document.querySelector<HTMLCanvasElement>('#canvas')!, stage=document.querySelector<HTMLElement>('#stage')!;
const app=new App(canvas,stage);app.loadProject(new Project(320,240));app.setWorkspace('draw');app.quickShape=false;app.fit();
buildPanel(app,document.querySelector('#studio')!);
const library=new BrushLibrary(app,()=>{});
function pointer(type:string,x:number,y:number,id=19){const box=canvas.getBoundingClientRect(),p=app.view.docToScreen(x,y);canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'pen',button:0,buttons:type==='pointerup'?0:1,pressure:.7,clientX:box.left+p.x,clientY:box.top+p.y}));}
try {
  await settle();
  check('The existing Brush Library opens with vector presets available',!library.open && PRESETS.filter(b=>b.vectorStyle).length===6);
  check('All four styles visibly differ on the identical path',new Set(cards.map(c=>c.toDataURL())).size===4 && cards.every(c=>maxAlpha(c)>200));
  const old={...rec('Vector Ink'),style:undefined};
  for(const opacity of [.25,.5]){
    old.brush={...old.brush,opacity};const before=make();drawLegacyVectorStroke(before.getContext('2d')!,old);check(`Legacy dispatch preserves the exact original pixels at ${opacity*100}% opacity`,same(before,render(old)));
    for(const name of styles){const r=rec(name);r.brush.opacity=opacity;r.points=[...r.points,...r.points.slice().reverse()];r.points=r.points.map((p,i)=>({...p,u:i*50}));const image=render(r);check(`${name}: whole-stroke opacity caps overlap at ${opacity*100}%`,maxAlpha(image)<=Math.ceil(opacity*255));}
  }
  for(const r of specimens)check(`${r.brush.name}: replay is deterministic`,same(render(r),render(structuredClone(r))));
  const controlled={...rec('Vector Chisel'),controls:{anchors:[0,3],modes:{},handles:{}}};
  const cold=render(controlled),warm=render(controlled),edited=render({...controlled,points:controlled.points.map((p,i)=>i===1?{...p,y:p.y+35}:p)});
  check('Bounded coverage caching preserves exact pixels and invalidates on a point edit',same(cold,warm) && !same(cold,edited));
  const affine=[-.8,.15,.3,.6,270,20] as const,affineExpected=make();affineExpected.getContext('2d')!.transform(...affine);drawVectorStroke(affineExpected.getContext('2d')!,controlled);
  const affineActual=render(transformVector(controlled,affine)),aa=pixels(affineActual),ae=pixels(affineExpected);let alphaError=0,alphaMass=0;
  for(let i=3;i<aa.length;i+=4){alphaError+=Math.abs(aa[i]!-ae[i]!);alphaMass+=ae[i]!;}
  check('Nonuniform affine stretch/reflection preserves the chisel footprint within antialiasing tolerance',alphaError/alphaMass<.1);
  const mask=new Uint8Array(320*240);for(let y=0;y<240;y++)for(let x=0;x<160;x++)mask[y*320+x]=1;
  const wide=rec('Vector Dots');wide.brush.size=80;wide.brush.scatter=1;
  const clipped=clipStrokeToMask(wide,mask,320,240)[0]!, image=render(clipped),data=pixels(image);
  let leaks=false;for(let y=0;y<240;y++)for(let x=160;x<320;x++)leaks ||= data[(y*320+x)*4+3]!>0;
  check('Wide scattered visible tips cannot leak past the saved selection edge',!leaks && maxAlpha(image)>0);
  const flipped=transformVector(clipped,[-1,0,0,1,320,0]), flipImage=render(flipped), flipPixels=pixels(flipImage);leaks=false;
  for(let y=0;y<240;y++)for(let x=0;x<160;x++)leaks ||= flipPixels[(y*320+x)*4+3]!>0;
  check('Reflection carries the exact selection restriction with the mark',!leaks && maxAlpha(flipImage)>0);

  app.setBrush(cloneBrush(PRESETS.find(b=>b.name==='Vector Chisel')!),false);app.brush.smoothing=0;
  // Make the production input surface visible while exercising pointer dispatch.
  document.querySelector('details')!.open=true;app.fit();await settle();
  pointer('pointerdown',30,120);for(let x=40;x<=280;x+=12)pointer('pointermove',x,120+Math.sin(x/35)*30);pointer('pointerup',280,145);await settle();
  check('Selecting a vector preset uses the real pen pipeline and persists authored anchors',app.tool==='pen' && app.drawing.vectors.length===1 && !!app.drawing.vectors[0]!.style && !!app.drawing.vectors[0]!.controls);
  app.enterPointEdit();const selected=app.pointStroke!, anchor=selected.controls!.anchors[1] ?? 0;
  app.togglePoint(anchor);const mode=app.pointStroke!.controls!.modes[anchor];const controls=JSON.stringify(app.pointStroke!.controls);app.undo();await settle();app.redo();await settle();
  check('Authored point modes and handles survive undo/redo',JSON.stringify(app.pointStroke!.controls)===controls && !!mode);
  const start=app.pointStroke!.points[anchor]!, phase=start.u;
  pointer('pointerdown',start.x,start.y,23);for(let i=1;i<=5;i++){pointer('pointermove',start.x+i*3,start.y+i*2,23);await settle(16);}pointer('pointerup',start.x+15,start.y+10,23);await settle();
  check('A production point drag edits a styled line as one step without rewriting material channels',app.history.peekUndo()?.label==='Move point' && app.pointStroke!.points[anchor]!.x!==start.x && app.pointStroke!.points[anchor]!.u===phase);
  const authored=await captureProject(app.project,{mode:'archive'}).settle();
  const authoredCopy=loadProjectFile(parseProjectFile(stringifyProjectFile(authored.file))).project;
  check('Authored controls survive an actual project capture, validation and model reload',JSON.stringify([...authoredCopy.drawings.values()][0]!.vectors[0]!.controls)===JSON.stringify(app.pointStroke!.controls));
  let changed=0;app.onDocChanged=()=>changed++;
  app.setBrush(cloneBrush(PRESETS.find(b=>b.name==='Vector Dry Ink')!),false);app.enterPointEdit();
  const original=app.drawing.vectors, history=app.history.peekUndo();
  app.openVectorRestyle();await settle();const dialog=document.querySelector<HTMLDialogElement>('[data-vector-restyle]')!;
  check('Restyle opens a visible preview without modifying drawing data',!!dialog?.open && app.drawing.vectors===original && maxAlpha(dialog.querySelector('canvas')!)>0);
  [...dialog.querySelectorAll('button')].find(b=>b.textContent==='Cancel')!.click();await settle();
  check('Cancelling restyle leaves both artwork and History unchanged',app.drawing.vectors===original && app.history.peekUndo()===history);
  const weight=app.pointStroke!.brush.size;app.openVectorRestyle();await settle();
  check('Restyle fits the viewport with reachable touch actions',(()=>{const d=document.querySelector<HTMLDialogElement>('[data-vector-restyle]')!,r=d.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && [...d.querySelectorAll('button')].every(b=>b.getBoundingClientRect().height>=44);})());
  [...document.querySelectorAll<HTMLButtonElement>('[data-vector-restyle] button')].find(b=>b.textContent==='Apply brush')!.click();await settle();
  check('Apply commits one brush change while keeping line weight',app.history.peekUndo()?.label==='Apply vector brush' && app.pointStroke!.style?.tip==='dry' && app.pointStroke!.brush.size===weight);
  app.undo();await settle();const undo=app.drawing.vectors===original;app.redo();await settle();
  check('Restyle undo/redo restore the exact records and notify autosave',undo && app.pointStroke!.style?.tip==='dry' && changed>=3);
  const stale=app.previewVectorRestyle()!;app.frame++;check('A preview cannot commit after navigating to another frame',!stale.apply());app.frame--;

  app.exitPointEdit();app.setTool('fill');app.setFillMode('lasso');app.setSelectShape('rect');
  pointer('pointerdown',1,1,29);pointer('pointermove',160,239,29);pointer('pointerup',160,239,29);await settle();
  app.setBrush(cloneBrush(PRESETS.find(b=>b.name==='Vector Dots')!),false);app.enterPointEdit();
  const restrictedBefore=app.drawing.vectors, beforeImage=make();paintDrawing(beforeImage.getContext('2d')!,app.drawing);
  const partial=app.previewVectorRestyle()!;check('A point-selected line can preview through an active canvas stencil',!!app.spatialSelection && !!partial && !app.transformParams);
  partial.apply();await settle();const afterImage=make();paintDrawing(afterImage.getContext('2d')!,app.drawing);
  const beforePixels=pixels(beforeImage),afterPixels=pixels(afterImage);let outsideSame=true;
  for(let y=0;y<240;y++)for(let x=161;x<320;x++)for(let c=0;c<4;c++)outsideSame &&= beforePixels[(y*320+x)*4+c]===afterPixels[(y*320+x)*4+c];
  check('Restyle through a selection preserves the original appearance outside it',outsideSame && !same(beforeImage,afterImage));
  app.undo();await settle();check('One Undo restores both sides of a restricted restyle',app.drawing.vectors===restrictedBefore);
  app.exitPointEdit();app.setBrush(cloneBrush(PRESETS.find(b=>b.name==='Vector Ink')!),false);app.brush.smoothing=0;
  const countBefore=app.drawing.vectors.length,undoBefore=app.history.peekUndo();
  pointer('pointerdown',220,35,31);pointer('pointermove',280,35,31);pointer('pointerup',280,35,31);await settle();
  check('A styled stroke with no visible paint in the selection adds no record or Undo step',app.drawing.vectors.length===countBefore && app.history.peekUndo()===undoBefore);
  app.brush.size=24;pointer('pointerdown',165,45,32);pointer('pointerup',165,45,32);await settle();
  check('A tip overhang inside the selection is retained even when its centre is outside',app.drawing.vectors.length===countBefore+1 && app.drawing.vectors.at(-1)!.points[0]!.x>160);
  app.clearSpatialSelection();
  const originalWeight=app.drawing.vectors[0]!.brush.size,scaled=transformVector(app.drawing.vectors[0]!,[1.5,0,0,1.5,-40,-40]);
  app.drawing.vectors=[scaled];app.enterPointEdit(scaled.id);const scaledDraft=app.previewVectorRestyle()!;scaledDraft.apply();
  check('Keep weight during restyle accounts for a full-mark uniform transform',app.pointStroke!.brush.size===originalWeight*1.5);app.exitPointEdit();

  const source=make(40,40),sg=source.getContext('2d')!;sg.fillStyle='#fff';sg.beginPath();sg.moveTo(20,0);sg.lineTo(40,40);sg.lineTo(0,40);sg.fill();
  const blob=await new Promise<Blob>(r=>source.toBlob(b=>r(b!))),file=new File([blob],'triangle.png',{type:'image/png'}),transfer=new DataTransfer();transfer.items.add(file);
  const input=document.querySelector<HTMLInputElement>('#studio input[type=file]')!;input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));await settle(200);
  check('Brush Studio imports a synchronous portable custom alpha tip',app.brush.vectorStyle?.tip==='custom' && app.brush.vectorStyle.mask?.alpha.length===32768);
  const custom={...cloneBrush(app.brush),name:'Fixture custom triangle'};await saveBrushes([custom]);const stored=await loadBrushes();
  check('The existing brush store retains the custom vector definition',readBrush(stored?.[0])?.vectorStyle?.mask?.alpha===custom.vectorStyle?.mask?.alpha);
  const portable=prepareVectorStroke({...rec('Vector Dots'),style:undefined,brush:custom});app.exitPointEdit();app.drawing.vectors=[portable];
  const drawing=app.drawing, direct=render(portable), composite=make();paintDrawing(composite.getContext('2d')!,drawing);
  check('Shared drawing compositor agrees pixel-for-pixel with custom-tip rendering',same(direct,composite));
  const capture=await captureProject(app.project,{mode:'archive'}).settle(),text=stringifyProjectFile(capture.file);
  check('Custom strokes write schema 4 with no external brush-library reference',capture.file.schema===4 && !text.includes('Fixture custom triangle/') && !!parseProjectFile(text).drawings[drawing.id]!.vectors[0]!.style?.mask);
  await saveBrushes([]);app.setBrush(cloneBrush(PRESETS[0]!),false);
  const fresh=new Promise<{url?:string;noLibrary?:boolean;error?:string}>((resolve,reject)=>{
    const child=document.createElement('iframe');child.src=`http://localhost:${location.port}/tests/_vectorportable.html`;
    const timeout=setTimeout(()=>reject(new Error('Fresh-origin portable fixture timed out')),8000);
    const receive=(e:MessageEvent)=>{if(e.source===child.contentWindow && e.data?.kind==='portable-vector-result'){removeEventListener('message',receive);clearTimeout(timeout);child.remove();resolve(e.data);}};
    addEventListener('message',receive);child.onload=()=>child.contentWindow!.postMessage({kind:'portable-vector',text},`http://localhost:${location.port}`);document.body.append(child);
  });
  const result=await fresh;check('A fresh storage origin with different pen calibration renders the portable tip identically',result.noLibrary===true && result.url===direct.toDataURL());
  const loaded=loadProjectFile(parseProjectFile(text));app.loadProject(loaded.project);await settle(200);
  check('Save/reopen retains custom-tip pixels and authored controls',same(render(app.drawing.vectors[0]!),direct));
  const archive=await exportSequence(app.project,{name:'vector',scale:1,background:'transparent',passes:['combined','lines'],range:'all',start:1},[],()=>{});
  const entries=await readZip(archive.zip),png=[...entries.entries()].find(([name])=>name.includes('/lines/') && name.endsWith('.png'))?.[1];
  if(png){const bitmap=await createImageBitmap(new Blob([png as BlobPart],{type:'image/png'})),out=make();out.getContext('2d')!.drawImage(bitmap,0,0);bitmap.close();check('PNG sequence Lines export exactly matches the drawing renderer',same(out,direct));}else check('PNG export contains a Lines image',false);

  const nested=new Project(320,240),sourceComp=nested.comp,sourceDrawing=nested.drawing(nested.exposures[0]!.drawing);
  sourceComp.asset=true;sourceDrawing.vectors=[portable];const maskDrawing=nested.newDrawing();
  const maskVector=rec('Vector Chisel');maskVector.brush.size=32;maskVector.brush.opacity=.5;maskDrawing.vectors=[maskVector];nested.layer.mask=maskDrawing.id;
  const expected=render(portable);expected.getContext('2d')!.globalCompositeOperation='destination-out';drawVectorStroke(expected.getContext('2d')!,maskVector);
  const parent=newComp('c2','Nested review',320,240,12);parent.layers=[compLayer('nested','Custom vector source',sourceComp,parent)];nested.comps.set(parent.id,parent);nested.main=nested.activeComp=parent.id;
  const nestedImage=make();drawComp(nestedImage.getContext('2d')!,nested,parent,0,{export:true});
  check('Nested artwork and styled vector layer masks share the expected coverage and opacity',same(nestedImage,expected));
  const artwork=await readArtwork(packArtwork(await captureArtwork(nested,sourceComp.id,async()=>null)));
  check('My Assets packages custom tips and styled vector masks in a standalone archive',artwork.file.schema===4 && Object.values(artwork.file.drawings).flatMap(d=>d.vectors).some(v=>v.style?.tip==='custom'));
  const nestedExport=await exportSequence(nested,{name:'nested',scale:1,background:'transparent',passes:['combined'],range:'all',start:1},[],()=>{});
  const nestedPng=[...(await readZip(nestedExport.zip)).entries()].find(([name])=>name.endsWith('.png'))?.[1];
  if(nestedPng){const bm=await createImageBitmap(new Blob([nestedPng as BlobPart],{type:'image/png'})),out=make();out.getContext('2d')!.drawImage(bm,0,0);bm.close();check('Nested PNG export agrees with playback including the styled vector mask',same(out,nestedImage));}
  releaseScratch();

  const long=rec('Vector Dry Ink');long.points=Array.from({length:1500},(_,i)=>({...long.points[i%4]!,x:20+i*.18,y:120+Math.sin(i/18)*55,u:i*2.5}));
  const times:number[]=[];for(let i=0;i<8;i++){const start=performance.now();render(long);times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);const li=document.createElement('li');li.textContent=`Measured: 1,500-point dry stroke, eight renders, median ${times[4]!.toFixed(1)} ms, worst ${times.at(-1)!.toFixed(1)} ms (desktop Chromium).`;document.querySelector('#results')!.append(li);
  const playback=new Project(320,240),cel=playback.drawing(playback.exposures[0]!.drawing);playback.exposures[0]!.length=8;cel.vectors=Array.from({length:12},(_,i)=>({...long,id:`dense${i}`,controls:{anchors:[0,1499],modes:{},handles:{}},color:i%2?'#193b53':'#9b3344'}));
  const playbackTimes:number[]=[];for(let i=0;i<8;i++){const c=make(),t=performance.now();drawComp(c.getContext('2d')!,playback,playback.comp,i,{export:true});playbackTimes.push(performance.now()-t);}playbackTimes.sort((a,b)=>a-b);
  const perf=document.createElement('li');perf.textContent=`Measured: twelve dense material lines in playback, median ${playbackTimes[4]!.toFixed(1)} ms/frame, worst ${playbackTimes.at(-1)!.toFixed(1)} ms/frame. This is a measurement, not a hardware latency claim.`;document.querySelector('#results')!.append(perf);releaseScratch();
  document.querySelector('details')!.open=false;
}catch(e){check(e instanceof Error?`${e.message}\n${e.stack}`:String(e),false);}
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed`;
