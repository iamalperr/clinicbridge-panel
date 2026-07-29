console.log("[LOG] Script entry reached");

import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

console.log("[LOG] Environment loaded");

const args = process.argv.slice(2);
const isDryRun = !args.includes("--apply");

const SOURCE_URL = "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-camlica";

const CLINIC_DATA = {
  clinicId: "hospitadent-dental-group-camlica",
  clinicName: "Hospitadent Dental Group Çamlıca",
  clinicSlug: "hospitadent-dental-group-camlica",
  internalKey: "hospitadent_dental_group_camlica",
  sourceUrl: SOURCE_URL,
  profileUrl: SOURCE_URL,
  clinicType: "external",
  category: "dental",
  treatmentCategories: ["dental"],
  subTreatments: ["Dental Implant", "Zirconium Crowns", "Hollywood Smile", "Bone Graft", "Sinus Lift", "Veneers"],
  priority: 92,
  status: "active",
  publicVisibility: true,
  // Modern overview struct
  overview: {
    shortDescription: "Hospitadent Dental Group Çamlıca is a modern dental clinic located on Istanbul’s Asian side. It provides comprehensive oral and dental health services and assists international patients with multilingual support and VIP transfers.",
    longDescription: "Opened in 2009, Dental Group Hospitadent Çamlıca Dental Hospital is a reliable dental clinic on Istanbul’s Asian side. Spanning 1,250 m², it features 13 high-tech treatment units and a fully equipped operating room for comprehensive dental care.\n\nThe clinic offers verified treatments including Dental Implants, Zirconium Crowns, E-Max Crowns, Full Dentures, and Hollywood Smile design. The clinical approach ensures patients receive a tailored treatment plan before arrival.\n\nFor international patients, Hospitadent Çamlıca provides multilingual assistance in English, German, French, Arabic, Russian, and Bulgarian. A complimentary VIP airport transfer service is available. Final treatment planning and pricing are determined after comprehensive clinical and radiographic evaluation.",
    specialties: ["Implantology", "Aesthetic Dentistry", "Prosthodontics", "Oral Surgery"],
    highlightedTreatments: ["all-on-6-dental-implants", "all-on-4-dental-implants", "hollywood-smile", "zirconia-crown"],
    targetPatientProfile: "International patients seeking dental implant evaluations, restorative treatments, or cosmetic dentistry (like Hollywood Smile). Final suitability is determined after clinical examination.",
    healthTourismExperience: "Offers dedicated international patient coordination, multilingual support, and complimentary VIP airport transfers.",
    internationalPatientSupport: true,
    transferSupport: true,
    accommodationSupport: false
  },
  location: {
    city: "Istanbul",
    country: "Turkey",
    region: "Asian Side"
  },
  supportedLanguages: ["English", "German", "French", "Arabic", "Russian", "Bulgarian"],
  agencySlug: "feelinhealthy"
};

const TREATMENTS_AND_PRICES = [
  { name: "All-on-6 Dental Implants", price: 3740.00, currency: "EUR", duration: "3 Day", type: "exact" },
  { name: "All-on-4 Dental Implants", price: 2640.00, currency: "EUR", duration: "3 Day", type: "exact" },
  { name: "Bone Graft", price: 600.00, currency: "EUR", duration: "5 Day", type: "exact" },
  { name: "Dental Implants", price: 399.00, currency: "EUR", duration: "3 Day", type: "exact" },
  { name: "Sinus Lift", price: 600.00, currency: "EUR", duration: "5 Day", type: "exact" },
  { name: "E-Max Crown", price: 330.00, currency: "EUR", duration: "7 Day", type: "exact" },
  { name: "Zirconia Crown", price: 250.00, currency: "EUR", duration: "7 Day", type: "exact" },
  { name: "Dentures", price: 690.00, currency: "EUR", duration: "7 Day", type: "exact" },
  { name: "Full Dentures", price: 3960.00, currency: "EUR", duration: "12 Day", type: "exact" },
  { name: "Composite Veneers", price: 130.00, currency: "EUR", duration: "7 Day", type: "exact" },
  { name: "E-Max Veneers / Full Veneers", price: 385.00, currency: "EUR", duration: "7 Day", type: "exact" },
  { name: "Hollywood Smile", price: 5000.00, currency: "EUR", duration: "7 Day", type: "package" },
  { name: "Teeth Cleaning", price: 70.00, currency: "EUR", duration: "1 Day", type: "exact" },
  { name: "Teeth Whitening", price: 250.00, currency: "EUR", duration: "1 Day", type: "exact" },
  { name: "General Anesthesia for Dental Treatments", price: 430.00, currency: "EUR", duration: "1 Day", type: "exact" },
  { name: "Sedation for Dental Treatments", price: 315.00, currency: "EUR", duration: "1 Day", type: "exact" }
];

const DOCTORS = [
  { fullName: "Hüsna Aktürk", specialty: "Dentist", sourceUrl: SOURCE_URL },
  { fullName: "Mustafa Burak Özçini", specialty: "Dentist", sourceUrl: SOURCE_URL },
  { fullName: "Keremşah Burgan", specialty: "Dentist", sourceUrl: SOURCE_URL },
  { fullName: "Gözde Şehirli Gülerer", specialty: "Dentist", sourceUrl: SOURCE_URL }
];

const KB_DOCS = [
  {
    knowledgeType: "clinic_overview",
    title: "Hospitadent Çamlıca Overview (EN)",
    content: "Hospitadent Dental Group Çamlıca is a modern dental clinic located on Istanbul’s Asian side, offering comprehensive dental services including implants, aesthetic dentistry, and prosthodontics. Operating since 2009, the 1,250 m² facility is equipped with 13 treatment units and a full operating room.",
    locale: "en",
    translationStatus: "verified_from_source"
  },
  {
    knowledgeType: "clinic_overview",
    title: "Hospitadent Çamlıca Genel Bakış (TR)",
    content: "Hospitadent Dental Group Çamlıca, İstanbul Anadolu Yakası'nda kapsamlı ağız ve diş sağlığı hizmetleri sunan modern bir kliniktir. 2009 yılından bu yana hizmet veren 1.250 m²'lik tesis, 13 tedavi ünitesi ve tam donanımlı ameliyathanesi ile implant, estetik diş hekimliği ve protetik tedaviler sunmaktadır.",
    locale: "tr",
    translationStatus: "ai_assisted_requires_review"
  },
  {
    knowledgeType: "clinic_services",
    title: "Clinic Services & Amenities (EN)",
    content: "Free panoramic X-rays, dental tomography, and complimentary VIP airport transfer service for international patients. Multilingual assistance is available in English, German, French, Arabic, Russian, and Bulgarian.",
    locale: "en",
    translationStatus: "verified_from_source"
  },
  {
    knowledgeType: "clinic_services",
    title: "Klinik Hizmetleri ve İmkanlar (TR)",
    content: "Uluslararası hastalar için ücretsiz panoramik röntgen, dental tomografi ve ücretsiz VIP havalimanı transferi hizmeti sunulmaktadır. Ayrıca İngilizce, Almanca, Fransızca, Arapça, Rusça ve Bulgarca dillerinde destek sağlanmaktadır.",
    locale: "tr",
    translationStatus: "ai_assisted_requires_review"
  },
  {
    knowledgeType: "target_profile",
    title: "Target Patient Profile (EN)",
    content: "International patients seeking dental implant evaluations, restorative treatments, or cosmetic dentistry like Hollywood Smile. Final suitability is determined after clinical examination.",
    locale: "en",
    translationStatus: "verified_from_source"
  },
  {
    knowledgeType: "target_profile",
    title: "Hedef Hasta Profili (TR)",
    content: "Yurt dışından dental implant değerlendirmesi, restoratif tedaviler veya estetik diş hekimliği (Hollywood Smile gibi) için gelen hastalar. Kesin tedavi uygunluğu klinik muayene sonrasında belirlenir.",
    locale: "tr",
    translationStatus: "ai_assisted_requires_review"
  },
  {
    knowledgeType: "opening_hours",
    title: "Opening Hours (EN)",
    content: "Monday to Saturday: 08:00 – 19:00\nSunday: Closed",
    locale: "en",
    translationStatus: "verified_from_source"
  }
];

async function main() {
  console.log("[LOG] Importing Firebase helper...");
  const { getAdminDb } = await import("../lib/firebase-admin");
  console.log("[LOG] Firebase helper imported");

  const db = getAdminDb();
  if (!db) {
    console.error(`
[HATA] Firebase Admin yetkilendirmesi başarısız oldu.
Uygulama ortamında Firebase projesi (Project ID) bulunamadı veya kimlik doğrulama sağlanamadı.
Lütfen aşağıdaki değişkenlerden bir setin (.env.local dosyasında veya sistemde) yüklü olduğundan emin olun:

Seçenek 1 (Tam Kimlik): FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
Seçenek 2 (Base64 JSON): FIREBASE_SERVICE_ACCOUNT_BASE64
Seçenek 3 (ADC): Yalnızca FIREBASE_PROJECT_ID (Gcloud application-default login ile)

Lütfen geçerli bir .env.local dosyası oluşturup tekrar deneyin.
`);
    process.exit(1);
  }
  console.log("[LOG] Firebase Admin initialized");
  
  // Rapor: Secret göstermeden Firebase Projesi
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
  console.log("[LOG] Agency found");
  const agencyId = agencySnap.docs[0].id;
  console.log(`Resolved Agency ID: ${agencyId}`);

  console.log("[LOG] Clinic lookup starting");
  // Duplicate check
  const clinicSnap = await db.collection("agencies").doc(agencyId).collection("clinics")
    .where("clinicSlug", "==", CLINIC_DATA.clinicSlug).get();

  let clinicRef;
  let clinicId;

  if (clinicSnap.empty) {
    console.log(`[Clinic] Not found. Will CREATE.`);
    clinicRef = db.collection("agencies").doc(agencyId).collection("clinics").doc();
    clinicId = clinicRef.id;
  } else {
    clinicRef = clinicSnap.docs[0].ref;
    clinicId = clinicRef.id;
    console.log(`[Clinic] Found existing (ID: ${clinicId}). Will UPDATE.`);
  }

  // Clinic payload
  const clinicPayload = {
    ...CLINIC_DATA,
    updatedAt: new Date(),
    agencyId
  };

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
      console.log(`[Pricing] Will CREATE: ${t.name} (${t.price} ${t.currency})`);
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
        console.log(`  -> Applied pricing: ${t.name} as ${docId}`);
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
      console.log(`[Doctor] Will CREATE: ${doc.fullName}`);
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

  // Knowledge Base (in knowledge_documents)
  console.log(`\n--- AI Knowledge Base ---`);
  for (const kb of KB_DOCS) {
    const kbSnap = await db.collection("knowledge_documents")
      .where("tenantId", "==", agencyId)
      .where("ownerId", "==", clinicId)
      .where("knowledgeType", "==", kb.knowledgeType)
      .get();
      
    if (kbSnap.empty) {
      console.log(`[KB] Will CREATE: ${kb.knowledgeType} - ${kb.title}`);
      if (!isDryRun) {
        await db.collection("knowledge_documents").add({
          ...kb,
          tenantId: agencyId,
          ownerType: "clinic",
          ownerId: clinicId,
          sourceUrl: SOURCE_URL,
          status: "active",
          updatedAt: new Date()
        });
      }
    } else {
      console.log(`[KB] Found existing: ${kb.knowledgeType}. Skipping.`);
    }
  }

  if (!isDryRun) {
    console.log("[LOG] Write completed");
  }

  // Final verification
  if (!isDryRun) {
    console.log(`\n--- Final Verification & Report ---`);
    const finalSnap = await clinicRef.get();
    if (finalSnap.exists) {
      const data = finalSnap.data();
      console.log(`Agency ID: ${agencyId}`);
      console.log(`Clinic ID: ${clinicId}`);
      console.log(`Document path: agencies/${agencyId}/clinics/${clinicId}`);
      console.log(`Action: ${clinicSnap.empty ? "CREATE" : "UPDATE"}`);
      console.log(`Status: ${data?.status}`);
      console.log(`Public Visibility: ${data?.publicVisibility}`);
      console.log(`Slug: ${data?.clinicSlug}`);
      console.log(`Profile URL: ${data?.profileUrl}`);
      console.log(`======================================================\n`);
      console.log("[LOG] Database verification completed");
      
      const countSnap = await db.collection("agencies").doc(agencyId).collection("clinics").get();
      console.log(`[LOG] Final Clinics Count in Agency: ${countSnap.size}`);
    } else {
      console.error(`[Error] Verification failed: Document was not found in database!`);
      process.exit(1);
    }
  } else {
    console.log(`\n--- Dry-Run Completed ---`);
    console.log(`Document path will be: agencies/${agencyId}/clinics/${clinicId}`);
  }
}

main().catch(err => {
  console.error("Unhandled exception:", err);
  process.exit(1);
});
