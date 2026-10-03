import { abortable, createDeadline } from '../../shared/operations.js';
import { isRecord } from '../../shared/transcription.js';
import { RequestError } from '../middleware/security.js';

export interface TextGenerator {
  generate(instructions: string, input: string, options?: { signal?: AbortSignal }): Promise<string>;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const MAX_GEMINI_RESPONSE_BYTES = 8 * 1024 * 1024;
export const MAX_GEMINI_OUTPUT_CHARACTERS = 500_000;
const MAX_GEMINI_REQUEST_BYTES = 8 * 1024 * 1024;
const MAX_GEMINI_OUTPUT_BYTES = 2 * 1024 * 1024;
const encoder = new TextEncoder();
const refusalReasons = new Set(['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY']);
const incomplete = () => new RequestError(502, 'Gemini no completó una respuesta válida. El borrador anterior se conserva.');
const refused = () => new RequestError(422, 'Gemini no pudo completar esta solicitud. Revisa la instrucción; el borrador se conserva.');

function blockedRatings(value: unknown): boolean {
  if (value === undefined) return false;
  if (!Array.isArray(value) || value.some(rating => !isRecord(rating) || (rating.blocked !== undefined && typeof rating.blocked !== 'boolean'))) {
    throw incomplete();
  }
  return value.some(rating => isRecord(rating) && rating.blocked === true);
}

/** Accept one stopped text candidate, excluding thought parts without changing the visible text. */
export function completedGeminiText(payload: unknown): string {
  if (!isRecord(payload) || payload.error !== undefined) throw incomplete();
  if (payload.promptFeedback !== undefined) {
    if (!isRecord(payload.promptFeedback)) throw incomplete();
    const reason = payload.promptFeedback.blockReason;
    if (reason !== undefined && typeof reason !== 'string') throw incomplete();
    if ((typeof reason === 'string' && reason !== 'BLOCK_REASON_UNSPECIFIED') || blockedRatings(payload.promptFeedback.safetyRatings)) throw refused();
  }
  if (!Array.isArray(payload.candidates) || payload.candidates.length !== 1 || !isRecord(payload.candidates[0])) throw incomplete();
  const candidate = payload.candidates[0];
  if (refusalReasons.has(String(candidate.finishReason)) || blockedRatings(candidate.safetyRatings)) throw refused();
  if (candidate.finishReason !== 'STOP' || (candidate.index !== undefined && candidate.index !== 0)
    || !isRecord(candidate.content) || (candidate.content.role !== undefined && candidate.content.role !== 'model')
    || !Array.isArray(candidate.content.parts) || candidate.content.parts.length === 0) throw incomplete();
  const texts: string[] = [];
  for (const part of candidate.content.parts) {
    if (!isRecord(part) || typeof part.text !== 'string' || (part.thought !== undefined && typeof part.thought !== 'boolean')
      || Object.keys(part).some(key => !['text', 'thought', 'thoughtSignature'].includes(key))) throw incomplete();
    if (part.thought !== true) texts.push(part.text);
  }
  const text = texts.join('');
  if (!text.trim()) throw incomplete();
  if (text.length > MAX_GEMINI_OUTPUT_CHARACTERS || encoder.encode(text).byteLength > MAX_GEMINI_OUTPUT_BYTES) {
    throw new RequestError(502, 'La respuesta de Gemini supera el límite del redactor. Divide el apartado; no se truncó el texto.');
  }
  return text;
}

/** REST text adapter: the server supplies exact instructions and context, with no provider fallback. */
export class GeminiService implements TextGenerator {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: { apiKey?: string; model?: string; fetcher?: typeof fetch; timeoutMs?: number } = {}) {
    this.apiKey = options.apiKey ?? process.env.GEMINI_API_KEY ?? '';
    this.model = options.model ?? process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  /** Make one bounded request; incomplete, filtered and failed output never becomes document text. */
  async generate(instructions: string, input: string, options: { signal?: AbortSignal } = {}): Promise<string> {
    options.signal?.throwIfAborted();
    if (!this.apiKey || /\s|FALTANTE|missing|placeholder|YOUR_API_KEY|changeme/i.test(this.apiKey)
      || !/^gemini-[a-z0-9][a-z0-9._-]{0,99}$/.test(this.model)
      || !Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new RequestError(503, 'Gemini requiere una clave y un modelo válidos configurados en el servidor.');
    }
    if (typeof instructions !== 'string' || !instructions.trim() || typeof input !== 'string' || !input.trim()) {
      throw new RequestError(400, 'Gemini requiere instrucciones y contexto no vacíos.');
    }
    const body = JSON.stringify({ systemInstruction: { parts: [{ text: instructions }] },
      contents: [{ role: 'user', parts: [{ text: input }] }] });
    if (encoder.encode(body).byteLength > MAX_GEMINI_REQUEST_BYTES) {
      throw new RequestError(413, 'El contexto de Gemini supera el tamaño permitido. Divide el apartado; no se truncó la fuente.');
    }
    const operation = createDeadline(this.timeoutMs, options.signal);
    try {
      let response: Response;
      try {
        response = await abortable(this.fetcher('https://generativelanguage.googleapis.com/v1beta/models/' + this.model + ':generateContent', {
          method: 'POST', redirect: 'error', signal: operation.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': this.apiKey }, body,
        }), operation.signal);
      } catch {
        operation.signal.throwIfAborted();
        throw new RequestError(502, 'No fue posible conectar con Gemini. El borrador anterior se conserva.');
      }
      if (!response.ok) {
        void response.body?.cancel().catch(() => undefined);
        if (response.status === 429) throw new RequestError(429, 'Gemini alcanzó su límite o cuota disponible. Revisa la cuota del proyecto antes de reintentar.');
        if ([401, 403, 404].includes(response.status)) throw new RequestError(503, 'La clave o el modelo de Gemini no están disponibles para este proyecto. Revisa la configuración del servidor.');
        if (response.status === 400) throw new RequestError(422, 'Gemini no aceptó esta solicitud. Revisa la instrucción y el tamaño del contexto; el borrador se conserva.');
        throw new RequestError(response.status >= 500 ? 503 : 502, 'Gemini no pudo completar la operación. El borrador anterior se conserva.');
      }
      const reader = response.body?.getReader();
      const chunks: Uint8Array[] = []; let byteCount = 0;
      try {
        if (!reader) throw incomplete();
        while (true) {
          const result = await abortable(reader.read(), operation.signal);
          if (result.done) break;
          byteCount += result.value.byteLength;
          if (byteCount > MAX_GEMINI_RESPONSE_BYTES) throw new RequestError(502, 'La respuesta de Gemini supera el tamaño permitido. El borrador anterior se conserva.');
          chunks.push(result.value);
        }
      } catch (error) {
        void reader?.cancel().catch(() => undefined);
        operation.signal.throwIfAborted();
        if (error instanceof RequestError) throw error;
        throw incomplete();
      } finally { reader?.releaseLock(); }
      operation.signal.throwIfAborted();
      const bytes = new Uint8Array(byteCount); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      let payload: unknown;
      try { payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { throw incomplete(); }
      return completedGeminiText(payload);
    } finally { operation.dispose(); }
  }
}
