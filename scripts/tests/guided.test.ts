import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import express from 'express';
import type OpenAI from 'openai';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { Document, Paragraph, Packer } from 'docx';
import AdmZip from 'adm-zip';
import { parseDraft } from '../../shared/documents.js';
import { startWorkflow, selectWorkflowStep, acceptStep, workflowRequest, applyWorkflowResult, addMatter, switchMatter, editWorkflowContent } from '../../shared/workflowEngine.js';
import { workflowSteps } from '../../shared/workflowCatalog.js';
import { generationFingerprint, parseGenerationRequest, validateGenerationConsent } from '../../shared/generation.js';
import { invalidateReview, reviewFingerprint, approvedExportText } from '../../shared/documentIntegrity.js';
import { createAiRouter } from '../../server/routes/ai.js';
import { createSourcesRouter, extractSource } from '../../server/routes/sources.js';
import { securityErrorHandler } from '../../server/middleware/security.js';
import { createAuthMiddleware } from '../../server/middleware/auth.js';
import { KnowledgeService } from '../../server/services/KnowledgeService.js';
import { OpenAIService } from '../../server/services/OpenAIService.js';
import { taskProvenance } from './task-fixtures.js';
import type { TaskSelection } from '../../shared/legalTasks.js';

const guidedDraft = (selection: TaskSelection = { taskId: 'SENTENCIA', formatId: 'source' }) => parseDraft(startWorkflow(parseDraft({
  title: 'Prueba sintética', caseNumber: 'ASUNTO-A', caseType: 'Penal', documentType: 'Prueba', summary: 'Contraste A',
  transcription: 'Fuente A íntegra.', originalTranscription: 'Original A íntegro.', content: '', completedPhases: [],
  audit: { names: false, congruence: false, pii: false }, generationTask: selection,
})));
const result = (draft: ReturnType<typeof guidedDraft>, text: string) => ({ result: text, provenance: taskProvenance(draft.generationTask!) });
const generate = (draft: ReturnType<typeof guidedDraft>, text: string) => parseDraft(applyWorkflowResult(draft, workflowRequest(draft), result(draft, text)));

test('guided sequences preserve Blueprint steps and acceptance advances only after valid intake or a section', () => {
  let draft = guidedDraft();
  assert.deepEqual(workflowSteps(draft.generationTask!).map(step => step.id), ['source', 'resultando', 'considerandos', 'valoracion', 'argumentacion', 'research', 'resolutivos', 'review']);
  draft = acceptStep(draft); assert.equal(draft.workflow!.currentStepId, 'resultando');
  assert.throws(() => acceptStep(draft), /antes de aceptarlo/);
  draft = acceptStep(generate(draft, 'Resultado A.'));
  assert.equal(draft.workflow!.currentStepId, 'considerandos'); assert.equal(draft.workflow!.sections[0].status, 'accepted');
  assert.match(draft.generationInstruction!, /CONSIDERANDOS/);
});

test('redo and fragment replacement preserve surrounding sections, source and range integrity', () => {
  let draft = generate(selectWorkflowStep(guidedDraft(), 'resultando'), 'Inicio viejo fin.');
  draft = generate(acceptStep(draft), 'Segunda sección intacta.');
  draft = selectWorkflowStep(draft, 'resultando');
  const firstId = draft.workflow!.sections[0].id;
  const request = workflowRequest(draft, 'fragment', { sectionId: firstId, start: 7, end: 12 });
  assert.equal(request.context!.target!.text, 'viejo');
  draft = parseDraft(applyWorkflowResult(draft, request, result(draft, 'nuevo contenido')));
  assert.equal(draft.content, 'Inicio nuevo contenido fin.\n\nSegunda sección intacta.');
  const second = draft.workflow!.sections[1]; assert.equal(draft.content.slice(second.start, second.end), 'Segunda sección intacta.');
  draft = parseDraft(applyWorkflowResult(draft, workflowRequest(draft, 'rewrite'), result(draft, 'Reemplazo.')));
  assert.equal(draft.content, 'Reemplazo.\n\nSegunda sección intacta.'); assert.equal(draft.workflow!.sections.length, 2);
  assert.equal(draft.originalTranscription, 'Original A íntegro.'); assert.equal(draft.workflow!.sections[0].status, 'draft');
});

test('invalid targets, overlapping ranges and mismatched provenance never enter a draft or request', () => {
  const draft = generate(selectWorkflowStep(guidedDraft(), 'resultando'), 'Texto sintético.');
  const request = workflowRequest(draft, 'rewrite');
  assert.throws(() => parseGenerationRequest({ ...request, context: { ...request.context, target: { ...request.context!.target, text: 'Texto distinto' } } }), /fragmento/);
  assert.throws(() => workflowRequest(draft, 'fragment', { sectionId: 'other', start: 0, end: 3 }), /fragmento/);
  const section = draft.workflow!.sections[0];
  assert.throws(() => parseDraft({ ...draft, workflow: { ...draft.workflow, sections: [section, { ...section, id: 'another', stepId: 'considerandos' }] } }), /superpuestos/);
  assert.throws(() => parseDraft({ ...draft, workflow: { ...draft.workflow, sections: [{ ...section, provenance: taskProvenance({ taskId: 'ANALISIS', formatId: 'source' }) }] } }), /Procedencia de otra/);
});

test('manual section edits retain all matter metadata and refuse edits that span sections', () => {
  let draft = generate(selectWorkflowStep(guidedDraft(), 'resultando'), 'Primera.');
  draft = generate(acceptStep(draft), 'Segunda.');
  const edited = parseDraft(editWorkflowContent(draft, 'Primera corregida.\n\nSegunda.'));
  assert.equal(edited.workflow!.sections.length, 2);
  assert.equal(edited.content.slice(edited.workflow!.sections[1].start, edited.workflow!.sections[1].end), 'Segunda.');
  assert.throws(() => editWorkflowContent(draft, 'Otro documento entero.'), /un apartado a la vez/);
  assert.equal(draft.content, 'Primera.\n\nSegunda.');
});

test('combo matter switching and JSON reload preserve originals while provider context excludes every other matter', async () => {
  let draft = generate(guidedDraft({ taskId: 'ACTA', formatId: 'control' }), 'Apartado del asunto A.');
  const firstId = draft.workflow!.activeMatterId;
  draft.workflow!.references.push({ id: 'reference-a', matterId: firstId, title: 'Referencia A', text: 'Texto de investigación A.', url: '', source: 'USER' });
  draft.generationLog = [{ phase: 'Datos', instruction: 'Historial exclusivo A', sourceHash: '3'.repeat(64), createdAt: new Date().toISOString(), matterId: firstId, stepId: 'datos' }];
  draft = parseDraft(addMatter(draft, 'ASUNTO-B'));
  assert.equal(draft.transcription, '');
  draft = parseDraft({ ...draft, originalTranscription: 'Original exclusivo B', transcription: 'Trabajo exclusivo B', summary: 'Contraste exclusivo B' });
  const request = workflowRequest(draft);
  assert.deepEqual(request.context!.sections, []); assert.deepEqual(request.history, []); assert.deepEqual(request.context!.references, []);
  assert.ok(!JSON.stringify(request).includes('exclusivo A')); assert.ok(!JSON.stringify(request).includes('Original A'));
  const body = JSON.parse(JSON.stringify(request));
  const client = { responses: { create: async (args: { input: string }) => {
    assert.deepEqual(JSON.parse(args.input).context, body.context); assert.ok(!args.input.includes('Original A'));
    return { status: 'completed', output_text: 'Solo B.', output: [] };
  } } } as unknown as OpenAI;
  // The supplied-format task requires no private fixture files.
  const supplied = { ...request, taskId: 'SENTENCIA', formatId: 'source', context: { ...request.context!, stepId: 'resultando', matter: { ...request.context!.matter, mode: 'individual' as const } } };
  body.context = supplied.context;
  await new OpenAIService(client, new KnowledgeService()).generateTask(supplied);
  draft = parseDraft(JSON.parse(JSON.stringify(draft)));
  draft = parseDraft(switchMatter(draft, firstId));
  assert.equal(draft.originalTranscription, 'Original A íntegro.'); assert.equal(draft.transcription, 'Fuente A íntegra.');
  assert.equal(workflowRequest(draft).context!.references.length, 1); assert.equal(workflowRequest(draft).history[0], 'Historial exclusivo A');
  assert.ok(!JSON.stringify(workflowRequest(draft)).includes('exclusivo B'));
});

test('declaration intake requires an explicit speaker and closure; added parts invalidate closure and accepted sections', () => {
  let draft = selectWorkflowStep(guidedDraft({ taskId: 'DECLARACION', formatId: 'default' }), 'declaracion');
  assert.throws(() => workflowRequest(draft), /Identifica al hablante/);
  draft.workflow!.matters[0].speaker = 'Hablante A';
  assert.throws(() => workflowRequest(draft), /confirma/);
  draft.workflow!.matters[0].receptionClosed = true;
  draft = acceptStep(generate(draft, 'Declaración A.'));
  const firstId = draft.workflow!.activeMatterId;
  draft = invalidateReview({ ...draft, transcription: draft.transcription + '\nParte segunda.', originalTranscription: draft.originalTranscription + '\nParte segunda.' }, 'sources');
  assert.equal(draft.workflow!.matters[0].receptionClosed, false); assert.equal(draft.workflow!.sections[0].status, 'stale');
  draft = parseDraft(addMatter(draft, 'Hablante B'));
  assert.equal(draft.workflow!.matters.at(-1)!.speaker, 'Hablante B'); assert.equal(draft.originalTranscription, '');
  draft = switchMatter(draft, firstId); assert.match(draft.originalTranscription!, /Parte segunda/);
});

test('step analysis and custom summary confirmation bind references and fragment scope; amparo requires a supplied template', async () => {
  let draft = selectWorkflowStep(guidedDraft({ taskId: 'AMPARO', formatId: 'provided' }), 'derechos');
  assert.throws(() => workflowRequest(draft), /Aporta un formato/);
  draft.workflow!.userTemplate = 'Formato sintético aportado, sin hechos.';
  const request = workflowRequest(draft); await assert.rejects(validateGenerationConsent(request), /Confirma/);
  request.analysisConsent = { fingerprint: await generationFingerprint(request), confirmedAt: new Date().toISOString() };
  await validateGenerationConsent(request);
  await assert.rejects(validateGenerationConsent({ ...request, context: { ...request.context!, references: [{ id: 'new-ref', matterId: request.context!.matter.id, title: 'Otra', text: 'Otra referencia', url: '', source: 'USER' }] } }), /Confirma/);
  draft = selectWorkflowStep(guidedDraft(), 'resultando'); draft.workflow!.requestAnalysis = true;
  await assert.rejects(validateGenerationConsent(workflowRequest(draft)), /Confirma/);
  const summary = selectWorkflowStep(guidedDraft({ taskId: 'ANALISIS', formatId: 'summary' }), 'summary');
  assert.deepEqual(workflowSteps(summary.generationTask!).map(step => step.id), ['source', 'summary', 'review']);
  assert.match(summary.generationInstruction!, /Resumir transcripción/); await assert.rejects(validateGenerationConsent(workflowRequest(summary)), /Confirma/);
  assert.ok(workflowSteps({ taskId: 'AMPARO', formatId: 'provided' }).some(step => step.id === 'conceptos'));
});

test('HTTP step and custom analysis gates precede even an injected provider', async () => {
  let calls = 0;
  const app = express(); app.use(express.json()); app.use('/ai', createAiRouter({ generateDocument: async () => 'Unused', generateTask: async request => { calls++; return result(guidedDraft(request), 'Sintético'); } }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/ai/generate`;
    const send = (body: unknown) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const draft = selectWorkflowStep(guidedDraft(), 'resultando'); draft.workflow!.requestAnalysis = true;
    const request = workflowRequest(draft);
    assert.equal((await send(request)).status, 403); assert.equal(calls, 0);
    request.analysisConsent = { fingerprint: await generationFingerprint(request), confirmedAt: new Date().toISOString() };
    assert.equal((await send(request)).status, 200); assert.equal(calls, 1);
    assert.equal((await send({ ...request, context: { ...request.context, stepId: 'not-a-step' } })).status, 400); assert.equal(calls, 1);
    assert.equal((await send({ ...request, context: { ...request.context, userTemplate: 'Changed' } })).status, 403); assert.equal(calls, 1);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('export requires accepting all guided sections in addition to the existing audit and exact hash', async () => {
  let draft = generate(selectWorkflowStep(guidedDraft(), 'resultando'), 'Texto sintético para exportar.');
  draft.audit = { names: true, congruence: true, pii: true }; draft.reviewHash = await reviewFingerprint(draft);
  await assert.rejects(approvedExportText(draft, 'official'), /Revisa y aprueba/);
  draft = acceptStep(draft); draft.audit = { names: true, congruence: true, pii: true }; draft.reviewHash = await reviewFingerprint(draft);
  assert.equal(await approvedExportText(draft, 'official'), draft.content);
});

test('source extraction preserves UTF-8 and DOCX text and rejects disguised, corrupt, oversized or empty files', async () => {
  const text = '  Texto sintético íntegro.\n\nOtro párrafo.  ';
  assert.equal(await extractSource(Buffer.from(text), 'fuente.TXT'), text);
  const bytes = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Párrafo sintético.')] }] }));
  assert.match(await extractSource(bytes, 'fuente.docx'), /Párrafo sintético\./);
  for (const [buffer, file] of [[Buffer.from([0xff, 0xfe]), 'bad.txt'], [bytes, 'disguised.txt'], [Buffer.from('not a doc'), 'bad.doc'], [Buffer.from('not a pdf'), 'bad.pdf'], [Buffer.from(''), 'empty.txt'], [Buffer.from('a'.repeat(500_001)), 'large.txt']] as const) await assert.rejects(extractSource(buffer, file));
  const unsafe = new AdmZip(bytes); unsafe.addFile('oversized-expansion.txt', Buffer.from('a'.repeat(2_000_000)));
  await assert.rejects(extractSource(unsafe.toBuffer(), 'unsafe.docx'));
  const empty = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('')] }] }));
  await assert.rejects(extractSource(empty, 'empty.docx'), /no contiene texto/);
});

test('source HTTP import authenticates before writing, enforces upload limits and deletes temporaries on every result', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'lexia-source-test-'));
  const app = express(); app.use('/source', createAuthMiddleware(async () => ({ uid: 'owner' } as DecodedIdToken)), createSourcesRouter(folder)); app.use(securityErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/source/import`;
    const send = (bytes: string, filename: string, auth = true, extra = false) => {
      const form = new FormData(); form.set('file', new Blob([bytes]), filename); if (extra) form.set('unwanted', 'field');
      return fetch(url, { method: 'POST', body: form, ...(auth ? { headers: { Authorization: 'Bearer test' } } : {}) });
    };
    assert.equal((await send('Fuente.', 'source.txt', false)).status, 401); assert.equal((await readdir(folder)).length, 0);
    const response = await send('Fuente sintética íntegra.', 'source.txt'); assert.equal(response.status, 200); assert.equal((await response.json()).text, 'Fuente sintética íntegra.');
    assert.equal((await send('binary', 'fake.pdf')).status, 415);
    assert.equal((await send('x'.repeat(10 * 1024 * 1024 + 1), 'large.txt')).status, 413);
    assert.ok((await send('Fuente.', 'source.txt', true, true)).status >= 400);
    assert.equal((await send('Fuente.', 'source.exe')).status, 415);
    // Cleanup finishes after the response has been sent.
    await new Promise<void>(resolve => setImmediate(resolve)); assert.deepEqual(await readdir(folder), []);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); assert.ok(folder.startsWith(join(tmpdir(), 'lexia-source-test-'))); await rm(folder, { recursive: true, force: true }); }
});
