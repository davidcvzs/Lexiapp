import { ApiClient, ApiError } from './ApiClient';
import { isRecord } from '../../shared/transcription';
import { parseGenerationRequest, parseProvenance, validateGenerationConsent } from '../../shared/generation';
import type { TaskGenerationRequest, TaskGenerationResult } from '../../shared/generation';
import type { DocumentDraft } from '../../shared/documents';
import { workflowSteps } from '../../shared/workflowCatalog';

export interface DocumentSection { title: string; content: string }
export interface DocumentState {
  transcription: string;
  documentType: string;
  completedSections: DocumentSection[];
  currentStep: number;
  userInstructions: string[];
  searchResults: unknown[];
  formatPreferences: Record<string, unknown>;
}

/** Per-editor state and JSON generation requests; no streaming or direct provider calls. */
export class AIAssistantService {
  private readonly api: ApiClient;
  private currentState: DocumentState = {
    transcription: '', documentType: '', completedSections: [], currentStep: 1,
    userInstructions: [], searchResults: [], formatPreferences: {},
  };

  /** Accept an authenticated API client; defaults to the application's same-origin API. */
  constructor(api = new ApiClient()) { this.api = api; }

  /** Keep the source transcription for this editor without changing its contents. */
  initializeSession(transcription: string): void { this.currentState.transcription = transcription; }

  /** Rebuild documentState from the durable draft after edits or reload; never infer missing sections. */
  syncDocumentState(draft: DocumentDraft): void {
    const flow = draft.workflow;
    this.currentState = { transcription: draft.originalTranscription ?? draft.transcription, documentType: draft.generationTask?.taskId ?? draft.documentType,
      completedSections: flow ? flow.sections.filter(section => section.matterId === flow.activeMatterId).map(section => ({ title: section.title, content: draft.content.slice(section.start, section.end) })) : [],
      currentStep: flow && draft.generationTask ? workflowSteps(draft.generationTask).findIndex(step => step.id === flow.currentStepId) + 1 : 1,
      userInstructions: (draft.generationLog ?? []).filter(record => !flow || record.matterId === flow.activeMatterId).map(record => record.instruction),
      searchResults: flow?.references.filter(ref => ref.matterId === flow.activeMatterId) ?? [], formatPreferences: draft.generationTask ? { ...draft.generationTask } : {} };
  }

  /** Return complete text or throw. Failures and cancellations never enter history. */
  async sendInstruction(instruction: string, options: { signal?: AbortSignal } = {}): Promise<string> {
    if (!instruction.trim()) throw new Error('Escribe una instrucción antes de generar.');
    const data = await this.api.request('/api/ai/generate', {
      method: 'POST', signal: options.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction }),
    }, 130_000);
    options.signal?.throwIfAborted();
    if (!isRecord(data) || typeof data.result !== 'string' || !data.result.trim()) {
      throw new ApiError(502, 'La IA no devolvió texto válido. El borrador anterior se conserva.');
    }
    this.currentState.userInstructions.push(instruction);
    return data.result;
  }

  /** Send a selected task with original, working and contrast sources; return text and reference hashes. */
  async generateTask(input: TaskGenerationRequest, options: { signal?: AbortSignal } = {}): Promise<TaskGenerationResult> {
    const request = parseGenerationRequest(input);
    await validateGenerationConsent(request);
    const data = await this.api.request('/api/ai/generate', { method: 'POST', signal: options.signal,
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) }, 130_000);
    options.signal?.throwIfAborted();
    if (!isRecord(data) || typeof data.result !== 'string' || !data.result.trim()) throw new ApiError(502, 'La IA no devolvió texto válido. El borrador anterior se conserva.');
    const provenance = parseProvenance(data.provenance);
    if (provenance.taskId !== request.taskId || provenance.formatId !== request.formatId) throw new ApiError(502, 'La respuesta corresponde a otra tarea o formato.');
    this.currentState.userInstructions.push(request.instruction);
    return { result: data.result, provenance };
  }

  /** Expose per-editor context reconstructed from the durable document, without provider conversation identifiers. */
  getState(): DocumentState { return this.currentState; }
}
