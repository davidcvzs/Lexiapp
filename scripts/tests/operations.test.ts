import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express, { Router } from 'express';
import type { Express } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { createApp } from '../../server/app.js';
import { validateEnvironment, validateFrontendEnvironment } from '../../server/config/environment.js';
import { hostingErrors, prepareHosting } from '../../server/config/hosting.js';
import { createHealthRouter } from '../../server/routes/health.js';
import { createAuthMiddleware } from '../../server/middleware/auth.js';
import { SQLiteSCJNRepository } from '../../server/scjn/SQLiteSCJNRepository.js';
import { backupScjn } from '../backup-scjn.js';
import { soapResult, xmlText } from '../../server/services/soapXml.js';
import { KnowledgeService } from '../../server/services/KnowledgeService.js';
import * as xlsx from 'xlsx';

async function serve(app: Express) {
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  return { url: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

test('configuration rejects mismatched projects, partial keys and malformed origins without exposing secrets', () => {
  const valid = { VITE_FIREBASE_PROJECT_ID: 'demo-lexia', FIREBASE_ADMIN_PROJECT_ID: 'demo-lexia', PORT: '3000' };
  assert.deepEqual(validateEnvironment(valid).errors, []);
  const result = validateEnvironment({ ...valid, FIREBASE_ADMIN_PROJECT_ID: 'other', FIREBASE_ADMIN_PRIVATE_KEY: 'SECRET-NEVER-PRINT', PORT: 'NaN', APP_ORIGIN: 'https://user:password@site.test/path', SCJN_DB_DRIVER: 'invalid' });
  assert.equal(result.errors.length, 6); assert.ok(!result.errors.join().includes('SECRET-NEVER-PRINT'));
  assert.equal(validateFrontendEnvironment(valid).length, 2);
  assert.equal(validateEnvironment({ ...valid, CLOUDFLARE_WORKER_URL: 'placeholder', CLOUDFLARE_TRANSCRIPTION_SECRET: 'secret' }).workerConfigured, false);
  const backend = { ...valid, CLOUDFLARE_WORKER_URL: 'https://worker.test', CLOUDFLARE_BACKEND_SECRET: 'synthetic-backend', CLOUDFLARE_DIRECT_UPLOAD_ENABLED: 'true' };
  assert.equal(validateEnvironment(backend).workerConfigured, true);
  assert.deepEqual(validateEnvironment(backend).errors, []);
  assert.ok(validateEnvironment({ ...backend, CLOUDFLARE_BACKEND_SECRET: '' }).errors.some(error => error.includes('carga directa')));
  assert.ok(validateEnvironment({ ...backend, CLOUDFLARE_DIRECT_UPLOAD_ENABLED: 'yes' }).errors.some(error => error.includes('true o false')));
  const gemini = validateEnvironment({ ...valid, AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'synthetic-key' });
  assert.equal(gemini.aiProvider, 'gemini'); assert.equal(gemini.generationConfigured, true);
  assert.ok(!gemini.warnings.some(message => message.includes('OpenAI')));
  assert.equal(validateEnvironment({ ...valid, AI_PROVIDER: 'gemini', OPENAI_API_KEY: 'synthetic-key' }).generationConfigured, false);
  assert.ok(validateEnvironment({ ...valid, AI_PROVIDER: 'invalid' }).errors.some(error => error.includes('AI_PROVIDER')));
});

test('production routes separate JSON API 404s, protected endpoints, SPA routes and missing assets', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'lexia-http-'));
  await mkdir(path.join(folder, 'assets')); await writeFile(path.join(folder, 'index.html'), '<html>LEXIA-SYNTHETIC-SPA</html>');
  await writeFile(path.join(folder, 'assets', 'test.js'), 'console.log("synthetic");');
  const app = createApp({ production: true, distPath: folder, scjn: Router(), storageCheck: async () => {} });
  const server = await serve(app);
  try {
    for (const route of ['/api', '/api/no-such-route']) {
      const response = await fetch(server.url + route); assert.equal(response.status, 404);
      assert.match(response.headers.get('content-type')!, /json/); assert.ok(!(await response.text()).includes('SPA'));
    }
    assert.equal((await fetch(server.url + '/api/documents')).status, 401);
    const page = await fetch(server.url + '/document-builder?documentId=synthetic'); assert.equal(page.status, 200);
    assert.match(await page.text(), /LEXIA-SYNTHETIC-SPA/); assert.equal(page.headers.get('cache-control'), 'no-cache');
    assert.match((await fetch(server.url + '/assets/test.js')).headers.get('cache-control')!, /immutable/);
    assert.equal((await fetch(server.url + '/assets/missing.js')).status, 404);
    assert.equal((await fetch(server.url + '/dashboard', { method: 'POST' })).status, 404);
  } finally { await server.close(); await rm(folder, { recursive: true }); }
});

test('production startup refuses an absent frontend build', () => {
  assert.throws(() => createApp({ production: true, distPath: path.join(os.tmpdir(), 'absent-lexia-build'), scjn: Router() }), /npm run build/);
});

test('liveness is independent of Firestore; readiness returns 503 on failure and finite timeout', async () => {
  for (const [check, expected] of [[async () => {}, 200], [async () => { throw new Error('PRIVATE-FAILURE'); }, 503], [() => new Promise<void>(() => {}), 503]] as const) {
    const app = express(); app.use('/api', createHealthRouter({ storageCheck: check, timeoutMs: 20 }));
    const server = await serve(app);
    try {
      const live = await fetch(server.url + '/api/health'); assert.equal(live.status, 200); assert.equal(live.headers.get('cache-control'), 'no-store');
      const ready = await fetch(server.url + '/api/ready'); const status = await ready.json();
      assert.equal(ready.status, expected); assert.equal(status.status, expected === 200 ? 'ready' : 'unavailable');
      assert.ok(!JSON.stringify(status).includes('PRIVATE-FAILURE'));
    } finally { await server.close(); }
  }
});

test('detailed health requires a verified administrator and never exposes credentials', async () => {
  const app = express();
  const authenticate = createAuthMiddleware(async token => ({ uid: token, admin: token === 'admin' } as unknown as DecodedIdToken));
  app.use('/api', createHealthRouter({ authenticate, storageCheck: async () => {}, scjnStatus: async () => ({ driver: 'sqlite', connected: true, available: true, records: 0, recordCount: 0, provider: 'synthetic', status: 'online' }) }));
  const server = await serve(app);
  try {
    assert.equal((await fetch(server.url + '/api/health/details')).status, 401);
    assert.equal((await fetch(server.url + '/api/health/details', { headers: { Authorization: 'Bearer regular' } })).status, 403);
    const response = await fetch(server.url + '/api/health/details', { headers: { Authorization: 'Bearer admin' } });
    assert.equal(response.status, 200); assert.equal((await response.json()).firestore.connected, true);
  } finally { await server.close(); }
});

test('Hosting preparation preserves Firestore and requires API rewrites before the SPA fallback', () => {
  const base = { firestore: { rules: 'firestore.rules' }, hosting: { public: 'dist', rewrites: [{ source: '**', destination: '/index.html' }] } };
  assert.equal(hostingErrors(base).length, 2);
  const prepared = prepareHosting(base, 'synthetic-lexia-api', 'us-central1');
  assert.deepEqual(hostingErrors(prepared), []); assert.deepEqual(prepared.firestore, base.firestore);
  assert.throws(() => prepareHosting(base, 'invalid service', 'INVALID'), /válidos/);
  const reordered = { ...prepared, hosting: { ...prepared.hosting, rewrites: [...prepared.hosting.rewrites].reverse() } };
  assert.equal(hostingErrors(reordered).length, 2);
});

test('SQLite reports usable health and backups restore text, batches and search without touching the source', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'lexia-backup-'));
  const source = path.join(folder, 'source.db'), target = path.join(folder, 'backup.db');
  const repo = new SQLiteSCJNRepository(source); await repo.init();
  try {
    await repo.upsertTesis({ registroDigital: 'SYNTHETIC-ONLY', rubro: 'Prueba íntegra ñ', texto: 'Texto sintético sin cambios.', source: 'TEST' });
    await repo.saveImportBatch({ id: 'synthetic-batch', filename: 'test.csv', source: 'TEST', category: 'TEST', importedAt: new Date().toISOString(), rowCount: 1, insertedCount: 1, updatedCount: 0, skippedCount: 0, csvSha256: 'a'.repeat(64) });
    const health = await repo.getProviderStatus(); assert.equal(health.connected, true); assert.equal(health.records, 1);
    const manifest = await backupScjn(source, target); assert.equal(manifest.sha256.length, 64);
    assert.deepEqual(JSON.parse(await readFile(target + '.manifest.json', 'utf8')), manifest);
    await assert.rejects(backupScjn(source, target)); await assert.rejects(backupScjn(source, source));
    const restored = new SQLiteSCJNRepository(target);
    try {
      assert.equal((await restored.getByRegistroDigital('SYNTHETIC-ONLY'))?.texto, 'Texto sintético sin cambios.');
      assert.equal((await restored.search({ q: 'Prueba' })).total, 1);
      assert.ok((await restored.getProviderStatus()).lastSync);
    } finally { await restored.close(); }
    assert.equal((await repo.getProviderStatus()).records, 1);
  } finally { await repo.close(); await rm(folder, { recursive: true }); }
});

test('SOAP node narrowing preserves text and tolerates absent or malformed envelopes', () => {
  assert.equal(xmlText({ '#text': 'Texto original ñ' }), 'Texto original ñ');
  assert.deepEqual(soapResult(null, 'response', 'result'), {});
  const envelope = { 'soap:Envelope': { 'soap:Body': { response: { result: { Rubro: 'Texto exacto' } } } } };
  assert.equal(soapResult(envelope, 'response', 'result').Rubro, 'Texto exacto');
});

test('reference extraction reads supported PDF and Excel APIs and adds no synthetic page labels', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'lexia-reference-'));
  try {
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet([{ Nombre: 'Persona sintética', Texto: 'Conservar ñ y á' }]), 'Prueba');
    const filename = 'DIRECTORIO REQUERIMIENTOS ACTALIZADO 25-02-26.xlsx';
    await writeFile(path.join(folder, filename), xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
    const content = 'BT /F1 12 Tf 72 700 Td (Texto PDF sintetico intacto.) Tj ET';
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${content.length} >>\nstream\n${content}\nendstream`];
    let pdf = '%PDF-1.4\n'; const offsets = [0];
    objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    await writeFile(path.join(folder, 'synthetic.pdf'), pdf);
    const service = new KnowledgeService(folder);
    const rows = await service.queryDirectoryExcel('Persona'); assert.equal(rows[0].Texto, 'Conservar ñ y á');
    const extracted = await service.readFiles(['synthetic.pdf', filename]);
    assert.equal(extracted[0].content, 'Texto PDF sintetico intacto.');
    assert.match(extracted[1].content, /Conservar ñ y á/);
  } finally { await rm(folder, { recursive: true }); }
});
