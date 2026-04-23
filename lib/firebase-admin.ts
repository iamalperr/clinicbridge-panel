import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
      const missing = [];
      if (!projectId) missing.push('FIREBASE_PROJECT_ID (veya NEXT_PUBLIC_FIREBASE_PROJECT_ID)');
      if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
      if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');
      
      throw new Error(`Firebase Admin credentials missing. Eksik değişkenler: ${missing.join(', ')}`);
    } else {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n').replace(/^"|"$/g, ''),
        }),
      });
    }
  } catch (error) {
    console.error('Firebase Admin Initialization Error:', error);
  }
}

const adminDb = admin.apps.length ? admin.firestore() : null;
const adminAuth = admin.apps.length ? admin.auth() : null;

export { adminDb, adminAuth };
