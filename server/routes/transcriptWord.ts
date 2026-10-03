import { Router } from 'express';
import { validJobId } from '../../shared/transcription.js';
import { createRequestLimit, RequestError } from '../middleware/security.js';
import { providerRequest } from '../middleware/providerRequest.js';
import { TranscriptWordService } from '../services/TranscriptWordService.js';

/** Word/download and remote deletion are separate owner-scoped actions with durable receipts. */
export function createTranscriptWordRouter(service = new TranscriptWordService()) {
  const router = Router();
  router.use((req, res, next) => { if (!req.user) { res.status(401).json({ error: 'No autorizado.' }); return; } next(); });
  router.param('job_id', (_req, _res, next, id) => next(validJobId(id) ? undefined : new RequestError(400, 'Identificador inválido.')));
  router.post('/jobs/:job_id/word', createRequestLimit(10, 60_000), async (req, res, next) => {
    try { res.json(await service.create(req.user!.uid, String(req.params.job_id), req.body)); }
    catch (error) { next(error); }
  });
  router.get('/jobs/:job_id/word', async (req, res, next) => {
    try { res.json(await service.getState(req.user!.uid, String(req.params.job_id))); }
    catch (error) { next(error); }
  });
  router.get('/jobs/:job_id/word/download', async (req, res, next) => {
    try {
      const result = await service.download(req.user!.uid, String(req.params.job_id));
      res.set('Cache-Control', 'no-store').json({ artifact: result.artifact, base64: Buffer.from(result.bytes).toString('base64') });
    } catch (error) { next(error); }
  });
  router.delete('/jobs/:job_id/remote-video', createRequestLimit(10, 60_000), async (req, res, next) => {
    const operation = providerRequest(res, 30_000);
    try { const state = await service.deleteRemote(req.user!.uid, String(req.params.job_id), req.body, operation.signal); if (!res.destroyed) res.json(state); }
    catch (error) { if (!res.destroyed) next(error); } finally { operation.dispose(); }
  });
  router.post('/jobs/:job_id/remote-video/reconcile', createRequestLimit(30, 60_000), async (req, res, next) => {
    const operation = providerRequest(res, 30_000);
    try { const state = await service.reconcile(req.user!.uid, String(req.params.job_id), operation.signal); if (!res.destroyed) res.json(state); }
    catch (error) { if (!res.destroyed) next(error); } finally { operation.dispose(); }
  });
  return router;
}
