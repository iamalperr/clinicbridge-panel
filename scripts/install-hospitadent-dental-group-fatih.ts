import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-fatih";
const STABLE_KEY = "hospitadent_dental_group_fatih";
const SLUG = "hospitadent-dental-group-fatih";

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

  if (!h1.toLowerCase().includes("hospitadent") || !h1.toLowerCase().includes("fatih")) {
    throw new Error(`canonical_source_fetch_failed_or_identity_mismatch: Title does not match target. Got: ${h1}`);
  }

  console.log(`Source page title: ${h1}`);

  // Dinamik Doctor Extraction
  const doctors: any[] = [];
  $("h4").each((i, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text && !text.includes("Health and Travel")) {
        doctors.push({
            name: text,
            title: text.includes("Dr.") ? "Dr." : text.includes("Dt.") ? "Dt." : "",
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

    $(table).find("tr").each((j, tr) => {
      const tds = $(tr).find("td");
      if (tds.length >= 3) {
        const name = $(tds[0]).text().replace(/\s+/g, " ").trim();
        const priceText = $(tds[1]).text().replace(/\s+/g, " ").trim();
        const duration = $(tds[2]).text().replace(/\s+/g, " ").trim();
        
        let amount = parseFloat(priceText.replace(/[^0-9.]/g, ""));
        let currency = priceText.includes("€") ? "EUR" : priceText.includes("$") ? "USD" : "TRY";

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
  console.log(`=== HOSPITADENT DENTAL GROUP FATİH INSTALLATION [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB is not initialized.");
    process.exit(1);
  }
  
  const clinicsRef = db.collection("agencies").doc(AGENCY_ID).collection("clinics");
  console.log("Firebase Project ID:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

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
    if (nName.includes("hospitadent") && nName.includes("fatih")) {
      duplicateTargetCandidates.push({ id: doc.id, name: data.clinicName, url: data.canonicalSourceUrl });
    }
  }

  // Auto-merge if exact name match and it's the only one
  if (!existingClinicId && duplicateTargetCandidates.length === 1) {
    const c = duplicateTargetCandidates[0];
    if (c.name === "Hospitadent Dental Group Fatih") {
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
    brand: "Hospitadent Dental Group",
    branch: "Fatih",
    displayNameTr: "Hospitadent Dental Group Fatih",
    displayNameEn: "Hospitadent Dental Group Fatih",
    category: "dental_hospital",
    sourceDomain: "feelinhealthy.com",
    externalSourceUrl: CLINIC_URL,
    canonicalSourceUrl: CLINIC_URL,
    sourceType: "agency_website",
    externalLinkType: "feelinhealthy_profile",
    sourceStatus: "verified",
    
    clinicName: "Hospitadent Dental Group Fatih",
    status: "active",
    priority: 80,
    
    aliases: [
      "Hospitadent Fatih",
      "Hospitadent Fatih Dental Hospital",
      "Hospitadent Dental Hospital Fatih",
      "Dental Group Hospitadent Fatih"
    ],
    
    treatmentCategories: categories,
    
    location: {
      country: "Türkiye",
      countryCode: "TR",
      city: "İstanbul",
      area: "İstanbul", // Or Fatih
      timezone: "Europe/Istanbul"
    },

    shortDescription: "Opened in 2008, Hospitadent Fatih Dental Hospital is located in the heart of Istanbul. Covering 750 m² and equipped with 9 modern treatment units.",
    shortOverviewTr: "2008 yılında açılan Hospitadent Fatih Diş Hastanesi, İstanbul'un kalbinde yer almaktadır. 750 m² alan üzerine kurulu ve 9 modern tedavi ünitesi ile donatılmıştır.",
    shortOverviewEn: "Opened in 2008, Hospitadent Fatih Dental Hospital is located in the heart of Istanbul. Covering 750 m² and equipped with 9 modern treatment units.",
    longDescription: "As one of the trusted dental clinics in Istanbul, Hospitadent Fatih provides a full range of oral and dental health services. Perfectly situated near central landmarks such as Sultanahmet, Taksim, and the Golden Horn, the Fatih branch is easily accessible and ideal for both locals and medical tourists exploring the historic city.",
    fullOverviewTr: "İstanbul'un güvenilir diş kliniklerinden biri olan Hospitadent Fatih, tam kapsamlı ağız ve diş sağlığı hizmetleri sunmaktadır. Sultanahmet, Taksim ve Haliç gibi merkezi noktalara yakın konumuyla Fatih şubesi, hem yerel hastalar hem de tarihi şehri keşfeden medikal turistler için kolayca erişilebilir ideal bir konumdadır.",
    fullOverviewEn: "As one of the trusted dental clinics in Istanbul, Hospitadent Fatih provides a full range of oral and dental health services. Perfectly situated near central landmarks such as Sultanahmet, Taksim, and the Golden Horn, the Fatih branch is easily accessible and ideal for both locals and medical tourists exploring the historic city."
  };

  const patientServices = [
    { type: "multilingual_coordination", note: "English, German, French, Arabic, Russian, and Bulgarian" },
    { type: "airport_transfer_support", note: "Complimentary VIP airport transfer service" },
    { type: "diagnostic_service_support", note: "Free panoramic X-rays and dental tomography" }
  ];

  const facilities = [
    { type: "clinicArea", value: "750 m²" },
    { type: "treatmentUnitCount", value: "9" }
  ];

  const openingHours = [
    { dayOfWeek: 1, openTime: "08:00", closeTime: "19:00", isClosed: false },
    { dayOfWeek: 2, openTime: "08:00", closeTime: "19:00", isClosed: false },
    { dayOfWeek: 3, openTime: "08:00", closeTime: "19:00", isClosed: false },
    { dayOfWeek: 4, openTime: "08:00", closeTime: "19:00", isClosed: false },
    { dayOfWeek: 5, openTime: "08:00", closeTime: "19:00", isClosed: false },
    { dayOfWeek: 6, openTime: "08:00", closeTime: "19:00", isClosed: false },
    { dayOfWeek: 0, openTime: null, closeTime: null, isClosed: true } // Sunday
  ];

  const languages = ["en", "de", "fr", "ar", "ru", "bg"];

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

  categories.forEach((cat, i) => {
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
      sourceDuration: p.duration,
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

  patientServices.forEach(s => {
    const docRef = clinicDocRef.collection("patient_services").doc();
    batch.set(docRef, {
      serviceType: s.type,
      note: s.note || "",
      verificationStatus: "source_claim",
      availability: "subject_to_clinic_confirmation",
      confirmationRequired: true
    });
  });

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
    "clinic_overview", "branch_information", "location_and_access", "dental_hospital_information", 
    "facility_information", "treatment_units", "opening_hours", "international_patient_support", 
    "airport_transfer_support", "complimentary_service_claims", "pricing_information", "source_duration_information"
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

  // Opening Hours
  const oldHours = await clinicDocRef.collection("opening_hours").get();
  oldHours.forEach(doc => batch.delete(doc.ref));

  openingHours.forEach(oh => {
    const docRef = clinicDocRef.collection("opening_hours").doc();
    batch.set(docRef, {
      ...oh,
      timezone: "Europe/Istanbul",
      sourceUrl: CLINIC_URL,
      verificationStatus: "verified"
    });
  });
  
  // Languages
  const oldLang = await clinicDocRef.collection("supported_languages").get();
  oldLang.forEach(doc => batch.delete(doc.ref));

  languages.forEach(l => {
    const docRef = clinicDocRef.collection("supported_languages").doc();
    batch.set(docRef, {
      languageCode: l,
      sourceUrl: CLINIC_URL,
      verificationStatus: "verified",
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
