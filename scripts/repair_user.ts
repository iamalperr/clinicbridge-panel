import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { getAdminAuth, getAdminDb } from "../lib/firebase-admin";

async function repairUser() {
  const adminAuth = getAdminAuth();
  const adminDb = getAdminDb();
  const email = "info@clinicbridge-ai.com";

  try {
    const user = await adminAuth.getUserByEmail(email);
    console.log("Firebase Auth User:", user.uid);
    
    const docRef = adminDb.collection("users").doc(user.uid);
    const docSnap = await docRef.get();
    
    if (docSnap.exists) {
      const data = docSnap.data();
      console.log("Firestore Data:", data);
      
      // Repair logic: set custom claims
      const claims = {
        role: data.role,
        agencyId: data.agencyId || null,
        clinicId: data.clinicId || null
      };
      
      await adminAuth.setCustomUserClaims(user.uid, claims);
      console.log("Custom claims set:", claims);
    } else {
      console.log("User doc not found!");
    }
  } catch (err) {
    console.error("Error repairing user", err);
  }
}
repairUser();
