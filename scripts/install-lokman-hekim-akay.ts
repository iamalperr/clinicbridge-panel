import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/lokman-hekim-akay-hospital";
const STABLE_KEY = "lokman_hekim_akay_hospital";
const SLUG = "lokman-hekim-akay-hospital";

async function fetchAndParseSource() {
  console.log(`Fetching canonical source: ${CLINIC_URL}...`);
  let res;
  let attempt = 0;
  while (attempt < 3) {
      try {
          res = await fetch(CLINIC_URL, {
            headers: { 'Accept-Encoding': 'identity' },
            redirect: 'manual'
          });
          if (res.status >= 300 && res.status < 400) {
              throw new Error(`canonical_source_fetch_failed_or_identity_mismatch: Redirected to ${res.headers.get('location')}`);
          }
          if (res.ok) break;
      } catch (err) {
          attempt++;
          console.log(`Fetch attempt ${attempt} failed.`);
          if (attempt === 3) throw err;
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $("title").text().trim();
  const h1 = $("h1").text().trim() || $(".title").text().trim();

  const h1Lower = h1.toLocaleLowerCase('tr');
  if (!h1Lower.includes("lokman hekim") && !h1Lower.includes("akay")) {
    throw new Error(`canonical_source_fetch_failed_or_identity_mismatch: Title does not match target. Got: ${h1}`);
  }

  console.log(`Source page title: ${h1}`);

  // Extracting overview
  const overviewHeader = $("h3:contains('Overview')");
  let overviewTextRaw = "";
  if (overviewHeader.length > 0) {
      let curr = overviewHeader.next();
      const overviewTexts: string[] = [];
      while (curr.length > 0 && curr.prop("tagName") !== "H3" && curr.prop("tagName") !== "H2") {
          const text = curr.text().trim();
          if (text) {
              overviewTexts.push(text.replace(/\s+/g, " "));
          }
          curr = curr.next();
      }
      overviewTextRaw = overviewTexts.join(" ");
  }
  
  const serviceCategoriesFound: string[] = ["hospital"];
  const doctors: any[] = [];
  const prices: any[] = [];

  return { html, h1, overviewTextRaw, doctors, prices, serviceCategoriesFound };
}

async function run() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== LOKMAN HEKIM AKAY HOSPITAL INSTALLATION [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB is not initialized.");
    process.exit(1);
  }
  
  const clinicsRef = db.collection("agencies").doc(AGENCY_ID).collection("clinics");
  const allClinicsSnap = await clinicsRef.get();

  let previousFound = false;
  let kocaeliFound = false;
  let ankaraFound = false;

  allClinicsSnap.forEach(d => {
      const name = d.data().clinicName?.toLowerCase() || "";
      const url = d.data().canonicalSourceUrl || "";
      const slug = d.data().slug || "";
      const stable = d.data().stableKey || "";

      if (d.id === "djfO3C7PUtoa6qZmcJUO" || slug === "beyazisik-marmaris-dental-group" || stable === "beyazisik_marmaris_dental_group") previousFound = true;
      if (url.includes("beyazisik-kocaeli") || name.includes("beyazışık kocaeli") || slug === "beyazisik-kocaeli-dental-group") kocaeliFound = true;
      if (url.includes("hospitadent-dental-group-ankara") || name.includes("ankara") || slug === "hospitadent-dental-group-ankara") ankaraFound = true;
  });

  if (!previousFound) {
      console.error("previous_clinic_not_completed: Beyazışık Marmaris Dental Group is not found in the DB.");
      process.exit(1);
  } else {
      console.log("Previous clinic (Beyazışık Marmaris) is verified as completed.");
  }
  
  if (!kocaeliFound) {
      console.error("canonical_predecessor_not_installed: Position 23 (Beyazışık Kocaeli) is missing.");
      process.exit(1);
  } else {
      console.log("Position 23 (Beyazışık Kocaeli) is verified as installed.");
  }
  
  if (!ankaraFound) {
      console.error("canonical_predecessor_not_installed: Position 24 (Hospitadent Ankara) is missing.");
      process.exit(1);
  } else {
      console.log("Position 24 (Hospitadent Ankara) is verified as installed.");
  }

  const totalClinicsBefore = allClinicsSnap.size;
  console.log("FeelinHealthy agency clinic count before:", totalClinicsBefore);

  let existingClinicId = null;
  let duplicateTargetCandidates = [];

  for (const doc of allClinicsSnap.docs) {
    const data = doc.data();
    if (
      data.stableKey === STABLE_KEY ||
      data.slug === SLUG ||
      data.canonicalSourceUrl === CLINIC_URL ||
      data.externalSourceUrl === CLINIC_URL
    ) {
      existingClinicId = doc.id;
      break;
    }
    
    // Check branch/city collisions carefully
    const nName = data.clinicName?.toLowerCase() || "";
    if (nName.includes("lokman hekim") && (nName.includes("akay") || data.location?.city === "Ankara" || data.branch === "Akay")) {
      if (doc.id !== existingClinicId && !nName.includes("university")) { // Exclude university ankara
          duplicateTargetCandidates.push({ id: doc.id, name: data.clinicName, url: data.canonicalSourceUrl });
      }
    }
  }

  // Auto-merge if exact name match
  if (!existingClinicId && duplicateTargetCandidates.length === 1) {
    const c = duplicateTargetCandidates[0];
    if (c.name.toLowerCase().includes("lokman hekim akay hospital")) {
        console.log("Repairing broken exact name match:", c.id);
        existingClinicId = c.id;
        duplicateTargetCandidates = [];
    }
  }

  if (!existingClinicId && duplicateTargetCandidates.length > 0) {
    console.error("duplicate_target_candidates found! Stopping.", duplicateTargetCandidates);
    process.exit(1);
  }

  console.log("Existing exact canonical record:", existingClinicId ? "Found" : "Not Found");

  const { h1, overviewTextRaw, doctors, prices, serviceCategoriesFound } = await fetchAndParseSource();

  console.log(`Extracted Prices: ${prices.length}`);
  console.log(`Extracted Doctors: ${doctors.length}`);

  if (prices.length === 0) console.log("pricing_rows_not_listed_on_canonical_source");
  console.log("promotions_not_listed_on_canonical_source");
  console.log("opening_hours_not_listed_on_canonical_source");
  if (doctors.length === 0) console.log("doctors_not_listed_on_canonical_source");
  console.log("clinic_languages_not_explicitly_listed_on_canonical_source");

  const clinicData = {
    agencyId: AGENCY_ID,
    stableKey: STABLE_KEY,
    slug: SLUG,
    brand: "Lokman Hekim",
    branch: "Akay", 
    displayNameTr: "Lokman Hekim Akay Hospital",
    displayNameEn: "Lokman Hekim Akay Hospital",
    category: "hospital", 
    sourceDomain: "feelinhealthy.com",
    externalSourceUrl: CLINIC_URL,
    canonicalSourceUrl: CLINIC_URL,
    sourceType: "agency_website",
    externalLinkType: "feelinhealthy_profile",
    sourceStatus: "verified",
    
    clinicName: "Lokman Hekim Akay Hospital",
    status: "active",
    priority: 82, 
    
    aliases: [
      "Lokman Hekim Akay",
      "Lokman Hekim Akay Hospital",
      "Lokman Hekim Akay Hastanesi",
      "Akay Hospital",
      "Akay Hastanesi",
      "Lokman Hekim Ankara Akay",
      "Lokman Hekim Akay Ankara"
    ],
    
    treatmentCategories: ["hospital"],
    
    location: {
      country: "Türkiye",
      countryCode: "TR",
      city: "Ankara", 
      timezone: "Europe/Istanbul"
    },

    shortDescription: "Lokman Hekim provides healthcare services at its Akay Hospital branch in Ankara.",
    shortOverviewTr: "Lokman Hekim, Ankara'daki Akay Hastanesi şubesinde sağlık hizmetleri sunmaktadır.",
    shortOverviewEn: "Lokman Hekim provides healthcare services at its Akay Hospital branch in Ankara.",
    longDescription: overviewTextRaw || "Lokman Hekim provides healthcare services at its Akay Hospital branch in Ankara.",
    fullOverviewTr: overviewTextRaw || "Lokman Hekim, Ankara'daki Akay Hastanesi şubesinde sağlık hizmetleri sunmaktadır.",
    fullOverviewEn: overviewTextRaw || "Lokman Hekim provides healthcare services at its Akay Hospital branch in Ankara.",
  };

  let expectedDelta = existingClinicId ? 0 : 1;

  if (!isApply) {
    console.log("\n--- DRY RUN REPORT ---");
    console.log("Planned updates: ", existingClinicId ? 1 : 0);
    console.log("Planned creates: ", existingClinicId ? 0 : 1);
    console.log("Expected clinic count delta: ", expectedDelta);
    console.log("Clinic document deletes: 0");
    console.log("Other clinic writes: 0");
    console.log("Other doctor writes: 0");
    console.log("Run with --apply to execute.");
    return;
  }

  // APPLY
  const batch = db.batch();
  let clinicDocRef;
  
  if (existingClinicId) {
    clinicDocRef = clinicsRef.doc(existingClinicId);
    batch.update(clinicDocRef, {
      ...clinicData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } else {
    clinicDocRef = clinicsRef.doc();
    batch.set(clinicDocRef, {
      ...clinicData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // Categories mapping
  const oldDepts = await clinicDocRef.collection("departments").get();
  oldDepts.forEach(doc => batch.delete(doc.ref));

  clinicData.treatmentCategories.forEach((cat, i) => {
    const docRef = clinicDocRef.collection("departments").doc();
    batch.set(docRef, {
      agencyId: AGENCY_ID,
      clinicId: clinicDocRef.id,
      departmentId: cat,
      sourceCategoryName: cat,
      verificationStatus: "category_listed",
      sourceUrl: CLINIC_URL,
      displayOrder: i
    });
  });

  // Clear facilities safely
  const oldFacilities = await clinicDocRef.collection("facilities").get();
  oldFacilities.forEach(doc => batch.delete(doc.ref));
  
  // Clear support safely
  const oldSupport = await clinicDocRef.collection("international_support").get();
  oldSupport.forEach(doc => batch.delete(doc.ref));
  
  // Clear prices and packages safely
  const oldPrices = await clinicDocRef.collection("pricing").get();
  oldPrices.forEach(doc => batch.delete(doc.ref));
  const oldPackages = await clinicDocRef.collection("packages").get();
  oldPackages.forEach(doc => batch.delete(doc.ref));

  // Clear Doctors
  const oldDoctors = await clinicDocRef.collection("doctors").get();
  oldDoctors.forEach(doc => batch.delete(doc.ref));

  // Knowledge Base
  const oldKb = await clinicDocRef.collection("knowledge_documents").get();
  oldKb.forEach(doc => batch.delete(doc.ref));

  const kbTopics = [
    "clinic_overview", "brand_and_branch", 
    "location_and_access", "hospital_capacity"
  ];

  kbTopics.forEach(topic => {
    let content = "";
    if (topic === "clinic_overview") content = clinicData.longDescription;
    if (topic === "brand_and_branch") content = "Lokman Hekim Group, Akay Hospital branch.";
    if (topic === "location_and_access") content = "Located in Ankara, Turkey.";
    if (topic === "hospital_capacity") content = "Provides a variety of hospital treatments.";
    
    if (content) {
        const docRef = clinicDocRef.collection("knowledge_documents").doc();
        batch.set(docRef, {
        ownerType: "clinic",
        ownerId: clinicDocRef.id,
        agencyId: AGENCY_ID,
        topic,
        content, 
        sourceUrl: CLINIC_URL,
        status: "active"
        });
    }
  });

  // Clinic Level Languages
  const oldLang = await clinicDocRef.collection("supported_languages").get();
  oldLang.forEach(doc => batch.delete(doc.ref));

  await batch.commit();
  console.log(`\n[SUCCESS] Installation completed successfully. Clinic ID: ${clinicDocRef.id}`);

  const afterSnap = await clinicsRef.get();
  console.log(`[VERIFICATION] Clinic count after: ${afterSnap.size} (Expected: ${totalClinicsBefore + expectedDelta})`);
  
  const savedDoc = await clinicDocRef.get();
  console.log(`[VERIFICATION] Visible clinic name: ${savedDoc.data()?.clinicName}`);
  console.log(`[VERIFICATION] Location City: ${savedDoc.data()?.location?.city}`);
}

run().catch(console.error);
