# Comandos de Despliegue en Cloud Shell para LexIA

Ejecutar estos comandos en Google Cloud Shell tras asegurar el entorno correcto:

## 1. Seleccionar Proyecto y Verificar Billing
```bash
gcloud config set project lexia-pj
# Verificar que el billing esté habilitado (requiere aprobación visual o de organización)
gcloud beta billing projects describe lexia-pj
```

## 2. Habilitar APIs
```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com
```

## 3. Crear Cloud SQL (Staging - db-f1-micro)
```bash
# Instancia
gcloud sql instances create lexia-db \
  --database-version=POSTGRES_15 \
  --cpu=1 \
  --memory=3840MB \
  --tier=db-f1-micro \
  --region=us-central1

# Base de datos
gcloud sql databases create lexia --instance=lexia-db

# Usuario (Reemplazar <PASSWORD>)
gcloud sql users create lexia_app --instance=lexia-db --password="<PASSWORD>"
```

## 4. Configurar Secret Manager
```bash
# DB_PASSWORD
echo -n "<PASSWORD>" | gcloud secrets create DB_PASSWORD --data-file=-
# OPENAI_API_KEY
echo -n "<OPENAI_KEY>" | gcloud secrets create OPENAI_API_KEY --data-file=-
```

## 5. Artifact Registry
```bash
gcloud artifacts repositories create lexia-repo \
  --repository-format=docker \
  --location=us-central1 \
  --description="Docker repository for LexIA API"
```

## 6. Build & Deploy Cloud Run
```bash
# Asume que te encuentras en la raíz del repositorio

# Construir imagen (usa Cloud Build)
gcloud builds submit --tag us-central1-docker.pkg.dev/lexia-pj/lexia-repo/lexia-api .

# Desplegar en Cloud Run (us-central1)
gcloud run deploy lexia-api \
  --image us-central1-docker.pkg.dev/lexia-pj/lexia-repo/lexia-api \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --add-cloudsql-instances lexia-pj:us-central1:lexia-db \
  --set-env-vars="NODE_ENV=production,SCJN_DB_DRIVER=postgres,DB_NAME=lexia,DB_USER=lexia_app,INSTANCE_CONNECTION_NAME=lexia-pj:us-central1:lexia-db,OPENAI_MODEL=gpt-4o" \
  --set-secrets="DB_PASSWORD=DB_PASSWORD:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest"
```

## 7. Firebase Hosting Rewrite
```bash
# Tras verificar que Cloud Run funciona, desplegar el frontend
npm run build
firebase deploy --only hosting
```
