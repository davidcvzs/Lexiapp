import { createHash } from 'node:crypto';
import type { DocumentData, DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { adminFirestore } from '../services/firebaseAdmin.js';
import { RequestError } from '../middleware/security.js';
import { isRecord, parseTranscriptManifest, validJobId, validSha256 } from '../../shared/transcription.js';
import { MAX_WORD_ARTIFACT_BYTES, WORD_ARTIFACT_BLOCK_BYTES, parseRemoteDeletionState, parseTranscriptWordReceipt } from '../../shared/transcriptWord.js';
import type { RemoteDeletionState, TranscriptWordReceipt, TranscriptWordState } from '../../shared/transcriptWord.js';

export interface StoredWordArtifact { artifact: TranscriptWordReceipt; bytes: Uint8Array }
export interface TranscriptArtifactRepository {
  save(uid: string, id: string, artifact: TranscriptWordReceipt, bytes: Uint8Array): Promise<TranscriptWordReceipt>;
  getState(uid: string, id: string): Promise<TranscriptWordState>;
  download(uid: string, id: string): Promise<StoredWordArtifact>;
  reserveDeletion(uid: string, id: string, artifactId: string, artifactHash: string): Promise<{ created: boolean; state: RemoteDeletionState }>;
  finishDeletion(uid: string, id: string, artifactId: string, status: 'deleted' | 'failed' | 'unknown', message: string): Promise<RemoteDeletionState>;
}
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const blockId = (index: number) => String(index).padStart(4, '0');
function owner(snapshot: DocumentSnapshot, uid: string): DocumentData {
  if (!snapshot.exists) throw new RequestError(404, 'Registro no encontrado.');
  const data = snapshot.data()!;
  if (data.uid !== uid) throw new RequestError(403, 'No tienes permiso para acceder a este registro.');
  if (data.deleted) throw new RequestError(404, 'Registro eliminado.');
  return data;
}
function verifiedParent(data: DocumentData) {
  if (data.status !== 'completed') throw new RequestError(409, 'La transcripción todavía no está completada.');
  try { return parseTranscriptManifest(data.transcript); }
  catch { throw new RequestError(409, 'El Word requiere una fuente completa de segmentos verificados.'); }
}
function receipt(data: DocumentData, id: string, sourceHash: string): TranscriptWordReceipt {
  let value: TranscriptWordReceipt;
  try { value = parseTranscriptWordReceipt(data); }
  catch { throw new RequestError(502, 'El recibo guardado de Word no es íntegro.'); }
  if (value.jobId !== id || value.sourceHash !== sourceHash || value.artifactId !== value.reviewHash) throw new RequestError(409, 'El Word corresponde a otra versión de la fuente.');
  // Only public receipt fields leave the repository; storage ownership is never accepted from clients.
  return { jobId: value.jobId, artifactId: value.artifactId, sourceHash: value.sourceHash, contentHash: value.contentHash,
    artifactHash: value.artifactHash, byteLength: value.byteLength, fileName: value.fileName, createdAt: value.createdAt,
    reviewHash: value.reviewHash, format: value.format, ...(value.caseNumber === undefined ? {} : { caseNumber: value.caseNumber }) };
}
function deletion(data: DocumentData): RemoteDeletionState {
  if (data.remoteDeletion === undefined || data.remoteDeletion === 'not_supported') return { status: 'not_requested' };
  try { return parseRemoteDeletionState(data.remoteDeletion); }
  catch { throw new RequestError(502, 'El estado guardado del borrado remoto no es válido.'); }
}

/** Private Firestore blocks preserve a checked DOCX independently of the remote video. */
export class TranscriptArtifactStore implements TranscriptArtifactRepository {
  constructor(private readonly database: () => Firestore = adminFirestore) {}
  private get db() { return this.database(); }
  private parent(id: string) {
    if (!validJobId(id)) throw new RequestError(400, 'Identificador de trabajo inválido.');
    return this.db.collection('transcriptionJobs').doc(id);
  }

  /** Commit all bounded bytes, their receipt and the current reference in one transaction. */
  async save(uid: string, id: string, input: TranscriptWordReceipt, bytes: Uint8Array): Promise<TranscriptWordReceipt> {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > MAX_WORD_ARTIFACT_BYTES) throw new RequestError(413, 'El Word supera el límite de 4 MiB. No se guardó ni truncó.');
    let artifact: TranscriptWordReceipt;
    try { artifact = parseTranscriptWordReceipt(input); } catch { throw new RequestError(502, 'No se obtuvo un recibo válido de Word.'); }
    if (artifact.byteLength !== bytes.byteLength || hash(bytes) !== artifact.artifactHash || artifact.jobId !== id || artifact.artifactId !== artifact.reviewHash) throw new RequestError(502, 'El Word no coincide con su recibo de integridad.');
    const parentRef = this.parent(id), artifactRef = parentRef.collection('wordArtifacts').doc(artifact.artifactId);
    return this.db.runTransaction(async tx => {
      const parent = owner(await tx.get(parentRef), uid), manifest = verifiedParent(parent), state = deletion(parent);
      if (manifest.sha256 !== artifact.sourceHash) throw new RequestError(409, 'La fuente cambió antes de guardar el Word.');
      if (['pending', 'unknown'].includes(state.status)) throw new RequestError(409, 'Resuelve el borrado pendiente antes de cambiar el artefacto vigente.');
      const existing = await tx.get(artifactRef);
      let saved = artifact;
      if (existing.exists) saved = receipt(owner(existing, uid), id, manifest.sha256);
      else {
        tx.create(artifactRef, { ...artifact, uid });
        for (let offset = 0, index = 0; offset < bytes.byteLength; offset += WORD_ARTIFACT_BLOCK_BYTES, index++) {
          const data = Buffer.from(bytes.subarray(offset, offset + WORD_ARTIFACT_BLOCK_BYTES));
          tx.create(artifactRef.collection('blocks').doc(blockId(index)), { uid, index, data, sha256: hash(data) });
        }
      }
      tx.update(parentRef, { wordArtifactId: saved.artifactId,
        ...(state.status === 'failed' && state.artifactId !== saved.artifactId ? { remoteDeletion: { status: 'not_requested' } } : {}) });
      return saved;
    });
  }

  /** Return owner-scoped metadata; a receipt alone never authorizes deletion without rereading bytes. */
  async getState(uid: string, id: string): Promise<TranscriptWordState> {
    const parentRef = this.parent(id);
    return this.db.runTransaction(async tx => {
      const parent = owner(await tx.get(parentRef), uid), transcript = verifiedParent(parent);
      let artifact: TranscriptWordReceipt | null = null;
      if (parent.wordArtifactId !== undefined) {
        if (!validSha256(parent.wordArtifactId)) throw new RequestError(502, 'La referencia del Word guardado no es válida.');
        artifact = receipt(owner(await tx.get(parentRef.collection('wordArtifacts').doc(parent.wordArtifactId)), uid), id, transcript.sha256);
      }
      if (typeof parent.fileName !== 'string' || parent.fileName.length > 250) throw new RequestError(502, 'El nombre de la fuente guardada no es válido.');
      return { artifact, transcript, fileName: parent.fileName, remoteDeletion: deletion(parent) };
    });
  }

  private async checkedArtifact(tx: Transaction, parent: DocumentData, uid: string, id: string): Promise<StoredWordArtifact> {
    const manifest = verifiedParent(parent), artifactId = parent.wordArtifactId;
    if (!validSha256(artifactId)) throw new RequestError(409, 'Primero genera y guarda un Word verificado.');
    const artifactRef = this.parent(id).collection('wordArtifacts').doc(artifactId);
    const artifact = receipt(owner(await tx.get(artifactRef), uid), id, manifest.sha256);
    const blocks = await tx.get(artifactRef.collection('blocks').orderBy('index'));
    if (blocks.size !== Math.ceil(artifact.byteLength / WORD_ARTIFACT_BLOCK_BYTES)) throw new RequestError(502, 'Faltan bloques del Word guardado.');
    const bytes = new Uint8Array(artifact.byteLength); let offset = 0;
    for (let index = 0; index < blocks.docs.length; index++) {
      const block = blocks.docs[index], data = owner(block, uid), value: unknown = data.data;
      const expectedSize = Math.min(WORD_ARTIFACT_BLOCK_BYTES, artifact.byteLength - offset);
      if (!isRecord(data) || data.index !== index || block.id !== blockId(index) || !(value instanceof Uint8Array)
        || value.byteLength !== expectedSize || !validSha256(data.sha256) || hash(value) !== data.sha256) throw new RequestError(502, 'Un bloque del Word guardado no es íntegro.');
      bytes.set(value, offset); offset += value.byteLength;
    }
    if (offset !== artifact.byteLength || hash(bytes) !== artifact.artifactHash) throw new RequestError(502, 'El archivo Word guardado no coincide con su huella.');
    return { artifact, bytes };
  }

  /** Reconstruct every byte inside an owner/manifest transaction and verify the complete binary hash. */
  async download(uid: string, id: string): Promise<StoredWordArtifact> {
    const parentRef = this.parent(id);
    return this.db.runTransaction(async tx => this.checkedArtifact(tx, owner(await tx.get(parentRef), uid), uid, id));
  }

  /** Reserve once before DELETE; repeated requests with this receipt never contact the provider again. */
  async reserveDeletion(uid: string, id: string, artifactId: string, artifactHash: string) {
    const parentRef = this.parent(id);
    return this.db.runTransaction(async tx => {
      const parent = owner(await tx.get(parentRef), uid), stored = await this.checkedArtifact(tx, parent, uid, id), previous = deletion(parent);
      if (stored.artifact.artifactId !== artifactId || stored.artifact.artifactHash !== artifactHash) throw new RequestError(409, 'El Word vigente cambió. Descárgalo y confirma su nueva huella.');
      if (previous.status === 'deleted' || (previous.status !== 'not_requested' && previous.artifactId === artifactId)) return { created: false, state: previous };
      if (previous.status !== 'not_requested') throw new RequestError(409, 'Existe otra operación de borrado remoto sin resolver.');
      const state: RemoteDeletionState = { status: 'pending', artifactId, updatedAt: new Date().toISOString(), message: 'El borrado fue solicitado; aún no está confirmado.' };
      tx.update(parentRef, { remoteDeletion: state }); return { created: true, state };
    });
  }

  /** Preserve source and artifact, binding the outcome to the already reserved receipt. */
  async finishDeletion(uid: string, id: string, artifactId: string, status: 'deleted' | 'failed' | 'unknown', message: string): Promise<RemoteDeletionState> {
    const parentRef = this.parent(id);
    return this.db.runTransaction(async tx => {
      const parent = owner(await tx.get(parentRef), uid), previous = deletion(parent);
      if (previous.status === 'deleted') return previous;
      if (previous.artifactId !== artifactId || previous.status === 'not_requested') throw new RequestError(409, 'El resultado corresponde a otra operación de borrado.');
      const state = parseRemoteDeletionState({ status, artifactId, updatedAt: new Date().toISOString(), message });
      tx.update(parentRef, { remoteDeletion: state }); return state;
    });
  }
}
