import * as admin from 'firebase-admin';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Load .env.local or .env
const envLocal = path.resolve(process.cwd(), '.env.local');
const envRegular = path.resolve(process.cwd(), '.env');

if (fs.existsSync(envLocal)) {
  dotenv.config({ path: envLocal });
} else if (fs.existsSync(envRegular)) {
  dotenv.config({ path: envRegular });
}

// Initialize Firebase Admin
let app;
if (!admin.apps.length) {
  const certBase64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  
  if (certBase64) {
      const certStr = Buffer.from(certBase64, 'base64').toString('utf-8');
      app = admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(certStr)),
      });
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      app = admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
      });
  } else {
      console.log("No FIREBASE_SERVICE_ACCOUNT_BASE64 or FIREBASE_SERVICE_ACCOUNT_KEY found.");
      process.exit(1);
  }
} else {
  app = admin.apps[0];
}

const adminDb = app!.firestore();

async function run() {
  console.log("Starting sync...");
  const clinicsSnap = await adminDb.collection("clinics").get();
    
  let totalUpdated = 0;
  let totalChecked = 0;

  for (const clinicDoc of clinicsSnap.docs) {
    const clinicId = clinicDoc.id;
    
    const appointmentsSnap = await adminDb
      .collection("clinics")
      .doc(clinicId)
      .collection("appointments")
      .where("source", "==", "ai_chatbot")
      .get();

    for (const apptDoc of appointmentsSnap.docs) {
      totalChecked++;
      const data = apptDoc.data();
      const convId = data.conversationId;
      if (!convId) continue;

      const logRef = adminDb.collection("clinics").doc(clinicId).collection("conversationLogs").doc(convId);
      const logSnap = await logRef.get();

      if (logSnap.exists) {
        const logData = logSnap.data();
        if (logData?.status !== "appointment") {
            console.log(`Updating convId: ${convId} for clinic: ${clinicId}`);
            await logRef.update({
              status: "appointment",
              appointmentId: apptDoc.id,
              convertedToAppointment: true
            });
            totalUpdated++;
        }
      }
    }
  }

  console.log(`DONE! Total checked: ${totalChecked}, Total updated: ${totalUpdated}`);
  process.exit(0);
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
