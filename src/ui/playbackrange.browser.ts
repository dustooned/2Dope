/** Real shared App/transport controls and portable storage on an isolated test origin. */
import { App } from '../app';
import { newComp, drawingsLayer, compLayer } from '../core/comp';
import { FlipMode } from './flipmode';
import { Strip } from './strip';
import { TracksSheet } from './sheet';
import { PaintingWorkspaceUI } from './paintingworkspace';
import { MotionPanel } from './motion';
import { FileUI } from './files';
import { MemoryStore } from '../io/persist';
import { parseProjectFile, stringifyProjectFile } from '../io/schema';
import { captureProject } from '../io/projectio';
import { writeZip } from '../io/zip';
import { AudioPlayback } from '../audio';
import { AppSettingsUI } from './settings';
import { defaultQuickMenu } from '../core/quickmenu';
import { RANGE_GESTURE_KEY } from '../core/playback';
import { HOLD_MS } from './contextmenu';

const keys = ['2dope.student.ui', '2dope.student.profiles', '2dope.student.fingerPaint', '2dope.quickshape', RANGE_GESTURE_KEY, '2dope.draw.view', '2dope.animate.view', '2dope.flip.mini', '2dope.ui.level', '2dope.sheet.animate', '2dope.painting.layout.animate', '2dope.painting.layout.draw'];
const saved = keys.map(k => localStorage.getItem(k)); keys.forEach(k => localStorage.removeItem(k));
const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!, stripRoot = document.querySelector<HTMLElement>('#strip')!;
const app = new App(canvas, stage), flip = new FlipMode(app, stage), strip = new Strip(app, stripRoot);
const sheet = new TracksSheet(app, document.querySelector<HTMLElement>('.stage-col')!, stripRoot, () => app.refit());
const painting = new PaintingWorkspaceUI(app, flip, stage, () => refresh(), () => {});
const motion = new MotionPanel(app, document.querySelector<HTMLElement>('#motion')!);
function refresh() {
  painting.update(); flip.update(); sheet.update(); strip.update(); motion.update();
  const want = sheet.active ? sheet.bar : strip.stripBar;
  if (strip.navRow.parentElement !== want) {
    if (want === sheet.bar) sheet.bar.insertBefore(strip.navRow, sheet.bar.querySelector('.spacer'));
    else strip.stripBar.prepend(strip.navRow);
  }
}
app.onFrameChange = refresh; app.onCompChange = refresh; app.onWorkspaceChange = () => { sheet.restore(); refresh(); };
app.history.onChange = refresh; app.editor.onChange = refresh; app.onToolChange = refresh; flip.onChange = refresh;
const store = new MemoryStore(), files = new FileUI(app, store, false);
let changed = 0; const dirty = app.onDocChanged; app.onDocChanged = () => { changed++; dirty(); };
const clock = app as unknown as { playClock: { t0: number; f0: number }; tickPlayback(t: number): void };
const tick = (frames: number) => clock.tickPlayback(clock.playClock.t0 + frames * 1000 / app.project.fps + .01);
const settle = () => new Promise<void>(r => setTimeout(r, 100));
const dialog = () => document.querySelector<HTMLDialogElement>('.playback-range-dialog')!;
const field = (name: string) => dialog().querySelector<HTMLInputElement>(`[aria-label="${name} frame"]`)!;
const click = (label: string, root: ParentNode = dialog()) => {
  const b = [...root.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label || b.getAttribute('aria-label') === label);
  if (!b) throw new Error(`Missing button ${label}`); b.click();
};
function open(root: ParentNode = flip.row) { root.querySelector<HTMLButtonElement>('.playback-range-button')!.click(); }
function value(name: string, n: string) { field(name).value = n; field(name).dispatchEvent(new Event('input', { bubbles: true })); }
function apply() { dialog().querySelector<HTMLFormElement>('form')!.requestSubmit(); }
let passed = 0, failed = 0;
function check(name: string, ok: boolean) { const row = document.createElement('li'); row.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}`; document.querySelector('#results')!.append(row); if (ok) passed++; else failed++; }
const hasRange = (start: number, end: number) => app.playbackRange.start === start && app.playbackRange.end === end;
try {
  await files.newProject({ name: 'Playback range review', width: 128, height: 128, frames: 24 });
  app.setWorkspace('animate'); flip.set(true); refresh(); await settle();
  check('Whole animation is the default, with a visible 44px range control', hasRange(0,24) && !app.project.comp.playbackRange && flip.row.querySelector('.playback-range-button')!.getBoundingClientRect().height >= 44);
  const history = app.history.peekUndo(), changes = changed; open();
  check('Dialog uses inclusive 1-based bounds and focuses Start', field('Start').value === '1' && field('End').value === '24' && document.activeElement === field('Start'));
  const r = dialog().getBoundingClientRect();
  check('Range dialog and actions fit the viewport at this size', r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1 && [...dialog().querySelectorAll('button')].every(b => { const r = b.getBoundingClientRect(); return r.height >= 44 && r.left >= 0 && r.right <= innerWidth + 1; }));
  value('Start','5'); value('End','8'); click('Cancel');
  check('Cancel discards the draft without History/autosave changes and restores focus', !dialog() && app.history.peekUndo() === history && changed === changes && document.activeElement?.classList.contains('playback-range-button') === true);
  open(); value('Start','9'); value('End','8');
  const applyButton = () => [...dialog().querySelectorAll('button')].find(b => b.textContent === 'Apply')!;
  check('Reversed, fractional, blank and out-of-shot values cannot apply', applyButton().disabled && ['1.5','','0','25'].every(n => { value('Start',n); return applyButton().disabled; }));
  app.setFrame(4); click('Set start to current frame'); app.setFrame(7); click('Set end to current frame'); apply();
  check('Use current plus Apply creates one saved range command with one autosave notification', !dialog() && hasRange(4,8) && app.project.comp.playbackRange?.start === 4 && app.history.peekUndo()?.label === 'Playback range' && changed === changes + 1);
  const band = flip.row.querySelector<HTMLElement>('.playback-range-band')!;
  check('Flipbook labels and ruler band show the selected interval', flip.row.querySelector('.playback-range-button')!.textContent === 'Range 5–8' && parseFloat(band.style.width) === 44 * 4 && parseFloat(band.style.left) === 46 + 44 * 4);
  app.undo(); await settle(); check('Undo restores whole playback', !app.project.comp.playbackRange && hasRange(0,24));
  app.redo(); await settle(); check('Redo restores the exact selected edges', hasRange(4,8));
  const beforeNoop = changed, cmd = app.history.peekUndo(); open(); apply();
  check('Applying unchanged edges adds no History/autosave change', changed === beforeNoop && app.history.peekUndo() === cmd);
  app.setFrame(0); check('Paused scrubbing can still reach frames outside the range', app.frame === 0);
  app.togglePlay(); check('Play from outside starts at the range start', app.playing && app.frame === 4);
  tick(3); const last = app.frame; tick(4); const wrapped = app.frame; tick(100000);
  check('Shared clock includes the end frame and loops without escaping after long delays', last === 7 && wrapped === 4 && app.frame === 4);
  app.togglePlay(); app.setFrame(6); app.togglePlay(); const resumed = app.frame; tick(1);
  check('Play inside the range resumes there', resumed === 6 && app.frame === 7);
  app.setFrame(20); const outside = app.frame; app.setFrame(6); tick(1);
  check('Seeking during playback respects the range and rebases the clock', outside === 4 && app.frame === 7);
  app.setFps(24); tick(1); check('Changing fps keeps range looping on the rebased clock', app.frame === 4); app.togglePlay();
  app.setPlaybackRange({ start:8,end:9 }); app.setFrame(0); app.togglePlay(); tick(999);
  check('Single-frame playback is valid and stable', app.frame === 8); app.togglePlay();
  app.setPlaybackRange({start:4,end:8}); const stored = app.project.comp.playbackRange;
  app.project.comp.duration = 2; refresh(); const shortened = hasRange(1,2); app.project.comp.duration = 24; refresh();
  check('Shortening clamps preview safely, and restoring duration restores saved edges', shortened && hasRange(4,8) && app.project.comp.playbackRange === stored);
  flip.set(false); refresh(); await settle(); open(strip.navRow);
  check('Clips opens the same saved range control', field('Start').value === '5' && field('End').value === '8'); click('Cancel');
  app.project.layer.start = 2; refresh();
  const stripBand = stripRoot.querySelector<HTMLElement>('.playback-range-band')!;
  check('Clips ruler band accounts for the active layer start', !!stripBand && parseFloat(stripBand.style.left) === 2 * parseFloat(stripRoot.querySelector<HTMLElement>('.strip-playhead')!.style.width));
  app.project.layer.start = 0;
  const child = newComp('child','Source',128,128,12); child.duration=12;
  child.layers.push(drawingsLayer('childLayer','Art', [{drawing:app.drawing.id,length:12}],128,128)); app.project.comps.set(child.id,child);
  const parent = app.project.comp; parent.layers.push(compLayer('instance','Source',child,parent));
  app.project.activeComp=child.id; app.frame=0; refresh(); const independent = !app.project.comp.playbackRange && hasRange(0,12);
  app.setPlaybackRange({start:1,end:3}); app.project.activeComp=parent.id; app.frame=0; refresh();
  check('Source and shot keep independent ranges; nested placement still uses full source length', independent && hasRange(4,8) && app.project.comps.get('child')!.playbackRange?.end === 3 && app.compEnd === 24);
  app.setPlaybackRange(null); app.project.comps.set(parent.id,structuredClone(parent)); app.undo(); await settle();
  check('Range Undo resolves the current comp object after a snapshot replacement', hasRange(4,8));
  await files.autosaver.flush(); const head = parseProjectFile((await store.getHead(files.current!.id))!.json);
  check('Autosave keeps independent shot/source ranges', head.comps[parent.id]!.playbackRange?.start === 4 && head.comps.child!.playbackRange?.end === 3);
  const snapshot = await captureProject(app.project,{mode:'archive',source:k=>store.getAsset(k)}).settle();
  const bytes = writeZip([{name:'project.json',data:new TextEncoder().encode(stringifyProjectFile(snapshot.file))},...[...snapshot.assets].map(([name,data])=>({name,data}))]);
  await files.importFile(new File([bytes as BlobPart],'range.2dope')); await settle();
  check('Portable project import restores range without trimming content', hasRange(4,8) && app.compEnd === 24);
  app.setWorkspace('motion'); refresh(); open(document.querySelector('#motion')!);
  check('Motion exposes the same range and clock', field('Start').value === '5' && field('End').value === '8'); click('Cancel');
  app.setWorkspace('animate'); flip.set(true); refresh(); open(); app.project.activeComp='child'; refresh();
  check('Changing source dismisses a stale range draft', !dialog());
  app.project.activeComp=app.project.main; refresh(); open(); await files.newProject({name:'Fresh shot',width:128,height:128,frames:12}); refresh();
  check('A new project closes the old draft and starts with whole playback', !dialog() && !app.project.comp.playbackRange && hasRange(0,12));
  flip.set(true); app.setPlaybackRange({start:2,end:5}); app.togglePlay(); open();
  check('Opening range settings pauses playback', !app.playing && !!dialog()); click('Whole animation');
  check('Whole animation clears the saved interval and ruler band in one command', !app.project.comp.playbackRange && !flip.row.querySelector('.playback-range-band') && app.history.peekUndo()?.label === 'Whole animation');
  // Exercise the real audio queue with a deterministic context; no audio is played on the device.
  const OriginalContext = window.AudioContext, queued: Float32Array[] = []; let stops = 0;
  class FakeContext {
    currentTime=0; destination={}; resume(){return Promise.resolve();}
    createBuffer(_channels:number,size:number,rate:number){const data=new Float32Array(size);return {duration:size/rate,copyToChannel(a:Float32Array,c:number){if(c===0)data.set(a);},data};}
    createBufferSource(){return {buffer:null as unknown as {data:Float32Array},connect(){},disconnect(){},onended:null,start(){queued.push(this.buffer.data);},stop(){stops++;}};}
  }
  try {
    Object.defineProperty(window,'AudioContext',{value:FakeContext,configurable:true});
    app.project.comp.audio=[{id:'a1',asset:'sound',name:'Test',start:0,trimIn:0,trimOut:2,gain:1,muted:false,link:null}];
    const audio = new AudioPlayback(app), samples=Float32Array.from({length:96000},(_,i)=>i/48000/2);
    const buffer={sampleRate:48000,numberOfChannels:1,getChannelData:()=>samples} as unknown as AudioBuffer;
    audio.bank.load=async()=>buffer; audio.bank.get=()=>buffer;
    app.setFps(12); app.setPlaybackRange({start:3,end:5}); app.setFrame(4); app.togglePlay(); audio.sync(); await Promise.resolve(); await Promise.resolve();
    check('Live audio queue wraps samples inside the same nonzero range', queued.length>0 && queued.every(a=>a.every(v=>v>=.125-1e-5 && v<5/24)));
    const was = stops; app.setPlaybackRange({start:6,end:8}); audio.sync();
    check('Changing range pauses playback and stops already queued sound', !app.playing && stops>was); audio.stop();
  } finally { Object.defineProperty(window,'AudioContext',{value:OriginalContext,configurable:true}); }
  const settings = new AppSettingsUI(app,canvas,defaultQuickMenu,()=>{});
  const setting = () => document.querySelector<HTMLInputElement>('[aria-label="Hold ruler to set playback range"]')!;
  const settingsButton = (name:string) => click(name,document.querySelector('.app-settings')!);
  app.setPlaybackRange(null); const beforeSettings=changed, beforeSettingsHistory=app.history.peekUndo();
  check('Ruler gesture starts off', !app.rangeGestureEnabled);
  settings.show(); setting().checked=true; settingsButton('Cancel');
  check('Cancelling settings discards the gesture preference', !app.rangeGestureEnabled && localStorage.getItem(RANGE_GESTURE_KEY)===null);
  settings.show(); setting().checked=true; settingsButton('Apply settings');
  check('Applying gesture settings saves device-only preferences without drawing History/autosave', app.rangeGestureEnabled && localStorage.getItem(RANGE_GESTURE_KEY)==='true' && changed===beforeSettings && app.history.peekUndo()===beforeSettingsHistory);
  app.project.comp.audio=[]; app.setWorkspace('animate'); flip.set(true); app.setFrame(0); refresh(); await settle();
  const ruler = () => document.querySelector<HTMLElement>('.flip-ruler')!;
  const point = (frame:number, clips=false) => {
    const parent = document.querySelector<HTMLElement>(clips ? '.strip-inner' : '.flip-grid')!, rect=parent.getBoundingClientRect();
    const cell = clips ? parseFloat(document.querySelector<HTMLElement>('.strip-playhead')!.style.width) : 44;
    return {x:rect.left+(clips?0:46)+(frame-(clips?app.project.layer.start:0)+.5)*cell,y:rect.top+9};
  };
  const send = (type:string,frame:number,clips=false,id=91,primary=true) => {
    const p=point(frame,clips), target=clips?document.querySelector<HTMLElement>('.strip-ruler')!:ruler();
    target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'touch',pointerId:id,isPrimary:primary,button:0,buttons:type==='pointerup'||type==='pointercancel'?0:1,clientX:p.x,clientY:p.y}));
  };
  const waitHold = () => new Promise<void>(r=>setTimeout(r,HOLD_MS+60));
  send('pointerdown',1); send('pointermove',3); send('pointerup',3); await waitHold();
  check('Quick ruler dragging still scrubs and does not create a range', app.frame===3 && !app.project.comp.playbackRange && !document.querySelector('.playback-range-preview'));
  await settle(); const beforeGesture=changed; send('pointerdown',1); await waitHold(); send('pointermove',3);
  check('Holding then dragging previews a range without editing the document', !!document.querySelector('.playback-range-preview') && document.querySelector('.playback-range-gesture-hint')?.textContent?.includes('Loop 2–4')===true && !app.project.comp.playbackRange && changed===beforeGesture);
  send('pointerup',3);
  check('Lifting applies both inclusive edges as one Undo/autosave step', hasRange(1,4) && changed===beforeGesture+1 && app.history.peekUndo()?.label==='Playback range' && !document.querySelector('.playback-range-preview'));
  app.undo(); await settle(); check('Undo removes the gesture range', !app.project.comp.playbackRange); app.redo(); await settle(); check('Redo restores the gesture range',hasRange(1,4));
  send('pointerdown',3); await waitHold(); send('pointermove',1); send('pointerup',1);
  check('Dragging backward uses the same inclusive interval',hasRange(1,4));
  send('pointerdown',2); await waitHold(); send('pointerup',2);
  check('A stationary hold can set a single-frame loop',hasRange(2,3));
  const unchanged=()=>hasRange(2,3)&&!document.querySelector('.playback-range-preview');
  await settle(); send('pointerdown',1); await waitHold(); send('pointermove',3); send('pointercancel',3);
  check('Pointer cancellation discards the range preview',unchanged());
  send('pointerdown',1); await waitHold(); send('pointermove',3); window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true})); send('pointerup',3);
  check('Escape cancels an active range gesture',unchanged());
  send('pointerdown',1); await waitHold(); send('pointermove',3); window.dispatchEvent(new Event('blur')); send('pointerup',3);
  check('Window blur cancels the gesture without changing the range',unchanged());
  send('pointerdown',1); await waitHold(); send('pointermove',3); window.dispatchEvent(new Event('resize')); send('pointerup',3);
  check('Resize cancels the range preview',unchanged());
  send('pointerdown',1); await waitHold(); send('pointermove',3); send('pointerdown',4,false,92,false); send('pointerup',4,false,92,false); send('pointerup',3);
  check('A second finger cancels range editing and leaves pinch available',unchanged());
  await settle(); send('pointerdown',1); await waitHold(); send('pointermove',3); app.setRangeGestureEnabled(false); send('pointerup',3);
  check('Disabling the option cancels the preview immediately',unchanged()&&!app.rangeGestureEnabled);
  await settle(); send('pointerdown',1); await waitHold(); send('pointermove',3); send('pointerup',3);
  check('With the option off, holding the ruler retains ordinary scrubbing',unchanged()&&app.frame===3);
  app.setRangeGestureEnabled(true); flip.set(false); app.project.layer.start=2; app.setFrame(2); refresh(); await settle();
  document.querySelector<HTMLElement>('.strip-track')!.scrollLeft=0;
  send('pointerdown',3,true); await waitHold(); send('pointermove',5,true); send('pointerup',5,true);
  check('Clips gestures translate the active layer ruler into shot frame numbers',hasRange(3,6));
  app.project.layer.start=0; flip.set(true); app.setFrame(0); refresh(); await settle();
  send('pointerdown',1); await waitHold(); send('pointermove',3); const old=app.project;
  await files.newProject({name:'Gesture recovery',width:128,height:128,frames:12}); refresh(); send('pointerup',3);
  check('Project replacement cancels the gesture without writing into either project',!app.project.comp.playbackRange&&old.comp.playbackRange?.start===3&&!document.querySelector('.playback-range-preview'));
} catch(e) { check(e instanceof Error ? e.stack ?? e.message : String(e),false); }
finally { if(app.playing)app.togglePlay(); keys.forEach((k,i)=>{const v=saved[i];if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,v!);}); }
document.querySelector('#summary')!.textContent=`${passed} passed, ${failed} failed · playback range · ${innerWidth}×${innerHeight}`;
