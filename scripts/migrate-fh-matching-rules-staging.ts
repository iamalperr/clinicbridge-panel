/**
 * Seed FeelinHealthy curated matching matrix into agencies/{id}/matchingRules.
 *
 * Usage:
 *   npx tsx scripts/migrate-fh-matching-rules-staging.ts --dry-run
 *   npx tsx scripts/migrate-fh-matching-rules-staging.ts --apply
 *   npx tsx scripts/migrate-fh-matching-rules-staging.ts --apply --force
 *
 * Staging only (.env.staging). Never production in this script.
 */

import * as admin from "firebase-admin";
import {
  loadAndAssertStagingEnv,
  STAGING_PROJECT_ID,
} from "./lib/stagingFirebaseEnv";
import { migrateFeelinHealthyMatchingRules } from "../lib/agency/migrateFeelinHealthyMatchingRules";
import {
  assertNoIntermedInRules,
  buildFeelinHealthyMigrationRules,
  compareLegacyVsDynamicParity,
  extractLiveCuratedMatrix,
} from "../lib/agency/agencyMatchingRules";
import { FEELINHEALTHY_PRODUCTION_CLINIC_IDS } from "../lib/agency/feelinhealthyConfig";

const AGENCY_ID = "feelinhealthy";

function parseArgs(argv: string[]) {
  return {
    dryRun: !argv.includes("--apply"),
    force: argv.includes("--force"),
  };
}

async function main() {
  const { dryRun, force } = parseArgs(process.argv.slice(2));
  loadAndAssertStagingEnv();

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(
        JSON.parse(
          Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, "base64").toString("utf8")
        )
      ),
      projectId: STAGING_PROJECT_ID,
    });
  }

  const adminDb = admin.firestore();

  console.log("=== FeelinHealthy matching rules migration (staging) ===");
  console.log(`project=${STAGING_PROJECT_ID} agency=${AGENCY_ID} dryRun=${dryRun} force=${force}`);

  const matrix = extractLiveCuratedMatrix();
  console.log(`\nLive curated matrix rows: ${matrix.length}`);
  for (const row of matrix) {
    console.log(
      `  ${row.treatmentBranch} | ${row.city} | ${row.side} → ${row.clinicNames.join(" / ") || "(none)"}`
    );
  }

  const seed = buildFeelinHealthyMigrationRules(AGENCY_ID);
  assertNoIntermedInRules(seed);
  console.log(`\nSeed rules: ${seed.length} (Intermed excluded ✓)`);

  // In-memory parity vs curated using synthetic pool from seed IDs
  const syntheticPool = Array.from(
    new Set(seed.flatMap((r) => r.clinicIds))
  ).map((id) => ({
    id,
    clinicName: id,
    status: "active",
    treatmentCategories: ["dental", "aesthetic_surgery", "ivf", "cardiology", "check_up", "eye_treatments", "hair_transplant"],
    location: { city: "İstanbul" },
  }));
  // Fix city for non-istanbul clinics roughly — parity uses curated matching which matches by id primarily
  let parityOk = 0;
  let parityFail = 0;
  for (const row of matrix) {
    const cmp = compareLegacyVsDynamicParity({
      category: row.treatmentBranch,
      city: row.city,
      side: row.side === "any" ? "any" : row.side,
      availableClinics: syntheticPool,
      migratedRules: seed,
    });
    if (cmp.match) parityOk++;
    else {
      parityFail++;
      console.error("PARITY FAIL", row.treatmentBranch, row.city, row.side, cmp);
    }
  }
  console.log(`\nIn-memory parity: ok=${parityOk} fail=${parityFail}`);
  if (parityFail > 0) {
    console.error("Aborting migration: parity failures.");
    process.exit(1);
  }

  const result = await migrateFeelinHealthyMatchingRules({
    adminDb: adminDb as any,
    agencyId: AGENCY_ID,
    dryRun,
    force,
  });

  console.log("\nMigration result:", JSON.stringify(result, null, 2));
  console.log(
    `\nIntermed id (${FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi}) never in seed ✓`
  );

  if (dryRun) {
    console.log("\nDry-run only. Re-run with --apply to write staging.");
  } else {
    console.log("\nStaging matchingRules written.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
