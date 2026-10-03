import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getApp, initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { adminFirestore } from '../server/services/firebaseAdmin.js';
import { WorkspaceRepository } from '../server/persistence/WorkspaceRepository.js';
import { normalizeWorkerJob } from '../server/services/CloudflareTranscriptionService.js';
import type { DocumentDraft } from '../shared/documents.js';
import { parseDraft } from '../shared/documents.js';
import { approvedExportText, publicFingerprint, reviewFingerprint } from '../shared/documentIntegrity.js';

dotenv.config({ path: '.env.local', quiet: true });
if (!process.argv.includes('--live') || process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Prueba manual de la base real: requiere --live y ausencia de FIRESTORE_EMULATOR_HOST.');
const id = `phase3-smoke-${randomUUID()}`;
const uid = `synthetic-${id}`;
const db = adminFirestore();
const repository = new WorkspaceRepository(() => db);
const firstApp = getApp();
const secondApp = initializeApp({ projectId: firstApp.options.projectId, credential: firstApp.options.credential }, id);
const secondDb = getFirestore(secondApp);
const recovered = new WorkspaceRepository(() => secondDb);
const draft: DocumentDraft = { title: 'Prueba técnica temporal', caseNumber: 'TEST-SINTETICO', caseType: 'Penal', documentType: 'Sentencia Definitiva',
  summary: 'Información sintética de verificación.', transcription: 'Texto sintético sin personas ni expedientes reales.', content: 'Borrador sintético inicial.',
  completedPhases: [], audit: { names: false, congruence: false, pii: false } };
try {
  // Validate both list indexes before creating any synthetic record.
  await repository.listDocuments(uid); await repository.listJobs(uid);
  await repository.saveDocument(uid, id, draft, 0);
  assert.deepEqual(await recovered.getDocument(uid, id), await repository.getDocument(uid, id));
  await recovered.saveDocument(uid, id, { ...draft, content: 'Continuación sintética.' }, 1);
  assert.equal((await repository.getVersion(uid, id, 1)).content, draft.content);
  await assert.rejects(repository.saveDocument(uid, id, draft, 1), (error: { status: number }) => error.status === 409);
  await assert.rejects(recovered.getDocument(`${uid}-other`, id), (error: { status: number }) => error.status === 403);
  assert.equal((await repository.listDocuments(uid)).documents[0].id, id);
  const reviewed = parseDraft({ ...draft, originalTranscription: 'Fuente original sintética separada.', content: 'Nombre sintético: Persona QA.',
    reviewHash: null, completedPhases: ['Prueba técnica'] });
  reviewed.audit = { names: true, congruence: true, pii: true };
  reviewed.reviewHash = await reviewFingerprint(reviewed);
  const start = reviewed.content.indexOf('Persona QA');
  reviewed.publicVersion = { redactions: [{ start, end: start + 'Persona QA'.length }], reviewed: true, reviewHash: null };
  reviewed.publicVersion.reviewHash = await publicFingerprint(reviewed);
  await repository.saveDocument(uid, id, reviewed, 2);
  const loaded = await recovered.getDocument(uid, id);
  assert.equal(loaded.originalTranscription, reviewed.originalTranscription);
  assert.equal(loaded.phaseStates?.['Prueba técnica'], 'reviewed');
  assert.equal(await approvedExportText(loaded, 'official'), reviewed.content);
  assert.equal(await approvedExportText(loaded, 'public'), 'Nombre sintético: [DATO OCULTO].');
  const invalidated = await recovered.saveDocument(uid, id, { ...loaded, title: 'Título técnico editado.' }, 3);
  assert.equal(invalidated.reviewHash, null); assert.equal(invalidated.publicVersion?.reviewed, false);
  assert.equal((await repository.getVersion(uid, id, 3)).reviewHash, loaded.reviewHash);
  await repository.saveJob(uid, normalizeWorkerJob({ job_id: id, status: 'queued' }), 'sintetico.wav');
  assert.equal((await recovered.getJob(uid, id)).status, 'queued');
  await recovered.updateJob(uid, normalizeWorkerJob({ job_id: id, status: 'completed', text: 'Transcripción sintética recuperada.' }));
  assert.equal((await repository.getJob(uid, id)).text, 'Transcripción sintética recuperada.');
  assert.equal((await recovered.listJobs(uid)).jobs[0].job_id, id);
  await repository.deleteJob(uid, id);
  await assert.rejects(recovered.getJob(uid, id), (error: { status: number }) => error.status === 404);
  await repository.deleteDocument(uid, id);
  assert.equal((await db.collection('documents').doc(id).collection('versions').get()).empty, true);
  assert.equal((await db.collection('cases').doc(id).get()).exists, false);
  console.log('Prueba real aprobada: guardado, recuperación, versiones, conflictos, aislamiento, aprobación vinculada al texto, ocultaciones revisadas y eliminación. Sin llamadas a IA ni al Worker.');
} catch (error) {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  console.log(`Prueba real no completada${typeof code === 'number' ? ` (código ${code})` : ''}. No se imprimen fuentes ni credenciales.`);
  process.exitCode = 1;
} finally {
  // Purge only the unique synthetic IDs created by this run, including tombstones.
  try {
    await db.recursiveDelete(db.collection('documents').doc(id));
    const batch = db.batch(); batch.delete(db.collection('cases').doc(id)); batch.delete(db.collection('transcriptionJobs').doc(id)); await batch.commit();
    for (const collection of ['documents', 'cases', 'transcriptionJobs']) assert.equal((await db.collection(collection).doc(id).get()).exists, false);
    console.log('Limpieza verificada: registros sintéticos, versiones y marcas de eliminación retirados.');
  } catch { console.log(`No se pudo confirmar la limpieza de la prueba sintética ${id}.`); process.exitCode = 1; }
  await deleteApp(secondApp); await deleteApp(firstApp);
}
