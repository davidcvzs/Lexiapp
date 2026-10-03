import { createApp } from './app.js';
import { loadEnvironment, validateEnvironment } from './config/environment.js';
import { createSCJNRepository } from './scjn/index.js';
import { getApps, deleteApp } from 'firebase-admin/app';

loadEnvironment();
const configuration = validateEnvironment(process.env);
if (configuration.errors.length) throw new Error(configuration.errors.join('\n'));
for (const warning of configuration.warnings) console.warn(`[LexIA] ${warning}`);
const repo = createSCJNRepository();
await repo.init();
const app = createApp({ trustProxyHops: configuration.trustProxyHops });
const server = app.listen(configuration.port, '0.0.0.0', () => {
  console.log(`LexIA: puerto ${configuration.port}, entorno ${process.env.NODE_ENV || 'development'}.`);
});
let stopping = false;
const shutdown = () => {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 10_000).unref();
  server.close(() => {
    void Promise.all([repo.close(), ...getApps().map(deleteApp)]).then(() => { clearTimeout(timeout); process.exit(0); }, () => process.exit(1));
  });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
