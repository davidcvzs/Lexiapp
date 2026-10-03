import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import AdmZip from 'adm-zip';
import { createAuthMiddleware, requireAdmin } from '../../server/middleware/auth.js';
import { createRequestLimit, securityErrorHandler } from '../../server/middleware/security.js';
import { createSecureUpload } from '../../server/middleware/uploads.js';
import { validateArchive } from '../../server/scjn/archiveSafety.js';
import { SCJNImportService } from '../../server/scjn/SCJNImportService.js';
import type { ISCJNRepository } from '../../server/scjn/types.js';

const verify = async (token: string) => {
  if (token === 'invalid' || token === 'revoked') throw new Error('Rejected');
  return { uid: token, admin: token === 'admin' ? true : token === 'string-admin' ? 'true' : false } as unknown as DecodedIdToken;
};

test('API rejects missing/invalid tokens and non-admins before accepting an upload', async () => {
  const app = express();
  let calls = 0;
  app.post('/import', createAuthMiddleware(verify), requireAdmin, (_req, res) => {
    calls++; res.json({ ok: true });
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    for (const [token, status] of [['', 401], ['invalid', 401], ['revoked', 401], ['user', 403], ['string-admin', 403], ['admin', 200]] as const) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}/import`, {
        method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      assert.equal(response.status, status, token || 'missing token');
    }
    assert.equal(calls, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('rate limit uses verified UID, ignores spoofed IPs and leaves other users independent', async () => {
  const app = express();
  app.use(createAuthMiddleware(verify), createRequestLimit(2, 60_000));
  app.get('/', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    for (let i = 0; i < 3; i++) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}`, {
        headers: { Authorization: 'Bearer user', 'X-Forwarded-For': `192.0.2.${i + 1}` },
      });
      assert.equal(response.status, i < 2 ? 200 : 429);
      if (i === 2) assert.ok(response.headers.get('Retry-After'));
    }
    const response = await fetch(`http://127.0.0.1:${address.port}`, { headers: { Authorization: 'Bearer another-user' } });
    assert.equal(response.status, 200);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('uploads reject disguised content, oversized files, wrong fields and multiple files; clean up disk', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lexia-upload-test-'));
  const app = express();
  app.post('/media', createSecureUpload('media', dir, 1024), (_req, res) => res.json({ ok: true }));
  app.post('/csv', createSecureUpload('csv', dir, 1024), (_req, res) => res.json({ ok: true }));
  app.post('/zip', createSecureUpload('zip', dir, 4096), (_req, res) => res.json({ ok: true }));
  app.use(securityErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const send = async (route: string, data: Uint8Array | string, name: string, type: string, field = 'file', multiple = false) => {
    const form = new FormData();
    const blob = new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type });
    form.append(field, blob, name);
    if (multiple) form.append(field, blob, name);
    return fetch(`http://127.0.0.1:${address.port}/${route}`, { method: 'POST', body: form });
  };
  try {
    const wav = Buffer.alloc(48);
    wav.write('RIFF'); wav.writeUInt32LE(40, 4); wav.write('WAVE', 8);
    assert.equal((await send('media', wav, 'audio.wav', 'audio/wav')).status, 200);
    assert.equal((await send('media', '<script>alert(1)</script>', 'fake.mp3', 'audio/mpeg')).status, 415);
    assert.equal((await send('media', 'ID3', 'truncated.mp3', 'audio/mpeg')).status, 415);
    assert.equal((await send('media', 'text', 'payload.exe', 'audio/mpeg')).status, 415);
    assert.equal((await send('media', Buffer.alloc(1025), 'large.wav', 'audio/wav')).status, 413);
    assert.equal((await send('media', wav, 'audio.wav', 'audio/wav', 'media')).status, 400);
    assert.equal((await send('media', wav, 'audio.wav', 'audio/wav', 'file', true)).status, 400);
    assert.equal((await send('csv', 'Registro digital,Rubro\n123,Texto\n', 'tesis.csv', 'text/csv')).status, 200);
    assert.equal((await send('csv', 'MZ\0,executable', 'fake.csv', 'text/csv')).status, 415);
    const zip = new AdmZip(); zip.addFile('tesis.csv', Buffer.from('Registro digital,Rubro\n123,Texto\n'));
    assert.equal((await send('zip', zip.toBuffer(), 'tesis.zip', 'application/zip')).status, 200);
    assert.equal((await send('zip', 'not a zip', 'tesis.zip', 'application/zip')).status, 415);
    // Cleanup is asynchronous; wait only until the directory is empty.
    for (let i = 0; i < 30 && (await readdir(dir)).length; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.deepEqual(await readdir(dir), []);
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    await rm(dir, { recursive: true, force: true });
  }
});

test('ZIP expansion rejects traversal, oversized entries and excessive compression', () => {
  const zip = new AdmZip(); zip.addFile('tesis.csv', Buffer.from('Registro,Rubro\n1,Prueba\n'));
  const entry = zip.getEntries()[0];
  assert.doesNotThrow(() => validateArchive([entry]));
  entry.entryName = '../escape.csv';
  assert.throws(() => validateArchive([entry]), /rutas/);
  entry.entryName = 'tesis.csv';
  entry.header.size = 51 * 1024 * 1024;
  assert.throws(() => validateArchive([entry]), /descompresión/);
  entry.header.size = 2 * 1024 * 1024;
  entry.header.compressedSize = 100;
  assert.throws(() => validateArchive([entry]), /compresión/);
  assert.throws(() => validateArchive(Array(1001).fill(entry)), /demasiados/);
});

test('oversized or malformed JSON returns a controlled error', async () => {
  const app = express();
  app.use(express.json({ limit: 32 }));
  app.post('/', (_req, res) => res.json({ ok: true }));
  app.use(securityErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    for (const [body, expected] of [['{bad', 400], [JSON.stringify({ large: 'x'.repeat(100) }), 413]] as const) {
      const response: Response = await fetch(`http://127.0.0.1:${address.port}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      assert.equal(response.status, expected);
      assert.deepEqual(Object.keys(await response.json()), ['error']);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('CSV imports process valid rows and reject oversized rows and repository failures', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lexia-csv-test-'));
  const file = path.join(dir, 'sample.csv');
  const repo: ISCJNRepository = {
    init: async () => {},
    upsertTesis: async () => 'INSERTED',
    search: async () => ({ total: 0, data: [] }),
    getByRegistroDigital: async () => null,
    saveImportBatch: async () => {},
    getProviderStatus: async () => ({ driver: 'sqlite', connected: true, available: true, records: 0, provider: 'SCJN_LOCAL_INDEX', status: 'online', recordCount: 0 }),
    getCatalogs: async () => ({ epocas: [], anios: [], instancias: [], organos: [], materias: [], asuntos: [], ponentes: [], tipos: [], formasIntegracion: [] }),
    close: async () => {},
  };
  const service = new SCJNImportService(repo);
  try {
    await writeFile(file, 'Registro digital,Rubro\n123,Prueba\n');
    const batch = await service.processCsvFile(file, 'sample.csv');
    assert.equal(batch.rowCount, 1);
    assert.equal(batch.insertedCount, 1);
    repo.upsertTesis = async () => { throw new Error('Database unavailable'); };
    await assert.rejects(service.processCsvFile(file, 'sample.csv'), /Database unavailable/);
    await writeFile(file, `Registro digital,Rubro\n123,${'x'.repeat(1024 * 1024)}\n`);
    await assert.rejects(service.processCsvFile(file, 'sample.csv'), /maximum size/);
  } finally {
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    await rm(dir, { recursive: true, force: true });
  }
});
