import type { Response } from 'express';
import { createDeadline } from '../../shared/operations.js';

/** Stop an upstream HTTP request when its browser connection closes or time runs out. */
export function providerRequest(res: Response, timeoutMs: number) {
  const controller = new AbortController();
  const closed = () => { if (!res.writableEnded) controller.abort(); };
  res.once('close', closed);
  const deadline = createDeadline(timeoutMs, controller.signal);
  return {
    signal: deadline.signal,
    dispose: () => { deadline.dispose(); res.removeListener('close', closed); },
  };
}
