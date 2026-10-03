import { ApiClient, ApiError } from './ApiClient';
import { abortable, createDeadline, waitFor } from '../../shared/operations';
import { MAX_MEDIA_BYTES, MEDIA_ACCEPT, parseTranscriptionJob, validJobId, isRecord, MAX_DIRECT_MEDIA_BYTES, DIRECT_MEDIA_ACCEPT, parseUploadSession, parseTranscriptManifest } from '../../shared/transcription';
import type { TranscriptionJob, TranscriptionStatus, UploadSession, TranscriptManifest } from '../../shared/transcription';
import { computeTranscriptHash, formatLiteralTranscript, parseTranscriptPage, MAX_TRANSCRIPT_PAGE_SEGMENTS } from '../../shared/transcriptSegments';
import type { TranscriptSegment } from '../../shared/transcriptSegments';

export interface UploadIdentity {
  requestId: string; filename: string; size: number; mime: string; lastModified: number; fingerprint: string;
}
export interface TranscriptionProgress {
  stage: 'uploading' | 'processing' | 'generating_transcript' | 'recovering_transcript';
  percent?: number; uploadedBytes?: number; totalBytes?: number; recoveredSegments?: number; totalSegments?: number;
}

export interface TranscriptionOptions {
  signal?: AbortSignal;
  onStatus?: (status: TranscriptionStatus | 'uploading') => void;
  onJobCreated?: (jobId: string) => void;
  onProgress?: (progress: TranscriptionProgress) => void;
  onUploadSession?: (upload: UploadIdentity | null) => void;
  onPendingRequest?: (requestId: string | null) => void;
}
export interface TranscriptionRecord { job_id: string; status: TranscriptionStatus; fileName: string; createdAt: string; updatedAt: string; error?: string; uploadRequestId?: string }

/** One upload/polling contract shared by both audio entry points. */
export class TranscriptionService {
  private readonly api: ApiClient;
  private readonly pollMs: number;
  private readonly timeoutMs: number;
  private readonly directFetch: typeof fetch;

  /** Timing overrides are useful for tests; normal polling is 4s for up to 30 min. */
  constructor(api = new ApiClient(), timing: { pollMs?: number; timeoutMs?: number; directFetch?: typeof fetch } = {}) {
    this.api = api;
    this.pollMs = timing.pollMs ?? 4000;
    this.timeoutMs = timing.timeoutMs ?? 30 * 60_000;
    this.directFetch = timing.directFetch ?? ((...args) => fetch(...args));
  }

  /** Upload a real file; return only completed non-empty text, never a placeholder. */
  async processMedia(file: File, options: TranscriptionOptions = {}): Promise<string> {
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (![...MEDIA_ACCEPT.split(','), ...DIRECT_MEDIA_ACCEPT.split(',')].includes(extension)) throw new Error('Selecciona un formato de audio o video permitido.');
    if (file.size === 0) throw new Error('El archivo está vacío.');
    if (file.size > MAX_DIRECT_MEDIA_BYTES) throw new Error('El archivo supera el límite de 2 GiB.');
    const deadline = createDeadline(this.timeoutMs, options.signal);
    try {
      deadline.signal.throwIfAborted();
      if (file.size > MAX_MEDIA_BYTES || !MEDIA_ACCEPT.split(',').includes(extension)) {
        if (!DIRECT_MEDIA_ACCEPT.split(',').includes(extension)) throw new Error('La carga de más de 100 MiB admite video MP4, WebM, MOV o AVI.');
        await this.requireDirectUpload(file.size, deadline.signal);
        return await this.beginDirectUpload(file, options, deadline.signal);
      }
      options.onStatus?.('uploading');
      options.onProgress?.({ stage: 'uploading', totalBytes: file.size });
      const requestId = crypto.randomUUID();
      options.onPendingRequest?.(requestId);
      const form = new FormData();
      form.append('file', file);
      const job = parseTranscriptionJob(await this.api.request('/api/transcription/jobs', {
        method: 'POST', body: form, signal: deadline.signal, headers: { 'X-Upload-Request-Id': requestId },
      }, 130_000));
      deadline.signal.throwIfAborted();
      options.onPendingRequest?.(null);
      options.onJobCreated?.(job.job_id);
      return await this.waitForJob(job, options, deadline.signal);
    } finally { deadline.dispose(); }
  }

  /** Recover a multipart acceptance by its original UUID; never creates another upload. */
  async resumeRequest(requestId: string, options: TranscriptionOptions = {}): Promise<string> {
    this.validateRequestId(requestId);
    const deadline = createDeadline(this.timeoutMs, options.signal);
    try {
      const job = parseTranscriptionJob(await this.api.request(`/api/transcription/requests/${encodeURIComponent(requestId)}`, { signal: deadline.signal }));
      options.onJobCreated?.(job.job_id);
      options.onPendingRequest?.(null);
      return await this.waitForJob(job, options, deadline.signal);
    } finally { deadline.dispose(); }
  }

  /** Resume the same TUS upload after explicit reselection of the original file. */
  async resumeUpload(requestId: string, file: File, options: TranscriptionOptions = {}): Promise<string> {
    this.validateRequestId(requestId);
    const deadline = createDeadline(this.timeoutMs, options.signal);
    try {
      const session = parseUploadSession(await this.api.request(`/api/transcription/uploads/${encodeURIComponent(requestId)}`, { signal: deadline.signal }));
      if (session.upload.requestId !== requestId) throw new Error('El servicio devolvió otra sesión de carga.');
      await this.validateUploadFile(session, file, deadline.signal);
      options.onUploadSession?.(this.uploadIdentity(session));
      options.onJobCreated?.(session.job_id);
      const job = await this.readJob(session.job_id, deadline.signal);
      if (job.status !== 'uploading') {
        options.onUploadSession?.(null);
        return await this.waitForJob(job, options, deadline.signal);
      }
      return await this.transferDirect(session, file, options, deadline.signal);
    } finally { deadline.dispose(); }
  }

  /** Resume a durable job without uploading again, including after reload or server restart. */
  async resumeJob(jobId: string, options: TranscriptionOptions = {}): Promise<string> {
    if (!validJobId(jobId)) throw new Error('Identificador de transcripción inválido.');
    const deadline = createDeadline(this.timeoutMs, options.signal);
    try {
      const job = await this.readJob(jobId, deadline.signal);
      return await this.waitForJob(job, options, deadline.signal);
    } finally { deadline.dispose(); }
  }

  /** Retrieve the authenticated owner's history; transcripts are fetched separately. */
  async list(after?: string, signal?: AbortSignal): Promise<{ jobs: TranscriptionRecord[]; nextCursor: string | null }> {
    const data = await this.api.request('/api/transcription/jobs' + (after ? `?after=${encodeURIComponent(after)}` : ''), { signal });
    if (!isRecord(data) || !Array.isArray(data.jobs)) throw new Error('Historial de transcripciones inválido.');
    return data as unknown as { jobs: TranscriptionRecord[]; nextCursor: string | null };
  }

  /** Retrieve a completed transcript for download without calling the provider. */
  async transcript(id: string, options: TranscriptionOptions = {}): Promise<{ text: string; fileName: string }> {
    if (!validJobId(id)) throw new Error('Identificador de transcripción inválido.');
    const deadline = createDeadline(this.timeoutMs, options.signal);
    try {
      const data = await this.api.request(`/api/transcription/jobs/${encodeURIComponent(id)}/transcript`, { signal: deadline.signal });
      if (!isRecord(data) || typeof data.fileName !== 'string') throw new Error('Transcripción inválida.');
      if (data.transcript !== undefined) {
        return { text: await this.retrieveSegments(id, parseTranscriptManifest(data.transcript), options, deadline.signal), fileName: data.fileName };
      }
      if (typeof data.text !== 'string' || !data.text.trim()) throw new Error('Transcripción inválida.');
      if (new TextEncoder().encode(data.text).byteLength > 20 * 1024 * 1024) throw new Error('La fuente supera el límite de descarga de 20 MiB; requiere exportación por bloques.');
      return { text: data.text, fileName: data.fileName };
    } finally { deadline.dispose(); }
  }

  /** Delete the stored LexIA copy; the response explicitly states remote deletion is unsupported. */
  async delete(id: string): Promise<string> {
    const data = await this.api.request(`/api/transcription/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!isRecord(data) || data.deleted !== true || typeof data.message !== 'string') throw new Error('No se pudo confirmar la eliminación.');
    return data.message;
  }

  private async readJob(jobId: string, signal: AbortSignal): Promise<TranscriptionJob> {
    const job = parseTranscriptionJob(await this.api.request(`/api/transcription/jobs/${encodeURIComponent(jobId)}`, { signal }));
    if (job.job_id !== jobId) throw new Error('El servicio devolvió un trabajo distinto al solicitado.');
    return job;
  }

  private async waitForJob(initial: TranscriptionJob, options: TranscriptionOptions, signal: AbortSignal): Promise<string> {
    let job = initial;
    while (true) {
      signal.throwIfAborted();
      options.onStatus?.(job.status === 'completed' && job.transcript ? 'recovering_transcript' : job.status);
      if (job.status === 'processing') options.onProgress?.({ stage: 'processing', ...(job.stage !== 'video' || job.progress === undefined ? {} : { percent: job.progress }) });
      if (job.status === 'generating_transcript') options.onProgress?.({ stage: 'generating_transcript' });
      if (job.status === 'recovering_transcript') options.onProgress?.({ stage: 'recovering_transcript', ...job.recovery });
      if (job.status === 'failed') throw new Error(job.error || 'La transcripción falló. Selecciona el archivo para iniciar un nuevo trabajo.');
      if (job.status === 'completed') {
        if (!job.transcript) {
          if (new TextEncoder().encode(job.text!).byteLength > 20 * 1024 * 1024) throw new Error('La fuente supera el límite de descarga de 20 MiB; requiere exportación por bloques.');
          return job.text!;
        }
        const text = await this.retrieveSegments(job.job_id, job.transcript, options, signal);
        options.onStatus?.('completed');
        return text;
      }
      await waitFor(this.pollMs, signal);
      job = await this.readJob(initial.job_id, signal);
    }
  }

  private async retrieveSegments(id: string, manifest: TranscriptManifest, options: TranscriptionOptions, signal: AbortSignal): Promise<string> {
    const segments: TranscriptSegment[] = [];
    const encoder = new TextEncoder();
    let offset = 0;
    let canonicalBytes = 2;
    let sourceBytes = 0;
    while (offset < manifest.segmentCount) {
      signal.throwIfAborted();
      const page = parseTranscriptPage(await this.api.request(`/api/transcription/jobs/${encodeURIComponent(id)}/segments?offset=${offset}&limit=${MAX_TRANSCRIPT_PAGE_SEGMENTS}`, { signal }), {
        jobId: id, offset, limit: MAX_TRANSCRIPT_PAGE_SEGMENTS, totalSegments: manifest.segmentCount, sha256: manifest.sha256,
        previousSegment: segments.at(-1),
      });
      canonicalBytes += encoder.encode(JSON.stringify(page.segments)).byteLength - 2 + (segments.length ? 1 : 0);
      sourceBytes += encoder.encode(formatLiteralTranscript(page.segments)).byteLength + (segments.length ? 2 : 0);
      if (canonicalBytes > 20 * 1024 * 1024 || sourceBytes > 20 * 1024 * 1024) throw new Error('La fuente supera el límite de descarga de 20 MiB; requiere exportación por bloques.');
      segments.push(...page.segments);
      offset += page.segments.length;
      options.onProgress?.({ stage: 'recovering_transcript', recoveredSegments: offset, totalSegments: manifest.segmentCount });
      if (page.next_offset === null && offset !== manifest.segmentCount) throw new Error('La fuente quedó incompleta.');
    }
    const hash = await abortable(computeTranscriptHash(segments), signal);
    if (hash !== manifest.sha256) throw new Error('La integridad de la fuente no coincide. No se modificó el documento.');
    return formatLiteralTranscript(segments);
  }

  private validateRequestId(value: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('Identificador de carga inválido.');
  }

  private uploadIdentity(session: UploadSession): UploadIdentity {
    const { requestId, filename, size, mime, lastModified, fingerprint } = session.upload;
    return { requestId, filename, size, mime, lastModified, fingerprint };
  }

  private async requireDirectUpload(size: number, signal: AbortSignal): Promise<void> {
    const data = await this.api.request('/api/transcription/capabilities', { signal });
    if (!isRecord(data) || data.directUploadEnabled !== true) throw new Error('La carga directa todavía no está habilitada. El límite actual es de 100 MiB.');
    if (!Number.isSafeInteger(data.directMaxBytes) || Number(data.directMaxBytes) < size || Number(data.directMaxBytes) > MAX_DIRECT_MEDIA_BYTES) throw new Error('El archivo supera el límite de carga directa habilitado.');
  }

  private async fingerprint(file: File, signal: AbortSignal): Promise<string> {
    const bytes = await abortable(file.slice(0, 1024 * 1024).arrayBuffer(), signal);
    const hash = await abortable(crypto.subtle.digest('SHA-256', bytes), signal);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private async beginDirectUpload(file: File, options: TranscriptionOptions, signal: AbortSignal): Promise<string> {
    const identity: UploadIdentity = {
      requestId: crypto.randomUUID(), filename: file.name, size: file.size, mime: file.type || 'application/octet-stream',
      lastModified: file.lastModified, fingerprint: await this.fingerprint(file, signal),
    };
    options.onUploadSession?.(identity);
    options.onStatus?.('uploading');
    const session = parseUploadSession(await this.api.request('/api/transcription/uploads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(identity), signal,
    }));
    if (session.upload.requestId !== identity.requestId) throw new Error('El servicio devolvió otra sesión de carga.');
    await this.validateUploadFile(session, file, signal);
    options.onJobCreated?.(session.job_id);
    return await this.transferDirect(session, file, options, signal);
  }

  private async validateUploadFile(session: UploadSession, file: File, signal: AbortSignal): Promise<void> {
    const metadata = session.upload;
    if (metadata.filename !== file.name || metadata.size !== file.size || metadata.lastModified !== file.lastModified
      || metadata.mime !== (file.type || 'application/octet-stream') || metadata.fingerprint !== await this.fingerprint(file, signal)) {
      throw new Error('Selecciona el mismo archivo que inició esta carga; su nombre, tamaño, fecha o contenido no coincide.');
    }
  }

  private async directRequest(url: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
    const destination = new URL(url);
    if (destination.protocol !== 'https:' || destination.username || destination.password || destination.port
      || !['upload.videodelivery.net', 'upload.cloudflarestream.com'].includes(destination.hostname)) throw new Error('La dirección de carga directa no es válida.');
    const deadline = createDeadline(130_000, signal);
    try {
      const response = await abortable(this.directFetch(url, {
        ...init, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: deadline.signal,
      }), deadline.signal);
      if (!response.ok) {
        await response.body?.cancel();
        throw new ApiError(response.status, response.status === 403 || response.status === 401
          ? 'La autorización de carga directa expiró. Consulta el trabajo antes de iniciar otra carga.'
          : 'La carga directa se interrumpió. Puedes reanudarla con el mismo archivo.');
      }
      return response;
    } catch (error) {
      deadline.signal.throwIfAborted();
      if (error instanceof ApiError) throw error;
      throw new ApiError(0, 'La conexión de carga se interrumpió. Puedes reanudarla con el mismo archivo.');
    } finally { deadline.dispose(); }
  }

  private uploadOffset(response: Response, size: number, requireLength: boolean): number {
    const offset = response.headers.get('Upload-Offset');
    const length = response.headers.get('Upload-Length');
    if (response.headers.get('Tus-Resumable') !== '1.0.0' || !offset || !/^\d+$/.test(offset)
      || !Number.isSafeInteger(Number(offset)) || Number(offset) > size
      || (requireLength && (!length || !/^\d+$/.test(length) || Number(length) !== size))) {
      throw new Error('El proveedor devolvió un progreso de carga inválido. El trabajo se conserva para consulta.');
    }
    return Number(offset);
  }

  private async transferDirect(session: UploadSession, file: File, options: TranscriptionOptions, signal: AbortSignal): Promise<string> {
    options.onStatus?.('uploading');
    let offset = this.uploadOffset(await this.directRequest(session.upload.url, { method: 'HEAD', headers: { 'Tus-Resumable': '1.0.0' } }, signal), file.size, true);
    const report = () => options.onProgress?.({ stage: 'uploading', uploadedBytes: offset, totalBytes: file.size, percent: Math.floor(offset / file.size * 100) });
    report();
    const chunkBytes = 8 * 1024 * 1024;
    while (offset < file.size) {
      signal.throwIfAborted();
      const end = Math.min(offset + chunkBytes, file.size);
      const response = await this.directRequest(session.upload.url, {
        method: 'PATCH', headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': String(offset), 'Content-Type': 'application/offset+octet-stream' },
        body: file.slice(offset, end),
      }, signal);
      const next = this.uploadOffset(response, file.size, false);
      if (next !== end) throw new Error('El progreso confirmado no coincide con el bloque enviado. Reanuda para consultar el estado real.');
      offset = next;
      report();
    }
    options.onUploadSession?.(null);
    return await this.waitForJob(await this.readJob(session.job_id, signal), options, signal);
  }
}
