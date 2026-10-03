/** Reuses the supplied Stream workflow without any literal credential fallback. */
import { PRIVACY_HTML } from './privacy.js';

export interface Segment { index: number; start: number; end: number; text: string; speaker?: string }
interface Video { id?: string; uid?: string; readyToStream?: boolean; duration?: number; scheduledDeletion?: string; status?: { state?: string; pctComplete?: string | number } }
interface Storage {
  get<T>(key: string): Promise<T | undefined>;
  put(key: string, value: unknown): Promise<void>;
  transaction<T>(fn: (storage: Storage) => Promise<T>): Promise<T>;
}
export interface JournalState { storage: Storage }
interface Principal { kind: 'gpt' | 'backend'; owner: string }
interface JournalRecord { fingerprint: string; principal: Principal; state: 'pending' | 'created'; response?: Record<string, unknown>; jobToken?: string; deleted?: boolean }
export interface Env {
  ACTION_API_KEY?: string; LEXIA_API_KEY?: string; CF_ACCOUNT_ID?: string; CF_API_TOKEN?: string;
  CORS_ORIGINS?: string; RETENTION_DAYS?: string; MAX_DURATION_SECONDS?: string;
  STREAM?: { upload(url: string, params: Record<string, unknown>): Promise<Video>; video(id: string): { delete(): Promise<void> } };
  JOURNAL?: { idFromName(name: string): unknown; get(id: unknown): { fetch(request: Request): Promise<Response> } };
}
class WorkerError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const ownerIdentifier = (value: unknown): value is string => typeof value === 'string' && value.length >= 1 && value.length <= 128 && [...value].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127);
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
function fail(status: number, code: string, message: string): never { throw new WorkerError(status, code, message); }
export async function transcriptHash(segments: Segment[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(segments.map(({ index, start, end, text, speaker }) => ({ index, start, end, text, ...(speaker === undefined ? {} : { speaker }) }))));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function hash(value: unknown) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function equalSecret(first: string, second: string) {
  const a = await hash(first); const b = await hash(second); let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
/** Atomic reservations survive lost replies; an uncertain pending upload never auto-repeats. */
export class JobJournal {
  private storage: Storage;
  constructor(state: JournalState) { this.storage = state.storage; }
  async fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname; const body = await request.json() as Record<string, unknown>;
    if (path === '/reserve') return this.storage.transaction(async storage => {
      const key = `request:${body.requestKey}`; const previous = await storage.get<JournalRecord>(key);
      if (previous) return json(previous.fingerprint === body.fingerprint ? { existing: previous } : { conflict: true });
      const entry = { fingerprint: body.fingerprint, principal: body.principal, state: 'pending', jobToken: body.jobToken } as JournalRecord;
      await storage.put(key, entry); return json({ reserved: true });
    });
    if (path === '/complete') return this.storage.transaction(async storage => {
      const key = `request:${body.requestKey}`; const previous = await storage.get<JournalRecord>(key);
      if (!previous) return json({ error: 'missing' }, 409);
      const updated = { ...previous, state: 'created' as const, response: body.response as Record<string, unknown> };
      await storage.put(key, updated); await storage.put(`job:${body.jobId}`, updated); return json({ saved: true });
    });
    if (path === '/request') return json({ entry: await this.storage.get(`request:${body.requestKey}`) ?? null });
    if (path === '/job') return json({ entry: await this.storage.get(`job:${body.jobId}`) ?? null });
    if (path === '/deleted') {
      const entry = await this.storage.get<JournalRecord>(`job:${body.jobId}`);
      if (entry) await this.storage.put(`job:${body.jobId}`, { ...entry, deleted: true });
      return json({ saved: true });
    }
    return json({ error: 'unknown' }, 404);
  }
}
async function journal(env: Env, route: string, body: Record<string, unknown>) {
  if (!env.JOURNAL) fail(503, 'configuration_missing', 'Falta configurar el registro de trabajos.');
  const response = await env.JOURNAL.get(env.JOURNAL.idFromName('registry-v1')).fetch(new Request(`https://journal${route}`, { method: 'POST', body: JSON.stringify(body) }));
  if (!response.ok) fail(503, 'journal_unavailable', 'No se pudo confirmar el registro del trabajo.');
  return await response.json() as { reserved?: boolean; conflict?: boolean; existing?: JournalRecord; entry?: JournalRecord };
}
async function authenticate(request: Request, env: Env): Promise<Principal> {
  if (!env.ACTION_API_KEY?.trim()) fail(503, 'configuration_missing', 'Falta configurar la autenticación de la acción.');
  if (env.LEXIA_API_KEY && await equalSecret(env.LEXIA_API_KEY, env.ACTION_API_KEY)) fail(503, 'configuration_invalid', 'Las claves de la acción y del backend deben ser distintas.');
  const supplied = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || request.headers.get('x-api-key') || '';
  if (env.LEXIA_API_KEY && await equalSecret(supplied, env.LEXIA_API_KEY)) {
    const owner = request.headers.get('x-owner-id');
    if (!ownerIdentifier(owner)) fail(400, 'owner_required', 'El backend debe identificar al propietario.');
    return { kind: 'backend', owner };
  }
  if (await equalSecret(supplied, env.ACTION_API_KEY)) return { kind: 'gpt', owner: 'gpt-action' };
  return fail(401, 'unauthorized', 'Autenticación inválida.');
}
function providerConfiguration(env: Env) {
  if (!env.CF_ACCOUNT_ID || !env.CF_API_TOKEN || !env.STREAM) fail(503, 'configuration_missing', 'Falta configurar Cloudflare Stream.');
}
async function cloudflare(env: Env, suffix: string, options: RequestInit = {}) {
  providerConfiguration(env);
  try {
    return await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CF_ACCOUNT_ID!)}/stream${suffix}`, {
      ...options, headers: { ...Object.fromEntries(new Headers(options.headers)), Authorization: `Bearer ${env.CF_API_TOKEN}` }, signal: AbortSignal.timeout(120_000),
    });
  } catch { return fail(502, 'provider_unavailable', 'No fue posible contactar con Cloudflare Stream.'); }
}
async function result(response: Response): Promise<unknown> {
  if (!response.ok) fail(502, 'provider_rejected', 'Cloudflare Stream rechazó la operación.');
  let data: unknown; try { data = await response.json(); } catch { return fail(502, 'provider_invalid', 'Cloudflare Stream devolvió una respuesta inválida.'); }
  if (!record(data) || data.success === false || data.result === undefined) fail(502, 'provider_invalid', 'Cloudflare Stream devolvió una respuesta inválida.');
  return data.result;
}
function scheduledDeletion(env: Env) {
  const days = Number(env.RETENTION_DAYS ?? 31);
  if (!Number.isInteger(days) || days < 31 || days > 1095) fail(503, 'configuration_invalid', 'La retención configurada es inválida.');
  return new Date(Date.now() + days * 86_400_000).toISOString();
}
function safeVideo(video: Video) {
  const state = video.status?.state; const supplied = video.status?.pctComplete; const pct = Number(supplied);
  return { ...(typeof state === 'string' ? { state } : {}), ...(supplied !== undefined && String(supplied).trim() && Number.isFinite(pct) && pct >= 0 && pct <= 100 ? { pctComplete: pct } : {}) };
}
function reception(video: Video, filename: string, deletion: string) {
  const id = video.uid || video.id;
  if (!identifier(id)) fail(502, 'provider_invalid', 'Cloudflare Stream no confirmó el identificador de carga.');
  return {
    job_id: id, filename, status: video.status?.state === 'error' ? 'error' : video.readyToStream ? 'video_ready' : 'processing_video',
    ready_to_stream: video.readyToStream === true, video_status: safeVideo(video),
    scheduled_deletion: video.scheduledDeletion || null, scheduled_deletion_requested: deletion,
  };
}
function timestamp(text: string) {
  const match = /^(?:(\d{2,}):)?(\d{2}):(\d{2})\.(\d{3})$/.exec(text);
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) fail(502, 'invalid_transcript', 'La transcripción tiene tiempos inválidos.');
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}
function decodeEntities(text: string) {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', nbsp: ' ', quot: '"', apos: "'", lrm: '\u200e', rlm: '\u200f' };
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|nbsp|quot|apos|lrm|rlm);/gi, (entity, key: string) => {
    if (key[0] !== '#') return named[key.toLowerCase()] ?? entity;
    const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : entity;
  });
}
/** Cue IDs/notes/styles are metadata; only an explicit VTT voice tag supplies speaker. */
export function parseVtt(vtt: string): Segment[] {
  const normalized = vtt.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!/^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(normalized)) fail(502, 'invalid_transcript', 'El proveedor no devolvió WebVTT válido.');
  const segments: Segment[] = [];
  const blocks = normalized.split(/\n[ \t]*\n/).slice(1);
  for (const block of blocks) {
    const lines = block.split('\n');
    if (!block.trim() || /^(?:NOTE(?:[ \t]|$)|STYLE$|REGION$)/.test(lines[0])) continue;
    const timingIndex = lines[0].includes('-->') ? 0 : 1;
    const timing = /^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/.exec(lines[timingIndex] ?? '');
    if (!timing) fail(502, 'invalid_transcript', 'La transcripción tiene segmentos inválidos.');
    const start = timestamp(timing[1]); const end = timestamp(timing[2]);
    if (end <= start || end > 365 * 86_400 || (segments.length && start < segments[segments.length - 1].start)) fail(502, 'invalid_transcript', 'La transcripción tiene un orden temporal inválido.');
    const payload = lines.slice(timingIndex + 1).join('\n');
    const voices = [...payload.matchAll(/<v(?:\.[^ >]+)*\s+([^>]+)>/g)].map(match => decodeEntities(match[1]).trim());
    const speaker = voices.length && new Set(voices).size === 1 ? voices[0] : undefined;
    const text = decodeEntities(payload.replace(/<[^>]*>/g, ''));
    if (new TextEncoder().encode(text).length > 256 * 1024 || speaker && (speaker.length > 250 || new TextEncoder().encode(speaker).length > 1024)) fail(502, 'transcript_segment_too_large', 'Un segmento excede el límite de recuperación.');
    if (text.trim()) segments.push({ index: segments.length, start, end, text, ...(speaker ? { speaker } : {}) });
  }
  if (!segments.length) fail(422, 'empty_transcript', 'No se obtuvieron segmentos de voz.');
  return segments;
}
async function getVideo(env: Env, id: string): Promise<Video> {
  const value = await result(await cloudflare(env, `/${encodeURIComponent(id)}`));
  if (!record(value)) fail(502, 'provider_invalid', 'Cloudflare Stream devolvió un estado inválido.');
  if (value.uid !== undefined && value.uid !== id || value.id !== undefined && value.id !== id) fail(502, 'provider_invalid', 'Cloudflare Stream devolvió un identificador diferente al solicitado.');
  return value as Video;
}
async function captionList(env: Env, id: string) {
  const value = await result(await cloudflare(env, `/${encodeURIComponent(id)}/captions`));
  if (!Array.isArray(value)) fail(502, 'provider_invalid', 'Cloudflare Stream devolvió una lista de subtítulos inválida.');
  return value.find(caption => record(caption) && caption.language === 'es') as Record<string, unknown> | undefined;
}
async function vttSegments(env: Env, id: string) {
  const response = await cloudflare(env, `/${encodeURIComponent(id)}/captions/es/vtt`);
  if (!response.ok) fail(502, 'transcript_unavailable', 'No fue posible recuperar la transcripción terminada.');
  const text = await response.text();
  if (new TextEncoder().encode(text).length > 16 * 1024 * 1024) fail(502, 'transcript_too_large', 'La transcripción excede el límite de lectura del Worker.');
  return parseVtt(text);
}
async function jobStatus(env: Env, id: string) {
  const video = await getVideo(env, id);
  const base = { job_id: id, language: 'es', ready_to_stream: video.readyToStream === true, video_status: safeVideo(video), duration_seconds: Number.isFinite(video.duration) && video.duration! >= 0 ? video.duration : null, scheduled_deletion: video.scheduledDeletion || null };
  if (video.status?.state === 'error') return { ...base, status: 'error', error: 'Cloudflare Stream no pudo procesar el video.' };
  if (video.status?.state === 'pendingupload') return { ...base, status: 'uploading' };
  if (!video.readyToStream) return { ...base, status: 'processing_video' };
  const caption = await captionList(env, id);
  if (caption?.status === 'error') return { ...base, status: 'error', error: 'Cloudflare Stream no pudo generar los subtítulos.' };
  const completed = async () => {
    try {
      const segments = await vttSegments(env, id);
      return { ...base, status: 'completed', total_segments: segments.length, transcript_hash: await transcriptHash(segments) };
    } catch (error) {
      if (error instanceof WorkerError && error.code === 'empty_transcript') return { ...base, status: 'error', error: error.message, code: error.code };
      throw error;
    }
  };
  if (caption?.status === 'ready') return completed();
  if (caption && caption.status !== 'inprogress') fail(502, 'provider_invalid', 'Cloudflare Stream devolvió un estado de subtítulos inválido.');
  if (!caption) {
    const generated = await cloudflare(env, `/${encodeURIComponent(id)}/captions/es/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (generated.status === 409) {
      const existing = await captionList(env, id);
      if (existing?.status === 'ready') return completed();
      if (existing?.status === 'error') return { ...base, status: 'error', error: 'Cloudflare Stream no pudo generar los subtítulos.' };
      if (!existing || existing.status !== 'inprogress') fail(502, 'caption_generation_rejected', 'No se confirmó una generación de subtítulos en curso.');
    } else await result(generated);
  }
  return { ...base, status: 'generating_transcript' };
}
async function authorizeJob(request: Request, env: Env, principal: Principal, id: string) {
  const { entry } = await journal(env, '/job', { jobId: id });
  if (!entry || entry.principal.kind !== principal.kind || entry.principal.owner !== principal.owner) fail(404, 'job_not_found', 'No se encontró el trabajo.');
  if (principal.kind === 'gpt') {
    const queryTokens = new URL(request.url).searchParams.getAll('job_token');
    if (queryTokens.length > 1) fail(400, 'invalid_job_token', 'Debe enviarse un único token de autorización por trabajo.');
    const queryToken = queryTokens[0]; const headerToken = request.headers.get('x-job-token');
    if (queryToken !== undefined && headerToken !== null && !await equalSecret(queryToken, headerToken)) fail(400, 'conflicting_job_token', 'Los tokens de autorización del trabajo no coinciden.');
    if (!await equalSecret(queryToken ?? headerToken ?? '', entry.jobToken || crypto.randomUUID())) fail(404, 'job_not_found', 'No se encontró el trabajo.');
  }
  return entry;
}
function requestKey(principal: Principal, id: string) { return JSON.stringify([principal.kind, principal.owner, id]); }
function existingReply(entry?: JournalRecord) {
  if (!entry || entry.state !== 'created' || !entry.response) fail(409, 'recovery_required', 'La aceptación de la carga aún no está confirmada. No se repetirá automáticamente.');
  return entry.response;
}
function safeDownloadUrl(value: unknown): string {
  if (typeof value !== 'string') fail(400, 'file_required', 'Falta el enlace temporal del archivo.');
  let url: URL; try { url = new URL(value); } catch { return fail(400, 'invalid_file_url', 'El enlace del archivo es inválido.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' || /^(?:localhost|127\.|10\.|192\.168\.|169\.254\.|\[|0\.0\.0\.0)/i.test(url.hostname) || /^172\.(?:1[6-9]|2\d|3[01])\./.test(url.hostname)) fail(400, 'invalid_file_url', 'El archivo requiere un enlace HTTPS público.');
  return url.href;
}
async function createJob(request: Request, env: Env, principal: Principal) {
  providerConfiguration(env);
  const deletion = scheduledDeletion(env); const contentType = request.headers.get('content-type') || '';
  let file: File | undefined; let link: string | undefined; let referenceId: string | undefined; let filename: string;
  let id = request.headers.get('x-request-id') || '';
  if (contentType.includes('multipart/form-data')) {
    if (principal.kind !== 'backend') fail(403, 'backend_required', 'La carga multipart requiere la credencial independiente y el propietario del backend.');
    const length = Number(request.headers.get('content-length') || 0);
    if (length > 101 * 1024 * 1024) fail(413, 'file_too_large', 'La carga multipart está limitada a 100 MiB.');
    let form: FormData; try { form = await request.formData(); } catch { return fail(400, 'invalid_body', 'No fue posible leer la carga multipart.'); }
    const candidate = form.get('file') || form.get('audio') || form.get('video') || form.get('media');
    if (!(candidate instanceof File) || [...form.values()].filter(value => value instanceof File).length !== 1) fail(400, 'file_required', 'Se requiere un solo archivo multimedia.');
    file = candidate; filename = file.name;
    if (file.size === 0 || file.size > 100 * 1024 * 1024 || !/\.(?:mp4|webm|mov|m4a|mp3|wav|ogg|flac)$/i.test(filename)) fail(file.size > 100 * 1024 * 1024 ? 413 : 400, 'invalid_file', 'El archivo multimedia o su tamaño no está permitido.');
    const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer()); const ascii = new TextDecoder().decode(bytes);
    const typeMatches = /\.(?:mp4|m4a|mov)$/i.test(filename) ? /^(?:....(?:ftyp|moov|mdat|wide))/.test(ascii)
      : /\.webm$/i.test(filename) ? bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
      : /\.wav$/i.test(filename) ? ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE'
      : /\.ogg$/i.test(filename) ? ascii.startsWith('OggS')
      : /\.flac$/i.test(filename) ? ascii.startsWith('fLaC')
      : ascii.startsWith('ID3') || bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    if (!typeMatches) fail(400, 'invalid_file', 'El contenido no coincide con un archivo multimedia permitido.');
  } else if (contentType.includes('application/json')) {
    let body: unknown; try { body = await request.json(); } catch { return fail(400, 'invalid_body', 'No fue posible leer la solicitud JSON.'); }
    if (!record(body) || !Array.isArray(body.openaiFileIdRefs) || body.openaiFileIdRefs.length !== 1) fail(400, 'file_required', 'Se requiere una sola referencia de archivo.');
    const reference = body.openaiFileIdRefs[0];
    if (typeof reference === 'string') { link = safeDownloadUrl(reference); filename = 'audiencia.webm'; }
    else if (record(reference)) { link = safeDownloadUrl(reference.download_link); filename = typeof reference.name === 'string' ? reference.name : 'audiencia.webm'; referenceId = typeof reference.id === 'string' ? reference.id : undefined; }
    else return fail(400, 'file_required', 'La referencia de archivo es inválida.');
    if (typeof body.request_id === 'string') id = id || body.request_id;
  } else return fail(415, 'unsupported_body', 'Utiliza JSON o multipart/form-data.');
  if (filename.length > 255) fail(400, 'invalid_file', 'El nombre del archivo es demasiado largo.');
  if (!id && principal.kind === 'gpt') id = referenceId ? await hash({ referenceId, filename }) : crypto.randomUUID();
  if (!identifier(id)) fail(400, 'request_id_required', 'Se requiere un identificador estable de solicitud.');
  const key = requestKey(principal, id); const jobToken = crypto.randomUUID() + crypto.randomUUID();
  const fingerprint = await hash({ type: file ? 'multipart' : 'json', filename, size: file?.size, mime: file?.type, referenceId, link: referenceId ? undefined : link });
  const reservation = await journal(env, '/reserve', { requestKey: key, fingerprint, principal, jobToken });
  if (reservation.conflict) fail(409, 'request_conflict', 'El identificador ya pertenece a otro archivo.');
  if (reservation.existing) return json(existingReply(reservation.existing));
  let video: Video;
  if (file) {
    const form = new FormData(); form.append('file', file, filename); form.append('scheduledDeletion', deletion); form.append('requireSignedURLs', 'true'); form.append('creator', principal.owner);
    const uploaded = await result(await cloudflare(env, '', { method: 'POST', body: form }));
    if (!record(uploaded)) fail(502, 'provider_invalid', 'Cloudflare Stream devolvió una carga inválida.');
    video = uploaded as Video;
  } else {
    try { video = await env.STREAM!.upload(link!, { creator: principal.owner, meta: { filename, source: principal.kind, request_id: id }, scheduledDeletion: deletion, requireSignedURLs: true }); }
    catch { return fail(502, 'provider_rejected', 'Cloudflare Stream no confirmó la carga del archivo.'); }
  }
  let response = { ...reception(video, filename, deletion), request_id: id, ...(principal.kind === 'gpt' ? { job_token: jobToken } : {}) };
  // Record the accepted identity before any follow-up metadata operation can fail.
  await journal(env, '/complete', { requestKey: key, jobId: response.job_id, response });
  if (file && video.scheduledDeletion !== deletion) {
    const edited = await result(await cloudflare(env, `/${encodeURIComponent(response.job_id!)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduledDeletion: deletion, requireSignedURLs: true, creator: principal.owner, meta: { filename, request_id: id, source: principal.kind } }),
    }));
    if (!record(edited) || edited.scheduledDeletion !== deletion) fail(502, 'retention_unconfirmed', 'La carga se recibió pero Cloudflare Stream no confirmó la retención solicitada.');
    response = { ...response, scheduled_deletion: deletion };
    await journal(env, '/complete', { requestKey: key, jobId: response.job_id, response });
  }
  return json(response);
}
const base64 = (value: string) => btoa(String.fromCharCode(...new TextEncoder().encode(value)));
async function directUpload(request: Request, env: Env, principal: Principal) {
  if (principal.kind !== 'backend') fail(403, 'backend_required', 'Esta carga solo está disponible mediante el backend.');
  providerConfiguration(env);
  let body: unknown; try { body = await request.json(); } catch { return fail(400, 'invalid_body', 'Solicitud de carga inválida.'); }
  if (!record(body) || !identifier(body.request_id) || body.owner_id !== principal.owner || typeof body.filename !== 'string' || body.filename.length > 255 || !/\.(?:mp4|webm|mov|avi)$/i.test(body.filename) || !Number.isSafeInteger(body.size) || Number(body.size) <= 0 || Number(body.size) > 2 * 1024 * 1024 * 1024 || typeof body.mime !== 'string' || body.mime.length > 128) fail(400, 'invalid_upload', 'Los datos de carga directa son inválidos.');
  const deletion = scheduledDeletion(env); const maxDuration = Number(env.MAX_DURATION_SECONDS ?? 36000);
  if (!Number.isInteger(maxDuration) || maxDuration < 1 || maxDuration > 36000) fail(503, 'configuration_invalid', 'La duración máxima configurada es inválida.');
  const key = requestKey(principal, body.request_id); const fingerprint = await hash({ type: 'tus', filename: body.filename, size: body.size, mime: body.mime });
  const reservation = await journal(env, '/reserve', { requestKey: key, fingerprint, principal });
  if (reservation.conflict) fail(409, 'request_conflict', 'El identificador ya pertenece a otro archivo.');
  if (reservation.existing) return json(existingReply(reservation.existing));
  const response = await cloudflare(env, '?direct_user=true', { method: 'POST', headers: {
    'Tus-Resumable': '1.0.0', 'Upload-Length': String(body.size), 'Upload-Creator': principal.owner.slice(0, 64),
    'Upload-Metadata': `name ${base64(body.filename)},maxdurationseconds ${base64(String(maxDuration))},scheduleddeletion ${base64(deletion)},requiresignedurls ${base64('true')}`,
  } });
  if (!response.ok) fail(502, 'provider_rejected', 'Cloudflare Stream no confirmó la carga directa.');
  const uploadUrl = response.headers.get('location'); const jobId = response.headers.get('stream-media-id');
  if (!identifier(jobId) || !uploadUrl) fail(502, 'provider_invalid', 'Cloudflare Stream no confirmó la dirección y el identificador de carga.');
  let destination: URL; try { destination = new URL(uploadUrl); } catch { return fail(502, 'provider_invalid', 'Cloudflare Stream devolvió una dirección de carga inválida.'); }
  if (destination.protocol !== 'https:' || destination.username || destination.password || !/(?:^|\.)(?:cloudflarestream\.com|videodelivery\.net)$/.test(destination.hostname)) fail(502, 'provider_invalid', 'Cloudflare Stream devolvió una dirección de carga inválida.');
  const reply = { request_id: body.request_id, job_id: jobId, status: 'uploading', upload_url: destination.href, size: body.size, expires_at: null, scheduled_deletion: null, scheduled_deletion_requested: deletion };
  await journal(env, '/complete', { requestKey: key, jobId, response: reply });
  return json(reply);
}
function pagination(url: URL) {
  const integer = (name: string, fallback: number, maximum: number) => {
    const raw = url.searchParams.get(name); if (raw === null) return fallback;
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > maximum || name === 'limit' && Number(raw) < 1) fail(400, 'invalid_pagination', 'Offset y límite deben ser enteros válidos.');
    return Number(raw);
  };
  const offset = integer('offset', 0, Number.MAX_SAFE_INTEGER); const limit = integer('limit', 100, 200);
  const time = (name: string, fallback: number) => {
    const value = url.searchParams.get(name); if (value === null) return fallback;
    if (!value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0) fail(400, 'invalid_time_range', 'El rango temporal debe expresarse en segundos válidos.');
    return Number(value);
  };
  const start = time('start', 0); const end = time('end', Number.MAX_SAFE_INTEGER);
  if (end < start) fail(400, 'invalid_time_range', 'El fin del rango no puede preceder al inicio.');
  return { offset, limit, start, end, filtered: url.searchParams.has('start') || url.searchParams.has('end') };
}
/** Measure the actual JSON, including escaping and duplicated legacy text, before returning it. */
function transcriptResponseFits(value: unknown, principal: Principal) {
  const serialized = JSON.stringify(value);
  const bytes = new TextEncoder().encode(serialized).length;
  return principal.kind === 'gpt' ? bytes <= 90_000 && serialized.length <= 90_000 : bytes <= 700 * 1024;
}
async function handle(request: Request, env: Env) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/privacy') return new Response(PRIVACY_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, contract_version: 2, language: 'es', direct_upload: Boolean(env.LEXIA_API_KEY && env.JOURNAL && env.STREAM && env.CF_ACCOUNT_ID && env.CF_API_TOKEN), job_authorization: 'owner_or_job_token' });
  const principal = await authenticate(request, env);
  if (request.method === 'POST' && ['/jobs', '/api/transcribe', '/transcribe'].includes(url.pathname)) return createJob(request, env, principal);
  if (request.method === 'POST' && url.pathname === '/uploads') return directUpload(request, env, principal);
  const requestMatch = /^\/(?:requests|uploads)\/([^/]+)$/.exec(url.pathname);
  if (request.method === 'GET' && requestMatch) {
    if (principal.kind !== 'backend') fail(403, 'backend_required', 'La recuperación de solicitudes requiere el backend.');
    if (!identifier(requestMatch[1])) fail(400, 'invalid_request_id', 'Identificador de solicitud inválido.');
    const { entry } = await journal(env, '/request', { requestKey: requestKey(principal, requestMatch[1]) });
    if (!entry) fail(404, 'request_not_found', 'No se encontró la solicitud.');
    return json(existingReply(entry));
  }
  const match = /^(?:\/jobs|\/api\/transcribe\/jobs)\/([^/]+)(\/transcript)?$/.exec(url.pathname);
  if (!match) return json({ error: 'Ruta no encontrada.', code: 'not_found' }, 404);
  const id = match[1]; if (!identifier(id)) fail(400, 'invalid_job_id', 'Identificador de trabajo inválido.');
  const page = match[2] ? pagination(url) : undefined;
  const entry = await authorizeJob(request, env, principal, id);
  if (request.method === 'DELETE' && !page) {
    if (!entry.deleted) {
      providerConfiguration(env);
      try { await env.STREAM!.video(id).delete(); } catch { return fail(502, 'provider_rejected', 'Cloudflare Stream no confirmó la eliminación.'); }
      await journal(env, '/deleted', { jobId: id });
    }
    return json({ deleted: true, job_id: id });
  }
  if (entry.deleted) fail(410, 'job_deleted', 'El archivo remoto fue eliminado.');
  if (request.method !== 'GET') return json({ error: 'Método no permitido.', code: 'method_not_allowed' }, 405);
  if (!page) return json(await jobStatus(env, id));
  const caption = await captionList(env, id);
  if (caption?.status !== 'ready') fail(caption?.status === 'error' ? 422 : 409, 'transcript_not_ready', 'La transcripción aún no está lista para su recuperación.');
  const segments = await vttSegments(env, id); const transcript_hash = await transcriptHash(segments);
  if (page.filtered) {
    const selected = segments.filter(segment => segment.end >= page.start && segment.start <= page.end);
    const reply = { job_id: id, status: 'completed', language: 'es', mode: 'time_range', transcript_hash, total_segments: segments.length, segment_count: selected.length, start: page.start, end: page.end, segments: selected, text: selected.map(segment => segment.text).join('\n') };
    if (!transcriptResponseFits(reply, principal)) fail(502, 'transcript_range_too_large', 'El rango solicitado supera el límite de respuesta. Recupera la transcripción mediante páginas.');
    return json(reply);
  }
  if (page.offset > segments.length) fail(400, 'invalid_pagination', 'El cursor excede el número de segmentos.');
  const selected: Segment[] = [];
  const reply = () => ({ job_id: id, status: 'completed', language: 'es', mode: 'pagination', transcript_hash, total_segments: segments.length, offset: page.offset, limit: page.limit, next_offset: page.offset + selected.length < segments.length ? page.offset + selected.length : null, segments: selected, text: selected.map(segment => segment.text).join('\n') });
  for (const segment of segments.slice(page.offset, page.offset + page.limit)) {
    selected.push(segment);
    if (!transcriptResponseFits(reply(), principal)) { selected.pop(); break; }
  }
  if (!selected.length && page.offset < segments.length) fail(502, 'transcript_segment_too_large', 'No fue posible recuperar un segmento dentro del límite de página.');
  return json(reply());
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin'); const allowed = (env.CORS_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) return json({ error: 'Origen no permitido.', code: 'origin_rejected' }, 403);
    let response: Response;
    if (request.method === 'OPTIONS') response = new Response(null, { status: 204 });
    else {
      try { response = await handle(request, env); }
      catch (error) { response = error instanceof WorkerError ? json({ error: error.message, code: error.code }, error.status) : json({ error: 'No fue posible completar la operación.', code: 'internal_error' }, 500); }
    }
    if (origin) response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin'); response.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, x-api-key, x-owner-id, x-request-id, x-job-token');
    response.headers.set('X-Content-Type-Options', 'nosniff'); return response;
  },
};
