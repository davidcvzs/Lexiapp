import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { ApiClient, ApiError } from '../../src/services/ApiClient.js';
import { TranscriptionService } from '../../src/services/TranscriptionService.js';
import { AIAssistantService } from '../../src/services/AIAssistantService.js';
import { OperationTimeoutError } from '../../shared/operations.js';
import { CloudflareTranscriptionService, normalizeWorkerJob } from '../../server/services/CloudflareTranscriptionService.js';
import { completedResponseText } from '../../server/services/OpenAIService.js';
import { createAiRouter } from '../../server/routes/ai.js';
import { createTranscriptionRouter } from '../../server/routes/transcription.js';
import { createAuthMiddleware } from '../../server/middleware/auth.js';
import { securityErrorHandler } from '../../server/middleware/security.js';
import type { Response as OpenAIResponse } from 'openai/resources/responses/responses';
import { FixtureJobStore } from './persistence-fixtures.js';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const media = () => new File(['synthetic audio'], 'sample.wav', { type: 'audio/wav' });

test('upload uses file field; polls with renewed tokens and returns complete source text', async () => {
  let calls = 0;
  let tokens = 0;
  const statuses: string[] = [];
  const api = new ApiClient(async () => `token-${++tokens}`, async (url, options) => {
    calls++;
    assert.equal(new Headers(options?.headers).get('Authorization'), `Bearer token-${calls}`);
    if (calls === 1) {
      assert.equal(url, '/api/transcription/jobs');
      assert.equal(options?.method, 'POST');
      assert.ok(options?.body instanceof FormData);
      assert.ok(options.body.get('file') instanceof File);
      assert.equal(options.body.get('media'), null);
      return json({ job_id: 'job-1', status: 'queued' }, 201);
    }
    assert.equal(url, '/api/transcription/jobs/job-1');
    return calls === 2 ? json({ job_id: 'job-1', status: 'generating_transcript' })
      : json({ job_id: 'job-1', status: 'completed', text: '  Texto íntegro.\nSin omisiones.  ' });
  });
  const result = await new TranscriptionService(api, { pollMs: 1 }).processMedia(media(), { onStatus: value => statuses.push(value) });
  assert.equal(result, '  Texto íntegro.\nSin omisiones.  ');
  assert.deepEqual(statuses, ['uploading', 'queued', 'generating_transcript', 'completed']);
  assert.equal(calls, 3);
});

test('401 refreshes once; 429/503 and failed POSTs never cause automatic duplicate jobs', async () => {
  const refresh: boolean[] = [];
  let calls = 0;
  const api = new ApiClient(async force => { refresh.push(force); return 'token'; }, async () => {
    calls++;
    return calls === 1 ? json({ error: 'Expired' }, 401) : json({ result: 'Texto válido' });
  });
  assert.equal(await new AIAssistantService(api).sendInstruction('Prueba'), 'Texto válido');
  assert.deepEqual(refresh, [false, true]);
  for (const status of [401, 429, 503]) {
    let attempts = 0;
    const failing = new ApiClient(async () => 'token', async () => { attempts++; return json({ error: 'Temporal' }, status); });
    await assert.rejects(new AIAssistantService(failing).sendInstruction('Prueba'), (error: ApiError) => error.status === status);
    assert.equal(attempts, status === 401 ? 2 : 1);
  }
});

test('empty, malformed, unknown, failed and mismatched transcription jobs never succeed', async () => {
  for (const value of [
    { job_id: 'j', status: 'completed', text: '   ' },
    { job_id: 'j', status: 'mystery' },
    { job_id: 'j', status: 'failed', error: 'Falló el trabajo' },
    { job_id: 'another', status: 'completed', text: 'Otro trabajo' },
  ]) {
    const service = new TranscriptionService(new ApiClient(async () => 'token', async () => json(value)));
    await assert.rejects(service.resumeJob('j'));
  }
  const html = new TranscriptionService(new ApiClient(async () => 'token', async () => new Response('<html>Not an API</html>')));
  await assert.rejects(html.processMedia(media()), /respuesta inválida/);
});

test('cancel, total timeout, HTTP timeout and stalled token refresh stop the operation', async () => {
  let calls = 0;
  const controller = new AbortController();
  const api = new ApiClient(async () => 'token', async () => { calls++; return json({ job_id: 'j', status: 'queued' }); });
  const service = new TranscriptionService(api, { pollMs: 500 });
  const cancelled = service.processMedia(media(), { signal: controller.signal, onJobCreated: () => controller.abort() });
  await assert.rejects(cancelled, { name: 'AbortError' });
  assert.equal(calls, 1);
  const timed = new TranscriptionService(api, { pollMs: 2, timeoutMs: 15 });
  await assert.rejects(timed.resumeJob('j'), OperationTimeoutError);
  const stalled = new ApiClient(async () => 'token', async () => new Promise<Response>(() => {}));
  await assert.rejects(stalled.request('/api/test', {}, 10), OperationTimeoutError);
  const stalledToken = new ApiClient(async () => new Promise<string>(() => {}));
  await assert.rejects(stalledToken.request('/api/test', {}, 10), OperationTimeoutError);
});

test('resuming an existing job never uploads again', async () => {
  const api = new ApiClient(async () => 'token', async (url, options) => {
    assert.equal(url, '/api/transcription/jobs/j');
    assert.equal(options?.body, undefined);
    assert.notEqual(options?.method, 'POST');
    return json({ job_id: 'j', status: 'completed', text: 'Recuperada' });
  });
  assert.equal(await new TranscriptionService(api).resumeJob('j'), 'Recuperada');
});

test('AI consumes JSON text atomically and does not record failed instructions', async () => {
  let output: unknown = { result: 'Sección completa.' };
  const ai = new AIAssistantService(new ApiClient(async () => 'token', async (_url, options) => {
    assert.equal(JSON.parse(options?.body as string).stream, undefined);
    return json(output);
  }));
  assert.equal(await ai.sendInstruction('Primera'), 'Sección completa.');
  for (const invalid of ['', '  ', [], {}, null]) {
    output = { result: invalid };
    await assert.rejects(ai.sendInstruction('No registrar'), /texto válido/);
  }
  assert.deepEqual(ai.getState().userInstructions, ['Primera']);
});

test('Worker normalizes aliases and text fields without inventing content', () => {
  assert.equal(normalizeWorkerJob({ job_id: 'j', status: 'pending' }).status, 'queued');
  assert.equal(normalizeWorkerJob({ status: 'completed', transcription: 'Original' }, 'j').text, 'Original');
  assert.equal(normalizeWorkerJob({ status: 'completed', transcript: 'Original' }, 'j').text, 'Original');
  assert.equal(normalizeWorkerJob({ status: 'error', error: 'upstream secret' }, 'j').error?.includes('secret'), false);
  assert.throws(() => normalizeWorkerJob({ status: 'completed' }, 'j'));
  assert.throws(() => normalizeWorkerJob({ status: 'unknown' }, 'j'));
  assert.throws(() => normalizeWorkerJob({ job_id: 'other', status: 'queued' }, 'j'));
  assert.throws(() => normalizeWorkerJob({ job_id: '..', status: 'queued' }));
});

test('OpenAI extracts output_text, rejects incomplete/refused/empty responses', () => {
  const complete: Pick<OpenAIResponse, 'status' | 'output_text' | 'output'> = { status: 'completed', output_text: 'Texto final.', output: [] };
  assert.equal(completedResponseText(complete), 'Texto final.');
  assert.throws(() => completedResponseText({ ...complete, output_text: '' }));
  assert.throws(() => completedResponseText({ ...complete, status: 'incomplete' }));
  assert.throws(() => completedResponseText({ ...complete, output: [{ id: 'm', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'refusal', refusal: 'No' }] }] }));
});

test('HTTP route chain: upload → owner-only polling → generation returns a string', async () => {
  const app = express();
  app.use(express.json());
  app.use(createAuthMiddleware(async uid => ({ uid } as DecodedIdToken)));
  let providerPolls = 0;
  let generationInput = '';
  app.use('/api/transcription', createTranscriptionRouter({
    create: async () => ({ job_id: 'integration-job', status: 'queued' }),
    get: async () => { providerPolls++; return { job_id: 'integration-job', status: 'completed', text: 'Fuente sintética íntegra.' }; },
  }, (req, _res, next) => { req.file = { path: 'fixture' } as Express.Multer.File; next(); }, new FixtureJobStore()));
  app.use('/api/ai', createAiRouter({ generateDocument: async instruction => { generationInput = instruction; return 'Sección generada.'; } }));
  app.use(securityErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const transport: typeof fetch = (url, options) => fetch(base + String(url), options);
    const owner = new ApiClient(async () => 'owner', transport);
    const other = new ApiClient(async () => 'other', transport);
    const text = await new TranscriptionService(owner, { pollMs: 1 }).processMedia(media());
    assert.equal(text, 'Fuente sintética íntegra.');
    await assert.rejects(other.request('/api/transcription/jobs/integration-job'), (error: ApiError) => error.status === 403);
    assert.equal(providerPolls, 1);
    assert.equal(await new AIAssistantService(owner).sendInstruction(text), 'Sección generada.');
    assert.equal(generationInput, text);
    const invalid = await fetch(base + '/api/ai/generate', { method: 'POST', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction: {} }) });
    assert.equal(invalid.status, 400);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('an unavailable database prevents provider uploads and returns a safe storage error', async () => {
  let uploads = 0;
  const store = new FixtureJobStore();
  store.ensureAvailable = async () => { throw Object.assign(new Error('sensitive provider diagnostic'), { code: 7 }); };
  const app = express(); app.use(createAuthMiddleware(async uid => ({ uid } as DecodedIdToken)));
  app.use(createTranscriptionRouter({
    create: async () => { uploads++; return { job_id: 'j', status: 'queued' }; },
    get: async () => ({ job_id: 'j', status: 'queued' }),
  }, (req, _res, next) => { req.file = { originalname: 'fixture.wav' } as Express.Multer.File; next(); }, store));
  app.use(securityErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/jobs`, { method: 'POST', headers: { Authorization: 'Bearer unavailable-storage-owner' } });
    assert.equal(response.status, 503); const body = await response.text();
    assert.match(body, /almacenamiento/); assert.ok(!body.includes('sensitive')); assert.equal(uploads, 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('AI endpoint refuses empty results and translates quota failures without leaking provider details', async () => {
  let mode = 'empty';
  const app = express(); app.use(express.json());
  app.use(createAiRouter({ generateDocument: async () => {
    if (mode === 'quota' || mode === 'credits') throw Object.assign(new Error('secret provider diagnostic'), { code: mode === 'quota' ? 'insufficient_quota' : 'credit_balance_exhausted', status: 429 });
    return '   ';
  } }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  try {
    for (const [nextMode, status] of [['empty', 502], ['quota', 503], ['credits', 503]] as const) {
      mode = nextMode;
      const response: Response = await fetch(`http://127.0.0.1:${address.port}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ instruction: 'test' }) });
      assert.equal(response.status, status);
      const body = await response.text();
      assert.ok(!body.includes('secret'));
      assert.ok(!body.includes('"result"'));
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('Worker configuration failures are actionable and never contact a placeholder address', async () => {
  let requests = 0;
  const fetcher: typeof fetch = async () => { requests++; return json({}); };
  for (const options of [
    { url: 'VALOR_FALTANTE', secret: 'configured-test-secret' },
    { url: 'https://example.invalid', secret: 'VALOR_FALTANTE' },
    { url: '', secret: '' },
  ]) {
    const provider = new CloudflareTranscriptionService({ ...options, fetcher });
    await assert.rejects(provider.get('j', new AbortController().signal), (error: { status: number }) => error.status === 503);
  }
  assert.equal(requests, 0);
});

test('Worker explicit credentials override environment credentials and never replace an explicit empty value', async () => {
  const previousBackend = process.env.CLOUDFLARE_BACKEND_SECRET;
  const previousLegacy = process.env.CLOUDFLARE_TRANSCRIPTION_SECRET;
  process.env.CLOUDFLARE_BACKEND_SECRET = 'synthetic-environment-backend';
  process.env.CLOUDFLARE_TRANSCRIPTION_SECRET = 'synthetic-environment-legacy';
  let requests = 0;
  let expectedSecret = '';
  const fetcher: typeof fetch = async (url, options) => {
    requests++;
    assert.equal(url, 'https://example.invalid/jobs/j?include_text=false');
    assert.equal(new Headers(options?.headers).get('x-api-key'), expectedSecret);
    return json({ job_id: 'j', status: 'queued' });
  };
  try {
    for (const [options, expected] of [
      [{ secret: 'synthetic-explicit-legacy' }, 'synthetic-explicit-legacy'],
      [{ backendSecret: 'synthetic-explicit-backend', secret: 'synthetic-explicit-legacy' }, 'synthetic-explicit-backend'],
      [{}, 'synthetic-environment-backend'],
    ] as const) {
      expectedSecret = expected;
      const provider = new CloudflareTranscriptionService({ url: 'https://example.invalid', ...options, fetcher });
      assert.equal((await provider.get('j', new AbortController().signal)).status, 'queued');
    }
    for (const options of [{ secret: '' }, { backendSecret: '', secret: 'synthetic-explicit-legacy' }]) {
      const provider = new CloudflareTranscriptionService({ url: 'https://example.invalid', ...options, fetcher });
      await assert.rejects(provider.get('j', new AbortController().signal), (error: { status: number }) => error.status === 503);
    }
    assert.equal(requests, 3);
    delete process.env.CLOUDFLARE_BACKEND_SECRET;
    expectedSecret = 'synthetic-environment-legacy';
    const legacy = new CloudflareTranscriptionService({ url: 'https://example.invalid', fetcher });
    assert.equal((await legacy.get('j', new AbortController().signal)).status, 'queued');
    assert.equal(requests, 4);
  } finally {
    if (previousBackend === undefined) delete process.env.CLOUDFLARE_BACKEND_SECRET;
    else process.env.CLOUDFLARE_BACKEND_SECRET = previousBackend;
    if (previousLegacy === undefined) delete process.env.CLOUDFLARE_TRANSCRIPTION_SECRET;
    else process.env.CLOUDFLARE_TRANSCRIPTION_SECRET = previousLegacy;
  }
});
