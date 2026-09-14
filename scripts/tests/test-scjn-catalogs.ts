import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import https from 'https';

const parser = new XMLParser({
  ignoreAttributes: false,
  parseAttributeValue: true,
});

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function testEpocas() {
  console.log('--- TEST OBTENER EPOCAS ---');
  const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ObtenerEpocas xmlns="http://sjf.scjn.gob.mx/" />
  </soap:Body>
</soap:Envelope>`;

  try {
    const res = await axios.post('https://sjf.scjn.gob.mx/sjfsem/Servicios/Semanario.asmx', xmlRequest, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://sjf.scjn.gob.mx/ObtenerEpocas',
      },
      httpsAgent
    });
    console.dir(parser.parse(res.data), { depth: null });
  } catch (err: any) {
    console.error('Error in ObtenerEpocas:', err.message);
  }
}

async function testFiltros(url: string, session: string) {
  console.log(`--- TEST OBTENER FILTROS (Url: ${url}, Session: ${session}) ---`);
  const xmlRequest = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ObtenerFiltros xmlns="http://sjf.scjn.gob.mx/">
      <Url>${url}</Url>
      <Session>${session}</Session>
    </ObtenerFiltros>
  </soap:Body>
</soap:Envelope>`;

  try {
    const res = await axios.post('https://sjf.scjn.gob.mx/sjfsem/Servicios/wsFiltrosLocal.asmx', xmlRequest, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': 'http://sjf.scjn.gob.mx/ObtenerFiltros',
      },
      httpsAgent
    });
    console.dir(parser.parse(res.data), { depth: null });
  } catch (err: any) {
    console.error('Error in ObtenerFiltros:', err.message);
  }
}

async function run() {
  await testEpocas();
  await testFiltros('', '');
}

run();
