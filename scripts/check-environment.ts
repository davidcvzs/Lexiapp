import { loadEnvironment, validateEnvironment, validateFrontendEnvironment } from '../server/config/environment.js';
loadEnvironment();
const result = validateEnvironment(process.env);
const errors = [...result.errors, ...validateFrontendEnvironment(process.env)];
for (const error of errors) console.error(error);
for (const warning of result.warnings) console.warn(warning);
if (errors.length) process.exitCode = 1;
else console.log('Configuración estructural válida. No se probaron saldo, credenciales ni conectividad con proveedores.');
