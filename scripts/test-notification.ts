import { getAdminDb } from './lib/firebase-admin';

async function run() {
  const adminDb = getAdminDb();
  if (!adminDb) return;
  const clinicsSnap = await adminDb.collection("clinics").limit(1).get();
  if (clinicsSnap.empty) {
    console.log("No clinics found");
    return;
  }
  const clinicId = clinicsSnap.docs[0].id;
  console.log("Found clinic:", clinicId);

  const apptSnap = await adminDb.collection("clinics").doc(clinicId).collection("appointments").limit(1).get();
  if (apptSnap.empty) {
    console.log("No appointments found");
    return;
  }
  const appointmentId = apptSnap.docs[0].id;
  console.log("Found appt:", appointmentId);
  process.exit(0);
}

run().catch(console.error);
