// Runs the browser fixtures (tests/*.html) in headless Chrome in real time and prints each summary.
// Start a dev server on its own origin first: npx vite --host 127.0.0.1 --port 5217
// Usage: npm run test:browser [-- --base http://127.0.0.1:5217] [fixture names...]
// Chrome's --virtual-time-budget leaves fixtures that wait on IndexedDB, image encoding or animation
// frames on "Running…", so this drives a normal headless tab over the DevTools protocol instead.
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const at = args.indexOf('--base');
const base = at >= 0 ? args.splice(at, 2)[1] : 'http://127.0.0.1:5217';
const names = args.length ? args : readdirSync('tests').filter((f) => f.endsWith('.html') && !f.startsWith('_')).map((f) => f.slice(0, -5)).sort();
const chromePath = process.env.CHROME ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const LIMIT_S = 240;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), '2dope-fixtures-'));
const port = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });

let failed = 0;
try {
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) { try { ready = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { await sleep(200); } }
  if (!ready) throw new Error(`Chrome did not start (${chromePath}); set CHROME to its path.`);
  for (const name of names) {
    const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?${base}/tests/${name}.html`, { method: 'PUT' })).json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d.result); pending.delete(d.id); });
    const value = (expression) => new Promise((r) => { pending.set(++id, (res) => r(res?.result?.value)); ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } })); });
    let summary = '';
    for (let s = 0; s < LIMIT_S; s++) {
      await sleep(1000);
      summary = (await value(`document.querySelector('#summary')?.textContent ?? ''`)) ?? '';
      if (summary && !/^Running|Timed out$/.test(summary)) break;
    }
    const fails = (await value(`[...document.querySelectorAll('#results li')].map((l) => l.textContent).filter((t) => t.startsWith('FAIL'))`)) ?? [];
    const ok = !!summary && !fails.length && !/^Running/.test(summary) && !/[1-9]\d* failed/.test(summary);
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${summary || 'no summary'}`);
    const measurements = (await value(`[...document.querySelectorAll('#results li')].map((l) => l.textContent).filter((t) => t.startsWith('Measured:'))`)) ?? [];
    for (const measurement of measurements) console.log(`       ${measurement}`);
    for (const f of fails) console.log(`       ${f.slice(0, 240)}`);
    ws.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${tab.id}`);
  }
} finally {
  chrome.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold files */ }
}
console.log(`${names.length - failed} of ${names.length} fixtures passed`);
process.exit(failed ? 1 : 0);
