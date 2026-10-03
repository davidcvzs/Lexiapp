import { Router } from 'express';
import { WorkspaceRepository } from '../persistence/WorkspaceRepository.js';
import { createRequestLimit, RequestError } from '../middleware/security.js';
import { parseDraft, validDocumentId } from '../../shared/documents.js';
import { isRecord } from '../../shared/transcription.js';

/** Owner is always taken from the verified token, never from request data. */
export function createDocumentsRouter(repository = new WorkspaceRepository()) {
  const router = Router();
  router.use((req, res, next) => {
    if (!req.user) { res.status(401).json({ error: 'No autorizado.' }); return; }
    next();
  });
  router.param('id', (_req, _res, next, id) => next(validDocumentId(id) ? undefined : new RequestError(400, 'Identificador inválido.')));
  router.get('/', async (req, res, next) => {
    try {
      const after = req.query.after;
      if (after !== undefined && !validDocumentId(after)) throw new RequestError(400, 'Cursor inválido.');
      res.json(await repository.listDocuments(req.user!.uid, after));
    } catch (error) { next(error); }
  });
  router.get('/:id', async (req, res, next) => {
    try { res.json({ document: await repository.getDocument(req.user!.uid, String(req.params.id)) }); }
    catch (error) { next(error); }
  });
  router.put('/:id', createRequestLimit(60, 60_000), async (req, res, next) => {
    try {
      if (!isRecord(req.body) || !Number.isSafeInteger(req.body.revision) || (req.body.revision as number) < 0) throw new RequestError(400, 'Revisión inválida.');
      let draft;
      try { draft = parseDraft(req.body.draft); }
      catch { throw new RequestError(400, 'El borrador contiene campos inválidos.'); }
      res.json({ document: await repository.saveDocument(req.user!.uid, String(req.params.id), draft, req.body.revision as number) });
    } catch (error) { next(error); }
  });
  router.get('/:id/versions', async (req, res, next) => {
    try {
      const before = req.query.before === undefined ? undefined : Number(req.query.before);
      if (before !== undefined && (!Number.isSafeInteger(before) || before < 1)) throw new RequestError(400, 'Cursor inválido.');
      res.json(await repository.versions(req.user!.uid, String(req.params.id), before));
    } catch (error) { next(error); }
  });
  router.get('/:id/versions/:revision', async (req, res, next) => {
    try {
      const revision = Number(req.params.revision);
      if (!Number.isSafeInteger(revision) || revision < 1) throw new RequestError(400, 'Revisión inválida.');
      res.json({ document: await repository.getVersion(req.user!.uid, String(req.params.id), revision) });
    } catch (error) { next(error); }
  });
  router.delete('/:id', async (req, res, next) => {
    try { await repository.deleteDocument(req.user!.uid, String(req.params.id)); res.json({ deleted: true }); }
    catch (error) { next(error); }
  });
  return router;
}
