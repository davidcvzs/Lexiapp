# Mapa del Sistema: LexIA PWA

## Fase funcional 4 Word y video

Flujo previo y contrato: [functional_phase4.md](functional_phase4.md). Revisar fuente completa → elegir perfil y marcado → construir Word sin IA → verificar OOXML/binario → conservarlo en Firestore → descargar y confirmar → solicitar borrado remoto → recuperar resultado. El borrado local sigue separado. Los controles de artefacto protegen la API de Lexiapp; el DELETE directo del Worker/GPT conserva su contrato anterior y no acredita un Word persistido por Lexiapp.

- `shared/officialMarking.ts`, `wordFormatting.ts`, `wordDocument.ts`: categorías oficiales y conversiones de edad revisables, perfiles Carta de Blueprint/647 y construcción común de DOCX sin reescritura.
- `shared/transcriptWord.ts`: solicitud revisada, huellas de fuente/texto/binario, recibo privado y estado de eliminación remoto.
- `DocumentDraft.wordFormat`: formato/tribunal aportado y posiciones del marcado oficial. El fingerprint incluye estas opciones; editar el texto elimina posiciones antiguas e invalida revisión oficial/pública.
- `server/services/TranscriptWordService.ts` y `server/persistence/TranscriptArtifactStore.ts`: generación verificable y conservación owner-scoped en `transcriptionJobs/{id}/wordArtifacts/{artifactId}/blocks/{index}`. Máximo inicial 4 MiB de DOCX, bloques 256 KiB y commit transaccional; se mantienen fuente y artefacto tras borrar el video.
- `server/routes/transcriptWord.ts`: creación, estado, descarga autenticada, borrado condicionado y reconciliación sin repetir DELETE de manera automática. Un resultado ambiguo no se declara eliminado.
- `src/services/TranscriptWordClient.ts`, `src/components/documents/TranscriptWordPanel.tsx`, `OfficialMarkReview.tsx` y `DocumentWordReview.tsx`: revisión, descarga binaria comprobada, confirmación y opciones Word del editor. `useTranscription.result.jobId` conserva el vínculo al historial sin transportar todos los segmentos al redactor.
- Nuevas pruebas `word-formatting.test.ts`, `transcript-word.test.ts`, `transcript-word.ui.test.tsx`: contrato, OOXML, aislamiento, persistencia y errores. El estado de implementación y QA se registra en el documento de fase.
- `scripts/smoke-transcript-word.ts`: ensayo manual con `--live` que crea únicamente un trabajo sintético con identificador UUID, conserva y descarga su Word con un cliente SDK nuevo, comprueba aislamiento y limpia todos sus bloques y recibos. Inyecta un proveedor que rechaza cualquier llamada; no carga ni elimina videos, ni llama a IA.

## Correspondencia con el GPT original

- [worker_review.md](worker_review.md): revisión original y seguimiento del Worker reparado, activo con la versión `eba0202b-e5b1-4ddb-94ad-1994732b8b87` al 100 %, incluida la reparación de privacidad. No se copió la credencial expuesta.
- [gpt_implementation_plan.md](gpt_implementation_plan.md): seis fases funcionales, con prioridades y criterios de aceptación; las fases 1–3 tienen implementación local, con validación real de proveedores pendiente.
- [gpt_alignment_analysis.md](gpt_alignment_analysis.md): revisión de la configuración aportada de Transcripción y Elaboración de Documentos Legales2, lectura de los 18 archivos de `conocimiento/`, asignación actual por tarea y diferencias del contrato de la acción Cloudflare. Propone el orden de reparación funcional; no modifica los prompts ni ejecuta proveedores.

## Calidad técnica y operación — Fase 5

- `tsconfig.server.json`, `tsconfig.server.build.json` y `tsconfig.tools.json`: comprobación estricta del backend, scripts y pruebas; producción ejecuta JavaScript compilado en `dist-server/`.
- `server/app.ts` y `server/index.ts`: construcción inyectable, arranque tras cargar variables, respuesta JSON para API inexistente, archivos estáticos y cierre de conexiones.
- `server/config/environment.ts`, `.env.example`, `scripts/check-environment.ts`: configuración validada sin imprimir secretos; frontend valida Firebase antes de compilar.
- `server/routes/health.ts`: `/api/health` para proceso vivo, `/api/ready` para Firestore y `/api/health/details` restringido a administradores; sin llamadas a proveedores.
- `server/config/hosting.ts`, `scripts/prepare-hosting.ts`: reescrituras de API a un servicio Cloud Run existente; el predeploy impide publicar la configuración estática incompleta.
- `scripts/backup-scjn.ts`: respaldo consistente de SQLite, verificación y huella; evita sobrescrituras. Firestore y PostgreSQL tienen procedimientos de recuperación en la documentación de operación.
- `scripts/check-clean-install.mjs`: instalación y comprobaciones en una copia temporal sin fuentes legales, datos ni credenciales privadas.
- `.github/workflows/check.yml` y `firebase.emulators.json`: CI para Node 22/24, comprobaciones locales, Emulator y construcción Docker; el flujo no se ejecutó remotamente en esta fase.
- `App.tsx` carga las vistas bajo demanda y muestra estado de carga. `src/config/firebase.ts` conserva Auth; elimina la instancia Firestore del navegador que no tenía consumidores.
- Contratos de SCJN, catálogos y errores tipados; SQLite expone un único estado de salud compatible y cierre. PostgreSQL devuelve el mismo contrato de catálogos. `soapXml.ts` valida nodos externos antes de leerlos.
- `KnowledgeService` usa las API actuales de PDF y Excel; evita añadir etiquetas de página generadas al texto extraído. Los prompts jurídicos no se modifican.
- `scripts/tests/operations.test.ts` y `operations.ui.test.tsx`: rutas de producción, salud, configuración, respaldo/restauración, extracción y limpieza de filtros.
- Operación, respaldo, recuperación y límites: [phase5_operations.md](phase5_operations.md).

## Integridad y exportación — Fase 4

- `shared/documentIntegrity.ts` y `shared/redaction.ts`: aprobación vinculada a instantánea, invalidación y ocultaciones explícitas; una misma transformación para vista pública y Word.
- `shared/documents.ts`: compatibilidad con borradores anteriores y persistencia de fuentes originales, instrucciones, estados de fases y planes de ocultación.
- `src/components/documents/PublicVersionReview.tsx`: revisión humana de las ocultaciones de la versión pública.
- `DocumentBuilderView`: fuente original, copia de trabajo, instrucciones, estado de fases y variante de exportación independiente de la auditoría.
- `WordExportService`: construcción y descarga separadas, conservación de texto aprobado y errores visibles; `DocumentsView` exporta explícitamente versión oficial.
- `WorkspaceRepository`: valida la huella de aprobación y la revisión pública antes de guardar; `useDocumentDraft` adopta la respuesta confirmada del servidor.
- `scripts/tests/document-integrity.test.ts` y `document-integrity.ui.test.tsx`: comparación del DOCX con el texto aprobado, revisión pública, invalidación y errores. Persistencia prueba también las fuentes, instrucciones y ocultaciones tras reiniciar el cliente.
- `scripts/qa-word-export.ts` (`npm run qa:word`): crea dos Word sintéticos en `.firebase/phase4-word-qa/` para comprobar visualmente formato y paginación, sin leer fuentes ni credenciales.
- `firestore.indexes.json`: excluye también fuente original y registro de generación de los índices de documentos y versiones.
- `check-firestore-config.ts`: comprueba además que esos campos remotos no tengan índices ni hereden la configuración predeterminada; `smoke-persistence.ts` verifica aprobación, ocultaciones e invalidación en la base real usando datos sintéticos.
- Flujos, compatibilidad y límites: [phase4_document_integrity.md](phase4_document_integrity.md).

## Persistencia — Fase 3

- `server/services/firebaseAdmin.ts`: inicialización compartida y diferida de Firebase Admin.
- `server/persistence/WorkspaceRepository.ts`: Firestore, transacciones de revisiones y versiones, expedientes vinculados y trabajos de transcripción; eliminaciones con marca para impedir resurrección.
- `shared/documents.ts`: contrato validado del borrador, metadatos, auditoría y versiones.
- `server/routes/documents.ts`: listado, lectura, guardado, historial y eliminación autenticados por propietario.
- `src/services/DatabaseService.ts`: API de documentos y expedientes; sustituye la escritura Firestore desconectada del editor.
- `src/hooks/useDocumentDraft.ts`: carga, guardado automático serializado, revisión y bloqueo por conflicto.
- `DocumentsView` usa registros reales; `DocumentBuilderView` recupera por URL y permite guardar, editar y restaurar versiones.
- `TranscriptionView`, `TranscriptionService` y `useTranscription` recuperan trabajos sin el archivo original, descargan y eliminan la copia de LexIA.
- Colecciones: `documents`, subcolección `versions`, `cases` y `transcriptionJobs`. Las nuevas colecciones solo son accesibles desde el backend autenticado; no se habilitan escrituras directas del cliente.
- `firestore.indexes.json`: índices de listados y exclusión de fuentes/textos extensos. `scripts/tests/persistence.test.ts` y `persistence.ui.test.tsx`: recuperación, propiedad, concurrencia y flujos de guardado.
- `scripts/check-persistence.ts` (`npm run check:persistence`): diagnóstico de disponibilidad de Firestore mediante metadatos, sin leer documentos ni modificar el proyecto.
- `scripts/check-firestore-config.ts`: comprueba reglas publicadas y estados de índices; `scripts/deploy-firestore.ts --apply` publica exclusivamente reglas e índices con la credencial local existente, comprobando coincidencia de proyectos.
- `scripts/smoke-persistence.ts --live`: prueba manual de persistencia real con UID y registros sintéticos únicos; comprueba recuperación y limpia todos los registros de esa ejecución, sin proveedores externos.
- Flujos y límites de despliegue: [phase3_persistence.md](phase3_persistence.md).

## Transcripción y redacción — Fase 2

- `shared/transcription.ts`: estados, formato de trabajos y límites de archivo compartidos por cliente y servidor.
- `shared/operations.ts`: tiempos máximos, espera cancelable y propagación de cancelaciones.
- `src/services/ApiClient.ts`: solicitudes autenticadas al backend; renovación de token una vez ante 401.
- `src/services/TranscriptionService.ts` y `src/hooks/useTranscription.ts`: carga y consulta unificadas en Transcripción y editor, reanudación por identificador y conservación del texto anterior.
- `src/services/AIAssistantService.ts`: estado por editor y consumo de JSON; no interpreta SSE ni contacta directamente a OpenAI desde el navegador.
- `server/services/CloudflareTranscriptionService.ts`: adaptador de formatos del Worker y detección de configuración ausente.
- `server/services/OpenAIService.ts`: texto de Responses API mediante `output_text`; rechazo de resultados incompletos o vacíos.
- `server/middleware/providerRequest.ts`: aborta solicitudes externas al vencer el tiempo o desconectarse el navegador.
- `server/routes/ai.ts` y `server/routes/transcription.ts`: factorías con dependencias inyectables para pruebas aisladas.
- Docker incluye `shared/`, requerido también por el servidor.
- `scripts/tests/workflow.test.ts` y `workflow.ui.test.tsx`: pruebas de contratos, errores, cancelación y conservación del borrador. `smoke-ai.ts` es manual y realiza una llamada facturable con texto sintético.
- Detalle y limitaciones: [phase2_transcription_generation.md](phase2_transcription_generation.md).

## Seguridad implementada — Fase 1 (2026-10-02)

- `server/middleware/auth.ts`: verificación de tokens Firebase, revocación y claim administrativo.
- `server/middleware/security.ts`: cuotas por IP/UID y errores HTTP sin detalles internos.
- `server/middleware/uploads.ts`: límites y validación de formato de archivos; limpieza de temporales.
- `server/scjn/archiveSafety.ts`: límites de extracción ZIP y rechazo de rutas inseguras.
- `src/components/layout/AdminRoute.tsx`: control de acceso a `/admin`, respaldado por autorización en API.
- Ajustes cierra la sesión real de Firebase antes de redirigir.
- `firestore.rules`: reglas de propietario para `cases`; desde fase 3, `DatabaseService` usa el backend. Otras colecciones permanecen denegadas para acceso directo. Las colecciones `Users/Documents/CustomButtons` descritas en el diseño inferior no están habilitadas por estas reglas.
- `scripts/tests/security.test.ts` y `scripts/tests/firestore.rules.test.ts`: pruebas HTTP y de Firestore Emulator.
- `scripts/audit-secrets.mjs`: auditoría local de exposición de la clave sin imprimir su contenido.
- Alcance, límites, configuración y estado de publicación: [security_phase1.md](security_phase1.md).

## Arquitectura de Software
LexIA está construida como una PWA bajo la filosofía de **Programación Orientada a Objetos (OOP)** para su lógica interna y un frontend reactivo.

### 1. Frontend (Vite + React + TS)
- **Vistas UI (`src/views/`)**
  - Pantallas mapeadas desde el Blueprint (ej. Login, Dashboard, Transcription, DocumentBuilder).
- **Componentes Reutilizables (`src/components/`)**
  - Panel lateral, Panel de Chatbot (Stitch/GPT).

### 2. Capa de Servicios OOP (`src/services/`)
Los servicios manejan la lógica pura, separando el estado visual del estado de negocio.
- **`BaseService`**: Control de errores, instanciamiento de Firebase, manejadores de estado de red.
- **`AuthService`**: Integración con Firebase Authentication y roles de usuario.
- **`TranscriptionService`**: API autenticada, carga multipart o TUS directo a Stream, consulta/reanudación y fuente literal verificada por segmentos.
- **`AIAssistantService`**: Contexto documental continuo, tareas y pasos guiados; generación mediante Responses API en el backend.
- **`WordExportService`**: Lógica de ensamblaje final usando `docx` (formatos Poder Judicial Nuevo León).
- **`PaymentService`**: Conexión a Stripe para manejar las cuotas y planes (Básico, Pro, Institucional).

### 3. Backend
- **Express/Firebase Auth**: validación de token y propiedad en API; Firebase Admin para Firestore.
- **Firestore**: `documents/versions`, `cases`, `transcriptionJobs/segments` y `transcriptionRequests`.
- **Cloudflare Worker/Stream**: videos y captions; Durable Object `JobJournal` para autorización y reservas de carga.
- **Hosting**: publicación de PWA y API pendiente de configuración del servicio, documentada en operación.

## Flujo Crítico de Transcripción y Edición
1. `User` arrastra video en `TranscriptionView`.
2. `TranscriptionView` llama a `TranscriptionService.processMedia(file)`; reserva el trabajo antes de cargar.
3. La API registra propietario, consulta al Worker y recupera segmentos en bloques persistentes. TUS transfiere directamente al destino autorizado de Stream.
4. Tras verificar todas las páginas y su hash, el usuario descarga la fuente o elige enviarla completa a `DocumentBuilder` dentro de sus límites.
5. En `DocumentBuilder`, `AIAssistantService` arranca el estado y maneja clicks guiados de acuerdo al Blueprint V2.
6. Al finalizar los pasos requeridos, se invoca a `WordExportService`.

## Fase funcional 1 — Tareas, reglas y conocimiento

Este ciclo es independiente de las fases técnicas anteriores.

- `shared/legalTasks.ts`: catálogo de 15 tareas, variantes y 17 referencias únicas; ninguna ruta arbitraria llega desde el navegador.
- `shared/generation.ts`: contrato versionado con fuente original, copia de trabajo, contraste y borrador separados; confirmación del análisis vinculada por SHA-256 y validación de procedencia.
- `server/legal/rules/gptInstructions.ts`: instrucciones actuales aportadas por el usuario y versión de reglas. `rules/index.ts` selecciona tarea y delimita los ejemplos como datos de referencia.
- `server/services/KnowledgeService.ts`: referencias estrictas, huellas de bytes y `KNOWLEDGE_DIR`; directorio sin IA y copia literal de sedes para la solicitud completa predeterminada. La ruta predeterminada es `conocimiento/`.
- `server/services/OpenAIService.ts`, `server/routes/ai.ts` y `src/services/AIAssistantService.ts`: generación por tarea, validación antes del proveedor y procedencia en la respuesta. El endpoint de texto anterior se conserva para compatibilidad; no acepta análisis por modo sin contrato y confirmación.
- `DocumentBuilderView`: selección explícita y variante, instrucción independiente, contraste opcional y confirmación de análisis. Sustituye los seis botones de sentencia que se aplicaban a todos los documentos. El flujo guiado se implementa en la fase funcional 2 descrita abajo.
- `shared/documents.ts` y `shared/documentIntegrity.ts`: selección, instrucción, confirmación y registro de procedencia compatibles con versiones anteriores; cambiar material revisado invalida la aprobación. No se crean colecciones adicionales.
- `scripts/check-knowledge.ts`: diagnóstico local de referencias sin texto privado. `scripts/tests/tasks.test.ts`, `tasks.ui.test.tsx` y la prueba añadida a `persistence.test.ts`: contratos, referencias, consentimiento, navegación y versiones en Emulator.
- Implementación y limitaciones: [functional_phase1.md](functional_phase1.md).

## Fase funcional 2 — Elaboración guiada y contexto continuo

- `shared/workflowCatalog.ts`: secuencias del Blueprint y alcance de cada apartado dentro de la tarea seleccionada; resumen como variante confirmada de análisis y demanda de amparo completa solo con formato aportado. No agrega instrucciones jurídicas nuevas.
- `shared/workflowTypes.ts`, `workflowValidation.ts` y `workflowEngine.ts`: contrato de estado y contexto, grupos separados, recepción explícita, aceptación, rangos de texto, reemplazos y correcciones de fragmentos. Valida propiedad de referencias y procedencia; cada solicitud excluye las fuentes y apartados de otros grupos.
- `src/components/documents/TaskActions.tsx`: selección posterior a la transcripción y navegación con instrucciones propias. `TranscriptionView` permite también comenzar con texto o documentos sin video.
- `src/components/documents/GuidedPanel.tsx`: navegador de pasos, asuntos/hablantes, edición del apartado, aceptación y búsqueda SCJN explícita. Solo los resultados elegidos y referencias aportadas entran al contexto. Las solicitudes de investigación se cancelan al abandonar su contexto.
- `src/services/SourceImportService.ts` y `server/routes/sources.ts`: importación autenticada de TXT/DOCX/DOC/PDF a fuente, contraste o formato del usuario. Extracción local, validación de formato, límites de expansión y limpieza de temporales. Nueva ruta `/api/sources/import` en `server/app.ts`.
- `DocumentBuilderView`: conserva una revisión antes de rehacer, verifica que el contexto no cambie durante la solicitud y aplica resultados a rangos sin duplicar apartados. Confirmación ligada también al destino de las correcciones. Un error de guardado impide el llamado al proveedor.
- `useDocumentDraft`, `shared/documents.ts` y `documentIntegrity.ts`: el estado guiado se guarda con el documento y sus versiones existentes, sin nuevas colecciones. Fuentes cambiadas invalidan apartados del grupo activo; exportar exige aceptar los apartados y aprobar la instantánea.
- `AIAssistantService.syncDocumentState`: reconstruye fuente, paso, apartados, instrucciones y referencias del grupo activo desde el borrador recuperado. `shared/generation.ts` y `OpenAIService` validan y transportan contexto opcional, manteniendo el contrato anterior.
- `firestore.indexes.json`: exclusiones preparadas para `workflow` en `documents` y `versions`; `check-firestore-config.ts` verificará también estos campos al preparar la publicación. No se desplegaron en esta fase.
- `scripts/tests/guided.test.ts`, `guided.ui.test.tsx` y `persistence.test.ts`: 20 pruebas nuevas sintéticas de contexto, reemplazo, fragmentos, grupos, recepción, confirmación, importación, investigación y recuperación real en Emulator. Total: 100 pruebas aprobadas.
- Implementación, límites y acción necesaria por falta de saldo: [functional_phase2.md](functional_phase2.md).

## Fase funcional 3 — Worker, fuentes verificadas y carga reanudable

- `workers/transcriptor-legal/src/index.ts`: Worker reparado con principal GPT/token por trabajo y principal backend/UID, WebVTT literal, paginación y hash, retención confirmada y TUS. `JobJournal` es Durable Object SQLite que reserva la solicitud antes de Stream; no almacena la transcripción. El subproyecto tiene configuración/lock propios, OpenAPI y README de activación, sin secretos. `npm run check:worker` construye con dry-run, sin publicar.
- `shared/transcription.ts`, `shared/transcriptSegments.ts`: estados de carga/video/captions/recuperación, sesiones TUS y manifiestos/segmentos validados. SHA-256 canónico de todos los segmentos; tiempos/hablantes conservados cuando están presentes.
- `server/services/CloudflareTranscriptionService.ts`: entrada multipart, provisión/consulta TUS, recuperación de solicitudes y páginas. Ignora el texto de estado como fuente; distingue límites, errores, propietario y progreso de video.
- `server/persistence/TranscriptStore.ts`: colección `transcriptionRequests` con UID, metadatos y capacidad TUS privada; subcolección `transcriptionJobs/{id}/segments` de bloques inmutables verificados. El padre guarda `_recoveryState` con cursor y metadatos mínimos. `WorkspaceRepository` delega estas operaciones, preserva avances y elimina bloques/reserva con tombstone.
- `server/routes/transcription.ts`: `/capabilities`, `/uploads`, `/uploads/:request_id`, `/requests/:request_id`, trabajos, recuperación y `/jobs/:id/segments`. Propiedad comprobada antes de operaciones remotas; solo completa tras verificar íntegramente los bloques. El endpoint de fuente completa devuelve manifiesto para recuperación paginada o texto de trabajos anteriores.
- `src/services/TranscriptionService.ts`: multipart 100 MiB, TUS con bloques de 8 MiB y límite local 2 GiB cuando se habilita. Reanuda GET/HEAD/PATCH y valida identidad del archivo; el navegador verifica todas las páginas y su hash antes de entregar texto literal.
- `src/hooks/useTranscription.ts`: cancelación/reanudación, progreso y puntero opaco de solicitud en sessionStorage. `TranscriptionView` y `DocumentBuilderView` reseleccionan archivo para TUS, recuperan fuentes y conservan texto previo ante errores. La descarga incluye toda la fuente; la vista previa declara su límite y el editor no recibe recortes.
- `.env.example` y `server/config/environment.ts`: `CLOUDFLARE_BACKEND_SECRET`, `CLOUDFLARE_DIRECT_UPLOAD_ENABLED=false` y diagnóstico sin secretos; carga directa exige Worker/clave backend. Los secretos de la acción y backend son independientes.
- `firestore.indexes.json`: exclusiones de `segments.segments`, `transcriptionRequests.upload/metadata`, `transcriptionJobs._recoveryState` y `workflow` publicadas el 2 de octubre de 2026 mediante la sesión Firebase CLI del operador. La credencial del backend conserva permisos sin edición de índices. Las reglas mantienen reservas y bloques cerrados al navegador. `check-firestore-config.ts` confirmó diez exclusiones y los dos índices compuestos READY; las reglas difieren únicamente en un comentario.
- Pruebas: contrato/adaptador, Worker, servicio TUS, hook/interfaz, fuentes extensas, cursor/hash, reinicio, propiedad, respuesta perdida y eliminación/concurrencia en Emulator. `check:clean` incluye fuente Worker y excluye node_modules, builds, estado Wrangler y secretos de desarrollo. `.dockerignore` excluye también esos directorios y `.dev.vars` anidados del contexto de imagen.
- Flujo, límites y activación de Cloudflare: [functional_phase3.md](functional_phase3.md). Worker activo, backend conectado y pruebas reales multipart/captions/hash/aislamiento/limpieza y persistencia Firestore de bloques sintéticos aprobadas. El usuario restauró las cuatro operaciones GPT sin avisos, guardó/actualizó y confirmó `job_not_found` en Vista previa: conexión y Bearer verificados con el esquema completo, sin código HTTP mostrado. Una consulta directa independiente devolvió 404. TUS desactivado; OpenAI/saldo para el final. Word marcado rojo/borrado remoto condicionado sigue pendiente en fase 4.

## Configuración Cloudflare

- `scripts/cloudflare-token.ps1`: entrada local enmascarada del token Stream y almacenamiento DPAPI en el perfil local Windows, fuera de OneDrive/repositorio. La autorización del operador utiliza Wrangler con keyring; su token OAuth no se copia al Worker.
- `scripts/cloudflare-action-setup.ps1`: formulario local para copiar OpenAPI, clave de acción DPAPI, bloque técnico o instrucciones completas al editor del GPT; campo enmascarado, validación del límite de 8.000 caracteres y botones explícitos, sin publicar ni divulgar la clave backend/Stream.
- `docs/gpt_transcription_action.txt`: bloque técnico actualizado de las instrucciones de transcripción del GPT; nombres/estados reales, token por trabajo y recuperación completa. Se copia por botón y sustituye únicamente el bloque original de transcripción.
- `docs/gpt_instructions_full.txt`: instrucciones originales con solo el bloque técnico sustituido: 7.977 caracteres, LF y sin BOM, reglas y referencias jurídicas idénticas. Resolvió la edición manual que excedía 8.000; el usuario indicó «listo» tras copiar el conjunto.
- [cloudflare_setup.md](cloudflare_setup.md): flujo, cuenta verificada, configuración y resultados de activación. La cuenta se identifica por el Worker y el subdominio existente; el token Stream se comprueba por metadatos antes de aplicar secretos. La carga directa y las pruebas que consumen capacidad permanecen separadas de la autenticación.
- Acción GPT: `job_token` por query, header legado conservado sin conflictos y JSON de página acotado a 90.000 bytes/caracteres; backend mantiene UID y 700 KiB. Un segmento o rango excesivo falla sin recortar texto. Las 16 pruebas Worker incluyen estos límites y GET público de privacidad. La consulta ficticia con el esquema completo está verificada; carga/páginas/borrado desde GPT no se probaron en este diagnóstico.
- `workers/transcriptor-legal/openapi.diagnostic.yaml` y modo `-Diagnostic`: esquema temporal de una sola GET. El importador exigió `components.schemas` como objeto y se añadió `schemas: {}`; producción ya declaraba schemas. Tras un 401 confirmado, corregir API Key/Bearer permitió recibir `job_not_found`. El esquema completo se restauró con cuatro operaciones sin avisos y la consulta de Vista previa confirmó el mismo JSON, sin código HTTP mostrado. Diagnóstico de conexión resuelto.
- `workers/transcriptor-legal/openapi.public-diagnostic.yaml`: respaldo de aislamiento con GET `/health`, sin parámetros ni credenciales. No se aplicó al GPT porque la consulta mínima autenticada ya alcanzó el Worker.
- `workers/transcriptor-legal/src/privacy.ts`: política HTML original revisada, publicada como GET público `/privacy` sin claves ni consultas Stream/Journal, con trabajos protegidos. Versión `eba0202b-e5b1-4ddb-94ad-1994732b8b87` al 100 % mediante publicación solo de código; mismos tres `secret_text` y namespace `JOURNAL` conservados. GET privacidad200/HTML/nosniff, salud200/contrato2, trabajo sin autenticación401, consultas ficticias acción/backend404 y POST privacidad sin autenticación401 verificados.
- Verificación posterior: 114/114 unitarias/integración (16 Worker), typecheck y dry-run de 33,75 KiB pasan. Con las 39 de interfaz y 29 Emulator previas, sin cambios relevantes, el total vigente es 182. El fallo de inyección de dependencias quedó reparado; no hubo nuevas cargas ni llamadas a IA.

## Gemini temporal para pruebas

- `server/services/GeminiService.ts`: transporte REST de Gemini en servidor; clave solo en cabecera, respuesta validada, sin reintentos ni fallback a otro proveedor.
- `server/services/DocumentGenerationService.ts`: orquestación común de tareas, fuentes separadas, consentimiento y referencias; conserva las mismas instrucciones jurídicas y hashes para ambos proveedores.
- `server/services/generationProvider.ts`: selección explícita con `AI_PROVIDER`; adapta el servicio OpenAI existente o Gemini al contrato documental de las rutas.
- `scripts/gemini-token.ps1`: entrada local enmascarada de clave existente y DPAPI fuera de OneDrive/repositorio; no usa la clave OpenAI ni credenciales Cloudflare.
- `scripts/smoke-gemini.ts` y `npm run smoke:gemini`: una generación real explícita con frase sintética, fuera de `npm test`; informa conexión/coincidencia sin imprimir credenciales ni leer archivos privados.
- `server/config/environment.ts` y `server/routes/health.ts`: diagnóstico del proveedor seleccionado sin llamadas a IA. La fábrica respeta la configuración inyectada; ausencia de una clave no hereda la de otro entorno. OpenAI y Gemini rechazan generación sin clave antes de transmitir la fuente.
- Flujo y comprobaciones: [gemini_testing.md](gemini_testing.md). Las pruebas reales usan solo datos sintéticos; saldo y evaluación OpenAI pendientes para el final.
