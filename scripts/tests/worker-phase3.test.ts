import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { CloudflareTranscriptionService } from '../../server/services/CloudflareTranscriptionService.js';
import worker, { JobJournal, parseVtt, transcriptHash } from '../../workers/transcriptor-legal/src/index.js';
import type { Env, JournalState, Segment } from '../../workers/transcriptor-legal/src/index.js';

class MemoryStorage {
  values = new Map<string, unknown>(); private queue: Promise<unknown> = Promise.resolve();
  async get<T>(key: string): Promise<T | undefined> { return structuredClone(this.values.get(key)) as T | undefined; }
  async put(key: string, value: unknown) { this.values.set(key, structuredClone(value)); }
  async transaction<T>(fn: (storage: MemoryStorage) => Promise<T>): Promise<T> {
    const next = this.queue.then(() => fn(this)); this.queue = next.catch(() => {}); return next;
  }
}
function fixture() {
  const storage = new MemoryStorage(); const journal = new JobJournal({ storage } as JournalState);
  let uploads = 0; let deletions = 0; const uploadedOptions: Record<string, unknown>[] = [];
  const env: Env = {
    ACTION_API_KEY: 'synthetic-action-credential', LEXIA_API_KEY: 'synthetic-backend-credential',
    CF_ACCOUNT_ID: 'synthetic-account', CF_API_TOKEN: 'synthetic-provider-credential', CORS_ORIGINS: 'https://lexia.example',
    JOURNAL: { idFromName: value => value, get: () => ({ fetch: request => journal.fetch(request) }) },
    STREAM: {
      upload: async (_link, options) => { uploadedOptions.push(options); return { id: `video${++uploads}`, readyToStream: false, status: { state: 'queued' }, scheduledDeletion: String(options.scheduledDeletion) }; },
      video: () => ({ delete: async () => { deletions++; } }),
    },
  };
  return { env, storage, uploadedOptions, uploads: () => uploads, deletions: () => deletions };
}
const headers = (backend = false, owner = 'owner1') => ({ Authorization: `Bearer ${backend ? 'synthetic-backend-credential' : 'synthetic-action-credential'}`, ...(backend ? { 'x-owner-id': owner } : {}) });
async function create(env: Env, id = 'request1', backend = false) {
  const response = await worker.fetch(new Request('https://worker.example/jobs', { method: 'POST', headers: { ...headers(backend), 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: id, openaiFileIdRefs: [{ id: `file-${id}`, name: 'audiencia.webm', download_link: 'https://files.example/audiencia.webm' }] }) }), env);
  const body = await response.json() as Record<string, unknown>; assert.equal(response.status, 200, JSON.stringify(body)); return body;
}
async function call(env: Env, path: string, token?: string, backend = false, method = 'GET', owner = 'owner1') {
  return worker.fetch(new Request(`https://worker.example${path}`, { method, headers: { ...headers(backend, owner), ...(token ? { 'x-job-token': token } : {}) } }), env);
}
const cf = (result: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, result }), { status });
const vtt = (count = 205, payload?: string) => 'WEBVTT\n\n' + Array.from({ length: count }, (_, index) => {
  const stamp = (second: number) => `00:${String(Math.floor(second / 60)).padStart(2, '0')}:${String(second % 60).padStart(2, '0')}.000`;
  return `cue-${index}\n${stamp(index)} --> ${stamp(index + 1)}\n${payload || (index === 0 ? '<v Fiscalía>Texto &amp; íntegro</v>' : `Segmento ${index}`)}\n\n`;
}).join('');
async function simulated(fn: typeof fetch, run: () => Promise<void>) {
  const previous = globalThis.fetch; globalThis.fetch = fn;
  try { await run(); } finally { globalThis.fetch = previous; }
}

test('worker rejects absent/mismatched configured secrets; public health never contacts Stream', async () => {
  const f = fixture();
  await simulated(async () => { throw new Error('provider must not run'); }, async () => {
    const request = new Request('https://worker.example/jobs', { method: 'POST', headers: headers() });
    assert.equal((await worker.fetch(request, { ...f.env, ACTION_API_KEY: undefined })).status, 503);
    assert.equal((await worker.fetch(request, { ...f.env, ACTION_API_KEY: 'different-configured-credential' })).status, 401);
    assert.equal((await worker.fetch(request, { ...f.env, LEXIA_API_KEY: f.env.ACTION_API_KEY })).status, 503);
    assert.equal((await worker.fetch(new Request('https://worker.example/health'), {})).status, 200);
    assert.equal(f.uploads(), 0);
  });
});

test('privacy is public HTML with owner-provided text and security/CORS headers, without any provider or journal access', async () => {
  const f = fixture(); let journalCalls = 0; let providerCalls = 0;
  const guarded: Env = { ...f.env,
    JOURNAL: { idFromName: () => { journalCalls++; throw new Error('privacy must not access journal'); }, get: () => { journalCalls++; throw new Error('privacy must not access journal'); } },
    STREAM: { upload: async () => { providerCalls++; throw new Error('privacy must not upload'); }, video: () => { providerCalls++; throw new Error('privacy must not access videos'); } },
  };
  await simulated(async () => { providerCalls++; throw new Error('privacy must not contact provider'); }, async () => {
    for (const env of [{}, guarded]) {
      const response = await worker.fetch(new Request('https://worker.example/privacy'), env);
      assert.equal(response.status, 200); assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.equal(response.headers.get('cache-control'), 'no-store');
      const html = await response.text();
      assert.match(html, /^<!DOCTYPE html>\r?\n<html lang="es">/);
      assert.ok(html.includes('<h1>Política de Privacidad</h1>'));
      assert.ok(html.includes('Los videos pueden almacenarse temporalmente mientras se realiza el procesamiento y pueden eliminarse una vez concluida la transcripción.'));
      assert.ok(html.includes('Última actualización: septiembre de 2026.'));
      for (const secret of [f.env.ACTION_API_KEY!, f.env.LEXIA_API_KEY!, f.env.CF_API_TOKEN!]) assert.ok(!html.includes(secret));
    }
    const allowed = await worker.fetch(new Request('https://worker.example/privacy', { headers: { Origin: 'https://lexia.example' } }), guarded);
    assert.equal(allowed.status, 200); assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://lexia.example');
    assert.equal(allowed.headers.get('x-content-type-options'), 'nosniff'); assert.equal(allowed.headers.get('vary'), 'Origin');
    assert.equal((await worker.fetch(new Request('https://worker.example/privacy', { headers: { Origin: 'https://other.example' } }), guarded)).status, 403);
    assert.equal((await worker.fetch(new Request('https://worker.example/privacy', { method: 'POST' }), guarded)).status, 401);
    assert.equal((await worker.fetch(new Request('https://worker.example/jobs'), guarded)).status, 401);
    assert.equal(journalCalls, 0); assert.equal(providerCalls, 0);
  });
});

test('worker applies configured CORS and closes backend ownership before creating uploads', async () => {
  const f = fixture();
  const blocked = await worker.fetch(new Request('https://worker.example/health', { headers: { Origin: 'https://other.example' } }), f.env);
  assert.equal(blocked.status, 403); assert.equal(blocked.headers.get('access-control-allow-origin'), null);
  const allowed = await worker.fetch(new Request('https://worker.example/jobs', { method: 'OPTIONS', headers: { Origin: 'https://lexia.example' } }), f.env);
  assert.equal(allowed.status, 204); assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://lexia.example');
  assert.equal((await worker.fetch(new Request('https://worker.example/uploads', { method: 'POST', headers: headers() }), f.env)).status, 403);
  assert.equal((await worker.fetch(new Request('https://worker.example/api/transcribe', { method: 'POST', headers: { ...headers(), 'Content-Type': 'multipart/form-data; boundary=unused' } }), f.env)).status, 403);
  assert.equal((await worker.fetch(new Request('https://worker.example/jobs', { method: 'POST', headers: { Authorization: 'Bearer synthetic-backend-credential' } }), f.env)).status, 400);
  assert.equal(f.uploads(), 0);
});

test('VTT extracts literal cues, multiline text and explicit voices; excludes IDs notes and styling', async () => {
  const source = 'WEBVTT\n\nNOTE explicación\nignorar\n\nSTYLE\n::cue { color: red }\n\nidentificador\n00:00:01.001 --> 00:00:03.500 align:start\n<v Jueza> Primera línea &lt;literal&gt;\nsegunda &amp; tercera </v>\n\notro\n00:03.500 --> 00:04.000\nTexto sin hablante\n';
  const cues = parseVtt(source);
  assert.deepEqual(cues, [{ index: 0, start: 1.001, end: 3.5, text: ' Primera línea <literal>\nsegunda & tercera ', speaker: 'Jueza' }, { index: 1, start: 3.5, end: 4, text: 'Texto sin hablante\n' }]);
  assert.equal(await transcriptHash(cues), createHash('sha256').update(JSON.stringify(cues)).digest('hex'));
  assert.throws(() => parseVtt('WEBVTT\n\n'), /segmentos de voz/);
  assert.throws(() => parseVtt('HTTP error'), /WebVTT válido/);
  assert.throws(() => parseVtt('WEBVTT\n\n00:00:04.000 --> 00:00:03.000\ntexto'), /orden temporal/);
  assert.throws(() => parseVtt('WEBVTT\n\n00:00:03.000 --> 00:00:03.000\ntexto'), /orden temporal/);
  assert.equal(parseVtt('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n<v A>Uno</v><v B>Dos</v>')[0].speaker, undefined);
});

test('worker creates an idempotent GPT job, transmits retention and isolates its per-job token', async () => {
  const f = fixture(); const first = await create(f.env); const second = await create(f.env);
  assert.equal(f.uploads(), 1); assert.deepEqual(second, first);
  assert.equal(first.scheduled_deletion, first.scheduled_deletion_requested);
  assert.equal(f.uploadedOptions[0].requireSignedURLs, true);
  assert.equal((await call(f.env, `/jobs/${first.job_id}`)).status, 404);
  assert.equal((await call(f.env, `/jobs/${first.job_id}`, 'wrong-token')).status, 404);
  assert.equal((await call(f.env, `/jobs/${first.job_id}`, undefined, true)).status, 404);
  assert.equal((await call(f.env, `/jobs/${first.job_id}`, String(first.job_token), false, 'DELETE')).status, 200);
  assert.equal((await call(f.env, `/jobs/${first.job_id}`, String(first.job_token), false, 'DELETE')).status, 200);
  assert.equal(f.deletions(), 1);
  assert.equal((await call(f.env, `/jobs/${first.job_id}`, String(first.job_token))).status, 410);
});

test('GPT query tokens authorize only their job, reject conflicting headers, and never replace backend ownership', async () => {
  const f = fixture(); const first = await create(f.env, 'query-first'); const other = await create(f.env, 'query-other');
  const backend = await create(f.env, 'query-backend', true); let reads = 0;
  const token = encodeURIComponent(String(first.job_token));
  await simulated(async input => {
    reads++;
    return String(input).endsWith('/captions') ? cf([]) : cf({ readyToStream: false, status: { state: 'queued' } });
  }, async () => {
    const path = `/jobs/${first.job_id}?job_token=${token}`;
    const valid = await call(f.env, path); assert.equal(valid.status, 200);
    assert.equal((await valid.json() as Record<string, unknown>).job_id, first.job_id);
    assert.equal((await call(f.env, path, String(first.job_token))).status, 200);
    const beforeRejected = reads;
    for (const wrongPath of [`/jobs/${other.job_id}?job_token=${token}`, `/jobs/${first.job_id}?job_token=incorrect-token`]) {
      const rejected = await call(f.env, wrongPath); assert.equal(rejected.status, 404);
      assert.ok(!(await rejected.text()).includes(String(first.job_token)));
    }
    for (const conflict of [String(other.job_token), 'different-synthetic-token']) {
      const rejected = await call(f.env, path, conflict); assert.equal(rejected.status, 400);
      const raw = await rejected.text(); assert.equal(JSON.parse(raw).code, 'conflicting_job_token');
      assert.ok(!raw.includes(conflict)); assert.ok(!raw.includes(String(first.job_token)));
    }
    assert.equal((await call(f.env, `${path}&job_token=${token}`)).status, 400);
    assert.equal(reads, beforeRejected);
    assert.equal((await call(f.env, `/jobs/${backend.job_id}?job_token=${token}`, 'unrelated-header-token', true)).status, 200);
    assert.equal((await call(f.env, `/jobs/${backend.job_id}?job_token=${token}`, undefined, true, 'GET', 'other-owner')).status, 404);
    assert.equal((await worker.fetch(new Request(`https://worker.example/jobs/${backend.job_id}?job_token=${token}`, { headers: { Authorization: 'Bearer synthetic-backend-credential' } }), f.env)).status, 400);
  });
});

test('worker reserves uploads atomically and preserves uncertain acceptance without re-uploading', async () => {
  const f = fixture(); let calls = 0;
  f.env.STREAM!.upload = async () => { calls++; throw new Error('provider diagnostic synthetic-private'); };
  const request = () => new Request('https://worker.example/jobs', { method: 'POST', headers: { ...headers(true), 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: 'uncertain1', openaiFileIdRefs: [{ id: 'file-uncertain', name: 'a.webm', download_link: 'https://files.example/a.webm' }] }) });
  const responses = await Promise.all([worker.fetch(request(), f.env), worker.fetch(request(), f.env)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [409, 502]); assert.equal(calls, 1);
  for (const response of responses) assert.ok(!(await response.text()).includes('synthetic-private'));
  const recovered = await call(f.env, '/requests/uncertain1', undefined, true);
  assert.equal(recovered.status, 409); assert.equal((await recovered.json() as Record<string, unknown>).code, 'recovery_required');
  assert.equal((await call(f.env, '/requests/uncertain1', undefined, true, 'GET', 'owner2')).status, 404);
});

test('worker multipart validates content, persists accepted ID, and verifies actual retention', async () => {
  const f = fixture(); let calls = 0; let requestedDeletion = '';
  await simulated(async (_input, init) => {
    calls++;
    if (init?.body instanceof FormData) {
      requestedDeletion = String(init.body.get('scheduledDeletion')); assert.ok(requestedDeletion); assert.equal(init.body.get('requireSignedURLs'), 'true');
      return cf({ uid: 'multipart1', readyToStream: false, status: { state: 'queued' } });
    }
    const metadata = JSON.parse(String(init?.body)); assert.equal(metadata.scheduledDeletion, requestedDeletion);
    return cf({ uid: 'multipart1', scheduledDeletion: requestedDeletion });
  }, async () => {
    const upload = (content: string, id: string) => {
      const form = new FormData(); form.append('file', new File([content], 'audiencia.mp4', { type: 'video/mp4' }));
      return worker.fetch(new Request('https://worker.example/api/transcribe', { method: 'POST', headers: { ...headers(true), 'x-request-id': id }, body: form }), f.env);
    };
    assert.equal((await upload('plain text', 'badfile')).status, 400); assert.equal(calls, 0);
    const accepted = await upload('0000ftypisom0000', 'multipart-request'); const body = await accepted.json() as Record<string, unknown>;
    assert.equal(accepted.status, 200); assert.equal(body.status, 'processing_video'); assert.equal(body.scheduled_deletion, requestedDeletion);
    assert.equal(calls, 2); assert.equal((await upload('0000ftypisom0000', 'multipart-request')).status, 200); assert.equal(calls, 2);
    const recovered = await call(f.env, '/requests/multipart-request', undefined, true); assert.equal((await recovered.json() as Record<string, unknown>).job_id, 'multipart1');
  });
});

test('worker recovers all 205 paginated segments with stable canonical integrity and exact cursors', async () => {
  const f = fixture(); const job = await create(f.env); const source = vtt();
  await simulated(async input => {
    const path = String(input);
    return path.endsWith('/captions/es/vtt') ? new Response(source) : cf([{ language: 'es', status: 'ready' }]);
  }, async () => {
    const token = encodeURIComponent(String(job.job_token));
    const first = await call(f.env, `/jobs/${job.job_id}/transcript?job_token=${token}&offset=0&limit=200`);
    const page = await first.json() as { segments: Segment[]; next_offset: number; transcript_hash: string; total_segments: number; status: string; language: string };
    assert.equal(first.status, 200); assert.equal(page.status, 'completed'); assert.equal(page.language, 'es'); assert.equal(page.total_segments, 205); assert.equal(page.next_offset, 200);
    const last = await call(f.env, `/jobs/${job.job_id}/transcript?job_token=${token}&offset=200&limit=200`);
    const end = await last.json() as { segments: Segment[]; next_offset: null; transcript_hash: string };
    assert.equal(end.segments.length, 5); assert.equal(end.next_offset, null); assert.equal(end.transcript_hash, page.transcript_hash);
    assert.equal(await transcriptHash([...page.segments, ...end.segments]), page.transcript_hash);
    assert.equal(page.segments[0].speaker, 'Fiscalía'); assert.ok(!page.segments[0].text.includes('cue-'));
  });
});

test('worker validates pagination before provider reads and limits pages by bytes without skipping', async () => {
  const f = fixture(); const job = await create(f.env, 'backend-pages', true); let reads = 0;
  await simulated(async input => { reads++; return String(input).endsWith('/vtt') ? new Response(vtt(5, 'Texto '.repeat(20_000))) : cf([{ language: 'es', status: 'ready' }]); }, async () => {
    for (const query of ['limit=invalid', 'limit=0', 'limit=201', 'offset=-1', 'offset=1.5', 'offset=Infinity', 'start=Infinity', 'end=-1', 'start=3&end=1']) assert.equal((await call(f.env, `/jobs/${job.job_id}/transcript?${query}`, undefined, true)).status, 400, query);
    assert.equal(reads, 0);
    const first = await call(f.env, `/jobs/${job.job_id}/transcript?limit=200`, undefined, true);
    assert.equal(first.status, 200); const raw = await first.text(); assert.ok(Buffer.byteLength(raw) <= 700 * 1024); assert.ok(Buffer.byteLength(raw) > 90_000);
    const page = JSON.parse(raw); assert.equal(page.next_offset, page.segments.length); assert.ok(page.segments.length > 0 && page.segments.length < 5);
    const next = await call(f.env, `/jobs/${job.job_id}/transcript?offset=${page.next_offset}&limit=200`, undefined, true);
    const body = await next.json() as { segments: Segment[] }; assert.equal(body.segments[0].index, page.next_offset);
  });
});

test('GPT bounds escaped and multibyte JSON while recovering every segment with the same full hash', async () => {
  for (const payload of ['"\t\\'.repeat(7000), 'é😀'.repeat(4000)]) {
    const f = fixture(); const job = await create(f.env); const source = vtt(3, payload);
    await simulated(async input => String(input).endsWith('/vtt') ? new Response(source) : cf([{ language: 'es', status: 'ready' }]), async () => {
      const recovered: Segment[] = []; let offset: number | null = 0; let fullHash = '';
      while (offset !== null) {
        const response = await call(f.env, `/jobs/${job.job_id}/transcript?job_token=${encodeURIComponent(String(job.job_token))}&offset=${offset}&limit=200`);
        assert.equal(response.status, 200); const raw = await response.text();
        assert.ok(raw.length <= 90_000); assert.ok(Buffer.byteLength(raw) <= 90_000);
        const page = JSON.parse(raw) as { segments: Segment[]; offset: number; next_offset: number | null; transcript_hash: string };
        assert.equal(page.offset, offset); assert.equal(page.segments.length, 1);
        assert.equal(page.next_offset, offset + 1 === 3 ? null : offset + 1);
        assert.equal(page.segments[0].text, payload);
        if (fullHash) assert.equal(page.transcript_hash, fullHash); else fullHash = page.transcript_hash;
        recovered.push(...page.segments); offset = page.next_offset;
      }
      assert.deepEqual(recovered, parseVtt(source)); assert.equal(await transcriptHash(recovered), fullHash);
    });
  }
  const f = fixture(); const job = await create(f.env); const source = vtt(205, 'á😀"\\\t'.repeat(100));
  await simulated(async input => String(input).endsWith('/vtt') ? new Response(source) : cf([{ language: 'es', status: 'ready' }]), async () => {
    const recovered: Segment[] = []; let offset: number | null = 0; let fullHash = ''; let pages = 0;
    while (offset !== null) {
      const response = await call(f.env, `/jobs/${job.job_id}/transcript?job_token=${encodeURIComponent(String(job.job_token))}&offset=${offset}&limit=200`);
      assert.equal(response.status, 200); const raw = await response.text();
      assert.ok(raw.length <= 90_000); assert.ok(Buffer.byteLength(raw) <= 90_000);
      const page = JSON.parse(raw) as { segments: Segment[]; offset: number; next_offset: number | null; transcript_hash: string; total_segments: number };
      assert.equal(page.total_segments, 205); assert.equal(page.offset, offset); assert.ok(page.segments.length > 0);
      assert.equal(page.next_offset, offset + page.segments.length < 205 ? offset + page.segments.length : null);
      assert.deepEqual(page.segments.map(segment => segment.index), Array.from({ length: page.segments.length }, (_, index) => offset! + index));
      if (fullHash) assert.equal(page.transcript_hash, fullHash); else fullHash = page.transcript_hash;
      recovered.push(...page.segments); offset = page.next_offset; pages++;
    }
    assert.ok(pages > 2); assert.deepEqual(recovered, parseVtt(source)); assert.equal(await transcriptHash(recovered), fullHash);
  });
});

test('GPT rejects an oversized cue or time range without truncation and backend ranges retain their larger budget', async () => {
  const f = fixture(); const job = await create(f.env); const backend = await create(f.env, 'range-backend', true);
  let source = vtt(3, 'é😀'.repeat(4000));
  await simulated(async input => String(input).endsWith('/vtt') ? new Response(source) : cf([{ language: 'es', status: 'ready' }]), async () => {
    const prefix = `/jobs/${job.job_id}/transcript?job_token=${encodeURIComponent(String(job.job_token))}`;
    const small = await call(f.env, `${prefix}&start=0&end=0.5`); assert.equal(small.status, 200);
    assert.deepEqual((await small.json() as { segments: Segment[] }).segments, parseVtt(source).slice(0, 1));
    const range = await call(f.env, `${prefix}&start=0&end=3`); assert.equal(range.status, 502);
    const error = await range.json() as Record<string, unknown>; assert.equal(error.code, 'transcript_range_too_large'); assert.equal(error.segments, undefined);
    const larger = await call(f.env, `/jobs/${backend.job_id}/transcript?start=0&end=3`, undefined, true);
    assert.equal(larger.status, 200); const raw = await larger.text(); assert.ok(Buffer.byteLength(raw) > 90_000); assert.ok(Buffer.byteLength(raw) <= 700 * 1024);
    assert.deepEqual(JSON.parse(raw).segments, parseVtt(source));
    source = vtt(1, 'x'.repeat(50_000));
    const huge = await call(f.env, `${prefix}&offset=0&limit=1`); assert.equal(huge.status, 502);
    const rejected = await huge.json() as Record<string, unknown>; assert.equal(rejected.code, 'transcript_segment_too_large'); assert.equal(rejected.segments, undefined);
    assert.equal((await call(f.env, `/jobs/${backend.job_id}/transcript?limit=1`, undefined, true)).status, 200);
    source = vtt(5, 'x'.repeat(80_000));
    const backendRange = await call(f.env, `/jobs/${backend.job_id}/transcript?start=0&end=5`, undefined, true);
    assert.equal(backendRange.status, 502); assert.equal((await backendRange.json() as Record<string, unknown>).code, 'transcript_range_too_large');
  });
});

test('worker distinguishes video/caption errors and empty VTT from successful completion', async () => {
  const f = fixture(); const job = await create(f.env);
  let mode = 'video-error';
  await simulated(async input => {
    const path = String(input);
    if (path.endsWith('/vtt')) return new Response(mode === 'empty' ? 'WEBVTT\n\n' : vtt(1));
    if (path.endsWith('/captions')) return cf([{ language: 'es', status: mode === 'caption-error' ? 'error' : 'ready' }]);
    return cf({ readyToStream: mode !== 'video-error', status: { state: mode === 'video-error' ? 'error' : 'ready', errorReasonText: 'sensitive provider diagnostic' } });
  }, async () => {
    for (mode of ['video-error', 'caption-error', 'empty']) {
      const response = await call(f.env, `/jobs/${job.job_id}`, String(job.job_token)); const body = await response.json() as Record<string, unknown>;
      assert.equal(response.status, 200); assert.equal(body.status, 'error', mode); assert.equal(body.text, undefined); assert.ok(!JSON.stringify(body).includes('sensitive provider'));
    }
    mode = 'valid'; const response = await call(f.env, `/jobs/${job.job_id}`, String(job.job_token)); const body = await response.json() as Record<string, unknown>;
    assert.equal(body.status, 'completed'); assert.equal(body.total_segments, 1); assert.match(String(body.transcript_hash), /^[a-f0-9]{64}$/); assert.equal(body.text, undefined);
  });
});

test('worker treats generation 400/405/permissions as safe errors and confirms a 409 race', async () => {
  const f = fixture(); const job = await create(f.env); let generationStatus = 400; let reads = 0; let existingStatus = 'inprogress';
  await simulated(async input => {
    const path = String(input);
    if (path.endsWith('/generate')) return cf({ internal: 'synthetic secret diagnostic' }, generationStatus);
    if (path.endsWith('/captions')) { reads++; return cf(reads > 1 && generationStatus === 409 ? [{ language: 'es', status: existingStatus }] : []); }
    if (path.endsWith('/vtt')) return new Response(vtt(1));
    return cf({ readyToStream: true, status: { state: 'ready' } });
  }, async () => {
    for (generationStatus of [400, 405, 401, 403]) {
      reads = 0; const response = await call(f.env, `/jobs/${job.job_id}`, String(job.job_token)); assert.equal(response.status, 502); assert.ok(!(await response.text()).includes('synthetic secret'));
    }
    generationStatus = 409;
    for (existingStatus of ['inprogress', 'ready', 'error']) {
      reads = 0; const response = await call(f.env, `/jobs/${job.job_id}`, String(job.job_token));
      assert.equal(response.status, 200); assert.equal((await response.json() as Record<string, unknown>).status, existingStatus === 'ready' ? 'completed' : existingStatus === 'error' ? 'error' : 'generating_transcript'); assert.equal(reads, 2);
    }
  });
});

test('worker provisions resumable 2GiB uploads once with actual provider metadata and owner recovery', async () => {
  const f = fixture(); let calls = 0;
  await simulated(async (input, init) => {
    calls++; assert.ok(String(input).endsWith('/stream?direct_user=true'));
    const sent = new Headers(init?.headers); assert.equal(sent.get('Tus-Resumable'), '1.0.0'); assert.equal(sent.get('Upload-Length'), String(2 * 1024 * 1024 * 1024));
    const metadata = Object.fromEntries((sent.get('Upload-Metadata') || '').split(',').map(pair => { const [name, value] = pair.split(' '); return [name, Buffer.from(value, 'base64').toString('utf8')]; }));
    assert.equal(metadata.name, 'audiencia.mp4'); assert.equal(metadata.maxdurationseconds, '36000'); assert.ok(Date.parse(metadata.scheduleddeletion) > Date.now() + 30 * 86_400_000); assert.equal(metadata.requiresignedurls, 'true');
    return new Response(null, { status: 201, headers: { Location: 'https://upload.cloudflarestream.com/synthetic-capability', 'stream-media-id': 'direct1' } });
  }, async () => {
    const request = () => new Request('https://worker.example/uploads', { method: 'POST', headers: { ...headers(true), 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: 'large-upload', owner_id: 'owner1', filename: 'audiencia.mp4', mime: 'video/mp4', size: 2 * 1024 * 1024 * 1024 }) });
    assert.equal((await worker.fetch(request(), { ...f.env, MAX_DURATION_SECONDS: 'invalid' })).status, 503);
    assert.equal(f.storage.values.size, 0); assert.equal(calls, 0);
    const first = await worker.fetch(request(), f.env); const body = await first.json() as Record<string, unknown>;
    assert.equal(first.status, 200); assert.equal(body.job_id, 'direct1'); assert.equal(body.offset, undefined); assert.equal(body.scheduled_deletion, null);
    assert.equal((await worker.fetch(request(), f.env)).status, 200); assert.equal(calls, 1);
    const recovered = await call(f.env, '/uploads/large-upload', undefined, true); assert.deepEqual(await recovered.json(), body);
    assert.equal((await call(f.env, '/uploads/large-upload', undefined, true, 'GET', 'owner2')).status, 404);
    assert.equal((await call(f.env, '/jobs/direct1', undefined, false)).status, 404);
  });
});

test('backend adapter and repaired Worker agree on direct formats, custom UID, states and retrieval', async () => {
  const f = fixture(); const owner = 'firebase.custom:owner'; let providerUploads = 0; let pendingUpload = true;
  const adapter = new CloudflareTranscriptionService({ url: 'https://worker.example', backendSecret: 'synthetic-backend-credential',
    fetcher: async (input, init) => worker.fetch(new Request(String(input), init), f.env) });
  const signal = new AbortController().signal;
  await simulated(async (input, init) => {
    const url = String(input);
    if (url.endsWith('/stream?direct_user=true')) {
      providerUploads++; assert.equal(new Headers(init?.headers).get('Upload-Creator'), owner);
      return new Response(null, { status: 201, headers: { Location: 'https://upload.cloudflarestream.com/synthetic-capability', 'stream-media-id': 'adapterdirect' } });
    }
    if (url.endsWith('/captions/es/vtt')) return new Response(vtt(1));
    if (url.endsWith('/captions')) return cf([{ language: 'es', status: 'ready' }]);
    return cf({ uid: 'adapterdirect', readyToStream: !pendingUpload, status: { state: pendingUpload ? 'pendingupload' : 'ready' } });
  }, async () => {
    const input = { request_id: 'adapter-request', owner_id: owner, filename: 'audiencia.avi', size: 2048, mime: 'video/x-msvideo' };
    const session = await adapter.createDirectUpload(input, signal);
    assert.equal(session.job_id, 'adapterdirect'); assert.equal(session.status, 'uploading'); assert.equal(session.offset, undefined);
    assert.deepEqual(await adapter.getDirectUpload(input.request_id, owner, signal), session); assert.equal(providerUploads, 1);
    assert.equal((await adapter.lookupRequest(input.request_id, owner, signal)).status, 'uploading');
    const waiting = await adapter.get(session.job_id, signal, owner); assert.equal(waiting.status, 'uploading'); assert.equal(waiting.stage, 'upload');
    pendingUpload = false;
    const state = await adapter.get(session.job_id, signal, owner); assert.equal(state.status, 'recovering_transcript');
    const page = await adapter.getTranscriptPage(session.job_id, 0, 200, signal, owner); assert.equal(page.segments.length, 1);
    assert.equal(await transcriptHash(page.segments), page.transcript_hash);
    await assert.rejects(() => adapter.get(session.job_id, signal, 'different-owner'), /no encontró el trabajo/);
  });
});
