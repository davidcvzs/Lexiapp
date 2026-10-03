import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { readFile, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileTypeFromBuffer } from 'file-type';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { RequestError } from '../middleware/security.js';
import AdmZip from 'adm-zip';
import { validateArchive } from '../scjn/archiveSafety.js';
const require = createRequire(import.meta.url);
const extensions = ['.txt', '.docx', '.doc', '.pdf'];
/** Parse locally, never call AI; reject disguised binaries, invalid UTF-8 and empty extraction. */
export async function extractSource(bytes: Buffer, filename: string): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  if (!extensions.includes(ext)) throw new RequestError(415, 'Usa TXT, DOCX, DOC o PDF.');
  let content: string;
  if (ext === '.txt') {
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new RequestError(415, 'El TXT debe usar UTF-8.'); }
    if (bytes.includes(0) || /^[\s\uFEFF]*(?:MZ|%PDF-)/.test(content) || bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 3, 4]))) throw new RequestError(415, 'El archivo no es texto UTF-8.');
  } else {
    const detected = await fileTypeFromBuffer(bytes).catch(() => undefined);
    const expected = ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : ext === '.pdf' ? 'application/pdf' : 'application/msword';
    if (detected?.mime !== expected) throw new RequestError(415, 'El contenido no coincide con el formato.');
    try {
      if (ext === '.docx') {
        const entries = new AdmZip(bytes).getEntries(); validateArchive(entries);
        if (entries.reduce((sum, entry) => sum + entry.header.size, 0) > 20 * 1024 * 1024) throw new RequestError(413, 'El DOCX supera el límite de descompresión.');
        content = (await mammoth.extractRawText({ buffer: bytes })).value;
      }
      else if (ext === '.doc') content = (await new (require('word-extractor'))().extract(bytes)).getBody();
      else { const parser = new PDFParse({ data: bytes }); try { content = (await parser.getText({ pageJoiner: '' })).text; } finally { await parser.destroy(); } }
    } catch (error) { if (error instanceof RequestError) throw error; throw new RequestError(422, 'No se pudo extraer texto de este documento.'); }
  }
  if (!content.trim()) throw new RequestError(422, 'El documento no contiene texto extraíble. Un PDF escaneado requiere OCR.');
  if (content.length > 500_000) throw new RequestError(413, 'El texto supera 500 000 caracteres. Divide la fuente.');
  return content;
}
export function createSourcesRouter(destination = 'uploads/') {
  const router = Router();
  const upload = multer({ dest: destination, limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0, parts: 1 },
    fileFilter: (_req, file, callback) => { if (extensions.includes(path.extname(file.originalname).toLowerCase())) callback(null, true); else callback(new RequestError(415, 'Usa TXT, DOCX, DOC o PDF.')); } }).single('file');
  router.post('/import', (req, res, next) => {
    upload(req, res, error => {
      void (async () => {
        try {
          if (error) throw error;
          if (!req.file || !req.file.size) throw new RequestError(400, 'Aporta un documento con texto.');
          const text = await extractSource(await readFile(req.file.path), req.file.originalname);
          if (!res.destroyed) res.json({ text, filename: path.basename(req.file.originalname) });
        } catch (failure) { if (!res.destroyed) next(failure); }
        finally { if (req.file) await unlink(req.file.path).catch(() => undefined); }
      })();
    });
  });
  return router;
}
