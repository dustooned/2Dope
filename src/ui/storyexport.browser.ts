/** Actual App, BoardPanel and ShareView: subtitle lines on the Story cards, storyboard and animatic export. */
import { App } from '../app';
import { Project } from '../core/project';
import type { SoundBank } from '../io/sound';
import { paintAnimatic } from '../io/animatic';
import { boardCues } from '../core/dialogue';
import { BoardPanel } from './board';
import { ShareView } from './share';

const keys = ['2dope.share.kind', '2dope.share.animatic', '2dope.board.export', '2dope.video-export', '2dope.board.view'];
const saved = keys.map((k) => localStorage.getItem(k));
for (const k of keys) localStorage.removeItem(k);
localStorage.setItem('2dope.video-export', JSON.stringify({ format: 'webm', size: '720p', quality: 'standard', background: 'white' }));

const canvas = document.querySelector<HTMLCanvasElement>('#canvas')!, stage = document.querySelector<HTMLElement>('#stage')!;
const app = new App(canvas, stage);
app.loadProject(new Project(160, 90));
const notices: string[] = [];
app.onNotice = (m) => notices.push(m);
let exportCalls = 0;
const share = new ShareView(app, { sounds: {} as SoundBank, blender: () => {}, backup: () => {}, onOpenChange: () => {} });
const board = new BoardPanel(app, document.querySelector<HTMLElement>('#board')!, () => { exportCalls++; share.show(share.lastKind === 'animatic' ? 'animatic' : 'board'); });
const refresh = () => board.update();
app.onFrameChange = refresh; app.onWorkspaceChange = refresh; app.onThumbs = refresh; app.history.onChange = refresh;

const settle = (ms = 120) => new Promise<void>((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
function check(name: string, ok: boolean, info?: unknown) { const li = document.createElement('li'); li.textContent = `${ok ? 'PASS' : 'FAIL'}: ${name}${ok || info === undefined ? '' : ` ${JSON.stringify(info)}`}`; document.querySelector('#results')!.append(li); if (ok) passed++; else failed++; }
const card = (i: number) => document.querySelector<HTMLElement>(`.bcard[data-i="${i}"]`)!;
const rows = (i: number) => [...card(i).querySelectorAll<HTMLLIElement>('.bline-row')];
const type = (f: HTMLInputElement | HTMLTextAreaElement, v: string) => { f.focus(); f.value = v; f.dispatchEvent(new Event('input', { bubbles: true })); };
const key = (f: HTMLElement, k: string, shiftKey = false) => f.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));
const change = (f: HTMLElement) => f.dispatchEvent(new Event('change', { bubbles: true }));
const side = () => document.querySelector<HTMLElement>('.share-side')!;
const kindBtn = (label: string) => [...side().querySelectorAll<HTMLButtonElement>('.share-kinds button')].find((b) => b.querySelector('strong')?.textContent === label)!;
const checked = () => side().querySelector('.share-kinds [aria-checked=true] strong')?.textContent;
const goBtn = () => side().querySelector<HTMLButtonElement>('.share-go')!;
async function until(test: () => boolean, ms = 60000) { const t = performance.now(); while (!test() && performance.now() - t < ms) await settle(100); return test(); }
async function fetchBytes(a: HTMLAnchorElement | null) { return a ? new Uint8Array(await (await fetch(a.href)).arrayBuffer()) : new Uint8Array(); }
const text = (b: Uint8Array) => new TextDecoder('latin1').decode(b);

try {
  app.setWorkspace('board');
  app.createBoard();
  app.addPanel();
  await settle();
  const b = app.board!;
  check('Two panels to start with', b.exposures.length === 2);
  // paint the panels and the animation: blue board panel 1, red animation layer
  const pd = app.project.drawings.get(b.exposures[0]!.drawing)!;
  const pg = pd.line.getContext('2d')!; pg.fillStyle = '#1040e0'; pg.fillRect(0, 0, 160, 90);
  const anim = app.project.comp.layers.find((l) => l.kind === 'drawings' && !l.guide)!;
  if (anim.kind === 'drawings') { const ad = app.project.drawings.get(anim.exposures[0]!.drawing)!; const ag = ad.line.getContext('2d')!; ag.fillStyle = '#e01010'; ag.fillRect(0, 0, 40, 90); anim.exposures[0]!.length = 200; }

  // --- the subtitle lines on the Story card
  check('Each card has a dialogue block with one empty line', rows(0).length === 1 && rows(1).length === 1 && !!card(0).querySelector('.bdialogue .bspeaker[list="board-speakers"]'));
  const r0 = rows(0)[0]!;
  type(r0.querySelector<HTMLInputElement>('.bspeaker')!, 'Sam'); change(r0.querySelector('.bspeaker')!);
  key(r0.querySelector('.bspeaker')!, 'Enter');
  check('Return in Who moves to the words', document.activeElement === r0.querySelector('.bsay'));
  type(r0.querySelector<HTMLTextAreaElement>('.bsay')!, 'Hello  there'); change(r0.querySelector('.bsay')!);
  check('A line is stored as "Who: words" in the panel dialogue', app.board!.exposures[0]!.dialogue === 'Sam: Hello there', app.board!.exposures[0]!.dialogue);
  key(r0.querySelector('.bsay')!, 'Enter', true);
  await settle();
  check('Shift+Return adds a second line and focuses its Who', rows(0).length === 2 && document.activeElement === rows(0)[1]!.querySelector('.bspeaker'));
  const r1 = rows(0)[1]!;
  type(r1.querySelector<HTMLInputElement>('.bspeaker')!, 'Ann'); change(r1.querySelector('.bspeaker')!);
  type(r1.querySelector<HTMLTextAreaElement>('.bsay')!, 'Hi Sam, long time no see at all'); change(r1.querySelector('.bsay')!);
  check('Both lines are kept in order', app.board!.exposures[0]!.dialogue === 'Sam: Hello there\nAnn: Hi Sam, long time no see at all');
  const times = rows(0).map((r) => r.querySelector('.btime')!.textContent);
  check('Each line shows how long it plays in the animatic', times.every((t) => !!t) && times[0] !== times[1], times);
  key(r1.querySelector('.bsay')!, 'Enter');
  await settle();
  check('Return on the last line goes to the next panel\'s first line', document.activeElement === card(1).querySelector('.bsay[data-field="dialogue"]'));
  const n1 = card(1).querySelector<HTMLTextAreaElement>('.bsay')!;
  type(n1, 'Door slams'); change(n1);
  check('A line without a speaker is plain text', app.board!.exposures[1]!.dialogue === 'Door slams');
  n1.blur(); await settle();
  const typed = card(1).querySelector<HTMLTextAreaElement>('.bsay')!;
  type(typed, 'scrap this'); key(typed, 'Escape'); await settle();
  check('Escape drops the typing', app.board!.exposures[1]!.dialogue === 'Door slams' && card(1).querySelector<HTMLTextAreaElement>('.bsay')!.value === 'Door slams');
  check('Named speakers are offered on every line', [...document.querySelectorAll('#board-speakers option')].map((o) => (o as HTMLOptionElement).value).join(',') === 'Sam,Ann');
  const before = app.board!.exposures[0]!.dialogue;
  rows(0)[1]!.querySelector<HTMLButtonElement>('.bline-del')!.click(); await settle();
  check('Removing a line keeps the rest (one undo step)', app.board!.exposures[0]!.dialogue === 'Sam: Hello there' && app.history.peekUndo()?.label === 'Edit caption');
  app.undo(); await settle();
  check('Undo brings the line back on the card', app.board!.exposures[0]!.dialogue === before && rows(0).length === 2);
  // an older project's free-text dialogue loads as lines
  app.setCaption(1, 'dialogue', 'MOM: Dinner!\nwind howls');
  await settle();
  const old = rows(1).map((r) => [r.querySelector<HTMLInputElement>('.bspeaker')!.value, r.querySelector<HTMLTextAreaElement>('.bsay')!.value]);
  check('Older free-text dialogue shows as lines', JSON.stringify(old) === JSON.stringify([['MOM', 'Dinner!'], ['', 'wind howls']]), old);
  check('Card header names the unit and the start', card(0).querySelector('.bunit')?.textContent === 'fr' && /^@ /.test(card(0).querySelector('.bwhen')?.textContent ?? ''));
  check('Images button no longer uses the export icon', !!document.querySelector('.board-bar button[aria-label="Images"]') && document.querySelector('.board-bar button[aria-label="Images"] use, .board-bar button[aria-label="Images"] svg')?.outerHTML !== document.querySelector('.board-bar button[aria-label="Export"] svg')?.outerHTML);

  // --- Story's Export opens Share on the storyboard formats
  document.querySelector<HTMLButtonElement>('.board-bar button[aria-label="Export"]')!.click();
  await settle(300);
  check('Story Export opens Share on Storyboard', share.open && exportCalls === 1 && checked() === 'Storyboard');
  check('Animatic and Storyboard are both formats in Share', !!kindBtn('Animatic') && !!kindBtn('Storyboard'));
  await until(() => !goBtn().disabled, 5000);
  check('Storyboard summary counts panels and pages', /2 panels on 1 page/.test(side().querySelector('.share-summary')?.textContent ?? ''), side().querySelector('.share-summary')?.textContent);
  goBtn().click();
  await until(() => !!side().querySelector('.share-save'), 30000);
  const pdf = text(await fetchBytes(side().querySelector<HTMLAnchorElement>('.share-save')));
  check('Make storyboard PDF gives a PDF', pdf.startsWith('%PDF') && side().querySelector('.share-save')?.getAttribute('download')?.endsWith('-storyboard.pdf') === true);
  check('Sheets print each speaker and line', pdf.includes('(Sam: )') && pdf.includes('Hello there') && pdf.includes('(MOM: )'));
  side().querySelector<HTMLButtonElement>('.share-foot button:last-child')!.click(); await settle();
  const fmt = [...side().querySelectorAll<HTMLSelectElement>('select')].find((s) => s.getAttribute('aria-label') === 'Format')!;
  fmt.value = 'png'; fmt.dispatchEvent(new Event('change')); await settle();
  await until(() => !goBtn().disabled, 5000);
  goBtn().click();
  await until(() => !!side().querySelector('.share-save'), 30000);
  const zip = text(await fetchBytes(side().querySelector<HTMLAnchorElement>('.share-save')));
  check('Panel ZIP has panels, captions.csv and subtitles.srt', zip.includes('panels/panel_001.png') && zip.includes('captions.csv') && zip.includes('subtitles.srt') && zip.includes('00:00:00,000 --> '));
  check('Storyboard settings are remembered for every mode', JSON.parse(localStorage.getItem('2dope.board.export') ?? '{}').format === 'png');
  side().querySelector<HTMLButtonElement>('.share-foot button:last-child')!.click(); await settle();

  // --- the animatic
  kindBtn('Animatic').click(); await settle(200);
  const checks = [...side().querySelectorAll('.share-checks li')].map((l) => l.textContent ?? '');
  check('Animatic checks count panels and subtitle lines', checks.some((t) => /^2 panels · 4\.0 seconds/.test(t)) && checks.some((t) => /4 subtitle lines on 2 of 2 panels/.test(t)), checks);
  check('Animatic ends with its board, before the end of the shot', checks.some((t) => /ends with the last panel/.test(t)));
  check('Burn-in is on and the .srt file is off by default', side().querySelector<HTMLInputElement>('[data-sub=burn]')!.checked && !side().querySelector<HTMLInputElement>('[data-sub=srt]')!.checked);
  // the preview: board-only shows the blue panel (not the red animation) and a subtitle box
  // (Share redraws on resize too, so this does not depend on animation frames in a background tab)
  const redraw = () => window.dispatchEvent(new Event('resize'));
  app.setFrame(2); redraw(); await settle(200);
  const pv = document.querySelector<HTMLCanvasElement>('.share-canvas')!, pg2 = pv.getContext('2d')!;
  const px = (fx: number, fy: number) => [...pg2.getImageData(Math.round(pv.width * fx), Math.round(pv.height * fy), 1, 1).data];
  const left = px(0.1, 0.3), bottom = px(0.5, 0.85);
  check('Board-panel animatic leaves the animation out', left[2]! > 150 && left[0]! < 100, left);
  void bottom;
  // burn-in at a fixed size (the preview's size depends on the window)
  const burnt = (burn: boolean) => { const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, 320, 180); const bd = app.board!; paintAnimatic(g, app.project, app.project.comp, bd, 2, { picture: 'board', burn, srt: false }, boardCues(bd.exposures, bd.start), 320, 180); let dark = 0; const d = g.getImageData(0, 120, 320, 60).data; for (let i = 0; i < d.length; i += 4) if (d[i]! < 40 && d[i + 2]! < 90) dark++; return dark; };
  check('The dialogue line is burned in at the bottom', burnt(true) > 800 && burnt(false) === 0, [burnt(true), burnt(false)]);
  const pic = [...side().querySelectorAll<HTMLSelectElement>('select')].find((s) => s.getAttribute('aria-label') === 'Picture')!;
  pic.value = 'shot'; pic.dispatchEvent(new Event('change')); redraw(); await settle(200);
  const withAnim = px(0.1, 0.3);
  check('Board + animation draws the animation over the board', withAnim[0]! > 150 && withAnim[2]! < 100, withAnim);
  pic.value = 'board'; pic.dispatchEvent(new Event('change'));
  const srt = side().querySelector<HTMLInputElement>('[data-sub=srt]')!; srt.checked = true; srt.dispatchEvent(new Event('change')); await settle();
  check('Animatic choices are remembered', JSON.parse(localStorage.getItem('2dope.share.animatic') ?? '{}').srt === true);
  await until(() => !goBtn().disabled || /cannot|needs/.test(side().querySelector('.share-status')?.textContent ?? ''), 10000);
  if (goBtn().disabled) check('Video encoding is available in this browser', false, side().querySelector('.share-status')?.textContent);
  else {
    goBtn().click();
    await until(() => !!side().querySelector('.share-save') || /Could not/.test(side().querySelector('.share-status')?.textContent ?? ''), 120000);
    const vid = await fetchBytes(side().querySelector<HTMLAnchorElement>('.share-save'));
    check('Make animatic gives a video named -animatic', vid.length > 1000 && side().querySelector('.share-save')?.getAttribute('download')?.endsWith('-animatic.webm') === true, side().querySelector('.share-status')?.textContent);
    const v = side().querySelector<HTMLVideoElement>('video.share-result');
    if (v) await until(() => v.readyState >= 1, 8000);
    const end = (app.board!.start + app.board!.exposures.reduce((t, e) => t + e.length, 0)) / app.project.comp.fps;
    check('The animatic lasts as long as the board', !!v && Math.abs(v.duration - end) < 0.2, [v?.duration, end]);
    const subs = text(await fetchBytes(side().querySelector<HTMLAnchorElement>('.share-save-subs')));
    check('The subtitle file sits beside the video', /^1\r\n00:00:00,000 --> /.test(subs) && subs.includes('Sam: Hello there') && subs.includes('MOM: Dinner!') && side().querySelector('.share-save-subs')?.getAttribute('download')?.endsWith('-animatic.srt') === true, subs.slice(0, 80));
    side().querySelector<HTMLButtonElement>('.share-foot button:last-child')!.click(); await settle();
  }
  share.close(); await settle();
  check('Closing Share returns to Story', app.workspace === 'board');
  // the choice carries across: Story opens on Animatic now, Share from anywhere keeps it
  document.querySelector<HTMLButtonElement>('.board-bar button[aria-label="Export"]')!.click(); await settle(200);
  check('Story Export reopens on the last story format (Animatic)', checked() === 'Animatic');
  share.close(); app.setWorkspace('motion'); share.show(); await settle(200);
  check('Share from Motion keeps the same pick', checked() === 'Animatic');
  // the storyboard toggle in Video is the project setting every export follows
  kindBtn('Video').click(); await settle(150);
  const inc = side().querySelector<HTMLInputElement>('[data-include-board]')!;
  check('Video offers to put the storyboard in', !!inc && !inc.checked);
  inc.click(); await settle(150);
  check('That toggle is one project setting with an Undo step', app.board!.guideExport === true && app.history.peekUndo()?.label === 'Include board in export' && side().querySelector<HTMLInputElement>('[data-include-board]')!.checked);
  check('The Video checks follow it', [...side().querySelectorAll('.share-checks li')].some((l) => l.textContent === 'The storyboard is included'));
  share.close(); await settle();
  app.undo(); await settle();
  check('Undo leaves the storyboard out again', !app.board!.guideExport);
  check('No notices or errors along the way', !notices.some((n) => /error|could not/i.test(n)), notices);
} catch (e) {
  check('No exception', false, e instanceof Error ? `${e.message} ${e.stack}` : String(e));
} finally {
  keys.forEach((k, i) => { const v = saved[i]; if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); });
  document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
}
