import { Timestamp } from 'firebase-admin/firestore';
import type { Firestore, DocumentSnapshot } from 'firebase-admin/firestore';
import { adminFirestore } from '../services/firebaseAdmin.js';
import { RequestError } from '../middleware/security.js';
import { parseDraft } from '../../shared/documents.js';
import { validateReview, isApproved } from '../../shared/documentIntegrity.js';
import type { DocumentDraft, SavedDocument, DocumentSummary, DocumentVersion } from '../../shared/documents.js';
import { parseTranscriptionJob } from '../../shared/transcription.js';
import type { TranscriptionJob } from '../../shared/transcription.js';
import { TranscriptStore } from './TranscriptStore.js';
import type { SegmentJobStore, UploadMetadata, UploadReservation } from './TranscriptStore.js';
import type { UploadSession } from '../../shared/transcription.js';
import type { TranscriptPage } from '../../shared/transcriptSegments.js';

export interface StoredJob extends TranscriptionJob { fileName: string; createdAt: string; updatedAt: string; uploadRequestId?: string }
export interface JobStore {
  ensureAvailable(): Promise<void>;
  saveJob(uid: string, job: TranscriptionJob, fileName: string): Promise<StoredJob>;
  getJob(uid: string, id: string): Promise<StoredJob>;
  updateJob(uid: string, job: TranscriptionJob): Promise<StoredJob>;
  listJobs(uid: string, after?: string): Promise<{ jobs: Omit<StoredJob, 'text'>[]; nextCursor: string | null }>;
  deleteJob(uid: string, id: string): Promise<void>;
}

function owned(snapshot: DocumentSnapshot, uid: string, allowDeleted = false) {
  if (!snapshot.exists) throw new RequestError(404, 'Registro no encontrado.');
  const record = snapshot.data()!;
  if (record.uid !== uid) throw new RequestError(403, 'No tienes permiso para acceder a este registro.');
  if (record.deleted && !allowDeleted) throw new RequestError(404, 'Registro eliminado.');
  return record;
}

/** Firestore is durable across server restarts; every read/write enforces the authenticated UID. */
export class WorkspaceRepository implements JobStore, SegmentJobStore {
  constructor(private readonly database: () => Firestore = adminFirestore) {}
  private get db() { return this.database(); }
  private get sourceStore() { return new TranscriptStore(this.database); }
  reserveUpload(uid: string, requestId: string, metadata: UploadMetadata, kind: UploadReservation['kind']) { return this.sourceStore.reserveUpload(uid, requestId, metadata, kind); }
  getUploadRequest(uid: string, requestId: string) { return this.sourceStore.getUploadRequest(uid, requestId); }
  attachUpload(uid: string, requestId: string, job: TranscriptionJob, upload?: UploadSession['upload']) { return this.sourceStore.attachUpload(uid, requestId, job, upload); }
  appendTranscriptPage(uid: string, id: string, page: TranscriptPage) { return this.sourceStore.appendTranscriptPage(uid, id, page); }
  finalizeTranscript(uid: string, id: string) { return this.sourceStore.finalizeTranscript(uid, id); }
  getSegmentPage(uid: string, id: string, offset: number, limit: number) { return this.sourceStore.getSegmentPage(uid, id, offset, limit); }
  getTranscriptText(uid: string, id: string) { return this.sourceStore.getTranscriptText(uid, id); }

  /** Avoid contacting a billable provider when the database is already unavailable. */
  async ensureAvailable(): Promise<void> { await this.db.collection('transcriptionJobs').doc('_readiness').get(); }

  async saveDocument(uid: string, id: string, draft: DocumentDraft, revision: number): Promise<SavedDocument> {
    draft = await validateReview(parseDraft(draft));
    if (Buffer.byteLength(JSON.stringify(draft), 'utf8') > 700_000) throw new RequestError(413, 'El borrador supera 700 KB. Divide el contenido antes de guardar.');
    const ref = this.db.collection('documents').doc(id);
    return this.db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      const previous = snapshot.exists ? owned(snapshot, uid) : undefined;
      const caseRef = this.db.collection('cases').doc(id);
      const caseSnapshot = await tx.get(caseRef);
      if (caseSnapshot.exists && caseSnapshot.data()!.userId !== uid) throw new RequestError(403, 'El expediente pertenece a otro usuario.');
      if (!previous && revision !== 0) throw new RequestError(404, 'El documento ya no existe.');
      if ((previous?.revision ?? 0) !== revision) throw new RequestError(409, 'Otra pestaña modificó este documento. Copia tus cambios antes de recargar; el guardado automático está detenido.');
      const now = new Date().toISOString();
      const document: SavedDocument = { ...draft, id, revision: revision + 1, createdAt: previous?.createdAt ?? now, updatedAt: now };
      tx.set(ref, { ...document, uid, deleted: false });
      tx.create(ref.collection('versions').doc(String(document.revision)), { ...document, uid });
      tx.set(caseRef, {
        userId: uid, caseNumber: draft.caseNumber, type: draft.caseType,
        status: isApproved(draft) ? 'COMPLETADO' : 'PROCESANDO',
        createdAt: Timestamp.fromDate(new Date(document.createdAt)), updatedAt: Timestamp.fromDate(new Date(now)), contentRef: id,
      });
      return document;
    });
  }

  async getDocument(uid: string, id: string): Promise<SavedDocument> {
    const record = owned(await this.db.collection('documents').doc(id).get(), uid);
    return this.publicDocument(record);
  }
  private publicDocument(record: FirebaseFirestore.DocumentData): SavedDocument {
    const { uid: _uid, deleted: _deleted, ...document } = record;
    void _uid; void _deleted;
    return document as SavedDocument;
  }

  async listDocuments(uid: string, after?: string): Promise<{ documents: DocumentSummary[]; nextCursor: string | null }> {
    let query = this.db.collection('documents').where('uid', '==', uid).where('deleted', '==', false).orderBy('updatedAt', 'desc').orderBy('__name__', 'desc');
    if (after) {
      const cursor = await this.db.collection('documents').doc(after).get();
      owned(cursor, uid);
      query = query.startAfter(cursor);
    }
    const page = await query.limit(51).get();
    const documents = page.docs.slice(0, 50).map(snapshot => {
      const data = snapshot.data() as SavedDocument;
      return { id: snapshot.id, title: data.title, caseNumber: data.caseNumber, caseType: data.caseType, revision: data.revision,
        createdAt: data.createdAt, updatedAt: data.updatedAt,
        status: isApproved(data) ? 'Revisado' : 'Borrador' } as DocumentSummary;
    });
    return { documents, nextCursor: page.size > 50 ? documents.at(-1)!.id : null };
  }

  async versions(uid: string, id: string, before?: number): Promise<{ versions: DocumentVersion[]; nextCursor: number | null }> {
    await this.getDocument(uid, id);
    let query = this.db.collection('documents').doc(id).collection('versions').orderBy('revision', 'desc');
    if (before) query = query.startAfter(before);
    const page = await query.limit(51).get();
    const versions = page.docs.slice(0, 50).map(snapshot => ({ revision: snapshot.data().revision as number, savedAt: snapshot.data().updatedAt as string }));
    return { versions, nextCursor: page.size > 50 ? versions.at(-1)!.revision : null };
  }

  async getVersion(uid: string, id: string, revision: number): Promise<SavedDocument> {
    // A transaction prevents returning a version after a concurrent tombstone.
    return this.db.runTransaction(async tx => {
      owned(await tx.get(this.db.collection('documents').doc(id)), uid);
      return this.publicDocument(owned(await tx.get(this.db.collection('documents').doc(id).collection('versions').doc(String(revision))), uid));
    });
  }

  async deleteDocument(uid: string, id: string): Promise<void> {
    const ref = this.db.collection('documents').doc(id);
    await this.db.runTransaction(async tx => {
      owned(await tx.get(ref), uid, true);
      tx.set(ref, { uid, id, deleted: true, deletedAt: new Date().toISOString() });
      tx.delete(this.db.collection('cases').doc(id));
    });
    // Keep only the tombstone, remove snapshots (including their sources).
    await this.db.recursiveDelete(ref.collection('versions'));
  }

  async saveJob(uid: string, job: TranscriptionJob, fileName: string): Promise<StoredJob> {
    job = this.validatedJob(job);
    const ref = this.db.collection('transcriptionJobs').doc(job.job_id);
    return this.db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      // Provider ID reuse is unsafe even for the same owner or an old tombstone.
      if (snapshot.exists) throw new RequestError(502, 'El proveedor devolvió un identificador de trabajo duplicado.');
      const now = new Date().toISOString();
      const stored: StoredJob = { ...job, fileName: fileName.slice(0, 255), createdAt: now, updatedAt: now };
      tx.create(ref, { ...stored, uid, externalId: job.job_id, deleted: false });
      return stored;
    });
  }

  async getJob(uid: string, id: string): Promise<StoredJob> {
    return this.publicJob(owned(await this.db.collection('transcriptionJobs').doc(id).get(), uid));
  }
  private publicJob(record: FirebaseFirestore.DocumentData): StoredJob {
    const { uid: _uid, externalId: _external, deleted: _deleted, _recoveryState: _state, requestId: _request, ...job } = record;
    void _uid; void _external; void _deleted; void _state; void _request;
    return { ...job, ...(record.status === 'uploading' && record.requestId ? { uploadRequestId: record.requestId } : {}) } as StoredJob;
  }
  private validatedJob(job: TranscriptionJob): TranscriptionJob {
    let parsed;
    try { parsed = parseTranscriptionJob(job); }
    catch { throw new RequestError(502, 'El proveedor devolvió un trabajo inválido.'); }
    // Firestore rejects undefined values; the shared parser intentionally has optional properties.
    job = Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined)) as unknown as TranscriptionJob;
    if (Buffer.byteLength(JSON.stringify(job), 'utf8') > 900_000) throw new RequestError(502, 'La transcripción excede el tamaño de almacenamiento permitido (900 KB).');
    return job;
  }

  async updateJob(uid: string, job: TranscriptionJob): Promise<StoredJob> {
    job = this.validatedJob(job);
    const ref = this.db.collection('transcriptionJobs').doc(job.job_id);
    return this.db.runTransaction(async tx => {
      const previous = owned(await tx.get(ref), uid);
      if (previous.status === 'completed' || previous.status === 'failed') return this.publicJob(previous);
      const rank = { uploading: -1, queued: 0, processing: 1, generating_transcript: 2, recovering_transcript: 3, completed: 4, failed: 4 };
      if (rank[job.status] < rank[previous.status as TranscriptionJob['status']]) return this.publicJob(previous);
      const stageRank = { upload: 0, video: 1, captions: 2, recovery: 3 };
      if (job.status === previous.status && job.stage && previous.stage && stageRank[job.stage] < stageRank[previous.stage as keyof typeof stageRank]) return this.publicJob(previous);
      const stored = { ...job, fileName: previous.fileName as string, createdAt: previous.createdAt as string, updatedAt: new Date().toISOString() };
      const updated = { ...previous, ...stored, uid, externalId: job.job_id, deleted: false };
      if (job.status !== 'processing' || job.stage !== 'video') delete updated.progress;
      tx.set(ref, updated);
      return this.publicJob(updated);
    });
  }

  async listJobs(uid: string, after?: string) {
    let query = this.db.collection('transcriptionJobs').where('uid', '==', uid).where('deleted', '==', false).orderBy('createdAt', 'desc').orderBy('__name__', 'desc');
    if (after) {
      const cursor = await this.db.collection('transcriptionJobs').doc(after).get();
      owned(cursor, uid); query = query.startAfter(cursor);
    }
    const page = await query.limit(51).get();
    const jobs = page.docs.slice(0, 50).map(snapshot => {
      const { text: _text, ...job } = this.publicJob(snapshot.data()); void _text; return job;
    });
    return { jobs, nextCursor: page.size > 50 ? jobs.at(-1)!.job_id : null };
  }

  async deleteJob(uid: string, id: string): Promise<void> {
    const ref = this.db.collection('transcriptionJobs').doc(id);
    await this.db.runTransaction(async tx => {
      const previous = owned(await tx.get(ref), uid, true);
      if (previous.remoteDeletion && typeof previous.remoteDeletion === 'object' && ['pending', 'unknown'].includes(previous.remoteDeletion.status)) {
        throw new RequestError(409, 'Comprueba el resultado del borrado remoto antes de eliminar la copia de LexIA.');
      }
      if (previous.requestId) tx.set(this.db.collection('transcriptionRequests').doc(previous.requestId), { uid, requestId: previous.requestId, deleted: true, deletedAt: new Date().toISOString() });
      tx.set(ref, { uid, job_id: id, externalId: id, deleted: true, deletedAt: new Date().toISOString(), remoteDeletion: 'not_supported' });
    });
    await this.db.recursiveDelete(ref.collection('segments'));
    await this.db.recursiveDelete(ref.collection('wordArtifacts'));
  }
}
