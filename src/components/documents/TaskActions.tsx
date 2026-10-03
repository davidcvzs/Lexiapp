import { useState } from 'react';
import { LEGAL_TASKS } from '../../../shared/legalTasks';
export interface TaskIntent { taskId: string; formatId: string; instruction?: string }
/** Explicit task choices after transcription; navigating never calls the generation provider. */
export function TaskActions({ choose }: { choose: (intent: TaskIntent) => void }) {
  const [instruction, setInstruction] = useState('');
  const [taskId, setTaskId] = useState('');
  const actions = [['DECLARACION', 'Extraer declaraciones'], ['ALEGATOS', 'Extraer alegatos'], ['ACTA', 'Iniciar Acta'], ['SENTENCIA', 'Iniciar Sentencia'], ['ACUERDO', 'Iniciar Acuerdo'], ['OFICIO', 'Iniciar Oficio'], ['AMPARO', 'Iniciar Amparo'], ['ANALISIS', 'Analizar Sentencia'], ['HECHOS_DATOS', 'Hechos y datos'], ['REPARACION_PENA', 'Reparación y pena']];
  return <section aria-label="Tareas posteriores a la transcripción" style={{ marginTop: '1rem', padding: '1rem', background: '#EBF3FB' }}>
    <h2>¿Qué deseas elaborar?</h2>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>{actions.map(([id, label]) => <button key={id} onClick={() => choose({ taskId: id, formatId: LEGAL_TASKS.find(item => item.id === id)!.formats[0].id })}>{label}</button>)}</div>
    <button onClick={() => choose({ taskId: 'ANALISIS', formatId: 'summary' })}>Resumir transcripción</button>
    <label>Tarea para instrucción propia <select aria-label="Tarea para instrucción propia" value={taskId} onChange={event => setTaskId(event.target.value)}>
      <option value="">Selecciona una tarea</option>{LEGAL_TASKS.map(task => <option key={task.id} value={task.id}>{task.label}</option>)}
    </select></label>
    <textarea aria-label="Instrucción propia después de transcribir" maxLength={4000} value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="Indica qué deseas elaborar o corregir" />
    <button disabled={!taskId || !instruction.trim()} onClick={() => choose({ taskId, formatId: LEGAL_TASKS.find(task => task.id === taskId)!.formats[0].id, instruction })}>Continuar con instrucción propia</button>
  </section>;
}
