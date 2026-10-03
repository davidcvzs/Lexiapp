# Fase 4: integridad documental y exportación

## Flujos definidos antes de implementar

1. Las fuentes originales se conservan separadas de la transcripción de trabajo editable, las instrucciones de cada generación y el borrador. Capturar como original conserva una fuente manual; una carga válida añade su texto a la fuente original y a la copia de trabajo. La primera generación captura una fuente manual aún no conservada. Las instrucciones jurídicas existentes se mantienen literalmente.
2. Cada fase muestra pendiente, generada, fuentes cambiadas o revisada. Cambiar fuentes, metadatos o borrador invalida las aprobaciones. Aprobar los tres controles del borrador registra una huella de la instantánea revisada; la exportación comprueba esa huella, también después de guardar y reabrir.
3. Revisar datos personales es un control de auditoría independiente de elegir versión oficial o pública. La versión oficial conserva el texto aprobado completo. Elegir versión pública abre un panel de ocultaciones, con sugerencias de correos, teléfonos, identificadores, fechas y posibles nombres, más búsqueda literal manual. Ninguna sugerencia se aplica sin selección del usuario.
4. Cada ocultación corresponde a posiciones concretas del borrador. La vista pública muestra únicamente los reemplazos seleccionados, en rojo, sin títulos o atributos que contengan el original. El usuario confirma la revisión de la vista pública. Cambiar el texto, fuentes, aprobaciones u ocultaciones invalida esa confirmación; cambiar el borrador elimina posiciones antiguas para evitar ocultar otros caracteres por error.
5. Exportar espera el guardado y usa la instantánea aprobada. El generador Word recibe un documento y una variante explícita, preserva párrafos, saltos, tabulaciones, espacios y caracteres, y lanza errores que la interfaz muestra. Mis Documentos ofrece explícitamente la versión oficial; la pública se revisa en el editor. Copiar utiliza la variante visible.

## Datos y compatibilidad

`DocumentDraft` incorpora fuente original, registro de instrucciones y huellas de fuentes, estados de fase, huella de revisión y plan de ocultaciones con confirmación independiente. Los documentos antiguos pueden abrirse; las aprobaciones antiguas sin huella requieren revisión de nuevo. No se puede reconstruir una fuente original que nunca se almacenó: para registros antiguos se conserva como referencia la transcripción guardada.

La huella vincula la aprobación con metadatos, fuentes y texto. No prueba corrección jurídica ni identidad del revisor. El servidor elimina aprobaciones con huellas inválidas antes de persistir. Las posiciones de ocultación se validan: límites, ausencia de solapamientos y conservación de límites Unicode. La detección es orientativa y no demuestra que una versión pública carezca de datos personales.

Seleccionar una ocultación que solapa con otra reemplaza la selección anterior; la vista previa permite comprobar el resultado y requiere nueva confirmación. Se admiten como máximo 2000 ocultaciones. Fuente original y registro de generación quedan excluidos de índices en Firestore, tanto para el documento actual como para sus versiones.

## Arquitectura y comprobaciones

- `shared/documentIntegrity.ts`: huellas, invalidación, aprobación y transformación de la versión pública.
- `shared/redaction.ts`: posiciones y sugerencias; motor compartido de vista previa y exportación.
- `src/components/documents/PublicVersionReview.tsx`: selección explícita y revisión de la vista pública.
- `WordExportService`: construcción comprobable del DOCX, descarga separada y metadatos públicos sin fuente privada.
- Pruebas OOXML comparan el texto de Word con el texto aprobado y examinan el paquete para comprobar formato y ausencia de originales seleccionados en la versión pública. Las pruebas de interfaz cubren invalidación, selección de variante, revisión pública y errores.

Las pruebas usan textos sintéticos, sin llamadas a OpenAI o al Worker y sin publicar documentos reales. `npm run qa:word` genera archivos locales de prueba para la revisión visual. El DOCX conserva Times New Roman de 12 puntos, interlineado de 1.5 y márgenes existentes; conserva líneas vacías y tabulaciones y normaliza CRLF/CR a saltos de párrafo LF. Rechaza expresamente caracteres de control que XML no puede conservar. La huella incluida en las propiedades del Word corresponde al texto de la variante exportada.

## Resultado de validación (2026-10-02)

58 pruebas aprobadas: 8 de integridad/OOXML, 5 de interfaz de integridad, 10 de persistencia en Emulator, 7 de interfaz de persistencia, 12 de contratos del flujo, 6 de interfaz de generación/transcripción, 6 de seguridad HTTP y 4 de reglas Firestore. Compilación de producción, TypeScript de los módulos implicados, ESLint de los archivos de esta fase y `git diff --check` correctos. Persisten los avisos conocidos de tamaño del bundle, importación dinámica de Firebase y antigüedad de Browserslist; no impiden compilar.

Se renderizaron y revisaron visualmente los Word oficial y público sintéticos con LibreOffice: dos páginas por variante, cuatro páginas inspeccionadas, márgenes y caracteres visibles, continuación de párrafos y ocultaciones en rojo. Las comprobaciones OOXML verificaron igualdad del texto exportado y ausencia de los originales seleccionados en todo el paquete público. Esta revisión no sustituye la auditoría humana de cada documento real ni garantiza idéntica paginación entre programas de oficina.

Se publicaron exclusivamente las reglas e índices de Firestore en `lexia-pj`. Las reglas remotas coinciden con las locales; ambos índices de listados están `READY`; las cuatro exclusiones nuevas están confirmadas sin índices ni herencia predeterminada. La prueba manual de Firestore real comprobó recuperación con otro cliente, fuente original separada, aprobación y ocultaciones vinculadas a sus huellas, invalidación tras editar, versiones y eliminación. Se confirmó la limpieza de todos los registros sintéticos de esa ejecución.

El frontend y backend modificados permanecen en el proyecto local; esta fase no desplegó Hosting ni un servicio de API. No se realizaron llamadas a OpenAI ni al Worker. Continúan las limitaciones documentadas de saldo de OpenAI y configuración del Worker, que no afectan a la revisión y exportación de borradores existentes.
