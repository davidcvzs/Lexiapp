import { isRecord } from './transcription.js';
import { validateRedactions } from './redaction.js';
import type { RedactionRange } from './redaction.js';
import type { TaskSelection, AnalysisConsent, GenerationProvenance } from './legalTasks.js';
import { resolveTask } from './legalTasks.js';
import { parseConsent, parseProvenance } from './generation.js';
import type { GuidedWorkflow } from './workflowTypes.js';
import { parseWorkflow } from './workflowValidation.js';
import { parseWordFormat } from './wordFormatting.js';
import type { WordFormat } from './wordFormatting.js';

export type PhaseState = 'generated' | 'reviewed' | 'stale';
export interface GenerationRecord { phase: string; instruction: string; sourceHash: string; createdAt: string; provenance?: GenerationProvenance; matterId?: string; stepId?: string }
export interface PublicVersion { redactions: RedactionRange[]; reviewed: boolean; reviewHash: string | null }

export interface DocumentDraft {
  title: string;
  caseNumber: string;
  caseType: string;
  documentType: string;
  summary: string;
  transcription: string;
  content: string;
  completedPhases: string[];
  audit: { names: boolean; congruence: boolean; pii: boolean };
  originalTranscription?: string;
  generationLog?: GenerationRecord[];
  phaseStates?: Record<string, PhaseState>;
  reviewHash?: string | null;
  publicVersion?: PublicVersion;
  generationTask?: TaskSelection;
  generationInstruction?: string;
  analysisConsent?: AnalysisConsent;
  workflow?: GuidedWorkflow;
  wordFormat?: WordFormat;
}
export interface SavedDocument extends DocumentDraft {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface DocumentSummary {
  id: string; title: string; caseNumber: string; caseType: string;
  revision: number; createdAt: string; updatedAt: string; status: 'Borrador' | 'Revisado';
}
export interface DocumentVersion { revision: number; savedAt: string }
export const validDocumentId = (id: unknown): id is string => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(id);

/** Validate the entire persistent documentState; never coerce malformed legal text. */
export function parseDraft(value: unknown): DocumentDraft {
  if (!isRecord(value)) throw new Error('Borrador inválido.');
  let generationTask: TaskSelection | undefined;
  if (value.generationTask !== undefined) {
    if (!isRecord(value.generationTask) || typeof value.generationTask.taskId !== 'string' || typeof value.generationTask.formatId !== 'string') throw new Error('Tarea del borrador inválida.');
    generationTask = { taskId: value.generationTask.taskId, formatId: value.generationTask.formatId };
    resolveTask(generationTask);
  }
  if (value.generationInstruction !== undefined && (typeof value.generationInstruction !== 'string' || value.generationInstruction.length > 4000)) throw new Error('Instrucción del borrador inválida.');
  const analysisConsent = value.analysisConsent === undefined ? undefined : parseConsent(value.analysisConsent);
  const limits: Record<string, number> = { title: 200, caseNumber: 100, caseType: 100, documentType: 100, summary: 200_000, transcription: 500_000, content: 500_000 };
  for (const [field, limit] of Object.entries(limits)) {
    if (typeof value[field] !== 'string' || value[field].length > limit) throw new Error(`Campo inválido: ${field}.`);
  }
  if (!Array.isArray(value.completedPhases) || value.completedPhases.length > 100 ||
    value.completedPhases.some(phase => typeof phase !== 'string' || phase.length > 200)) throw new Error('Fases inválidas.');
  if (!isRecord(value.audit) || ['names', 'congruence', 'pii'].some(field => typeof (value.audit as Record<string, unknown>)[field] !== 'boolean')) throw new Error('Auditoría inválida.');
  const completedPhases = value.completedPhases as string[];
  const originalTranscription = value.originalTranscription ?? value.transcription;
  if (typeof originalTranscription !== 'string' || originalTranscription.length > 500_000) throw new Error('Fuente original inválida.');
  const validHash = (hash: unknown) => hash === null || (typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash));
  const reviewHash = value.reviewHash ?? null;
  if (!validHash(reviewHash)) throw new Error('Huella de revisión inválida.');
  const generationLog = value.generationLog ?? [];
  if (!Array.isArray(generationLog) || generationLog.length > 100 || generationLog.some(record => !isRecord(record) ||
    typeof record.phase !== 'string' || record.phase.length > 200 || typeof record.instruction !== 'string' || record.instruction.length > 4000 ||
    typeof record.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(record.sourceHash) || typeof record.createdAt !== 'string' ||
    record.createdAt.length > 40 || !Number.isFinite(Date.parse(record.createdAt)))) throw new Error('Registro de generación inválido.');
  const phaseStates = value.phaseStates ?? Object.fromEntries(value.completedPhases.map(phase => [phase, 'generated']));
  if (!isRecord(phaseStates) || Object.keys(phaseStates).length > 100 || Object.entries(phaseStates).some(([phase, state]) =>
    !completedPhases.includes(phase) || !['generated', 'reviewed', 'stale'].includes(String(state)))) throw new Error('Estados de fases inválidos.');
  const plan = value.publicVersion ?? { redactions: [], reviewed: false, reviewHash: null };
  if (!isRecord(plan) || typeof plan.reviewed !== 'boolean' || !validHash(plan.reviewHash)) throw new Error('Revisión pública inválida.');
  const publicVersion: PublicVersion = { redactions: validateRedactions(value.content as string, plan.redactions), reviewed: plan.reviewed,
    reviewHash: plan.reviewHash as string | null };
  const workflow = value.workflow === undefined ? undefined : parseWorkflow(value.workflow, value.content as string, generationTask);
  const wordFormat = value.wordFormat === undefined ? undefined : parseWordFormat(value.content as string, value.wordFormat);
  return {
    title: value.title as string, caseNumber: value.caseNumber as string, caseType: value.caseType as string,
    documentType: value.documentType as string,
    summary: value.summary as string, transcription: value.transcription as string, content: value.content as string,
    completedPhases: [...value.completedPhases] as string[],
    audit: 'reviewHash' in value ? { names: value.audit.names as boolean, congruence: value.audit.congruence as boolean, pii: value.audit.pii as boolean }
      : { names: false, congruence: false, pii: false },
    originalTranscription, generationLog: generationLog.map(record => ({ phase: record.phase, instruction: record.instruction, sourceHash: record.sourceHash, createdAt: record.createdAt,
      ...(record.provenance === undefined ? {} : { provenance: parseProvenance(record.provenance) }),
      ...(record.matterId === undefined ? {} : { matterId: validateLogId(record.matterId) }), ...(record.stepId === undefined ? {} : { stepId: validateLogId(record.stepId) }) })),
    phaseStates: { ...phaseStates } as Record<string, PhaseState>,
    reviewHash: reviewHash as string | null, publicVersion,
    ...(generationTask ? { generationTask } : {}),
    ...(value.generationInstruction === undefined ? {} : { generationInstruction: value.generationInstruction as string }),
    ...(analysisConsent ? { analysisConsent } : {}),
    ...(workflow ? { workflow } : {}),
    ...(wordFormat ? { wordFormat } : {}),
  };
}

function validateLogId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error('Identificador de registro inválido.'); return value;
}

export function parseSavedDocument(value: unknown): SavedDocument {
  const draft = parseDraft(value);
  if (!isRecord(value) || !validDocumentId(value.id) || !Number.isSafeInteger(value.revision) || (value.revision as number) < 1 ||
    typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') throw new Error('Documento guardado inválido.');
  return { ...draft, id: value.id, revision: value.revision as number, createdAt: value.createdAt, updatedAt: value.updatedAt };
}
