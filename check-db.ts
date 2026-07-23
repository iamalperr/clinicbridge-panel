import { getAdminDb } from "./lib/firebase-admin.ts";

async function run() {
  const adminDb = getAdminDb();
  if (!adminDb) {
    console.log("No admin db");
    return;
  }
  const clinicId = "ByTnY4VEmBTJxogqCQ7q";
  const clinicSnap = await adminDb.collection("clinics").doc(clinicId).get();
  console.log("Clinic exists:", clinicSnap.exists);
  
  // Check doctors collection
  const docsSnap = await adminDb.collection("clinics").doc(clinicId).collection("doctors").get();
  console.log("Doctors found:", docsSnap.size);
  docsSnap.forEach(d => console.log(d.id, d.data().doctorName, d.data().status));
}
run().catch(console.error);
