/** Actual painting panels, source navigation and Clips; in-memory project, no library/autosave. */
import { App } from '../app';
import { Project } from '../core/project';
import { drawComp } from '../view/composite';
import { ArtworkAssetsUI } from './artworkassets';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { TracksSheet } from './sheet';
import { Strip } from './strip';
import { FlipMode } from './flipmode';
import { Bubbles } from './bubbles';
import { Sidebar } from './sidebar';
import { LayerCards } from './layercards';
import { ColorPanel } from './colorpanel';
import { BrushLibrary } from './brushlib';

const keys=['2dope.brushes.preferences','2dope.painting.layout.draw','2dope.painting.layout.animate','2dope.draw.view','2dope.animate.view','2dope.sheet.draw','2dope.sheet.animate','2dope.m3.--track-h','2dope.flip.mini','2dope.ui.level','2dope.m0.brush','2dope.m0.color','2dope.brushes.category','2dope.color.recent','2dope.color.mode','2dope.color.palette','2dope.color.palettes','2dope.color.paletteAt','2dope.color.harmony'];
const saved=keys.map(k=>localStorage.getItem(k));
localStorage.removeItem('2dope.brushes.preferences');
const inkPaintPref=localStorage.getItem('2dope.inkpaint');localStorage.removeItem('2dope.inkpaint');
for(const k of keys.filter(k=>k.startsWith('2dope.color.')))localStorage.removeItem(k);
const stage=document.querySelector<HTMLElement>('#stage')!,canvas=document.querySelector<HTMLCanvasElement>('#canvas')!,root=document.querySelector<HTMLElement>('#sidebar')!,stripRoot=document.querySelector<HTMLElement>('#strip')!;
const app=new App(canvas,stage);app.loadProject(new Project(128,128));app.project.comp.duration=24;app.setWorkspace('draw');app.setFrame(7);app.quickShape=true;
const sidebar=new Sidebar(app,root),cards=new LayerCards(app),flip=new FlipMode(app,stage),strip=new Strip(app,stripRoot);
const sheet=new TracksSheet(app,document.querySelector<HTMLElement>('.stage-col')!,stripRoot,()=>app.refit());
const painting=new PaintingWorkspaceUI(app,flip,stage,()=>refresh(),()=>{});
const assets=new ArtworkAssetsUI(app,document.querySelector<HTMLElement>('.painting-header')!);
const picker=document.createElement('input');picker.type='color';picker.hidden=true;document.body.append(picker);
const colours=new ColorPanel(app,picker),brushes=new BrushLibrary(app,()=>{});
const bubbles=new Bubbles(app,stage,{brushLibrary:a=>brushes.toggle(a),colorPanel:a=>colours.toggle(a),layers:a=>cards.toggle(a),layerCards:a=>cards.toggle(a),fit:()=>app.refit(),editShape(){},flip:{on:()=>flip.on,set:on=>flip.set(on)}});bubbles.setLevel('simple',false);
function refresh(){painting.update();sheet.update();strip.update();assets.update();bubbles.update();sidebar.update();cards.update();}
app.onFrameChange=()=>{flip.update();refresh();};app.onCompChange=refresh;app.onToolChange=refresh;app.onBrushChange=refresh;app.onShapeChange=refresh;app.editor.onChange=refresh;app.history.onChange=refresh;
app.onColorChange=()=>{colours.sync();refresh();};app.onWorkspaceChange=()=>{sheet.restore();flip.update();refresh();};flip.onChange=refresh;
const settle=()=>new Promise<void>(r=>setTimeout(r,140));
const button=(name:string,scope:ParentNode=document)=>{const b=[...scope.querySelectorAll<HTMLButtonElement>('button')].find(b=>!b.disabled&&[b.getAttribute('aria-label'),b.textContent?.trim(),b.title].includes(name));if(!b)throw new Error(`Missing ${name}`);return b;};
const click=(name:string,scope:ParentNode=document)=>button(name,scope).click();
const options=()=>document.querySelector('.bub-ctx')!;
function key(target:HTMLElement,k:string,shift=false){target.dispatchEvent(new KeyboardEvent('keydown',{key:k,code:k,bubbles:true,cancelable:true,shiftKey:shift}));}
function pointer(type:string,x:number,y:number){const r=canvas.getBoundingClientRect(),p=app.view.docToScreen(x,y);canvas.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'pen',pointerId:1,button:0,buttons:type==='pointerup'?0:1,pressure:1,clientX:r.left+p.x,clientY:r.top+p.y}));}
function stroke(y:number){pointer('pointerdown',24,y);pointer('pointermove',64,y);pointer('pointermove',104,y);pointer('pointerup',104,y);}
async function snap(y:number){pointer('pointerdown',24,y);pointer('pointermove',64,y);pointer('pointermove',104,y);await new Promise(r=>setTimeout(r,520));pointer('pointerup',104,y);await settle();}
const hit=(e:HTMLElement)=>{const r=e.getBoundingClientRect();return r.width>=43.9&&r.height>=43.9&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));};
let passed=0,failed=0;function check(name:string,ok:boolean){const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${name}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++;}
try{
  await settle();const shot=app.project.activeComp,shotLayer=app.project.activeLayer;
  click('Assets (0)');click('New asset',document.querySelector('dialog[open]')!);
  const input=document.querySelector<HTMLInputElement>('input[aria-label="New asset name"]')!;input.value='Workflow landscape';key(input,'Enter');await settle();
  const source=app.project.activeComp;
  check('The shelf creates a named Draw source with canvas focus',assets.assets.editing&&app.project.comp.name==='Workflow landscape'&&app.workspace==='draw'&&document.activeElement===canvas);
  click('Layers');click('New layer',document.querySelector('.layercards')!);click('Background',document.querySelector('.layercards')!);await settle();
  const background=app.project.activeLayer,drawing=app.drawing;app.project.comp.duration=16;app.setFrame(9);
  check('Layers creates and selects a still background within the source',app.project.layer.kind==='drawings'&&app.project.layer.still===true&&background!==app.project.comp.layers[0]!.id);
  click('Close layers');click('Brushes',options());const category=document.querySelector<HTMLButtonElement>('.bl-cats [data-cat="ink"]')!;category.click();click('Pixel Ink',document.querySelector('.brushlib')!);click('Done choosing brush');
  click('Colour');click('Palette colour #3a86ff');click('Done choosing colour');click('Fill',options());
  const size=root.querySelector<HTMLElement>('[data-slider="size"]')!,opacity=root.querySelector<HTMLElement>('[data-slider="opacity"]')!;size.focus();key(size,'Home');key(size,'ArrowUp',true);key(size,'ArrowUp');opacity.focus();key(opacity,'End');key(opacity,'ArrowDown',true);key(opacity,'Enter');
  check('Brush/colour/size/opacity controls keep the background and Fill selected',app.brush.name==='Pixel Ink'&&app.brush.size===12&&app.brush.opacity===.9&&app.color==='#3a86ff'&&app.project.activeLayer===background&&app.plane==='fill'&&app.tool==='brush'&&document.activeElement===canvas);
  app.fit();app.history.clear();stroke(80);await settle();const fillAlpha=drawing.fill!.getContext('2d')!.getImageData(64,80,1,1).data[3]!;
  check('The combined controls paint actual Fill pixels at the chosen opacity',fillAlpha>=220&&fillAlpha<=234&&drawing.line.getContext('2d')!.getImageData(64,80,1,1).data[3]===0);
  app.undo();await settle();check('One Undo removes that stroke while retaining settings and source position',!app.history.canUndo&&drawing.fill!.getContext('2d')!.getImageData(64,80,1,1).data[3]===0&&app.brush.opacity===.9&&app.frame===9);
  app.redo();await settle();click('Line',options());await snap(32);
  check('A held source stroke offers Edit shape on its current drawing and plane',app.shapeEditable&&!!app.lastShape&&!![...options().querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Edit shape'));
  const snapRevision=drawing.rev,snapCommand=app.history.peekUndo();
  click('Fill',options());check('Changing planes hides Edit shape without changing pixels or history',!app.shapeEditable&&drawing.rev===snapRevision&&app.history.peekUndo()===snapCommand&&![...options().querySelectorAll('button')].some(b=>b.getAttribute('aria-label')==='Edit shape'));
  click('Line',options());check('Returning to the same drawing and plane can resume its unchanged shape',app.shapeEditable);
  const revision=drawing.rev,command=app.history.peekUndo();click('Done editing asset');
  check('Done restores the shot, frame and workspace and hides source-only Edit shape',app.project.activeComp===shot&&app.project.activeLayer===shotLayer&&app.frame===7&&app.workspace==='draw'&&!app.shapeEditable&&![...options().querySelectorAll('button')].some(b=>b.getAttribute('aria-label')==='Edit shape'));
  app.swapShape('stroke');check('A stale shape action cannot rewrite source artwork from the shot',drawing.rev===revision&&app.history.peekUndo()===command);
  click('Assets (1)');click('Place Workflow landscape');await settle();
  const placement=app.placedAsset!;
  check('Place opens Animate with the linked placement and readable compact controls',app.workspace==='animate'&&placement.comp===source&&placement.locked&&hit(button('Edit source'))&&hit(button('Done arranging assets')));
  click('Edit source');await settle();
  check('Edit source resumes its background layer and frame with brush settings intact',app.project.activeComp===source&&app.project.activeLayer===background&&app.drawing===drawing&&app.frame===9&&app.brush.size===12&&app.brush.opacity===.9&&app.plane==='line'&&document.activeElement===canvas);
  check('Source header explains the linked placement and keeps Done reachable',document.querySelector('.asset-editing-status')!.textContent==='Updates 1 placement'&&hit(button('Done editing asset')));
  click('Done editing asset');await settle();check('Finishing the resumed source restores the Animate shot frame',app.workspace==='animate'&&app.project.activeComp===shot&&app.frame===7&&document.activeElement===canvas);
  click('Assets (1)');click('Place Workflow landscape');await settle();
  check('A second placement keeps both links to the same source',app.project.comp.layers.filter(l=>l.kind==='comp'&&l.comp===source).length===2);
  click('Edit source');await settle();check('Repeated source entry retains the background and shows two uses',app.project.activeLayer===background&&app.frame===9&&document.querySelector('.asset-editing-status')!.textContent==='Updates 2 placements');
  click('Fill',options());app.setColor('#ff5a8a');app.fit();stroke(104);await settle();click('Done editing asset');await settle();
  const preview=document.createElement('canvas');preview.width=preview.height=128;drawComp(preview.getContext('2d')!,app.project,app.project.comp,7,{export:true});const pixel=preview.getContext('2d')!.getImageData(64,104,1,1).data;
  check('Both linked placements show source repainting through the shot compositor',pixel[0]!>230&&pixel[1]!<130&&pixel[2]!>100&&pixel[3]!>245&&app.project.comp.layers.filter(l=>l.kind==='comp'&&l.comp===source).length===2);
  click('Done arranging assets');click('Clips');sheet.set('half',false);refresh();await settle();
  check('Clips exposes source-linked rails while retaining canvas drawing tools',!flip.on&&document.querySelectorAll('[aria-label="Move clip Workflow landscape"]').length===2&&app.workspace==='animate'&&canvas.getBoundingClientRect().height>100);
  const historyBeforeShelf=app.history.peekUndo();click('Go to Draw');await settle();click('Assets (1)');click('Edit Workflow landscape');await settle();
  check('Shelf Edit also resumes the last background/frame without adding document history',app.project.activeLayer===background&&app.frame===9&&app.workspace==='draw'&&app.history.peekUndo()===historyBeforeShelf);
  click('Done editing asset');check('The shelf return keeps the original Draw shot frame',app.workspace==='draw'&&app.project.activeComp===shot&&app.frame===7);
}catch(e){check(String(e),false);}
finally{colours.close();brushes.close();keys.forEach((k,i)=>{if(saved[i]===null)localStorage.removeItem(k);else localStorage.setItem(k,saved[i]!);});if(inkPaintPref===null)localStorage.removeItem('2dope.inkpaint');else localStorage.setItem('2dope.inkpaint',inkPaintPref);}
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
