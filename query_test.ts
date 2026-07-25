import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Read service account from .env or default location if needed
require('dotenv').config({ path: '.env.local' });

if (!getApps().length) {
  // Use a default path or env var for credentials
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

async function run() {
  const clinicsSnap = await db.collection('clinics').get();
  for (const clinic of clinicsSnap.docs) {
    const apptsSnap = await clinic.ref.collection('appointments')
      .where('patientName', '==', 'Onur Yavuz')
      .get();
    
    for (const appt of apptsSnap.docs) {
      console.log('Found appointment:', appt.id);
      console.log(JSON.stringify(appt.data(), null, 2));
    }
  }
}
run().catch(console.error);
