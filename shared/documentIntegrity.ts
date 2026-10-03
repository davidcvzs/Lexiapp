import type { DocumentDraft, PhaseState } from './documents.js';
import { publicText, validateRedactions } from './redaction.js';
export type ExportVariant = 'official' | 'public';

/** SHA-256 binds a review to text without storing another copy of private sources. */
export async function hashText(text: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export const reviewPayload = (draft: DocumentDraft) => JSON.stringify({ title: draft.title, caseNumber: draft.caseNumber, caseType: draft.caseType,
  documentType: draft.documentType, summary: draft.summary, transcription: draft.transcription, originalTranscription: draft.originalTranscription ?? draft.transcription, content: draft.content,
  ...(draft.generationTask ? { generationTask: draft.generationTask, generationInstruction: draft.generationInstruction ?? '' } : {}), ...(draft.workflow ? { workflow: draft.workflow } : {}),
  ...(draft.wordFormat ? { wordFormat: draft.wordFormat } : {}) });
export const reviewFingerprint = (draft: DocumentDraft) => hashText(reviewPayload(draft));
export const sourceFingerprint = (draft: DocumentDraft) => hashText(JSON.stringify({ summary: draft.summary, transcription: draft.transcription,
  ...(draft.generationTask ? { originalTranscription: draft.originalTranscription ?? draft.transcription, generationTask: draft.generationTask } : {}) }));
export const publicFingerprint = (draft: DocumentDraft) => hashText(JSON.stringify({ document: reviewPayload(draft), redactions: validateRedactions(draft.content, draft.publicVersion?.redactions ?? []) }));
export const isApproved = (draft: DocumentDraft) => !!draft.content.trim() && Object.values(draft.audit).every(Boolean) && !!draft.reviewHash && (!draft.workflow || draft.workflow.sections.every(section => section.status === 'accepted'));
export const publicTextForPreview = (draft: DocumentDraft) => publicText(draft.content, draft.publicVersion?.redactions ?? []);

/** Any change to reviewed material invalidates approvals; text edits also invalidate mask offsets. */
export function invalidateReview(draft: DocumentDraft, reason: 'content' | 'sources' | 'metadata' = 'content'): DocumentDraft {
  const { analysisConsent: previousConsent, ...persistent } = draft;
  void previousConsent;
  return { ...persistent, audit: { names: false, congruence: false, pii: false }, reviewHash: null,
    ...(reason === 'content' && draft.wordFormat ? { wordFormat: { ...draft.wordFormat, marks: [] } } : {}),
    ...(reason === 'sources' && draft.workflow ? { workflow: { ...draft.workflow, sections: draft.workflow.sections.map(section => section.matterId === draft.workflow!.activeMatterId ? { ...section, status: 'stale' as const } : section),
      matters: draft.workflow.matters.map(matter => matter.id === draft.workflow!.activeMatterId ? { ...matter, completed: [], receptionClosed: false } : matter) } } : {}),
    phaseStates: Object.fromEntries(draft.completedPhases.map(phase => [phase, reason === 'sources' ? 'stale' : draft.phaseStates?.[phase] === 'stale' ? 'stale' : 'generated'])) as Record<string, PhaseState>,
    publicVersion: { redactions: reason === 'content' ? [] : draft.publicVersion?.redactions ?? [], reviewed: false, reviewHash: null } };
}

/** Server-side verification prevents a stale approval from surviving an edited API payload. */
export async function validateReview(draft: DocumentDraft): Promise<DocumentDraft> {
  if (!Object.values(draft.audit).every(Boolean)) return { ...draft, reviewHash: null,
    phaseStates: Object.fromEntries(draft.completedPhases.map(phase => [phase, draft.phaseStates?.[phase] === 'stale' ? 'stale' : 'generated'])),
    publicVersion: { redactions: draft.publicVersion?.redactions ?? [], reviewed: false, reviewHash: null } };
  if (!isApproved(draft) || draft.reviewHash !== await reviewFingerprint(draft)) return invalidateReview(draft, 'metadata');
  const publicValid = draft.publicVersion?.reviewed && draft.publicVersion.reviewHash === await publicFingerprint(draft);
  return { ...draft, phaseStates: Object.fromEntries(draft.completedPhases.map(phase => [phase, 'reviewed'])),
    publicVersion: { redactions: draft.publicVersion?.redactions ?? [], reviewed: !!publicValid, reviewHash: publicValid ? draft.publicVersion!.reviewHash : null } };
}

/** Return only the approved variant; no automatic anonymization is ever applied to the official text. */
export async function approvedExportText(draft: DocumentDraft, variant: ExportVariant): Promise<string> {
  if (!isApproved(draft) || draft.reviewHash !== await reviewFingerprint(draft)) throw new Error('Revisa y aprueba la instantánea actual del borrador antes de exportar.');
  if (variant === 'official') return draft.content;
  if (!draft.publicVersion?.reviewed || draft.publicVersion.reviewHash !== await publicFingerprint(draft)) throw new Error('Revisa y confirma las ocultaciones de la versión pública antes de exportar.');
  return publicText(draft.content, draft.publicVersion.redactions);
}
