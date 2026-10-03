import { ApiClient } from './ApiClient';
import { isRecord } from '../../shared/transcription';
/** Import document text into a chosen source slot; the server extracts locally without generating content. */
export class SourceImportService {
  private readonly api: ApiClient;
  /** Use the authenticated same-origin transport or a provided transport for testing. */
  constructor(api = new ApiClient()) { this.api = api; }
  /** Accept TXT/DOC/DOCX/PDF up to 10 MiB; return original extracted text and a filename, or throw. */
  async import(file: File, signal?: AbortSignal): Promise<{ text: string; filename: string }> {
    if (!/\.(txt|docx?|pdf)$/i.test(file.name) || !file.size || file.size > 10 * 1024 * 1024) throw new Error('Aporta un TXT, DOCX, DOC o PDF de hasta 10 MiB.');
    const body = new FormData(); body.set('file', file);
    const response = await this.api.request('/api/sources/import', { method: 'POST', body, signal }, 60_000);
    if (!isRecord(response) || typeof response.text !== 'string' || !response.text.trim() || response.text.length > 500_000 || typeof response.filename !== 'string') throw new Error('La fuente no contiene texto válido.');
    return { text: response.text, filename: response.filename };
  }
}
