/** Actual App, toolbars and QuickMenu settings. Preference writes stay on a test origin. */
import { App } from '../app';
import { Project } from '../core/project';
import { Bubbles } from './bubbles';
import { FlipMode } from './flipmode';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { QuickMenu } from './quickmenu';
import { FINGER_PAINT_KEY, STUDENT_PROFILES_KEY, STUDENT_UI_KEY, readStudentProfiles } from '../core/studentprefs';
import { QUICK_MENU_KEY } from '../core/quickmenu';
import { RANGE_GESTURE_KEY } from '../core/playback';
import { AUTO_PAINT_KEY } from '../fill/autopaint';
import { captureProject } from '../io/projectio';

const keys=[STUDENT_PROFILES_KEY,STUDENT_UI_KEY,FINGER_PAINT_KEY,QUICK_MENU_KEY,RANGE_GESTURE_KEY,AUTO_PAINT_KEY,'2dope.quickshape','2dope.ui.level','2dope.draw.view','2dope.animate.view','2dope.flip.mini'];
const saved=keys.map(k=>localStorage.getItem(k));keys.forEach(k=>localStorage.removeItem(k));
const stage=document.querySelector<HTMLElement>('#stage')!,canvas=document.querySelector<HTMLCanvasElement>('#canvas')!;
const app=new App(canvas,stage);app.loadProject(new Project(128,128));app.setWorkspace('draw');
const flip=new FlipMode(app,stage),painting=new PaintingWorkspaceUI(app,flip,stage,()=>refresh());
const bubbles=new Bubbles(app,stage,{brushLibrary(){},colorPanel(){},layers(){},fit:()=>app.refit()});
function refresh(){painting.update();flip.update();bubbles.update();}
app.onToolChange=refresh;app.onWorkspaceChange=refresh;app.onFrameChange=refresh;flip.onChange=refresh;
const quick=new QuickMenu(app,stage,canvas,{colour(){},brushes(){},layers(){},assets(){}});
let docs=0;app.onDocChanged=()=>docs++;
const dialog=()=>document.querySelector<HTMLDialogElement>('.app-settings');
const input=(label:string)=>dialog()!.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)!;
const select=(label:string)=>dialog()!.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
const click=(label:string)=>{const b=[...dialog()!.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===label);if(!b)throw new Error(`Missing ${label}`);b.click();};
const toggle=(label:string,on:boolean)=>{input(label).checked=on;};
const profiles=()=>readStudentProfiles(JSON.parse(localStorage.getItem(STUDENT_PROFILES_KEY)??'null'));
const choose=(id:string)=>{select('Student profile').value=id;select('Student profile').dispatchEvent(new Event('change',{bubbles:true}));};
const tool=(label:string)=>document.querySelector(`.bub-tools [aria-label="${label}"]`);
const option=(label:string)=>document.querySelector(`.bub-ctx [aria-label="${label}"]`);
const settle=()=>new Promise<void>(r=>setTimeout(r,100));
const live=()=>JSON.stringify({ui:app.studentUI,level:app.interfaceLevel,ink:app.inkPaint.enabled,range:app.rangeGestureEnabled,finger:app.fingerPaint,shape:app.quickShape});
function draftBackground(){toggle('Show Vector tool',false);toggle('Show Smudge tool',false);toggle('Show Line / Fill controls',false);toggle('Show Symmetry controls',false);toggle('Enable Ink & Paint',true);toggle('Enable QuickShape',false);toggle('Enable finger painting',true);toggle('Hold ruler to set playback range',true);select('QuickMenu action 3').value='colour';input('Profile name').value=' Background painting ';}
let passed=0,failed=0;function check(name:string,ok:boolean){const li=document.createElement('li');li.textContent=`${ok?'PASS':'FAIL'}: ${name}`;document.querySelector('#results')!.append(li);if(ok)passed++;else failed++;}
try{
  quick.settings.show();await settle();const original=live(),history=app.history.peekUndo();
  check('Settings starts at Student profiles with Brush protected and defaults visible',document.activeElement===select('Student profile')&&input('Show Brush tool').disabled&&input('Show Brush tool').checked&&!!tool('Vector'));
  const r=dialog()!.getBoundingClientRect();check('Settings frame and fixed actions fit this viewport',r.left>=0&&r.top>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1&&[...dialog()!.querySelectorAll<HTMLElement>('.app-settings-foot button')].every(b=>{const r=b.getBoundingClientRect();return r.height>=44&&r.bottom<=innerHeight+1;}));
  draftBackground();click('Save as new profile');
  check('Creating a profile stays a draft until Apply',profiles().profiles.length===0&&localStorage.getItem(STUDENT_PROFILES_KEY)===null&&live()===original&&docs===0);
  click('Cancel');quick.settings.show();
  check('Cancel discards tool, option and profile edits',profiles().profiles.length===0&&input('Show Vector tool').checked&&live()===original);
  draftBackground();click('Save as new profile');click('Apply settings');await settle();
  const first=profiles().profiles[0]!;
  check('Apply saves a named setup and marks it active',!dialog()&&first?.name==='Background painting'&&profiles().active===first.id&&first.setup.ui.tools.pen===false&&first.setup.quickMenu.actions[2]==='colour');
  check('The selected tools and contextual controls hide in Draw while Brush remains',!tool('Vector')&&!tool('Smudge')&&!!tool('Brush')&&!option('Line')&&!option('Symmetry'));
  check('Drawing options and the range gesture apply through existing App settings',app.inkPaint.enabled&&!app.quickShape&&app.fingerPaint&&app.rangeGestureEnabled);
  check('Profile and tool changes add no drawing History or document notifications',app.history.peekUndo()===history&&docs===0);
  check('Visibility and behavior preferences are stored for the next app session',JSON.parse(localStorage.getItem(STUDENT_UI_KEY)!).tools.pen===false&&localStorage.getItem(FINGER_PAINT_KEY)==='true'&&localStorage.getItem(RANGE_GESTURE_KEY)==='true');
  app.setTool('pen');await settle();check('A hidden tool remains visible while currently in use',!!tool('Vector'));app.setTool('brush');await settle();check('The hidden tool steps aside after switching away',!tool('Vector'));
  app.setWorkspace('animate');refresh();const more=tool('More tools') as HTMLButtonElement|null;more?.click();
  check('Animate More tools respects the same chosen tool list',!tool('Vector')&&!tool('Smudge')&&!!tool('Brush'));
  quick.settings.show();check('Reopening settings identifies the applied profile',select('Student profile').value===first.id);
  click('Show all tools and controls');toggle('Enable Ink & Paint',false);toggle('Enable QuickShape',true);toggle('Enable finger painting',false);toggle('Hold ruler to set playback range',false);select('Interface level').value='full';input('Profile name').value='Animation';click('Save as new profile');click('Apply settings');await settle();
  const second=profiles().profiles.find(p=>p.name==='Animation')!;
  check('A second profile stores independent options and interface level',profiles().profiles.length===2&&second.setup.ui.tools.pen&&second.setup.level==='full'&&!second.setup.rangeGesture&&document.body.classList.contains('ui-full'));
  quick.settings.show();choose(first.id);
  check('Choosing a profile previews its controls without applying it',!input('Show Vector tool').checked&&select('Interface level').value==='simple'&&app.interfaceLevel==='full'&&profiles().active===second.id);
  click('Cancel');check('Cancel keeps the previously applied profile and interface',profiles().active===second.id&&app.interfaceLevel==='full');
  quick.settings.show();choose(first.id);click('Apply settings');await settle();
  check('Switching profiles restores visibility, behavior and QuickMenu together',!app.studentUI.tools.pen&&app.interfaceLevel==='simple'&&app.rangeGestureEnabled&&app.inkPaint.enabled&&JSON.parse(localStorage.getItem(QUICK_MENU_KEY)!).actions[2]==='colour');
  quick.settings.show();input('Profile name').value='Class backgrounds';click('Rename profile');click('Cancel');
  check('Renaming a profile can be cancelled',profiles().profiles.find(p=>p.id===first.id)!.name==='Background painting');
  quick.settings.show();input('Profile name').value='Class backgrounds';click('Rename profile');click('Apply settings');
  check('Applying a rename preserves the profile identity and other profiles',profiles().profiles.find(p=>p.id===first.id)!.name==='Class backgrounds'&&profiles().profiles.some(p=>p.id===second.id));
  quick.settings.show();input('Profile name').value='animation';click('Save as new profile');
  check('Duplicate profile names are refused without adding a draft',select('Student profile').options.length===3&&dialog()!.querySelector('.student-profile-message')!.textContent!.includes('not already used'));
  input('Profile name').value=' ';click('Save as new profile');check('Blank names are refused',dialog()!.querySelector('.student-profile-message')!.textContent==='Enter a profile name.');click('Cancel');
  quick.settings.show();toggle('Show Eraser tool',false);click('Apply settings');
  check('Applying changes updates the selected named profile',profiles().profiles.find(p=>p.id===first.id)!.setup.ui.tools.eraser===false&&!app.studentUI.tools.eraser);
  quick.settings.show();click('Delete profile');click('Cancel');check('Deleting a profile stays reversible until Apply',profiles().profiles.some(p=>p.id===first.id));
  quick.settings.show();click('Delete profile');click('Apply settings');
  check('Applied deletion removes only the chosen profile and retains the current setup',profiles().profiles.length===1&&profiles().profiles[0]!.id===second.id&&profiles().active===null&&!app.studentUI.tools.eraser);
  quick.settings.show();click('Show all tools and controls');click('Apply settings');
  check('Show all tools recovers every visibility choice',Object.values(app.studentUI.tools).every(Boolean)&&Object.values(app.studentUI.controls).every(Boolean));
  app.setTool('pen');quick.settings.show();toggle('Show Vector tool',false);select('Interface level').value='clean';click('Apply settings');await settle();
  check('Focus level also retains a hidden active tool for recovery',app.interfaceLevel==='clean'&&!!tool('Vector'));app.setTool('brush');
  quick.settings.show();const beforeFailure=live(),storedBefore=localStorage.getItem(STUDENT_PROFILES_KEY);toggle('Show Eraser tool',false);
  const realSet=Storage.prototype.setItem;
  try{Storage.prototype.setItem=function(k,v){if(k===STUDENT_PROFILES_KEY)throw new DOMException('Full','QuotaExceededError');return realSet.call(this,k,v);};click('Apply settings');}
  finally{Storage.prototype.setItem=realSet;}
  check('Storage failure keeps the draft open and leaves live settings and saved profiles intact',!!dialog()&&live()===beforeFailure&&localStorage.getItem(STUDENT_PROFILES_KEY)===storedBefore&&dialog()!.querySelector('.student-profile-message')!.textContent!.includes('could not save'));click('Cancel');
  const p=app.project,c=app.project.comp,frame=app.frame;const snapshot=await captureProject(p).settle();
  check('Profiles remain outside portable project content and preserve the shared document',app.project===p&&app.project.comp===c&&app.frame===frame&&snapshot.file.schema===3&&!JSON.stringify(snapshot.file).includes('Class backgrounds')&&!('studentUI'in snapshot.file)&&docs===0);
}catch(e){check(e instanceof Error?e.stack??e.message:String(e),false);}
finally{quick.close(false);dialog()?.close();dialog()?.remove();keys.forEach((k,i)=>{if(saved[i]===null)localStorage.removeItem(k);else localStorage.setItem(k,saved[i]!);});}
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed · student profiles · ${innerWidth}×${innerHeight}`;
