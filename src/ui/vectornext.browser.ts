/**
 * Real App checks for iteration 3: vector Simplify / Smooth, the "only where it crosses" eraser,
 * SVG export, and the raster grain pass with imported-brush settings (height grain, depth minimum,
 * rolling grain, rotation, size-following scale) and taper size / opacity. In-memory project.
 */
import { App } from '../app';
import { cloneBrush, PRESETS } from '../core/brush';
import { Project } from '../core/project';
import { loadGrain } from '../brush/raster';
import { readVectorSvg } from '../io/svg';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!, stage = document.querySelector<HTMLElement>('#stage')!;
const app = new App(canvas, stage); app.loadProject(new Project(400, 300)); app.setWorkspace('draw'); app.quickShape = false; app.setTool('pen'); app.fit();
const settle = (ms = 60) => new Promise<void>(r => setTimeout(r, ms));
function pointer(type: string, x: number, y: number, pressure = 0.5) {
  const r = canvas.getBoundingClientRect(), p = app.view.docToScreen(x, y);
  canvas.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'mouse', pointerId: 1, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure, clientX: r.left + p.x, clientY: r.top + p.y }));
}
async function stroke(pts: [number, number][]) {
  pointer('pointerdown', pts[0]![0], pts[0]![1]);
  for (const [x, y] of pts.slice(1)) { pointer('pointermove', x, y); await settle(16); }
  pointer('pointerup', pts.at(-1)![0], pts.at(-1)![1]); await settle(150);
}
let passed = 0, failed = 0;
function check(name: string, ok: boolean) { const li = document.createElement('li'); li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}`; document.querySelector('#results')!.append(li); if (ok) passed++; else failed++; }
const errors: string[] = [];
addEventListener('error', (e) => errors.push(String(e.message)));
try {
  await settle(200);
  // a long wobbly vector line across the page
  const line: [number, number][] = [];
  for (let x = 30; x <= 370; x += 6) line.push([x, 150 + Math.sin(x / 25) * 20 + ((x * 13) % 7) * 0.4]);
  await stroke(line);
  const count = () => app.drawing.vectors[0]?.points.length ?? 0;
  const drawn = count();
  check('The pen draws one vector line', app.drawing.vectors.length === 1 && drawn > 20);

  app.enterPointEdit();
  const ends = () => { const p = app.drawing.vectors[0]!.points; return [p[0]!.x, p[0]!.y, p.at(-1)!.x, p.at(-1)!.y].map((v) => Math.round(v * 100)).join(); };
  const endsBefore = ends();
  app.simplifyLine(); await settle();
  check('Simplify is one "Simplify line" step with fewer points and the same ends', app.history.peekUndo()?.label === 'Simplify line' && count() < drawn && ends() === endsBefore);
  app.undo(); await settle();
  check('Undo brings every point back', count() === drawn);
  app.redo(); await settle();
  const simple = count();
  app.simplifyLine(true); await settle();
  check('Smooth is one "Smooth line" step, ends kept', app.history.peekUndo()?.label === 'Smooth line' && count() === simple && ends() === endsBefore);
  app.exitPointEdit();

  // SVG: capture the download instead of saving it
  let svgUrl = '';
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { if (this.download.endsWith('.svg')) svgUrl = this.href; else click.call(this); };
  app.exportVectorSvg();
  HTMLAnchorElement.prototype.click = click;
  const svg = svgUrl ? await (await fetch(svgUrl)).text() : '';
  const back = readVectorSvg(svg);
  check('Export SVG writes the line with the same point count', back.length === 1 && back[0]!.points.length === count() && svg.includes('viewBox="0 0 400 300"'));

  // the eraser, only where it crosses: starting on the line and leaving it does nothing
  app.setTool('eraser');
  app.setVectorErase('intersection');
  // the line's height at x: between its points
  const yAt = (x: number) => { const p = app.drawing.vectors[0]!.points; const i = p.findIndex((q) => q.x >= x); const a = p[i - 1]!, b = p[i]!; return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x); };
  // within reach of the line (its half-width plus the eraser's), but moving away: no crossing
  const y0 = yAt(200) - 1;
  await stroke([[200, y0], [200, y0 - 20], [200, y0 - 40]]);
  const state = () => ` [${app.drawing.vectors.length} lines, last step: ${app.history.peekUndo()?.label}, plane ${app.plane}]`;
  check('An eraser that only starts on the line leaves the vector line whole' + state(), app.drawing.vectors.length === 1 && !app.history.peekUndo()?.label.startsWith('Erase (vector'));
  await stroke([[120, yAt(120) - 60], [120, yAt(120) + 60]]);
  check('Crossing it cuts the line in two, one step named after the mode' + state(), app.drawing.vectors.length === 2 && app.history.peekUndo()?.label === 'Erase (vector: only where it crosses)');
  app.undo(); await settle();
  check('Undo joins it again', app.drawing.vectors.length === 1);
  app.setVectorErase('crossing');
  await stroke([[200, y0], [200, y0 - 20], [200, y0 - 40]]);
  check('The same off-the-line stroke does erase with Up to crossings (it is within reach)', app.drawing.vectors.length === 0 && app.history.peekUndo()?.label === 'Erase (vector: up to crossings)');
  app.undo(); await settle();

  // imported-brush grain and taper on the raster brush
  const g = document.createElement('canvas'); g.width = g.height = 32;
  const gx = g.getContext('2d')!; gx.fillStyle = '#fff'; gx.fillRect(0, 0, 32, 32); gx.fillStyle = '#000';
  for (let i = 0; i < 32; i += 4) gx.fillRect(i, 0, 2, 32);
  const grain = g.toDataURL('image/png');
  await loadGrain(grain);
  const paint = async (extra: Partial<ReturnType<typeof cloneBrush>>, y: number) => {
    app.setTool('brush');
    app.setBrush({ ...cloneBrush(PRESETS[0]!), name: 'Imported', size: 24, spacing: 0.05, opacity: 1, flow: 1, grain: 0.3, grainScale: 1, grainImage: grain, tiltShade: { ...PRESETS[0]!.tiltShade, enabled: false }, sizeDyn: { control: 'off', min: 1, curve: 1, jitter: 0, invert: false }, opacityDyn: { control: 'off', min: 1, curve: 1, jitter: 0, invert: false }, ...extra }, false);
    await stroke([[40, y], [120, y], [200, y], [280, y], [360, y]]);
  };
  const row = (y: number, x0 = 60, x1 = 340) => { const d = app.drawing.line.getContext('2d')!.getImageData(x0, y, x1 - x0, 1).data; const a: number[] = []; for (let i = 3; i < d.length; i += 4) a.push(d[i]!); return a; };
  const spread = (a: number[]) => Math.max(...a) - Math.min(...a);
  await paint({}, 40);
  const multiply = row(40);
  await paint({ grainMode: 'height', grain: 0.3 }, 80);
  const height = row(80);
  check('A height grain at the same depth holds the valleys back harder than multiply', spread(height) > spread(multiply) && Math.min(...height) < Math.min(...multiply));
  await paint({ grainMin: 0.3, grainMovement: 0, grainRotation: 30, grainFollow: 1, grainRef: 12 }, 120);
  check('Depth minimum, rolling grain, rotation and size-following scale paint without errors', row(120).some((a) => a > 0) && errors.length === 0);
  await paint({ grain: 0, taperStart: 120, taperEnd: 0, taperSize: 0.5, taperOpacity: 0.8 }, 220);
  const at = (x: number) => { const d = app.drawing.line.getContext('2d')!.getImageData(x, 205, 1, 30).data; let n = 0, top = 0; for (let i = 3; i < d.length; i += 4) { if (d[i]! > 20) n++; top = Math.max(top, d[i]!); } return { n, top }; };
  const start = at(44), mid = at(300);
  check('Taper size 0.5 keeps the start half as thick, taper opacity fades it', start.n >= mid.n * 0.3 && start.n < mid.n && start.top < mid.top);

  // canvas cursor choices (App settings > Pen and tablet): the browser must accept each one
  const prefs = app.penPrefs;
  app.setTool('brush');
  const cursorOf = (c: 'crosshair' | 'circle' | 'dot' | 'brush' | 'none') => { app.setPenPrefs({ ...prefs, cursor: c }); return canvas.style.cursor; };
  check('Crosshair is the default cursor', prefs.cursor === 'crosshair' && cursorOf('crosshair') === 'crosshair');
  check('Small circle, Dot and None are accepted by the browser', /^url\(/.test(cursorOf('circle')) && /^url\(/.test(cursorOf('dot')) && cursorOf('none') === 'none');
  const ringSize = () => Number(/width%3D%22(\d+)%22/.exec(canvas.style.cursor)?.[1] ?? 0);
  cursorOf('brush'); const r1 = ringSize();
  app.view.zoom *= 1.5; app.requestRender(); await settle(100); const r2 = ringSize();
  check(`Brush size follows the zoom (${r1} → ${r2} px)`, r1 > 0 && r2 > r1);
  app.setPenPrefs({ ...prefs, cursor: 'crosshair' });
} catch (e) { check(String(e), false); }
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed · ${innerWidth}×${innerHeight}`;
