import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseTranscriptManifest, parseTranscriptionJob, parseUploadSession, MAX_DIRECT_MEDIA_BYTES } from '../../shared/transcription.js';
import { canonicalSegments, computeTranscriptHash, formatLiteralTranscript, MAX_TRANSCRIPT_PAGE_BYTES,
  MAX_TRANSCRIPT_SEGMENT_BYTES, parseTranscriptPage, parseTranscriptSegment, validateTranscriptSequence } from '../../shared/transcriptSegments.js';
import type { TranscriptPage, TranscriptSegment } from '../../shared/transcriptSegments.js';
import { CloudflareTranscriptionService, normalizeWorkerJob } from '../../server/services/CloudflareTranscriptionService.js';
import { RequestError } from '../../server/middleware/security.js';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const syntheticSegments = (count = 205): TranscriptSegment[] => Array.from({ length: count }, (_, index) => ({
  index, start: index / 2, end: index / 2 + 0.75, text: `  Segmento sintético ${index}.\nSegunda línea.  `,
  ...(index === 200 ? { speaker: 'Testigo identificado por el proveedor' } : {}),
}));
const hash = (segments: readonly TranscriptSegment[]) => createHash('sha256').update(canonicalSegments(segments)).digest('hex');
const page = (segments = syntheticSegments(), offset = 0, limit = 200): TranscriptPage => ({
  job_id: 'job-synthetic', status: 'completed', language: 'es', total_segments: segments.length, offset, limit,
  next_offset: offset + Math.min(limit, segments.length - offset) === segments.length ? null : offset + limit,
  segments: segments.slice(offset, offset + limit), transcript_hash: hash(segments),
});
const configured = (fetcher: typeof fetch) => new CloudflareTranscriptionService({ url: 'https://worker.example.invalid',
  backendSecret: 'backend-test-only', fetcher });

test('segment pages recover every cue across 200 and 5 with one canonical complete fingerprint', async () => {
  const all = syntheticSegments();
  const first = parseTranscriptPage(page(all), { jobId: 'job-synthetic', offset: 0, limit: 200 });
  const second = parseTranscriptPage(page(all, 200), { jobId: 'job-synthetic', offset: first.next_offset!, limit: 200,
    sha256: first.transcript_hash, totalSegments: first.total_segments, previousSegment: first.segments.at(-1) });
  assert.equal(first.segments.length, 200); assert.equal(second.segments.length, 5); assert.equal(second.next_offset, null);
  const recovered = [...first.segments, ...second.segments];
  validateTranscriptSequence(recovered);
  assert.equal(await computeTranscriptHash(recovered), first.transcript_hash);
  assert.deepEqual(recovered, all);
});

test('canonical fingerprints retain literal spaces, Unicode, cue times and existing voice labels', async () => {
  const cue: TranscriptSegment = { index: 0, start: 3600.125, end: 3602.009, text: '  Sí, señor.\nTexto íntegro.  ', speaker: 'Persona identificada' };
  assert.equal(formatLiteralTranscript([cue]), '[01:00:00.125 → 01:00:02.009] (Persona identificada)\n  Sí, señor.\nTexto íntegro.  ');
  assert.equal(await computeTranscriptHash([cue]), hash([cue]));
  assert.notEqual(hash([cue]), hash([{ ...cue, text: cue.text.trim() }]));
  assert.notEqual(hash([cue]), hash([{ ...cue, speaker: 'Otra persona' }]));
  const withoutVoice = formatLiteralTranscript([{ index: 0, start: 0, end: 1, text: 'Texto sin voz identificada.' }]);
  assert.ok(!withoutVoice.includes('SPK')); assert.ok(!withoutVoice.includes('(0)'));
});

test('page identity, exact cursor, total and complete hash must remain stable', () => {
  const valid = page();
  const expected = { jobId: valid.job_id, offset: 0, limit: 200, totalSegments: 205, sha256: valid.transcript_hash };
  for (const changed of [
    { ...valid, job_id: 'another' }, { ...valid, offset: 1 }, { ...valid, limit: 199 },
    { ...valid, next_offset: null }, { ...valid, next_offset: 201 }, { ...valid, next_offset: '200' },
    { ...valid, total_segments: 206 }, { ...valid, transcript_hash: 'b'.repeat(64) },
    { ...valid, transcript_hash: 'A'.repeat(64) }, { ...valid, language: 'en' },
  ]) assert.throws(() => parseTranscriptPage(changed, expected));
});

test('empty pages, nonfinite numbers, repeated indices and reversed time order never become a source', () => {
  const valid = page();
  for (const changed of [
    { ...valid, segments: [] }, { ...valid, total_segments: 0 }, { ...valid, offset: -1 },
    { ...valid, limit: 0 }, { ...valid, limit: 201 }, { ...valid, limit: NaN },
    { ...valid, segments: [valid.segments[0], valid.segments[0]], next_offset: 2 },
    { ...valid, segments: [{ ...valid.segments[0], index: 1 }], next_offset: 1 },
    { ...valid, segments: [{ ...valid.segments[0], start: 5 }, { ...valid.segments[1], start: 4 }], next_offset: 2 },
  ]) assert.throws(() => parseTranscriptPage(changed));
  for (const changed of [
    { index: 0, start: NaN, end: 1, text: 'Texto' }, { index: 0, start: 0, end: Infinity, text: 'Texto' },
    { index: 0, start: 0, end: 0, text: 'Texto' }, { index: 0, start: -1, end: 1, text: 'Texto' },
    { index: 0, start: 0, end: 1, text: ' ' }, { index: 0, start: 0, end: 1, text: 'Texto', speaker: '' },
  ]) assert.throws(() => parseTranscriptSegment(changed));
});

test('overlapping speech remains valid and a resumed page still enforces boundary ordering', () => {
  const all = syntheticSegments();
  assert.ok(all[199].end > all[200].start);
  assert.doesNotThrow(() => validateTranscriptSequence(all));
  const resumed = page(all, 200);
  assert.throws(() => parseTranscriptPage(resumed, { jobId: 'job-synthetic', offset: 200, limit: 200,
    previousSegment: { ...all[199], start: 101 } }));
});

test('byte budgets reject oversized cues and pages without clipping literal text', () => {
  assert.throws(() => parseTranscriptSegment({ index: 0, start: 0, end: 1, text: 'á'.repeat(MAX_TRANSCRIPT_SEGMENT_BYTES) }));
  const all = syntheticSegments(200).map(cue => ({ ...cue, text: 'x'.repeat(4000) }));
  assert.ok(Buffer.byteLength(JSON.stringify(page(all))) > MAX_TRANSCRIPT_PAGE_BYTES);
  assert.throws(() => parseTranscriptPage(page(all)), /tamaño/);
  const bounded = { ...page(all), segments: all.slice(0, 100), next_offset: 100 };
  assert.equal(parseTranscriptPage(bounded).segments.length, 100);
});

test('complete manifests are nonempty, verified and versioned; legacy text completion remains readable', () => {
  const manifest = { segmentCount: 205, sha256: 'a'.repeat(64), language: 'es', verified: true, formatVersion: 1 };
  assert.deepEqual(parseTranscriptionJob({ job_id: 'j', status: 'completed', transcript: manifest }).transcript, manifest);
  assert.equal(parseTranscriptionJob({ job_id: 'j', status: 'completed', text: ' Texto anterior. ' }).text, ' Texto anterior. ');
  for (const invalid of [{ ...manifest, verified: false }, { ...manifest, segmentCount: 0 }, { ...manifest, formatVersion: 2 },
    { ...manifest, sha256: 'invalid' }]) assert.throws(() => parseTranscriptManifest(invalid));
  assert.throws(() => parseTranscriptionJob({ job_id: 'j', status: 'completed' }));
  assert.throws(() => parseTranscriptionJob({ job_id: 'j', status: 'recovering_transcript', recovery: { recoveredSegments: 6, totalSegments: 5 } }));
  assert.equal(parseTranscriptionJob({ job_id: 'j', status: 'processing', stage: 'video', progress: 100 }).progress, 100);
  assert.throws(() => parseTranscriptionJob({ job_id: 'j', status: 'generating_transcript', stage: 'captions', progress: 100 }));
  assert.throws(() => parseTranscriptionJob({ job_id: 'j', status: 'uploading', stage: 'upload', progress: 50 }));
});

test('normalization separates video progress, captions and recovery and keeps diagnostics out of real source', () => {
  const processing = normalizeWorkerJob({ job_id: 'j', status: 'processing_video', video_status: { pctComplete: '48.5' } });
  assert.deepEqual(processing, { job_id: 'j', status: 'processing', stage: 'video', progress: 48.5 });
  const ready = normalizeWorkerJob({ job_id: 'j', status: 'video_ready', video_status: { pctComplete: '100' } });
  assert.equal(ready.status, 'processing'); assert.equal(ready.stage, 'captions'); assert.equal(ready.progress, undefined);
  const captions = normalizeWorkerJob({ job_id: 'j', status: 'generating_transcript', video_status: { pctComplete: '100' } });
  assert.equal(captions.stage, 'captions'); assert.equal(captions.progress, undefined);
  const completed = normalizeWorkerJob({ job_id: 'j', status: 'completed', text: 'No hay transcripción disponible.', total_segments: 205 }, 'j', { segmentSource: true });
  assert.equal(completed.status, 'recovering_transcript'); assert.equal(completed.text, undefined);
  assert.deepEqual(completed.recovery, { recoveredSegments: 0, totalSegments: 205 });
  assert.throws(() => normalizeWorkerJob({ job_id: 'j', status: 'completed', total_segments: 0 }, 'j', { segmentSource: true }));
  assert.ok(!normalizeWorkerJob({ job_id: 'j', status: 'failed', error: 'sensitive provider detail' }).error?.includes('sensitive'));
});

test('the real adapter ignores completed flat text and gets source exclusively from checked pages', async () => {
  let requestCount = 0;
  const all = syntheticSegments();
  const provider = configured(async (url, options) => {
    requestCount++;
    assert.equal(new Headers(options?.headers).get('X-Owner-Id'), 'owner');
    assert.equal(new Headers(options?.headers).get('x-api-key'), 'backend-test-only');
    assert.equal(options?.redirect, 'error');
    const endpoint = new URL(String(url));
    return endpoint.pathname.endsWith('/transcript') ? json(page(all, Number(endpoint.searchParams.get('offset'))))
      : json({ job_id: 'job-synthetic', status: 'completed', text: 'Diagnostic that must never become source.', total_segments: all.length });
  });
  const signal = new AbortController().signal;
  const job = await provider.get('job-synthetic', signal, 'owner');
  assert.equal(job.status, 'recovering_transcript'); assert.equal(job.text, undefined);
  const first = await provider.getTranscriptPage(job.job_id, 0, 200, signal, 'owner');
  const second = await provider.getTranscriptPage(job.job_id, first.next_offset!, 200, signal, 'owner');
  assert.equal(first.segments.length + second.segments.length, 205); assert.equal(requestCount, 3);
});

test('adapter rejects malformed or mismatched pages and invalid query parameters without provider upload retries', async () => {
  let calls = 0;
  let response: unknown = { ...page(), next_offset: null };
  const provider = configured(async () => { calls++; return json(response); });
  const signal = new AbortController().signal;
  await assert.rejects(provider.getTranscriptPage('job-synthetic', 0, 200, signal, 'owner'), (error: RequestError) => error.status === 502);
  response = { ...page(), job_id: 'another' };
  await assert.rejects(provider.getTranscriptPage('job-synthetic', 0, 200, signal, 'owner'));
  for (const [offset, limit] of [[-1, 200], [0, 201], [NaN, 200], [0.5, 200]]) {
    await assert.rejects(provider.getTranscriptPage('job-synthetic', offset, limit, signal, 'owner'), (error: RequestError) => error.status === 400);
  }
  assert.equal(calls, 2);
});

test('provider failures and oversized JSON cannot leak diagnostics or masquerade as completion', async () => {
  for (const status of [401, 403, 404, 409, 413, 429, 500]) {
    const provider = configured(async () => json({ error: 'secret provider diagnostic' }, status));
    await assert.rejects(provider.get('j', new AbortController().signal, 'owner'), (error: RequestError) => !error.message.includes('secret'));
  }
  const oversized = configured(async () => json({ text: 'x'.repeat(1024 * 1024 + 1) }));
  await assert.rejects(oversized.get('j', new AbortController().signal, 'owner'), /tamaño/);
  const malformed = configured(async () => new Response('<html>Invalid</html>'));
  await assert.rejects(malformed.get('j', new AbortController().signal, 'owner'), /JSON/);
});

test('cancellation bounds both a stalled provider fetch and a stalled successful response body', async () => {
  for (const mode of ['fetch', 'body']) {
    const provider = configured(async () => mode === 'fetch' ? new Promise<Response>(() => {})
      : new Response(new ReadableStream<Uint8Array>({ start() {} })));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('Cancelación sintética.', 'AbortError')), 10);
    try { await assert.rejects(provider.get('j', controller.signal, 'owner'), { name: 'AbortError' }); }
    finally { clearTimeout(timer); }
  }
});

test('multipart creation carries idempotency and owner headers and cleans only fixture data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lexia-segments-test-'));
  const mediaPath = join(directory, 'synthetic.wav'); await writeFile(mediaPath, 'synthetic-only');
  let calls = 0;
  const provider = configured(async (_url, options) => {
    calls++;
    const headers = new Headers(options?.headers);
    assert.equal(headers.get('X-Owner-Id'), 'owner'); assert.equal(headers.get('X-Request-Id'), 'request-1');
    assert.ok(options?.body instanceof FormData); assert.ok(options.body.get('file') instanceof File);
    return json({ job_id: 'j', status: 'processing_video' }, 201);
  });
  try {
    const created = await provider.create({ path: mediaPath, originalname: 'synthetic.wav', mimetype: 'audio/wav' } as Express.Multer.File,
      new AbortController().signal, { ownerId: 'owner', requestId: 'request-1' });
    assert.equal(created.status, 'processing'); assert.equal(created.stage, 'video'); assert.equal(calls, 1);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('direct upload resume and multipart lookup use GET on the registered request, with no second creation', async () => {
  const seen: string[] = [];
  const input = { request_id: 'request-1', owner_id: 'owner', filename: 'synthetic.mp4', size: 200 * 1024 * 1024, mime: 'video/mp4' };
  const provider = configured(async (url, options) => {
    const endpoint = new URL(String(url)); seen.push(`${options?.method ?? 'GET'} ${endpoint.pathname}`);
    assert.equal(new Headers(options?.headers).get('X-Owner-Id'), 'owner');
    if (endpoint.pathname.startsWith('/requests/')) return json({ request_id: 'request-1', job_id: 'j', status: 'video_ready' });
    if (options?.method === 'POST') assert.deepEqual(JSON.parse(String(options.body)), input);
    return json({ request_id: 'request-1', job_id: 'j', status: 'uploading', upload_url: 'https://upload.videodelivery.net/tus/capability', size: input.size, expires_at: null });
  });
  const signal = new AbortController().signal;
  const created = await provider.createDirectUpload(input, signal); assert.equal(created.expires_at, undefined);
  assert.equal((await provider.getDirectUpload('request-1', 'owner', signal)).job_id, created.job_id);
  assert.equal((await provider.lookupRequest('request-1', 'owner', signal)).stage, 'captions');
  assert.deepEqual(seen, ['POST /uploads', 'GET /uploads/request-1', 'GET /requests/request-1']);
});

test('browser upload sessions enforce provider destination, content fingerprint and the 2 GiB boundary', () => {
  const session = { job_id: 'j', status: 'uploading', upload: { requestId: 'request-1', url: 'https://upload.videodelivery.net/tus/capability',
    size: MAX_DIRECT_MEDIA_BYTES, filename: 'synthetic.mp4', mime: 'video/mp4', lastModified: 100, fingerprint: 'a'.repeat(64) } };
  assert.equal(parseUploadSession(session).upload.size, MAX_DIRECT_MEDIA_BYTES);
  for (const upload of [{ ...session.upload, size: MAX_DIRECT_MEDIA_BYTES + 1 }, { ...session.upload, fingerprint: 'invalid' },
    { ...session.upload, filename: 'audio.mp3', mime: 'audio/mpeg' },
    { ...session.upload, url: 'https://malicious.example/tus' }, { ...session.upload, url: 'http://upload.videodelivery.net/tus' },
    { ...session.upload, url: 'https://secret@upload.videodelivery.net/tus' }, { ...session.upload, expiresAt: 'invalid' }]) {
    assert.throws(() => parseUploadSession({ ...session, upload }));
  }
});
