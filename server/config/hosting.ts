import { isRecord } from '../../shared/transcription.js';

/** Verify API rewrites precede the SPA fallback; static-only Hosting cannot serve this application. */
export function hostingErrors(value: unknown): string[] {
  if (!isRecord(value) || !isRecord(value.hosting) || !Array.isArray(value.hosting.rewrites)) return ['Configuración Hosting inválida.'];
  const rules = value.hosting.rewrites;
  const fallback = rules.findIndex(rule => isRecord(rule) && rule.source === '**');
  const errors: string[] = [];
  for (const source of ['/api', '/api/**']) {
    const index = rules.findIndex(rule => isRecord(rule) && rule.source === source && isRecord(rule.run) &&
      typeof rule.run.serviceId === 'string' && /^[a-z][a-z0-9-]{0,62}$/.test(rule.run.serviceId) &&
      typeof rule.run.region === 'string' && /^[a-z]+-[a-z]+\d+$/.test(rule.run.region));
    if (index < 0 || (fallback >= 0 && index > fallback)) errors.push(`Falta la reescritura ${source} a Cloud Run antes del frontend.`);
  }
  return errors;
}

export function prepareHosting<T>(value: T, service: string, region: string) {
  if (!isRecord(value) || !isRecord(value.hosting)) throw new Error('Configuración Hosting inválida.');
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(service) || service.endsWith('-') || !/^[a-z]+-[a-z]+\d+$/.test(region)) throw new Error('Indica un servicio Cloud Run y una región válidos.');
  const existing = Array.isArray(value.hosting.rewrites) ? value.hosting.rewrites.filter(rule => isRecord(rule) && !['/api', '/api/**', '**'].includes(String(rule.source))) : [];
  return { ...value, hosting: { ...value.hosting,
    predeploy: ['npm run check:hosting -- --config .firebase-hosting.generated.json'],
    rewrites: [{ source: '/api', run: { serviceId: service, region } }, { source: '/api/**', run: { serviceId: service, region } }, ...existing, { source: '**', destination: '/index.html' }] } };
}
