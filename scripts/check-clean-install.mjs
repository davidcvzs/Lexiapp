import { mkdtemp, cp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { parse } from 'dotenv';

// A separate temporary copy never contains local credentials, evidence, data or node_modules.
const folder = await mkdtemp(join(tmpdir(), 'lexia-clean-'));
const names = ['src', 'server', 'shared', 'scripts', 'public', 'workers', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'tsconfig.server.json', 'tsconfig.server.build.json', 'tsconfig.tools.json', 'vite.config.ts', 'eslint.config.js', 'index.html', 'test-firebase.ts', 'test-openai.ts'];
const environment = {};
for (const [key, value] of Object.entries(process.env)) if (/^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|HOME|HTTPS?_PROXY|NO_PROXY)$/i.test(key)) environment[key] = value;
let local = {};
try { local = parse(await readFile('.env.local')); } catch { /* CI supplies public build variables directly. */ }
for (const key of ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID', 'VITE_FIREBASE_STORAGE_BUCKET', 'VITE_FIREBASE_MESSAGING_SENDER_ID', 'VITE_FIREBASE_APP_ID']) environment[key] = process.env[key] || local[key] || '';
environment.CI = 'true';
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Ejecuta con npm run check:clean.');
try {
  for (const name of names) await cp(name, join(folder, name), { recursive: true,
    filter: source => !/(^|[\\/])(node_modules|\.build|\.wrangler|\.dev\.vars(?:\.[^\\/]*)?)([\\/]|$)/.test(source) });
  for (const args of [['ci'], ['run', 'check']]) {
    const status = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [npm, ...args], { cwd: folder, env: environment, stdio: 'inherit', windowsHide: true });
      child.on('error', reject); child.on('exit', code => resolve(code));
    });
    if (status !== 0) throw new Error('Falló la verificación en una instalación limpia.');
  }
  console.log('Instalación limpia aprobada: npm ci, lint, tipos, compilación y pruebas sin credenciales privadas.');
} finally {
  // folder is an absolute mkdtemp path owned exclusively by this run.
  if (!folder.startsWith(join(tmpdir(), 'lexia-clean-'))) throw new Error('Ruta temporal fuera del directorio previsto.');
  await rm(folder, { recursive: true, force: true });
}
