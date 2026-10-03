# Fase 2 — Transcripción y redacción fiables

## Flujos previstos

1. La vista de Transcripción y el botón de audio del editor seleccionan un archivo real y usan el mismo `TranscriptionService`.
2. El servicio envía `file` mediante multipart a `POST /api/transcription/jobs`; consulta el trabajo con `GET /api/transcription/jobs/:id` hasta un estado terminal. Cada petición obtiene un token Firebase vigente; un 401 permite una renovación y un único reintento.
3. La interfaz informa la etapa y el tiempo transcurrido, sin porcentajes inventados. Detener espera aborta las consultas locales. El proveedor puede continuar procesando el trabajo; se conserva el identificador para reanudar la consulta sin volver a cargar el archivo mientras la vista siga abierta.
4. Solo una transcripción completada con texto no vacío se entrega al editor. Los errores conservan cualquier texto anterior y permiten reintentar. No se generan muestras ficticias, identidades de hablantes ni números de expediente de respaldo.
5. El editor envía la instrucción existente a `AIAssistantService`, que consume JSON `{ result: string }`. El servidor extrae `output_text` de una respuesta OpenAI completada. El encabezado y el texto de la fase se agregan juntos, únicamente al recibir una respuesta válida.
6. Fallos, cancelaciones, respuestas vacías o respuestas tardías no modifican el borrador. Las solicitudes se cancelan al abandonar la pantalla. No se repiten automáticamente generaciones ni cargas que pudieran duplicar consumo.

## Alcance

Se reutiliza la clave OpenAI existente por instrucción del usuario, sin cambiarla ni exponerla. Se conservan las reglas e instrucciones jurídicas actuales y los controles de seguridad de Fase 1. La persistencia tras recargas/reinicios, eliminación remota y recuperación entre dispositivos corresponden a Fase 3.

## Contratos y límites

El contrato de transcripción se comparte entre servidor y cliente. El adaptador del Worker normaliza estados y campos de texto; datos mal formados generan un error controlado. La espera de una transcripción tiene límite de 30 minutos; carga HTTP de 130 segundos, consulta HTTP de 35 segundos, redacción HTTP de 130 segundos. Los límites del proveedor son menores para permitir devolver un error legible.

La cancelación de una consulta no equivale a borrar ni cancelar un trabajo en el proveedor. Las respuestas de error distinguen autenticación, permisos, cuota, servicio no disponible, datos inválidos y tiempo de espera.

La configuración del adaptador respeta primero las opciones explícitas del constructor: `backendSecret`, después `secret`; solo si ambas están ausentes utiliza `CLOUDFLARE_BACKEND_SECRET` y, por compatibilidad, `CLOUDFLARE_TRANSCRIPTION_SECRET`. Un valor explícito vacío o de ejemplo debe producir 503 antes de llamar al Worker, aunque el entorno tenga una credencial configurada. Este orden mantiene aisladas las pruebas con transporte y credenciales sintéticos, y conserva la selección del secreto backend en producción cuando no se inyectan opciones.

Referencia técnica: [Texto de Responses API](https://developers.openai.com/api/docs/guides/text). `output_text` es el texto agregado que entrega el SDK; `output` es una lista de elementos y no debe insertarse como texto documental.

## Validación

Resultados del 2026-10-02:

- `npm run test:workflow`: 13 pruebas aprobadas de contrato, renovación de token, tiempo máximo, errores, normalización del Worker y rutas HTTP. Incluyen la prioridad de credenciales explícitas sobre el entorno y el rechazo de un valor explícito vacío sin contactar al proveedor, con transporte y valores sintéticos.
- `npm run test:workflow-ui`: 6 pruebas aprobadas de las pantallas reales en DOM, incluidas preservación del borrador, cancelación, reanudación, desmontaje y traslado del texto al editor. Las respuestas de proveedores se controlan durante estas pruebas.
- `npm run test:security`: las 6 pruebas de Fase 1 siguen aprobadas.
- `npm run build`: compilación del cliente correcta. Permanece el aviso del paquete principal cercano a 1 MB. La importación diferida de Firebase permite aislar pruebas, pero no crea un fragmento separado porque otras pantallas lo importan estáticamente.
- TypeScript de las rutas y servicios implicados y ESLint de los módulos de Fase 2 comprobados. Se corrigió una anotación de tipo en `KnowledgeService` y la importación CommonJS de `file-saver` para ejecutar las pruebas de pantalla; no se cambió el formato Word.

## Verificación externa y pendientes concretos

La clave existente se reutilizó en **una** prueba manual con la frase sintética «Esta es una prueba técnica de LexIA», sin expedientes ni archivos de conocimiento. OpenAI devolvió HTTP 429 con código `credit_balance_exhausted`. Se agregó ese código al manejo de saldo agotado: la aplicación devuelve 503 con un mensaje de saldo, en vez de reintentar automáticamente o tratarlo como una generación terminada. No se verificó una generación externa exitosa ni la disponibilidad del modelo por separado.

Se requiere saldo en la [facturación de la API](https://platform.openai.com/settings/organization/billing) para repetir `npx tsx scripts/tests/smoke-ai.ts`. Esta prueba es manual y facturable; no forma parte de los tests automáticos. Cambiar de clave o de modelo no sustituye el saldo. Para experimentos simples, la guía de diagnóstico también menciona `model: "gpt-6-luna"`; no se cambió el modelo del proyecto.

`CLOUDFLARE_WORKER_URL` y `CLOUDFLARE_TRANSCRIPTION_SECRET` contienen valores de ejemplo en la configuración local. La primera no es una URL válida. No se envió ningún audio al Worker. Se necesita configurar la URL real y el secreto vigente en `.env.local` o en el entorno del servidor, sin publicarlos en Git ni pegarlos en el chat. Los errores de configuración ahora se muestran como 503 legible. La dirección histórica encontrada en el código no se usó como sustitución silenciosa.

**Estado:** reparación y validación local del flujo; validación integral con proveedores pendiente del saldo y la configuración del Worker. La persistencia de trabajos y borradores se implementó posteriormente en [Fase 3](phase3_persistence.md). Tras habilitar Firestore el usuario, se publicaron sus reglas e índices; el backend y frontend no fueron desplegados en esta operación.

## Actualización del ciclo funcional

La fase funcional 1 reemplaza la generación universal de apartados de sentencia por tareas explícitas y referencias seleccionadas. El editor utiliza el contrato versionado de `shared/generation.ts`, conserva original y copia de trabajo, y envía contraste opcional separado. Una respuesta completa incluye procedencia validada; solo entonces se incorpora el texto sin encabezados artificiales y se registra la instrucción y sus huellas. El endpoint anterior permanece para compatibilidad, sin activar el modo de análisis sin confirmación. Detalle y verificación: [functional_phase1.md](functional_phase1.md).
