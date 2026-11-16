/**
 * Performance audit: boots the real app (index.html) in an iframe on this test origin, builds
 * long / layered / big projects from code and times the paths students use most: scrubbing the
 * Flipbook and Motion, playback with onion skin, switching workspaces, autosave and export, with
 * the residency budget watched throughout. Prints "Measured:" lines and checks generous limits.
 *
 * Query: ?frames=240&layers=20&big=1 (defaults are sized to run in about a minute).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export {};
const q = new URLSearchParams(location.search);
const FRAMES = +(q.get('frames') ?? 240), LAYERS = +(q.get('layers') ?? 20), BIG = q.get('big') !== '0', EXPORTS = q.get('export') !== '0';
let passed = 0, failed = 0;
const li = (t: string) => { const e = document.createElement('li'); e.textContent = t; document.querySelector('#results')!.append(e); };
const check = (name: string, ok: boolean, detail = '') => { li(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` (${detail})` : ''}`); if (ok) passed++; else failed++; };
const report = (t: string) => li(`Measured: ${t}`);
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const pct = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]!; };
const ms = (n: number) => `${n.toFixed(1)}ms`;
const MB = 1024 * 1024;

// a fresh test origin profile: skip the first-run tour (never clears anything)
try { localStorage.setItem('2dope.firstrun.done', '1'); } catch { /* optional */ }
const frame = document.querySelector<HTMLIFrameElement>('#app')!;
frame.src = '/index.html';
await new Promise(r => frame.addEventListener('load', r, { once: true }));
const w = frame.contentWindow as any;
for (let i = 0; i < 200 && !w.__2dope; i++) await sleep(50);
const app = w.__2dope;
const errors: string[] = [];
// ResizeObserver's loop notice is a browser warning, not an app error
w.addEventListener('error', (e: ErrorEvent) => { if (!/ResizeObserver loop/.test(e.message)) errors.push(e.message); });
w.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => errors.push(String(e.reason)));
const mod = (path: string): Promise<any> => w.eval(`import(${JSON.stringify(path)})`);
const { Project } = await mod('/src/core/project.ts');
const { drawingsLayer } = await mod('/src/core/comp.ts');
const raf = () => new Promise<number>(r => w.requestAnimationFrame(r));

// --- instrumentation: render, frame-change hooks and long tasks inside the app's window ----------
const timing = { render: [] as number[], hooks: [] as number[] };
{
  const render = app.render;
  app.render = function (this: unknown) { const t = performance.now(); render.call(app); timing.render.push(performance.now() - t); };
  const hooks = app.onFrameChange;
  app.onFrameChange = () => { const t = performance.now(); hooks(); timing.hooks.push(performance.now() - t); };
}
const longTasks: number[] = [];
try { new w.PerformanceObserver((l: any) => { for (const e of l.getEntries()) longTasks.push(e.duration); }).observe({ entryTypes: ['longtask'] }); } catch { /* not supported */ }
const reset = () => { timing.render.length = 0; timing.hooks.length = 0; longTasks.length = 0; };
const heapMB = () => (performance as any).memory ? +((w.performance.memory.usedJSHeapSize as number) / MB).toFixed(1) : NaN;
const nodes = () => w.document.getElementsByTagName('*').length;
const budget = app.residency.budget as number;
let peakLive = 0;
const watchLive = () => { peakLive = Math.max(peakLive, app.residency.liveBytes()); };

// --- project generation: parked drawings holding PNG bytes, as a project opened from the library ----
async function pngPool(width: number, height: number, n: number): Promise<{ line: Uint8Array; fill: Uint8Array }[]> {
  const c = w.document.createElement('canvas'); c.width = width; c.height = height;
  const g = c.getContext('2d')!;
  const enc = async () => new Uint8Array(await (await new Promise<Blob>(r => c.toBlob((b: Blob) => r(b), 'image/png'))).arrayBuffer());
  const out: { line: Uint8Array; fill: Uint8Array }[] = [];
  for (let i = 0; i < n; i++) {
    const cx = width * (0.2 + 0.6 * i / n), cy = height * 0.5, r = height * 0.18;
    g.clearRect(0, 0, width, height); g.fillStyle = `hsl(${i * 37 % 360} 70% 60%)`;
    g.beginPath(); g.ellipse(cx, cy, r, r * 1.3, 0, 0, Math.PI * 2); g.fill();
    const fill = await enc();
    g.clearRect(0, 0, width, height); g.strokeStyle = '#1d1d24'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.ellipse(cx, cy, r, r * 1.3, 0, 0, Math.PI * 2);
    for (let k = 0; k < 40; k++) g.lineTo(cx + Math.sin(k * 1.7 + i) * r * 1.6, cy + Math.cos(k * 2.3 + i) * r * 1.2);
    g.stroke();
    out.push({ line: await enc(), fill });
  }
  c.width = c.height = 0;
  return out;
}
/** A shot of `frames` frames on `layers` drawings layers, one drawing per frame per layer (`hold` frames each). */
async function makeShot(width: number, height: number, frames: number, layers: number, hold = 1, fps = 24): Promise<any> {
  const pool = await pngPool(width, height, 12);
  const p = new Project(width, height);
  p.name = `Perf ${frames}f ${layers}L ${width}x${height}`;
  const comp = p.comp; comp.fps = fps; comp.duration = frames;
  comp.layers.length = 0;
  for (const d of [...p.drawings.keys()]) p.drawings.delete(d);
  let num = 1;
  for (let L = 0; L < layers; L++) {
    const ex: { drawing: string; length: number }[] = [];
    for (let f = 0; f < frames; f += hold) {
      const png = pool[(f / hold + L * 5) % pool.length]!;
      const d = p.adopt(`d${num}`, num, [], null, { rev: 0, line: { key: null, bytes: png.line }, fill: { key: null, bytes: png.fill } });
      num++;
      ex.push({ drawing: d.id, length: Math.min(hold, frames - f) });
    }
    comp.layers.push(drawingsLayer(`L${L + 1}`, `Layer ${L + 1}`, ex, width, height));
  }
  p.activeLayer = 'L1';
  return p;
}
async function settle() {
  await app.residency.settle();
  await raf(); await raf();
}
async function open(p: any): Promise<number> {
  const t = performance.now();
  app.loadProject(p);
  await raf(); await raf();
  return performance.now() - t;
}
function ws(name: string) { w.document.querySelector(`.wsbar [data-ws="${name}"], [data-ws="${name}"]`)?.click(); }

/** Step the playhead frame by frame like a scrub; each step waits one animation frame. */
async function scrub(from: number, count: number, label: string) {
  reset();
  const steps: number[] = [];
  let blanks = 0;
  const t0 = performance.now();
  for (let i = 0; i < count; i++) {
    const t = performance.now();
    app.setFrame(from + i);
    await raf();
    steps.push(performance.now() - t);
    if (app.drawing?.parked) blanks++;
    watchLive();
  }
  const total = performance.now() - t0;
  const r = { label, steps, total, render: [...timing.render], hooks: [...timing.hooks], long: [...longTasks], blanks };
  report(`${label}: ${count} frames in ${ms(total)} (${(count / total * 1000).toFixed(1)} fps); step p50 ${ms(pct(steps, .5))} p95 ${ms(pct(steps, .95))}; render p50 ${ms(pct(r.render, .5))} p95 ${ms(pct(r.render, .95))}; frame hooks p50 ${ms(pct(r.hooks, .5))} p95 ${ms(pct(r.hooks, .95))}; long tasks ${r.long.length} (max ${ms(Math.max(0, ...r.long))}); parked when shown ${blanks}`);
  return r;
}
async function play(seconds: number, label: string) {
  reset();
  const f0 = app.frame;
  let frames = 0, last = app.frame;
  app.togglePlay();
  const t0 = performance.now();
  while (performance.now() - t0 < seconds * 1000) { await raf(); if (app.frame !== last) { frames++; last = app.frame; } watchLive(); }
  const total = performance.now() - t0;
  app.togglePlay();
  const expected = Math.floor(total / 1000 * app.project.fps);
  const r = { frames, expected, render: [...timing.render], hooks: [...timing.hooks], long: [...longTasks] };
  report(`${label}: showed ${frames} of ${expected} frames in ${ms(total)} (${(frames / total * 1000).toFixed(1)} fps of ${app.project.fps}); render p50 ${ms(pct(r.render, .5))} p95 ${ms(pct(r.render, .95))}; frame hooks p50 ${ms(pct(r.hooks, .5))} p95 ${ms(pct(r.hooks, .95))}; long tasks ${r.long.length} (max ${ms(Math.max(0, ...r.long))}); started at ${f0}`);
  return r;
}

const results: Record<string, any> = {};
try {
  await sleep(500);
  report(`Residency budget ${(budget / MB).toFixed(0)} MB; app window ${w.innerWidth}×${w.innerHeight}; heap ${heapMB()} MB; DOM ${nodes()} elements`);

  // 1. A long shot at 1920×1080
  let t = performance.now();
  const long = await makeShot(1920, 1080, FRAMES, 1);
  report(`Long shot built: ${FRAMES} frames 1920×1080 in ${ms(performance.now() - t)}`);
  ws('draw');
  if (!app.flipbook) app.setFlipbook(true);
  const openMs = await open(long);
  await settle();
  report(`Long shot opened in ${ms(openMs)}; DOM ${nodes()} elements; heap ${heapMB()} MB; live canvases ${(app.residency.liveBytes() / MB).toFixed(0)} MB`);

  results.scrubDraw = await scrub(0, Math.min(FRAMES, 120), 'Scrub Draw (Flipbook)');
  check('Draw scrub keeps up (median step under 50 ms)', pct(results.scrubDraw.steps, .5) < 50, ms(pct(results.scrubDraw.steps, .5)));
  check('Draw frame-change hooks stay light (p95 under 25 ms)', pct(results.scrubDraw.hooks, .95) < 25, ms(pct(results.scrubDraw.hooks, .95)));

  app.onion.enabled = true; app.onion.before = 2; app.onion.after = 2; app.onionChanged();
  app.setFrame(0); await settle();
  results.playOnion = await play(4, 'Play with onion skin 2+2 (24 fps)');
  check('Playback with onion skin shows most frames (over 60%)', results.playOnion.frames >= results.playOnion.expected * 0.6, `${results.playOnion.frames}/${results.playOnion.expected}`);
  app.onion.enabled = false; app.onionChanged();
  results.playPlain = await play(4, 'Play without onion skin (24 fps)');

  ws('motion'); await sleep(400); await settle();
  results.scrubMotion = await scrub(0, Math.min(FRAMES, 120), 'Scrub Motion');
  check('Motion scrub keeps up (median step under 60 ms)', pct(results.scrubMotion.steps, .5) < 60, ms(pct(results.scrubMotion.steps, .5)));
  check('Motion frame-change hooks stay light (p95 under 40 ms)', pct(results.scrubMotion.hooks, .95) < 40, ms(pct(results.scrubMotion.hooks, .95)));

  // 2. Switching workspaces
  {
    const times: Record<string, number[]> = {};
    for (let round = 0; round < 3; round++)
      for (const name of ['draw', 'animate', 'time', 'motion', 'board', 'draw']) {
        const t1 = performance.now(); ws(name); const sync = performance.now() - t1; await raf(); await raf();
        (times[name] ??= []).push(sync);
      }
    report(`Workspace switch (click handler, worst of 3): ${Object.entries(times).map(([k, v]) => `${k} ${ms(Math.max(...v))}`).join(', ')}`);
    results.ws = times;
    check('Workspace switches respond in under 250 ms', Object.values(times).every(v => Math.max(...v) < 250));
  }

  // 3. Memory: the residency budget holds through a long scrub
  ws('draw'); await settle();
  report(`Peak live canvases ${(peakLive / MB).toFixed(0)} MB of ${(budget / MB).toFixed(0)} MB budget; now ${(app.residency.liveBytes() / MB).toFixed(0)} MB; heap ${heapMB()} MB; DOM ${nodes()} elements`);
  check('Live canvases stay within the residency budget (+3 planes slack)', app.residency.liveBytes() <= budget + 3 * 1920 * 1080 * 8);

  // 4. Autosave of the long shot (every drawing still in memory as PNG bytes)
  {
    const files = w.__files;
    const saver = files?.autosaver;
    if (saver) {
      // as a project made in the library (its own card on this test origin)
      const p = app.project, now = Date.now();
      saver.open({ id: `pperf${now.toString(36)}`, name: p.name, folder: null, created: now, modified: now, opened: now, frames: FRAMES, drawings: p.drawings.size, fps: p.fps, width: p.width, height: p.height, thumb: null }, false);
      reset();
      const t1 = performance.now();
      await saver.flush(); await saver.idle();
      const took = performance.now() - t1;
      report(`Autosave of the long shot: ${ms(took)}; state ${saver.state}; long tasks ${longTasks.length} (max ${ms(Math.max(0, ...longTasks))}, total ${ms(longTasks.reduce((a, b) => a + b, 0))})`);
      reset();
      app.onDocChanged();
      const t2 = performance.now();
      await saver.flush(); await saver.idle();
      report(`Autosave again with nothing new: ${ms(performance.now() - t2)}; long tasks ${longTasks.length} (max ${ms(Math.max(0, ...longTasks))})`);
      results.autosave = took;
      check('Autosave finishes', saver.state === 'saved', saver.state);
    } else report('Autosave: no file UI (skipped)');
  }

  // 5. Many layers
  {
    const layered = await makeShot(1920, 1080, 48, LAYERS);
    ws('draw'); await open(layered); app.setShowLayers(true); await settle();
    results.layersDraw = await scrub(0, 24, `Scrub ${LAYERS} layers in Draw (layers around shown)`);
    ws('motion'); await sleep(300); await settle();
    results.layersMotion = await scrub(0, 24, `Scrub ${LAYERS} layers in Motion`);
    check(`${LAYERS} layers: Motion scrub median under 150 ms`, pct(results.layersMotion.steps, .5) < 150, ms(pct(results.layersMotion.steps, .5)));
    report(`${LAYERS} layers: peak live canvases ${(peakLive / MB).toFixed(0)} MB; DOM ${nodes()} elements`);
    ws('draw'); app.setShowLayers(false);
  }

  // 6. Big pictures (4K page)
  if (BIG) {
    const big = await makeShot(3840, 2160, 24, 2);
    ws('draw'); await open(big); await settle();
    results.big = await scrub(0, 24, 'Scrub 3840×2160, 2 layers in Draw');
    ws('motion'); await sleep(300); await settle();
    results.bigMotion = await scrub(0, 24, 'Scrub 3840×2160, 2 layers in Motion');
    ws('draw');
  }

  // 7. Export
  if (EXPORTS) {
    const shot = await makeShot(1920, 1080, 48, 2);
    await open(shot); await settle();
    const hold = { pin: (d: any) => app.residency.pin(d), unpin: (d: any) => app.residency.unpin(d) };
    const { exportSequence } = await mod('/src/io/exportseq.ts');
    const { DEFAULT_EXPORT } = await mod('/src/io/exportplan.ts');
    reset(); let t1 = performance.now();
    const seq = await exportSequence(app.project, { ...DEFAULT_EXPORT }, [], () => {}, undefined, hold);
    report(`PNG sequence 48 frames 1920×1080 ×2 layers: ${ms(performance.now() - t1)} (${ms((performance.now() - t1) / 48)}/frame), ${(seq.zip.length / MB).toFixed(1)} MB; long tasks ${longTasks.length} (max ${ms(Math.max(0, ...longTasks))})`);
    const { exportGif } = await mod('/src/io/exportgif.ts');
    reset(); t1 = performance.now();
    const gif = await exportGif(app.project, false, new AbortController().signal, hold, () => {});
    report(`GIF 48 frames: ${ms(performance.now() - t1)}, ${(gif.size / MB).toFixed(1)} MB; long tasks ${longTasks.length} (max ${ms(Math.max(0, ...longTasks))})`);
    try {
      const { exportVideo } = await mod('/src/io/exportvideo.ts');
      reset(); t1 = performance.now();
      const v = await exportVideo(app.project, { format: 'webm', size: '720p', quality: 'standard', background: 'white' }, () => {}, new AbortController().signal, hold);
      report(`Video (WebM 720p) 48 frames: ${ms(performance.now() - t1)}, ${(v.blob.size / MB).toFixed(2)} MB; long tasks ${longTasks.length} (max ${ms(Math.max(0, ...longTasks))})`);
    } catch (e) { report(`Video export unavailable here: ${(e as Error).message}`); }
  }

  // 8. Leaks: reopen projects and scrub; heap and DOM should not keep growing
  {
    const heaps: number[] = [], doms: number[] = [];
    for (let i = 0; i < 4; i++) {
      await open(await makeShot(1920, 1080, 48, 3)); await settle();
      ws('motion'); await raf(); ws('draw'); await raf();
      for (let f = 0; f < 24; f++) { app.setFrame(f); await raf(); }
      await sleep(200);
      heaps.push(heapMB()); doms.push(nodes());
    }
    report(`Reopen ×4: heap ${heaps.join(' → ')} MB; DOM ${doms.join(' → ')} elements; live canvases ${(app.residency.liveBytes() / MB).toFixed(0)} MB`);
    check('DOM does not grow with each reopen (under 20% over 4 reopens)', doms[3]! <= doms[0]! * 1.2, `${doms[0]} → ${doms[3]}`);
  }
  check('No errors in the app', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (e) {
  check(`Audit ran: ${(e as Error).stack ?? e}`, false);
}
(window as any).__perf = results;
document.querySelector('#summary')!.textContent = `${passed} passed, ${failed} failed`;
