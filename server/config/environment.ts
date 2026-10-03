import dotenv from 'dotenv';
export type Environment = Record<string, string | undefined>;
export const loadEnvironment = () => dotenv.config({ path: ['.env.local', '.env'], quiet: true });
export const configured = (value: string | undefined) => !!value?.trim() && !/FALTANTE|VALOR|missing|placeholder|YOUR_/i.test(value);

/** Validate structure without printing credentials or making provider calls. */
export function validateEnvironment(env: Environment) {
  const errors: string[] = [], warnings: string[] = [];
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('PORT debe ser un puerto entre 1 y 65535.');
  const trustProxyHops = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) errors.push('TRUST_PROXY_HOPS debe estar entre 0 y 5.');
  if (env.APP_ORIGIN) {
    try {
      const origin = new URL(env.APP_ORIGIN);
      if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== env.APP_ORIGIN || origin.username || origin.password) throw new Error();
      if (env.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error();
    } catch { errors.push('APP_ORIGIN debe ser un origen válido sin ruta; en producción debe usar HTTPS.'); }
  }
  const driver = env.SCJN_DB_DRIVER || 'sqlite';
  if (!['sqlite', 'postgres'].includes(driver)) errors.push('SCJN_DB_DRIVER debe ser sqlite o postgres.');
  const project = env.FIREBASE_ADMIN_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || env.VITE_FIREBASE_PROJECT_ID;
  if (!configured(project)) errors.push('Falta el identificador de proyecto de Firebase para el servidor.');
  if (env.VITE_FIREBASE_PROJECT_ID && project !== env.VITE_FIREBASE_PROJECT_ID) errors.push('Los proyectos de Firebase del cliente y servidor no coinciden.');
  if (!!env.FIREBASE_ADMIN_CLIENT_EMAIL !== !!env.FIREBASE_ADMIN_PRIVATE_KEY) errors.push('La credencial Firebase requiere CLIENT_EMAIL y PRIVATE_KEY juntos, o identidad del servicio.');
  if (env.FIREBASE_ADMIN_PRIVATE_KEY && !env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n').includes('-----BEGIN PRIVATE KEY-----')) errors.push('FIREBASE_ADMIN_PRIVATE_KEY no tiene formato PEM.');
  if (driver === 'postgres' && (!env.DB_NAME || !env.DB_USER || (!env.DB_HOST && !env.INSTANCE_CONNECTION_NAME))) errors.push('PostgreSQL requiere DB_NAME, DB_USER y DB_HOST o INSTANCE_CONNECTION_NAME.');
  const aiProvider = env.AI_PROVIDER?.trim() || 'openai';
  if (!['openai', 'gemini'].includes(aiProvider)) errors.push('AI_PROVIDER debe ser openai o gemini.');
  const generationConfigured = aiProvider === 'gemini' ? configured(env.GEMINI_API_KEY) : aiProvider === 'openai' && configured(env.OPENAI_API_KEY);
  if (!generationConfigured && ['openai', 'gemini'].includes(aiProvider)) warnings.push(`${aiProvider === 'gemini' ? 'Gemini' : 'OpenAI'} no configurado; generación no disponible.`);
  let workerConfigured = configured(env.CLOUDFLARE_WORKER_URL) && (configured(env.CLOUDFLARE_BACKEND_SECRET) || configured(env.CLOUDFLARE_TRANSCRIPTION_SECRET));
  try { workerConfigured &&= ['http:', 'https:'].includes(new URL(env.CLOUDFLARE_WORKER_URL!).protocol); }
  catch { workerConfigured = false; }
  if (!workerConfigured) warnings.push('Worker no configurado; transcripción no disponible.');
  if (env.CLOUDFLARE_DIRECT_UPLOAD_ENABLED !== undefined && !['true', 'false'].includes(env.CLOUDFLARE_DIRECT_UPLOAD_ENABLED)) errors.push('CLOUDFLARE_DIRECT_UPLOAD_ENABLED debe ser true o false.');
  if (env.CLOUDFLARE_DIRECT_UPLOAD_ENABLED === 'true' && (!workerConfigured || !configured(env.CLOUDFLARE_BACKEND_SECRET))) errors.push('La carga directa requiere Worker y CLOUDFLARE_BACKEND_SECRET configurados.');
  return { errors, warnings, port, trustProxyHops, project, driver, workerConfigured, aiProvider, generationConfigured };
}
export function validateFrontendEnvironment(env: Environment): string[] {
  return ['VITE_FIREBASE_API_KEY', 'VITE_FIREBASE_AUTH_DOMAIN', 'VITE_FIREBASE_PROJECT_ID'].filter(key => !configured(env[key])).map(key => `Falta ${key} para compilar el frontend.`);
}
