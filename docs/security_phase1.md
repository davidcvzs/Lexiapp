# Fase 1 — Seguridad y acceso

## Flujos y alcance

- `/admin`: primero se verifica la sesión y después el custom claim booleano `admin: true`. Un usuario común vuelve al dashboard. La API repite la validación; ocultar una pantalla no concede permisos.
- Importaciones ZIP/CSV y limpieza de caché SCJN: token verificado, rol administrador, límite de frecuencia y validación de archivo, en ese orden.
- Cerrar sesión en Ajustes: esperar `signOut(auth)` y después redirigir al login. Si falla, mostrar el error y conservar la pantalla. El cierre es de la sesión local; no revoca por sí solo tokens copiados ni otras sesiones.
- Expedientes Firestore: solo el propietario puede leer, consultar, crear, actualizar o borrar. No se permite transferir propietario, cambiar la fecha de creación ni escribir campos de privilegios. Administrar SCJN no concede acceso a expedientes ajenos.

## Credenciales y administradores

Los JSON de Firebase Admin, archivos PEM/KEY y `secrets/` están excluidos de Git y Docker. No eliminar la clave operativa sin tener un reemplazo: excluirla no la revoca.

En producción usar Application Default Credentials con una identidad de servicio. Para desarrollo se admiten `GOOGLE_APPLICATION_CREDENTIALS` o el conjunto `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`. Nunca colocar claves privadas en variables `VITE_*`.

El rol se asigna desde un entorno administrativo de confianza mediante Firebase Admin `setCustomUserClaims(uid, { ...existingClaims, admin: true })`, conservando los demás claims. No hay endpoint público para asignarlo. No se ha asignado el rol a ninguna cuenta durante esta reparación. Después de asignarlo, renovar el token o volver a iniciar sesión. Al retirar privilegios, revocar también refresh tokens. El servidor verifica revocaciones y usuarios deshabilitados.

Auditoría local: `node scripts/audit-secrets.mjs`. Busca una huella de la clave local en el historial Git alcanzable y en artefactos locales, sin imprimir secretos. No prueba la ausencia de exposición en repositorios remotos eliminados, backups externos o registros de contenedores.

## Límites iniciales

| Recurso | Límite |
|---|---|
| API general | 300 solicitudes/minuto por IP |
| IA | 20 solicitudes/15 minutos por usuario |
| Carga de transcripción | 5 cargas/15 minutos por usuario |
| Consulta de transcripción | 60 solicitudes/minuto por usuario |
| Operaciones administrativas SCJN | 3 solicitudes/15 minutos por administrador |
| JSON | 1 MiB |
| Audio/video | Un archivo, máximo 100 MiB |
| ZIP/CSV SCJN | Un archivo, máximo 50 MiB |
| ZIP descomprimido | 1000 entradas, 50 MiB por entrada y 200 MiB total; ratio máximo 200 para entradas mayores a 1 MiB |
| Fila CSV | 1 MiB |

Audio/video admitido: MP3, WAV, MP4, M4A, WEBM, OGG y FLAC. Se verifican extensión, MIME y firma binaria. CSV exige texto separado por comas y sin bytes nulos. Esto valida formato, no reemplaza un análisis antivirus. Los temporales se eliminan al finalizar la respuesta o cerrar la conexión. El Worker tiene tiempos de espera de 120 segundos para carga y 30 segundos para consulta.

Los límites de frecuencia usan memoria por proceso. Antes de escalar a varias instancias, configurar un almacén compartido. `trust proxy` permanece desactivado: no se confía en `X-Forwarded-For` enviado por el cliente. Detrás de un proxy, configurar únicamente la topología de confianza comprobada; sin esa configuración, la cuota por IP puede compartirse entre usuarios.

## Firestore y publicación

`firestore.rules` cubre la colección `cases`, vinculada a los documentos por el backend desde la fase 3. `DatabaseService` consume la API autenticada; las colecciones `documents`, `versions` y `transcriptionJobs` permanecen cerradas al acceso directo del navegador y el backend verifica al propietario. `contentRef` se trata como metadato, no como autorización para descargar archivos; futuras reglas de Storage deben validar propietario por separado.

Las reglas están enlazadas en `firebase.json`. No basta guardar este archivo para proteger una base remota. La consulta de la publicación `cloud.firestore` al proyecto de la credencial local devolvió HTTP 404 el 2026-10-02; no se pudo recuperar un conjunto de reglas desplegado por esa ruta. Esto no demuestra por sí mismo que una base sea pública.

Actualización posterior a la fase 3 (2026-10-02): el usuario habilitó Firestore en `lexia-pj`. Se verificó que la base tenía reglas de modo de prueba; se publicaron las reglas locales de propietario y cierre de otras colecciones, junto con los índices de persistencia. La lectura remota confirmó que las reglas publicadas coinciden con `firestore.rules`. No se desplegó Hosting ni el backend. Repetición controlada: `npm run deploy:firestore -- --apply`.

## Validación

Resultado local del 2026-10-02: compilación del cliente correcta; 6 pruebas HTTP/archivos/CSV y 3 pruebas de reglas Firestore aprobadas. TypeScript de los nuevos módulos de seguridad comprobado por separado; ESLint de los módulos de seguridad, guardia administrativa, Ajustes y pruebas sin errores. Auditoría de clave: 4 commits y 258 artefactos examinados, sin coincidencias ni archivos omitidos dentro del alcance declarado.

Multer se actualizó a 2.4.0 por el aviso de escrituras huérfanas tras cargas abortadas. La auditoría npm posterior conserva 22 alertas de dependencias (1 crítica, 13 altas, 6 moderadas y 2 bajas); no se aplicaron actualizaciones masivas ajenas a los controles de esta fase. Requieren revisión de alcance y actualización antes del lanzamiento, especialmente `websocket-driver` y `xlsx`. La existencia de un aviso no demuestra por sí sola una ruta explotable en esta aplicación.

- `npm run test:security`: rechazo de tokens inválidos, permisos administrativos, cuota por usuario, archivos disfrazados, tamaño excesivo, archivos múltiples, limpieza temporal, ZIP y errores JSON.
- `firebase emulators:exec --only firestore --project demo-lexia-security "npm run test:rules"`: permisos de propietario, acceso cruzado, consultas, transferencia de propiedad, esquema y escalada de privilegios. Requiere Firebase CLI y Java 21 o posterior. Usa un proyecto demo y no documentos reales.
- `npm run build`: compilación del cliente.
- ESLint sobre los archivos nuevos y modificados de seguridad; los errores históricos ajenos a esta fase se gestionan por separado.

Para instalar las nuevas dependencias fue necesario `--legacy-peer-deps` por el conflicto previo entre Vite 8 y `vite-plugin-pwa` 1.2.0. La compatibilidad de esa pareja queda pendiente de la fase de reproducibilidad del despliegue.

Referencias: [Custom claims](https://firebase.google.com/docs/auth/admin/custom-claims), [condiciones de reglas Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions), [validación de campos](https://firebase.google.com/docs/firestore/security/rules-fields).
