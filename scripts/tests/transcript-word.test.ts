import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import express from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { canonicalSegments, formatLiteralTranscript } from '../../shared/transcriptSegments.js';
import type { TranscriptPage, TranscriptSegment } from '../../shared/transcriptSegments.js';
import { MAX_WORD_ARTIFACT_BYTES, parseTranscriptWordRequest, transcriptWordReviewHash } from '../../shared/transcriptWord.js';
import type { TranscriptWordReceipt, TranscriptWordState } from '../../shared/transcriptWord.js';
import { buildWordArtifact } from '../../shared/wordDocument.js';
import { CloudflareTranscriptionService } from '../../server/services/CloudflareTranscriptionService.js';
import type { RemoteDeletionCheck } from '../../server/services/CloudflareTranscriptionService.js';
import { TranscriptWordService, verifyTranscriptWordDocument } from '../../server/services/TranscriptWordService.js';
import type { RemoteVideoProvider } from '../../server/services/TranscriptWordService.js';
import type { TranscriptArtifactRepository } from '../../server/persistence/TranscriptArtifactStore.js';
import type { StoredJob } from '../../server/persistence/WorkspaceRepository.js';
import { createTranscriptWordRouter } from '../../server/routes/transcriptWord.js';
import { createAuthMiddleware } from '../../server/middleware/auth.js';
import { RequestError, securityErrorHandler } from '../../server/middleware/security.js';

const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const rejects = (status: number) => (error: RequestError) => error.status === status;
const cues = (count = 3): TranscriptSegment[] => Array.from({ length: count }, (_, index) => ({
  index, start: index / 2, end: index / 2 + 1, text: index === 0 ? '  María declaró: «sí» & <exacto>.\r\n\tSegunda línea 😀.  ' : `Intervención sintética ${index}.`,
  ...(index === 1 ? { speaker: 'Persona identificada por el proveedor' } : {}),
}));

function fixture(all = cues(), count = 200) {
  const uid = 'owner-synthetic', id = 'job-word-synthetic', sourceHash = hash(canonicalSegments(all));
  const manifest = { sha256: sourceHash, segmentCount: all.length, language: 'es' as const, formatVersion: 1 as const, verified: true as const };
  const text = formatLiteralTranscript(all).replace(/\r\n?/g, '\n');
  const job: StoredJob = { job_id: id, status: 'completed', transcript: manifest, fileName: 'sintetico.mp4', createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z' };
  let state: TranscriptWordState = { artifact: null, transcript: manifest, fileName: job.fileName, remoteDeletion: { status: 'not_requested' } };
  let storedBytes: Uint8Array | undefined;
  const counters = { builds: 0, saves: 0, deletes: 0, probes: 0, reserves: 0, pages: [] as number[] };
  const behavior: { saveError?: Error; downloadError?: Error; deleteError?: Error; probe: RemoteDeletionCheck; page?: (page: TranscriptPage) => TranscriptPage } = { probe: 'unknown' };
  const owns = (owner: string, jobId: string) => {
    if (owner !== uid) throw new RequestError(403, 'Otro propietario.');
    if (jobId !== id) throw new RequestError(404, 'Otro trabajo.');
  };
  const jobs = {
    getJob: async (owner: string, jobId: string) => { owns(owner, jobId); return job; },
    getSegmentPage: async (owner: string, jobId: string, offset: number, limit: number): Promise<TranscriptPage> => {
      owns(owner, jobId); counters.pages.push(offset);
      const segments = all.slice(offset, offset + Math.min(count, limit)), next = offset + segments.length;
      const page: TranscriptPage = { job_id: id, status: 'completed', language: 'es', transcript_hash: sourceHash, total_segments: all.length, offset, limit, next_offset: next === all.length ? null : next, segments };
      return behavior.page ? behavior.page(page) : page;
    },
  };
  const artifacts: TranscriptArtifactRepository = {
    save: async (owner, jobId, artifact, bytes) => {
      owns(owner, jobId); if (behavior.saveError) throw behavior.saveError;
      counters.saves++; storedBytes = new Uint8Array(bytes); state = { ...state, artifact }; return artifact;
    },
    getState: async (owner, jobId) => { owns(owner, jobId); return state; },
    download: async (owner, jobId) => {
      owns(owner, jobId); if (behavior.downloadError) throw behavior.downloadError;
      if (!state.artifact || !storedBytes) throw new RequestError(409, 'Sin artefacto.');
      return { artifact: state.artifact, bytes: new Uint8Array(storedBytes) };
    },
    reserveDeletion: async (owner, jobId, artifactId, artifactHash) => {
      owns(owner, jobId); counters.reserves++;
      assert.equal(state.artifact?.artifactId, artifactId); assert.equal(state.artifact?.artifactHash, artifactHash);
      if (state.remoteDeletion.status !== 'not_requested') return { created: false, state: state.remoteDeletion };
      state = { ...state, remoteDeletion: { status: 'pending', artifactId } }; return { created: true, state: state.remoteDeletion };
    },
    finishDeletion: async (owner, jobId, artifactId, status, message) => {
      owns(owner, jobId);
      if (state.remoteDeletion.status !== 'deleted') state = { ...state, remoteDeletion: { status, artifactId, message } };
      return state.remoteDeletion;
    },
  };
  const provider: RemoteVideoProvider = {
    deleteRemote: async (jobId, _signal, owner) => { owns(owner, jobId); counters.deletes++; assert.equal(state.remoteDeletion.status, 'pending'); if (behavior.deleteError) throw behavior.deleteError; },
    checkRemoteDeletion: async (jobId, _signal, owner) => { owns(owner, jobId); counters.probes++; return behavior.probe; },
  };
  const builder: typeof buildWordArtifact = async options => { counters.builds++; assert.equal(options.text, text); return buildWordArtifact(options); };
  const service = new TranscriptWordService({ jobs, artifacts, provider, builder });
  const request = { sourceHash, reviewed: true as const, caseNumber: 'TEST-2026', format: { profile: 'transcript647' as const, marks: [{ start: text.indexOf('María'), end: text.indexOf('María') + 5, category: 'name' as const }] } };
  return { uid, id, text, all, job, manifest, sourceHash, request, service, jobs, artifacts, provider, builder, counters, behavior,
    get state() { return state; }, setState(value: TranscriptWordState) { state = value; },
    get bytes() { return storedBytes; }, setBytes(value: Uint8Array) { storedBytes = value; } };
}
const confirmation = (artifact: TranscriptWordReceipt) => ({ artifactId: artifact.artifactId, artifactHash: artifact.artifactHash, downloadConfirmed: true, confirm: true });

test('server builds every one of 205 cues with exact timestamps, voices and red marks, then reuses its durable receipt', async () => {
  const f = fixture(cues(205));
  const created = await f.service.create(f.uid, f.id, f.request);
  assert.ok(created.artifact); assert.equal(created.artifact.sourceHash, f.sourceHash); assert.equal(created.artifact.contentHash, hash(f.text));
  assert.equal(created.artifact.artifactId, created.artifact.reviewHash); assert.equal(created.artifact.artifactHash, hash(f.bytes!));
  assert.deepEqual(f.counters.pages, [0, 200]); assert.equal(created.artifact.caseNumber, 'TEST-2026');
  verifyTranscriptWordDocument(f.bytes!, f.text, f.request.format, f.request.caseNumber);
  assert.ok(f.text.includes('Intervención sintética 204.')); assert.ok(f.text.includes('(Persona identificada por el proveedor)'));
  const restarted = new TranscriptWordService({ jobs: f.jobs, artifacts: f.artifacts, provider: f.provider, builder: f.builder });
  assert.deepEqual(await restarted.create(f.uid, f.id, f.request), created);
  assert.equal(f.counters.builds, 1); assert.equal(f.counters.saves, 1); assert.equal(f.counters.deletes, 0);
});

test('complete sources beyond editor limits are exported without clipping or passing through AI', async () => {
  const all = cues(6).map(cue => ({ ...cue, text: `${cue.index} ` + 'á'.repeat(100_000) })), f = fixture(all, 2);
  assert.ok(f.text.length > 500_000);
  const result = await f.service.create(f.uid, f.id, { ...f.request, format: { profile: 'transcript647', marks: [] } });
  assert.ok(result.artifact); assert.equal(result.artifact.contentHash, hash(f.text));
  assert.deepEqual(f.counters.pages, [0, 2, 4]); assert.ok(f.text.endsWith('á'.repeat(1000)));
  verifyTranscriptWordDocument(f.bytes!, f.text, { profile: 'transcript647', marks: [] }, f.request.caseNumber);
  assert.equal(f.counters.deletes, 0);
});

test('an idempotent creation cannot return a stale receipt when another tab changes Word before or after verification', async () => {
  for (const changeAt of ['before_download', 'after_download'] as const) {
    const f = fixture(); const initial = await f.service.create(f.uid, f.id, f.request); assert.ok(initial.artifact);
    const otherRequest = parseTranscriptWordRequest({ ...f.request, format: { ...f.request.format, court: 'Otra revisión sintética' } }, f.text);
    const otherWord = await buildWordArtifact({ text: f.text, format: otherRequest.format, caseNumber: otherRequest.caseNumber });
    const otherReview = await transcriptWordReviewHash(otherRequest);
    const otherArtifact: TranscriptWordReceipt = { ...initial.artifact, format: otherRequest.format, reviewHash: otherReview, artifactId: otherReview,
      artifactHash: otherWord.artifactHash, byteLength: otherWord.bytes.byteLength };
    const readState = f.artifacts.getState; let reads = 0;
    f.artifacts.getState = async (owner, id) => {
      const state = await readState(owner, id); reads++;
      if (reads === (changeAt === 'before_download' ? 1 : 2)) {
        f.setState({ ...state, artifact: otherArtifact }); f.setBytes(otherWord.bytes);
        return changeAt === 'before_download' ? state : f.state;
      }
      return state;
    };
    await assert.rejects(f.service.create(f.uid, f.id, f.request), rejects(409));
    assert.equal(f.state.artifact?.artifactId, otherArtifact.artifactId); assert.equal(f.counters.builds, 1); assert.equal(f.counters.saves, 1);
    assert.equal(f.counters.reserves, 0); assert.equal(f.counters.deletes, 0);
  }
});

test('review/source/mark changes, legacy plaintext and inconsistent recovery cannot create a verified Word', async () => {
  for (const change of [{ reviewed: false }, { sourceHash: 'a'.repeat(64) }, { format: { profile: 'transcript647', marks: [{ start: 0, end: 1, category: 'invented' }] } }]) {
    const f = fixture();
    await assert.rejects(f.service.create(f.uid, f.id, { ...f.request, ...change }));
    assert.equal(f.counters.builds, 0); assert.equal(f.counters.saves, 0); assert.equal(f.counters.deletes, 0);
  }
  const legacy = fixture(); delete legacy.job.transcript; legacy.job.text = 'Texto legacy.';
  await assert.rejects(legacy.service.create(legacy.uid, legacy.id, legacy.request), rejects(409));
  const changed = fixture(cues(205)); changed.behavior.page = page => page.offset ? { ...page, transcript_hash: 'b'.repeat(64) } : page;
  await assert.rejects(changed.service.create(changed.uid, changed.id, changed.request), rejects(502));
  assert.equal(changed.counters.builds, 0); assert.equal(changed.counters.deletes, 0);
});

test('runtime verification rejects altered OOXML text or lost red formatting even when claimed hashes are internally correct', async () => {
  const f = fixture();
  for (const altered of [{ text: f.text + ' Agregado.' }, { format: { ...f.request.format, marks: [] } }]) {
    const service = new TranscriptWordService({ jobs: f.jobs, artifacts: f.artifacts, provider: f.provider,
      builder: options => buildWordArtifact({ ...options, ...altered }) });
    await assert.rejects(service.create(f.uid, f.id, f.request), rejects(502));
  }
  assert.equal(f.counters.saves, 0); assert.equal(f.counters.deletes, 0);
  const crossParagraph = { profile: 'transcript647' as const, marks: [{ start: f.text.indexOf('María'), end: f.text.indexOf('Segunda') + 7, category: 'address' as const }] };
  const built = await buildWordArtifact({ text: f.text, format: crossParagraph });
  assert.doesNotThrow(() => verifyTranscriptWordDocument(built.bytes, f.text, crossParagraph));
});

test('generation, binary size and durable-storage failures never reserve or delete a video', async () => {
  const f = fixture();
  const failing = new TranscriptWordService({ jobs: f.jobs, artifacts: f.artifacts, provider: f.provider, builder: async () => { throw new Error('synthetic generation failure'); } });
  await assert.rejects(failing.create(f.uid, f.id, f.request), rejects(422));
  const oversized = new TranscriptWordService({ jobs: f.jobs, artifacts: f.artifacts, provider: f.provider,
    builder: async () => ({ bytes: new Uint8Array(MAX_WORD_ARTIFACT_BYTES + 1), text: f.text, contentHash: hash(f.text), artifactHash: 'a'.repeat(64) }) });
  await assert.rejects(oversized.create(f.uid, f.id, f.request), rejects(413));
  f.behavior.saveError = new RequestError(503, 'synthetic storage unavailable');
  await assert.rejects(f.service.create(f.uid, f.id, f.request), rejects(503));
  assert.equal(f.state.artifact, null); assert.equal(f.counters.reserves, 0); assert.equal(f.counters.deletes, 0);
});

test('a builder that replaces the reviewed profile, court or case number is rejected before saving or deleting', async () => {
  const f = fixture();
  const request = { ...f.request, format: { ...f.request.format, court: 'Juzgado revisado' } };
  for (const builder of [
    (options: Parameters<typeof buildWordArtifact>[0]) => buildWordArtifact({ ...options, format: { ...options.format, profile: 'judicialDouble', court: 'Otro juzgado' } }),
    (options: Parameters<typeof buildWordArtifact>[0]) => buildWordArtifact({ ...options, format: { ...options.format, court: 'Otro juzgado' } }),
    (options: Parameters<typeof buildWordArtifact>[0]) => buildWordArtifact({ ...options, caseNumber: 'OTRO-EXPEDIENTE' }),
  ]) {
    const service = new TranscriptWordService({ jobs: f.jobs, artifacts: f.artifacts, provider: f.provider, builder });
    await assert.rejects(service.create(f.uid, f.id, request), rejects(502));
  }
  assert.equal(f.counters.saves, 0); assert.equal(f.counters.reserves, 0); assert.equal(f.counters.deletes, 0);
  for (const profile of ['judicial', 'judicialDouble'] as const) {
    const format = { profile, court: 'Juzgado revisado', marks: [] }, text = 'Texto sintético.\nCONSIDERANDO\nÚltima línea.';
    const built = await buildWordArtifact({ text, format, caseNumber: 'TEST-2026' });
    assert.doesNotThrow(() => verifyTranscriptWordDocument(built.bytes, text, format, 'TEST-2026'));
  }
});

test('owner, current binary and both explicit confirmations are checked before remote deletion', async () => {
  const f = fixture(); const { artifact } = await f.service.create(f.uid, f.id, f.request); assert.ok(artifact);
  await assert.rejects(f.service.deleteRemote('another-owner', f.id, confirmation(artifact), new AbortController().signal), rejects(403));
  for (const change of [{ downloadConfirmed: false }, { confirm: false }, { artifactHash: 'a'.repeat(64) }, { artifactId: 'b'.repeat(64) }]) {
    await assert.rejects(f.service.deleteRemote(f.uid, f.id, { ...confirmation(artifact), ...change }, new AbortController().signal));
  }
  f.setBytes(new Uint8Array([1, 2, 3]));
  await assert.rejects(f.service.deleteRemote(f.uid, f.id, confirmation(artifact), new AbortController().signal), rejects(502));
  assert.equal(f.counters.reserves, 0); assert.equal(f.counters.deletes, 0);
});

test('confirmed remote deletion runs once and preserves full source, receipt and downloadable Word', async () => {
  const f = fixture(); const { artifact } = await f.service.create(f.uid, f.id, f.request); assert.ok(artifact);
  const state = await f.service.deleteRemote(f.uid, f.id, confirmation(artifact), new AbortController().signal);
  assert.equal(state.status, 'deleted'); assert.equal(f.counters.deletes, 1);
  assert.deepEqual(await f.service.deleteRemote(f.uid, f.id, confirmation(artifact), new AbortController().signal), state);
  assert.equal(f.counters.deletes, 1); assert.equal(f.job.status, 'completed'); assert.equal(f.job.transcript?.sha256, f.sourceHash);
  const download = await f.service.download(f.uid, f.id); assert.equal(hash(download.bytes), artifact.artifactHash);
  assert.deepEqual(await f.service.reconcile(f.uid, f.id, new AbortController().signal), state); assert.equal(f.counters.probes, 0);
});

test('lost acknowledgement remains ambiguous, GET presence never claims deletion, and tombstone reconciliation uses no second DELETE', async () => {
  const f = fixture(); const { artifact } = await f.service.create(f.uid, f.id, f.request); assert.ok(artifact);
  f.behavior.deleteError = new RequestError(502, 'synthetic lost reply');
  assert.equal((await f.service.deleteRemote(f.uid, f.id, confirmation(artifact), new AbortController().signal)).status, 'unknown');
  assert.equal((await f.service.deleteRemote(f.uid, f.id, confirmation(artifact), new AbortController().signal)).status, 'unknown');
  f.behavior.probe = 'present'; assert.equal((await f.service.reconcile(f.uid, f.id, new AbortController().signal)).status, 'unknown');
  f.behavior.probe = 'deleted'; assert.equal((await f.service.reconcile(f.uid, f.id, new AbortController().signal)).status, 'deleted');
  assert.equal(f.counters.deletes, 1); assert.equal(f.counters.probes, 2); assert.ok(f.state.artifact); assert.ok(f.bytes);
});

test('definitive rejection is durable and repeating the same receipt does not issue another DELETE', async () => {
  const f = fixture(); const { artifact } = await f.service.create(f.uid, f.id, f.request); assert.ok(artifact);
  f.behavior.deleteError = new RequestError(403, 'synthetic rejection');
  assert.equal((await f.service.deleteRemote(f.uid, f.id, confirmation(artifact), new AbortController().signal)).status, 'failed');
  assert.equal((await f.service.deleteRemote(f.uid, f.id, confirmation(artifact), new AbortController().signal)).status, 'failed');
  assert.equal(f.counters.deletes, 1); assert.ok(f.state.artifact);
});

test('Worker adapter sends only owner-scoped backend credentials and accepts an exact deletion acknowledgement', async () => {
  const calls: { method: string; path: string; owner: string | null }[] = [];
  let reply: unknown = { deleted: true, job_id: 'job-synthetic' };
  const service = new CloudflareTranscriptionService({ url: 'https://worker.example.invalid', backendSecret: 'test-backend-only', fetcher: async (input, options) => {
    const url = new URL(String(input)), headers = new Headers(options?.headers);
    assert.equal(headers.get('x-api-key'), 'test-backend-only'); assert.equal(url.searchParams.get('job_token'), null);
    calls.push({ method: options?.method ?? 'GET', path: url.pathname, owner: headers.get('X-Owner-Id') });
    return new Response(JSON.stringify(reply), { headers: { 'Content-Type': 'application/json' } });
  } });
  await service.deleteRemote('job-synthetic', new AbortController().signal, 'owner:/+synthetic');
  assert.deepEqual(calls, [{ method: 'DELETE', path: '/jobs/job-synthetic', owner: 'owner:/+synthetic' }]);
  reply = { deleted: true, job_id: 'other-job' }; await assert.rejects(service.deleteRemote('job-synthetic', new AbortController().signal, 'owner'), rejects(502));
  await assert.rejects(service.deleteRemote('job-synthetic', new AbortController().signal, ''), rejects(400));
  await assert.rejects(service.deleteRemote('../invalid', new AbortController().signal, 'owner'), rejects(400));
});

test('Worker GET reconciliation accepts only its authenticated job_deleted tombstone, never 404, 502 or an unrelated 410', async () => {
  let status = 410, payload: unknown = { code: 'job_deleted' }, calls = 0;
  const service = new CloudflareTranscriptionService({ url: 'https://worker.example.invalid', backendSecret: 'test-backend-only', fetcher: async (_input, options) => {
    assert.ok(!options?.method || options.method === 'GET'); assert.equal(new Headers(options?.headers).get('X-Owner-Id'), 'owner'); calls++;
    return new Response(JSON.stringify(payload), { status });
  } });
  assert.equal(await service.checkRemoteDeletion('job-synthetic', new AbortController().signal, 'owner'), 'deleted');
  for (const next of [404, 502]) { status = next; assert.equal(await service.checkRemoteDeletion('job-synthetic', new AbortController().signal, 'owner'), 'unknown'); }
  status = 410; payload = { code: 'unrelated' }; assert.equal(await service.checkRemoteDeletion('job-synthetic', new AbortController().signal, 'owner'), 'unknown');
  status = 200; payload = { job_id: 'job-synthetic', status: 'completed', total_segments: 3, transcript_hash: 'a'.repeat(64) };
  assert.equal(await service.checkRemoteDeletion('job-synthetic', new AbortController().signal, 'owner'), 'present'); assert.equal(calls, 5);
});

test('HTTP Word state, download and deletion isolate owners and require explicit confirmation', async () => {
  const f = fixture(), app = express(); app.use(express.json());
  app.use(createAuthMiddleware(async token => ({ uid: token } as DecodedIdToken)));
  app.use('/api/transcription', createTranscriptWordRouter(f.service)); app.use(securityErrorHandler);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}/api/transcription/jobs/${f.id}`;
  const request = (suffix: string, method = 'GET', body?: unknown, owner = f.uid) => fetch(base + suffix, {
    method, headers: { Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  try {
    assert.equal((await fetch(base + '/word')).status, 401);
    assert.equal((await request('/word')).status, 200);
    assert.equal((await request('/word', 'POST', { ...f.request, uid: 'another-owner' })).status, 200);
    const download = await request('/word/download'); assert.equal(download.status, 200); assert.equal(download.headers.get('cache-control'), 'no-store');
    const data = await download.json(); assert.equal(hash(Buffer.from(data.base64, 'base64')), data.artifact.artifactHash);
    for (const suffix of ['/word', '/word/download', '/remote-video/reconcile']) assert.equal((await request(suffix, suffix.includes('reconcile') ? 'POST' : 'GET', undefined, 'another-owner')).status, 403);
    assert.equal((await request('/remote-video', 'DELETE', { artifactId: data.artifact.artifactId })).status, 400); assert.equal(f.counters.deletes, 0);
    assert.equal((await request('/remote-video', 'DELETE', confirmation(data.artifact))).status, 200); assert.equal(f.counters.deletes, 1);
    assert.equal((await request('/word/download')).status, 200);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
