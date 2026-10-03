import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import * as xlsx from 'xlsx';
import { PDFParse } from 'pdf-parse';
import { createRequire } from 'module';
import { createHash } from 'node:crypto';
import { LEGAL_REFERENCES, LEGAL_TASKS } from '../../shared/legalTasks.js';
import type { ReferenceId } from '../../shared/legalTasks.js';
import { RequestError } from '../middleware/security.js';
const require = createRequire(import.meta.url);

export class KnowledgeService {
  private baseDir: string;

  constructor(baseDir = process.env.KNOWLEDGE_DIR || path.resolve(process.cwd(), 'conocimiento')) {
    this.baseDir = baseDir;
  }

  public getManifest(mode: string): string[] {
    const task = LEGAL_TASKS.find(item => item.id === mode);
    return task ? task.formats[0].references.map(id => LEGAL_REFERENCES[id].file) : [];
  }

  /** Resolve only catalog identifiers; required examples must exist and contain readable text. */
  public async readReferences(ids: readonly ReferenceId[]): Promise<{ id: ReferenceId; filename: string; content: string; sha256: string; bytes: Buffer }[]> {
    const results = [];
    for (const id of ids) {
      if (!Object.hasOwn(LEGAL_REFERENCES, id)) throw new RequestError(400, 'Referencia desconocida.');
      const filename = LEGAL_REFERENCES[id].file;
      try {
        const bytes = fs.readFileSync(path.join(this.baseDir, filename));
        const [reference] = await this.readFiles([filename]);
        if (!reference?.content.trim() || !bytes.equals(fs.readFileSync(path.join(this.baseDir, filename)))) throw new Error('Referencia vacía o modificada durante la lectura.');
        results.push({ id, ...reference, bytes, sha256: createHash('sha256').update(bytes).digest('hex') });
      } catch { throw new RequestError(503, `Referencia ausente o ilegible: ${filename}.`); }
    }
    return results;
  }

  public async readFiles(files: string[]): Promise<{ filename: string, content: string }[]> {
    const results = [];
    for (const file of files) {
      const fullPath = path.join(this.baseDir, file);
      if (!fs.existsSync(fullPath)) continue;

      const ext = path.extname(file).toLowerCase();
      try {
        let content = '';
        if (ext === '.docx') {
          const result = await mammoth.extractRawText({ path: fullPath });
          content = result.value;
        } else if (ext === '.doc') {
          const WordExtractor = require('word-extractor');
          const extractor = new WordExtractor();
          const extracted = await extractor.extract(fullPath);
          content = extracted.getBody();
        } else if (ext === '.xlsx') {
          const workbook = xlsx.read(fs.readFileSync(fullPath));
          const sheetsData = workbook.SheetNames.map((name: string) => {
            const sheet = workbook.Sheets[name];
            return `--- Hoja: ${name} ---\n` + xlsx.utils.sheet_to_csv(sheet);
          });
          content = sheetsData.join('\n\n');
        } else if (ext === '.txt') {
          content = fs.readFileSync(fullPath, 'utf-8');
        } else if (ext === '.pdf') {
          const buffer = fs.readFileSync(fullPath);
          const parser = new PDFParse({ data: buffer });
          try { content = (await parser.getText({ pageJoiner: '' })).text; }
          finally { await parser.destroy(); }
        }

        results.push({ filename: file, content: content.trim() });
      } catch {
        // Never log private document text or parser diagnostics.
      }
    }
    return results;
  }

  public async getKnowledgeText(mode: string): Promise<string> {
    const files = this.getManifest(mode);
    if (files.length === 0) return '';
    const task = LEGAL_TASKS.find(item => item.id === mode);
    const readContents = await this.readReferences(task?.formats[0].references ?? []);
    return readContents.map(r => `[ARCHIVO: ${r.filename}]\n${r.content}`).join('\n\n');
  }

  public async queryDirectoryExcel(query: string, snapshot?: Buffer): Promise<Record<string, unknown>[]> {
    const filePath = path.join(this.baseDir, 'DIRECTORIO REQUERIMIENTOS ACTALIZADO 25-02-26.xlsx');
    if (!snapshot && !fs.existsSync(filePath)) throw new Error('Excel no encontrado');
    const workbook = xlsx.read(snapshot ?? fs.readFileSync(filePath));
    const allData: Record<string, unknown>[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet);
      rows.forEach(r => allData.push({ Hoja: sheetName, ...r }));
    }
    
    const terms = query.trim().toLowerCase().split(/\s+/);
    const results = allData.filter(row => {
      const rowText = JSON.stringify(row).toLowerCase();
      return terms.every(term => rowText.includes(term));
    });

    return results;
  }
}
