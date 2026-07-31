import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { getAdminAuth } from "../lib/firebase-admin";

async function checkAuth() {
  const adminAuth = getAdminAuth();
  try {
    const user = await adminAuth.getUserByEmail("info@clinicbridge-ai.com");
    console.log("Firebase Auth UID:", user.uid);
    console.log("Custom Claims:", user.customClaims);
  } catch (err) {
    console.error("User not found in Auth", err);
  }
}
checkAuth();
