import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { ISCJNRepository, SCJNImportBatch, SCJNSearchResult, SCJNTesis } from './types.js';

export class SQLiteSCJNRepository implements ISCJNRepository {
  private db: Database.Database;

  constructor() {
    const dbPath = process.env.SCJN_DB_PATH || path.join(process.cwd(), 'data', 'scjn', 'scjn.db');
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.db = new Database(dbPath);
  }

  async getProviderStatus(): Promise<any> {
    try {
      const row = this.db.prepare('SELECT COUNT(*) as count FROM scjn_tesis').get() as any;
      return {
        driver: 'sqlite',
        connected: true,
        available: true,
        records: row.count,
      };
    } catch (err) {
      return {
        driver: 'sqlite',
        connected: false,
        available: false,
        records: 0,
        error: String(err),
      };
    }
  }

  async init(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scjn_tesis (
        registroDigital TEXT PRIMARY KEY,
        numeroIdentificacion TEXT,
        tesis TEXT,
        rubro TEXT,
        texto TEXT,
        epoca TEXT,
        anio TEXT,
        mes TEXT,
        instancia TEXT,
        organo TEXT,
        materia TEXT,
        tipo TEXT,
        asunto TEXT,
        ponente TEXT,
        formasIntegracion TEXT,
        fuente TEXT,
        localizacion TEXT,
        publicacion TEXT,
        notaPublicacion TEXT,
        precedentes TEXT,
        certificadoDigital TEXT,
        source TEXT,
        importBatchId TEXT,
        importedAt DATETIME,
        lastUpdatedAt DATETIME,
        lastImportBatchId TEXT
      );

      CREATE TABLE IF NOT EXISTS scjn_import_batches (
        id TEXT PRIMARY KEY,
        filename TEXT,
        source TEXT,
        category TEXT,
        importedAt DATETIME,
        rowCount INTEGER,
        insertedCount INTEGER,
        updatedCount INTEGER,
        skippedCount INTEGER,
        csvSha256 TEXT,
        acuseFilename TEXT,
        officialCertificate TEXT,
        notes TEXT
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS scjn_tesis_fts USING fts5(
        registroDigital UNINDEXED,
        rubro,
        texto,
        tesis,
        precedentes,
        content='scjn_tesis',
        content_rowid='rowid'
      );

      CREATE TRIGGER IF NOT EXISTS scjn_tesis_ai AFTER INSERT ON scjn_tesis BEGIN
        INSERT INTO scjn_tesis_fts(rowid, registroDigital, rubro, texto, tesis, precedentes)
        VALUES (new.rowid, new.registroDigital, new.rubro, new.texto, new.tesis, new.precedentes);
      END;

      CREATE TRIGGER IF NOT EXISTS scjn_tesis_ad AFTER DELETE ON scjn_tesis BEGIN
        INSERT INTO scjn_tesis_fts(scjn_tesis_fts, rowid, registroDigital, rubro, texto, tesis, precedentes)
        VALUES ('delete', old.rowid, old.registroDigital, old.rubro, old.texto, old.tesis, old.precedentes);
      END;

      CREATE TRIGGER IF NOT EXISTS scjn_tesis_au AFTER UPDATE ON scjn_tesis BEGIN
        INSERT INTO scjn_tesis_fts(scjn_tesis_fts, rowid, registroDigital, rubro, texto, tesis, precedentes)
        VALUES ('delete', old.rowid, old.registroDigital, old.rubro, old.texto, old.tesis, old.precedentes);
        INSERT INTO scjn_tesis_fts(rowid, registroDigital, rubro, texto, tesis, precedentes)
        VALUES (new.rowid, new.registroDigital, new.rubro, new.texto, new.tesis, new.precedentes);
      END;
    `);
  }

  async upsertTesis(tesis: SCJNTesis): Promise<'INSERTED' | 'UPDATED' | 'SKIPPED'> {
    const existing = this.db.prepare('SELECT rowid, * FROM scjn_tesis WHERE registroDigital = ?').get(tesis.registroDigital) as any;
    
    if (existing) {
      // Very basic diff (could be improved)
      if (existing.rubro !== tesis.rubro || existing.texto !== tesis.texto) {
        const update = this.db.prepare(`
          UPDATE scjn_tesis SET
            tesis = ?, rubro = ?, texto = ?, epoca = ?, anio = ?, mes = ?,
            instancia = ?, organo = ?, materia = ?, tipo = ?, asunto = ?,
            ponente = ?, formasIntegracion = ?, fuente = ?, localizacion = ?,
            publicacion = ?, notaPublicacion = ?, precedentes = ?,
            certificadoDigital = ?, lastUpdatedAt = ?, lastImportBatchId = ?
          WHERE registroDigital = ?
        `);
        update.run(
          tesis.tesis, tesis.rubro, tesis.texto, tesis.epoca, tesis.anio, tesis.mes,
          tesis.instancia, tesis.organo, tesis.materia, tesis.tipo, tesis.asunto,
          tesis.ponente, tesis.formasIntegracion, tesis.fuente, tesis.localizacion,
          tesis.publicacion, tesis.notaPublicacion, tesis.precedentes,
          tesis.certificadoDigital, tesis.lastUpdatedAt, tesis.lastImportBatchId,
          tesis.registroDigital
        );
        return 'UPDATED';
      }
      return 'SKIPPED';
    } else {
      const insert = this.db.prepare(`
        INSERT INTO scjn_tesis (
          registroDigital, numeroIdentificacion, tesis, rubro, texto, epoca, anio, mes,
          instancia, organo, materia, tipo, asunto, ponente, formasIntegracion,
          fuente, localizacion, publicacion, notaPublicacion, precedentes,
          certificadoDigital, source, importBatchId, importedAt
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `);
      insert.run(
        tesis.registroDigital, tesis.numeroIdentificacion, tesis.tesis, tesis.rubro, tesis.texto, tesis.epoca, tesis.anio, tesis.mes,
        tesis.instancia, tesis.organo, tesis.materia, tesis.tipo, tesis.asunto, tesis.ponente, tesis.formasIntegracion,
        tesis.fuente, tesis.localizacion, tesis.publicacion, tesis.notaPublicacion, tesis.precedentes,
        tesis.certificadoDigital, tesis.source, tesis.importBatchId, tesis.importedAt
      );
      return 'INSERTED';
    }
  }

  async saveImportBatch(batch: SCJNImportBatch): Promise<void> {
    const insert = this.db.prepare(`
      INSERT INTO scjn_import_batches (
        id, filename, source, category, importedAt, rowCount, insertedCount, updatedCount, skippedCount, csvSha256, acuseFilename, officialCertificate, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      batch.id, batch.filename, batch.source, batch.category, batch.importedAt, batch.rowCount, batch.insertedCount, batch.updatedCount, batch.skippedCount, batch.csvSha256, batch.acuseFilename, batch.officialCertificate, batch.notes
    );
  }

  async search(params: any): Promise<SCJNSearchResult> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 10;
    const offset = (page - 1) * pageSize;

    let query = 'SELECT t.* FROM scjn_tesis t';
    let countQuery = 'SELECT COUNT(*) as total FROM scjn_tesis t';
    const conditions: string[] = [];
    const values: any[] = [];

    if (params.q) {
      query = 'SELECT t.* FROM scjn_tesis_fts f JOIN scjn_tesis t ON f.rowid = t.rowid';
      countQuery = 'SELECT COUNT(*) as total FROM scjn_tesis_fts f JOIN scjn_tesis t ON f.rowid = t.rowid';
      const matchTerm = params.q.replace(/"/g, '""').trim();
      conditions.push('f.scjn_tesis_fts MATCH ?');
      values.push(`"${matchTerm}"*`); // Simple prefix matching
    }

    if (params.registro) { conditions.push('t.registroDigital = ?'); values.push(params.registro); }
    if (params.epoca) { conditions.push('t.epoca LIKE ?'); values.push(`%${params.epoca}%`); }
    if (params.materia) { conditions.push('t.materia LIKE ?'); values.push(`%${params.materia}%`); }
    if (params.instancia) { conditions.push('t.instancia LIKE ?'); values.push(`%${params.instancia}%`); }
    if (params.organo) { conditions.push('t.organo LIKE ?'); values.push(`%${params.organo}%`); }
    if (params.tipo) { conditions.push('t.tipo LIKE ?'); values.push(`%${params.tipo}%`); }
    if (params.ponente) { conditions.push('t.ponente LIKE ?'); values.push(`%${params.ponente}%`); }
    if (params.asunto) { conditions.push('t.asunto LIKE ?'); values.push(`%${params.asunto}%`); }
    if (params.formaIntegracion) { conditions.push('t.formasIntegracion LIKE ?'); values.push(`%${params.formaIntegracion}%`); }
    if (params.anio) { conditions.push('t.anio = ?'); values.push(params.anio); }

    if (conditions.length > 0) {
      const whereClause = ' WHERE ' + conditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }

    // Default order could be relevance if using FTS, or descending updatedAt
    if (params.q) {
      query += ' ORDER BY rank';
    } else {
      query += ' ORDER BY t.registroDigital DESC';
    }

    query += ' LIMIT ? OFFSET ?';
    values.push(pageSize, offset);

    const totalRow = this.db.prepare(countQuery).get(...values.slice(0, values.length - 2)) as any;
    const total = totalRow.total;

    const data = this.db.prepare(query).all(...values) as SCJNTesis[];

    return { total, data };
  }

  async getByRegistroDigital(registro: string): Promise<SCJNTesis | null> {
    const result = this.db.prepare('SELECT * FROM scjn_tesis WHERE registroDigital = ?').get(registro) as SCJNTesis;
    return result || null;
  }

  async getProviderStatus(): Promise<any> {
    try {
      const row = this.db.prepare("SELECT count(*) as c FROM scjn_tesis").get() as any;
      const batchRow = this.db.prepare("SELECT importedAt FROM scjn_import_batches ORDER BY importedAt DESC LIMIT 1").get() as any;
      return { 
        provider: 'SCJN_LOCAL_INDEX', 
        status: 'online', 
        recordCount: row.c,
        lastSync: batchRow ? batchRow.importedAt : null
      };
    } catch (e: any) {
      return { provider: 'SCJN_LOCAL_INDEX', status: 'error', error: e.message };
    }
  }

  async getCatalogs(): Promise<any> {
    const getDistinct = (field: string) => {
      try {
        const rows = this.db.prepare(`SELECT DISTINCT ${field} as id FROM scjn_tesis WHERE ${field} IS NOT NULL AND ${field} != '' ORDER BY ${field}`).all() as any[];
        return rows.map(r => ({ id: r.id, description: r.id }));
      } catch (e) {
        return [];
      }
    };
    return {
      epocas: getDistinct('epoca'),
      materias: getDistinct('materia'),
      instancias: getDistinct('instancia'),
      organos: getDistinct('organo'),
      tipos: getDistinct('tipo'),
      ponentes: getDistinct('ponente'),
      asuntos: getDistinct('asunto'),
      formasIntegracion: getDistinct('formasIntegracion'),
      anios: getDistinct('anio').sort((a, b) => b.id.localeCompare(a.id))
    };
  }
}
