/** Every layer in Draw's and Animate's Layers panel can be deleted, the other layers of the shot too. */
import { App } from '../app';
import { Project } from '../core/project';
import { defaultCaption } from '../lettering/spec';
import { LayerCards } from './layercards';

const app = new App(document.querySelector<HTMLCanvasElement>('#canvas')!, document.querySelector<HTMLElement>('#stage')!);
const cards = new LayerCards(app);
const errors: string[] = [];
addEventListener('error', e => errors.push(e.message));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
app.loadProject(new Project(320, 180)); app.project.comp.duration = 24; app.setWorkspace('draw');
app.editor.onChange = () => cards.update(); app.history.onChange = () => cards.update();
const wait = (ms = 60) => new Promise<void>(r => setTimeout(r, ms));
const expect = (ok: unknown, reason: string) => { if (!ok) throw new Error(reason); };
let passed = 0, failed = 0;
const check = async (name: string, fn: () => void | Promise<void>) => {
  const li = document.createElement('li');
  try { await fn(); passed++; li.textContent = `PASS: ${name}`; } catch (e) { failed++; li.textContent = `FAIL: ${name}: ${(e as Error).message}`; console.error(e); }
  document.querySelector('#results')!.append(li);
};
const others = () => [...document.querySelectorAll<HTMLElement>('.lc-other')];
const row = (name: string) => others().find(r => r.querySelector('.lc-other-name')?.textContent?.startsWith(name));
const menuItem = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.ctxmenu button')].find(b => b.textContent?.includes(label));
const confirmDelete = async () => { await wait(); const ok = [...document.querySelectorAll<HTMLButtonElement>('dialog button, .dialog button, [role=dialog] button')].find(b => b.textContent === 'Delete'); if (!ok) throw new Error('no confirm dialog'); ok.click(); await wait(); };
const names = () => app.project.comp.layers.map(l => l.name);

// the layer you draw on, another drawing, a caption and a group, all in one shot
const ed = app.editor;
ed.addLayer('drawings'); ed.addLayer('drawings');
const [a, b] = app.project.comp.layers.filter(l => l.kind === 'drawings');
ed.rename(a!.id, 'Hero'); ed.rename(b!.id, 'Sky');
ed.addLayer('drawings');
const capId = app.project.comp.layers.find(l => l.kind === 'drawings' && l.name !== 'Hero' && l.name !== 'Sky')!.id;
ed.edit('cap', c => { const x = c.layers.find(y => y.id === capId); if (x?.kind === 'drawings') { x.name = 'Balloon'; x.caption = { ...defaultCaption(160, 60), text: 'Hi' }; } });
ed.addLayer('drawings');
const loose = app.project.comp.layers.find(l => l.kind === 'drawings' && !['Hero', 'Sky', 'Balloon'].includes(l.name))!.id;
ed.rename(loose, 'Prop');
const group = ed.group([loose], 'Props')!;
app.pickLayer(app.project.comp.layers.find(l => l.name === 'Hero')!.id);
cards.toggle(document.querySelector<HTMLElement>('#anchor')!); await wait(120);

await check('Other layers in the shot are listed, captions and groups too, each with a ⋯ menu', () => {
  for (const n of ['Sky', 'Balloon', 'Props']) expect(row(n)?.querySelector('.lc-other-more'), `no ⋯ for ${n} (rows: ${others().map(r => r.textContent).join(' | ')})`);
  expect(row('Balloon')!.textContent!.includes('caption') && row('Props')!.textContent!.includes('group'), 'kinds not shown');
});

for (const name of ['Sky', 'Balloon', 'Props']) {
  await check(`${name}: Delete layer from its ⋯ menu removes it, and Undo brings it back`, async () => {
    app.history.clear();
    row(name)!.querySelector<HTMLButtonElement>('.lc-other-more')!.click(); await wait();
    const del = menuItem('Delete layer');
    expect(del, 'no Delete layer in the menu');
    del!.click(); await confirmDelete();
    expect(!names().includes(name) && !row(name), `${name} is still there`);
    app.undo(); await wait();
    expect(names().includes(name) && row(name), `${name} did not come back`);
  });
}

await check('Hold or right-click a row opens the same menu', async () => {
  row('Sky')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })); await wait();
  expect(menuItem('Delete layer') && menuItem('Rename') && menuItem('Duplicate'), 'context menu incomplete');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait();
  void group;
});

await check('No page errors', () => { expect(!errors.length, errors.join(' | ')); });
document.querySelector('#summary')!.textContent = `${failed ? 'FAILED' : 'PASSED'}: ${passed} passed, ${failed} failed`;
