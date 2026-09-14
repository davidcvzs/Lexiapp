import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const xlsx = require('xlsx');
const pdfParse = require('pdf-parse');

export class KnowledgeService {
  private baseDir: string;

  constructor() {
    this.baseDir = path.resolve(process.cwd(), 'Conocimiento');
  }

  public getManifest(mode: string): string[] {
    switch (mode) {
      case 'TRANSCRIPCION':
        return ['647-2.docx'];
      case 'DECLARACION':
        return ['DINAMICA DE TRABAJO GPT.docx'];
      case 'HECHOS_DATOS':
        return ['1095-26-HECHOS Y DATOS.docx'];
      case 'ORDEN_APREHENSION':
        return ['RESOLUCIONES ORDENES DE APREHENSION.doc', 'O.A POR ESCRITO YA VINCULADO.doc'];
      case 'CATEO':
        return ['FORMATO CATEO NARCO - copia.docx', 'Cateo Desaparición.doc', 'ACTA CATEO AUD.doc'];
      case 'ACUERDO':
        return ['ACUERDO-FECHAS-VARIOS 1.docx', 'ATENCION MEDICA.docx'];
      case 'OFICIO':
        return ['OF TRASLADOS.doc'];
      case 'AMPARO':
        return ['SUSPENSION DE PLANO 1.docx'];
      case 'SEDES':
        return ['SEDES PALACIOS DE JUSTICIA.docx'];
      case 'DIRECTORIO':
        return ['DIRECTORIO REQUERIMIENTOS ACTALIZADO 25-02-26.xlsx'];
      case 'ACTA':
        return [];
      default:
        return [];
    }
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
          const workbook = xlsx.readFile(fullPath);
          const sheetsData = workbook.SheetNames.map(name => {
            const sheet = workbook.Sheets[name];
            return `--- Hoja: ${name} ---\n` + xlsx.utils.sheet_to_csv(sheet);
          });
          content = sheetsData.join('\n\n');
        } else if (ext === '.txt') {
          content = fs.readFileSync(fullPath, 'utf-8');
        } else if (ext === '.pdf') {
          const buffer = fs.readFileSync(fullPath);
          const data = await pdfParse(buffer);
          content = data.text;
        }

        results.push({ filename: file, content: content.trim() });
      } catch (err) {
        console.error(`Error al leer archivo ${file}:`, err);
      }
    }
    return results;
  }

  public async getKnowledgeText(mode: string): Promise<string> {
    const files = this.getManifest(mode);
    if (files.length === 0) return '';
    const readContents = await this.readFiles(files);
    return readContents.map(r => `[ARCHIVO: ${r.filename}]\n${r.content}`).join('\n\n');
  }

  public async queryDirectoryExcel(query: string): Promise<any> {
    const filePath = path.join(this.baseDir, 'DIRECTORIO REQUERIMIENTOS ACTALIZADO 25-02-26.xlsx');
    if (!fs.existsSync(filePath)) throw new Error('Excel no encontrado');
    const workbook = xlsx.readFile(filePath);
    let allData: any[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet);
      rows.forEach((r: any) => allData.push({ Hoja: sheetName, ...r }));
    }
    
    const terms = query.toLowerCase().split(' ');
    const results = allData.filter(row => {
      const rowText = JSON.stringify(row).toLowerCase();
      return terms.every(term => rowText.includes(term));
    });

    return results;
  }
}
