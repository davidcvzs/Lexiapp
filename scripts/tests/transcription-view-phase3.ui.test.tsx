import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TranscriptionView } from '../../src/views/TranscriptionView.js';
import { TranscriptionService } from '../../src/services/TranscriptionService.js';
import { ApiClient } from '../../src/services/ApiClient.js';
import type { UploadIdentity } from '../../src/services/TranscriptionService.js';

afterEach(() => { cleanup(); window.sessionStorage.clear(); });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const audio = () => new File(['synthetic-media'], 'synthetic.wav', { type: 'audio/wav' });

function ReceivedSource() {
  const location = useLocation();
  return <><output aria-label="Fuente recibida">{location.state?.transcriptionData}</output><output aria-label="Tarea recibida">{location.state?.taskIntent?.taskId}</output></>;
}

function Location() { const location = useLocation(); return <output aria-label="Ruta actual">{location.pathname}</output>; }

function screenWithService(service: TranscriptionService) {
  return render(<MemoryRouter initialEntries={['/transcription']}><Location /><Routes>
    <Route path="/transcription" element={<TranscriptionView service={service} />} />
    <Route path="/document-builder" element={<ReceivedSource />} />
  </Routes></MemoryRouter>);
}

function serviceWithSource(text: string) {
  return new TranscriptionService(new ApiClient(async () => 'synthetic-token', async (input, options) => {
    assert.equal(input, '/api/transcription/jobs', 'Navigating to the editor must not call a generation provider.');
    return options?.method === 'POST' ? json({ job_id: 'literal-source', status: 'completed', text }) : json({ jobs: [], nextCursor: null });
  }));
}

for (const [label, source] of [
  ['more than 500000 characters', 'Fuente sintética literal. '.repeat(20_100)],
  ['a smaller character count whose UTF8 saved draft is too large', 'Á'.repeat(200_000)],
] as const) {
  test(`transcription view blocks handoff for ${label} and downloads the complete source`, async () => {
    screenWithService(serviceWithSource(source));
    fireEvent.change(screen.getByLabelText('Archivo de audiencia'), { target: { files: [audio()] } });
    const region = await screen.findByRole('region', { name: 'Transcripción completada' });
    const handoff = screen.getByRole('button', { name: 'Continuar al editor' }) as HTMLButtonElement;
    assert.equal(handoff.disabled, true);
    assert.equal(screen.queryByRole('region', { name: 'Tareas posteriores a la transcripción' }), null);
    assert.ok(screen.getByText(/La fuente completa supera el tamaño del redactor/));
    const preview = region.querySelector('div[style*="white-space"]');
    assert.equal(preview?.textContent, source.slice(0, 30_000));
    assert.ok(screen.getByText(/Vista previa de los primeros 30 000 caracteres/));
    fireEvent.click(handoff);
    assert.equal(screen.getByLabelText('Ruta actual').textContent, '/transcription');
    assert.equal(screen.queryByLabelText('Fuente recibida'), null);
    let downloaded: Blob | undefined;
    let filename = '';
    const originalCreate = URL.createObjectURL;
    const originalClick = HTMLAnchorElement.prototype.click;
    URL.createObjectURL = blob => { assert.ok(blob instanceof Blob); downloaded = blob; return 'blob:synthetic-download'; };
    HTMLAnchorElement.prototype.click = function () { filename = this.download; };
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Descargar texto' }));
      assert.ok(downloaded);
      assert.equal(await downloaded.text(), source);
      assert.equal(filename, 'synthetic-transcripcion.txt');
    } finally { URL.createObjectURL = originalCreate; HTMLAnchorElement.prototype.click = originalClick; }
  });
}

test('a fitting literal source reaches the editor complete and only after the user chooses a task', async () => {
  const source = '  [00:00:01.000 → 00:00:02.000] (Persona identificada)\nTexto literal.\nSin resumir.  ';
  screenWithService(serviceWithSource(source));
  fireEvent.change(screen.getByLabelText('Archivo de audiencia'), { target: { files: [audio()] } });
  await screen.findByRole('region', { name: 'Transcripción completada' });
  assert.equal(screen.getByLabelText('Ruta actual').textContent, '/transcription');
  assert.equal((screen.getByRole('button', { name: 'Continuar al editor' }) as HTMLButtonElement).disabled, false);
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar Acta' }));
  await waitFor(() => assert.equal(screen.getByLabelText('Ruta actual').textContent, '/document-builder'));
  assert.equal(screen.getByLabelText('Fuente recibida').textContent, source);
  assert.equal(screen.getByLabelText('Tarea recibida').textContent, 'ACTA');
});

test('a fitting literal source also reaches the editor unchanged through the generic continue button', async () => {
  const source = '  Fuente íntegra\ncon espacios y saltos originales.  ';
  screenWithService(serviceWithSource(source));
  fireEvent.change(screen.getByLabelText('Archivo de audiencia'), { target: { files: [audio()] } });
  fireEvent.click(await screen.findByRole('button', { name: 'Continuar al editor' }));
  await waitFor(() => assert.equal(screen.getByLabelText('Ruta actual').textContent, '/document-builder'));
  assert.equal(screen.getByLabelText('Fuente recibida').textContent, source);
  assert.equal(screen.getByLabelText('Tarea recibida').textContent, '');
});

test('a stored incomplete direct upload requires file reselection and resumes that request without POST', async () => {
  const file = new File(['synthetic-video'], 'stored.mov', { type: 'video/quicktime', lastModified: 42 });
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer())), value => value.toString(16).padStart(2, '0')).join('');
  const upload: UploadIdentity = { requestId: '12ec17e4-83bf-4258-9e41-d4bedfe33676', filename: file.name, size: file.size, mime: file.type, lastModified: file.lastModified, fingerprint };
  let patch = false;
  let restoredSession = 0;
  const service = new TranscriptionService(new ApiClient(async () => 'token', async (input, options) => {
    assert.notEqual(options?.method, 'POST');
    if (input === '/api/transcription/jobs') return json({ jobs: [{ job_id: 'stored-direct', status: patch ? 'completed' : 'uploading', fileName: file.name,
      uploadRequestId: upload.requestId, createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' }], nextCursor: null });
    if (input === `/api/transcription/uploads/${upload.requestId}`) { restoredSession++; return json({ job_id: 'stored-direct', status: 'uploading', upload: { ...upload, url: 'https://upload.videodelivery.net/tus/synthetic-capability' } }); }
    assert.equal(input, '/api/transcription/jobs/stored-direct');
    return patch ? json({ job_id: 'stored-direct', status: 'completed', text: 'Fuente reanudada.' }) : json({ job_id: 'stored-direct', status: 'uploading' });
  }), { directFetch: async (_input, options) => {
    if (options?.method === 'HEAD') return new Response(null, { status: 204, headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': '0', 'Upload-Length': String(file.size) } });
    assert.equal(options?.method, 'PATCH');
    patch = true;
    return new Response(null, { status: 204, headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': String(file.size) } });
  } });
  screenWithService(service);
  const button = await screen.findByRole('button', { name: `Reanudar carga de ${file.name}` });
  assert.equal(screen.queryByRole('button', { name: 'Reanudar trabajo' }), null);
  fireEvent.click(button);
  assert.equal(restoredSession, 0, 'Picking a saved upload must wait for an explicit File reselection.');
  fireEvent.change(screen.getByLabelText('Archivo original para reanudar carga'), { target: { files: [file] } });
  await screen.findByText('Fuente reanudada.');
  assert.equal(restoredSession, 1);
  assert.ok(screen.getByText('Carga del archivo: 100%'));
  assert.equal(patch, true);
});

test('large-file picker states the current limit and leaves the previous source intact when direct upload is unavailable', async () => {
  let capabilityChecks = 0;
  const service = new TranscriptionService(new ApiClient(async () => 'token', async (input, options) => {
    if (String(input).endsWith('/capabilities')) { capabilityChecks++; return json({ directUploadEnabled: false, directMaxBytes: 0 }); }
    assert.equal(input, '/api/transcription/jobs');
    return options?.method === 'POST' ? json({ job_id: 'small', status: 'completed', text: 'Fuente anterior conservada.' }) : json({ jobs: [], nextCursor: null });
  }));
  screenWithService(service);
  fireEvent.change(screen.getByLabelText('Archivo de audiencia'), { target: { files: [audio()] } });
  await screen.findByText('Fuente anterior conservada.');
  const large = new File(['synthetic'], 'large.mp4', { type: 'video/mp4' });
  Object.defineProperty(large, 'size', { value: 101 * 1024 * 1024 });
  fireEvent.change(screen.getByLabelText('Archivo de audiencia'), { target: { files: [large] } });
  await waitFor(() => assert.match(screen.getByRole('alert').textContent!, /límite actual es de 100 MiB/));
  assert.equal(capabilityChecks, 1);
  assert.ok(screen.getByText('Fuente anterior conservada.'));
  assert.ok(screen.getByText(/2 GiB cuando esté habilitada la carga directa reanudable/));
});
