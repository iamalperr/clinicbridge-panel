import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { getAdminDb } from "../lib/firebase-admin";

async function run() {
  const db = getAdminDb();
  const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
  
  const snap = await db.collection("agencies").doc(AGENCY_ID)
    .collection("clinics")
    .where("status", "in", ["active", "draft"])
    .orderBy("priority", "desc")
    .orderBy("createdAt", "desc")
    .get();
    
  console.log(`Query returned ${snap.size} clinics`);
  snap.docs.forEach(doc => {
    const data = doc.data();
    console.log(`- ${data.clinicName} (Status: ${data.status}, Priority: ${data.priority}, Category: ${data.category}, Area: ${data.location?.area})`);
  });
}
run().catch(console.error);
