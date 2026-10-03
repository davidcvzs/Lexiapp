import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import express from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { ApiClient } from '../../src/services/ApiClient.js';
import { TranscriptionService } from '../../src/services/TranscriptionService.js';
import type { TranscriptionProgress, UploadIdentity } from '../../src/services/TranscriptionService.js';
import { MAX_MEDIA_BYTES, MAX_DIRECT_MEDIA_BYTES } from '../../shared/transcription.js';
import { computeTranscriptHash, formatLiteralTranscript } from '../../shared/transcriptSegments.js';
import type { TranscriptSegment } from '../../shared/transcriptSegments.js';
import { createTranscriptionRouter } from '../../server/routes/transcription.js';
import { createAuthMiddleware } from '../../server/middleware/auth.js';
import { RequestError, securityErrorHandler } from '../../server/middleware/security.js';
import type { SegmentJobStore, UploadReservation } from '../../server/persistence/TranscriptStore.js';
import { FixtureJobStore } from './persistence-fixtures.js';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const requestId = '12ec17e4-83bf-4258-9e41-d4bedfe33676';
const url = 'https://upload.videodelivery.net/tus/synthetic-capability';

/** Bounded synthetic blocks represent a large file without allocating the whole media. */
class SyntheticVideo extends File {
  readonly slices: [number, number][] = [];
  private readonly byteLength: number;
  constructor(size = MAX_MEDIA_BYTES + 23, name = 'synthetic.mp4', modified = 42) {
    super(['x'], name, { type: 'video/mp4', lastModified: modified });
    this.byteLength = size;
  }
  override get size() { return this.byteLength; }
  override slice(start = 0, end = this.size, type = '') {
    this.slices.push([start, end]);
    assert.ok(end - start <= 8 * 1024 * 1024, 'Never buffer an entire media file.');
    return new Blob([new Uint8Array(end - start)], { type });
  }
  override async arrayBuffer(): Promise<ArrayBuffer> { throw new Error('Whole-file buffering is forbidden.'); }
}

async function identity(file: File): Promise<UploadIdentity> {
  const hash = await crypto.subtle.digest('SHA-256', await file.slice(0, 1024 * 1024).arrayBuffer());
  return { requestId, filename: file.name, size: file.size, mime: file.type, lastModified: file.lastModified,
    fingerprint: Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('') };
}

function tusResponse(offset: number, size?: number) {
  return new Response(null, { status: 204, headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': String(offset), ...(size === undefined ? {} : { 'Upload-Length': String(size) }) } });
}

test('large video streams bounded TUS blocks with real progress and no API credentials at the provider', async () => {
  const file = new SyntheticVideo();
  const progress: TranscriptionProgress[] = [];
  const metadata: (UploadIdentity | null)[] = [];
  let uploaded = 0;
  let posts = 0;
  let patches = 0;
  const api = new ApiClient(async () => 'synthetic-firebase-token', async (input, options) => {
    assert.equal(new Headers(options?.headers).get('Authorization'), 'Bearer synthetic-firebase-token');
    if (input === '/api/transcription/capabilities') return json({ directUploadEnabled: true, directMaxBytes: MAX_DIRECT_MEDIA_BYTES });
    if (input === '/api/transcription/uploads') {
      posts++;
      const upload = JSON.parse(options?.body as string);
      return json({ job_id: 'direct-1', status: 'uploading', upload: { ...upload, url } }, 201);
    }
    assert.equal(input, '/api/transcription/jobs/direct-1');
    return json({ job_id: 'direct-1', status: 'completed', text: 'Texto completo.' });
  });
  const directFetch: typeof fetch = async (input, options) => {
    assert.equal(input, url);
    assert.equal(new Headers(options?.headers).get('Authorization'), null);
    assert.equal(options?.credentials, 'omit');
    assert.equal(options?.referrerPolicy, 'no-referrer');
    assert.equal(options?.redirect, 'error');
    if (options?.method === 'HEAD') return tusResponse(uploaded, file.size);
    assert.equal(options?.method, 'PATCH');
    assert.equal(new Headers(options.headers).get('Upload-Offset'), String(uploaded));
    assert.equal(new Headers(options.headers).get('Content-Type'), 'application/offset+octet-stream');
    assert.ok(options.body instanceof Blob);
    patches++;
    if (uploaded + options.body.size !== file.size) assert.ok(options.body.size >= 5 * 1024 * 1024);
    uploaded += options.body.size;
    return tusResponse(uploaded);
  };
  const output = await new TranscriptionService(api, { directFetch }).processMedia(file, { onProgress: value => progress.push(value), onUploadSession: value => metadata.push(value) });
  assert.equal(output, 'Texto completo.');
  assert.equal(posts, 1);
  assert.equal(uploaded, file.size);
  assert.equal(patches, 13);
  assert.equal(progress[0].uploadedBytes, 0);
  assert.equal(progress.at(-1)?.percent, 100);
  assert.ok(metadata[0]?.requestId);
  assert.equal(metadata.at(-1), null);
});

test('cancelled or lost direct acceptance is resumed with GET and HEAD; no second POST is sent', async () => {
  const file = new SyntheticVideo();
  const upload = await identity(file);
  const startedOffset = 8 * 1024 * 1024;
  let offset = startedOffset;
  const requests: string[] = [];
  let reads = 0;
  const service = new TranscriptionService(new ApiClient(async () => 'token', async (input, options) => {
    requests.push(String(input));
    assert.notEqual(options?.method, 'POST');
    if (String(input).includes('/uploads/')) return json({ job_id: 'same-job', status: 'uploading', upload: { ...upload, url } });
    reads++;
    return json({ job_id: 'same-job', status: reads === 1 ? 'uploading' : 'completed', ...(reads === 1 ? {} : { text: 'Reanudada íntegra.' }) });
  }), { directFetch: async (_input, options) => {
    if (options?.method === 'HEAD') return tusResponse(offset, file.size);
    assert.equal(new Headers(options?.headers).get('Upload-Offset'), String(offset));
    assert.ok(options?.body instanceof Blob);
    offset += options.body.size;
    return tusResponse(offset);
  } });
  assert.equal(await service.resumeUpload(requestId, file), 'Reanudada íntegra.');
  assert.equal(offset, file.size);
  assert.ok(file.slices.some(([start]) => start === startedOffset));
  assert.equal(requests.filter(value => value.includes('/uploads/')).length, 1);
  const wrong = new SyntheticVideo(file.size, file.name, 43);
  await assert.rejects(service.resumeUpload(requestId, wrong), /mismo archivo/);
  const changed = new SyntheticVideo(file.size, file.name, file.lastModified);
  changed.slice = (start = 0, end = changed.size) => new Blob([new Uint8Array(end - start).fill(1)]);
  await assert.rejects(service.resumeUpload(requestId, changed), /mismo archivo/);
  assert.equal(reads, 2, 'Wrong reselection must not even poll or patch the remote job.');
});

test('direct failures retain one request identity and never create another job automatically', async () => {
  const file = new SyntheticVideo();
  let captured: UploadIdentity | null = null;
  let attempts = 0;
  const service = new TranscriptionService(new ApiClient(async () => 'token', async input => {
    if (String(input).endsWith('capabilities')) return json({ directUploadEnabled: true, directMaxBytes: MAX_DIRECT_MEDIA_BYTES });
    attempts++;
    throw new Error('Simulated lost acceptance');
  }));
  await assert.rejects(service.processMedia(file, { onUploadSession: value => { captured = value; } }), /conectar/);
  assert.equal(attempts, 1);
  assert.ok(captured);
  const retained = captured as unknown as UploadIdentity;
  assert.equal(retained.filename, file.name);
  assert.equal(retained.fingerprint.length, 64);
});

test('large or unsupported direct files fail before billable creation when capability is disabled', async () => {
  let calls = 0;
  const service = new TranscriptionService(new ApiClient(async () => 'token', async input => {
    calls++;
    assert.equal(input, '/api/transcription/capabilities');
    return json({ directUploadEnabled: false, directMaxBytes: 0 });
  }));
  await assert.rejects(service.processMedia(new SyntheticVideo()), /todavía no está habilitada/);
  assert.equal(calls, 1);
  await assert.rejects(service.processMedia(new SyntheticVideo(MAX_DIRECT_MEDIA_BYTES + 1)), /2 GiB/);
  await assert.rejects(service.processMedia(new SyntheticVideo(MAX_MEDIA_BYTES + 1, 'synthetic.wav')), /admite video/);
  assert.equal(calls, 1);
});

test('invalid TUS offsets or untrusted destinations fail without sending a chunk', async () => {
  const file = new SyntheticVideo();
  const upload = await identity(file);
  let transfers = 0;
  const make = (destination: string, head: Response) => new TranscriptionService(new ApiClient(async () => 'token', async input =>
    String(input).includes('/uploads/') ? json({ job_id: 'same', status: 'uploading', upload: { ...upload, url: destination } })
      : json({ job_id: 'same', status: 'uploading' })), { directFetch: async (_input, options) => { transfers++; assert.equal(options?.method, 'HEAD'); return head; } });
  await assert.rejects(make('https://example.test/upload', tusResponse(0, file.size)).resumeUpload(requestId, file), /proveedor permitido/);
  assert.equal(transfers, 0);
  await assert.rejects(make(url, tusResponse(file.size + 1, file.size)).resumeUpload(requestId, file), /progreso de carga inválido/);
  assert.equal(transfers, 1);
});

test('multipart acceptance uses a UUID header and recovers exclusively through its protected request route', async () => {
  let pointer: string | null = null;
  let posts = 0;
  let createdId: string | null = null;
  const service = new TranscriptionService(new ApiClient(async () => 'token', async (input, options) => {
    if (options?.method === 'POST') {
      posts++;
      assert.equal(new Headers(options.headers).get('X-Upload-Request-Id'), pointer);
      throw new Error('Lost response');
    }
    assert.equal(input, `/api/transcription/requests/${pointer}`);
    return json({ job_id: 'accepted-once', status: 'completed', text: 'Original recuperado.' });
  }));
  await assert.rejects(service.processMedia(new File(['synthetic'], 'small.wav', { type: 'audio/wav' }), { onPendingRequest: value => { pointer = value; } }));
  assert.ok(pointer);
  const retained = pointer;
  assert.equal(await service.resumeRequest(retained, { onJobCreated: id => { createdId = id; } }), 'Original recuperado.');
  assert.equal(createdId, 'accepted-once');
  assert.equal(posts, 1);
});

test('verified manifests recover every page and preserve cue time, literal text and known speaker', async () => {
  const segments: TranscriptSegment[] = Array.from({ length: 451 }, (_, index) => ({ index, start: index * 1.5, end: index * 1.5 + 1,
    text: ` Texto sintético ${index}.\nSegunda línea. `, ...(index % 3 === 0 ? { speaker: 'Interviniente identificado' } : {}) }));
  const sha256 = await computeTranscriptHash(segments);
  const pages: number[] = [];
  const statuses: string[] = [];
  const progress: TranscriptionProgress[] = [];
  const manifest = { segmentCount: segments.length, sha256, language: 'es', verified: true, formatVersion: 1 };
  const api = new ApiClient(async () => 'token', async input => {
    const path = new URL(String(input), 'http://localhost');
    if (path.pathname.endsWith('/segments')) {
      const offset = Number(path.searchParams.get('offset'));
      pages.push(offset);
      const portion = segments.slice(offset, offset + 200);
      return json({ job_id: 'manifest-job', status: 'completed', language: 'es', total_segments: segments.length,
        offset, limit: 200, next_offset: offset + portion.length === segments.length ? null : offset + portion.length, segments: portion, transcript_hash: sha256 });
    }
    return path.pathname.endsWith('/transcript') ? json({ transcript: manifest, fileName: 'original.wav' })
      : json({ job_id: 'manifest-job', status: 'completed', transcript: manifest });
  });
  const text = await new TranscriptionService(api).resumeJob('manifest-job', { onStatus: value => statuses.push(value), onProgress: value => progress.push(value) });
  assert.equal(text, formatLiteralTranscript(segments));
  assert.deepEqual(pages, [0, 200, 400]);
  assert.equal(statuses.at(-1), 'completed');
  assert.equal(progress.at(-1)?.recoveredSegments, 451);
  assert.equal(progress.at(-1)?.totalSegments, 451);
  assert.equal(progress.at(-1)?.percent, undefined, 'Captions and recovery must not pretend to have video progress.');
  assert.deepEqual(await new TranscriptionService(api).transcript('manifest-job'), { text: formatLiteralTranscript(segments), fileName: 'original.wav' });
});

test('altered manifests, missing cues or another page identity never produce successful source text', async () => {
  const segments: TranscriptSegment[] = [{ index: 0, start: 0, end: 1, text: 'Original' }];
  const sha256 = await computeTranscriptHash(segments);
  for (const alteration of ['text', 'identity', 'count']) {
    const api = new ApiClient(async () => 'token', async input => {
      if (!String(input).includes('/segments')) return json({ job_id: 'checked', status: 'completed', transcript: { segmentCount: 1, sha256, language: 'es', verified: true, formatVersion: 1 } });
      return json({ job_id: alteration === 'identity' ? 'other' : 'checked', status: 'completed', language: 'es', total_segments: alteration === 'count' ? 2 : 1,
        offset: 0, limit: 200, next_offset: alteration === 'count' ? 1 : null, segments: alteration === 'text' ? [{ ...segments[0], text: 'Changed' }] : segments, transcript_hash: sha256 });
    });
    await assert.rejects(new TranscriptionService(api).resumeJob('checked'));
  }
});

test('sources beyond the visible 20 MiB safety limit fail explicitly before any successful completion', async () => {
  const count = 100;
  const text = 'Texto sintético. '.repeat(14_000);
  const statuses: string[] = [];
  let pageCalls = 0;
  const service = new TranscriptionService(new ApiClient(async () => 'token', async input => {
    const path = new URL(String(input), 'http://localhost');
    if (!path.pathname.endsWith('/segments')) return json({ job_id: 'huge', status: 'completed', transcript: { segmentCount: count, sha256: 'a'.repeat(64), language: 'es', verified: true, formatVersion: 1 } });
    pageCalls++;
    const offset = Number(path.searchParams.get('offset'));
    const segments = Array.from({ length: 2 }, (_, index) => ({ index: offset + index, start: offset + index, end: offset + index + 1, text }));
    return json({ job_id: 'huge', status: 'completed', language: 'es', total_segments: count, offset, limit: 200,
      next_offset: offset + 2 === count ? null : offset + 2, segments, transcript_hash: 'a'.repeat(64) });
  }));
  await assert.rejects(service.resumeJob('huge', { onStatus: status => statuses.push(status) }), /20 MiB/);
  assert.ok(pageCalls > 1 && pageCalls < 50);
  assert.equal(statuses.includes('completed'), false);
});

test('browser service consumes the actual authenticated capability route and completes one direct upload over HTTP', async () => {
  const file = new SyntheticVideo();
  const reservations = new Map<string, { uid: string; reservation: UploadReservation }>();
  const methods: SegmentJobStore = {
    reserveUpload: async (uid, id, metadata, kind) => {
      assert.equal(kind, 'direct');
      assert.equal(metadata.size, file.size);
      const reservation: UploadReservation = { requestId: id, metadata, kind, status: 'pending' };
      reservations.set(id, { uid, reservation });
      return { reservation, created: true };
    },
    getUploadRequest: async (uid, id) => {
      const found = reservations.get(id);
      if (!found) throw new RequestError(404, 'Solicitud no encontrada.');
      if (found.uid !== uid) throw new RequestError(403, 'Otro propietario.');
      return found.reservation;
    },
    attachUpload: async (uid, id, job, upload) => {
      const found = reservations.get(id);
      assert.equal(found?.uid, uid);
      assert.ok(found);
      found.reservation = { ...found.reservation, status: 'accepted', jobId: job.job_id, ...(upload ? { upload } : {}) };
    },
    appendTranscriptPage: async () => { throw new Error('Unexpected segment storage in a legacy fixture response.'); },
    finalizeTranscript: async () => { throw new Error('Unexpected manifest finalization.'); },
    getSegmentPage: async () => { throw new Error('Unexpected segment retrieval.'); },
    getTranscriptText: async () => { throw new Error('Unexpected complete transcript retrieval.'); },
  };
  let uploaded = 0;
  let creates = 0;
  const provider = {
    create: async () => { throw new Error('Direct uploads must not fall back to multipart.'); },
    get: async (id: string) => { assert.equal(id, 'http-direct'); assert.equal(uploaded, file.size); return { job_id: id, status: 'completed' as const, text: 'Fuente HTTP íntegra.' }; },
    createDirectUpload: async (input: { request_id: string; size: number; owner_id: string }) => {
      creates++;
      assert.equal(input.size, file.size); assert.equal(input.owner_id, 'synthetic-owner');
      return { request_id: input.request_id, job_id: 'http-direct', status: 'uploading' as const, size: input.size, upload_url: url };
    },
    getDirectUpload: async () => { throw new Error('Initial acceptance must not be submitted or retrieved twice.'); },
  };
  const app = express();
  app.use(express.json());
  app.use(createAuthMiddleware(async uid => ({ uid } as DecodedIdToken)));
  app.use('/api/transcription', createTranscriptionRouter(provider, (_req, _res, next) => next(), Object.assign(new FixtureJobStore(), methods), { directUploadEnabled: true }));
  app.use(securityErrorHandler);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const api = new ApiClient(async () => 'synthetic-owner', (input, options) => fetch(base + String(input), options));
    const service = new TranscriptionService(api, { directFetch: async (_input, options) => {
      assert.equal(new Headers(options?.headers).get('Authorization'), null);
      if (options?.method === 'HEAD') return tusResponse(uploaded, file.size);
      assert.ok(options?.body instanceof Blob);
      uploaded += options.body.size;
      return tusResponse(uploaded);
    } });
    assert.equal(await service.processMedia(file), 'Fuente HTTP íntegra.');
    assert.equal(creates, 1); assert.equal(uploaded, file.size); assert.equal(reservations.size, 1);
    const capability = await api.request('/api/transcription/capabilities');
    assert.ok(capability && typeof capability === 'object' && 'directMaxBytes' in capability);
    assert.equal(capability.directMaxBytes, MAX_DIRECT_MEDIA_BYTES);
    const unauthenticated = await fetch(base + '/api/transcription/capabilities');
    assert.equal(unauthenticated.status, 401);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
