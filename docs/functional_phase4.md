# Fase funcional 4 Word y ciclo del video

## Flujo definido antes de implementar

La transcripción completa y su manifiesto se recuperan desde los bloques del propietario. El usuario revisa la fuente, elige el formato y los intervalos de marcado oficial, genera el Word sin IA y conserva el DOCX verificado en Firestore antes de ofrecer su descarga. La descarga no acredita por sí sola que el archivo quedó guardado en el dispositivo. El borrado remoto exige una confirmación expresa posterior y un artefacto íntegro que el servidor vuelva a comprobar. La fuente y el Word permanecen disponibles tras borrar el video.

El panel de Word aparece junto al resultado de transcripción y al abrir un trabajo del historial, incluso si la fuente supera los límites del redactor. Conserva el identificador del trabajo; no transfiere todos sus segmentos al estado de navegación. «Eliminar copia de LexIA» conserva su operación local independiente; no activa borrado remoto.

El redactor incorpora marcado oficial por posiciones revisadas, separado de las ocultaciones públicas. Las categorías proceden del GPT: nombres, apellidos, iniciales, apodos, domicilios/componentes, marcas de vehículos, números de serie, fechas y edades. Las propuestas de convertir edades se muestran como cambios del borrador y requieren aplicación expresa antes de la aprobación. La transcripción literal original nunca se modifica para exportar.

## Contrato y almacenamiento implementado

- `shared/officialMarking.ts` valida intervalos Unicode, categorías y propuestas de edades. `shared/wordFormatting.ts` define perfiles Carta y metadatos aportados; no inventa juzgado, expediente ni firmantes. El perfil de transcripción se obtiene del formato de `647-2.docx`, excluyendo su resumen y datos del ejemplo.
- `shared/transcriptWord.ts` define solicitud revisada, recibo de Word y estado del borrado remoto. La huella de revisión comprende fuente, perfil, metadatos y marcado. Cambiarlos invalida la aprobación; un recibo pertenece a su trabajo y fuente exactos.
- Generación `POST /api/transcription/jobs/:id/word`; recuperación de estado `GET` sobre la misma ruta; descarga autenticada `GET /word/download`. El servidor construye desde segmentos verificados, compara texto OOXML y conserva SHA-256 de texto y binario. El navegador vuelve a comprobar el binario descargado.
- `transcriptionJobs/{id}/wordArtifacts/{artifactId}` y subcolección `blocks`: DOCX privado en bloques de hasta 256 KiB, máximo inicial visible de 4 MiB comprimidos. La creación de bloques, recibo y referencia vigente es transaccional y queda por debajo del límite de la transacción; exceder el límite falla sin truncar. Se reutilizan propietario, Firestore y denegación de acceso directo del navegador. No requiere bucket ni directorio público.
- Borrado remoto mediante una ruta distinta `/jobs/:id/remote-video`, con identidad/huella del artefacto, confirmación de descarga y autorización expresa. Un estado durable se reserva antes de contactar al Worker. Un resultado ambiguo se consulta y nunca provoca automáticamente otro DELETE. Se preservan el namespace y los secretos del Worker; esta fase no modifica ni elimina videos reales durante pruebas.
- No se llama a Gemini/OpenAI para construir Word. Gemini sigue seleccionado para generación jurídica; saldo y evaluación OpenAI quedan para el final. TUS continúa desactivado con sus pruebas pendientes.

## Verificación y aceptación

Pasan 229 pruebas: 141 unitarias/integración, 52 de interfaz y 36 de Firestore Emulator. Cubren texto y formato OOXML, categorías oficiales y ocultaciones independientes, cambios visibles de edades, revisión invalidada, segmentos largos y completos, persistencia/reinicio/propiedad, fallos de generación/almacenamiento/descarga y recuperación de borrado ambiguo. La revisión independiente corrigió perfiles/encabezados incorrectos y una carrera entre pestañas: la creación devuelve el recibo vigente comprobado o un conflicto 409. Compilación y lint pasan; se vuelven a comprobar después de añadir el ensayo manual.

Las suites de interfaz se ejecutan con dos procesos concurrentes: once procesos JSDOM/Word simultáneos provocaron tres expiraciones de la espera de interfaz; los mismos casos pasaron en ejecución acotada. Se conserva el tiempo de espera de las pruebas y se limita la competencia por CPU, sin desactivar aserciones.

El ensayo manual `scripts/smoke-transcript-word.ts --live` verifica el almacenamiento real usando exclusivamente un trabajo sintético único, dos clientes SDK y el mismo servicio de Word. Comprueba descarga binaria, fuente completa, idempotencia y aislamiento; limpia su propia referencia y subcolecciones. El proveedor inyectado falla ante cualquier llamada, de modo que no intervienen Stream ni IA. Los resultados se registran al terminar, sin fuentes ni secretos en la salida.

La aceptación visual permanece pendiente. Se resolvió el runtime empaquetado de Windows y su manifiesto declara `libreOfficeVersion: null`. El resolver de `render_docx.py`, con PATH restringido al bundle, confirmó que falta LibreOffice; no se usó el instalado en el escritorio. La skill de documentos exige «render → inspect PNGs → iterate». Las aserciones OOXML no sustituyen la inspección de márgenes, saltos, legibilidad o contenido cortado. Los PNG de la fase técnica anterior no verifican los perfiles y marcas nuevos.

La protección de Word persistido y confirmación de descarga pertenece a la API de Lexiapp. El DELETE directo del Worker utilizado por el GPT conserva su contrato anterior y no exige este recibo. Esta fase no publica el frontend ni el servidor API; la publicación y el ensayo del flujo completo corresponden a la fase funcional 5.

Estado: trabajo detenido y pendientes pospuestos por petición del usuario el 2 de octubre de 2026. Los cambios se conservan, sin declarar aceptación completa ni publicar el frontend o la API. No se ha ejecutado borrado remoto real ni modificado archivos de conocimiento originales. Gemini permanece seleccionado y el saldo/evaluación OpenAI se dejan para el final.

Punto de reanudación: las 229 pruebas anteriores pasaron antes del último ajuste de canonicalización de formato/recibo en `shared/transcriptWord.ts`. Ese ajuste y el ensayo manual quedan pendientes de comprobación final; no presentar los resultados anteriores como validación de esos cambios posteriores. La revisión visual y el ensayo del ciclo remoto de esta fase también quedan pospuestos.

Firestore real ya tiene las cuatro exclusiones nuevas activas: `wordArtifacts.format`, `blocks.data`, `documents.wordFormat` y `versions.wordFormat`. La comprobación remota confirmó 14 exclusiones críticas, 21 totales y dos índices compuestos READY; los elementos previos no cambiaron. El backup de metadatos se conservó fuera de OneDrive. La revisión automática rechazó la limpieza de los dos directorios temporales de configuración con «blocked by policy», sin detalle adicional; permanecen privados fuera de OneDrive y no contienen claves nuevas ni fuentes legales.

## Reanudación del 3 de octubre de 2026

Verificación final del ajuste de canonicalización de `shared/transcriptWord.ts`:

- `npm run typecheck` fallaba solo en `scripts/smoke-transcript-word.ts`: `Firestore.projectId` no es público en los tipos de Admin SDK. Se sustituyó por la comprobación de la app vinculada (`getFirestore(app)` está cacheado por app) y la instancia del segundo cliente distinta. Typecheck pasa.
- Lint pasa. Unitarias/integración: 141/141. Interfaz: 53/53 (incluye la nueva prueba de claves reordenadas de Firestore que conserva la huella de revisión y permite la descarga).
- Firestore Emulator (36 pruebas, incluye `transcript-artifact-store` y reglas): **no ejecutado** en esta máquina; falta Java en el PATH. Los resultados previos no validan el ajuste posterior de canonicalización.

Revisión visual (render → inspección de PNG): `npm run qa:word-profiles` genera fixtures sintéticos en `.firebase/phase4-word-profiles/` para `transcript647` (260 segmentos, 180 marcas), `judicial` y `judicialDouble` (62 marcas, todas las categorías). Se renderizaron con el LibreOffice instalado (perfil de usuario temporal aislado) y se inspeccionaron primera, segunda y última página:

- Carta 612×792 pt en los tres perfiles; márgenes, fuente Times New Roman 12, interlineado sencillo/1,5/doble y sangría según perfil.
- Transcripción: tiempos, hablantes solo cuando existen y separación de intervenciones; la última intervención (259) aparece completa en la página 28. Sin resumen inicial ni datos del ejemplo.
- Marcado oficial en rojo exacto sobre los intervalos; texto no marcado en negro. Encabezados RESULTANDO/CONSIDERANDO/RESUELVE centrados en negrita; número de página en el pie de los perfiles judiciales.
- Sin contenido cortado ni desbordes. Observaciones menores: el encabezado de tres líneas (juzgado, expediente, tipo) queda muy próximo al cuerpo; los identificadores con guion (`SER-0000-TEST`) pueden partirse al final de línea. No se modificó el texto para evitarlo.

La inspección se hizo en LibreOffice; la apariencia en Microsoft Word no está verificada.

Pendientes para cerrar la fase 4:

1. Ejecutar `npm run test:emulator` con Java instalado.
2. Ejecutar `scripts/smoke-transcript-word.ts --live` contra Firestore real (escribe y limpia un trabajo sintético único; requiere autorización y credenciales en `.env.local`).
3. Ensayo del ciclo de borrado remoto con un video sintético del Worker (no ejecutado; ningún video real se ha borrado).
