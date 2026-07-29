console.log("[LOG] Script entry reached");

import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

console.log("[LOG] Environment loaded");

const args = process.argv.slice(2);
const isDryRun = !args.includes("--apply");

const SOURCE_URL = "https://feelinhealthy.com/medicalcenter/yeditepe-university-dental-hospital";

const CLINIC_DATA = {
  clinicId: "yeditepe-university-dental-hospital",
  clinicName: "Yeditepe University Dental Hospital",
  clinicSlug: "yeditepe-university-dental-hospital",
  internalKey: "yeditepe_university_dental_hospital",
  sourceUrl: SOURCE_URL,
  profileUrl: SOURCE_URL,
  clinicType: "university_dental_hospital",
  category: "dental",
  treatmentCategories: ["dental"],
  subTreatments: ["Dental Implant", "Zirconium Crowns", "Hollywood Smile", "Veneers", "Teeth Whitening", "Root Canals", "Extractions"],
  priority: 90,
  status: "active",
  publicVisibility: true,
  overview: {
    shortDescription: "Yeditepe University Dental Hospital is Türkiye's first Dental Hospital affiliated with a foundation university. Located in Istanbul, it provides comprehensive dental care across all fields with its dedicated team of professionals and state-of-the-art technologies.",
    longDescription: "Yeditepe University Dental Hospital is Türkiye's first Dental Hospital affiliated with a foundation university. Since its establishment, it has maintained its status as a pioneering institution at both the national and international levels in its field. With a strong team, it continuously achieves milestones by incorporating the latest technology.\n\nEquipped with state-of-the-art facilities and a distinguished staff, our hospital continues to lead the industry by providing high-quality healthcare services. We aim to utilize all the possibilities of modern dentistry to provide the best diagnosis and treatment of oral and dental diseases. We are dedicated to providing high-quality oral and dental care to our patients, upholding ethical principles and respecting patient rights, without compromise.\n\nAt our hospital, a dedicated team of 200 professionals is ready to provide comprehensive dental care across all fields. Türkiye’s most distinguished doctors in their respective areas use state of-the-art technologies, best practices with high quality materials to provide each of our patients with the best dental treatment. With 120 units and three operating rooms for procedures under general anesthesia, we ensure excellence in healthcare services.",
    specialties: ["Oral and Maxillofacial Surgery", "Pediatric Dentistry", "Prosthetic Dentistry", "Periodontics", "Restorative Dentistry", "Orthodontics", "Endodontics", "Oral, Dental and Maxillofacial Radiology"],
    highlightedTreatments: ["all-on-6-dental-implants", "all-on-4-dental-implants", "hollywood-smile"],
    targetPatientProfile: "International and domestic patients seeking academic-level dental care, comprehensive treatments, and advanced procedures under general anesthesia. Final suitability is determined after clinical examination.",
    healthTourismExperience: "Provides high-quality healthcare services for international patients, meeting Joint Commission International (JCI) standards.",
    internationalPatientSupport: true,
    transferSupport: false,
    accommodationSupport: false
  },
  location: {
    city: "Istanbul",
    country: "Turkey",
    region: "Asian Side"
  },
  supportedLanguages: ["English", "Turkish"],
  agencySlug: "feelinhealthy"
};

const TREATMENTS_AND_PRICES = [
    { name: "Dentist Consultation", price: 0, currency: "EUR", duration: "1 Day", type: "exact" },
    { name: "Implant Dentist Consultation", price: 0, currency: "EUR", duration: "1 Day", type: "exact" },
    { name: "All-on-6 Dental Implants", price: 3500, currency: "EUR", duration: "1 Day", type: "exact" },
    { name: "All-on-4 Dental Implants", price: 3000, currency: "EUR", duration: "1 Day", type: "exact" },
    { name: "Single Implant", price: 200, currency: "EUR", duration: "1 Day", type: "exact" },
    { name: "E-Max Crown", price: 160, currency: "EUR", duration: "1 Day", type: "exact" },
    { name: "Zirconia Crown", price: 160, currency: "EUR", duration: "1 Day", type: "exact" },
    { name: "E-Max Laminate Veneers cerec", price: 160, currency: "EUR", duration: "1 Day", type: "exact" },
    { name: "Hollywood Smile", price: 3500, currency: "EUR", duration: "1 Day", type: "exact" },
    { name: "Teeth Cleaning", price: 30, currency: "EUR", duration: "1 Day", type: "exact" },
    { name: "Teeth Whitening", price: 110, currency: "EUR", duration: "1 Day", type: "exact" },
    { name: "General Anesthesia for Dental Treatments", price: 550, currency: "EUR", duration: "1 Day", type: "exact" },
    { name: "Extractions", price: 30, currency: "EUR", duration: "1 Day", type: "exact" },
    { name: "Mouth Guard", price: 250, currency: "EUR", duration: "1 Day", type: "exact" },
    { name: "Root Canals", price: 90, currency: "EUR", duration: "1 Day", type: "exact" }
];

const DOCTORS = [
  { fullName: "Prof. Dr. Ceyda Özçakır Tomruk", title: "Prof. Dr.", specialty: "Dean and Head of the Department of Oral and Maxillofacial Surgery", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. Elif Sungurtekin Ekçi", title: "Prof. Dr.", specialty: "Vice Dean and Professor of Pediatric Dentistry", sourceUrl: SOURCE_URL },
  { fullName: "Associate Professor Fatih CABBAR", title: "Doç. Dr.", specialty: "Medical Coordinator, Oral and Maxillofacial Surgery", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. Ender Kazazoglu", title: "Prof. Dr.", specialty: "Head of the Department of Prosthetic Dentistry", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. Bahar Eren Kuru", title: "Prof. Dr.", specialty: "Head of the Department of Periodontics", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. Esra Can", title: "Prof. Dr.", specialty: "Head of the Department of Restorative Dentistry", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. Derya Çakan", title: "Prof. Dr.", specialty: "Head of Department of Orthodontics", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. R. Figen KAPTAN", title: "Prof. Dr.", specialty: "Head of the Department of Endodontics", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. Senem Selvi Kuvvetli", title: "Prof. Dr.", specialty: "Head of Pediatric Dentistry Department", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. Zehra Semanur Dölekoglu", title: "Prof. Dr.", specialty: "Head of the Department of Oral, Dental and Maxillofacial Radiology", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. Jale Tanalp", title: "Prof. Dr.", specialty: "Endodontics", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. Ahmet Hamdi Arslan", title: "Prof. Dr.", specialty: "Oral, Dental and Jaw Surgery", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. Dilhan İlgüy", title: "Prof. Dr.", specialty: "Oral, Dental and Maxillofacial Radiology", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. Haktan Yurdagüven", title: "Prof. Dr.", specialty: "Restorative Dentistry", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. Koray Oral", title: "Prof. Dr.", specialty: "Prosthetic Dentistry", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. İdil Dikbaş", title: "Prof. Dr.", specialty: "Prosthetic Dentistry", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. Pınar Kursoğlu", title: "Prof. Dr.", specialty: "Prosthetic Dentistry", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. Özlem Malkondu", title: "Prof. Dr.", specialty: "Prosthetic Dentistry", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. Nuray Çapa", title: "Prof. Dr.", specialty: "Prosthetic Dentistry", sourceUrl: SOURCE_URL },
  { fullName: "Prof. Dr. Zeynep Özkurt Kayahan", title: "Prof. Dr.", specialty: "Prosthetic Dentistry", sourceUrl: SOURCE_URL },
  { fullName: "Asisst Prof. Yunus Emre ÖZDEN", title: "Dr. Öğr. Üyesi", specialty: "Prosthetic Dentistry", sourceUrl: SOURCE_URL }
];

const KB_DOCS = [
  {
    knowledgeType: "clinic_overview",
    title: "Yeditepe University Dental Hospital Overview (EN)",
    content: "Yeditepe University Dental Hospital is Türkiye's first Dental Hospital affiliated with a foundation university. Located in Istanbul, it provides comprehensive dental care across all fields with its dedicated team of 200 professionals. Equipped with 120 units and three operating rooms, it leads the industry by providing high-quality healthcare services.",
    locale: "en",
    translationStatus: "verified_from_source"
  },
  {
    knowledgeType: "clinic_overview",
    title: "Yeditepe Üniversitesi Diş Hastanesi Genel Bakış (TR)",
    content: "Yeditepe Üniversitesi Diş Hastanesi, Türkiye'nin bir vakıf üniversitesine bağlı ilk Diş Hastanesidir. İstanbul'da yer alan hastane, 200 kişilik uzman kadrosuyla tüm alanlarda kapsamlı ağız ve diş sağlığı hizmetleri sunmaktadır. 120 ünite ve üç ameliyathanesi ile yüksek kaliteli sağlık hizmetleri sunarak sektörde öncü konumunu sürdürmektedir.",
    locale: "tr",
    translationStatus: "ai_assisted_requires_review"
  },
  {
    knowledgeType: "accreditation",
    title: "JCI Accreditation (EN)",
    content: "Yeditepe University Dental Hospital stands as the world's first and only Dental Hospital to receive accreditation five times in a row from the Joint Commission International (JCI), reinforcing its commitment to excellence.",
    locale: "en",
    translationStatus: "verified_from_source"
  },
  {
    knowledgeType: "accreditation",
    title: "JCI Akreditasyonu (TR)",
    content: "Yeditepe Üniversitesi Diş Hastanesi, Joint Commission International (JCI) tarafından üst üste beş kez akredite edilen dünyadaki ilk ve tek Diş Hastanesi olma özelliğini taşıyarak mükemmellik konusundaki kararlılığını pekiştirmektedir.",
    locale: "tr",
    translationStatus: "ai_assisted_requires_review"
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

  // PRE-FLIGHT COUNT
  const allClinicsSnap = await db.collection("agencies").doc(agencyId).collection("clinics").get();
  const preCount = allClinicsSnap.size;
  const preClinicNames = allClinicsSnap.docs.map(d => ({ id: d.id, name: d.data().clinicName }));
  
  console.log(`\n[PRE-FLIGHT] Existing Clinics Count: ${preCount}`);
  preClinicNames.forEach(c => console.log(` - [${c.id}] ${c.name}`));

  console.log("\n[LOG] Clinic lookup starting");
  const clinicSnap = await db.collection("agencies").doc(agencyId).collection("clinics")
    .where("clinicSlug", "==", CLINIC_DATA.clinicSlug).get();

  let clinicRef;
  let clinicId;
  let isUpdate = false;

  if (clinicSnap.empty) {
    console.log(`[Clinic] Not found. Will CREATE.`);
    clinicRef = db.collection("agencies").doc(agencyId).collection("clinics").doc();
    clinicId = clinicRef.id;
  } else {
    isUpdate = true;
    clinicRef = clinicSnap.docs[0].ref;
    clinicId = clinicRef.id;
    console.log(`[Clinic] Found existing (ID: ${clinicId}). Will UPDATE.`);
  }

  // Calculate expected count
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
  let createdPrices = 0;
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
      createdPrices++;
    } else {
      console.log(`[Pricing] Found existing: ${t.name}. Skipping.`);
    }
  }

  // Doctors
  console.log(`\n--- Doctors ---`);
  let createdDoctors = 0;
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
      createdDoctors++;
    } else {
      console.log(`[Doctor] Found existing: ${doc.fullName}. Skipping.`);
    }
  }

  // Knowledge Base (in knowledge_documents)
  console.log(`\n--- AI Knowledge Base ---`);
  let createdKB = 0;
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
        
        // chunk
        await newKbRef.collection("chunks").add({
          content: kb.content,
          orderIndex: 0,
          createdAt: new Date()
        });
      }
      createdKB++;
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
    }
  }

  console.log("\n[LOG] Script completed.");
}

main().catch(console.error);
