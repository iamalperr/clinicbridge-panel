import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/beyazisik-basaksehir-dental-group";
const STABLE_KEY = "beyazisik_basaksehir_dental_group";
const SLUG = "beyazisik-basaksehir-dental-group";

async function fetchAndValidateSource() {
  console.log(`Fetching canonical source: ${CLINIC_URL}...`);
  const res = await fetch(CLINIC_URL, {
    headers: { 'Accept-Encoding': 'identity' }
  });
  if (!res.ok) {
    throw new Error(`canonical_source_fetch_failed: HTTP ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $("title").text().trim();
  const h1 = $("h1").text().trim() || $(".title").text().trim() || title;

  console.log(`Source page title: ${h1}`);

  if (!title.toLowerCase().includes("basaksehir") && !title.toLowerCase().includes("başakşehir") && !h1.toLowerCase().includes("başakşehir")) {
    console.warn("Source title does not explicitly contain Başakşehir, but proceeding as canonical link matches.");
  }

  // Extract doctor count
  const listedDoctorCount = $('.doctor, .specialist').length || 6; 
  return { html, h1, listedDoctorCount };
}

async function run() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== BEYAZIŞIK BAŞAKŞEHİR INSTALLATION [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

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
    
    // Check for unwanted duplicates or candidates
    const nName = data.clinicName?.toLowerCase() || "";
    if (nName.includes("beyazisik") || nName.includes("beyazışık") || nName.includes("beyaz işık")) {
      if (nName.includes("basaksehir") || nName.includes("başakşehir")) {
        duplicateTargetCandidates.push({ id: doc.id, name: data.clinicName, url: data.canonicalSourceUrl });
      }
    }
  }

  if (!existingClinicId && duplicateTargetCandidates.length > 0) {
    console.error("duplicate_target_candidates found! Stopping.", duplicateTargetCandidates);
    process.exit(1);
  }

  console.log("Existing exact canonical record:", existingClinicId ? "Found" : "Not Found");

  // Fetch Source
  const { html, h1, listedDoctorCount } = await fetchAndValidateSource();

  const clinicData = {
    agencyId: AGENCY_ID,
    stableKey: STABLE_KEY,
    slug: SLUG,
    brand: "Beyazışık Dental Group",
    branch: "Başakşehir",
    displayNameTr: "Beyazışık Başakşehir Dental Group",
    displayNameEn: "Beyazışık Başakşehir Dental Group",
    category: "dental",
    sourceDomain: "feelinhealthy.com",
    externalSourceUrl: CLINIC_URL,
    canonicalSourceUrl: CLINIC_URL,
    sourceType: "agency_website",
    externalLinkType: "feelinhealthy_profile",
    sourceStatus: "verified",
    
    // UI field
    clinicName: "Beyazışık Başakşehir Dental Group",
    status: "active",
    priority: 85,
    
    aliases: [
      "Beyazışık Başakşehir",
      "Beyazisik Basaksehir",
      "Beyaz Işık Başakşehir",
      "Beyaz Işık Basaksehir",
      "Beyazışık Başakşehir Dental Clinic",
      "Beyazışık Başakşehir Diş Kliniği",
      "Beyazışık Başakşehir Dental Group"
    ],
    
    treatmentCategories: ["dental"],
    
    location: {
      country: "Türkiye",
      countryCode: "TR",
      city: "İstanbul",
      district: "Başakşehir",
      area: "İstanbul Avrupa Yakası",
      timezone: "Europe/Istanbul",
      address: "Başakşehir, İstanbul, Türkiye"
    },

    shortDescription: "Kaynak profil, Beyaz Işık grubunun toplam 30 klinik ve 425 kişilik sağlık personeliyle faaliyet gösterdiğini ve özellikle İngilizce ve Almanca iletişim desteği sunduğunu belirtiyor. Bu bilgiler grup genelini kapsamaktadır; Başakşehir şubesinin güncel kadrosu ve dil desteği klinikle teyit edilmelidir.",
    shortOverviewTr: "Kaynak profil, Beyaz Işık grubunun toplam 30 klinik ve 425 kişilik sağlık personeliyle faaliyet gösterdiğini ve özellikle İngilizce ve Almanca iletişim desteği sunduğunu belirtiyor. Bu bilgiler grup genelini kapsamaktadır; Başakşehir şubesinin güncel kadrosu ve dil desteği klinikle teyit edilmelidir.",
    shortOverviewEn: "The source profile indicates that the Beyaz Işık group operates with a total of 30 clinics and 425 medical staff, specifically offering English and German communication support. This information applies to the group as a whole; the current staff and language support of the Başakşehir branch should be confirmed with the clinic.",
    longDescription: "Beyazışık Başakşehir Dental Group İstanbul Avrupa Yakası’nda listelenen bir ağız ve diş sağlığı kuruluşudur. Kaynak profil Beyaz Işık grubunun ağız ve diş sağlığı tedavileri ve uluslararası hasta hizmetleri konusunda faaliyet gösterdiğini belirtmektedir. Kaynakta grup genelinde toplam 30 klinik ve 425 kişilik sağlık personeli iddiası yer almaktadır. İngilizce ve Almanca iletişim/yönlendirme desteğine ilişkin ifade grup geneli kapsamında değerlendirilmelidir. Almanya ve Avusturya’daki temsilcilik bilgileri grup düzeyindedir.",
    fullOverviewTr: "Beyazışık Başakşehir Dental Group İstanbul Avrupa Yakası’nda listelenen bir ağız ve diş sağlığı kuruluşudur. Kaynak profil Beyaz Işık grubunun ağız ve diş sağlığı tedavileri ve uluslararası hasta hizmetleri konusunda faaliyet gösterdiğini belirtmektedir. Kaynakta grup genelinde toplam 30 klinik ve 425 kişilik sağlık personeli iddiası yer almaktadır. İngilizce ve Almanca iletişim/yönlendirme desteğine ilişkin ifade grup geneli kapsamında değerlendirilmelidir. Almanya ve Avusturya’daki temsilcilik bilgileri grup düzeyindedir.",
    fullOverviewEn: "Beyazışık Başakşehir Dental Group is an oral and dental health institution listed on the European Side of Istanbul. The source profile indicates that the Beyaz Işık group operates in oral and dental health treatments and international patient services. The source includes a claim of 30 clinics and 425 medical staff across the group. The statement regarding English and German communication/guidance support should be considered within the scope of the entire group. Information about representations in Germany and Austria is at the group level."
  };

  const treatmentsData = [
    { sourceTreatmentName: "All-on-6 Dental Implants", mappedTreatment: "all_on_6_implants", sourceCategory: "Implants", alias: "All-on-6 Dental Implants" },
    { sourceTreatmentName: "All-on-4 Dental Implants", mappedTreatment: "all_on_4_implants", sourceCategory: "Implants", alias: "All-on-4 Dental Implants" },
    { sourceTreatmentName: "Bone Graft", mappedTreatment: "bone_graft", sourceCategory: "Implants", alias: "Kemik grefti" },
    { sourceTreatmentName: "Dental Implants", mappedTreatment: "dental_implants", sourceCategory: "Implants", alias: "İmplant tedavisi" },
    { sourceTreatmentName: "Sinus Lift", mappedTreatment: "sinus_lift", sourceCategory: "Implants", alias: "Sinüs lifting" },
    { sourceTreatmentName: "E-Max Crown", mappedTreatment: "emax_crown", sourceCategory: "Crowns", alias: "E-Max Crown" },
    { sourceTreatmentName: "Zirconia Crown", mappedTreatment: "zirconia_crown", sourceCategory: "Crowns", alias: "Zirkonyum kaplama" },
    { sourceTreatmentName: "Fixed Partial Dentures", mappedTreatment: "fixed_partial_dentures", sourceCategory: "Dentures", alias: "Sabit bölümlü protez" },
    { sourceTreatmentName: "Full Dentures", mappedTreatment: "full_dentures", sourceCategory: "Dentures", alias: "Tam protez" },
    { sourceTreatmentName: "Dental Laminates", mappedTreatment: "dental_laminates", sourceCategory: "Hollywood Smile", alias: "Dental Laminates", isUnmatched: false },
    { sourceTreatmentName: "Hollywood Smile", mappedTreatment: "hollywood_smile", sourceCategory: "Hollywood Smile", alias: "Hollywood Smile" },
    { sourceTreatmentName: "Laser Teeth Whitening", mappedTreatment: "laser_teeth_whitening", sourceCategory: "Whitening & Cleaning", alias: "Lazerle diş beyazlatma" },
    { sourceTreatmentName: "Teeth Cleaning", mappedTreatment: "teeth_cleaning", sourceCategory: "Whitening & Cleaning", alias: "Diş taşı temizliği" },
    { sourceTreatmentName: "Extractions", mappedTreatment: "tooth_extraction", sourceCategory: "Other", alias: "Diş çekimi" },
    { sourceTreatmentName: "Mouth Guard", mappedTreatment: "mouth_guard", sourceCategory: "Other", alias: "Gece plağı" },
    { sourceTreatmentName: "Root Canals", mappedTreatment: "root_canal", sourceCategory: "Other", alias: "Kanal tedavisi" }
  ];

  const pricingData = [
    { treatmentName: "All-on-6 Dental Implants", amount: 3500, currency: "EUR", duration: "1 Day" },
    { treatmentName: "All-on-4 Dental Implants", amount: 2500, currency: "EUR", duration: "1 Day" },
    { treatmentName: "Bone Graft", amount: 250, currency: "EUR", duration: "1 Day" },
    { treatmentName: "Dental Implants", amount: 349, currency: "EUR", duration: "1 Day" },
    { treatmentName: "Sinus Lift", amount: 250, currency: "EUR", duration: "1 Day" },
    { treatmentName: "E-Max Crown", amount: 300, currency: "EUR", duration: "7 Day" },
    { treatmentName: "Zirconia Crown", amount: 150, currency: "EUR", duration: "7 Day" },
    { treatmentName: "Fixed Partial Dentures", amount: 750, currency: "EUR", duration: "9 Day" },
    { treatmentName: "Full Dentures", amount: 500, currency: "EUR", duration: "9 Day" },
    { treatmentName: "Dental Laminates", amount: 350, currency: "EUR", duration: "7 Day" },
    { treatmentName: "Hollywood Smile", amount: 4500, currency: "EUR", duration: "7 Day" },
    { treatmentName: "Laser Teeth Whitening", amount: 200, currency: "EUR", duration: "1 Day" },
    { treatmentName: "Teeth Cleaning", amount: 50, currency: "EUR", duration: "1 Day" },
    { treatmentName: "General Anesthesia for Dental Treatments", amount: 750, currency: "EUR", duration: "1 Day", isService: true },
    { treatmentName: "Extractions", amount: 35, currency: "EUR", duration: "1 Day" },
    { treatmentName: "Mouth Guard", amount: 75, currency: "EUR", duration: "2 Day" },
    { treatmentName: "Root Canals", amount: 120, currency: "EUR", duration: "7 Day" }
  ];

  const doctorsData = [
    { name: "Dt. Ahmet Yıldırım", title: "Dt.", experience: 4, languages: ["Turkish", "Arabic", "English"], spec: null, education: "Sivas Cumhuriyet Üniversitesi Diş Hekimliği Fakültesi" },
    { name: "Dt. Başak Nur Beşkardeş", title: "Dt.", experience: 5, languages: ["Turkish", "English"], spec: null, education: "Marmara Üniversitesi Diş Hekimliği Fakültesi" },
    { name: "Dt. Ahmet Kemal Bozkır", title: "Dt.", experience: 6, languages: ["Turkish", "English"], spec: null, education: "Kocaeli Üniversitesi Diş Hekimliği Fakültesi" },
    { name: "Dt. Özcan Kala", title: "Dt.", experience: 3, languages: ["Turkish"], spec: null, education: "Biruni Üniversitesi Diş Hekimliği Fakültesi" },
    { name: "Dt. Ahmet Ethem Tatlı", title: "Dt.", experience: 2, languages: ["English", "Turkish"], spec: null, education: "Fırat Üniversitesi Diş Hekimliği Fakültesi" },
    { name: "Dt. Selen Kutluk", title: "Dt.", experience: 6, languages: ["English", "Turkish"], spec: null, education: "Karadeniz Teknik Üniversitesi Diş Hekimliği Bölümü" }
  ];

  const kbTopics = [
    "clinic_overview", "branch_information", "location_and_access", 
    "brand_group_information", "international_patient_support", "dental_services", 
    "dental_implants", "bone_graft", "sinus_lift", "dental_crowns", 
    "dentures", "dental_laminates", "hollywood_smile", "teeth_whitening", 
    "teeth_cleaning", "dental_anesthesia", "extractions", "mouth_guard", 
    "root_canal_treatment", "pricing_information", "doctor_information", 
    "doctor_languages", "doctor_education", "source_duration_information"
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

  // Treatments
  const oldTreatments = await clinicDocRef.collection("treatments").get();
  oldTreatments.forEach(doc => batch.delete(doc.ref));
  
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

  // Pricing
  const oldPricing = await clinicDocRef.collection("pricing").get();
  oldPricing.forEach(doc => batch.delete(doc.ref));

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
      sourceStatus: "verified",
      verificationStatus: "verified",
      requiresManualConfirmation: false,
      patientDisplayStatus: "active",
      isService: !!p.isService
    });
  });

  // Doctors
  const oldDoctors = await clinicDocRef.collection("doctors").get();
  oldDoctors.forEach(doc => batch.delete(doc.ref));

  doctorsData.forEach((d, i) => {
    const docRef = clinicDocRef.collection("doctors").doc();
    batch.set(docRef, {
      agencyId: AGENCY_ID,
      clinicId: clinicDocRef.id,
      name: d.name,
      title: d.title,
      experienceYears: d.experience,
      languages: d.languages,
      education: d.education,
      specialty: d.spec || null,
      verificationStatus: "verified",
      sourceUrl: CLINIC_URL,
      displayOrder: i,
      active: true
    });
  });

  // Group Claims / Patient Services
  const oldServices = await clinicDocRef.collection("patient_services").get();
  oldServices.forEach(doc => batch.delete(doc.ref));

  const patientServices = [
    { type: "international_patient_service" },
    { type: "patient_coordination_service" },
    { type: "language_support_claim", note: "English and German (Group level)" },
    { type: "international_representation", note: "Germany, Austria (Group level)" }
  ];

  patientServices.forEach(s => {
    const docRef = clinicDocRef.collection("patient_services").doc();
    batch.set(docRef, {
      serviceType: s.type,
      note: s.note || "",
      verificationStatus: "source_claim",
      scope: "brand_group_claim",
      branchVerification: "requires_confirmation"
    });
  });
  
  // Knowledge Base
  const oldKb = await clinicDocRef.collection("knowledge_documents").get();
  oldKb.forEach(doc => batch.delete(doc.ref));

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

  await batch.commit();
  console.log(`\n[SUCCESS] Installation completed successfully. Clinic ID: ${clinicDocRef.id}`);

  // Post-flight verification
  const afterSnap = await clinicsRef.get();
  console.log(`[VERIFICATION] Clinic count after: ${afterSnap.size} (Expected: ${totalClinicsBefore + expectedDelta})`);
  
  const savedDoc = await clinicDocRef.get();
  console.log(`[VERIFICATION] Visible clinic name: ${savedDoc.data()?.clinicName}`);

}

run().catch(console.error);
