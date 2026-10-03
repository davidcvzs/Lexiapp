import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useTranscription } from '../../src/hooks/useTranscription.js';
import { ApiClient } from '../../src/services/ApiClient.js';
import { TranscriptionService } from '../../src/services/TranscriptionService.js';
import type { UploadIdentity } from '../../src/services/TranscriptionService.js';
import { MAX_DIRECT_MEDIA_BYTES } from '../../shared/transcription.js';

afterEach(() => { cleanup(); window.sessionStorage.clear(); });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const pendingKey = 'lexia.transcription.pending.v1';

test('lost multipart acceptance survives remount as an opaque pointer and resumes with no File or second POST', async () => {
  let posts = 0;
  let gets = 0;
  let requestId = '';
  const service = new TranscriptionService(new ApiClient(async () => 'token', async (input, options) => {
    if (options?.method === 'POST') {
      posts++;
      requestId = new Headers(options.headers).get('X-Upload-Request-Id')!;
      throw new Error('Lost response');
    }
    gets++;
    assert.equal(input, `/api/transcription/requests/${requestId}`);
    return json({ job_id: 'accepted-job', status: 'completed', text: 'Fuente literal recuperada.' });
  }));
  const first = renderHook(() => useTranscription(service));
  await act(async () => { await first.result.current.start(new File(['synthetic'], 'private-name.wav', { type: 'audio/wav' })); });
  assert.equal(first.result.current.canRetry, true);
  const pointer = JSON.parse(window.sessionStorage.getItem(pendingKey)!);
  assert.deepEqual(pointer, { requestId, kind: 'multipart' });
  assert.equal(window.sessionStorage.getItem(pendingKey)!.includes('private-name'), false);
  first.unmount();
  const reopened = renderHook(() => useTranscription(service));
  assert.equal(reopened.result.current.pendingUpload?.requestId, requestId);
  await act(async () => { await reopened.result.current.retry(); });
  assert.equal(posts, 1); assert.equal(gets, 1);
  assert.equal(reopened.result.current.result?.text, 'Fuente literal recuperada.');
  assert.equal(window.sessionStorage.getItem(pendingKey), null);
});

test('cancelled TUS upload survives remount and resumes only after the original file is reselected', async () => {
  const file = new File(['synthetic-video'], 'private-video.mov', { type: 'video/quicktime', lastModified: 42 });
  let upload: UploadIdentity | undefined;
  let posts = 0;
  let patches = 0;
  let uploaded = false;
  let activePatchSignal: AbortSignal | null | undefined;
  const service = new TranscriptionService(new ApiClient(async () => 'token', async (input, options) => {
    if (String(input).endsWith('/capabilities')) return json({ directUploadEnabled: true, directMaxBytes: MAX_DIRECT_MEDIA_BYTES });
    if (options?.method === 'POST') { posts++; upload = JSON.parse(options.body as string); }
    if (String(input).includes('/uploads')) return json({ job_id: 'same-direct', status: 'uploading', upload: { ...upload, url: 'https://upload.videodelivery.net/tus/private-signed-capability' } });
    return json({ job_id: 'same-direct', status: uploaded ? 'completed' : 'uploading', ...(uploaded ? { text: 'Texto íntegro reanudado.' } : {}) });
  }), { directFetch: async (_input, options) => {
    if (options?.method === 'HEAD') return new Response(null, { status: 204, headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': '0', 'Upload-Length': String(file.size) } });
    patches++;
    activePatchSignal = options?.signal;
    if (patches === 1) return new Promise<Response>(() => {});
    uploaded = true;
    return new Response(null, { status: 204, headers: { 'Tus-Resumable': '1.0.0', 'Upload-Offset': String(file.size) } });
  } });
  const first = renderHook(() => useTranscription(service));
  let operation: Promise<string | undefined> | undefined;
  act(() => { operation = first.result.current.start(file); });
  await waitFor(() => assert.equal(patches, 1));
  const saved = window.sessionStorage.getItem(pendingKey)!;
  assert.equal(saved.includes(file.name), false);
  assert.equal(saved.includes('signed-capability'), false);
  assert.equal(saved.includes('fingerprint'), false);
  act(() => first.result.current.cancel());
  assert.equal(activePatchSignal?.aborted, true);
  await act(async () => { await operation; });
  first.unmount();
  const reopened = renderHook(() => useTranscription(service));
  assert.equal(reopened.result.current.pendingUpload?.kind, 'direct');
  await act(async () => { await reopened.result.current.resumeUpload(new File(['synthetic-video'], file.name, { type: file.type, lastModified: 43 })); });
  assert.match(reopened.result.current.error, /mismo archivo/);
  assert.equal(posts, 1); assert.equal(patches, 1);
  await act(async () => { await reopened.result.current.resumeUpload(file); });
  assert.equal(posts, 1); assert.equal(patches, 2);
  assert.equal(reopened.result.current.result?.text, 'Texto íntegro reanudado.');
  assert.equal(reopened.result.current.pendingUpload, null);
  assert.equal(reopened.result.current.progress?.percent, 100);
});

test('owner rejection clears an opaque saved request; a failed later upload preserves the previous result', async () => {
  const requestId = '12ec17e4-83bf-4258-9e41-d4bedfe33676';
  window.sessionStorage.setItem(pendingKey, JSON.stringify({ requestId, kind: 'multipart' }));
  let fail = false;
  const service = new TranscriptionService(new ApiClient(async () => 'token', async (input, options) => {
    if (String(input).includes('/requests/')) return json({ error: 'Otro propietario.' }, 403);
    assert.equal(options?.method, 'POST');
    return fail ? json({ error: 'Carga temporalmente no disponible.' }, 503) : json({ job_id: 'success', status: 'completed', text: 'Fuente anterior válida.' });
  }));
  const view = renderHook(() => useTranscription(service));
  await act(async () => { await view.result.current.retry(); });
  assert.equal(view.result.current.pendingUpload, null);
  assert.equal(window.sessionStorage.getItem(pendingKey), null);
  await act(async () => { await view.result.current.start(new File(['synthetic'], 'first.wav', { type: 'audio/wav' })); });
  assert.equal(view.result.current.result?.text, 'Fuente anterior válida.');
  fail = true;
  await act(async () => { await view.result.current.start(new File(['synthetic'], 'second.wav', { type: 'audio/wav' })); });
  assert.equal(view.result.current.result?.text, 'Fuente anterior válida.');
  assert.match(view.result.current.error, /temporalmente/);
  assert.equal(view.result.current.canRetry, true);
});
