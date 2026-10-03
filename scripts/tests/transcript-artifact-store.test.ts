import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { WorkspaceRepository } from '../../server/persistence/WorkspaceRepository.js';
import { TranscriptArtifactStore } from '../../server/persistence/TranscriptArtifactStore.js';
import { TranscriptWordService } from '../../server/services/TranscriptWordService.js';
import { RequestError } from '../../server/middleware/security.js';
import { canonicalSegments, formatLiteralTranscript } from '../../shared/transcriptSegments.js';
import type { TranscriptPage, TranscriptSegment } from '../../shared/transcriptSegments.js';
import { MAX_WORD_ARTIFACT_BYTES, WORD_ARTIFACT_BLOCK_BYTES, transcriptWordReviewHash } from '../../shared/transcriptWord.js';
import type { TranscriptWordReceipt } from '../../shared/transcriptWord.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Estas pruebas requieren Firestore Emulator; nunca utilizan producción.');
const app1 = initializeApp({ projectId: 'demo-lexia-security' }, 'word-artifact-store-1');
const app2 = initializeApp({ projectId: 'demo-lexia-security' }, 'word-artifact-store-2');
const db1 = getFirestore(app1), db2 = getFirestore(app2);
const repository = new WorkspaceRepository(() => db1), restarted = new WorkspaceRepository(() => db2);
const store = new TranscriptArtifactStore(() => db1), reloaded = new TranscriptArtifactStore(() => db2);
after(async () => { await Promise.all([deleteApp(app1), deleteApp(app2)]); });
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const rejects = (status: number) => (error: RequestError) => error.status === status;
const cleanup = (id: string) => db1.recursiveDelete(db1.collection('transcriptionJobs').doc(id));

async function setup() {
  const id = randomUUID(), uid = randomUUID();
  const segments: TranscriptSegment[] = Array.from({ length: 6 }, (_, index) => ({ index, start: index, end: index + 1.5,
    text: `  Intervención sintética ${index}: sí & <exacto> 😀.  `, ...(index === 5 ? { speaker: 'Voz identificada' } : {}) }));
  const sourceHash = hash(canonicalSegments(segments));
  await repository.saveJob(uid, { job_id: id, status: 'recovering_transcript', stage: 'recovery' }, 'sintetico.mp4');
  for (let offset = 0; offset < segments.length; offset += 2) {
    const page: TranscriptPage = { job_id: id, status: 'completed', language: 'es', total_segments: segments.length, offset, limit: 200,
      next_offset: offset + 2 === segments.length ? null : offset + 2, transcript_hash: sourceHash, segments: segments.slice(offset, offset + 2) };
    await repository.appendTranscriptPage(uid, id, page);
  }
  await repository.finalizeTranscript(uid, id);
  const request = { sourceHash, reviewed: true as const, format: { profile: 'transcript647' as const, marks: [] } };
  const text = formatLiteralTranscript(segments).replace(/\r\n?/g, '\n'), reviewHash = await transcriptWordReviewHash(request);
  const artifact = (bytes: Uint8Array): TranscriptWordReceipt => ({ jobId: id, artifactId: reviewHash, reviewHash, sourceHash,
    contentHash: hash(text), artifactHash: hash(bytes), byteLength: bytes.byteLength, fileName: 'Transcripcion_sintetica_OFICIAL.docx',
    createdAt: new Date().toISOString(), format: request.format });
  return { uid, id, segments, sourceHash, request, text, artifact };
}

test('verified Word, receipt and source survive a new SDK client and a confirmed remote deletion', async () => {
  const f = await setup(); let calls = 0;
  const provider = { deleteRemote: async () => { calls++; }, checkRemoteDeletion: async () => 'deleted' as const };
  const service = new TranscriptWordService({ jobs: repository, artifacts: store, provider });
  const resumed = new TranscriptWordService({ jobs: restarted, artifacts: reloaded, provider });
  try {
    const initial = await service.create(f.uid, f.id, f.request); assert.ok(initial.artifact);
    const bytes = await resumed.download(f.uid, f.id); assert.equal(hash(bytes.bytes), initial.artifact.artifactHash);
    assert.deepEqual(await resumed.getState(f.uid, f.id), initial);
    const confirmation = { artifactId: initial.artifact.artifactId, artifactHash: initial.artifact.artifactHash, downloadConfirmed: true, confirm: true };
    assert.equal((await resumed.deleteRemote(f.uid, f.id, confirmation, new AbortController().signal)).status, 'deleted');
    assert.equal((await service.deleteRemote(f.uid, f.id, confirmation, new AbortController().signal)).status, 'deleted'); assert.equal(calls, 1);
    assert.equal(await restarted.getTranscriptText(f.uid, f.id), f.text);
    assert.equal(hash((await resumed.download(f.uid, f.id)).bytes), initial.artifact.artifactHash);
    const parent = (await db1.collection('transcriptionJobs').doc(f.id).get()).data()!;
    assert.equal(parent.status, 'completed'); assert.equal(parent.remoteDeletion.status, 'deleted'); assert.equal(parent.wordArtifactId, initial.artifact.artifactId);
    assert.ok(!('uid' in (await reloaded.getState(f.uid, f.id)).artifact!));
  } finally { await cleanup(f.id); }
});

test('a 4 MiB binary is atomically stored in sixteen private blocks and reconstructed exactly after restart', async () => {
  const f = await setup(), bytes = randomBytes(MAX_WORD_ARTIFACT_BYTES), receipt = f.artifact(bytes);
  try {
    await store.save(f.uid, f.id, receipt, bytes);
    const blocks = await db1.collection('transcriptionJobs').doc(f.id).collection('wordArtifacts').doc(receipt.artifactId).collection('blocks').orderBy('index').get();
    assert.equal(blocks.size, 16);
    for (let index = 0; index < blocks.docs.length; index++) {
      const block = blocks.docs[index].data(); assert.equal(block.uid, f.uid); assert.equal(block.index, index);
      assert.equal(block.data.byteLength, WORD_ARTIFACT_BLOCK_BYTES); assert.equal(block.sha256, hash(block.data));
    }
    const downloaded = await reloaded.download(f.uid, f.id); assert.deepEqual(Buffer.from(downloaded.bytes), bytes);
    assert.deepEqual(downloaded.artifact, receipt);
  } finally { await cleanup(f.id); }
});

test('concurrent duplicate creation and deletion reservations commit one artifact and one pending action', async () => {
  const f = await setup(), bytes = randomBytes(WORD_ARTIFACT_BLOCK_BYTES + 777), receipt = f.artifact(bytes);
  try {
    const results = await Promise.all([store.save(f.uid, f.id, receipt, bytes), reloaded.save(f.uid, f.id, receipt, bytes)]);
    assert.deepEqual(results[0], results[1]);
    const artifacts = await db1.collection('transcriptionJobs').doc(f.id).collection('wordArtifacts').get(); assert.equal(artifacts.size, 1);
    assert.equal((await artifacts.docs[0].ref.collection('blocks').get()).size, 2);
    const reservations = await Promise.all([store.reserveDeletion(f.uid, f.id, receipt.artifactId, receipt.artifactHash), reloaded.reserveDeletion(f.uid, f.id, receipt.artifactId, receipt.artifactHash)]);
    assert.equal(reservations.filter(result => result.created).length, 1);
    assert.equal((await reloaded.getState(f.uid, f.id)).remoteDeletion.status, 'pending');
    await assert.rejects(repository.deleteJob(f.uid, f.id), rejects(409));
    await store.finishDeletion(f.uid, f.id, receipt.artifactId, 'unknown', 'Respuesta sintética perdida.');
    await assert.rejects(restarted.deleteJob(f.uid, f.id), rejects(409));
    assert.equal((await reloaded.reserveDeletion(f.uid, f.id, receipt.artifactId, receipt.artifactHash)).created, false);
    await store.finishDeletion(f.uid, f.id, receipt.artifactId, 'failed', 'Rechazo sintético confirmado.');
    assert.equal((await reloaded.reserveDeletion(f.uid, f.id, receipt.artifactId, receipt.artifactHash)).created, false);
  } finally { await cleanup(f.id); }
});

test('oversized bytes, incorrect binary hashes and changed manifests commit neither blocks nor a current receipt', async () => {
  const f = await setup(), bytes = randomBytes(32), receipt = f.artifact(bytes), parent = db1.collection('transcriptionJobs').doc(f.id);
  try {
    await assert.rejects(store.save(f.uid, f.id, receipt, new Uint8Array(MAX_WORD_ARTIFACT_BYTES + 1)), rejects(413));
    await assert.rejects(store.save(f.uid, f.id, { ...receipt, artifactHash: 'a'.repeat(64) }, bytes), rejects(502));
    await parent.update({ 'transcript.sha256': 'b'.repeat(64) });
    await assert.rejects(store.save(f.uid, f.id, receipt, bytes), rejects(409));
    assert.equal((await parent.collection('wordArtifacts').get()).empty, true); assert.equal((await parent.get()).data()!.wordArtifactId, undefined);
  } finally { await cleanup(f.id); }
});

test('ownership covers metadata, all bytes, creation, reservation and outcome writes across SDK clients', async () => {
  const f = await setup(), bytes = randomBytes(WORD_ARTIFACT_BLOCK_BYTES + 7), receipt = f.artifact(bytes), other = randomUUID();
  try {
    await store.save(f.uid, f.id, receipt, bytes);
    for (const action of [() => reloaded.getState(other, f.id), () => reloaded.download(other, f.id), () => reloaded.save(other, f.id, receipt, bytes),
      () => reloaded.reserveDeletion(other, f.id, receipt.artifactId, receipt.artifactHash), () => reloaded.finishDeletion(other, f.id, receipt.artifactId, 'deleted', 'No autorizado.')]) await assert.rejects(action(), rejects(403));
    assert.equal((await reloaded.getState(f.uid, f.id)).remoteDeletion.status, 'not_requested');
    const block = db1.collection('transcriptionJobs').doc(f.id).collection('wordArtifacts').doc(receipt.artifactId).collection('blocks').doc('0001');
    await block.update({ uid: other }); await assert.rejects(reloaded.download(f.uid, f.id), rejects(403));
  } finally { await cleanup(f.id); }
});

test('missing or changed blocks cannot be downloaded or authorize a deletion reservation', async () => {
  const f = await setup(), bytes = randomBytes(WORD_ARTIFACT_BLOCK_BYTES + 7), receipt = f.artifact(bytes);
  const parent = db1.collection('transcriptionJobs').doc(f.id), blocks = parent.collection('wordArtifacts').doc(receipt.artifactId).collection('blocks');
  try {
    await store.save(f.uid, f.id, receipt, bytes);
    await blocks.doc('0000').update({ data: Buffer.alloc(WORD_ARTIFACT_BLOCK_BYTES) });
    await assert.rejects(reloaded.download(f.uid, f.id), rejects(502));
    await assert.rejects(reloaded.reserveDeletion(f.uid, f.id, receipt.artifactId, receipt.artifactHash), rejects(502));
    assert.equal((await parent.get()).data()!.remoteDeletion, undefined);
    await blocks.doc('0001').delete(); await assert.rejects(reloaded.download(f.uid, f.id), rejects(502));
  } finally { await cleanup(f.id); }
});

test('stale confirmations are rejected and explicit local deletion removes artifacts without affecting the provider', async () => {
  const f = await setup(), bytes = randomBytes(400), receipt = f.artifact(bytes);
  const parent = db1.collection('transcriptionJobs').doc(f.id);
  try {
    await store.save(f.uid, f.id, receipt, bytes);
    await assert.rejects(store.reserveDeletion(f.uid, f.id, receipt.artifactId, 'a'.repeat(64)), rejects(409));
    assert.equal((await parent.get()).data()!.remoteDeletion, undefined);
    await repository.deleteJob(f.uid, f.id);
    assert.equal((await parent.collection('wordArtifacts').get()).empty, true); assert.equal((await parent.collection('segments').get()).empty, true);
    await assert.rejects(reloaded.download(f.uid, f.id), rejects(404));
    await assert.rejects(reloaded.save(f.uid, f.id, receipt, bytes), rejects(404));
  } finally { await cleanup(f.id); }
});
