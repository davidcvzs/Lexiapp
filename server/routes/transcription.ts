import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { RequestHandler } from 'express';
import { mediaUpload } from '../middleware/uploads.js';
import { transcriptionUploadLimit, transcriptionPollLimit, RequestError } from '../middleware/security.js';
import { providerRequest } from '../middleware/providerRequest.js';
import { CloudflareTranscriptionService } from '../services/CloudflareTranscriptionService.js';
import type { DirectUploadResponse } from '../services/CloudflareTranscriptionService.js';
import { validJobId, parseUploadSession, MAX_MEDIA_BYTES, MAX_DIRECT_MEDIA_BYTES, DIRECT_MEDIA_ACCEPT } from '../../shared/transcription.js';
import type { TranscriptionJob, UploadSession } from '../../shared/transcription.js';
import { WorkspaceRepository } from '../persistence/WorkspaceRepository.js';
import type { JobStore } from '../persistence/WorkspaceRepository.js';
import type { SegmentJobStore, UploadMetadata, UploadReservation } from '../persistence/TranscriptStore.js';
import { configured } from '../config/environment.js';
import { createTranscriptWordRouter } from './transcriptWord.js';
import type { TranscriptWordService } from '../services/TranscriptWordService.js';

type Provider = Pick<CloudflareTranscriptionService, 'create' | 'get'> & Partial<Pick<CloudflareTranscriptionService, 'getTranscriptPage' | 'createDirectUpload' | 'getDirectUpload' | 'lookupRequest'>>;
const requestIdValid = (id: unknown): id is string => validJobId(id) && id.length <= 100;
const parameter = (value: unknown, fallback: number) => {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new RequestError(400, 'Paginación inválida.');
  return Number(value);
};

/** Owner checks precede provider calls; paginated recovery commits one durable page at a time. */
export function createTranscriptionRouter(provider: Provider = new CloudflareTranscriptionService(), upload: RequestHandler = mediaUpload,
  jobs: JobStore = new WorkspaceRepository(), options: { directUploadEnabled?: boolean; wordService?: TranscriptWordService } = {}) {
  const router = Router(), store = jobs as JobStore & Partial<SegmentJobStore>;
  const segments = (): JobStore & SegmentJobStore => {
    if (!store.reserveUpload || !store.getUploadRequest || !store.attachUpload || !store.appendTranscriptPage || !store.finalizeTranscript || !store.getSegmentPage || !store.getTranscriptText) throw new RequestError(503, 'La recuperación durable de fuentes no está configurada.');
    return store as JobStore & SegmentJobStore;
  };
  const directEnabled = () => (options.directUploadEnabled ?? (process.env.CLOUDFLARE_DIRECT_UPLOAD_ENABLED === 'true' && configured(process.env.CLOUDFLARE_BACKEND_SECRET)))
    && !!provider.createDirectUpload && !!provider.getDirectUpload && !!store.reserveUpload;
  router.use((req, res, next) => { if (!req.user) { res.status(401).json({ error: 'No autorizado.' }); return; } next(); });
  router.param('job_id', (_req, _res, next, id) => next(validJobId(id) ? undefined : new RequestError(400, 'Identificador inválido.')));
  router.param('request_id', (_req, _res, next, id) => next(requestIdValid(id) ? undefined : new RequestError(400, 'Solicitud inválida.')));
  router.get('/capabilities', (_req, res) => res.json({ multipartMaxBytes: MAX_MEDIA_BYTES, directUploadEnabled: directEnabled(), directMaxBytes: directEnabled() ? MAX_DIRECT_MEDIA_BYTES : 0, directFormats: directEnabled() ? DIRECT_MEDIA_ACCEPT.split(',') : [] }));
  router.get('/jobs', async (req, res, next) => {
    try { const after = req.query.after; if (after !== undefined && !validJobId(after)) throw new RequestError(400, 'Cursor inválido.'); res.json(await jobs.listJobs(req.user!.uid, after)); }
    catch (error) { next(error); }
  });
  const attach = async (uid: string, reservation: UploadReservation, job: TranscriptionJob, capability?: UploadSession['upload']) => {
    try { await jobs.getJob(uid, job.job_id); }
    catch (error) {
      if (!(error instanceof RequestError) || error.status !== 404) throw error;
      try { await jobs.saveJob(uid, job, reservation.metadata.filename); }
      catch (race) { if (!(race instanceof RequestError) || race.status !== 502) throw race; await jobs.getJob(uid, job.job_id); }
    }
    await segments().attachUpload(uid, reservation.requestId, job, capability);
    return jobs.getJob(uid, job.job_id);
  };
  const recover = async (uid: string, reservation: UploadReservation, signal: AbortSignal) => {
    if (reservation.jobId) return jobs.getJob(uid, reservation.jobId);
    if (!provider.lookupRequest) throw new RequestError(503, 'El proveedor no permite recuperar la solicitud de carga.');
    return attach(uid, reservation, await provider.lookupRequest(reservation.requestId, uid, signal));
  };
  const uploadSession = async (uid: string, reservation: UploadReservation, remote?: DirectUploadResponse): Promise<UploadSession> => {
    if (reservation.kind !== 'direct') throw new RequestError(409, 'Esta solicitud corresponde a una carga multipart.');
    if (reservation.jobId) await jobs.getJob(uid, reservation.jobId);
    const metadata = reservation.metadata;
    const capability = remote ? { requestId: reservation.requestId, url: remote.upload_url!, size: remote.size, filename: metadata.filename, mime: metadata.mime,
      lastModified: metadata.lastModified!, fingerprint: metadata.fingerprint!, ...(remote.expires_at ? { expiresAt: remote.expires_at } : {}) } : reservation.upload;
    if (!capability || remote?.status === 'failed' || (remote && remote.size !== metadata.size)) throw new RequestError(409, 'La sesión de carga no está disponible para reanudar.');
    const session = parseUploadSession({ job_id: remote?.job_id ?? reservation.jobId, status: 'uploading', upload: capability });
    if (remote) await attach(uid, reservation, { job_id: remote.job_id, status: 'uploading', stage: 'upload' }, session.upload);
    return session;
  };
  router.post('/uploads', transcriptionUploadLimit, async (req, res, next) => {
    const operation = providerRequest(res, 30_000);
    try {
      if (!directEnabled()) throw new RequestError(503, 'La carga directa reanudable aún no está habilitada. El límite multipart sigue siendo 100 MiB.');
      const body = req.body;
      if (!body || !requestIdValid(body.requestId) || typeof body.filename !== 'string' || !DIRECT_MEDIA_ACCEPT.split(',').includes(body.filename.slice(body.filename.lastIndexOf('.')).toLowerCase())) throw new RequestError(400, 'Selecciona un video y una solicitud de carga válidos.');
      const metadata: UploadMetadata = { filename: body.filename, size: body.size, mime: body.mime, lastModified: body.lastModified, fingerprint: body.fingerprint };
      const { reservation, created } = await segments().reserveUpload(req.user!.uid, body.requestId, metadata, 'direct');
      let session: UploadSession;
      if (reservation.upload) session = await uploadSession(req.user!.uid, reservation);
      else {
        const remote = created ? await provider.createDirectUpload!({ request_id: reservation.requestId, owner_id: req.user!.uid, filename: metadata.filename, size: metadata.size, mime: metadata.mime }, operation.signal)
          : await provider.getDirectUpload!(reservation.requestId, req.user!.uid, operation.signal);
        session = await uploadSession(req.user!.uid, reservation, remote);
      }
      operation.signal.throwIfAborted(); res.status(created ? 201 : 200).json(session);
    } catch (error) { if (!res.destroyed) next(error); } finally { operation.dispose(); }
  });
  router.get('/uploads/:request_id', async (req, res, next) => {
    const operation = providerRequest(res, 30_000);
    try {
      const uid = req.user!.uid, reservation = await segments().getUploadRequest(uid, String(req.params.request_id));
      if (reservation.upload) res.json(await uploadSession(uid, reservation));
      else {
        if (!provider.getDirectUpload) throw new RequestError(503, 'El proveedor no permite reanudar esta carga.');
        res.json(await uploadSession(uid, reservation, await provider.getDirectUpload(reservation.requestId, uid, operation.signal)));
      }
    } catch (error) { if (!res.destroyed) next(error); } finally { operation.dispose(); }
  });
  router.get('/requests/:request_id', async (req, res, next) => {
    const operation = providerRequest(res, 30_000);
    try {
      const uid = req.user!.uid, reservation = await segments().getUploadRequest(uid, String(req.params.request_id));
      res.json(await recover(uid, reservation, operation.signal));
    } catch (error) { if (!res.destroyed) next(error); } finally { operation.dispose(); }
  });
  router.post('/jobs', transcriptionUploadLimit, upload, async (req, res, next) => {
    if (!req.file) { res.status(400).json({ error: 'Archivo no proporcionado.' }); return; }
    const operation = providerRequest(res, 120_000);
    try {
      await jobs.ensureAvailable(); operation.signal.throwIfAborted();
      const requested = req.get('X-Upload-Request-Id');
      if (requested !== undefined && !requestIdValid(requested)) throw new RequestError(400, 'Solicitud de carga inválida.');
      const requestId = requested ?? randomUUID(), uid = req.user!.uid;
      let reservation: UploadReservation | undefined;
      if (store.reserveUpload) {
        const reserved = await store.reserveUpload(uid, requestId, { filename: req.file.originalname || 'audiencia', size: req.file.size || 1, mime: req.file.mimetype || 'application/octet-stream' }, 'multipart');
        reservation = reserved.reservation;
        if (!reserved.created) { res.json(await recover(uid, reservation, operation.signal)); return; }
      }
      const job = await provider.create(req.file, operation.signal, { ownerId: uid, requestId });
      // Commit acceptance even if the browser disconnected; recovery uses this same identifier.
      if (reservation) await attach(uid, reservation, job); else await jobs.saveJob(uid, job, req.file.originalname || 'audiencia');
      operation.signal.throwIfAborted(); res.status(201).json(job);
    } catch (error) { if (!res.destroyed) next(error); } finally { operation.dispose(); }
  });
  router.get('/jobs/:job_id', transcriptionPollLimit, async (req, res, next) => {
    let operation: ReturnType<typeof providerRequest> | undefined;
    try {
      const uid = req.user!.uid, id = String(req.params.job_id), stored = await jobs.getJob(uid, id);
      if (stored.status === 'completed' || stored.status === 'failed') { res.json(stored); return; }
      operation = providerRequest(res, 30_000);
      let current = stored;
      if (stored.status !== 'recovering_transcript') {
        const remote = await provider.get(id, operation.signal, uid); operation.signal.throwIfAborted();
        if (remote.job_id !== id) throw new RequestError(502, 'El proveedor devolvió otro trabajo.');
        current = await jobs.updateJob(uid, remote);
      }
      if (current.status === 'recovering_transcript') {
        if (!provider.getTranscriptPage) throw new RequestError(503, 'El transcriptor no permite recuperar segmentos.');
        if (!current.recovery?.totalSegments || current.recovery.recoveredSegments < current.recovery.totalSegments) {
          const page = await provider.getTranscriptPage(id, current.recovery?.recoveredSegments ?? 0, 200, operation.signal, uid);
          operation.signal.throwIfAborted(); current = await segments().appendTranscriptPage(uid, id, page);
        }
        if (current.recovery?.recoveredSegments === current.recovery?.totalSegments && current.recovery?.totalSegments) current = await segments().finalizeTranscript(uid, id);
      }
      operation.signal.throwIfAborted(); res.json(current);
    } catch (error) { if (!res.destroyed) next(error); } finally { operation?.dispose(); }
  });
  router.get('/jobs/:job_id/segments', async (req, res, next) => {
    try { res.json(await segments().getSegmentPage(req.user!.uid, String(req.params.job_id), parameter(req.query.offset, 0), parameter(req.query.limit, 200))); }
    catch (error) { next(error); }
  });
  router.get('/jobs/:job_id/transcript', async (req, res, next) => {
    try {
      const job = await jobs.getJob(req.user!.uid, String(req.params.job_id));
      if (job.status !== 'completed') throw new RequestError(409, 'La transcripción todavía no está completada.');
      if (job.transcript) res.json({ transcript: job.transcript, fileName: job.fileName });
      else if (job.text) res.json({ text: job.text, fileName: job.fileName });
      else throw new RequestError(409, 'La transcripción todavía no está completada.');
    } catch (error) { next(error); }
  });
  router.delete('/jobs/:job_id', async (req, res, next) => {
    try { await jobs.deleteJob(req.user!.uid, String(req.params.job_id)); res.json({ deleted: true, remoteDeleted: false, message: 'Copia de LexIA eliminada. El proveedor remoto puede conservar el audio y el trabajo.' }); }
    catch (error) { next(error); }
  });
  router.use(createTranscriptWordRouter(options.wordService));
  return router;
}
