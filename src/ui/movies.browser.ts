/** Movie tracks: an MP4 with sound comes in as one layer that plays the file, with its sound, and edits like a layer. */
import { App } from '../app';
import { Project } from '../core/project';
import { SoundBank } from '../io/sound';
import { soundVoices } from '../io/soundmix';
import { captureProject, loadProjectFile } from '../io/projectio';
import { validateProjectFile } from '../io/schema';
import { drawComp } from '../view/composite';
import { setVideoHooks, videoFrame, videoFrameReady, videoFramesReady } from '../view/videoframes';
import { frameContent } from '../core/comp';
import { MotionPanel } from './motion';
import { AudioPlayback } from '../audio';
import { AudioTracks } from './audiotracks';

const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLElement>('#stage')!);
const motion = new MotionPanel(app, document.querySelector<HTMLElement>('#motion')!);
const tracks = new AudioTracks(app, new AudioPlayback(app), document.body);
const errors: string[] = [];
addEventListener('error', e => errors.push(e.message));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
app.loadProject(new Project(320, 180)); app.project.comp.fps = 12; app.setWorkspace('motion');
const stored = new Map<string, Uint8Array>();
setVideoHooks({ project: () => app.project, source: async path => stored.get(path) ?? null, redraw: () => app.requestRender() });
const bank = new SoundBank(() => false);
const wait = (ms = 60) => new Promise<void>(r => setTimeout(r, ms));
const expect = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason); };
let passed = 0, failed = 0;
const check = async (name: string, fn: () => void | Promise<void>) => {
  const li = document.createElement('li');
  try { await fn(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${(e as Error).message}`; console.error(e); }
  document.querySelector('#results')!.append(li);
};

// a four-second movie: red, green, blue, yellow for a second each, with a 440 Hz tone
const COLOURS = [[220, 40, 40], [40, 170, 40], [40, 40, 220], [230, 200, 40]];
async function makeMovie(): Promise<File> {
  const { Output, BufferTarget, Mp4OutputFormat, CanvasSource, AudioBufferSource, QUALITY_HIGH } = await import('mediabunny');
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180; const g = cv.getContext('2d')!;
  const out = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const video = new CanvasSource(cv, { codec: 'avc', bitrate: QUALITY_HIGH }); out.addVideoTrack(video, { frameRate: 24 });
  const audio = new AudioBufferSource({ codec: 'aac', bitrate: QUALITY_HIGH }); out.addAudioTrack(audio);
  await out.start();
  for (let i = 0; i < 96; i++) { const [r, gg, b] = COLOURS[Math.floor(i / 24)]!; g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(0, 0, 320, 180); await video.add(i / 24, 1 / 24); }
  const tone = new AudioBuffer({ length: 44100 * 4, numberOfChannels: 2, sampleRate: 44100 });
  for (let c = 0; c < 2; c++) { const d = tone.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = 0.3 * Math.sin((2 * Math.PI * 440 * i) / 44100); }
  await audio.add(tone);
  await out.finalize();
  return new File([out.target.buffer!], 'animatic.mp4', { type: 'video/mp4' });
}

/** The colour at the middle of the shot at a frame, as an export draws it. */
async function colourAt(frame: number): Promise<number[]> {
  const p = app.project, c = document.createElement('canvas'); c.width = p.comp.width; c.height = p.comp.height;
  await videoFramesReady(p, frameContent(p.comps, p.comp, frame).videos);
  const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  drawComp(g, p, p.comp, frame, { export: true });
  return [...g.getImageData(c.width / 2, c.height / 2, 1, 1).data].slice(0, 3);
}
const near = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]!) < 40);
const movie = () => app.project.comp.layers.find(l => l.kind === 'drawings' && l.video)!;

const file = await makeMovie();
let id = '';

await check('An MP4 comes in as one movie track with its sound, in one Undo step', async () => {
  app.history.clear();
  expect(await app.importVideo(file, b => bank.importMovieSound(app.project, b, file.name)), 'import refused');
  const l = movie();
  expect(l?.kind === 'drawings' && l.video, 'no movie layer');
  id = l.id;
  if (l.kind !== 'drawings' || !l.video) return;
  expect(l.exposures.length === 1 && l.exposures[0]!.length === 48 + 1 || l.exposures[0]!.length === 48, `length ${l.exposures[0]!.length} frames`);
  expect(l.video.sound && app.project.sounds.has(l.video.sound), 'no sound with the movie');
  expect(app.project.drawings.size < 10, 'the movie was turned into drawings');
  for (const v of app.project.videos.values()) if (v.bytes) stored.set(v.path, v.bytes);
  expect(app.history.peekUndo()?.label === 'Import movie', 'not one undo step');
});

await check('Its picture follows the playhead: red, green, blue, yellow a second apart', async () => {
  const seen = [await colourAt(6), await colourAt(18), await colourAt(30), await colourAt(42)];
  COLOURS.forEach((c, i) => expect(near(seen[i]!, c), `second ${i + 1}: ${seen[i]} not ${c}`));
});

await check('While working, a frame decodes in the background and the canvas redraws', async () => {
  const l = movie();
  if (l.kind !== 'drawings' || !l.video) return;
  const t = 2.75;
  videoFrame(l.video.asset, t, 12);
  for (let i = 0; i < 40 && !videoFrameReady(l.video.asset, t); i++) await wait(50);
  expect(videoFrameReady(l.video.asset, t), 'the preview frame never arrived');
});

await check('Its sound plays with it, and moves when the track moves', async () => {
  const at = (sec: number) => soundVoices(app.project, app.project.comp.id).map(v => v.sourceTime(sec));
  expect(at(1)[0] !== null && Math.abs(at(1)[0]! - 1) < 0.01, `sound at 1 s: ${at(1)}`);
  app.editor.setTiming(id, { start: 12 });
  expect(at(0.5)[0] === null && Math.abs(at(1.5)[0]! - 0.5) < 0.01, `after moving one second later: ${at(0.5)} / ${at(1.5)}`);
  expect(near(await colourAt(18), COLOURS[0]!), 'the picture did not move with it');
  app.undo(); await wait();
});

await check('Split at the playhead: two tracks, each with its part of the picture and sound', async () => {
  app.editor.select(id); app.setFrame(24);
  expect(app.editor.split() === 1, 'did not split');
  const parts = app.project.comp.layers.filter(l => l.kind === 'drawings' && l.video);
  expect(parts.length === 2, `${parts.length} movie tracks`);
  expect(near(await colourAt(30), COLOURS[2]!) && near(await colourAt(18), COLOURS[1]!), 'split parts show the wrong picture');
  const voices = soundVoices(app.project, app.project.comp.id);
  const live = voices.map(v => v.sourceTime(2.5)).filter(x => x !== null);
  expect(live.length === 1 && Math.abs(live[0]! - 2.5) < 0.01, `sound at 2.5 s from ${live.length} tracks`);
  // trim the second part's start: the picture stays where it was in time
  const second = parts.find(l => l.in === 24)!;
  app.editor.setTiming(second.id, { in: 30 });
  expect(near(await colourAt(33), COLOURS[2]!), 'trimming moved the picture');
  app.undo(); app.undo(); await wait();
  expect(app.project.comp.layers.filter(l => l.kind === 'drawings' && l.video).length === 1, 'undo did not join them back');
});

await check('Muting the movie silences it; Undo brings the sound back', async () => {
  app.editor.edit('mute', c => { const l = c.layers.find(x => x.id === id); if (l?.kind === 'drawings' && l.video) l.video = { ...l.video, muted: true }; });
  expect(!soundVoices(app.project, app.project.comp.id).length, 'still plays');
  app.undo(); await wait();
  const after = app.project.comp.layers.find(x => x.id === id);
  expect(soundVoices(app.project, app.project.comp.id).length === 1, `undo did not bring the sound back (${after?.kind === 'drawings' ? JSON.stringify(after.video) : 'gone'}; last undo ${app.history.peekUndo()?.label})`);
});

await check('Saved and opened again: the movie, its sound and its settings come back (format 11)', async () => {
  const saved = await captureProject(app.project, { mode: 'archive', source: async k => stored.get(k) ?? null }).settle();
  expect(saved.file.schema === 11 && saved.file.videos && Object.keys(saved.file.videos).length === 1, 'no movie in the file');
  const path = Object.values(saved.file.videos!)[0]!.path;
  expect(saved.assets.has(path), 'the movie bytes were not saved');
  const back = loadProjectFile(validateProjectFile(JSON.parse(JSON.stringify(saved.file)))).project;
  const l = back.comp.layers.find(x => x.kind === 'drawings' && x.video);
  expect(l?.kind === 'drawings' && l.video?.sound && back.sounds.has(l.video.sound) && back.videos.get(l.video.asset)?.width === 320, 'movie layer lost on reload');
});

await check('The Inspector has a Movie tab: Starts at slips the movie, volume and mute', async () => {
  app.editor.select(id); motion.inspector.toggle(true); motion.update(); await new Promise(r => setTimeout(r, 60));
  const tab = [...motion.inspector.root.querySelectorAll<HTMLButtonElement>('.mi-tab')].find(b => b.textContent === 'Movie');
  expect(tab && !motion.inspector.root.querySelector('.mi-tab[data-tab=drawing]'), 'no Movie tab');
  tab!.click(); await new Promise(r => setTimeout(r, 60));
  const start = motion.inspector.root.querySelector<HTMLInputElement>('input[aria-label="Starts at second"]')!;
  start.value = '1'; start.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 60));
  expect(near(await colourAt(6), COLOURS[1]!), 'Starts at 1 s did not show the second second');
  const vol = motion.inspector.root.querySelector<HTMLInputElement>('input[aria-label="Volume"]')!;
  vol.value = '50'; vol.dispatchEvent(new Event('change')); await new Promise(r => setTimeout(r, 60));
  expect(soundVoices(app.project, app.project.comp.id)[0]?.gain === 0.5, 'volume not applied');
  app.undo(); app.undo(); await new Promise(r => setTimeout(r, 60));
  motion.inspector.toggle(false);
});

await check('A sound clip splits at the playhead and duplicates, each one Undo step', async () => {
  const p = app.project, sound = movie().kind === 'drawings' ? (movie() as { video?: { sound: string | null } }).video!.sound! : '';
  app.editor.edit('clip', () => {});
  const clipId = p.newId('a');
  p.comp.audio = [{ id: clipId, asset: sound, name: 'tone', start: 0, trimIn: 0, trimOut: 4, gain: 1, muted: false, link: null }];
  app.setFrame(24);
  expect(tracks.splitClip(clipId), 'did not split');
  const [a, b] = p.comp.audio!;
  expect(p.comp.audio!.length === 2 && Math.abs(a!.trimOut - 2) < 0.01 && b!.start === 24 && Math.abs(b!.trimIn - 2) < 0.01, `split wrong: ${JSON.stringify(p.comp.audio)}`);
  expect(app.history.peekUndo()?.label === 'Split sound', 'not one undo step');
  tracks.duplicateClip(b!.id);
  expect(p.comp.audio!.length === 3 && p.comp.audio![2]!.start === 48, `duplicate wrong: ${JSON.stringify(p.comp.audio!.map(x => x.start))}`);
  app.undo(); app.undo(); await new Promise(r => setTimeout(r, 30));
  expect(p.comp.audio!.length === 1, 'undo did not join the sound back');
  p.comp.audio = [];
});

await check('Keyframes copy and paste at the playhead onto another layer (Motion)', async () => {
  const ed = app.editor;
  ed.addLayer('null'); const a = ed.comp.layers.find(l => l.kind === 'null')!.id;
  ed.addLayer('null'); const b = ed.comp.layers.find(l => l.kind === 'null' && l.id !== a)!.id;
  app.setFrame(0); ed.select(a); ed.setValue(a, 'rotation', 0); ed.toggleKey(a, 'rotation');
  app.setFrame(6); ed.setValue(a, 'rotation', 90);
  ed.selectKeys([{ layer: a, prop: 'rotation', f: 0 }, { layer: a, prop: 'rotation', f: 6 }]);
  expect(ed.copyKeys() === 2, 'did not copy two keys');
  ed.select(b); app.setFrame(12);
  expect(ed.pasteKeys() === 2, 'did not paste two keys');
  const keys = ed.layer(b)!.transform.rotation.keys.map(k => `${k.f}:${k.v}`).join();
  expect(keys === '12:0,18:90', `pasted keys: ${keys}`);
  expect(app.history.peekUndo()?.label === 'Paste keys', 'not one undo step');
});

await check('No page errors', () => { expect(!errors.length, errors.join(' | ')); });
document.querySelector('#summary')!.textContent = `${failed ? 'FAILED' : 'PASSED'}: ${passed} passed, ${failed} failed`;
