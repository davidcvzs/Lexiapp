import { isRecord, MAX_TRANSCRIPT_SEGMENTS, validJobId, validSha256 } from './transcription.js';

export interface TranscriptSegment { index: number; start: number; end: number; text: string; speaker?: string }
export interface TranscriptPage {
  job_id: string; status: 'completed'; language: 'es'; total_segments: number;
  offset: number; limit: number; next_offset: number | null; segments: TranscriptSegment[]; transcript_hash: string;
}
export interface TranscriptPageExpectation {
  jobId: string; offset: number; limit: number; totalSegments?: number; sha256?: string;
  previousSegment?: Pick<TranscriptSegment, 'index' | 'start' | 'end'>;
}
export const MAX_TRANSCRIPT_PAGE_SEGMENTS = 200;
export const MAX_TRANSCRIPT_PAGE_BYTES = 700 * 1024;
export const MAX_TRANSCRIPT_SEGMENT_BYTES = 256 * 1024;
const encoder = new TextEncoder();

function integer(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

/** Preserve original cue text and voice metadata; omit absent speakers rather than inventing labels. */
export function parseTranscriptSegment(value: unknown): TranscriptSegment {
  if (!isRecord(value) || !integer(value.index, 0, MAX_TRANSCRIPT_SEGMENTS - 1)
    || typeof value.start !== 'number' || !Number.isFinite(value.start) || value.start < 0
    || typeof value.end !== 'number' || !Number.isFinite(value.end) || value.end <= value.start
    || value.end > 365 * 24 * 60 * 60
    || typeof value.text !== 'string' || !value.text.trim() || encoder.encode(value.text).byteLength > MAX_TRANSCRIPT_SEGMENT_BYTES
    || (value.speaker !== undefined && (typeof value.speaker !== 'string' || !value.speaker.trim() || value.speaker.length > 250))) {
    throw new Error('El servicio devolvió un segmento de transcripción inválido.');
  }
  return { index: value.index, start: value.start, end: value.end, text: value.text,
    ...(typeof value.speaker === 'string' ? { speaker: value.speaker } : {}) };
}

/** Canonical JSON fixes field order, retaining literal text, time values and available speaker metadata. */
export function canonicalSegments(segments: readonly TranscriptSegment[]): string {
  return JSON.stringify(segments.map(parseTranscriptSegment));
}

/** Browser and backend compute the same SHA-256 over the canonical complete sequence. */
export async function computeTranscriptHash(segments: readonly TranscriptSegment[]): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(canonicalSegments(segments)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Enforce complete indices and chronological starts while allowing overlapping speech. */
export function validateTranscriptSequence(segments: readonly TranscriptSegment[], startIndex = 0, previousSegment?: Pick<TranscriptSegment, 'index' | 'start' | 'end'>): void {
  let previous = previousSegment;
  for (let index = 0; index < segments.length; index++) {
    const segment = parseTranscriptSegment(segments[index]);
    if (segment.index !== startIndex + index || (previous && (segment.index !== previous.index + 1 || segment.start < previous.start))) {
      throw new Error('Los segmentos están incompletos o fuera de orden.');
    }
    previous = segment;
  }
}

/** Reject page identity, count, cursor or version changes before any source is persisted. */
export function parseTranscriptPage(value: unknown, expected?: TranscriptPageExpectation): TranscriptPage {
  if (!isRecord(value) || !validJobId(value.job_id) || value.status !== 'completed' || value.language !== 'es'
    || !integer(value.total_segments, 1, MAX_TRANSCRIPT_SEGMENTS) || !integer(value.offset, 0, value.total_segments - 1)
    || !integer(value.limit, 1, MAX_TRANSCRIPT_PAGE_SEGMENTS) || !validSha256(value.transcript_hash)
    || !Array.isArray(value.segments) || value.segments.length < 1 || value.segments.length > value.limit
    || value.offset + value.segments.length > value.total_segments) {
    throw new Error('El servicio devolvió una página de transcripción inválida o vacía.');
  }
  const nextOffset = value.offset + value.segments.length;
  if (value.next_offset !== (nextOffset === value.total_segments ? null : nextOffset)) {
    throw new Error('El servicio devolvió un cursor de transcripción inválido.');
  }
  if (expected && (value.job_id !== expected.jobId || value.offset !== expected.offset || value.limit !== expected.limit
    || (expected.totalSegments !== undefined && value.total_segments !== expected.totalSegments)
    || (expected.sha256 !== undefined && value.transcript_hash !== expected.sha256))) {
    throw new Error('La página pertenece a otro trabajo o a otra versión de la transcripción.');
  }
  const segments = value.segments.map(parseTranscriptSegment);
  validateTranscriptSequence(segments, value.offset, expected?.previousSegment);
  const page: TranscriptPage = { job_id: value.job_id, status: 'completed', language: 'es', total_segments: value.total_segments,
    offset: value.offset, limit: value.limit, next_offset: value.next_offset as number | null, segments, transcript_hash: value.transcript_hash };
  if (encoder.encode(JSON.stringify(page)).byteLength > MAX_TRANSCRIPT_PAGE_BYTES) {
    throw new Error('La página de transcripción excede el tamaño permitido.');
  }
  return page;
}

function formatTime(seconds: number): string {
  const milliseconds = Math.round(seconds * 1000);
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const wholeSeconds = Math.floor(milliseconds / 1000) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${String(milliseconds % 1000).padStart(3, '0')}`;
}

/** Assemble a literal source with timestamps and only speakers identified by the provider. */
export function formatLiteralTranscript(segments: readonly TranscriptSegment[]): string {
  validateTranscriptSequence(segments, segments[0]?.index ?? 0);
  return segments.map(segment => `[${formatTime(segment.start)} → ${formatTime(segment.end)}]${segment.speaker ? ` (${segment.speaker})` : ''}\n${segment.text}`).join('\n\n');
}
