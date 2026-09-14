import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import { SQLiteSCJNRepository } from '../scjn/SQLiteSCJNRepository.js';
import { SCJNImportService } from '../scjn/SCJNImportService.js';

const router = Router();
const repo = new SQLiteSCJNRepository();
// Ensure repo is initialized
repo.init().catch(e => console.error("Error init SCJN repo", e));

const importService = new SCJNImportService(repo);

// Configure multer for file uploads
const upload = multer({ dest: 'data/scjn/temp/' });

// POST /api/scjn/import (ZIP)
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    // Process ZIP
    const batch = await importService.processZipFile(req.file.path, req.file.originalname);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json(batch);
  } catch (error: any) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/scjn/import/csv
router.post('/import/csv', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    // Process CSV
    const batch = await importService.processCsvFile(req.file.path, req.file.originalname);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    res.json(batch);
  } catch (error: any) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/scjn/provider-status
router.get('/provider-status', async (req, res) => {
  try {
    const status = await repo.getProviderStatus();
    res.json(status);
  } catch(e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/scjn/health (legacy check)
router.get('/health', async (req, res) => {
  const h = await repo.getProviderStatus();
  res.json({ status: h.status, service: 'SCJN Integration Active via Local Index' });
});

// GET /api/scjn/catalogs
router.get('/catalogs', async (req, res) => {
  try {
    const catalogs = await repo.getCatalogs();
    res.json({ ...catalogs, source: "SCJN/LOCAL_INDEX" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/catalogs/clear-cache', (req, res) => {
  res.json({ status: 'ok', message: 'No-op for Local Index' });
});

// GET /api/scjn/search
router.get('/search', async (req, res) => {
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
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error en búsqueda SCJN' });
  }
});

// GET /api/scjn/tesis/:registro
router.get('/tesis/:registro', async (req, res) => {
  try {
    const registro = req.params.registro;
    const detail = await repo.getByRegistroDigital(registro);
    if (!detail) {
      return res.status(404).json({ error: `Registro digital ${registro} no encontrado en el índice local.` });
    }
    res.json(detail);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
