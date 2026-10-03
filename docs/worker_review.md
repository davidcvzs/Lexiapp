# Revisión del Worker de transcripción aportado

Fecha: 2 de octubre de 2026.

Actualización de activación: la versión reparada `eba0202b-e5b1-4ddb-94ad-1994732b8b87` está publicada al 100 % del tráfico, conservando los tres bindings secretos y el namespace SQLite de `JobJournal`; `GET /privacy` público está restaurado y responde 200. Las comprobaciones de acceso, el ensayo de Stream con MP4 sintético y la persistencia real de bloques en Firestore pasaron con el alcance descrito abajo. Los captions presentaron diferencias frente al audio. El usuario guardó las instrucciones completas de 7.977 caracteres y la consulta ficticia final del GPT devolvió `job_not_found` con el OpenAPI de producción, validando conexión y autenticación. TUS sigue deshabilitado y su capacidad real pendiente. Los hallazgos y las once comprobaciones iniciales describen el código original, previo a la reparación.

El código proporcionado permite reutilizar el Worker para la acción del GPT y para Lexiapp. Ya implementa la carga multipart de la web, el estado, la recuperación paginada de segmentos y el borrado remoto. La integración requiere corregir estados y recuperación en Lexiapp y resolver defectos concretos del Worker antes de usarlo en producción.

Fuente: adjunto `b5fa1878-367a-424a-9f62-90076a05681c/Pasted text.txt` proporcionado por el usuario. No se copió el código original al repositorio porque incluye una credencial fija. Los hallazgos describen esa credencial sin reproducirla.

Alcance: revisión del código y 11 comprobaciones locales con llamadas y binding Stream simulados. No se contactó al Worker publicado ni a Cloudflare, no se utilizaron credenciales reales, no se cargaron archivos y no se borraron videos remotos. Se verificó el comportamiento del código aportado, no que sea la revisión desplegada actualmente. No se modificó la implementación del Worker o de Lexiapp en esta revisión.

## Correcciones del diagnóstico previo

1. La carga web **sí existe**. `POST /jobs`, `/api/transcribe` y `/transcribe` aceptan multipart y JSON. Lexiapp utiliza `/api/transcribe` con el campo `file`, que este código reconoce.
2. El estado final **sí es `completed`**, compatible con el normalizador actual. El término `complete` pertenece a las instrucciones del GPT aportadas y debe alinearse con el contrato real.
3. La incompatibilidad comprobada está en `processing_video` y `video_ready`: el Worker los devuelve al cargar y Lexiapp no los acepta. Una carga puede completarse en el proveedor y fallar al normalizar la respuesta en la app; el trabajo puede quedar sin registrarse.
4. El Worker admite `Authorization: Bearer` y `x-api-key`. Falta comprobar su configuración y la versión publicada, no solicitar de nuevo el código.

## Capacidades que se reutilizan

| Función | Implementación observada |
| --- | --- |
| Carga desde Lexiapp | Multipart con `file`, `audio`, `video` o `media`; subida REST a Stream. |
| Carga desde el GPT | JSON con `openaiFileIdRefs`; `env.STREAM.upload` recibe el enlace temporal. |
| Estado | `GET /jobs/{id}` y `/api/transcribe/jobs/{id}`; consulta Stream y captions en español. |
| Segmentos | `GET /jobs/{id}/transcript`; tiempos, índices y texto desde WebVTT, paginación con máximo 200 por página o filtro temporal. |
| Borrado remoto | `DELETE /jobs/{id}` mediante el binding Stream. |
| Salud | `GET /health`, público y sin llamada a Stream. |

El código obtiene la transcripción de captions de Cloudflare Stream. No contiene una llamada directa a Whisper/OpenAI. No debe anunciarse un motor distinto basándose únicamente en la descripción histórica del Blueprint.

## Hallazgos y orden de corrección

| Prioridad | Hallazgo confirmado | Acción necesaria |
| --- | --- | --- |
| P0 | La autenticación acepta una clave literal incluso si `ACTION_API_KEY` está configurada con otra, y también cuando falta esa variable. | Eliminar la alternativa fija en todos los caminos de autenticación; exigir el secreto configurado y sustituir la clave expuesta. Cambiar solo la variable no invalida la alternativa mientras permanezca el código. |
| P0 | `processing_video` y `video_ready` se rechazan en Lexiapp después de una subida aceptada. | Mapearlos a estados internos no finales y guardar el identificador antes de continuar. Video listo no significa transcript listo. |
| P1 | El texto del endpoint de estado elimina tiempos y puede incorporar los identificadores de cues como texto. | Recuperar y validar los segmentos del endpoint paginado; construir la representación literal desde ellos. |
| P1 | Un WebVTT vacío se devuelve como `completed` con una frase de diagnóstico. Lexiapp acepta esa frase como transcripción. | Separar ausencia de segmentos del éxito y de la fuente: no guardar un diagnóstico como declaración. |
| P1 | La ruta multipart anuncia eliminación en 31 días, pero no transmite `scheduledDeletion` en la solicitud a Stream. La ruta JSON sí transmite esa opción. | Configurar realmente la retención en ambas cargas y comprobar el valor devuelto por el proveedor. No presentar la fecha local calculada como política aplicada. |
| P1 | `limit=invalid` produce HTTP 200 y `limit: null`; no se exige que cursores y límites sean enteros finitos. | Validar offset y limit, así como rangos temporales, antes de obtener VTT. Rechazar parámetros inválidos con 400. |
| P1 | El error de procesamiento del video queda como `processing_video` cuando `readyToStream` es falso. | Detectar el estado de error del video y devolver un estado terminal. |
| P1 | Respuestas 400, 405 y 409 de generación se tratan indiscriminadamente como generación en curso. | Distinguir una solicitud ya existente de un error de parámetros o método; no mantener una espera indefinida por un error real. |
| P1 | El Worker borra cualquier identificador solicitado por un cliente con la clave compartida, sin registro de propietario ni verificación de Word dentro del Worker. | Mantener el control por propietario en el backend y condicionar el flujo de Lexiapp a recuperación y artefacto verificados. Definir autorización por trabajo para las entradas que permanezcan accesibles fuera del backend, conservando expresamente la compatibilidad de la acción del GPT. |
| P2 | El código exige `STREAM`, `CF_ACCOUNT_ID` y `CF_API_TOKEN` para la carga. El `wrangler.toml` local contiene configuración Pages, no la configuración completa de este Worker. | Preparar un proyecto/configuración del Worker con los bindings y secretos necesarios y comprobar el despliegue existente antes de publicar cambios. |
| P2 | El esquema OpenAPI declara `video_status` como string o null, pero el código devuelve el objeto de estado de Stream. | Actualizar el esquema de la acción para reflejar el objeto y sus campos opcionales, manteniendo el estado externo documentado. |

La función `autorizado` y la comprobación de autenticación dentro de `fetch` duplican la lógica. Corregir solo la función auxiliar no protege las rutas: en este código no se utiliza para autorizarlas.

El Worker devuelve detalles de errores del proveedor. La app actualmente evita trasladar esos detalles al documento, pero la entrada directa del GPT también debe recibir mensajes controlados. La carga multipart no comprueba que el campo recibido sea realmente un archivo antes de reenviarlo; la validación de tipo y tamaño debe aplicarse en el punto de entrada correspondiente.

## Segmentos tiempos y progreso

Se comprobó una fuente sintética de 205 segmentos: el Worker devuelve 200 en la primera página y 5 en la segunda, con `next_offset = null` al final. Se puede conservar esa operación y completar el adaptador de Lexiapp.

El parser elimina etiquetas del VTT y no devuelve un campo específico de hablante. No debe inventarse un SPK a partir del índice. Si hay etiquetas de voz disponibles en el VTT, deben preservarse como metadatos al revisar el parser; los nombres o funciones requieren certeza o revisión del usuario.

`video_status` puede incluir `pctComplete` del procesamiento de video. Ese dato no expresa el avance de captions. Si se muestra, se etiqueta como procesamiento del video; para generación de transcripción se muestra el estado cuando no existe porcentaje confirmado. [Documentación del binding Stream](https://developers.cloudflare.com/stream/manage-video-library/bindings/).

## Carga grande y retención

La carga multipart básica no resuelve la meta de 2 GB. Cloudflare documenta TUS para videos mayores de 200 MB; la fase 3 debe incorporar carga directa y reanudable según los límites y configuración comprobados. El soporte de archivos de audio debe validarse por formato, no deducirse de que el Worker acepta cualquier `File`. [Carga grande y reanudable](https://developers.cloudflare.com/stream/uploading-videos/resumable-uploads/).

Cloudflare admite el binding Stream utilizado por `upload` y `video(id).delete()`. Esas llamadas no se consideran inválidas por usar un binding; se requiere declararlo en la configuración real del Worker. También documenta la opción `scheduledDeletion`, que debe enviarse al proveedor para quedar aplicada. [Binding y gestión del ciclo del video](https://developers.cloudflare.com/stream/manage-video-library/bindings/).

## Comprobaciones locales

Las 11 comprobaciones terminaron correctamente y reprodujeron los siguientes comportamientos del código original:

1. La clave fija sigue autorizada aunque la variable contenga otra clave.
2. La clave fija sigue autorizada si falta la variable.
3. La carga multipart con video en procesamiento se acepta; Lexiapp rechaza el estado y la retención calculada no se transmite.
4. La carga multipart con video listo se acepta; Lexiapp rechaza el estado y la retención calculada no se transmite.
5. Paginación completa de 205 segmentos en dos páginas de 200 y 5.
6. El estado `completed` es compatible, pero su texto incorpora identificadores de cues en el ejemplo sintético.
7. VTT vacío convertido en una frase de diagnóstico con estado final de éxito.
8. Límite de paginación no numérico aceptado con HTTP 200.
9. Borrado simulado sin comprobar artefacto o propietario dentro del Worker.
10. Error de video presentado como procesamiento.
11. Error 400 al generar captions presentado como generación en curso.

Que estas once comprobaciones pasen significa que los hallazgos del original se reprodujeron; **no significa que esas comprobaciones hayan validado su reparación**. Los resultados locales sin secretos se conservaron en `.firebase/worker-review-results.json`, excluido del control de versiones. La reparación y la activación posteriores se registran abajo con su propio alcance de verificación.

## Efecto sobre el plan

Se conserva la numeración de las seis fases funcionales. Los resultados anteriores describen el código original, previo a la reparación. En fase 4 se completa Word y el flujo de borrado.

## Reparación local — Fase funcional 3

La versión reparada está en `workers/transcriptor-legal/`: elimina la clave fija, separa GPT/backend y autorización por trabajo, conserva literalidad/voz explícita del VTT, aplica retención, distingue estados y errores y valida páginas/hash del conjunto. Añade un registro SQLite Durable Object para reservas de carga y propiedad, recuperación sin duplicar POST y TUS hasta 2 GiB condicionado a configuración/capacidad real. Lexiapp persiste segmentos en bloques y verifica el conjunto antes de completar. La fuente no utiliza el texto aplanado del estado.

Dieciséis pruebas del Worker incluyen el adaptador real conectado a bindings/fetch simulados; son distintas de las once comprobaciones que reproducían los defectos del original. Wrangler 4.147.0 compila el Worker con `deploy --dry-run` y reconoce bindings; un arranque local comprobó `/health` y el registro SQLite. Stream no tiene emulación local en Wrangler y no se invocó el proveedor real en esas pruebas locales.

La revisión de compatibilidad previa a activar detectó dos límites de GPT Actions: no admite headers personalizados y exige payloads inferiores a 100.000 caracteres. El OpenAPI reparado envía `job_token` en query; el Worker conserva el header para clientes existentes y rechaza tokens contradictorios sin reflejarlos. El backend sigue autenticando por clave independiente y UID. Las páginas GPT miden el JSON final escapado y multibyte para respetar 90.000 bytes/caracteres; backend conserva 700 KiB. Los cursores avanzan solo por cues completos y el hash representa siempre el conjunto íntegro. Un cue o rango que no cabe devuelve error controlado; no se recorta el texto. [Límites de producción de GPT Actions](https://developers.openai.com/api/docs/actions/production).

## Activación real del 2 de octubre

La versión activa es `eba0202b-e5b1-4ddb-94ad-1994732b8b87`, al 100 % del tráfico y con fecha de compatibilidad `2026-10-02`. Conserva los tres secretos `ACTION_API_KEY`, `LEXIA_API_KEY` y `CF_API_TOKEN` como `secret_text`, sin reproducir sus valores, y el namespace SQLite de `JobJournal`, `e41bcfa23b1a40729459d22b45c634a4`. La ruta original `GET /privacy` está restaurada, pública y con respuesta 200. La URL y clave independiente del backend están configuradas en `.env.local`; Gemini sigue seleccionado y TUS permanece deshabilitado.

Las siete comprobaciones remotas iniciales de salud, autenticación y acceso pasaron, incluidas una consulta con propietario a un trabajo inexistente (404) y recuperación de solicitudes con la clave de acción (403). Son distintas de las 182 pruebas automáticas vigentes: 114 unitarias/integración aprobadas ahora, incluidas 16 del Worker, más las 39 de interfaz y 29 de Firestore Emulator aprobadas previamente sin cambios. TypeScript pasa. No hubo cargas en esas siete comprobaciones remotas; no acreditan captions, fidelidad de la fuente o retención real.

El rechazo anterior de guardado por superar 8.000 caracteres se resolvió con las instrucciones completas de 7.977 caracteres, cuyo guardado confirmó el usuario. La importación se corrigió con `schemas: {}` en el esquema diagnóstico y se copió la clave Bearer. Se restauró después el OpenAPI de producción con sus cuatro operaciones, sin avisos. La consulta ficticia final del GPT devolvió `job_not_found`, validando conexión y autenticación con el esquema completo. El GPT no expuso el código HTTP; la consulta directa confirmó 404.

La herramienta local ofrece «Copiar instrucciones completas» con [gpt_instructions_full.txt](gpt_instructions_full.txt), de 7.977 caracteres, LF y sin BOM. Solo cambia TRANSCRIPCIÓN DE VIDEO y conserva exactamente todas las demás reglas. El texto está guardado y la conexión de la acción validada con el alcance indicado arriba. En esta actualización no hubo llamadas a IA ni nuevas cargas.

El ensayo real de Stream cargó un MP4 técnico sintético de 24,776 segundos y 987 354 bytes, con respuesta 200 y programación de borrado a 31 días confirmada. La recuperación de la solicitud backend devolvió el trabajo registrado. Sus seis segmentos se recuperaron en tres páginas de dos, con tiempos entre 0 y 23,92 segundos, 346 caracteres e integridad SHA-256 verificada. Otro propietario recibió 404. Solamente se eliminó el video de prueba: DELETE 200 seguido de consulta 410; los videos anteriores quedaron sin cambios.

La frase reconocida no coincidió exactamente con lo pronunciado: el nombre Lexiapp, los dígitos 7/3 y espaciados presentaron diferencias. El Worker conservó literalmente los captions en la recuperación, sin correcciones; este resultado acredita transporte íntegro y exige revisión humana para fidelidad al audio. Se comprobó la fecha de retención programada, sin observar su ejecución automática porque se eliminó el clip de prueba. TUS continúa deshabilitado; quedan pendientes sus ensayos reales de interrupción/reanudación, 2 GiB y capacidad por formato. La precisión completa del reconocimiento no está acreditada.

Se publicaron seis exclusiones nuevas de Firestore mediante Firebase CLI con OAuth del operador, sin `--force` ni escrituras de documentos. La comprobación de metadatos real confirmó los diez campos excluidos e índices compuestos `READY`. Las reglas de acceso se mantienen y la cuenta de servicio de ejecución conserva sus permisos de lectura de índices, sin ampliación.

La prueba posterior de persistencia en Firestore real pasó: seis segmentos, tres páginas y tres bloques; reanudación con cliente SDK nuevo y hash/texto literal verificados. La finalización anticipada devolvió 409 y siete operaciones de otro propietario, 403. La limpieza dejó cero registros de prueba remanentes. No se llamó al Worker ni a una API de IA durante esa comprobación. TUS sigue deshabilitado y sin ensayo real.

Una solicitud cuya aceptación no se pudo registrar permanece pendiente y requiere recuperación verificada del proveedor; no se repite automáticamente una carga facturable. Configuración y límites: [README del Worker](../workers/transcriptor-legal/README.md), [fase funcional 3](functional_phase3.md). El saldo de OpenAI se deja para el final por indicación del usuario.
