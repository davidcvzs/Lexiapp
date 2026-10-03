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

export interface SCJNSearchParams {
  q?: string; registro?: string; epoca?: string; anio?: string; instancia?: string; organo?: string;
  materia?: string; asunto?: string; ponente?: string; tipo?: string; formaIntegracion?: string;
  page?: number; pageSize?: number;
}
export interface SCJNProviderStatus {
  driver: 'sqlite' | 'postgres'; connected: boolean; available: boolean; records: number;
  provider: string; status: 'online' | 'error'; recordCount: number; lastSync?: string | null; error?: string;
}
export interface CatalogItem { id: string | number; description: string; tipo?: number }
export type SCJNCatalogs = Record<'epocas' | 'anios' | 'instancias' | 'organos' | 'materias' | 'asuntos' | 'ponentes' | 'tipos' | 'formasIntegracion', CatalogItem[]>;

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
  search(params: SCJNSearchParams): Promise<SCJNSearchResult>;
  getByRegistroDigital(registro: string): Promise<SCJNTesis | null>;
  saveImportBatch(batch: SCJNImportBatch): Promise<void>;
  getProviderStatus(): Promise<SCJNProviderStatus>;
  getCatalogs(): Promise<SCJNCatalogs>;
  close(): Promise<void>;
}
