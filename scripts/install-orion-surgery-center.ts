import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/orion-surgery-center";
const STABLE_KEY = "orion_surgery_center";
const SLUG = "orion-surgery-center";

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

  if (!h1.toLowerCase().includes("orion") || !h1.toLowerCase().includes("surgery")) {
    throw new Error(`canonical_source_fetch_failed_or_identity_mismatch: Title does not match target. Got: ${h1}`);
  }

  console.log(`Source page title: ${h1}`);

  // Dinamik Doctor Extraction
  const doctors: any[] = [];
  $("h4").each((i, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text && !text.includes("Health and Travel") && !text.includes("Your Health")) {
        doctors.push({
            name: text,
            title: text.includes("Prof.") ? "Prof. Dr." : text.includes("Assoc. Prof.") ? "Assoc. Prof. Dr." : text.includes("Op. Dr.") ? "Op. Dr." : text.includes("Dr.") ? "Dr." : "",
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
    else if (th.includes("hair transplant")) currentCategory = "hair_transplant";
    else if (th.includes("rhinoplasty")) currentCategory = "rhinoplasty";
    else if (th.includes("breast")) currentCategory = "breast_surgery";
    else if (th.includes("liposuction")) currentCategory = "liposuction";
    else if (th.includes("tummy")) currentCategory = "abdominoplasty";
    else if (th.includes("face") || th.includes("neck")) currentCategory = "facial_surgery";
    else currentCategory = th.replace(/\s+/g, "_").substring(0, 30) || "general_surgery";

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

  return { html, h1, doctors, prices, categories: Array.from(categoriesFound) };
}

async function run() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== ORION SURGERY CENTER INSTALLATION [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

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
    if (nName.includes("orion") && nName.includes("surgery")) {
      duplicateTargetCandidates.push({ id: doc.id, name: data.clinicName, url: data.canonicalSourceUrl });
    }
  }

  // Auto-merge if exact name match and it's the only one
  if (!existingClinicId && duplicateTargetCandidates.length === 1) {
    const c = duplicateTargetCandidates[0];
    if (c.name === "Orion Surgery Center") {
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

  const { html, h1, doctors, prices, categories } = await fetchAndParseSource();

  console.log(`Extracted ${doctors.length} doctors.`);
  console.log(`Extracted ${prices.length} pricing records.`);
  console.log(`Extracted categories: ${categories.join(", ")}`);

  const clinicData = {
    agencyId: AGENCY_ID,
    stableKey: STABLE_KEY,
    slug: SLUG,
    brand: "Orion Surgery Center",
    branch: "İstanbul", // Or leave empty if source doesn't explicitly name branch, but title says Istanbul
    displayNameTr: "Orion Surgery Center",
    displayNameEn: "Orion Surgery Center",
    category: "surgery_center", // user request
    sourceDomain: "feelinhealthy.com",
    externalSourceUrl: CLINIC_URL,
    canonicalSourceUrl: CLINIC_URL,
    sourceType: "agency_website",
    externalLinkType: "feelinhealthy_profile",
    sourceStatus: "verified",
    
    clinicName: "Orion Surgery Center",
    status: "active",
    priority: 88,
    
    aliases: [
      "Orion Surgical Center",
      "Orion Surgery Centre",
      "Orion Cerrahi Merkezi",
      "Orion Medical Center"
    ],
    
    treatmentCategories: [...categories, "plastic_surgery", "aesthetic_surgery", "hair_transplant", "dental_aesthetics", "iv_therapy"],
    
    location: {
      country: "Türkiye",
      countryCode: "TR",
      city: "İstanbul", // Title says Orion Surgery Center Istanbul
      timezone: "Europe/Istanbul"
    },

    shortDescription: "Plastic, Reconstructive, and Aesthetic Surgical procedures performed at world standards.",
    shortOverviewTr: "Dünya standartlarında Plastik, Rekonstrüktif ve Estetik Cerrahi prosedürleri sunan cerrahi merkez.",
    shortOverviewEn: "Plastic, Reconstructive, and Aesthetic Surgical procedures performed at world standards.",
    longDescription: "Our surgical center encompasses a total area of 11,800 m2, with 7 floors, 9 operating rooms, 25 observation rooms, and 13 hair transplant units. In addition to plastic surgery, our center also offers services in hair transplantation and treatments, medical aesthetics, dental aesthetics, and IV therapy.",
    fullOverviewTr: "Cerrahi merkezimiz 11.800 m2 toplam alana, 7 kata, 9 ameliyathaneye, 25 gözlem odasına ve 13 saç ekim ünitesine sahiptir. Plastik cerrahinin yanı sıra, saç ekimi, medikal estetik, diş estetiği ve IV tedavi alanlarında hizmet vermektedir.",
    fullOverviewEn: "Our surgical center encompasses a total area of 11,800 m2, with 7 floors, 9 operating rooms, 25 observation rooms, and 13 hair transplant units. In addition to plastic surgery, our center also offers services in hair transplantation and treatments, medical aesthetics, dental aesthetics, and IV therapy."
  };

  const facilities = [
    { type: "clinicArea", value: "11,800 m2" },
    { type: "floorCount", value: "7 floors" },
    { type: "operatingRoomCount", value: "9" },
    { type: "observationRooms", value: "25 observation rooms" },
    { type: "hairTransplantUnits", value: "13 hair transplant units" }
  ];

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
      sourceDuration: p.duration, // Note: This duration should not be promised as guarantee, disclaimer is in frontend
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

  // Patient Services
  const oldServices = await clinicDocRef.collection("patient_services").get();
  oldServices.forEach(doc => batch.delete(doc.ref));

  // No specific transfer services mentioned in the provided overview snippet, 
  // so we won't invent any, as per strict instructions.

  // Facilities
  const oldFacilities = await clinicDocRef.collection("facilities").get();
  oldFacilities.forEach(doc => batch.delete(doc.ref));

  facilities.forEach(fac => {
    const docRef = clinicDocRef.collection("facilities").doc();
    batch.set(docRef, {
      facilityType: fac.type,
      sourceValue: fac.value,
      verificationStatus: "source_claim",
      sourceUrl: CLINIC_URL
    });
  });
  
  // Knowledge Base
  const oldKb = await clinicDocRef.collection("knowledge_documents").get();
  oldKb.forEach(doc => batch.delete(doc.ref));

  const kbTopics = [
    "clinic_overview", "organization_type", "location_and_access", "medical_specialties",
    "surgical_procedures", "non_surgical_treatments", "facility_information", 
    "operating_rooms", "doctor_information", "pricing_information", "source_duration_information"
  ];

  kbTopics.forEach(topic => {
    const docRef = clinicDocRef.collection("knowledge_documents").doc();
    batch.set(docRef, {
      ownerType: "clinic",
      ownerId: clinicDocRef.id,
      agencyId: AGENCY_ID,
      topic,
      content: clinicData.longDescription, // general fallback for now
      sourceUrl: CLINIC_URL,
      status: "active"
    });
  });

  // No explicit clinic-level languages in overview. Assuming TR/EN based on rules.
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
