/**
 * Seed FeelinHealthy curated matching matrix into PRODUCTION Firestore.
 *
 * Usage:
 *   npx tsx scripts/migrate-fh-matching-rules-production.ts --dry-run
 *   npx tsx scripts/migrate-fh-matching-rules-production.ts --apply --confirm-production
 *
 * Loads `.env.local`. Refuses to write unless:
 *   - target project_id is exactly `clinicbridge`
 *   - `--apply` AND `--confirm-production` are both present
 *
 * Idempotent. Does not overwrite agency_ui modifications unless --force.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import * as admin from "firebase-admin";
import { migrateFeelinHealthyMatchingRules } from "../lib/agency/migrateFeelinHealthyMatchingRules";
import {
  assertNoIntermedInRules,
  buildFeelinHealthyMigrationRules,
  compareLegacyVsDynamicParity,
  extractLiveCuratedMatrix,
} from "../lib/agency/agencyMatchingRules";
import { FEELINHEALTHY_PRODUCTION_CLINIC_IDS } from "../lib/agency/feelinhealthyConfig";

const PRODUCTION_PROJECT_ID = "clinicbridge";
const AGENCY_ID = "feelinhealthy";

function fail(msg: string): never {
  console.error(`[prod-migrate] FAIL: ${msg}`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  return {
    dryRun: !argv.includes("--apply"),
    force: argv.includes("--force"),
    confirmProduction: argv.includes("--confirm-production"),
  };
}

function loadProductionEnv(): { projectId: string; credentialProjectId: string } {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    fail("Missing .env.local");
  }
  // Clear prior Firebase env so staging shell vars cannot linger.
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith("FIREBASE_") ||
      key.startsWith("NEXT_PUBLIC_FIREBASE_") ||
      key === "GCLOUD_PROJECT" ||
      key === "GOOGLE_CLOUD_PROJECT"
    ) {
      delete process.env[key];
    }
  }
  dotenv.config({ path: envPath, override: true });

  const projectId = (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    ""
  ).trim();
  if (projectId !== PRODUCTION_PROJECT_ID) {
    fail(
      `Expected production project "${PRODUCTION_PROJECT_ID}", got "${projectId || "(empty)"}".`
    );
  }

  const b64 = (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim();
  if (!b64) fail("FIREBASE_SERVICE_ACCOUNT_BASE64 missing in .env.local");
  let credentialProjectId = "";
  try {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as {
      project_id?: string;
    };
    credentialProjectId = String(json.project_id || "").trim();
  } catch {
    fail("FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64/JSON.");
  }
  if (credentialProjectId !== PRODUCTION_PROJECT_ID) {
    fail(
      `Service account project_id "${credentialProjectId}" is not production.`
    );
  }

  console.log(
    `[prod-migrate] OK target project="${projectId}" credential_project="${credentialProjectId}"`
  );
  return { projectId, credentialProjectId };
}

async function main() {
  const { dryRun, force, confirmProduction } = parseArgs(process.argv.slice(2));
  const { projectId } = loadProductionEnv();

  if (!dryRun && !confirmProduction) {
    fail(
      "Refusing production write without --confirm-production. Use: --apply --confirm-production"
    );
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(
        JSON.parse(
          Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, "base64").toString(
            "utf8"
          )
        )
      ),
      projectId: PRODUCTION_PROJECT_ID,
    });
  }

  const adminDb = admin.firestore();

  // Resolve feelinhealthy agency doc id (slug lookup; fallback to literal id).
  let agencyId = AGENCY_ID;
  const bySlug = await adminDb
    .collection("agencies")
    .where("slug", "==", "feelinhealthy")
    .limit(1)
    .get();
  if (!bySlug.empty) {
    agencyId = bySlug.docs[0].id;
  } else {
    const direct = await adminDb.collection("agencies").doc(AGENCY_ID).get();
    if (!direct.exists) {
      fail(`Agency feelinhealthy not found (slug or id=${AGENCY_ID}).`);
    }
  }

  console.log("=== FeelinHealthy matching rules migration (PRODUCTION) ===");
  console.log(
    `project=${projectId} agencyId=${agencyId} dryRun=${dryRun} force=${force} confirm=${confirmProduction}`
  );

  const matrix = extractLiveCuratedMatrix();
  console.log(`\nLive curated matrix rows: ${matrix.length}`);
  for (const row of matrix) {
    console.log(
      `  ${row.treatmentBranch} | ${row.city} | ${row.side} → ${row.clinicNames.join(" / ") || "(none)"}`
    );
  }

  const seed = buildFeelinHealthyMigrationRules(agencyId);
  assertNoIntermedInRules(seed);
  console.log(`\nSeed rules: ${seed.length} (Intermed excluded ✓)`);

  const syntheticPool = Array.from(new Set(seed.flatMap((r) => r.clinicIds))).map(
    (id) => ({
      id,
      clinicName: id,
      status: "active",
      treatmentCategories: [
        "dental",
        "aesthetic_surgery",
        "ivf",
        "cardiology",
        "check_up",
        "eye_treatments",
        "hair_transplant",
      ],
      location: { city: "İstanbul" },
    })
  );

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
    fail("Aborting migration: parity failures.");
  }

  // Preflight: count how many seed clinic IDs exist under this agency
  const clinicSnaps = await Promise.all(
    Array.from(new Set(seed.flatMap((r) => r.clinicIds))).map((id) =>
      adminDb.collection("agencies").doc(agencyId).collection("clinics").doc(id).get()
    )
  );
  const present = clinicSnaps.filter((s) => s.exists).length;
  const missing = clinicSnaps.length - present;
  console.log(
    `\nClinic ID preflight: present=${present} missing=${missing} (of ${clinicSnaps.length} unique seed IDs)`
  );
  if (missing > 0) {
    console.warn(
      "[prod-migrate] WARN: some curated clinic IDs are not linked under this agency; runtime will skip missing IDs."
    );
  }

  const result = await migrateFeelinHealthyMatchingRules({
    adminDb: adminDb as any,
    agencyId,
    dryRun,
    force,
  });

  console.log("\nMigration result:", JSON.stringify(result, null, 2));
  console.log(
    `\nIntermed id (${FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi}) never in seed ✓`
  );

  if (dryRun) {
    console.log(
      "\nDry-run only. Re-run with --apply --confirm-production to write PRODUCTION."
    );
  } else {
    console.log("\nPRODUCTION matchingRules written.");
    console.log(
      "Refresh AI Eşleştirme → Öneri Kuralları to see Clinic 1 / Clinic 2 pickers."
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
