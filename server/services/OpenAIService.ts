import OpenAI from 'openai';
import type { Response, Tool } from 'openai/resources/responses/responses';
import dotenv from 'dotenv';
import { getSystemPrompt } from '../legal/rules/index.js';
import { DocumentGenerationService } from './DocumentGenerationService.js';
import { KnowledgeService } from './KnowledgeService.js';
import { RequestError } from '../middleware/security.js';
import type { Environment } from '../config/environment.js';
import { configured } from '../config/environment.js';

dotenv.config({ path: '.env.local', quiet: true });

/** A successful HTTP response may still be incomplete, refused, or contain no text. */
export function completedResponseText(response: Pick<Response, 'output_text' | 'status' | 'output'>): string {
  if (response.status !== 'completed') {
    throw new RequestError(502, 'La IA no completó la respuesta. El borrador anterior se conserva.');
  }
  if (response.output.some(item => item.type === 'message' && item.content.some(part => part.type === 'refusal'))) {
    throw new RequestError(422, 'La IA no pudo completar esta solicitud. Revisa la instrucción; el borrador se conserva.');
  }
  if (typeof response.output_text !== 'string' || !response.output_text.trim()) {
    throw new RequestError(502, 'La IA terminó sin texto válido. El borrador anterior se conserva.');
  }
  return response.output_text;
}

/** OpenAI transport preserving the shared task orchestration and legacy constructor. */
export class OpenAIService extends DocumentGenerationService {
  private readonly openai: OpenAI;
  private readonly defaultModel: string;
  private readonly generationConfigured: boolean;

  constructor(client?: OpenAI, knowledgeService = new KnowledgeService(), env: Environment = process.env) {
    const openai = client ?? new OpenAI({
      apiKey: env.OPENAI_API_KEY || 'missing',
      timeout: 120_000,
      maxRetries: 0,
    });
    const defaultModel = env.OPENAI_MODEL || 'gpt-5.6-sol';
    const generationConfigured = !!client || configured(env.OPENAI_API_KEY);
    super({ generate: async (instructions, input, options = {}) => {
      if (!generationConfigured) throw new RequestError(503, 'OpenAI requiere una clave válida configurada en el servidor.');
      const response = await openai.responses.create({ model: defaultModel, instructions, input }, { signal: options.signal });
      options.signal?.throwIfAborted();
      return completedResponseText(response);
    } }, knowledgeService);
    this.openai = openai;
    this.defaultModel = defaultModel;
    this.generationConfigured = generationConfigured;
  }

  /** Existing OpenAI-specific tool calls; Gemini selection never invokes this transport. */
  public async generateWithTools(instruction: string, context: string, tools: Tool[]): Promise<string> {
    if (!this.generationConfigured) throw new RequestError(503, 'OpenAI requiere una clave válida configurada en el servidor.');
    const response = await this.openai.responses.create({
      model: this.defaultModel, instructions: getSystemPrompt('GENERAL'), input: context + '\n' + instruction, tools,
    });
    return completedResponseText(response);
  }
}
