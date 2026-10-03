import { ApiClient } from './ApiClient';
import { isRecord } from '../../shared/transcription';
import { parseSavedDocument } from '../../shared/documents';
import type { DocumentDraft, SavedDocument, DocumentSummary, DocumentVersion } from '../../shared/documents';

/** Persistence of documentState and its associated case, always through the owner-checked API. */
export class DatabaseService {
  private readonly api: ApiClient;
  /** Inject a transport for tests; production uses the current Firebase session. */
  constructor(api = new ApiClient()) { this.api = api; }

  /** List the current owner's documents, optionally after a previous page cursor. */
  async list(after?: string, signal?: AbortSignal): Promise<{ documents: DocumentSummary[]; nextCursor: string | null }> {
    const data = await this.api.request('/api/documents' + (after ? `?after=${encodeURIComponent(after)}` : ''), { signal });
    if (!isRecord(data) || !Array.isArray(data.documents)) throw new Error('Lista de documentos inválida.');
    return data as unknown as { documents: DocumentSummary[]; nextCursor: string | null };
  }
  /** Recover the saved documentState, including sources and audit checks. */
  async get(id: string, signal?: AbortSignal): Promise<SavedDocument> {
    const data = await this.api.request(`/api/documents/${encodeURIComponent(id)}`, { signal });
    return parseSavedDocument(isRecord(data) ? data.document : null);
  }
  /** Save a complete snapshot against its known revision; return the confirmed revision. */
  async save(id: string, draft: DocumentDraft, revision: number, signal?: AbortSignal): Promise<SavedDocument> {
    const data = await this.api.request(`/api/documents/${encodeURIComponent(id)}`, {
      method: 'PUT', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft, revision }),
    });
    return parseSavedDocument(isRecord(data) ? data.document : null);
  }
  /** List immutable version metadata without downloading legal sources for every version. */
  async versions(id: string, before?: number): Promise<{ versions: DocumentVersion[]; nextCursor: number | null }> {
    const data = await this.api.request(`/api/documents/${encodeURIComponent(id)}/versions` + (before ? `?before=${before}` : ''));
    if (!isRecord(data) || !Array.isArray(data.versions)) throw new Error('Historial inválido.');
    return data as unknown as { versions: DocumentVersion[]; nextCursor: number | null };
  }
  /** Retrieve a historical snapshot; restoring it creates a new revision on the next save. */
  async version(id: string, revision: number): Promise<SavedDocument> {
    const data = await this.api.request(`/api/documents/${encodeURIComponent(id)}/versions/${revision}`);
    return parseSavedDocument(isRecord(data) ? data.document : null);
  }
  /** Delete the owner's document, all its versions and its associated case. */
  async delete(id: string): Promise<void> {
    await this.api.request(`/api/documents/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}
