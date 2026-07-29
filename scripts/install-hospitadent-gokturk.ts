import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from 'firebase-admin';
import { getAdminDb } from '../lib/firebase-admin';

const TARGET_AGENCY_ID = 'mFrKEjO9fNwUzbueW5rc'; // FeelinHealthy

// [SAFEGUARD] Delete operation counter
let deleteOperations = 0; // eslint-disable-line prefer-const
let updateOperations = 0;  
let createOperations = 0;  

const CLINIC_INFO = {
  stableKey: 'hospitadent_dental_group_gokturk',
  slug: 'hospitadent-dental-group-gokturk',
  brand: 'Hospitadent Dental Group',
  branch: 'Göktürk',
  displayNameTr: 'Hospitadent Dental Group Göktürk',
  displayNameEn: 'Hospitadent Dental Group Göktürk',
  category: 'dental',
  facilityType: 'clinic',
  sourceType: 'official_brand_website',
  sourceDomain: 'hospitadent.com',
  externalSourceUrl: 'https://www.hospitadent.com/en/branches/gokturk',
  status: 'verification_pending',

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
    transportationNotes: 'Located centrally in Göktürk, Eyüpsultan.',
  },
  contact: {
    phone: '+90 212 400 00 68'
  },
  capacity: {
    indoorAreaSqm: 0,
    treatmentUnits: 0,
  },
  facilities: {
    panoramicXray: true,
    dentalTomography: true,
    sedation: true,
    generalAnesthesia: true,
  },
  patientSupport: {
    interpreter: true,
    airportTransfer: true,
    localTransfer: true,
    hotelCoordination: true
  },
  shortOverviewTr: "İstanbul Avrupa Yakası'nda Eyüpsultan Göktürk bölgesinde hizmet veren, multidisipliner altyapısıyla öne çıkan kapsamlı bir diş kliniğidir.",
  shortOverviewEn: "Comprehensive dental clinic located in Göktürk, Eyüpsultan on the European Side of Istanbul, distinguished by its multidisciplinary infrastructure.",
  fullOverviewTr: "Başarılı, estetik ve kalıcı bir dental sonuç, farklı uzmanlık dallarının uyum içinde çalışmasının eseridir. Hospitadent çatısı altında, misafirlerimizin tüm ağız sağlığı ihtiyaçlarına tek bir merkezde, bütüncül bir yaklaşımla çözüm üretiyoruz. Koruyucu rutin bakımlardan dijital gülüş tasarımına, çene cerrahisinden şeffaf plak tedavilerine kadar geniş bir yelpazede faaliyet gösteriyoruz. Tüm aileniz için güvenle tercih edebileceğiniz, multidisipliner altyapısıyla öne çıkan kapsamlı bir Göktürk diş kliniği olarak, sağlığınızı uzmanların deneyimli ellerine bırakmanın ayrıcalığını yaşatıyoruz.",
  fullOverviewEn: "A successful, aesthetic, and lasting dental result is the product of different specialties working in harmony. Under the Hospitadent umbrella, we produce solutions for all oral health needs of our guests in a single center with a holistic approach. We operate in a wide spectrum from routine preventive care to digital smile design, from maxillofacial surgery to clear aligner treatments. As a comprehensive Göktürk dental clinic that you can safely choose for your entire family, distinguished by its multidisciplinary infrastructure, we offer the privilege of leaving your health in the experienced hands of experts.",
};

const DOCTORS = [
  { fullName: 'Dr. Zeynep EDA GÜL', specialty: 'Dentist', experienceYears: 0 },
  { fullName: 'Dt. Selçuk MERT ÖZÇELIK', specialty: 'Dentist', experienceYears: 0 },
  { fullName: 'Dt. Ömer FARUK YILMAZ', specialty: 'Dentist', experienceYears: 0 },
  { fullName: 'Dt. Esad TAHA', specialty: 'Dentist', experienceYears: 0 },
];

const KNOWLEDGE_CHUNKS = [
  {
    topic: 'clinic_overview',
    content: "Hospitadent Göktürk, İstanbul Avrupa Yakası'nda Eyüpsultan Göktürk bölgesinde hizmet veren kurumsal bir diş kliniğidir. Koruyucu rutin bakımlardan dijital gülüş tasarımına, çene cerrahisinden şeffaf plak tedavilerine kadar geniş bir yelpazede hizmet sunmaktadır."
  },
  {
    topic: 'location_and_access',
    content: "Klinik Göktürk Merkez Mahallesi, İstanbul Caddesi, Yalınevler üzerinde bulunmaktadır."
  },
  {
    topic: 'anesthesia_services',
    content: "Acil durumlar, travmalar veya anksiyete sahibi hastalar için uygun anestezi, sedasyon ve genel anestezi olanakları bulunmaktadır."
  },
  {
    topic: 'opening_hours',
    content: "Klinik çalışma saatleri randevu durumuna göre planlanmakta olup, Pazar günleri hariç hizmet vermektedir."
  }
];

async function run() {
  const isApply = process.argv.includes('--apply');
  console.log(`\n=== HOSPITADENT GÖKTÜRK INSTALLATION [${isApply ? 'APPLY' : 'DRY-RUN'}] ===\n`);
  const db = getAdminDb();
  if (!db) {
    throw new Error('Database is null');
  }

  // 1. Snapshot Before
  const clinicsRef = db.collection('agencies').doc(TARGET_AGENCY_ID).collection('clinics');
  const beforeSnapshot = await clinicsRef.get();
  console.log(`[BEFORE] Total clinics: ${beforeSnapshot.size}`);

  // 2. Duplicate Check
  const duplicateQuery = await clinicsRef.where('stableKey', '==', CLINIC_INFO.stableKey).get();
  let clinicDocId = null;

  if (!duplicateQuery.empty) {
    clinicDocId = duplicateQuery.docs[0].id;
    console.log(`[Duplicate Check] Found existing clinic: ${clinicDocId}. Will UPDATE.`);
    updateOperations++;
  } else {
    clinicDocId = clinicsRef.doc().id;
    console.log(`[Duplicate Check] No existing clinic found. Will CREATE with ID: ${clinicDocId}`);
    createOperations++;
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  // 3. Clinic Data
  const clinicData = {
    agencyId: TARGET_AGENCY_ID,
    stableKey: CLINIC_INFO.stableKey,
    slug: CLINIC_INFO.slug,
    brand: CLINIC_INFO.brand,
    branch: CLINIC_INFO.branch,
    displayNameTr: CLINIC_INFO.displayNameTr,
    displayNameEn: CLINIC_INFO.displayNameEn,
    category: CLINIC_INFO.category,
    facilityType: CLINIC_INFO.facilityType,
    sourceType: CLINIC_INFO.sourceType,
    sourceDomain: CLINIC_INFO.sourceDomain,
    externalSourceUrl: CLINIC_INFO.externalSourceUrl,
    status: CLINIC_INFO.status,
    location: CLINIC_INFO.location,
    contact: CLINIC_INFO.contact,
    capacity: CLINIC_INFO.capacity,
    facilities: CLINIC_INFO.facilities,
    patientSupport: CLINIC_INFO.patientSupport,
    shortOverviewTr: CLINIC_INFO.shortOverviewTr,
    shortOverviewEn: CLINIC_INFO.shortOverviewEn,
    fullOverviewTr: CLINIC_INFO.fullOverviewTr,
    fullOverviewEn: CLINIC_INFO.fullOverviewEn,
    listedDoctorCount: DOCTORS.length,
    updatedAt: now,
  };

  if (!duplicateQuery.empty) {
    if (isApply) await clinicsRef.doc(clinicDocId).update(clinicData);
  } else {
    if (isApply) {
      await clinicsRef.doc(clinicDocId).set({
        ...clinicData,
        createdAt: now,
      });
    }
  }

  // 4. Doctors
  console.log(`\n--- Doctors ---`);
  const doctorsRef = clinicsRef.doc(clinicDocId).collection('doctors');
  for (const doc of DOCTORS) {
    const dQuery = await doctorsRef.where('fullName', '==', doc.fullName).get();
    if (dQuery.empty) {
      console.log(`[Doctor] Will CREATE: ${doc.fullName} (${doc.specialty})`);
      createOperations++;
      if (isApply) {
        await doctorsRef.add({
          agencyId: TARGET_AGENCY_ID,
          clinicId: clinicDocId,
          fullName: doc.fullName,
          specialty: doc.specialty,
          experienceYears: doc.experienceYears,
          sourceUrl: CLINIC_INFO.externalSourceUrl,
          active: true,
          displayOrder: 99,
          createdAt: now,
          updatedAt: now,
        });
      }
    } else {
      console.log(`[Doctor] Exists: ${doc.fullName}`);
    }
  }

  // 5. Knowledge Base
  console.log(`\n--- AI Knowledge Base ---`);
  const kbRef = clinicsRef.doc(clinicDocId).collection('knowledge_documents');
  for (const kb of KNOWLEDGE_CHUNKS) {
    const kQuery = await kbRef.where('topic', '==', kb.topic).get();
    if (kQuery.empty) {
      console.log(`[KB] Will CREATE: ${kb.topic}`);
      createOperations++;
      if (isApply) {
        await kbRef.add({
          ownerType: 'clinic',
          ownerId: clinicDocId,
          agencyId: TARGET_AGENCY_ID,
          topic: kb.topic,
          content: kb.content,
          sourceUrl: CLINIC_INFO.externalSourceUrl,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    } else {
      console.log(`[KB] Exists: ${kb.topic}`);
    }
  }

  // 6. Pricing
  console.log(`\n--- Pricing ---`);
  console.log(`[Pricing] 0 pricing records found on official site. Skipping.`);

  console.log(`\n--- REPORT ---`);
  console.log(`Delete Operations: ${deleteOperations}`);
  console.log(`Update Operations: ${updateOperations}`);
  console.log(`Create Operations: ${createOperations}`);

  if (deleteOperations > 0) {
    console.error(`[FATAL ERROR] Delete operations are not 0. Found: ${deleteOperations}. Aborting.`);
    process.exit(1);
  }

  if (isApply) {
    console.log(`\n[POST-FLIGHT] Verifying clinic count...`);
    const afterSnapshot = await clinicsRef.get();
    console.log(`Actual Count: ${afterSnapshot.size} (Expected: ${beforeSnapshot.size + (duplicateQuery.empty ? 1 : 0)})`);
    
    if (afterSnapshot.size < beforeSnapshot.size) {
       console.error(`[FATAL ERROR] Clinic count decreased! Rollback needed manually.`);
       process.exit(1);
    }
    
    let branchFound = false;
    afterSnapshot.forEach(doc => {
       console.log(` - [${doc.id}] ${doc.data().displayNameTr || doc.data().displayNameEn}`);
       if (doc.data().stableKey === CLINIC_INFO.stableKey) {
           branchFound = true;
       }
    });

    if (!branchFound) {
       console.error(`[FATAL ERROR] The clinic was not found in the DB after apply!`);
       process.exit(1);
    }
    console.log(`[SUCCESS] Counts match expected value.`);
  }

  console.log('\n[LOG] Script completed.\n');
}

run().catch(console.error);
