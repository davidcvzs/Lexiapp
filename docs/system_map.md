# Mapa del Sistema: LexIA PWA

## Arquitectura de Software
LexIA está construida como una PWA bajo la filosofía de **Programación Orientada a Objetos (OOP)** para su lógica interna y un frontend reactivo.

### 1. Frontend (Vite + React + TS)
- **Vistas UI (`src/views/`)**
  - Pantallas mapeadas desde el Blueprint (ej. Login, Dashboard, Transcription, DocumentBuilder).
- **Componentes Reutilizables (`src/components/`)**
  - Panel lateral, Panel de Chatbot (Stitch/GPT).

### 2. Capa de Servicios OOP (`src/services/`)
Los servicios manejan la lógica pura, separando el estado visual del estado de negocio.
- **`BaseService`**: Control de errores, instanciamiento de Firebase, manejadores de estado de red.
- **`AuthService`**: Integración con Firebase Authentication y roles de usuario.
- **`TranscriptionService`**: Chunking de audio/video, envío al API de Whisper, retorno seguro.
- **`AIAssistantService`**: Mantenedor absoluto del `documentState` durante las 5 fases de creación, comunicación con la API de OpenAI Assistants.
- **`WordExportService`**: Lógica de ensamblaje final usando `docx` (formatos Poder Judicial Nuevo León).
- **`PaymentService`**: Conexión a Stripe para manejar las cuotas y planes (Básico, Pro, Institucional).

### 3. Backend (Firebase Suite)
- **Firestore**: Colección `Users`, sub-colección `Documents`, sub-colección `CustomButtons`.
- **Storage**: Repositorio de videos/audios en frío, los cuales pueden ser resguardados y procesados.
- **Hosting**: Alojamiento de la PWA.

## Flujo Crítico de Transcripción y Edición
1. `User` arrastra video en `TranscriptionView`.
2. `TranscriptionView` llama a `TranscriptionService.processVideo(blob)`.
3. `TranscriptionService` interactúa con API / Cloud Functions.
4. Finaliza transcripción y redirige a `DocumentBuilder`.
5. En `DocumentBuilder`, `AIAssistantService` arranca el estado y maneja clicks guiados de acuerdo al Blueprint V2.
6. Al finalizar los pasos requeridos, se invoca a `WordExportService`.
