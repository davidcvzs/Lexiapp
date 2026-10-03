// Read-only audit: emit file names and counts, never credential contents.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import AdmZip from 'adm-zip';

const credentialFiles = fs.readdirSync('.').filter(name => /firebase-adminsdk.*\.json$/.test(name));
const fingerprints = credentialFiles.map(name => {
  const credential = JSON.parse(fs.readFileSync(name, 'utf8'));
  return credential.private_key?.split('\n').find(line => line.length >= 48 && !line.startsWith('-'))?.slice(0, 48);
}).filter(Boolean);
if (!fingerprints.length) throw new Error('No local service-account fingerprint available for this audit.');

const commits = execFileSync('git', ['rev-list', '--all'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const historyHits = new Set();
for (const commit of commits) {
  try {
    const matches = execFileSync('git', ['grep', '-I', '-l', '-F', '-f', '-', commit], {
      input: fingerprints.join('\n'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    });
    matches.trim().split('\n').filter(Boolean).forEach(name => historyHits.add(name));
  } catch (error) {
    if (error.status !== 1) throw new Error('Git audit failed; no content has been printed.');
  }
}

let scannedFiles = 0;
const artifactHits = [];
const skipped = [];
const containsKey = data => fingerprints.some(value => data.toString('utf8').includes(value));
const excluded = new Set(['.git', 'node_modules', '.codex', '.agents', 'Conocimiento', 'secrets']);
function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!excluded.has(entry.name)) scan(file);
      continue;
    }
    if (credentialFiles.includes(file) || entry.name.startsWith('.env')) continue;
    if (!/\.(?:js|mjs|cjs|ts|tsx|json|html|txt|log|err|zip|map|pem|key)$/i.test(file)) continue;
    if (fs.statSync(file).size > 100 * 1024 * 1024) { skipped.push(file); continue; }
    scannedFiles++;
    if (file.endsWith('.zip')) {
      const archive = new AdmZip(file);
      for (const item of archive.getEntries()) {
        if (item.isDirectory) continue;
        if (item.header.size > 10 * 1024 * 1024) { skipped.push(`${file}:${item.entryName}`); continue; }
        if (containsKey(item.getData())) artifactHits.push(`${file}:${item.entryName}`);
      }
    } else if (containsKey(fs.readFileSync(file))) artifactHits.push(file);
  }
}
scan('.');
console.log(JSON.stringify({ commitsChecked: commits.length, historyHits: [...historyHits], scannedFiles, artifactHits, skipped,
  scope: 'Local reachable Git history and local code/build/log/ZIP artifacts; excludes .env, credential sources, dependencies and external registries.' }, null, 2));
if (historyHits.size || artifactHits.length) process.exitCode = 1;
