# =============================================================================
# LexIA Webapp — Multi-stage Dockerfile
# =============================================================================
# Build: docker build -t lexia-webapp .
# Run:   docker run -p 3000:3000 \
#          --env-file .env.local \
#          -v /host/path/to/scjn.db:/data/scjn.db \
#          -e SCJN_DB_PATH=/data/scjn.db \
#          lexia-webapp
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1 — Builder
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies (both prod + dev needed for build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source
COPY . .

# Receive Firebase frontend variables for build-time injection
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID

ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY
ENV VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN
ENV VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID
ENV VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET
ENV VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID
ENV VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

# Build frontend (vite) and verify tsc
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2 — Production image
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install only production dependencies (tsx is now in "dependencies")
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled frontend
COPY --from=builder /app/dist ./dist

# Copy server source (tsx runs TypeScript directly in production)
COPY server ./server
COPY scripts ./scripts

# Optional: copy Conocimiento reference files if they are present at build time.
# In most deployments these are mounted as a volume at runtime instead.
# COPY Conocimiento ./Conocimiento

# Expose the application port
EXPOSE 3000

# Volume mount point for the persistent SCJN SQLite database.
# Mount your host DB file here and set SCJN_DB_PATH=/data/scjn.db
VOLUME ["/data"]

# Start the application
CMD ["npm", "run", "start"]
