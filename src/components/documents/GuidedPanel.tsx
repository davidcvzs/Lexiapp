import { useState, useEffect, useRef } from 'react';
import type { DocumentDraft } from '../../../shared/documents';
import { workflowSteps } from '../../../shared/workflowCatalog';
import { selectWorkflowStep, addMatter, switchMatter, acceptStep, editWorkflowContent } from '../../../shared/workflowEngine';
import { invalidateReview } from '../../../shared/documentIntegrity';
import { safeReferenceUrl, parseLegalReferences } from '../../../shared/workflowValidation';
import { ApiClient } from '../../services/ApiClient';
import { isRecord } from '../../../shared/transcription';
interface Props { draft: DocumentDraft; update: (transform: (draft: DocumentDraft) => DocumentDraft) => void; busy: boolean; generate: (action: 'generate' | 'rewrite' | 'fragment' | 'custom', target?: { sectionId: string; start: number; end: number }) => void; checkpoint: () => Promise<boolean>; api?: ApiClient }
export function GuidedPanel({ draft, update, busy, generate, checkpoint, api: providedApi }: Props) {
  const flow = draft.workflow!, steps = workflowSteps(draft.generationTask!), current = steps.find(step => step.id === flow.currentStepId)!;
  const matter = flow.matters.find(item => item.id === flow.activeMatterId)!;
  const section = flow.sections.find(item => item.matterId === matter.id && item.stepId === current.id);
  const [label, setLabel] = useState(''), [part, setPart] = useState(''), [error, setError] = useState('');
  const [fragment, setFragment] = useState<{ sectionId: string; start: number; end: number }>();
  const [query, setQuery] = useState(''), [results, setResults] = useState<Record<string, unknown>[]>([]), [searching, setSearching] = useState(false);
  const [referenceTitle, setReferenceTitle] = useState(''), [referenceText, setReferenceText] = useState(''), [referenceUrl, setReferenceUrl] = useState('');
  const [api] = useState(() => providedApi ?? new ApiClient());
  const research = useRef<AbortController | null>(null);
  useEffect(() => () => { research.current?.abort(); research.current = null; }, [matter.id, flow.taskId, flow.formatId]);
  const change = (transform: (draft: DocumentDraft) => DocumentDraft) => { try { update(transform); setError(''); } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo actualizar el paso.'); } };
  const patchMatter = (patch: Partial<typeof matter>) => change(previous => invalidateReview({ ...previous, workflow: { ...previous.workflow!, matters: previous.workflow!.matters.map(item => item.id === matter.id ? { ...item, ...patch } : item) } }, 'metadata'));
  const addReference = (title: string, text: string, url: string, source: 'SCJN' | 'USER') => {
    change(previous => {
      const references = parseLegalReferences([...previous.workflow!.references, { id: crypto.randomUUID(), matterId: matter.id, title, text, url: safeReferenceUrl(url), source }]);
      return invalidateReview({ ...previous, workflow: { ...previous.workflow!, references } }, 'metadata');
    });
  };
  const search = async () => {
    if (!query.trim() || searching) return;
    const controller = new AbortController(); research.current = controller;
    setSearching(true); setError('');
    try { const data = await api.request('/api/scjn/search?' + new URLSearchParams({ q: query, page: '1', pageSize: '10' }), { signal: controller.signal });
      if (research.current !== controller || controller.signal.aborted) return;
      if (!isRecord(data) || !Array.isArray(data.data)) throw new Error('Resultados de búsqueda inválidos.');
      setResults(data.data.filter(isRecord));
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'No se pudo buscar.'); }
    finally { if (research.current === controller) { research.current = null; setSearching(false); } }
  };
  const selectResult = async (result: Record<string, unknown>) => {
    const controller = new AbortController(); research.current = controller;
    setSearching(true); setError('');
    try { const detail = await api.request('/api/scjn/tesis/' + encodeURIComponent(String(result.registroDigital)), { signal: controller.signal });
      if (research.current !== controller || controller.signal.aborted) return;
      if (!isRecord(detail) || typeof detail.texto !== 'string' || typeof detail.rubro !== 'string') throw new Error('La referencia no contiene el texto completo.');
      addReference(detail.rubro, detail.texto, typeof detail.officialUrl === 'string' ? detail.officialUrl : '', 'SCJN');
    } catch (failure) { if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'No se pudo añadir la referencia.'); }
    finally { if (research.current === controller) { research.current = null; setSearching(false); } }
  };
  return <section aria-label="Elaboración por pasos" style={{ marginTop: '1rem', padding: '1rem', background: '#EBF3FB', color: '#0f172a' }}>
    <h3>Pasos de {draft.documentType}</h3>
    {error && <p role="alert">{error}</p>}
    <fieldset disabled={busy || searching} style={{ border: 0, padding: 0 }}>
      <label>Asunto o hablante activo <select aria-label="Asunto o hablante activo" value={matter.id} onChange={event => { setFragment(undefined); setPart(''); setResults([]); change(previous => switchMatter(previous, event.target.value)); }}>
        {flow.matters.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
      </select></label>
      {['ACTA', 'DECLARACION'].includes(flow.taskId) && <div><input aria-label="Nombre del nuevo asunto o hablante" maxLength={200} value={label} onChange={event => setLabel(event.target.value)} placeholder={flow.taskId === 'ACTA' ? 'Número o nombre del asunto' : 'Identificador del nuevo hablante'} />
        <button disabled={!label.trim()} onClick={async () => { if (await checkpoint()) { change(previous => addMatter(previous, label)); setLabel(''); setPart(''); setResults([]); setFragment(undefined); } }}>{flow.taskId === 'ACTA' ? 'Añadir asunto al acta' : 'Recibir otro hablante'}</button></div>}
      {flow.taskId === 'DECLARACION' && <div>
        <label>Hablante <input aria-label="Hablante de la declaración" maxLength={200} value={matter.speaker} onChange={event => patchMatter({ speaker: event.target.value, receptionClosed: false })} /></label>
        <textarea aria-label="Parte adicional de la declaración" maxLength={200_000} value={part} onChange={event => setPart(event.target.value)} placeholder="Pega la siguiente parte de este hablante" />
        <button disabled={!part.trim()} onClick={() => { change(previous => invalidateReview({ ...previous, transcription: previous.transcription + '\n\n' + part, originalTranscription: (previous.originalTranscription ?? '') + '\n\n' + part }, 'sources')); setPart(''); }}>Añadir parte de la declaración</button>
        <label><input type="checkbox" aria-label="Terminó la recepción de este hablante" checked={matter.receptionClosed} onChange={event => patchMatter({ receptionClosed: event.target.checked })} />Terminé de aportar la declaración de este hablante</label>
      </div>}
      <nav aria-label="Pasos de la tarea" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', margin: '0.75rem 0' }}>
        {steps.map((step, index) => <button key={step.id} aria-current={step.id === current.id ? 'step' : undefined}
          style={{ textAlign: 'left', background: step.id === current.id ? '#C9A227' : matter.completed.includes(step.id) ? '#ECFDF5' : '#fff' }}
          onClick={() => { setFragment(undefined); change(previous => selectWorkflowStep(previous, step.id)); }}>{matter.completed.includes(step.id) ? '✓' : step.id === current.id ? '▶' : '○'} {index + 1}. {step.label}</button>)}
      </nav>
      {flow.taskId === 'SENTENCIA' && <p>Estos pasos reproducen la resolución dictada. Para una valoración propia, solicita análisis y confirma su alcance.</p>}
      <label><input type="checkbox" aria-label="Mi instrucción solicita análisis o resumen" checked={flow.requestAnalysis} onChange={event => change(previous => invalidateReview({ ...previous, workflow: { ...previous.workflow!, requestAnalysis: event.target.checked } }, 'metadata'))} />Mi instrucción solicita análisis o resumen</label>
      {current.kind === 'generate' && <div><button onClick={() => generate('generate')}>Generar apartado</button>{section && <button onClick={() => generate('rewrite')}>Rehacer este paso</button>}</div>}
      {draft.generationInstruction?.trim() && <button onClick={() => generate('custom')}>Aplicar instrucción propia al paso</button>}
      {section && <div>
        <label>Apartado actual <textarea aria-label="Texto del apartado actual" value={draft.content.slice(section.start, section.end)} onSelect={event => { const input = event.currentTarget; setFragment(input.selectionEnd > input.selectionStart ? { sectionId: section.id, start: input.selectionStart, end: input.selectionEnd } : undefined); }}
          onChange={event => { const value = event.target.value; setFragment(undefined); change(previous => editWorkflowContent(previous, previous.content.slice(0, section.start) + value + previous.content.slice(section.end))); }} /></label>
        <button disabled={!fragment || fragment.sectionId !== section.id} onClick={() => generate('fragment', fragment)}>Corregir fragmento seleccionado</button>
        <p>{section.status === 'accepted' ? 'Apartado aceptado' : section.status === 'stale' ? 'Fuentes cambiadas: revisa este apartado' : 'Apartado pendiente de aceptación'}</p>
      </div>}
      {current.kind !== 'review' && <button onClick={async () => { if (await checkpoint()) change(previous => acceptStep(previous)); }}>Aceptar y continuar</button>}
      {current.kind === 'review' && <p>Revisa los apartados y completa el Visto Bueno antes de exportar. Puedes volver a cada paso para corregirlo.</p>}
      {flow.sections.filter(item => item.stepId === 'legacy' && item.matterId === matter.id && item.status !== 'accepted').map(item => <button key={item.id} onClick={() => change(previous => invalidateReview({ ...previous, workflow: { ...previous.workflow!, sections: previous.workflow!.sections.map(section => section.id === item.id ? { ...section, status: 'accepted' } : section) } }, 'metadata'))}>Aceptar borrador anterior</button>)}
      <details><summary>Investigación y referencias seleccionadas</summary>
        <p>Buscar no modifica el documento. Solo las referencias que añadas entran al contexto.</p>
        <input aria-label="Tema de búsqueda SCJN en el editor" value={query} onChange={event => setQuery(event.target.value)} />
        <button onClick={() => void search()}>Buscar SCJN</button>
        {results.map((result, index) => <article key={index}><p>{String(result.rubro ?? '')}</p><button onClick={() => void selectResult(result)}>Añadir referencia {String(result.registroDigital ?? index + 1)}</button></article>)}
        <p><a href="https://www.pjenl.gob.mx/SentenciasPublicas/" target="_blank" rel="noopener noreferrer">Consultar PJENL</a> · <a href="https://www.dof.gob.mx/" target="_blank" rel="noopener noreferrer">Consultar DOF</a></p>
        <input aria-label="Título de referencia jurídica" value={referenceTitle} maxLength={500} onChange={event => setReferenceTitle(event.target.value)} placeholder="Título de una referencia revisada" />
        <input aria-label="Enlace de referencia jurídica" value={referenceUrl} maxLength={2000} onChange={event => setReferenceUrl(event.target.value)} placeholder="Enlace HTTPS (opcional)" />
        <textarea aria-label="Texto de referencia jurídica" value={referenceText} maxLength={100_000} onChange={event => setReferenceText(event.target.value)} />
        <button disabled={!referenceTitle.trim() || !referenceText.trim()} onClick={() => addReference(referenceTitle, referenceText, referenceUrl, 'USER')}>Añadir referencia revisada</button>
        {flow.references.filter(ref => ref.matterId === matter.id).map(ref => <article key={ref.id}>{ref.title} <button onClick={() => change(previous => invalidateReview({ ...previous, workflow: { ...previous.workflow!, references: previous.workflow!.references.filter(item => item.id !== ref.id) } }, 'metadata'))}>Quitar referencia {ref.title}</button></article>)}
      </details>
    </fieldset>
  </section>;
}
