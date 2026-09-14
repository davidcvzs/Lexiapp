# Reporte de Preparación para Staging (`lexia-webapp`)

## 1. Modificaciones Realizadas

### A. Git & Limpieza (Ruido)
- Se han eliminado archivos temporales (archivos de texto de recuperación, `.db` residuales en la raíz, logs antiguos, `fix.js`).
- El archivo `.gitignore` ha sido purgado de la codificación corrupta que tenía al final y actualizado explícitamente para ignorar `.env.*`, archivos SQLite, el directorio `data/`, y `Conocimiento/`.

### B. Persistencia SCJN & Dockerización
- Se preparó `SQLiteSCJNRepository.ts` para leer la ruta de la base de datos desde `SCJN_DB_PATH`, previniendo el hardcoding y adaptando la DB al montaje de volúmenes de Docker.
- Se agregó el archivo `Dockerfile` (Multi-stage) diseñado especialmente para generar el build de la app y un runner minimizado que ejecuta Express.
- Se configuró el `.dockerignore`.
- Se generó la plantilla vacía `.env.example`.

### C. Backend Full-Stack
- En `server/index.ts` ahora Express está configurado para servir la PWA desde la carpeta `dist/` cuando `NODE_ENV=production`.
- Si una ruta no comienza con `/api/`, el backend hace fallback sobre `index.html` manejando SPA en producción adecuadamente, con una nueva solución para Express 5 para evitar errores con dependencias (`app.use`).
- El endpoint `GET /api/health` ha sido mejorado para reportar de forma segura el estado de SCJN DB, OpenAI Config y Firebase Config sin hacer requests que consuman recursos ni exponer secretos.

### D. CORS & Seguridad
- CORS condicional: Durante el desarrollo acepta requests localhost o definidos en `APP_ORIGIN`. En producción no expone CORS de manera genérica.
- OpenAI está protegido: Si la API arroja un error 400+ por límite de saldo de facturación (quota), la UI reporta adecuadamente una falla en la IA (Error 503) mientras que SCJN puede continuar su actividad sin caerse.
- Firebase: Los *mock values* han sido removidos. Si los keys verdaderos faltan, `firebase.ts` emite un error al arrancar (en dev) o evita crashear silenciosamente pero se restringe su paso en producción si falta la variable de entorno.

### E. Frontend y Funciones en "Preparación" (Mock Data)
- **PJENL y Doctrina:** Los resultados ficticios duros fueron removidos (`DUMMY_RESULTS = []`). Ahora, al elegir una de esas categorías, el usuario ve un mensaje amigable con iconos informando "*Integración en preparación*" o "*Próximamente*".
- **Transcripciones de Video:** El área interactiva del drag-and-drop se reemplazó visualmente por un aviso explícito que indica "*Transcripción de video en integración*", bloqueando el botón de upload (que retornaba un HTTP 501 inútil).
- **Dashboard de Administrador:** Se le incluyó un _banner amarillo global_ previniendo a stakeholders que las métricas vistas son un simple *mock visual (Demo Data)*.

### F. PWA & Build Pipeline
- `vite.config.ts`: Modificado en `workbox` `runtimeCaching` para nunca guardar las respuestas `/api/*` y siempre usar el fetch por red.
- `package.json`: Se actualizó el comando de producción con `"start": "tsx server/index.ts"`. Se instaló tsx como una *dependency* estándar en el bundle.
- El comando `npm run build` compiló todo correctamente con **0 errores de Typescript**.

---

## 2. Archivos para añadir (Git Status final)

Tu entorno de git aún **NO** ha recibido los commits. Actualmente refleja:

**Archivos nuevos o ignorados previamente, que se DEBEN subir:**
- `server/` (El backend Express Typescript completo)
- `scripts/`
- `src/components/layout/ProtectedRoute.tsx`
- `Dockerfile`, `.dockerignore`, `.env.example`

**Archivos que quedan intencionalmente fuera de Git:**
- `.env` / `.env.local`
- `data/scjn/scjn.db` (Contiene tus 50 registros)
- `dist/`
- Archivos pesados `Conocimiento/`

---

## 3. Guía rápida para el Deploy en Staging (Docker)

La **Opción A** (que solicitaste) consiste en inyectar la DB actual al contenedor como volumen.

1. Al desplegar el Docker, monta la carpeta local `data/` o el archivo al contenedor:
   `-v /ruta/absoluta/en/host/data:/data`
2. En el entorno del contenedor, define las variables:
   `SCJN_DB_PATH=/data/scjn/scjn.db`
   Y los secretos pertinentes (`VITE_FIREBASE_*` y `OPENAI_API_KEY`).
3. No olvides **Añadir el nuevo dominio de staging** a la consola Auth de Firebase.

---
## Conclusión
✅ **LISTO PARA STAGING**. 
Todos los requerimientos están implementados sin desestabilizar la aplicación, sin destruir la UI terminada, y dejando la plataforma robusta para mostrar en ambiente remoto.
