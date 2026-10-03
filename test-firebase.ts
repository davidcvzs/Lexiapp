import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getAuth } from 'firebase-admin/auth';
import { initializeApp, cert, getApps } from 'firebase-admin/app';

async function run() {
  try {
    // 1. Ensure Admin is initialized
    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
          clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        })
      });
    }

    console.log('Firebase Admin initialized.');

    // 2. Create Custom Token for a test user
    const customToken = await getAuth().createCustomToken('test-uid-123');
    console.log('Custom token generated.');

    // 3. Exchange for ID Token via REST API
    const apiKey = process.env.VITE_FIREBASE_API_KEY;
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error.message);
    const idToken = data.idToken;
    console.log('ID Token acquired.');

    // 4. Test endpoints
    const testEndpoint = async (token: string | null) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const apiRes = await fetch('http://localhost:3000/api/ai/generate', { 
        method: 'POST',
        headers,
        body: JSON.stringify({ instruction: 'test' })
      });
      const apiData = await apiRes.json();
      return { status: apiRes.status, data: apiData };
    };

    console.log('--- A) SIN TOKEN ---');
    const resA = await testEndpoint(null);
    console.log(resA.status, resA.data);

    console.log('--- B) TOKEN INVÁLIDO ---');
    const resB = await testEndpoint('token-invalido');
    console.log(resB.status, resB.data);

    console.log('--- C) TOKEN FIREBASE REAL ---');
    const resC = await testEndpoint(idToken);
    console.log(resC.status, resC.data);

  } catch (e) {
    console.error('ERROR:', (e instanceof Error ? e.message : String(e)));
  }
}
run();
