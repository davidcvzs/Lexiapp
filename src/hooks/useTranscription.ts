import { useCallback, useEffect, useRef, useState } from 'react';
import { TranscriptionService } from '../services/TranscriptionService';
import type { TranscriptionProgress, UploadIdentity } from '../services/TranscriptionService';
import { ApiError } from '../services/ApiClient';
import type { TranscriptionStatus } from '../../shared/transcription';

const statusLabels: Record<TranscriptionStatus | 'uploading', string> = {
  uploading: 'Cargando archivo…', queued: 'Transcripción en espera…',
  processing: 'Procesando audio…', generating_transcript: 'Generando transcripción…',
  completed: 'Transcripción completada.', failed: 'La transcripción falló.',
  recovering_transcript: 'Recuperando segmentos de la transcripción…',
};

interface PendingUpload { requestId: string; kind: 'direct' | 'multipart' }
const pendingKey = 'lexia.transcription.pending.v1';

/** Store only an opaque request pointer; file names and signed upload URLs stay in memory. */
function savedPending(): PendingUpload | null {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(pendingKey) || 'null');
    return value && typeof value.requestId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.requestId)
      && ['direct', 'multipart'].includes(value.kind) ? { requestId: value.requestId, kind: value.kind } : null;
  } catch { return null; }
}

/** Own request lifetime, preserve previous results, and resume polling without re-upload. */
export function useTranscription(providedService?: TranscriptionService) {
  const [defaultService] = useState(() => new TranscriptionService());
  const service = providedService ?? defaultService;
  const active = useRef<AbortController | null>(null);
  const lastFile = useRef<File | null>(null);
  const fileName = useRef('audiencia');
  const jobId = useRef<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(savedPending);
  const pending = useRef(pendingUpload);
  const [uploadIdentity, setUploadIdentity] = useState<UploadIdentity | null>(null);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [canRetry, setCanRetry] = useState(pendingUpload?.kind === 'multipart');
  const [result, setResult] = useState<{ text: string; fileName: string; jobId: string } | null>(null);

  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);

  const rememberPending = useCallback((value: PendingUpload | null) => {
    pending.current = value;
    setPendingUpload(value);
    try {
      if (value) window.sessionStorage.setItem(pendingKey, JSON.stringify(value));
      else window.sessionStorage.removeItem(pendingKey);
    } catch { /* Re-upload protection still works in memory when storage is unavailable. */ }
  }, []);

  const run = useCallback(async (file?: File, resume?: { id: string; fileName: string; upload?: boolean }): Promise<string | undefined> => {
    if (active.current) return;
    if (file) {
      lastFile.current = file; fileName.current = file.name; jobId.current = null;
      if (!resume?.upload) { rememberPending(null); setUploadIdentity(null); }
    }
    if (resume) {
      if (resume.upload) rememberPending({ requestId: resume.id, kind: 'direct' });
      else { lastFile.current = null; jobId.current = resume.id; fileName.current = resume.fileName; rememberPending(null); setUploadIdentity(null); }
    }
    if (!lastFile.current && !jobId.current && !pending.current) return;
    if (pending.current?.kind === 'direct' && !lastFile.current) {
      setError('Reselecciona el archivo original para reanudar la carga.');
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true); setError(''); setElapsed(0); setCanRetry(false); setProgress(null);
    setStatus(jobId.current ? 'Consultando transcripción…' : 'Cargando archivo…');
    const isCurrent = () => active.current === controller && !controller.signal.aborted;
    let terminalFailure = false;
    const options = {
      signal: controller.signal,
      onJobCreated: (id: string) => { if (isCurrent()) jobId.current = id; },
      onPendingRequest: (id: string | null) => { if (isCurrent()) rememberPending(id ? { requestId: id, kind: 'multipart' } : null); },
      onUploadSession: (identity: UploadIdentity | null) => {
        if (isCurrent()) {
          setUploadIdentity(identity);
          rememberPending(identity ? { requestId: identity.requestId, kind: 'direct' } : null);
        }
      },
      onProgress: (next: TranscriptionProgress) => { if (isCurrent()) setProgress(next); },
      onStatus: (next: TranscriptionStatus | 'uploading') => {
        if (isCurrent()) {
          terminalFailure = next === 'failed';
          setStatus(statusLabels[next]);
        }
      },
    };
    try {
      const pointer = pending.current;
      const text = pointer?.kind === 'direct' ? await service.resumeUpload(pointer.requestId, lastFile.current!, options)
        : pointer?.kind === 'multipart' ? await service.resumeRequest(pointer.requestId, options)
          : jobId.current ? await service.resumeJob(jobId.current, options) : await service.processMedia(lastFile.current!, options);
      if (!isCurrent()) return;
      if (!jobId.current) throw new Error('No se pudo identificar el trabajo completado. La fuente anterior se conserva.');
      setResult({ text, fileName: fileName.current, jobId: jobId.current });
      setStatus('Transcripción completada.');
      jobId.current = null;
      rememberPending(null); setUploadIdentity(null);
      return text;
    } catch (failure) {
      if (!isCurrent()) return;
      const cannotResume = terminalFailure || (failure instanceof ApiError && [400, 403, 404, 413, 415].includes(failure.status));
      if (cannotResume) { jobId.current = null; rememberPending(null); setUploadIdentity(null); }
      setCanRetry(!cannotResume);
      setError(failure instanceof Error ? failure.message : 'No fue posible transcribir. El texto anterior se conserva.');
    } finally {
      if (active.current === controller) { active.current = null; setBusy(false); }
    }
  }, [service, rememberPending]);

  const cancel = useCallback(() => {
    active.current?.abort(); active.current = null;
    setBusy(false); setCanRetry(!!jobId.current || !!pending.current);
    setStatus(pending.current?.kind === 'direct' ? 'Carga detenida. Puedes reanudarla con el archivo original.' : 'Espera detenida. El procesamiento remoto puede continuar.');
    setError('');
  }, []);

  const clearResult = () => { setResult(null); lastFile.current = null; jobId.current = null; rememberPending(null); setUploadIdentity(null); setProgress(null); setCanRetry(false); setStatus(''); setError(''); };
  return { busy, status, error, elapsed, result, canRetry, progress, pendingUpload, uploadIdentity, start: run, retry: () => run(), cancel,
    resume: (id: string, name: string) => run(undefined, { id, fileName: name }),
    resumeUpload: (file: File, requestId?: string) => requestId || pending.current?.kind === 'direct'
      ? run(file, { id: requestId || pending.current!.requestId, fileName: file.name, upload: true }) : Promise.resolve(undefined),
    clearResult };
}
