/**
 * Two clean-up passes over FeelinHealthy clinic doctor records.
 *
 * Phase 1 — Specialty inference
 *   FeelinHealthy has no specialty field, so doctors at single-specialty clinics
 *   are left blank. Fill those from unambiguous signals only:
 *     · doctor title "Dt."  → Diş Hekimi        (works even inside multi-specialty hospitals)
 *     · doctor title "Dyt." → Diyetisyen
 *     · name prefixed with a profession (Podolog, Klinik Psikolog, ...) → that profession
 *       (the prefix is also stripped out of doctorName)
 *     · Dünyagöz branch     → Göz Hastalıkları
 *     · dental-only clinic  → Diş Hekimi
 *   Multi-specialty hospitals (BHT, Intermed, Orion, Memorial, Anadolu) are left
 *   untouched: guessing a department there would be unsafe.
 *
 * Phase 2 — Legacy record cleanup
 *   Old install scripts wrote doctors with `name`/`displayOrder`/`active` instead of
 *   the schema the portal reads (`doctorName`/`order`/`status`). Because both the
 *   portal and the public API query orderBy("order"), those documents are never
 *   returned — they are invisible dead data. Delete them.
 *
 * Usage:
 *   npx tsx scripts/fix-clinic-doctor-records.ts            # dry-run
 *   npx tsx scripts/fix-clinic-doctor-records.ts --apply     # write
 */

import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../lib/firebase-admin";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc"; // FeelinHealthy
const isApply = process.argv.includes("--apply");

const PROFESSION_PREFIXES: Array<[RegExp, string]> = [
  [/^klinik\s+psikolog\s+/i, "Klinik Psikolog"],
  [/^psikolog\s+/i, "Psikolog"],
  [/^podolog\s+/i, "Podolog"],
  [/^diyetisyen\s+/i, "Diyetisyen"],
  [/^fizyoterapist\s+/i, "Fizyoterapist"],
];

/** Legacy display names carry the role too ("Dr. Merve Erkip, Dentist"); compare on the person part only. */
function personPart(raw: string): string {
  const sep = raw.match(/\s*(?:,|\/)\s*/);
  return sep && sep.index !== undefined ? raw.slice(0, sep.index) : raw;
}

function normalizeName(raw: string): string {
  return personPart(raw)
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(
      /\b(dr|dt|prof|op|uzm|doc|doç|md|dds|assoc|associate|professor|ogr|öğr|uyesi|üyesi|podolog|dyt|klinik|psikolog)\.?\b/g,
      ""
    )
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Specialty implied by the clinic itself, for single-specialty clinics only. */
function inferClinicSpecialty(clinicName: string, data: Record<string, any>): string | null {
  const n = clinicName.toLocaleLowerCase("tr");
  if (n.includes("dünyagöz") || n.includes("dunyagoz")) return "Göz Hastalıkları";

  const categories: string[] = Array.isArray(data.treatmentCategories)
    ? data.treatmentCategories.map(String)
    : [];
  const dentalByCategory = categories.length === 1 && categories[0] === "dental";
  const dentalByName =
    /hospitadent|beyazışık|beyazisik|westdent|dental|diş|dis akademisi/.test(n);
  if (dentalByCategory || dentalByName) return "Diş Hekimi";

  return null;
}

interface Plan {
  clinicName: string;
  doctorId: string;
  before: string;
  patch: Record<string, any>;
  reason: string;
}

async function run() {
  console.log(`=== FIX CLINIC DOCTOR RECORDS [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB is not initialized. Check Firebase credentials.");
    process.exit(1);
  }

  const clinicsSnap = await db
    .collection("agencies")
    .doc(AGENCY_ID)
    .collection("clinics")
    .get();

  const specialtyPlans: Plan[] = [];
  const legacyDeletes: Array<{
    clinicName: string;
    docId: string;
    display: string;
    matched: boolean;
    ref: FirebaseFirestore.DocumentReference;
  }> = [];
  const reasonCount = new Map<string, number>();

  for (const clinicDoc of clinicsSnap.docs) {
    const data = clinicDoc.data() || {};
    const clinicName = String(data.clinicName || data.name || clinicDoc.id);
    const clinicSpecialty = inferClinicSpecialty(clinicName, data);

    const doctorsSnap = await clinicDoc.ref.collection("doctors").get();

    // Names of the live (portal-visible) records, used to confirm legacy duplicates.
    const liveNames = new Set<string>();
    doctorsSnap.forEach((d) => {
      const n = d.data()?.doctorName;
      if (n) liveNames.add(normalizeName(String(n)));
    });

    for (const doctorDoc of doctorsSnap.docs) {
      const doc = doctorDoc.data() || {};

      // ── Phase 2 candidate: legacy shape (no doctorName) ──
      if (!doc.doctorName) {
        const display = String(doc.sourceDisplayName || doc.name || "(isimsiz)");
        legacyDeletes.push({
          clinicName,
          docId: doctorDoc.id,
          display,
          matched: liveNames.has(normalizeName(display)),
          ref: doctorDoc.ref,
        });
        continue;
      }

      // ── Phase 1: specialty inference ──
      if (doc.specialty) continue;

      const title = String(doc.title || "");
      let doctorName = String(doc.doctorName);
      let specialty: string | null = null;
      let reason = "";
      const patch: Record<string, any> = {};

      const professionHit = PROFESSION_PREFIXES.find(([re]) => re.test(doctorName));
      if (professionHit) {
        specialty = professionHit[1];
        doctorName = doctorName.replace(professionHit[0], "").trim();
        patch.doctorName = doctorName;
        reason = "name_prefix";
      } else if (/\bdt\.?\b/i.test(title)) {
        specialty = "Diş Hekimi";
        reason = "title_dt";
      } else if (/\bdyt\.?\b/i.test(title)) {
        specialty = "Diyetisyen";
        reason = "title_dyt";
      } else if (clinicSpecialty) {
        specialty = clinicSpecialty;
        reason = clinicSpecialty === "Göz Hastalıkları" ? "clinic_eye" : "clinic_dental";
      }

      if (!specialty) continue;
      patch.specialty = specialty;

      specialtyPlans.push({
        clinicName,
        doctorId: doctorDoc.id,
        before: String(doc.doctorName),
        patch,
        reason,
      });
      reasonCount.set(reason, (reasonCount.get(reason) || 0) + 1);

      if (isApply) {
        await doctorDoc.ref.set(
          { ...patch, updatedAt: FieldValue.serverTimestamp() },
          { merge: true }
        );
      }
    }
  }

  // ── Phase 1 report ──
  console.log("── PHASE 1: SPECIALTY INFERENCE ──");
  const bySpecialty = new Map<string, number>();
  specialtyPlans.forEach((p) =>
    bySpecialty.set(p.patch.specialty, (bySpecialty.get(p.patch.specialty) || 0) + 1)
  );
  Array.from(bySpecialty.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([s, c]) => console.log(`  ${String(c).padStart(4)}  ${s}`));
  console.log("  by signal:");
  Array.from(reasonCount.entries())
    .sort((a, b) => b[1] - a[1])
    .forEach(([r, c]) => console.log(`    ${String(c).padStart(4)}  ${r}`));
  const renamed = specialtyPlans.filter((p) => p.patch.doctorName);
  if (renamed.length) {
    console.log("  doctorName cleaned (profession prefix removed):");
    renamed.forEach((p) =>
      console.log(`    - "${p.before}" → "${p.patch.doctorName}" (${p.patch.specialty})`)
    );
  }
  console.log(`  total ${isApply ? "updated" : "to update"}: ${specialtyPlans.length}`);

  // ── Phase 2 ──
  console.log("\n── PHASE 2: LEGACY RECORD CLEANUP ──");
  const unmatched = legacyDeletes.filter((l) => !l.matched);
  console.log(`  legacy records found: ${legacyDeletes.length}`);
  console.log(`  with a live replacement: ${legacyDeletes.length - unmatched.length}`);
  console.log(`  WITHOUT a live match:   ${unmatched.length}`);
  if (unmatched.length) {
    unmatched.forEach((l) => console.log(`    ! ${l.clinicName} — ${l.display}`));
  }

  if (isApply) {
    let deleted = 0;
    for (const l of legacyDeletes) {
      await l.ref.delete();
      deleted += 1;
    }
    console.log(`  deleted: ${deleted}`);
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Specialties ${isApply ? "filled" : "to fill"}:   ${specialtyPlans.length}`);
  console.log(
    `Legacy records ${isApply ? "deleted" : "to delete"}: ${legacyDeletes.length}`
  );
  if (!isApply) console.log("\nDry-run only. Re-run with --apply to write changes.");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
