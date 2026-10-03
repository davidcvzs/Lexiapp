# Fase 5: calidad técnica y preparación del despliegue

## Alcance y flujos operativos

1. Una instalación reproducible usa `npm ci` y una versión compatible de Node. La comprobación del proyecto incluye tipos del cliente, servidor y scripts, lint y pruebas automatizadas sin proveedores facturables.
2. El arranque carga `.env.local` o variables del servicio, valida configuración y devuelve errores claros sin imprimir secretos. Producción sirve frontend y API desde el mismo origen; una ruta API desconocida devuelve JSON, nunca el HTML de la aplicación.
3. Salud distingue proceso vivo de dependencias disponibles. La comprobación de disponibilidad verifica Firestore sin leer documentos de usuarios ni llamar a OpenAI o al Worker. Los detalles de proveedores y del índice SCJN requieren autenticación administrativa.
4. Docker conserva fuentes e índices SCJN en volúmenes y recibe credenciales en ejecución. Firebase Hosting requiere una reescritura `/api/**` a un servicio de API existente antes del fallback del frontend; la preparación genera una configuración revisable a partir del servicio y región indicados.
5. Respaldos y recuperación se documentan y se ejecutan explícitamente. Las pruebas de restauración se realizan en un proyecto separado o Emulator; nunca se restauran automáticamente datos sobre producción.

Esta fase prepara y verifica el proyecto local. Crear servicios de nube, elegir una región o publicar frontend/API requiere un destino concreto; no se inventa infraestructura existente.

La búsqueda SCJN conserva consultas explícitas mediante Buscar o Enter. Limpiar filtros debe consultar sin los valores anteriores; cambiar de categoría actualiza la búsqueda al volver a SCJN. Los catálogos y resultados tienen contratos tipados. La carga del navegador usa Firebase Auth; Firestore de documentos permanece exclusivamente en el servidor.

## Instalación y comprobaciones

Node 24 y npm 10 o superior; `engines` permite también Node 22 desde 22.18. La validación local se hizo con Node 24.21 y npm 11.19. La CI declarada cubre Node 22 y 24. Copiar `.env.example` a `.env.local` y completar las variables propias, sin copiar secretos al frontend ni al repositorio.

```powershell
npm ci
npm run check:env
npm run check
npm run check:clean
npm run test:emulator
npm audit --audit-level=high
```

`check` incluye lint global, tipos de cliente/servidor/scripts, frontend, compilación del backend y pruebas sin proveedores reales. `check:clean` repite instalación y comprobaciones en una copia temporal: solo pasa las variables públicas de Firebase y nunca copia `.env.local`, credenciales administrativas, `Conocimiento`, bases de datos ni `node_modules`. Emulator requiere Java 21 y Firebase CLI 15.32.0; usa un proyecto `demo-` y no producción.

Se actualizó el plugin PWA a una versión compatible con Vite 8. SheetJS usa el paquete 0.20.3 de su [distribución oficial](https://docs.sheetjs.com/docs/getting-started/installation/nodejs/). gRPC usa una versión compatible corregida mediante `overrides`. `better-sqlite3` queda en la línea 12.10 con 12.10.1 en el lockfile: la instalación limpia detectó el [problema de instalación de la versión 13 en Windows](https://github.com/WiseLibs/better-sqlite3/issues/1516); no se desactivaron globalmente los scripts ni se instalaron herramientas de Visual Studio. Se registraron los scripts revisados de dependencias en `allowScripts`.

## Ejecución y despliegue

```powershell
npm run dev
# Después de compilar:
npm run start:production
```

`start:production` establece el entorno mediante un módulo de Node, también en Windows. `start` ejecuta JavaScript compilado y respeta el entorno del servicio. Las variables externas tienen prioridad sobre `.env.local` y `.env`. Firebase Admin puede usar la pareja email/clave existente o identidad del servicio; proyecto del cliente y servidor deben coincidir. El diagnóstico solo valida estructura: una clave OpenAI presente no demuestra saldo, ni una dirección del Worker demuestra funcionamiento.

Docker usa Node 24, compilación en una etapa separada y ejecución sin usuario root. Recibe únicamente las variables `VITE_FIREBASE_*` públicas al construir; secretos Firebase Admin, OpenAI y Worker se entregan al servicio en ejecución. `.dockerignore` excluye entornos, claves, fuentes privadas, respaldos y datos locales. El contenedor ejecuta `dist-server/server/index.js`; una base SQLite usa un volumen persistente en `/data`, con permisos para el UID de `node`. `conocimiento` se monta como volumen privado de solo lectura en `/app/conocimiento`. En la fase funcional 1 se añadió `KNOWLEDGE_DIR` para utilizar otra ruta absoluta existente; los documentos nunca se incorporan a la imagen. Ambos nombres de carpeta quedan excluidos por `.dockerignore`.

En un servicio con disco efímero, el índice SCJN debe usar PostgreSQL administrado o una solución de almacenamiento persistente apropiada. Sus migraciones son explícitas (`server/scjn/migrations/001_initial_postgres.sql`); no se ejecutan automáticamente sobre una base existente. Documentos y trabajos siguen en Firestore. Configurar `PORT` del servicio y `TRUST_PROXY_HOPS` según los proxies realmente presentes; el acceso directo utiliza 0.

Firebase Hosting, por sí solo, no ejecuta Express. El predeploy de la configuración original falla deliberadamente porque falta el servicio API. Una vez que exista el servicio y se conozca su región:

```powershell
npm run prepare:hosting -- --service SERVICIO_EXISTENTE --region REGION
npm run check:hosting -- --config .firebase-hosting.generated.json
# Publicación explícita posterior:
firebase deploy --only hosting --config .firebase-hosting.generated.json --project lexia-pj
```

La configuración generada conserva Firestore y otras reescrituras, y añade `/api` y `/api/**` antes del frontend, siguiendo la [configuración oficial de Hosting con Cloud Run](https://firebase.google.com/docs/hosting/cloud-run). Prepararla no crea ni verifica remotamente el servicio. No se publicaron frontend/API en esta fase.

## Salud y monitoreo

- `GET /api/health`: proceso vivo; adecuado para la sonda del contenedor, sin comprobaciones de proveedores.
- `GET /api/ready`: 200 si Firestore está accesible y 503 si falla o supera cinco segundos. Comprueba un registro técnico, sin leer expedientes. El límite aplica a la respuesta; una operación interna del SDK puede finalizar después.
- `GET /api/health/details`: requiere token Firebase y claim de administrador. Expone disponibilidad de Firestore, índice SCJN y configuración de proveedores; no muestra claves ni saldo.

Las rutas de salud no se cachean. Rutas API inexistentes devuelven JSON 404; archivos inexistentes no devuelven la SPA. El índice HTML y el service worker requieren revalidación; los assets con nombre generado tienen caché inmutable. La PWA excluye `/api` y `/api/**` de su fallback. Las vistas se cargan bajo demanda y muestran un estado de carga; no se instancia Firestore innecesariamente en el navegador.

Para un servicio desplegado, configurar alertas de disponibilidad y tasas de 5xx/503 en el proveedor de monitoreo elegido. Revisar readiness antes y después de publicar. La reversión selecciona la revisión anterior del servicio y el frontend compatible; los cambios de datos y migraciones requieren su propio procedimiento. La CI añadida verifica código y construye el contenedor, pero no despliega ni configura alertas o infraestructura.

## Respaldos y recuperación

SQLite (índice público SCJN): crear un directorio de respaldo protegido y ejecutar `npm run backup:scjn -- RUTA_NUEVA.db`. El script usa la API de respaldo consistente de SQLite, abre el origen existente, impide sobrescribir archivos y verifica `quick_check`. Guarda un manifiesto con tamaño y SHA-256. La prueba restaura una copia en una base sintética y comprueba texto, lotes y búsqueda. Para recuperar, detener escritores, conservar el volumen anterior y iniciar el servicio apuntando a una copia verificada del respaldo; no copiar únicamente el `.db` de un proceso activo ignorando sus archivos de journal.

PostgreSQL: usar respaldos del proveedor y/o `pg_dump --format=custom`, y probar `pg_restore` sobre una base nueva. No restaurar encima de producción sin detener escritores y revisar el alcance. Conservar migraciones y versión del código junto al respaldo.

Firestore: utilizar respaldos administrados o exportación a un bucket privado del proyecto. La exportación administrada requiere facturación y permisos de Storage y Firestore, y cobra lecturas por documento según la [documentación oficial](https://firebase.google.com/docs/firestore/manage-data/export-import). No se creó un bucket ni se activó una política facturable sin un destino de respaldo definido. Una exportación filtrada debe incluir `versions`, además de `documents`, `cases` y `transcriptionJobs`, para conservar el historial:

```text
gcloud firestore export gs://BUCKET_RESPALDOS_PRIVADO/FECHA --project=lexia-pj --database="(default)" --collection-ids=documents,versions,cases,transcriptionJobs
```

Propuesta operativa: respaldo diario, retención inicial de 14 días y prueba mensual de recuperación en un proyecto separado. La exportación normal no representa necesariamente una instantánea exacta de un único momento; para requisitos de consistencia temporal usar respaldos administrados o PITR configurado y compatible. Verificar que la operación termine antes de considerar válido el respaldo. Restaurar primero en una base de ensayo, conservar los UID y comprobar aislamiento por propietario, versiones, documentos y trabajos. Firebase Auth, reglas/índices, credenciales y archivos de audio externos no forman parte del respaldo de documentos Firestore y tienen ciclos separados. No exportar claves ni documentos a directorios públicos.

## Validación local y límites

68 pruebas aprobadas: 35 de contratos/seguridad/integridad/operación, 19 de interfaz y 14 de persistencia y reglas en Emulator. Lint global, comprobación de tipos del frontend, backend y scripts, compilación de producción e instalación limpia correctos. Auditoría npm: cero vulnerabilidades reportadas al verificar el lockfile; no es una garantía sobre vulnerabilidades aún no publicadas. Permanecen avisos de paquetes auxiliares deprecados durante la instalación.

Se comprobó el servidor JavaScript compilado en producción local, con SQLite sintético y Firestore real: frontend y rutas SPA 200, API inexistente JSON 404, endpoints protegidos 401, liveness 200 y readiness 200. No se llamó a IA o al Worker ni se escribió en expedientes reales. El JavaScript inicial pasó de aproximadamente 1023 KB a 338 KB antes de gzip; el mayor chunk quedó en aproximadamente 351 KB. La compilación final no emite avisos por tamaño ni importación dinámica ineficaz.

Docker no está instalado en este equipo: la construcción Linux del contenedor y la CI remota quedan pendientes de ejecución, sin afirmar resultados no comprobados. Las verificaciones locales no sustituyen el inicio de sesión y las pruebas en el dominio publicado. OpenAI continúa pendiente de saldo y el Worker de configuración válida, según fases anteriores.
