import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

export interface SCJNSearchParams {
  q?: string;
  registro?: string;
  epoca?: string;
  instancia?: string;
  materia?: string;
  tipo?: string;
  page?: number;
  pageSize?: number;
}

export class SCJNLocalIndexProvider {
  private db: Database.Database;

  constructor(dbPath: string = path.join(process.cwd(), 'scjn_index.db')) {
    const dbExists = fs.existsSync(dbPath);
    this.db = new Database(dbPath);
    
    if (!dbExists) {
      this.initDatabase();
    }
  }

  private initDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tesis (
        registroDigital TEXT PRIMARY KEY,
        tesis TEXT,
        rubro TEXT,
        texto TEXT,
        epoca TEXT,
        instancia TEXT,
        organo TEXT,
        materia TEXT,
        tipo TEXT,
        fuente TEXT,
        publicacion TEXT,
        precedentes TEXT,
        ponente TEXT,
        sourceUrl TEXT,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS tesis_fts USING fts5(
        registroDigital UNINDEXED,
        rubro,
        texto,
        materia,
        epoca,
        instancia,
        tipo,
        content='tesis',
        content_rowid='rowid'
      );

      -- Triggers to keep FTS table in sync
      CREATE TRIGGER IF NOT EXISTS tesis_ai AFTER INSERT ON tesis BEGIN
        INSERT INTO tesis_fts(rowid, registroDigital, rubro, texto, materia, epoca, instancia, tipo)
        VALUES (new.rowid, new.registroDigital, new.rubro, new.texto, new.materia, new.epoca, new.instancia, new.tipo);
      END;

      CREATE TRIGGER IF NOT EXISTS tesis_ad AFTER DELETE ON tesis BEGIN
        INSERT INTO tesis_fts(tesis_fts, rowid, registroDigital, rubro, texto, materia, epoca, instancia, tipo)
        VALUES ('delete', old.rowid, old.registroDigital, old.rubro, old.texto, old.materia, old.epoca, old.instancia, old.tipo);
      END;

      CREATE TRIGGER IF NOT EXISTS tesis_au AFTER UPDATE ON tesis BEGIN
        INSERT INTO tesis_fts(tesis_fts, rowid, registroDigital, rubro, texto, materia, epoca, instancia, tipo)
        VALUES ('delete', old.rowid, old.registroDigital, old.rubro, old.texto, old.materia, old.epoca, old.instancia, old.tipo);
        INSERT INTO tesis_fts(rowid, registroDigital, rubro, texto, materia, epoca, instancia, tipo)
        VALUES (new.rowid, new.registroDigital, new.rubro, new.texto, new.materia, new.epoca, new.instancia, new.tipo);
      END;
    `);

    // Insert dummy data for testing since sync from CSV requires a local CSV file
    this.insertDummyData();
  }

  private insertDummyData() {
    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO tesis 
      (registroDigital, tesis, rubro, texto, epoca, instancia, organo, materia, tipo, fuente, sourceUrl)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      '2026569',
      '1a./J. 1/2023 (11a.)',
      'PRESUNCIÓN DE INOCENCIA. CONCEPTO Y ALCANCE.',
      'La presunción de inocencia es un derecho humano que se traduce en que nadie puede ser condenado...',
      'Undécima Época',
      'Primera Sala',
      'SCJN',
      'Penal',
      'Jurisprudencia',
      'Semanario Judicial de la Federación',
      'https://sjfsemanal.scjn.gob.mx/detalle/tesis/2026569'
    );
  }

  async health() {
    try {
      const row = this.db.prepare("SELECT count(*) as c FROM tesis").get() as any;
      return { status: 'ok', provider: 'SCJN_LOCAL_INDEX', recordCount: row.c };
    } catch (e: any) {
      return { status: 'error', error: e.message };
    }
  }

  async search(params: SCJNSearchParams) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 10;
    const offset = (page - 1) * pageSize;

    let query = 'SELECT t.* FROM tesis t';
    let countQuery = 'SELECT COUNT(*) as total FROM tesis t';
    const conditions: string[] = [];
    const values: any[] = [];
    
    // We use FTS if there is a text query
    if (params.q) {
      query = 'SELECT t.* FROM tesis_fts f JOIN tesis t ON f.rowid = t.rowid';
      countQuery = 'SELECT COUNT(*) as total FROM tesis_fts f JOIN tesis t ON f.rowid = t.rowid';
      // simple match, appending * for prefix
      const matchTerm = params.q.replace(/"/g, '""').trim();
      conditions.push('f.tesis_fts MATCH ?');
      values.push(`"${matchTerm}"*`);
    }

    if (params.registro) {
      conditions.push('t.registroDigital = ?');
      values.push(params.registro);
    }
    if (params.epoca) {
      conditions.push('t.epoca LIKE ?');
      values.push(`%${params.epoca}%`);
    }
    if (params.instancia) {
      conditions.push('t.instancia LIKE ?');
      values.push(`%${params.instancia}%`);
    }
    if (params.materia) {
      conditions.push('t.materia LIKE ?');
      values.push(`%${params.materia}%`);
    }
    if (params.tipo) {
      conditions.push('t.tipo LIKE ?');
      values.push(`%${params.tipo}%`);
    }

    if (conditions.length > 0) {
      const whereClause = ' WHERE ' + conditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }

    query += ' LIMIT ? OFFSET ?';
    values.push(pageSize, offset);

    const totalRow = this.db.prepare(countQuery).get(...values.slice(0, values.length - 2)) as any;
    const total = totalRow.total;

    const results = this.db.prepare(query).all(...values) as any[];

    // Map to API format
    return {
      total,
      data: results.map(r => ({
        registroDigital: r.registroDigital,
        tesis: r.tesis,
        rubro: r.rubro,
        texto: r.texto,
        epoca: r.epoca,
        instancia: r.instancia,
        materia: r.materia,
        tipo: r.tipo,
        source: 'SCJN',
        sourceSystem: 'SJF',
        sourceType: 'OpenData',
        officialUrl: r.sourceUrl
      }))
    };
  }

  async getByRegistro(registro: string) {
    const row = this.db.prepare('SELECT * FROM tesis WHERE registroDigital = ?').get(registro) as any;
    if (!row) {
      throw new Error(`Registro ${registro} no encontrado en índice local.`);
    }
    return {
      registroDigital: row.registroDigital,
      tesis: row.tesis,
      rubro: row.rubro,
      texto: row.texto,
      epoca: row.epoca,
      instancia: row.instancia,
      materia: row.materia,
      tipo: row.tipo,
      fuente: row.fuente,
      publicacion: row.publicacion,
      precedentes: row.precedentes,
      ponente: row.ponente,
      source: 'SCJN',
      sourceSystem: 'SJF',
      sourceType: 'OpenData',
      officialUrl: row.sourceUrl
    };
  }
}
