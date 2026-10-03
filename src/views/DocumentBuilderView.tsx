import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { 
  Gavel, 
  Download, 
  ShieldCheck, 
  FileText,
  Wand2,
  History,
  Settings,
  Mic,
  Copy,
  PanelLeft,
  LayoutTemplate,
  CheckSquare,
} from 'lucide-react';
import { WordExportService } from '../services/WordExportService';
import { AIAssistantService } from '../services/AIAssistantService';
import { useTranscription } from '../hooks/useTranscription';
import type { TranscriptionService } from '../services/TranscriptionService';
import { MEDIA_ACCEPT, DIRECT_MEDIA_ACCEPT } from '../../shared/transcription';
import { useDocumentDraft } from '../hooks/useDocumentDraft';
import type { DatabaseService } from '../services/DatabaseService';
import type { DocumentDraft } from '../../shared/documents';
import { invalidateReview, isApproved, publicTextForPreview, reviewFingerprint, reviewPayload, sourceFingerprint } from '../../shared/documentIntegrity';
import type { ExportVariant } from '../../shared/documentIntegrity';
import { PublicVersionReview } from '../components/documents/PublicVersionReview';
import { DocumentWordReview } from '../components/documents/DocumentWordReview';
import { officialFragments } from '../../shared/officialMarking';
import { publicFragments } from '../../shared/redaction';

import { LEGAL_TASKS } from '../../shared/legalTasks';
import { generationFingerprint, parseGenerationRequest } from '../../shared/generation';
import type { TaskGenerationRequest } from '../../shared/generation';
import { startWorkflow, workflowRequest, applyWorkflowResult } from '../../shared/workflowEngine';
import { contextRequiresAnalysis } from '../../shared/workflowValidation';
import { GuidedPanel } from '../components/documents/GuidedPanel';
import { SourceImportService } from '../services/SourceImportService';
import { parseDraft } from '../../shared/documents';
import { resolveTask } from '../../shared/legalTasks';

/** See docs/functional_phase1.md: select task/format, separate sources, confirm analysis, generate. */
const requestForDraft = (draft: DocumentDraft): TaskGenerationRequest => draft.workflow ? workflowRequest(draft) : parseGenerationRequest({
  contractVersion: 1, ...draft.generationTask, instruction: draft.generationInstruction ?? '',
  source: { original: draft.originalTranscription ?? draft.transcription, working: draft.transcription, contrast: draft.summary },
  draft: draft.content, history: (draft.generationLog ?? []).map(record => record.instruction), analysisConsent: draft.analysisConsent,
});

interface EditorProps { aiService?: AIAssistantService; transcriptionService?: TranscriptionService; databaseService?: DatabaseService; wordService?: WordExportService; sourceService?: SourceImportService; newId?: string }

const DocumentEditor: React.FC<EditorProps> = ({ aiService, transcriptionService, databaseService, wordService: providedWordService, sourceService: providedSourceService, newId }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const incomingTranscription = typeof location.state?.transcriptionData === 'string' ? location.state.transcriptionData : '';
  const incomingIntent = location.state?.taskIntent;
  let initialTask: DocumentDraft['generationTask'];
  try { if (incomingIntent) { resolveTask(incomingIntent); initialTask = { taskId: incomingIntent.taskId, formatId: incomingIntent.formatId }; } } catch { /* Invalid navigation cannot select a task. */ }
  let initialDraft: DocumentDraft = { title: 'Documento sin título', caseNumber: '', caseType: 'Penal', documentType: initialTask ? resolveTask(initialTask).task.label : 'Acta Judicial (Control Detención)', summary: '',
    transcription: incomingTranscription, originalTranscription: incomingTranscription, content: '', completedPhases: [], audit: { names: false, congruence: false, pii: false }, ...(initialTask ? { generationTask: initialTask } : {}) };
  if (initialTask) { initialDraft = startWorkflow(initialDraft); if (typeof incomingIntent?.instruction === 'string') initialDraft.generationInstruction = incomingIntent.instruction; }
  const persistence = useDocumentDraft(initialDraft, databaseService, newId);
  const { draft, setDraft } = persistence;
  const [wordService] = useState(() => providedWordService ?? new WordExportService());
  const [variant, setVariant] = useState<ExportVariant>('official');
  const [exporting, setExporting] = useState(false);
  const [sourceService] = useState(() => providedSourceService ?? new SourceImportService());
  const [importing, setImporting] = useState(false);
  const importController = useRef<AbortController | null>(null);
  const [confirmationRequest, setConfirmationRequest] = useState<TaskGenerationRequest>();
  const [exportError, setExportError] = useState('');
  const [exportNotice, setExportNotice] = useState('');
  const edit = (field: keyof DocumentDraft, value: string | string[]) => {
    setExportNotice('');
    setConfirmationRequest(undefined);
    setDraft(previous => previous[field] === value ? previous : invalidateReview({ ...previous, [field]: value },
      field === 'content' ? 'content' : ['summary', 'transcription', 'originalTranscription'].includes(field) ? 'sources' : 'metadata'));
  };
  const [defaultAssistant] = useState(() => {
    const service = new AIAssistantService();
    service.initializeSession(incomingTranscription);
    return service;
  });
  const aiAssistant = aiService ?? defaultAssistant;
  const consentAttempt = useRef(0);
  const selectedTask = LEGAL_TASKS.find(task => task.id === draft.generationTask?.taskId);
  const selectTask = (taskId: string, formatId?: string) => {
    const task = LEGAL_TASKS.find(item => item.id === taskId);
    if (!task) return;
    setGenerationError('');
    setDraft(previous => invalidateReview({ ...previous, generationTask: { taskId, formatId: formatId ?? task.formats[0].id },
      generationInstruction: formatId ? previous.generationInstruction : task.instruction, documentType: task.label, workflow: undefined }, 'metadata'));
    setConfirmationRequest(undefined);
  };
  const confirmAnalysis = async (checked: boolean) => {
    const attempt = ++consentAttempt.current;
    if (!checked) { setDraft(previous => ({ ...previous, analysisConsent: undefined })); return; }
    try {
      const request = confirmationRequest ?? requestForDraft(draft);
      const fingerprint = await generationFingerprint(request);
      setDraft(previous => {
        try { return attempt === consentAttempt.current && JSON.stringify(confirmationRequest ? workflowRequest(previous, confirmationRequest.context!.action,
            confirmationRequest.context?.target ? { sectionId: confirmationRequest.context.target.sectionId, start: confirmationRequest.context.target.start, end: confirmationRequest.context.target.end } : undefined) : requestForDraft(previous)) === JSON.stringify(request)
          ? { ...previous, analysisConsent: { fingerprint, confirmedAt: new Date().toISOString() } } : previous; }
        catch { return previous; }
      });
      setGenerationError('');
    } catch (error) { setGenerationError(error instanceof Error ? error.message : 'No se pudo confirmar el análisis.'); }
  };
  const generation = useRef<AbortController | null>(null);
  const [generationError, setGenerationError] = useState('');
  useEffect(() => () => { generation.current?.abort(); importController.current?.abort(); generation.current = null; }, []);
  useEffect(() => { aiAssistant.syncDocumentState(draft); }, [aiAssistant, draft]);
  
  // Contenido incremental
  const documentContent = draft.content;
  const setDocumentContent = (value: string) => edit('content', value);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  
  // Textareas
  const sintesis = draft.summary;
  const setSintesis = (value: string) => edit('summary', value);
  const transcripcion = draft.transcription;
  const setTranscripcion = (value: string) => edit('transcription', value);

  const transcription = useTranscription(transcriptionService);
  const isTranscribing = transcription.busy;
  const mediaInput = useRef<HTMLInputElement>(null);
  const resumeMediaInput = useRef<HTMLInputElement>(null);

  // New and resumed uploads append only a complete source that fits the current draft.
  const appendTranscription = (text?: string) => {
    if (text) {
      const previous = persistence.getCurrentDraft();
      const candidate = invalidateReview({ ...previous,
      transcription: previous.transcription + (previous.transcription ? '\n\n' : '') + text,
      originalTranscription: (previous.originalTranscription ?? '') + (previous.originalTranscription ? '\n\n' : '') + text }, 'sources');
      try {
        if (new TextEncoder().encode(JSON.stringify(candidate)).byteLength > 700_000) throw new Error('La fuente completa supera el tamaño del redactor. Ábrela en Transcripción y descárgala para trabajar por fragmentos; el borrador actual se conserva.');
        setDraft(parseDraft(candidate));
      } catch (error) { setGenerationError(error instanceof Error ? error.message : 'La fuente requiere trabajar por fragmentos.'); }
    }
  };
  const handleRealTranscription = async (file?: File) => appendTranscription(file ? await transcription.start(file) : await transcription.retry());
  
  // Layout
  const [showCol1, setShowCol1] = useState(true);
  const [showCol2, setShowCol2] = useState(true);

  // Auditoría (Visto Bueno)
  const { names: auditNames, congruence: auditCongruence, pii: auditPII } = draft.audit;
  const audit = async (field: keyof DocumentDraft['audit'], value: boolean) => {
    const candidate: DocumentDraft = { ...draft, audit: { ...draft.audit, [field]: value }, reviewHash: null,
      publicVersion: { redactions: draft.publicVersion?.redactions ?? [], reviewed: false, reviewHash: null } };
    setDraft(candidate); setExportError(''); setExportNotice('');
    if (candidate.content.trim() && Object.values(candidate.audit).every(Boolean)) {
      try {
        const hash = await reviewFingerprint(candidate);
        setDraft(previous => reviewPayload(previous) === reviewPayload(candidate) && Object.values(previous.audit).every(Boolean)
          ? { ...previous, reviewHash: hash, phaseStates: Object.fromEntries(previous.completedPhases.map(phase => [phase, 'reviewed'])) } : previous);
      } catch { setExportError('No se pudo registrar la aprobación. Reintenta la revisión.'); }
    } else setDraft(previous => ({ ...previous, phaseStates: Object.fromEntries(previous.completedPhases.map(phase => [phase, previous.phaseStates?.[phase] === 'stale' ? 'stale' : 'generated'])) }));
  };
  const setAuditNames = (value: boolean) => void audit('names', value);
  const setAuditCongruence = (value: boolean) => void audit('congruence', value);
  const setAuditPII = (value: boolean) => void audit('pii', value);
  const editorBusy = persistence.loading || persistence.historyBusy || exporting || importing;

  const canExport = !editorBusy && !isGenerating && !isTranscribing && isApproved(draft) && (variant === 'official' || !!draft.publicVersion?.reviewed);

  const handleGenerateTask = async () => {
    if (generation.current || isTranscribing || editorBusy) return;
    let request: TaskGenerationRequest;
    try { request = requestForDraft(draft); }
    catch (error) { setGenerationError(error instanceof Error ? error.message : 'Selecciona una tarea.'); return; }
    const phaseLabel = selectedTask!.label;
    setIsGenerating(true); setCurrentPhase(phaseLabel); setGenerationError('');
    const controller = new AbortController(); generation.current = controller;
    const currentDraft = documentContent + (documentContent.trim() ? '\n\n' : '');
    try {
      const sourceHash = await sourceFingerprint(draft);
      const response = await aiAssistant.generateTask(request, { signal: controller.signal });
      if (generation.current !== controller || controller.signal.aborted) return;
      setDraft(previous => {
        const next = invalidateReview({ ...previous, content: currentDraft + response.result,
          originalTranscription: previous.originalTranscription ?? transcripcion,
          completedPhases: [...new Set([...previous.completedPhases, phaseLabel])],
          generationLog: [...(previous.generationLog ?? []), { phase: phaseLabel, instruction: request.instruction, sourceHash,
            createdAt: new Date().toISOString(), provenance: response.provenance }].slice(-100) }, 'content');
        return { ...next, phaseStates: { ...next.phaseStates, [phaseLabel]: 'generated' } };
      });
      setExportNotice('');
    } catch (error) {
      if (generation.current === controller && !controller.signal.aborted) setGenerationError(error instanceof Error ? error.message : 'No fue posible generar. El borrador anterior se conserva.');
    } finally {
      if (generation.current === controller) { generation.current = null; setIsGenerating(false); setCurrentPhase(null); }
    }
  };

  const updateWorkflow = (transform: (draft: DocumentDraft) => DocumentDraft) => {
    const next = parseDraft(transform(persistence.getCurrentDraft()));
    setDraft(next); setConfirmationRequest(undefined);
  };
  const generateWorkflow = async (action: 'generate' | 'rewrite' | 'fragment' | 'custom', target?: { sectionId: string; start: number; end: number }) => {
    if (generation.current || editorBusy || isTranscribing) return;
    let request: TaskGenerationRequest;
    try {
      request = workflowRequest(persistence.getCurrentDraft(), action, target);
      if (contextRequiresAnalysis(request, request.context) && (!request.analysisConsent || request.analysisConsent.fingerprint !== await generationFingerprint(request))) {
        setConfirmationRequest({ ...request, analysisConsent: undefined }); setDraft(previous => ({ ...previous, analysisConsent: undefined }));
        setGenerationError('Confirma el análisis de esta instrucción y sus fuentes antes de generar.'); return;
      }
    } catch (error) { setGenerationError(error instanceof Error ? error.message : 'Solicitud inválida.'); return; }
    if (generation.current) return;
    const controller = new AbortController(); generation.current = controller;
    setIsGenerating(true); setCurrentPhase(request.context!.stepId); setGenerationError('');
    try {
      // Checkpoint the previous section before any replacement; failed saves block generation.
      if (!await persistence.save()) return;
      const sourceHash = await sourceFingerprint(persistence.getCurrentDraft());
      const response = await aiAssistant.generateTask(request, { signal: controller.signal });
      if (generation.current !== controller || controller.signal.aborted) return;
      const previous = persistence.getCurrentDraft();
      if (await generationFingerprint(workflowRequest(previous, action, target)) !== await generationFingerprint(request)) throw new Error('El contexto cambió. El borrador anterior se conserva.');
      const changed = applyWorkflowResult(previous, request, response);
      const phase = changed.workflow!.sections.find(section => section.stepId === request.context!.stepId && section.matterId === request.context!.matter.id)?.title ?? request.context!.stepId;
      const next = parseDraft({ ...changed, completedPhases: [...new Set([...changed.completedPhases, phase])], generationLog: [...(changed.generationLog ?? []), {
        phase, instruction: request.instruction, sourceHash, createdAt: new Date().toISOString(), provenance: response.provenance, matterId: request.context!.matter.id, stepId: request.context!.stepId }].slice(-100) });
      setDraft(next); setConfirmationRequest(undefined); setExportNotice('');
    } catch (error) { if (generation.current === controller && !controller.signal.aborted) setGenerationError(error instanceof Error ? error.message : 'No se pudo generar este paso.'); }
    finally { if (generation.current === controller) { generation.current = null; setIsGenerating(false); setCurrentPhase(null); } }
  };
  const importSource = async (file: File, destination: 'original' | 'contrast' | 'template') => {
    const controller = new AbortController(); importController.current = controller; setImporting(true); setGenerationError('');
    try {
      const result = await sourceService.import(file, controller.signal);
      if (controller.signal.aborted) return;
      const previous = persistence.getCurrentDraft();
      let next: DocumentDraft;
      if (destination === 'template') {
        if (!previous.workflow || result.text.length > 200_000) throw new Error('Inicia los pasos guiados; el formato admite hasta 200 000 caracteres.');
        next = invalidateReview({ ...previous, workflow: { ...previous.workflow, userTemplate: result.text } }, 'metadata');
      } else if (destination === 'contrast') next = invalidateReview({ ...previous, summary: previous.summary + (previous.summary ? '\n\n' : '') + result.text }, 'sources');
      else next = invalidateReview({ ...previous, transcription: previous.transcription + (previous.transcription ? '\n\n' : '') + result.text,
        originalTranscription: (previous.originalTranscription ?? '') + (previous.originalTranscription ? '\n\n' : '') + result.text }, 'sources');
      setDraft(parseDraft(next)); setConfirmationRequest(undefined);
    } catch (error) { if (!controller.signal.aborted) setGenerationError(error instanceof Error ? error.message : 'No se pudo importar el documento.'); }
    finally { if (importController.current === controller) { importController.current = null; setImporting(false); } }
  };

  const cancelGeneration = () => {
    generation.current?.abort(); generation.current = null;
    setIsGenerating(false); setCurrentPhase(null);
    setGenerationError('Generación detenida. El borrador anterior se conserva.');
  };

  const handleExport = async () => {
    if (!canExport) return;
    setExporting(true); setExportError(''); setExportNotice('');
    try {
      if (!await persistence.save()) return;
      const snapshot = persistence.getConfirmedDocument();
      if (!snapshot) throw new Error('El borrador todavía no tiene una versión guardada.');
      const artifact = await wordService.exportToWord(snapshot, variant);
      setExportNotice(`Descarga preparada: ${variant === 'official' ? 'versión oficial' : 'versión pública'}, revisión ${snapshot.revision}. Huella del texto: ${artifact.contentHash.slice(0, 12)}…`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'No se pudo exportar el documento.');
    } finally { setExporting(false); }
  };

  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(variant === 'public' ? publicTextForPreview(draft) : documentContent); setExportNotice('Texto de la variante visible copiado.'); }
    catch { setExportError('No se pudo copiar el texto.'); }
  };

  const getColSpans = () => {
    if (showCol1 && showCol2) return { col1: 3, col2: 4, col3: 5 };
    if (!showCol1 && showCol2) return { col1: 0, col2: 5, col3: 7 };
    if (showCol1 && !showCol2) return { col1: 4, col2: 0, col3: 8 };
    return { col1: 0, col2: 0, col3: 12 };
  };

  const spans = getColSpans();

  return (
    <div style={{ height: '100vh', backgroundColor: '#f5f5f8', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      
      {/* Header Pegajoso */}
      <header style={{ flexShrink: 0, zIndex: 50, backgroundColor: 'white', borderBottom: '1px solid #e2e8f0', padding: '0.75rem 1rem' }}>
        <div style={{ maxWidth: '100%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '2.5rem', height: '2.5rem', backgroundColor: '#000066', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Gavel size={24} color="#C5A059" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.025em' }}>Redactor Jurídico AI</h1>
              <p style={{ fontSize: '0.75rem', color: '#475569', fontWeight: 600, margin: 0 }}>Poder Judicial del Estado de Nuevo León</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: 'rgba(197,160,89,0.1)', padding: '0.375rem 0.75rem', borderRadius: '9999px' }}>
              <Wand2 size={14} color="#000066" />
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#000066', textTransform: 'uppercase', letterSpacing: '0.05em' }}>IA Asistida 2026</span>
            </div>
            <button onClick={() => void persistence.save()} disabled={editorBusy || persistence.saving || persistence.conflict}>Guardar ahora</button>
            <button aria-label="Historial de versiones" disabled={editorBusy || isGenerating || isTranscribing} onClick={() => void persistence.history()} style={{ padding: '0.5rem', border: 'none', background: 'transparent', cursor: 'pointer' }}><History size={20} /></button>
            <button aria-label="Ir a ajustes" onClick={async () => { if (await persistence.save()) navigate('/settings'); }} disabled={editorBusy || isGenerating || isTranscribing} style={{ padding: '0.5rem', border: 'none', background: 'transparent', cursor: 'pointer' }}><Settings size={20} /></button>
          </div>
        </div>
      </header>

      {(generationError || transcription.error || exportError) && <div role="alert" style={{ padding: '0.75rem 1.5rem', background: '#fef2f2', color: '#991b1b' }}>
        {generationError && <p style={{ margin: 0 }}>{generationError}</p>}
        {transcription.error && <p style={{ margin: 0 }}>{transcription.error}</p>}
        {exportError && <p style={{ margin: 0 }}>{exportError}</p>}
      </div>}
      {exportNotice && <p role="status" style={{ padding: '0.5rem 1rem' }}>{exportNotice}</p>}
      {isGenerating && <div role="status" style={{ padding: '0.75rem 1.5rem', background: '#eff6ff' }}>
        Generando {currentPhase}… <button onClick={cancelGeneration}>Detener generación</button>
      </div>}

      <div style={{ padding: '0.5rem 1rem', background: 'white' }}>
        <label>Título <input aria-label="Título del documento" value={draft.title} maxLength={200} disabled={editorBusy} onChange={event => edit('title', event.target.value)} /></label>
        <span role="status" style={{ marginLeft: '1rem' }}>{persistence.loading ? 'Recuperando borrador…' : persistence.saving ? 'Guardando…' : persistence.changed ? 'Cambios sin guardar' : persistence.versionNumber ? `Guardado · versión ${persistence.versionNumber}` : 'Borrador nuevo'}</span>
        <button style={{ marginLeft: '1rem' }} onClick={async () => { if (await persistence.save()) navigate('/documents'); }} disabled={editorBusy || isGenerating || isTranscribing}>Mis Documentos</button>
        {persistence.error && <p role="alert" style={{ color: '#b91c1c' }}>{persistence.error}</p>}
        {persistence.historyOpen && <section aria-label="Historial de versiones">
          <p>Restaurar una versión sustituye el borrador visible y requiere revisar de nuevo la auditoría.</p>
          {persistence.versions.map(version => <button key={version.revision} disabled={editorBusy || isGenerating || isTranscribing}
            onClick={() => { if (window.confirm(`¿Restaurar la versión ${version.revision}? Los cambios actuales se guardarán primero.`)) void persistence.restore(version.revision); }}>
            Restaurar versión {version.revision} · {new Date(version.savedAt).toLocaleString('es-MX')}
          </button>)}
          {persistence.versionCursor && <button onClick={() => void persistence.history(true)} disabled={editorBusy}>Más versiones</button>}
          <button onClick={() => persistence.setHistoryOpen(false)}>Cerrar historial</button>
        </section>}

      </div>

      {/* Main Content Grid (12 columnas) */}
      <main style={{ flex: 1, padding: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(12, minmax(0, 1fr))', gap: '1.5rem', overflow: 'hidden' }}>
        
        {/* COLUMNA 1: Resumen / Contexto */}
        {showCol1 && (
          <aside style={{ gridColumn: `span ${spans.col1} / span ${spans.col1}`, display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%', overflowY: 'auto', paddingRight: '0.5rem' }}>
            
            <section style={{ backgroundColor: 'white', padding: '1.25rem', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', flexShrink: 0 }}>
              <h2 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0f172a', marginBottom: '1.25rem' }}>Configuración</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <label>Tarea jurídica
                  <select aria-label="Tarea jurídica" value={draft.generationTask?.taskId ?? ''} disabled={editorBusy || isGenerating || isTranscribing || (draft.workflow?.matters.length ?? 0) > 1}
                    onChange={event => { const taskId = event.target.value; if (draft.workflow) void persistence.save().then(saved => { if (saved) selectTask(taskId); }); else selectTask(taskId); }}>
                    <option value="" disabled>Selecciona una tarea</option>
                    {LEGAL_TASKS.map(task => <option key={task.id} value={task.id}>{task.label}</option>)}
                  </select>
                </label>
                {selectedTask && <label>Formato de referencia
                  <select aria-label="Formato de referencia" value={draft.generationTask?.formatId} disabled={editorBusy || isGenerating || isTranscribing || (draft.workflow?.matters.length ?? 0) > 1}
                    onChange={event => { const formatId = event.target.value; if (draft.workflow) void persistence.save().then(saved => { if (saved) selectTask(selectedTask.id, formatId); }); else selectTask(selectedTask.id, formatId); }}>
                    {selectedTask.formats.map(format => <option key={format.id} value={format.id}>{format.label}</option>)}
                  </select>
                </label>}
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>Tipo de documento</span>
                  <select value={draft.documentType} disabled={editorBusy || isGenerating} onChange={event => edit('documentType', event.target.value)} style={{ borderRadius: '0.5rem', border: '1px solid #cbd5e1', padding: '0.5rem', fontSize: '0.875rem', color: '#0f172a', backgroundColor: '#ffffff', outline: 'none' }}>
                    <option>Acta Judicial (Control Detención)</option>
                    <option>Acta en Bloque</option>
                    <option>Sentencia Definitiva</option>
                    {LEGAL_TASKS.map(task => <option key={task.id}>{task.label}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0f172a' }}>Materia</span>
                  <select value={draft.caseType} disabled={editorBusy || isGenerating} onChange={event => edit('caseType', event.target.value)} style={{ borderRadius: '0.5rem', border: '1px solid #cbd5e1', padding: '0.5rem', fontSize: '0.875rem', color: '#0f172a', backgroundColor: '#ffffff', outline: 'none' }}>
                    <option>Penal</option>
                    <option>Civil</option>
                    <option>Familiar</option>
                  </select>
                </label>

                <label>Expediente <input aria-label="Número de expediente" maxLength={100} value={draft.caseNumber} disabled={editorBusy || isGenerating} onChange={event => edit('caseNumber', event.target.value)} /></label>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0f172a' }}>Lectura Fácil</span>
                    <span style={{ fontSize: '0.625rem', color: '#475569', fontWeight: 600 }}>Protocolo PJENL 2026</span>
                  </div>
                  <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="checkbox" defaultChecked style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                    <div style={{ width: '2.75rem', height: '1.5rem', backgroundColor: '#000066', borderRadius: '9999px', position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '2px', left: '22px', backgroundColor: 'white', borderRadius: '50%', width: '1.25rem', height: '1.25rem' }}></div>
                    </div>
                  </label>
                </div>
              </div>
            </section>

            {draft.workflow && <GuidedPanel key={draft.workflow.taskId + ':' + draft.workflow.formatId} draft={draft} update={updateWorkflow} busy={editorBusy || isGenerating || isTranscribing} checkpoint={persistence.save} generate={(action, target) => void generateWorkflow(action, target)} />}
            <section style={{ backgroundColor: 'white', padding: '1.25rem', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flex: 1, minHeight: '300px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexShrink: 0 }}>
                <h2 style={{ fontSize: '0.875rem', color: '#0f172a' }}>Auto de apertura o fuente de contraste (opcional)</h2>
              </div>
              <textarea 
                value={sintesis}
                aria-label="Síntesis del caso"
                disabled={isGenerating || editorBusy}
                onChange={(e) => setSintesis(e.target.value)}
                placeholder="Pega la fuente de contraste. Se conserva separada del testimonio."
                style={{ flex: 1, width: '100%', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.875rem', resize: 'none', backgroundColor: '#f8fafc', color: '#0f172a', outline: 'none' }}
              />
            </section>
          </aside>
        )}

        {/* COLUMNA 2: Transcripción Completa y Fases */}
        {showCol2 && (
          <section style={{ gridColumn: `span ${spans.col2} / span ${spans.col2}`, backgroundColor: 'white', padding: '1.25rem', borderRadius: '0.75rem', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexShrink: 0 }}>
              <h2 style={{ fontSize: '0.875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#0f172a' }}>Transcripción de trabajo</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.125rem 0.5rem', backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '9999px' }}>
                  <ShieldCheck size={12} color="#059669" />
                  <span style={{ fontSize: '0.5625rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Seguro</span>
                </div>
              </div>
            </div>

            <details style={{ flexShrink: 0, marginBottom: '0.75rem' }}>
              <summary>Fuente original conservada</summary>
              <textarea aria-label="Transcripción original" readOnly value={draft.originalTranscription ?? ''} style={{ width: '100%', minHeight: '100px', background: '#f8fafc', color: '#0f172a' }} />
              {!draft.originalTranscription && <button disabled={editorBusy || isGenerating || isTranscribing || !transcripcion.trim()} onClick={() => edit('originalTranscription', transcripcion)}>Conservar como original</button>}
              {draft.originalTranscription && draft.originalTranscription !== transcripcion && <p>La copia de trabajo tiene cambios; la fuente original se conserva.</p>}
            </details>
            
            <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', marginBottom: '1.25rem' }}>
              <textarea 
                value={transcripcion}
                aria-label="Transcripción íntegra"
                placeholder="Pegue aquí la transcripción íntegra o cargue un audio/video..."
                style={{ flex: 1, width: '100%', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.875rem', resize: 'none', backgroundColor: '#f8fafc', color: '#0f172a', outline: 'none', opacity: isTranscribing ? 0.5 : 1 }}
                onChange={(e) => setTranscripcion(e.target.value)}
                disabled={isTranscribing || isGenerating || editorBusy}
              />
              
              {isTranscribing && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.7)', zIndex: 10, borderRadius: '0.5rem' }}>
                  <span role="status" style={{ fontWeight: 700 }}>{transcription.status}</span>
                  {transcription.progress?.stage === 'uploading' && transcription.progress.percent !== undefined && <p>Carga confirmada: {transcription.progress.percent}%</p>}
                  {transcription.progress?.stage === 'processing' && transcription.progress.percent !== undefined && <p>Procesamiento del video: {transcription.progress.percent}%</p>}
                  {transcription.progress?.recoveredSegments !== undefined && <p>Segmentos recuperados: {transcription.progress.recoveredSegments}{transcription.progress.totalSegments !== undefined ? ` de ${transcription.progress.totalSegments}` : ''}</p>}
                  <p>Tiempo transcurrido: {transcription.elapsed}s</p>
                  <button onClick={transcription.cancel}>Detener espera</button>
                </div>
              )}

              <div style={{ position: 'absolute', bottom: '0.75rem', right: '0.75rem', zIndex: 11 }}>
                <input ref={mediaInput} type="file" accept={MEDIA_ACCEPT + ',' + DIRECT_MEDIA_ACCEPT} hidden aria-label="Cargar audio al editor"
                  disabled={isTranscribing || isGenerating || editorBusy}
                  onChange={event => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (file) void handleRealTranscription(file);
                  }} />
                <button 
                  onClick={() => mediaInput.current?.click()}
                  disabled={isTranscribing || isGenerating || editorBusy}
                  title="Cargar y transcribir audio o video"
                  aria-label="Cargar y transcribir audio o video"
                  style={{ padding: '0.5rem', backgroundColor: 'white', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', borderRadius: '9999px', border: '1px solid #e2e8f0', cursor: isTranscribing ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>
                  <Mic size={18} color={isTranscribing ? '#cbd5e1' : '#000066'} />
                </button>
              </div>
            </div>

            {!isTranscribing && transcription.status && <p role="status" style={{ fontSize: '0.8rem' }}>{transcription.status}</p>}
            <input ref={resumeMediaInput} type="file" accept={DIRECT_MEDIA_ACCEPT} hidden aria-label="Reseleccionar archivo original en el editor"
              onChange={event => {
                const file = event.currentTarget.files?.[0]; event.currentTarget.value = '';
                if (file) void transcription.resumeUpload(file).then(appendTranscription);
              }} />
            {!isTranscribing && !isGenerating && !editorBusy && transcription.pendingUpload?.kind === 'direct' && <button onClick={() => resumeMediaInput.current?.click()}>Reseleccionar archivo y reanudar carga</button>}
            {!isTranscribing && !isGenerating && !editorBusy && transcription.canRetry && transcription.pendingUpload?.kind !== 'direct' && <button onClick={() => void handleRealTranscription()}>Reintentar / reanudar transcripción</button>}

            <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.75rem', maxHeight: '250px', overflowY: 'auto' }}>
              <h3 style={{ fontSize: '0.875rem', margin: 0 }}>Instrucción de la tarea</h3>
              {!selectedTask && <p>Selecciona una tarea jurídica antes de generar contenido nuevo.</p>}
              {selectedTask && <>
                <textarea aria-label="Instrucción de la tarea" maxLength={4000} value={draft.generationInstruction ?? ''}
                  disabled={editorBusy || isGenerating || isTranscribing} onChange={event => edit('generationInstruction', event.target.value)}
                  placeholder={selectedTask.id === 'DIRECTORIO' ? 'Términos que deben aparecer en el directorio' : 'Describe el alcance de tu solicitud'} />
                {(selectedTask.requiresAnalysis || !!draft.workflow?.requestAnalysis || !!confirmationRequest) && <label><input type="checkbox" aria-label="Confirmo el análisis de esta instrucción y sus fuentes"
                  checked={!!draft.analysisConsent} disabled={editorBusy || isGenerating || isTranscribing}
                  onChange={event => void confirmAnalysis(event.target.checked)} /> Confirmo el análisis de esta instrucción y sus fuentes</label>}
              </>}
              {!draft.workflow && <button onClick={() => void handleGenerateTask()} disabled={!selectedTask || isGenerating || isTranscribing || editorBusy || (selectedTask.requiresAnalysis && !draft.analysisConsent)}>
                {isGenerating ? 'Generando…' : 'Generar borrador'}
              </button>}
              {selectedTask && !draft.workflow && <button disabled={editorBusy || isGenerating || isTranscribing} onClick={() => { try { updateWorkflow(previous => startWorkflow(previous)); } catch (error) { setGenerationError(error instanceof Error ? error.message : 'No se pudo iniciar.'); } }}>Iniciar elaboración por pasos</button>}
              <label>Importar fuente (TXT, DOCX, DOC o PDF)<input aria-label="Importar documento como fuente" type="file" accept=".txt,.doc,.docx,.pdf" disabled={editorBusy || isGenerating || isTranscribing} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importSource(file, 'original'); }} /></label>
              <label>Importar contraste<input aria-label="Importar documento de contraste" type="file" accept=".txt,.doc,.docx,.pdf" disabled={editorBusy || isGenerating || isTranscribing} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importSource(file, 'contrast'); }} /></label>
              {draft.workflow && <label>Formato aportado por el usuario<input aria-label="Importar formato del usuario" type="file" accept=".txt,.doc,.docx,.pdf" disabled={editorBusy || isGenerating || isTranscribing} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importSource(file, 'template'); }} /></label>}
              {draft.workflow?.userTemplate && <p>Formato del usuario cargado.</p>}
            </div>
            <div aria-label="Estado de fases" style={{ flexShrink: 0, marginTop: '0.75rem', fontSize: '0.75rem', maxHeight: '90px', overflowY: 'auto' }}>
              {draft.completedPhases.map(phase => <p key={phase}>{phase}: {({ generated: 'Generada · requiere revisión', reviewed: 'Revisada', stale: 'Fuentes cambiadas · requiere revisión' })[draft.phaseStates?.[phase] ?? 'generated']}</p>)}
            </div>
          </section>
        )}

        {/* COLUMNA 3: Vaciado y Redacción (Lienzo y Auditoría) */}
        <section style={{ gridColumn: `span ${spans.col3} / span ${spans.col3}`, backgroundColor: 'white', borderRadius: '0.75rem', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
          
          {/* Toolbar Previsualización */}
          <div style={{ padding: '0.75rem 1.5rem', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f8fafc', flexShrink: 0 }}>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button onClick={() => setShowCol1(!showCol1)} title="Toggle Resumen" style={{ display: 'flex', alignItems: 'center', padding: '0.375rem', backgroundColor: showCol1 ? '#e2e8f0' : 'white', border: '1px solid #cbd5e1', borderRadius: '0.375rem', cursor: 'pointer', color: '#475569' }}>
                <LayoutTemplate size={16} />
              </button>
              <button onClick={() => setShowCol2(!showCol2)} title="Toggle Transcripción" style={{ display: 'flex', alignItems: 'center', padding: '0.375rem', backgroundColor: showCol2 ? '#e2e8f0' : 'white', border: '1px solid #cbd5e1', borderRadius: '0.375rem', cursor: 'pointer', color: '#475569' }}>
                <PanelLeft size={16} />
              </button>
              <div style={{ width: '1px', height: '1.25rem', backgroundColor: '#cbd5e1', margin: '0 0.5rem' }}></div>
              <FileText size={16} color="#475569" />
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#475569', fontStyle: 'italic' }}>Lienzo del Borrador</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontSize: '0.75rem' }}>Versión <select aria-label="Variante de exportación" value={variant} disabled={editorBusy || isGenerating || isTranscribing} onChange={event => { setVariant(event.target.value as ExportVariant); setExportNotice(''); }}>
                <option value="official">Oficial íntegra</option><option value="public">Pública revisada</option>
              </select></label>
              <button onClick={handleCopy} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem', fontSize: '0.75rem', fontWeight: 800, color: '#0f172a', backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '0.5rem', cursor: 'pointer' }}>
                <Copy size={14} /> Copiar
              </button>
              <button 
                onClick={handleExport} 
                disabled={!canExport}
                title={canExport ? "Exportar a Word (Docx)" : "Complete el Visto Bueno en Auditoría para poder exportar"}
                style={{ 
                  display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.375rem 0.75rem', fontSize: '0.75rem', fontWeight: 800, 
                  color: canExport ? '#000066' : '#94a3b8', 
                  backgroundColor: canExport ? '#f0f9ff' : '#f1f5f9', 
                  border: `1px solid ${canExport ? '#bae6fd' : '#e2e8f0'}`, 
                  borderRadius: '0.5rem', 
                  cursor: canExport ? 'pointer' : 'not-allowed', 
                  transition: 'all 0.2s' 
                }}
              >
                <Download size={14} /> Exportar {variant === 'official' ? 'oficial' : 'pública'} {canExport ? '' : '🔒'}
              </button>
            </div>
          </div>

          {/* Lienzo Documental */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '3rem 4rem', backgroundColor: 'white', fontFamily: '"Times New Roman", Times, serif', lineHeight: 1.6, color: '#0f172a' }}>
            <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
              <div style={{ fontWeight: 800, fontSize: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Poder Judicial del Estado de Nuevo León</div>
              <div style={{ fontSize: '1rem', fontWeight: 600, fontStyle: 'italic', marginTop: '0.5rem' }}>Borrador Asistido por IA - {new Date().toLocaleDateString('es-MX')}</div>
            </div>
            
            <div style={{ fontSize: '1.125rem', textAlign: 'justify', whiteSpace: 'pre-wrap', color: '#0f172a' }}>
              {documentContent ? variant === 'public' ? publicFragments(draft.content, draft.publicVersion?.redactions ?? []).map((fragment, index) =>
                <span key={index} style={fragment.hidden ? { color: '#b91c1c', fontWeight: 700 } : undefined}>{fragment.text}</span>) : !draft.wordFormat?.marks.length ? documentContent : officialFragments(documentContent, draft.wordFormat.marks).map((fragment, index) =>
                  <span key={index} style={fragment.marked ? { color: '#b91c1c' } : undefined}>{fragment.text}</span>) : <span style={{ color: '#64748b' }}>Agrega las fuentes y selecciona una fase para comenzar.</span>}
            </div>
            {variant === 'public' && <PublicVersionReview draft={draft} update={setDraft} disabled={editorBusy || isGenerating || isTranscribing} />}
            {variant === 'official' && <DocumentWordReview draft={draft} update={next => { setDraft(next); setExportNotice(''); setConfirmationRequest(undefined); }}
              disabled={editorBusy || isGenerating || isTranscribing} onError={setExportError} />}
            <details style={{ marginTop: '1rem' }}><summary>Editar borrador</summary>
              <textarea aria-label="Contenido del borrador" value={documentContent} disabled={editorBusy || isGenerating || isTranscribing || !!draft.workflow}
                onChange={event => setDocumentContent(event.target.value)} style={{ width: '100%', minHeight: '240px', color: '#0f172a', background: 'white' }} />
            </details>
            {!!draft.generationLog?.length && <details style={{ marginTop: '1rem', fontFamily: 'Inter, sans-serif', fontSize: '0.875rem' }}><summary>Instrucciones de generación</summary>
              {draft.generationLog.map((record, index) => <article key={index} style={{ margin: '0.75rem 0' }}><strong>{record.phase}</strong>
                <p>{record.instruction}</p><small>{new Date(record.createdAt).toLocaleString('es-MX')} · huella de fuentes {record.sourceHash.slice(0, 12)}…</small></article>)}
            </details>}
          </div>

          {/* Checklist de Auditoría Footer */}
          <div style={{ padding: '1.25rem 1.5rem', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '0.75rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckSquare size={16} color="#059669" />
              <h3 style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#0f172a', margin: 0, textTransform: 'uppercase', letterSpacing: '0.025em' }}>Auditoría Obligatoria de Visto Bueno</h3>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.75rem', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>
                <input type="checkbox" disabled={editorBusy || isGenerating || isTranscribing} checked={auditNames} onChange={(e) => setAuditNames(e.target.checked)} style={{ marginTop: '0.125rem', cursor: 'pointer', width: '1rem', height: '1rem' }} />
                <span>Verificación de <strong>nombres y datos clave</strong> contra Auto de Apertura original.</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.75rem', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>
                <input type="checkbox" disabled={editorBusy || isGenerating || isTranscribing} checked={auditCongruence} onChange={(e) => setAuditCongruence(e.target.checked)} style={{ marginTop: '0.125rem', cursor: 'pointer', width: '1rem', height: '1rem' }} />
                <span>Revisión de <strong>congruencia</strong> lógica y jurídica en la valoración de pruebas.</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.75rem', color: '#334155', cursor: 'pointer', fontWeight: 500 }}>
                <input type="checkbox" disabled={editorBusy || isGenerating || isTranscribing} checked={auditPII} onChange={(e) => setAuditPII(e.target.checked)} style={{ marginTop: '0.125rem', cursor: 'pointer', width: '1rem', height: '1rem' }} />
                <span>Revisé los <strong>datos personales</strong> del borrador. La versión pública se prepara y confirma por separado.</span>
              </label>
            </div>
          </div>

        </section>

      </main>
    </div>
  );
};

/** Stable identity for a new draft; switching to another saved document remounts its request lifetime. */
export const DocumentBuilderView: React.FC<EditorProps> = props => {
  const [params] = useSearchParams();
  const [newId] = useState(() => crypto.randomUUID());
  return <DocumentEditor key={params.get('documentId') || newId} {...props} newId={newId} />;
};
