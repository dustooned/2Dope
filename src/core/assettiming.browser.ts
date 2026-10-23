/** Real App + numeric controls + composite boundaries; no project library is opened. */
import { App } from '../app';
import { Project } from './project';
import { ArtworkAssetsUI } from '../ui/artworkassets';
import { drawComp } from '../view/composite';
import { captureProject, loadProjectFile } from '../io/projectio';
import { parseProjectFile, stringifyProjectFile } from '../io/schema';

const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLElement>('#stage')!);
app.loadProject(new Project(128,128)); app.setWorkspace('animate'); app.flipbook = false;
const ui = new ArtworkAssetsUI(app,document.querySelector<HTMLElement>('#header')!);
const source = ui.assets.create('Prop')!;
const art = app.drawing; art.line.getContext('2d')!.fillStyle = '#164cba';
art.line.getContext('2d')!.fillRect(30,40,50,30); art.rev++;
ui.assets.place(source); ui.update(); app.history.clear();
app.editor.onChange = () => ui.update(); app.onFrameChange = () => ui.update();
const instance = () => app.placedAsset!;
let passed = 0, failed = 0;
function check(name: string, ok: boolean) {
  const row = document.createElement('li'); row.textContent = `${ok?'PASS':'FAIL'}: ${name}`;
  document.querySelector('#results')!.append(row); if(ok) passed++; else failed++;
}
function enter(field: string, value: string, event = 'change') {
  if(document.querySelector<HTMLElement>('.asset-placement-details')!.hidden)document.querySelector<HTMLButtonElement>('button[aria-label="Asset options"]')!.click();
  if(document.querySelector<HTMLElement>('.asset-timing')!.hidden)document.querySelector<HTMLButtonElement>('button[aria-label="Asset timing"]')!.click();
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="Asset ${field}"]`)!;
  input.focus(); input.value = value;
  input.dispatchEvent(event === 'Enter' ? new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}) : new Event(event,{bubbles:true}));
}
try {
  enter('hold frames','12');
  check('A number-field change commits a finite hold and one history entry', instance().out === 12 && app.compEnd === 12 && app.history.canUndo);
  enter('start frame','5','Enter');
  check('Enter moves the interval, preserving its length', instance().in === 4 && instance().out === 16 && app.compEnd === 16);
  check('An off-frame instance remains selected with timing controls enabled', app.frame === 0 && !!app.placedAsset && !document.querySelector<HTMLInputElement>('input[aria-label="Asset end frame"]')!.disabled);
  const alpha = (frame: number) => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d')!; drawComp(g,app.project,app.project.comp,frame,{export:true});
    return g.getImageData(50,55,1,1).data[3]!;
  };
  check('Composite hides before Start and shows the first included frame', alpha(3) <= 1 && alpha(4) >= 254);
  check('Composite includes End and hides the following frame', alpha(15) >= 254 && alpha(16) <= 1);
  app.history.undo(); ui.update();
  check('One Undo restores Start without undoing Hold', instance().in === 0 && instance().out === 12 && app.compEnd === 12);
  app.history.redo(); ui.update();
  app.setFrame(15); enter('end frame','8','blur');
  check('Blur commits an End trim and clamps the playhead', instance().out === 8 && app.frame === 7 && app.compEnd === 8);
  enter('hold frames','99');
  const input = document.querySelector<HTMLInputElement>('input[aria-label="Asset hold frames"]')!;
  input.focus(); input.value = '4'; input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  check('Escape discards a pending field value', instance().out === 103 && input.value === '99');
  const file = await captureProject(app.project,{mode:'archive'}).settle();
  const loaded = loadProjectFile(parseProjectFile(stringifyProjectFile(file.file))).project;
  const l = loaded.comp.layers.find(x => x.kind === 'comp')!;
  check('Validated capture reload preserves timing and shared source link', l.in === 4 && l.out === 103 && l.kind === 'comp' && l.comp === source && loaded.comps.get(source)?.asset === true);
} catch(e) { check(String(e),false); }
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
