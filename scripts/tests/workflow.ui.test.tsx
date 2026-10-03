import { taskProvenance } from './task-fixtures.js';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DocumentBuilderView } from '../../src/views/DocumentBuilderView.js';
import { TranscriptionView } from '../../src/views/TranscriptionView.js';
import { ApiClient } from '../../src/services/ApiClient.js';
import { AIAssistantService } from '../../src/services/AIAssistantService.js';
import { TranscriptionService } from '../../src/services/TranscriptionService.js';
import { fixtureDatabase } from './persistence-fixtures.js';

afterEach(cleanup);
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const audio = () => new File(['test audio'], 'prueba.wav', { type: 'audio/wav' });

function editor(ai: AIAssistantService, transcription?: TranscriptionService) {
  render(<MemoryRouter initialEntries={[{ pathname: '/document-builder', state: { transcriptionData: 'Transcripción original.' } }]}>
    <DocumentBuilderView aiService={ai} transcriptionService={transcription} databaseService={fixtureDatabase()} />
  </MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Tarea jurídica'), { target: { value: 'DECLARACION' } });
  fireEvent.change(screen.getByLabelText('Síntesis del caso'), { target: { value: 'Datos sintéticos.' } });
}

test('editor inserts a complete JSON section and preserves it on quota/empty response failures', async () => {
  let mode: 'success' | 'empty' | 'quota' = 'success';
  const ai = new AIAssistantService(new ApiClient(async () => 'token', async () =>
    mode === 'quota' ? json({ error: 'Sin saldo disponible.' }, 503) : json({ result: mode === 'empty' ? '  ' : 'Contenido completo de la primera fase.', provenance: taskProvenance() })));
  editor(ai);
  fireEvent.click(screen.getByRole('button', { name: 'Generar borrador' }));
  await screen.findByText(/Contenido completo de la primera fase/, { selector: 'div' });
  const before = screen.getByText(/Contenido completo de la primera fase/, { selector: 'div' }).textContent;
  mode = 'quota';
  fireEvent.click(screen.getByRole('button', { name: 'Generar borrador' }));
  await screen.findByRole('alert');
  assert.match(screen.getByRole('alert').textContent!, /Sin saldo/);
  assert.equal(screen.getByText(/Contenido completo de la primera fase/, { selector: 'div' }).textContent, before);
  assert.equal(screen.queryByText(/\[--- ACREDITACIÓN DEL DELITO ---\]/), null);
  mode = 'empty';
  fireEvent.click(screen.getByRole('button', { name: 'Generar borrador' }));
  await waitFor(() => assert.match(screen.getByRole('alert').textContent!, /texto válido/));
  assert.equal(screen.getByText(/Contenido completo de la primera fase/, { selector: 'div' }).textContent, before);
});

test('cancelling generation ignores late responses and permits a clean retry', async () => {
  let finish: ((response: Response) => void) | undefined;
  let calls = 0;
  const ai = new AIAssistantService(new ApiClient(async () => 'token', async () => {
    calls++;
    return calls === 1 ? new Promise<Response>(resolve => { finish = resolve; }) : json({ result: 'Reintento correcto.', provenance: taskProvenance() });
  }));
  editor(ai);
  fireEvent.click(screen.getByRole('button', { name: 'Generar borrador' }));
  await waitFor(() => assert.ok(finish));
  fireEvent.click(screen.getByRole('button', { name: 'Detener generación' }));
  await act(async () => { finish!(json({ result: 'Texto tardío que debe ignorarse.' })); });
  assert.equal(screen.queryByText(/Texto tardío/), null);
  fireEvent.click(screen.getByRole('button', { name: 'Generar borrador' }));
  await screen.findByText(/Reintento correcto/, { selector: 'div' });
  assert.deepEqual(ai.getState().userInstructions.length, 1);
});

test('editor uploads a real file, appends valid text, and preserves the source on failure', async () => {
  let fail = false;
  const api = new ApiClient(async () => 'token', async (_url, options) => {
    assert.ok(options?.body instanceof FormData);
    assert.equal((options.body.get('file') as File).name, 'prueba.wav');
    return fail ? json({ error: 'Proveedor no disponible.' }, 502) : json({ job_id: 'j', status: 'completed', text: 'Nueva transcripción válida.' });
  });
  editor(new AIAssistantService(), new TranscriptionService(api));
  fireEvent.change(screen.getByLabelText('Cargar audio al editor'), { target: { files: [audio()] } });
  await waitFor(() => assert.equal((screen.getByLabelText('Transcripción íntegra') as HTMLTextAreaElement).value, 'Transcripción original.\n\nNueva transcripción válida.'));
  fail = true;
  fireEvent.change(screen.getByLabelText('Cargar audio al editor'), { target: { files: [audio()] } });
  await screen.findByRole('alert');
  assert.equal((screen.getByLabelText('Transcripción íntegra') as HTMLTextAreaElement).value, 'Transcripción original.\n\nNueva transcripción válida.');
  assert.equal(screen.queryByText(/TRANSCRIPCIÓN FALLBACK/), null);
});

test('transcription view stops polling, resumes the same job and never invents speaker labels', async () => {
  let uploads = 0;
  let polls = 0;
  const api = new ApiClient(async () => 'token', async (url, options) => {
    if (url === '/api/transcription/jobs' && options?.method !== 'POST') return json({ jobs: [], nextCursor: null });
    if (options?.method === 'POST') { uploads++; return json({ job_id: 'j', status: 'queued' }); }
    polls++; return json({ job_id: 'j', status: 'completed', text: 'Texto literal recuperado.' });
  });
  render(<MemoryRouter><TranscriptionView service={new TranscriptionService(api, { pollMs: 60_000 })} /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Archivo de audiencia'), { target: { files: [audio()] } });
  await screen.findByText('Transcripción en espera…');
  fireEvent.click(screen.getByRole('button', { name: 'Detener espera' }));
  assert.equal(polls, 0);
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar / reanudar' }));
  await screen.findByText('Texto literal recuperado.');
  assert.equal(uploads, 1); assert.equal(polls, 1);
  assert.equal(screen.queryByText('Juez de Control'), null);
  assert.equal(screen.queryByText(/Expediente: 123/), null);
  assert.ok(screen.getByRole('button', { name: 'Continuar al editor' }));
});

test('leaving a transcription screen aborts the active request', async () => {
  let requestSignal: AbortSignal | null | undefined;
  const api = new ApiClient(async () => 'token', async (url, options) => {
    if (url === '/api/transcription/jobs' && options?.method !== 'POST') return json({ jobs: [], nextCursor: null });
    requestSignal = options?.signal;
    return new Promise<Response>(() => {});
  });
  const view = render(<MemoryRouter><TranscriptionView service={new TranscriptionService(api)} /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Archivo de audiencia'), { target: { files: [audio()] } });
  await waitFor(() => assert.ok(requestSignal));
  view.unmount();
  assert.equal(requestSignal?.aborted, true);
});

test('completed transcription passes through navigation to the editor and into the generated phase', async () => {
  let instruction = '';
  const api = new ApiClient(async () => 'token', async (url, options) => {
    if (url === '/api/transcription/jobs' && options?.method !== 'POST') return json({ jobs: [], nextCursor: null });
    if (url === '/api/transcription/jobs') return json({ job_id: 'handoff', status: 'completed', text: 'Fuente íntegra de prueba.' });
    instruction = JSON.stringify(JSON.parse(options?.body as string));
    return json({ result: 'Fase generada a partir de la fuente.', provenance: taskProvenance() });
  });
  render(<MemoryRouter initialEntries={['/transcription']}><Routes>
    <Route path="/transcription" element={<TranscriptionView service={new TranscriptionService(api)} />} />
    <Route path="/document-builder" element={<DocumentBuilderView aiService={new AIAssistantService(api)} databaseService={fixtureDatabase()} />} />
  </Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Archivo de audiencia'), { target: { files: [audio()] } });
  await screen.findByText('Fuente íntegra de prueba.');
  fireEvent.click(screen.getByRole('button', { name: 'Continuar al editor' }));
  assert.equal((screen.getByLabelText('Transcripción íntegra') as HTMLTextAreaElement).value, 'Fuente íntegra de prueba.');
  fireEvent.change(screen.getByLabelText('Tarea jurídica'), { target: { value: 'DECLARACION' } });
  fireEvent.change(screen.getByLabelText('Síntesis del caso'), { target: { value: 'Síntesis sintética.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generar borrador' }));
  await screen.findByText(/Fase generada a partir de la fuente/, { selector: 'div' });
  assert.match(instruction, /Fuente íntegra de prueba\./);
  assert.match(instruction, /Síntesis sintética\./);
});
