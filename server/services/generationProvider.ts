import { OpenAIService } from './OpenAIService.js';
import { GeminiService, DEFAULT_GEMINI_MODEL } from './GeminiService.js';
import { DocumentGenerationService } from './DocumentGenerationService.js';
import type { Environment } from '../config/environment.js';
import { RequestError } from '../middleware/security.js';

/** Select one explicit provider; failures never instantiate or call an alternative provider. */
export function createGenerationService(options: { env?: Environment; openaiFactory?: () => DocumentGenerationService; geminiFactory?: () => DocumentGenerationService } = {}): DocumentGenerationService {
  const env = options.env ?? process.env;
  const provider = env.AI_PROVIDER?.trim() || 'openai';
  if (provider === 'gemini') return options.geminiFactory?.() ?? new DocumentGenerationService(new GeminiService({ apiKey: env.GEMINI_API_KEY ?? '', model: env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL }));
  if (provider === 'openai') return options.openaiFactory?.() ?? new OpenAIService(undefined, undefined, env);
  throw new RequestError(503, 'AI_PROVIDER debe ser openai o gemini.');
}
