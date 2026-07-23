import { getAdminDb } from './lib/firebase-admin';

async function run() {
  const adminDb = getAdminDb();
  if (!adminDb) return;
  const agenciesSnap = await adminDb.collection("agencies").get();
  for (const agency of agenciesSnap.docs) {
    console.log("Agency:", agency.id);
    const clinics = await adminDb.collection("agencies").doc(agency.id).collection("clinics").get();
    for (const clinic of clinics.docs) {
      console.log("  Clinic ID:", clinic.id, "Slug:", clinic.data().clinicSlug, "Name:", clinic.data().clinicName);
      const doctors = await clinic.ref.collection("doctors").get();
      console.log("    Doctors count:", doctors.docs.length);
    }
  }
}
run();
