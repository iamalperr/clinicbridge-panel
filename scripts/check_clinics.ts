import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { getAdminDb } from "../lib/firebase-admin";

async function check() {
  const db = getAdminDb();
  const snap = await db.collection("agencies").doc("mFrKEjO9fNwUzbueW5rc").collection("clinics").get();
  snap.forEach(d => {
      const data = d.data();
      console.log(d.id, data.clinicName, data.slug);
  });
}
check().catch(console.error);
