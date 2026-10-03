/** Task and format identifiers are public metadata; file paths are resolved only by the server. */
export const LEGAL_REFERENCES = {
  transcription: { file: '647-2.docx', label: 'Transcripción de audiencia' },
  declaration: { file: 'DINAMICA DE TRABAJO GPT.docx', label: 'Dinámica de declaraciones' },
  facts: { file: '1095-26-HECHOS Y DATOS.docx', label: 'Hechos y datos de prueba' },
  control: { file: 'ACTA CINTROL DE AUDIENCIA 11816-25 -  - copia.docx', label: 'Acta de audiencia' },
  extraction: { file: 'Acta extracción.doc', label: 'Acta de extracción de fluidos' },
  agreement: { file: 'ACUERDO-FECHAS-VARIOS 1.docx', label: 'Acuerdos' },
  medical: { file: 'ATENCION MEDICA.docx', label: 'Atención médica' },
  admission: { file: 'BOLETA 5531-24.docx', label: 'Acuerdo de recepción de boleta' },
  searchWarrant: { file: 'FORMATO CATEO NARCO - copia.docx', label: 'Formato de cateo' },
  disappearance: { file: 'Cateo Desaparición.doc', label: 'Cateo por desaparición' },
  searchHearing: { file: 'ACTA CATEO AUD.doc', label: 'Audiencia de cateo' },
  arrest: { file: 'RESOLUCIONES ORDENES DE APREHENSION.doc', label: 'Orden de aprehensión' },
  linkedArrest: { file: 'O.A POR ESCRITO YA VINCULADO.doc', label: 'Orden por escrito ya vinculado' },
  transfer: { file: 'OF TRASLADOS.doc', label: 'Oficio de traslado' },
  suspension: { file: 'SUSPENSION DE PLANO 1.docx', label: 'Suspensión de plano' },
  locations: { file: 'SEDES PALACIOS DE JUSTICIA.docx', label: 'Sedes judiciales' },
  directory: { file: 'DIRECTORIO REQUERIMIENTOS ACTALIZADO 25-02-26.xlsx', label: 'Directorio de requerimientos' },
} as const;
export type ReferenceId = keyof typeof LEGAL_REFERENCES;
export interface TaskFormat { id: string; label: string; references: readonly ReferenceId[] }
export interface LegalTask { id: string; label: string; instruction: string; requiresSource: boolean; requiresAnalysis: boolean; formats: readonly TaskFormat[] }
const format = (id: string, label: string, ...references: ReferenceId[]): TaskFormat => ({ id, label, references });
const supplied = [format('source', 'Según la fuente y las instrucciones del usuario')];
/** Instructions come from the supplied GPT starters and Blueprint; examples never supply case facts. */
export const LEGAL_TASKS: readonly LegalTask[] = [
  { id: 'DECLARACION', label: 'Declaración', instruction: 'Sigue la dinamica de trabajo precargada para elaborar declaraciones', requiresSource: true, requiresAnalysis: false, formats: [format('default', 'Dinámica del GPT', 'declaration')] },
  { id: 'TRANSCRIPCION', label: 'Transcripción literal', instruction: 'Conservar marca de tiempo, identificador del hablante y texto íntegro de cada intervención, en orden cronológico y con separación visual entre intervenciones. No generar resumen inicial salvo petición expresa.', requiresSource: true, requiresAnalysis: false, formats: [format('default', 'Transcripción de 647-2', 'transcription')] },
  { id: 'ALEGATOS', label: 'Alegatos', instruction: 'Elabora los alegatos que te pasaré de la transcripción. Narrándolos en tercera persona señalando qué alegan las partes, con correcta ortografía y sintaxis, sin inventar ni añadir cosas que no vengan en la transcripción.', requiresSource: true, requiresAnalysis: false, formats: supplied },
  { id: 'HECHOS_DATOS', label: 'Hechos y datos de prueba', instruction: 'Conforme a los formatos que tienes precargados, con la transcripción que te pasaré, extrae los hechos de la imputación en un solo párrafo corregidos en ortografía. Y los datos de prueba, de la misma manera, pero por párrafos separados.', requiresSource: true, requiresAnalysis: false, formats: [format('default', 'Hechos y datos', 'facts')] },
  { id: 'SENTENCIA', label: 'Resolución dictada por el juez', instruction: 'Con base en la transcripción, elabora la sentencia dictada por el Juez en audiencia, corrige errores ortográficos, dale sintaxis, no inventes ni agregues cosas, cíñete a la transcripción y nárrala como si tú fueras el juez que está resolviendo.', requiresSource: true, requiresAnalysis: false, formats: supplied },
  { id: 'REPARACION_PENA', label: 'Reparación del daño y pena', instruction: 'Elabora el apartado de reparación del daño e individualización de la pena. Estableciendo primero qué solicita el Fiscal, qué alega la defensa y lo que resuelve el Juez.', requiresSource: true, requiresAnalysis: false, formats: supplied },
  { id: 'ACTA', label: 'Acta de audiencia', instruction: 'Con base en la transcripción, elabora esta acta de audiencia, conforme al formato seleccionado, debiendo distinguir si se trata de una audiencia individual o en combo, efectuando los ajustes respectivos a cada acta.', requiresSource: true, requiresAnalysis: false, formats: [format('control', 'Acta de audiencia', 'control'), format('extraction', 'Extracción de fluidos', 'extraction'), format('search', 'Audiencia de cateo', 'searchHearing')] },
  { id: 'ACUERDO', label: 'Acuerdo', instruction: 'Redacta el acuerdo conforme al formato seleccionado y las instrucciones del usuario, preservando la información proporcionada.', requiresSource: true, requiresAnalysis: false, formats: [format('general', 'Acuerdos y fechas', 'agreement'), format('medical', 'Atención médica', 'medical'), format('admission', 'Recepción de boleta de internamiento', 'admission')] },
  { id: 'OFICIO', label: 'Oficio', instruction: 'Redacta el oficio conforme al formato seleccionado y las instrucciones del usuario, preservando la información proporcionada.', requiresSource: true, requiresAnalysis: false, formats: [format('transfer', 'Traslado', 'transfer')] },
  { id: 'CATEO', label: 'Resolución de cateo', instruction: 'Conforme a los documentos que tienes precargados, elabora la resolución de cateo. No agregues información ni mezcles información; cíñete a mis indicaciones y lo que te pasaré para elaborarla.', requiresSource: true, requiresAnalysis: false, formats: [format('general', 'Formato de cateo', 'searchWarrant'), format('disappearance', 'Desaparición', 'disappearance')] },
  { id: 'ORDEN_APREHENSION', label: 'Orden de aprehensión', instruction: 'Conforme a los documentos que tienes precargados, elabora la resolución de orden de aprehensión. No agregues información ni mezcles información; cíñete a mis indicaciones y lo que te pasaré para elaborarla.', requiresSource: true, requiresAnalysis: false, formats: [format('general', 'Resoluciones', 'arrest'), format('linked', 'Por escrito ya vinculado', 'linkedArrest')] },
  { id: 'AMPARO', label: 'Amparo', instruction: 'Redacta el documento de amparo conforme al formato seleccionado y las instrucciones del usuario, preservando la información proporcionada.', requiresSource: true, requiresAnalysis: false, formats: [format('suspension', 'Suspensión de plano', 'suspension'), format('provided', 'Demanda con formato aportado por el usuario')] },
  { id: 'SEDES', label: 'Sedes judiciales', instruction: 'Dame las sedes de los palacios de justicia de Nuevo León', requiresSource: false, requiresAnalysis: false, formats: [format('default', 'Sedes de Nuevo León', 'locations')] },
  { id: 'DIRECTORIO', label: 'Directorio de requerimientos', instruction: '', requiresSource: false, requiresAnalysis: false, formats: [format('default', 'Directorio Excel', 'directory')] },
  { id: 'ANALISIS', label: 'Análisis solicitado', instruction: '', requiresSource: true, requiresAnalysis: true, formats: [...supplied, format('summary', 'Resumen confirmado de la transcripción')] },
];
export interface TaskSelection { taskId: string; formatId: string }
export interface AnalysisConsent { fingerprint: string; confirmedAt: string }
export interface ReferenceHash { id: ReferenceId; sha256: string }
export interface GenerationProvenance extends TaskSelection { rulesVersion: string; rulesHash: string; references: ReferenceHash[] }
export const validHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function resolveTask(selection: TaskSelection): { task: LegalTask; format: TaskFormat } {
  const task = LEGAL_TASKS.find(item => item.id === selection.taskId);
  const selected = task?.formats.find(item => item.id === selection.formatId);
  if (!task || !selected) throw new Error('Selecciona una tarea jurídica y un formato válidos.');
  return { task, format: selected };
}
