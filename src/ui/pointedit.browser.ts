/** Real App point editing on a drawn vector line; in-memory project, no library or autosave. */
import { App } from '../app';
import { Project } from '../core/project';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!, stage = document.querySelector<HTMLElement>('#stage')!;
const app = new App(canvas, stage); app.loadProject(new Project(256, 256)); app.setWorkspace('draw'); app.quickShape = false; app.setTool('pen'); app.fit();
const settle = (ms = 60) => new Promise<void>(r => setTimeout(r, ms));
function pointer(type: string, x: number, y: number, pointerId = 1) {
  const r = canvas.getBoundingClientRect(), p = app.view.docToScreen(x, y);
  canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'mouse', pointerId, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.5, clientX: r.left + p.x, clientY: r.top + p.y }));
}
async function drag(from: { x: number; y: number }, dx: number, dy: number, pointerId: number, release = true) {
  pointer('pointerdown', from.x, from.y, pointerId);
  for (let i = 1; i <= 5; i++) { pointer('pointermove', from.x + (dx * i) / 5, from.y + (dy * i) / 5, pointerId); await settle(16); }
  if (release) pointer('pointerup', from.x + dx, from.y + dy, pointerId);
}
let passed = 0, failed = 0;
function check(name: string, ok: boolean) { const li = document.createElement('li'); li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}`; document.querySelector('#results')!.append(li); if (ok) passed++; else failed++; }
try {
  await settle(200);
  pointer('pointerdown', 40, 128);
  for (let x = 50; x <= 210; x += 10) { pointer('pointermove', x, 128 + Math.sin(x / 30) * 30); await settle(16); }
  pointer('pointerup', 210, 128 + Math.sin(7) * 30); await settle(200);
  check('The pen draws one editable vector line', app.drawing.vectors.length === 1 && app.enterPointEdit() && app.pointEditing);
  // the second anchor point of the line (the first is an end, which may snap or join)
  const anchors = (app as unknown as { anchorsFor(r: unknown): number[] }).anchorsFor(app.pointStroke);
  const k = anchors[1]!;
  const at = () => { const p = app.drawing.vectors[0]!.points[k]!; return { x: Math.round(p.x), y: Math.round(p.y) }; };
  const start = at();
  await drag(start, 20, 20, 1); await settle();
  const moved = at();
  check('Dragging a point moves it as one Move point step', app.history.peekUndo()?.label === 'Move point' && moved.x !== start.x);
  app.setWorkspace('animate'); await settle();
  check('Switching workspace leaves point edit and keeps the moved point', !app.pointEditing && app.workspace === 'animate' && at().x === moved.x && at().y === moved.y);
  app.undo(); await settle();
  check('Undo after the switch puts the point back', at().x === start.x && at().y === start.y);
  app.redo(); await settle();
  check('Redo moves it again', at().x === moved.x && at().y === moved.y);
  app.setWorkspace('draw'); app.setTool('pen'); app.enterPointEdit();
  const width = app.drawing.vectors[0]!.brush.size;
  app.setPointWidthLive(1.8); await settle();
  app.setWorkspace('animate'); await settle();
  check('A width change still in progress is kept as one Line width step', !app.pointEditing && app.history.peekUndo()?.label === 'Line width');
  app.undo(); await settle();
  check('Undo restores the line width', app.drawing.vectors[0]!.brush.size === width);
  app.redo(); await settle();
  app.setWorkspace('draw'); app.setTool('pen'); app.enterPointEdit();
  const before = at();
  await drag(before, -20, 0, 2, false);
  const during = at();
  app.setWorkspace('animate'); await settle();
  pointer('pointerup', before.x - 20, before.y, 2); await settle();
  check('Switching in the middle of a point drag keeps the point as one Move point step', !app.pointEditing && during.x !== before.x && at().x === during.x && app.history.peekUndo()?.label === 'Move point');
  app.undo(); await settle();
  check('Undo puts the mid-drag point back', at().x === before.x && at().y === before.y);
} catch (e) { check(String(e), false); }
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
