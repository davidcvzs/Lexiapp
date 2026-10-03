import path from 'node:path';
import type AdmZip from 'adm-zip';
import { RequestError } from '../middleware/security.js';

/** Check declared sizes before decompression; reject unsafe archive paths. */
export function validateArchive(entries: AdmZip.IZipEntry[]) {
  if (entries.length > 1000) throw new RequestError(413, 'El ZIP contiene demasiados archivos.');
  let expandedBytes = 0;
  for (const entry of entries) {
    const name = entry.entryName.replace(/\\/g, '/');
    if (path.posix.isAbsolute(name) || /^[a-z]:/i.test(name) || name.split('/').includes('..')) {
      throw new RequestError(400, 'El ZIP contiene rutas no permitidas.');
    }
    expandedBytes += entry.header.size;
    if (entry.header.size > 50 * 1024 * 1024 || expandedBytes > 200 * 1024 * 1024) {
      throw new RequestError(413, 'El ZIP supera el límite de descompresión.');
    }
    if (entry.header.size > 1024 * 1024 && entry.header.size / Math.max(1, entry.header.compressedSize) > 200) {
      throw new RequestError(413, 'La compresión del ZIP supera el límite permitido.');
    }
  }
}
