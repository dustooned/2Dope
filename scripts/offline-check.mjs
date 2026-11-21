// Proves offline mode in a real browser: serves dist/, lets the service worker cache the app, stops the
// server, then reloads and fetches every precached file. Needs `npm run build` first and Chrome.
// Usage: npm run test:offline   (set CHROME to the browser path if it is not in the usual place)
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';

const dist = resolve('dist');
if (!existsSync(join(dist, 'sw.js'))) { console.error('dist/sw.js is missing: run npm run build first.'); process.exit(2); }
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm' };
const sockets = new Set();
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  let file = join(dist, path || 'index.html');
  if (!file.startsWith(dist)) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', vary: 'Origin' }).end(readFileSync(file));
});
server.on('connection', (s) => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
const PORT = 5193;
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const base = `http://127.0.0.1:${PORT}/`;

const chromePath = process.env.CHROME ?? (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), '2dope-offline-'));
const port = 9300 + Math.floor(Math.random() * 600);
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' });

const checks = [];
const check = (name, ok, detail = '') => { checks.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` (${detail})` : ''}`); };
try {
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) { try { ready = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { await sleep(200); } }
  if (!ready) throw new Error(`Chrome did not start (${chromePath}); set CHROME to its path.`);
  const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (m) => { const d = JSON.parse(m.data); pending.get(d.id)?.(d); pending.delete(d.id); });
  const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const value = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const until = async (expression, seconds) => { for (let s = 0; s < seconds * 4; s++) { if (await value(expression)) return true; await sleep(250); } return false; };

  // Online: load and let the worker cache everything.
  await send('Page.navigate', { url: base });
  check('app loads online', await until(`!!document.querySelector('canvas')`, 30));
  check('service worker ready', await until(`navigator.serviceWorker.ready.then(() => true)`, 30));
  const files = JSON.parse(readFileSync(join(dist, 'sw.js'), 'utf8').match(/const FILES = (\[.*?\]);/s)[1]);
  const cached = await until(`caches.keys().then(async (k) => k.length === 1 && (await (await caches.open(k[0])).keys()).length >= ${files.length})`, 60);
  check(`all ${files.length} files cached`, cached);

  // Offline: stop the server and drop every connection.
  await new Promise((r) => { server.close(r); sockets.forEach((s) => s.destroy()); });
  const dead = await value(`fetch('/__probe__' + Date.now(), { cache: 'no-store' }).then(() => false, () => true)`);
  check('server is unreachable', dead === true);
  await send('Page.navigate', { url: base });
  check('app reloads offline', await until(`!!document.querySelector('canvas')`, 30));
  const missing = await value(`Promise.all(${JSON.stringify(files)}.map((f) => fetch(f === './' ? './' : f).then((r) => r.ok ? '' : f, () => f))).then((a) => a.filter(Boolean).join(', '))`);
  check('every precached file is served offline', missing === '', missing);
  const hasManifest = await value(`fetch('manifest.webmanifest').then((r) => r.json()).then((m) => !!m.name && m.icons?.length > 0, () => false)`);
  check('manifest has a name and icons', hasManifest === true);
  ws.close();
} catch (e) {
  check('run completed', false, String(e.message ?? e));
} finally {
  chrome.kill();
  server.close();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold the profile */ }
}
const failed = checks.filter((c) => !c).length;
console.log(failed ? `\n${failed} of ${checks.length} checks failed` : `\nAll ${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
