import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import { getAdminDb } from "../lib/firebase-admin";

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
  shortSummary: "Dental Group Hospitadent Çamlıca Dental Hospital is a modern clinic on Istanbul’s Anatolian side with 13 treatment units and a fully equipped operating room.",
  overview: "Opened in 2009, Dental Group Hospitadent Çamlıca Dental Hospital is a modern and reliable dental clinic located on Istanbul’s Anatolian side. Spanning an area of 1,250 m², the hospital features 13 high-tech treatment units and 1 fully equipped operating room, offering a full range of dental services in a safe and comfortable environment.\nAs one of the leading dental clinics in the Çamlıca region, we provide comprehensive oral and dental health services.\nTo support international patients, we offer multilingual assistance in English, German, French, Arabic, Russian, and Bulgarian.\n✨ Free panoramic X-rays and dental tomography✨ Complimentary VIP airport transfer service",
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
    title: "Hospitadent Çamlıca Overview",
    content: CLINIC_DATA.overview,
    locale: "en"
  },
  {
    knowledgeType: "clinic_services",
    title: "Clinic Services & Amenities",
    content: "Free panoramic X-rays and dental tomography. Complimentary VIP airport transfer service available.",
    locale: "en"
  },
  {
    knowledgeType: "opening_hours",
    title: "Opening Hours",
    content: "Monday to Saturday: 08:00 – 19:00\nSunday: Closed",
    locale: "en"
  }
];

async function main() {
  const db = getAdminDb();
  if (!db) {
    console.error(`
[HATA] Firebase Admin yetkilendirmesi başarısız oldu.
Uygulama ortamında aşağıdaki Firebase kimlik bilgilerine erişilemiyor:
 - FIREBASE_PROJECT_ID (veya NEXT_PUBLIC_FIREBASE_PROJECT_ID)
 - FIREBASE_CLIENT_EMAIL
 - FIREBASE_PRIVATE_KEY

Lütfen geçerli bir .env.local dosyası oluşturun veya bu değişkenleri ortama (environment) ekleyip tekrar deneyin.
Güvenlik uyarısı: Private key değerlerini doğrudan komut satırına yapıştırmayın veya Git reposuna eklemeyin.
`);
    process.exit(1);
  }
  
  console.log("======================================================");
  console.log(` FEELINHEALTHY CLINIC SETUP: ${CLINIC_DATA.clinicName} `);
  console.log("======================================================");
  console.log(isDryRun ? "MODE: DRY-RUN" : "MODE: APPLY");

  const agencySnap = await db.collection("agencies").where("slug", "==", CLINIC_DATA.agencySlug).limit(1).get();
  if (agencySnap.empty) {
    console.error("Agency 'feelinhealthy' not found.");
    process.exit(1);
  }
  const agencyId = agencySnap.docs[0].id;
  console.log(`Resolved Agency ID: ${agencyId}`);

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
        await db.collection("agencies").doc(agencyId).collection("clinics").doc(clinicId).collection("pricing").doc(t.name.toLowerCase().replace(/\s+/g, '-')).set({
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
        console.log(`  -> Applied pricing: ${t.name}`);
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

  console.log("\nProcess completed successfully.");
}

main().catch(console.error);
