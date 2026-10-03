# Worker reparado del transcriptor

Worker reparado publicado el 2 de octubre de 2026, con la versión `eba0202b-e5b1-4ddb-94ad-1994732b8b87` al 100 % del tráfico y fecha de compatibilidad `2026-10-02`. Incluye la reparación de GET público `/privacy`. Acceso, captions y recuperación íntegra con MP4 sintético y persistencia de bloques Firestore pasaron. El usuario restauró el esquema GPT de cuatro operaciones sin avisos, guardó/actualizó y confirmó `job_not_found` en Vista previa: conexión y Bearer verificados con el esquema completo, sin código HTTP mostrado en esa respuesta. TUS permanece apagado; Word/ciclo del video siguen pendientes de la fase 4.

## Configuración

Este proyecto tiene su propio `wrangler.toml`; el archivo de la raíz corresponde a Pages. Configura el identificador de cuenta real en `CF_ACCOUNT_ID` y los bindings `STREAM` y `JOURNAL`. `JOURNAL` utiliza una clase SQLite respaldada por Durable Objects para reservar solicitudes antes de contactar con Stream y verificar quién puede acceder a cada trabajo. KV eventualmente consistente no se utiliza para exclusión de cargas.

| Variable/binding | Uso |
| --- | --- |
| `ACTION_API_KEY` — secreto obligatorio | Credencial publicada para la autenticación Bearer de la acción GPT, comprobada con la consulta ficticia del esquema completo. Sin ella, las rutas privadas devuelven 503. |
| `LEXIA_API_KEY` — secreto independiente | Credencial exclusiva del backend Lexiapp. Debe diferir de `ACTION_API_KEY`; habilita propiedad por UID y TUS. Nunca se envía al navegador. |
| `CF_API_TOKEN` — secreto obligatorio | Token de Stream con lectura y edición de la cuenta seleccionada. |
| `CF_ACCOUNT_ID` | Identificador de esa cuenta. |
| `STREAM` | Binding nativo Stream para carga por enlace y borrado. |
| `JOURNAL` | Binding de `JobJournal`; obligatorio para las rutas privadas. |
| `CORS_ORIGINS` | Orígenes HTTPS exactos separados por comas. Vacío deshabilita solicitudes de navegador con Origin. El backend y las acciones sin Origin siguen sujetos a autenticación. |
| `RETENTION_DAYS` | 31 por defecto, entero entre 31 y 1095. |
| `MAX_DURATION_SECONDS` | Reserva máxima de TUS: 36000 por defecto, entero de 1 a 36000. Ajustar a la capacidad contratada antes de uso real. |

Wrangler 4.147.0 está fijado en el `package.json` y lockfile del subproyecto, sin cambiar dependencias de la app. Antes de publicar, comprobar el bundle y el Worker existente. La sesión OAuth autorizada utiliza el almacén de credenciales de Windows mediante `wrangler login --use-keyring`:

```powershell
Set-Location workers/transcriptor-legal
npm ci --ignore-scripts
npm run check:worker
```

El backend local tiene `CLOUDFLARE_WORKER_URL` y `CLOUDFLARE_BACKEND_SECRET` configurados; esta última corresponde a `LEXIA_API_KEY`. La selección de Gemini se conserva. `CLOUDFLARE_TRANSCRIPTION_SECRET` identifica la credencial heredada/de la acción; no sustituye la separación de claves para este Worker. `CLOUDFLARE_DIRECT_UPLOAD_ENABLED` permanece `false`: habilitar TUS únicamente después de una prueba del servicio y su capacidad real. La versión publicada elimina la alternativa fija del código y utiliza los secretos nuevos.

Para este Worker existente, la activación debe publicar código y los tres secretos juntos mediante `wrangler deploy --secrets-file` con un archivo temporal protegido fuera de OneDrive. No imprimir su contenido ni introducir secretos como argumentos. No ejecutar previamente `wrangler secret put`: publica inmediatamente y podría cambiar la autenticación de la versión antigua. No usar `--keep-vars`, ya que la configuración nueva declara las variables que necesita. Los secretos omitidos del archivo se conservan; quitar un binding no elimina su recurso. [Secretos y publicación atómica](https://developers.cloudflare.com/workers/configuration/secrets/).

**La publicación real ya se ejecutó.** Se aplicaron conjuntamente código y los tres secretos `ACTION_API_KEY`, `LEXIA_API_KEY` y `CF_API_TOKEN`, registrados como `secret_text`. La configuración declarativa `[exports.JobJournal]` creó almacenamiento SQLite en el namespace `e41bcfa23b1a40729459d22b45c634a4`; el inventario previo no contenía clases ni migraciones. Si una publicación posterior falla o pierde su respuesta, comprobar primero la versión activa y los namespaces mediante consultas de lectura. Conservar `JobJournal`, su declaración `storage = "sqlite"` y su exportación en todas las publicaciones posteriores. No cambiar nombres, marcarlo eliminado ni retirar la clase para intentar deshacer esa incorporación. El rollback no cruza cambios del ciclo de vida de Durable Objects; la reparación se publica hacia adelante preservando la clase. Un código antiguo sin exportar `JobJournal` no basta para restaurar el Worker. [Ciclo de vida y declaración de clases](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/).

La reparación posterior de privacidad se publicó solo con código, pasando de `ccee90f9-8275-4649-a12d-a5553cd9346a` a la versión activa indicada arriba. Se conservaron los mismos tres bindings `secret_text` y el namespace `JOURNAL`. La CLI confirmó `keepSecrets:true` predeterminado, sin `--keep-vars` ni archivo temporal de secretos. GET `/privacy` respondió 200 con HTML original, Content-Type y `nosniff`; salud200, trabajo sin clave401, consultas ficticias acción/backend404 y POST privacidad sin clave401 también pasaron. No hubo nuevas cargas ni llamadas a IA.

Activación del 2 de octubre: sesión autorizada, cuenta Yoshiman1989 y token Stream verificados; `account_id` y `CF_ACCOUNT_ID` coinciden en `wrangler.toml`. Antes de publicar se verificó el bundle con dry-run y se respaldó el código/configuración anteriores fuera de OneDrive. Las siete comprobaciones remotas posteriores verificaron salud y rechazos esperados de autenticación/acceso, incluidas consultas con propietario a un trabajo inexistente (404) y recuperación de solicitudes con la clave de acción (403). No se hicieron cargas durante esas comprobaciones; no acreditan captions, literalidad ni retención reales. Seguimiento: [cloudflare_setup.md](../../docs/cloudflare_setup.md).

## Contrato y propiedad

| Ruta | Autorización y resultado |
| --- | --- |
| `GET /health` | Público, sin llamada a Stream. Contrato 2 y capacidades de configuración. |
| `GET /privacy` | Política HTML original revisada, pública y sin llamadas a Stream/Journal. Otros métodos no evitan la autenticación. |
| `POST /jobs` | JSON con `openaiFileIdRefs` de exactamente un archivo. GPT recibe `job_id` y `job_token`. Conservar ambos. |
| `POST /api/transcribe` / `/transcribe` | Conserva multipart con un `File` real y extensión/firma permitida, máximo 100 MiB. Requiere exclusivamente `LEXIA_API_KEY`, `X-Owner-Id` y `X-Request-Id` estable; la clave de la acción se rechaza antes de leer/subir el archivo. |
| `GET /jobs/{id}` | Backend: `LEXIA_API_KEY` + `X-Owner-Id`. GPT: `ACTION_API_KEY` + parámetro query `job_token` del trabajo. Se conserva `X-Job-Token` para clientes existentes; si header y query difieren, se rechaza la solicitud sin reflejar los tokens. Puede iniciar captions; por eso no es una operación exclusivamente de lectura. |
| `GET /jobs/{id}/transcript?offset=0&limit=200` | Misma propiedad. Máximo 200 segmentos por página. GPT: JSON real de hasta 90.000 bytes y 90.000 caracteres; backend: hasta 700 KiB. Usar siempre `next_offset`, incluso si la página trae menos que `limit`. Un cue que no cabe produce error controlado, sin recortar su texto. |
| `GET /requests/{request_id}` | Solo backend y propietario. Recupera una aceptación registrada cuya respuesta se perdió, incluidas cargas multipart. |
| `POST /uploads` | Solo backend y propietario. JSON `{request_id,owner_id,filename,size,mime}` para `.mp4`, `.webm`, `.mov`, `.avi`, con límite 2 GiB; devuelve `{request_id,job_id,status:'uploading',upload_url,size,expires_at:null,scheduled_deletion:null,scheduled_deletion_requested}`. |
| `GET /uploads/{request_id}` | Recupera la misma dirección TUS; **no informa un porcentaje ni cursor ficticio**. El cliente consulta `HEAD` del endpoint TUS para conocer `Upload-Offset`. |
| `DELETE /jobs/{id}` | Propiedad/token obligatorio y eliminación remota explícita. No acredita Word; ese control del backend pertenece a la fase funcional 4. Repetir una eliminación confirmada no vuelve a llamar al proveedor. |

Se conservan los alias `/api/transcribe/jobs/{id}` y `/api/transcribe/jobs/{id}/transcript`. Las consultas temporales `start`/`end` también están disponibles para clientes directos y validan finitud y orden; su respuesta no reemplaza la recuperación paginada íntegra de Lexiapp. Aplican el mismo presupuesto del JSON que las páginas según el cliente: si el rango completo no cabe, devuelve `502 transcript_range_too_large` y recomienda recuperar páginas, sin truncar segmentos.

Los trabajos previos a este registro no se autorizan por conocer su identificador: devuelven 404 hasta una migración verificada. No se incluye un endpoint que permita a un cliente atribuirse un video existente. El usuario restauró las cuatro operaciones de `openapi.yaml` sin avisos y confirmó la consulta ficticia desde el GPT; debe preservar `job_token` en trabajos reales. Una clave compartida GPT sin token por trabajo permitiría acceder a videos de otras conversaciones.

GPT Actions no admite headers personalizados y requiere payloads inferiores a 100.000 caracteres. El esquema utiliza por ello `job_token` en query y las páginas GPT reservan margen hasta 90.000. El presupuesto incluye el JSON escapado y el campo `text` conservado para clientes existentes. No registrar URLs con tokens ni divulgar el token en documentos. El backend ignora los tokens query y sigue autorizando por clave independiente y UID. [Límites oficiales de GPT Actions](https://developers.openai.com/api/docs/actions/production).

`openaiFileIdRefs` se declara como array de strings en OpenAPI; en ejecución ChatGPT lo sustituye por objetos con `id`, `name`, `mime_type` y `download_link`. El Worker acepta ese contrato. [Documentación oficial de archivos de GPT Actions](https://developers.openai.com/api/docs/actions/sending-files).

## Fuente e integridad

Video listo no equivale a transcripción lista. Estados: `uploading` cuando Stream confirma `pendingupload`, `processing_video`, `video_ready` (recepción), `generating_transcript`, `completed` y `error`. La etapa `uploading` permite que Lexiapp reanude con HEAD/PATCH; no se sustituye por procesamiento antes de completar la transferencia. El porcentaje de `video_status` corresponde al video. El endpoint de estado no devuelve el texto completo; el GPT y Lexiapp deben recuperar las páginas.

El parser omite identificadores de cues, notas y estilos, preserva tiempos y saltos internos, decodifica entidades y extrae hablante únicamente de etiquetas WebVTT `<v Nombre>`. Si un cue contiene voces diferentes, no asigna un hablante único. Cada cue requiere duración positiva y el hablante tiene máximo 250 caracteres, igual que el validador del backend. No crea identificadores SPK ni supone funciones jurídicas. Un VTT vacío o inválido devuelve error, nunca una frase de diagnóstico como fuente.

Cada página contiene `job_id`, `status:'completed'`, `language:'es'`, `total_segments`, `offset`, `limit`, `next_offset`, `segments` y `transcript_hash`. SHA-256 se calcula sobre `JSON.stringify` del conjunto completo de segmentos con propiedades en orden `index,start,end,text,speaker` (speaker solo si existe), sin modificar el texto entre páginas. El límite de lectura VTT es 16 MiB y cada texto de segmento tiene máximo 256 KiB.

La retención se transmite al proveedor mediante `scheduledDeletion` en carga JSON y multipart; si Stream no la confirma en la recepción multipart, se aplica mediante su endpoint documentado de edición y se verifica la respuesta. TUS envía `scheduleddeletion` en `Upload-Metadata`, junto con `maxdurationseconds` y `requiresignedurls`. `scheduled_deletion_requested` es la solicitud; `scheduled_deletion` solo presenta el valor confirmado por Stream. La respuesta inicial TUS no confirma retención, duración o fecha de expiración: se obtienen del proveedor después. [Opciones TUS y retención](https://developers.cloudflare.com/stream/uploading-videos/resumable-uploads/), [edición de metadatos](https://developers.cloudflare.com/api/resources/stream/).

## Recuperación y límites pendientes

Una solicitud se reserva atómicamente antes de la carga. Un reintento de la misma solicitud confirmada devuelve el mismo identificador sin otra carga. Si el proceso pierde la respuesta de Stream antes de guardar su identificador, queda `pending`: devuelve `409 recovery_required` y no intenta otra carga. Esa ambigüedad requiere revisar el proveedor y vincular la recepción verificadamente; el sistema no promete una garantía distribuida de exactamente una entrega cuando Stream no ofrece idempotencia. El registro conserva metadatos mínimos de autorización/idempotencia y direcciones de carga; no almacena la transcripción. La retención de Stream no implica borrado automático del registro local.

Cloudflare exige TUS sobre 200 MB y documenta un mínimo de 5 MiB por chunk salvo el último. Las cargas directas reservan duración en la capacidad de Stream. El límite de 2 GiB del contrato local no demuestra que la cuenta, el navegador y cada formato de audio admitan el archivo real. La capacidad y compatibilidad se validan antes de habilitar producción. [Cargas directas](https://developers.cloudflare.com/stream/uploading-videos/direct-creator-uploads/).

El diagnóstico previo incluyó rechazo de instrucciones por superar 8.000 caracteres y `AttributeError` sin HTTP; el 500 conversacional no fue un código confirmado del Worker. Se corrigió en el esquema mínimo el aviso del importador añadiendo `components.schemas: {}`. Producción ya declaraba ese objeto, por lo que no se atribuye a esa omisión el fallo original.

El usuario indicó «listo» tras [gpt_instructions_full.txt](../../docs/gpt_instructions_full.txt), de 7.977 caracteres, LF y sin BOM, con todas las reglas ajenas a TRANSCRIPCIÓN DE VIDEO idénticas. Tras corregir importación y API Key/Bearer en el diagnóstico mínimo, restauró `openapi.yaml` con cuatro operaciones sin avisos y guardó/actualizó. La nueva consulta de Vista previa mostró `{error:"No se encontró el trabajo.",code:"job_not_found"}`, confirmando conexión y Bearer con el esquema completo. No mostró un código HTTP; la comprobación directa independiente sí devolvió 404 con ese código. Este diagnóstico no probó carga, paginación ni borrado desde el GPT. TUS sigue deshabilitado; Word/ciclo del video corresponden a fase 4, Gemini se conserva y OpenAI/saldo quedan para el final.

## Ensayo real con Stream

Se cargó únicamente un MP4 técnico sintético de 24,776 segundos y 987 354 bytes; la recepción devolvió 200 y Stream confirmó la programación de borrado a 31 días. La recuperación de la solicitud backend devolvió el trabajo registrado. Se recuperaron sus seis segmentos en tres páginas de dos segmentos, con índices y SHA-256 del conjunto verificados, tiempos entre 0 y 23,92 segundos y 346 caracteres de texto. La consulta con otro propietario devolvió 404.

El texto reconocido no coincidió exactamente con la frase pronunciada: hubo diferencias en el nombre Lexiapp, representación de los dígitos 7/3 y espaciados. La paginación conservó literalmente los captions recibidos, sin corregirlos. Este ensayo acredita su recuperación íntegra; requiere revisión humana para fidelidad al audio.

Se eliminó solamente el video de prueba: DELETE devolvió 200 y la consulta posterior, 410. Los videos anteriores permanecieron sin cambios. La fecha de retención fue confirmada por el proveedor; el borrado automático al vencimiento no se observó porque el clip se eliminó durante la prueba. TUS sigue deshabilitado y sin ensayo real.

Se publicaron seis exclusiones nuevas de Firestore mediante Firebase CLI con OAuth del operador, sin `--force` ni escrituras de documentos. La comprobación real mostró los diez campos excluidos y los índices compuestos `READY`. Se mantuvieron las reglas de acceso y no se ampliaron los permisos de la cuenta de servicio de ejecución.

La prueba posterior de persistencia en Firestore real guardó seis segmentos en tres páginas y tres bloques. Un cliente SDK nuevo reanudó y verificó hash y texto literal; la finalización anticipada devolvió 409 y siete operaciones de otro propietario fueron rechazadas con 403. Se limpiaron únicamente los datos de esa prueba, con cero registros remanentes. Esta prueba no llamó al Worker ni a una API de IA.

## Verificación local

Desde la raíz:

```powershell
npx tsx --test scripts/tests/worker-phase3.test.ts
```

Dieciséis pruebas verifican autenticación sin alternativa fija, CORS, propiedad/token query y compatibilidad del header, WebVTT literal y SHA-256, reserva concurrente y respuesta perdida, validación multipart y retención confirmada, 205 segmentos sin saltos, límites reales de JSON GPT/backend, errores de rangos/cues, captions, TUS de 2 GiB con proveedor simulado y privacidad HTML pública sin llamadas a proveedor/registro, con el resto de métodos protegidos.

En la preparación anterior, `npm run check:worker`, dentro del subproyecto, terminó correctamente con Wrangler 4.147.0: bundle TypeScript de 32,08 KiB y configuración/bindings `STREAM`/`JOURNAL` reconocidos mediante dry-run. Un arranque `wrangler dev --local` también respondió `/health` con 200 y consultó el registro SQLite mediante `/jobs/nonexistent` con 404 controlado. Wrangler indica que Stream **no está soportado en emulación local**; esas comprobaciones acreditan bundle/configuración y acceso local al Durable Object, no llamadas reales a Stream. El arranque local utilizó solamente credenciales sintéticas y no cargó ni eliminó archivos del proveedor.

Tras reparar la inyección de dependencias, pasan 114/114 pruebas unitarias/integración (16 Worker incluidas), typecheck y dry-run de 33,75 KiB. Con las 39 de interfaz y 29 Emulator previas, sin cambios relevantes en esos alcances, el total vigente es 182. Las comprobaciones remotas y Stream se registran por separado; no acreditan TUS real ni fidelidad lingüística completa.

[Bindings Stream](https://developers.cloudflare.com/stream/manage-video-library/bindings/), [almacenamiento Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/access-durable-objects-storage/), [declaración de clases](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/).
