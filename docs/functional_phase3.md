# Fase funcional 3 Integración y reparación del transcriptor

Estado: Worker reparado activo el 2 de octubre de 2026 y backend local conectado; acceso, ensayo de Stream con MP4 sintético, persistencia real de bloques Firestore y conexión/autenticación del GPT con el esquema completo verificados. El usuario guardó las instrucciones completas de 7.977 caracteres. La aceptación sigue parcial por TUS, que permanece deshabilitado, y las pruebas reales pendientes de capacidad/formato. La exactitud completa del reconocimiento no está acreditada. Gemini se conserva para generación y OpenAI/saldo se dejan para el final. El transcriptor utiliza Cloudflare Stream y no invoca OpenAI.

## Flujo documentado antes de codificar

Archivo permitido y dentro del límite visible → registro de carga del propietario → carga al Worker → identificador remoto guardado → consulta del mismo trabajo → recuperación paginada de segmentos → bloques verificados guardados → comprobación de integridad → fuente literal disponible → descarga o elaboración. Detener la espera o recargar no crea otra carga cuando ya existe un identificador.

Video listo no significa transcripción lista. Se distinguen procesamiento del video, generación de captions y recuperación de segmentos. El porcentaje solo representa el procesamiento de video cuando el proveedor lo devuelve. Un diagnóstico, VTT vacío o una página incompleta no se convierte en declaración.

La fuente conserva tiempos, texto, orden y hablante únicamente cuando el proveedor lo identifica. Las páginas se validan antes de guardar: identidad, conteos, índices, cursores, orden temporal y consistencia de la versión. La recuperación continúa desde bloques confirmados y no declara éxito hasta terminar y comprobar el conjunto.

Las transcripciones extensas se almacenan en bloques de `transcriptionJobs/{id}/segments`; el documento padre contiene metadatos y un punto de reanudación. El backend verifica propietario antes de consultar, recuperar o eliminar. Las reglas del navegador permanecen cerradas para trabajos y bloques. Los límites del redactor se mantienen visibles y no se trunca una fuente para encajarla.

Se reutiliza el código aportado del Worker, sin copiar su secreto fijo. La versión reparada conserva las rutas del GPT y de la web, exige un secreto configurado, valida paginación, trata errores y ausencia de texto explícitamente, transmite la retención al proveedor y conserva los metadatos del VTT. Su configuración y OpenAPI se guardan junto con instrucciones de despliegue. El borrado automático condicionado a Word corresponde a la fase funcional 4.

La carga grande requiere la modalidad TUS del proveedor, un registro previo y recuperación del progreso real de carga; no se aumenta solamente el límite de Express. El límite multipart existente permanece explícito hasta que la modalidad directa esté implementada y verificada. Una aceptación cuya respuesta se pierde no debe provocar otro procesamiento automáticamente.

## Verificación y dependencias

Se comprobaron seguridad y rutas del Worker con bindings simulados, paginación de más de 200 segmentos, errores y reanudación, fuentes extensas, propiedad y limpieza en Firestore Emulator, y flujos de carga/recuperación de la interfaz. Las comprobaciones del servicio real dependen de los bindings y secretos de Cloudflare y de la versión efectivamente desplegada; se separan de las pruebas locales y del saldo de OpenAI.

## Implementación

- `workers/transcriptor-legal/`: Worker reutilizado, TypeScript, configuración propia Wrangler/Stream/Durable Objects, secretos separados para GPT y backend y OpenAPI actualizado. La clave fija del adjunto no se copió. El GPT conserva `job_id` y `job_token`; cada consulta exige el token de ese trabajo. El backend utiliza su clave exclusiva y UID. Multipart se restringe al backend; el GPT conserva la entrada JSON.
- `shared/transcription.ts` y `shared/transcriptSegments.ts`: estados, manifiesto verificado y contrato de segmentos con SHA-256 canónico. Índices contiguos, tiempos finitos, orden temporal, cursores y conteos exactos; no se inventan hablantes. Se permiten intervenciones temporalmente superpuestas.
- `CloudflareTranscriptionService`: reconoce video pendiente de carga/procesamiento, generación de captions y recuperación. Ignora el texto plano del estado remoto y recupera exclusivamente páginas verificables; acota respuestas y cancelaciones.
- `TranscriptStore` y `WorkspaceRepository`: reserva previa en `transcriptionRequests`, vinculación al propietario y bloques inmutables en `transcriptionJobs/{id}/segments`. Transacciones preservan cursor, versión y estado terminal. El padre guarda únicamente metadatos del último segmento. Un reinicio después de guardar la última página reanuda la comprobación final sin pedir otra página fuera de rango.
- `server/routes/transcription.ts`: capacidades autenticadas, creación/recuperación de la misma reserva, consulta con una página durable por llamada y páginas de fuentes completadas. Comprueba propietario antes de contactar al proveedor. El manifiesto se declara completado únicamente tras comprobar todo el conjunto.
- `TranscriptionService` y `useTranscription`: multipart hasta 100 MiB; TUS para videos grandes o MOV/AVI, si está habilitado, hasta 2 GiB. Bloques de 8 MiB, progreso confirmado por `Upload-Offset`, destinos HTTPS permitidos y sin credenciales de Lexiapp en la solicitud a Stream. Reanudar utiliza GET, HEAD y PATCH; no repite POST. `sessionStorage` conserva solo `{requestId,kind}`.
- Transcripción y editor: reanudación mediante reselección del archivo original y comprobación de su identidad, recuperación de trabajos guardados y etapas sin porcentajes inventados. La vista previa se limita explícitamente a 30 000 caracteres; la descarga conserva toda la fuente. El editor recibe únicamente una fuente completa que quepa en sus límites; no se envía un recorte automático. Una fuente mayor queda archivada para descarga y trabajo explícito por partes.

La huella de archivo TUS incluye nombre, tamaño, MIME, fecha de modificación y SHA-256 del primer MiB. Es una comprobación de reselección, no un hash completo del archivo. El conjunto de segmentos sí se comprueba íntegramente tanto en servidor como en navegador.

Límites explícitos: 20 MiB de fuente JSON recuperada, 16 MiB de WebVTT en Worker, 200 segmentos y 700 KiB por página, texto de un segmento hasta 256 KiB. Un límite o inconsistencia produce error visible sin una fuente truncada de éxito. Los límites del redactor siguen siendo 500 000 caracteres por fuente y 700 000 bytes por borrador; las dos copias de la fuente cuentan en ese tamaño.

## Activación del servicio real

La versión activa del 2 de octubre es `eba0202b-e5b1-4ddb-94ad-1994732b8b87` al 100 % del tráfico, con fecha de compatibilidad `2026-10-02`. Conserva los secretos `ACTION_API_KEY`, `LEXIA_API_KEY` y `CF_API_TOKEN` como `secret_text`, sin reproducir sus valores, y el namespace SQLite de `JobJournal`, `e41bcfa23b1a40729459d22b45c634a4`. Se restauró la ruta original `GET /privacy`, pública y con respuesta 200. El backend local tiene la URL del Worker y su clave independiente configuradas en `.env.local`. Gemini se conserva como proveedor de generación y `CLOUDFLARE_DIRECT_UPLOAD_ENABLED=false`.

Las siete comprobaciones remotas posteriores pasaron: salud, autenticación y restricciones de acceso, incluidas consulta con propietario a un trabajo inexistente (404) y recuperación de solicitudes con la clave de acción (403). No cargaron archivos ni generaron captions; acreditan activación y controles de acceso, sin demostrar literalidad ni retención aplicada. Seguimiento: [configuración Cloudflare](cloudflare_setup.md), [Gemini para pruebas](gemini_testing.md), [README del Worker](../workers/transcriptor-legal/README.md).

El GPT conserva [openapi.yaml](../workers/transcriptor-legal/openapi.yaml), la autenticación Bearer y `job_token`. La importación se corrigió con `schemas: {}` en el esquema diagnóstico y se copió la clave Bearer. Después se restauró el OpenAPI de producción con sus cuatro operaciones, sin avisos. La consulta ficticia final del GPT devolvió `job_not_found`, validando conexión y autenticación con el esquema completo. El GPT no expuso el código HTTP; la consulta directa confirmó 404.

El botón «Copiar instrucciones completas» entrega [gpt_instructions_full.txt](gpt_instructions_full.txt), de 7.977 caracteres, con LF y sin BOM. Solo sustituye TRANSCRIPCIÓN DE VIDEO; todas las reglas jurídicas previas y posteriores permanecen exactamente iguales. El usuario confirmó su guardado. En esta actualización y consulta ficticia no se hicieron llamadas a IA ni nuevas cargas.

El ensayo real de Stream cargó únicamente un MP4 técnico sintético de 24,776 segundos y 987 354 bytes, con recepción 200 y programación de borrado a 31 días confirmada por el proveedor. La recuperación de la solicitud backend devolvió el trabajo registrado. Los seis segmentos se recuperaron en tres páginas de dos, con tiempos de 0 a 23,92 segundos, 346 caracteres de texto e integridad SHA-256 del conjunto verificada. Otro propietario recibió 404. Se eliminó solamente el clip de prueba: DELETE 200 y consulta posterior 410. Los videos anteriores permanecieron sin cambios.

El reconocimiento no coincidió exactamente con la frase hablada: hubo diferencias en el nombre Lexiapp, los dígitos 7/3 y espaciados. La recuperación conserva literalmente los captions recibidos, sin corregirlos. La integridad del conjunto no acredita exactitud lingüística; la fuente requiere revisión humana contra el audio. Se comprobó la fecha de retención solicitada y confirmada, sin observar su ejecución automática porque el clip se eliminó durante el ensayo.

Se publicaron seis exclusiones nuevas de Firestore mediante Firebase CLI con OAuth del operador, sin `--force` ni escrituras de documentos. La comprobación real de configuración mostró los diez campos excluidos e índices compuestos `READY`. Las reglas de acceso siguen denegando acceso directo a reservas, trabajos y segmentos; se mantienen y no se ampliaron permisos de la cuenta de servicio de ejecución para publicar índices.

La prueba posterior en Firestore real guardó seis segmentos en tres páginas y tres bloques. La reanudación con un cliente SDK nuevo preservó hash y texto literal; la finalización anticipada devolvió 409 y siete operaciones de otro propietario fueron rechazadas con 403. La limpieza dejó cero registros de prueba remanentes. Esta comprobación no llamó al Worker ni a una API de IA.

Pendientes de aceptación:

1. Ensayar TUS e interrupción/reanudación, formatos de audio/video y capacidad/duración en la cuenta real antes de habilitar `CLOUDFLARE_DIRECT_UPLOAD_ENABLED=true`. El contrato local de 2 GiB no acredita esa capacidad en la cuenta real.
2. Evaluar la precisión del reconocimiento frente al audio; la integridad verificada de los captions no acredita exactitud lingüística completa.

Los videos anteriores al registro de propiedad requieren migración verificada; conocer su ID no permite apropiárselos. No se hicieron cargas en las siete comprobaciones iniciales de activación; el ensayo con MP4 se registra por separado. La reserva TUS y generación de captions pueden consumir capacidad de Stream; el saldo de OpenAI no interviene en esta fase.

Si se pierde la respuesta de Stream antes de registrar su ID, el Worker conserva una reserva pendiente y devuelve `409 recovery_required`. Evita repetir una carga automáticamente, pero esa ambigüedad requiere revisar la aceptación en el proveedor y vincularla verificadamente. La retención del video no elimina automáticamente el registro de autorización del Worker.

El borrado de Lexiapp elimina bloques y capacidad TUS guardada, con una marca que impide resurrección. El borrado remoto condicionado a un Word confirmado corresponde a la fase funcional 4; no se anuncia aquí como realizado.

## Resultado de verificación

Verificación inicial de la fase: `npm run check:clean` aprobó npm ci, lint, tipos cliente/servidor/scripts, compilación y 130 pruebas sin credenciales privadas. `npm run test:emulator`: 25 pruebas de persistencia y 4 de reglas, aprobadas. Total inicial: **159 pruebas** (91 unitarias/integración, 39 UI, 29 Emulator), 59 nuevas sobre la fase anterior. Se verificaron también el adaptador real contra Worker simulado y el servicio del navegador contra la ruta HTTP de capacidades real.

`npm run check:worker`: Wrangler 4.147.0, dry-run aprobado, bundle 31.08 KiB y bindings reconocidos, sin publicación. Arranque local: `/health` 200 y consulta del registro SQLite 404 controlado. Esa comprobación no prueba Stream real, que no está soportado en el emulador de Wrangler.

Comprobación posterior de compatibilidad GPT: token por query con header legado compatible, páginas GPT de hasta 90.000 bytes/caracteres del JSON real y errores ante cues/rangos que no caben. El backend conserva 700 KiB. El dry-run previo pasó con bundle 32.08 KiB. La verificación vigente aprueba 114 pruebas unitarias/integración, incluidas 16 del Worker, y TypeScript. Con las 39 de interfaz y 29 Emulator aprobadas previamente sin cambios, suma 182 pruebas, incluyendo Gemini y aislamiento de proveedores. El OpenAPI no contiene parámetros header personalizados y sus descripciones de operación cumplen el límite de 300 caracteres.

La versión activa es la indicada arriba. Las siete comprobaciones remotas iniciales de activación, el ensayo de Stream, las comprobaciones de configuración y persistencia real de Firestore y la conexión/autenticación del GPT pasan con el alcance descrito arriba; se mantienen separados del conteo de 182 pruebas automáticas. TUS no está habilitado ni probado en la cuenta real.

Las pruebas locales demostraron recuperación completa de 205 segmentos, reinicio entre páginas y entre última página/verificación, fuentes mayores al límite antiguo de 900 KB, paginación limitada por bytes JSON sin saltos, reserva perdida sin otro POST, cancelación, reselección TUS y acceso denegado a otro UID. El ensayo real verificó seis segmentos y la fecha programada de retención para un MP4 pequeño; mostró diferencias lingüísticas frente al audio. No acredita fidelidad completa de captions, compatibilidad real de audio/MOV/AVI, TUS, duración/capacidad máxima de la cuenta ni ejecución futura del borrado programado.
