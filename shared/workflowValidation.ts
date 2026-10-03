import { isRecord } from './transcription.js';
import { workflowSteps } from './workflowCatalog.js';
import { resolveTask } from './legalTasks.js';
import { parseProvenance } from './generation.js';
import type { TaskSelection } from './legalTasks.js';
import type { GuidedWorkflow, GuidedContext, LegalReference, MatterSource } from './workflowTypes.js';
export const workflowText = (value: unknown, limit: number): string => {
  if (typeof value !== 'string' || value.length > limit) throw new Error('Texto del flujo inválido.');
  return value;
};
const identifier = (value: unknown) => {
  const id = workflowText(value, 100); if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('Identificador del flujo inválido.'); return id;
};
const list = (value: unknown, limit: number): unknown[] => { if (!Array.isArray(value) || value.length > limit) throw new Error('Lista del flujo inválida.'); return value; };
export const safeReferenceUrl = (value: unknown) => {
  const url = workflowText(value, 2000); if (!url) return '';
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error(); return url; }
  catch { throw new Error('El enlace debe ser HTTPS y no incluir credenciales.'); }
};
export function parseLegalReferences(value: unknown): LegalReference[] {
  const ids = new Set<string>();
  return list(value, 30).map(item => {
    if (!isRecord(item)) throw new Error('Referencia jurídica inválida.');
    const id = identifier(item.id); if (ids.has(id)) throw new Error('Referencia repetida.'); ids.add(id);
    if (!['SCJN', 'PJENL', 'DOF', 'USER'].includes(String(item.source))) throw new Error('Origen de referencia inválido.');
    const title = workflowText(item.title, 500), text = workflowText(item.text, 100_000);
    if (!title.trim() || !text.trim()) throw new Error('La referencia requiere título y texto.');
    return { id, matterId: identifier(item.matterId), title, text, url: safeReferenceUrl(item.url), source: item.source as LegalReference['source'] };
  });
}
const source = (value: unknown): MatterSource => {
  if (!isRecord(value)) throw new Error('Fuente del asunto inválida.');
  return { original: workflowText(value.original, 500_000), working: workflowText(value.working, 500_000), contrast: workflowText(value.contrast, 200_000) };
};
/** Validate persistent ranges and matter ownership without interpreting any legal text. */
export function parseWorkflow(value: unknown, content: string, selection?: TaskSelection): GuidedWorkflow {
  if (!isRecord(value) || value.version !== 1 || !selection || value.taskId !== selection.taskId || value.formatId !== selection.formatId) throw new Error('Flujo de tarea inválido.');
  const steps = workflowSteps(selection), stepIds = steps.map(item => item.id);
  const currentStepId = identifier(value.currentStepId), activeMatterId = identifier(value.activeMatterId);
  if (!stepIds.includes(currentStepId) || !['individual', 'combo'].includes(String(value.mode)) || typeof value.requestAnalysis !== 'boolean') throw new Error('Estado del flujo inválido.');
  const matters = list(value.matters, 20).map(item => {
    if (!isRecord(item) || typeof item.receptionClosed !== 'boolean') throw new Error('Asunto inválido.');
    const id = identifier(item.id), label = workflowText(item.label, 200), speaker = workflowText(item.speaker, 200);
    const completed = list(item.completed, 30).map(identifier);
    if (!label.trim() || completed.some(key => !stepIds.includes(key)) || new Set(completed).size !== completed.length) throw new Error('Pasos del asunto inválidos.');
    if (id === activeMatterId && item.source !== undefined) throw new Error('La fuente activa debe conservarse en los campos originales.');
    if (id !== activeMatterId && item.source === undefined) throw new Error('Falta fuente del asunto inactivo.');
    return { id, label, completed, speaker, receptionClosed: item.receptionClosed, ...(item.source === undefined ? {} : { source: source(item.source) }) };
  });
  const matterIds = matters.map(item => item.id);
  if (!matterIds.includes(activeMatterId) || new Set(matterIds).size !== matters.length || !matters.length || (value.mode === 'individual' && matters.length !== 1) || (value.mode === 'combo' && !['ACTA', 'DECLARACION'].includes(selection.taskId))) throw new Error('Asuntos del flujo inválidos.');
  const sections = list(value.sections, 100).map(item => {
    if (!isRecord(item) || !Number.isSafeInteger(item.start) || !Number.isSafeInteger(item.end) || (item.start as number) < 0 || (item.end as number) <= (item.start as number) || (item.end as number) > content.length || !['draft', 'accepted', 'stale'].includes(String(item.status))) throw new Error('Rangos de apartado inválidos.');
    const stepId = identifier(item.stepId), matterId = identifier(item.matterId);
    if ((!stepIds.includes(stepId) && stepId !== 'legacy') || !matterIds.includes(matterId)) throw new Error('Apartado de otro asunto o tarea.');
    const provenance = item.provenance === undefined ? undefined : parseProvenance(item.provenance);
    if (provenance && (provenance.taskId !== selection.taskId || provenance.formatId !== selection.formatId)) throw new Error('Procedencia de otra tarea o formato.');
    return { id: identifier(item.id), stepId, matterId, title: workflowText(item.title, 200), start: item.start as number, end: item.end as number,
      status: item.status as 'draft' | 'accepted' | 'stale', instruction: workflowText(item.instruction, 4000), ...(provenance ? { provenance } : {}) };
  });
  const ordered = [...sections].sort((a, b) => a.start - b.start);
  if (new Set(sections.map(item => item.id)).size !== sections.length || new Set(sections.map(item => `${item.matterId}:${item.stepId}`)).size !== sections.length || ordered.some((item, i) => i > 0 && item.start < ordered[i - 1].end)) throw new Error('Apartados superpuestos o duplicados.');
  const references = parseLegalReferences(value.references);
  if (references.some(ref => !matterIds.includes(ref.matterId))) throw new Error('Referencia de otro asunto.');
  return { version: 1, ...selection, currentStepId, activeMatterId, mode: value.mode as GuidedWorkflow['mode'], matters, sections, references,
    userTemplate: workflowText(value.userTemplate, 200_000), requestAnalysis: value.requestAnalysis };
}
/** Validate only the active matter's context; inactive sources never enter a provider request. */
export function parseGuidedContext(value: unknown, selection: TaskSelection, draft: string): GuidedContext {
  if (!isRecord(value) || !isRecord(value.matter) || !['generate', 'rewrite', 'fragment', 'custom'].includes(String(value.action)) || typeof value.requestAnalysis !== 'boolean') throw new Error('Contexto del paso inválido.');
  const stepId = identifier(value.stepId), selected = workflowSteps(selection).find(item => item.id === stepId);
  if (!selected || (selected.kind !== 'generate' && value.action !== 'custom')) throw new Error('Este paso no permite generación.');
  const matter = { id: identifier(value.matter.id), label: workflowText(value.matter.label, 200), mode: value.matter.mode as 'individual' | 'combo', speaker: workflowText(value.matter.speaker, 200), receptionClosed: value.matter.receptionClosed as boolean };
  if (!['individual', 'combo'].includes(matter.mode) || typeof matter.receptionClosed !== 'boolean' || (matter.mode === 'combo' && !['ACTA', 'DECLARACION'].includes(selection.taskId))) throw new Error('Asunto de generación inválido.');
  if (selection.taskId === 'DECLARACION' && (!matter.speaker.trim() || !matter.receptionClosed)) throw new Error('Identifica al hablante y confirma que terminó la recepción de su declaración.');
  const sections = list(value.sections, 100).map(item => {
    if (!isRecord(item) || !['draft', 'accepted', 'stale'].includes(String(item.status))) throw new Error('Apartados del contexto inválidos.');
    return { id: identifier(item.id), title: workflowText(item.title, 200), content: workflowText(item.content, 500_000), status: item.status as 'draft' | 'accepted' | 'stale' };
  });
  if (new Set(sections.map(item => item.id)).size !== sections.length || sections.map(item => item.content).join('\n\n') !== draft) throw new Error('El borrador no coincide con sus apartados.');
  const references = parseLegalReferences(value.references);
  if (references.some(ref => ref.matterId !== matter.id)) throw new Error('El contexto contiene referencias de otro asunto.');
  const userTemplate = workflowText(value.userTemplate, 200_000);
  if (selection.taskId === 'AMPARO' && selection.formatId === 'provided' && !userTemplate.trim()) throw new Error('Aporta un formato para la demanda de amparo.');
  let target: GuidedContext['target'];
  if (value.target !== undefined) {
    if (!isRecord(value.target)) throw new Error('Destino inválido.');
    const sectionId = identifier(value.target.sectionId), section = sections.find(item => item.id === sectionId);
    const { start, end } = value.target;
    if (!section || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || (start as number) < 0 || (end as number) <= (start as number) || (end as number) > section.content.length || value.target.text !== section.content.slice(start as number, end as number)) throw new Error('El fragmento no coincide con el apartado.');
    target = { sectionId, start: start as number, end: end as number, text: value.target.text as string };
  }
  if (['rewrite', 'fragment'].includes(String(value.action)) && !target) throw new Error('Falta el apartado o fragmento a corregir.');
  return { stepId, action: value.action as GuidedContext['action'], matter, sections, references, userTemplate, requestAnalysis: value.requestAnalysis, ...(target ? { target } : {}) };
}
export function contextRequiresAnalysis(selection: TaskSelection, context?: GuidedContext): boolean {
  return resolveTask(selection).task.requiresAnalysis || !!context?.requestAnalysis || !!(context && workflowSteps(selection).find(step => step.id === context.stepId)?.analysis);
}
