import { getAdminDb, getAdminAuth } from "../lib/firebase-admin";

async function repairAgencyAdmins() {
  console.log("=== AGENCY ADMIN PERMISSION BACKFILL ===");

  try {
    const db = getAdminDb();
    const auth = getAdminAuth();
    if (!db || !auth) {
        throw new Error("Admin SDK not initialized");
    }
    const usersSnapshot = await db.collection("users").get();
    let repairedCount = 0;

    for (const doc of usersSnapshot.docs) {
      const data = doc.data();
      const role = data.role;
      const uid = data.uid;

      if (role === "agencyAdmin" || role === "agencyUser") {
        const agencyId = data.agencyId;
        if (!agencyId) {
          console.warn(`[WARN] User ${data.email} (${uid}) is agencyAdmin but has no agencyId! Skipping.`);
          continue;
        }

        const currentPerms = data.permissions || [];
        const requiredPerms = [
          "agency_portal",
          "clinic_overview",
          "clinic_prompt",
          "clinic_voice",
          "clinic_widget",
          "clinic_training",
          "clinic_notes",
          "clinic_usage",
          "clinic_logs",
          "clinic_appointments",
          "clinic_settings"
        ];

        // Check if missing any
        const missing = requiredPerms.filter(p => !currentPerms.includes(p));
        
        if (missing.length > 0) {
          console.log(`[REPAIR] User ${data.email} (${uid}) is missing ${missing.length} bundle permissions.`);
          
          const newPerms = Array.from(new Set([...currentPerms, ...requiredPerms]));
          
          // 1. Update Firestore
          await doc.ref.update({
            permissions: newPerms
          });
          
          // 2. Refresh Custom Claims (Idempotent)
          try {
            await auth.setCustomUserClaims(uid, {
              role: role,
              agencyId: agencyId
            });
            console.log(`  -> Successfully backfilled permissions and custom claims for ${data.email}`);
            repairedCount++;
          } catch (authErr: any) {
            console.error(`  -> [ERROR] Failed to set custom claims for ${data.email}: ${authErr.message}`);
          }
        } else {
          console.log(`[SKIP] User ${data.email} (${uid}) already has full agency portal bundle.`);
          
          // Enforce custom claims anyway just to be safe
          try {
             await auth.setCustomUserClaims(uid, {
               role: role,
               agencyId: agencyId
             });
          } catch (e) {}
        }
      }
    }

    console.log(`\n=== BACKFILL COMPLETE ===`);
    console.log(`Repaired ${repairedCount} agency admin/user accounts.`);
    
  } catch (error) {
    console.error("Backfill failed:", error);
  }
}

repairAgencyAdmins().then(() => process.exit(0)).catch(() => process.exit(1));
