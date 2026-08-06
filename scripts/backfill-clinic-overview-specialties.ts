/**
 * Backfill overview.specialties + overview.highlightedTreatments for every
 * agency clinic in ClinicBridge Portal, derived from longDescription (and
 * related clinic text / structured treatment signals).
 *
 * Usage:
 *   npx tsx scripts/backfill-clinic-overview-specialties.ts           # dry-run
 *   npx tsx scripts/backfill-clinic-overview-specialties.ts --apply    # write
 *   npx tsx scripts/backfill-clinic-overview-specialties.ts --apply --force
 *   npx tsx scripts/backfill-clinic-overview-specialties.ts --agency mFrKEjO9fNwUzbueW5rc
 */

import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import { FieldValue } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "../lib/firebase-admin";
import {
  extractClinicOverviewFromDescription,
  mergeOverviewLabels,
} from "../lib/agency/extractClinicOverviewFromDescription";

const isApply = process.argv.includes("--apply");
const isForce = process.argv.includes("--force");
const agencyArgIdx = process.argv.indexOf("--agency");
const agencyFilter =
  agencyArgIdx >= 0 && process.argv[agencyArgIdx + 1]
    ? String(process.argv[agencyArgIdx + 1]).trim()
    : null;

type ClinicRow = {
  agencyId: string;
  agencyName: string;
  clinicId: string;
  clinicName: string;
  beforeSpecialties: string[];
  beforeTreatments: string[];
  afterSpecialties: string[];
  afterTreatments: string[];
  changed: boolean;
  skippedReason?: string;
};

async function loadPricingNames(
  db: Firestore,
  agencyId: string,
  clinicId: string
): Promise<string[]> {
  try {
    const snap = await db
      .collection("agencies")
      .doc(agencyId)
      .collection("clinics")
      .doc(clinicId)
      .collection("pricing")
      .limit(40)
      .get();
    const names: string[] = [];
    snap.forEach((doc) => {
      const d = doc.data() || {};
      const n = d.subTreatmentName || d.treatmentName || d.name;
      if (n) names.push(String(n));
    });
    return names;
  } catch {
    return [];
  }
}

async function run() {
  console.log(
    `=== BACKFILL CLINIC OVERVIEW SPECIALTIES [${isApply ? "APPLY" : "DRY-RUN"}]${
      isForce ? " [FORCE]" : ""
    } ===\n`
  );

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB is not initialized. Check Firebase credentials.");
    process.exit(1);
  }

  const agenciesSnap = agencyFilter
    ? {
        empty: false,
        docs: [
          await db.collection("agencies").doc(agencyFilter).get(),
        ].filter((d) => d.exists),
        get size() {
          return this.docs.length;
        },
      }
    : await db.collection("agencies").get();

  if (!agenciesSnap.docs.length) {
    console.error(agencyFilter ? `Agency not found: ${agencyFilter}` : "No agencies found.");
    process.exit(1);
  }

  const rows: ClinicRow[] = [];
  let agencyCount = 0;
  let clinicCount = 0;

  for (const agencyDoc of agenciesSnap.docs) {
    agencyCount += 1;
    const agencyId = agencyDoc.id;
    const agencyData = agencyDoc.data() || {};
    const agencyName = String(agencyData.name || agencyData.agencyName || agencyId);

    const clinicsSnap = await db
      .collection("agencies")
      .doc(agencyId)
      .collection("clinics")
      .get();

    console.log(`\nAgency: ${agencyName} (${agencyId}) — ${clinicsSnap.size} clinics`);

    for (const clinicDoc of clinicsSnap.docs) {
      clinicCount += 1;
      const clinicId = clinicDoc.id;
      const data = clinicDoc.data() || {};
      const overview = (data.overview && typeof data.overview === "object"
        ? data.overview
        : {}) as Record<string, any>;

      const clinicName = String(data.clinicName || data.name || clinicId);
      const longDescription = String(
        overview.longDescription || data.longDescription || ""
      ).trim();
      const shortDescription = String(
        overview.shortDescription || data.shortDescription || ""
      ).trim();

      const beforeSpecialties = Array.isArray(overview.specialties)
        ? overview.specialties.map(String)
        : [];
      const beforeTreatments = Array.isArray(overview.highlightedTreatments)
        ? overview.highlightedTreatments.map(String)
        : [];

      const pricingTreatmentNames = await loadPricingNames(db, agencyId, clinicId);

      const extracted = extractClinicOverviewFromDescription({
        longDescription,
        shortDescription,
        subTreatments: Array.isArray(data.subTreatments) ? data.subTreatments.map(String) : [],
        treatmentCategories: Array.isArray(data.treatmentCategories)
          ? data.treatmentCategories.map(String)
          : [],
        pricingTreatmentNames,
        clinicName,
        clinicType: data.clinicType || data.type || null,
      });

      if (
        extracted.specialties.length === 0 &&
        extracted.highlightedTreatments.length === 0
      ) {
        rows.push({
          agencyId,
          agencyName,
          clinicId,
          clinicName,
          beforeSpecialties,
          beforeTreatments,
          afterSpecialties: beforeSpecialties,
          afterTreatments: beforeTreatments,
          changed: false,
          skippedReason: "no_extractable_signals",
        });
        console.log(`  · skip  ${clinicName} — no extractable signals`);
        continue;
      }

      const afterSpecialties = isForce
        ? mergeOverviewLabels(extracted.specialties, [], { replace: true, max: 10 })
        : beforeSpecialties.length === 0
          ? extracted.specialties
          : mergeOverviewLabels(beforeSpecialties, extracted.specialties, { max: 10 });
      const afterTreatments = isForce
        ? mergeOverviewLabels(extracted.highlightedTreatments, [], { replace: true, max: 10 })
        : beforeTreatments.length === 0
          ? extracted.highlightedTreatments
          : // Prefer human-readable extracted labels; keep any extra existing entries after.
            mergeOverviewLabels(extracted.highlightedTreatments, beforeTreatments, { max: 10 });

      const sameSpecialties =
        JSON.stringify(afterSpecialties) === JSON.stringify(beforeSpecialties);
      const sameTreatments =
        JSON.stringify(afterTreatments) === JSON.stringify(beforeTreatments);

      if (sameSpecialties && sameTreatments) {
        rows.push({
          agencyId,
          agencyName,
          clinicId,
          clinicName,
          beforeSpecialties,
          beforeTreatments,
          afterSpecialties,
          afterTreatments,
          changed: false,
          skippedReason: "already_up_to_date",
        });
        console.log(`  · ok    ${clinicName} — already up to date`);
        continue;
      }

      rows.push({
        agencyId,
        agencyName,
        clinicId,
        clinicName,
        beforeSpecialties,
        beforeTreatments,
        afterSpecialties,
        afterTreatments,
        changed: true,
      });

      console.log(`  · update ${clinicName}`);
      console.log(`      specialties: [${beforeSpecialties.join(", ")}] → [${afterSpecialties.join(", ")}]`);
      console.log(
        `      treatments:  [${beforeTreatments.join(", ")}] → [${afterTreatments.join(", ")}]`
      );

      if (isApply) {
        const nextOverview = {
          ...overview,
          specialties: afterSpecialties,
          highlightedTreatments: afterTreatments,
        };
        // Preserve descriptions if they only lived on flat legacy fields
        if (!nextOverview.longDescription && longDescription) {
          nextOverview.longDescription = longDescription;
        }
        if (!nextOverview.shortDescription && shortDescription) {
          nextOverview.shortDescription = shortDescription;
        }

        await db
          .collection("agencies")
          .doc(agencyId)
          .collection("clinics")
          .doc(clinicId)
          .set(
            {
              overview: nextOverview,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      }
    }
  }

  const changed = rows.filter((r) => r.changed);
  const skipped = rows.filter((r) => !r.changed);

  console.log("\n=== SUMMARY ===");
  console.log(`Agencies scanned: ${agencyCount}`);
  console.log(`Clinics scanned:  ${clinicCount}`);
  console.log(`Would update:     ${changed.length}`);
  console.log(`Unchanged/skip:   ${skipped.length}`);
  if (!isApply) {
    console.log("\nDry-run only. Re-run with --apply to write changes.");
  } else {
    console.log(`\nApplied updates:  ${changed.length}`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
