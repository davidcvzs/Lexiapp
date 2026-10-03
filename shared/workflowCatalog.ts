import { resolveTask } from './legalTasks.js';
import type { TaskSelection } from './legalTasks.js';
export interface GuidedStep { id: string; label: string; kind: 'source' | 'generate' | 'research' | 'review'; analysis?: boolean }
const step = (id: string, label: string, kind: GuidedStep['kind'] = 'generate', analysis = false): GuidedStep => ({ id, label, kind, analysis });
/** Navigation labels follow Blueprint v2; drafting reproduces supplied information under current GPT rules. */
export function workflowSteps(selection: TaskSelection): GuidedStep[] {
  resolveTask(selection);
  switch (selection.taskId) {
    case 'SENTENCIA': return [step('source', 'Transcripción lista', 'source'), step('resultando', 'Redactar RESULTANDO'), step('considerandos', 'Redactar CONSIDERANDOS'), step('valoracion', 'Valoración de Pruebas'), step('argumentacion', 'Argumentación Jurídica'), step('research', 'Buscar Tesis / Jurisprudencia', 'research'), step('resolutivos', 'Redactar RESOLUTIVOS'), step('review', 'Revisión final y exportación', 'review')];
    case 'ACTA': return [step('datos', 'Datos generales del juicio'), step('partes', 'Identificar partes presentes'), step('apertura', 'Redactar apertura de audiencia'), step('declaraciones', 'Declaraciones de testigos'), step('alegatos', 'Alegatos de las partes'), step('acuerdos', 'Acuerdos tomados en audiencia'), step('cierre', 'Cierre y firmas'), step('review', 'Revisión final y exportación', 'review')];
    case 'ANALISIS': return selection.formatId === 'summary' ? [step('source', 'Fuente para el resumen', 'source'), step('summary', 'Resumir transcripción', 'generate', true), step('review', 'Revisión final y exportación', 'review')]
      : [step('resolutivos', 'Identificar puntos resolutivos', 'generate', true), step('forma', 'Detectar vicios de forma', 'generate', true), step('fondo', 'Detectar vicios de fondo', 'generate', true), step('agravios', 'Identificar agravios posibles', 'generate', true), step('research', 'Buscar tesis que me favorezcan', 'research'), step('redactar-agravios', 'Redactar agravios', 'generate', true), step('impugnacion', 'Elaborar escrito de impugnación', 'generate', true), step('review', 'Revisión final y exportación', 'review')];
    case 'AMPARO': return selection.formatId === 'provided' ? [step('autoridad', 'Autoridad responsable y acto reclamado'), step('derechos', 'Derechos humanos violados', 'generate', true), step('antecedentes', 'Antecedentes del acto reclamado'), step('conceptos', 'Conceptos de violación', 'generate', true), step('research', 'Buscar tesis SCJN aplicables', 'research'), step('suspension', 'Suspensión del acto reclamado'), step('pruebas', 'Pruebas ofrecidas'), step('petitorios', 'Puntos petitorios'), step('review', 'Revisión final y exportación', 'review')] : [step('source', 'Fuente para suspensión de plano', 'source'), step('suspension', 'Suspensión de plano'), step('review', 'Revisión final y exportación', 'review')];
    case 'DECLARACION': return [step('source', 'Recepción de declaración', 'source'), step('declaracion', 'Redactar declaración'), step('review', 'Revisión final y exportación', 'review')];
    case 'HECHOS_DATOS': return [step('hechos', 'Hechos de la imputación'), step('datos', 'Datos de prueba'), step('review', 'Revisión final y exportación', 'review')];
    case 'REPARACION_PENA': return [step('fiscalia', 'Solicitud de la Fiscalía'), step('defensa', 'Alegatos de la defensa'), step('juez', 'Resolución del juez'), step('review', 'Revisión final y exportación', 'review')];
    default: return [step('document', resolveTask(selection).task.label), step('review', 'Revisión final y exportación', 'review')];
  }
}
/** Add only an explicit section scope, never new legal facts, standards or judicial findings. */
export function stepInstruction(selection: TaskSelection, stepId: string): string {
  const selected = workflowSteps(selection).find(item => item.id === stepId);
  if (!selected) throw new Error('Paso desconocido.');
  if (selected.kind !== 'generate') return '';
  const { task } = resolveTask(selection);
  return [task.instruction || (task.id === 'ANALISIS' ? selection.formatId === 'summary' ? 'Resumir transcripción.' : 'Realiza únicamente el análisis expresamente solicitado sobre la fuente proporcionada.' : ''),
    `Apartado solicitado: ${selected.label}. Devuelve únicamente este apartado, respetando la fuente y las instrucciones del usuario.`,
    task.id === 'SENTENCIA' ? 'Reproduce lo que dictó el juez; no elabores una valoración propia ni agregues fundamentos que no se hayan proporcionado.' : '',
  ].filter(Boolean).join('\n');
}
