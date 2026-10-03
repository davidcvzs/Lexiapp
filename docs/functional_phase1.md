# Fase funcional 1 Tareas reglas y conocimiento

Estado: implementación técnica local verificada. La aceptación de fidelidad con respuestas reales queda pendiente de disponibilidad del proveedor y revisión humana. Los pasos guiados completos corresponden a la fase funcional 2.

## Flujo antes de codificar

Abrir o crear documento → elegir explícitamente tarea jurídica → elegir variante de formato → aportar fuente original y copia de trabajo, contraste separado e instrucción → confirmar análisis si la tarea lo requiere → generar borrador → revisar → guardar versión.

Un documento anterior sin tarea sigue abriéndose y exportándose según su aprobación existente. Una generación nueva exige selección explícita; no se infiere la tarea a partir del título o tipo anterior. Cambiar fuentes, tarea, formato o instrucción deja sin efecto una confirmación de análisis anterior. La generación de análisis tiene una confirmación vinculada a la solicitud concreta y se valida en servidor antes de contactar al proveedor.

El editor envía fuente y contraste en campos separados. Las reglas actuales del GPT suministradas por el usuario tienen prioridad sobre instrucciones históricas dentro de documentos de ejemplo. Los ejemplos son referencias de formato y no fuentes de hechos del asunto actual. El auto de apertura permite corregir deformaciones seguras del reconocimiento, conservando diferencias inteligibles del testimonio.

## Contratos y referencias

Un catálogo compartido define tareas y variantes, identificadores de referencia y necesidad de fuente o confirmación. El servidor resuelve los archivos únicamente desde ese catálogo. No recibe rutas arbitrarias del cliente. La referencia de acta duplicada comparte un identificador lógico y conserva ambos originales; acta de extracción y acuerdo de boleta se asignan según sus estructuras revisadas.

La ruta de conocimiento es configurable mediante `KNOWLEDGE_DIR`, con `conocimiento` como nombre predeterminado coherente para Linux. Una referencia requerida ausente, ilegible o vacía impide la generación e informa el nombre; no se sustituye por generación sin formato.

Cada respuesta de tarea devuelve texto y procedencia: tarea, variante, versión y huella de reglas, y huellas de referencias. El registro se conserva en las versiones del documento junto con fuentes separadas. Los registros anteriores sin esa procedencia siguen siendo compatibles.

La confirmación documenta el alcance elegido por el usuario; no es una garantía sobre la calidad jurídica de una respuesta. Las pruebas locales verifican contratos, separación, bloqueo y persistencia. La evaluación de fidelidad de respuestas reales requiere saldo y revisión humana.

## Tareas y formatos conectados

| Tarea | Referencias o comportamiento |
| --- | --- |
| Declaración | Dinámica de trabajo del GPT. Las reglas actuales tienen prioridad sobre conversaciones históricas. |
| Transcripción literal | Modelo 647-2; las reglas omiten la síntesis inicial y requieren conservación de intervenciones. La fidelidad Word se verifica en fase 4. |
| Alegatos, resolución dictada, reparación y pena | Fuente del asunto e instrucciones aportadas; no se inventa un modelo adicional. |
| Hechos y datos | Formato 1095-26. |
| Acta | Audiencia de control, extracción de fluidos o audiencia de cateo. |
| Acuerdo | Acuerdos y fechas, atención médica o recepción de boleta. |
| Oficio | Traslados. |
| Resolución de cateo | Formato general o desaparición; el acta de audiencia está en la tarea Acta. |
| Orden de aprehensión | Resoluciones o por escrito ya vinculado. |
| Amparo | Suspensión de plano; no presupone un formato de demanda ausente. |
| Sedes | La solicitud completa predeterminada devuelve el texto literal; instrucciones distintas usan IA con la misma referencia. |
| Directorio | Búsqueda estructurada en Excel, sin IA; los términos deben aparecer en la misma fila. |
| Análisis solicitado | Alcance escrito y confirmación de la solicitud exacta antes de la IA. |

Son 15 tareas y 17 referencias únicas provenientes de los 18 originales. La copia idéntica del acta permanece intacta. Un dato faltante no se completa con hechos de los ejemplos.

## Estado persistente y compatibilidad

Se conservan `generationTask`, `generationInstruction`, `analysisConsent` y la `provenance` de cada registro de generación. Las versiones usan las colecciones existentes. Los campos se validan al leer y guardar. Los documentos anteriores no reciben una tarea inferida ni cambian sus huellas de aprobación por abrirlos. Las modificaciones materiales sí requieren revisión nueva.

La confirmación vincula tarea, formato, instrucción, fuente original, copia de trabajo, contraste, borrador e historial. Cambiar cualquiera de esos elementos hace que el servidor rechace una confirmación anterior. Una confirmación no se reutiliza después de insertar un resultado nuevo. Los fallos, respuestas de otra tarea, procedencias inválidas y cancelaciones conservan el borrador y no agregan registros de éxito.

El endpoint anterior de texto permanece por compatibilidad; rechaza modos desconocidos y exige el contrato nuevo para el modo de análisis. El editor utiliza siempre el contrato nuevo. La confirmación registra el alcance declarado por el usuario, sin atribuirle carácter de firma o autorización judicial.

## Verificación

- `npm run check`: lint, tipos de cliente/servidor/scripts, compilación y 65 pruebas (43 unitarias y 22 de interfaz).
- `npm run check:clean`: instalación desde el lockfile y las mismas comprobaciones en una copia temporal sin credenciales ni fuentes privadas; aprobada. Auditoría de esa instalación: 0 vulnerabilidades.
- `npm run test:emulator`: 15 pruebas (11 de persistencia y 4 de reglas), incluido reinicio, historial inmutable y procedencia de tareas. Proyecto `demo-lexia-security`; no escribe en Firestore real.
- `npm run check:knowledge`: 17/17 referencias legibles, con huellas; solo imprime metadatos, sin contenido.
- Las instrucciones del GPT coinciden con el bloque proporcionado por el usuario después de normalizar saltos de línea; versión `gpt-2026-10-02.1`.
- `git diff --check`: sin errores de espacios. Las fuentes privadas permanecen excluidas por Git y Docker.
- Auditoría local de secretos: sin coincidencias de la clave en historial Git alcanzable ni código y artefactos inspeccionados.

No se realizaron solicitudes reales a OpenAI o al Worker. La revisión de calidad de una respuesta jurídica real y la comprobación del contenedor Linux siguen pendientes. La infraestructura de pruebas usa ejemplos sintéticos; el diagnóstico de referencias comprueba únicamente lectura y huellas.

## Límites de esta fase

No modifica ni publica el Worker ni realiza llamadas reales a proveedores. Su autenticación fija debe corregirse antes de pruebas reales. No declara completados los flujos guiados, la descarga Word literal de video, marcado rojo oficial ni borrado remoto.
