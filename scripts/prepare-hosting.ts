import { readFile, writeFile, access } from 'node:fs/promises';
import { hostingErrors, prepareHosting } from '../server/config/hosting.js';
const argument = (name: string) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
try {
  if (process.argv.includes('--check')) {
    const config = JSON.parse(await readFile(argument('--config') ?? 'firebase.json', 'utf8'));
    const errors = hostingErrors(config);
    await access('dist/index.html');
    if (errors.length) throw new Error(errors.join('\n') + '\nUsa npm run prepare:hosting -- --service SERVICIO --region REGION.');
    console.log('Hosting preparado: rutas API antes del frontend. El servicio indicado debe existir y estar operativo.');
  } else {
    const service = argument('--service'), region = argument('--region');
    if (!service || !region) throw new Error('Uso: npm run prepare:hosting -- --service SERVICIO_EXISTENTE --region REGION');
    const config = prepareHosting(JSON.parse(await readFile('firebase.json', 'utf8')), service, region);
    await writeFile('.firebase-hosting.generated.json', JSON.stringify(config, null, 2) + '\n');
    console.log('Configuración generada: .firebase-hosting.generated.json. No se crearon servicios ni se desplegó Hosting.');
  }
} catch (error) { console.error(error instanceof Error ? error.message : 'No se pudo preparar Hosting.'); process.exitCode = 1; }
