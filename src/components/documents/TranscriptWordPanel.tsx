import { useEffect, useMemo, useRef, useState } from 'react';
import { hashText } from '../../../shared/documentIntegrity';
import { parseWordFormat } from '../../../shared/wordFormatting';
import type { WordFormat, WordProfileId } from '../../../shared/wordFormatting';
import { transcriptWordReviewHash } from '../../../shared/transcriptWord';
import type { TranscriptWordReceipt, TranscriptWordRequest, TranscriptWordState } from '../../../shared/transcriptWord';
import { TranscriptWordClient } from '../../services/TranscriptWordClient';
import { OfficialMarkReview } from './OfficialMarkReview';

interface Props { jobId: string; sourceText: string; client?: TranscriptWordClient }
const profileLabels: Record<WordProfileId, string> = {
  transcript647: 'Transcripción literal · formato 647', judicial: 'Judicial · interlineado 1,5', judicialDouble: 'Judicial · interlineado doble',
};

/** Open the owner-checked Word workflow explicitly, including for sources too large for the editor. */
export function TranscriptWordPanel(props: Props) {
  const [open, setOpen] = useState(false);
  return <section aria-label="Word y conservación de la transcripción" style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid #cbd5e1', borderRadius: '0.75rem' }}>
    <h3>Word y conservación de la transcripción</h3>
    {!open ? <button type="button" onClick={() => setOpen(true)}>Revisar y preparar Word</button>
      : <TranscriptWordWorkflow key={props.jobId} {...props} />}
  </section>;
}

function TranscriptWordWorkflow({ jobId, sourceText, client: provided }: Props) {
  const [client] = useState(() => provided ?? new TranscriptWordClient());
  const source = useMemo(() => sourceText.replace(/\r\n?/g, '\n'), [sourceText]);
  const active = useRef<AbortController | null>(null);
  const [state, setState] = useState<TranscriptWordState | null>(null);
  const [loadedSource, setLoadedSource] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<WordFormat>({ profile: 'transcript647', marks: [] });
  const [caseNumber, setCaseNumber] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [downloaded, setDownloaded] = useState<TranscriptWordReceipt | null>(null);
  const [savedConfirmed, setSavedConfirmed] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    active.current = controller;
    void client.state(jobId, controller.signal).then(next => {
      if (active.current !== controller || controller.signal.aborted) return;
      const selectedFormat = next.artifact ? parseWordFormat(source, next.artifact.format) : { profile: 'transcript647' as const, marks: [] };
      setState(next); setLoadedSource(source); setFormat(selectedFormat); setCaseNumber(next.artifact?.caseNumber ?? '');
      setReviewed(false); setDownloaded(null); setSavedConfirmed(false); setDeleteArmed(false); setError(''); setNotice('');
    }).catch(failure => {
      if (active.current === controller && !controller.signal.aborted) setError(failure instanceof Error ? failure.message : 'No se pudo consultar el Word guardado.');
    }).finally(() => {
      if (active.current === controller) { active.current = null; setLoading(false); setBusy(false); }
    });
    return () => { active.current?.abort(); active.current = null; };
  }, [client, jobId, source, loadAttempt]);

  const ready = state !== null && loadedSource === source && !loading;
  const artifact = ready ? state.artifact : null;
  const currentFormat = format;
  const artifactMatches = !!artifact && artifact.sourceHash === state!.transcript.sha256
    && JSON.stringify(artifact.format) === JSON.stringify(currentFormat) && (artifact.caseNumber ?? '') === caseNumber;
  const canDownload = ready && reviewed && artifactMatches && !busy;
  const canDelete = canDownload && downloaded?.artifactId === artifact?.artifactId && downloaded?.artifactHash === artifact?.artifactHash
    && savedConfirmed && state?.remoteDeletion.status === 'not_requested';
  const resetApproval = () => {
    setReviewed(false); setDownloaded(null); setSavedConfirmed(false); setDeleteArmed(false); setNotice(''); setError('');
  };
  const request = (): TranscriptWordRequest => ({ sourceHash: state!.transcript.sha256, reviewed: true,
    format: parseWordFormat(source, currentFormat), ...(caseNumber ? { caseNumber } : {}) });
  const operation = () => {
    if (active.current || !ready) return null;
    const controller = new AbortController(); active.current = controller;
    setBusy(true); setError(''); setNotice('');
    return { controller, current: () => active.current === controller && !controller.signal.aborted,
      finish: () => { if (active.current === controller) { active.current = null; setBusy(false); } } };
  };

  const create = async () => {
    if (!reviewed) return;
    const run = operation(); if (!run) return;
    setDownloaded(null); setSavedConfirmed(false); setDeleteArmed(false);
    try {
      const selected = request();
      const expectedReview = await transcriptWordReviewHash(selected);
      const expectedContent = await hashText(source);
      if (!run.current()) return;
      const next = await client.create(jobId, selected, run.controller.signal);
      if (!run.current()) return;
      if (!next.artifact || next.artifact.sourceHash !== selected.sourceHash || next.artifact.reviewHash !== expectedReview
        || next.artifact.contentHash !== expectedContent) throw new Error('El Word no coincide con la fuente y presentación revisadas.');
      setState(next); setNotice('Word íntegro verificado y guardado. Ya puedes descargarlo.');
    } catch (failure) { if (run.current()) setError(failure instanceof Error ? failure.message : 'No se pudo crear el Word. La fuente se conserva.'); }
    finally { run.finish(); }
  };
  const download = async () => {
    if (!canDownload || !artifact) return;
    const run = operation(); if (!run) return;
    setDownloaded(null); setSavedConfirmed(false); setDeleteArmed(false);
    try {
      if (artifact.contentHash !== await hashText(source) || artifact.reviewHash !== await transcriptWordReviewHash(request())) throw new Error('Revisa y genera el Word de la presentación actual antes de descargar.');
      if (!run.current()) return;
      const receipt = await client.download(jobId, artifact, run.controller.signal);
      if (!run.current()) return;
      setDownloaded(receipt); setNotice('Descarga preparada con integridad verificada. Confirma después que guardaste el archivo en tu dispositivo.');
    } catch (failure) { if (run.current()) setError(failure instanceof Error ? failure.message : 'No se pudo descargar el Word.'); }
    finally { run.finish(); }
  };
  const deleteRemote = async () => {
    if (!canDelete || !deleteArmed || !downloaded) return;
    const run = operation(); if (!run) return;
    setDeleteArmed(false);
    try {
      const remoteDeletion = await client.deleteRemote(jobId, downloaded, run.controller.signal);
      if (!run.current()) return;
      setState(previous => previous ? { ...previous, remoteDeletion } : previous);
      setNotice(remoteDeletion.status === 'deleted' ? 'Video remoto eliminado. La transcripción y el Word permanecen guardados en LexIA.'
        : 'El resultado del borrado requiere comprobación. La transcripción y el Word se conservan.');
    } catch (failure) {
      if (run.current()) {
        setState(previous => previous ? { ...previous, remoteDeletion: { status: 'unknown', artifactId: downloaded.artifactId } } : previous);
        setError(`${failure instanceof Error ? failure.message : 'No se pudo confirmar el borrado remoto.'} Comprueba el resultado antes de continuar; la fuente y el Word se conservan.`);
      }
    } finally { run.finish(); }
  };
  const reconcile = async () => {
    const run = operation(); if (!run) return;
    try {
      const remoteDeletion = await client.reconcile(jobId, run.controller.signal);
      if (!run.current()) return;
      setState(previous => previous ? { ...previous, remoteDeletion } : previous);
      setNotice(remoteDeletion.status === 'deleted' ? 'Borrado remoto confirmado. La transcripción y el Word se conservan.' : 'Estado consultado. No se solicitó otro borrado.');
    } catch (failure) { if (run.current()) setError(failure instanceof Error ? failure.message : 'No se pudo comprobar el resultado.'); }
    finally { run.finish(); }
  };

  return <div>
    <p>El Word conserva la fuente literal completa. El marcado y los datos del formato requieren revisión. Límite del DOCX guardado: 4 MiB; no se recorta la transcripción.</p>
    {!ready && !error && <p role="status">Consultando el Word guardado…</p>}
    {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!ready && error && <button type="button" onClick={() => { setLoading(true); setError(''); setLoadAttempt(attempt => attempt + 1); }}>Volver a consultar estado</button>}
    <details><summary>Fuente literal completa para revisar</summary><textarea aria-label="Fuente literal completa para Word" readOnly value={source} style={{ width: '100%', minHeight: '180px' }} /></details>
    <label>Perfil Word <select aria-label="Perfil Word de transcripción" value={format.profile} disabled={!ready || busy} onChange={event => { resetApproval(); setFormat(previous => ({ ...previous, profile: event.target.value as WordProfileId })); }}>
      {Object.entries(profileLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select></label>{' '}
    <label>Juzgado (opcional) <input aria-label="Juzgado para Word de transcripción" maxLength={300} value={format.court ?? ''} disabled={!ready || busy}
      onChange={event => { resetApproval(); const court = event.target.value; setFormat(previous => ({ profile: previous.profile, marks: previous.marks, ...(court ? { court } : {}) })); }} /></label>{' '}
    <label>Expediente (opcional) <input aria-label="Expediente para Word de transcripción" maxLength={100} value={caseNumber} disabled={!ready || busy}
      onChange={event => { resetApproval(); setCaseNumber(event.target.value); }} /></label>
    <OfficialMarkReview text={source} marks={format.marks} disabled={!ready || busy} onChange={marks => { resetApproval(); setFormat(previous => ({ ...previous, marks })); }} />
    <label style={{ display: 'block', marginTop: '1rem' }}><input type="checkbox" disabled={!ready || busy} checked={reviewed && ready}
      onChange={event => { setReviewed(event.target.checked); setDownloaded(null); setSavedConfirmed(false); setDeleteArmed(false); }} />He revisado la fuente completa, el formato y el marcado oficial.</label>
    <button type="button" disabled={!ready || busy || !reviewed} onClick={() => void create()}>Generar y guardar Word verificado</button>{' '}
    <button type="button" disabled={!canDownload} onClick={() => void download()}>Descargar Word verificado</button>
    {artifact && <p>Word guardado: {artifact.fileName}. La fuente permanece disponible.</p>}
    {downloaded && <label style={{ display: 'block', marginTop: '1rem' }}><input type="checkbox" disabled={busy} checked={savedConfirmed}
      onChange={event => { setSavedConfirmed(event.target.checked); setDeleteArmed(false); }} />He guardado el Word descargado en mi dispositivo.</label>}
    <button type="button" disabled={!canDelete} onClick={() => setDeleteArmed(true)}>Eliminar video remoto</button>
    {deleteArmed && <div role="group" aria-label="Confirmación de borrado remoto"><p>¿Confirmas eliminar el video remoto? La transcripción y el Word seguirán guardados en LexIA.</p>
      <button type="button" disabled={!canDelete} onClick={() => void deleteRemote()}>Confirmar eliminación remota</button>{' '}
      <button type="button" disabled={busy} onClick={() => setDeleteArmed(false)}>Conservar video</button>
    </div>}
    {ready && ['pending', 'unknown', 'failed'].includes(state.remoteDeletion.status) && <button type="button" disabled={busy} onClick={() => void reconcile()}>Comprobar resultado</button>}
    {ready && state.remoteDeletion.status === 'deleted' && <p role="status">Video remoto eliminado; fuente y Word conservados.</p>}
  </div>;
}
