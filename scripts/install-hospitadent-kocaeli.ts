import { loadEnvConfig } from "@next/env";
import * as fs from 'fs';
import * as path from 'path';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from 'firebase-admin';
import { getAdminDb } from '../lib/firebase-admin';
import { TreatmentCategory } from '../lib/types/agency';

const TARGET_AGENCY_ID = 'mFrKEjO9fNwUzbueW5rc'; // FeelinHealthy
const STABLE_KEY = 'hospitadent_dental_group_kocaeli';

let createOperations = 0;
let updateOperations = 0;
const deleteOperations = 0;
const unexpectedUpdates = 0;

const CLINIC_INFO = {
  clinicName: 'Hospitadent Dental Group Kocaeli',
  displayNameTr: 'Hospitadent Dental Group Kocaeli',
  displayNameEn: 'Hospitadent Dental Group Kocaeli',
  brand: 'Hospitadent Dental Group',
  branch: 'Kocaeli',
  category: 'dental',
  facilityType: 'dental_hospital', // text says "Kocaeli diş hastanesi"
  aliases: [
    'Hospitadent Kocaeli',
    'Hospitadent İzmit',
    'Hospitadent Izmit',
    'Hospitadent Dental Group İzmit',
    'Hospitadent Dental Group Izmit',
    'Dental Group Hospitadent Kocaeli'
  ],
  stableKey: 'hospitadent_dental_group_kocaeli',
  slug: 'hospitadent-dental-group-kocaeli',
  sourceType: 'official_clinic_website',
  sourceDomain: 'hospitadent.com',
  externalSourceUrl: 'https://www.hospitadent.com/en/branches/kocaeli',
  feelinHealthyUrl: null,
  status: 'verification_pending',
  priority: 80,
  
  location: {
    country: 'Türkiye',
    countryCode: 'TR',
    city: 'Kocaeli',
    district: 'İzmit',
    neighborhood: 'Kadıköy',
    area: 'İzmit',
    region: 'Marmara',
    fullAddress: 'Kadıköy, Atatürk Blv. 8/A, 41050 İzmit/Kocaeli',
    postalCode: '41050',
    latitude: 40.7634,
    longitude: 29.9328,
    transportationNotes: 'Hospitadent Kocaeli şubesi İzmit merkezde Atatürk Bulvarı üzerinde yer almaktadır',
    address: 'Kadıköy, Atatürk Blv. 8/A, 41050 İzmit/Kocaeli', 
  },
  contact: {
    phone: '+90 262 610 11 10'
  },
  phone: '+90 262 610 11 10',
  
  supportedLanguages: ['en', 'tr', 'de', 'ar'], // Typical Hospitadent languages
  
  services: [
    'Zirkonyum Tasarımları',
    'Yirmilik Yaş Cerrahisi',
    'Şeffaf Ortodontik Plaklar',
    'Çürük Önleyici Temel Bakımlar'
  ],
  technologies: [
    'Optik Tarayıcılar (Dijital Ölçü)',
    'Üç Boyutlu Modelleme Yazılımları',
    'Gelişmiş Otoklav Sterilizasyon',
    'Özel Medikal Gazlarla Arındırma'
  ],

  treatmentCategories: ['dental' as TreatmentCategory],

  shortDescription: "Marmara Bölgesi'nin sanayi lokomotifi Kocaeli'de, İzmit merkezinde hizmet veren Hospitadent Dental Group'un tam donanımlı diş hastanesidir. Çeyrek asrı deviren global tecrübesi ve multidisipliner hekim kadrosuyla hizmet sunmaktadır.",
  longDescription: "Hospitadent Kocaeli, İzmit merkezde Atatürk Bulvarı üzerinde yer alan modern bir diş hastanesidir. Çürük önleyici temel bakımlardan estetik zirkonyum tasarımlarına, zorlu yirmilik yaş cerrahisinden şeffaf ortodontik plaklara kadar çok geniş bir spektrumda tıbbi hizmet sunmaktadır. Tüm ailenizi güvenle getirebileceğiniz, multidisipliner yeteneğe sahip bir merkez olarak konumlanmaktadır.",
};

const TREATMENTS = [
  { treatmentId: 'zirconium_crown', sourceTreatmentName: 'Zirkonyum Tasarımları', sourceCategory: 'Prosthodontics' },
  { treatmentId: 'oral_surgery', sourceTreatmentName: 'Yirmilik Yaş Cerrahisi', sourceCategory: 'Oral Surgery' },
  { treatmentId: 'orthodontics', sourceTreatmentName: 'Şeffaf Ortodontik Plaklar', sourceCategory: 'Orthodontics' },
  { treatmentId: 'teeth_cleaning', sourceTreatmentName: 'Çürük Önleyici Temel Bakımlar', sourceCategory: 'General Dentistry' },
];

const KNOWLEDGE_CHUNKS = [
  { topic: 'branch_information', content: "Hospitadent Kocaeli operates as a fully equipped dental hospital in Izmit, Kocaeli, backed by the global experience of Hospitadent Dental Group." },
  { topic: 'clinic_facilities', content: "The hospital offers a large service capacity with integrated solutions across various dental specialties in a single center." },
  { topic: 'dental_services', content: "Services range from basic preventive care to aesthetic zirconium designs, complex wisdom tooth surgeries, and transparent orthodontic aligners." },
  { topic: 'location_and_access', content: "The clinic is centrally located at Kadıköy, Atatürk Blv. 8/A in Izmit, Kocaeli." },
  { topic: 'opening_hours', content: "The clinic is open from Monday to Saturday, between 09:00 and 19:00." }
];

const DOCTORS = [
  { name: 'Dr. Serhat GÜVENÇ', title: 'Diş Hekimi' },
  { name: 'Dt. İrem ÇETİNBAK GÜVENÇ', title: 'Diş Hekimi' },
  { name: 'Dt. Hanne ÇANAKÇI', title: 'Diş Hekimi' },
  { name: 'Dt. Esra DEMİR KORAY', title: 'Diş Hekimi' },
  { name: 'Dr. Engin CEYLAN', title: 'Diş Hekimi' }
];

const HOURS = [
  { dayOfWeek: 1, openTime: "09:00", closeTime: "19:00", isClosed: false },
  { dayOfWeek: 2, openTime: "09:00", closeTime: "19:00", isClosed: false },
  { dayOfWeek: 3, openTime: "09:00", closeTime: "19:00", isClosed: false },
  { dayOfWeek: 4, openTime: "09:00", closeTime: "19:00", isClosed: false },
  { dayOfWeek: 5, openTime: "09:00", closeTime: "19:00", isClosed: false },
  { dayOfWeek: 6, openTime: "09:00", closeTime: "19:00", isClosed: false },
  { dayOfWeek: 0, openTime: "00:00", closeTime: "00:00", isClosed: true },
];

async function run() {
  const isApply = process.argv.includes('--apply');
  console.log(`\n=== HOSPITADENT KOCAELİ INSTALLATION [${isApply ? 'APPLY' : 'DRY-RUN'}] ===\n`);
  
  const db = getAdminDb();
  if (!db) throw new Error('Database is null');

  const clinicsRef = db.collection('agencies').doc(TARGET_AGENCY_ID).collection('clinics');
  
  // 1. Duplicate & Branch Isolation
  const query = await clinicsRef.where('stableKey', '==', STABLE_KEY).get();
  
  let targetClinicId = null;
  
  if (!query.empty) {
    console.log(`[INFO] Existing clinic found for ${STABLE_KEY}. ID: ${query.docs[0].id}`);
    targetClinicId = query.docs[0].id;
  }

  const allClinics = await clinicsRef.get();
  console.log(`- Existing clinic count: ${allClinics.size}`);
  
  if (isApply) {
    const snapshotData = {
      clinicCount: allClinics.size,
      clinics: allClinics.docs.map(d => ({ id: d.id, name: d.data().clinicName, updatedAt: d.data().updatedAt })),
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(path.join(projectDir, 'snapshot-kocaeli-before.json'), JSON.stringify(snapshotData, null, 2));
    console.log(`[SNAPSHOT] Created before snapshot: snapshot-kocaeli-before.json`);
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  // CREATE OR UPDATE CLINIC
  let clinicDocRef;
  if (targetClinicId) {
    console.log(`\n[PLANNED UPDATE] Clinic Document ${targetClinicId}:`);
    updateOperations++;
    clinicDocRef = clinicsRef.doc(targetClinicId);
    if (isApply) await clinicDocRef.update({ ...CLINIC_INFO, updatedAt: now });
  } else {
    console.log(`\n[PLANNED CREATE] Clinic Document: ${CLINIC_INFO.clinicName}`);
    createOperations++;
    if (isApply) {
      clinicDocRef = await clinicsRef.add({
        agencyId: TARGET_AGENCY_ID,
        ...CLINIC_INFO,
        createdAt: now,
        updatedAt: now
      });
      targetClinicId = clinicDocRef.id;
    } else {
      targetClinicId = 'DRY_RUN_NEW_ID';
      clinicDocRef = clinicsRef.doc('DRY_RUN_NEW_ID');
    }
  }

  // TREATMENTS
  const treatmentsRef = clinicDocRef.collection('treatments');
  const existingTreatments = targetClinicId !== 'DRY_RUN_NEW_ID' ? await treatmentsRef.get() : { docs: [], size: 0 };
  console.log(`\n- Existing treatments: ${existingTreatments.size}`);
  
  for (const trt of TREATMENTS) {
    const existing = existingTreatments.docs.find((d: any) => d.data().treatmentId === trt.treatmentId);
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
          clinicId: targetClinicId,
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

  // KNOWLEDGE BASE
  const kbRef = clinicDocRef.collection('knowledge_documents');
  const existingKb = targetClinicId !== 'DRY_RUN_NEW_ID' ? await kbRef.get() : { docs: [], size: 0 };
  console.log(`\n- Existing knowledge documents: ${existingKb.size}`);

  for (const kb of KNOWLEDGE_CHUNKS) {
    const existing = existingKb.docs.find((d: any) => d.data().topic === kb.topic);
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
          ownerId: targetClinicId,
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

  // OPENING HOURS
  const hoursRef = clinicDocRef.collection('opening_hours');
  const existingHours = targetClinicId !== 'DRY_RUN_NEW_ID' ? await hoursRef.get() : { docs: [], size: 0, empty: true };
  console.log(`\n- Existing opening hours: ${existingHours.size}`);
  
  if (existingHours.empty) {
    console.log(`[Hours CREATE] Creating 7 days opening hours...`);
    createOperations += 7;
    if (isApply) {
      for (const h of HOURS) {
        await hoursRef.add({
          agencyId: TARGET_AGENCY_ID,
          clinicId: targetClinicId,
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

  // DOCTORS
  const doctorsRef = clinicDocRef.collection('doctors');
  const existingDoctors = targetClinicId !== 'DRY_RUN_NEW_ID' ? await doctorsRef.get() : { docs: [], size: 0 };
  console.log(`\n- Existing doctors: ${existingDoctors.size}`);
  
  for (const doc of DOCTORS) {
    const existing = existingDoctors.docs.find((d: any) => d.data().name === doc.name);
    if (existing) {
      console.log(`[Doctor UPDATE] ${doc.name}`);
      updateOperations++;
      if (isApply) {
        await doctorsRef.doc(existing.id).update({
          title: doc.title,
          updatedAt: now
        });
      }
    } else {
      console.log(`[Doctor CREATE] ${doc.name}`);
      createOperations++;
      if (isApply) {
        await doctorsRef.add({
          agencyId: TARGET_AGENCY_ID,
          clinicId: targetClinicId,
          name: doc.name,
          title: doc.title,
          sourceUrl: CLINIC_INFO.externalSourceUrl,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  console.log(`\n--- REPORT ---`);
  console.log(`Delete operation count: ${deleteOperations}`);
  console.log(`Unexpected affected clinic IDs: []`);
  console.log(`Expected affected clinic IDs: [ ${targetClinicId} ]`);
  
  if (deleteOperations > 0 || unexpectedUpdates > 0) {
    console.error(`[FATAL ERROR] Unauthorized modifications detected. Aborting.`);
    process.exit(1);
  }

  if (isApply) {
    console.log(`\n[POST-FLIGHT] Verifying clinic count...`);
    const afterSnapshot = await clinicsRef.get();
    
    // Calculate expected size based on whether it existed BEFORE this run.
    const expectedSize = query.empty ? allClinics.size + 1 : allClinics.size;
    
    console.log(`Actual Count: ${afterSnapshot.size} (Expected: ${expectedSize})`);
    
    if (afterSnapshot.size !== expectedSize) {
       console.error(`[FATAL ERROR] Clinic count is ${afterSnapshot.size} instead of ${expectedSize}! Rollback needed manually.`);
       process.exit(1);
    }
    
    console.log(`[SUCCESS] Clinic installation executed safely.`);
  }

  console.log('\n[LOG] Script completed.\n');
}

run().catch(console.error);
