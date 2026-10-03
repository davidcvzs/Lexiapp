import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

dotenv.config({ path: '.env.local', quiet: true });
if (!process.argv.includes('--apply')) throw new Error('Usa --apply para publicar exclusivamente las reglas e índices de Firestore.');
const project = process.env.FIREBASE_ADMIN_PROJECT_ID;
if (!project || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project)) throw new Error('Proyecto administrativo inválido.');
if (process.env.VITE_FIREBASE_PROJECT_ID && process.env.VITE_FIREBASE_PROJECT_ID !== project) throw new Error('El frontend y backend deben apuntar al mismo proyecto.');
const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || resolve('lexia-pj-firebase-adminsdk-fbsvc-f46f3a6214.json');
const credential = JSON.parse(await readFile(credentialPath, 'utf8')) as { project_id?: string };
if (credential.project_id !== project) throw new Error('La credencial local pertenece a otro proyecto.');
// Existing ignored credential, scoped to this child process; never copy or log its contents.
const cliArgs = ['deploy', '--only', 'firestore:rules,firestore:indexes', '--project', project, '--non-interactive'];
const windowsCli = resolve(process.env.APPDATA || '', 'npm/node_modules/firebase-tools/lib/bin/firebase.js');
if (process.platform === 'win32' && !existsSync(windowsCli)) throw new Error('No se encontró Firebase CLI en la instalación global de npm.');
const result = spawnSync(process.platform === 'win32' ? process.execPath : 'firebase', process.platform === 'win32' ? [windowsCli, ...cliArgs] : cliArgs, {
  stdio: 'inherit', env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: credentialPath },
});
process.exitCode = result.status ?? 1;
