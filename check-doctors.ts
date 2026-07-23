import { getAdminDb } from "./lib/firebase-admin";

async function run() {
  const adminDb = getAdminDb();
  if (!adminDb) return;
  const clinicId = "ByTnY4VEmBTJxogqCQ7q";
  
  const docsSnap = await adminDb.collection("clinics").doc(clinicId).collection("doctors").get();
  console.log(`Found ${docsSnap.size} doctors in structured collection.`);
  docsSnap.forEach(doc => {
    console.log(doc.id, doc.data().name);
  });
  
  const trainingSnap = await adminDb.collection("clinics").doc(clinicId).collection("trainingMaterials").get();
  console.log(`\nFound ${trainingSnap.size} training materials.`);
  trainingSnap.forEach(doc => {
    console.log(doc.id, doc.data().title);
  });
}

run();
