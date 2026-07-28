/**
 * firebase-admin.ts
 *
 * Lazy-initialized Firebase Admin SDK.
 * - Modül import edildiğinde hiçbir şey çalışmaz.
 * - getAdminDb() / getAdminAuth() fonksiyonları ilk çağrıldığında initialize olur.
 * - Build time'da env variables yoksa crash etmez, null döner.
 */

import type { App } from "firebase-admin/app";
import type { Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";

let _app: App | null = null;
let _db: Firestore | null = null;
let _auth: Auth | null = null;
let _storage: any | null = null;
let _initialized = false;

function initializeAdmin(): App | null {
  if (_initialized) return _app;
  _initialized = true;

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;
  const certBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (!projectId) {
    console.warn("[firebase-admin] Credentials missing (FIREBASE_PROJECT_ID). Admin SDK disabled.");
    return null;
  }

  try {
     
    const adminModule = require("firebase-admin/app");
    const { getApps, initializeApp, cert, applicationDefault } = adminModule;

    if (getApps().length > 0) {
      _app = getApps()[0] as App;
    } else if (clientEmail && privateKeyRaw) {
      const privateKey = privateKeyRaw
        .replace(/\\n/g, "\n")
        .replace(/^"|"$/g, "");
      _app = initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    } else if (certBase64) {
      const certJson = Buffer.from(certBase64, 'base64').toString('utf8');
      _app = initializeApp({ credential: cert(JSON.parse(certJson)) });
    } else {
      // Fallback to applicationDefault (relies on GOOGLE_APPLICATION_CREDENTIALS or gcloud auth)
      _app = initializeApp({ credential: applicationDefault(), projectId });
    }
  } catch (err) {
    console.error("[firebase-admin] Initialization failed:", err);
    _app = null;
  }

  return _app;
}

export function getAdminDb(): Firestore | null {
  if (_db) return _db;
  const app = initializeAdmin();
  if (!app) return null;
  try {
     
    const { getFirestore } = require("firebase-admin/firestore");
    _db = getFirestore(app) as Firestore;
  } catch (err) {
    console.error("[firebase-admin] Firestore init failed:", err);
  }
  return _db;
}

export function getAdminAuth(): Auth | null {
  if (_auth) return _auth;
  const app = initializeAdmin();
  if (!app) return null;
  try {
     
    const { getAuth } = require("firebase-admin/auth");
    _auth = getAuth(app) as Auth;
  } catch (err) {
    console.error("[firebase-admin] Auth init failed:", err);
  }
  return _auth;
}

export function getAdminStorage(): any | null {
  if (_storage) return _storage;
  const app = initializeAdmin();
  if (!app) return null;
  try {
    const { getStorage } = require("firebase-admin/storage");
    _storage = getStorage(app);
  } catch (err) {
    console.error("[firebase-admin] Storage init failed:", err);
  }
  return _storage;
}

/**
 * @deprecated Kullanmayın — getAdminDb() / getAdminAuth() kullanın.
 * Geriye dönük uyumluluk için bırakıldı.
 */
export const adminDb = {
  get current() {
    return getAdminDb();
  },
};

/**
 * @deprecated Kullanmayın — getAdminAuth() kullanın.
 * Geriye dönük uyumluluk için bırakıldı.
 */
export const adminAuth = {
  get current() {
    return getAdminAuth();
  },
};
