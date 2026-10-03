import fileSaver from 'file-saver';
import { ApiClient } from './ApiClient';
import { isRecord, validJobId, validSha256 } from '../../shared/transcription';
import { MAX_WORD_ARTIFACT_BYTES, parseRemoteDeletionState, parseTranscriptWordReceipt, parseTranscriptWordState, transcriptWordReviewHash } from '../../shared/transcriptWord';
import type { RemoteDeletionState, TranscriptWordReceipt, TranscriptWordRequest, TranscriptWordState } from '../../shared/transcriptWord';

type Download = (blob: Blob, fileName: string) => void;

/** Owner-authenticated Word operations; receipts refer to the complete source retained by the server. */
export class TranscriptWordClient {
  private readonly api: ApiClient;
  private readonly saveFile: Download;

  /** Inject JSON transport and the final download for tests; credentials never leave the application API. */
  constructor(api = new ApiClient(), saveFile: Download = (blob, name) => fileSaver.saveAs(blob, name)) {
    this.api = api;
    this.saveFile = saveFile;
  }

  private path(jobId: string): string {
    if (!validJobId(jobId)) throw new Error('Identificador de transcripción inválido.');
    return `/api/transcription/jobs/${encodeURIComponent(jobId)}`;
  }

  /** Return the owner's durable artifact, manifest and remote deletion status without creating a Word. */
  async state(jobId: string, signal?: AbortSignal): Promise<TranscriptWordState> {
    return parseTranscriptWordState(await this.api.request(this.path(jobId) + '/word', { signal }), jobId);
  }

  /** Create the explicitly reviewed presentation from verified server segments; never sends the source to AI. */
  async create(jobId: string, request: TranscriptWordRequest, signal?: AbortSignal): Promise<TranscriptWordState> {
    if (!request || request.reviewed !== true || !validSha256(request.sourceHash)) throw new Error('Revisa la fuente completa antes de crear el Word.');
    const expectedReview = await transcriptWordReviewHash(request);
    signal?.throwIfAborted();
    const state = parseTranscriptWordState(await this.api.request(this.path(jobId) + '/word', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request),
    }, 130_000), jobId);
    if (!state.artifact || state.transcript.sha256 !== request.sourceHash || state.artifact.reviewHash !== expectedReview) throw new Error('El Word no coincide con la revisión solicitada.');
    return state;
  }

  /** Validate a bounded DOCX and its exact receipt before starting the user download; return only its verified receipt. */
  async download(jobId: string, expected: TranscriptWordReceipt, signal?: AbortSignal): Promise<TranscriptWordReceipt> {
    const wanted = parseTranscriptWordReceipt(expected);
    if (wanted.jobId !== jobId) throw new Error('El Word corresponde a otra transcripción.');
    const data = await this.api.request(this.path(jobId) + '/word/download', { signal });
    if (!isRecord(data) || typeof data.base64 !== 'string' || !data.base64.length
      || data.base64.length > Math.ceil(MAX_WORD_ARTIFACT_BYTES / 3) * 4
      || data.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data.base64)) {
      throw new Error('El archivo Word descargado no es válido o supera 4 MiB.');
    }
    const receipt = parseTranscriptWordReceipt(data.artifact);
    for (const key of ['jobId', 'artifactId', 'sourceHash', 'contentHash', 'artifactHash', 'byteLength', 'reviewHash', 'fileName'] as const) {
      if (receipt[key] !== wanted[key]) throw new Error('El Word descargado no coincide con el artefacto revisado.');
    }
    if (receipt.caseNumber !== wanted.caseNumber || JSON.stringify(receipt.format) !== JSON.stringify(wanted.format)
      || receipt.reviewHash !== await transcriptWordReviewHash({ sourceHash: receipt.sourceHash, reviewed: true, format: receipt.format,
        ...(receipt.caseNumber === undefined ? {} : { caseNumber: receipt.caseNumber }) })) {
      throw new Error('El formato o los metadatos del Word no coinciden con la revisión.');
    }
    let decoded: string;
    try { decoded = atob(data.base64); } catch { throw new Error('El archivo Word descargado no es válido.'); }
    if (decoded.length !== receipt.byteLength || decoded.length > MAX_WORD_ARTIFACT_BYTES) throw new Error('El archivo Word quedó incompleto.');
    const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    signal?.throwIfAborted();
    if (hash !== receipt.artifactHash) throw new Error('La integridad del Word no coincide. No se inició la descarga.');
    this.saveFile(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), receipt.fileName);
    return receipt;
  }

  /** Request remote deletion only after explicit user authorization and a successfully downloaded exact artifact. */
  async deleteRemote(jobId: string, receipt: TranscriptWordReceipt, signal?: AbortSignal): Promise<RemoteDeletionState> {
    const artifact = parseTranscriptWordReceipt(receipt);
    if (artifact.jobId !== jobId) throw new Error('El Word corresponde a otra transcripción.');
    const remote = parseRemoteDeletionState(await this.api.request(this.path(jobId) + '/remote-video', {
      method: 'DELETE', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifactId: artifact.artifactId, artifactHash: artifact.artifactHash, downloadConfirmed: true, confirm: true }),
    }, 65_000));
    if (remote.artifactId !== undefined && remote.artifactId !== artifact.artifactId) throw new Error('El resultado del borrado corresponde a otro artefacto.');
    return remote;
  }

  /** Query an ambiguous deletion result; this POST never performs another DELETE. */
  async reconcile(jobId: string, signal?: AbortSignal): Promise<RemoteDeletionState> {
    return parseRemoteDeletionState(await this.api.request(this.path(jobId) + '/remote-video/reconcile', { method: 'POST', signal }));
  }
}
