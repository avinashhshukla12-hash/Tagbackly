import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'tagbackly';
const rawAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`;
const authDomain = rawAuthDomain.startsWith('://')
  ? `${projectId}.firebaseapp.com`
  : rawAuthDomain;

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyC-1Tre42hriS78ArvY_VF3zvYs1hwHQvU',
  authDomain,
  projectId,
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'tagbackly.firebasestorage.app',
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '861997619537',
  appId:
    import.meta.env.VITE_FIREBASE_APP_ID || '1:861997619537:web:9b33023707dbd8c72f1b70',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || 'G-J66YZTDFYH',
};

const firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestoreDb = getFirestore(firebaseApp);

// Validate connection to Firestore on app boot
async function testConnection() {
  try {
    await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

let activeRecaptcha: RecaptchaVerifier | null = null;

export function clearPhoneRecaptcha(): void {
  if (activeRecaptcha) {
    try {
      activeRecaptcha.clear();
    } catch {
      // Ignore clear error
    }
    activeRecaptcha = null;
  }
}

export async function sendFirebasePhoneOtp(
  phoneE164: string,
  containerId = 'tagbackly-recaptcha-container',
): Promise<ConfirmationResult> {
  clearPhoneRecaptcha();
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error('reCAPTCHA container is not ready. Please try again.');
  }
  container.innerHTML = '';

  activeRecaptcha = new RecaptchaVerifier(firebaseAuth, containerId, {
    size: 'invisible',
  });

  try {
    await activeRecaptcha.render();
    return await signInWithPhoneNumber(firebaseAuth, phoneE164, activeRecaptcha);
  } catch (err) {
    clearPhoneRecaptcha();
    throw err;
  }
}

export function formatFirebasePhoneAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: unknown }).code)
      : '';
  const msg = err instanceof Error ? err.message : String(err);

  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Phone Sign-In is not enabled yet in Firebase Console. Go to Firebase Console -> Authentication -> Sign-in method and enable Phone.';
    case 'auth/unauthorized-domain':
      return `This domain (${window.location.hostname}) is not authorized in Firebase Auth. Add it under Firebase Console -> Authentication -> Settings -> Authorized domains.`;
    case 'auth/invalid-phone-number':
      return 'Please enter a valid 10-digit +91 mobile number.';
    case 'auth/too-many-requests':
      return 'Too many OTP requests for this number. Please wait a bit before trying again.';
    case 'auth/captcha-check-failed':
    case 'auth/invalid-app-credential':
      return 'reCAPTCHA verification failed. Ensure your domain is listed in Firebase Authorized Domains and try again.';
    case 'auth/invalid-verification-code':
      return 'The 6-digit SMS OTP you entered is incorrect. Please check and try again.';
    case 'auth/code-expired':
      return 'This SMS OTP has expired. Please request a new OTP.';
    case 'auth/billing-not-enabled':
      return 'Firebase SMS requires an active billing/SMS quota or a configured Firebase Test Phone Number in Firebase Console.';
    default:
      return msg || 'Phone OTP verification failed.';
  }
}
