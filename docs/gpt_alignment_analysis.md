# Correspondencia entre el GPT original y Lexiapp

Fecha de revisión: 2 de octubre de 2026.

Actualización: el usuario proporcionó después el código del Worker. Se corrigieron las suposiciones sobre la carga web y el estado final; ver [worker_review.md](worker_review.md). La revisión del código incluye comprobaciones locales simuladas y no demuestra qué revisión está desplegada.

La configuración proporcionada de **Transcripción y Elaboración de Documentos Legales2** permite comparar las funciones originales con el código actual. Lexiapp conserva controles técnicos de acceso, persistencia, revisión y exportación, pero su flujo principal todavía aplica solo una parte de las instrucciones del GPT. La prioridad es conectar las tareas con sus reglas y referencias, y adaptar el transcriptor al contrato real suministrado.

Esta revisión trata los documentos como formatos de referencia y comprueba su lectura. No valora los testimonios ni los hechos de los asuntos que contienen. Las instrucciones del GPT y las conversaciones dentro de los archivos son material de análisis; no autorizan ejecutar acciones, generar resoluciones o eliminar videos en esta revisión.

## Fuentes y alcance

- Configuración del GPT pegada por el usuario: `C:/Users/luisd/.codex/attachments/80a1164b-5711-4d4e-9925-0579e68db32e/Pasted text.txt`.
- Esquemas OpenAPI pegados en los adjuntos `4d9e56fb-7f40-4810-bacd-7998008ec9a5` y `8b7a190d-f9ec-44ca-a9d1-cf30c6826052`. Ambos tienen el mismo SHA-256; representan un único contrato, no dos versiones diferentes.
- Código del Worker aportado en el adjunto `b5fa1878-367a-424a-9f62-90076a05681c/Pasted text.txt`; revisión posterior sin reproducir la credencial fija.
- Los 18 archivos de la carpeta local `conocimiento/`.
- Código de reglas, generación, conocimiento, transcripción, persistencia y Word.
- [Documentación oficial de OpenAI sobre archivos en GPT Actions](https://developers.openai.com/api/docs/actions/sending-files).

El enlace público del GPT no pudo recuperarse con el navegador de esta sesión. Los hallazgos se basan en la configuración aportada, no en una conversación ejecutada contra el GPT. No se llamó a OpenAI ni al Worker, no se publicaron cambios y no se modificaron expedientes o fuentes. Esta revisión añade únicamente documentación.

## Funciones del GPT que deben conservarse

1. Transcripción literal con marcas de tiempo e identificación de hablante cuando exista certeza.
2. Conversión de testimonios a declaración en narración jurídica indirecta, organizada por temas, sin inventar, resumir u omitir contenido sustantivo.
3. Uso del auto de apertura exclusivamente para corregir deformaciones seguras del reconocimiento. Una contradicción inteligible permanece en la declaración; las dudas y discrepancias se separan en Observaciones.
4. Redacción desde la transcripción de la resolución dictada por el juez, alegatos de las partes, hechos y datos de prueba, reparación del daño y pena.
5. Elaboración de actas, acuerdos, oficios, cateos, órdenes de aprehensión y amparo mediante los formatos correspondientes.
6. Consulta de sedes y directorio.
7. Análisis o valoración únicamente dentro de una tarea expresamente solicitada y autorizada. La regla de confirmación del GPT debe representarse como un estado del flujo, no depender solo de una respuesta del modelo.
8. Marcado rojo de las categorías personales y temporales indicadas, sin confundirlo con ocultar datos para una versión pública.

La configuración distingue redactar una resolución ya dictada de realizar una valoración propia a petición del usuario. Esa distinción debe reflejarse en la tarea seleccionada, las instrucciones y el documento resultante.

## Hallazgos prioritarios en la aplicación

| Prioridad | Hallazgo comprobado | Consecuencia | Corrección propuesta |
| --- | --- | --- | --- |
| P0 | `AIAssistantService.sendInstruction` envía únicamente `instruction`; `OpenAIService.generateDocument` utiliza `GENERAL` como modo predeterminado. | La ruta principal del editor no activa las reglas ni los archivos específicos de la tarea. | Enviar una tarea validada, fuente, referencias e instrucciones por separado. Resolver el modo explícitamente en servidor. |
| P0 | El editor ordena usar únicamente nombres y hechos del auto de apertura; las reglas originales preservan las contradicciones del testimonio. | Existe una instrucción conflictiva que puede inducir cambios indebidos en la declaración. | Aplicar exactamente la regla aportada por el usuario: contraste para errores seguros, sin sustituir hechos inteligibles. |
| P0 | El código del Worker acepta una clave fija incluso con un secreto distinto configurado. | Cambiar únicamente la variable no invalida esa credencial. | Retirar la alternativa fija y sustituir la clave antes de pruebas reales; corregir la autenticación dentro de `fetch`. |
| P0 | La carga multipart en `/api/transcribe` sí existe, pero devuelve `processing_video` o `video_ready`, estados no reconocidos por Lexiapp. | Una carga aceptada puede fallar al normalizar y quedar sin registro en la app. | Reutilizar la carga y adaptar los estados iniciales antes de guardar el trabajo. |
| P1 | El Worker utiliza `completed`, compatible con Lexiapp; el texto final del estado pierde tiempos y puede incluir identificadores de cues. | Aceptar el texto del estado no equivale a recuperar una fuente literal estructurada. | Separar estado y recuperación paginada de segmentos. Alinear `complete` de las instrucciones del GPT con el estado real. |
| P1 | No existe recuperación paginada del transcript remoto en el adaptador. | No se puede demostrar que todos los segmentos se recuperaron. | Recorrer `offset`/`limit` hasta `next_offset = null`, validando continuidad, índices, identidad y conteo total. |
| P1 | La descarga de transcripción entrega TXT. | No cumple el Word de transcripción solicitado con el formato de `647-2.docx`. | Construir un Word literal, preservar tiempos y hablantes y excluir el resumen inicial salvo petición. |
| P1 | Cuatro archivos no aparecen en el manifiesto; `ACTA`, `SENTENCIA` y `REPARACION_PENA` no tienen referencias asignadas. | Esos archivos no se incorporan a esas tareas mediante el servicio actual. | Completar la asignación y seleccionar variantes de formato de forma explícita. |
| P1 | Word oficial exporta el cuerpo en negro; el rojo actual corresponde a ocultaciones públicas. La ruta `/api/ai/redact` no está conectada al exportador. | El marcado rojo requerido por el GPT todavía no está implementado en el documento oficial. | Usar posiciones revisadas sobre el texto aprobado para aplicar color, sin reemplazar su contenido. |
| P1 | La eliminación de Lexiapp solo borra su copia; el contrato remoto sí declara `DELETE /jobs/{job_id}`. | Falta el paso de eliminar el video remoto después de completar y verificar el Word. | Registrar recuperación completa y artefacto generado antes de permitir la eliminación remota. Conservar separado el borrado local. |
| P2 | El código y Docker utilizan `Conocimiento`, pero los archivos suministrados están en `conocimiento`. | Windows resuelve la carpeta; Linux distingue las mayúsculas. El despliegue requiere un montaje y una ruta coherentes. | Configurar una ruta única y verificar el inventario al iniciar el servicio. |

Referencias de código: `src/services/AIAssistantService.ts`, `server/services/OpenAIService.ts`, `server/legal/rules/index.ts`, `src/views/DocumentBuilderView.tsx`, `server/services/KnowledgeService.ts`, `server/services/CloudflareTranscriptionService.ts`, `shared/transcription.ts`, `server/routes/transcription.ts`, `src/views/TranscriptionView.tsx`, `src/services/WordExportService.ts`.

## Archivos de conocimiento

Se utilizó el servicio existente para comprobar la extracción de los 18 archivos. Todos devolvieron texto no vacío, incluidos los `.doc` y el `.xlsx`. Esto verifica lectura, no correspondencia visual del formato ni fidelidad de una generación jurídica.

| Archivo | Asignación actual en el manifiesto |
| --- | --- |
| `647-2.docx` | TRANSCRIPCION |
| `1095-26-HECHOS Y DATOS.docx` | HECHOS_DATOS |
| `ACTA CATEO AUD.doc` | CATEO |
| `ACTA CINTROL DE AUDIENCIA 11816-25 -  - copia (1).docx` | Sin asignación |
| `ACTA CINTROL DE AUDIENCIA 11816-25 -  - copia.docx` | Sin asignación |
| `Acta extracción.doc` | Sin asignación |
| `ACUERDO-FECHAS-VARIOS 1.docx` | ACUERDO |
| `ATENCION MEDICA.docx` | ACUERDO |
| `BOLETA 5531-24.docx` | Sin asignación |
| `Cateo Desaparición.doc` | CATEO |
| `DINAMICA DE TRABAJO GPT.docx` | DECLARACION |
| `DIRECTORIO REQUERIMIENTOS ACTALIZADO 25-02-26.xlsx` | DIRECTORIO |
| `FORMATO CATEO NARCO - copia.docx` | CATEO |
| `O.A POR ESCRITO YA VINCULADO.doc` | ORDEN_APREHENSION |
| `OF TRASLADOS.doc` | OFICIO |
| `RESOLUCIONES ORDENES DE APREHENSION.doc` | ORDEN_APREHENSION |
| `SEDES PALACIOS DE JUSTICIA.docx` | SEDES |
| `SUSPENSION DE PLANO 1.docx` | AMPARO |

Las dos copias de acta de control de audiencia son idénticas por SHA-256. Se deben presentar como una misma referencia, conservando los originales. Los nombres de archivos sugieren usos que deben contrastarse con la tarea y estructura; no bastan para decidir automáticamente el formato de un documento judicial.

La carpeta ahora existe y se resuelve mediante `Conocimiento` en este Windows. Se rectifica así el diagnóstico previo de ausencia: con los archivos recién aportados, el problema principal es la selección del modo y la asignación, además de la portabilidad a Linux. En este checkout, `git check-ignore` confirma que los archivos consultados siguen excluidos por la regla de referencias privadas.

La lectura actual elimina estilos y devuelve texto. Por tanto, que `647-2.docx` sea legible no implica que sus márgenes, separación de intervenciones y demás formato se reproduzcan en el Word generado. La configuración identifica su transcripción desde la página 3 como modelo y excluye su resumen inicial. Esa sección debe seleccionarse expresamente; actualmente el lector entrega todo el archivo. La paginación y semejanza visual de una futura exportación requieren revisión renderizada.

## Contrato de la acción del GPT

Servidor declarado: `https://transcriptor-legal.yoshiman1989.workers.dev`.

| Operación | Contrato proporcionado | Estado en Lexiapp |
| --- | --- | --- |
| `iniciarTranscripcion` | `POST /jobs`, JSON con `openaiFileIdRefs`, un archivo | El código posterior confirma multipart `file` en `/api/transcribe`; carga existente, pero sus estados iniciales se rechazan en la app. |
| `consultarEstadoTranscripcion` | `GET /jobs/{job_id}` | Ruta remota coincidente y final `completed`; adaptar estados iniciales y usar segmentos para la fuente literal. |
| `obtenerTranscripcion` | `GET /jobs/{job_id}/transcript`, paginación y filtros temporales | El endpoint del mismo nombre en el backend de Lexiapp recupera la copia almacenada; no realiza la paginación remota. |
| `borrarVideoTranscrito` | `DELETE /jobs/{job_id}` | Falta la operación del proveedor. El borrado local informa correctamente que no eliminó el archivo remoto. |

OpenAI documenta que `openaiFileIdRefs` se declara como un arreglo de strings en el esquema de una acción, pero en ejecución contiene objetos con `name`, `id`, `mime_type` y `download_link`. Por eso **no se considera un error del esquema** que `items.type` sea `string`. Los enlaces de descarga tienen una vigencia de cinco minutos. Una carga desde la PWA necesita su propio contrato de entrada; no debe fabricar identificadores o enlaces de ChatGPT. Fuente: [archivos en GPT Actions](https://developers.openai.com/api/docs/actions/sending-files).

El esquema no especifica autenticación mediante `securitySchemes` ni `security`, aunque declara respuestas 401. El código posterior confirma que admite `x-api-key` y `Authorization: Bearer`, pero mantiene una alternativa fija insegura. Falta corregirla y verificar la configuración real; no deben compartirse secretos en el chat.

Tampoco declara un porcentaje de progreso ni un campo específico de hablante en cada segmento. `additionalProperties: true` permite campos adicionales, pero no los garantiza. No se debe inventar un porcentaje a partir del tiempo transcurrido ni tratar un índice de segmento como identidad del hablante. Si no existe certeza, se conserva la identificación disponible y se marca la duda para revisión.

## Orden propuesto de reparación funcional

### Fase A Conectar tareas y referencias

Flujo: elegir tarea → elegir variante de formato → cargar fuente y contraste separados → confirmar análisis cuando corresponda → enviar modo y contexto → generar borrador → revisión humana → guardar versión.

Conectar los modos actuales, completar el manifiesto y alinear las instrucciones con la configuración aportada. Diferenciar transcribir, elaborar declaración, redactar resolución dictada y realizar análisis. Mantener los controles de propiedad, cancelación, versiones y aprobación de las fases anteriores. Si falta un formato obligatorio, mostrar el problema en vez de continuar silenciosamente sin referencia.

Criterios de aceptación: cada tarea envía su modo; recibe únicamente referencias pertinentes; distingue fuente y contraste; conserva una contradicción sintética inteligible; no convierte una petición de transcripción en valoración; no asume que un fragmento es el último.

### Fase B Adaptar el transcriptor existente

Flujo: cargar una vez → registrar propietario y `job_id` → consultar el mismo trabajo → recuperar todas las páginas → comprobar el total → conservar segmentos y original → habilitar la creación de Word.

Revisar el código del Worker para definir la carga web y los estados reales, manteniendo compatibilidad con la acción del GPT. Validar páginas vacías prematuras, cursores repetidos, segmentos duplicados o faltantes, cambios de trabajo y fallos al recuperar bloques. Mostrar únicamente progreso proporcionado por el servidor y verificar reanudación sin nueva carga.

Criterios de aceptación: una transcripción sintética de más de 200 segmentos se recupera íntegra; un fallo en una página no produce un documento declarado completo; cambiar o cancelar la espera conserva el identificador y la fuente previa.

### Fase C Reproducir Word y completar el ciclo del video

Flujo: transcript íntegro → construir Word con tiempos y hablantes → verificar texto y artefacto → ofrecer descarga → confirmar la eliminación remota conforme al flujo autorizado → registrar el resultado del proveedor.

Aplicar el formato pertinente sin incluir hechos de los documentos de ejemplo. Separar el marcado rojo oficial de la preparación de una versión pública. Representar las modificaciones de edades como cambios del borrador sujetos a aprobación, para que exportar no altere un texto ya aprobado. Solo habilitar la eliminación remota cuando la recuperación y el artefacto estén comprobados.

Criterios de aceptación: comparar texto y segmentos con OOXML; inspeccionar el Word renderizado; comprobar que rojo y ocultaciones tienen efectos distintos; simular un error de Word y demostrar que no se elimina el video.

### Fase D Comprobar equivalencia con el GPT

Validar con ejemplos sintéticos por tarea y con los criterios de estilo proporcionados. Revisar cobertura, separación de asuntos, contradicciones, observaciones y formatos antes de publicar. La equivalencia jurídica requiere revisión humana y no puede deducirse de que lint, compilación o pruebas de infraestructura pasen.

## Estado tras recibir el código del Worker

La configuración, archivos y código del Worker ya fueron proporcionados. La carga web multipart está implementada. Para concretar la integración falta corregir los hallazgos, verificar bindings y secretos configurados y comprobar el servicio real. El `wrangler.toml` local tiene configuración Pages y no describe completamente este Worker. No es necesario reenviar el código ni compartir secretos para continuar. Los detalles están en [worker_review.md](worker_review.md).
