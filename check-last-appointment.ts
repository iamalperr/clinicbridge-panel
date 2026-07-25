import { getAdminDb } from "./lib/firebase-admin";

async function check() {
  const adminDb = getAdminDb();
  if (!adminDb) {
    console.log("No adminDb");
    return;
  }
  
  // Just find the first clinic and get its latest appointment
  const clinicsSnap = await adminDb.collection("clinics").limit(1).get();
  if (clinicsSnap.empty) {
    console.log("No clinics found");
    return;
  }
  const clinicId = clinicsSnap.docs[0].id;
  
  const aptsSnap = await adminDb.collection("clinics").doc(clinicId).collection("appointments")
    .orderBy("createdAt", "desc").limit(3).get();
    
  console.log(`Latest 3 appointments for clinic ${clinicId}:`);
  aptsSnap.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}`);
    console.log(`Name: ${data.patientName}`);
    console.log(`Phone: ${data.patientPhone}`);
    console.log(`Email: ${data.patientEmail}`);
    console.log(`Status: ${data.status}`);
    console.log(`Source: ${data.source}`);
    console.log(`Created: ${data.createdAt}`);
    console.log("-----------------------");
  });
}

check().catch(console.error);
