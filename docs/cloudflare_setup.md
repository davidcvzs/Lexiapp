# Configuración Cloudflare — 2 de octubre de 2026

## Flujo y estado

Sesión Wrangler cifrada → cuenta verificada → token Stream introducido en ventana local enmascarada → respaldo DPAPI → claves independientes → despliegue conjunto de código y secretos → comprobación remota → backend configurado → prueba con video sintético → actualización manual del GPT.

El Worker reparado está activo en `https://transcriptor-legal.yoshiman1989.workers.dev`, con 100 % del tráfico en la versión `eba0202b-e5b1-4ddb-94ad-1994732b8b87`. Se conserva `JobJournal` SQLite (namespace `e41bcfa23b1a40729459d22b45c634a4`). El usuario restauró el esquema completo con cuatro operaciones sin avisos, guardó/actualizó y confirmó una consulta de Vista previa con `{error:"No se encontró el trabajo.",code:"job_not_found"}`. Quedan verificadas conexión y autenticación Bearer con el esquema completo; la interfaz no mostró un código HTTP. GET `/privacy` ya está publicado y respondió 200 público. TUS sigue deshabilitado y Word/ciclo del video corresponden a la fase 4. OpenAI/saldo quedan para el final; Lexiapp usa Gemini.

## Acceso, respaldo y publicación

Wrangler 4.147.0 utiliza `login --use-keyring`: sesión cifrada y clave en Windows Credential Manager. La cuenta de destino es **Yoshiman1989**, verificada por el subdominio y Worker existente, con ID `7ea6c8f6637ddb93d68512834ac18724`. La otra cuenta accesible no contiene ese Worker.

El token Stream nuevo respondió HTTP 200 en verificación, listado y almacenamiento. Está activo y resuelve el 401 del token anterior. Antes de la prueba había 27 videos, 465,94 minutos usados de 1.000 y 534,06 disponibles. No se modificaron la cuenta ni su plan.

El respaldo original está cifrado por usuario Windows en `%LOCALAPPDATA%/Lexiapp/cloudflare-backups/transcriptor-legal/2026-10-02T12-58-37-214Z.xml`. Contiene 27.784 bytes de código y configuración de la versión anterior `89c9afeb-c754-42d6-bbfe-96cf0ba9a29d`; su descifrado conservó el SHA-256. La primera creación Durable Object impide un rollback de versiones atravesando ese cambio. Una reparación debe publicar código que preserve `JobJournal` y su almacenamiento SQLite.

Las claves propias `ACTION_API_KEY` y `LEXIA_API_KEY` son diferentes, de 256 bits, y permanecen en el archivo DPAPI original `%LOCALAPPDATA%/Lexiapp/credentials/cloudflare-worker-secrets.xml`. El token Stream permanece en `cloudflare-stream.xml`. No se solicitaron secretos en el chat.

La revisión automática rechazó crear otro contenedor DPAPI conjunto; ese comando no se ejecutó. La publicación autorizada utilizó los originales: un archivo JSON temporal fuera de OneDrive, con ACL exclusiva del usuario actual, para `wrangler deploy --secrets-file`. Código y tres secretos se publicaron juntos; el archivo temporal se eliminó al terminar. No se usaron `secret put` ni `--keep-vars`.

La configuración activa usa fecha de compatibilidad `2026-10-02`, Stream y JobJournal. `ACTION_API_KEY`, `LEXIA_API_KEY` y `CF_API_TOKEN` son bindings `secret_text`. La configuración nueva retiró las credenciales antiguas como variables normales y los bindings OpenAI/AI/MEDIA/R2. Los videos y buckets existentes no se eliminaron.

La publicación posterior de privacidad actualizó solo el código, pasando de `ccee90f9-8275-4649-a12d-a5553cd9346a` a `eba0202b-e5b1-4ddb-94ad-1994732b8b87` al 100 %. Conservó los mismos tres bindings `secret_text` y el namespace `JOURNAL`. La CLI confirmó `keepSecrets:true` predeterminado, sin `--keep-vars` ni archivo temporal de secretos. No hubo nuevas cargas ni llamadas a IA.

## Comprobaciones remotas y backend

Siete consultas seguras pasaron después del despliegue, sin cargas ni generación de captions:

- `/health`: 200, contrato 2.
- Trabajo inexistente sin clave: 401.
- Backend sin propietario: 400.
- Backend con propietario y trabajo inexistente: 404.
- Acción Bearer con token de trabajo ficticio: 404.
- Recuperación de solicitud desde acción: 403.
- Recuperación de solicitud inexistente desde backend: 404.

`.env.local`, ignorado por Git, recibió la URL activa y `CLOUDFLARE_BACKEND_SECRET`. Se conservó la configuración Gemini y `CLOUDFLARE_DIRECT_UPLOAD_ENABLED=false`. `check:env` pasó. El watcher local recargó el servidor sin cambiar el contenido del archivo observado; `/api/health` respondió 200. Firestore `(default)` está disponible. Se publicaron las seis exclusiones nuevas de índices y `check:firestore-config` pasó: diez exclusiones activas en total y ambos índices compuestos existentes READY.

La credencial del backend tiene lectura de índices; el primer PATCH fue rechazado con 403 y no produjo cambios. Se utilizó la sesión Firebase CLI ya existente del operador para publicar únicamente las seis exclusiones (`firestore:indexes`), con manifiesto temporal acotado, sin `--force`. No se ampliaron permisos del backend, ni se publicaron reglas o modificaron documentos. Las reglas remotas son iguales a las locales salvo un comentario. La configuración previa de los seis campos se conservó fuera de OneDrive para poder revertir este ajuste.

El campo `direct_upload` de la salud Worker indica capacidad del Worker; no habilita el interruptor de Lexiapp. `MAX_DURATION_SECONDS=36000` reservaría hasta 600 minutos TUS, más que los 534,06 disponibles en la consulta. TUS permanece desactivado y su reserva debe ajustarse antes de probarlo.

## Prueba real con datos sintéticos

Se generó localmente un video H.264/AAC de 24,776 segundos con voz Sabina en español de México, sin datos personales ni documentos judiciales. Solo ese archivo de 987.354 bytes se envió una vez por multipart. Stream respondió 200 y confirmó eliminación programada aproximadamente 31 días después. El adaptador backend recuperó la misma solicitud por su identificador estable y validó los estados de video y generación de captions. Recuperó seis segmentos en tres páginas de dos segmentos, verificó índices/tiempos/cursor y SHA-256 del conjunto completo. Otro propietario recibió 404. La eliminación de este video respondió 200 y su consulta posterior 410.

El reconocimiento no coincidió exactamente con el texto hablado: escribió «del EXIAP-P» por «de Lexiapp», dígitos por palabras y añadió espacios. La fuente recuperada conserva los captions literalmente, sin corregir ni inventar hablantes. La prueba demuestra transporte, integridad y aislamiento; no acredita transcripción jurídica exacta ni diarización.

La prueba no utiliza OpenAI ni lee el conocimiento jurídico. No autoriza eliminar los 27 videos anteriores. El estado de la prueba se conserva fuera de OneDrive para recuperar una respuesta incierta sin repetir la carga.

La persistencia real se comprobó por separado con `TranscriptStore`/`WorkspaceRepository`: seis segmentos sintéticos, tres páginas y tres bloques, recuperación con otra instancia del SDK, huella y texto literal íntegros. La finalización prematura fue rechazada con 409 y siete accesos de otro propietario con 403. Se retiraron únicamente la reserva, trabajo y bloques de esos UUID y se verificaron cero registros restantes. No se crearon usuarios Auth ni se llamaron proveedores. El informe de metadatos quedó en `%LOCALAPPDATA%/Lexiapp/smoke-persistence/qa-segments-73eab8aa-0b2a-4666-8d22-ee3732f6416f.json`.

## Acción GPT: compatibilidad y actualización manual

Clave de acción → `crearTranscripcion` devuelve `job_id` y `job_token` → consultas con `job_token` en query → el Worker verifica su registro → páginas completas con `next_offset` → comprobación del total y hash. Los trabajos anteriores sin registro no se reclaman automáticamente.

Las páginas GPT miden como máximo 90.000 bytes y 90.000 caracteres del JSON real. El backend conserva 700 KiB por página. Un segmento o rango excesivo falla sin truncar texto ni fingir recuperación completa. Se conserva `x-job-token` para clientes anteriores; duplicados query o transportes en conflicto se rechazan sin revelar sus valores. Estos límites se ajustan a las [restricciones de GPT Actions](https://developers.openai.com/api/docs/actions/production).

Abrir el GPT propio → **Editar GPT → Configurar → Acciones → transcriptor-legal.yoshiman1989.workers.dev**:

1. En la ventana local **Lexiapp · Conectar acción del GPT**, pulsar **Copiar esquema** y reemplazar todo el campo **Esquema** de la acción.
2. En **Autenticación**, seleccionar **API Key → Bearer**. Pulsar **Copiar clave de acción** en Lexiapp y pegarla en el campo de clave, sin añadir la palabra `Bearer`. Guardar la autenticación. Es la clave propia de esta acción, no una clave de Gemini/OpenAI.
3. Volver a **Configurar → Instrucciones** y reemplazar todo el campo con **Copiar instrucciones completas**. El archivo revisado tiene 7.977 caracteres y sustituye únicamente TRANSCRIPCIÓN DE VIDEO; conserva DECLARACIONES y todas las demás reglas y referencias exactamente.
4. Guardar los cambios del GPT mediante **Actualizar/Guardar** y conservar su visibilidad actual.

La primera edición manual superó 8.000 caracteres y el editor mostró **Error al guardar borrador**. Se reconstruyó el texto completo desde las instrucciones originales, cambiando únicamente TRANSCRIPCIÓN DE VIDEO y verificando prefijo/sufijo idénticos. El usuario indicó «listo» tras copiar el conjunto mediante **Copiar instrucciones completas**. `docs/gpt_instructions_full.txt` tiene 7.977 unidades UTF-16 y puntos de código (8.149 bytes UTF-8), LF y sin BOM. Las reglas jurídicas y DECLARACIONES permanecen intactas.

El esquema está en `workers/transcriptor-legal/openapi.yaml`. El bloque técnico está en `docs/gpt_transcription_action.txt`: nombres reales de las cuatro operaciones, estado `completed`, páginas completas y autorización por trabajo. Sustituir solo ese bloque deja las instrucciones originales en 7.977 caracteres, dentro del límite de 8.000. No cambia las reglas jurídicas.

El formulario `scripts/cloudflare-action-setup.ps1` lee únicamente las claves propias mediante DPAPI, muestra la clave enmascarada y copia cada elemento solo al pulsar su botón. No publica ni llama a APIs. El guardado del GPT debe confirmarse sin aviso rojo antes de probar. Consultar el trabajo ficticio `lexia-smoke-gpt-20261002` con token `prueba-sin-datos` debe devolver 404 / `job_not_found`, sin iniciar cargas; 401 señalaría autenticación incorrecta.

Durante el diagnóstico inicial, el usuario aclaró que el «500» conversacional era `AttributeError` antes de HTTP. La acción mínima alcanzó después el Worker al corregir importación y Bearer. Finalmente restauró el esquema completo de cuatro operaciones, sin avisos, guardó/actualizó y confirmó `job_not_found` desde Vista previa. Esa respuesta valida conexión y autenticación de la consulta con el esquema completo, sin afirmar que sus operaciones de carga, paginación o borrado se hayan probado desde el GPT. La interfaz no mostró el código HTTP; una consulta directa independiente con Action Bearer devolvió 404 y `job_not_found`. Las capturas temporales no escriben archivos de logs y solo imprimen códigos/booleans, sin encabezados ni tokens.

Para reabrir el formulario de conexión:

```powershell
pwsh -STA -NoProfile -File scripts/cloudflare-action-setup.ps1
```

## Validación local

### Diagnóstico del intérprete de acciones

Después de reemplazar las instrucciones completas, el usuario recibió `Encountered exception: <class 'AttributeError'>`, sin HTTP. Se aisló la consulta mediante `workers/transcriptor-legal/openapi.diagnostic.yaml`: una sola GET con dos parámetros inline, mismo servidor/Bearer y respuestas simples, sin referencias ni uniones nullable. Es un esquema temporal; no cambia el Worker ni permite crear/eliminar archivos. Conserva el carácter consequential del GET y utiliza exclusivamente el trabajo ficticio.

Flujo aplicado: formulario `-Diagnostic` → esquema temporal → corrección del importador → consulta ficticia → corrección API Key/Bearer → respuesta JSON del Worker → formulario normal → restauración de `openapi.yaml` con cuatro operaciones sin avisos → guardado/actualización → nueva consulta de Vista previa con `job_not_found`. El diagnóstico de conexión queda resuelto; no se usaron cargas, páginas ni borrado desde el GPT.

El aviso real del importador fue **In components section, schemas subsection is not an object**. El esquema mínimo omitía `components.schemas` y se corrigió añadiendo `schemas: {}`. El esquema de producción ya contiene ese objeto; no se atribuye el fallo original de producción a la misma omisión.

Con el esquema mínimo corregido, la acción devolvió `unauthorized` y la captura temporal confirmó 401. Después de seleccionar **API Key → Bearer** y copiar la clave, mostró `job_not_found`, sin código HTTP visible. Ese mismo resultado se confirmó posteriormente con el esquema completo restaurado. No hubo carga ni generación durante las consultas ficticias.

Se reparó y publicó una regresión independiente en la URL de política `/privacy`, reutilizando el HTML original revisado para GET público y manteniendo trabajos protegidos. Las 16 pruebas Worker y dry-run de 33,75 KiB pasan. La versión activa respondió GET `/privacy` 200 con HTML original, Content-Type correcto y `nosniff`; `/health` 200 con contrato 2; trabajo ficticio sin autenticación 401; consultas ficticias de acción y backend con propietario 404; POST `/privacy` sin autenticación 401. No se atribuye el diagnóstico del intérprete a esta regresión.

Se conserva `openapi.public-diagnostic.yaml` como respaldo de aislamiento, con GET `/health` sin parámetros ni autenticación. No se aplicó al GPT: la consulta mínima autenticada ya alcanzó el Worker. No sustituye el esquema completo para usar transcripciones.

Tras reparar la inyección de dependencias, pasan 114/114 pruebas unitarias/integración (16 Worker incluidas) y typecheck. Con las 39 de interfaz y 29 Emulator previamente aprobadas, sin cambios relevantes en esos alcances, el total vigente es 182. El bundle Worker es de 33,75 KiB. Las comprobaciones automáticas no llaman a IA ni sustituyen una evaluación de precisión jurídica o hablantes con material autorizado. TUS continúa apagado/sin prueba real y Word/ciclo del video siguen pendientes de la fase 4.

Fuentes: [autenticación de GPT Actions](https://developers.openai.com/api/docs/actions/authentication), [keyring de Wrangler](https://developers.cloudflare.com/workers/wrangler/commands/general/), [tokens Cloudflare](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/), [permisos de API](https://developers.cloudflare.com/fundamentals/api/reference/permissions/).
