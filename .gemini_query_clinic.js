require("dotenv").config({ path: ".env.local" });
const admin = require("firebase-admin");

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function main() {
  // Get all clinics and check their notification settings schema
  const clinicsSnap = await db.collection("clinics").get();
  
  for (const doc of clinicsSnap.docs) {
    const data = doc.data();
    const clinicName = data.name || data.clinicName || doc.id;
    
    const hasNew = !!data.notificationSettings;
    const hasLegacy = !!data.patientNotificationSettings;
    
    console.log(`\n=== CLINIC: ${clinicName} (${doc.id}) ===`);
    console.log(`  notificationSettings present: ${hasNew}`);
    console.log(`  patientNotificationSettings present: ${hasLegacy}`);
    
    if (hasNew) {
      const ns = data.notificationSettings;
      console.log(`  notificationSettings fields: ${JSON.stringify(Object.keys(ns))}`);
      console.log(`  patientAppointmentChannel: ${ns.patientAppointmentChannel || "MISSING"}`);
      console.log(`  requireEmail: ${ns.requireEmail}`);
      console.log(`  requirePhone: ${ns.requirePhone}`);
      
      // Check clinic notification sub-settings
      if (ns.clinic) {
        console.log(`  clinic.newAppointmentEmailEnabled: ${ns.clinic.newAppointmentEmailEnabled}`);
        console.log(`  clinic.recipientEmails count: ${Array.isArray(ns.clinic.recipientEmails) ? ns.clinic.recipientEmails.length : "NOT_ARRAY"}`);
      } else {
        console.log(`  clinic sub-object: MISSING`);
      }
    }
    
    if (hasLegacy) {
      const pns = data.patientNotificationSettings;
      console.log(`  patientNotificationSettings fields: ${JSON.stringify(Object.keys(pns))}`);
      console.log(`  primaryChannel: ${pns.primaryChannel || "MISSING"}`);
      console.log(`  collectEmail: ${pns.collectEmail}`);
      console.log(`  collectPhone: ${pns.collectPhone}`);
    }
    
    if (!hasNew && !hasLegacy) {
      console.log(`  NO notification settings of any kind`);
    }
  }
  
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
