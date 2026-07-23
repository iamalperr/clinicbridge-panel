const admin = require("firebase-admin");
const path = require("path");

const serviceAccount = require("./lib/serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function check() {
  const clinicId = "ByTnY4VEmBTJxogqCQ7q";
  console.log("Checking doctors for", clinicId);
  const docs = await db.collection("clinics").doc(clinicId).collection("doctors").get();
  console.log("Structured doctors:", docs.size);
  docs.forEach(d => console.log(d.id, d.data().name, d.data().doctorName));
  
  const tm = await db.collection("clinics").doc(clinicId).collection("trainingMaterials").get();
  console.log("\nTraining materials:", tm.size);
  tm.forEach(d => {
    console.log(d.id, "TITLE:", d.data().title);
  });
}
check();
