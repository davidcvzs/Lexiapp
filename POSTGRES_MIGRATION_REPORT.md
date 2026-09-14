# Reporte de Migración a PostgreSQL y Cloud Run

Este documento detalla el estado del refactor realizado para soportar la arquitectura de producción mediante Firebase Hosting, Cloud Run, y Cloud SQL PostgreSQL.

## Resumen de Cambios Arquitectónicos

### 1. Interfaz `ISCJNRepository` (✅)
Se extrajo exitosamente la interfaz abstracta del repositorio en `types.ts`, encapsulando los siguientes contratos requeridos por el servicio y UI:
- `init()`
- `getCatalogs()`
- `search(params)`
- `getByRegistroDigital(registro)`
- `upsertTesis(tesis)`
- `getProviderStatus()`

### 2. Provider Local: `SQLiteSCJNRepository` (✅)
- Sigue siendo la opción predeterminada (`SCJN_DB_DRIVER=sqlite`).
- Se le añadió la implementación de `getProviderStatus()`.
- Todas las pruebas locales reafirman que su comportamiento no se ha visto alterado. Sigue utilizando `better-sqlite3` y la búsqueda `fts5`.

### 3. Provider Producción: `PostgresSCJNRepository` (🟡)
- Implementado utilizando la librería estándar `pg`.
- Utiliza Connection Pooling y abstrae la inicialización.
- Detecta automáticamente entornos Cloud Run inyectando `/cloudsql/${INSTANCE_CONNECTION_NAME}`.
- Implementación de la tabla `scjn_tesis` y `scjn_import_batches` asegurando que todos los campos del TypeScript model correspondan 1:1.
- **Estado**: Implementado en código y preparado; pendiente ejecución en infraestructura remota.

### 4. Factory Method (✅)
- Un Singleton Factory Method `createSCJNRepository()` fue creado en `server/scjn/index.ts`.
- Esto elimina dependencias estrictas a SQLite de `SCJNImportService`, `SCJNLocalIndexProvider`, y las rutas de Express.

### 5. Full-Text Search en PostgreSQL (🟡)
- La búsqueda FTS se diseñó empleando `tsvector` y un índice `GIN`.
- Migración versionada (`001_initial_postgres.sql`) que genera la columna virtual `search_vector` dinámicamente con soporte multi-columna (`rubro`, `texto`, `tesis`, `precedentes`).
- Uso del comando `plainto_tsquery('spanish', ...)` mapeado automáticamente desde el input `q` del frontend.
- **Estado**: Implementado en código, pendiente evaluación contra PostgreSQL remoto.

### 6. UPSERT en PostgreSQL (🟡)
- Implementación usando `INSERT ... ON CONFLICT (registro_digital) DO UPDATE`.
- Las rutinas de `insertedCount`, `updatedCount` y `skippedCount` de los batches permanecen exactas sin contar falsos positivos gracias a una comprobación previa de integridad o la sobreescritura natural transaccional.

### 7. Endpoints & API Health (✅)
- `/api/health` ha sido actualizado para arrojar `driver`, `connected`, `available`, y `records`. Oculta exitosamente todos los secretos.
- Ningún endpoint ha cambiado de firma. La API de React sigue consumiendo idéntico formato (`GET /api/scjn/catalogs`, `GET /api/scjn/search`).

### 8. Integración con Firebase Hosting (✅)
- `firebase.json` está listo con las reglas `rewrite` priorizando `/api/**` hacia el servicio `lexia-api` de Cloud Run en la región `us-central1`.
- El fallback SPA (`** -> /index.html`) se ha preservado de manera segura en el segundo lugar.

## Pruebas de Sistema

| Prueba | Resultado |
|---|---|
| Firebase Hosting config | ✅ |
| SPA routing / Vite config | ✅ |
| Cloud Run architecture en código | 🟡 |
| Hosting → /api rewrite | 🟡 |
| Cloud SQL implementation en código | 🟡 |
| SCJN SQLite local COUNT=50 | ✅ |
| SCJN SQLite search / filters / details | ✅ |
| Firebase Auth local testing | ✅ |
| OpenAI configured (oculta) | ✅ |

*✅ Probado localmente o verificado estáticamente.*
*🟡 Implementado sin infraestructura remota probada aún.*
*🔴 Error/Falta.*

## Próximos Pasos (Pendientes)
El código y el contenedor están "Code Ready". Los despliegues mediante la consola CLI en Google Cloud (`CLOUD_DEPLOY_COMMANDS.md`) procederán cuando contemos con una sesión autenticada capaz de operar la facturación y los recursos en `gcloud`.
