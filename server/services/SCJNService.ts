import axios from 'axios';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export interface SCJNSearchParams {
  q?: string;
  registro?: string;
  epoca?: string;
  instancia?: string;
  materia?: string;
  tipo?: string;
  ponente?: string;
  page?: number;
  pageSize?: number;
}

export interface SCJNProvider {
  search(params: SCJNSearchParams): Promise<any>;
  getDetail(registro: string): Promise<any>;
}

export class SJFSoapProvider implements SCJNProvider {
  private parser = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: true,
  });

  async search(params: SCJNSearchParams): Promise<any> {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const startRowIndex = (page - 1) * pageSize;
    
    // Check if we are searching by registro directly
    if (params.registro) {
      // Searching by exact ID
      const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ObtenerResultados xmlns="http://sjf.scjn.gob.mx/">
      <parametros>
        <SoloIds>false</SoloIds>
        <TesisIDs>${params.registro}</TesisIDs>
        <Expresion></Expresion>
        <FTExpresion></FTExpresion>
        <Dominio>Rubro,Texto,Precedentes,Localizacion</Dominio>
        <TATJ>0</TATJ>
        <OrdenadoPor>Rubro</OrdenadoPor>
        <IDPonente>0</IDPonente>
        <IDAsunto>0</IDAsunto>
        <IDTipoTesis>0</IDTipoTesis>
        <IDCircuito>0</IDCircuito>
        <startRowIndex>0</startRowIndex>
        <maximumRows>1</maximumRows>
        <Desde>1917</Desde>
        <Hasta>2026</Hasta>
        <IDInstancia>0</IDInstancia>
        <Epoca>0</Epoca>
        <Anio>0</Anio>
        <Mes>0</Mes>
        <IdEpoca>0</IdEpoca>
        <IdMateria>0</IdMateria>
        <IdTcc>0</IdTcc>
      </parametros>
    </ObtenerResultados>
  </soap:Body>
</soap:Envelope>`;

      try {
        const response = await axios.post(
          'https://sjf.scjn.gob.mx/sjfsem/Servicios/wsResultados.asmx',
          xmlRequest,
          {
            headers: {
              'Content-Type': 'text/xml; charset=utf-8',
              'SOAPAction': 'http://sjf.scjn.gob.mx/ObtenerResultados',
            },
            timeout: 10000, // 10 seconds timeout
          }
        );

        const result = this.parser.parse(response.data);
        return this.normalizeSearchResults(result, page, pageSize);
      } catch (error) {
        console.error('Error querying SJF:', error);
        throw new Error('El servicio del Semanario Judicial de la Federación no está disponible temporalmente.');
      }
    }

    // Normal text search
    const query = params.q || '';
    
    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ObtenerResultados xmlns="http://sjf.scjn.gob.mx/">
      <parametros>
        <SoloIds>false</SoloIds>
        <TesisIDs></TesisIDs>
        <Expresion>${this.escapeXml(query)}</Expresion>
        <FTExpresion>${this.escapeXml(query)}</FTExpresion>
        <Dominio>Rubro,Texto,Precedentes,Localizacion</Dominio>
        <TATJ>2</TATJ>
        <OrdenadoPor>Rubro</OrdenadoPor>
        <IDPonente>0</IDPonente>
        <IDAsunto>0</IDAsunto>
        <IDTipoTesis>${params.tipo ? parseInt(params.tipo, 10) : 0}</IDTipoTesis>
        <IDCircuito>0</IDCircuito>
        <startRowIndex>${startRowIndex}</startRowIndex>
        <maximumRows>${pageSize}</maximumRows>
        <Desde>1917</Desde>
        <Hasta>2026</Hasta>
        <IDInstancia>${params.instancia ? parseInt(params.instancia, 10) : 0}</IDInstancia>
        <Epoca>0</Epoca>
        <Anio>0</Anio>
        <Mes>0</Mes>
        <IdEpoca>${params.epoca ? parseInt(params.epoca, 10) : 0}</IdEpoca>
        <IdMateria>${params.materia ? parseInt(params.materia, 10) : 0}</IdMateria>
        <IdTcc>0</IdTcc>
      </parametros>
    </ObtenerResultados>
  </soap:Body>
</soap:Envelope>`;

    try {
      const response = await axios.post(
        'https://sjf.scjn.gob.mx/sjfsem/Servicios/wsResultados.asmx',
        xmlRequest,
        {
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': 'http://sjf.scjn.gob.mx/ObtenerResultados',
          },
          timeout: 10000,
        }
      );

      const result = this.parser.parse(response.data);
      return this.normalizeSearchResults(result, page, pageSize);
    } catch (error) {
      console.error('Error querying SJF:', error);
      throw new Error('El servicio del Semanario Judicial de la Federación no está disponible temporalmente.');
    }
  }

  async getDetail(registro: string): Promise<any> {
    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ObtenerDetalle xmlns="http://sjf.scjn.gob.mx/">
      <registroDigital>${registro}</registroDigital>
    </ObtenerDetalle>
  </soap:Body>
</soap:Envelope>`;

    try {
      const response = await axios.post(
        'https://sjf.scjn.gob.mx/sjfsem/Servicios/wsTesis.asmx',
        xmlRequest,
        {
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': 'http://sjf.scjn.gob.mx/ObtenerDetalle',
          },
          timeout: 10000,
        }
      );

      const result = this.parser.parse(response.data);
      return this.normalizeDetailResult(result);
    } catch (error) {
      console.error('Error fetching detail from SJF:', error);
      throw new Error('El servicio del Semanario Judicial de la Federación no está disponible temporalmente.');
    }
  }

  private normalizeSearchResults(parsedXml: any, page: number, pageSize: number) {
    try {
      const body = parsedXml['soap:Envelope']?.['soap:Body'] || parsedXml['soapenv:Envelope']?.['soapenv:Body'];
      const responseNode = body?.['ObtenerResultadosResponse'];
      const resultNode = responseNode?.['ObtenerResultadosResult'];
      
      let rawResults: any[] = [];
      let total = 0;

      if (resultNode) {
        if (resultNode.Resultados) {
           let items = resultNode.Resultados.Tesis || [];
           if (!Array.isArray(items)) {
              items = [items];
           }
           rawResults = items;
           total = parseInt(resultNode.Total || items.length, 10);
        } else {
           let items = resultNode;
           if (!Array.isArray(items)) {
             items = [items];
           }
           rawResults = items;
           total = items.length;
        }
      }

      const normalized = rawResults.map((item: any) => ({
        registroDigital: item.Registro || item.RegistroDigital || '',
        tesis: item.Tesis || item.Clave || '',
        rubro: item.Rubro || '',
        localizacion: item.Localizacion || '',
        tipoTesis: item.TipoTesis || item.Tipo || '',
        contradiccion: item.Contradiccion === 'true' || item.Contradiccion === true,
        source: 'SCJN/SJF'
      }));

      return {
        total,
        page,
        pageSize,
        results: normalized
      };
    } catch (error) {
      console.error('Error parsing search results:', error);
      return { total: 0, page, pageSize, results: [] };
    }
  }

  private normalizeDetailResult(parsedXml: any) {
    try {
      const body = parsedXml['soap:Envelope']?.['soap:Body'] || parsedXml['soapenv:Envelope']?.['soapenv:Body'];
      const responseNode = body?.['ObtenerDetalleResponse'];
      const resultNode = responseNode?.['ObtenerDetalleResult'];

      if (!resultNode) {
        return null;
      }

      const item = resultNode;
      return {
        registroDigital: item.Registro || item.RegistroDigital || '',
        tesis: item.Tesis || item.Clave || '',
        rubro: item.Rubro || '',
        texto: item.Texto || '',
        epoca: item.Epoca || '',
        tipoTesis: item.TipoTesis || item.Tipo || '',
        instancia: item.Instancia || '',
        tribunal: item.Tribunal || '',
        materia: item.Materia || '',
        localizacion: item.Localizacion || '',
        fechaPublicacion: item.FechaPublicacion || '',
        fuente: item.Fuente || '',
        precedentes: item.Precedentes || '',
        votos: item.Votos || '',
        ejecutorias: item.Ejecutorias || '',
        rutaPdf: item.RutaPdf || '',
        source: 'SCJN/SJF'
      };
    } catch (error) {
      console.error('Error parsing detail result:', error);
      return null;
    }
  }

  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case "'": return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }
}

// Basic in-memory cache
class Cache<T> {
  private store = new Map<string, { value: T, expiry: number }>();

  set(key: string, value: T, ttlMs: number) {
    this.store.set(key, { value, expiry: Date.now() + ttlMs });
  }

  get(key: string): T | null {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }
}

export class SCJNService {
  private provider: SCJNProvider;
  private searchCache = new Cache<any>();
  private detailCache = new Cache<any>();

  constructor(provider?: SCJNProvider) {
    this.provider = provider || new SJFSoapProvider();
  }

  async search(params: SCJNSearchParams): Promise<any> {
    const cacheKey = JSON.stringify(params);
    const cached = this.searchCache.get(cacheKey);
    if (cached) return cached;

    const result = await this.provider.search(params);
    this.searchCache.set(cacheKey, result, 10 * 60 * 1000); // 10 minutes TTL
    return result;
  }

  async getDetail(registro: string): Promise<any> {
    const cached = this.detailCache.get(registro);
    if (cached) return cached;

    const result = await this.provider.getDetail(registro);
    this.detailCache.set(registro, result, 60 * 60 * 1000); // 60 minutes TTL
    return result;
  }
}
