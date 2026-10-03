import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Document, Packer, Paragraph } from 'docx';
import * as xlsx from 'xlsx';
import { DocumentGenerationService } from '../../server/services/DocumentGenerationService.js';
import type { TextGenerator } from '../../server/services/DocumentGenerationService.js';
import { createGenerationService } from '../../server/services/generationProvider.js';
import { DEFAULT_GEMINI_MODEL } from '../../server/services/GeminiService.js';
import { KnowledgeService } from '../../server/services/KnowledgeService.js';
import { RequestError } from '../../server/middleware/security.js';
import { getSystemPrompt, GPT_RULES_VERSION } from '../../server/legal/rules/index.js';
import { generationFingerprint, parseGenerationRequest } from '../../shared/generation.js';
import type { TaskGenerationRequest } from '../../shared/generation.js';
import { LEGAL_REFERENCES, resolveTask } from '../../shared/legalTasks.js';

const request = (taskId = 'SENTENCIA', formatId = 'source'): TaskGenerationRequest => parseGenerationRequest({
  contractVersion: 1, taskId, formatId, instruction: 'Instrucción sintética explícita.',
  source: { original: '  Fuente original literal.\nConservar espacios.  ', working: 'Copia de trabajo diferenciada.', contrast: 'Documento de contraste separado.' },
  draft: 'Apartado previo aceptado.', history: ['Primera instrucción explícita.', 'Segunda instrucción explícita.'],
});
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const doc = (text: string) => Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(text)] }] }));

async function fixtures(run: (folder: string) => Promise<void>) {
  const prefix = join(tmpdir(), 'lexia-generation-provider-');
  const folder = await mkdtemp(prefix);
  try { await run(folder); }
  finally {
    assert.ok(resolve(folder).startsWith(resolve(prefix)));
    await rm(folder, { recursive: true, force: true });
  }
}

test('Gemini selection never instantiates OpenAI, including when the selected generator fails', async () => {
  let openaiFactories = 0;
  let geminiFactories = 0;
  let geminiCalls = 0;
  const failingGemini = new DocumentGenerationService({ generate: async () => { geminiCalls++; throw new RequestError(503, 'Fallo sintético del proveedor seleccionado.'); } });
  const service = createGenerationService({ env: { AI_PROVIDER: 'gemini' },
    openaiFactory: () => { openaiFactories++; throw new Error('OpenAI must never be instantiated for Gemini.'); },
    geminiFactory: () => { geminiFactories++; return failingGemini; },
  });
  assert.equal(service, failingGemini);
  await assert.rejects(service.generateTask(request()), (error: RequestError) => error.status === 503);
  assert.equal(geminiFactories, 1); assert.equal(geminiCalls, 1); assert.equal(openaiFactories, 0);
});

test('unset or explicit OpenAI preserves default selection; an unknown provider returns 503 without either factory', () => {
  let openaiFactories = 0;
  let geminiFactories = 0;
  const sentinel = new DocumentGenerationService({ generate: async () => 'Synthetic result' });
  const factories = { openaiFactory: () => { openaiFactories++; return sentinel; }, geminiFactory: () => { geminiFactories++; return sentinel; } };
  assert.equal(createGenerationService({ ...factories, env: {} }), sentinel);
  assert.equal(createGenerationService({ ...factories, env: { AI_PROVIDER: 'openai' } }), sentinel);
  assert.equal(openaiFactories, 2); assert.equal(geminiFactories, 0);
  assert.throws(() => createGenerationService({ ...factories, env: { AI_PROVIDER: 'unknown-provider' } }), (error: RequestError) => error.status === 503);
  assert.equal(openaiFactories, 2); assert.equal(geminiFactories, 0);
});

test('explicit provider environments inherit neither process credentials nor model overrides', async () => {
  const syntheticGlobals = {
    AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'synthetic-global-gemini-key', GEMINI_MODEL: 'gemini-global-synthetic-model',
    OPENAI_API_KEY: 'synthetic-global-openai-key', OPENAI_MODEL: 'synthetic-global-openai-model',
  };
  const names = Object.keys(syntheticGlobals) as (keyof typeof syntheticGlobals)[];
  const originalValues = names.map(name => [name, process.env[name]] as const);
  const originalFetch = globalThis.fetch;
  const requests: { provider: 'gemini' | 'openai'; key: string; model: string }[] = [];
  try {
    for (const name of names) process.env[name] = syntheticGlobals[name];
    globalThis.fetch = async (input, options) => {
      const headers = new Headers(options?.headers ?? (input instanceof Request ? input.headers : undefined));
      const rawBody = typeof options?.body === 'string' ? options.body : input instanceof Request ? await input.clone().text() : '';
      const body = JSON.parse(rawBody);
      const destination = new URL(input instanceof Request ? input.url : String(input));
      const geminiKey = headers.get('x-goog-api-key');
      if (geminiKey !== null) {
        assert.equal(destination.origin, 'https://generativelanguage.googleapis.com');
        const model = destination.pathname.slice(destination.pathname.lastIndexOf('/') + 1).replace(':generateContent', '');
        requests.push({ provider: 'gemini', key: geminiKey, model });
        return new Response(JSON.stringify({ candidates: [{ index: 0, finishReason: 'STOP', content: { role: 'model', parts: [{ text: 'Resultado Gemini sintético.' }] } }] }), { headers: { 'Content-Type': 'application/json' } });
      }
      assert.equal(destination.pathname, '/v1/responses');
      requests.push({ provider: 'openai', key: headers.get('Authorization') ?? '', model: body.model });
      return new Response(JSON.stringify({ id: 'response_synthetic', object: 'response', status: 'completed', model: body.model,
        output_text: 'Resultado OpenAI sintético.', output: [{ id: 'message_synthetic', type: 'message', role: 'assistant', status: 'completed',
          content: [{ type: 'output_text', text: 'Resultado OpenAI sintético.', annotations: [] }] }] }), { headers: { 'Content-Type': 'application/json' } });
    };
    const absentGemini = createGenerationService({ env: { AI_PROVIDER: 'gemini' } });
    await assert.rejects(absentGemini.generateDocument('Solicitud sintética.', 'Fuente sintética.', 'GENERAL'), (error: RequestError) => error.status === 503);
    const absentOpenAI = createGenerationService({ env: {} });
    await assert.rejects(absentOpenAI.generateDocument('Solicitud sintética.', 'Fuente sintética.', 'GENERAL'), (error: RequestError) => error.status === 503);
    assert.equal(requests.length, 0, 'Missing explicit credentials must fail before sending a source, even when process credentials exist.');
    const gemini = createGenerationService({ env: { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'synthetic-explicit-gemini-key' } });
    assert.equal(await gemini.generateDocument('Solicitud sintética.', 'Fuente sintética.', 'GENERAL'), 'Resultado Gemini sintético.');
    const openai = createGenerationService({ env: { AI_PROVIDER: 'openai', OPENAI_API_KEY: 'synthetic-explicit-openai-key' } });
    assert.equal(await openai.generateDocument('Solicitud sintética.', 'Fuente sintética.', 'GENERAL'), 'Resultado OpenAI sintético.');
    assert.deepEqual(requests, [
      { provider: 'gemini', key: 'synthetic-explicit-gemini-key', model: DEFAULT_GEMINI_MODEL },
      { provider: 'openai', key: 'Bearer synthetic-explicit-openai-key', model: 'gpt-5.6-sol' },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of originalValues) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test('provider switching preserves rules, separated source, guided context and actual reference-byte provenance', async () => fixtures(async folder => {
  const bytes = await doc('Ejemplo DOCX sintético; no son hechos del asunto actual.');
  await writeFile(join(folder, LEGAL_REFERENCES.control.file), bytes);
  await writeFile(join(folder, LEGAL_REFERENCES.facts.file), await doc('Referencia NO seleccionada, caso distinto.'));
  const base = request('ACTA', 'control');
  const value = parseGenerationRequest({ ...base, context: {
    stepId: 'apertura', action: 'generate', matter: { id: 'matter_a', label: 'Asunto activo sintético', mode: 'individual', speaker: '', receptionClosed: true },
    sections: [{ id: 'section_a', title: 'Datos generales', content: base.draft, status: 'accepted' }],
    references: [{ id: 'user_ref', matterId: 'matter_a', title: 'Referencia jurídica aportada', source: 'USER', text: 'Texto aportado expresamente por el usuario.', url: '' }],
    userTemplate: '', requestAnalysis: false,
  } });
  const calls: { instructions: string; input: string }[] = [];
  const generator = (result: string): TextGenerator => ({ generate: async (instructions, input) => { calls.push({ instructions, input }); return result; } });
  const knowledge = new KnowledgeService(folder);
  const first = await new DocumentGenerationService(generator('Texto del proveedor A.'), knowledge).generateTask(value);
  const second = await new DocumentGenerationService(generator('Texto del proveedor B.'), knowledge).generateTask(value);
  assert.equal(first.result, 'Texto del proveedor A.'); assert.equal(second.result, 'Texto del proveedor B.');
  assert.deepEqual(calls[0], calls[1]);
  assert.deepEqual(first.provenance, second.provenance);
  const input = JSON.parse(calls[0].input);
  assert.deepEqual(input.source, value.source);
  assert.equal(input.draft, value.draft); assert.deepEqual(input.history, value.history); assert.deepEqual(input.context, value.context);
  assert.equal(input.references.length, 1); assert.equal(input.references[0].filename, LEGAL_REFERENCES.control.file);
  assert.match(input.references[0].content, /Ejemplo DOCX sintético/);
  assert.equal(calls[0].input.includes('Referencia NO seleccionada'), false);
  assert.equal(input.analysisConfirmed, false);
  assert.match(calls[0].instructions, /no aportan hechos del asunto actual/);
  assert.equal(first.provenance.rulesVersion, GPT_RULES_VERSION);
  assert.equal(first.provenance.rulesHash, hash(calls[0].instructions));
  assert.deepEqual(first.provenance.references, [{ id: 'control', sha256: hash(bytes) }]);
}));

test('analysis consent is checked before reference reads or provider calls and material edits invalidate it', async () => fixtures(async folder => {
  const knowledge = new KnowledgeService(folder);
  const readReferences = knowledge.readReferences.bind(knowledge);
  let referenceReads = 0;
  let generations = 0;
  knowledge.readReferences = async ids => { referenceReads++; return readReferences(ids); };
  const service = new DocumentGenerationService({ generate: async (_instructions, input) => {
    generations++;
    assert.equal(JSON.parse(input).analysisConfirmed, true);
    return 'Análisis sintético expresamente confirmado.';
  } }, knowledge);
  const value = request('ANALISIS', 'source');
  await assert.rejects(service.generateTask(value), /Confirma el análisis/);
  assert.equal(referenceReads, 0); assert.equal(generations, 0);
  const confirmed = { ...value, analysisConsent: { fingerprint: await generationFingerprint(value), confirmedAt: '2026-10-02T12:00:00.000Z' } };
  assert.equal((await service.generateTask(confirmed)).result, 'Análisis sintético expresamente confirmado.');
  assert.equal(referenceReads, 1); assert.equal(generations, 1);
  for (const changed of [{ ...confirmed, instruction: 'Otro alcance.' }, { ...confirmed, source: { ...confirmed.source, original: 'Otra fuente.' } }]) {
    await assert.rejects(service.generateTask(changed), /Confirma el análisis/);
  }
  assert.equal(referenceReads, 1); assert.equal(generations, 1);
}));

test('directory and exact locations remain local, with no forwarding to any generation provider', async () => fixtures(async folder => {
  const book = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(book, xlsx.utils.json_to_sheet([{ Sede: 'Centro sintético', Correo: 'centro@example.test' }, { Sede: 'Sur sintético', Correo: 'sur@example.test' }]), 'Directorio sintético');
  const directoryBytes = xlsx.write(book, { type: 'buffer', bookType: 'xlsx' });
  const locationsBytes = await doc('Sedes sintéticas literales, sin agregar domicilios.');
  await writeFile(join(folder, LEGAL_REFERENCES.directory.file), directoryBytes);
  await writeFile(join(folder, LEGAL_REFERENCES.locations.file), locationsBytes);
  let calls = 0;
  const service = new DocumentGenerationService({ generate: async () => { calls++; throw new Error('Local data must not be forwarded.'); } }, new KnowledgeService(folder));
  const directory = await service.generateTask({ ...request('DIRECTORIO', 'default'), instruction: 'Centro' });
  assert.deepEqual(JSON.parse(directory.result), [{ Hoja: 'Directorio sintético', Sede: 'Centro sintético', Correo: 'centro@example.test' }]);
  assert.equal(directory.provenance.references[0].sha256, hash(directoryBytes));
  const locations = await service.generateTask({ ...request('SEDES', 'default'), instruction: resolveTask({ taskId: 'SEDES', formatId: 'default' }).task.instruction });
  assert.equal(locations.result, 'Sedes sintéticas literales, sin agregar domicilios.');
  assert.equal(locations.provenance.references[0].sha256, hash(locationsBytes));
  assert.equal(JSON.parse(await service.generateDocument('Centro', '', 'DIRECTORIO'))[0].Correo, 'centro@example.test');
  assert.equal(calls, 0);
}));

test('legacy calls preserve literal source, selected knowledge and instruction history without task coercion', async () => fixtures(async folder => {
  await writeFile(join(folder, LEGAL_REFERENCES.declaration.file), await doc('Ejemplo de referencia sintético.'));
  const source = '  Fuente original\ncon espacios y marcas [00:01].  ';
  const history = ['Primera instrucción literal.', 'Segunda instrucción literal.'];
  const instruction = 'Instrucción actual literal.';
  const controller = new AbortController();
  const calls: { instructions: string; input: string }[] = [];
  const service = new DocumentGenerationService({ generate: async (instructions, input, options) => {
    calls.push({ instructions, input });
    assert.equal(options?.signal, controller.signal);
    return '  Respuesta literal del proveedor.  ';
  } }, new KnowledgeService(folder));
  assert.equal(await service.generateDocument(instruction, source, 'DECLARACION', history, { signal: controller.signal }), '  Respuesta literal del proveedor.  ');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].instructions, getSystemPrompt('DECLARACION'));
  assert.ok(calls[0].input.includes('\n--- TRANSCRIPCION/FUENTE ORIGINAL ---\n' + source + '\n-----------------------------------\n'));
  assert.ok(calls[0].input.includes(`[ARCHIVO: ${LEGAL_REFERENCES.declaration.file}]\nEjemplo de referencia sintético.`));
  assert.ok(calls[0].input.includes(history.join('\n')));
  assert.ok(calls[0].input.endsWith('\nINSTRUCCION ACTUAL: ' + instruction));
  await assert.rejects(service.generateDocument(instruction, source, 'ANALISIS'), (error: RequestError) => error.status === 403);
  assert.equal(calls.length, 1);
}));

test('missing, empty and corrupt required DOCX references prevent forwarding or false successful provenance', async () => fixtures(async folder => {
  let calls = 0;
  const service = new DocumentGenerationService({ generate: async () => { calls++; return 'Must not be returned.'; } }, new KnowledgeService(folder));
  const value = request('DECLARACION', 'default');
  await assert.rejects(service.generateTask(value), /Referencia ausente o ilegible/);
  await writeFile(join(folder, LEGAL_REFERENCES.declaration.file), await doc(''));
  await assert.rejects(service.generateTask(value), /Referencia ausente o ilegible/);
  await writeFile(join(folder, LEGAL_REFERENCES.declaration.file), 'Synthetic invalid DOCX bytes');
  await assert.rejects(service.generateTask(value), /Referencia ausente o ilegible/);
  assert.equal(calls, 0);
}));

test('cancelled requests and empty generator results never become successful task or legacy text', async () => fixtures(async folder => {
  let calls = 0;
  const before = new AbortController(); before.abort();
  const empty = new DocumentGenerationService({ generate: async () => { calls++; return ' \n '; } }, new KnowledgeService(folder));
  await assert.rejects(empty.generateTask(request(), { signal: before.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
  await assert.rejects(empty.generateTask(request()), (error: RequestError) => error.status === 502);
  await assert.rejects(empty.generateDocument('Synthetic instruction', 'Original', 'GENERAL'), (error: RequestError) => error.status === 502);
  assert.equal(calls, 2);
  const during = new AbortController();
  const late = new DocumentGenerationService({ generate: async (_instructions, _input, options) => {
    assert.equal(options?.signal, during.signal);
    during.abort();
    return 'Late text must be ignored.';
  } }, new KnowledgeService(folder));
  await assert.rejects(late.generateTask(request(), { signal: during.signal }), { name: 'AbortError' });
}));
