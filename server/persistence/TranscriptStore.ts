import { createHash } from 'node:crypto';
import type { Firestore, DocumentData, DocumentSnapshot } from 'firebase-admin/firestore';
import { RequestError } from '../middleware/security.js';
import { isRecord, parseTranscriptionJob, parseUploadSession, validJobId, validSha256, MAX_DIRECT_MEDIA_BYTES } from '../../shared/transcription.js';
import type { UploadSession, TranscriptionJob } from '../../shared/transcription.js';
import { parseTranscriptPage, canonicalSegments, validateTranscriptSequence, formatLiteralTranscript } from '../../shared/transcriptSegments.js';
import type { TranscriptPage, TranscriptSegment } from '../../shared/transcriptSegments.js';
import type { StoredJob } from './WorkspaceRepository.js';

export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const BLOCK_BYTES = 600_000;
export interface UploadMetadata { filename: string; size: number; mime: string; lastModified?: number; fingerprint?: string }
export interface UploadReservation { requestId: string; kind: 'multipart' | 'direct'; metadata: UploadMetadata; status: 'pending' | 'accepted'; jobId?: string; upload?: UploadSession['upload'] }
export interface SegmentJobStore {
  reserveUpload(uid: string, requestId: string, metadata: UploadMetadata, kind: UploadReservation['kind']): Promise<{ reservation: UploadReservation; created: boolean }>;
  getUploadRequest(uid: string, requestId: string): Promise<UploadReservation>;
  attachUpload(uid: string, requestId: string, job: TranscriptionJob, upload?: UploadSession['upload']): Promise<void>;
  appendTranscriptPage(uid: string, id: string, page: TranscriptPage): Promise<StoredJob>;
  finalizeTranscript(uid: string, id: string): Promise<StoredJob>;
  getSegmentPage(uid: string, id: string, offset: number, limit: number): Promise<TranscriptPage>;
  getTranscriptText(uid: string, id: string): Promise<string>;
}
function owner(snapshot: DocumentSnapshot, uid: string): DocumentData {
  if (!snapshot.exists) throw new RequestError(404, 'Registro no encontrado.');
  const data = snapshot.data()!;
  if (data.uid !== uid) throw new RequestError(403, 'No tienes permiso para acceder a este registro.');
  if (data.deleted) throw new RequestError(404, 'Registro eliminado.');
  return data;
}
const publicJob = (data: DocumentData): StoredJob => ({ ...parseTranscriptionJob(data), fileName: data.fileName, createdAt: data.createdAt, updatedAt: data.updatedAt });
const publicReservation = (data: DocumentData): UploadReservation => ({ requestId: data.requestId, kind: data.kind, metadata: data.metadata, status: data.status,
  ...(data.jobId ? { jobId: data.jobId } : {}), ...(data.upload ? { upload: data.upload } : {}) });
const blockId = (index: number) => String(index).padStart(8, '0');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const sameMetadata = (a: UploadMetadata, b: UploadMetadata) => ['filename', 'size', 'mime', 'lastModified', 'fingerprint'].every(key => a[key as keyof UploadMetadata] === b[key as keyof UploadMetadata]);
interface RecoveryState { totalSegments: number; sha256: string; nextOffset: number; totalBytes: number; previousSegment?: Pick<TranscriptSegment, 'index' | 'start' | 'end'> }
function recoveryState(data: DocumentData): RecoveryState {
  const state = data._recoveryState;
  if (!isRecord(state) || !Number.isSafeInteger(state.totalSegments) || !validSha256(state.sha256) || !Number.isSafeInteger(state.nextOffset) || !Number.isSafeInteger(state.totalBytes)) throw new RequestError(409, 'Falta el punto de recuperación de segmentos.');
  return state as unknown as RecoveryState;
}

/** Owner-scoped upload reservations and immutable source blocks share the existing durable job. */
export class TranscriptStore implements SegmentJobStore {
  constructor(private readonly database: () => Firestore) {}
  private get db() { return this.database(); }

  /** Reserve before contacting Stream; an accepted or pending request can never trigger another upload. */
  async reserveUpload(uid: string, requestId: string, metadata: UploadMetadata, kind: UploadReservation['kind']) {
    if (!validJobId(requestId) || requestId.length > 100 || typeof metadata.filename !== 'string' || !metadata.filename.trim() || metadata.filename.length > 250
      || !Number.isSafeInteger(metadata.size) || metadata.size <= 0 || metadata.size > MAX_DIRECT_MEDIA_BYTES || typeof metadata.mime !== 'string' || metadata.mime.length > 100) throw new RequestError(400, 'Metadatos de carga inválidos.');
    if (kind === 'direct' && (!Number.isSafeInteger(metadata.lastModified) || metadata.lastModified! < 0 || !validSha256(metadata.fingerprint))) throw new RequestError(400, 'Identidad del archivo inválida.');
    const ref = this.db.collection('transcriptionRequests').doc(requestId);
    return this.db.runTransaction(async tx => {
      const snapshot = await tx.get(ref);
      if (snapshot.exists) {
        const previous = owner(snapshot, uid);
        if (previous.kind !== kind || !sameMetadata(previous.metadata, metadata)) throw new RequestError(409, 'El identificador de carga ya corresponde a otro archivo.');
        return { reservation: publicReservation(previous), created: false };
      }
      const now = new Date().toISOString();
      const reservation: UploadReservation = { requestId, metadata, kind, status: 'pending' };
      tx.create(ref, { ...reservation, uid, deleted: false, createdAt: now, updatedAt: now });
      return { reservation, created: true };
    });
  }

  /** Recovery reads metadata only; it cannot submit a second billable upload. */
  async getUploadRequest(uid: string, requestId: string): Promise<UploadReservation> {
    return publicReservation(owner(await this.db.collection('transcriptionRequests').doc(requestId).get(), uid));
  }

  /** Attach an accepted job and its private one-time upload capability to the same owner reservation. */
  async attachUpload(uid: string, requestId: string, job: TranscriptionJob, upload?: UploadSession['upload']): Promise<void> {
    if (upload) parseUploadSession({ job_id: job.job_id, status: 'uploading', upload });
    const ref = this.db.collection('transcriptionRequests').doc(requestId), jobRef = this.db.collection('transcriptionJobs').doc(job.job_id);
    await this.db.runTransaction(async tx => {
      const previous = owner(await tx.get(ref), uid); owner(await tx.get(jobRef), uid);
      if (previous.jobId && previous.jobId !== job.job_id) throw new RequestError(409, 'La carga está asociada a otro trabajo.');
      tx.update(ref, { status: 'accepted', jobId: job.job_id, ...(upload ? { upload } : {}), updatedAt: new Date().toISOString() });
      tx.update(jobRef, { requestId });
    });
  }

  /** Commit a validated page with its cursor, splitting data below Firestore's per-document limit. */
  async appendTranscriptPage(uid: string, id: string, input: TranscriptPage): Promise<StoredJob> {
    let page: TranscriptPage;
    try { page = parseTranscriptPage(input); } catch { throw new RequestError(502, 'La página de transcripción no es íntegra.'); }
    if (page.job_id !== id) throw new RequestError(502, 'La página corresponde a otro trabajo.');
    const ref = this.db.collection('transcriptionJobs').doc(id);
    return this.db.runTransaction(async tx => {
      const previous = owner(await tx.get(ref), uid);
      if (previous.status === 'completed') return publicJob(previous);
      if (previous.status === 'failed') throw new RequestError(409, 'El trabajo ya terminó con error.');
      const state: RecoveryState = previous._recoveryState ? recoveryState(previous) : { totalSegments: page.total_segments, sha256: page.transcript_hash, nextOffset: 0, totalBytes: 0 };
      if (state.sha256 !== page.transcript_hash || state.totalSegments !== page.total_segments) throw new RequestError(409, 'La fuente cambió durante la recuperación. No se declara completada.');
      if (page.offset < state.nextOffset) return publicJob(previous); // another poll committed this same version
      try { parseTranscriptPage(page, { jobId: id, offset: state.nextOffset, limit: page.limit, totalSegments: state.totalSegments, sha256: state.sha256, previousSegment: state.previousSegment }); }
      catch { throw new RequestError(502, 'Los segmentos están incompletos o fuera de orden.'); }
      const bytes = Buffer.byteLength(canonicalSegments(page.segments));
      if (state.totalBytes + bytes > MAX_SOURCE_BYTES) throw new RequestError(413, 'La fuente supera 20 MiB de texto. No se truncó; divide la transcripción.');
      const groups: TranscriptSegment[][] = []; let group: TranscriptSegment[] = [], size = 2;
      for (const segment of page.segments) {
        const length = Buffer.byteLength(JSON.stringify(segment)) + 1;
        if (group.length && size + length > BLOCK_BYTES) { groups.push(group); group = []; size = 2; }
        group.push(segment); size += length;
      }
      if (group.length) groups.push(group);
      for (const segments of groups) tx.create(ref.collection('segments').doc(blockId(segments[0].index)), {
        uid, startIndex: segments[0].index, endIndex: segments.at(-1)!.index + 1,
        segments, sha256: hash(canonicalSegments(segments)), transcriptHash: page.transcript_hash,
      });
      const nextOffset = page.offset + page.segments.length;
      const last = page.segments.at(-1)!;
      const nextState: RecoveryState = { ...state, nextOffset, totalBytes: state.totalBytes + bytes, previousSegment: { index: last.index, start: last.start, end: last.end } };
      const updated: DocumentData = { ...previous, status: 'recovering_transcript', stage: 'recovery', recovery: { recoveredSegments: nextOffset, totalSegments: state.totalSegments },
        _recoveryState: nextState, updatedAt: new Date().toISOString() };
      delete updated.progress;
      tx.set(ref, updated); return publicJob(updated);
    });
  }

  private async readBlocks(uid: string, id: string, data: DocumentData): Promise<TranscriptSegment[]> {
    const state = recoveryState(data), collection = this.db.collection('transcriptionJobs').doc(id).collection('segments');
    const blocks = await collection.orderBy('startIndex').get(); const segments: TranscriptSegment[] = [];
    let bytes = 0;
    for (const block of blocks.docs) {
      const stored = owner(block, uid), canonical = canonicalSegments(stored.segments);
      bytes += Buffer.byteLength(canonical);
      if (bytes > MAX_SOURCE_BYTES || stored.transcriptHash !== state.sha256 || hash(canonical) !== stored.sha256 || stored.startIndex !== segments.length) throw new RequestError(502, 'Un bloque guardado no supera la comprobación de integridad.');
      segments.push(...stored.segments);
    }
    try { validateTranscriptSequence(segments); } catch { throw new RequestError(502, 'Los bloques guardados no forman una fuente íntegra.'); }
    if (segments.length !== state.totalSegments || hash(canonicalSegments(segments)) !== state.sha256) throw new RequestError(502, 'La fuente completa no coincide con la huella del proveedor.');
    return segments;
  }

  /** Mark completion only after verifying every block and the canonical hash of the full source. */
  async finalizeTranscript(uid: string, id: string): Promise<StoredJob> {
    const ref = this.db.collection('transcriptionJobs').doc(id), previous = owner(await ref.get(), uid), state = recoveryState(previous);
    if (state.nextOffset !== state.totalSegments) throw new RequestError(409, 'Todavía faltan segmentos por recuperar.');
    await this.readBlocks(uid, id, previous);
    return this.db.runTransaction(async tx => {
      const latest = owner(await tx.get(ref), uid), current = recoveryState(latest);
      if (latest.status === 'failed' || current.sha256 !== state.sha256 || current.nextOffset !== state.totalSegments) throw new RequestError(409, 'El punto de recuperación cambió o el trabajo terminó con error.');
      const completed = { ...latest, status: 'completed', stage: 'recovery', updatedAt: new Date().toISOString(), transcript: {
        segmentCount: state.totalSegments, sha256: state.sha256, language: 'es', verified: true, formatVersion: 1,
      } };
      tx.set(ref, completed); return publicJob(completed);
    });
  }

  /** Retrieve a bounded page of checked blocks; late deletion cannot revive or return the source. */
  async getSegmentPage(uid: string, id: string, offset: number, limit: number): Promise<TranscriptPage> {
    const ref = this.db.collection('transcriptionJobs').doc(id);
    return this.db.runTransaction(async tx => {
      const parent = owner(await tx.get(ref), uid);
      if (parent.status !== 'completed' || !parent.transcript) throw new RequestError(409, 'La fuente todavía no está verificada.');
      const state = recoveryState(parent);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset >= state.totalSegments || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new RequestError(400, 'Paginación inválida.');
      const blocks = await tx.get(ref.collection('segments').where('endIndex', '>', offset).orderBy('endIndex').limit(201));
      const segments: TranscriptSegment[] = []; let bytes = 0;
      blockLoop: for (const block of blocks.docs) {
        const stored = owner(block, uid), canonical = canonicalSegments(stored.segments);
        if (stored.transcriptHash !== state.sha256 || hash(canonical) !== stored.sha256) throw new RequestError(502, 'El bloque guardado no es íntegro.');
        for (const segment of stored.segments as TranscriptSegment[]) {
          if (segment.index < offset) continue;
          const length = Buffer.byteLength(JSON.stringify(segment));
          if (segments.length >= limit || bytes + length > 650_000) break blockLoop;
          segments.push(segment); bytes += length;
        }
        if (segments.length >= limit || bytes > 390_000) break;
      }
      const next = offset + segments.length;
      try { return parseTranscriptPage({ job_id: id, status: 'completed', language: 'es', total_segments: state.totalSegments, offset, limit, segments, transcript_hash: state.sha256, next_offset: next === state.totalSegments ? null : next }); }
      catch { throw new RequestError(502, 'La página guardada no forma una fuente íntegra.'); }
    });
  }

  /** Return the entire literal source for download, preserving timing and verified speaker metadata. */
  async getTranscriptText(uid: string, id: string): Promise<string> {
    const ref = this.db.collection('transcriptionJobs').doc(id), data = owner(await ref.get(), uid);
    if (data.status !== 'completed') throw new RequestError(409, 'La transcripción todavía no está completada.');
    if (!data.transcript) {
      if (typeof data.text !== 'string' || !data.text.trim()) throw new RequestError(409, 'La transcripción no contiene una fuente.');
      return data.text;
    }
    const segments = await this.readBlocks(uid, id, data);
    owner(await ref.get(), uid);
    return formatLiteralTranscript(segments);
  }
}
