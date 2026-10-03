import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSignature, Upload, Download } from 'lucide-react';
import { useTranscription } from '../hooks/useTranscription';
import { TranscriptionService } from '../services/TranscriptionService';
import type { TranscriptionRecord } from '../services/TranscriptionService';
import { MEDIA_ACCEPT, DIRECT_MEDIA_ACCEPT } from '../../shared/transcription';
import { TaskActions } from '../components/documents/TaskActions';
import { TranscriptWordPanel } from '../components/documents/TranscriptWordPanel';
import type { TranscriptWordClient } from '../services/TranscriptWordClient';

export function TranscriptionView({ service: provided, wordClient }: { service?: TranscriptionService; wordClient?: TranscriptWordClient }) {
  const [service] = useState(() => provided ?? new TranscriptionService());
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const resumeInput = useRef<HTMLInputElement>(null);
  const resumeRequestId = useRef<string | undefined>(undefined);
  const transcription = useTranscription(service);
  const [jobs, setJobs] = useState<TranscriptionRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [notice, setNotice] = useState('');
  const sourceFitsEditor = !!transcription.result && transcription.result.text.length <= 500_000
    && new TextEncoder().encode(JSON.stringify({ original: transcription.result.text, working: transcription.result.text })).byteLength < 650_000;
  useEffect(() => {
    if (transcription.busy) return;
    const abort = new AbortController();
    void service.list(undefined, abort.signal).then(page => {
      if (!abort.signal.aborted) { setJobs(page.jobs); setCursor(page.nextCursor); setHistoryError(''); }
    }).catch(failure => { if (!abort.signal.aborted) setHistoryError(failure instanceof Error ? failure.message : 'No se pudo cargar el historial.'); });
    return () => abort.abort();
  }, [service, transcription.busy]);
  const history = async (more = false) => {
    setHistoryBusy(true); setHistoryError('');
    try {
      const page = await service.list(more ? cursor ?? undefined : undefined);
      setJobs(previous => more ? [...previous, ...page.jobs] : page.jobs); setCursor(page.nextCursor);
    } catch (failure) { setHistoryError(failure instanceof Error ? failure.message : 'No se pudo cargar el historial.'); }
    finally { setHistoryBusy(false); }
  };
  const remove = async (id: string) => {
    if (!window.confirm('¿Eliminar esta transcripción de LexIA? El proveedor remoto puede conservar el archivo y continuar procesándolo.')) return;
    setHistoryBusy(true); setHistoryError('');
    try {
      setNotice(await service.delete(id)); setJobs(previous => previous.filter(job => job.job_id !== id)); transcription.clearResult();
    } catch (failure) { setHistoryError(failure instanceof Error ? failure.message : 'No se pudo eliminar la transcripción.'); }
    finally { setHistoryBusy(false); }
  };
  const buttonStyle = { padding: '0.75rem 1.25rem', borderRadius: '0.5rem', border: '1px solid #cbd5e1', cursor: 'pointer', fontWeight: 700 };

  const downloadText = (result: { text: string; fileName: string }) => {
    const url = URL.createObjectURL(new Blob([result.text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = result.fileName.replace(/\.[^.]+$/, '') + '-transcripcion.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const downloadSaved = async (id: string) => {
    setHistoryBusy(true); setHistoryError('');
    try { downloadText(await service.transcript(id)); }
    catch (failure) { setHistoryError(failure instanceof Error ? failure.message : 'No se pudo descargar.'); }
    finally { setHistoryBusy(false); }
  };

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', padding: '2rem', color: '#0f172a' }}>
      <div style={{ maxWidth: '64rem', margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.75rem', color: '#000066' }}>Transcripción de audiencia</h1>
        <p>Selecciona un archivo de audio o video. Podrás revisar el texto antes de enviarlo al editor.</p>
        <button onClick={() => navigate('/document-builder')}>Trabajar con texto o documentos sin video</button>
        <section style={{ background: 'white', padding: '2rem', borderRadius: '1rem', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
          <input ref={input} type="file" accept={MEDIA_ACCEPT + ',' + DIRECT_MEDIA_ACCEPT} aria-label="Archivo de audiencia" hidden
            disabled={transcription.busy}
            onChange={event => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) void transcription.start(file);
            }} />
          <button onClick={() => input.current?.click()} disabled={transcription.busy}
            style={{ ...buttonStyle, background: '#000066', color: 'white', opacity: transcription.busy ? 0.5 : 1 }}>
            <Upload size={16} style={{ marginRight: '0.5rem' }} />Seleccionar archivo
          </button>
          <p style={{ fontSize: '0.875rem', color: '#64748b' }}>MP3, WAV, MP4, M4A, WEBM, OGG o FLAC: hasta 100 MiB en carga habitual. Videos MP4, WEBM, MOV o AVI: hasta 2 GiB cuando esté habilitada la carga directa reanudable.</p>
          <input ref={resumeInput} type="file" accept={DIRECT_MEDIA_ACCEPT} aria-label="Archivo original para reanudar carga" hidden disabled={transcription.busy}
            onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void transcription.resumeUpload(file, resumeRequestId.current); }} />
          {transcription.pendingUpload?.kind === 'direct' && <button disabled={transcription.busy} style={buttonStyle}
            onClick={() => { resumeRequestId.current = transcription.pendingUpload!.requestId; resumeInput.current?.click(); }}>Reseleccionar archivo original y reanudar carga</button>}
          {transcription.progress?.percent !== undefined && <p role="status">{transcription.progress.stage === 'uploading' ? 'Carga del archivo' : 'Procesamiento del video'}: {Math.floor(transcription.progress.percent)}%</p>}
          {transcription.progress?.recoveredSegments !== undefined && <p role="status">Segmentos recuperados: {transcription.progress.recoveredSegments}{transcription.progress.totalSegments ? ` de ${transcription.progress.totalSegments}` : ''}</p>}
          {transcription.status && <p role="status" aria-live="polite">{transcription.status}</p>}
          {transcription.busy && <>
            <p>Tiempo transcurrido: {transcription.elapsed}s</p>
            <button style={buttonStyle} onClick={transcription.cancel}>Detener espera</button>
          </>}
          {transcription.error && <p role="alert" style={{ color: '#b91c1c' }}>{transcription.error}</p>}
          {!transcription.busy && transcription.canRetry && transcription.pendingUpload?.kind !== 'direct' && <button style={buttonStyle} onClick={() => void transcription.retry()}>
            Reintentar / reanudar
          </button>}
        </section>
        {transcription.result && <section aria-label="Transcripción completada" style={{ background: 'white', padding: '2rem', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
          <h2>Transcripción completada</h2>
          <p>Archivo: {transcription.result.fileName}</p>
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, padding: '1rem', background: '#f8fafc', borderRadius: '0.5rem' }}>{transcription.result.text.slice(0, 30_000)}</div>
          {transcription.result.text.length > 30_000 && <p>Vista previa de los primeros 30 000 caracteres. La descarga conserva la fuente completa.</p>}
          {!sourceFitsEditor && <p>La fuente completa supera el tamaño del redactor. Descárgala y aporta los fragmentos que quieras trabajar; los segmentos originales permanecen guardados.</p>}
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <button style={{ ...buttonStyle, background: '#000066', color: 'white' }} disabled={transcription.busy || !sourceFitsEditor}
              onClick={() => navigate('/document-builder', { state: { transcriptionData: transcription.result!.text } })}>
              <FileSignature size={16} style={{ marginRight: '0.5rem' }} />Continuar al editor
            </button>
            <button style={buttonStyle} onClick={() => downloadText(transcription.result!)}><Download size={16} style={{ marginRight: '0.5rem' }} />Descargar texto</button>
          </div>
          {!transcription.busy && sourceFitsEditor && <TaskActions choose={taskIntent => navigate('/document-builder', { state: { transcriptionData: transcription.result!.text, taskIntent } })} />}
          {!transcription.busy && <TranscriptWordPanel jobId={transcription.result.jobId} sourceText={transcription.result.text} client={wordClient} />}
        </section>}
        <section aria-label="Trabajos guardados" style={{ marginTop: '1.5rem', background: 'white', padding: '1.5rem', borderRadius: '1rem' }}>
          <h2>Trabajos guardados</h2>
          <p>Puedes abrir o reanudar una transcripción después de recargar, sin volver a subir el archivo.</p>
          <button onClick={() => void history()} disabled={historyBusy || transcription.busy}>Actualizar historial</button>
          {historyError && <p role="alert" style={{ color: '#b91c1c' }}>{historyError}</p>}
          {notice && <p role="status">{notice}</p>}
          {!jobs.length && !historyError && <p>No hay trabajos guardados.</p>}
          {jobs.map(job => <article key={job.job_id} style={{ padding: '1rem 0', borderBottom: '1px solid #e2e8f0' }}>
            <strong>{job.fileName}</strong> · {({ uploading: 'Carga pendiente', queued: 'En espera', processing: 'Procesando', generating_transcript: 'Generando texto', recovering_transcript: 'Recuperando segmentos', completed: 'Completado', failed: 'Fallido' })[job.status]}
            <p>{new Date(job.createdAt).toLocaleString('es-MX')}</p>
            {job.status === 'uploading' && job.uploadRequestId && <button disabled={historyBusy || transcription.busy} onClick={() => { resumeRequestId.current = job.uploadRequestId; resumeInput.current?.click(); }}>Reanudar carga de {job.fileName}</button>}
            {job.status !== 'failed' && job.status !== 'uploading' && <button disabled={historyBusy || transcription.busy} onClick={() => void transcription.resume(job.job_id, job.fileName)}>{job.status === 'completed' ? 'Abrir transcripción' : 'Reanudar trabajo'}</button>}{' '}
            {job.status === 'completed' && <button disabled={historyBusy || transcription.busy} onClick={() => void downloadSaved(job.job_id)}>Descargar transcripción</button>}{' '}
            <button disabled={historyBusy || transcription.busy} onClick={() => void remove(job.job_id)}>Eliminar copia de LexIA</button>
          </article>)}
          {cursor && <button disabled={historyBusy || transcription.busy} onClick={() => void history(true)}>Más trabajos</button>}
        </section>
      </div>
    </main>
  );
}
