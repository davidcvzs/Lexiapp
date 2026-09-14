export type SourceType = 'CRITERIO_JUDICIAL' | 'CRITERIO_RELEVANTE';

export interface PJENLCriterion {
  id: number;
  registro: string;
  rubro: string;
  tesis: string;
  textoPlain: string | null;
  textoHtml: string | null;
  instancia: string | null;
  instanciaId: number | null;
  materia: string | null;
  materiaId: number | null;
  ponente: string | null;
  ponenteId: number | null;
  tipo: string | null;
  tipoId: number | null;
  fechaEmision: string | null;
  hasVotes: boolean;
  votos: any[];
  ejecutorias: any[];
  sentenciasPublicas: string | null;
  sourceType: SourceType;
  institution: string;
  officialUrl: string;
}

export interface PJENLCatalogs {
  instancias: { id: number; name: string }[];
  materias: { id: number; name: string }[];
  ponentes: { id: number; name: string }[];
  tipos: { id: number; name: string }[];
  source: string;
}

export interface PJENLSearchRequest {
  q?: string;
  registro?: string;
  instanciaId?: number;
  materiaId?: number;
  ponenteId?: number;
  tipoId?: number;
  conVotos?: boolean;
  pagina?: number;
  pageSize?: number;
}

export interface PJENLSearchResponse {
  total: number;
  page: number;
  pageSize: number;
  results: PJENLCriterion[];
}

