import { abortable, createDeadline } from '../../shared/operations';
import { isRecord } from '../../shared/transcription';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type TokenProvider = (forceRefresh: boolean) => Promise<string>;

async function firebaseToken(forceRefresh: boolean): Promise<string> {
  const { auth } = await import('../config/firebase');
  if (!auth.currentUser) throw new ApiError(401, 'Inicia sesión para continuar.');
  try {
    return await auth.currentUser.getIdToken(forceRefresh);
  } catch {
    throw new ApiError(401, 'No fue posible renovar la sesión. Vuelve a iniciar sesión.');
  }
}

/** Authenticated, same-origin JSON API. Never sends a Firebase token to a provider. */
export class ApiClient {
  private readonly token: TokenProvider;
  private readonly fetcher: typeof fetch;

  /** Inject token/fetch implementations for isolated tests; defaults use Firebase. */
  constructor(token: TokenProvider = firebaseToken, fetcher: typeof fetch = (...args) => fetch(...args)) {
    this.token = token;
    this.fetcher = fetcher;
  }

  /** Fetch JSON with a finite deadline and exactly one token-renewal retry on 401. */
  async request(path: string, options: RequestInit = {}, timeoutMs = 35_000): Promise<unknown> {
    if (!path.startsWith('/api/') || path.includes('\\')) throw new Error('Ruta de API inválida.');
    const deadline = createDeadline(timeoutMs, options.signal ?? undefined);
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        deadline.signal.throwIfAborted();
        const token = await abortable(this.token(attempt === 1), deadline.signal);
        deadline.signal.throwIfAborted();
        const headers = new Headers(options.headers);
        headers.set('Authorization', `Bearer ${token}`);
        let response: Response;
        try {
          response = await abortable(this.fetcher(path, { ...options, headers, signal: deadline.signal }), deadline.signal);
        } catch {
          deadline.signal.throwIfAborted();
          throw new ApiError(0, 'No se pudo conectar con el servidor. Tu contenido se conserva.');
        }
        if (response.status === 401 && attempt === 0) {
          await response.body?.cancel();
          continue;
        }
        const data: unknown = await abortable(response.json(), deadline.signal).catch(() => null);
        deadline.signal.throwIfAborted();
        if (!response.ok) {
          const fallback: Record<number, string> = {
            401: 'La sesión expiró. Vuelve a iniciar sesión.',
            403: 'No tienes permiso para realizar esta operación.',
            404: 'No se encontró el registro solicitado.',
            413: 'El archivo o el contenido supera el tamaño permitido.',
            429: 'Se alcanzó el límite de solicitudes. Espera antes de reintentar.',
            503: 'El servicio no está disponible temporalmente.',
            504: 'El servicio agotó el tiempo de espera. Puedes reintentar.',
          };
          throw new ApiError(response.status, isRecord(data) && typeof data.error === 'string'
            ? data.error : fallback[response.status] || 'No fue posible completar la operación.');
        }
        if (!isRecord(data)) throw new ApiError(502, 'El servidor devolvió una respuesta inválida.');
        return data;
      }
      throw new ApiError(401, 'La sesión expiró. Vuelve a iniciar sesión.');
    } finally { deadline.dispose(); }
  }
}
