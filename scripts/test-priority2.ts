import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { getAdminDb } from './lib/firebase-admin';
const db = getAdminDb();
db.collection('agencies').doc('mFrKEjO9fNwUzbueW5rc').collection('clinics')
  .orderBy('priority', 'asc')
  .get().then(snap => {
  console.log('Total with orderBy:', snap.size);
});
