import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

require('dotenv').config({ path: '.env' });
require('dotenv').config({ path: '.env.local' });

if (!getApps().length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
    initializeApp({
      credential: cert(serviceAccount)
    });
  } else {
    initializeApp();
  }
}

const db = getFirestore();

async function run() {
  const snapshot = await db.collection('notification_delivery_attempts')
    .orderBy('created_at', 'desc')
    .limit(5)
    .get();

  snapshot.forEach(doc => {
    console.log(doc.id, "=>", doc.data());
  });
}

run().catch(console.error);
