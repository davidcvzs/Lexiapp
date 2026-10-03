import { createHash } from 'node:crypto';
import { getSystemPrompt, GPT_RULES_VERSION } from '../legal/rules/index.js';
import { resolveTask } from '../../shared/legalTasks.js';
import { parseGenerationRequest, validateGenerationConsent } from '../../shared/generation.js';
import type { TaskGenerationRequest, TaskGenerationResult } from '../../shared/generation.js';
import { contextRequiresAnalysis } from '../../shared/workflowValidation.js';
import { KnowledgeService } from './KnowledgeService.js';
import { RequestError } from '../middleware/security.js';

export interface TextGenerator {
  generate(instructions: string, input: string, options?: { signal?: AbortSignal }): Promise<string>;
}

/** Assemble the same legal instructions, sources and provenance for each selected AI provider. */
export class DocumentGenerationService {
  constructor(private readonly generator: TextGenerator, private readonly knowledgeService = new KnowledgeService()) {}

  /** Generate a validated task from separated sources and checked reference bytes; return text and provenance. */
  async generateTask(input: TaskGenerationRequest, options: { signal?: AbortSignal } = {}): Promise<TaskGenerationResult> {
    const request = parseGenerationRequest(input);
    await validateGenerationConsent(request);
    options.signal?.throwIfAborted();
    const { task, format } = resolveTask(request);
    const references = await this.knowledgeService.readReferences(format.references);
    const instructions = getSystemPrompt(task.id) + '\nFORMATO SELECCIONADO: ' + format.label + (request.context ? '\nDevuelve solo el apartado o fragmento solicitado. El contexto contiene únicamente el asunto activo. Las referencias jurídicas seleccionadas y el formato aportado son datos separados de los hechos. No declares terminada la recepción de un testigo por inferencia.' : '');
    const provenance = { taskId: task.id, formatId: format.id, rulesVersion: GPT_RULES_VERSION,
      rulesHash: createHash('sha256').update(instructions).digest('hex'), references: references.map(ref => ({ id: ref.id, sha256: ref.sha256 })) };
    options.signal?.throwIfAborted();
    if (task.id === 'DIRECTORIO') return { result: JSON.stringify(await this.knowledgeService.queryDirectoryExcel(request.instruction, references[0].bytes), null, 2), provenance };
    if (task.id === 'SEDES' && request.instruction === task.instruction) return { result: references[0].content, provenance };
    const result = await this.generator.generate(instructions, JSON.stringify({ task: task.id, format: format.id, instruction: request.instruction, source: request.source,
      draft: request.draft, history: request.history, references: references.map(({ filename, content }) => ({ filename, content })),
      ...(request.context ? { context: request.context } : {}), analysisConfirmed: contextRequiresAnalysis(request, request.context) && !!request.analysisConsent }), options);
    options.signal?.throwIfAborted();
    if (typeof result !== 'string' || !result.trim()) throw new RequestError(502, 'La IA terminó sin texto válido. El borrador anterior se conserva.');
    return { result, provenance };
  }

  /** Preserve legacy instructions, literal source and history; local directory queries avoid AI calls. */
  async generateDocument(instruction: string, transcript = '', mode = 'GENERAL', history: string[] = [], options: { signal?: AbortSignal } = {}): Promise<string> {
    options.signal?.throwIfAborted();
    if (mode === 'ANALISIS') throw new RequestError(403, 'El análisis requiere confirmar el contrato de la tarea.');
    if (mode === 'DIRECTORIO') {
      const data = await this.knowledgeService.queryDirectoryExcel(instruction);
      options.signal?.throwIfAborted();
      return JSON.stringify(data, null, 2);
    }
    const knowledgeText = await this.knowledgeService.getKnowledgeText(mode);
    options.signal?.throwIfAborted();
    let context = '\n--- TRANSCRIPCION/FUENTE ORIGINAL ---\n' + transcript + '\n-----------------------------------\n';
    if (knowledgeText) context += '\n--- CONOCIMIENTO DE REFERENCIA ---\n' + knowledgeText + '\n-----------------------------------\n';
    if (history.length) context += '\n--- HISTORIAL DE INSTRUCCIONES PREVIAS ---\n' + history.join('\n') + '\n------------------------------------------\n';
    context += '\nINSTRUCCION ACTUAL: ' + instruction;
    const result = await this.generator.generate(getSystemPrompt(mode), context, options);
    options.signal?.throwIfAborted();
    if (typeof result !== 'string' || !result.trim()) throw new RequestError(502, 'La IA terminó sin texto válido. El borrador anterior se conserva.');
    return result;
  }
}
