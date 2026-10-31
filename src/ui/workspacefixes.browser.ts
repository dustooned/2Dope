import { App } from '../app';
import { Project } from '../core/project';
import { newComp, drawingsLayer, compLayer } from '../core/comp';
import { MotionPanel } from './motion';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { FlipMode } from './flipmode';
import { ArtworkAssetsUI } from './artworkassets';
import { LayerCards } from './layercards';
const canvas=document.querySelector<HTMLCanvasElement>('#canvas')!,stage=document.querySelector<HTMLElement>('#stage')!;
const app=new App(canvas,stage),motion=new MotionPanel(app,document.querySelector('#motion')!),flip=new FlipMode(app,stage),painting=new PaintingWorkspaceUI(app,flip,stage,()=>refresh()),assets=new ArtworkAssetsUI(app,document.querySelector('.painting-header')!),cards=new LayerCards(app);
app.editAssetSource=(id,layer)=>assets.openSource(id,layer);
function refresh(){for(const ws of ['draw','animate','motion','time','board'])document.body.classList.toggle(`ws-${ws}`,app.workspace===ws);painting.update();assets.update();cards.update();motion.update();}
app.onWorkspaceChange=refresh;app.onFrameChange=refresh;app.onCompChanged=refresh;app.editor.onChange=refresh;app.history.onChange=refresh;
const settle=(ms=100)=>new Promise<void>(r=>setTimeout(r,ms));
let passed=0,failed=0;function check(name:string,ok:boolean){const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${name}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++;}
function colorAt(x:number,y:number):number[]{const p=app.view.docToScreen(x,y),ratio=canvas.width/stage.clientWidth;return [...canvas.getContext('2d')!.getImageData(Math.round(p.x*ratio),Math.round(p.y*ratio),1,1).data];}
const names=()=>[...document.querySelectorAll('.layercards .lc-card .lc-name')].map(n=>n.textContent);
function pickCard(id:string){const card=document.querySelector<HTMLElement>(`.layercards .lc-card[data-id="${id}"]`)!;card.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:75,clientX:20,clientY:300,pointerType:'mouse',buttons:1}));card.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:75,clientX:20,clientY:300,pointerType:'mouse',buttons:0}));}
try {
  const p=new Project(128,128),shot=p.comp;shot.layers=[];shot.fps=12;shot.duration=48;
  const red=p.newDrawing(),blue=p.newDrawing();for(const [d,color] of [[red,'#ff0000'],[blue,'#0000ff']] as const){const g=d.line.getContext('2d')!;g.fillStyle=color;g.fillRect(0,0,128,128);}
  const source=newComp('source','Two colors',128,128,12);source.layers=[drawingsLayer('colors','Colors',[{drawing:red.id,length:1},{drawing:blue.id,length:1}],128,128)];
  p.comps.set(source.id,source);const placed=compLayer('placed','Two colors',source,shot);placed.play='loop';shot.layers=[placed];
  app.loadProject(p);app.setWorkspace('motion');app.setFrame(1);app.fit();await settle(200);
  check('Motion initially draws the nested source at its original FPS',colorAt(64,64)[2]!>240);
  const rulerBefore=document.querySelector('#motion .ruler')!,viewBefore=JSON.stringify(app.view),field=document.querySelector<HTMLSelectElement>('#motion select[aria-label="Frames per second"]')!;
  let notices=0;app.onDocChanged=()=>notices++;field.value='24';field.dispatchEvent(new Event('change',{bubbles:true}));await settle(200);
  check('Changing FPS redraws the nested image immediately without moving the pointer',app.project.comp.fps===24 && colorAt(64,64)[0]!>240);
  check('FPS updates the Motion ruler without moving the drawing view',document.querySelector('#motion .ruler')!==rulerBefore && JSON.stringify(app.view)===viewBefore);
  check('FPS is one undoable document change',app.history.peekUndo()?.label==='Change frame rate' && notices>0);
  app.undo();await settle();check('Undo restores FPS and the matching canvas image',app.project.comp.fps===12 && colorAt(64,64)[2]!>240);
  app.redo();await settle();check('Redo restores FPS, image and autosave notification',app.project.comp.fps===24 && colorAt(64,64)[0]!>240 && notices>=3);
  app.setFps(Number.NaN);check('Invalid FPS does not poison the comp clock',app.project.comp.fps===24);
  app.setWorkspace('draw');app.view.zoom=2.1;app.view.rot=13;app.view.pan(31,-19);app.preserveCanvasView();const paintView=JSON.stringify(app.view);
  app.setWorkspace('motion');app.view.pan(-300,120);app.setFps(30);app.setWorkspace('draw');await settle();
  check('Returning from Motion restores Draw pan, zoom and rotation',JSON.stringify(app.view)===paintView);
  const replacement=new Project(128,128);app.setWorkspace('motion');app.loadProject(replacement);app.setWorkspace('draw');await settle();check('Opening another project cannot restore the previous project’s viewport',JSON.stringify(app.view)!==paintView);

  const shotId=app.project.main,asset=assets.assets.create('Painted Tree')!;app.addDrawLayer();await settle();
  const sourceComp=app.project.comp,sourceNames=sourceComp.layers.filter(l=>l.kind==='drawings').map(l=>l.name);assets.assets.done();assets.assets.place(asset);await settle();
  const placement=app.placedAsset!;app.setWorkspace('draw');cards.toggle(canvas);await settle();
  check('Draw Layers enters the selected artwork source, leaving shot tracks intact',app.project.activeComp===asset && app.project.main===shotId && assets.assets.editing);
  check('The panel lists the artwork’s own layers with a named paint-stack heading',names().join()===sourceNames.join() && !!document.querySelector('[aria-label="Layers of Painted Tree"]') && document.querySelector('.lc-title')?.textContent?.includes('Painted Tree')===true);
  check('Source Layers does not offer shot tracks or an animation-track add menu',!document.querySelector('.layercards .lc-back') && !document.querySelector('.lc-add'));
  const trackCount=app.project.comps.get(shotId)!.layers.length,oldLayers=sourceComp.layers.length,original=app.project.layer;
  document.querySelector<HTMLButtonElement>('.layercards [aria-label="New layer"]')!.click();await settle();
  const added=app.project.layer;
  check('Plus adds and selects a paint layer inside the artwork, not a shot track',sourceComp.layers.length===oldLayers+1 && app.project.comps.get(shotId)!.layers.length===trackCount && /^Paint \d+/.test(added.name));
  check('New paint layers preserve their source’s frame/playback settings',added.play===original.play && added.speed===original.speed && added.exposures.length===original.exposures.length);
  check('Adding a paint layer is one Undo step',app.history.peekUndo()?.label==='Add art layer');
  app.undo();await settle();check('Undo removes only the added paint layer',app.project.comp.layers.length===oldLayers && app.project.comps.get(shotId)!.layers.length===trackCount);app.redo();await settle();
  const target=app.project.comp.layers.find(l=>l.id===original.id)!;pickCard(target.id);await settle();check('Picking a paint card changes the drawing target within the same source',app.project.activeComp===asset && app.project.activeLayer===target.id);
  const eye=document.querySelector<HTMLButtonElement>(`.lc-card[data-id="${target.id}"] .lc-eye`)!;eye.click();await settle();check('The paint layer eye changes source visibility, preserving the placement',!app.project.comp.layers.find(l=>l.id===target.id)!.visible && app.project.comps.get(shotId)!.layers.some(l=>l.id===placement.id));app.undo();await settle();
  cards.close();assets.assets.done();await settle();check('Done restores the shot and preserves its placement and tracks',app.project.activeComp===shotId && !assets.assets.editing && app.project.comp.layers.some(l=>l.id===placement.id));
  app.setWorkspace('animate');cards.toggle(canvas);await settle();check('Animate still shows shot tracks',names().includes(placement.name));cards.close();
  app.editor.select(null);app.setWorkspace('draw');app.project.activeLayer=app.project.comp.layers.find(l=>l.kind==='drawings')!.id;cards.toggle(canvas);await settle();
  check('Standalone Draw shows only the current drawing’s paint stack',!names().includes(placement.name) && names().length===app.celLayers.length);
  cards.close();assets.assets.open(asset);app.editor.deleteLayers(app.project.comp.layers.map(l=>l.id));app.addPaintLayer();await settle();
  check('An artwork with every layer deleted can create its first paint layer again',app.project.layer.name==='Paint layer' && app.project.layer.play==='loop' && app.project.comp.layers.length===1);
  app.project.comp.name='LongArtworkName'.repeat(6).slice(0,80);cards.toggle(canvas);await settle();
  const panel=document.querySelector<HTMLElement>('.layercards')!,close=panel.querySelector<HTMLElement>('[aria-label="Close layers"]')!.getBoundingClientRect();
  check('Long artwork names keep source Layers and its Close button within the viewport',panel.scrollWidth<=panel.clientWidth+1 && close.right<=innerWidth && panel.querySelector<HTMLElement>('.lc-title')!.title===app.project.comp.name);
}catch(error){check(error instanceof Error?`${error.message}\n${error.stack}`:String(error),false);}
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed`;
