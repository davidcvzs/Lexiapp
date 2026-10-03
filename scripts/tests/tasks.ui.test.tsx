import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DocumentBuilderView } from '../../src/views/DocumentBuilderView.js';
import { AIAssistantService } from '../../src/services/AIAssistantService.js';
import { ApiClient } from '../../src/services/ApiClient.js';
import { fixtureDatabase } from './persistence-fixtures.js';
import { taskProvenance } from './task-fixtures.js';
import type { TaskGenerationRequest } from '../../shared/generation.js';
afterEach(cleanup);
const button = () => screen.getByRole('button', { name: 'Generar borrador' }) as HTMLButtonElement;
const checkbox = () => screen.getByRole('checkbox', { name: 'Confirmo el análisis de esta instrucción y sus fuentes' }) as HTMLInputElement;
function setup() {
  const requests: TaskGenerationRequest[] = [];
  const ai = new AIAssistantService(new ApiClient(async () => 'test', async (_url, options) => {
    const request = JSON.parse(options!.body as string); requests.push(request);
    return new Response(JSON.stringify({ result: 'Resultado sintético completo.', provenance: taskProvenance(request) }), { headers: { 'Content-Type': 'application/json' } });
  }));
  render(<MemoryRouter initialEntries={[{ pathname: '/document-builder', state: { transcriptionData: 'Original íntegro.' } }]}>
    <DocumentBuilderView aiService={ai} databaseService={fixtureDatabase()} />
  </MemoryRouter>);
  return requests;
}
test('new or legacy documents require explicit task selection and send sources in distinct fields', async () => {
  const requests = setup(); assert.equal(button().disabled, true);
  fireEvent.click(button()); assert.equal(requests.length, 0);
  fireEvent.change(screen.getByLabelText('Tarea jurídica'), { target: { value: 'DECLARACION' } });
  fireEvent.change(screen.getByLabelText('Síntesis del caso'), { target: { value: 'Contraste separado.' } });
  fireEvent.change(screen.getByLabelText('Transcripción íntegra'), { target: { value: 'Copia modificada.' } });
  fireEvent.click(button()); await screen.findByText(/Resultado sintético completo/, { selector: 'div' });
  assert.equal(requests.length, 1); assert.equal(requests[0].taskId, 'DECLARACION');
  assert.deepEqual(requests[0].source, { original: 'Original íntegro.', working: 'Copia modificada.', contrast: 'Contraste separado.' });
  assert.ok(!requests[0].instruction.includes('Contraste separado.'));
  assert.equal((screen.getByLabelText('Transcripción original') as HTMLTextAreaElement).value, 'Original íntegro.');
});
test('analysis cannot call AI before confirmation and material edits require a fresh confirmation', async () => {
  const requests = setup();
  fireEvent.change(screen.getByLabelText('Tarea jurídica'), { target: { value: 'ANALISIS' } });
  fireEvent.change(screen.getByLabelText('Instrucción de la tarea'), { target: { value: 'Analiza solamente este aspecto sintético.' } });
  assert.equal(button().disabled, true); fireEvent.click(button()); assert.equal(requests.length, 0);
  fireEvent.click(checkbox()); await waitFor(() => assert.equal(checkbox().checked, true));
  assert.equal(button().disabled, false);
  fireEvent.change(screen.getByLabelText('Síntesis del caso'), { target: { value: 'Nuevo contraste.' } });
  assert.equal(checkbox().checked, false); assert.equal(button().disabled, true);
  fireEvent.click(checkbox()); await waitFor(() => assert.equal(checkbox().checked, true));
  fireEvent.click(button()); await screen.findByText(/Resultado sintético completo/, { selector: 'div' });
  assert.equal(requests.length, 1); assert.ok(requests[0].analysisConsent);
  assert.equal(checkbox().checked, false); assert.equal(button().disabled, true);
});
test('format variants remain explicit; directory has no source requirement but needs search terms', async () => {
  const requests = setup();
  fireEvent.change(screen.getByLabelText('Tarea jurídica'), { target: { value: 'ACTA' } });
  fireEvent.change(screen.getByLabelText('Formato de referencia'), { target: { value: 'extraction' } });
  fireEvent.click(button()); await screen.findByText(/Resultado sintético completo/, { selector: 'div' });
  assert.equal(requests[0].formatId, 'extraction');
  fireEvent.change(screen.getByLabelText('Tarea jurídica'), { target: { value: 'DIRECTORIO' } });
  fireEvent.change(screen.getByLabelText('Transcripción íntegra'), { target: { value: '' } });
  fireEvent.click(button()); await screen.findByRole('alert'); assert.equal(requests.length, 1);
  fireEvent.change(screen.getByLabelText('Instrucción de la tarea'), { target: { value: 'Centro' } });
  fireEvent.click(button()); await waitFor(() => assert.equal(requests.length, 2));
  assert.equal(requests[1].taskId, 'DIRECTORIO'); assert.equal(requests[1].source.working, '');
});
