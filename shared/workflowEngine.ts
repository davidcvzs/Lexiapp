import type { DocumentDraft } from './documents.js';
import type { GuidedContext, GuidedWorkflow, GuidedSection } from './workflowTypes.js';
import { workflowSteps, stepInstruction } from './workflowCatalog.js';
import { invalidateReview } from './documentIntegrity.js';
import { parseGenerationRequest } from './generation.js';
import type { TaskGenerationRequest, TaskGenerationResult } from './generation.js';
const activeSource = (draft: DocumentDraft) => ({ original: draft.originalTranscription ?? draft.transcription, working: draft.transcription, contrast: draft.summary });
const id = () => crypto.randomUUID();
/** Legacy text receives an explicit first-matter section; no source or case assignment is inferred. */
export function startWorkflow(draft: DocumentDraft): DocumentDraft {
  if (!draft.generationTask) throw new Error('Selecciona una tarea y formato.');
  const steps = workflowSteps(draft.generationTask), matterId = id();
  const workflow: GuidedWorkflow = { version: 1, ...draft.generationTask, currentStepId: steps[0].id, activeMatterId: matterId, mode: 'individual',
    matters: [{ id: matterId, label: draft.caseNumber || 'Asunto 1', completed: [], speaker: '', receptionClosed: false }],
    sections: draft.content ? [{ id: id(), stepId: 'legacy', matterId, title: 'Borrador anterior', start: 0, end: draft.content.length, status: 'draft', instruction: '' }] : [],
    references: [], userTemplate: '', requestAnalysis: false };
  return invalidateReview({ ...draft, workflow, generationInstruction: stepInstruction(draft.generationTask, steps[0].id) }, 'metadata');
}
export function selectWorkflowStep(draft: DocumentDraft, stepId: string): DocumentDraft {
  if (!draft.workflow || !draft.generationTask || !workflowSteps(draft.generationTask).some(step => step.id === stepId)) throw new Error('Paso desconocido.');
  return invalidateReview({ ...draft, workflow: { ...draft.workflow, currentStepId: stepId, requestAnalysis: false }, generationInstruction: stepInstruction(draft.generationTask, stepId) }, 'metadata');
}
export function switchMatter(draft: DocumentDraft, matterId: string): DocumentDraft {
  const flow = draft.workflow, next = flow?.matters.find(item => item.id === matterId);
  if (!flow || !next) throw new Error('Asunto desconocido.');
  if (matterId === flow.activeMatterId) return draft;
  const sources = next.source!;
  return invalidateReview({ ...draft, transcription: sources.working, originalTranscription: sources.original, summary: sources.contrast,
    workflow: { ...flow, activeMatterId: matterId, matters: flow.matters.map(item => item.id === flow.activeMatterId ? { ...item, source: activeSource(draft) } : item.id === matterId ? { ...item, source: undefined } : item) } }, 'metadata');
}
export function addMatter(draft: DocumentDraft, label: string): DocumentDraft {
  if (!draft.workflow || !draft.generationTask || !['ACTA', 'DECLARACION'].includes(draft.generationTask.taskId) || !label.trim() || label.length > 200 || draft.workflow.matters.length >= 20) throw new Error('Indica un asunto o hablante válido.');
  const matterId = id(), old = draft.workflow;
  return invalidateReview({ ...draft, transcription: '', originalTranscription: '', summary: '', workflow: { ...old, mode: 'combo', activeMatterId: matterId,
    currentStepId: workflowSteps(draft.generationTask)[0].id,
    matters: [...old.matters.map(item => item.id === old.activeMatterId ? { ...item, source: activeSource(draft) } : item), { id: matterId, label, completed: [], speaker: draft.generationTask.taskId === 'DECLARACION' ? label : '', receptionClosed: false }] },
    generationInstruction: stepInstruction(draft.generationTask, workflowSteps(draft.generationTask)[0].id) }, 'metadata');
}
/** Only accepted steps advance; source intake never guesses whether a speaker has finished. */
export function acceptStep(draft: DocumentDraft): DocumentDraft {
  const flow = draft.workflow; if (!flow || !draft.generationTask) throw new Error('Inicia los pasos guiados.');
  const steps = workflowSteps(draft.generationTask), index = steps.findIndex(item => item.id === flow.currentStepId), step = steps[index];
  const matter = flow.matters.find(item => item.id === flow.activeMatterId)!;
  const section = flow.sections.find(item => item.stepId === step.id && item.matterId === matter.id);
  if (step.kind === 'generate' && !section) throw new Error('Genera o escribe el apartado antes de aceptarlo.');
  if (step.kind === 'source' && (!draft.transcription.trim() || !(draft.originalTranscription ?? '').trim())) throw new Error('Conserva la fuente original antes de continuar.');
  if (draft.generationTask.taskId === 'DECLARACION' && (!matter.speaker.trim() || !matter.receptionClosed)) throw new Error('Identifica al hablante y confirma el fin de su declaración.');
  const nextStep = steps[Math.min(index + 1, steps.length - 1)];
  return invalidateReview({ ...draft, workflow: { ...flow, currentStepId: nextStep.id,
    sections: flow.sections.map(item => item.id === section?.id ? { ...item, status: 'accepted' } : item),
    matters: flow.matters.map(item => item.id === matter.id ? { ...item, completed: [...new Set([...item.completed, step.id])] } : item) },
    generationInstruction: stepInstruction(draft.generationTask, nextStep.id) }, 'metadata');
}
export function workflowRequest(draft: DocumentDraft, action: GuidedContext['action'] = 'generate', fragment?: { sectionId: string; start: number; end: number }): TaskGenerationRequest {
  const flow = draft.workflow; if (!flow || !draft.generationTask) throw new Error('Falta el flujo guiado.');
  const matter = flow.matters.find(item => item.id === flow.activeMatterId)!;
  const sections = flow.sections.filter(item => item.matterId === matter.id).sort((a, b) => a.start - b.start).map(item => ({ id: item.id, title: item.title, content: draft.content.slice(item.start, item.end), status: item.status }));
  const selected = flow.sections.find(item => item.matterId === matter.id && item.stepId === flow.currentStepId);
  const targetRange = fragment ?? (action === 'rewrite' && selected ? { sectionId: selected.id, start: 0, end: selected.end - selected.start } : undefined);
  const target = targetRange ? { ...targetRange, text: sections.find(item => item.id === targetRange.sectionId)?.content.slice(targetRange.start, targetRange.end) ?? '' } : undefined;
  const context: GuidedContext = { stepId: flow.currentStepId, action, matter: { id: matter.id, label: matter.label, mode: flow.mode, speaker: matter.speaker, receptionClosed: matter.receptionClosed },
    sections, references: flow.references.filter(item => item.matterId === matter.id), userTemplate: flow.userTemplate, requestAnalysis: flow.requestAnalysis, ...(target ? { target } : {}) };
  return parseGenerationRequest({ contractVersion: 1, ...draft.generationTask, instruction: draft.generationInstruction ?? '', source: activeSource(draft),
    draft: sections.map(item => item.content).join('\n\n'), history: (draft.generationLog ?? []).filter(item => item.matterId === matter.id).map(item => item.instruction), context, analysisConsent: draft.analysisConsent });
}
/** Apply a validated result to one range, shifting later ranges without changing their characters. */
export function applyWorkflowResult(draft: DocumentDraft, request: TaskGenerationRequest, response: TaskGenerationResult): DocumentDraft {
  const flow = draft.workflow, context = request.context;
  if (!flow || !context || !draft.generationTask || context.matter.id !== flow.activeMatterId || context.stepId !== flow.currentStepId || request.taskId !== flow.taskId || request.formatId !== flow.formatId) throw new Error('El asunto o paso cambió durante la solicitud.');
  const current = flow.sections.find(item => item.matterId === flow.activeMatterId && item.stepId === flow.currentStepId);
  const target = context.target ? flow.sections.find(item => item.id === context.target!.sectionId) : current;
  if (context.target && (!target || target.matterId !== flow.activeMatterId || draft.content.slice(target.start + context.target.start, target.start + context.target.end) !== context.target.text)) throw new Error('El fragmento cambió durante la solicitud.');
  const start = target ? target.start + (context.target?.start ?? 0) : draft.content.length;
  const end = target ? target.start + (context.target?.end ?? target.end - target.start) : start;
  const prefix = target || !draft.content ? '' : '\n\n';
  const replacement = prefix + response.result, delta = replacement.length - (end - start);
  const content = draft.content.slice(0, start) + replacement + draft.content.slice(end);
  if (content.length > 500_000) throw new Error('El borrador supera el límite de texto. Divide el documento.');
  const changedId = target?.id ?? id();
  const sections: GuidedSection[] = flow.sections.map(item => item.id === target?.id ? { ...item, end: item.end + delta, status: 'draft', instruction: request.instruction, provenance: response.provenance }
    : item.start >= end ? { ...item, start: item.start + delta, end: item.end + delta } : item);
  if (!target) sections.push({ id: changedId, stepId: flow.currentStepId, matterId: flow.activeMatterId, title: workflowSteps(draft.generationTask).find(item => item.id === flow.currentStepId)!.label,
    start: start + prefix.length, end: start + replacement.length, status: 'draft', instruction: request.instruction, provenance: response.provenance });
  return invalidateReview({ ...draft, content, workflow: { ...flow, sections, matters: flow.matters.map(item => item.id === flow.activeMatterId ? { ...item, completed: item.completed.filter(key => key !== target?.stepId) } : item) } }, 'content');
}
/** Edit one section while preserving every other section and matter's state. */
export function editWorkflowContent(draft: DocumentDraft, content: string): DocumentDraft {
  if (!draft.workflow || content === draft.content) return { ...draft, content };
  let start = 0; while (start < Math.min(content.length, draft.content.length) && content[start] === draft.content[start]) start++;
  let oldEnd = draft.content.length, newEnd = content.length;
  while (oldEnd > start && newEnd > start && draft.content[oldEnd - 1] === content[newEnd - 1]) { oldEnd--; newEnd--; }
  const target = draft.workflow.sections.find(item => start >= item.start && oldEnd <= item.end);
  if (!target) throw new Error('Edita un apartado a la vez para conservar sus datos y los de los demás asuntos.');
  const delta = content.length - draft.content.length;
  return invalidateReview({ ...draft, content, workflow: { ...draft.workflow,
    sections: draft.workflow.sections.map(item => item.id === target.id ? { ...item, end: item.end + delta, status: 'draft' } : item.start >= oldEnd ? { ...item, start: item.start + delta, end: item.end + delta } : item),
    matters: draft.workflow.matters.map(item => item.id === target.matterId ? { ...item, completed: item.completed.filter(key => key !== target.stepId) } : item) } }, 'content');
}
