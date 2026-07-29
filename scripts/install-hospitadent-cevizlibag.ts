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
  stableKey: 'hospitadent_dental_group_cevizlibag',
  slug: 'hospitadent-dental-group-cevizlibag',
  brand: 'Hospitadent Dental Group',
  branch: 'Cevizlibağ',
  displayNameTr: 'Hospitadent Dental Group Cevizlibağ',
  displayNameEn: 'Hospitadent Dental Group Cevizlibağ',
  category: 'dental',
  facilityType: 'clinic',
  sourceType: 'official_brand_website',
  sourceDomain: 'hospitadent.com',
  externalSourceUrl: 'https://www.hospitadent.com/en/branches/cevizlibag',
  status: 'verification_pending',

  location: {
    country: 'Türkiye',
    countryCode: 'TR',
    city: 'İstanbul',
    district: 'Zeytinburnu',
    neighborhood: 'Merkezefendi',
    area: 'Cevizlibağ',
    region: 'İstanbul European Side / Avrupa Yakası',
    fullAddress: 'Merkezefendi, gümüşsuyu davutpaşa caddesi, G-54. Sk., 34015 Zeytinburnu/İstanbul',
    postalCode: '34015',
    transportationNotes: 'E-5 kenarındadır, T1 Bağcılar-Kabataş tramvay hattının Cevizlibağ-AÖY durağına veya Metrobüs Cevizlibağ durağına yakındır.',
  },
  contact: {
    phone: '+90 212 664 60 62'
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
  shortOverviewTr: "Çeyrek asra yaklaşan tıbbi tecrübesiyle İstanbul Avrupa Yakası'nda Cevizlibağ'da hizmet veren modern diş kliniğidir.",
  shortOverviewEn: "Modern dental clinic located in Cevizlibağ on the European Side of Istanbul, offering comprehensive dental services with a quarter-century of medical experience.",
  fullOverviewTr: "Sağlıklı, bembeyaz ve estetik bir gülüş, hem bedensel sağlığımızın hem de sosyal hayattaki duruşumuzun en kritik parçalarından biridir. İstanbul’un kalbi sayılabilecek, ana ulaşım arterlerinin kesişim noktasında yer alan bu dinamik bölgede, ağız sağlığınızı emanet edebileceğiniz güvenilir bir sağlık üssü bulmak son derece önemlidir. Çeyrek asra yaklaşan tıbbi tecrübesi ve uluslararası kalite belgeleriyle Hospitadent, donanımlı ve modern bir Cevizlibağ diş kliniği arayanlar için uzman hekim kadrosu, yenilikçi teknolojik altyapısı ve yüksek hasta memnuniyeti ilkesiyle hizmet vermektedir.",
  fullOverviewEn: "A healthy, white, and aesthetic smile is one of the most critical parts of both our physical health and our stance in social life. Located at the intersection of main transportation arteries in this dynamic region, which can be considered the heart of Istanbul, Hospitadent serves with its expert physician staff, innovative technological infrastructure, and high patient satisfaction principle with its medical experience approaching a quarter of a century.",
};

const DOCTORS = [
  { fullName: 'Dr. Deniz Turgut', specialty: 'Endodontist', experienceYears: 0 },
  { fullName: 'Dt. Seyfettin YANIK', specialty: 'Chief Physician / Dentist', experienceYears: 0 },
  { fullName: 'Dr. Ozan BURAK İSKEFLI', specialty: 'Periodontologist', experienceYears: 0 },
  { fullName: 'Dt. Nilüfer SU DOKUZ', specialty: 'Dentist', experienceYears: 0 },
  { fullName: 'Dr. Leman REHIMOVA', specialty: 'Orthodontist', experienceYears: 0 },
  { fullName: 'Dt. İsmail ÇEVIK', specialty: 'Dentist', experienceYears: 0 },
  { fullName: 'Dt. Hamit YENIKAN', specialty: 'Dentist', experienceYears: 0 },
  { fullName: 'Dt. Erol AYDIN', specialty: 'Dentist', experienceYears: 0 },
];

const KNOWLEDGE_CHUNKS = [
  {
    topic: 'clinic_overview',
    content: "Hospitadent Cevizlibağ, İstanbul Avrupa Yakası'nda Cevizlibağ/Zeytinburnu bölgesinde hizmet veren kurumsal bir diş kliniğidir. 8 uzman hekim kadrosu ile çürük önleyici rutin uygulamalardan ileri seviye cerrahi müdahalelere, dijital gülüş tasarımından ortodontik tedavilere kadar geniş bir yelpazede hizmet sunmaktadır."
  },
  {
    topic: 'location_and_access',
    content: "Klinik E-5 kenarında yer almaktadır. Merkezefendi Mahallesi, Gümüşsuyu Davutpaşa Caddesi üzerindedir. T1 Bağcılar-Kabataş tramvay hattının Cevizlibağ-AÖY durağında inilerek veya Metrobüs Cevizlibağ durağı kullanılarak kolayca ulaşılabilir."
  },
  {
    topic: 'anesthesia_services',
    content: "Hastaların ağrısız ve konforlu bir tedavi süreci geçirebilmesi için sedasyon ve genel anestezi olanakları bulunmaktadır."
  },
  {
    topic: 'opening_hours',
    content: "Klinik Pazartesi'den Cumartesi'ye kadar her gün 09:00 ile 18:00 saatleri arasında hizmet vermektedir. Pazar günleri kapalıdır."
  }
];

async function run() {
  const isApply = process.argv.includes('--apply');
  console.log(`\n=== HOSPITADENT CEVİZLİBAĞ INSTALLATION [${isApply ? 'APPLY' : 'DRY-RUN'}] ===\n`);
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
    
    let cevizlibagFound = false;
    afterSnapshot.forEach(doc => {
       console.log(` - [${doc.id}] ${doc.data().displayNameTr || doc.data().displayNameEn}`);
       if (doc.data().stableKey === CLINIC_INFO.stableKey) {
           cevizlibagFound = true;
       }
    });

    if (!cevizlibagFound) {
       console.error(`[FATAL ERROR] The clinic was not found in the DB after apply!`);
       process.exit(1);
    }
    console.log(`[SUCCESS] Counts match expected value.`);
  }

  console.log('\n[LOG] Script completed.\n');
}

run().catch(console.error);
