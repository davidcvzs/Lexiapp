// Explicit live probe: one synthetic sentence, no case files and no automatic retries.
import { loadEnvironment } from '../server/config/environment.js';
import { GeminiService } from '../server/services/GeminiService.js';
import { RequestError } from '../server/middleware/security.js';

loadEnvironment();
if (process.env.AI_PROVIDER !== 'gemini') throw new Error('Selecciona AI_PROVIDER=gemini antes de esta prueba.');
const sentence = 'Esta es una prueba técnica de Lexiapp.';
try {
  const result = await new GeminiService().generate('Devuelve exclusivamente la frase recibida, sin comillas ni texto adicional.', sentence);
  const exactMatch = result === sentence;
  console.log(JSON.stringify({ provider: 'gemini', success: !!result.trim(), exactMatch, returnedCharacters: result.length, source: 'synthetic', privateReferencesUsed: false }));
  if (!exactMatch) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({ provider: 'gemini', success: false, status: error instanceof RequestError ? error.status : undefined, privateReferencesUsed: false }));
  process.exitCode = 1;
}
