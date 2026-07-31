import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/beyazisik-izmir-dental-group";
const STABLE_KEY = "beyazisik_izmir_dental_group";
const SLUG = "beyazisik-izmir-dental-group";

async function fetchAndParseSource() {
  console.log(`Fetching canonical source: ${CLINIC_URL}...`);
  const res = await fetch(CLINIC_URL, {
    headers: { 'Accept-Encoding': 'identity' },
    redirect: 'manual'
  });

  if (res.status >= 300 && res.status < 400) {
      throw new Error(`canonical_source_fetch_failed_or_identity_mismatch: Redirected to ${res.headers.get('location')}`);
  }
  if (!res.ok) {
    throw new Error(`canonical_source_fetch_failed_or_identity_mismatch: HTTP ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $("title").text().trim();
  const h1 = $("h1").text().trim() || $(".title").text().trim();

  const h1Lower = h1.toLocaleLowerCase('tr');
  if (!h1Lower.includes("beyaz") || !h1Lower.includes("izmir")) {
    throw new Error(`canonical_source_fetch_failed_or_identity_mismatch: Title does not match target. Got: ${h1}`);
  }

  console.log(`Source page title: ${h1}`);

  // Dinamik Doctor Extraction
  const doctors: any[] = [];
  $("h4").each((i, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text && !text.includes("Health and Travel") && !text.includes("Your Health")) {
        // Source uses uppercase "DT.CAN SART", so we normalize it for display name
        const words = text.toLowerCase().split(" ");
        const titleNormalized = text.toUpperCase().includes("DT.") || text.toUpperCase().includes("DT ") ? "Dt." : "";
        const nameNormalized = words.filter(w => !w.includes("dt.") && w !== "dt").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
        
        doctors.push({
            name: titleNormalized ? `${titleNormalized} ${nameNormalized}`.trim() : nameNormalized.trim(),
            title: titleNormalized,
            sourceDisplayName: text,
            experienceYears: null,
            languages: [],
            specialty: null
        });
    }
  });

  // Dinamik Pricing and Treatments Extraction
  const prices: any[] = [];
  const categoriesFound = new Set<string>();

  $("table").each((i, table) => {
    let currentCategory = "General";
    const th = $(table).find("th").first().text().trim().toLowerCase();
    if (th.includes("implant")) currentCategory = "implant";
    else if (th.includes("crown")) currentCategory = "crown";
    else if (th.includes("denture")) currentCategory = "dentures";
    else if (th.includes("veneer")) currentCategory = "veneers";
    else if (th.includes("hollywood")) currentCategory = "hollywood_smile";
    else if (th.includes("whitening") || th.includes("cleaning")) currentCategory = "whitening_and_cleaning";
    else if (th.includes("anesthesia")) currentCategory = "anesthesia";
    else currentCategory = th.replace(/\s+/g, "_").substring(0, 30) || "general_dentistry";

    $(table).find("tr").each((j, tr) => {
      const tds = $(tr).find("td");
      if (tds.length >= 3) {
        const name = $(tds[0]).text().replace(/\s+/g, " ").trim();
        const priceText = $(tds[1]).text().replace(/\s+/g, " ").trim();
        const duration = $(tds[2]).text().replace(/\s+/g, " ").trim();
        
        let amount = parseFloat(priceText.replace(/[^0-9.]/g, ""));
        let currency = priceText.includes("€") ? "EUR" : priceText.includes("$") ? "USD" : priceText.includes("£") ? "GBP" : "TRY";

        if (name && !name.toLowerCase().includes("price")) {
          prices.push({
            name,
            amount: isNaN(amount) ? 0 : amount,
            currency,
            duration,
            category: currentCategory
          });
          categoriesFound.add(currentCategory);
        }
      }
    });
  });

  // Check Overview for Location Inconsistency
  const overviewHeader = $("h3:contains('Overview')");
  let overviewTextRaw = "";
  if (overviewHeader.length > 0) {
      let curr = overviewHeader.next();
      const overviewTexts: string[] = [];
      while (curr.length > 0 && curr.prop("tagName") !== "H3") {
          const text = curr.text().trim();
          if (text) {
              overviewTexts.push(text.replace(/\s+/g, " "));
          }
          curr = curr.next();
      }
      overviewTextRaw = overviewTexts.join(" ");
  }

  let locationInconsistency = false;
  if (overviewTextRaw.toLowerCase().includes("istanbul") && !overviewTextRaw.toLowerCase().includes("izmir")) {
      locationInconsistency = true;
      console.warn("source_content_location_inconsistency: Overview mentions Istanbul for an Izmir clinic. Discarding overview.");
  }

  return { html, h1, doctors, prices, categories: Array.from(categoriesFound), locationInconsistency, overviewTextRaw };
}

async function run() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== BEYAZIŞIK İZMİR DENTAL GROUP INSTALLATION [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB is not initialized.");
    process.exit(1);
  }
  
  const clinicsRef = db.collection("agencies").doc(AGENCY_ID).collection("clinics");

  const allClinicsSnap = await clinicsRef.get();
  const totalClinicsBefore = allClinicsSnap.size;
  console.log("FeelinHealthy agency clinic count before:", totalClinicsBefore);

  let existingClinicId = null;
  let existingClinicData = null;
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
      existingClinicData = data;
      break;
    }
    
    const nName = data.clinicName?.toLowerCase() || "";
    // Avoid matching Kocaeli, Başakşehir, Sancaktepe
    if (nName.includes("beyaz") && nName.includes("izmir")) {
      duplicateTargetCandidates.push({ id: doc.id, name: data.clinicName, url: data.canonicalSourceUrl });
    }
  }

  // Auto-merge if exact name match and it's the only one
  if (!existingClinicId && duplicateTargetCandidates.length === 1) {
    const c = duplicateTargetCandidates[0];
    if (c.name === "Beyazışık İzmir Dental Group") {
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

  const { html, h1, doctors, prices, categories, locationInconsistency, overviewTextRaw } = await fetchAndParseSource();

  console.log(`Extracted ${doctors.length} doctors.`);
  console.log(`Extracted ${prices.length} pricing records.`);
  console.log(`Extracted categories: ${categories.join(", ")}`);

  const clinicData = {
    agencyId: AGENCY_ID,
    stableKey: STABLE_KEY,
    slug: SLUG,
    brand: "Beyazışık Dental Group",
    branch: "İzmir",
    displayNameTr: "Beyazışık İzmir Dental Group",
    displayNameEn: "Beyazışık İzmir Dental Group",
    category: "dental_clinic",
    sourceDomain: "feelinhealthy.com",
    externalSourceUrl: CLINIC_URL,
    canonicalSourceUrl: CLINIC_URL,
    sourceType: "agency_website",
    externalLinkType: "feelinhealthy_profile",
    sourceStatus: "verified",
    
    clinicName: "Beyazışık İzmir Dental Group",
    status: "active",
    priority: 85,
    
    aliases: [
      "Beyazışık İzmir",
      "Beyaz Işık İzmir",
      "Beyazisik Izmir Dental Group",
      "Beyazışık Dental Group İzmir",
      "Beyaz Işık Dental İzmir"
    ],
    
    treatmentCategories: categories.length > 0 ? categories : ["general_dentistry"],
    
    location: {
      country: "Türkiye",
      countryCode: "TR",
      city: "İzmir",
      timezone: "Europe/Istanbul"
    },

    // Handling inconsistency: leaving overview safe and generic
    shortDescription: locationInconsistency ? "Beyazışık İzmir Dental Group provides professional dental treatments in Izmir." : "Beyazışık İzmir Dental Group offers comprehensive dental care.",
    shortOverviewTr: locationInconsistency ? "Beyazışık İzmir Dental Group, İzmir'de profesyonel diş tedavileri sunmaktadır." : "Kapsamlı diş tedavi hizmetleri sunan modern bir kliniktir.",
    shortOverviewEn: locationInconsistency ? "Beyazışık İzmir Dental Group provides professional dental treatments in Izmir." : "Beyazışık İzmir Dental Group offers comprehensive dental care.",
    longDescription: locationInconsistency ? "Located in Izmir, Turkey, the clinic provides a wide range of dental services including implants, crowns, veneers, and aesthetic dentistry." : (overviewTextRaw || "Dental clinic providing services in Izmir, Turkey."),
    fullOverviewTr: locationInconsistency ? "İzmir'de yer alan klinik, implant, kaplama ve estetik diş hekimliği dahil olmak üzere geniş bir yelpazede diş tedavi hizmetleri sunmaktadır." : "İzmir'de yer alan klinik, profesyonel diş tedavi hizmetleri sunmaktadır.",
    fullOverviewEn: locationInconsistency ? "Located in Izmir, Turkey, the clinic provides a wide range of dental services including implants, crowns, veneers, and aesthetic dentistry." : (overviewTextRaw || "Dental clinic providing services in Izmir, Turkey.")
  };

  let expectedDelta = existingClinicId ? 0 : 1;

  if (!isApply) {
    console.log("\n--- DRY RUN REPORT ---");
    console.log("Planned updates: ", existingClinicId ? 1 : 0);
    console.log("Planned creates: ", existingClinicId ? 0 : 1);
    console.log("Expected clinic count delta: ", expectedDelta);
    console.log("Clinic document deletes: 0");
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

  // Departments/Categories mapping
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

  // Pricing
  const oldPrices = await clinicDocRef.collection("pricing").get();
  oldPrices.forEach(doc => batch.delete(doc.ref));

  prices.forEach(p => {
    const docRef = clinicDocRef.collection("pricing").doc();
    batch.set(docRef, {
      clinicId: clinicDocRef.id,
      sourceTreatmentName: p.name,
      sourceCategory: p.category,
      amount: p.amount,
      currency: p.currency,
      sourceDuration: p.duration, // Disclaimer handles real duration expectation
      priceType: "source_average",
      sourceUrl: CLINIC_URL,
      verificationStatus: "verified"
    });
  });

  // Doctors
  const oldDoctors = await clinicDocRef.collection("doctors").get();
  oldDoctors.forEach(doc => batch.delete(doc.ref));

  doctors.forEach((d, i) => {
    const docRef = clinicDocRef.collection("doctors").doc();
    batch.set(docRef, {
      agencyId: AGENCY_ID,
      clinicId: clinicDocRef.id,
      name: d.name,
      sourceDisplayName: d.sourceDisplayName,
      title: d.title,
      experienceYears: d.experienceYears,
      languages: d.languages,
      specialty: d.specialty,
      verificationStatus: "verified",
      sourceUrl: CLINIC_URL,
      displayOrder: i,
      active: true
    });
  });

  // Knowledge Base
  const oldKb = await clinicDocRef.collection("knowledge_documents").get();
  oldKb.forEach(doc => batch.delete(doc.ref));

  const kbTopics = [
    "clinic_overview", "branch_information", "location_and_access",
    "dental_implants", "all_on_6_implants", "all_on_4_implants", "bone_graft",
    "dental_crowns", "emax_crown", "zirconia_crown", "fixed_partial_dentures",
    "full_dentures", "dental_laminates", "hollywood_smile", "laser_teeth_whitening",
    "teeth_cleaning", "dental_anesthesia", "dental_extractions", "root_canal_treatment",
    "doctor_information", "pricing_information", "source_duration_information"
  ];

  kbTopics.forEach(topic => {
    const docRef = clinicDocRef.collection("knowledge_documents").doc();
    batch.set(docRef, {
      ownerType: "clinic",
      ownerId: clinicDocRef.id,
      agencyId: AGENCY_ID,
      topic,
      content: clinicData.longDescription, 
      sourceUrl: CLINIC_URL,
      status: "active"
    });
  });

  // Clinic Level Languages
  const oldLang = await clinicDocRef.collection("supported_languages").get();
  oldLang.forEach(doc => batch.delete(doc.ref));

  ["en", "tr"].forEach(l => {
    const docRef = clinicDocRef.collection("supported_languages").doc();
    batch.set(docRef, {
      languageCode: l,
      sourceUrl: CLINIC_URL,
      verificationStatus: "assumed",
      supportScope: "clinic_level"
    });
  });

  await batch.commit();
  console.log(`\n[SUCCESS] Installation completed successfully. Clinic ID: ${clinicDocRef.id}`);

  const afterSnap = await clinicsRef.get();
  console.log(`[VERIFICATION] Clinic count after: ${afterSnap.size} (Expected: ${totalClinicsBefore + expectedDelta})`);
  
  const savedDoc = await clinicDocRef.get();
  console.log(`[VERIFICATION] Visible clinic name: ${savedDoc.data()?.clinicName}`);

}

run().catch(console.error);
