import pkg from 'pg';
const { Pool } = pkg;
import { ISCJNRepository, SCJNImportBatch, SCJNSearchResult, SCJNTesis } from './types.js';

export class PostgresSCJNRepository implements ISCJNRepository {
  private pool: pkg.Pool;

  constructor() {
    const config: pkg.PoolConfig = {};
    if (process.env.INSTANCE_CONNECTION_NAME) {
      config.host = `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}`;
    } else if (process.env.DB_HOST) {
      config.host = process.env.DB_HOST;
      config.port = parseInt(process.env.DB_PORT || '5432');
    }
    config.database = process.env.DB_NAME || 'lexia';
    config.user = process.env.DB_USER || 'lexia_app';
    config.password = process.env.DB_PASSWORD;

    this.pool = new Pool(config);
  }

  async init(): Promise<void> {
    // Migrations are handled externally. We just verify connection.
    const client = await this.pool.connect();
    client.release();
  }

  async getProviderStatus(): Promise<any> {
    try {
      const res = await this.pool.query('SELECT COUNT(*) as count FROM scjn_tesis');
      return {
        driver: 'postgres',
        connected: true,
        available: true,
        records: parseInt(res.rows[0].count, 10),
      };
    } catch (err) {
      return {
        driver: 'postgres',
        connected: false,
        available: false,
        records: 0,
        error: String(err),
      };
    }
  }

  async getCatalogs(): Promise<any> {
    const catalogs = {
      epocas: await this.getDistinct('epoca'),
      anios: await this.getDistinct('anio'),
      instancias: await this.getDistinct('instancia'),
      organos: await this.getDistinct('organo'),
      materias: await this.getDistinct('materia'),
      asuntos: await this.getDistinct('asunto'),
      ponentes: await this.getDistinct('ponente'),
      tipos: await this.getDistinct('tipo'),
      formasIntegracion: await this.getDistinct('formas_integracion'),
    };
    return catalogs;
  }

  private async getDistinct(field: string): Promise<string[]> {
    const res = await this.pool.query(`SELECT DISTINCT ${field} as val FROM scjn_tesis WHERE ${field} IS NOT NULL ORDER BY val ASC`);
    return res.rows.map(r => r.val).filter(Boolean);
  }

  async getByRegistroDigital(registro: string): Promise<SCJNTesis | null> {
    const res = await this.pool.query('SELECT * FROM scjn_tesis WHERE registro_digital = $1', [registro]);
    if (res.rows.length === 0) return null;
    return this.mapRowToTesis(res.rows[0]);
  }

  async saveImportBatch(batch: SCJNImportBatch): Promise<void> {
    await this.pool.query(`
      INSERT INTO scjn_import_batches (
        id, filename, source, category, imported_at, row_count, inserted_count, updated_count, skipped_count,
        csv_sha256, acuse_filename, official_certificate, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    `, [
      batch.id, batch.filename, batch.source, batch.category, batch.importedAt, batch.rowCount,
      batch.insertedCount, batch.updatedCount, batch.skippedCount, batch.csvSha256,
      batch.acuseFilename, batch.officialCertificate, batch.notes
    ]);
  }

  async search(params: any): Promise<SCJNSearchResult> {
    const page = parseInt(params.page || '1');
    const pageSize = parseInt(params.pageSize || '10');
    const offset = (page - 1) * pageSize;

    let conditions: string[] = [];
    let values: any[] = [];
    let idx = 1;

    if (params.q) {
      // PostgreSQL full-text search with plainto_tsquery
      conditions.push(`search_vector @@ plainto_tsquery('spanish', $${idx})`);
      values.push(params.q);
      idx++;
    }

    const filters: Record<string, string> = {
      registro: 'registro_digital',
      epoca: 'epoca',
      anio: 'anio',
      instancia: 'instancia',
      organo: 'organo',
      materia: 'materia',
      asunto: 'asunto',
      ponente: 'ponente',
      tipo: 'tipo',
      formaIntegracion: 'formas_integracion',
    };

    for (const [key, field] of Object.entries(filters)) {
      if (params[key]) {
        conditions.push(`${field} = $${idx}`);
        values.push(params[key]);
        idx++;
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Count
    const countRes = await this.pool.query(`SELECT COUNT(*) as total FROM scjn_tesis ${whereClause}`, values);
    const total = parseInt(countRes.rows[0].total, 10);

    // Data
    const dataRes = await this.pool.query(`
      SELECT * FROM scjn_tesis 
      ${whereClause} 
      ORDER BY registro_digital DESC 
      LIMIT $${idx} OFFSET $${idx + 1}
    `, [...values, pageSize, offset]);

    return {
      total,
      data: dataRes.rows.map(r => this.mapRowToTesis(r)),
    };
  }

  async upsertTesis(tesis: SCJNTesis): Promise<'INSERTED' | 'UPDATED' | 'SKIPPED'> {
    const current = await this.getByRegistroDigital(tesis.registroDigital);
    
    if (current) {
      const isIdentical = 
        current.rubro === tesis.rubro &&
        current.texto === tesis.texto &&
        current.tesis === tesis.tesis &&
        current.precedentes === tesis.precedentes; // basic identical check
      
      if (isIdentical) return 'SKIPPED';
    }

    await this.pool.query(`
      INSERT INTO scjn_tesis (
        registro_digital, numero_identificacion, tesis, rubro, texto, epoca, anio, mes, instancia, organo,
        materia, tipo, asunto, ponente, formas_integracion, fuente, localizacion, publicacion, nota_publicacion,
        precedentes, certificado_digital, source, import_batch_id, imported_at, last_updated_at, last_import_batch_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
      )
      ON CONFLICT (registro_digital) DO UPDATE SET
        numero_identificacion = EXCLUDED.numero_identificacion,
        tesis = EXCLUDED.tesis,
        rubro = EXCLUDED.rubro,
        texto = EXCLUDED.texto,
        epoca = EXCLUDED.epoca,
        anio = EXCLUDED.anio,
        mes = EXCLUDED.mes,
        instancia = EXCLUDED.instancia,
        organo = EXCLUDED.organo,
        materia = EXCLUDED.materia,
        tipo = EXCLUDED.tipo,
        asunto = EXCLUDED.asunto,
        ponente = EXCLUDED.ponente,
        formas_integracion = EXCLUDED.formas_integracion,
        fuente = EXCLUDED.fuente,
        localizacion = EXCLUDED.localizacion,
        publicacion = EXCLUDED.publicacion,
        nota_publicacion = EXCLUDED.nota_publicacion,
        precedentes = EXCLUDED.precedentes,
        certificado_digital = EXCLUDED.certificado_digital,
        last_updated_at = EXCLUDED.last_updated_at,
        last_import_batch_id = EXCLUDED.last_import_batch_id,
        search_vector = to_tsvector('spanish', coalesce(EXCLUDED.rubro, '') || ' ' || coalesce(EXCLUDED.texto, '') || ' ' || coalesce(EXCLUDED.tesis, '') || ' ' || coalesce(EXCLUDED.precedentes, ''))
    `, [
      tesis.registroDigital, tesis.numeroIdentificacion, tesis.tesis, tesis.rubro, tesis.texto, tesis.epoca,
      tesis.anio, tesis.mes, tesis.instancia, tesis.organo, tesis.materia, tesis.tipo, tesis.asunto, tesis.ponente,
      tesis.formasIntegracion, tesis.fuente, tesis.localizacion, tesis.publicacion, tesis.notaPublicacion,
      tesis.precedentes, tesis.certificadoDigital, tesis.source, tesis.importBatchId, tesis.importedAt,
      tesis.lastUpdatedAt, tesis.lastImportBatchId
    ]);

    return current ? 'UPDATED' : 'INSERTED';
  }

  private mapRowToTesis(row: any): SCJNTesis {
    return {
      registroDigital: row.registro_digital,
      numeroIdentificacion: row.numero_identificacion,
      tesis: row.tesis,
      rubro: row.rubro,
      texto: row.texto,
      epoca: row.epoca,
      anio: row.anio,
      mes: row.mes,
      instancia: row.instancia,
      organo: row.organo,
      materia: row.materia,
      tipo: row.tipo,
      asunto: row.asunto,
      ponente: row.ponente,
      formasIntegracion: row.formas_integracion,
      fuente: row.fuente,
      localizacion: row.localizacion,
      publicacion: row.publicacion,
      notaPublicacion: row.nota_publicacion,
      precedentes: row.precedentes,
      certificadoDigital: row.certificado_digital,
      source: row.source,
      importBatchId: row.import_batch_id,
      importedAt: row.imported_at ? new Date(row.imported_at).toISOString() : undefined,
      lastUpdatedAt: row.last_updated_at ? new Date(row.last_updated_at).toISOString() : undefined,
      lastImportBatchId: row.last_import_batch_id,
    };
  }
}
