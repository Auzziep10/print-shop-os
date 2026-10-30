import { Firestore } from '@google-cloud/firestore';
import { ExternalAccountClient } from 'google-auth-library';
import { getVercelOidcToken } from '@vercel/oidc';

/**
 * Server-side Firestore with real Google credentials (bypasses security rules).
 * Only usable from Node-runtime functions (no `runtime: 'edge'`).
 *
 * Default: keyless sign-in. Vercel proves who it is with its own OIDC token,
 * and Google lets it act as a service account (Workload Identity Federation).
 * Vercel env vars:
 *   GCP_PROJECT_NUMBER                      e.g. 637868552650
 *   GCP_SERVICE_ACCOUNT_EMAIL               e.g. vercel@print-shop-os-f8092.iam.gserviceaccount.com
 *   GCP_WORKLOAD_IDENTITY_POOL_ID           default "vercel"
 *   GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID  default "vercel"
 *   GCP_PROJECT_ID                          default "print-shop-os-f8092"
 *
 * Alternative: if FIREBASE_SERVICE_ACCOUNT (a service account key JSON) is
 * set, that is used instead.
 */

let db: Firestore | null = null;

export function getServerDb(): Firestore {
  if (db) return db;

  const projectId = process.env.GCP_PROJECT_ID || 'print-shop-os-f8092';
  const keyJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (keyJson) {
    const key = JSON.parse(keyJson);
    db = new Firestore({
      projectId: key.project_id || projectId,
      credentials: {
        client_email: key.client_email,
        private_key: String(key.private_key || '').replace(/\\n/g, '\n'),
      },
      preferRest: true,
    });
    return db;
  }

  const projectNumber = process.env.GCP_PROJECT_NUMBER;
  const serviceAccount = process.env.GCP_SERVICE_ACCOUNT_EMAIL;
  const poolId = process.env.GCP_WORKLOAD_IDENTITY_POOL_ID || 'vercel';
  const providerId = process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID || 'vercel';

  if (!projectNumber || !serviceAccount) {
    throw new Error(
      'Server database access is not configured. Set GCP_PROJECT_NUMBER and GCP_SERVICE_ACCOUNT_EMAIL in Vercel (keyless sign-in), or FIREBASE_SERVICE_ACCOUNT.',
    );
  }

  const authClient = ExternalAccountClient.fromJSON({
    type: 'external_account',
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${poolId}/providers/${providerId}`,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: process.env.GCP_STS_TOKEN_URL || 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `${process.env.GCP_IAM_CREDENTIALS_URL || 'https://iamcredentials.googleapis.com'}/v1/projects/-/serviceAccounts/${serviceAccount}:generateAccessToken`,
    subject_token_supplier: {
      getSubjectToken: () => getVercelOidcToken(),
    },
  });
  if (!authClient) throw new Error('Could not create Google credentials for keyless sign-in.');

  db = new Firestore({ projectId, authClient, preferRest: true });
  return db;
}
