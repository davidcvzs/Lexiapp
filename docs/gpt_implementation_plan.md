# Plan de implementación de la dinámica del GPT en Lexiapp

Fecha: 2 de octubre de 2026.

El objetivo es que Lexiapp ejecute las tareas de **Transcripción y Elaboración de Documentos Legales2** con sus instrucciones, referencias y formatos, sobre la seguridad y persistencia ya implementadas. Este documento define un nuevo ciclo de **fases funcionales 1 a 6**; no reemplaza ni renumera las fases técnicas anteriores.

Estado actualizado: las fases funcionales 1 a 3 están implementadas con 182 pruebas vigentes: 114 unitarias/integración aprobadas ahora, incluidas 16 del Worker, y 39 de interfaz y 29 de Firestore Emulator aprobadas previamente sin cambios. TypeScript pasa. La fase 3 tiene aceptación parcial: Worker activo, backend configurado, pruebas reales sintéticas de Stream y persistencia de bloques Firestore aprobadas, y conexión/autenticación del GPT con el esquema completo validada; carga directa TUS y capacidad por formato todavía pendientes. La exactitud completa del reconocimiento no está acreditada. Gemini es el proveedor temporal de generación; el saldo y la evaluación real de OpenAI se dejan para el final por indicación del usuario. Detalles en [functional_phase1.md](functional_phase1.md), [functional_phase2.md](functional_phase2.md), [functional_phase3.md](functional_phase3.md) y [gemini_testing.md](gemini_testing.md).

Actualización del 3 de octubre de 2026: la fase 4 está implementada y verificada localmente (typecheck, lint, 141 unitarias y 53 de interfaz) con revisión visual renderizada de los tres perfiles Word. Su aceptación sigue parcial: faltan las 36 pruebas de Emulator (sin Java en esta máquina), el ensayo real `smoke-transcript-word --live` y el ciclo de borrado remoto con video sintético. Ver [functional_phase4.md](functional_phase4.md). Las fases 5 y 6 siguen pendientes.

El Worker reparado está publicado al 100 % del tráfico con la versión `eba0202b-e5b1-4ddb-94ad-1994732b8b87`: conserva los tres bindings secretos y el namespace SQLite de `JobJournal`, con registro durable de propietario/cargas y recuperación íntegra por páginas. `GET /privacy` público está restaurado y responde 200. Un MP4 técnico sintético confirmó carga, captions, seis segmentos en tres páginas con hash verificado y retención programada a 31 días; hubo diferencias de reconocimiento respecto al audio. La persistencia real en bloques de Firestore también pasó, incluida reanudación y autorización por propietario. Los hallazgos originales y el alcance de cada comprobación se conservan en [worker_review.md](worker_review.md). TUS está preparado, pero `CLOUDFLARE_DIRECT_UPLOAD_ENABLED=false` y no se ha probado en la cuenta real.

**GPT validado:** el usuario guardó las [instrucciones completas](gpt_instructions_full.txt) de 7.977 caracteres, sustituyendo solo TRANSCRIPCIÓN DE VIDEO y preservando exactamente las demás reglas. Se corrigió la importación con `schemas: {}` en el esquema diagnóstico, se copió la clave Bearer y se restauró el OpenAPI de producción con cuatro operaciones, sin avisos. La consulta ficticia final devolvió `job_not_found`, validando conexión y autenticación con el esquema completo. El GPT no expuso HTTP; la consulta directa confirmó 404. Esta actualización no hizo llamadas a IA ni nuevas cargas.

## Base y decisiones de alcance

- Configuración del GPT y esquema de la acción proporcionados por el usuario; hallazgos en [gpt_alignment_analysis.md](gpt_alignment_analysis.md).
- `LexIA_Blueprint_v2.docx`: tareas y botones guiados, instrucciones libres, contexto continuo y formato Word.
- Los 18 archivos de `conocimiento/`, cuya lectura ya se comprobó. Conservar los originales; las dos copias idénticas del acta pueden compartir una referencia lógica.
- Reutilizar Firestore, autenticación, API del servidor, versiones, revisión vinculada al contenido y el Worker existente. La app ya utiliza Responses API; portar las instrucciones y referencias al servidor, sin presuponer que el enlace del GPT proporciona un identificador de Assistant reutilizable.
- Para fidelidad de contenido, aplicar las instrucciones actuales aportadas por el usuario. Para navegación y disposición de pasos, seguir el Blueprint. Registrar cualquier diferencia concreta antes de implementarla, sin inventar instrucciones jurídicas.
- Separar transcripción literal, declaración narrativa, redacción de una resolución dictada y análisis solicitado. La selección del tipo de documento no autoriza por sí sola una valoración del caso.
- Mantener la fuente original, copia de trabajo, versión oficial, marcado rojo y versión pública como conceptos separados.
- Completar cada fase con documentación, verificaciones pertinentes y pendientes explícitos. No considerar terminada una fase por tener solamente la interfaz o un proveedor simulado.

## Orden y dependencias

| Fase | Prioridad | Resultado | Dependencia para terminar |
| --- | --- | --- | --- |
| 1. Tareas, reglas y conocimiento | Crítica | Cada solicitud activa sus reglas y referencias y distingue fuente de contraste. | Configuración y archivos disponibles. |
| 2. Elaboración guiada y contexto | Alta | Botones e instrucciones libres producen borradores por tarea y conservan el estado. | Fase 1; las validaciones reales de generación requieren saldo del proveedor. |
| 3. Transcripción con el Worker | Crítica | Carga existente integrada y recuperación íntegra y reanudable de segmentos. | Código recibido; corregir autenticación, estados y recuperación y verificar configuración real. |
| 4. Word y ciclo del video | Alta | Word verificado, marcado rojo y eliminación remota condicionada al artefacto. | Fases 1 y 2; segmentos de la fase 3 para el flujo completo del video. |
| 5. Validación y publicación | Alta | Flujo funcional validado y versión preparada para uso en el dominio elegido. | Fases 1 a 4 y destino de despliegue definido. |
| 6. Ampliaciones del Blueprint | Posterior | Personalización, fuentes adicionales, métricas y suscripciones. | Base funcional validada; configuración específica de cada integración. |

La prioridad crítica de la fase 3 indica la importancia del transcriptor. Su integración no condiciona el inicio de las fases 1 y 2 con transcripciones aportadas. La construcción de Word de la fase 4 puede avanzar con segmentos sintéticos. Las pruebas reales aprobadas del Worker, Firestore y conexión del GPT tienen el alcance indicado arriba; siguen pendientes TUS, interrupción/reanudación, 2 GiB y capacidad por formato en la cuenta real.

## Fase 1 Tareas reglas y conocimiento

**Estado:** catálogo, contrato, reglas, referencias, confirmación de análisis y persistencia compatible implementados. Verificación local: 65 pruebas y 15 adicionales en Emulator; 17/17 referencias únicas legibles. La fidelidad del contenido real queda por evaluar con el proveedor disponible.

**Objetivo:** corregir el uso general de la IA y asegurar que cada tarea recibe el contexto correcto.

Trabajo:

1. Crear un catálogo compartido de tareas con identificador, modo, referencias, variantes y necesidad de autorización de análisis. Cubrir declaración, transcripción, alegatos, hechos y datos, resolución dictada, reparación y pena, actas, acuerdos, oficios, cateo, orden de aprehensión, amparo, sedes, directorio y análisis solicitado.
2. Ampliar el contrato de generación para separar tarea, instrucción, fuente original, fuente de trabajo, contraste, borrador y referencias seleccionadas. Validar las opciones en servidor y resolver las rutas de archivos mediante el catálogo; no aceptar rutas arbitrarias del cliente.
3. Conectar `AIAssistantService`, `/api/ai/generate`, `OpenAIService` y las reglas correspondientes. Evitar que una tarea elegida pierda su modo y termine silenciosamente en `GENERAL`.
4. Alinear la regla de contraste: el auto de apertura corrige deformaciones seguras del reconocimiento; las diferencias inteligibles se conservan y las dudas se separan en Observaciones.
5. Completar el manifiesto de referencias, revisar la estructura de los cuatro archivos pendientes y asignar variantes según su contenido. Conservar los formatos y no utilizar datos de los asuntos de ejemplo como hechos del asunto nuevo.
6. Establecer una ruta de conocimiento configurable y coherente en Windows y Linux. Informar qué referencia obligatoria falta o no puede leerse, sin continuar silenciosamente sin ella.
7. Registrar la versión de reglas y las huellas de referencias usadas en cada generación. No introducir hechos jurídicos nuevos en los prompts ni adoptar instrucciones históricas contradictorias contenidas en conversaciones de ejemplo.
8. Hacer compatible el nuevo estado con borradores guardados: abrir y exportar documentos anteriores, conservar su revisión y pedir una tarea explícita antes de una nueva generación cuando no esté registrada.

Flujo documentado: **elegir tarea → seleccionar formato → aportar fuente y contraste → validar referencias → confirmar análisis cuando corresponda → generar → revisar → guardar**.

Entregables: catálogo de tareas y referencias, contrato de generación, reglas conectadas, diagnóstico de conocimiento y persistencia compatible. Áreas principales: `shared/`, `src/services/AIAssistantService.ts`, `server/routes/ai.ts`, `server/services/OpenAIService.ts`, `server/services/KnowledgeService.ts`, `server/legal/rules/index.ts`, `shared/documents.ts` y el repositorio de documentos.

Criterios de aceptación:

- Una solicitud de declaración activa declaración y la dinámica correspondiente; una de directorio utiliza la consulta estructurada del Excel.
- Una tarea desconocida o referencia inválida se rechaza antes de llamar al proveedor.
- Fuente y contraste llegan separados y se mantienen disponibles al guardar y volver a abrir.
- El prompt de contraste no ordena sustituir un testimonio inteligible por los hechos del auto de apertura.
- Una tarea de análisis no llama al proveedor antes de la confirmación que exige la configuración del GPT. La confirmación se vincula al alcance y las fuentes; un cambio material exige revisarla.
- Las comprobaciones técnicas verifican el contrato y las instrucciones. La conservación efectiva de contradicciones en una respuesta real se revisa con ejemplos sintéticos cuando el proveedor esté disponible; no se presenta como garantizada solo por probar el prompt.

## Fase 2 Elaboración guiada y contexto continuo

**Estado:** panel posterior a la transcripción, pasos por tarea, instrucciones propias, aceptación, reemplazos, fragmentos, recepción por partes, asuntos separados, importación e investigación explícita implementados. Contexto persistente y compatible verificado con 84 pruebas locales y 16 en Emulator. La validación real requiere añadir saldo a la API de OpenAI; los resultados simulados no acreditan fidelidad jurídica. Véase [functional_phase2.md](functional_phase2.md).

**Objetivo:** ofrecer las tareas del GPT mediante botones guiados e instrucciones libres.

Trabajo:

1. Incorporar el panel de tareas posterior a la transcripción y permitir también aportar texto o documentos sin video. Mantener las fuentes del asunto separadas de los formatos de conocimiento.
2. Sustituir el flujo único de construcción de sentencia por pasos de la tarea seleccionada. Reproducir las secuencias de sentencia, acta, amparo y análisis descritas en el Blueprint; conectar las tareas adicionales del GPT con sus formatos.
3. Añadir pasos específicos para extraer declaraciones y alegatos, hechos y datos, reparación y pena, y redactar la resolución efectivamente dictada por el juez. En actas, seleccionar audiencia individual o varios asuntos y mantener sus datos separados.
4. Permitir instrucciones libres sobre el documento actual y correcciones por fragmento. No asumir que un testigo o una recepción por partes terminó; usar el cambio indicado o confirmado por el usuario.
5. Implementar acciones de aceptar y continuar, rehacer un paso y editar un apartado. Conservar la versión anterior y no duplicar el apartado al rehacerlo.
6. Persistir tarea, secciones, paso actual, instrucciones y referencias jurídicas seleccionadas. Enviar al servidor el contexto necesario en cada solicitud, incluso después de recargar; no depender únicamente de la memoria del navegador.
7. Conectar sedes y directorio a sus archivos; ofrecer variantes de acuerdos, oficios, cateos, órdenes y amparo solo cuando exista un formato aplicable. Diferenciar la suspensión de plano disponible de una demanda de amparo completa.
8. Aislar las herramientas de investigación y valoración de la redacción literal. La búsqueda se ejecuta por una acción expresa y no convierte automáticamente sus resultados en hechos del expediente.

Flujo documentado: **tarea → pasos pertinentes → instrucción del paso o instrucción libre → borrador del apartado → aceptar o rehacer → guardar → continuar → revisión final**.

Entregables: panel de tareas, editor por tarea, estados de pasos y contexto durable. Áreas principales: `src/views/TranscriptionView.tsx`, `src/views/DocumentBuilderView.tsx`, componentes de documentos, `useDocumentDraft`, servicios de IA y persistencia.

Criterios de aceptación:

- Cada botón envía el identificador y las instrucciones de su tarea; cambiar el tipo de documento no deja los pasos de otra tarea activos.
- Recargar recupera las secciones, instrucciones y paso actual.
- Rehacer reemplaza el apartado seleccionado y permite recuperar su versión previa.
- Cancelación, error o respuesta incompleta conservan el borrador anterior.
- Las variantes de acta no mezclan asuntos en las pruebas sintéticas.
- Las consultas de directorio y sedes tienen resultados respaldados por su referencia, no respuestas inventadas.
- La validación con IA real queda identificada como pendiente mientras no haya saldo; las pruebas de interfaz y contratos pueden completarse antes.

## Fase 3 Integración del transcriptor existente

Estado: implementación verificada localmente y servicio real activado con backend configurado. Pruebas sintéticas reales de Stream y persistencia Firestore aprobadas; guardado del GPT y conexión/autenticación con el esquema de cuatro operaciones validados. La fase no está totalmente aceptada: TUS permanece deshabilitado y faltan sus ensayos reales de interrupción, 2 GiB y capacidad por formato. La precisión completa del reconocimiento no está acreditada. Gemini sigue seleccionado temporalmente y OpenAI/saldo quedan para el final. Ver [functional_phase3.md](functional_phase3.md).

**Objetivo:** utilizar el Worker real desde la web y comprobar la recuperación íntegra de la transcripción.

Trabajo:

1. Reutilizar la entrada multipart existente en `/api/transcribe` y conservar `/jobs` JSON para el GPT. Corregir los hallazgos de la revisión: VTT vacío tratado como texto de éxito, error de video mostrado como procesamiento, paginación inválida y errores de generación tratados indiscriminadamente como espera.
2. Configurar URL y credenciales únicamente en servidor. El código admite `x-api-key` y Bearer; retirar la clave fija, configurar una sustituta y verificar el binding `STREAM` y las variables `CF_ACCOUNT_ID` y `CF_API_TOKEN`. Completar la configuración del Worker, distinta del archivo Pages local.
3. Diseñar la carga para el tamaño real admitido. El Blueprint solicita hasta 2 GB, mientras la app admite 100 MiB. La meta de 2 GB requiere transferencia directa o por partes y compatibilidad comprobada del proveedor; no elevar solamente el límite de Express. Mantener un límite visible y verdadero hasta verificar esa capacidad, así como los formatos MOV y AVI previstos en el Blueprint.
4. Persistir el `job_id` antes de responder, vincularlo al propietario y reanudar el mismo trabajo después de cancelar la espera o recargar. Definir el tratamiento de una carga aceptada cuya respuesta se pierde, según las capacidades reales del Worker, para evitar duplicar procesamiento y coste.
5. Normalizar `processing_video` y `video_ready` como estados no finales y conservar `generating_transcript`, `completed` y errores reales. El código aportado devuelve `completed`; alinear la instrucción del GPT que menciona `complete`. Recuperar la fuente desde segmentos sin utilizar como declaración el texto aplanado del estado.
6. Recuperar `/jobs/{job_id}/transcript` por `offset` y `limit` hasta `next_offset = null`. Validar identidad, índices, orden, conteos, cursores repetidos y respuestas vacías o inconsistentes; no declarar completo un resultado parcial.
7. Conservar segmentos con tiempos y texto original. Los hablantes se conservan cuando el proveedor los identifique o el usuario los revise; no deducir identidad a partir del índice.
8. Guardar puntos de reanudación. Los documentos actuales tienen límites de tamaño: preparar almacenamiento de segmentos por bloques, por ejemplo `transcriptionJobs/{id}/segments`, con acceso del propietario mediado por servidor. Mantener referencias y huellas para fuentes largas, en vez de truncarlas o intentar guardar todo en un solo documento.
9. Mostrar porcentaje únicamente cuando lo proporcione el proveedor y para la etapa que representa. `video_status.pctComplete` corresponde al procesamiento del video, no a captions. Mostrar estado y tiempo transcurrido cuando la transcripción no tenga porcentaje fiable.

Flujo documentado: **carga → trabajo guardado → consulta → recuperación paginada → verificación de integridad → fuente disponible → creación de Word**.

Entregables: adaptador del Worker, carga compatible, contrato de segmentos, recuperación completa y reanudación durable. Áreas principales: `CloudflareTranscriptionService`, rutas de transcripción, `shared/transcription.ts`, `TranscriptionService`, `useTranscription`, repositorio, reglas e índices Firestore si se amplía el almacenamiento.

Criterios de aceptación:

- Una transcripción de más de 200 segmentos se recupera íntegra; un fallo de página, un cursor repetido o un conteo incongruente impide declararla completa.
- Reanudar utiliza el mismo trabajo y los bloques ya verificados, sin subir de nuevo el archivo.
- Otro usuario no puede consultar, recuperar ni eliminar el trabajo.
- Un texto grande puede persistirse y recuperarse sin truncamiento y dentro de los límites de la estructura elegida.
- Una prueba real con un archivo sintético confirma carga, estado y transcript, además de las pruebas con proveedor simulado.
- La clave fija deja de autorizar; faltar el secreto no habilita una alternativa. La retención se envía y verifica en ambas entradas: en la carga multipart actual solo se anuncia localmente y no se aplica.

Dependencia concreta: código del Worker reutilizado, correcciones publicadas, autenticación y backend configurados y servicio disponible. Las pruebas reales sintéticas de Stream y bloques Firestore están aprobadas, y el GPT está guardado y conectado con el esquema completo. Quedan el ensayo real de TUS antes de habilitarlo y la comprobación de interrupción/reanudación, 2 GiB y capacidad por formato. Las comprobaciones locales y los ensayos pequeños no acreditan fidelidad jurídica, precisión completa del reconocimiento o capacidad máxima.

## Fase 4 Word marcado rojo y ciclo del video

**Objetivo:** entregar documentos fieles al texto aprobado y completar el flujo de transcripción.

Trabajo:

1. Preparar el perfil de transcripción de `647-2.docx`, tomando su sección de transcripción y excluyendo el resumen inicial salvo petición. Inspeccionar su formato renderizado y conservar tiempos, hablantes y separación de intervenciones.
2. Generar Word directamente desde los segmentos verificados. No pasar la transcripción literal por una reescritura de IA para exportarla.
3. Añadir perfiles de formato por tarea: papel Carta, márgenes, fuente, interlineado, encabezado, paginación y estructura conforme al formato elegido y el Blueprint. Solicitar los datos faltantes; no inventar juzgado, expediente o firmantes.
4. Implementar el marcado rojo de las categorías indicadas en el GPT mediante posiciones exactas revisadas sobre el texto. Mantenerlo separado de las ocultaciones de la versión pública.
5. Convertir edades a números arábigos mediante una edición visible y revisable del borrador antes de aprobarlo. La exportación no cambia silenciosamente el contenido aprobado.
6. Verificar el texto de Word contra la instantánea y conservar la huella del artefacto. Cambiar texto, fuente o marcado invalida las aprobaciones pertinentes.
7. Tras verificar recuperación íntegra y Word generado, ejecutar el borrado remoto únicamente dentro del flujo autorizado. Registrar estados de generación, recuperación y borrado y distinguirlos del borrado de la copia de Lexiapp. Un error de Word o recuperación impide el borrado remoto.
8. Conservar la transcripción y el artefacto de forma durable antes de borrar el video. Resolver ubicación, propiedad, límites y retención del artefacto según el despliegue. El servidor no puede suponer que un archivo generado solo en el navegador sigue disponible.

Flujo documentado: **transcript completo → construir Word → comprobar contenido y artefacto → ofrecer descarga → eliminación remota autorizada → guardar resultado de eliminación**.

Entregables: exportador de transcripción, perfiles Word, marcado oficial revisado y ciclo de eliminación remoto documentado y probado. Áreas principales: `WordExportService`, integridad compartida, vista previa, revisión, almacenamiento del artefacto y servicio del Worker.

Criterios de aceptación:

- Word contiene todas las intervenciones en orden, con sus tiempos y etiquetas disponibles.
- El texto exportado coincide con el aprobado y no contiene datos del asunto de ejemplo.
- Nombres y categorías seleccionadas aparecen en rojo en la versión oficial; las ocultaciones públicas siguen su aprobación independiente.
- Renderizar e inspeccionar los documentos de prueba confirma márgenes, legibilidad, saltos y ausencia de contenido cortado.
- Un fallo al construir o guardar el Word no dispara `DELETE`; otro propietario no puede activar el borrado; un fallo remoto conserva transcript y artefacto y permite conocer el resultado real.

## Fase 5 Validación completa y publicación

**Objetivo:** comprobar la correspondencia funcional y preparar el uso real en el destino elegido.

Trabajo:

1. Ejecutar una matriz de ejemplos sintéticos por tarea: fuente incompleta, hablante incierto, contradicción clara, fragmentos sucesivos, varios asuntos, formato faltante y una transcripción larga.
2. Revisar respuestas reales contra las reglas del GPT: contenido conservado, estilo narrativo, Observaciones y ausencia de valoraciones fuera de la tarea solicitada. Si se dispone de ejemplos del GPT original, compararlos con los mismos datos sintéticos.
3. Verificar guardado, historial, conflictos, restauración, cancelación, revisión, Word y eliminación del video después de la recuperación. Revisar reglas e índices para las nuevas estructuras.
4. Ejecutar lint, tipos, compilación y pruebas pertinentes, instalación limpia y Emulator. Verificar el contenedor y la ruta de conocimiento en Linux, además del flujo móvil y PWA.
5. Resolver antes de publicar la URL del servicio API, dominio, configuración de Hosting, secretos del servidor y almacenamiento. Mantener las referencias fuera de los archivos públicos del frontend.
6. Activar respaldos y monitoreo sobre destinos definidos y comprobar recuperación y reversión. Publicar cuando exista autorización de despliegue para el destino concreto; la preparación local no se presenta como publicación.
7. Realizar una revisión de uso con el usuario y corregir los fallos materiales encontrados.

Entregables: matriz de validación con resultados y límites, documentos Word verificados, configuración de despliegue y guía breve de operación.

Criterios de aceptación:

- Todos los casos obligatorios pasan o existe un bloqueo explícito que impide declarar finalizado ese alcance.
- Las pruebas con proveedores reales y la revisión humana del contenido están registradas; no se sustituyen por mocks.
- El dominio publicado sirve el frontend, API autenticada y flujo completo correctamente cuando se ejecuta la publicación.
- Se comprueba que la reversión conserva compatibilidad con documentos anteriores y que la recuperación respeta la propiedad.

Dependencias: Worker disponible, saldo para pruebas reales de generación, destino de despliegue y almacenamiento definidos. Docker y CI remota siguen pendientes hasta ejecutar sus verificaciones.

## Fase 6 Ampliaciones del Blueprint

**Objetivo:** ampliar el producto después de validar su función judicial principal.

Orden interno:

1. Personalización de botones y preferencias: hasta ocho botones propios por configuración, variantes por tipo de documento, restablecimiento y persistencia por propietario. Conectar la ubicación `users/{uid}/customButtons` prevista por el Blueprint mediante API y reglas apropiadas; editar un botón no elimina los controles de fuentes o autorización de análisis.
2. Fuentes adicionales de investigación: completar las integraciones expresas de SCJN, PJENL y DOF y la búsqueda en documentos del usuario, conservando fuente, enlace y fecha. Incorporar un criterio al borrador solo cuando el usuario lo seleccione. Cada proveedor se valida por separado.
3. Métricas reales y ajustes: contabilizar documentos, transcripciones, minutos y búsquedas desde eventos confirmados; no mostrar cifras de ejemplo como actividad del usuario. Completar preferencias y experiencia móvil sobre los flujos probados.
4. Suscripciones y cuotas: integrar el proveedor de pagos, confirmar productos y precios y aplicar permisos/cuotas en servidor. Verificar firma e idempotencia de webhooks y no activar una suscripción por el resultado del navegador. Los precios del Blueprint son una propuesta histórica que debe confirmarse antes de crear productos facturables.

Entregables: personalización, integraciones comprobadas, métricas reales y pagos con pruebas en entorno de ensayo.

Criterios de aceptación: preferencias persisten y respetan propiedad; resultados jurídicos conservan su procedencia; métricas corresponden a eventos confirmados; webhooks duplicados no cobran ni contabilizan dos veces; las cuotas se cumplen desde servidor y los fallos de pago tienen estados correctos.

Esta fase no condiciona la primera validación del GPT en Lexiapp. Las capacidades pendientes se muestran como no disponibles hasta estar comprobadas.

## Seguimiento y primer paso

Cada cierre de fase debe registrar: archivos y comportamiento modificados, pruebas ejecutadas y sus resultados, validación real pendiente, riesgos concretos y siguiente dependencia. Las nuevas clases, colecciones y flujos se documentan en `docs/system_map.md` antes o junto a su implementación; los botones se mapean antes de codificarlos.

La siguiente implementación será la **fase funcional 4**, con Word literal, marcado rojo y borrado remoto condicionado. La fase 3 tiene el Worker activo, los ensayos reales sintéticos de Stream/Firestore aprobados y la conexión/autenticación del GPT validada; su aceptación sigue parcial por TUS deshabilitado y las pruebas reales pendientes de interrupción, 2 GiB y capacidad por formato. Gemini se conserva para pruebas temporales; la evaluación real y el saldo OpenAI se mantienen para el final y no bloquean las comprobaciones locales de las fases siguientes.
