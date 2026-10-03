import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import type { Router } from 'express';
import { apiLimit, aiLimit, securityErrorHandler } from './middleware/security.js';
import { requireAuth } from './middleware/auth.js';
import { createAiRouter } from './routes/ai.js';
import { createTranscriptionRouter } from './routes/transcription.js';
import { createDocumentsRouter } from './routes/documents.js';
import { createScjnRouter } from './routes/scjn.js';
import { createHealthRouter } from './routes/health.js';
import { createSourcesRouter } from './routes/sources.js';

/** Construct the server without binding a port; inject dependencies for HTTP verification. */
export function createApp(options: { production?: boolean; distPath?: string; scjn?: Router; storageCheck?: () => Promise<void>; trustProxyHops?: number } = {}) {
  const app = express(); app.disable('x-powered-by'); app.set('trust proxy', options.trustProxyHops ?? 0);
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const origins = process.env.APP_ORIGIN ? [process.env.APP_ORIGIN] : !production ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : [];
  if (origins.length) app.use(cors({ origin: origins, credentials: true }));
  app.use('/api', apiLimit); app.use(express.json({ limit: '1mb' }));
  app.use('/api', createHealthRouter({ storageCheck: options.storageCheck }));
  app.use('/api/ai', requireAuth, aiLimit, createAiRouter());
  app.use('/api/sources', requireAuth, createSourcesRouter());
  app.use('/api/transcription', requireAuth, createTranscriptionRouter());
  app.use('/api/documents', requireAuth, createDocumentsRouter());
  app.use('/api/scjn', options.scjn ?? createScjnRouter());
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'Ruta API no encontrada.' }); });
  if (production) {
    const folder = options.distPath ?? path.resolve('dist');
    if (!fs.existsSync(path.join(folder, 'index.html'))) throw new Error('Falta dist/index.html. Ejecuta npm run build antes de iniciar producción.');
    app.use(express.static(folder, { setHeaders: (res, filename) => {
      if (/[/\\]assets[/\\]/.test(filename)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      else res.setHeader('Cache-Control', 'no-cache');
    } }));
    app.use((req, res, next) => {
      if (!['GET', 'HEAD'].includes(req.method) || path.extname(req.path)) return next();
      res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(folder, 'index.html'));
    });
  }
  app.use((_req, res) => { res.status(404).json({ error: 'Recurso no encontrado.' }); });
  app.use(securityErrorHandler);
  return app;
}
