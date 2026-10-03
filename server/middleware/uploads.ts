import type { RequestHandler } from 'express';
import multer from 'multer';
import path from 'node:path';
import { open, unlink } from 'node:fs/promises';
import { fileTypeFromFile } from 'file-type';
import { RequestError } from './security.js';
import { MAX_MEDIA_BYTES } from '../../shared/transcription.js';

type UploadKind = 'media' | 'zip' | 'csv';
const mediaTypes: Record<string, string[]> = {
  '.mp3': ['audio/mpeg'], '.wav': ['audio/wav', 'audio/x-wav', 'audio/vnd.wave'],
  '.mp4': ['video/mp4'], '.m4a': ['audio/mp4', 'audio/x-m4a'],
  '.webm': ['video/webm', 'audio/webm'], '.ogg': ['audio/ogg', 'video/ogg', 'application/ogg'],
  '.flac': ['audio/flac', 'audio/x-flac'],
};
const uploadTypes = {
  media: mediaTypes,
  zip: { '.zip': ['application/zip', 'application/x-zip-compressed'] },
  csv: { '.csv': ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain'] },
};

/** Restrict metadata AND signatures; MIME and filename alone are untrusted. */
export function createSecureUpload(kind: UploadKind, destination: string, maxBytes: number): RequestHandler {
  const allowed: Record<string, string[]> = uploadTypes[kind];
  const receive = multer({
    dest: destination,
    limits: { fileSize: maxBytes, files: 1, fields: 0, parts: 2, headerPairs: 100 },
    fileFilter: (_req, file, callback) => {
      const types = allowed[path.extname(file.originalname).toLowerCase()];
      if (!types || (!types.includes(file.mimetype) && file.mimetype !== 'application/octet-stream')) {
        callback(new RequestError(415, 'Tipo de archivo no permitido.'));
      } else callback(null, true);
    },
  }).single('file');

  return (req, res, next) => {
    receive(req, res, async error => {
      const cleanup = () => {
        if (req.file) void unlink(req.file.path).catch(() => undefined);
      };
      res.once('finish', cleanup);
      res.once('close', cleanup);
      if (error) { cleanup(); next(error); return; }
      if (!req.file) { next(new RequestError(400, 'Archivo no proporcionado.')); return; }
      try {
        if (req.file.size === 0) throw new RequestError(400, 'El archivo está vacío.');
        if (kind === 'csv') {
          const handle = await open(req.file.path, 'r');
          try {
            const sample = Buffer.alloc(8192);
            const { bytesRead } = await handle.read(sample, 0, sample.length, 0);
            const prefix = sample.subarray(0, bytesRead);
            if (prefix.includes(0) || !prefix.toString('utf8').includes(',') ||
                /^\s*(?:<|\{|\[|MZ|PK)/.test(prefix.toString('utf8'))) {
              throw new RequestError(415, 'Se requiere un CSV de texto separado por comas.');
            }
          } finally { await handle.close(); }
        } else {
          const detected = await fileTypeFromFile(req.file.path).catch(() => undefined);
          const types = allowed[path.extname(req.file.originalname).toLowerCase()];
          if (!detected || !types.includes(detected.mime)) {
            throw new RequestError(415, 'El contenido del archivo no coincide con su formato.');
          }
        }
        if (res.destroyed) { cleanup(); return; }
        next();
      } catch (validationError) { cleanup(); next(validationError); }
    });
  };
}

export const mediaUpload = createSecureUpload('media', 'uploads/', MAX_MEDIA_BYTES);
export const zipUpload = createSecureUpload('zip', 'data/scjn/temp/', 50 * 1024 * 1024);
export const csvUpload = createSecureUpload('csv', 'data/scjn/temp/', 50 * 1024 * 1024);
