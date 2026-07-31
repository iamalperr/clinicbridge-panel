import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

import { getAdminDb } from "../lib/firebase-admin";

async function checkUser() {
  const db = getAdminDb();
  const usersRef = db.collection("users");
  const snap = await usersRef.where("email", "==", "info@clinicbridge-ai.com").get();

  if (snap.empty) {
    console.log("No user document found for info@clinicbridge-ai.com");
    return;
  }

  snap.forEach(doc => {
    console.log(`User ID: ${doc.id}`);
    console.log("Data:", JSON.stringify(doc.data(), null, 2));
  });
}

checkUser().catch(console.error);
