export type TranscriptionStatus = 'uploading' | 'queued' | 'processing' | 'generating_transcript' | 'recovering_transcript' | 'completed' | 'failed';
export type TranscriptionStage = 'upload' | 'video' | 'captions' | 'recovery';

/** A completed manifest refers to the entire checked sequence, never a single page. */
export interface TranscriptManifest {
  segmentCount: number;
  sha256: string;
  language: 'es';
  verified: true;
  formatVersion: 1;
}

export interface TranscriptionJob {
  job_id: string;
  status: TranscriptionStatus;
  text?: string;
  error?: string;
  stage?: TranscriptionStage;
  progress?: number;
  recovery?: { recoveredSegments: number; totalSegments?: number };
  transcript?: TranscriptManifest;
}

export interface UploadSession {
  job_id: string;
  status: 'uploading';
  upload: { requestId: string; url: string; size: number; filename: string; mime: string; lastModified: number; fingerprint: string; expiresAt?: string };
}

export const MEDIA_ACCEPT = '.mp3,.wav,.mp4,.m4a,.webm,.ogg,.flac';
export const DIRECT_MEDIA_ACCEPT = '.mp4,.webm,.mov,.avi';
export const MAX_MEDIA_BYTES = 100 * 1024 * 1024;
export const MAX_DIRECT_MEDIA_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_TRANSCRIPT_SEGMENTS = 1_000_000;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validJobId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9][\w.:-]{0,199}$/.test(value);
}

export function validSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

/** Reject a manifest unless it declares complete verification of a nonempty transcript. */
export function parseTranscriptManifest(value: unknown): TranscriptManifest {
  if (!isRecord(value) || !integer(value.segmentCount, 1, MAX_TRANSCRIPT_SEGMENTS) || !validSha256(value.sha256)
    || value.language !== 'es' || value.verified !== true || value.formatVersion !== 1) {
    throw new Error('La transcripción no tiene un manifiesto íntegro verificado.');
  }
  return { segmentCount: value.segmentCount, sha256: value.sha256, language: 'es', verified: true, formatVersion: 1 };
}

/** Reject invalid or incomplete success payloads at either side of the API. */
export function parseTranscriptionJob(value: unknown): TranscriptionJob {
  const statuses: string[] = ['uploading', 'queued', 'processing', 'generating_transcript', 'recovering_transcript', 'completed', 'failed'];
  if (!isRecord(value) || !validJobId(value.job_id) || !statuses.includes(String(value.status))) {
    throw new Error('El servicio devolvió un estado de transcripción inválido.');
  }
  const transcript = value.transcript === undefined ? undefined : parseTranscriptManifest(value.transcript);
  if (value.status === 'completed' && !transcript && (typeof value.text !== 'string' || !value.text.trim())) {
    throw new Error('La transcripción terminó sin texto. No se modificó el documento.');
  }
  if (value.stage !== undefined && !['upload', 'video', 'captions', 'recovery'].includes(String(value.stage))) {
    throw new Error('El servicio devolvió una etapa de transcripción inválida.');
  }
  if (value.progress !== undefined && (typeof value.progress !== 'number' || !Number.isFinite(value.progress) || value.progress < 0 || value.progress > 100
    || value.stage !== 'video' || value.status !== 'processing')) {
    throw new Error('El servicio devolvió un progreso inválido.');
  }
  let recovery: TranscriptionJob['recovery'];
  if (value.recovery !== undefined) {
    if (!isRecord(value.recovery) || !integer(value.recovery.recoveredSegments, 0, MAX_TRANSCRIPT_SEGMENTS)
      || (value.recovery.totalSegments !== undefined && !integer(value.recovery.totalSegments, 1, MAX_TRANSCRIPT_SEGMENTS))
      || (typeof value.recovery.totalSegments === 'number' && value.recovery.recoveredSegments > value.recovery.totalSegments)) {
      throw new Error('El servicio devolvió un punto de recuperación inválido.');
    }
    recovery = { recoveredSegments: value.recovery.recoveredSegments,
      ...(typeof value.recovery.totalSegments === 'number' ? { totalSegments: value.recovery.totalSegments } : {}) };
  }
  return {
    job_id: value.job_id, status: value.status as TranscriptionStatus,
    ...(typeof value.text === 'string' ? { text: value.text } : {}),
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
    ...(value.stage !== undefined ? { stage: value.stage as TranscriptionStage } : {}),
    ...(typeof value.progress === 'number' ? { progress: value.progress } : {}),
    ...(recovery ? { recovery } : {}), ...(transcript ? { transcript } : {}),
  };
}

/** Validate an upload capability without accepting arbitrary browser upload destinations. */
export function parseUploadSession(value: unknown): UploadSession {
  if (!isRecord(value) || !validJobId(value.job_id) || value.status !== 'uploading' || !isRecord(value.upload)) {
    throw new Error('El servicio devolvió una sesión de carga inválida.');
  }
  const upload = value.upload;
  if (!validJobId(upload.requestId) || typeof upload.url !== 'string' || !integer(upload.size, 1, MAX_DIRECT_MEDIA_BYTES)
    || typeof upload.filename !== 'string' || !upload.filename.trim() || upload.filename.length > 250
    || !DIRECT_MEDIA_ACCEPT.split(',').includes(`.${upload.filename.split('.').at(-1)?.toLowerCase()}`)
    || typeof upload.mime !== 'string' || upload.mime.length > 100 || !integer(upload.lastModified, 0, Number.MAX_SAFE_INTEGER)
    || !validSha256(upload.fingerprint)
    || (upload.expiresAt !== undefined && (typeof upload.expiresAt !== 'string' || !Number.isFinite(Date.parse(upload.expiresAt))))) {
    throw new Error('El servicio devolvió una sesión de carga inválida.');
  }
  let url: URL;
  try { url = new URL(upload.url); } catch { throw new Error('El destino de carga no es válido.'); }
  if (url.protocol !== 'https:' || url.username || url.password
    || !/(^|\.)(cloudflarestream\.com|videodelivery\.net)$/.test(url.hostname)) {
    throw new Error('El destino de carga no pertenece al proveedor permitido.');
  }
  return { job_id: value.job_id, status: 'uploading', upload: {
    requestId: upload.requestId, url: url.href, size: upload.size, filename: upload.filename, mime: upload.mime, lastModified: upload.lastModified, fingerprint: upload.fingerprint,
    ...(typeof upload.expiresAt === 'string' ? { expiresAt: upload.expiresAt } : {}),
  } };
}
