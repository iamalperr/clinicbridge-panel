require("dotenv").config({ path: ".env.local" });
const admin = require("firebase-admin");

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function run() {
  const clinics = await db.collection("clinics").limit(10).get();
  for (const clinic of clinics.docs) {
    const logs = await db.collection("clinics").doc(clinic.id).collection("conversationLogs")
                         .orderBy("updatedAt", "desc").limit(1).get();
    for (const log of logs.docs) {
      const data = log.data();
      console.log("Clinic:", clinic.id, "Conv:", log.id);
      console.log("State:", data.appointmentState);
      console.log("Draft:", data.appointmentDraft);
      console.log("Version:", data.appointmentVersion);
      console.log("History Length:", data.messages?.length);
      console.log("-------------------");
    }
  }
}
run().then(() => process.exit(0)).catch(console.error);
