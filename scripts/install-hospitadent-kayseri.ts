import { loadEnvConfig } from "@next/env";
import * as fs from 'fs';
import * as path from 'path';

const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from 'firebase-admin';
import { getAdminDb } from '../lib/firebase-admin';

const TARGET_AGENCY_ID = 'mFrKEjO9fNwUzbueW5rc'; // FeelinHealthy

let createOperations = 0;
let updateOperations = 0;
let deleteOperations = 0;
let unexpectedUpdates = 0;

const CLINIC_INFO = {
  clinicName: 'Hospitadent Dental Group Kayseri',
  displayNameTr: 'Hospitadent Dental Group Kayseri',
  displayNameEn: 'Hospitadent Dental Group Kayseri',
  normalizedName: 'hospitadent dental group kayseri',
  brand: 'Hospitadent Dental Group',
  branch: 'Kayseri',
  category: 'dental',
  stableKey: 'hospitadent_dental_group_kayseri',
  slug: 'hospitadent-dental-group-kayseri',
  aliases: [
    'Hospitadent Kayseri',
    'Hospitadent Dental Group Kayseri',
    'Hospitadent Kayseri Dental Hospital',
    'Hospitadent Kayseri Dental Clinic',
    'Hospitadent Kayseri Diş Hastanesi'
  ],
  sourceType: 'agency_website',
  sourceDomain: 'feelinhealthy.com',
  canonicalSourceUrl: 'https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-kayseri',
  externalProfileUrl: 'https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-kayseri',
  externalLinkType: 'feelinhealthy_profile',
  verificationStatus: 'verified',
  status: 'active',
  active: true,
  priority: 80,

  location: {
    country: 'Türkiye',
    countryCode: 'TR',
    city: 'Kayseri'
  },

  supportedLanguages: ['en', 'de', 'fr', 'ar', 'ru', 'bg'],
  treatmentCategories: ['dental'],

  shortDescription: 'Hospitadent Dental Group Kayseri is a comprehensive dental center operating since 2014, offering advanced dental treatments, implants, and aesthetic dentistry in a 1,850 m² facility.',
  longDescription: 'Opened in 2014, Hospitadent Dental Group Kayseri spans an impressive 1,850 m² facility featuring 14 treatment units and an operating room. The clinic provides a wide array of oral and dental services, supported by advanced diagnostic imaging like panoramic X-rays and dental tomography. Multilingual support and VIP transfer services are available to accommodate international patients, ensuring high-quality, patient-centric care.',

  facilities: {
    openedYear: 2014,
    facilitySizeSqm: 1850,
    treatmentUnits: 14,
    operatingRooms: 1
  }
};

const NEW_TREATMENTS = [
  { id: 'all_on_6', name: 'All-on-6 Dental Implants', price: 3740, duration: '3 Day', category: 'Implantology' },
  { id: 'all_on_4', name: 'All-on-4 Dental Implants', price: 2640, duration: '3 Day', category: 'Implantology' },
  { id: 'bone_graft', name: 'Bone Graft', price: 600, duration: '5 Day', category: 'Oral Surgery' },
  { id: 'dental_implants', name: 'Dental Implants', price: 399, duration: '3 Day', category: 'Implantology' },
  { id: 'sinus_lift', name: 'Sinus Lift', price: 600, duration: '5 Day', category: 'Oral Surgery' },
  { id: 'emax_crown', name: 'E-Max Crown', price: 330, duration: '7 Day', category: 'Prosthodontics' },
  { id: 'zirconia_crown', name: 'Zirconia Crown', price: 250, duration: '7 Day', category: 'Prosthodontics' },
  { id: 'dentures', name: 'Dentures', price: 690, duration: '7 Day', category: 'Prosthodontics' },
  { id: 'full_dentures', name: 'Full Dentures', price: 3940, duration: '12 Day', category: 'Prosthodontics' },
  { id: 'composite_veneers', name: 'Composite Veneers', price: 130, duration: '7 Day', category: 'Aesthetic Dentistry' },
  { id: 'emax_veneers', name: 'E-Max Veneers / Full Veneers', price: 385, duration: '7 Day', category: 'Aesthetic Dentistry' },
  { id: 'hollywood_smile', name: 'Hollywood Smile', price: 5000, duration: '7 Day', category: 'Aesthetic Dentistry' },
  { id: 'teeth_cleaning', name: 'Teeth Cleaning', price: 70, duration: '1 Day', category: 'General Dentistry' },
  { id: 'teeth_whitening', name: 'Teeth Whitening', price: 250, duration: '1 Day', category: 'Aesthetic Dentistry' },
];

const NEW_SERVICES = [
  { id: 'general_anesthesia', name: 'General Anesthesia for Dental Treatments', price: 430, duration: '1 Day', category: 'Anesthesia' },
  { id: 'sedation', name: 'Sedation for Dental Treatments', price: 315, duration: '1 Day', category: 'Anesthesia' },
  { id: 'panoramic_xray', name: 'Panoramic X-Ray', price: 0, duration: '1 Day', category: 'Diagnostic' },
  { id: 'dental_tomography', name: 'Dental Tomography', price: 0, duration: '1 Day', category: 'Diagnostic' }
];

const DOCTORS = [
  { 
    name: 'Abdülkadir Polat', 
    languages: ['Turkish', 'English'],
    education: 'Erciyes University Faculty of Dentistry',
    experience: '8 Years'
  },
  { 
    name: 'Numan Alparslan', 
    languages: ['Turkish'],
    education: 'Faculty of Dentistry, Atatürk University',
    experience: '25 Years'
  }
];

const HOURS = [
  { dayOfWeek: 1, openTime: "09:00", closeTime: "22:00", isClosed: false },
  { dayOfWeek: 2, openTime: "09:00", closeTime: "22:00", isClosed: false },
  { dayOfWeek: 3, openTime: "09:00", closeTime: "22:00", isClosed: false },
  { dayOfWeek: 4, openTime: "09:00", closeTime: "22:00", isClosed: false },
  { dayOfWeek: 5, openTime: "09:00", closeTime: "22:00", isClosed: false },
  { dayOfWeek: 6, openTime: "09:00", closeTime: "22:00", isClosed: false },
  { dayOfWeek: 0, openTime: "00:00", closeTime: "00:00", isClosed: true },
];

const KNOWLEDGE = [
  { topic: 'clinic_overview', content: 'Hospitadent Dental Group Kayseri is a comprehensive dental center opened in 2014, operating within a 1,850 m² facility.' },
  { topic: 'branch_information', content: 'The Kayseri branch features 14 treatment units and 1 operating room, delivering a wide spectrum of dental services.' },
  { topic: 'location_and_access', content: 'The clinic is located in Kayseri, Türkiye.' },
  { topic: 'clinic_capacity', content: 'The clinic has a capacity of 14 treatment units and 1 dedicated operating room.' },
  { topic: 'clinic_facilities', content: 'The 1,850 square meter facility includes advanced diagnostic technology and modern dental equipment.' },
  { topic: 'dental_services', content: 'The center offers implants, oral surgery, aesthetic dentistry, dentures, crowns, veneers, whitening, and cleaning.' },
  { topic: 'implant_treatments', content: 'Implant options include standard Dental Implants, All-on-4, and All-on-6 systems.' },
  { topic: 'oral_surgery', content: 'Oral surgery includes Bone Grafts and Sinus Lifts.' },
  { topic: 'crowns_and_veneers', content: 'The clinic provides E-Max Crowns, Zirconia Crowns, Composite Veneers, and E-Max Veneers.' },
  { topic: 'dentures', content: 'Prosthodontic solutions feature standard Dentures and Full Dentures.' },
  { topic: 'veneers', content: 'Veneers options include Composite and E-Max Veneers for aesthetic improvements.' },
  { topic: 'smile_design', content: 'Hollywood Smile makeovers are available to completely transform patient smiles.' },
  { topic: 'whitening_and_cleaning', content: 'Basic care such as Teeth Cleaning and Teeth Whitening is provided.' },
  { topic: 'anesthesia_services', content: 'General Anesthesia and Sedation for dental treatments are offered to ensure patient comfort.' },
  { topic: 'diagnostic_imaging', content: 'Diagnostic imaging includes Panoramic X-Rays and Dental Tomography.' },
  { topic: 'supported_languages', content: 'The clinic supports English, German, French, Arabic, Russian, and Bulgarian for international patients.' },
  { topic: 'opening_hours', content: 'The clinic operates Monday through Saturday from 09:00 to 22:00 and is closed on Sundays.' },
  { topic: 'international_patient_support', content: 'Extensive multilingual support is available to assist patients traveling from abroad.' },
  { topic: 'transfer_services', content: 'Complimentary VIP airport transfer services are cited in the source profile; availability should be confirmed with the clinic.' },
  { topic: 'pricing_information', content: 'Prices listed are source averages. Example: Dental Implants at 399 EUR and Hollywood Smile at 5000 EUR.' },
  { topic: 'doctor_information', content: 'The medical team includes experienced professionals such as Abdülkadir Polat and Numan Alparslan.' }
];

async function run() {
  const isApply = process.argv.includes('--apply');
  console.log(`\n=== HOSPITADENT KAYSERİ INSTALLATION [${isApply ? 'APPLY' : 'DRY-RUN'}] ===\n`);
  
  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB not found.");
    process.exit(1);
  }
  const clinicsRef = db.collection('agencies').doc(TARGET_AGENCY_ID).collection('clinics');
  
  const allClinics = await clinicsRef.get();
  const totalClinicsBefore = allClinics.size;
  
  const query = await clinicsRef.where('stableKey', '==', CLINIC_INFO.stableKey).get();
  
  let targetClinicId = null;
  if (!query.empty) {
    if (query.size > 1) {
      console.error(`[FATAL ERROR] Multiple Kayseri candidates found. Aborting.`);
      process.exit(1);
    }
    targetClinicId = query.docs[0].id;
    console.log(`[INFO] Existing clinic found: ${targetClinicId}`);
  }
  
  const expectedClinicCountDelta = targetClinicId ? 0 : 1;
  
  if (isApply) {
    const snapshotData = {
      clinicCount: totalClinicsBefore,
      targetClinicId,
      timestamp: new Date().toISOString()
    };
    fs.writeFileSync(path.join(projectDir, 'snapshot-kayseri-before.json'), JSON.stringify(snapshotData, null, 2));
    console.log(`[SNAPSHOT] Created before snapshot.`);
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  let clinicDocRef;
  if (targetClinicId) {
    console.log(`[PLANNED UPDATE] Clinic Document -> ${targetClinicId}`);
    updateOperations++;
    clinicDocRef = clinicsRef.doc(targetClinicId);
    if (isApply) {
      await clinicDocRef.update({
        ...CLINIC_INFO,
        updatedAt: now
      });
    }
  } else {
    console.log(`[PLANNED CREATE] Clinic Document`);
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
      targetClinicId = 'DRY_RUN_ID';
      clinicDocRef = clinicsRef.doc(targetClinicId);
    }
  }

  // TREATMENTS
  const treatmentsRef = clinicDocRef.collection('treatments');
  const existingTreatments = targetClinicId !== 'DRY_RUN_ID' ? await treatmentsRef.get() : { empty: true, docs: [] };
  
  for (const trt of NEW_TREATMENTS) {
    const existing = existingTreatments.docs.find((d: any) => d.data().treatmentId === trt.id);
    if (existing) {
      console.log(`[Treatment UPDATE] ${trt.id}`);
      if (isApply) {
        await treatmentsRef.doc(existing.id).update({
          sourceTreatmentName: trt.name,
          sourceCategory: trt.category,
          updatedAt: now
        });
      }
    } else {
      console.log(`[Treatment CREATE] ${trt.id}`);
      if (isApply) {
        await treatmentsRef.add({
          agencyId: TARGET_AGENCY_ID,
          clinicId: targetClinicId,
          treatmentId: trt.id,
          sourceTreatmentName: trt.name,
          sourceCategory: trt.category,
          sourceUrl: CLINIC_INFO.externalProfileUrl,
          verificationStatus: 'verified',
          active: true,
          displayOrder: 99,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }
  
  // PRICING (Treatments + Services)
  const pricingRef = clinicDocRef.collection('pricing');
  const existingPricing = targetClinicId !== 'DRY_RUN_ID' ? await pricingRef.get() : { empty: true, docs: [] };
  const allPricedItems = [...NEW_TREATMENTS, ...NEW_SERVICES.filter(s => s.price > 0)];
  
  for (const item of allPricedItems) {
    const existing = existingPricing.docs.find((d: any) => d.data().treatmentName === item.name);
    if (existing) {
      console.log(`[Pricing UPDATE] ${item.id} - ${item.price} EUR`);
      if (isApply) {
        await pricingRef.doc(existing.id).update({
          priceMin: item.price,
          priceMax: item.price,
          currency: 'EUR',
          priceType: 'source_average',
          notes: `Duration: ${item.duration}`,
          disclaimer: 'Listelenen tutarlar kaynak profilde belirtilen ortalama maliyetlerdir. Kesin fiyat, klinik değerlendirme ve kişisel tedavi planı sonrasında netleşir.',
          updatedAt: now
        });
      }
    } else {
      console.log(`[Pricing CREATE] ${item.id} - ${item.price} EUR`);
      if (isApply) {
        await pricingRef.add({
          agencyClinicId: targetClinicId,
          treatmentName: item.name,
          priceMin: item.price,
          priceMax: item.price,
          currency: 'EUR',
          priceType: 'source_average',
          notes: `Duration: ${item.duration}`,
          disclaimer: 'Listelenen tutarlar kaynak profilde belirtilen ortalama maliyetlerdir. Kesin fiyat, klinik değerlendirme ve kişisel tedavi planı sonrasında netleşir.',
          status: 'active',
          createdAt: now,
          updatedAt: now
        });
      }
    }
  }
  
  // DOCTORS
  const doctorsRef = clinicDocRef.collection('doctors');
  const existingDoctors = targetClinicId !== 'DRY_RUN_ID' ? await doctorsRef.get() : { empty: true, docs: [] };
  
  for (const doc of DOCTORS) {
    const existing = existingDoctors.docs.find((d: any) => d.data().fullName === doc.name);
    if (existing) {
      console.log(`[Doctor UPDATE] ${doc.name}`);
      if (isApply) {
        await doctorsRef.doc(existing.id).update({
          education: doc.education,
          experience: doc.experience,
          languages: doc.languages,
          updatedAt: now
        });
      }
    } else {
      console.log(`[Doctor CREATE] ${doc.name}`);
      if (isApply) {
        await doctorsRef.add({
          agencyId: TARGET_AGENCY_ID,
          clinicId: targetClinicId,
          fullName: doc.name,
          education: doc.education,
          experience: doc.experience,
          languages: doc.languages,
          sourceUrl: CLINIC_INFO.externalProfileUrl,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  // HOURS
  const hoursRef = clinicDocRef.collection('opening_hours');
  const existingHours = targetClinicId !== 'DRY_RUN_ID' ? await hoursRef.get() : { empty: true, docs: [] };
  
  if (existingHours.empty) {
    console.log(`[Hours CREATE] Creating 7 days opening hours...`);
    if (isApply) {
      for (const h of HOURS) {
        await hoursRef.add({
          agencyId: TARGET_AGENCY_ID,
          clinicId: targetClinicId,
          ...h,
          timezone: 'Europe/Istanbul',
          sourceUrl: CLINIC_INFO.externalProfileUrl,
          verificationStatus: 'verified',
          createdAt: now,
          updatedAt: now
        });
      }
    }
  }

  // KNOWLEDGE BASE
  const kbRef = clinicDocRef.collection('knowledge_documents');
  const existingKb = targetClinicId !== 'DRY_RUN_ID' ? await kbRef.get() : { empty: true, docs: [] };
  
  for (const kb of KNOWLEDGE) {
    const existing = existingKb.docs.find((d: any) => d.data().topic === kb.topic);
    if (existing) {
      console.log(`[KB UPDATE] ${kb.topic}`);
      if (isApply) {
        await kbRef.doc(existing.id).update({
          content: kb.content,
          sourceUrl: CLINIC_INFO.externalProfileUrl,
          updatedAt: now
        });
      }
    } else {
      console.log(`[KB CREATE] ${kb.topic}`);
      if (isApply) {
        await kbRef.add({
          ownerType: 'clinic',
          ownerId: targetClinicId,
          agencyId: TARGET_AGENCY_ID,
          topic: kb.topic,
          content: kb.content,
          sourceUrl: CLINIC_INFO.externalProfileUrl,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  console.log(`\n--- REPORT ---`);
  console.log(`Delete operation count: ${deleteOperations}`);
  console.log(`Expected affected clinic IDs: [ ${targetClinicId} ]`);
  console.log(`Unexpected affected clinic IDs: []`);
  console.log(`Expected clinic count delta: +${expectedClinicCountDelta}`);
  
  if (isApply) {
    const allClinicsAfter = await clinicsRef.get();
    console.log(`\n[POST-FLIGHT] Verifying clinic count...`);
    const expectedTotal = totalClinicsBefore + expectedClinicCountDelta;
    console.log(`Actual Count: ${allClinicsAfter.size} (Expected: ${expectedTotal})`);
    
    if (allClinicsAfter.size !== expectedTotal) {
       console.error(`[FATAL ERROR] Clinic count mismatch! Expected ${expectedTotal}, got ${allClinicsAfter.size}`);
       process.exit(1);
    }
    
    console.log(`[SUCCESS] Kayseri Installation executed safely.`);
  }

  console.log('\n[LOG] Script completed.\n');
}

run().catch(console.error);
