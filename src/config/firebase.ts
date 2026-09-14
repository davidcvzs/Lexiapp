import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// In production (PROD=true set by Vite at build time), missing vars cause an
// explicit error rather than silently using mock values that will never work.
const isProd = import.meta.env.PROD;

function requireEnv(key: string, value: string | undefined): string {
  if (isProd && !value) {
    throw new Error(
      `[LexIA] Variable de entorno Firebase requerida no definida: ${key}. ` +
      `Configura VITE_FIREBASE_* en tu entorno antes de compilar.`
    );
  }
  return value || '';
}

const apiKey         = requireEnv('VITE_FIREBASE_API_KEY',            import.meta.env.VITE_FIREBASE_API_KEY);
const authDomain     = requireEnv('VITE_FIREBASE_AUTH_DOMAIN',        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN);
const projectId      = requireEnv('VITE_FIREBASE_PROJECT_ID',         import.meta.env.VITE_FIREBASE_PROJECT_ID);
const storageBucket  = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET       || '';
const messagingId    = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID  || '';
const appId          = import.meta.env.VITE_FIREBASE_APP_ID               || '';

// In development, warn clearly if Firebase vars are absent (won't throw).
if (!isProd && !import.meta.env.VITE_FIREBASE_API_KEY) {
  console.warn(
    '[LexIA] Firebase: VITE_FIREBASE_* no configuradas. ' +
    'La autenticación real no funcionará. Define las variables en .env.local.'
  );
}

const firebaseConfig = {
  apiKey,
  authDomain,
  projectId,
  storageBucket,
  messagingSenderId: messagingId,
  appId,
};

export const app           = initializeApp(firebaseConfig);
export const auth          = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db            = getFirestore(app);
