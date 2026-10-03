import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { MemoryRouter, useLocation, Link } from 'react-router-dom';
import { DocumentBuilderView } from '../../src/views/DocumentBuilderView.js';
import { DocumentsView } from '../../src/views/DocumentsView.js';
import { TranscriptionView } from '../../src/views/TranscriptionView.js';
import { DatabaseService } from '../../src/services/DatabaseService.js';
import { TranscriptionService } from '../../src/services/TranscriptionService.js';
import { ApiClient } from '../../src/services/ApiClient.js';
import type { SavedDocument, DocumentDraft } from '../../shared/documents.js';
import { json } from './persistence-fixtures.js';

afterEach(cleanup);
const initial: DocumentDraft = { title: 'Borrador sintético', caseNumber: 'TEST-1', caseType: 'Penal', documentType: 'Sentencia Definitiva', summary: 'Datos guardados.',
  transcription: 'Fuente guardada.', content: 'Contenido guardado.', completedPhases: ['Antecedentes'], audit: { names: true, congruence: true, pii: true } };
const record = (draft = initial, revision = 1): SavedDocument => ({ ...draft, id: 'saved', revision, createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' });
function Location() { const location = useLocation(); return <output aria-label="Ubicación">{location.pathname + location.search}</output>; }
function editor(service: DatabaseService, path = '/document-builder?documentId=saved') {
  return render(<MemoryRouter initialEntries={[path]}><DocumentBuilderView databaseService={service} /><Location /></MemoryRouter>);
}
const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;

test('automatic saving confirms sources and metadata; reopening the URL recovers the same draft', async () => {
  let stored: SavedDocument | undefined;
  const service = new DatabaseService(new ApiClient(async () => 'test', async (url, options) => {
    if (options?.method === 'PUT') {
      const { draft, revision } = JSON.parse(options.body as string);
      stored = { ...record(draft, revision + 1), id: String(url).split('/').at(-1)! }; return json({ document: stored });
    }
    return json({ document: stored });
  }));
  const view = editor(service, '/document-builder');
  fireEvent.change(screen.getByLabelText('Título del documento'), { target: { value: 'Mi documento real' } });
  fireEvent.change(screen.getByLabelText('Síntesis del caso'), { target: { value: 'Fuente sintética de prueba.' } });
  fireEvent.change(screen.getByLabelText('Número de expediente'), { target: { value: 'TEST/9' } });
  await waitFor(() => assert.ok(stored), { timeout: 2500 });
  await screen.findByText('Guardado · versión 1');
  await waitFor(() => assert.match(screen.getByLabelText('Ubicación').textContent!, /documentId=/));
  const path = screen.getByLabelText('Ubicación').textContent!;
  assert.match(path, /documentId=/);
  view.unmount(); editor(service, path);
  await screen.findByText('Guardado · versión 1');
  assert.equal(value('Título del documento'), 'Mi documento real'); assert.equal(value('Número de expediente'), 'TEST/9');
  assert.equal(value('Síntesis del caso'), 'Fuente sintética de prueba.');
});

test('edits made during a slow save are serialized and stay visible through the URL update', async () => {
  let release: (() => void) | undefined;
  const writes: { draft: DocumentDraft; revision: number }[] = [];
  const service = new DatabaseService(new ApiClient(async () => 'test', async (url, options) => {
    const body = JSON.parse(options!.body as string); writes.push(body);
    if (writes.length === 1) await new Promise<void>(resolve => { release = resolve; });
    return json({ document: { ...record(body.draft, body.revision + 1), id: String(url).split('/').at(-1) } });
  }));
  editor(service, '/document-builder');
  fireEvent.change(screen.getByLabelText('Síntesis del caso'), { target: { value: 'Primera edición' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar ahora' }));
  await waitFor(() => assert.ok(release));
  fireEvent.change(screen.getByLabelText('Síntesis del caso'), { target: { value: 'Edición durante la escritura' } });
  await act(async () => { release!(); });
  await screen.findByText('Guardado · versión 2');
  assert.equal(writes.length, 2); assert.equal(writes[1].revision, 1);
  assert.equal(writes[1].draft.summary, 'Edición durante la escritura');
  assert.equal(value('Síntesis del caso'), writes[1].draft.summary);
});

test('an internal navigation link waits until the pending draft is confirmed', async () => {
  let release!: () => void;
  let started = false;
  const service = new DatabaseService(new ApiClient(async () => 'test', async (url, options) => {
    started = true; await new Promise<void>(resolve => { release = resolve; });
    const body = JSON.parse(options!.body as string);
    return json({ document: { ...record(body.draft), id: String(url).split('/').at(-1) } });
  }));
  render(<MemoryRouter initialEntries={['/document-builder']}><DocumentBuilderView databaseService={service} /><Link to="/documents">Enlace de documentos</Link><Location /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Síntesis del caso'), { target: { value: 'Edición pendiente.' } });
  fireEvent.click(screen.getByRole('link', { name: 'Enlace de documentos' }));
  await waitFor(() => assert.ok(started));
  assert.equal(screen.getByLabelText('Ubicación').textContent, '/document-builder');
  await act(async () => { release(); });
  await waitFor(() => assert.equal(screen.getByLabelText('Ubicación').textContent, '/documents'));
});

test('409 preserves local text and stops automatic retries; an unreadable draft cannot be overwritten', async () => {
  let writes = 0;
  const service = new DatabaseService(new ApiClient(async () => 'test', async (_url, options) => {
    if (options?.method === 'PUT') { writes++; return json({ error: 'Otra pestaña modificó este documento.' }, 409); }
    return json({ document: record() });
  }));
  const view = editor(service); await screen.findByText('Guardado · versión 1');
  fireEvent.change(screen.getByLabelText('Contenido del borrador'), { target: { value: 'Cambio que debe conservarse' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar ahora' }));
  await screen.findByRole('alert');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1200)); });
  assert.equal(writes, 1); assert.equal(value('Contenido del borrador'), 'Cambio que debe conservarse');
  assert.equal((screen.getByRole('button', { name: 'Guardar ahora' }) as HTMLButtonElement).disabled, true);
  const unload = new window.Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); assert.equal(unload.defaultPrevented, true);
  view.unmount();
  let requests = 0;
  editor(new DatabaseService(new ApiClient(async () => 'test', async (_url, options) => { requests++; assert.notEqual(options?.method, 'PUT'); return json({ error: 'Registro eliminado.' }, 404); })));
  await screen.findByRole('alert'); fireEvent.click(screen.getByRole('button', { name: 'Guardar ahora' }));
  assert.equal(requests, 1);
});

test('restoring a historical version creates a new revision and invalidates the audit', async () => {
  let stored = record({ ...initial, content: 'Versión actual' }, 2);
  const service = new DatabaseService(new ApiClient(async () => 'test', async (url, options) => {
    if (String(url).endsWith('/versions')) return json({ versions: [{ revision: 1, savedAt: stored.createdAt }], nextCursor: null });
    if (String(url).endsWith('/versions/1')) return json({ document: record() });
    if (options?.method === 'PUT') { const { draft, revision } = JSON.parse(options.body as string); stored = record(draft, revision + 1); }
    return json({ document: stored });
  }));
  editor(service); await screen.findByText('Guardado · versión 2');
  fireEvent.click(screen.getByRole('button', { name: 'Historial de versiones' }));
  const button = await screen.findByRole('button', { name: /Restaurar versión 1/ });
  window.confirm = () => true; fireEvent.click(button);
  await waitFor(() => assert.equal(value('Contenido del borrador'), initial.content));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar ahora' }));
  await screen.findByText('Guardado · versión 3'); assert.deepEqual(stored.audit, { names: false, congruence: false, pii: false });
  assert.equal(stored.transcription, initial.transcription);
});

test('Documents displays actual records, filters and removes them without showing mock cases', async () => {
  let deleted = false;
  const service = new DatabaseService(new ApiClient(async () => 'test', async (_url, options) => {
    if (options?.method === 'DELETE') { deleted = true; return json({ deleted: true }); }
    return json({ documents: [{ ...record(), status: 'Borrador' }], nextCursor: null });
  }));
  render(<MemoryRouter><DocumentsView service={service} /></MemoryRouter>);
  await screen.findByText(/Borrador sintético/);
  assert.equal(screen.queryByText(/Acta_Audiencia_Inicial_123/), null);
  fireEvent.change(screen.getByLabelText('Buscar documentos'), { target: { value: 'inexistente' } });
  await screen.findByText(/No hay coincidencias/);
  fireEvent.change(screen.getByLabelText('Buscar documentos'), { target: { value: '' } });
  window.confirm = () => true; fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
  await screen.findByText('Todavía no tienes documentos guardados.'); assert.equal(deleted, true);
});

test('saved transcription resumes after mounting with no File, downloads locally and deletes only the LexIA copy', async () => {
  let uploads = 0, polls = 0, transcriptReads = 0, deleted = false;
  const service = new TranscriptionService(new ApiClient(async () => 'test', async (url, options) => {
    if (options?.method === 'POST') { uploads++; throw new Error('No upload expected'); }
    if (options?.method === 'DELETE') { deleted = true; return json({ deleted: true, remoteDeleted: false, message: 'Copia eliminada. El proveedor remoto puede conservar el archivo.' }); }
    if (String(url).endsWith('/transcript')) { transcriptReads++; return json({ text: 'Texto recuperado íntegro.', fileName: 'anterior.wav' }); }
    if (url === '/api/transcription/jobs') return json({ jobs: deleted ? [] : [{ job_id: 'durable', status: polls ? 'completed' : 'queued', fileName: 'anterior.wav', createdAt: initialDate(), updatedAt: initialDate() }], nextCursor: null });
    polls++; return json({ job_id: 'durable', status: 'completed', text: 'Texto recuperado íntegro.' });
  }));
  render(<MemoryRouter><TranscriptionView service={service} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Reanudar trabajo' }));
  await screen.findByText('Texto recuperado íntegro.'); assert.equal(uploads, 0); assert.equal(polls, 1);
  const originalUrl = URL.createObjectURL; URL.createObjectURL = () => 'blob:test';
  const originalClick = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = () => {};
  try { fireEvent.click(await screen.findByRole('button', { name: 'Descargar transcripción' })); await waitFor(() => assert.equal(transcriptReads, 1)); }
  finally { URL.createObjectURL = originalUrl; HTMLAnchorElement.prototype.click = originalClick; }
  window.confirm = message => { assert.match(String(message), /proveedor remoto/); return true; };
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar copia de LexIA' }));
  await screen.findByText(/Copia eliminada/); assert.equal(deleted, true);
  assert.equal(screen.queryByText('Texto recuperado íntegro.'), null);
});
function initialDate() { return '2026-10-02T00:00:00.000Z'; }
