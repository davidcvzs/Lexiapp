import { isRecord } from './transcription.js';
import { resolveTask, validHash } from './legalTasks.js';
import type { AnalysisConsent, GenerationProvenance, TaskSelection } from './legalTasks.js';
import type { GuidedContext } from './workflowTypes.js';
import { parseGuidedContext, contextRequiresAnalysis } from './workflowValidation.js';
export interface GenerationSource { original: string; working: string; contrast: string }
export interface TaskGenerationRequest extends TaskSelection { contractVersion: 1; instruction: string; source: GenerationSource; draft: string; history: string[]; analysisConsent?: AnalysisConsent; context?: GuidedContext }
export interface TaskGenerationResult { result: string; provenance: GenerationProvenance }
export class GenerationValidationError extends Error { readonly status: number; constructor(message: string, status = 400) { super(message); this.status = status; } }
const text = (value: unknown, maximum: number, field: string): string => {
  if (typeof value !== 'string' || value.length > maximum) throw new GenerationValidationError(`Campo de generación inválido: ${field}.`);
  return value;
};
export function parseConsent(value: unknown): AnalysisConsent {
  if (!isRecord(value) || !validHash(value.fingerprint) || typeof value.confirmedAt !== 'string' || value.confirmedAt.length > 40 || !Number.isFinite(Date.parse(value.confirmedAt))) throw new GenerationValidationError('Confirmación de análisis inválida.');
  return { fingerprint: value.fingerprint, confirmedAt: value.confirmedAt };
}
/** Validate the task contract before reading references or calling the provider. */
export function parseGenerationRequest(value: unknown): TaskGenerationRequest {
  if (!isRecord(value) || value.contractVersion !== 1 || !isRecord(value.source)) throw new GenerationValidationError('Contrato de generación inválido.');
  const selection = { taskId: text(value.taskId, 50, 'tarea'), formatId: text(value.formatId, 50, 'formato') };
  let task;
  try { task = resolveTask(selection).task; } catch { throw new GenerationValidationError('Tarea o formato desconocidos.'); }
  const source = { original: text(value.source.original, 500_000, 'fuente original'), working: text(value.source.working, 500_000, 'fuente de trabajo'), contrast: text(value.source.contrast, 200_000, 'contraste') };
  const instruction = text(value.instruction, 4000, 'instrucción');
  const draft = text(value.draft, 500_000, 'borrador');
  const history = value.history ?? [];
  if (!Array.isArray(history) || history.length > 100 || history.some(item => typeof item !== 'string' || item.length > 4000)) throw new GenerationValidationError('Historial de instrucciones inválido.');
  if (!instruction.trim()) throw new GenerationValidationError('Escribe una instrucción para la tarea.');
  if (task.requiresSource && (!source.original.trim() || !source.working.trim())) throw new GenerationValidationError('Faltan la fuente original o la copia de trabajo.');
  const analysisConsent = value.analysisConsent === undefined ? undefined : parseConsent(value.analysisConsent);
  let context: GuidedContext | undefined;
  try { context = value.context === undefined ? undefined : parseGuidedContext(value.context, selection, draft); }
  catch (error) { throw new GenerationValidationError(error instanceof Error ? error.message : 'Contexto inválido.'); }
  if (selection.taskId === 'AMPARO' && selection.formatId === 'provided' && !context?.userTemplate.trim()) throw new GenerationValidationError('Aporta un formato para la demanda de amparo.');
  return { contractVersion: 1, ...selection, source, instruction, draft, history: history as string[], ...(analysisConsent ? { analysisConsent } : {}), ...(context ? { context } : {}) };
}
/** Bind confirmation to the exact task, instruction, sources, draft and history, never a reusable boolean. */
export async function generationFingerprint(request: TaskGenerationRequest): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ taskId: request.taskId, formatId: request.formatId, instruction: request.instruction, source: request.source, draft: request.draft, history: request.history, ...(request.context ? { context: request.context } : {}) })));
  return [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
}
export async function validateGenerationConsent(request: TaskGenerationRequest): Promise<void> {
  if (contextRequiresAnalysis(request, request.context) && (!request.analysisConsent || request.analysisConsent.fingerprint !== await generationFingerprint(request))) throw new GenerationValidationError('Confirma el análisis de esta instrucción y sus fuentes antes de generar.', 403);
}

/** Provenance is mandatory for new task responses; old stored records may omit it. */
export function parseProvenance(value: unknown): GenerationProvenance {
  if (!isRecord(value) || typeof value.taskId !== 'string' || typeof value.formatId !== 'string' || typeof value.rulesVersion !== 'string' || !value.rulesVersion.trim() || value.rulesVersion.length > 100 || !validHash(value.rulesHash) || !Array.isArray(value.references)) throw new GenerationValidationError('Procedencia de generación inválida.');
  const selection = { taskId: value.taskId, formatId: value.formatId };
  let format;
  try { format = resolveTask(selection).format; } catch { throw new GenerationValidationError('Procedencia de tarea desconocida.'); }
  if (value.references.length !== format.references.length || value.references.some((ref, i) => !isRecord(ref) || ref.id !== format.references[i] || !validHash(ref.sha256))) throw new GenerationValidationError('Referencias de generación inválidas.');
  return { ...selection, rulesVersion: value.rulesVersion, rulesHash: value.rulesHash, references: value.references.map((ref, i) => ({ id: format.references[i], sha256: ref.sha256 as string })) };
}
