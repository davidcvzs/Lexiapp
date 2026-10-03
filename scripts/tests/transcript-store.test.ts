import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { WorkspaceRepository } from '../../server/persistence/WorkspaceRepository.js';
import { createTranscriptionRouter } from '../../server/routes/transcription.js';
import { createAuthMiddleware } from '../../server/middleware/auth.js';
import { RequestError, securityErrorHandler } from '../../server/middleware/security.js';
import { canonicalSegments, formatLiteralTranscript, parseTranscriptPage } from '../../shared/transcriptSegments.js';
import type { TranscriptPage, TranscriptSegment } from '../../shared/transcriptSegments.js';
import type { TranscriptionJob } from '../../shared/transcription.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Estas pruebas requieren Firestore Emulator y nunca utilizan producción.');
const app1 = initializeApp({ projectId: 'demo-lexia-security' }, 'transcript-store-1');
const app2 = initializeApp({ projectId: 'demo-lexia-security' }, 'transcript-store-2');
const db1 = getFirestore(app1), db2 = getFirestore(app2);
const repository = new WorkspaceRepository(() => db1), restarted = new WorkspaceRepository(() => db2);
after(async () => { await Promise.all([deleteApp(app1), deleteApp(app2)]); });
const rejects = (status: number) => (error: RequestError) => error.status === status;
const source = (count = 205): TranscriptSegment[] => Array.from({ length: count }, (_, index) => ({ index, start: index, end: index + 1.5,
  text: `Texto sintético íntegro ${index}.`, ...(index === 200 ? { speaker: 'Persona identificada' } : {}) }));
const hash = (segments: readonly TranscriptSegment[]) => createHash('sha256').update(canonicalSegments(segments)).digest('hex');
const page = (id: string, all: TranscriptSegment[], offset = 0, count = 200): TranscriptPage => parseTranscriptPage({
  job_id: id, status: 'completed', language: 'es', total_segments: all.length, offset, limit: 200,
  next_offset: offset + Math.min(count, all.length - offset) === all.length ? null : offset + count,
  segments: all.slice(offset, offset + count), transcript_hash: hash(all),
});
const cleanup = async (uid: string, id: string) => {
  try { await repository.deleteJob(uid, id); } catch (error) { if (!(error instanceof RequestError) || error.status !== 404) throw error; }
  await db1.recursiveDelete(db1.collection('transcriptionJobs').doc(id));
};

test('205 verified segments survive a new repository and preserve every timestamp, cue and identified speaker', async () => {
  const uid = randomUUID(), id = randomUUID(), all = source();
  try {
    await repository.saveJob(uid, { job_id: id, status: 'recovering_transcript', stage: 'recovery', recovery: { recoveredSegments: 0, totalSegments: 205 } }, 'sintético.mp4');
    const first = await repository.appendTranscriptPage(uid, id, page(id, all));
    assert.equal(first.status, 'recovering_transcript'); assert.equal(first.recovery?.recoveredSegments, 200);
    assert.equal((await restarted.getJob(uid, id)).recovery?.recoveredSegments, 200);
    await restarted.appendTranscriptPage(uid, id, page(id, all, 200));
    const complete = await restarted.finalizeTranscript(uid, id);
    assert.equal(complete.status, 'completed'); assert.equal(complete.transcript?.segmentCount, 205); assert.equal(complete.transcript?.sha256, hash(all));
    const firstPage = await repository.getSegmentPage(uid, id, 0, 200), lastPage = await restarted.getSegmentPage(uid, id, 200, 200);
    assert.deepEqual([...firstPage.segments, ...lastPage.segments], all); assert.equal(lastPage.next_offset, null);
    assert.equal(await repository.getTranscriptText(uid, id), formatLiteralTranscript(all));
    assert.ok(!('text' in (await repository.listJobs(uid)).jobs[0]));
  } finally { await cleanup(uid, id); }
});

test('sources above 900 KB are stored as checked blocks with a small parent and no inline literal text', async () => {
  const uid = randomUUID(), id = randomUUID(), all = source(6).map(segment => ({ ...segment, text: `${segment.index}:` + 'á'.repeat(100_000) }));
  assert.ok(Buffer.byteLength(canonicalSegments(all)) > 900_000);
  try {
    await repository.saveJob(uid, { job_id: id, status: 'recovering_transcript', stage: 'recovery' }, 'fuente-extensa.mp4');
    await repository.appendTranscriptPage(uid, id, page(id, all, 0, 3));
    await restarted.appendTranscriptPage(uid, id, page(id, all, 3, 3));
    await restarted.finalizeTranscript(uid, id);
    const parent = (await db2.collection('transcriptionJobs').doc(id).get()).data()!;
    assert.equal(parent.text, undefined); assert.ok(Buffer.byteLength(JSON.stringify(parent)) < 10_000);
    assert.equal(parent._recoveryState.previousSegment.text, undefined);
    const blocks = await db2.collection('transcriptionJobs').doc(id).collection('segments').get();
    assert.ok(blocks.size > 2);
    for (const block of blocks.docs) assert.ok(Buffer.byteLength(JSON.stringify(block.data())) < 900_000);
    const literal = await repository.getTranscriptText(uid, id); assert.equal(literal, formatLiteralTranscript(all));
    let offset = 0; const recovered: TranscriptSegment[] = [];
    while (true) {
      const next = await repository.getSegmentPage(uid, id, offset, 200); recovered.push(...next.segments);
      if (next.next_offset === null) break;
      assert.ok(next.next_offset > offset); offset = next.next_offset;
    }
    assert.deepEqual(recovered, all);
  } finally { await cleanup(uid, id); }
});

test('escaped JSON bytes cannot skip the next cue when a bounded page crosses stored block boundaries', async () => {
  const uid = randomUUID(), id = randomUUID(), all = source(3).map((segment, index) => ({
    ...segment, text: index === 0 ? 'x'.repeat(180_000) : index === 1 ? '\\'.repeat(250_000) : 'Último segmento sintético.',
  }));
  assert.ok(Buffer.byteLength(canonicalSegments([all[1]])) > 500_000);
  try {
    await repository.saveJob(uid, { job_id: id, status: 'recovering_transcript' }, 'fuente-escapada.mp4');
    for (let index = 0; index < all.length; index++) await repository.appendTranscriptPage(uid, id, page(id, all, index, 1));
    await restarted.finalizeTranscript(uid, id);
    const first = await repository.getSegmentPage(uid, id, 0, 200);
    assert.deepEqual(first.segments, [all[0]]); assert.equal(first.next_offset, 1);
    const second = await restarted.getSegmentPage(uid, id, first.next_offset!, 200);
    assert.deepEqual(second.segments, [all[1]]); assert.equal(second.next_offset, 2);
    const third = await repository.getSegmentPage(uid, id, second.next_offset!, 200);
    assert.deepEqual(third.segments, [all[2]]); assert.equal(third.next_offset, null);
    assert.deepEqual([...first.segments, ...second.segments, ...third.segments], all);
    assert.equal(await restarted.getTranscriptText(uid, id), formatLiteralTranscript(all));
  } finally { await cleanup(uid, id); }
});

test('concurrent duplicate pages create one immutable set of blocks and one advancing checkpoint', async () => {
  const uid = randomUUID(), id = randomUUID(), all = source();
  try {
    await repository.saveJob(uid, { job_id: id, status: 'recovering_transcript' }, 'sintético.mp4');
    await Promise.all([repository.appendTranscriptPage(uid, id, page(id, all)), restarted.appendTranscriptPage(uid, id, page(id, all))]);
    assert.equal((await repository.getJob(uid, id)).recovery?.recoveredSegments, 200);
    const initial = await db1.collection('transcriptionJobs').doc(id).collection('segments').get();
    assert.equal(initial.size, 1);
    const immutable = initial.docs.map(block => block.data());
    await repository.appendTranscriptPage(uid, id, page(id, all));
    assert.deepEqual((await db2.collection('transcriptionJobs').doc(id).collection('segments').get()).docs.map(block => block.data()), immutable);
    await restarted.appendTranscriptPage(uid, id, page(id, all, 200));
    assert.equal((await repository.finalizeTranscript(uid, id)).status, 'completed');
  } finally { await cleanup(uid, id); }
});

test('missing pages and a changed complete fingerprint cannot advance the durable cursor or complete', async () => {
  const uid = randomUUID(), id = randomUUID(), all = source();
  try {
    await repository.saveJob(uid, { job_id: id, status: 'recovering_transcript' }, 'sintético.mp4');
    await assert.rejects(repository.appendTranscriptPage(uid, id, page(id, all, 200)), rejects(502));
    await repository.appendTranscriptPage(uid, id, page(id, all));
    await assert.rejects(repository.finalizeTranscript(uid, id), rejects(409));
    const changed = { ...page(id, all, 200), transcript_hash: 'a'.repeat(64) };
    await assert.rejects(restarted.appendTranscriptPage(uid, id, changed), rejects(409));
    assert.equal((await repository.getJob(uid, id)).recovery?.recoveredSegments, 200);
    assert.equal((await repository.getJob(uid, id)).status, 'recovering_transcript');
  } finally { await cleanup(uid, id); }
});

test('a tampered saved block or mismatched complete hash never earns a verified manifest', async () => {
  const uid = randomUUID(), id = randomUUID(), all = source(5);
  try {
    await repository.saveJob(uid, { job_id: id, status: 'recovering_transcript' }, 'sintético.mp4');
    await repository.appendTranscriptPage(uid, id, page(id, all));
    const block = (await db1.collection('transcriptionJobs').doc(id).collection('segments').get()).docs[0];
    await block.ref.update({ segments: all.map((segment, index) => index ? segment : { ...segment, text: 'Contenido alterado.' }) });
    await assert.rejects(restarted.finalizeTranscript(uid, id), rejects(502));
    assert.equal((await repository.getJob(uid, id)).transcript, undefined);
    await block.ref.update({ segments: all });
    await db1.collection('transcriptionJobs').doc(id).update({ '_recoveryState.sha256': 'b'.repeat(64) });
    await block.ref.update({ transcriptHash: 'b'.repeat(64) });
    await assert.rejects(repository.finalizeTranscript(uid, id), rejects(502));
    assert.equal((await repository.getJob(uid, id)).status, 'recovering_transcript');
  } finally { await cleanup(uid, id); }
});

test('owner isolation covers reservations, incoming pages, complete sources, segment pages and deletion', async () => {
  const uid = randomUUID(), other = randomUUID(), id = randomUUID(), requestId = randomUUID(), all = source(5);
  try {
    await repository.reserveUpload(uid, requestId, { filename: 'sintético.mp4', size: 100, mime: 'video/mp4' }, 'multipart');
    await repository.saveJob(uid, { job_id: id, status: 'recovering_transcript' }, 'sintético.mp4');
    await repository.attachUpload(uid, requestId, { job_id: id, status: 'recovering_transcript' });
    await assert.rejects(repository.getUploadRequest(other, requestId), rejects(403));
    await assert.rejects(repository.appendTranscriptPage(other, id, page(id, all)), rejects(403));
    await assert.rejects(repository.finalizeTranscript(other, id), rejects(403));
    await repository.appendTranscriptPage(uid, id, page(id, all)); await repository.finalizeTranscript(uid, id);
    for (const operation of [() => repository.getSegmentPage(other, id, 0, 200), () => repository.getTranscriptText(other, id), () => repository.deleteJob(other, id)]) {
      await assert.rejects(operation(), rejects(403));
    }
    assert.equal((await repository.getJob(uid, id)).status, 'completed');
  } finally { await cleanup(uid, id); await db1.collection('transcriptionRequests').doc(requestId).delete(); }
});

test('deletion removes source blocks and upload capability; a late provider page cannot recreate either', async () => {
  const uid = randomUUID(), id = randomUUID(), requestId = randomUUID(), all = source();
  try {
    await repository.reserveUpload(uid, requestId, { filename: 'sintético.mp4', size: 100, mime: 'video/mp4', lastModified: 1, fingerprint: 'a'.repeat(64) }, 'direct');
    await repository.saveJob(uid, { job_id: id, status: 'recovering_transcript' }, 'sintético.mp4');
    await repository.attachUpload(uid, requestId, { job_id: id, status: 'recovering_transcript' }, { requestId, filename: 'sintético.mp4', size: 100,
      mime: 'video/mp4', lastModified: 1, fingerprint: 'a'.repeat(64), url: 'https://upload.videodelivery.net/tus/private-capability' });
    await repository.appendTranscriptPage(uid, id, page(id, all));
    await restarted.deleteJob(uid, id);
    assert.equal((await db1.collection('transcriptionJobs').doc(id).collection('segments').get()).empty, true);
    const reservation = (await db1.collection('transcriptionRequests').doc(requestId).get()).data()!;
    assert.equal(reservation.deleted, true); assert.equal(reservation.upload, undefined);
    await assert.rejects(repository.appendTranscriptPage(uid, id, page(id, all, 200)), rejects(404));
    await assert.rejects(repository.getUploadRequest(uid, requestId), rejects(404));
    assert.equal((await db1.collection('transcriptionJobs').doc(id).collection('segments').get()).empty, true);
  } finally { await cleanup(uid, id); await db1.collection('transcriptionRequests').doc(requestId).delete(); }
});

test('idempotent reservation comparison ignores object key order while rejecting a different file or owner', async () => {
  const uid = randomUUID(), other = randomUUID(), requestId = randomUUID();
  const metadata = { filename: 'sintético.mp4', size: 100, mime: 'video/mp4', lastModified: 1, fingerprint: 'a'.repeat(64) };
  try {
    assert.equal((await repository.reserveUpload(uid, requestId, metadata, 'direct')).created, true);
    await db1.collection('transcriptionRequests').doc(requestId).update({ metadata: { fingerprint: metadata.fingerprint, lastModified: 1, mime: metadata.mime, size: 100, filename: metadata.filename } });
    assert.equal((await restarted.reserveUpload(uid, requestId, metadata, 'direct')).created, false);
    await assert.rejects(repository.reserveUpload(uid, requestId, { ...metadata, size: 101 }, 'direct'), rejects(409));
    await assert.rejects(repository.reserveUpload(other, requestId, metadata, 'direct'), rejects(403));
  } finally { await db1.collection('transcriptionRequests').doc(requestId).delete(); }
});

async function startHttp(provider: Parameters<typeof createTranscriptionRouter>[0], repo = repository) {
  const app = express(); app.use(express.json());
  app.use(createAuthMiddleware(async uid => ({ uid } as DecodedIdToken)));
  app.use('/api/transcription', createTranscriptionRouter(provider, (req, _res, next) => {
    req.file = { originalname: 'sintético.wav', size: 100, mimetype: 'audio/wav' } as Express.Multer.File; next();
  }, repo)); app.use(securityErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  return { base: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
}

test('HTTP resumes final verification when the final page committed before a restart, with no invalid extra page', async () => {
  const uid = randomUUID(), id = randomUUID(), all = source(5);
  let providerReads = 0;
  const http = await startHttp({ create: async () => ({ job_id: id, status: 'queued' }), get: async () => { providerReads++; return { job_id: id, status: 'recovering_transcript' }; },
    getTranscriptPage: async () => { providerReads++; throw new Error('No extra page is valid after the final cursor.'); } }, restarted);
  try {
    await repository.saveJob(uid, { job_id: id, status: 'recovering_transcript' }, 'sintético.mp4');
    await repository.appendTranscriptPage(uid, id, page(id, all));
    const response = await fetch(`${http.base}/api/transcription/jobs/${id}`, { headers: { Authorization: `Bearer ${uid}` } });
    assert.equal(response.status, 200); assert.equal((await response.json()).status, 'completed'); assert.equal(providerReads, 0);
  } finally { await http.close(); await cleanup(uid, id); }
});

test('lost multipart acceptance is recovered by request ID; retries never create a second provider upload', async () => {
  const uid = randomUUID(), id = randomUUID(), requestId = randomUUID(); let creates = 0, lookups = 0;
  const http = await startHttp({ create: async () => { creates++; throw new RequestError(502, 'Respuesta perdida tras aceptación.'); },
    get: async () => ({ job_id: id, status: 'processing' }),
    lookupRequest: async (request, owner) => { lookups++; assert.equal(request, requestId); assert.equal(owner, uid); return { job_id: id, status: 'processing', stage: 'video' }; } });
  try {
    const headers = { Authorization: `Bearer ${uid}`, 'X-Upload-Request-Id': requestId };
    assert.equal((await fetch(`${http.base}/api/transcription/jobs`, { method: 'POST', headers })).status, 502);
    const recovered = await fetch(`${http.base}/api/transcription/requests/${requestId}`, { headers });
    assert.equal(recovered.status, 200); assert.equal((await recovered.json()).job_id, id);
    const retry = await fetch(`${http.base}/api/transcription/jobs`, { method: 'POST', headers });
    assert.equal(retry.status, 200); assert.equal((await retry.json()).job_id, id); assert.equal(creates, 1); assert.equal(lookups, 1);
  } finally { await http.close(); await cleanup(uid, id); await db1.collection('transcriptionRequests').doc(requestId).delete(); }
});

test('a page returning after local deletion cannot revive the job or leak its source through HTTP', async () => {
  const uid = randomUUID(), id = randomUUID(), all = source(5);
  let release!: () => void, called!: () => void;
  const entered = new Promise<void>(resolve => { called = resolve; });
  const released = new Promise<void>(resolve => { release = resolve; });
  const http = await startHttp({ create: async () => ({ job_id: id, status: 'queued' }), get: async () => ({ job_id: id, status: 'recovering_transcript' }),
    getTranscriptPage: async () => { called(); await released; return page(id, all); } });
  try {
    await repository.saveJob(uid, { job_id: id, status: 'recovering_transcript' }, 'sintético.mp4');
    const pending = fetch(`${http.base}/api/transcription/jobs/${id}`, { headers: { Authorization: `Bearer ${uid}` } });
    await entered; await restarted.deleteJob(uid, id); release();
    const response = await pending; assert.equal(response.status, 404);
    assert.equal((await db1.collection('transcriptionJobs').doc(id).collection('segments').get()).empty, true);
    assert.equal((await db1.collection('transcriptionJobs').doc(id).get()).data()!.deleted, true);
  } finally { release(); await http.close(); await cleanup(uid, id); }
});

test('late failure wins over unfinished verification and video percentages are removed when captions start', async () => {
  const uid = randomUUID(), id = randomUUID(), all = source(5);
  try {
    await repository.saveJob(uid, { job_id: id, status: 'processing', stage: 'video', progress: 48 }, 'sintético.mp4');
    await repository.updateJob(uid, { job_id: id, status: 'processing', stage: 'captions' });
    const lateVideo = await restarted.updateJob(uid, { job_id: id, status: 'processing', stage: 'video', progress: 12 });
    assert.equal(lateVideo.stage, 'captions'); assert.equal(lateVideo.progress, undefined);
    await repository.updateJob(uid, { job_id: id, status: 'generating_transcript', stage: 'captions' });
    assert.equal((await restarted.getJob(uid, id)).progress, undefined);
    await repository.updateJob(uid, { job_id: id, status: 'recovering_transcript', stage: 'recovery' });
    await repository.appendTranscriptPage(uid, id, page(id, all));
    await repository.updateJob(uid, { job_id: id, status: 'failed', error: 'Error confirmado.' });
    await assert.rejects(restarted.finalizeTranscript(uid, id), rejects(409));
    const failed: TranscriptionJob = await repository.getJob(uid, id);
    assert.equal(failed.status, 'failed'); assert.equal(failed.transcript, undefined);
  } finally { await cleanup(uid, id); }
});
