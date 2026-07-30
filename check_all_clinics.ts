import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import { getAdminDb } from './lib/firebase-admin';

async function checkAllClinics() {
  const db = getAdminDb();
  if (!db) {
    throw new Error('Database is null');
  }

  const TARGET_AGENCY_ID = 'mFrKEjO9fNwUzbueW5rc';
  const clinicsRef = db.collection('agencies').doc(TARGET_AGENCY_ID).collection('clinics');
  
  const allClinics = await clinicsRef.get();
  
  console.log(`Total clinics: ${allClinics.size}`);
  
  let updateCount = 0;
  for (const doc of allClinics.docs) {
    const data = doc.data();
    console.log(`[${doc.id}] ${data.displayNameTr || data.clinicName || 'Unknown'} - priority: ${data.priority}, clinicName: ${data.clinicName}`);
    
    let needsUpdate = false;
    const updates: any = {};
    
    if (data.priority === undefined) {
      updates.priority = 80;
      needsUpdate = true;
    }
    
    if (data.clinicName === undefined) {
      updates.clinicName = data.displayNameTr || data.name || data.brand || 'Unknown Clinic';
      needsUpdate = true;
    }

    if (needsUpdate) {
       console.log(` -> Updating ${doc.id} with`, updates);
       await clinicsRef.doc(doc.id).update(updates);
       updateCount++;
    }
  }

  console.log(`Check completed. Updated ${updateCount} clinics.`);
}

checkAllClinics().catch(console.error);
