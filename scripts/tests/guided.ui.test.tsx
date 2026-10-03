import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DocumentBuilderView } from '../../src/views/DocumentBuilderView.js';
import { GuidedPanel } from '../../src/components/documents/GuidedPanel.js';
import { TaskActions } from '../../src/components/documents/TaskActions.js';
import { AIAssistantService } from '../../src/services/AIAssistantService.js';
import { SourceImportService } from '../../src/services/SourceImportService.js';
import { DatabaseService } from '../../src/services/DatabaseService.js';
import { ApiClient } from '../../src/services/ApiClient.js';
import { parseDraft } from '../../shared/documents.js';
import type { SavedDocument } from '../../shared/documents.js';
import type { TaskGenerationRequest } from '../../shared/generation.js';
import { startWorkflow, selectWorkflowStep } from '../../shared/workflowEngine.js';
import { taskProvenance } from './task-fixtures.js';
import { json } from './persistence-fixtures.js';

afterEach(cleanup);
const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value;
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
function setup(taskId = 'SENTENCIA', formatId = 'source', sourceService?: SourceImportService) {
  const requests: TaskGenerationRequest[] = [], versions = new Map<number, SavedDocument>();
  let stored: SavedDocument | undefined, fail = false;
  const db = new DatabaseService(new ApiClient(async () => 'test', async (url, options) => {
    if (options?.method === 'PUT') {
      const { draft, revision } = JSON.parse(options.body as string);
      assert.equal(revision, stored?.revision ?? 0);
      stored = { ...parseDraft(draft), id: 'guided', revision: revision + 1, createdAt: '2026-10-02T00:00:00.000Z', updatedAt: new Date().toISOString() };
      versions.set(stored.revision, structuredClone(stored)); return json({ document: stored });
    }
    if (String(url).endsWith('/versions')) return json({ versions: [...versions.values()].reverse().map(doc => ({ revision: doc.revision, savedAt: doc.updatedAt })), nextCursor: null });
    const version = String(url).match(/\/versions\/(\d+)$/);
    return json({ document: version ? versions.get(Number(version[1])) : stored });
  }));
  const ai = new AIAssistantService(new ApiClient(async () => 'test', async (_url, options) => {
    const request = JSON.parse(options!.body as string); requests.push(request);
    if (fail) return json({ error: 'Sin saldo. Borrador conservado.' }, 503);
    return json({ result: `Resultado sintético ${requests.length}.`, provenance: taskProvenance(request) });
  }));
  const mount = (saved = false) => render(<MemoryRouter initialEntries={[saved ? '/document-builder?documentId=guided' : { pathname: '/document-builder', state: { transcriptionData: 'Fuente original A.', taskIntent: { taskId, formatId } } }]}>
    <DocumentBuilderView aiService={ai} databaseService={db} sourceService={sourceService} newId="guided" />
  </MemoryRouter>);
  return { requests, versions, ai, mount, setFailure: () => { fail = true; }, getStored: () => stored };
}
async function generated(text: string) { await waitFor(() => assert.equal(value('Texto del apartado actual'), text)); }

test('guided navigation does not generate; acceptance, redo, checkpoint and reload preserve complete context', async () => {
  const state = setup(); const view = state.mount();
  assert.ok(screen.getByRole('heading', { name: /Pasos de Resolución dictada/ })); assert.equal(state.requests.length, 0);
  click(/Redactar RESULTANDO/); click('Generar apartado'); await generated('Resultado sintético 1.');
  click('Aceptar y continuar'); await waitFor(() => assert.match(value('Instrucción de la tarea'), /CONSIDERANDOS/));
  click('Generar apartado'); await generated('Resultado sintético 2.');
  assert.equal(state.requests[1].context!.sections[0].status, 'accepted'); assert.equal(state.requests[1].draft, 'Resultado sintético 1.');
  click(/Redactar RESULTANDO/); click('Rehacer este paso'); await generated('Resultado sintético 3.');
  assert.equal(value('Contenido del borrador'), 'Resultado sintético 3.\n\nResultado sintético 2.');
  assert.equal(state.requests[2].context!.action, 'rewrite'); assert.equal(state.requests[2].context!.target!.text, 'Resultado sintético 1.');
  assert.ok([...state.versions.values()].some(doc => doc.content === 'Resultado sintético 1.\n\nResultado sintético 2.'));
  click('Guardar ahora'); await waitFor(() => assert.equal(state.getStored()!.content, value('Contenido del borrador')));
  const saved = structuredClone(state.getStored()!); view.unmount(); state.mount(true);
  await screen.findByText(`Guardado · versión ${saved.revision}`);
  assert.equal(value('Texto del apartado actual'), 'Resultado sintético 3.');
  assert.equal(state.ai.getState().completedSections.length, 2); assert.equal(state.ai.getState().currentStep, 2);
  click('Generar apartado'); await generated('Resultado sintético 4.');
  assert.equal(state.requests[3].draft, saved.content); assert.equal(state.requests[3].history.length, 3);
});

test('selected fragment correction preserves neighbors and failure keeps content and success history intact', async () => {
  const state = setup(); state.mount(); click(/Redactar RESULTANDO/); click('Generar apartado'); await generated('Resultado sintético 1.');
  const input = screen.getByLabelText('Texto del apartado actual') as HTMLTextAreaElement;
  fireEvent.focus(input); input.setSelectionRange(0, 9); fireEvent.select(input);
  click('Corregir fragmento seleccionado'); await generated('Resultado sintético 2. sintético 1.');
  assert.equal(state.requests[1].context!.target!.text, 'Resultado'); assert.equal(state.requests[1].context!.action, 'fragment');
  state.setFailure(); click('Rehacer este paso'); await screen.findByText('Sin saldo. Borrador conservado.');
  assert.equal(value('Texto del apartado actual'), 'Resultado sintético 2. sintético 1.');
  assert.equal(state.ai.getState().userInstructions.length, 2);
});

test('acta combo creates isolated source slots and restores original sources on matter switching', async () => {
  const state = setup('ACTA', 'control'); state.mount();
  const first = value('Asunto o hablante activo'); click('Generar apartado'); await generated('Resultado sintético 1.');
  fireEvent.change(screen.getByLabelText('Nombre del nuevo asunto o hablante'), { target: { value: 'ASUNTO B' } });
  click('Añadir asunto al acta'); await waitFor(() => assert.notEqual(value('Asunto o hablante activo'), first));
  assert.equal(value('Transcripción original'), ''); assert.equal(value('Transcripción íntegra'), '');
  fireEvent.change(screen.getByLabelText('Transcripción íntegra'), { target: { value: 'Fuente exclusiva B.' } }); click('Conservar como original');
  click('Generar apartado'); await generated('Resultado sintético 2.');
  assert.equal(state.requests[1].source.original, 'Fuente exclusiva B.'); assert.deepEqual(state.requests[1].context!.sections, []);
  assert.ok(!JSON.stringify(state.requests[1]).includes('Fuente original A.'));
  fireEvent.change(screen.getByLabelText('Asunto o hablante activo'), { target: { value: first } });
  assert.equal(value('Transcripción original'), 'Fuente original A.'); assert.equal(value('Texto del apartado actual'), 'Resultado sintético 1.');
  assert.equal((screen.getByLabelText('Tarea jurídica') as HTMLSelectElement).disabled, true);
});

test('declaration reception never infers closure and preserves appended parts before a new speaker', async () => {
  const state = setup('DECLARACION', 'default'); state.mount(); click(/Redactar declaración/); click('Generar apartado');
  await screen.findByText(/Identifica al hablante/); assert.equal(state.requests.length, 0);
  fireEvent.change(screen.getByLabelText('Hablante de la declaración'), { target: { value: 'Persona sintética A' } });
  fireEvent.change(screen.getByLabelText('Parte adicional de la declaración'), { target: { value: 'Segunda parte íntegra.' } }); click('Añadir parte de la declaración');
  assert.equal(value('Transcripción original'), 'Fuente original A.\n\nSegunda parte íntegra.');
  fireEvent.click(screen.getByLabelText('Terminó la recepción de este hablante')); click('Generar apartado'); await generated('Resultado sintético 1.');
  assert.equal(state.requests[0].context!.matter.speaker, 'Persona sintética A'); assert.equal(state.requests[0].context!.matter.receptionClosed, true);
  fireEvent.change(screen.getByLabelText('Parte adicional de la declaración'), { target: { value: 'Tercera parte.' } }); click('Añadir parte de la declaración');
  assert.equal((screen.getByLabelText('Terminó la recepción de este hablante') as HTMLInputElement).checked, false);
  click('Generar apartado'); assert.equal(state.requests.length, 1);
  fireEvent.change(screen.getByLabelText('Nombre del nuevo asunto o hablante'), { target: { value: 'Persona sintética B' } }); click('Recibir otro hablante');
  await waitFor(() => assert.equal(value('Hablante de la declaración'), 'Persona sintética B')); assert.equal(value('Transcripción original'), '');
});

test('analysis redo confirms its exact replacement target and changing instruction requires fresh confirmation', async () => {
  const state = setup('ANALISIS', 'source'); state.mount(); click('Generar apartado');
  await screen.findByText(/Confirma el análisis/); assert.equal(state.requests.length, 0);
  const confirm = () => screen.getByLabelText('Confirmo el análisis de esta instrucción y sus fuentes') as HTMLInputElement;
  fireEvent.click(confirm()); await waitFor(() => assert.equal(confirm().checked, true)); click('Generar apartado'); await generated('Resultado sintético 1.');
  click('Rehacer este paso'); await screen.findByText(/Confirma el análisis/);
  fireEvent.click(confirm()); await waitFor(() => assert.equal(confirm().checked, true)); click('Rehacer este paso'); await generated('Resultado sintético 2.');
  assert.equal(state.requests[1].context!.action, 'rewrite'); assert.ok(state.requests[1].analysisConsent);
  fireEvent.change(screen.getByLabelText('Instrucción de la tarea'), { target: { value: 'Nuevo alcance sintético.' } });
  assert.equal(confirm().checked, false); click('Generar apartado'); assert.equal(state.requests.length, 2);
});

test('document import separates original, contrast and supplied template without generating; errors preserve sources', async () => {
  let fail = false;
  const source = new SourceImportService(new ApiClient(async () => 'test', async (_url, options) => {
    assert.ok(options!.body instanceof FormData); assert.ok(options!.signal);
    if (fail) return json({ error: 'Documento ilegible.' }, 422);
    return json({ text: 'Texto importado íntegro.', filename: 'fixture.txt' });
  }));
  const state = setup('AMPARO', 'provided', source); state.mount();
  const upload = (label: string) => fireEvent.change(screen.getByLabelText(label), { target: { files: [new File(['Fuente sintética'], 'fixture.txt', { type: 'text/plain' })] } });
  upload('Importar documento como fuente'); await waitFor(() => assert.equal(value('Transcripción original'), 'Fuente original A.\n\nTexto importado íntegro.'));
  upload('Importar documento de contraste'); await waitFor(() => assert.equal(value('Síntesis del caso'), 'Texto importado íntegro.'));
  upload('Importar formato del usuario'); await screen.findByText('Formato del usuario cargado.'); assert.equal(state.requests.length, 0);
  click('Generar apartado'); await generated('Resultado sintético 1.');
  assert.equal(state.requests[0].context!.userTemplate, 'Texto importado íntegro.'); assert.equal(state.requests[0].source.contrast, 'Texto importado íntegro.');
  const original = value('Transcripción original'); fail = true; upload('Importar documento como fuente'); await screen.findByText('Documento ilegible.'); assert.equal(value('Transcripción original'), original);
});

test('explicit research adds only the chosen complete SCJN text to durable context and never generates', async () => {
  let latest = selectWorkflowStep(startWorkflow(parseDraft({ title: 'Sintético', caseNumber: '', caseType: 'Penal', documentType: 'Resolución',
    summary: '', transcription: 'Fuente.', originalTranscription: 'Fuente.', content: '', completedPhases: [], audit: { names: false, congruence: false, pii: false }, generationTask: { taskId: 'SENTENCIA', formatId: 'source' } })), 'research');
  const paths: string[] = []; let generations = 0;
  const api = new ApiClient(async () => 'test', async url => {
    paths.push(String(url)); return String(url).includes('/search?') ? json({ data: [{ registroDigital: '123', rubro: 'Resultado sintético' }] }) : json({ rubro: 'Referencia elegida', texto: 'Texto completo sintético.', officialUrl: 'https://example.test/tesis/123' });
  });
  function Harness() { const [draft, setDraft] = useState(latest); return <GuidedPanel draft={draft} busy={false} checkpoint={async () => true} api={api} generate={() => { generations++; }} update={transform => { latest = parseDraft(transform(latest)); setDraft(latest); }} />; }
  render(<Harness />); fireEvent.click(screen.getByText('Investigación y referencias seleccionadas'));
  assert.equal(paths.length, 0); fireEvent.change(screen.getByLabelText('Tema de búsqueda SCJN en el editor'), { target: { value: 'Tema sintético' } }); click('Buscar SCJN');
  await screen.findByText('Resultado sintético'); assert.equal(latest.workflow!.references.length, 0);
  click('Añadir referencia 123'); await screen.findByRole('button', { name: 'Quitar referencia Referencia elegida' });
  assert.equal(latest.workflow!.references[0].text, 'Texto completo sintético.'); assert.equal(generations, 0); assert.equal(latest.content, '');
  click('Quitar referencia Referencia elegida'); assert.equal(latest.workflow!.references.length, 0);
});

test('post-transcription actions carry an explicit task or own instruction without requesting AI', async () => {
  const intents: { taskId: string; formatId: string; instruction?: string }[] = [];
  render(<TaskActions choose={intent => intents.push(intent)} />); click('Iniciar Sentencia'); assert.deepEqual(intents[0], { taskId: 'SENTENCIA', formatId: 'source' });
  fireEvent.change(screen.getByLabelText('Tarea para instrucción propia'), { target: { value: 'ANALISIS' } });
  fireEvent.change(screen.getByLabelText('Instrucción propia después de transcribir'), { target: { value: 'Alcance escrito por el usuario.' } });
  await act(async () => click('Continuar con instrucción propia')); assert.equal(intents[1].instruction, 'Alcance escrito por el usuario.'); assert.equal(intents[1].taskId, 'ANALISIS');
  click('Resumir transcripción'); assert.deepEqual(intents[2], { taskId: 'ANALISIS', formatId: 'summary' });
  cleanup(); const state = setup('ANALISIS', 'summary'); state.mount(); click(/2\. Resumir transcripción/); click('Generar apartado');
  await screen.findByText(/Confirma el análisis/); assert.equal(state.requests.length, 0);
  const consent = screen.getByLabelText('Confirmo el análisis de esta instrucción y sus fuentes') as HTMLInputElement;
  fireEvent.click(consent); await waitFor(() => assert.equal(consent.checked, true)); click('Generar apartado'); await generated('Resultado sintético 1.');
  assert.equal(state.requests[0].formatId, 'summary'); assert.ok(state.requests[0].analysisConsent);
});
