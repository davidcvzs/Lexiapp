import { readFile } from 'node:fs/promises';
import { DIRECT_MEDIA_ACCEPT, isRecord, MAX_DIRECT_MEDIA_BYTES, MAX_TRANSCRIPT_SEGMENTS, parseTranscriptionJob, validJobId, validSha256 } from '../../shared/transcription.js';
import type { TranscriptionJob, TranscriptionStage, TranscriptionStatus } from '../../shared/transcription.js';
import { MAX_TRANSCRIPT_PAGE_SEGMENTS, parseTranscriptPage } from '../../shared/transcriptSegments.js';
import type { TranscriptPage } from '../../shared/transcriptSegments.js';
import { abortable } from '../../shared/operations.js';
import { RequestError } from '../middleware/security.js';

/** Translate provider responses into the single contract used by our clients. */
export function normalizeWorkerJob(payload: unknown, expectedId?: string, options: { segmentSource?: boolean } = {}): TranscriptionJob {
  if (!isRecord(payload)) throw new RequestError(502, 'El transcriptor devolvió una respuesta inválida.');
  const jobId = payload.job_id ?? expectedId;
  if (!validJobId(jobId) || (expectedId && jobId !== expectedId)) {
    throw new RequestError(502, 'El transcriptor devolvió un identificador inválido.');
  }
  const aliases: Record<string, TranscriptionStatus> = {
    uploading: 'uploading', queued: 'queued', pending: 'queued', processing: 'processing', transcribing: 'processing',
    processing_video: 'processing', video_ready: 'processing',
    generating_transcript: 'generating_transcript', generating_captions: 'generating_transcript', captions_pending: 'generating_transcript',
    recovering_transcript: 'recovering_transcript', completed: 'completed', failed: 'failed', error: 'failed', captions_failed: 'failed',
  };
  const status = aliases[typeof payload.status === 'string' ? payload.status.toLowerCase() : ''];
  if (!status) throw new RequestError(502, 'El transcriptor devolvió un estado desconocido.');
  const remoteStatus = String(payload.status).toLowerCase();
  const safeStatus = options.segmentSource && status === 'completed' ? 'recovering_transcript' : status;
  const stage: TranscriptionStage | undefined = safeStatus === 'uploading' ? 'upload'
    : remoteStatus === 'video_ready' || safeStatus === 'generating_transcript' ? 'captions'
    : safeStatus === 'processing' ? 'video' : safeStatus === 'recovering_transcript' ? 'recovery' : undefined;
  const rawProgress = isRecord(payload.video_status) ? payload.video_status.pctComplete : undefined;
  const progress = stage === 'video' && (typeof rawProgress === 'number' || typeof rawProgress === 'string')
    && String(rawProgress).trim() !== '' && Number.isFinite(Number(rawProgress)) && Number(rawProgress) >= 0 && Number(rawProgress) <= 100
    ? Number(rawProgress) : undefined;
  const text = options.segmentSource ? undefined : [payload.text, payload.transcription, payload.transcript]
    .find(value => typeof value === 'string' && value.trim()) as string | undefined;
  const total = payload.total_segments;
  if (options.segmentSource && status === 'completed' && total !== undefined
    && (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 1 || total > MAX_TRANSCRIPT_SEGMENTS)) {
    throw new RequestError(502, 'El transcriptor terminó sin segmentos válidos. No se modificó el documento.');
  }
  if (options.segmentSource && payload.transcript_hash !== undefined && !validSha256(payload.transcript_hash)) {
    throw new RequestError(502, 'El transcriptor devolvió una huella de transcripción inválida.');
  }
  try {
    return parseTranscriptionJob({ job_id: jobId, status: safeStatus, text, stage, progress,
      ...(safeStatus === 'recovering_transcript' ? { recovery: { recoveredSegments: 0, ...(typeof total === 'number' ? { totalSegments: total } : {}) } } : {}),
      error: safeStatus === 'failed' ? 'La transcripción falló en el proveedor. Puedes iniciar un nuevo trabajo.' : undefined });
  } catch {
    throw new RequestError(502, 'La transcripción terminó sin texto válido. No se modificó el documento.');
  }
}

export interface DirectUploadRequest { request_id: string; owner_id: string; filename: string; size: number; mime: string }
export interface DirectUploadResponse {
  request_id: string; job_id: string; status: 'uploading' | 'uploaded' | 'failed';
  upload_url?: string; offset?: number; size: number; expires_at?: string;
}
export type RemoteDeletionCheck = 'deleted' | 'present' | 'unknown';

function ownerHeaders(ownerId?: string): Record<string, string> {
  if (ownerId === undefined) return {};
  if (typeof ownerId !== 'string' || !ownerId || ownerId.length > 200 || /[\r\n]/.test(ownerId)) {
    throw new RequestError(400, 'El propietario del trabajo no es válido.');
  }
  return { 'X-Owner-Id': ownerId };
}

/** The provider URL is a temporary upload capability, never a document source. */
function parseDirectUpload(payload: unknown, expectedRequestId: string): DirectUploadResponse {
  if (!isRecord(payload) || payload.request_id !== expectedRequestId || !validJobId(payload.job_id)
    || !['uploading', 'uploaded', 'failed'].includes(String(payload.status))
    || typeof payload.size !== 'number' || !Number.isSafeInteger(payload.size) || payload.size < 1 || payload.size > MAX_DIRECT_MEDIA_BYTES
    || (payload.offset !== undefined && (typeof payload.offset !== 'number' || !Number.isSafeInteger(payload.offset) || payload.offset < 0 || payload.offset > payload.size))
    || (payload.expires_at !== null && payload.expires_at !== undefined && (typeof payload.expires_at !== 'string' || !Number.isFinite(Date.parse(payload.expires_at))))) {
    throw new RequestError(502, 'El transcriptor devolvió una sesión de carga inválida.');
  }
  if (payload.upload_url !== undefined) {
    let destination: URL;
    try { destination = new URL(String(payload.upload_url)); } catch { throw new RequestError(502, 'El destino de carga no es válido.'); }
    if (destination.protocol !== 'https:' || destination.username || destination.password
      || !/(^|\.)(cloudflarestream\.com|videodelivery\.net)$/.test(destination.hostname)) {
      throw new RequestError(502, 'El destino de carga no pertenece al proveedor permitido.');
    }
  } else if (payload.status === 'uploading') {
    throw new RequestError(502, 'La sesión de carga no incluye un destino válido.');
  }
  return { request_id: expectedRequestId, job_id: payload.job_id, status: payload.status as DirectUploadResponse['status'], size: payload.size,
    ...(typeof payload.upload_url === 'string' ? { upload_url: payload.upload_url } : {}),
    ...(typeof payload.offset === 'number' ? { offset: payload.offset } : {}),
    ...(typeof payload.expires_at === 'string' ? { expires_at: payload.expires_at } : {}) };
}

export class CloudflareTranscriptionService {
  private readonly url: string;
  private readonly secret: string;
  private readonly fetcher: typeof fetch;

  constructor(options: { url?: string; secret?: string; backendSecret?: string; fetcher?: typeof fetch } = {}) {
    this.url = (options.url ?? process.env.CLOUDFLARE_WORKER_URL ?? '').replace(/\/$/, '');
    this.secret = options.backendSecret ?? options.secret ?? process.env.CLOUDFLARE_BACKEND_SECRET ?? process.env.CLOUDFLARE_TRANSCRIPTION_SECRET ?? '';
    this.fetcher = options.fetcher ?? fetch;
  }

  private async request(path: string, options: RequestInit, deletionProbe = false): Promise<unknown> {
    if (!this.url || !this.secret || /FALTANTE|VALOR|missing|placeholder/i.test(this.secret)) {
      throw new RequestError(503, 'El servicio de transcripción no está configurado.');
    }
    try {
      if (!['http:', 'https:'].includes(new URL(this.url).protocol)) throw new Error('Protocol');
    } catch { throw new RequestError(503, 'La dirección del servicio de transcripción no está configurada correctamente.'); }
    let response: Response;
    try {
      const pending = this.fetcher(`${this.url}${path}`, {
        ...options, redirect: 'error', headers: { ...Object.fromEntries(new Headers(options.headers)), 'x-api-key': this.secret },
      });
      response = options.signal ? await abortable(pending, options.signal) : await pending;
    } catch {
      options.signal?.throwIfAborted();
      throw new RequestError(502, 'No fue posible conectar con el servicio de transcripción.');
    }
    if (!response.ok && !(deletionProbe && response.status === 410)) {
      await response.body?.cancel();
      const status = [403, 404, 409, 413, 429].includes(response.status) ? response.status : response.status === 401 ? 503 : 502;
      throw new RequestError(status, status === 429 ? 'El transcriptor alcanzó su límite de solicitudes. Espera antes de reintentar.'
        : status === 413 ? 'El proveedor rechazó el archivo por su tamaño.'
        : status === 404 ? 'El proveedor no encontró el trabajo o la solicitud de carga.'
        : status === 409 ? 'La carga requiere recuperación; no se creará otro trabajo automáticamente.'
        : status === 403 ? 'No tienes acceso a este trabajo de transcripción.'
        : status === 503 ? 'La autenticación del transcriptor requiere configuración en el servidor.' : 'El servicio de transcripción no pudo completar la operación.');
    }
    const chunks: Uint8Array[] = [];
    let byteCount = 0;
    const reader = response.body?.getReader();
    try {
      if (reader) {
        while (true) {
          const result = options.signal ? await abortable(reader.read(), options.signal) : await reader.read();
          if (result.done) break;
          byteCount += result.value.byteLength;
          if (byteCount > 1024 * 1024) {
            await reader.cancel();
            throw new RequestError(502, 'La respuesta del transcriptor supera el tamaño permitido.');
          }
          chunks.push(result.value);
          options.signal?.throwIfAborted();
        }
      }
    } catch (error) {
      void reader?.cancel().catch(() => undefined);
      options.signal?.throwIfAborted();
      if (error instanceof RequestError) throw error;
      throw new RequestError(502, 'No fue posible recuperar la respuesta del transcriptor.');
    } finally { reader?.releaseLock(); }
    const bytes = new Uint8Array(byteCount);
    let cursor = 0;
    for (const chunk of chunks) { bytes.set(chunk, cursor); cursor += chunk.byteLength; }
    let payload: unknown;
    try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new RequestError(502, 'El transcriptor devolvió una respuesta JSON inválida.'); }
    options.signal?.throwIfAborted();
    return deletionProbe ? { status: response.status, payload } : payload;
  }

  async create(file: Express.Multer.File, signal: AbortSignal, context?: { ownerId: string; requestId: string }): Promise<TranscriptionJob> {
    signal.throwIfAborted();
    const buffer = await readFile(file.path);
    signal.throwIfAborted();
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: file.mimetype }), file.originalname);
    if (context && !validJobId(context.requestId)) throw new RequestError(400, 'La solicitud de carga no es válida.');
    const payload = await this.request('/api/transcribe', { method: 'POST', body: form, signal,
      headers: { ...ownerHeaders(context?.ownerId), ...(context ? { 'X-Request-Id': context.requestId } : {}) } });
    // The upload endpoint may omit status while acknowledging a queued job.
    return normalizeWorkerJob(isRecord(payload) ? { ...payload, status: payload.status ?? 'queued' } : payload, undefined, { segmentSource: true });
  }

  async get(jobId: string, signal: AbortSignal, ownerId?: string): Promise<TranscriptionJob> {
    if (!validJobId(jobId)) throw new RequestError(400, 'Identificador de trabajo inválido.');
    return normalizeWorkerJob(await this.request(`/jobs/${encodeURIComponent(jobId)}?include_text=false`, { signal, headers: ownerHeaders(ownerId) }), jobId, { segmentSource: true });
  }

  /** Recover one checked page; a completed status response alone never provides the source. */
  async getTranscriptPage(jobId: string, offset: number, limit: number, signal: AbortSignal, ownerId?: string): Promise<TranscriptPage> {
    if (!validJobId(jobId) || !Number.isSafeInteger(offset) || offset < 0 || offset >= MAX_TRANSCRIPT_SEGMENTS
      || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_TRANSCRIPT_PAGE_SEGMENTS) {
      throw new RequestError(400, 'Los parámetros de recuperación no son válidos.');
    }
    const payload = await this.request(`/jobs/${encodeURIComponent(jobId)}/transcript?offset=${offset}&limit=${limit}`, { signal, headers: ownerHeaders(ownerId) });
    try { return parseTranscriptPage(payload, { jobId, offset, limit }); }
    catch { throw new RequestError(502, 'El transcriptor devolvió segmentos incompletos o inválidos. La fuente no se modificó.'); }
  }

  /** Create an idempotent direct-upload capability after the backend records its owner. */
  async createDirectUpload(input: DirectUploadRequest, signal: AbortSignal): Promise<DirectUploadResponse> {
    if (!validJobId(input.request_id) || !Number.isSafeInteger(input.size) || input.size < 1 || input.size > MAX_DIRECT_MEDIA_BYTES
      || typeof input.filename !== 'string' || !input.filename.trim() || input.filename.length > 250
      || !DIRECT_MEDIA_ACCEPT.split(',').some(extension => input.filename.toLowerCase().endsWith(extension))
      || typeof input.mime !== 'string' || input.mime.length > 100) throw new RequestError(400, 'La solicitud de carga directa no es válida.');
    const payload = await this.request('/uploads', { method: 'POST', signal,
      headers: { ...ownerHeaders(input.owner_id), 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const session = parseDirectUpload(payload, input.request_id);
    if (session.size !== input.size) throw new RequestError(502, 'El transcriptor devolvió otra sesión de carga.');
    return session;
  }

  /** Resume the registered capability; this GET never creates another provider job. */
  async getDirectUpload(requestId: string, ownerId: string, signal: AbortSignal): Promise<DirectUploadResponse> {
    if (!validJobId(requestId)) throw new RequestError(400, 'La solicitud de carga no es válida.');
    return parseDirectUpload(await this.request(`/uploads/${encodeURIComponent(requestId)}`, { signal, headers: ownerHeaders(ownerId) }), requestId);
  }

  /** Look up an acknowledged multipart upload after its initial response was lost. */
  async lookupRequest(requestId: string, ownerId: string, signal: AbortSignal): Promise<TranscriptionJob> {
    if (!validJobId(requestId)) throw new RequestError(400, 'La solicitud de carga no es válida.');
    const payload = await this.request(`/requests/${encodeURIComponent(requestId)}`, { signal, headers: ownerHeaders(ownerId) });
    if (isRecord(payload) && payload.request_id !== undefined && payload.request_id !== requestId) {
      throw new RequestError(502, 'El proveedor devolvió otra solicitud de carga.');
    }
    return normalizeWorkerJob(payload, undefined, { segmentSource: true });
  }

  /** Delete only the registered owner's video; a lost acknowledgement never means success. */
  async deleteRemote(jobId: string, signal: AbortSignal, ownerId: string): Promise<void> {
    if (!validJobId(jobId) || !ownerId) throw new RequestError(400, 'El trabajo y su propietario son obligatorios.');
    const payload = await this.request(`/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE', signal, headers: ownerHeaders(ownerId) });
    if (!isRecord(payload) || payload.deleted !== true || payload.job_id !== jobId) {
      throw new RequestError(502, 'El transcriptor no confirmó la eliminación de este video.');
    }
  }

  /** Inspect the durable Worker tombstone without repeating DELETE or trusting an arbitrary 404. */
  async checkRemoteDeletion(jobId: string, signal: AbortSignal, ownerId: string): Promise<RemoteDeletionCheck> {
    if (!validJobId(jobId) || !ownerId) throw new RequestError(400, 'El trabajo y su propietario son obligatorios.');
    let result: unknown;
    try {
      result = await this.request(`/jobs/${encodeURIComponent(jobId)}?include_text=false`, { signal, headers: ownerHeaders(ownerId) }, true);
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof RequestError && [404, 502].includes(error.status)) return 'unknown';
      throw error;
    }
    if (!isRecord(result) || !isRecord(result.payload)) throw new RequestError(502, 'La consulta de eliminación no devolvió un estado válido.');
    if (result.status === 410) return result.payload.code === 'job_deleted' ? 'deleted' : 'unknown';
    normalizeWorkerJob(result.payload, jobId, { segmentSource: true });
    return 'present';
  }
}
