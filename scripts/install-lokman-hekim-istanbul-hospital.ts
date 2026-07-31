import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/lokman-hekim-istanbul-hospital";
const STABLE_KEY = "lokman_hekim_istanbul_hospital";
const SLUG = "lokman-hekim-istanbul-hospital";

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

  if (!h1.toLowerCase().includes("lokman") || !h1.toLowerCase().includes("istanbul")) {
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
    else if (th.includes("hair transplant")) currentCategory = "hair_transplant";
    else if (th.includes("rhinoplasty")) currentCategory = "rhinoplasty";

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
  console.log(`=== LOKMAN HEKİM İSTANBUL HOSPITAL INSTALLATION [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

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
    if (nName.includes("lokman") && nName.includes("istanbul")) {
      duplicateTargetCandidates.push({ id: doc.id, name: data.clinicName, url: data.canonicalSourceUrl });
    }
  }

  // Auto-merge if exact name match and it's the only one
  if (!existingClinicId && duplicateTargetCandidates.length === 1) {
    const c = duplicateTargetCandidates[0];
    if (c.name === "Lokman Hekim İstanbul Hospital" || c.name === "Lokman Hekim Istanbul Hospital") {
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
    brand: "Lokman Hekim",
    branch: "İstanbul",
    displayNameTr: "Lokman Hekim İstanbul Hastanesi",
    displayNameEn: "Lokman Hekim Istanbul Hospital",
    category: "multi_specialty_hospital",
    sourceDomain: "feelinhealthy.com",
    externalSourceUrl: CLINIC_URL,
    canonicalSourceUrl: CLINIC_URL,
    sourceType: "agency_website",
    externalLinkType: "feelinhealthy_profile",
    sourceStatus: "verified",
    
    clinicName: "Lokman Hekim İstanbul Hospital",
    status: "active",
    priority: 85,
    
    aliases: [
      "Lokman Hekim İstanbul Hastanesi",
      "Lokman Hekim Istanbul Hospital",
      "Lokman Hekim İstanbul",
      "Lokman Hekim Pendik",
      "Lokman Hekim Hospital Istanbul"
    ],
    
    treatmentCategories: [...categories, "cardiology", "ivf", "hair_transplant"],
    
    location: {
      country: "Türkiye",
      countryCode: "TR",
      city: "İstanbul",
      district: "Pendik",
      area: "Kurtköy",
      timezone: "Europe/Istanbul"
    },

    shortDescription: "Established in 1996, the group opened Lokman Hekim Istanbul Hospital in 2022. Located in Kurtköy, Pendik, providing comprehensive and modern medical services.",
    shortOverviewTr: "1996 yılında kurulan sağlık grubu, Lokman Hekim İstanbul Hastanesi'ni 2022 yılında faaliyete geçirmiştir. Kurtköy, Pendik'te kapsamlı ve modern sağlık hizmetleri sunmaktadır.",
    shortOverviewEn: "Established in 1996, the group opened Lokman Hekim Istanbul Hospital in 2022. Located in Kurtköy, Pendik, providing comprehensive and modern medical services.",
    longDescription: "The hospital offers a wide range of specialties, including obstetrics and gynecology, pediatrics, cardiology, cardiovascular surgery, IVF treatments, aviation medical services, and hair transplantation. Located just 9 minutes from Sabiha Gökçen International Airport.",
    fullOverviewTr: "Hastane; kadın hastalıkları ve doğum, çocuk sağlığı, kardiyoloji, kalp ve damar cerrahisi, tüp bebek tedavileri, havacılık tıbbı ve saç ekimi gibi çok çeşitli alanlarda hizmet vermektedir. Sabiha Gökçen Uluslararası Havalimanı'na sadece 9 dakika uzaklıkta yer almaktadır.",
    fullOverviewEn: "The hospital offers a wide range of specialties, including obstetrics and gynecology, pediatrics, cardiology, cardiovascular surgery, IVF treatments, aviation medical services, and hair transplantation. Located just 9 minutes from Sabiha Gökçen International Airport."
  };

  const patientServices = [
    { type: "airport_transfer_support", note: "Located just 9 minutes from Sabiha Gökçen International Airport" }
  ];

  const facilities = [
    { type: "clinicArea", value: "25,000 square meters" },
    { type: "operatingRoomCount", value: "8" },
    { type: "icu_adult", value: "21 general intensive care beds" },
    { type: "icu_neonatal", value: "10 neonatal intensive care incubators" },
    { type: "icu_coronary", value: "4 coronary intensive care beds" },
    { type: "bedCount", value: "115" }
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
    "hospital_overview", "hospital_history", "branch_information", "location_and_access", 
    "medical_departments", "treatment_information", "facility_information", "operating_rooms", 
    "intensive_care", "doctor_information", "pricing_information"
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

  await batch.commit();
  console.log(`\n[SUCCESS] Installation completed successfully. Clinic ID: ${clinicDocRef.id}`);

  const afterSnap = await clinicsRef.get();
  console.log(`[VERIFICATION] Clinic count after: ${afterSnap.size} (Expected: ${totalClinicsBefore + expectedDelta})`);
  
  const savedDoc = await clinicDocRef.get();
  console.log(`[VERIFICATION] Visible clinic name: ${savedDoc.data()?.clinicName}`);

}

run().catch(console.error);
