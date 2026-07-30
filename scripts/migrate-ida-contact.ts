import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import { getAdminDb } from "../lib/firebase-admin";

async function run() {
  const db = getAdminDb();
  
  // Find Istanbul Dis Akademisi
  const clinicsSnap = await db.collection("clinics").where("name", "==", "İstanbul Diş Akademisi").limit(1).get();
  
  if (clinicsSnap.empty) {
    console.log("Could not find clinic by name 'İstanbul Diş Akademisi'. Searching by domain...");
    const domainSnap = await db.collection("clinics").where("domain", "==", "istanbul-dis-akademisi").limit(1).get();
    if (domainSnap.empty) {
      console.log("Could not find by domain either. Dumping first 3 clinics to check names:");
      const all = await db.collection("clinics").limit(3).get();
      all.forEach(d => console.log(d.id, "=>", d.data().name));
      return;
    } else {
      const doc = domainSnap.docs[0];
      await updateClinic(doc);
    }
  } else {
    const doc = clinicsSnap.docs[0];
    await updateClinic(doc);
  }
  
  async function updateClinic(docRef: FirebaseFirestore.QueryDocumentSnapshot<FirebaseFirestore.DocumentData>) {
    console.log(`Found Istanbul Dis Akademisi. ID: ${docRef.id}`);
    await docRef.ref.update({
      turkishContactNumber: "+90 533 140 08 70",
      internationalContactNumber: "+90 535 660 51 37",
    });
    console.log("[SUCCESS] Updated turkishContactNumber and internationalContactNumber successfully.");
  }
}

run().catch(console.error);
