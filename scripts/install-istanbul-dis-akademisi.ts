console.log("[LOG] Script entry reached");

import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

console.log("[LOG] Environment loaded");

const args = process.argv.slice(2);
const isDryRun = !args.includes("--apply");

const SOURCE_URL = "https://feelinhealthy.com/medicalcenter/istanbul-dis-akademisi";

const CLINIC_DATA = {
  clinicId: "istanbul-dis-akademisi",
  clinicName: "İstanbul Diş Akademisi",
  clinicSlug: "istanbul-dis-akademisi",
  internalKey: "istanbul_dis_akademisi",
  sourceUrl: SOURCE_URL,
  profileUrl: SOURCE_URL,
  clinicType: "dental_clinic",
  category: "dental",
  treatmentCategories: ["dental"],
  subTreatments: ["Dental Implant", "Zirconium Crowns", "Hollywood Smile", "Teeth Whitening", "Root Canals", "Veneers", "Extractions", "Sinus Lift"],
  priority: 80,
  status: "verification_pending",
  publicVisibility: false,
  overview: {
    shortDescription: "Istanbul Dis Akademisi is a private dental clinic located in Maltepe, Istanbul. The clinic features an in-house CAD/CAM digital laboratory and provides verified dental treatments to international patients.",
    longDescription: "Established in 2020, Istanbul Dis Akademisi is a private dental clinic located on the Asian side of Istanbul in the Maltepe district. The facility features 14 treatment rooms and a VIP relaxation area, providing comprehensive dental care to its patients.\n\nThe clinic is equipped with an in-house CAD/CAM fully digital laboratory, allowing for efficient and high-quality production of dental prosthetics. It operates 7 days a week from 09:00 to 21:00. Istanbul Dis Akademisi provides 24/7 online support through its international patient department.\n\nThe clinic offers a wide range of verified dental treatments including dental implants, veneers, crowns, and teeth whitening. Final treatment suitability and exact pricing are determined following a clinical examination and physician assessment.",
    specialties: ["Oral and Maxillofacial Surgery", "Periodontology", "Oral Diagnosis", "Endodontics", "Prosthetic Dentistry", "Aesthetic Dentistry"],
    highlightedTreatments: ["all-on-6-dental-implants", "dental-implants", "cad-cam-system-monolithic-zirconium-crown", "hollywood-smile"],
    targetPatientProfile: "International and domestic patients seeking comprehensive dental treatments. Kesin tedavi uygunluğu, klinik muayenesi ve hekim değerlendirmesi sonrasında belirlenir.",
    healthTourismExperience: "Provides services for international patients with a 24/7 online international patient department.",
    internationalPatientSupport: true,
    transferSupport: false,
    accommodationSupport: false
  },
  location: {
    country: "Türkiye",
    countryCode: "TR",
    city: "İstanbul",
    district: "Maltepe",
    region: "İstanbul Asian Side",
  },
  supportedLanguages: ["Turkish", "English"],
  verificationStatus: "source_inferred_requires_review",
  agencySlug: "feelinhealthy"
};

const TREATMENTS_AND_PRICES = [
  { name: "All-on-6 Dental Implants", price: 5000, currency: "EUR", duration: "1 Day", type: "source_average" },
  { name: "Dental Implants", price: 420, currency: "EUR", duration: "1 Day", type: "source_average" },
  { name: "Sinus Lift", price: 350, currency: "EUR", duration: "1 Day", type: "source_average" },
  { name: "CAD/CAM System Monolithic Zirconium Crown", price: 180, currency: "EUR", duration: "7 Day", type: "source_average" },
  { name: "Hollywood Smile", price: 3600, currency: "EUR", duration: "5 Day", type: "source_average" },
  { name: "Laser Teeth Whitening", price: 150, currency: "EUR", duration: "1 Day", type: "source_average" },
  { name: "Teeth Cleaning", price: 70, currency: "EUR", duration: "1 Day", type: "source_average" },
  { name: "Mouth Guard", price: 80, currency: "EUR", duration: "1 Day", type: "source_average" },
  { name: "Root Canals", price: 200, currency: "EUR", duration: "1 Day", type: "source_average" },
  { name: "EMAX Laminate Veneers", price: 0, currency: "EUR", duration: "1 Day", type: "source_average" }
];

const DOCTORS = [
  { fullName: "Sevda Tok", specialty: "Endodontics", experience: "11 years", languages: ["Turkish", "English"], explicitTreatment: "Root canal treatment", sourceSpecialtyLabel: "Endodontics", sourceUrl: SOURCE_URL },
  { fullName: "Ezgi Yazar", specialty: "Oral and Maxillofacial Surgery", experience: "10 years", languages: ["Turkish", "English"], sourceUrl: SOURCE_URL },
  { fullName: "Deniz Çağlar", specialty: "Periodontology", experience: "13 years", languages: ["English"], sourceUrl: SOURCE_URL },
  { fullName: "Candan Yavuz", specialty: "Aesthetic Dentistry", experience: "10 years", languages: ["English", "Turkish"], explicitTreatment: "Zirconium crowns", sourceSpecialtyLabel: "Zirconium crowns", sourceUrl: SOURCE_URL },
  { fullName: "Ahmet Dörtköşe", specialty: "Oral Diagnosis", experience: "32 years", languages: ["Turkish"], sourceUrl: SOURCE_URL }
];

const KB_DOCS = [
  { knowledgeType: "clinic_overview", title: "Istanbul Dis Akademisi Overview", content: "Established in 2020, Istanbul Dis Akademisi is a private dental clinic located in Maltepe, Asian side of Istanbul. Note: While the source claims 7 dentists and 5 specialists (12 total), only 5 doctor profiles are explicitly listed and verified.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "clinic_facilities", title: "Clinic Facilities", content: "The clinic features 14 treatment rooms and a VIP relaxation area to provide comfortable care for patients.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "digital_laboratory", title: "Digital Laboratory", content: "Equipped with an in-house fully digital laboratory.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "cad_cam_services", title: "CAD/CAM Services", content: "The clinic utilizes an in-house CAD/CAM system for efficient and high-quality production of dental prosthetics, such as monolithic zirconium crowns.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "international_patient_department", title: "International Patient Department", content: "Provides 24/7 online support through its international patient department. However, the physical clinic is open from 09:00 to 21:00.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "opening_hours", title: "Opening Hours", content: "The physical clinic operates 7 days a week from 09:00 to 21:00.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "implant_treatments", title: "Implant Treatments", content: "Offers Dental Implants (average 420 EUR) and All-on-6 Dental Implants (average 5000 EUR). Sinus Lift procedures are also available.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "veneer_treatments", title: "Veneer Treatments", content: "Provides EMAX Laminate Veneers.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "crown_treatments", title: "Crown Treatments", content: "Provides CAD/CAM System Monolithic Zirconium Crowns (average 180 EUR).", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "whitening_and_cleaning", title: "Teeth Whitening and Cleaning", content: "Offers Laser Teeth Whitening (average 150 EUR) and Teeth Cleaning (average 70 EUR).", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "treatment_process", title: "Treatment Process", content: "Final treatment plan and exact pricing are provided only after a clinical examination and assessment by the dentist.", locale: "en", translationStatus: "verified_from_source" },
  { knowledgeType: "clinic_policy", title: "Clinic Policy", content: "Prices listed are source averages and may vary. Actual clinic appointments are subject to availability within the 09:00-21:00 working hours.", locale: "en", translationStatus: "verified_from_source" }
];

async function main() {
  console.log("[LOG] Importing Firebase helper...");
  const { getAdminDb } = await import("../lib/firebase-admin");
  console.log("[LOG] Firebase helper imported");

  const db = getAdminDb();
  if (!db) {
    console.error(`
[HATA] Firebase Admin yetkilendirmesi başarısız oldu.
`);
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
  const duplicateSearchSlugs = ["istanbul-dis-akademisi", "istanbul_dis_akademisi"];
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
  for (const t of TREATMENTS_AND_PRICES) {
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

  // Doctors
  console.log(`\n--- Doctors ---`);
  for (const doc of DOCTORS) {
    const dSnap = await db.collection("agencies").doc(agencyId).collection("clinics").doc(clinicId).collection("doctors")
      .where("fullName", "==", doc.fullName).get();
      
    if (dSnap.empty) {
      console.log(`[Doctor] Will CREATE: ${doc.fullName} (${doc.specialty})`);
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
      
      // Update the clinic's internal verified count for doctors to 5, and flag discrepancy
      await clinicRef.set({
         metadata: {
           doctorCountDiscrepancy: "Source claims 7 dentists and 5 specialists (12 total), but only lists 5 explicitly. We created 5 profiles.",
           activeDoctorCount: 5,
           reviewRequired: true
         }
      }, { merge: true });
    }
  }

  console.log("\n[LOG] Script completed.");
}

main().catch(console.error);
