/** First run and samples: the welcome screen's answers, and the two samples opening as real projects. MemoryStore only. */
import { App } from '../app';
import { valueAt } from '../core/anim';
import { compLength } from '../core/comp';
import { MemoryStore } from '../io/persist';
import { drawComp } from '../view/composite';
import { FileUI } from './files';
import { FIRST_RUN_TIPS, firstRunPending, showFirstRun } from './firstrun';
import { TimeLapse } from './timelapse';

const KEY = '2dope.firstrun.done', saved = localStorage.getItem(KEY);
localStorage.removeItem(KEY);
const stage = document.querySelector<HTMLElement>('#stage')!, canvas = document.querySelector<HTMLCanvasElement>('#canvas')!;
const app = new App(canvas, stage), store = new MemoryStore(), files = new FileUI(app, store, false);
let passed = 0, failed = 0;
async function check(name: string, test: () => Promise<true | string> | true | string) {
  const row = document.createElement('li');
  let r: true | string;
  try { r = await test(); } catch (e) { r = String(e); }
  if (r === true) { passed++; row.textContent = `PASS: ${name}`; } else { failed++; row.textContent = `FAIL: ${name}: ${r}`; }
  document.querySelector('#results')!.append(row);
}
const settle = () => new Promise((r) => setTimeout(r, 50));
const painted = (frame: number) => {
  const c = document.createElement('canvas'); c.width = app.project.comp.width; c.height = app.project.comp.height;
  drawComp(c.getContext('2d')!, app.project, app.project.comp, frame, { export: true });
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
  return n;
};

await check('The welcome screen shows once, with five tips, and answers with the start and interface chosen', async () => {
  if (!firstRunPending()) return 'not pending on a fresh device';
  const answer = showFirstRun('simple');
  await settle();
  const dlg = document.querySelector<HTMLDialogElement>('dialog.firstrun');
  if (!dlg?.open) return 'no dialog';
  if (dlg.querySelectorAll('.fr-tips li').length !== FIRST_RUN_TIPS.length || FIRST_RUN_TIPS.length !== 5) return 'not five tips';
  [...dlg.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Full')!.click();
  [...dlg.querySelectorAll<HTMLButtonElement>('.fr-starts button')].find((b) => b.textContent?.includes('Bouncing ball'))!.click();
  const r = await answer;
  if (r.start !== 'ball' || r.level !== 'full') return JSON.stringify(r);
  if (document.querySelector('dialog.firstrun')) return 'dialog left behind';
  return !firstRunPending() || 'still pending after answering';
});

await check('Escape on the welcome screen means a blank project', async () => {
  const answer = showFirstRun('simple');
  await settle();
  document.querySelector<HTMLDialogElement>('dialog.firstrun')!.dispatchEvent(new Event('cancel', { cancelable: true }));
  const r = await answer;
  return r.start === 'blank' || r.start;
});

await files.newProject({ name: 'Blank', width: 320, height: 180 });
const blankId = files.current!.id;
await check('The bouncing ball sample opens as a new project: 12 drawings on 1s at 12 fps, a floor, and the empty blank one removed', async () => {
  await files.addSample('ball');
  await settle();
  const p = app.project, ball = p.comp.layers.find((l) => l.name === 'Ball'), floor = p.comp.layers.find((l) => l.name === 'Floor');
  if (!ball || ball.kind !== 'drawings' || !floor) return 'layers missing';
  if (ball.exposures.length !== 12 || ball.exposures.some((e) => e.length !== 1) || p.comp.fps !== 12) return `${ball.exposures.length} exposures at ${p.comp.fps} fps`;
  for (const e of ball.exposures) await app.residency.pin(p.drawings.get(e.drawing)!);
  const a = painted(0), b = painted(6);
  if (!a || !b) return 'blank frames';
  const list = await store.listProjects();
  if (list.some((m) => m.id === blankId)) return 'the untouched blank project stayed';
  return list.some((m) => m.name.startsWith('Bouncing ball')) || 'not in the library';
});

await check('The sliding title sample has eased position keys, a turn, a bounce in scale and a drop shadow', async () => {
  await files.addSample('title');
  await settle();
  const p = app.project, l = p.comp.layers.find((x) => x.name === 'Badge');
  if (!l || l.kind !== 'drawings') return 'no badge layer';
  const pos = l.transform.position;
  if (pos.keys.length !== 2 || valueAt(pos, 0)[0] >= 0 || Math.round(valueAt(pos, 18)[0]) !== p.comp.width / 2) return 'position keys wrong';
  if (valueAt(pos, 9)[0] - valueAt(pos, 0)[0] <= (valueAt(pos, 18)[0] - valueAt(pos, 0)[0]) / 2) return 'it does not slow down into its stop (Ease out)';
  if (l.transform.rotation.keys.length !== 2 || l.transform.scale.keys.length !== 3) return 'rotation/scale keys missing';
  if (l.effects?.[0]?.type !== 'shadow') return 'no shadow';
  if (compLength(p.comp, p.comps) < 32) return `only ${compLength(p.comp, p.comps)} frames`;
  await app.residency.pin(p.drawings.get(l.exposures[0]!.drawing)!);
  return painted(30) > 1000 || 'nothing on screen at frame 30';
});

await check('Time-lapse records a picture after a change, replays it, and stops when switched off', async () => {
  const OFF = '2dope.timelapse.off', was = localStorage.getItem(OFF);
  localStorage.removeItem(OFF);
  try {
    const tl = new TimeLapse(app);
    if (!tl.on || tl.frames.length) return 'not on, or not empty for a new project';
    tl.changed();
    await new Promise((r) => setTimeout(r, 1200));
    await tl.capture();
    if (tl.frames.length !== 2 || !tl.frames.every((b) => b.type === 'image/jpeg' && b.size > 500)) return `${tl.frames.length} pictures`;
    tl.show();
    await settle();
    const dlg = document.querySelector<HTMLDialogElement>('dialog.timelapse');
    if (!dlg?.open || !dlg.querySelector('canvas.tl-view') || (dlg.querySelector('input[type=range]') as HTMLInputElement).max !== '1') return 'replay not shown';
    [...dlg.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Close')!.click();
    if (document.querySelector('dialog.timelapse')) return 'dialog left open';
    tl.setOn(false);
    tl.changed();
    await new Promise((r) => setTimeout(r, 1000));
    return (tl.frames.length === 2 && localStorage.getItem(OFF) === '1') || 'recorded while off';
  } finally {
    if (was === null) localStorage.removeItem(OFF); else localStorage.setItem(OFF, was);
  }
});

if (saved === null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, saved);
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
