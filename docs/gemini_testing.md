# Gemini para pruebas de generación

## Flujo documentado antes de implementar

El usuario solicita Gemini de Google como proveedor temporal para pruebas; OpenAI y su saldo quedan para el final. Clave existente introducida en una ventana local enmascarada → guardado DPAPI bajo perfil Windows fuera de OneDrive → comprobación de acceso/modelo con metadatos → configuración privada del servidor `AI_PROVIDER=gemini` → solicitud autenticada existente → validación de tarea/consentimiento → mismas instrucciones y referencias originales → `generateContent` de Gemini → validación de respuesta terminada y no vacía → mismo resultado/procedencia guardados en Lexiapp.

La clave no se envía al frontend, a Cloudflare ni al chat. Gemini se llama mediante HTTPS en el backend, con `x-goog-api-key` en cabecera. No se cambia automáticamente a OpenAI ante errores de Gemini y no se repiten generaciones automáticamente. Las pruebas reales usan exclusivamente texto sintético; no leen expedientes ni los archivos privados de conocimiento.

## Implementación

Adaptador `GeminiService` separado del orquestador documental compartido. Se conserva el contrato de generación y los hashes de instrucciones/referencias; las instrucciones jurídicas no se reescriben. El proveedor se selecciona con `AI_PROVIDER`, y el modelo Gemini mediante `GEMINI_MODEL`. El proveedor anterior permanece disponible para una selección posterior explícita.

Las consultas de directorio y sedes siguen siendo locales. Los errores por bloqueo, respuesta incompleta, cuota, configuración, cancelación o ausencia de texto dejan intacto el borrador. Las respuestas se acotan y nunca se truncan para declarar éxito.

`scripts/gemini-token.ps1` solicita la clave existente en Windows y la guarda cifrada en `%LOCALAPPDATA%/Lexiapp/credentials/gemini-api.xml`. El archivo privado `.env.local`, excluido de Git, contiene la clave que utilizará el servidor una vez comprobada; no se imprimen sus valores.

## Verificación

Pruebas del transporte con proveedor simulado: clave solo en cabecera, entrada/instrucciones literales, límites, bloqueo, respuesta incompleta, cuota, cancelación y ausencia de reintentos. Pruebas de integración: selección explícita, reglas/procedencia, confirmación de análisis, consultas locales y conservación de la configuración anterior. La prueba real mínima debe comprobar respuesta y fidelidad sobre una frase sintética, sin documentos privados.

Estado: clave recibida por la ventana local y guardada con DPAPI; metadatos del modelo consultados correctamente. El servidor privado selecciona `AI_PROVIDER=gemini` y `GEMINI_MODEL=gemini-3.8-flash`. La configuración OpenAI anterior se conserva para la selección explícita posterior.

Se ejecutó una única generación real con la frase sintética «Esta es una prueba técnica de Lexiapp.»: respuesta terminada y coincidencia literal de los 38 caracteres. No se usaron documentos privados ni se hicieron llamadas reales a OpenAI. Esta prueba comprueba conexión y transporte; no evalúa fidelidad de redacción jurídica.

Las 9 pruebas del adaptador y 9 del proveedor/orquestador forman parte de `npm test`. La verificación vigente suma 182 pruebas: 114 unitarias/integración aprobadas ahora, incluidas 16 del Worker, más las 39 de interfaz y 29 de Firestore Emulator aprobadas previamente sin cambios. TypeScript pasa; instalación limpia, `npm ci`, lint y compilación se verificaron previamente sin claves privadas. Las comprobaciones de aislamiento de proveedores y compatibilidad GPT usan configuración y respuestas simuladas.

La selección respeta el objeto de entorno proporcionado: claves ausentes no heredan credenciales del proceso. Ambos transportes rechazan una clave ausente antes de enviar la fuente; los clientes OpenAI inyectados para pruebas siguen siendo compatibles. El comando manual `npm run smoke:gemini` realiza una llamada real con texto sintético y queda fuera de las comprobaciones automáticas.

La versión activa del Worker de Cloudflare en Yoshiman1989 el 2 de octubre de 2026 es `eba0202b-e5b1-4ddb-94ad-1994732b8b87` al 100 %. Conserva el namespace SQLite de `JobJournal` y las tres credenciales como `secret_text`; `GET /privacy` público está restaurado y responde 200. Las siete comprobaciones remotas iniciales de salud, autenticación y separación de propietarios pasaron sin subir archivos. La configuración privada del backend ya tiene URL y clave backend configuradas; `AI_PROVIDER=gemini` se mantiene y `CLOUDFLARE_DIRECT_UPLOAD_ENABLED=false`.

El usuario guardó las [instrucciones completas](gpt_instructions_full.txt) de 7.977 caracteres, conservando exactamente todas las reglas ajenas a TRANSCRIPCIÓN DE VIDEO. La importación se corrigió con `schemas: {}` en el esquema diagnóstico y se copió la clave Bearer. El OpenAPI de producción quedó restaurado con sus cuatro operaciones, sin avisos; la consulta ficticia final del GPT devolvió `job_not_found`. La conexión y autenticación con el esquema completo están validadas. El GPT no expuso el código HTTP; la consulta directa confirmó 404. Gemini se mantiene seleccionado y en esta actualización no se hicieron llamadas a IA ni nuevas cargas.

Se completó una prueba real de Stream con un único MP4 sintético de 24,776 segundos y retención de 31 días. Se recuperaron seis segmentos en tres páginas, con hash íntegro verificado; la consulta por otro propietario devolvió 404. Se eliminó únicamente el video de esta prueba: la eliminación respondió 200 y la consulta posterior, 410. Los captions confundieron «Lexiapp» con «EXIAP-P», así que la coincidencia literal esperada fue falsa. Se preserva el contenido original sin corrección manual. El flujo de subida y recuperación pasó; la exactitud completa de transcripción no está demostrada. TUS permanece desactivado; siguen pendientes el ensayo real de interrupción/reanudación, 2 GiB y capacidad por formato.

Se publicaron seis exclusiones nuevas de índices Firestore con la CLI y OAuth del operador. Las diez comprobaciones de configuración pasan y los índices compuestos están `READY`. Las reglas no cambiaron salvo un comentario, y no se modificaron roles de la identidad del backend, que no puede editar índices.

La comprobación real de `FirestoreTranscriptStore` pasó: seis segmentos, tres páginas y tres bloques; reanudación desde un cliente SDK nuevo con hash y contenido literal coincidentes; rechazo 409 de la finalización prematura y 403 en las siete comprobaciones con otro propietario. La limpieza dejó cero documentos de prueba. Esta comprobación de persistencia no llamó a IA ni al Worker.

El saldo y la validación de OpenAI continúan reservados para el final. Estado y próximos pasos: [configuración Cloudflare](cloudflare_setup.md).

Fuentes oficiales: [claves de Gemini](https://ai.google.dev/gemini-api/docs/api-key), [generación de contenido](https://ai.google.dev/api/generate-content), [modelos](https://ai.google.dev/gemini-api/docs/models).
