/** React to audio, end to end in a real browser: decode a WAV clip, bake onto Opacity, undo/redo, save/reopen and the export compositor. */
import { App } from '../app';
import { valueAt } from '../core/anim';
import { loadProjectFile, captureProject } from '../io/projectio';
import { parseProjectFile, stringifyProjectFile } from '../io/schema';
import { SoundBank, SOUND_RATE, wavBytes } from '../io/sound';
import { reactToAudio } from './audioreactdialog';
import { drawComp } from '../view/composite';

const KEY = '2dope.audioreact', saved = localStorage.getItem(KEY);
const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, stage), bank = new SoundBank(() => false);
let passed = 0, failed = 0;
const check = (name: string, r: true | string) => { const li = document.createElement('li'); if (r === true) { passed++; li.textContent = `PASS: ${name}`; } else { failed++; li.textContent = `FAIL: ${name}: ${r}`; } document.querySelector('#results')!.append(li); };
const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));
const notices: string[] = [];
app.onNotice = (m) => notices.push(m);

try {
  // 2 s of audio at 24 fps: a 100 Hz beat for 0.1 s every half second, silence between
  const fps = 24, seconds = 2, buf = new AudioBuffer({ length: SOUND_RATE * seconds, sampleRate: SOUND_RATE, numberOfChannels: 1 }), data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) { const t = i / SOUND_RATE; data[i] = t % 0.5 < 0.1 ? 0.8 * Math.sin(2 * Math.PI * 100 * t) : 0; }
  const p = app.project, comp = p.comp, l = p.layer;
  comp.fps = fps; comp.duration = 48;
  l.exposures = [{ drawing: l.exposures[0]!.drawing, length: 48 }];
  p.sounds.set('beat', { name: 'Beat', path: 'assets/beat.wav', duration: seconds, bytes: wavBytes(buf) });
  comp.audio = [{ id: 'a1', asset: 'beat', name: 'Beat', start: 0, trimIn: 0, trimOut: seconds, gain: 1, muted: false, link: null }];
  app.setWorkspace('motion');
  const ed = app.editor;
  ed.edit('keys', (c) => { const x = c.layers.find((y) => y.id === l.id)!; x.transform.opacity = { value: 50, keys: [{ f: 0, v: 50, in: { interp: 'linear', slope: 1, influence: 1 / 3 }, out: { interp: 'linear', slope: 1, influence: 1 / 3 } }, { f: 47, v: 50, in: { interp: 'linear', slope: 1, influence: 1 / 3 }, out: { interp: 'linear', slope: 1, influence: 1 / 3 } }] }; });
  const before = JSON.stringify(ed.comp.layers[0]!.transform.opacity);
  localStorage.removeItem(KEY);

  reactToAudio(app, bank);
  check('With nothing selected it says so and opens nothing', !document.querySelector('dialog.audioreact') && /Select a key/.test(notices.at(-1) ?? '') || String(notices.at(-1)));

  ed.selectKey({ layer: l.id, prop: 'opacity', f: 0 }); ed.selectKey({ layer: l.id, prop: 'opacity', f: 47 }, true);
  reactToAudio(app, bank);
  const dlg = document.querySelector<HTMLDialogElement>('dialog.audioreact');
  check('The dialog opens with the clip and the defaults (10–250 Hz, Pulse, Master 100)', !!dlg?.open && (dlg.querySelector('select[aria-label="Source"]') as HTMLSelectElement).value === 'a1' && (dlg.querySelector('input[aria-label="Band start"]') as HTMLInputElement).value === '10' && (dlg.querySelector('input[aria-label="Band end"]') as HTMLInputElement).value === '250' && (dlg.querySelector('select[aria-label="Reactor"]') as HTMLSelectElement).value === 'pulse' && (dlg.querySelector('input[aria-label="Master"]') as HTMLInputElement).value === '100' || 'dialog fields');
  (dlg!.querySelector('input[aria-label="Intensity"]') as HTMLInputElement).value = '40';
  (dlg!.querySelector('input[aria-label="Decay"]') as HTMLInputElement).value = '0';
  (dlg!.querySelector('input[aria-label="Smoothing"]') as HTMLInputElement).value = '0';
  const t0 = performance.now();
  [...dlg!.querySelectorAll('button')].find((b) => b.textContent === 'Bake')!.click();
  for (let i = 0; i < 60 && document.querySelector('dialog.audioreact'); i++) await settle();
  const li = document.createElement('li'); li.textContent = `Measured: decode + analyse + bake 2 s: ${(performance.now() - t0).toFixed(0)} ms`; document.querySelector('#results')!.append(li);
  const op = () => ed.comp.layers[0]!.transform.opacity;
  const keys = op().keys;
  check('Bake writes one key per frame over the selected keys, one undo step "React to audio"', keys.length === 48 && app.history.peekUndo()?.label === 'React to audio' || `${keys.length} keys, ${app.history.peekUndo()?.label}`);
  const v = keys.map((k) => k.v as number);
  check('Values stay within the base ± Intensity × Master and move with the beat', v.every((x) => x >= 50 - 1e-6 && x <= 90 + 1e-6) && v[1]! > 70 && v[9]! < 55 && v[13]! > 70 || v.map((x) => x.toFixed(0)).join(' '));
  app.history.undo();
  check('Undo restores the previous keys in one step', JSON.stringify(op()) === before || 'not restored');
  app.history.redo();
  check('Redo re-applies them', op().keys.length === 48 && (op().keys[1]!.v as number) === v[1] || 'redo differs');
  const file = parseProjectFile(stringifyProjectFile((await captureProject(p, { mode: 'library' }).settle()).file));
  const reopened = loadProjectFile(file).project.comp.layers[0]!.transform.opacity;
  check('Save and reopen keep the same motion', [0, 1, 9, 13, 30].every((f) => Math.abs(valueAt(reopened, f) - valueAt(op(), f)) < 1e-6) || 'reopened differs');
  // the same seed and settings bake the same keys again
  ed.selectKey({ layer: l.id, prop: 'opacity', f: 0 });
  app.history.undo();
  ed.selectKey({ layer: l.id, prop: 'opacity', f: 0 }); ed.selectKey({ layer: l.id, prop: 'opacity', f: 47 }, true);
  reactToAudio(app, bank);
  [...document.querySelector<HTMLDialogElement>('dialog.audioreact')!.querySelectorAll('button')].find((b) => b.textContent === 'Bake')!.click();
  for (let i = 0; i < 60 && document.querySelector('dialog.audioreact'); i++) await settle();
  check('The settings were remembered, and the same settings bake identical keys', JSON.stringify(op().keys.map((k) => k.v)) === JSON.stringify(v) || 'different keys');
  // the export compositor shows the baked opacity: a solid drawing's alpha follows the keys
  const d = p.drawing(l.exposures[0]!.drawing);
  const g = d.line.getContext('2d')!; g.fillStyle = '#000'; g.fillRect(0, 0, d.line.width, d.line.height); d.rev++;
  const alphaAt = (f: number) => { const c = document.createElement('canvas'); c.width = p.width; c.height = p.height; drawComp(c.getContext('2d')!, p, p.comp, f, { export: true }); return c.getContext('2d')!.getImageData(p.width >> 1, p.height >> 1, 1, 1).data[3]!; };
  check('Export pixels follow the baked opacity (beat frame vs quiet frame)', [1, 9].every((f) => Math.abs(alphaAt(f) - Math.round(255 * valueAt(op(), f) / 100)) <= 2) && alphaAt(1) > alphaAt(9) || `${alphaAt(1)} vs ${alphaAt(9)}`);
} catch (e) { check(String(e), String(e)); }
if (saved === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved);
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
