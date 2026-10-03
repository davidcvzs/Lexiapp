import { taskProvenance } from './task-fixtures.js';
import { LEGAL_TASKS } from '../../shared/legalTasks.js';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DocumentBuilderView } from '../../src/views/DocumentBuilderView.js';
import { WordExportService } from '../../src/services/WordExportService.js';
import { AIAssistantService } from '../../src/services/AIAssistantService.js';
import { ApiClient } from '../../src/services/ApiClient.js';
import { DatabaseService } from '../../src/services/DatabaseService.js';
import { parseDraft } from '../../shared/documents.js';
import { reviewFingerprint, validateReview } from '../../shared/documentIntegrity.js';
import type { DocumentDraft, SavedDocument } from '../../shared/documents.js';

afterEach(cleanup);
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const base = (): DocumentDraft => parseDraft({ title: 'Documento sintético', caseNumber: 'TEST-4', caseType: 'Penal', documentType: 'Sentencia Definitiva',
  summary: 'Síntesis sintética.', transcription: 'Fuente de trabajo.', originalTranscription: 'Fuente original íntegra.',
  content: 'María Pérez declaró el 12/03/2026. Correo maria@example.test. Texto que debe conservarse.', completedPhases: ['Antecedentes y Competencia'],
  audit: { names: false, congruence: false, pii: false }, reviewHash: null });
async function setup(options: { approved?: boolean; download?: (blob: Blob, name: string) => void; aiResult?: string } = {}) {
  const draft = base();
  if (options.approved) { draft.audit = { names: true, congruence: true, pii: true }; draft.reviewHash = await reviewFingerprint(draft); }
  let stored: SavedDocument = { ...draft, id: 'integrity', revision: 1, createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' };
  const database = new DatabaseService(new ApiClient(async () => 'test', async (_url, request) => {
    if (request?.method === 'PUT') {
      const body = JSON.parse(request.body as string); stored = { ...stored, ...await validateReview(parseDraft(body.draft)), revision: body.revision + 1 };
    }
    return json({ document: stored });
  }));
  let instruction = '';
  const ai = new AIAssistantService(new ApiClient(async () => 'test', async (_url, request) => {
    instruction = request!.body as string; return json({ result: options.aiResult ?? 'Nueva sección sintética.', provenance: taskProvenance() });
  }));
  render(<MemoryRouter initialEntries={['/document-builder?documentId=integrity']}>
    <DocumentBuilderView databaseService={database} aiService={ai} wordService={new WordExportService(options.download ?? (() => {}))} />
  </MemoryRouter>);
  await screen.findByText('Guardado · versión 1');
  return { stored: () => stored, instruction: () => instruction };
}
const exportButton = () => screen.getByRole('button', { name: /Exportar oficial/ }) as HTMLButtonElement;
const value = (label: string) => (screen.getByLabelText(label) as HTMLTextAreaElement).value;
async function approve() {
  for (const label of [/Verificación de nombres/, /Revisión de congruencia/, /Revisé los datos personales/]) fireEvent.click(screen.getByRole('checkbox', { name: label }));
  await waitFor(() => assert.equal(exportButton().disabled, false));
}

test('PII review does not anonymize official text; export uses the saved approved revision', async () => {
  let name = '', blob: Blob | undefined;
  const state = await setup({ download: (data, filename) => { blob = data; name = filename; } });
  await approve();
  assert.ok(screen.getByText(/María Pérez declaró/, { selector: 'div' }));
  assert.equal(screen.queryByText('[ANONIMIZADO]'), null);
  fireEvent.click(exportButton());
  await screen.findByText(/Descarga preparada: versión oficial/);
  assert.ok(blob); assert.match(name, /OFICIAL_v2/); assert.equal(state.stored().content, base().content);
  assert.ok(state.stored().reviewHash); assert.equal(state.stored().publicVersion?.reviewed, false);
});

test('public export requires selected masks and an independent confirmation; editing clears them', async () => {
  await setup({ approved: true });
  fireEvent.change(screen.getByLabelText('Variante de exportación'), { target: { value: 'public' } });
  const panel = screen.getByRole('region', { name: 'Revisión de versión pública' });
  assert.match(within(panel).getByLabelText('Vista pública revisable').textContent!, /María Pérez/);
  assert.equal((screen.getByRole('button', { name: /Exportar pública/ }) as HTMLButtonElement).disabled, true);
  fireEvent.click(within(panel).getByRole('checkbox', { name: /Ocultar Posible nombre: María Pérez/ }));
  const preview = within(panel).getByLabelText('Vista pública revisable');
  assert.ok(!preview.textContent!.includes('María Pérez')); assert.match(preview.textContent!, /\[DATO OCULTO\]/);
  assert.equal(preview.querySelector('[title]'), null);
  fireEvent.click(within(panel).getByRole('checkbox', { name: /Revisé la vista pública/ }));
  await waitFor(() => assert.equal((screen.getByRole('button', { name: /Exportar pública/ }) as HTMLButtonElement).disabled, false));
  fireEvent.change(screen.getByLabelText('Contenido del borrador'), { target: { value: 'El borrador cambió.' } });
  assert.equal((screen.getByRole('button', { name: /Exportar pública/ }) as HTMLButtonElement).disabled, true);
  assert.ok(within(panel).getByText('0 ocultaciones seleccionadas.'));
  assert.equal((within(panel).getByRole('checkbox', { name: /Revisé la vista pública/ }) as HTMLInputElement).checked, false);
});

test('editing a source preserves the original and invalidates audit and phase review', async () => {
  const state = await setup({ approved: true });
  fireEvent.change(screen.getByLabelText('Transcripción íntegra'), { target: { value: 'Fuente de trabajo corregida.' } });
  assert.equal(value('Transcripción original'), 'Fuente original íntegra.');
  assert.equal(exportButton().disabled, true);
  assert.equal((screen.getByRole('checkbox', { name: /Revisé los datos personales/ }) as HTMLInputElement).checked, false);
  assert.match(screen.getByLabelText('Estado de fases').textContent!, /Fuentes cambiadas/);
  fireEvent.click(screen.getByRole('button', { name: 'Guardar ahora' }));
  await screen.findByText('Guardado · versión 2');
  assert.equal(state.stored().originalTranscription, 'Fuente original íntegra.'); assert.equal(state.stored().reviewHash, null);
});

test('generation records the unchanged phase instruction separately from sources and generated content', async () => {
  const state = await setup({ aiResult: 'Resultado completo de nueva generación.' });
  fireEvent.change(screen.getByLabelText('Tarea jurídica'), { target: { value: 'DECLARACION' } });
  fireEvent.click(screen.getByRole('button', { name: 'Generar borrador' }));
  await screen.findByText(/Resultado completo de nueva generación/, { selector: 'div' });
  assert.match(state.instruction(), /Fuente de trabajo\./); assert.match(state.instruction(), /Síntesis sintética\./);
  assert.equal(value('Transcripción original'), 'Fuente original íntegra.');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar ahora' })); await screen.findByText('Guardado · versión 2');
  const log = state.stored().generationLog![0];
  assert.equal(log.instruction, LEGAL_TASKS.find(task => task.id === 'DECLARACION')!.instruction);
  assert.equal(log.phase, 'Declaración'); assert.match(log.sourceHash, /^[a-f0-9]{64}$/); assert.equal(log.provenance?.taskId, 'DECLARACION');
  assert.equal(state.stored().phaseStates?.['Declaración'], 'generated');
});

test('failed downloads remain visible errors and never produce a success notice', async () => {
  await setup({ approved: true, download: () => { throw new Error('La descarga no pudo iniciarse.'); } });
  fireEvent.click(exportButton()); await screen.findByRole('alert');
  assert.match(screen.getByRole('alert').textContent!, /La descarga no pudo iniciarse/);
  assert.equal(screen.queryByText(/Descarga preparada/), null); assert.equal(exportButton().disabled, false);
});
