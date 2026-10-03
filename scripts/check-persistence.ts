import dotenv from 'dotenv';
import { adminAuth } from '../server/services/firebaseAdmin.js';
import { getApp } from 'firebase-admin/app';

dotenv.config({ path: '.env.local', quiet: true });
// Read database metadata only; no document reads, writes or credentials in output.
try {
  adminAuth();
  const app = getApp();
  const projectId = app.options.projectId;
  if (!projectId || !app.options.credential) throw new Error('Firebase Admin no está configurado.');
  const { access_token } = await app.options.credential.getAccessToken();
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases`, {
    headers: { Authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { details?: { reason?: string }[] } };
    const disabled = body.error?.details?.some(detail => detail.reason === 'SERVICE_DISABLED');
    console.log(disabled ? 'La API de Firestore está deshabilitada en el proyecto configurado. Debe habilitarse para usar la persistencia.'
      : `Consulta de metadatos Firestore: HTTP ${response.status}. No se verificó disponibilidad; revisa los permisos administrativos.`);
    process.exitCode = 1;
  } else {
    const data = await response.json() as { databases?: { name: string; type?: string }[] };
    const defaultDatabase = data.databases?.find(database => database.name.endsWith('/databases/(default)'));
    if (defaultDatabase?.type === 'FIRESTORE_NATIVE') console.log('Firestore (default) disponible. Esta comprobación no verifica índices ni permisos de escritura.');
    else { console.log('No hay una base Firestore nativa (default) disponible. La persistencia requiere provisionarla antes de usar la aplicación.'); process.exitCode = 1; }
  }
} catch { console.log('No se pudo verificar Firestore con las credenciales existentes. No se realizaron escrituras.'); process.exitCode = 1; }
