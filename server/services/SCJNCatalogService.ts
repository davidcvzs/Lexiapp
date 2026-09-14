import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';

export class SCJNCatalogService {
  private parser = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: true,
  });

  private cache = new Map<string, { value: any, expiry: number }>();
  // Default TTL: 6 hours
  private TTL = 6 * 60 * 60 * 1000;

  private async fetchSoap(url: string, action: string, xmlRequest: string) {
    const res = await axios.post(url, xmlRequest, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': action,
      },
      timeout: 10000,
    });
    return this.parser.parse(res.data);
  }

  async getEpocas() {
    const cacheKey = 'epocas';
    if (this.isCached(cacheKey)) return this.cache.get(cacheKey)!.value;

    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ObtenerEpocas xmlns="http://sjf.scjn.gob.mx/" />
  </soap:Body>
</soap:Envelope>`;

    try {
      const parsedXml = await this.fetchSoap(
        'https://sjf.scjn.gob.mx/sjfsem/Servicios/Semanario.asmx',
        'http://sjf.scjn.gob.mx/ObtenerEpocas',
        xmlRequest
      );
      
      const results = this.extractNodes(parsedXml, 'ObtenerEpocasResponse', 'ObtenerEpocasResult', 'Catalogo');
      
      const epocas = results.map((item: any) => ({
        id: parseInt(item.Id, 10),
        description: item.Descripcion || ''
      })).filter((item: any) => !isNaN(item.id));

      this.setCache(cacheKey, epocas);
      return epocas;
    } catch (error) {
      console.error('Error fetching Epocas:', error);
      throw new Error('No se pudo obtener el catálogo de Épocas');
    }
  }

  async getFiltros(url: string = '', session: string = '') {
    const cacheKey = `filtros_${url}_${session}`;
    if (this.isCached(cacheKey)) return this.cache.get(cacheKey)!.value;

    const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ObtenerFiltros xmlns="http://sjf.scjn.gob.mx/">
      <Url>${this.escapeXml(url)}</Url>
      <Session>${this.escapeXml(session)}</Session>
    </ObtenerFiltros>
  </soap:Body>
</soap:Envelope>`;

    try {
      const parsedXml = await this.fetchSoap(
        'https://sjf.scjn.gob.mx/sjfsem/Servicios/wsFiltrosLocal.asmx',
        'http://sjf.scjn.gob.mx/ObtenerFiltros',
        xmlRequest
      );

      const results = this.extractNodes(parsedXml, 'ObtenerFiltrosResponse', 'ObtenerFiltrosResult', 'CatalogoBE');

      const filtros = results.map((item: any) => ({
        id: parseInt(item.Id, 10),
        description: item.Descripcion || '',
        tipo: parseInt(item.Tipo, 10)
      })).filter((item: any) => !isNaN(item.id));

      this.setCache(cacheKey, filtros);
      return filtros;
    } catch (error) {
      console.error('Error fetching Filtros:', error);
      throw new Error('No se pudieron obtener los filtros de SCJN');
    }
  }

  async getAllCatalogs() {
    try {
      // Intenta obtener épocas. Para materias, instancias y tipos usamos la operación genérica.
      const [epocas, filtros] = await Promise.all([
        this.getEpocas().catch(() => []),
        this.getFiltros().catch(() => [])
      ]);

      // Tipo 1: Materia? Tipo 2: Instancia? Tipo 3: Tipo de Tesis?
      // Esto es una conjetura inicial basada en catálogos típicos. 
      // Cuando el usuario lo pruebe, verá exactamente qué IDs de tipo devuelven qué listas.
      const materias = filtros.filter((f: any) => f.tipo === 1);
      const instancias = filtros.filter((f: any) => f.tipo === 2);
      const tiposTesis = filtros.filter((f: any) => f.tipo === 3);

      return {
        epocas,
        materias,
        instancias,
        tiposTesis,
        rawFiltros: filtros, // Enviamos el crudo por si los tipos no coinciden con la conjetura
        source: 'SCJN/SJF'
      };
    } catch (error) {
      throw error;
    }
  }

  clearCache() {
    this.cache.clear();
  }

  private isCached(key: string) {
    const item = this.cache.get(key);
    if (!item) return false;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  private setCache(key: string, value: any) {
    this.cache.set(key, { value, expiry: Date.now() + this.TTL });
  }

  private extractNodes(parsedXml: any, responseName: string, resultName: string, itemName: string) {
    const body = parsedXml['soap:Envelope']?.['soap:Body'] || parsedXml['soapenv:Envelope']?.['soapenv:Body'];
    const responseNode = body?.[responseName];
    const resultNode = responseNode?.[resultName];
    
    if (resultNode && resultNode[itemName]) {
      let items = resultNode[itemName];
      return Array.isArray(items) ? items : [items];
    }
    return [];
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
