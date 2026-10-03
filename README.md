# LexIA

PWA de redacción, revisión y exportación documental. React/Vite, API Express, Firebase Auth y persistencia Firestore. El índice SCJN puede usar SQLite o PostgreSQL.

## Inicio local

Recomendado: Node 24 y npm 10 o superior. Copiar `.env.example` a `.env.local` y completar las variables propias. Nunca incluir claves privadas en variables `VITE_*`.

```powershell
npm ci
npm run check:env
npm run dev
```

Vite usa `/api` mediante proxy hacia el backend en el puerto 3000. Firebase Admin reutiliza la credencial configurada o identidad del servicio. Generación y transcripción requieren proveedores configurados y disponibles.

Para pruebas con Gemini, configurar en el servidor `AI_PROVIDER=gemini`, `GEMINI_API_KEY` y `GEMINI_MODEL=gemini-3.8-flash`. La selección es explícita y los errores no cambian de proveedor automáticamente. `npm run smoke:gemini` ejecuta una llamada real con una frase sintética; no forma parte de las pruebas automáticas. Configuración y resultados: [Gemini para pruebas](docs/gemini_testing.md).

## Verificación

```powershell
npm run check
npm run check:clean
npm audit --audit-level=high
npm run test:emulator
```

`check` verifica lint, tipos del cliente/servidor/scripts, compilación y pruebas sin proveedores reales. `check:clean` repite la instalación en una copia temporal sin credenciales privadas. Emulator requiere Java 21 y Firebase CLI 15.32.0; las pruebas usan un proyecto de demostración.

## Producción

```powershell
npm run build
npm run start:production
```

El servidor compilado sirve frontend y API desde el mismo origen. `/api/health` comprueba el proceso; `/api/ready` comprueba Firestore. Docker recibe variables públicas de Firebase al construir y secretos en ejecución. SQLite y fuentes de referencia requieren almacenamiento persistente.

Firebase Hosting necesita un servicio API existente; su configuración estática incompleta está bloqueada por el predeploy. Preparar las reescrituras con `npm run prepare:hosting -- --service SERVICIO --region REGION` antes de una publicación explícita.

Operación, Docker, Hosting, monitoreo, respaldo y recuperación: [fase 5](docs/phase5_operations.md). Arquitectura y módulos: [mapa del sistema](docs/system_map.md).

## Fases implementadas

- [Seguridad](docs/security_phase1.md)
- [Transcripción y generación](docs/phase2_transcription_generation.md)
- [Persistencia](docs/phase3_persistence.md)
- [Integridad y exportación](docs/phase4_document_integrity.md)
- [Calidad técnica y operación](docs/phase5_operations.md)

## Dinámica del GPT

La [fase funcional 1](docs/functional_phase1.md) conecta tareas, variantes de formato, fuentes separadas y confirmación de análisis. La [fase funcional 2](docs/functional_phase2.md) añade pasos por tarea, aceptación, reemplazos, fragmentos, resumen confirmado, declaraciones por partes, asuntos separados, importación de documentos e investigación explícita con contexto persistente. Los documentos anteriores conservan su compatibilidad; una nueva generación exige seleccionar tarea. Las fases siguientes están en el [plan funcional](docs/gpt_implementation_plan.md).

Para usar los pasos: selecciona tarea y formato y pulsa **Iniciar elaboración por pasos**, o elige una tarea al terminar la transcripción. Genera, edita y acepta cada apartado; **Rehacer este paso** conserva una versión previa y sustituye solo ese apartado. Puedes importar documentos como fuente, contraste o formato sin llamar a la IA.

La verificación vigente suma 182 pruebas: 114 unitarias/integración aprobadas ahora, incluidas 16 del Worker, y las 39 de interfaz y 29 de Firestore Emulator aprobadas previamente sin cambios. TypeScript pasa; instalación limpia, lint y compilación también se verificaron previamente. Las comprobaciones de aislamiento de proveedores y compatibilidad GPT usan datos simulados. Gemini respondió a una prueba real anterior con texto sintético. La evaluación con respuestas reales de OpenAI y el saldo se dejan para el final.

Las referencias privadas se leen desde `conocimiento/` o una ruta absoluta `KNOWLEDGE_DIR`. Ejecutar `npm run check:knowledge` verifica lectura y huellas sin mostrar contenido ni llamar a proveedores. En Linux, respetar las mayúsculas de los archivos originales y montar la carpeta fuera de la imagen.

La [fase funcional 3](docs/functional_phase3.md) integra el Worker reparado, fuentes completas por segmentos con tiempos/hablantes disponibles, almacenamiento en bloques y carga TUS reanudable hasta 2 GiB cuando esté activada. La carga multipart conserva 100 MiB; las fuentes extensas se descargan completas y se trabajan por partes dentro del redactor. El saldo OpenAI se deja para el final; esta fase no usa esa API.

El Worker tiene su propio [proyecto y configuración](workers/transcriptor-legal/README.md), distinto de Pages en la raíz. La versión activa del 2 de octubre de 2026 es `eba0202b-e5b1-4ddb-94ad-1994732b8b87` al 100 %, conservando el namespace SQLite de `JobJournal` y las tres credenciales como `secret_text`. Se restauró `GET /privacy` público, con respuesta 200. Las siete comprobaciones remotas iniciales de salud, autenticación y separación de propietarios pasaron sin subir archivos.

La configuración privada del backend ya incluye `CLOUDFLARE_WORKER_URL` y `CLOUDFLARE_BACKEND_SECRET`; se conserva `AI_PROVIDER=gemini`. `CLOUDFLARE_DIRECT_UPLOAD_ENABLED` permanece `false`; quedan pendientes el ensayo real de TUS, interrupción/reanudación, 2 GiB y capacidad por formato.

El usuario guardó las [instrucciones completas](docs/gpt_instructions_full.txt) de 7.977 caracteres, preservando exactamente las reglas ajenas a TRANSCRIPCIÓN DE VIDEO. Se corrigió la importación con `schemas: {}` en el esquema diagnóstico y se copió la clave Bearer. Después se restauró el [OpenAPI de producción](workers/transcriptor-legal/openapi.yaml) con sus cuatro operaciones, sin avisos. La consulta ficticia final del GPT devolvió `job_not_found`: conexión y autenticación con el esquema completo validadas. El GPT no mostró el código HTTP; la consulta directa confirmó 404. En esta actualización no se hicieron llamadas a IA ni nuevas cargas.

La prueba real de Stream pasó con un único MP4 sintético de 24,776 segundos y retención de 31 días: seis segmentos, tres páginas y hash íntegro verificado; otro propietario recibió 404. Se eliminó únicamente el video de esta prueba, con respuesta 200 y consulta posterior 410. Los captions reconocieron «Lexiapp» como «EXIAP-P», por lo que la coincidencia literal esperada fue falsa. Se conserva la transcripción original sin retoques; esta prueba verifica el flujo, pero no demuestra exactitud completa de transcripción.

Se publicaron seis exclusiones nuevas de índices Firestore mediante la CLI con OAuth del operador: las diez comprobaciones de configuración pasan y los índices compuestos están `READY`. Las reglas permanecen iguales salvo un comentario; no se modificaron roles de la identidad del backend, que no puede editar índices.

La prueba real de `FirestoreTranscriptStore` pasó con seis segmentos, tres páginas y tres bloques. Un cliente SDK nuevo reanudó la fuente con hash y contenido literal coincidentes; la finalización prematura recibió 409 y las siete comprobaciones con otro propietario, 403. La limpieza dejó cero documentos de prueba. Esta comprobación de persistencia no llamó a IA ni al Worker. Estado y próximos pasos: [configuración Cloudflare](docs/cloudflare_setup.md).

```powershell
npm --prefix workers/transcriptor-legal ci --ignore-scripts
npm run check:worker
```

`check:worker` construye con Wrangler 4.147.0 usando `deploy --dry-run`; no publica ni sube videos. El emulador local de Wrangler no admite Stream; la comprobación del binding y del registro local no sustituye una prueba en la cuenta real.
