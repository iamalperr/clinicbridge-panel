import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import { getAdminDb } from './lib/firebase-admin';

async function verify() {
  const db = getAdminDb();
  if (!db) {
    throw new Error('Database is null');
  }

  const TARGET_AGENCY_ID = 'mFrKEjO9fNwUzbueW5rc'; // FeelinHealthy
  const clinicsRef = db.collection('agencies').doc(TARGET_AGENCY_ID).collection('clinics');
  
  const query = await clinicsRef.where('stableKey', '==', 'hospitadent_dental_group_gokturk').get();
  
  if (query.empty) {
    console.error("FAILURE: Gokturk clinic document does NOT exist in Firestore.");
    process.exit(1);
  }
  
  const doc = query.docs[0];
  console.log(`SUCCESS: Gokturk clinic found in Firestore. Document ID: ${doc.id}`);
  console.log(JSON.stringify(doc.data(), null, 2));
  
  const allClinics = await clinicsRef.get();
  console.log(`Total Clinic Count: ${allClinics.size}`);
}

verify().catch(console.error);
