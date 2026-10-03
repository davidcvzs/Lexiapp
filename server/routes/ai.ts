import { Router } from 'express';
import type { Response } from 'express';
import type { DocumentGenerationService } from '../services/DocumentGenerationService.js';
import { createGenerationService } from '../services/generationProvider.js';
import { RequestError } from '../middleware/security.js';
import { providerRequest } from '../middleware/providerRequest.js';
import { OperationTimeoutError } from '../../shared/operations.js';
import { isRecord } from '../../shared/transcription.js';
import { GenerationValidationError, parseGenerationRequest, validateGenerationConsent } from '../../shared/generation.js';
import { LEGAL_TASKS } from '../../shared/legalTasks.js';

function handleGenerationError(error: unknown, res: Response) {
  if (error instanceof RequestError || error instanceof GenerationValidationError) return res.status(error.status).json({ error: error.message });
  if (error instanceof OperationTimeoutError || (error instanceof Error && error.name === 'APIConnectionTimeoutError')) {
    return res.status(504).json({ error: 'La IA agotó el tiempo de espera. El borrador anterior se conserva.' });
  }
  const record = isRecord(error) ? error : {};
  if (record.code === 'insufficient_quota' || record.code === 'credit_balance_exhausted') {
    return res.status(503).json({ error: 'La cuenta de IA no tiene saldo disponible. El borrador se conserva.' });
  }
  if (record.status === 429) return res.status(429).json({ error: 'La IA alcanzó su límite de solicitudes. Espera antes de reintentar.' });
  if (record.status === 401 || record.status === 403 || record.status === 404) {
    return res.status(503).json({ error: 'La configuración de la IA requiere revisión por el administrador.' });
  }
  return res.status(502).json({ error: 'No fue posible generar el texto. El borrador anterior se conserva.' });
}

export function createAiRouter(service: Pick<DocumentGenerationService, 'generateDocument'> & Partial<Pick<DocumentGenerationService, 'generateTask'>> = createGenerationService()) {
  const router = Router();
  router.post('/generate', async (req, res) => {
    const body: unknown = req.body;
    if (isRecord(body) && ['contractVersion', 'taskId', 'formatId', 'source'].some(key => key in body)) {
      const operation = providerRequest(res, 120_000);
      try {
        const request = parseGenerationRequest(body);
        await validateGenerationConsent(request);
        if (!service.generateTask) throw new RequestError(503, 'La generación por tareas no está configurada.');
        const result = await service.generateTask(request, { signal: operation.signal });
        operation.signal.throwIfAborted();
        if (!result.result.trim()) throw new RequestError(502, 'La IA no devolvió texto válido.');
        res.json(result);
      } catch (error) { if (!res.destroyed) handleGenerationError(operation.signal.aborted ? operation.signal.reason : error, res); }
      finally { operation.dispose(); }
      return;
    }
    if (!isRecord(body) || typeof body.instruction !== 'string' || !body.instruction.trim() ||
        (body.transcript !== undefined && typeof body.transcript !== 'string') ||
        (body.mode !== undefined && typeof body.mode !== 'string') ||
        (body.history !== undefined && (!Array.isArray(body.history) || body.history.length > 100 || body.history.some(item => typeof item !== 'string')))) {
      res.status(400).json({ error: 'La instrucción y sus fuentes deben contener texto válido.' }); return;
    }
    if (body.mode === 'ANALISIS') { res.status(403).json({ error: 'El análisis requiere seleccionar la tarea y confirmar su alcance.' }); return; }
    if (body.mode !== undefined && body.mode !== 'GENERAL' && !LEGAL_TASKS.some(task => task.id === body.mode)) { res.status(400).json({ error: 'Tarea jurídica desconocida.' }); return; }
    const operation = providerRequest(res, 120_000);
    try {
      const result = await service.generateDocument(body.instruction, body.transcript as string | undefined,
        body.mode as string | undefined, body.history as string[] | undefined, { signal: operation.signal });
      operation.signal.throwIfAborted();
      if (typeof result !== 'string' || !result.trim()) throw new RequestError(502, 'La IA no devolvió texto válido. El borrador se conserva.');
      res.json({ result });
    } catch (error) { if (!res.destroyed) handleGenerationError(operation.signal.aborted ? operation.signal.reason : error, res); }
    finally { operation.dispose(); }
  });

  router.post('/redact', async (req, res) => {
    if (!isRecord(req.body) || typeof req.body.content !== 'string' || !req.body.content.trim()) {
      res.status(400).json({ error: 'Falta contenido válido.' }); return;
    }
    const operation = providerRequest(res, 120_000);
    try {
      const instruction =
        'Identifica en el siguiente texto las entidades exactas que deben ir en ROJO ' +
        '(nombres completos y parciales, apellidos, apodos, domicilios completos y parciales, ' +
        'marcas de vehículos, números de serie, fechas completas o parciales, y edades en número). ' +
        'Devuelve ÚNICAMENTE un JSON Array de strings con las palabras/frases exactas a resaltar. ' +
        'NO devuelvas markdown, solo el JSON.';
      const result = await service.generateDocument(instruction, req.body.content, 'GENERAL', [], { signal: operation.signal });
      operation.signal.throwIfAborted();
      let entities: unknown;
      try { entities = JSON.parse(result.replace(/```json/g, '').replace(/```/g, '').trim()); }
      catch { throw new RequestError(502, 'La IA no devolvió una lista válida de datos a revisar.'); }
      if (!Array.isArray(entities) || entities.some(item => typeof item !== 'string')) {
        throw new RequestError(502, 'La IA no devolvió una lista válida de datos a revisar.');
      }
      res.json({ entities });
    } catch (error) { if (!res.destroyed) handleGenerationError(operation.signal.aborted ? operation.signal.reason : error, res); }
    finally { operation.dispose(); }
  });
  return router;
}
