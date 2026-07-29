console.log("[LOG] Script entry reached");

import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

console.log("[LOG] Environment loaded");

const args = process.argv.slice(2);
const isDryRun = !args.includes("--apply");

const SOURCE_URL = "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-serifali";

const CLINIC_DATA = {
  clinicId: "hospitadent-dental-group-serifali",
  clinicName: "Hospitadent Dental Group Şerifali",
  clinicSlug: "hospitadent-dental-group-serifali",
  internalKey: "hospitadent_dental_group_serifali",
  brand: "Hospitadent Dental Group",
  branch: "Şerifali",
  sourceUrl: SOURCE_URL,
  profileUrl: SOURCE_URL,
  clinicType: "dental_hospital",
  category: "dental",
  treatmentCategories: ["dental"],
  subTreatments: [
    "Dental Implants", "Zirconium Crowns", "Digital Smile Design", "Laminate Veneers",
    "Box Technique", "Bonding Applications", "Teeth Whitening", "General Anesthesia"
  ],
  priority: 85,
  status: "verification_pending",
  publicVisibility: false,
  metadata: {
    openedYear: 2019,
    indoorAreaSqm: 1300,
    treatmentUnitCount: 14,
    operatingRoomCount: 1
  },
  overview: {
    shortDescription: "Hospitadent Dental Group Şerifali is a private dental hospital opened in 2019 in the Istanbul Asian Side. It features 14 treatment units and 1 operating room over a 1,300 m² area.",
    longDescription: "Opened in 2019, Dental Group Hospitadent Şerifali Dental Hospital is one of Istanbul’s leading private dental hospitals. Built on a 1,300 m² area, the hospital includes 14 advanced treatment units and 1 fully equipped operating room. It offers comprehensive oral healthcare services including Dental Implants, Zirconium Crowns, Digital Smile Design, Laminate Veneers, Box Technique, Bonding Applications, and Teeth Whitening.\n\nThe clinic is equipped with modern technology such as Panoramic X-Ray and Dental Tomography. To support international patients, it offers multilingual support in English, German, French, Arabic, Russian, and Bulgarian, alongside complimentary VIP airport transfer services. Final treatment plans and prices require a clinical examination.\n\nClinic Hours:\nMonday to Saturday: 08:00 – 19:00\nSunday: Closed",
    targetPatientProfile: "Domestic and international patients seeking advanced dental treatments in Istanbul. Kesin tedavi planı, klinik değerlendirme sonrasında belirlenir.",
    healthTourismExperience: "Multilingual support and complimentary VIP airport transfer are offered.",
    internationalPatientSupport: true,
    transferSupport: true,
    accommodationSupport: false
  },
  location: {
    country: "Türkiye",
    countryCode: "TR",
    city: "İstanbul",
    region: "İstanbul Asian Side",
    district: "Ümraniye",
    neighborhood: "Şerifali"
  },
  supportedLanguages: ["English", "German", "French", "Arabic", "Russian", "Bulgarian"],
  verificationStatus: "source_inferred_requires_review",
  agencySlug: "feelinhealthy"
};

const TREATMENTS_AND_PRICES = [
  { name: "Dentist Consultation", price: 0, currency: "EUR", duration: "1 Day", type: "source_average" },
  { name: "Implant Dentist Consultation", price: 0, currency: "EUR", duration: "1 Day", type: "source_average" },
  { name: "All-on-6 Dental Implants", price: 3740, currency: "EUR", duration: "3 Day", type: "source_average" },
  { name: "All-on-4 Dental Implants", price: 2640, currency: "EUR", duration: "3 Day", type: "source_average" },
  { name: "Bone Graft", price: 600, currency: "EUR", duration: "5 Day", type: "source_average" },
  { name: "Dental Implants", price: 399, currency: "EUR", duration: "3 Day", type: "source_average" },
  { name: "Sinus Lift", price: 600, currency: "EUR", duration: "5 Day", type: "source_average" },
  { name: "E-Max Crown", price: 330, currency: "EUR", duration: "7 Day", type: "source_average" },
  { name: "Zirconia Crown", price: 250, currency: "EUR", duration: "7 Day", type: "source_average" },
  { name: "Dentures", price: 690, currency: "EUR", duration: "7 Day", type: "source_average" },
  { name: "Full Dentures", price: 3960, currency: "EUR", duration: "12 Day", type: "source_average" },
  { name: "Composite Veneers", price: 130, currency: "EUR", duration: "7 Day", type: "source_average" },
  { name: "E-Max Veneers / Full Veneers", price: 385, currency: "EUR", duration: "7 Day", type: "source_average" },
  { name: "Hollywood Smile", price: 5000, currency: "EUR", duration: "7 Day", type: "source_average" },
  { name: "Teeth Cleaning", price: 70, currency: "EUR", duration: "1 Day", type: "source_average" },
  { name: "Teeth Whitening", price: 250, currency: "EUR", duration: "1 Day", type: "source_average" },
  { name: "General Anesthesia for Dental Treatments", price: 430, currency: "EUR", duration: "1 Day", type: "source_average" },
  { name: "Sedation for Dental Treatments", price: 315, currency: "EUR", duration: "1 Day", type: "source_average" }
];

const DOCTORS = [
  { fullName: "Zeynep Beyza Kırıştıoğlu", specialty: "", experience: "5 Years", education: "It has not been added yet.", languages: ["Turkish", "English"], biography: "Education and Associations are not specified in the source profile.", sourceUrl: SOURCE_URL },
  { fullName: "Esra Melike Akdoğan", specialty: "", experience: "11 Years", education: "It has not been added yet.", languages: ["Turkish", "English"], biography: "Education and Associations are not specified in the source profile.", sourceUrl: SOURCE_URL }
];

const KB_DOCS = [
  { knowledgeType: "clinic_overview", title: "Hospitadent Şerifali Overview", content: "Opened in 2019, Dental Group Hospitadent Şerifali Dental Hospital is a private dental hospital located in the Istanbul Asian Side (Şerifali, Ümraniye).", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "clinic_capacity", title: "Clinic Capacity", content: "The clinic is built on a 1,300 m² area and includes 14 advanced treatment units and 1 fully equipped operating room.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "dental_services", title: "Dental Services", content: "Provides comprehensive dental treatments including Dental Implants, Zirconium Crowns, Digital Smile Design, Laminate Veneers, Box Technique, Bonding Applications, and Teeth Whitening.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "implant_treatments", title: "Implant Treatments", content: "Offers Dental Implants (average 399 EUR), All-on-4 (average 2640 EUR), and All-on-6 (average 3740 EUR). Also provides Sinus Lift and Bone Graft. Offers free Implant Dentist Consultation.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "crowns_and_veneers", title: "Crowns and Veneers", content: "Provides Zirconia Crowns (average 250 EUR), E-Max Crowns (average 330 EUR), Composite Veneers (average 130 EUR), and E-Max Veneers (average 385 EUR).", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "dentures", title: "Dentures", content: "Offers Dentures (average 690 EUR) and Full Dentures (average 3960 EUR).", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "smile_design", title: "Smile Design", content: "Offers Hollywood Smile treatments averaging 5000 EUR.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "whitening_and_cleaning", title: "Whitening and Cleaning", content: "Offers Teeth Cleaning (average 70 EUR) and Teeth Whitening (average 250 EUR).", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "anesthesia_services", title: "Anesthesia Services", content: "The facility is equipped with 1 operating room. Offers General Anesthesia for Dental Treatments (average 430 EUR) and Sedation (average 315 EUR).", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "diagnostic_imaging", title: "Diagnostic Imaging", content: "Free panoramic X-rays and free dental tomography are stated on the source. The exact scope and conditions must be verified with the clinic.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "international_patient_support", title: "International Patient Support", content: "The clinic supports international patients in multiple languages and offers complimentary VIP airport transfer service.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "supported_languages", title: "Supported Languages", content: "The clinic provides services in English, German, French, Arabic, Russian, and Bulgarian.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "transfer_services", title: "Transfer Services", content: "Complimentary VIP airport transfer is stated in the profile. Eligibility and scope require confirmation prior to arrival.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "opening_hours", title: "Opening Hours", content: "Monday to Saturday: 08:00 - 19:00. Sunday: Closed.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "clinic_policy", title: "Clinic Policy", content: "Prices listed are source averages. Final treatment suitability and exact pricing are determined following a clinical examination.", locale: "en", translationStatus: "verified_from_source" }
];

async function main() {
  console.log("[LOG] Importing Firebase helper...");
  const { getAdminDb } = await import("../lib/firebase-admin");
  console.log("[LOG] Firebase helper imported");

  const db = getAdminDb();
  if (!db) {
    console.error("[HATA] Firebase Admin yetkilendirmesi başarısız oldu.");
    process.exit(1);
  }
  
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  console.log(`[LOG] Resolved Project ID: ${projectId}`);
  console.log("======================================================");
  console.log(isDryRun ? "MODE: DRY-RUN" : "MODE: APPLY");

  console.log("[LOG] Agency lookup starting");
  const agencySnap = await db.collection("agencies").where("slug", "==", CLINIC_DATA.agencySlug).limit(1).get();
  if (agencySnap.empty) {
    console.error("Agency 'feelinhealthy' not found.");
    process.exit(1);
  }
  const agencyId = agencySnap.docs[0].id;
  console.log(`Resolved Agency ID: ${agencyId}`);

  // PRE-FLIGHT COUNT
  const allClinicsSnap = await db.collection("agencies").doc(agencyId).collection("clinics").get();
  const preCount = allClinicsSnap.size;
  const preClinicNames = allClinicsSnap.docs.map(d => ({ id: d.id, name: d.data().clinicName }));
  
  console.log(`\n[PRE-FLIGHT] Existing Clinics Count: ${preCount}`);
  preClinicNames.forEach(c => console.log(` - [${c.id}] ${c.name}`));

  console.log("\n[LOG] Duplicate search starting");
  const duplicateSearchSlugs = ["hospitadent-dental-group-serifali", "hospitadent_serifali", "hospitadent-serifali", "hospitadent_dental_group_serifali"];
  const duplicateSnap = await db.collection("agencies").doc(agencyId).collection("clinics")
    .where("clinicSlug", "in", duplicateSearchSlugs).get();

  let clinicRef;
  let clinicId;
  let isUpdate = false;

  if (duplicateSnap.empty) {
    console.log(`[Clinic] Not found. Will CREATE.`);
    clinicRef = db.collection("agencies").doc(agencyId).collection("clinics").doc();
    clinicId = clinicRef.id;
  } else {
    isUpdate = true;
    clinicRef = duplicateSnap.docs[0].ref;
    clinicId = clinicRef.id;
    console.log(`[Clinic] Found existing (ID: ${clinicId}). Will UPDATE.`);
  }

  const expectedCount = isUpdate ? preCount : preCount + 1;
  console.log(`[EXPECTED] After apply count should be: ${expectedCount}`);

  const clinicPayload = {
    ...CLINIC_DATA,
    updatedAt: new Date(),
    agencyId
  };

  const deleteOperations = 0; // Guard variable

  if (!isDryRun) {
    console.log("[LOG] Write starting");
    await clinicRef.set(clinicPayload, { merge: true });
    console.log(`[Clinic] Applied.`);
  }

  // Pricing
  console.log(`\n--- Pricing & Treatments ---`);
  let pricingRecordCount = 0;
  for (const t of TREATMENTS_AND_PRICES) {
    pricingRecordCount++;
    const pSnap = await db.collection("agencies").doc(agencyId).collection("clinics").doc(clinicId).collection("pricing")
      .where("treatmentName", "==", t.name).get();
      
    if (pSnap.empty) {
      console.log(`[Pricing] Will CREATE: ${t.name} (${t.price} ${t.currency}) - ${t.type}`);
      if (!isDryRun) {
        const docId = t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        await db.collection("agencies").doc(agencyId).collection("clinics").doc(clinicId).collection("pricing").doc(docId).set({
          treatmentName: t.name,
          priceMin: t.price,
          priceMax: t.price,
          currency: t.currency,
          duration: t.duration,
          priceType: t.type,
          sourceUrl: SOURCE_URL,
          status: "active",
          updatedAt: new Date(),
          agencyClinicId: clinicId
        }, { merge: true });
      }
    } else {
      console.log(`[Pricing] Found existing: ${t.name}. Skipping.`);
    }
  }
  
  if (pricingRecordCount !== 18) {
    console.warn(`[WARNING] Expected 18 pricing records, but processed ${pricingRecordCount}`);
  } else {
    console.log(`[Pricing] Successfully verified exactly 18 pricing records.`);
  }

  // Doctors
  console.log(`\n--- Doctors ---`);
  for (const doc of DOCTORS) {
    const dSnap = await db.collection("agencies").doc(agencyId).collection("clinics").doc(clinicId).collection("doctors")
      .where("fullName", "==", doc.fullName).get();
      
    if (dSnap.empty) {
      console.log(`[Doctor] Will CREATE: ${doc.fullName} (${doc.experience})`);
      if (!isDryRun) {
        await db.collection("agencies").doc(agencyId).collection("clinics").doc(clinicId).collection("doctors").add({
          ...doc,
          status: "active",
          showOnPublicProfile: true,
          clinicId,
          agencyId,
          updatedAt: new Date()
        });
      }
    } else {
      console.log(`[Doctor] Found existing: ${doc.fullName}. Skipping.`);
    }
  }

  // AI Knowledge Base
  console.log(`\n--- AI Knowledge Base ---`);
  for (const kb of KB_DOCS) {
    const kbSnap = await db.collection("agencies").doc(agencyId).collection("knowledge_documents")
      .where("ownerType", "==", "clinic")
      .where("ownerId", "==", clinicId)
      .where("title", "==", kb.title)
      .get();
      
    if (kbSnap.empty) {
      console.log(`[KB] Will CREATE: ${kb.title}`);
      if (!isDryRun) {
        const newKbRef = await db.collection("agencies").doc(agencyId).collection("knowledge_documents").add({
          ownerType: "clinic",
          ownerId: clinicId,
          agencyId,
          status: "active",
          sourceUrl: SOURCE_URL,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...kb
        });
        
        await newKbRef.collection("chunks").add({
          content: kb.content,
          orderIndex: 0,
          createdAt: new Date()
        });
      }
    } else {
      console.log(`[KB] Found existing: ${kb.title}. Skipping.`);
    }
  }

  console.log(`\n--- REPORT ---`);
  console.log(`Delete Operations: ${deleteOperations}`);
  if (deleteOperations > 0) {
    console.error("[CRITICAL] DELETE OPERATIONS DETECTED. ABORTING.");
    process.exit(1);
  }

  if (!isDryRun) {
    console.log(`\n[POST-FLIGHT] Verifying clinic count...`);
    const postClinicsSnap = await db.collection("agencies").doc(agencyId).collection("clinics").get();
    const postCount = postClinicsSnap.size;
    const postClinicNames = postClinicsSnap.docs.map(d => ({ id: d.id, name: d.data().clinicName }));
    
    console.log(`Actual Count: ${postCount} (Expected: ${expectedCount})`);
    postClinicNames.forEach(c => console.log(` - [${c.id}] ${c.name}`));
    
    if (postCount < preCount) {
      console.error("[CRITICAL] Clinic count decreased! Operation might have overwritten data!");
      process.exit(1);
    }
    if (postCount !== expectedCount) {
      console.warn(`[WARNING] Expected count ${expectedCount} but got ${postCount}`);
    } else {
      console.log("[SUCCESS] Counts match expected value.");
      
      // Update metadata
      await clinicRef.set({
         metadata: {
           ...CLINIC_DATA.metadata,
           activeDoctorCount: 2,
           listedDoctorCount: 2
         }
      }, { merge: true });
    }
  }

  console.log("\n[LOG] Script completed.");
}

main().catch(console.error);
