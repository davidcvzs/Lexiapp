/** A deadline shared by browser requests and server-side provider calls. */
export class OperationTimeoutError extends Error {
  constructor(message = 'Se agotó el tiempo de espera. Puedes volver a intentarlo.') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function createDeadline(timeoutMs: number, parent?: AbortSignal) {
  const controller = new AbortController();
  const forward = () => controller.abort(parent?.reason);
  if (parent?.aborted) forward();
  else parent?.addEventListener('abort', forward, { once: true });
  const timer = setTimeout(() => controller.abort(new OperationTimeoutError()), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener('abort', forward);
    },
  };
}

/** Also bounds promises that do not themselves support AbortSignal (token refresh). */
export function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) { promise.catch(() => undefined); abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export function waitFor(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
