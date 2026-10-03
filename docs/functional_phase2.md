# Fase funcional 2 Elaboración guiada y contexto continuo

Estado: implementación técnica local verificada el 2 de octubre de 2026. La generación real y la evaluación de fidelidad jurídica quedan pendientes de saldo en la API de OpenAI. No se publicó esta versión.

## Flujo documentado antes de codificar

Transcripción terminada o texto/documento aportado → elegir tarea y formato → iniciar pasos guiados → elegir asunto y paso → recibir borrador → editar o rehacer → aceptar y continuar → guardar → revisión final → exportar con los controles existentes.

La acción **Resumir transcripción** del Blueprint selecciona una variante de la tarea de análisis: recepción de fuente → resumen solicitado → revisión. No inicia llamadas automáticamente y exige la misma confirmación vinculada a la solicitud. La instrucción inicial reproduce el alcance de ese botón. Los oficios se ofrecen con el formato de traslado disponible; otros escritos se delimitan mediante la tarea y la instrucción propia, sin inventar modelos.

Los pasos de sentencia, acta, demanda de amparo y análisis conservan las secuencias del Blueprint v2. Sentencia reproduce lo efectivamente dictado; la valoración propia se solicita expresamente como análisis. La suspensión de plano disponible tiene su propio flujo. La demanda completa requiere un formato aportado por el usuario, separado de los hechos del asunto. No se inventan formatos ni reglas jurídicas.

Los botones de navegación no llaman a la IA. La instrucción del paso es editable y delimita el apartado dentro de las reglas actuales del GPT. El análisis o resumen requiere una confirmación vinculada a toda la solicitud, también cuando se solicita mediante instrucción libre o corrección. Cada resultado entra como apartado pendiente de aceptación. Rehacer sustituye el apartado y conserva una versión previa guardada; no añade una copia. Cancelaciones y errores mantienen el texto anterior.

En declaraciones por partes, el usuario identifica al hablante y marca expresamente el fin de la recepción. Añadir otra parte elimina esa marca y obliga a revisar los apartados existentes. Recibir otro hablante crea un grupo separado con fuentes vacías. No se infiere el cambio de testigo ni que terminó. En actas con varios asuntos, cada asunto conserva sus propias fuentes y apartados. Cambiar de asunto intercambia las fuentes visibles; la solicitud al proveedor contiene únicamente el asunto seleccionado, nunca fuentes de los demás. El cambio de tarea o formato en un documento con varios grupos está bloqueado para conservar sus asignaciones.

La corrección por fragmento trabaja sobre el texto seleccionado de un apartado y conserva sus alrededores. En modo guiado se edita el apartado actual; el campo de texto completo queda de solo lectura. Los rangos se actualizan por un cambio mecánico, sin inferir asignaciones jurídicas. Los cambios que cruzan apartados se rechazan y conservan todo el documento. Cada apartado generado o modificado debe aceptarse antes de aprobar y exportar el documento.

## Estado y contexto

El borrador persistente es la fuente de verdad: tarea, formato, asuntos, apartado actual, aceptación, instrucciones, recepción y referencias jurídicas seleccionadas. Los apartados apuntan a rangos del texto para evitar otra copia completa. Las fuentes del asunto activo están en los campos existentes; las de los asuntos inactivos están en su contexto separado. No se crean colecciones nuevas.

Cada solicitud incluye las fuentes separadas, los apartados del asunto activo, la instrucción, el destino del cambio y las referencias que el usuario eligió. La recarga reconstruye el contexto desde Firestore. El servidor valida selección, paso, referencias, destino y confirmación antes del proveedor. Las referencias de investigación se mantienen separadas de los hechos y no se insertan automáticamente en el documento.

## Entrada de documentos e investigación

Importar una fuente, contraste o formato extrae texto de TXT UTF-8, DOCX, DOC y PDF localmente en el servidor autenticado. El usuario elige su destino; no implica análisis ni transcripción de video. Límites: 10 MiB por archivo, 500 000 caracteres extraídos y 20 MiB de expansión de DOCX, además de las verificaciones de archivos comprimidos. Se comprueba el contenido real y se rechazan archivos disfrazados o ilegibles. Los temporales se eliminan también ante errores. Los PDF escaneados sin texto requieren OCR fuera de esta fase; no se fabrica una extracción. El formato aportado admite 200 000 caracteres.

Se mantienen los límites existentes de solicitudes JSON (1 MiB) y de instantáneas persistentes (700 KiB). Varias fuentes, referencias extensas o caracteres de varios bytes pueden alcanzar estos límites antes del máximo de caracteres. La recepción por bloques para fuentes largas corresponde a la fase funcional 3; esta fase devuelve un error y conserva el trabajo, sin truncar fuentes.

La búsqueda SCJN se ejecuta solo mediante Buscar. El usuario decide qué resultado completo incorpora al contexto. PJENL y DOF se abren mediante una acción explícita; puede añadir texto y enlace de una referencia revisada. La ampliación de conectores jurídicos corresponde a la fase funcional 6.

## Verificación y pendientes

Verificación: `npm run check` pasó con lint, tipos estrictos, construcción de cliente y servidor y 84 pruebas (54 unitarias/HTTP y 30 de interfaz). `npm run test:emulator` pasó con 16 pruebas (12 de persistencia y 4 de reglas). Son 100 pruebas en total, incluidas 20 nuevas para esta fase. Las pruebas nuevas usan fuentes y resultados sintéticos; verifican reemplazos, rangos, aceptación, recarga, aislamiento de asuntos, recepción por partes, referencias, confirmación, importación, límites y limpieza de temporales. La persistencia se comprobó también con un segundo cliente Admin y restauración de versiones inmutables.

La clave existente se reutilizó conforme a la autorización previa. Una llamada real mínima de disponibilidad, solo con texto sintético, devolvió HTTP 429, código `credit_balance_exhausted`. Es falta de saldo de API; no se considera una validación de respuesta real ni se reintenta automáticamente. El usuario necesita añadir saldo en [facturación de OpenAI](https://platform.openai.com/settings/organization/billing). Después podrá repetirse la prueba sintética y evaluar los resultados por tarea. El modelo configurado permanece igual; para experimentos sencillos, `gpt-6-luna` es una opción inicial si se decide configurarla.

Módulos y estado: `shared/workflowCatalog.ts`, `workflowTypes.ts`, `workflowValidation.ts` y `workflowEngine.ts`; componentes `TaskActions` y `GuidedPanel`; servicio `SourceImportService`; ruta autenticada `/api/sources/import`. `AIAssistantService.syncDocumentState` reconstruye el contexto desde el borrador; no depende de identificadores de conversaciones del proveedor. El contrato de generación añade contexto opcional y mantiene la compatibilidad de documentos anteriores.

Se prepararon exclusiones de índices para `workflow` en documentos y versiones; no se publicaron cambios de Firestore. El diagnóstico remoto de configuración comprueba también esos campos antes de una publicación. El estado usa las colecciones existentes, con escritura por API y controles de propietario. La preparación de despliegue y publicación corresponden a la fase funcional 5.

La comprobación de instalación limpia también pasó: `npm ci`, lint, tipos, compilación y pruebas en una copia temporal sin archivos legales ni credenciales privadas. La auditoría local de exposición de secretos y `git diff --check` no encontraron problemas.

No se modifica ni publica el Worker. Sus correcciones corresponden a la fase funcional 3. El formato Word adicional y el ciclo de video corresponden a la fase funcional 4.
