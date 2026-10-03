import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { deleteApp, getApp, initializeApp } from 'firebase-admin/app';
import type { App } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { adminFirestore } from '../server/services/firebaseAdmin.js';
import { WorkspaceRepository } from '../server/persistence/WorkspaceRepository.js';
import { TranscriptArtifactStore } from '../server/persistence/TranscriptArtifactStore.js';
import { TranscriptWordService, verifyTranscriptWordDocument } from '../server/services/TranscriptWordService.js';
import type { RemoteVideoProvider } from '../server/services/TranscriptWordService.js';
import { canonicalSegments, formatLiteralTranscript } from '../shared/transcriptSegments.js';
import type { TranscriptPage, TranscriptSegment } from '../shared/transcriptSegments.js';
import { buildWordArtifact } from '../shared/wordDocument.js';
import { parseWordFormat } from '../shared/wordFormatting.js';
import { transcriptWordReviewHash } from '../shared/transcriptWord.js';
import type { TranscriptWordRequest } from '../shared/transcriptWord.js';

const projectId = 'lexia-pj';
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const status = (expected: number) => (error: unknown) => typeof error === 'object' && error !== null && 'status' in error && error.status === expected;

/** Manual real-storage check; only this run's synthetic UUID may be written or cleaned up. */
async function main(): Promise<void> {
  dotenv.config({ path: '.env.local', quiet: true });
  if (!process.argv.includes('--live') || process.env.FIRESTORE_EMULATOR_HOST !== undefined) {
    console.log(JSON.stringify({ passed: false, guardBlocked: true, liveRequired: true, emulatorMustBeAbsent: true }));
    process.exitCode = 1;
    return;
  }
  const id = `phase4-word-smoke-${randomUUID()}`, uid = `synthetic-${id}`;
  const artifactIds = new Set<string>();
  let database: Firestore | undefined, firstApp: App | undefined, secondApp: App | undefined;
  let validatedProject = false, complete = false, cleanupVerified = false, stage = 'project_validation';
  let binaryBytes = 0, wordBlocks = 0, sourceBlocks = 0, ownerRejections = 0, builds = 0;
  const providerCalls = { deletes: 0, checks: 0 };
  const provider: RemoteVideoProvider = {
    deleteRemote: async () => { providerCalls.deletes++; throw new Error('El proveedor está deshabilitado en este ensayo.'); },
    checkRemoteDeletion: async () => { providerCalls.checks++; throw new Error('El proveedor está deshabilitado en este ensayo.'); },
  };
  const builder: typeof buildWordArtifact = async input => { builds++; return buildWordArtifact(input); };
  try {
    database = adminFirestore(); firstApp = getApp();
    // Admin Firestore keeps projectId private; getFirestore(app) is cached per app, so identity binds it to the validated app.
    assert.equal(firstApp.options.projectId, projectId);
    assert.equal(database, getFirestore(firstApp));
    assert.match(id, /^phase4-word-smoke-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    validatedProject = true;
    const db = database, parent = db.collection('transcriptionJobs').doc(id);
    assert.equal((await parent.get()).exists, false);
    secondApp = initializeApp({ projectId, credential: firstApp.options.credential }, id);
    const secondDb = getFirestore(secondApp);
    assert.equal(secondApp.options.projectId, projectId);
    assert.notEqual(secondDb, db);
    const repository = new WorkspaceRepository(() => db), recovered = new WorkspaceRepository(() => secondDb);
    const artifacts = new TranscriptArtifactStore(() => db), recoveredArtifacts = new TranscriptArtifactStore(() => secondDb);
    const service = new TranscriptWordService({ jobs: repository, artifacts, provider, builder });
    const restarted = new TranscriptWordService({ jobs: recovered, artifacts: recoveredArtifacts, provider, builder });
    const segments: TranscriptSegment[] = Array.from({ length: 6 }, (_, index) => ({ index, start: index * 3, end: index * 3 + 2.5,
      text: index === 0 ? '  Persona QA declaró: «prueba sintética».\r\n\tSegunda línea 😀.  '
        : index === 5 ? 'Último segmento sintético íntegro: ñ á ü.' : `Intervención sintética número ${index}.`,
      ...(index === 1 ? { speaker: 'Voz sintética identificada' } : {}) }));
    const sourceHash = hash(canonicalSegments(segments)), text = formatLiteralTranscript(segments).replace(/\r\n?/g, '\n');
    stage = 'source_persistence';
    await repository.saveJob(uid, { job_id: id, status: 'queued' }, 'phase4-synthetic.mp4');
    for (let offset = 0; offset < segments.length; offset += 2) {
      const nextOffset = offset + 2;
      const page: TranscriptPage = { job_id: id, status: 'completed', language: 'es', total_segments: segments.length, offset, limit: 2,
        next_offset: nextOffset === segments.length ? null : nextOffset, segments: segments.slice(offset, nextOffset), transcript_hash: sourceHash };
      await repository.appendTranscriptPage(uid, id, page);
      if (offset === 0) await assert.rejects(repository.finalizeTranscript(uid, id), status(409));
    }
    const completed = await repository.finalizeTranscript(uid, id);
    assert.equal(completed.status, 'completed'); assert.equal(completed.transcript?.sha256, sourceHash);
    assert.equal(completed.transcript?.segmentCount, 6);
    sourceBlocks = (await parent.collection('segments').get()).size; assert.equal(sourceBlocks, 3);
    assert.equal((await recovered.getTranscriptText(uid, id)).replace(/\r\n?/g, '\n'), text);
    stage = 'word_creation';
    const start = text.indexOf('Persona QA'); assert.ok(start >= 0);
    const request: TranscriptWordRequest = { sourceHash, reviewed: true, caseNumber: 'TEST-SINTETICO-2026',
      format: { profile: 'transcript647', court: 'Juzgado de prueba sintética', marks: [{ start, end: start + 'Persona QA'.length, category: 'name' }] } };
    const reordered: TranscriptWordRequest = { ...request, format: {
      marks: request.format.marks.map(mark => ({ category: mark.category, end: mark.end, start: mark.start })),
      court: request.format.court, profile: request.format.profile,
    } };
    assert.notEqual(JSON.stringify(reordered.format), JSON.stringify(request.format));
    assert.deepEqual(parseWordFormat(text, reordered.format), parseWordFormat(text, request.format));
    assert.equal(await transcriptWordReviewHash(reordered), await transcriptWordReviewHash(request));
    const created = await service.create(uid, id, request); assert.ok(created.artifact);
    artifactIds.add(created.artifact.artifactId);
    assert.equal(created.artifact.sourceHash, sourceHash); assert.equal(created.artifact.contentHash, hash(text));
    assert.equal(created.artifact.reviewHash, await transcriptWordReviewHash(request));
    assert.equal(created.remoteDeletion.status, 'not_requested');
    stage = 'second_client_recovery';
    const reopened = await restarted.getState(uid, id); assert.deepEqual(reopened, created); assert.ok(reopened.artifact);
    assert.equal(await transcriptWordReviewHash({ sourceHash: reopened.artifact.sourceHash, reviewed: true, format: reopened.artifact.format,
      ...(reopened.artifact.caseNumber === undefined ? {} : { caseNumber: reopened.artifact.caseNumber }) }), reopened.artifact.reviewHash);
    const downloaded = await restarted.download(uid, id);
    assert.deepEqual(downloaded.artifact, created.artifact);
    assert.equal(await transcriptWordReviewHash({ sourceHash: downloaded.artifact.sourceHash, reviewed: true, format: downloaded.artifact.format,
      ...(downloaded.artifact.caseNumber === undefined ? {} : { caseNumber: downloaded.artifact.caseNumber }) }), downloaded.artifact.reviewHash);
    assert.deepEqual(parseWordFormat(text, downloaded.artifact.format), parseWordFormat(text, request.format));
    assert.equal(hash(downloaded.bytes), created.artifact.artifactHash);
    assert.equal(downloaded.bytes.byteLength, created.artifact.byteLength); binaryBytes = downloaded.bytes.byteLength;
    verifyTranscriptWordDocument(downloaded.bytes, text, request.format, request.caseNumber);
    assert.deepEqual(await restarted.create(uid, id, request), created);
    const repeated = await restarted.download(uid, id);
    assert.equal(hash(repeated.bytes), hash(downloaded.bytes)); assert.equal(builds, 1);
    assert.equal((await parent.collection('wordArtifacts').get()).size, 1);
    wordBlocks = (await parent.collection('wordArtifacts').doc(created.artifact.artifactId).collection('blocks').get()).size;
    assert.ok(wordBlocks > 0);
    stage = 'owner_isolation';
    for (const action of [
      () => restarted.getState(`${uid}-other`, id),
      () => restarted.download(`${uid}-other`, id),
      () => restarted.create(`${uid}-other`, id, request),
    ]) { await assert.rejects(action(), status(403)); ownerRejections++; }
    assert.deepEqual(await restarted.getState(uid, id), created);
    assert.equal((await recovered.getTranscriptText(uid, id)).replace(/\r\n?/g, '\n'), text);
    assert.deepEqual(providerCalls, { deletes: 0, checks: 0 });
    complete = true;
  } catch (error) {
    const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'number' && Number.isSafeInteger(error.code) ? error.code : undefined;
    console.log(JSON.stringify({ passed: false, stage, ...(code === undefined ? {} : { code }), detailsOmitted: true }));
  } finally {
    if (database && validatedProject) {
      try {
        const parent = database.collection('transcriptionJobs').doc(id), snapshot = await parent.get();
        if (snapshot.exists) assert.equal(snapshot.data()?.uid, uid);
        const entries = await parent.collection('wordArtifacts').get();
        for (const entry of entries.docs) { assert.equal(entry.data().uid, uid); artifactIds.add(entry.id); }
        // The fixed collection, locally generated UUID and ownership checks exclude every other record.
        await database.recursiveDelete(parent);
        assert.equal((await parent.get()).exists, false);
        assert.equal((await parent.collection('segments').get()).empty, true);
        assert.equal((await parent.collection('wordArtifacts').get()).empty, true);
        for (const artifactId of artifactIds) assert.equal((await parent.collection('wordArtifacts').doc(artifactId).collection('blocks').get()).empty, true);
        cleanupVerified = true;
      } catch { console.log(JSON.stringify({ cleanupVerified: false, jobId: id, detailsOmitted: true })); }
    }
    for (const app of [secondApp, firstApp]) if (app) {
      try { await deleteApp(app); } catch { complete = false; }
    }
  }
  const passed = complete && cleanupVerified && providerCalls.deletes === 0 && providerCalls.checks === 0;
  console.log(JSON.stringify({ passed, projectValidated: validatedProject, jobId: id, segments: 6, pages: 3, sourceBlocks, wordBlocks, binaryBytes, builds,
    ownerRejections, secondClientRecovery: complete, hashesAndLiteralVerified: complete, formatOrderIndependent: complete, sameArtifactReused: complete,
    providerDeleteCalls: providerCalls.deletes, providerCheckCalls: providerCalls.checks, cleanupVerified }));
  if (!passed) process.exitCode = 1;
}

void main().catch(() => { console.log(JSON.stringify({ passed: false, detailsOmitted: true })); process.exitCode = 1; });
