import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import { Document, Packer, Paragraph } from 'docx';
import * as xlsx from 'xlsx';
import type OpenAI from 'openai';
import { LEGAL_REFERENCES, LEGAL_TASKS } from '../../shared/legalTasks.js';
import { generationFingerprint, parseGenerationRequest, validateGenerationConsent } from '../../shared/generation.js';
import { parseDraft } from '../../shared/documents.js';
import { reviewFingerprint, validateReview } from '../../shared/documentIntegrity.js';
import { KnowledgeService } from '../../server/services/KnowledgeService.js';
import { OpenAIService } from '../../server/services/OpenAIService.js';
import { createAiRouter } from '../../server/routes/ai.js';
import { taskProvenance } from './task-fixtures.js';
import { AIAssistantService } from '../../src/services/AIAssistantService.js';
import { ApiClient } from '../../src/services/ApiClient.js';

const request = (taskId = 'DECLARACION', formatId = 'default') => parseGenerationRequest({ contractVersion: 1, taskId, formatId,
  instruction: 'Solicitud sintética.', source: { original: 'Fuente original.', working: 'Copia de trabajo.', contrast: 'Auto separado.' }, draft: 'Borrador previo.', history: [] });
async function fixtures(run: (folder: string) => Promise<void>) {
  const folder = await mkdtemp(join(tmpdir(), 'lexia-tasks-'));
  try { await run(folder); }
  finally { assert.ok(folder.startsWith(join(tmpdir(), 'lexia-tasks-'))); await rm(folder, { recursive: true, force: true }); }
}
const doc = (text: string) => Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(text)] }] }));

test('all task variants reference known logical files; unsafe or mismatched selections are rejected', () => {
  assert.equal(LEGAL_TASKS.length, 15);
  assert.equal(new Set(LEGAL_TASKS.flatMap(task => task.formats.flatMap(format => format.references))).size, Object.keys(LEGAL_REFERENCES).length);
  for (const selection of [['unknown', 'default'], ['ACTA', 'medical'], ['DECLARACION', '../secrets']]) assert.throws(() => request(...selection as [string, string]), /desconocidos/);
  assert.throws(() => parseGenerationRequest({ ...request(), source: { original: '', working: 'Texto', contrast: '' } }), /fuente original/);
});

test('analysis confirmation binds instruction, sources, draft and history; every material edit invalidates it', async () => {
  const value = request('ANALISIS', 'source');
  await assert.rejects(validateGenerationConsent(value), /Confirma el análisis/);
  value.analysisConsent = { fingerprint: await generationFingerprint(value), confirmedAt: new Date().toISOString() };
  await validateGenerationConsent(value);
  for (const changed of [{ ...value, instruction: 'Otra solicitud' }, { ...value, source: { ...value.source, contrast: 'Otro auto' } },
    { ...value, source: { ...value.source, original: 'Otra fuente' } }, { ...value, draft: 'Otro borrador' }, { ...value, history: ['Otra instrucción'] }]) await assert.rejects(validateGenerationConsent(changed));
});

test('selected examples and separated sources reach Responses; provenance hashes the actual reference bytes', async () => fixtures(async folder => {
  const bytes = await doc('Ejemplo sintético de formato.');
  await writeFile(join(folder, LEGAL_REFERENCES.declaration.file), bytes);
  let calls = 0;
  const client = { responses: { create: async (args: { instructions: string; input: string }) => {
    calls++;
    const input = JSON.parse(args.input);
    assert.deepEqual(input.source, request().source);
    assert.equal(input.references.length, 1); assert.match(input.references[0].content, /Ejemplo sintético/);
    assert.match(args.instructions, /TAREA SELECCIONADA: Declaración/);
    assert.match(args.instructions, /no aportan hechos del asunto actual/);
    assert.ok(!args.instructions.includes('Utiliza únicamente estos nombres y hechos'));
    assert.match(args.instructions, /contradi|diferenc/i);
    return { status: 'completed', output_text: 'Resultado simulado.', output: [] };
  } } } as unknown as OpenAI;
  const result = await new OpenAIService(client, new KnowledgeService(folder)).generateTask(request());
  assert.equal(result.result, 'Resultado simulado.'); assert.equal(calls, 1);
  assert.equal(result.provenance.references[0].sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.match(result.provenance.rulesHash, /^[a-f0-9]{64}$/);
}));

test('missing, empty and unreadable required references block the provider; identifiers cannot be file paths', async () => fixtures(async folder => {
  let calls = 0;
  const client = { responses: { create: async () => { calls++; throw new Error('Must not be reached'); } } } as unknown as OpenAI;
  const knowledge = new KnowledgeService(folder); const service = new OpenAIService(client, knowledge);
  await assert.rejects(service.generateTask(request()), /Referencia ausente o ilegible/);
  await writeFile(join(folder, LEGAL_REFERENCES.declaration.file), await doc(''));
  await assert.rejects(service.generateTask(request()), /Referencia ausente o ilegible/);
  await writeFile(join(folder, LEGAL_REFERENCES.declaration.file), 'invalid binary');
  await assert.rejects(service.generateTask(request()), /Referencia ausente o ilegible/);
  await assert.rejects(knowledge.readReferences(['../secret' as 'declaration']), /Referencia desconocida/);
  assert.equal(calls, 0);
}));

test('directory and locations use their exact files without contacting AI', async () => fixtures(async folder => {
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, xlsx.utils.json_to_sheet([{ Sede: 'Centro', Correo: 'centro@example.test' }, { Sede: 'Sur', Correo: 'sur@example.test' }]), 'Test');
  await writeFile(join(folder, LEGAL_REFERENCES.directory.file), xlsx.write(book, { type: 'buffer', bookType: 'xlsx' }));
  await writeFile(join(folder, LEGAL_REFERENCES.locations.file), await doc('Sede sintética literal.'));
  const client = { responses: { create: async () => { throw new Error('No AI for directory'); } } } as unknown as OpenAI;
  const service = new OpenAIService(client, new KnowledgeService(folder));
  assert.equal(JSON.parse((await service.generateTask({ ...request('DIRECTORIO'), instruction: 'Centro' })).result)[0].Correo, 'centro@example.test');
  assert.equal((await service.generateTask({ ...request('SEDES'), instruction: LEGAL_TASKS.find(task => task.id === 'SEDES')!.instruction })).result, 'Sede sintética literal.');
}));

test('HTTP validates tasks and analysis before invoking even an injected provider', async () => {
  let calls = 0;
  const app = express(); app.use(express.json()); app.use('/ai', createAiRouter({ generateDocument: async () => { calls++; return 'Legacy'; },
    generateTask: async value => { calls++; return { result: 'Texto', provenance: taskProvenance(value) }; } }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const port = (server.address() as { port: number }).port;
    const send = (body: unknown) => fetch(`http://127.0.0.1:${port}/ai/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await send({ ...request(), taskId: 'unknown' })).status, 400);
    const analysis = request('ANALISIS', 'source'); assert.equal((await send(analysis)).status, 403);
    assert.equal((await send({ instruction: 'Prueba', mode: 'ANALISIS' })).status, 403);
    assert.equal((await send({ instruction: 'Prueba', mode: 'unknown' })).status, 400); assert.equal(calls, 0);
    analysis.analysisConsent = { fingerprint: await generationFingerprint(analysis), confirmedAt: new Date().toISOString() };
    assert.equal((await send(analysis)).status, 200); assert.equal(calls, 1);
    analysis.instruction = 'Cambió'; assert.equal((await send(analysis)).status, 403); assert.equal(calls, 1);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('draft parsing preserves legacy reviews and new provenance; changing task invalidates approval', async () => {
  const legacy = parseDraft({ title: 'Test', caseNumber: '', caseType: 'Penal', documentType: 'Acta', summary: '', transcription: 'Fuente', content: 'Texto', completedPhases: [], audit: { names: true, congruence: true, pii: true }, reviewHash: null });
  legacy.reviewHash = await reviewFingerprint(legacy);
  assert.equal((await validateReview(parseDraft(legacy))).reviewHash, legacy.reviewHash);
  assert.equal(parseDraft(legacy).generationTask, undefined);
  const upgraded = parseDraft({ ...legacy, generationTask: { taskId: 'DECLARACION', formatId: 'default' }, generationInstruction: 'Solicitud',
    generationLog: [{ phase: 'Declaración', instruction: 'Solicitud', sourceHash: '3'.repeat(64), createdAt: new Date().toISOString(), provenance: taskProvenance() }] });
  assert.equal(upgraded.generationLog?.[0].provenance?.taskId, 'DECLARACION');
  assert.equal((await validateReview(upgraded)).reviewHash, null);
  assert.throws(() => parseDraft({ ...upgraded, generationTask: { taskId: 'ACTA', formatId: 'default' } }));
});

test('client rejects wrong task or reference provenance and never records failed generations', async () => {
  for (const provenance of [undefined, taskProvenance({ taskId: 'ACTA', formatId: 'control' }),
    { ...taskProvenance(), references: [{ id: 'arrest', sha256: '2'.repeat(64) }] }]) {
    const ai = new AIAssistantService(new ApiClient(async () => 'test', async () => new Response(JSON.stringify({ result: 'Texto', provenance }), { headers: { 'Content-Type': 'application/json' } })));
    await assert.rejects(ai.generateTask(request())); assert.equal(ai.getState().userInstructions.length, 0);
  }
});
