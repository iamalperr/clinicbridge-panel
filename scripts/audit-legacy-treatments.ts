/**
 * audit-legacy-treatments.ts
 *
 * Scans all agencies and their treatments to find any TreatmentCatalogItem
 * that has legacy pricing or duration fields (avgPriceMin, duration, etc.).
 *
 * Usage:
 * npx tsx scripts/audit-legacy-treatments.ts
 */

import { getAdminDb } from "../lib/firebase-admin";

async function runAudit() {
  console.log("[Audit] Starting legacy treatment audit...");
  const adminDb = getAdminDb();
  if (!adminDb) {
    console.error("Firebase admin DB not available. Are environment variables set?");
    process.exit(1);
  }

  try {
    const agenciesSnap = await adminDb.collection("agencies").get();
    console.log(`[Audit] Found ${agenciesSnap.size} agencies. Scanning treatments...`);

    let totalLegacyFound = 0;
    const agenciesWithLegacy = new Set<string>();

    for (const agencyDoc of agenciesSnap.docs) {
      const agencyName = agencyDoc.data().name || agencyDoc.id;
      
      const treatmentsSnap = await adminDb
        .collection("agencies")
        .doc(agencyDoc.id)
        .collection("treatments")
        .get();

      let agencyLegacyCount = 0;

      treatmentsSnap.forEach(tDoc => {
        const data = tDoc.data();
        const hasLegacyPricing = data.avgPriceMin !== undefined || data.avgPriceMax !== undefined;
        const hasLegacyDuration = !!data.duration || !!data.recoveryTime;

        if (hasLegacyPricing || hasLegacyDuration) {
          agencyLegacyCount++;
          totalLegacyFound++;
          agenciesWithLegacy.add(agencyName);
          console.log(`\n  [Legacy Treatment Found] Agency: ${agencyName} | Treatment: ${data.name} (${tDoc.id})`);
          if (hasLegacyPricing) {
            console.log(`    Pricing: ${data.avgPriceMin || "—"} - ${data.avgPriceMax || "—"} ${data.currency || ""}`);
          }
          if (hasLegacyDuration) {
            console.log(`    Duration: ${data.duration || "—"} | Recovery: ${data.recoveryTime || "—"}`);
          }
        }
      });

      if (agencyLegacyCount > 0) {
        console.log(`[Audit] Agency '${agencyName}' has ${agencyLegacyCount} legacy treatments.`);
      }
    }

    console.log("\n=======================================================");
    console.log("[Audit] Summary:");
    console.log(`Total legacy treatments found: ${totalLegacyFound}`);
    console.log(`Agencies affected: ${agenciesWithLegacy.size}`);
    console.log("These records should eventually be migrated to ClinicTreatmentPricing and these fields deleted from the treatment schema.");
    console.log("=======================================================\n");

  } catch (error) {
    console.error("[Audit] Error during scan:", error);
  }
}

runAudit();
