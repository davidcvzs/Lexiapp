import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import aiRoutes from './routes/ai.js';
import transcriptionRoutes from './routes/transcription.js';
import scjnRoutes from './routes/scjn.js';

dotenv.config({ path: '.env.local' });

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app       = express();
const port      = process.env.PORT || 3000;
const NODE_ENV  = process.env.NODE_ENV || 'development';
const APP_ORIGIN = process.env.APP_ORIGIN;

// ---------------------------------------------------------------------------
// CORS — only allow specific origins; open only in dev if APP_ORIGIN not set
// ---------------------------------------------------------------------------
if (NODE_ENV !== 'production') {
  // Development: allow Vite dev server (and any custom APP_ORIGIN)
  const devOrigins = APP_ORIGIN
    ? [APP_ORIGIN]
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

  app.use(cors({ origin: devOrigins, credentials: true }));
} else if (APP_ORIGIN) {
  // Production with explicit cross-origin: allow only that origin
  app.use(cors({ origin: APP_ORIGIN, credentials: true }));
}
// In production without APP_ORIGIN: no CORS headers (frontend served from same origin)

app.use(express.json({ limit: '10mb' }));

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.use('/api/ai', aiRoutes);
app.use('/api/transcription', transcriptionRoutes);
app.use('/api/scjn', scjnRoutes);

// ---------------------------------------------------------------------------
// Health Check — no OpenAI calls, no secrets exposed
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  const scjnDbPath =
    process.env.SCJN_DB_PATH ||
    path.join(process.cwd(), 'data', 'scjn', 'scjn.db');

  const openaiKey      = process.env.OPENAI_API_KEY;
  const firebaseApiKey = process.env.VITE_FIREBASE_API_KEY;
  const firebaseProjId = process.env.VITE_FIREBASE_PROJECT_ID;

  res.json({
    status:            'ok',
    environment:       NODE_ENV,
    scjnDatabase: {
      exists:          fs.existsSync(scjnDbPath),
    },
    openaiConfigured:    !!openaiKey && openaiKey !== 'missing',
    firebaseConfigured:  !!(firebaseApiKey && firebaseProjId),
  });
});

// ---------------------------------------------------------------------------
// Serve React frontend in production (single-process full-stack)
// ---------------------------------------------------------------------------
if (NODE_ENV === 'production') {
  const distPath = path.join(process.cwd(), 'dist');

  if (fs.existsSync(distPath)) {
    // Static assets (JS, CSS, images, sw.js, etc.)
    app.use(express.static(distPath));

    // SPA fallback — every non-/api path gets index.html
    app.use((req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.warn('[LexIA] dist/ no encontrado. Ejecuta npm run build antes de npm run start.');
  }
}

// ---------------------------------------------------------------------------
app.listen(port, () => {
  console.log(`LexIA Backend running on port ${port} [${NODE_ENV}]`);
  if (NODE_ENV === 'production') {
    console.log('Full-stack mode: React servido desde dist/');
  }
});
