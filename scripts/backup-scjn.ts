import Database from 'better-sqlite3';
import { open, stat, writeFile, unlink } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { loadEnvironment } from '../server/config/environment.js';

/** Consistent local SQLite backup; never overwrites a source or an existing destination. */
export async function backupScjn(source: string, destination: string) {
  const original = resolve(source), target = resolve(destination);
  if (original.toLowerCase() === target.toLowerCase()) throw new Error('El respaldo debe usar un archivo distinto de la base original.');
  const database = new Database(original, { readonly: true, fileMustExist: true });
  let created = false;
  try {
    const file = await open(target, 'wx', 0o600); created = true; await file.close();
    await database.backup(target);
    const verification = new Database(target, { readonly: true, fileMustExist: true });
    try { if (verification.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Falló la integridad del respaldo.'); }
    finally { verification.close(); }
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(target)) hash.update(chunk);
    const manifest = { createdAt: new Date().toISOString(), bytes: (await stat(target)).size, sha256: hash.digest('hex') };
    await writeFile(target + '.manifest.json', JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    return manifest;
  } catch (error) { if (created) await unlink(target); throw error; }
  finally { database.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  loadEnvironment();
  const destination = process.argv[2];
  if (!destination || (process.env.SCJN_DB_DRIVER && process.env.SCJN_DB_DRIVER !== 'sqlite')) {
    console.error('Uso para SQLite: npm run backup:scjn -- RUTA_NUEVA.db. PostgreSQL usa pg_dump.'); process.exitCode = 1;
  } else {
    try { const result = await backupScjn(process.env.SCJN_DB_PATH || 'data/scjn/scjn.db', destination); console.log(`Respaldo verificado: ${result.bytes} bytes, SHA-256 ${result.sha256}.`); }
    catch { console.error('No se pudo crear el respaldo; comprueba origen existente, directorio y destino nuevo.'); process.exitCode = 1; }
  }
}
