import { Router } from 'express';
import { createSCJNRepository } from '../scjn/index.js';
import { SCJNImportService } from '../scjn/SCJNImportService.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { importLimit } from '../middleware/security.js';
import { zipUpload, csvUpload } from '../middleware/uploads.js';
import type { ISCJNRepository } from '../scjn/types.js';

export function createScjnRouter(repo: ISCJNRepository = createSCJNRepository()) {
const router = Router();
const importService = new SCJNImportService(repo);

// POST /api/scjn/import (ZIP)
router.post('/import', requireAuth, requireAdmin, importLimit, zipUpload, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    // Process ZIP
    const batch = await importService.processZipFile(req.file.path, req.file.originalname);
    
    res.json(batch);
  } catch (error) {
    next(error);
  }
});

// POST /api/scjn/import/csv
router.post('/import/csv', requireAuth, requireAdmin, importLimit, csvUpload, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    // Process CSV
    const batch = await importService.processCsvFile(req.file.path, req.file.originalname);
    
    res.json(batch);
  } catch (error) {
    next(error);
  }
});

// GET /api/scjn/provider-status
router.get('/provider-status', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const status = await repo.getProviderStatus();
    res.json(status);
  } catch(e) {
    next(e);
  }
});

// GET /api/scjn/health (legacy check)
router.get('/health', async (_req, res) => {
  const h = await repo.getProviderStatus();
  res.status(h.connected ? 200 : 503).json({ status: h.connected ? 'ok' : 'unavailable' });
});

// GET /api/scjn/catalogs
router.get('/catalogs', async (_req, res, next) => {
  try {
    const catalogs = await repo.getCatalogs();
    res.json({ ...catalogs, source: "SCJN/LOCAL_INDEX" });
  } catch (error) {
    next(error);
  }
});

router.post('/catalogs/clear-cache', requireAuth, requireAdmin, importLimit, (_req, res) => {
  res.json({ status: 'ok', message: 'No-op for Local Index' });
});

// GET /api/scjn/search
router.get('/search', async (req, res, next) => {
  try {
    const q = req.query.q as string;
    const registro = req.query.registro as string;
    const epoca = req.query.epoca as string;
    const materia = req.query.materia as string;
    const instancia = req.query.instancia as string;
    const organo = req.query.organo as string;
    const tipo = req.query.tipo as string;
    const ponente = req.query.ponente as string;
    const asunto = req.query.asunto as string;
    const formaIntegracion = req.query.formaIntegracion as string;
    const anio = req.query.anio as string;
    const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
    let pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 10;
    if (pageSize > 100) pageSize = 100; // Limit to 100

    const result = await repo.search({
      q, registro, epoca, materia, instancia, organo, tipo, ponente, asunto, formaIntegracion, anio, page, pageSize
    });
    
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/scjn/tesis/:registro
router.get('/tesis/:registro', async (req, res, next) => {
  try {
    const registro = req.params.registro;
    const detail = await repo.getByRegistroDigital(registro);
    if (!detail) {
      return res.status(404).json({ error: `Registro digital ${registro} no encontrado en el índice local.` });
    }
    res.json(detail);
  } catch (error) {
    next(error);
  }
});

return router;
}
