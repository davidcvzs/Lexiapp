// Manual, billable smoke test. Uses only this synthetic sentence, never case data.
import { OpenAIService } from '../../server/services/OpenAIService.js';

try {
  const result = await new OpenAIService().generateDocument(
    'Devuelve únicamente el texto de la fuente original, sin agregar información.',
    'Esta es una prueba técnica de LexIA.',
  );
  console.log(JSON.stringify({ service: 'OpenAI', success: !!result.trim(), returnedCharacters: result.length }));
} catch (error) {
  const details = error as { status?: number; code?: string; name?: string };
  console.log(JSON.stringify({ service: 'OpenAI', success: false, status: details.status, code: details.code, type: details.name }));
  process.exitCode = 1;
}
