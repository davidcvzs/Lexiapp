import { hashText } from './documentIntegrity.js';
import { isRecord, parseTranscriptManifest, validJobId, validSha256 } from './transcription.js';
import type { TranscriptManifest } from './transcription.js';
import { parseWordFormat } from './wordFormatting.js';
import type { WordFormat } from './wordFormatting.js';
import { WORD_PROFILE_IDS } from './wordFormatting.js';
import { MAX_OFFICIAL_MARKS, OFFICIAL_MARK_CATEGORIES } from './officialMarking.js';

export const MAX_WORD_ARTIFACT_BYTES = 4 * 1024 * 1024;
export const WORD_ARTIFACT_BLOCK_BYTES = 256 * 1024;
export interface TranscriptWordRequest { sourceHash: string; reviewed: true; format: WordFormat; caseNumber?: string }
export interface TranscriptWordReceipt {
  jobId: string; artifactId: string; sourceHash: string; contentHash: string; artifactHash: string;
  byteLength: number; fileName: string; createdAt: string; reviewHash: string; format: WordFormat; caseNumber?: string;
}
export type RemoteDeletionStatus = 'not_requested' | 'pending' | 'deleted' | 'failed' | 'unknown';
export interface RemoteDeletionState { status: RemoteDeletionStatus; artifactId?: string; updatedAt?: string; message?: string }
export interface TranscriptWordState { artifact: TranscriptWordReceipt | null; remoteDeletion: RemoteDeletionState; transcript: TranscriptManifest; fileName: string }

/** Firestore map key order is not a presentation choice and must never change a review fingerprint. */
function canonicalWordFormat(format: WordFormat): WordFormat {
  return { profile: format.profile, ...(format.court === undefined ? {} : { court: format.court }),
    marks: format.marks.map(({ start, end, category }) => ({ start, end, category })) };
}

/** Bind human review to the complete source and the explicitly selected presentation. */
export function transcriptWordReviewHash(request: TranscriptWordRequest): Promise<string> {
  return hashText(JSON.stringify({ sourceHash: request.sourceHash, format: canonicalWordFormat(request.format), caseNumber: request.caseNumber ?? '' }));
}
export function parseTranscriptWordRequest(value: unknown, text: string): TranscriptWordRequest {
  if (!isRecord(value) || !validSha256(value.sourceHash) || value.reviewed !== true ||
    (value.caseNumber !== undefined && (typeof value.caseNumber !== 'string' || value.caseNumber.length > 100))) throw new Error('Revisa la transcripción completa antes de crear el Word.');
  return { sourceHash: value.sourceHash, reviewed: true, format: parseWordFormat(text, value.format),
    ...(value.caseNumber === undefined ? {} : { caseNumber: value.caseNumber as string }) };
}
export function parseTranscriptWordReceipt(value: unknown): TranscriptWordReceipt {
  if (!isRecord(value) || !validJobId(value.jobId) || typeof value.artifactId !== 'string' || !/^[a-f0-9]{64}$/.test(value.artifactId) ||
    ![value.sourceHash, value.contentHash, value.artifactHash, value.reviewHash].every(validSha256) ||
    typeof value.byteLength !== 'number' || !Number.isSafeInteger(value.byteLength) || value.byteLength < 1 || value.byteLength > MAX_WORD_ARTIFACT_BYTES ||
    typeof value.fileName !== 'string' || !/^[a-zA-Z0-9_-]+\.docx$/.test(value.fileName) ||
    typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || !isRecord(value.format) ||
    (value.caseNumber !== undefined && (typeof value.caseNumber !== 'string' || value.caseNumber.length > 100))) throw new Error('El recibo de Word no es válido.');
  const format = value.format;
  if (typeof format.profile !== 'string' || !(WORD_PROFILE_IDS as readonly string[]).includes(format.profile) ||
    (format.court !== undefined && (typeof format.court !== 'string' || format.court.length > 300 || /[\r\n\t]/.test(format.court))) ||
    !Array.isArray(format.marks) || format.marks.length > MAX_OFFICIAL_MARKS) throw new Error('El formato del recibo de Word no es válido.');
  let end = 0;
  for (const mark of format.marks) {
    if (!isRecord(mark) || typeof mark.start !== 'number' || typeof mark.end !== 'number' || !Number.isSafeInteger(mark.start) || !Number.isSafeInteger(mark.end) ||
      mark.start < end || mark.end <= mark.start || mark.end > 20 * 1024 * 1024 || typeof mark.category !== 'string' ||
      !(OFFICIAL_MARK_CATEGORIES as readonly string[]).includes(mark.category)) throw new Error('El marcado del recibo de Word no es válido.');
    end = mark.end;
  }
  // Source boundaries and Unicode are checked again against the actual source before creating/downloading an artifact.
  return { jobId: value.jobId, artifactId: value.artifactId, sourceHash: value.sourceHash as string, contentHash: value.contentHash as string,
    artifactHash: value.artifactHash as string, reviewHash: value.reviewHash as string, byteLength: value.byteLength,
    fileName: value.fileName, createdAt: value.createdAt, format: canonicalWordFormat(format as unknown as WordFormat),
    ...(value.caseNumber === undefined ? {} : { caseNumber: value.caseNumber as string }) };
}
export function parseRemoteDeletionState(value: unknown): RemoteDeletionState {
  if (!isRecord(value) || !['not_requested', 'pending', 'deleted', 'failed', 'unknown'].includes(String(value.status)) ||
    (value.artifactId !== undefined && !validSha256(value.artifactId)) ||
    (value.updatedAt !== undefined && (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)))) ||
    (value.message !== undefined && (typeof value.message !== 'string' || value.message.length > 500))) throw new Error('El estado del borrado remoto no es válido.');
  return value as unknown as RemoteDeletionState;
}
export function parseTranscriptWordState(value: unknown, jobId: string): TranscriptWordState {
  if (!isRecord(value) || typeof value.fileName !== 'string' || value.fileName.length > 250) throw new Error('El estado de Word no es válido.');
  const artifact = value.artifact === null ? null : parseTranscriptWordReceipt(value.artifact);
  const transcript = parseTranscriptManifest(value.transcript);
  if (artifact && (artifact.jobId !== jobId || artifact.sourceHash !== transcript.sha256)) throw new Error('El artefacto corresponde a otra transcripción.');
  return { artifact, transcript, fileName: value.fileName, remoteDeletion: parseRemoteDeletionState(value.remoteDeletion) };
}
