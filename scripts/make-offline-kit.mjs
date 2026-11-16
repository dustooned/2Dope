// Builds the classroom offline kit: dist/ plus launchers and a student README, zipped.
// Usage: npm run package:offline   (runs after `npm run build`)
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

if (!existsSync('dist/index.html')) throw new Error('Run `npm run build` first.');
const out = 'dist-offline/2dope-offline';
rmSync('dist-offline', { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync('dist', out, { recursive: true });
cpSync('scripts/offline-kit', out, { recursive: true });
// Windows and macOS ship bsdtar, which writes real .zip files (GNU tar, e.g. from Git Bash, does not).
const run = (cmd, args) => execFileSync(cmd, args, { cwd: 'dist-offline', stdio: 'inherit' });
if (process.platform === 'win32') run(join(process.env.SystemRoot ?? 'C:/Windows', 'System32', 'tar.exe'), ['-a', '-c', '-f', '2dope-offline.zip', '2dope-offline']);
else if (process.platform === 'darwin') run('tar', ['-a', '-c', '-f', '2dope-offline.zip', '2dope-offline']);
else run('zip', ['-r', '-q', '2dope-offline.zip', '2dope-offline']);
console.log('Wrote dist-offline/2dope-offline.zip');
