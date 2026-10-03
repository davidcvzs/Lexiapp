import { Router } from 'express';
import type { RequestHandler } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { WorkspaceRepository } from '../persistence/WorkspaceRepository.js';
import { createSCJNRepository } from '../scjn/index.js';
import { configured, validateEnvironment } from '../config/environment.js';
import type { SCJNProviderStatus } from '../scjn/types.js';

/** Liveness is cheap; readiness checks storage only, never billable AI or transcription. */
export function createHealthRouter(options: { storageCheck?: () => Promise<void>; scjnStatus?: () => Promise<SCJNProviderStatus>; timeoutMs?: number; authenticate?: RequestHandler; administrator?: RequestHandler } = {}) {
  const router = Router();
  const check = options.storageCheck ?? (() => new WorkspaceRepository().ensureAvailable());
  const ready = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([check(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Readiness timeout')), options.timeoutMs ?? 5000); })]);
      return true;
    } catch { return false; }
    finally { clearTimeout(timer); }
  };
  router.get('/health', (_req, res) => { res.setHeader('Cache-Control', 'no-store'); res.json({ status: 'ok', service: 'LexIA' }); });
  router.get('/ready', async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const available = await ready();
    res.status(available ? 200 : 503).json({ status: available ? 'ready' : 'unavailable' });
  });
  router.get('/health/details', options.authenticate ?? requireAuth, options.administrator ?? requireAdmin, async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const firestore = await ready();
    const scjn = await (options.scjnStatus ?? (() => createSCJNRepository().getProviderStatus()))();
    const environment = validateEnvironment(process.env);
    res.json({ firestore: { connected: firestore }, scjn, providers: { aiProvider: environment.aiProvider, generationConfigured: environment.generationConfigured,
      openaiConfigured: configured(process.env.OPENAI_API_KEY), geminiConfigured: configured(process.env.GEMINI_API_KEY), workerConfigured: environment.workerConfigured } });
  });
  return router;
}
