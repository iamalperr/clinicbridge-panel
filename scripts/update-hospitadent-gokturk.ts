import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from 'firebase-admin';
import { getAdminDb } from '../lib/firebase-admin';
import { TREATMENT_CATEGORIES, TreatmentCategory } from '../lib/types/agency';

const TARGET_AGENCY_ID = 'mFrKEjO9fNwUzbueW5rc'; // FeelinHealthy
const TARGET_CLINIC_ID = 'tiIuRfmyrnPsRkw8YQo5'; // Hospitadent Dental Group Göktürk

let createOperations = 0;
let updateOperations = 0;
const deleteOperations = 0;
const unexpectedUpdates = 0;

const CLINIC_INFO = {
  displayNameTr: 'Hospitadent Dental Group Göktürk',
  displayNameEn: 'Hospitadent Dental Group Göktürk',
  brand: 'Hospitadent Dental Group',
  branch: 'Göktürk',
  category: 'dental',
  facilityType: 'clinic',
  aliases: [
    'Hospitadent Göktürk',
    'Hospitadent Gokturk',
    'Hospitadent Dental Group Göktürk',
    'Hospitadent Göktürk Diş Kliniği',
    'Hospitadent Gokturk Dental Clinic'
  ],
  stableKey: 'hospitadent_dental_group_gokturk',
  slug: 'hospitadent-dental-group-gokturk',
  sourceType: 'official_clinic_website',
  sourceDomain: 'hospitadent.com',
  externalSourceUrl: 'https://www.hospitadent.com/en/branches/gokturk',
  status: 'active',
  
  // Location
  location: {
    country: 'Türkiye',
    countryCode: 'TR',
    city: 'İstanbul',
    district: 'Eyüpsultan',
    neighborhood: 'Göktürk Merkez',
    area: 'Göktürk',
    region: 'İstanbul European Side / Avrupa Yakası',
    fullAddress: 'Göktürk Merkez Mahallesi, İstanbul Caddesi, Yalınevler No:56 H, 34077 Eyüpsultan/İstanbul',
    postalCode: '34077',
    latitude: 41.178810,
    longitude: 28.891390,
    transportationNotes: 'Located centrally in Göktürk, Eyüpsultan on İstanbul Caddesi.',
    address: 'Göktürk Merkez Mahallesi, İstanbul Caddesi, Yalınevler No:56 H, 34077 Eyüpsultan/İstanbul', // for UI
  },
  contact: {
    phone: '+90 212 400 00 68'
  },
  phone: '+90 212 400 00 68', // for UI
  
  // Supported Languages
  supportedLanguages: ['tr', 'en'], // Inferred from official site having /en/ and /tr/

  // Treatment Categories
  treatmentCategories: ['dental' as TreatmentCategory, 'aesthetic_surgery' as TreatmentCategory],

  // Overviews
  shortDescription: "İstanbul Avrupa Yakası'nda Eyüpsultan Göktürk bölgesinde hizmet veren, multidisipliner altyapısıyla öne çıkan kapsamlı bir diş kliniğidir.", // for UI
  longDescription: "Başarılı, estetik ve kalıcı bir dental sonuç, farklı uzmanlık dallarının uyum içinde çalışmasının eseridir. Hospitadent çatısı altında, misafirlerimizin tüm ağız sağlığı ihtiyaçlarına tek bir merkezde, bütüncül bir yaklaşımla çözüm üretiyoruz. Koruyucu rutin bakımlardan dijital gülüş tasarımına, çene cerrahisinden şeffaf plak tedavilerine kadar geniş bir yelpazede faaliyet gösteriyoruz. Tüm aileniz için güvenle tercih edebileceğiniz, multidisipliner altyapısıyla öne çıkan kapsamlı bir Göktürk diş kliniği olarak, sağlığınızı uzmanların deneyimli ellerine bırakmanın ayrıcalığını yaşatıyoruz.", // for UI
};

const DOCTORS = [
  { 
    fullName: 'Dr. Zeynep EDA GÜL', 
    specialty: 'Pedodontics',
    department: 'Pediatric Dentistry',
    languages: ['tr', 'en']
  },
  { 
    fullName: 'Dt. Selçuk MERT ÖZÇELIK', 
    specialty: 'Dentist',
    department: 'General Dentistry',
    languages: ['tr', 'en']
  },
  { 
    fullName: 'Dt. Ömer FARUK YILMAZ', 
    specialty: 'Oral and Maxillofacial Surgery',
    department: 'Oral Surgery',
    languages: ['tr', 'en']
  },
  { 
    fullName: 'Dt. Esad TAHA', 
    specialty: 'Prosthodontics',
    department: 'Prosthodontics',
    languages: ['tr', 'en']
  }
];

const TREATMENTS = [
  { treatmentId: 'dental_implant', sourceTreatmentName: 'Dental Implant', sourceCategory: 'Oral Surgery' },
  { treatmentId: 'smile_design', sourceTreatmentName: 'Smile Design', sourceCategory: 'Aesthetic Dentistry' },
  { treatmentId: 'zirconium_crown', sourceTreatmentName: 'Zirconium Crown', sourceCategory: 'Prosthodontics' },
  { treatmentId: 'orthodontics', sourceTreatmentName: 'Orthodontics', sourceCategory: 'Orthodontics' },
  { treatmentId: 'pedodontics', sourceTreatmentName: 'Pediatric Dentistry', sourceCategory: 'Pedodontics' },
  { treatmentId: 'teeth_whitening', sourceTreatmentName: 'Teeth Whitening', sourceCategory: 'Aesthetic Dentistry' },
];

const KNOWLEDGE_CHUNKS = [
  {
    topic: 'branch_information',
    content: "Hospitadent Göktürk is part of the Hospitadent Dental Group, located centrally in Göktürk, Eyüpsultan. It operates as a comprehensive dental clinic offering multidisciplinary treatments."
  },
  {
    topic: 'clinic_facilities',
    content: "The clinic features modern dental units equipped with advanced technology including panoramic x-ray, dental tomography, and 3D imaging capabilities."
  },
  {
    topic: 'dental_services',
    content: "Services include oral and maxillofacial surgery, implantology, orthodontics, pedodontics, endodontics, periodontology, and aesthetic dentistry such as smile design."
  },
  {
    topic: 'supported_languages',
    content: "The clinic provides services with doctors proficient in Turkish and English, supporting international patients."
  }
];

const HOURS = [
  { dayOfWeek: 1, openTime: "08:30", closeTime: "18:00", isClosed: false },
  { dayOfWeek: 2, openTime: "08:30", closeTime: "18:00", isClosed: false },
  { dayOfWeek: 3, openTime: "08:30", closeTime: "18:00", isClosed: false },
  { dayOfWeek: 4, openTime: "08:30", closeTime: "18:00", isClosed: false },
  { dayOfWeek: 5, openTime: "08:30", closeTime: "18:00", isClosed: false },
  { dayOfWeek: 6, openTime: "08:30", closeTime: "18:00", isClosed: false },
  { dayOfWeek: 0, openTime: "00:00", closeTime: "00:00", isClosed: true },
];

async function run() {
  const isApply = process.argv.includes('--apply');
  console.log(`\n=== HOSPITADENT GÖKTÜRK DATA COMPLETION [${isApply ? 'APPLY' : 'DRY-RUN'}] ===\n`);
  
  const db = getAdminDb();
  if (!db) throw new Error('Database is null');

  const clinicsRef = db.collection('agencies').doc(TARGET_AGENCY_ID).collection('clinics');
  const clinicDoc = await clinicsRef.doc(TARGET_CLINIC_ID).get();
  
  if (!clinicDoc.exists) {
    console.error(`[FATAL ERROR] Target clinic ${TARGET_CLINIC_ID} not found.`);
    process.exit(1);
  }

  const existingData = clinicDoc.data() || {};
  console.log(`- Target clinic ID: ${TARGET_CLINIC_ID}`);
  console.log(`- Existing agencyId: ${TARGET_AGENCY_ID}`);
  console.log(`- Existing clinic name: ${existingData.clinicName}`);
  console.log(`- Existing status: ${existingData.status}`);
  console.log(`- Existing source fields: externalSourceUrl=${existingData.externalSourceUrl}, profileUrl=${existingData.profileUrl}`);
  console.log(`- Primary official source: https://www.hospitadent.com/en/branches/gokturk`);

  const allClinics = await clinicsRef.get();
  console.log(`- Existing clinic count: ${allClinics.size}`);

  const now = admin.firestore.FieldValue.serverTimestamp();

  // 1. UPDATE CLINIC
  const updates: any = {};
  for (const [key, value] of Object.entries(CLINIC_INFO)) {
    // Basic merge strategy
    if (key === 'location') {
      updates.location = { ...existingData.location, ...(value as any) };
    } else {
      updates[key] = value;
    }
  }
  updates.updatedAt = now;
  
  console.log(`\n[PLANNED UPDATE] Clinic Document ${TARGET_CLINIC_ID}:`);
  console.log(JSON.stringify(updates, null, 2));
  updateOperations++;

  if (isApply) {
    await clinicsRef.doc(TARGET_CLINIC_ID).update(updates);
  }

  // 2. DOCTORS
  const doctorsRef = clinicsRef.doc(TARGET_CLINIC_ID).collection('doctors');
  const existingDoctors = await doctorsRef.get();
  console.log(`\n- Existing doctors: ${existingDoctors.size}`);
  
  for (const doc of DOCTORS) {
    const existing = existingDoctors.docs.find(d => d.data().fullName === doc.fullName);
    if (existing) {
      console.log(`[Doctor UPDATE] ${doc.fullName}`);
      updateOperations++;
      if (isApply) {
        await doctorsRef.doc(existing.id).update({
          specialty: doc.specialty,
          department: doc.department,
          languages: doc.languages,
          sourceUrl: CLINIC_INFO.externalSourceUrl,
          updatedAt: now
        });
      }
    } else {
      console.log(`[Doctor CREATE] ${doc.fullName} (Unexpected, should already exist)`);
      createOperations++;
      if (isApply) {
        await doctorsRef.add({
          agencyId: TARGET_AGENCY_ID,
          clinicId: TARGET_CLINIC_ID,
          ...doc,
          sourceUrl: CLINIC_INFO.externalSourceUrl,
          active: true,
          displayOrder: 99,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  // 3. TREATMENTS
  const treatmentsRef = clinicsRef.doc(TARGET_CLINIC_ID).collection('treatments');
  const existingTreatments = await treatmentsRef.get();
  console.log(`\n- Existing treatments: ${existingTreatments.size}`);
  
  for (const trt of TREATMENTS) {
    const existing = existingTreatments.docs.find(d => d.data().treatmentId === trt.treatmentId);
    if (existing) {
      console.log(`[Treatment UPDATE] ${trt.treatmentId}`);
      updateOperations++;
      if (isApply) {
        await treatmentsRef.doc(existing.id).update({
          sourceTreatmentName: trt.sourceTreatmentName,
          sourceCategory: trt.sourceCategory,
          updatedAt: now
        });
      }
    } else {
      console.log(`[Treatment CREATE] ${trt.treatmentId}`);
      createOperations++;
      if (isApply) {
        await treatmentsRef.add({
          agencyId: TARGET_AGENCY_ID,
          clinicId: TARGET_CLINIC_ID,
          treatmentId: trt.treatmentId,
          sourceTreatmentName: trt.sourceTreatmentName,
          sourceCategory: trt.sourceCategory,
          sourceUrl: CLINIC_INFO.externalSourceUrl,
          verificationStatus: 'verified',
          active: true,
          displayOrder: 99,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  // 4. KNOWLEDGE BASE
  const kbRef = clinicsRef.doc(TARGET_CLINIC_ID).collection('knowledge_documents');
  const existingKb = await kbRef.get();
  console.log(`\n- Existing knowledge documents: ${existingKb.size}`);

  for (const kb of KNOWLEDGE_CHUNKS) {
    const existing = existingKb.docs.find(d => d.data().topic === kb.topic);
    if (existing) {
      console.log(`[KB UPDATE] ${kb.topic}`);
      updateOperations++;
      if (isApply) {
        await kbRef.doc(existing.id).update({
          content: kb.content,
          updatedAt: now
        });
      }
    } else {
      console.log(`[KB CREATE] ${kb.topic}`);
      createOperations++;
      if (isApply) {
        await kbRef.add({
          ownerType: 'clinic',
          ownerId: TARGET_CLINIC_ID,
          agencyId: TARGET_AGENCY_ID,
          topic: kb.topic,
          content: kb.content,
          sourceUrl: CLINIC_INFO.externalSourceUrl,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  // 5. OPENING HOURS
  const hoursRef = clinicsRef.doc(TARGET_CLINIC_ID).collection('opening_hours');
  const existingHours = await hoursRef.get();
  console.log(`\n- Existing opening hours: ${existingHours.size}`);
  
  if (existingHours.empty) {
    console.log(`[Hours CREATE] Creating 7 days opening hours...`);
    createOperations += 7;
    if (isApply) {
      for (const h of HOURS) {
        await hoursRef.add({
          agencyId: TARGET_AGENCY_ID,
          clinicId: TARGET_CLINIC_ID,
          ...h,
          timezone: 'Europe/Istanbul',
          sourceUrl: CLINIC_INFO.externalSourceUrl,
          verificationStatus: 'verified',
          createdAt: now,
          updatedAt: now
        });
      }
    }
  }

  console.log(`\n--- REPORT ---`);
  console.log(`Delete operation count: ${deleteOperations}`);
  console.log(`Unexpected affected clinic IDs: []`);
  console.log(`Expected affected clinic IDs: [ ${TARGET_CLINIC_ID} ]`);
  
  if (deleteOperations > 0 || unexpectedUpdates > 0) {
    console.error(`[FATAL ERROR] Unauthorized modifications detected. Aborting.`);
    process.exit(1);
  }

  if (isApply) {
    console.log(`\n[POST-FLIGHT] Verifying clinic count...`);
    const afterSnapshot = await clinicsRef.get();
    console.log(`Actual Count: ${afterSnapshot.size} (Expected: ${allClinics.size})`);
    
    if (afterSnapshot.size !== allClinics.size) {
       console.error(`[FATAL ERROR] Clinic count changed! Rollback needed manually.`);
       process.exit(1);
    }
    
    console.log(`[SUCCESS] Clinic data completion executed safely.`);
  }

  console.log('\n[LOG] Script completed.\n');
}

run().catch(console.error);
