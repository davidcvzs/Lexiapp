import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import csvParser from 'csv-parser';
import crypto from 'crypto';
import { createSCJNRepository } from './index.js';
import { ISCJNRepository, SCJNImportBatch, SCJNTesis } from './types.js';
import { validateArchive } from './archiveSafety.js';

export class SCJNImportService {
  private repo: ISCJNRepository;

  constructor(repo: ISCJNRepository = createSCJNRepository()) {
    this.repo = repo;
  }

  async processZipFile(zipFilePath: string, originalFilename: string): Promise<SCJNImportBatch> {
    const tempDir = path.join(process.cwd(), 'data', 'scjn', 'temp', crypto.randomUUID());
    fs.mkdirSync(tempDir, { recursive: true });

    let csvFilePath: string | null = null;
    let acuseFilePath: string | null = null;

    try {
      const zip = new AdmZip(zipFilePath);
      const zipEntries = zip.getEntries();
      validateArchive(zipEntries);
      
      // Prevent path traversal and extract
      zipEntries.forEach((entry) => {
        if (entry.isDirectory || entry.entryName.includes('..')) return;
        
        const lowerName = entry.entryName.toLowerCase();
        // Skip executables
        if (lowerName.endsWith('.exe') || lowerName.endsWith('.sh') || lowerName.endsWith('.js')) return;
        
        // Find the CSV
        if (lowerName.endsWith('.csv')) {
          const outPath = path.join(tempDir, entry.entryName);
          zip.extractEntryTo(entry, tempDir, true, true);
          csvFilePath = outPath;
        }
        // Find PDF acuse
        if (lowerName.endsWith('.pdf')) {
          const outPath = path.join(tempDir, entry.entryName);
          zip.extractEntryTo(entry, tempDir, true, true);
          acuseFilePath = outPath;
        }
      });

      if (!csvFilePath) {
        throw new Error('No se encontró un archivo CSV válido dentro del ZIP de la SCJN.');
      }

      return await this.processCsvFile(csvFilePath, originalFilename, acuseFilePath);
      
    } finally {
      // Clean up temp dir
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }
  }

  async processCsvFile(csvFilePath: string, originalFilename: string, acuseFilePath: string | null = null): Promise<SCJNImportBatch> {
    const batchId = crypto.randomUUID();
    const importedAt = new Date().toISOString();
    
    // Calculate SHA-256 of the CSV
    const fileBuffer = fs.readFileSync(csvFilePath);
    const hashSum = crypto.createHash('sha256');
    hashSum.update(fileBuffer);
    const csvSha256 = hashSum.digest('hex');

    // Bound row size and process incrementally instead of retaining every row.
    const source = fs.createReadStream(csvFilePath, { encoding: 'utf-8' });
    const parser = csvParser({ maxRowBytes: 1024 * 1024 });
    source.on('error', error => parser.destroy(error));
    source.pipe(parser);
    try {
          let rowCount = 0;
          let insertedCount = 0;
          let updatedCount = 0;
          let skippedCount = 0;

          // For each row in CSV
          for await (const row of parser) {
            rowCount++;
            // Map known columns - SCJN CSV headers might be capitalized or not
            const rawRegistro = row['Registro digital'] || row['Registro Digital'] || row['registroDigital'];
            
            if (!rawRegistro) {
              skippedCount++;
              continue;
            }

            const tesis: SCJNTesis = {
              registroDigital: rawRegistro.toString().trim(),
              numeroIdentificacion: row['Número de Identificación'] || '',
              tesis: row['Número de Identificación'] || '',
              rubro: row['Rubro (Título / Subtítulo)'] || row['Rubro'] || '',
              texto: row['Texto'] || '',
              epoca: row['Época'] || '',
              anio: row['Año'] || '',
              mes: row['Mes'] || '',
              instancia: row['Instancia'] || '',
              organo: row['Órgano'] || '',
              materia: row['Materia'] || '',
              tipo: row['Tipo de Tesis'] || '',
              localizacion: row['Localización'] || '',
              publicacion: row['Publicación'] || '',
              notaPublicacion: row['Nota de publicación'] || '',
              precedentes: row['Precedentes'] || '',
              certificadoDigital: row['Certificado Digital'] || '',
              source: 'SCJN',
              importBatchId: batchId,
              importedAt: importedAt
            };

            const result = await this.repo.upsertTesis(tesis);
            if (result === 'INSERTED') insertedCount++;
            if (result === 'UPDATED') updatedCount++;
            if (result === 'SKIPPED') skippedCount++;
          }

          const batch: SCJNImportBatch = {
            id: batchId,
            filename: originalFilename,
            source: 'SCJN_DATOS_ABIERTOS',
            category: 'SJF',
            importedAt,
            rowCount,
            insertedCount,
            updatedCount,
            skippedCount,
            csvSha256,
            acuseFilename: acuseFilePath ? path.basename(acuseFilePath) : undefined,
          };

          await this.repo.saveImportBatch(batch);
          return batch;
    } finally {
      source.destroy();
      parser.destroy();
    }
  }
}
