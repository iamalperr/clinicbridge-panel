import { getAdminDb } from "./lib/firebase-admin";

async function run() {
  const adminDb = getAdminDb();
  if (!adminDb) {
    console.log("No adminDb");
    return;
  }
  
  const snap = await adminDb.collection("clinics").where("name", "==", "İstanbul Diş Akademisi").get();
  if (snap.empty) {
    // Try without exact match
    const all = await adminDb.collection("clinics").get();
    all.forEach(d => {
      if (d.data().name?.includes("İstanbul Diş Akademisi") || d.data().name?.includes("Istanbul")) {
         console.log(`Found: ${d.id} -> ${d.data().name}`);
      }
    });
  } else {
    snap.forEach(d => {
      console.log(`Exact match: ${d.id} -> ${d.data().name}`);
    });
  }
}

run().catch(console.error);
