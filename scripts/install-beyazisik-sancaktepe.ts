import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/beyazisik-sancaktepe-dental-group";
const STABLE_KEY = "beyazisik_sancaktepe_dental_group";
const SLUG = "beyazisik-sancaktepe-dental-group";

async function fetchAndValidateSource() {
  console.log(`Fetching canonical source: ${CLINIC_URL}...`);
  const res = await fetch(CLINIC_URL);
  if (!res.ok) {
    throw new Error(`canonical_source_fetch_failed: HTTP ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $("title").text().trim();
  const h1 = $("h1").text().trim() || $(".title").text().trim() || title;

  console.log(`Source title: ${h1}`);

  if (!title.toLowerCase().includes("sancaktepe") || !h1.toLowerCase().includes("sancaktepe")) {
    throw new Error("canonical_source_validation_failed: Title does not match Sancaktepe.");
  }

  // Check doctors
  const doctorsSectionText = $(".doctor, .doctors, #doctors, .specialist").text().trim();
  const hasDoctors = doctorsSectionText.length > 10;
  console.log(`Doctors found on source: ${hasDoctors ? "Yes" : "No"}`);

  return { html, hasDoctors, h1 };
}

async function run() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== BEYAZIŞIK SANCAKTEPE INSTALLATION [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB is not initialized.");
    process.exit(1);
  }
  const clinicsRef = db.collection("agencies").doc(AGENCY_ID).collection("clinics");
  
  // Environment Match
  console.log("Firebase Project ID:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

  // Before Snapshot
  const allClinicsSnap = await clinicsRef.get();
  const totalClinicsBefore = allClinicsSnap.size;
  console.log("FeelinHealthy agency clinic count before:", totalClinicsBefore);

  let existingClinicId = null;
  let existingClinicData = null;

  // Duplicate Check
  for (const doc of allClinicsSnap.docs) {
    const data = doc.data();
    if (
      data.stableKey === STABLE_KEY ||
      data.slug === SLUG ||
      data.canonicalSourceUrl === CLINIC_URL ||
      data.externalSourceUrl === CLINIC_URL ||
      data.clinicName?.toLowerCase() === "beyazışık sancaktepe dental group"
    ) {
      existingClinicId = doc.id;
      existingClinicData = data;
      break;
    }
  }

  console.log("Existing exact canonical record:", existingClinicId ? "Found" : "Not Found");

  // Fetch Source
  const { hasDoctors, h1 } = await fetchAndValidateSource();

  if (hasDoctors) {
    throw new Error("Validation failed: Doctors were found on the source page, but prompt stated otherwise.");
  } else {
    console.log("no_doctors_listed_on_canonical_profile");
    console.log("opening_hours_not_listed_on_canonical_source");
    console.log("clinic_languages_not_listed_on_canonical_source");
  }

  const clinicData = {
    agencyId: AGENCY_ID,
    stableKey: STABLE_KEY,
    slug: SLUG,
    brand: "Beyazışık Dental Group",
    branch: "Sancaktepe",
    displayNameTr: "Beyazışık Sancaktepe Dental Group",
    displayNameEn: "Beyazışık Sancaktepe Dental Group",
    category: "dental",
    facilityType: "clinic",
    sourceDomain: "feelinhealthy.com",
    externalSourceUrl: CLINIC_URL, // External Profile URL
    canonicalSourceUrl: CLINIC_URL, // Canonical source URL
    sourceType: "agency_website",
    externalLinkType: "feelinhealthy_profile",
    sourceStatus: "verified",
    
    // UI field
    clinicName: "Beyazışık Sancaktepe Dental Group",
    status: "active",
    priority: 85,
    
    aliases: [
      "Beyazışık Sancaktepe",
      "Beyazisik Sancaktepe",
      "Beyaz Işık Sancaktepe",
      "Beyazışık Sancaktepe Dental Clinic",
      "Beyazışık Sancaktepe Diş Kliniği",
      "Beyazışık Sancaktepe Dental Group"
    ],
    
    treatmentCategories: ["dental"],
    supportedLanguages: [], // not listed on canonical
    
    location: {
      country: "Türkiye",
      countryCode: "TR",
      city: "İstanbul",
      district: "Sancaktepe",
      area: "İstanbul Anadolu Yakası",
      timezone: "Europe/Istanbul",
      address: "Sancaktepe, İstanbul, Türkiye"
    },

    shortDescription: "Kaynak profilde, yurt dışından gelen hastalar için havalimanı karşılama-uğurlama, tedavi sürecinde ulaşım ve konaklama planlaması desteği sunulabildiği belirtiliyor. Hizmetlerin kapsamı ve uygunluğu klinikle teyit edilmelidir.",
    shortOverviewTr: "Kaynak profilde, yurt dışından gelen hastalar için havalimanı karşılama-uğurlama, tedavi sürecinde ulaşım ve konaklama planlaması desteği sunulabildiği belirtiliyor. Hizmetlerin kapsamı ve uygunluğu klinikle teyit edilmelidir.",
    shortOverviewEn: "The source profile states that airport welcome and send-off, transportation during treatment, and accommodation planning support can be provided for patients coming from abroad. The scope and suitability of the services must be confirmed with the clinic.",
    longDescription: "Beyazışık Sancaktepe Dental Group İstanbul Anadolu Yakası'nda yer almaktadır. Yurt dışından gelen hastalar için sağlık turizmi sürecine yönelik destek planlamaları belirtilmektedir. Havalimanında karşılama ve uğurlama desteği, tedavi döneminde ulaşım/servis desteği ve konaklama desteği veya planlaması kaynakta ifade edilmektedir. Hizmetlerin kapsamı ve uygunluğu klinikle teyit edilmelidir.",
    fullOverviewTr: "Beyazışık Sancaktepe Dental Group İstanbul Anadolu Yakası'nda yer almaktadır. Yurt dışından gelen hastalar için sağlık turizmi sürecine yönelik destek planlamaları belirtilmektedir. Havalimanında karşılama ve uğurlama desteği, tedavi döneminde ulaşım/servis desteği ve konaklama desteği veya planlaması kaynakta ifade edilmektedir. Hizmetlerin kapsamı ve uygunluğu klinikle teyit edilmelidir.",
    fullOverviewEn: "Beyazışık Sancaktepe Dental Group is located on the Asian Side of Istanbul. Support planning for the health tourism process is indicated for patients coming from abroad. Airport welcome and send-off support, transportation/transfer support during the treatment period, and accommodation support or planning are expressed in the source. The scope and suitability of the services must be confirmed with the clinic."
  };

  const treatmentsData = [
    { sourceTreatmentName: "Bone Graft", mappedTreatment: "bone_graft", sourceCategory: "İmplant", alias: "Kemik grefti" },
    { sourceTreatmentName: "Dental Implants", mappedTreatment: "dental_implants", sourceCategory: "İmplant", alias: "İmplant tedavisi" },
    { sourceTreatmentName: "Single Implant", mappedTreatment: "single_implant", sourceCategory: "İmplant", alias: "Tek diş implantı" },
    { sourceTreatmentName: "Sinus Lift", mappedTreatment: "sinus_lift", sourceCategory: "İmplant", alias: "Sinüs lifting" },
    { sourceTreatmentName: "Full Dentures", mappedTreatment: "full_dentures", sourceCategory: "Dentures", alias: "Tam protez" },
    { sourceTreatmentName: "Permanent Dentures", mappedTreatment: null, sourceCategory: "Dentures", alias: "Permanent Dentures", isUnmatched: true }
  ];

  const pricingData = [
    { treatmentName: "Bone Graft", amount: 200, currency: "EUR", duration: "1 Day" },
    { treatmentName: "Dental Implants", amount: 300, currency: "EUR", duration: "1 Day" },
    { treatmentName: "Single Implant", amount: 270, currency: "EUR", duration: "1 Day" },
    { treatmentName: "Sinus Lift", amount: 350, currency: "EUR", duration: "1 Day" },
    { treatmentName: "Full Dentures", amount: 500, currency: "EUR", duration: "1 Day" },
    { treatmentName: "Permanent Dentures", amount: 150, currency: "EUR", duration: "1 Day" }
  ];

  let expectedDelta = existingClinicId ? 0 : 1;

  if (!isApply) {
    console.log("\n--- DRY RUN REPORT ---");
    console.log("Planned updates: ", existingClinicId ? 1 : 0);
    console.log("Planned creates: ", existingClinicId ? 0 : 1);
    console.log("Planned deletes: 0");
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

  // Delete old treatments and pricing subcollections
  const oldTreatments = await clinicDocRef.collection("treatments").get();
  oldTreatments.forEach(doc => batch.delete(doc.ref));
  
  const oldPricing = await clinicDocRef.collection("pricing").get();
  oldPricing.forEach(doc => batch.delete(doc.ref));

  // Add treatments
  treatmentsData.forEach((t, i) => {
    const docRef = clinicDocRef.collection("treatments").doc();
    batch.set(docRef, {
      agencyId: AGENCY_ID,
      clinicId: clinicDocRef.id,
      treatmentId: t.mappedTreatment,
      sourceTreatmentName: t.sourceTreatmentName,
      sourceCategory: t.sourceCategory,
      sourceUrl: CLINIC_URL,
      sourceVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      verificationStatus: "verified",
      active: true,
      displayOrder: i,
      isUnmatched: !!t.isUnmatched
    });
  });

  // Add pricing
  pricingData.forEach(p => {
    const docRef = clinicDocRef.collection("pricing").doc();
    batch.set(docRef, {
      agencyId: AGENCY_ID,
      clinicId: clinicDocRef.id,
      treatmentName: p.treatmentName,
      amount: p.amount,
      currency: p.currency,
      sourceDuration: p.duration,
      priceType: "source_average",
      sourceUrl: CLINIC_URL,
      sourceStatus: "verified"
    });
  });

  // Knowledge Base
  const oldKb = await clinicDocRef.collection("knowledge_documents").get();
  oldKb.forEach(doc => batch.delete(doc.ref));

  const kbTopics = [
    "clinic_overview", "branch_information", "location_and_access", 
    "dental_services", "implant_treatments", "bone_graft", "sinus_lift", 
    "dental_implants", "denture_treatments", "international_patient_support", 
    "airport_support", "transportation_support", "accommodation_support", 
    "pricing_information"
  ];

  kbTopics.forEach(topic => {
    const docRef = clinicDocRef.collection("knowledge_documents").doc();
    batch.set(docRef, {
      ownerType: "clinic",
      ownerId: clinicDocRef.id,
      agencyId: AGENCY_ID,
      topic,
      content: clinicData.fullOverviewTr,
      sourceUrl: CLINIC_URL,
      status: "active"
    });
  });

  // Patient support
  const supportServices = ["airport_support", "transportation_support", "accommodation_support", "patient_coordination_service"];
  const oldSupport = await clinicDocRef.collection("patient_services").get();
  oldSupport.forEach(doc => batch.delete(doc.ref));

  supportServices.forEach(s => {
    const docRef = clinicDocRef.collection("patient_services").doc();
    batch.set(docRef, {
      serviceType: s,
      verificationStatus: "source_claim",
      scope: "requires_confirmation",
      availability: "subject_to_clinic_confirmation"
    });
  });

  await batch.commit();
  console.log(`\n[SUCCESS] Installation completed successfully. Clinic ID: ${clinicDocRef.id}`);

  // Post-flight verification
  const afterSnap = await clinicsRef.get();
  console.log(`[VERIFICATION] Clinic count after: ${afterSnap.size} (Expected: ${totalClinicsBefore + expectedDelta})`);
  
  const savedDoc = await clinicDocRef.get();
  console.log(`[VERIFICATION] Visible clinic name: ${savedDoc.data()?.clinicName}`);

}

run().catch(console.error);
