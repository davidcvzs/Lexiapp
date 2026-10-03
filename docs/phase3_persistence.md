# Fase 3: persistencia y recuperación

## Flujos definidos antes de implementar

1. Mis Documentos consulta exclusivamente los documentos del usuario autenticado. Nuevo Documento abre el editor vacío; escribir guarda automáticamente tras una pausa. Guardar ahora espera la escritura y muestra el resultado. Abrir recupera fuentes, metadatos, contenido y auditoría mediante el identificador en la URL.
2. El editor permite editar el borrador. Historial lista versiones confirmadas; restaurar carga una versión como cambio pendiente, conservando el historial. Cambiar contenido o fuentes invalida el visto bueno. Generación conserva los mismos prompts de la fase 2.
3. Cada escritura incluye la revisión leída. Un conflicto entre pestañas produce 409 y detiene el guardado automático; el texto local permanece visible para copiarlo antes de recargar. No se sobrescribe silenciosamente el documento remoto. La página advierte al cerrar con cambios sin guardar; los enlaces internos esperan el guardado antes de navegar. No hay caché de documentos sensibles en localStorage ni modo de edición sin conexión.
4. Transcripción muestra los trabajos guardados. Abrir/reanudar consulta el identificador existente sin necesitar el archivo original. Descargar recupera el texto confirmado. Eliminar pide confirmación indicando que solo elimina la copia de LexIA: no hay contrato verificado de cancelación o borrado del Worker.
5. Eliminar documento borra sus fuentes, borrador, versiones y expediente asociado. La marca de eliminación conserva únicamente propietario, identificador y fecha para impedir que una respuesta o escritura tardía reviva el contenido.

## Almacenamiento y acceso

Firebase Auth identifica al propietario en todas las rutas. Firebase Admin accede a Firestore desde el servidor; no se reciben UID de propietario del navegador. `DatabaseService` pasa a consumir la API autenticada. `cases` continúa siendo el expediente asociado, uno por documento; `documents/{id}/versions/{revision}` contiene instantáneas y `transcriptionJobs/{providerId}` contiene propietario, identificador externo, nombre del archivo, estado y fechas.

Los campos extensos quedan excluidos de índices. Listados paginados utilizan índices compuestos declarados en `firestore.indexes.json`. La API limita tamaño y frecuencia de escrituras. Las reglas del cliente deniegan las nuevas colecciones: el servidor comprueba al propietario también para administradores.

Antes de contactar al proveedor se comprueba el acceso a Firestore. Una transcripción aceptada por el proveedor se guarda antes de responder al navegador. Si la red se corta antes de obtener un identificador remoto, o la escritura falla después de la aceptación, no es posible recuperar automáticamente el trabajo desconocido; se conserva esta limitación del contrato del Worker. No se almacenan archivos originales de audio en Firestore.

## Operación y validación

Firestore debe estar creado en el proyecto y accesible con las credenciales administrativas existentes o identidad del servicio. La persistencia no depende del disco del contenedor ni de un Map del proceso. Tras la habilitación por el usuario se publicaron exclusivamente las reglas e índices de Firestore en `lexia-pj`; no se desplegó Hosting ni el backend.

Los cambios se verifican con Firestore Emulator y proveedores sintéticos: reinicio/recreación de repositorio y rutas, aislamiento entre propietarios, conflictos, versiones, restauración y eliminación concurrente. No se realizan llamadas facturables ni se envían documentos reales a proveedores en estas pruebas.

Estado del entorno (2026-10-02): el diagnóstico inicial detectó la API deshabilitada (HTTP 403, `SERVICE_DISABLED`). Después de que el usuario habilitara Firestore, `npm run check:persistence` confirmó una base nativa `(default)` disponible con las credenciales existentes. Se comprobó que las reglas remotas estaban en modo de prueba, con acceso general hasta el 2026-11-01, y no existían los índices requeridos. Se publicaron `firestore.rules` y `firestore.indexes.json` correctamente; la lectura posterior confirmó que las reglas publicadas coinciden con las locales. Los índices se construyen de forma asíncrona y se verifican con `npm run check:firestore-config`. Continúan las limitaciones de fase 2: Worker sin configuración válida y OpenAI sin saldo.

El guardado automático espera una pausa de un segundo; solo «Guardado · versión N» confirma persistencia. Descartar la advertencia al cerrar puede perder cambios todavía no confirmados. Versiones son instantáneas completas y se conservan hasta eliminar el documento. Los archivos y trabajos antiguos que solo existían en memoria no se pueden migrar sin sus identificadores y fuentes.

Validación local: 43 pruebas aprobadas (8 persistencia en Emulator, 7 interfaz de persistencia, 12 contratos del flujo, 6 interfaz de transcripción/generación, 6 seguridad HTTP y 4 reglas Firestore). `npm run build`, TypeScript de módulos implicados, ESLint de módulos modificados y `git diff --check` correctos. Continúan los avisos de tamaño del bundle y datos de Browserslist del proyecto.

Para ejecutar pruebas de persistencia: iniciar Firestore Emulator y ejecutar `npm run test:persistence`; `FIRESTORE_EMULATOR_HOST` es obligatorio para evitar cualquier acceso a producción. `npm run test:persistence-ui` no necesita credenciales ni proveedores.

`npm run deploy:firestore -- --apply` comprueba que el proyecto del frontend, backend y credencial existente coincidan y publica solo reglas e índices. La credencial ignorada por Git se usa únicamente en el entorno del proceso hijo; no se copian ni imprimen claves. `npm run smoke:persistence -- --live` es una prueba manual de la base real: genera identificadores únicos y fuentes sintéticas, comprueba almacenamiento, recuperación, versiones, permisos de propietario en el repositorio y eliminación, y retira los registros y marcas creados por esa ejecución. No crea usuarios ni llama a IA o al Worker. La limpieza se verifica incluso cuando la prueba falla porque un índice todavía se está construyendo.

Resultado remoto confirmado (2026-10-02): ambos índices requeridos alcanzaron `READY`, las reglas remotas coinciden con las locales y `npm run smoke:persistence -- --live` terminó correctamente. Se probaron listados indexados, documento y expediente asociados, recuperación con un segundo cliente administrativo, conservación de versiones, rechazo de revisión desactualizada (409), rechazo de otro propietario (403), recuperación de trabajos y eliminación. Se verificó que los registros sintéticos, versiones y marcas de eliminación quedaron retirados. La prueba usa el repositorio administrativo real; no constituye una prueba de inicio de sesión y navegación en un frontend desplegado ni de proveedores de IA.
