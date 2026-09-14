export interface SCJNTesis {
  id?: string;
  registroDigital: string;
  numeroIdentificacion?: string; // Tesis
  tesis?: string;
  rubro?: string;
  texto?: string;
  epoca?: string;
  anio?: string;
  mes?: string;
  instancia?: string;
  organo?: string;
  materia?: string;
  tipo?: string;
  asunto?: string;
  ponente?: string;
  formasIntegracion?: string;
  fuente?: string;
  localizacion?: string;
  publicacion?: string;
  notaPublicacion?: string;
  precedentes?: string;
  certificadoDigital?: string;
  source: string;
  importBatchId?: string;
  importedAt?: string;
  lastUpdatedAt?: string;
  lastImportBatchId?: string;
}

export interface SCJNSearchResult {
  total: number;
  data: SCJNTesis[];
}

export interface SCJNImportBatch {
  id: string;
  filename: string;
  source: string;
  category: string;
  importedAt: string;
  rowCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  csvSha256: string;
  acuseFilename?: string;
  officialCertificate?: string;
  notes?: string;
}

export interface ISCJNRepository {
  init(): Promise<void>;
  upsertTesis(tesis: SCJNTesis): Promise<'INSERTED' | 'UPDATED' | 'SKIPPED'>;
  search(params: any): Promise<SCJNSearchResult>;
  getByRegistroDigital(registro: string): Promise<SCJNTesis | null>;
  saveImportBatch(batch: SCJNImportBatch): Promise<void>;
  getProviderStatus(): Promise<any>;
  getCatalogs(): Promise<any>;
}
