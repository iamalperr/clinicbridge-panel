import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { getAdminDb } from './lib/firebase-admin';
const db = getAdminDb();
db.collection('agencies').doc('mFrKEjO9fNwUzbueW5rc').collection('clinics').get().then(snap => {
  console.log('Total:', snap.size);
  let activeNoPriority = 0;
  snap.docs.forEach(d => {
    if (d.data().priority === undefined) {
      console.log(d.id, d.data().clinicName, 'MISSING PRIORITY');
      activeNoPriority++;
    }
  });
});
