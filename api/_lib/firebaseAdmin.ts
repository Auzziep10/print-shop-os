import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

/**
 * Server-side Firestore with real credentials (bypasses security rules).
 *
 * Requires the Vercel env var FIREBASE_SERVICE_ACCOUNT, set to the full JSON
 * of a service account key (Firebase console → Project settings →
 * Service accounts → Generate new private key).
 *
 * Only usable from Node-runtime functions (no `runtime: 'edge'`).
 */
let app: App | null = null;

export function getAdminDb(): Firestore {
  if (!app) {
    const existing = getApps();
    if (existing.length) {
      app = existing[0];
    } else {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (!raw) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT is not set in Vercel environment variables.');
      }
      const serviceAccount = JSON.parse(raw);
      // Private keys pasted into env vars often have escaped newlines
      if (typeof serviceAccount.private_key === 'string') {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      app = initializeApp({ credential: cert(serviceAccount) });
    }
  }
  return getFirestore(app);
}
