import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import { getAdminDb } from './lib/firebase-admin';

async function fixMissingFields() {
  const db = getAdminDb();
  if (!db) {
    throw new Error('Database is null');
  }

  const TARGET_AGENCY_ID = 'mFrKEjO9fNwUzbueW5rc';
  const clinicsRef = db.collection('agencies').doc(TARGET_AGENCY_ID).collection('clinics');
  
  // Find Cevizlibag
  const cevizQuery = await clinicsRef.where('stableKey', '==', 'hospitadent_dental_group_cevizlibag').get();
  if (!cevizQuery.empty) {
    const docId = cevizQuery.docs[0].id;
    const data = cevizQuery.docs[0].data();
    await clinicsRef.doc(docId).update({
      priority: 80,
      clinicName: data.displayNameTr || 'Hospitadent Dental Group Cevizlibağ'
    });
    console.log(`Fixed Cevizlibağ (${docId}) - Added priority and clinicName`);
  }

  // Find Gokturk
  const gokturkQuery = await clinicsRef.where('stableKey', '==', 'hospitadent_dental_group_gokturk').get();
  if (!gokturkQuery.empty) {
    const docId = gokturkQuery.docs[0].id;
    const data = gokturkQuery.docs[0].data();
    await clinicsRef.doc(docId).update({
      priority: 80,
      clinicName: data.displayNameTr || 'Hospitadent Dental Group Göktürk'
    });
    console.log(`Fixed Göktürk (${docId}) - Added priority and clinicName`);
  }

  console.log("Fix completed.");
}

fixMissingFields().catch(console.error);
