import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiClient } from '../../src/services/ApiClient.js';
import { TranscriptWordClient } from '../../src/services/TranscriptWordClient.js';
import { TranscriptionService } from '../../src/services/TranscriptionService.js';
import { TranscriptWordPanel } from '../../src/components/documents/TranscriptWordPanel.js';
import { OfficialMarkReview } from '../../src/components/documents/OfficialMarkReview.js';
import { TranscriptionView } from '../../src/views/TranscriptionView.js';
import { hashText } from '../../shared/documentIntegrity.js';
import { MAX_WORD_ARTIFACT_BYTES, transcriptWordReviewHash } from '../../shared/transcriptWord.js';
import type { RemoteDeletionStatus, TranscriptWordReceipt, TranscriptWordRequest } from '../../shared/transcriptWord.js';
import type { OfficialMark } from '../../shared/officialMarking.js';

afterEach(() => { cleanup(); window.sessionStorage.clear(); });
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const originalSource = '[00:00:00.000 → 00:00:01.000]\r\nPersona sintética de dieciséis años de edad.\r\nÚltima intervención íntegra.';
const normalized = (text: string) => text.replace(/\r\n?/g, '\n');

function fixture(source = originalSource, artifactByteLength?: number) {
  const bytes = artifactByteLength ? new Uint8Array(artifactByteLength).fill(65) : new TextEncoder().encode('synthetic-DOCX-bytes-unchanged');
  const manifest = { segmentCount: 2, sha256: 'a'.repeat(64), language: 'es', verified: true, formatVersion: 1 };
  let artifact: TranscriptWordReceipt | null = null;
  let remoteStatus: RemoteDeletionStatus = 'not_requested';
  let createCalls = 0, deleteCalls = 0, reconcileCalls = 0;
  let downloadMode: 'valid' | 'corrupt' | 'different' | 'format-tampered' | 'case-tampered' | 'oversized' | 'failed' = 'valid';
  let createStatus = 200, deleteStatus = 200;
  let deleteResult: RemoteDeletionStatus = 'deleted';
  let onCreate: (() => Promise<void>) | undefined;
  let saved: { blob: Blob; name: string } | undefined;
  let saveFailure = false;
  let reorderedTransport = false;
  let lastRequest: TranscriptWordRequest | undefined;
  const paths: string[] = [];
  const makeArtifact = async (jobId: string, request: TranscriptWordRequest) => {
    const reviewHash = await transcriptWordReviewHash(request);
    const binaryHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
    return { jobId, artifactId: await hashText(jobId + reviewHash), sourceHash: manifest.sha256, contentHash: await hashText(normalized(source)),
      artifactHash: binaryHash, byteLength: bytes.byteLength, fileName: 'transcripcion_sintetica.docx', createdAt: '2026-10-02T00:00:00.000Z',
      reviewHash, format: request.format, ...(request.caseNumber ? { caseNumber: request.caseNumber } : {}) };
  };
  const transportArtifact = () => !artifact || !reorderedTransport ? artifact : { ...artifact, format: {
    marks: artifact.format.marks.map(mark => ({ category: mark.category, end: mark.end, start: mark.start })),
    ...(artifact.format.court === undefined ? {} : { court: artifact.format.court }), profile: artifact.format.profile,
  } };
  const state = () => ({ artifact: transportArtifact(), remoteDeletion: { status: remoteStatus, ...(artifact ? { artifactId: artifact.artifactId } : {}) }, transcript: manifest, fileName: 'synthetic.mp4' });
  const api = new ApiClient(async () => 'synthetic-firebase-token', async (input, options) => {
    const path = String(input); paths.push(`${options?.method ?? 'GET'} ${path}`);
    assert.ok(path.startsWith('/api/transcription/'), 'These tests must never invoke an AI/provider endpoint.');
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer synthetic-firebase-token');
    if (path === '/api/transcription/jobs') return options?.method === 'POST'
      ? json({ job_id: 'job-one', status: 'completed', text: source }) : json({ jobs: [], nextCursor: null });
    const match = /^\/api\/transcription\/jobs\/([^/]+)\/(word(?:\/download)?|remote-video(?:\/reconcile)?)$/.exec(path);
    assert.ok(match, `Unexpected mocked path ${path}`);
    const [, jobId, action] = match;
    if (action === 'word' && options?.method === 'POST') {
      createCalls++; lastRequest = JSON.parse(options.body as string) as TranscriptWordRequest;
      assert.equal(lastRequest.reviewed, true); assert.equal(lastRequest.sourceHash, manifest.sha256);
      assert.equal('text' in lastRequest, false, 'Word generation must use the durable complete server source.');
      if (onCreate) await onCreate();
      if (createStatus !== 200) return json({ error: 'No se pudo guardar el Word sintético.' }, createStatus);
      artifact = await makeArtifact(jobId, lastRequest);
      return json(state());
    }
    if (action === 'word') return json(state());
    if (action === 'word/download') {
      assert.ok(artifact);
      if (downloadMode === 'failed') return json({ error: 'La descarga sintética falló.' }, 503);
      const base64 = downloadMode === 'oversized' ? 'A'.repeat(Math.ceil(MAX_WORD_ARTIFACT_BYTES / 3) * 4 + 4)
        : btoa(downloadMode === 'corrupt' ? 'B'.repeat(bytes.byteLength) : new TextDecoder().decode(bytes));
      const returned = downloadMode === 'different' ? { ...artifact, artifactId: 'b'.repeat(64) }
        : downloadMode === 'format-tampered' ? { ...artifact, format: { ...artifact.format, profile: 'judicial' } }
          : downloadMode === 'case-tampered' ? { ...artifact, caseNumber: 'EXPEDIENTE-ALTERADO' } : transportArtifact();
      return json({ artifact: returned, base64 });
    }
    if (action === 'remote-video/reconcile') {
      assert.equal(options?.method, 'POST'); reconcileCalls++; remoteStatus = 'deleted';
      return json({ status: remoteStatus, artifactId: artifact!.artifactId });
    }
    assert.equal(options?.method, 'DELETE'); deleteCalls++;
    assert.deepEqual(JSON.parse(options.body as string), { artifactId: artifact!.artifactId, artifactHash: artifact!.artifactHash, downloadConfirmed: true, confirm: true });
    remoteStatus = deleteStatus === 200 ? deleteResult : 'unknown';
    return deleteStatus === 200 ? json({ status: remoteStatus, artifactId: artifact!.artifactId }) : json({ error: 'Resultado remoto no confirmado.' }, deleteStatus);
  });
  const client = new TranscriptWordClient(api, (blob, name) => { if (saveFailure) throw new Error('No se pudo iniciar la descarga local.'); saved = { blob, name }; });
  return { api, client, bytes, paths, source, state, artifact: () => artifact, saved: () => saved, calls: () => ({ createCalls, deleteCalls, reconcileCalls }), request: () => lastRequest,
    setDownloadMode: (mode: typeof downloadMode) => { downloadMode = mode; }, setCreateStatus: (status: number) => { createStatus = status; },
    setDeleteStatus: (status: number) => { deleteStatus = status; }, setDeleteResult: (status: RemoteDeletionStatus) => { deleteResult = status; },
    deferCreate: (callback: () => Promise<void>) => { onCreate = callback; }, failSave: () => { saveFailure = true; },
    reorderTransport: () => { reorderedTransport = true; },
    prepare: async (jobId = 'job-one', request: TranscriptWordRequest = { sourceHash: manifest.sha256, reviewed: true, format: { profile: 'transcript647', marks: [] } }) => { artifact = await makeArtifact(jobId, request); } };
}
type Fixture = ReturnType<typeof fixture>;
const reviewed = () => screen.getByRole('checkbox', { name: 'He revisado la fuente completa, el formato y el marcado oficial.' }) as HTMLInputElement;
const remoteButton = () => screen.getByRole('button', { name: 'Eliminar video remoto' }) as HTMLButtonElement;
const downloadButton = () => screen.getByRole('button', { name: 'Descargar Word verificado' }) as HTMLButtonElement;
async function open(value: Fixture) {
  const rendered = render(<TranscriptWordPanel jobId="job-one" sourceText={value.source} client={value.client} />);
  fireEvent.click(screen.getByRole('button', { name: 'Revisar y preparar Word' }));
  await waitFor(() => assert.equal(reviewed().disabled, false));
  return rendered;
}
async function createAndDownload(value: Fixture) {
  fireEvent.click(reviewed());
  fireEvent.click(screen.getByRole('button', { name: 'Generar y guardar Word verificado' }));
  await screen.findByText('Word íntegro verificado y guardado. Ya puedes descargarlo.');
  fireEvent.click(downloadButton());
  await screen.findByRole('checkbox', { name: 'He guardado el Word descargado en mi dispositivo.' });
  assert.ok(value.saved());
}

test('Word deletion requires review, verified download, saved-file acknowledgement and a separate explicit confirmation', async () => {
  const value = fixture(); await open(value);
  assert.equal(remoteButton().disabled, true); assert.equal(downloadButton().disabled, true);
  fireEvent.click(reviewed()); assert.equal(value.calls().createCalls, 0);
  fireEvent.click(reviewed()); await createAndDownload(value);
  assert.equal(await value.saved()!.blob.text(), new TextDecoder().decode(value.bytes));
  assert.equal(value.calls().deleteCalls, 0); assert.equal(remoteButton().disabled, true);
  fireEvent.click(screen.getByRole('checkbox', { name: 'He guardado el Word descargado en mi dispositivo.' }));
  fireEvent.click(remoteButton()); assert.equal(value.calls().deleteCalls, 0);
  fireEvent.click(screen.getByRole('button', { name: 'Conservar video' })); assert.equal(value.calls().deleteCalls, 0);
  fireEvent.click(remoteButton());
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación remota' }));
  await screen.findByText('Video remoto eliminado; fuente y Word conservados.');
  assert.equal(value.calls().deleteCalls, 1);
  assert.equal((screen.getByLabelText('Fuente literal completa para Word') as HTMLTextAreaElement).value, normalized(value.source));
  assert.equal(downloadButton().disabled, false); assert.equal(remoteButton().disabled, true);
});

test('a source beyond editor limits still has its job identity and complete source available for Word without AI', async () => {
  const source = 'Fuente literal. '.repeat(34_000) + 'ÚLTIMO SEGMENTO ÍNTEGRO.';
  const value = fixture(source);
  render(<MemoryRouter><TranscriptionView service={new TranscriptionService(value.api)} wordClient={value.client} /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Archivo de audiencia'), { target: { files: [new File(['synthetic'], 'synthetic.mp4', { type: 'video/mp4' })] } });
  await screen.findByRole('region', { name: 'Transcripción completada' });
  assert.equal((screen.getByRole('button', { name: 'Continuar al editor' }) as HTMLButtonElement).disabled, true);
  fireEvent.click(screen.getByRole('button', { name: 'Revisar y preparar Word' }));
  await waitFor(() => assert.equal(reviewed().disabled, false));
  assert.equal((screen.getByLabelText('Fuente literal completa para Word') as HTMLTextAreaElement).value, source);
  await createAndDownload(value);
  assert.equal(value.artifact()!.contentHash, await hashText(source));
  assert.ok(value.paths.includes('POST /api/transcription/jobs/job-one/word')); assert.equal(value.calls().deleteCalls, 0);
});

test('generation and download failures preserve the source and never unlock remote deletion', async () => {
  const generation = fixture(); generation.setCreateStatus(503); await open(generation); fireEvent.click(reviewed());
  fireEvent.click(screen.getByRole('button', { name: 'Generar y guardar Word verificado' }));
  await screen.findByRole('alert'); assert.equal(generation.calls().deleteCalls, 0); assert.equal(downloadButton().disabled, true);
  assert.equal((screen.getByLabelText('Fuente literal completa para Word') as HTMLTextAreaElement).value, normalized(generation.source)); cleanup();
  for (const mode of ['corrupt', 'different', 'format-tampered', 'case-tampered', 'oversized', 'failed', 'local-save'] as const) {
    const value = fixture(); await value.prepare();
    if (mode === 'local-save') value.failSave(); else value.setDownloadMode(mode);
    await open(value); fireEvent.click(reviewed()); fireEvent.click(downloadButton());
    await screen.findByRole('alert'); assert.equal(remoteButton().disabled, true); assert.equal(value.calls().deleteCalls, 0);
    assert.equal(value.saved(), undefined); assert.equal(screen.queryByRole('checkbox', { name: 'He guardado el Word descargado en mi dispositivo.' }), null);
    assert.ok(value.artifact()); cleanup();
  }
});

test('format, metadata and exact red-mark changes invalidate review and the previous download proof', async () => {
  for (const change of ['profile', 'court', 'case', 'mark'] as const) {
    const value = fixture(); await open(value); await createAndDownload(value);
    fireEvent.click(screen.getByRole('checkbox', { name: 'He guardado el Word descargado en mi dispositivo.' }));
    assert.equal(remoteButton().disabled, false);
    if (change === 'profile') fireEvent.change(screen.getByLabelText('Perfil Word de transcripción'), { target: { value: 'judicial' } });
    if (change === 'court') fireEvent.change(screen.getByLabelText('Juzgado para Word de transcripción'), { target: { value: 'Juzgado sintético' } });
    if (change === 'case') fireEvent.change(screen.getByLabelText('Expediente para Word de transcripción'), { target: { value: 'TEST/2026' } });
    if (change === 'mark') {
      fireEvent.change(screen.getByLabelText('Texto exacto para marcado oficial'), { target: { value: 'Persona' } });
      fireEvent.click(screen.getByRole('checkbox', { name: /Marcar Nombres completos o parciales: Persona/ }));
    }
    assert.equal(reviewed().checked, false); assert.equal(remoteButton().disabled, true); assert.equal(downloadButton().disabled, true);
    assert.equal(screen.queryByRole('checkbox', { name: 'He guardado el Word descargado en mi dispositivo.' }), null);
    assert.equal(value.calls().deleteCalls, 0); cleanup();
  }
});

test('an ambiguous deletion uses reconciliation only and retains source and artifact through a failed DELETE', async () => {
  const value = fixture(); value.setDeleteStatus(502); await open(value); await createAndDownload(value);
  fireEvent.click(screen.getByRole('checkbox', { name: 'He guardado el Word descargado en mi dispositivo.' }));
  fireEvent.click(remoteButton()); fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación remota' }));
  await screen.findByRole('alert'); assert.equal(value.calls().deleteCalls, 1); assert.equal(remoteButton().disabled, true);
  assert.equal((screen.getByLabelText('Fuente literal completa para Word') as HTMLTextAreaElement).value, normalized(value.source));
  fireEvent.click(screen.getByRole('button', { name: 'Comprobar resultado' }));
  await screen.findByText('Video remoto eliminado; fuente y Word conservados.');
  assert.equal(value.calls().deleteCalls, 1); assert.equal(value.calls().reconcileCalls, 1); assert.equal(downloadButton().disabled, false);
});

test('pending, failed and unknown remote states never trigger a second DELETE for the artifact', async () => {
  for (const status of ['pending', 'failed', 'unknown'] as const) {
    const value = fixture(); value.setDeleteResult(status); await open(value); await createAndDownload(value);
    fireEvent.click(screen.getByRole('checkbox', { name: 'He guardado el Word descargado en mi dispositivo.' }));
    fireEvent.click(remoteButton()); fireEvent.click(screen.getByRole('button', { name: 'Confirmar eliminación remota' }));
    await screen.findByRole('button', { name: 'Comprobar resultado' });
    assert.equal(remoteButton().disabled, true); fireEvent.click(remoteButton()); assert.equal(value.calls().deleteCalls, 1);
    assert.equal(screen.queryByText('Video remoto eliminado; fuente y Word conservados.'), null); cleanup();
  }
});

test('changing the job aborts an old generation and its late response cannot approve the new source', async () => {
  const value = fixture(); let release: (() => void) | undefined;
  value.deferCreate(() => new Promise<void>(resolve => { release = resolve; }));
  const view = await open(value); fireEvent.click(reviewed());
  fireEvent.click(screen.getByRole('button', { name: 'Generar y guardar Word verificado' }));
  await waitFor(() => assert.equal(value.calls().createCalls, 1));
  view.rerender(<TranscriptWordPanel jobId="job-two" sourceText="Fuente nueva sin aprobación." client={value.client} />);
  await waitFor(() => assert.equal(reviewed().disabled, false)); release!();
  await waitFor(() => assert.equal(reviewed().checked, false));
  assert.equal((screen.getByLabelText('Fuente literal completa para Word') as HTMLTextAreaElement).value, 'Fuente nueva sin aprobación.');
  assert.equal(downloadButton().disabled, true); assert.equal(remoteButton().disabled, true); assert.equal(value.saved(), undefined);
  assert.equal(screen.queryByText('Word íntegro verificado y guardado. Ya puedes descargarlo.'), null);
});

test('reopening a durable artifact restores its exact reviewed metadata but requires a new download acknowledgement', async () => {
  const value = fixture(); await value.prepare('job-one', { sourceHash: 'a'.repeat(64), reviewed: true,
    format: { profile: 'judicialDouble', court: 'Juzgado sintético', marks: [{ start: normalized(value.source).indexOf('Persona'), end: normalized(value.source).indexOf('Persona') + 7, category: 'name' }] }, caseNumber: 'TEST/2026' });
  await open(value);
  assert.equal((screen.getByLabelText('Perfil Word de transcripción') as HTMLSelectElement).value, 'judicialDouble');
  assert.equal((screen.getByLabelText('Expediente para Word de transcripción') as HTMLInputElement).value, 'TEST/2026');
  assert.equal(reviewed().checked, false); assert.equal(remoteButton().disabled, true);
  fireEvent.click(reviewed()); fireEvent.click(downloadButton());
  await screen.findByRole('checkbox', { name: 'He guardado el Word descargado en mi dispositivo.' });
  assert.equal(remoteButton().disabled, true); assert.equal(value.calls().createCalls, 0); assert.equal(value.calls().deleteCalls, 0);
});

test('official marking uses exact supplied CRLF offsets and age proposals change nothing without a user action', () => {
  const text = 'Inicio.\r\nMaría tiene dieciséis años de edad.';
  let selected: OfficialMark[] = [], applied = '';
  render(<OfficialMarkReview text={text} marks={[]} onChange={marks => { selected = marks; }} onApplyAge={proposal => { applied = proposal.replacement; }} />);
  fireEvent.change(screen.getByLabelText('Texto exacto para marcado oficial'), { target: { value: 'María' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Marcar Nombres completos o parciales: María/ }));
  assert.deepEqual(selected, [{ start: text.indexOf('María'), end: text.indexOf('María') + 5, category: 'name' }]);
  assert.equal(applied, ''); fireEvent.click(screen.getByRole('button', { name: /Aplicar edad en/ })); assert.equal(applied, '16');
  assert.equal(text, 'Inicio.\r\nMaría tiene dieciséis años de edad.');
});

test('the Word client downloads a valid artifact at the full 4 MiB limit without recursive base64 validation', async () => {
  const value = fixture(originalSource, MAX_WORD_ARTIFACT_BYTES); await value.prepare();
  const receipt = await value.client.download('job-one', value.artifact()!);
  assert.equal(receipt.byteLength, MAX_WORD_ARTIFACT_BYTES);
  assert.equal(value.saved()!.blob.size, MAX_WORD_ARTIFACT_BYTES);
  assert.equal(value.saved()!.name, receipt.fileName);
  assert.equal(value.calls().deleteCalls, 0);
});

test('Firestore-style reordered receipt keys preserve the review hash and allow the authenticated Word download', async () => {
  const value = fixture(), text = normalized(value.source), start = text.indexOf('Persona');
  await value.prepare('job-one', { sourceHash: 'a'.repeat(64), reviewed: true, caseNumber: 'TEST-ORDEN',
    format: { profile: 'transcript647', court: 'Juzgado sintético', marks: [{ start, end: start + 7, category: 'name' }] } });
  const original = value.artifact()!; value.reorderTransport();
  assert.notEqual(JSON.stringify(value.state().artifact!.format), JSON.stringify(original.format));
  const reopened = await value.client.state('job-one'); assert.ok(reopened.artifact);
  assert.deepEqual(reopened.artifact.format, original.format);
  assert.equal(await transcriptWordReviewHash({ sourceHash: reopened.artifact.sourceHash, reviewed: true, format: reopened.artifact.format,
    caseNumber: reopened.artifact.caseNumber }), original.reviewHash);
  const downloaded = await value.client.download('job-one', reopened.artifact);
  assert.equal(downloaded.reviewHash, original.reviewHash); assert.ok(value.saved());
  assert.equal(value.saved()!.blob.size, original.byteLength); assert.equal(value.calls().deleteCalls, 0);
});
