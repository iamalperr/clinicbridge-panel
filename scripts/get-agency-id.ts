import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getAdminDb } from "../lib/firebase-admin";

async function main() {
  const db = getAdminDb();
  if (!db) {
      console.log("DB init failed");
      return;
  }
  const snap = await db.collection("agencies").where("slug", "==", "feelinhealthy").get();
  if (snap.empty) {
    console.log("Not found");
  } else {
    console.log("ID:", snap.docs[0].id);
    console.log("Data:", snap.docs[0].data().name, snap.docs[0].data().status);
    
    // Check clinics
    const clinicSnap = await db.collection("agencies").doc(snap.docs[0].id).collection("clinics").get();
    console.log("Clinic count:", clinicSnap.size);
  }
}
main();
