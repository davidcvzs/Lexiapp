import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GeminiService, completedGeminiText, DEFAULT_GEMINI_MODEL, MAX_GEMINI_OUTPUT_CHARACTERS,
  MAX_GEMINI_RESPONSE_BYTES } from '../../server/services/GeminiService.js';
import { OperationTimeoutError } from '../../shared/operations.js';
import { RequestError } from '../../server/middleware/security.js';

const response = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
const completed = (text = '  Apartado sintético íntegro.\nSin cambios de fuente.  ') => ({
  candidates: [{ index: 0, finishReason: 'STOP', content: { role: 'model', parts: [{ text }] } }],
});
const configured = (fetcher: typeof fetch, options: { timeoutMs?: number; model?: string } = {}) =>
  new GeminiService({ apiKey: 'synthetic-google-credential', fetcher, ...options });
const safeFailure = (status: number) => (error: RequestError) => error.status === status && !error.message.includes('sensitive provider data');

test('Gemini sends exact legal instructions and serialized context once with its key only in the auth header', async () => {
  const instructions = 'Reglas sintéticas exactas.\nMantén la fuente literal.';
  const input = JSON.stringify({ instruction: 'Apartado', source: { original: 'Original íntegro.', working: 'Trabajo.', contrast: '' },
    references: [{ filename: 'synthetic.docx', content: 'Modelo de ejemplo.' }], context: { matter: { id: 'matter-1' } } });
  const originalHash = createHash('sha256').update(instructions + '\n' + input).digest('hex');
  let requests = 0;
  const service = configured(async (url, options) => {
    requests++;
    assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models/' + DEFAULT_GEMINI_MODEL + ':generateContent');
    assert.equal(options?.method, 'POST'); assert.equal(options?.redirect, 'error');
    assert.equal(new Headers(options?.headers).get('x-goog-api-key'), 'synthetic-google-credential');
    assert.ok(!String(url).includes('synthetic-google-credential')); assert.ok(!String(options?.body).includes('synthetic-google-credential'));
    const body = JSON.parse(String(options?.body));
    assert.deepEqual(body, { systemInstruction: { parts: [{ text: instructions }] }, contents: [{ role: 'user', parts: [{ text: input }] }] });
    assert.ok(!('tools' in body)); assert.ok(!('generationConfig' in body)); assert.ok(!('cachedContent' in body));
    assert.ok(options?.signal instanceof AbortSignal); return response(completed());
  });
  assert.equal(await service.generate(instructions, input), completed().candidates[0].content.parts[0].text);
  assert.equal(requests, 1); assert.equal(createHash('sha256').update(instructions + '\n' + input).digest('hex'), originalHash);
});

test('Gemini text extraction excludes thought parts and preserves visible spaces and Unicode exactly', () => {
  const output = { candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: [
    { text: 'Internal thought not document text.', thought: true }, { text: '  Sí, señor.\n', thoughtSignature: 'opaque-provider-metadata' },
    { text: 'Literal sin inventar.  ', thought: false },
  ] } }] };
  assert.equal(completedGeminiText(output), '  Sí, señor.\nLiteral sin inventar.  ');
});

test('incomplete, ambiguous, malformed and nontext completions never produce a partial document', () => {
  for (const payload of [
    null, {}, { error: { message: 'sensitive provider data' } }, { candidates: [] },
    { candidates: [...completed().candidates, ...completed().candidates] },
    { candidates: [{ ...completed().candidates[0], finishReason: 'MAX_TOKENS' }] },
    { candidates: [{ ...completed().candidates[0], finishReason: '' }] },
    { candidates: [{ ...completed().candidates[0], finishReason: 'OTHER' }] },
    { candidates: [{ ...completed().candidates[0], index: 1 }] },
    { candidates: [{ finishReason: 'STOP', content: { role: 'user', parts: [{ text: 'Partial' }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ functionCall: { name: 'invented-tool' } }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Partial', inlineData: {} }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Only thoughts', thought: true }] } }] },
    completed(' \n '),
  ]) assert.throws(() => completedGeminiText(payload), safeFailure(502));
});

test('prompt and candidate filtering refuse the result without exposing provider descriptions', () => {
  for (const payload of [
    { ...completed(), promptFeedback: { blockReason: 'SAFETY', description: 'sensitive provider data' } },
    { ...completed(), promptFeedback: { safetyRatings: [{ blocked: true }] } },
    { candidates: [{ ...completed().candidates[0], finishReason: 'RECITATION', finishMessage: 'sensitive provider data' }] },
    { candidates: [{ ...completed().candidates[0], finishReason: 'SAFETY' }] },
    { candidates: [{ ...completed().candidates[0], finishReason: 'SPII' }] },
    { candidates: [{ ...completed().candidates[0], safetyRatings: [{ blocked: true }] }] },
  ]) assert.throws(() => completedGeminiText(payload), safeFailure(422));
  for (const payload of [{ ...completed(), promptFeedback: 'invalid' },
    { ...completed(), promptFeedback: { safetyRatings: [{ blocked: 'false' }] } }]) {
    assert.throws(() => completedGeminiText(payload), safeFailure(502));
  }
});

test('HTTP quota, access and provider errors are safe and never retry or fall back to another AI provider', async () => {
  for (const [httpStatus, expected] of [[429, 429], [401, 503], [403, 503], [404, 503], [400, 422], [500, 503], [503, 503], [418, 502]]) {
    let requests = 0;
    const service = configured(async url => { requests++; assert.ok(String(url).startsWith('https://generativelanguage.googleapis.com/'));
      return response({ error: { message: 'sensitive provider data' } }, httpStatus); });
    await assert.rejects(service.generate('Synthetic rules', 'Synthetic context'), safeFailure(expected)); assert.equal(requests, 1);
  }
});

test('configuration and empty input fail before sending either credentials or context', async () => {
  let calls = 0; const fetcher: typeof fetch = async () => { calls++; return response(completed()); };
  for (const options of [{ apiKey: '', model: DEFAULT_GEMINI_MODEL }, { apiKey: 'VALOR_FALTANTE', model: DEFAULT_GEMINI_MODEL },
    { apiKey: 'synthetic-google-credential', model: 'gemini-3.8-flash?key=sensitive' },
    { apiKey: 'synthetic-google-credential', model: 'https://another-provider.invalid' }]) {
    await assert.rejects(new GeminiService({ ...options, fetcher }).generate('Rules', 'Source'), safeFailure(503));
  }
  const service = configured(fetcher);
  for (const [instructions, input] of [['', 'Source'], ['Rules', ' \n ']]) await assert.rejects(service.generate(instructions, input), safeFailure(400));
  assert.equal(calls, 0);
});

test('cancellation and the total deadline stop stalled fetches and stalled response bodies', async () => {
  for (const kind of ['fetch', 'body']) {
    const fetcher: typeof fetch = async () => kind === 'fetch' ? new Promise<Response>(() => {})
      : new Response(new ReadableStream<Uint8Array>({ start() {} }));
    await assert.rejects(configured(fetcher, { timeoutMs: 10 }).generate('Rules', 'Source'), OperationTimeoutError);
    const controller = new AbortController(); const service = configured(fetcher);
    const timer = setTimeout(() => controller.abort(new DOMException('Synthetic cancel', 'AbortError')), 10);
    try { await assert.rejects(service.generate('Rules', 'Source', { signal: controller.signal }), { name: 'AbortError' }); }
    finally { clearTimeout(timer); }
  }
  let calls = 0; const controller = new AbortController(); controller.abort();
  await assert.rejects(configured(async () => { calls++; return response(completed()); }).generate('Rules', 'Source', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('response, result and input limits reject overflow without truncation or billable retry', async () => {
  assert.equal(completedGeminiText(completed('á'.repeat(MAX_GEMINI_OUTPUT_CHARACTERS))).length, MAX_GEMINI_OUTPUT_CHARACTERS);
  assert.throws(() => completedGeminiText(completed('x'.repeat(MAX_GEMINI_OUTPUT_CHARACTERS + 1))), safeFailure(502));
  const oversized = configured(async () => response({ ignoredMetadata: 'x'.repeat(MAX_GEMINI_RESPONSE_BYTES), ...completed() }));
  await assert.rejects(oversized.generate('Rules', 'Source'), safeFailure(502));
  let calls = 0; const inputLimit = configured(async () => { calls++; return response(completed()); });
  await assert.rejects(inputLimit.generate('Rules', 'x'.repeat(MAX_GEMINI_RESPONSE_BYTES + 1)), safeFailure(413)); assert.equal(calls, 0);
});

test('invalid JSON, UTF-8 and broken body streams never return a provider diagnostic as legal text', async () => {
  for (const transport of [
    new Response('<html>sensitive provider data</html>'),
    new Response(new Uint8Array([0xc3, 0x28])),
    new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('sensitive provider data')); } })),
  ]) await assert.rejects(configured(async () => transport).generate('Rules', 'Source'), safeFailure(502));
});
