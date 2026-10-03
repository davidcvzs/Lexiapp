import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/** Initialize only after dotenv has loaded; both Auth and persistence share the same app. */
function adminApp() {
  const existing = getApps().find(app => app.name === '[DEFAULT]');
  if (existing) return existing;
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || process.env.VITE_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  return projectId && clientEmail && privateKey
    ? initializeApp({ projectId, credential: cert({ projectId, clientEmail, privateKey }) })
    : initializeApp({ ...(projectId ? { projectId } : {}) });
}
export const adminAuth = () => getAuth(adminApp());
export const adminFirestore = () => getFirestore(adminApp());
