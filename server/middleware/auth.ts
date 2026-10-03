import type { RequestHandler } from 'express';
import { adminAuth } from '../services/firebaseAdmin.js';
import type { DecodedIdToken } from 'firebase-admin/auth';

declare module 'express-serve-static-core' {
  interface Request {
    user?: DecodedIdToken;
  }
}

type TokenVerifier = (token: string) => Promise<DecodedIdToken>;

/** Verify Firebase tokens, including disabled users and revoked sessions. */
export function createAuthMiddleware(
  verify: TokenVerifier = token => adminAuth().verifyIdToken(token, true),
): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '');
    if (!match) {
      res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
      return;
    }
    try {
      req.user = await verify(match[1]);
      next();
    } catch {
      res.status(401).json({ error: 'Token inválido, revocado o expirado.' });
    }
  };
}

export const requireAuth = createAuthMiddleware();

/** Only a boolean custom claim issued by Firebase Admin grants this privilege. */
export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.user) {
    res.status(401).json({ error: 'Autenticación requerida.' });
  } else if (req.user.admin !== true) {
    res.status(403).json({ error: 'Se requieren permisos de administrador.' });
  } else {
    next();
  }
};
