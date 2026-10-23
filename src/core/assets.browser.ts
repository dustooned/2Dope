/** Real PNG/ZIP/residency regression, opened through /tests/assets.html. */
import { Project } from './project';
import { compLayer, drawingsLayer, newComp } from './comp';
import { Residency } from './residency';
import { captureProject, loadProjectFile } from '../io/projectio';
import { parseProjectFile, stringifyProjectFile } from '../io/schema';
import { readZip, writeZip } from '../io/zip';
import { drawComp } from '../view/composite';
import { domPlaneOps } from '../view/planeops';

let passed = 0, failed = 0;
function check(name: string, ok: boolean) {
  const li = document.createElement('li');
  li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}`;
  document.querySelector('#results')!.append(li);
  if (ok) passed++; else failed++;
}
const p = new Project(16, 16);
const source = newComp(p.newId('c'), 'Sky', 16, 16, 12); source.asset = true;
const blue = p.newDrawing(), red = p.newDrawing();
const paint = (c: HTMLCanvasElement, color: string, x = 0) => {
  const g = c.getContext('2d')!; g.fillStyle = color; g.fillRect(x, 0, 16 - x, 16);
};
paint(blue.line, '#0000ff'); paint(red.line, '#ff0000', 8);
p.comps.set(source.id, source);
source.layers.push(drawingsLayer(p.newId('L'), 'Clouds', [{drawing: red.id, length: 1}], 16, 16));
source.layers.push(drawingsLayer(p.newId('L'), 'Sky colour', [{drawing: blue.id, length: 1}], 16, 16));
for (let n = 0; n < 2; n++) {
  const l = compLayer(p.newId('L'), 'Sky', source, p.comp); l.play = 'loop'; l.locked = true;
  p.comp.layers.push(l);
}
const unused = newComp(p.newId('c'), 'Unplaced prop', 16, 16, 12); unused.asset = true;
const prop = p.newDrawing(); paint(prop.line, '#00ff00');
unused.layers.push(drawingsLayer(p.newId('L'), 'Prop', [{drawing: prop.id, length: 1}], 16, 16));
p.comps.set(unused.id, unused);
const archive = async (project: Project, assets?: Map<string, Uint8Array>) => {
  const saved = await captureProject(project, {mode:'archive', source: async k => assets?.get(k) ?? null}).settle();
  const zip = writeZip([
    {name:'project.json', data:new TextEncoder().encode(stringifyProjectFile(saved.file))},
    ...[...saved.assets].map(([name,data]) => ({name,data})),
  ]);
  const entries = await readZip(zip);
  const file = parseProjectFile(new TextDecoder().decode(entries.get('project.json')!));
  return {entries, project:loadProjectFile(file).project};
};
try {
  const first = await archive(p);
  const sourceBytes = (loaded: Awaited<ReturnType<typeof archive>>) => [blue.id, red.id, prop.id].every(id => {
    const key = loaded.project.drawing(id).parked?.line?.key;
    return !!key && (loaded.entries.get(key)?.length ?? 0) > 0;
  });
  check('Standalone archive contains both painted source planes and the unplaced prop', sourceBytes(first));
  check('Source marker, layers and two linked placements survive validated ZIP reload',
    first.project.comps.get(source.id)?.asset === true && first.project.comps.get(source.id)?.layers.length === 2 &&
    first.project.comp.layers.filter(l => l.kind === 'comp' && l.comp === source.id).length === 2);
  check('Unplaced editable asset survives reload', first.project.comps.get(unused.id)?.asset === true);
  check('Reload starts in the shot; source pixels are parked', first.project.activeComp === first.project.main && !!first.project.drawing(blue.id).parked);
  // Re-export while still parked, proving it does not depend on decoded canvases.
  const second = await archive(first.project, first.entries);
  check('Re-export from parked sources carries all PNG bytes', sourceBytes(second));
  const r = new Residency(domPlaneOps, async k => second.entries.get(k) ?? null);
  r.setProject(second.project);
  for (const d of second.project.drawings.values()) await r.pin(d);
  const render = () => {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    drawComp(c.getContext('2d')!, second.project, second.project.comp, 0, {export:true});
    return c.getContext('2d')!;
  };
  // Brave canvas privacy can change an RGB channel by one even on an opaque solid.
  const pixel = (g: CanvasRenderingContext2D, x: number, expected: number[]) =>
    [...g.getImageData(x, 8, 1, 1).data].every((v, i) => Math.abs(v - expected[i]!) <= 1);
  let g = render();
  check('Reloaded source preserves bottom blue and top red layers', pixel(g, 4, [0,0,255,255]) && pixel(g, 12, [255,0,0,255]));
  const redRestored = second.project.drawing(red.id); redRestored.line.getContext('2d')!.clearRect(0,0,16,16); redRestored.rev++;
  paint(second.project.drawing(blue.id).line, '#00ff00'); second.project.drawing(blue.id).rev++;
  g = render();
  check('Editing the loaded source updates linked composite pixels', pixel(g,4,[0,255,0,255]) && pixel(g,12,[0,255,0,255]));
  const greenLink = second.project.comp.layers.find(l => l.kind === 'comp')!;
  second.project.comp.layers = second.project.comp.layers.filter(l => l.id !== greenLink.id);
  check('Remaining placement still references the same edited source', pixel(render(), 12,[0,255,0,255]));
  for (const d of second.project.drawings.values()) r.unpin(d);
} catch (e) { check(String(e), false); }
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
