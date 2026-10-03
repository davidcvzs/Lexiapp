import type { ErrorRequestHandler } from 'express';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { MulterError } from 'multer';
import { OperationTimeoutError } from '../../shared/operations.js';

/** Per-process limits; use verified UID, never a client-supplied identity header. */
export function createRequestLimit(limit: number, windowMs: number, perUser = true) {
  return rateLimit({
    limit, windowMs,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: req => perUser && req.user
      ? `user:${req.user.uid}`
      : ipKeyGenerator(req.ip || req.socket.remoteAddress || 'unknown'),
    message: { error: 'Demasiadas solicitudes. Intenta nuevamente más tarde.' },
  });
}

export const apiLimit = createRequestLimit(300, 60_000, false);
export const aiLimit = createRequestLimit(20, 15 * 60_000);
export const transcriptionUploadLimit = createRequestLimit(5, 15 * 60_000);
export const transcriptionPollLimit = createRequestLimit(60, 60_000);
export const importLimit = createRequestLimit(3, 15 * 60_000);

export class RequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** JSON errors without stack traces, file paths or credentials. */
export const securityErrorHandler: ErrorRequestHandler = (error, _req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof OperationTimeoutError) {
    res.status(504).json({ error: 'El servicio agotó el tiempo de espera. Tu contenido se conserva.' });
  } else if (error instanceof RequestError) {
    res.status(error.status).json({ error: error.message });
  } else if (error instanceof MulterError) {
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({
      error: error.code === 'LIMIT_FILE_SIZE'
        ? 'El archivo supera el tamaño permitido.'
        : 'Carga inválida. Envía un único archivo en el campo file.',
    });
  } else if (error?.type === 'entity.too.large') {
    res.status(413).json({ error: 'La solicitud supera el tamaño permitido.' });
  } else if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'El contenido JSON no es válido.' });
  } else if ([5, 7, 9, 14, 16].includes(error?.code)) {
    res.status(503).json({ error: 'No se pudo acceder al almacenamiento. El contenido local se conserva; informa al administrador si el problema continúa.' });
  } else {
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
};
