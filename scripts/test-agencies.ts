import { getAdminDb } from "./lib/firebase-admin";

async function run() {
  const adminDb = getAdminDb();
  if (adminDb) {
    const snaps = await adminDb.collection("agencies").get();
    console.log("Total agencies:", snaps.size);
  }
}
run();
