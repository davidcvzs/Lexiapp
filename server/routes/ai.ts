import { Router } from 'express';
import { OpenAIService } from '../services/OpenAIService';

const router = Router();
const aiService = new OpenAIService();

/** Detect OpenAI quota/billing errors and return 503 with readable message */
function handleOpenAIError(error: any, res: any, context: string) {
  console.error(`Error in ${context}:`, error);

  const message: string = error?.message || '';
  const code: string    = error?.code || error?.error?.code || '';

  if (
    code === 'insufficient_quota' ||
    message.toLowerCase().includes('quota') ||
    message.toLowerCase().includes('billing') ||
    message.toLowerCase().includes('insufficient')
  ) {
    return res.status(503).json({
      error: 'Servicio de IA temporalmente no disponible.',
      detail: 'La cuenta OpenAI no tiene saldo suficiente. Las funciones de búsqueda SCJN siguen operativas.',
    });
  }

  return res.status(500).json({ error: 'Error interno al comunicarse con OpenAI.' });
}

router.post('/generate', async (req, res) => {
  const { instruction, transcript, mode, history } = req.body;

  if (!instruction) {
    return res.status(400).json({ error: 'Falta la instruccion.' });
  }

  try {
    const documentContent = await aiService.generateDocument(instruction, transcript, mode, history);
    res.json({ result: documentContent });
  } catch (error: any) {
    return handleOpenAIError(error, res, '/api/ai/generate');
  }
});

router.post('/redact', async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Falta contenido' });

  try {
    const instruction =
      'Identifica en el siguiente texto las entidades exactas que deben ir en ROJO ' +
      '(nombres completos y parciales, apellidos, apodos, domicilios completos y parciales, ' +
      'marcas de vehículos, números de serie, fechas completas o parciales, y edades en número). ' +
      'Devuelve ÚNICAMENTE un JSON Array de strings con las palabras/frases exactas a resaltar. ' +
      'NO devuelvas markdown, solo el JSON.';

    const response = await aiService.generateDocument(instruction, content, 'GENERAL');

    let entities: string[] = [];
    try {
      const cleanResponse = response.replace(/```json/g, '').replace(/```/g, '').trim();
      entities = JSON.parse(cleanResponse);
    } catch (e) {
      console.error('No se pudo parsear entidades a redactar:', e);
    }

    res.json({ entities });
  } catch (error: any) {
    // On quota error, return empty entities so Word export still works (without red)
    const message: string = error?.message || '';
    if (message.toLowerCase().includes('quota') || message.toLowerCase().includes('billing')) {
      return res.json({ entities: [], warning: 'OpenAI sin saldo — exportando sin resaltado rojo.' });
    }
    return handleOpenAIError(error, res, '/api/ai/redact');
  }
});

export default router;
