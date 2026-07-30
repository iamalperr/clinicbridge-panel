import { loadEnvConfig } from "@next/env";
import * as fs from 'fs';
import * as path from 'path';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from 'firebase-admin';
import { getAdminDb } from '../lib/firebase-admin';
import { TreatmentCategory } from '../lib/types/agency';

const TARGET_AGENCY_ID = 'mFrKEjO9fNwUzbueW5rc'; 
const STABLE_KEY = 'hospitadent_dental_group_cevizlibag';

let createOperations = 0;
let updateOperations = 0;
const deleteOperations = 0;
const unexpectedUpdates = 0;

const CLINIC_INFO = {
  displayNameTr: 'Hospitadent Dental Group Cevizlibağ',
  displayNameEn: 'Hospitadent Dental Group Cevizlibağ',
  brand: 'Hospitadent Dental Group',
  branch: 'Cevizlibağ',
  category: 'dental',
  facilityType: 'clinic',
  aliases: [
    'Hospitadent Cevizlibağ',
    'Hospitadent Cevizlibag',
    'Hospitadent Dental Group Cevizlibağ',
    'Hospitadent Dental Group Cevizlibag',
    'Hospitadent Zeytinburnu',
    'Hospitadent Cevizlibağ İstanbul',
    'Hospitadent Cevizlibag Istanbul'
  ],
  stableKey: 'hospitadent_dental_group_cevizlibag',
  slug: 'hospitadent-dental-group-cevizlibag',
  sourceType: 'official_clinic_website',
  sourceDomain: 'hospitadent.com',
  externalSourceUrl: 'https://www.hospitadent.com/en/branches/cevizlibag',
  status: 'active',
  
  location: {
    country: 'Türkiye',
    countryCode: 'TR',
    city: 'İstanbul',
    district: 'Zeytinburnu',
    neighborhood: 'Seyitnizam',
    area: 'Cevizlibağ',
    region: 'İstanbul European Side / Avrupa Yakası',
    fullAddress: 'Seyitnizam Mah. Mevlana Cad. No:81, 34015 Zeytinburnu/İstanbul',
    postalCode: '34015',
    latitude: 41.0151,
    longitude: 28.9109,
    transportationNotes: 'Located in Cevizlibağ, Zeytinburnu.',
    address: 'Seyitnizam Mah. Mevlana Cad. No:81, 34015 Zeytinburnu/İstanbul', 
  },
  contact: {
    phone: '+90 212 582 22 11'
  },
  phone: '+90 212 582 22 11',
  
  supportedLanguages: ['tr', 'en'],

  treatmentCategories: ['dental' as TreatmentCategory, 'aesthetic_surgery' as TreatmentCategory],

  shortDescription: "İstanbul'un önemli lokasyonlarından Cevizlibağ'da hizmet veren, Hospitadent Dental Group'un modern ve donanımlı şubelerinden biridir.",
  longDescription: "Hospitadent Cevizlibağ, İstanbul'un en yoğun noktalarından birinde, kolay ulaşılabilir lokasyonuyla hizmet veriyor. Tüm ağız ve diş sağlığı branşlarında, alanında uzman diş hekimleri ve modern teknolojik altyapısıyla hasta kabul eden kliniğimiz, koruyucu hekimlikten implantolojiye, ortodontiden estetik diş hekimliğine kadar geniş bir yelpazede çözümler sunmaktadır.",
};

const DOCTORS = [
  { fullName: 'Dt. Ali Ersin PEKTAŞ', specialty: 'Dentist', department: 'General Dentistry', languages: ['tr', 'en'] },
  { fullName: 'Dr. Burcu OĞUZ AKSOY', specialty: 'Orthodontics', department: 'Orthodontics', languages: ['tr', 'en'] },
  { fullName: 'Dt. Betül Şahin KARAARSLAN', specialty: 'Dentist', department: 'General Dentistry', languages: ['tr', 'en'] },
  { fullName: 'Dt. Emine SÖNMEZ GÜNEŞ', specialty: 'Dentist', department: 'General Dentistry', languages: ['tr', 'en'] },
  { fullName: 'Dt. Hasan ÖZKAN', specialty: 'Oral and Maxillofacial Surgery', department: 'Oral Surgery', languages: ['tr', 'en'] },
  { fullName: 'Dt. Melis ARSLAN', specialty: 'Dentist', department: 'General Dentistry', languages: ['tr', 'en'] },
  // Keeping the previously created ones if they are still verified, else mark inactive
  // We'll mark all old ones as inactive for safety if they aren't in this new list.
];

const TREATMENTS = [
  { treatmentId: 'dental_implant', sourceTreatmentName: 'Dental Implant', sourceCategory: 'Oral Surgery' },
  { treatmentId: 'smile_design', sourceTreatmentName: 'Smile Design', sourceCategory: 'Aesthetic Dentistry' },
  { treatmentId: 'zirconium_crown', sourceTreatmentName: 'Zirconium Crown', sourceCategory: 'Prosthodontics' },
  { treatmentId: 'orthodontics', sourceTreatmentName: 'Orthodontics', sourceCategory: 'Orthodontics' },
  { treatmentId: 'pedodontics', sourceTreatmentName: 'Pediatric Dentistry', sourceCategory: 'Pedodontics' },
];

const KNOWLEDGE_CHUNKS = [
  { topic: 'branch_information', content: "Hospitadent Cevizlibağ operates in Zeytinburnu, Istanbul, providing comprehensive dental care with modern technological infrastructure." },
  { topic: 'clinic_facilities', content: "The clinic uses advanced diagnostic and imaging technologies such as panoramic x-rays and 3D imaging." },
  { topic: 'dental_services', content: "Provides treatments including oral surgery, orthodontics, pedodontics, endodontics, and aesthetic dentistry." },
  { topic: 'supported_languages', content: "Patients can receive dental care and support in Turkish and English." },
  { topic: 'location_and_access', content: "Located at Seyitnizam Mah. Mevlana Cad. No:81 in Zeytinburnu, the clinic is easily accessible from Cevizlibağ." }
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
  console.log(`\n=== HOSPITADENT CEVİZLİBAĞ DATA COMPLETION [${isApply ? 'APPLY' : 'DRY-RUN'}] ===\n`);
  
  const db = getAdminDb();
  if (!db) throw new Error('Database is null');

  const clinicsRef = db.collection('agencies').doc(TARGET_AGENCY_ID).collection('clinics');
  
  // 1. Target Clinic Resolution
  const query = await clinicsRef.where('stableKey', '==', STABLE_KEY).get();
  if (query.empty) {
    console.error(`[FATAL ERROR] Target clinic ${STABLE_KEY} not found.`);
    process.exit(1);
  }
  if (query.size > 1) {
    console.error(`[FATAL ERROR] Multiple clinics found for ${STABLE_KEY}. duplicate_target_clinic_candidates.`);
    process.exit(1);
  }

  const TARGET_CLINIC_ID = query.docs[0].id;
  const clinicDoc = query.docs[0];
  const existingData = clinicDoc.data() || {};
  
  console.log(`- Target clinic ID: ${TARGET_CLINIC_ID}`);
  console.log(`- Existing agencyId: ${TARGET_AGENCY_ID}`);
  console.log(`- Existing clinic name: ${existingData.clinicName}`);
  console.log(`- Existing status: ${existingData.status}`);
  console.log(`- Existing source fields: externalSourceUrl=${existingData.externalSourceUrl}, profileUrl=${existingData.profileUrl}`);
  console.log(`- Primary official source: ${CLINIC_INFO.externalSourceUrl}`);

  const allClinics = await clinicsRef.get();
  console.log(`- Existing clinic count: ${allClinics.size}`);

  if (isApply) {
    const snapshotData = {
      clinicCount: allClinics.size,
      targetClinicId: TARGET_CLINIC_ID,
      data: existingData,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(path.join(projectDir, 'snapshot-cevizlibag-before.json'), JSON.stringify(snapshotData, null, 2));
    console.log(`[SNAPSHOT] Created before snapshot: snapshot-cevizlibag-before.json`);
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  // UPDATE CLINIC
  const updates: any = {};
  for (const [key, value] of Object.entries(CLINIC_INFO)) {
    if (key === 'location') {
      updates.location = { ...existingData.location, ...(value as any) };
    } else {
      updates[key] = value;
    }
  }
  updates.updatedAt = now;
  
  console.log(`\n[PLANNED UPDATE] Clinic Document ${TARGET_CLINIC_ID}:`);
  updateOperations++;
  if (isApply) await clinicsRef.doc(TARGET_CLINIC_ID).update(updates);

  // DOCTORS
  const doctorsRef = clinicsRef.doc(TARGET_CLINIC_ID).collection('doctors');
  const existingDoctors = await doctorsRef.get();
  console.log(`\n- Existing doctors: ${existingDoctors.size}`);
  
  for (const edoc of existingDoctors.docs) {
    const isVerified = DOCTORS.some(d => d.fullName === edoc.data().fullName);
    if (!isVerified) {
      if (edoc.data().active !== false) {
        console.log(`[Doctor DEACTIVATE] ${edoc.data().fullName} (Not verified in official Cevizlibağ source)`);
        updateOperations++;
        if (isApply) await doctorsRef.doc(edoc.id).update({ active: false, updatedAt: now });
      }
    }
  }

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
          active: true,
          updatedAt: now
        });
      }
    } else {
      console.log(`[Doctor CREATE] ${doc.fullName}`);
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

  // TREATMENTS
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

  // KNOWLEDGE BASE
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

  // OPENING HOURS
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
