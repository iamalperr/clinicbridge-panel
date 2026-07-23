import { getAdminDb } from "./lib/firebase-admin";

async function run() {
  const adminDb = getAdminDb();
  if (!adminDb) {
    console.error("No adminDb");
    return;
  }
  
  const clinicId = "hospitadent-dental-group"; 
  const msgLower = "kaç doktorunuz var?";
  const isDoctorIntent = /\b(doktor|hekim|uzman|doctor|dentist|specialist|cerrah|surgeon|tıbbi|medical team|ekip|doctors|hekimler|doktorlar)\b/i.test(msgLower);
  
  const docsSnap = await adminDb.collection("clinics").doc(clinicId).collection("doctors").where("is_active", "==", true).get();
  
  console.log(`Resolved clinic_id: ${clinicId}`);
  console.log(`Active doctor records found: ${docsSnap.size}`);
  console.log(`Detected intent: isDoctorIntent=${isDoctorIntent}`);
}

run().catch(console.error);
