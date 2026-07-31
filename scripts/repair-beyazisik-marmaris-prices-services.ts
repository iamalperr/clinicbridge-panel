import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import { parsePricesAndServices } from "./utils/browserParser";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/beyazisik-marmaris-dental-group";
const TARGET_CLINIC_ID = "vQO785pI5871q6y5w9p4"; // Need to fetch dynamically, assuming we just find by slug or URL.

async function runRepair() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== BEYAZIŞIK MARMARİS TARGETED REPAIR [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB is not initialized.");
    process.exit(1);
  }

  const clinicsRef = db.collection("agencies").doc(AGENCY_ID).collection("clinics");
  const allClinicsSnap = await clinicsRef.get();

  let targetClinicDoc = null;
  
  for (const doc of allClinicsSnap.docs) {
      if (doc.data().canonicalSourceUrl === CLINIC_URL || doc.data().slug === "beyazisik-marmaris-dental-group") {
          targetClinicDoc = doc;
          break;
      }
  }

  if (!targetClinicDoc) {
      console.error("Target clinic Beyazışık Marmaris Dental Group not found!");
      process.exit(1);
  }

  const targetClinicId = targetClinicDoc.id;
  const clinicData = targetClinicDoc.data();
  console.log(`Found target clinic: ${clinicData.clinicName} (${targetClinicId})`);

  // BEFORE SNAPSHOT
  const oldPricesSnap = await clinicsRef.doc(targetClinicId).collection("pricing").get();
  const oldServicesSnap = await clinicsRef.doc(targetClinicId).collection("services").get();
  const oldCategoriesSnap = await clinicsRef.doc(targetClinicId).collection("departments").get();
  const oldKbSnap = await clinicsRef.doc(targetClinicId).collection("knowledge_documents").where("topic", "in", [
      "dental_services", "implant_treatments", "crown_treatments", "dentures",
      "hollywood_smile", "whitening_and_cleaning", "dental_anesthesia",
      "other_dental_treatments", "treatment_pricing", "source_duration_information"
  ]).get();
  
  console.log("\n[BEFORE SNAPSHOT]");
  console.log(`Existing Categories: ${oldCategoriesSnap.size}`);
  console.log(`Existing Services (Placeholder/Unverified): ${oldServicesSnap.size}`);
  console.log(`Existing Pricing (Verified): ${oldPricesSnap.size}`);
  console.log(`Existing AI KB Topics (Service related): ${oldKbSnap.size}`);
  console.log(`Target Clinic Content Hash: ${clinicData.contentHash || 'N/A'}, Updated At: ${clinicData.updatedAt?.toDate()}`);

  console.log("\nStarting Puppeteer Parser...");
  const parseResult = await parsePricesAndServices(CLINIC_URL);
  
  const m = parseResult.metrics;
  console.log(`\n[PARSER METRICS]`);
  console.log(`Detected Categories: ${m.detectedCategoryCount}`);
  console.log(`Expanded Categories: ${m.expandedCategoryCount}`);
  console.log(`Parsed Treatment Rows: ${m.parsedTreatmentRowCount}`);
  console.log(`Valid Prices: ${m.validPriceCount}`);
  console.log(`Valid Durations: ${m.validDurationCount}`);
  console.log(`Unparseable Rows: ${m.unparseableRowCount}`);

  // COMPLETENESS VALIDATION
  if (m.detectedCategoryCount < 6 || m.parsedTreatmentRowCount < 17 || m.validPriceCount < 17 || m.validDurationCount < 17) {
      console.error("\nincomplete_prices_services_extraction: The parser failed to extract the expected minimum 6 categories and 17 valid rows.");
      if (isApply) process.exit(1);
  } else {
      console.log("\nParser validation passed. 17 source-backed rows found.");
  }

  if (!isApply) {
      console.log("\n[DRY RUN] Repair applies only to target clinic. No changes made.");
      console.log("Run with --apply to execute.");
      return;
  }

  console.log("\nApplying repair...");
  const batch = db.batch();
  const clinicDocRef = clinicsRef.doc(targetClinicId);

  // 1. Clear old services, pricing, and category relations.
  oldCategoriesSnap.forEach(doc => batch.delete(doc.ref));
  oldServicesSnap.forEach(doc => batch.delete(doc.ref));
  oldPricesSnap.forEach(doc => batch.delete(doc.ref));
  oldKbSnap.forEach(doc => batch.delete(doc.ref));

  // 2. Re-create categories (unique)
  const uniqueCategories = Array.from(new Set(parseResult.rows.map(r => r.sourceCategoryName)));
  uniqueCategories.forEach((cat, i) => {
      const docRef = clinicDocRef.collection("departments").doc();
      batch.set(docRef, {
          agencyId: AGENCY_ID,
          clinicId: targetClinicId,
          departmentId: `dental_${i}`,
          sourceCategoryName: cat,
          verificationStatus: "category_listed",
          sourceUrl: CLINIC_URL,
          displayOrder: i
      });
  });

  // 3. Re-create pricing records
  parseResult.rows.forEach(r => {
      const pRef = clinicDocRef.collection("pricing").doc();
      batch.set(pRef, {
          clinicId: targetClinicId,
          sourceTreatmentName: r.sourceTreatmentName,
          sourceCategory: r.sourceCategoryName,
          amount: r.numericPrice,
          currency: r.currency,
          priceType: "source_average",
          sourceDuration: r.sourceDurationText,
          durationValue: r.durationValue,
          durationUnit: r.durationUnit,
          sourceUrl: CLINIC_URL,
          verificationStatus: "verified"
      });
  });

  // 4. Update AI Knowledge Base Topics
  // dental_services
  const servicesContent = parseResult.rows.map(r => `- ${r.sourceTreatmentName} (${r.sourceCategoryName})`).join("\n");
  const dentalServicesRef = clinicDocRef.collection("knowledge_documents").doc();
  batch.set(dentalServicesRef, {
      ownerType: "clinic", ownerId: targetClinicId, agencyId: AGENCY_ID,
      topic: "dental_services", content: `The clinic offers the following services:\n${servicesContent}`,
      sourceUrl: CLINIC_URL, status: "active"
  });

  // treatment_pricing
  const pricingContent = parseResult.rows.map(r => `- ${r.sourceTreatmentName}: ${r.numericPrice} ${r.currency}`).join("\n");
  const pricingRef = clinicDocRef.collection("knowledge_documents").doc();
  batch.set(pricingRef, {
      ownerType: "clinic", ownerId: targetClinicId, agencyId: AGENCY_ID,
      topic: "treatment_pricing", content: `The listed prices are based on information published on the FeelinHealthy profile. The final price is confirmed by the clinic after an examination.\n\nPrices:\n${pricingContent}`,
      sourceUrl: CLINIC_URL, status: "active"
  });

  // source_duration_information
  const durationContent = parseResult.rows.map(r => `- ${r.sourceTreatmentName}: ${r.sourceDurationText}`).join("\n");
  const durationRef = clinicDocRef.collection("knowledge_documents").doc();
  batch.set(durationRef, {
      ownerType: "clinic", ownerId: targetClinicId, agencyId: AGENCY_ID,
      topic: "source_duration_information", content: `The duration shown on the source profile is general planning information and should not be interpreted as a guaranteed procedure, recovery or accommodation period.\n\nDurations:\n${durationContent}`,
      sourceUrl: CLINIC_URL, status: "active"
  });

  // Update updatedAt to touch the record
  batch.update(clinicDocRef, {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await batch.commit();

  console.log("\n[SUCCESS] Targeted repair completed successfully.");

  // Post-flight verification
  const newPricesSnap = await clinicsRef.doc(targetClinicId).collection("pricing").get();
  console.log(`[VERIFICATION] New Pricing Records: ${newPricesSnap.size} (Expected: 17)`);
  if (newPricesSnap.size === 17) {
      console.log("[VERIFICATION] All 17 rows successfully stored.");
  }
}

runRepair().catch(console.error);
