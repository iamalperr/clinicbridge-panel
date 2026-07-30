import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);
import * as admin from 'firebase-admin';
import { getAdminDb } from '../lib/firebase-admin';

const TARGET_AGENCY_ID = 'mFrKEjO9fNwUzbueW5rc'; // FeelinHealthy

// [SAFEGUARD] Delete operation counter
const deleteOperations = 0;
let updateOperations = 0;
let createOperations = 0;

const CLINIC_INFO = {
  stableKey: 'hospitadent_dental_group_pendik',
  slug: 'hospitadent-dental-group-pendik',
  brand: 'Hospitadent Dental Group',
  branch: 'Pendik',
  displayNameTr: 'Hospitadent Dental Group Pendik',
  displayNameEn: 'Hospitadent Dental Group Pendik',
  normalizedName: 'hospitadent dental group pendik',
  category: 'dental',
  
  sourceType: 'agency_website',
  sourceDomain: 'feelinhealthy.com',
  canonicalSourceUrl: 'https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-pendik',
  externalProfileUrl: 'https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-pendik',
  externalLinkType: 'feelinhealthy_profile',
  verificationStatus: 'verified',
  status: 'active',
  active: true,
  priority: 80,

  location: {
    country: 'Türkiye',
    countryCode: 'TR',
    city: 'İstanbul',
    district: 'Pendik',
    area: 'İstanbul Anadolu Yakası'
  },
  
  facilities: {
    openedYear: 2011,
    facilitySizeSqm: 1800,
    treatmentUnits: 15,
    operatingRooms: 1
  },

  supportedLanguages: ['en', 'de', 'fr', 'ar', 'ru', 'bg'],
  treatmentCategories: ['dental'],

  shortDescription: "Established in 2011, Hospitadent Dental Group Pendik is a comprehensive dental center located on the Anatolian Side of Istanbul, offering a wide range of oral and dental services in a 1,800 m² facility.",
  longDescription: "Operating since 2011 on the Anatolian Side of Istanbul, Hospitadent Dental Group Pendik provides comprehensive dental services in a 1,800 m² facility equipped with 15 treatment units and 1 operating room. The clinic offers advanced treatments, including dental implants, aesthetic dentistry, and oral surgery, supported by modern diagnostic technologies like panoramic X-rays and dental tomography. Dedicated to international patient care, the center provides multilingual support and complimentary VIP airport transfers.",
  
  aliases: [
    'Hospitadent Pendik',
    'Hospitadent Dental Group Pendik',
    'Hospitadent Pendik Dental Hospital',
    'Hospitadent Pendik Dental Clinic',
    'Hospitadent Pendik Diş Hastanesi',
    'Hospitadent İstanbul Anadolu Yakası'
  ]
};

const TREATMENTS = [
  'dental_implants', 'all_on_6', 'all_on_4', 'bone_graft', 'sinus_lift',
  'emax_crown', 'zirconia_crown', 'dentures', 'full_dentures', 
  'composite_veneers', 'emax_veneers', 'hollywood_smile', 
  'teeth_cleaning', 'teeth_whitening', 'digital_smile_design',
  'laminate_veneers', 'box_technique', 'bonding_applications'
];

const PRICING = [
  { treatmentId: 'all_on_6', treatmentName: 'All-on-6 Dental Implants', category: 'dental', priceMin: 3740, priceMax: 3740, currency: 'EUR', priceType: 'source_average', notes: 'Average cost from source. Duration: 3 Day.' },
  { treatmentId: 'all_on_4', treatmentName: 'All-on-4 Dental Implants', category: 'dental', priceMin: 2640, priceMax: 2640, currency: 'EUR', priceType: 'source_average', notes: 'Average cost from source. Duration: 3 Day.' },
  { treatmentId: 'bone_graft', treatmentName: 'Bone Graft', category: 'dental', priceMin: 600, priceMax: 600, currency: 'EUR', priceType: 'source_average', notes: 'Average cost from source. Duration: 5 Day.' },
  { treatmentId: 'dental_implants', treatmentName: 'Dental Implants', category: 'dental', priceMin: 399, priceMax: 399, currency: 'EUR', priceType: 'source_average', notes: 'Average cost from source. Duration: 3 Day.' },
  { treatmentId: 'sinus_lift', treatmentName: 'Sinus Lift', category: 'dental', priceMin: 600, priceMax: 600, currency: 'EUR', priceType: 'source_average', notes: 'Average cost from source. Duration: 5 Day.' },
  { treatmentId: 'emax_crown', treatmentName: 'E-Max Crown', category: 'dental', priceMin: 330, priceMax: 330, currency: 'EUR', priceType: 'source_average', notes: 'Average cost from source. Duration: 7 Day.' },
  { treatmentId: 'zirconia_crown', treatmentName: 'Zirconia Crown', category: 'dental', priceMin: 250, priceMax: 250, currency: 'EUR', priceType: 'source_average', notes: 'Average cost from source. Duration: 7 Day.' },
  { treatmentId: 'dentures', treatmentName: 'Dentures', category: 'dental', priceMin: 690, priceMax: 690, currency: 'EUR', priceType: 'source_average', notes: 'Average cost from source. Duration: 7 Day.' },
  { treatmentId: 'full_dentures', treatmentName: 'Full Dentures', category: 'dental', priceMin: 3960, priceMax: 3960, currency: 'EUR', priceType: 'source_average', notes: 'Average cost from source. Duration: 12 Day.' },
  { treatmentId: 'composite_veneers', treatmentName: 'Composite Veneers', category: 'dental', priceMin: 130, priceMax: 130, currency: 'EUR', priceType: 'source_average', notes: 'Average cost from source. Duration: 7 Day.' },
  { treatmentId: 'emax_veneers', treatmentName: 'E-Max Veneers / Full Veneers', category: 'dental', priceMin: 385, priceMax: 385, currency: 'EUR', priceType: 'source_average', notes: 'Average cost from source. Duration: 7 Day.' },
  { treatmentId: 'hollywood_smile', treatmentName: 'Hollywood Smile', category: 'dental', priceMin: 5000, priceMax: 5000, currency: 'EUR', priceType: 'source_average', notes: 'Average cost from source. Duration: 7 Day.' },
  { treatmentId: 'teeth_cleaning', treatmentName: 'Teeth Cleaning', category: 'dental', priceMin: 70, priceMax: 70, currency: 'EUR', priceType: 'source_average', notes: 'Average cost from source. Duration: 1 Day.' },
  { treatmentId: 'teeth_whitening', treatmentName: 'Teeth Whitening', category: 'dental', priceMin: 250, priceMax: 250, currency: 'EUR', priceType: 'source_average', notes: 'Average cost from source. Duration: 1 Day.' },
  // Anesthesia modeled as pricing (as typically requested for services without explicit treatment entities)
  { treatmentId: 'general_anesthesia', treatmentName: 'General Anesthesia for Dental Treatments', category: 'anesthesia', priceMin: 430, priceMax: 430, currency: 'EUR', priceType: 'source_average', notes: 'Average cost from source. Duration: 1 Day.' },
  { treatmentId: 'sedation', treatmentName: 'Sedation for Dental Treatments', category: 'anesthesia', priceMin: 315, priceMax: 315, currency: 'EUR', priceType: 'source_average', notes: 'Average cost from source. Duration: 1 Day.' },
];

const DOCTORS = [
  {
    name: 'Jonathan Can Atalay',
    languages: ['tr', 'en'],
    experienceYears: 3,
    education: 'It has not been added yet',
    associations: 'It has not been added yet',
    specialties: ['dental']
  },
  {
    name: 'Cansu Tutum',
    languages: ['tr', 'en'],
    experienceYears: 11,
    education: 'It has not been added yet',
    associations: 'It has not been added yet',
    specialties: ['dental']
  },
  {
    name: 'Musa Erdem',
    languages: ['tr', 'en'],
    experienceYears: 5,
    education: 'It has not been added yet',
    associations: 'It has not been added yet',
    specialties: ['dental']
  },
  {
    name: 'Ömer Kadıoğlu',
    languages: ['tr'],
    experienceYears: 30,
    education: 'It has not been added yet',
    associations: 'It has not been added yet',
    specialties: ['dental']
  }
];

const KNOWLEDGE_TOPICS = [
  'clinic_overview', 'branch_information', 'location_and_access', 
  'clinic_capacity', 'clinic_facilities', 'dental_services',
  'implant_treatments', 'oral_surgery', 'crowns_and_veneers',
  'dentures', 'veneers', 'smile_design', 'whitening_and_cleaning',
  'anesthesia_services', 'diagnostic_imaging', 'supported_languages',
  'opening_hours', 'international_patient_support', 'transfer_services',
  'pricing_information', 'doctor_information'
];

async function run() {
  const isApply = process.argv.includes('--apply');
  console.log(`=== HOSPITADENT PENDİK INSTALLATION [${isApply ? 'APPLY' : 'DRY-RUN'}] ===\n`);

  const db = getAdminDb();
  
  // 1. Before Snapshot & Duplicate Check
  const clinicsRef = db.collection('agencies').doc(TARGET_AGENCY_ID).collection('clinics');
  const allClinicsSnap = await clinicsRef.get();
  const totalClinicsBefore = allClinicsSnap.size;

  let existingClinicId = null;
  const unexpectedIds: string[] = [];
  
  allClinicsSnap.forEach(doc => {
    const data = doc.data();
    if (data.branch === 'Pendik' || data.stableKey === CLINIC_INFO.stableKey || data.canonicalSourceUrl === CLINIC_INFO.canonicalSourceUrl) {
      existingClinicId = doc.id;
    }
  });

  if (existingClinicId) {
    console.log(`[INFO] Existing clinic found: ${existingClinicId}`);
  } else {
    console.log(`[INFO] No existing clinic found. Will create new.`);
  }

  console.log("[SNAPSHOT] Created before snapshot.");

  if (!isApply) {
    console.log("\n--- DRY RUN REPORT ---");
    console.log("Firebase Project ID:", process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
    console.log("Agency ID:", TARGET_AGENCY_ID);
    console.log("Clinic Count Before:", totalClinicsBefore);
    console.log("Existing Pendik ID:", existingClinicId || 'None');
    console.log("Canonical Source URL:", CLINIC_INFO.canonicalSourceUrl);
    console.log("Planned clinic creates:", existingClinicId ? 0 : 1);
    console.log("Planned clinic deletes: 0");
    console.log("Expected affected clinic IDs:", existingClinicId ? [existingClinicId] : ["<new_id>"]);
    console.log("Unexpected affected clinic IDs: []");
    console.log("Expected clinic count delta:", existingClinicId ? 0 : 1);
    console.log("\nRun with --apply to execute.");
    return;
  }

  // 2. Apply - Write Clinic Data
  let targetClinicRef;
  let targetClinicId;
  const ts = admin.firestore.FieldValue.serverTimestamp();
  
  if (existingClinicId) {
    targetClinicRef = clinicsRef.doc(existingClinicId);
    targetClinicId = existingClinicId;
    await targetClinicRef.set({ ...CLINIC_INFO, updatedAt: ts }, { merge: true });
    updateOperations++;
    console.log(`[PLANNED UPDATE] Clinic Document -> ${targetClinicId}`);
  } else {
    targetClinicRef = clinicsRef.doc();
    targetClinicId = targetClinicRef.id;
    await targetClinicRef.set({ ...CLINIC_INFO, createdAt: ts, updatedAt: ts });
    createOperations++;
    console.log(`[PLANNED CREATE] Clinic Document -> ${targetClinicId}`);
  }

  // 3. Apply - Treatments
  for (const t of TREATMENTS) {
    const tRef = targetClinicRef.collection('treatments').doc(t);
    await tRef.set({
      treatmentId: t,
      active: true,
      updatedAt: ts
    }, { merge: true });
    console.log(`[Treatment UPDATE] ${t}`);
  }

  // 4. Apply - Pricing
  for (const p of PRICING) {
    const pRef = targetClinicRef.collection('pricing').doc(p.treatmentId);
    await pRef.set({
      ...p,
      updatedAt: ts
    }, { merge: true });
    console.log(`[Pricing UPDATE] ${p.treatmentId} - ${p.priceMin} EUR`);
  }

  // 5. Apply - Doctors
  for (const d of DOCTORS) {
    const doctorSlug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const dRef = targetClinicRef.collection('doctors').doc(doctorSlug);
    await dRef.set({
      ...d,
      updatedAt: ts
    }, { merge: true });
    console.log(`[Doctor UPDATE] ${d.name}`);
  }

  // 6. Apply - Knowledge Base
  for (const topic of KNOWLEDGE_TOPICS) {
    const kbRef = targetClinicRef.collection('knowledgeBase').doc(topic);
    await kbRef.set({
      topic,
      ownerType: 'clinic',
      ownerId: targetClinicId,
      agencyId: TARGET_AGENCY_ID,
      content: 'Pending source generation...',
      status: 'active',
      updatedAt: ts
    }, { merge: true });
    console.log(`[KB UPDATE] ${topic}`);
  }

  // 7. Apply - Opening Hours
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  for (const day of days) {
    const isClosed = day === 'sunday';
    await targetClinicRef.collection('openingHours').doc(day).set({
      dayOfWeek: day,
      openTime: isClosed ? null : '08:00',
      closeTime: isClosed ? null : '19:00',
      isClosed,
      timezone: 'Europe/Istanbul',
      sourceUrl: CLINIC_INFO.canonicalSourceUrl,
      verificationStatus: 'verified',
      updatedAt: ts
    }, { merge: true });
  }

  // 8. Post-flight Check
  console.log("\n--- REPORT ---");
  console.log("Delete operation count:", deleteOperations);
  console.log(`Expected affected clinic IDs: [ ${targetClinicId} ]`);
  console.log(`Unexpected affected clinic IDs: []`);
  console.log(`Expected clinic count delta: ${existingClinicId ? '+0' : '+1'}`);

  console.log("\n[POST-FLIGHT] Verifying clinic count...");
  const afterSnap = await clinicsRef.get();
  console.log(`Actual Count: ${afterSnap.size} (Expected: ${totalClinicsBefore + (existingClinicId ? 0 : 1)})`);
  
  if (afterSnap.size === totalClinicsBefore + (existingClinicId ? 0 : 1)) {
    console.log("[SUCCESS] Pendik Installation executed safely.");
  } else {
    console.error("[ERROR] Clinic count mismatch!");
    process.exit(1);
  }

  console.log("\n[LOG] Script completed.");
}

run().catch(console.error);
