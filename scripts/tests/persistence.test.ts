import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { WorkspaceRepository } from '../../server/persistence/WorkspaceRepository.js';
import { createDocumentsRouter } from '../../server/routes/documents.js';
import { createTranscriptionRouter } from '../../server/routes/transcription.js';
import { createAuthMiddleware } from '../../server/middleware/auth.js';
import { securityErrorHandler } from '../../server/middleware/security.js';
import type { RequestError } from '../../server/middleware/security.js';
import type { DocumentDraft } from '../../shared/documents.js';
import { normalizeWorkerJob } from '../../server/services/CloudflareTranscriptionService.js';
import { parseDraft } from '../../shared/documents.js';
import { approvedExportText, publicFingerprint, reviewFingerprint, sourceFingerprint } from '../../shared/documentIntegrity.js';
import { generationFingerprint } from '../../shared/generation.js';
import { taskProvenance } from './task-fixtures.js';
import { startWorkflow, workflowRequest, applyWorkflowResult, addMatter, switchMatter } from '../../shared/workflowEngine.js';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Estas pruebas requieren Firestore Emulator; nunca usan una base de producción.');
const app1 = initializeApp({ projectId: 'demo-lexia-security' }, 'persistence-1');
const app2 = initializeApp({ projectId: 'demo-lexia-security' }, 'persistence-2');
const db1 = getFirestore(app1), db2 = getFirestore(app2);
const repository = new WorkspaceRepository(() => db1);
const restarted = new WorkspaceRepository(() => db2);
after(async () => { await Promise.all([deleteApp(app1), deleteApp(app2)]); });
const rejects = (status: number) => (error: RequestError) => error.status === status;
const draft: DocumentDraft = { title: 'Prueba sintética', caseNumber: 'TEST/2026', caseType: 'Penal', documentType: 'Sentencia Definitiva',
  summary: 'Datos sintéticos.', transcription: 'Fuente íntegra.', content: 'Borrador original.', completedPhases: ['Antecedentes'],
  audit: { names: false, congruence: false, pii: false } };

test('guided matter sources, selected research, navigation and pre-rewrite sections survive restart and immutable versions', async () => {
  const id = randomUUID(), uid = randomUUID();
  let guided = startWorkflow(parseDraft({ ...draft, content: '', generationTask: { taskId: 'ACTA', formatId: 'control' }, originalTranscription: 'Original A.' }));
  const first = guided.workflow!.activeMatterId;
  guided = applyWorkflowResult(guided, workflowRequest(guided), { result: 'Apartado anterior A.', provenance: taskProvenance(guided.generationTask!) });
  guided.workflow!.references.push({ id: 'selected-ref', matterId: first, title: 'Investigación elegida A', text: 'Texto jurídico sintético.', source: 'USER', url: 'https://example.test/ref' });
  try {
    await repository.saveDocument(uid, id, guided, 0);
    guided = parseDraft(addMatter(guided, 'Segundo asunto'));
    guided = parseDraft({ ...guided, transcription: 'Trabajo B.', originalTranscription: 'Original B.', summary: 'Contraste B.' });
    const second = guided.workflow!.activeMatterId;
    guided = applyWorkflowResult(guided, workflowRequest(guided), { result: 'Apartado B.', provenance: taskProvenance(guided.generationTask!) });
    await repository.saveDocument(uid, id, guided, 1);
    const loaded = parseDraft(await restarted.getDocument(uid, id));
    assert.deepEqual(loaded.workflow, guided.workflow); assert.equal(loaded.originalTranscription, 'Original B.');
    assert.deepEqual(workflowRequest(loaded).context!.references, []);
    let firstMatter = parseDraft(switchMatter(loaded, first)); assert.equal(firstMatter.originalTranscription, 'Original A.');
    assert.equal(workflowRequest(firstMatter).context!.sections.length, 1); assert.equal(workflowRequest(firstMatter).context!.references[0].text, 'Texto jurídico sintético.');
    firstMatter = applyWorkflowResult(firstMatter, workflowRequest(firstMatter, 'rewrite'), { result: 'Apartado rehecho A.', provenance: taskProvenance(firstMatter.generationTask!) });
    await restarted.saveDocument(uid, id, firstMatter, 2);
    assert.equal((await repository.getVersion(uid, id, 2)).content, 'Apartado anterior A.\n\nApartado B.');
    const refreshed = parseDraft(await repository.getDocument(uid, id)); assert.equal(refreshed.content, 'Apartado rehecho A.\n\nApartado B.');
    assert.equal(switchMatter(refreshed, second).originalTranscription, 'Original B.');
    const restored = await repository.saveDocument(uid, id, await restarted.getVersion(uid, id, 2), 3);
    assert.equal(restored.revision, 4); assert.equal(restored.workflow!.activeMatterId, second); assert.equal(restored.content, loaded.content);
  } finally { await repository.deleteDocument(uid, id); }
});

test('selected tasks, confirmation scope and reference provenance survive restart and version restoration', async () => {
  const id = randomUUID(), uid = randomUUID();
  const request = { contractVersion: 1 as const, taskId: 'ANALISIS', formatId: 'source', instruction: 'Alcance sintético',
    source: { original: 'Original', working: 'Trabajo', contrast: 'Contraste' }, draft: 'Texto', history: [] };
  const snapshot = parseDraft({ ...draft, generationTask: { taskId: 'ANALISIS', formatId: 'source' }, generationInstruction: request.instruction,
    originalTranscription: request.source.original, transcription: request.source.working, summary: request.source.contrast, content: request.draft,
    analysisConsent: { fingerprint: await generationFingerprint(request), confirmedAt: new Date().toISOString() },
    generationLog: [{ phase: 'Análisis solicitado', instruction: 'Solicitud anterior', sourceHash: '4'.repeat(64),
      createdAt: new Date().toISOString(), provenance: taskProvenance(request) }] });
  await repository.saveDocument(uid, id, snapshot, 0);
  const loaded = parseDraft(await restarted.getDocument(uid, id));
  assert.deepEqual(loaded.generationTask, snapshot.generationTask); assert.deepEqual(loaded.analysisConsent, snapshot.analysisConsent);
  assert.deepEqual(loaded.generationLog, snapshot.generationLog); assert.equal(loaded.summary, 'Contraste');
  await restarted.saveDocument(uid, id, { ...loaded, generationInstruction: 'Otro alcance' }, 1);
  const historic = parseDraft(await repository.getVersion(uid, id, 1));
  assert.equal(historic.generationInstruction, request.instruction); assert.deepEqual(historic.generationLog, snapshot.generationLog);
  await repository.deleteDocument(uid, id);
});

test('original source, generation instructions and reviewed public masks survive restart and immutable history', async () => {
  const id = randomUUID(), uid = randomUUID();
  const reviewed = parseDraft({ ...draft, content: 'Ana declaró sin cambios.', originalTranscription: 'Fuente original separada.', reviewHash: null });
  reviewed.audit = { names: true, congruence: true, pii: true };
  reviewed.generationLog = [{ phase: 'Antecedentes', instruction: 'Instrucción sintética exacta.', sourceHash: await sourceFingerprint(reviewed), createdAt: new Date().toISOString() }];
  reviewed.reviewHash = await reviewFingerprint(reviewed);
  reviewed.publicVersion = { redactions: [{ start: 0, end: 3 }], reviewed: true, reviewHash: null };
  reviewed.publicVersion.reviewHash = await publicFingerprint(reviewed);
  try {
    const saved = await repository.saveDocument(uid, id, reviewed, 0);
    const loaded = await restarted.getDocument(uid, id);
    assert.deepEqual(loaded, saved);
    assert.equal(loaded.originalTranscription, 'Fuente original separada.');
    assert.deepEqual(loaded.generationLog, reviewed.generationLog);
    assert.equal(loaded.phaseStates?.Antecedentes, 'reviewed');
    assert.equal(await approvedExportText(loaded, 'official'), reviewed.content);
    assert.equal(await approvedExportText(loaded, 'public'), '[DATO OCULTO] declaró sin cambios.');
    assert.equal((await repository.listDocuments(uid)).documents[0].status, 'Revisado');
    const changed = await restarted.saveDocument(uid, id, { ...loaded, title: 'Título cambiado sin revisión' }, 1);
    assert.equal(changed.reviewHash, null); assert.equal(changed.audit.names, false); assert.equal(changed.publicVersion?.reviewed, false);
    assert.equal((await repository.listDocuments(uid)).documents[0].status, 'Borrador');
    assert.equal(await approvedExportText(await repository.getVersion(uid, id, 1), 'public'), '[DATO OCULTO] declaró sin cambios.');
  } finally { await repository.deleteDocument(uid, id); }
});

test('legacy and partial approvals cannot persist reviewed phases or public approval without matching hashes', async () => {
  const id = randomUUID(), uid = randomUUID();
  try {
    const legacy = await repository.saveDocument(uid, id, { ...draft, audit: { names: true, congruence: true, pii: true }, phaseStates: { Antecedentes: 'reviewed' } }, 0);
    assert.equal(legacy.audit.pii, false); assert.equal(legacy.phaseStates?.Antecedentes, 'generated');
    const partial = await restarted.saveDocument(uid, id, { ...legacy, audit: { names: true, congruence: false, pii: false },
      phaseStates: { Antecedentes: 'reviewed' }, publicVersion: { redactions: [], reviewed: true, reviewHash: 'a'.repeat(64) } }, 1);
    assert.equal(partial.audit.names, true); assert.equal(partial.reviewHash, null);
    assert.equal(partial.phaseStates?.Antecedentes, 'generated'); assert.equal(partial.publicVersion?.reviewed, false);
    await assert.rejects(approvedExportText(partial, 'official'), /revisa/i);
  } finally { await repository.deleteDocument(uid, id); }
});

test('document, linked case and immutable versions survive a new Admin client/repository', async () => {
  const id = randomUUID(), uid = randomUUID();
  const first = await repository.saveDocument(uid, id, draft, 0);
  assert.equal(first.revision, 1);
  assert.deepEqual(await restarted.getDocument(uid, id), first);
  const second = await restarted.saveDocument(uid, id, { ...draft, content: 'Continuación recuperada.' }, 1);
  assert.equal(second.createdAt, first.createdAt);
  assert.equal((await repository.getVersion(uid, id, 1)).content, draft.content);
  assert.deepEqual((await restarted.versions(uid, id)).versions.map(version => version.revision), [2, 1]);
  const caseFile = (await db2.collection('cases').doc(id).get()).data()!;
  assert.equal(caseFile.userId, uid); assert.equal(caseFile.contentRef, id); assert.equal(caseFile.caseNumber, draft.caseNumber);
  const restored = await repository.saveDocument(uid, id, await restarted.getVersion(uid, id, 1), second.revision);
  assert.equal(restored.revision, 3); assert.equal(restored.content, draft.content);
  await repository.deleteDocument(uid, id);
});

test('concurrent tabs produce one version and a 409; oversize snapshots never commit', async () => {
  const id = randomUUID(), uid = randomUUID();
  await repository.saveDocument(uid, id, draft, 0);
  const results = await Promise.allSettled([
    repository.saveDocument(uid, id, { ...draft, content: 'Pestaña A' }, 1),
    restarted.saveDocument(uid, id, { ...draft, content: 'Pestaña B' }, 1),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const failed = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
  assert.equal(failed.reason.status, 409);
  assert.equal((await repository.versions(uid, id)).versions.length, 2);
  await assert.rejects(repository.saveDocument(uid, id, { ...draft, content: 'ñ'.repeat(400_000) }, 2), rejects(413));
  assert.equal((await restarted.getDocument(uid, id)).revision, 2);
  await repository.deleteDocument(uid, id);
});

test('ownership covers documents, history, cases, jobs and provider ID reuse', async () => {
  const id = randomUUID(), uid = randomUUID(), other = randomUUID();
  await repository.saveDocument(uid, id, draft, 0);
  for (const operation of [() => repository.getDocument(other, id), () => repository.saveDocument(other, id, draft, 1),
    () => repository.versions(other, id), () => repository.getVersion(other, id, 1), () => repository.deleteDocument(other, id)]) {
    await assert.rejects(operation(), rejects(403));
  }
  assert.deepEqual((await repository.listDocuments(other)).documents, []);
  const legacyId = randomUUID();
  await db1.collection('cases').doc(legacyId).set({ userId: other });
  await assert.rejects(repository.saveDocument(uid, legacyId, draft, 0), rejects(403));
  assert.equal((await db1.collection('cases').doc(legacyId).get()).data()!.userId, other);
  const jobId = randomUUID();
  await repository.saveJob(uid, { job_id: jobId, status: 'queued' }, 'audiencia.wav');
  await assert.rejects(repository.getJob(other, jobId), rejects(403));
  await assert.rejects(repository.deleteJob(other, jobId), rejects(403));
  await assert.rejects(repository.saveJob(other, { job_id: jobId, status: 'queued' }, 'otro.wav'), rejects(502));
  assert.deepEqual((await repository.listJobs(other)).jobs, []);
  await repository.deleteJob(uid, jobId); await repository.deleteDocument(uid, id);
  await db1.collection('cases').doc(legacyId).delete();
});

test('pending jobs survive restart, out-of-order polls cannot regress, deletion prevents resurrection', async () => {
  const id = randomUUID(), uid = randomUUID();
  await repository.saveJob(uid, normalizeWorkerJob({ job_id: id, status: 'queued' }), 'audiencia.wav');
  assert.equal((await restarted.getJob(uid, id)).fileName, 'audiencia.wav');
  await restarted.updateJob(uid, { job_id: id, status: 'generating_transcript' });
  assert.equal((await repository.updateJob(uid, { job_id: id, status: 'queued' })).status, 'generating_transcript');
  const completed = await restarted.updateJob(uid, normalizeWorkerJob({ job_id: id, status: 'completed', text: 'Texto sintético íntegro.' }));
  assert.equal((await repository.updateJob(uid, { job_id: id, status: 'failed', error: 'Tardío' })).text, completed.text);
  assert.ok(!('text' in (await repository.listJobs(uid)).jobs[0]));
  await repository.deleteJob(uid, id);
  await assert.rejects(restarted.updateJob(uid, completed), rejects(404));
  await assert.rejects(restarted.saveJob(uid, { job_id: id, status: 'queued' }, 'repetido.wav'), rejects(502));
  const tombstone = (await db2.collection('transcriptionJobs').doc(id).get()).data()!;
  assert.equal(tombstone.text, undefined); assert.equal(tombstone.fileName, undefined);
  assert.equal(tombstone.remoteDeletion, 'not_supported');
});

test('document deletion removes versions, sources and case; late and new writes cannot revive it', async () => {
  const id = randomUUID(), uid = randomUUID();
  await repository.saveDocument(uid, id, draft, 0);
  await restarted.deleteDocument(uid, id);
  assert.equal((await db1.collection('documents').doc(id).collection('versions').get()).empty, true);
  assert.equal((await db1.collection('cases').doc(id).get()).exists, false);
  const tombstone = (await db1.collection('documents').doc(id).get()).data()!;
  assert.equal(tombstone.content, undefined); assert.equal(tombstone.transcription, undefined);
  await assert.rejects(repository.getVersion(uid, id, 1), rejects(404));
  for (const revision of [0, 1]) await assert.rejects(repository.saveDocument(uid, id, draft, revision), rejects(404));
});

test('owner-scoped pagination includes all records without leaking another user', async () => {
  const uid = randomUUID();
  const batch = db1.batch();
  for (let i = 0; i < 52; i++) {
    const id = randomUUID();
    batch.set(db1.collection('documents').doc(id), { ...draft, uid, id, deleted: false, revision: 1, createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' });
  }
  await batch.commit();
  const first = await repository.listDocuments(uid);
  assert.equal(first.documents.length, 50); assert.ok(first.nextCursor);
  const second = await restarted.listDocuments(uid, first.nextCursor!);
  assert.equal(second.documents.length, 2); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.documents, ...second.documents].map(document => document.id)).size, 52);
  await assert.rejects(repository.listDocuments(randomUUID(), first.nextCursor!), rejects(403));
  const cleanup = db1.batch(); for (const document of [...first.documents, ...second.documents]) cleanup.delete(db1.collection('documents').doc(document.id)); await cleanup.commit();
});

test('HTTP restart resumes durable jobs; download, owner isolation, malformed drafts and deletion work', async () => {
  const uid = randomUUID(), other = randomUUID(), jobId = randomUUID(), documentId = randomUUID();
  let polls = 0;
  const start = async (repo: WorkspaceRepository) => {
    const app = express(); app.use(express.json({ limit: '1mb' }));
    app.use(createAuthMiddleware(async token => ({ uid: token, admin: true } as unknown as DecodedIdToken)));
    app.use('/api/documents', createDocumentsRouter(repo));
    app.use('/api/transcription', createTranscriptionRouter({
      create: async () => ({ job_id: jobId, status: 'queued' }),
      get: async () => { polls++; return { job_id: jobId, status: 'completed', text: 'Transcripción recuperada.' }; },
    }, (req, _res, next) => { req.file = { originalname: 'sintetico.wav' } as Express.Multer.File; next(); }, repo));
    app.use(securityErrorHandler);
    const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    return { base: `http://127.0.0.1:${address.port}`, close: () => new Promise<void>(resolve => server.close(() => resolve())) };
  };
  let server = await start(repository);
  const request = (path: string, method = 'GET', body?: unknown, owner = uid) => fetch(server.base + path, {
    method, headers: { Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    assert.equal((await request('/api/transcription/jobs', 'POST')).status, 201);
    assert.equal((await request(`/api/documents/${documentId}`, 'PUT', { draft, revision: 0, uid: other })).status, 200);
    await server.close(); server = await start(restarted);
    const resumed = await request(`/api/transcription/jobs/${jobId}`);
    assert.equal((await resumed.json()).text, 'Transcripción recuperada.'); assert.equal(polls, 1);
    assert.equal((await request(`/api/transcription/jobs/${jobId}/transcript`)).status, 200); assert.equal(polls, 1);
    for (const path of [`/api/documents/${documentId}`, `/api/documents/${documentId}/versions`, `/api/transcription/jobs/${jobId}/transcript`]) {
      assert.equal((await request(path, 'GET', undefined, other)).status, 403);
    }
    assert.equal((await request(`/api/documents/${documentId}`, 'PUT', { draft: { ...draft, summary: 3 }, revision: 1 })).status, 400);
    assert.equal((await request(`/api/documents/${documentId}`, 'PUT', { draft, revision: 0 })).status, 409);
    assert.equal((await request('/api/documents?after=..')).status, 400);
    const deletion = await request(`/api/transcription/jobs/${jobId}`, 'DELETE');
    assert.equal((await deletion.json()).remoteDeleted, false);
    assert.equal((await request(`/api/transcription/jobs/${jobId}`)).status, 404); assert.equal(polls, 1);
    assert.equal((await request(`/api/documents/${documentId}`, 'DELETE')).status, 200);
    assert.equal((await request(`/api/documents/${documentId}`)).status, 404);
  } finally { await server.close(); }
});

test('deleting while a provider poll is in flight never restores the deleted transcript', async () => {
  const uid = randomUUID(), id = randomUUID();
  await repository.saveJob(uid, { job_id: id, status: 'processing' }, 'sintetico.wav');
  let release!: () => void;
  let entered!: () => void;
  const providerEntered = new Promise<void>(resolve => { entered = resolve; });
  const providerRelease = new Promise<void>(resolve => { release = resolve; });
  const app = express(); app.use(createAuthMiddleware(async () => ({ uid } as DecodedIdToken)));
  app.use('/api/transcription', createTranscriptionRouter({
    create: async () => { throw new Error('No upload expected'); },
    get: async () => { entered(); await providerRelease; return { job_id: id, status: 'completed', text: 'Resultado tardío.' }; },
  }, (_req, _res, next) => next(), restarted));
  app.use(securityErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}/api/transcription/jobs/${id}`;
  const headers = { Authorization: 'Bearer owner' };
  try {
    const poll = fetch(url, { headers }); await providerEntered;
    assert.equal((await fetch(url, { method: 'DELETE', headers })).status, 200);
    release(); assert.equal((await poll).status, 404);
    await assert.rejects(repository.getJob(uid, id), rejects(404));
    assert.equal((await db1.collection('transcriptionJobs').doc(id).get()).data()!.text, undefined);
  } finally { release(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
