import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage, type Storage } from 'firebase-admin/storage';
import jwt, { type JwtPayload } from 'jsonwebtoken';

export const firebaseProjectId =
  (process.env.FIREBASE_PROJECT_ID ?? '').trim() ||
  (process.env.VITE_FIREBASE_PROJECT_ID ?? '').trim() ||
  'tagbackly';

export const firebaseStorageBucketName =
  (process.env.FIREBASE_STORAGE_BUCKET ?? '').trim() ||
  (process.env.VITE_FIREBASE_STORAGE_BUCKET ?? '').trim() ||
  `${firebaseProjectId}.firebasestorage.app`;

function loadServiceAccount(): ServiceAccount | null {
  const rawJson = (process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? '').trim();
  if (rawJson) {
    try {
      const decoded = rawJson.startsWith('{')
        ? rawJson
        : Buffer.from(rawJson, 'base64').toString('utf8');
      const parsed = JSON.parse(decoded) as {
        project_id?: string;
        projectId?: string;
        client_email?: string;
        clientEmail?: string;
        private_key?: string;
        privateKey?: string;
      };
      const projectId = parsed.projectId ?? parsed.project_id ?? firebaseProjectId;
      const clientEmail = parsed.clientEmail ?? parsed.client_email;
      const privateKey = (parsed.privateKey ?? parsed.private_key ?? '').replace(/\\n/g, '\n');
      if (projectId && clientEmail && privateKey) {
        return { projectId, clientEmail, privateKey };
      }
    } catch (err) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', err);
    }
  }

  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL ?? '').trim();
  const privateKeyRaw = (process.env.FIREBASE_PRIVATE_KEY ?? '').trim();
  if (firebaseProjectId && clientEmail && privateKeyRaw) {
    return {
      projectId: firebaseProjectId,
      clientEmail,
      privateKey: privateKeyRaw.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

let adminDbInstance: Firestore | null = null;
let adminAuthInstance: Auth | null = null;
let adminStorageInstance: Storage | null = null;

const serviceAccount = loadServiceAccount();
if (serviceAccount) {
  try {
    const app =
      getApps().length > 0
        ? getApps()[0]
        : initializeApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.projectId ?? firebaseProjectId,
            storageBucket: firebaseStorageBucketName,
          });
    adminDbInstance = getFirestore(app);
    adminAuthInstance = getAuth(app);
    adminStorageInstance = getStorage(app);
  } catch (err) {
    console.error('Failed to initialize Firebase Admin SDK:', err);
  }
}

export const adminDb = adminDbInstance;
export const adminAuth = adminAuthInstance;
export const adminStorage = adminStorageInstance;
export const isFirestoreConfigured = Boolean(adminDbInstance);

// Public Firebase Secure Token x509 certificate cache for verifying Phone Auth ID tokens
// even when FIREBASE_SERVICE_ACCOUNT_JSON is not set on the backend.
let cachedCerts: Record<string, string> = {};
let certsExpiresAt = 0;

async function getFirebasePublicCerts(): Promise<Record<string, string>> {
  if (Date.now() < certsExpiresAt && Object.keys(cachedCerts).length > 0) {
    return cachedCerts;
  }
  const res = await fetch(
    'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com',
  );
  if (!res.ok) {
    throw new Error(`Unable to fetch Google public certificates (${res.status}).`);
  }
  const cacheControl = res.headers.get('cache-control') ?? '';
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeSec = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  cachedCerts = (await res.json()) as Record<string, string>;
  certsExpiresAt = Date.now() + maxAgeSec * 1000;
  return cachedCerts;
}

export async function verifyFirebasePhoneIdToken(
  idToken: string,
): Promise<{ uid: string; phoneNumber: string }> {
  if (!idToken || idToken.length < 32) {
    throw new Error('Missing Firebase verification token.');
  }

  if (adminAuthInstance) {
    const decoded = await adminAuthInstance.verifyIdToken(idToken, true);
    if (!decoded.phone_number) {
      throw new Error('Firebase token does not contain a verified phone number.');
    }
    return { uid: decoded.uid, phoneNumber: decoded.phone_number };
  }

  const decodedUnverified = jwt.decode(idToken, { complete: true });
  if (
    !decodedUnverified ||
    typeof decodedUnverified === 'string' ||
    !decodedUnverified.header?.kid
  ) {
    throw new Error('Malformed Firebase ID token.');
  }

  const certs = await getFirebasePublicCerts();
  const certPem = certs[decodedUnverified.header.kid];
  if (!certPem) {
    throw new Error('Unknown Firebase signing key.');
  }

  const payload = jwt.verify(idToken, certPem, {
    algorithms: ['RS256'],
    audience: firebaseProjectId,
    issuer: `https://securetoken.google.com/${firebaseProjectId}`,
  }) as JwtPayload & { phone_number?: string };

  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Invalid Firebase token subject.');
  }
  if (!payload.phone_number || typeof payload.phone_number !== 'string') {
    throw new Error('Firebase token does not contain a verified phone number.');
  }

  return { uid: payload.sub, phoneNumber: payload.phone_number };
}
