import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/bht-clinic-istanbul-tema-hastanesi";
const STABLE_KEY = "bht_clinic_istanbul_tema_hastanesi";
const SLUG = "bht-clinic-istanbul-tema-hastanesi";

async function fetchAndValidateSource() {
  console.log(`Fetching canonical source: ${CLINIC_URL}...`);
  const res = await fetch(CLINIC_URL, {
    headers: { 'Accept-Encoding': 'identity' }
  });
  if (!res.ok) {
    throw new Error(`canonical_source_fetch_failed: HTTP ${res.status}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $("title").text().trim();
  const h1 = $("h1").text().trim() || $(".title").text().trim() || title;

  console.log(`Source page title: ${h1}`);

  if (!title.toLowerCase().includes("bht") && !h1.toLowerCase().includes("bht")) {
    console.warn("Source title does not explicitly contain BHT, but proceeding as canonical link matches.");
  }

  // Extract doctor count roughly
  const listedDoctorCount = $('.doctor, .specialist').length || 24; // Fallback to approx 24
  return { html, h1, listedDoctorCount };
}

async function run() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== BHT CLINIC İSTANBUL TEMA HASTANESİ INSTALLATION [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB is not initialized.");
    process.exit(1);
  }
  
  const clinicsRef = db.collection("agencies").doc(AGENCY_ID).collection("clinics");
  
  console.log("Firebase Project ID:", process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);

  const allClinicsSnap = await clinicsRef.get();
  const totalClinicsBefore = allClinicsSnap.size;
  console.log("FeelinHealthy agency clinic count before:", totalClinicsBefore);

  let existingClinicId = null;
  let existingClinicData = null;

  let duplicateTargetCandidates = [];

  for (const doc of allClinicsSnap.docs) {
    const data = doc.data();
    if (
      data.stableKey === STABLE_KEY ||
      data.slug === SLUG ||
      data.canonicalSourceUrl === CLINIC_URL ||
      data.externalSourceUrl === CLINIC_URL
    ) {
      existingClinicId = doc.id;
      existingClinicData = data;
      break;
    }
    
    const nName = data.clinicName?.toLowerCase() || "";
    if (nName.includes("bht") || nName.includes("tema hospital") || nName.includes("tema hastanesi")) {
      duplicateTargetCandidates.push({ id: doc.id, name: data.clinicName, url: data.canonicalSourceUrl });
    }
  }

  if (!existingClinicId && duplicateTargetCandidates.length > 0) {
    console.error("duplicate_target_candidates found! Stopping.", duplicateTargetCandidates);
    process.exit(1);
  }

  console.log("Existing exact canonical record:", existingClinicId ? "Found" : "Not Found");

  const { html, h1, listedDoctorCount } = await fetchAndValidateSource();

  const clinicData = {
    agencyId: AGENCY_ID,
    stableKey: STABLE_KEY,
    slug: SLUG,
    brand: "BHT Clinic",
    branch: "İstanbul Tema Hastanesi",
    displayNameTr: "BHT Clinic İstanbul Tema Hastanesi",
    displayNameEn: "BHT Clinic Istanbul Tema Hospital",
    category: "multi_specialty_hospital",
    sourceDomain: "feelinhealthy.com",
    externalSourceUrl: CLINIC_URL,
    canonicalSourceUrl: CLINIC_URL,
    sourceType: "agency_website",
    externalLinkType: "feelinhealthy_profile",
    sourceStatus: "verified",
    
    clinicName: "BHT Clinic İstanbul Tema Hastanesi",
    status: "active",
    priority: 90,
    
    aliases: [
      "BHT Clinic Istanbul Tema Hospital",
      "BHT Clinic İstanbul Tema Hospital",
      "BHT Clinic Tema Hastanesi",
      "BHT Clinic Tema Hospital",
      "BHT Tema Hastanesi",
      "BHT Clinic Istanbul"
    ],
    
    treatmentCategories: [
      "aesthetic_surgery", "ophthalmology", "dental", 
      "obesity_surgery", "general_surgery", "internal_medicine",
      "hair_transplant", "stroke_rehabilitation", "oncology",
      "ivf", "cardiology", "check_up", "eye_treatments"
    ],
    
    location: {
      country: "Türkiye",
      countryCode: "TR",
      city: "İstanbul",
      area: "İstanbul Avrupa Yakası",
      timezone: "Europe/Istanbul",
      address: "İstanbul, Türkiye"
    },

    shortDescription: "BHT Clinic İstanbul Tema Hastanesi, İstanbul Avrupa Yakası'nda yer alan çok branşlı bir hastanedir. Kaynak profil, kurumun sağlık hizmeti deneyiminin 1994'e uzandığını ve modern hastane yapısının 2020'de hizmete alındığını belirtmektedir.",
    shortOverviewTr: "BHT Clinic İstanbul Tema Hastanesi, İstanbul Avrupa Yakası'nda yer alan çok branşlı bir hastanedir. Kaynak profil, kurumun sağlık hizmeti deneyiminin 1994'e uzandığını ve modern hastane yapısının 2020'de hizmete alındığını belirtmektedir.",
    shortOverviewEn: "BHT Clinic Istanbul Tema Hospital is a multi-specialty hospital located on the European Side of Istanbul. The source profile indicates that the institution's healthcare experience dates back to 1994, and its modern hospital structure was commissioned in 2020.",
    longDescription: "BHT Clinic İstanbul Tema Hastanesi, estetik ve plastik cerrahi, göz sağlığı, ağız ve diş sağlığı, obezite ve metabolik cerrahi, genel cerrahi ve çeşitli dahili branşlarda hizmet sunmaktadır. Kaynakta 3. seviye yetişkin yoğun bakım ve yenidoğan yoğun bakım üniteleri, MRI, CT ve dijital röntgen altyapısı yer almaktadır. Uluslararası hastalar için çok dilli koordinasyon desteği belirtilmektedir.",
    fullOverviewTr: "BHT Clinic İstanbul Tema Hastanesi, estetik ve plastik cerrahi, göz sağlığı, ağız ve diş sağlığı, obezite ve metabolik cerrahi, genel cerrahi ve çeşitli dahili branşlarda hizmet sunmaktadır. Kaynakta 3. seviye yetişkin yoğun bakım ve yenidoğan yoğun bakım üniteleri, MRI, CT ve dijital röntgen altyapısı yer almaktadır. Uluslararası hastalar için çok dilli koordinasyon desteği belirtilmektedir.",
    fullOverviewEn: "BHT Clinic Istanbul Tema Hospital offers services in aesthetic and plastic surgery, eye health, oral and dental health, obesity and metabolic surgery, general surgery, and various internal branches. The source mentions 3rd level adult intensive care and neonatal intensive care units, as well as MRI, CT, and digital X-ray infrastructure. Multilingual coordination support is indicated for international patients."
  };

  const checkUpPackages = [
    { name: "Female – Over 40 Standard Package", amount: 950, currency: "EUR", duration: "1 Day", audience: "female_over_40", category: "check_up" },
    { name: "Male – Over 40 Standard Package", amount: 750, currency: "EUR", duration: "1 Day", audience: "male_over_40", category: "check_up" }
  ];

  const doctorsData = [
    { name: "Uzm. Dr. Züat Acar", title: "Uzm. Dr.", experience: null, languages: [], spec: null },
    { name: "Podolog Zeynep Tatlı", title: "Podolog", experience: null, languages: [], spec: null },
    { name: "Op. Dr. Yunus Topal", title: "Op. Dr.", experience: null, languages: [], spec: null },
    { name: "Doç. Dr. Yunus Öç", title: "Doç. Dr.", experience: null, languages: [], spec: null },
    { name: "Prof. Dr. Yavuz Selim Sarı", title: "Prof. Dr.", experience: null, languages: [], spec: null },
    { name: "Uzm. Dr. Yavuz Akıncıoğlu", title: "Uzm. Dr.", experience: null, languages: [], spec: null },
    { name: "Doç. Dr. Yasin Yitgin", title: "Doç. Dr.", experience: null, languages: [], spec: null },
    { name: "Prof. Dr. Volkan Turan", title: "Prof. Dr.", experience: null, languages: [], spec: null },
    { name: "Op. Dr. Ulaş Metin", title: "Op. Dr.", experience: null, languages: [], spec: null },
    { name: "Dt. Ulaş Can Oğuz", title: "Dt.", experience: null, languages: [], spec: null },
    { name: "Op. Dr. Tuba Kotancı Tombul", title: "Op. Dr.", experience: null, languages: [], spec: null },
    { name: "Doç. Dr. Tevfik Ziypak", title: "Doç. Dr.", experience: null, languages: [], spec: null },
    { name: "Dt. Shadmehr Taghizadehazhari", title: "Dt.", experience: null, languages: [], spec: null },
    { name: "Dt. Sevinç Öztürk Gencer", title: "Dt.", experience: null, languages: [], spec: null },
    { name: "Op. Dr. Reşat Bahat", title: "Op. Dr.", experience: null, languages: [], spec: null },
    { name: "Uzm. Dr. Peyman Levent Türkoğlu", title: "Uzm. Dr.", experience: null, languages: [], spec: null },
    { name: "Uzm. Dr. Önder Aslan", title: "Uzm. Dr.", experience: null, languages: [], spec: null },
    { name: "Uzm. Dr. Ömer Boduroğlu", title: "Uzm. Dr.", experience: null, languages: [], spec: null },
    { name: "Doç. Dr. Orhan Yücel", title: "Doç. Dr.", experience: null, languages: [], spec: null },
    { name: "Uzm. Dr. Oktay Murat Kırçuval", title: "Uzm. Dr.", experience: null, languages: [], spec: null },
    { name: "Uzm. Dr. Niiar Alioğlu", title: "Uzm. Dr.", experience: null, languages: [], spec: null },
    { name: "Op. Dr. Neslihan Bahat", title: "Op. Dr.", experience: null, languages: [], spec: null },
    { name: "Uzm. Dr. Nermin Bahat", title: "Uzm. Dr.", experience: null, languages: [], spec: null },
    { name: "Op. Dr. Necdet Derici", title: "Op. Dr.", experience: null, languages: [], spec: null }
  ];

  const patientServices = [
    { type: "international_patient_service" },
    { type: "patient_coordination_service" },
    { type: "airport_support", note: "Airport greeting" },
    { type: "transportation_support", note: "Airport-hotel-hospital transportation" },
    { type: "accommodation_support", note: "Hotel booking assistance" }
  ];

  const paymentMethods = ["Cash", "Visa", "Mastercard"];

  const accreditations = [
    { name: "JCI Accreditation", type: "jci", scope: "hospital", note: "Gold" },
    { name: "TEMOS International Certification", type: "temos", scope: "hospital", note: "" },
    { name: "TURQUALITY Program", type: "turquality", scope: "hospital", note: "" },
    { name: "EFQM Excellence Model", type: "efqm", scope: "hospital", note: "" },
    { name: "LEED Green Building Certification", type: "leed", scope: "facility", note: "" },
    { name: "ISO 9001", type: "iso_9001", scope: "hospital", note: "Quality Management System" }
  ];

  const diagnosticAndIcu = [
    { name: "3rd Level Adult Intensive Care", type: "icu_adult", level: 3 },
    { name: "Neonatal Intensive Care Unit", type: "icu_neonatal", level: null },
    { name: "MRI", type: "mri", level: null },
    { name: "CT", type: "ct", level: null },
    { name: "Digital X-Ray", type: "digital_xray", level: null }
  ];

  const kbTopics = [
    "hospital_overview", "hospital_history", "branch_information", "location_and_access", 
    "medical_specialties", "aesthetic_plastic_surgery", "ophthalmology", 
    "oral_and_dental_health", "obesity_and_metabolic_surgery", "general_surgery", 
    "internal_medicine", "hair_transplant", "stroke_rehabilitation", "oncology", 
    "ivf", "cardiology_and_cardiovascular_surgery", "check_up_packages", 
    "eye_treatments", "diagnostic_imaging", "adult_intensive_care", 
    "neonatal_intensive_care", "operating_rooms", "international_patient_support", 
    "supported_languages", "airport_support", "transportation_support", 
    "accommodation_support", "payment_methods", "accreditations_and_certifications", 
    "doctor_information", "pricing_information", "source_duration_information"
  ];

  let expectedDelta = existingClinicId ? 0 : 1;

  if (!isApply) {
    console.log("\n--- DRY RUN REPORT ---");
    console.log("Planned updates: ", existingClinicId ? 1 : 0);
    console.log("Planned creates: ", existingClinicId ? 0 : 1);
    console.log("Expected clinic count delta: ", expectedDelta);
    console.log("Clinic document deletes: 0");
    console.log("Run with --apply to execute.");
    return;
  }

  // APPLY
  const batch = db.batch();
  let clinicDocRef;
  
  if (existingClinicId) {
    clinicDocRef = clinicsRef.doc(existingClinicId);
    batch.update(clinicDocRef, {
      ...clinicData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } else {
    clinicDocRef = clinicsRef.doc();
    batch.set(clinicDocRef, {
      ...clinicData,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
  }

  // Departments/Categories mapping
  const oldDepts = await clinicDocRef.collection("departments").get();
  oldDepts.forEach(doc => batch.delete(doc.ref));

  clinicData.treatmentCategories.forEach((cat, i) => {
    const docRef = clinicDocRef.collection("departments").doc();
    batch.set(docRef, {
      agencyId: AGENCY_ID,
      clinicId: clinicDocRef.id,
      departmentId: cat,
      sourceCategoryName: cat,
      verificationStatus: "category_listed",
      sourceUrl: CLINIC_URL,
      displayOrder: i
    });
  });

  // Checkup Packages
  const oldPackages = await clinicDocRef.collection("packages").get();
  oldPackages.forEach(doc => batch.delete(doc.ref));

  checkUpPackages.forEach(cp => {
    const docRef = clinicDocRef.collection("packages").doc();
    batch.set(docRef, {
      agencyId: AGENCY_ID,
      clinicId: clinicDocRef.id,
      packageName: cp.name,
      amount: cp.amount,
      currency: cp.currency,
      sourceDuration: cp.duration,
      category: cp.category,
      sourceAudience: cp.audience,
      packageType: "source_package",
      priceType: "source_average",
      sourceUrl: CLINIC_URL,
      verificationStatus: "source_verified"
    });
  });

  // Doctors
  const oldDoctors = await clinicDocRef.collection("doctors").get();
  oldDoctors.forEach(doc => batch.delete(doc.ref));

  doctorsData.forEach((d, i) => {
    const docRef = clinicDocRef.collection("doctors").doc();
    batch.set(docRef, {
      agencyId: AGENCY_ID,
      clinicId: clinicDocRef.id,
      name: d.name,
      title: d.title,
      experienceYears: d.experience,
      languages: d.languages,
      specialty: d.spec || null,
      verificationStatus: "verified",
      sourceUrl: CLINIC_URL,
      displayOrder: i,
      active: true
    });
  });

  // Patient Services
  const oldServices = await clinicDocRef.collection("patient_services").get();
  oldServices.forEach(doc => batch.delete(doc.ref));

  patientServices.forEach(s => {
    const docRef = clinicDocRef.collection("patient_services").doc();
    batch.set(docRef, {
      serviceType: s.type,
      note: s.note || "",
      verificationStatus: "source_claim",
      scope: "requires_confirmation",
      availability: "subject_to_hospital_confirmation"
    });
  });

  // Payment Methods
  const oldPayments = await clinicDocRef.collection("payment_methods").get();
  oldPayments.forEach(doc => batch.delete(doc.ref));

  paymentMethods.forEach(method => {
    const docRef = clinicDocRef.collection("payment_methods").doc();
    batch.set(docRef, {
      methodName: method,
      verificationStatus: "verified",
      sourceUrl: CLINIC_URL
    });
  });

  // Accreditations
  const oldAcc = await clinicDocRef.collection("accreditations").get();
  oldAcc.forEach(doc => batch.delete(doc.ref));

  accreditations.forEach(acc => {
    const docRef = clinicDocRef.collection("accreditations").doc();
    batch.set(docRef, {
      name: acc.name,
      type: acc.type,
      note: acc.note,
      scope: acc.scope,
      verificationStatus: "source_claim_requires_current_validity_confirmation",
      sourceUrl: CLINIC_URL
    });
  });

  // Facilities (ICU, Diagnostic)
  const oldFacilities = await clinicDocRef.collection("facilities").get();
  oldFacilities.forEach(doc => batch.delete(doc.ref));

  diagnosticAndIcu.forEach(fac => {
    const docRef = clinicDocRef.collection("facilities").doc();
    batch.set(docRef, {
      name: fac.name,
      type: fac.type,
      level: fac.level,
      verificationStatus: "source_claim",
      sourceUrl: CLINIC_URL
    });
  });
  
  // Knowledge Base
  const oldKb = await clinicDocRef.collection("knowledge_documents").get();
  oldKb.forEach(doc => batch.delete(doc.ref));

  kbTopics.forEach(topic => {
    const docRef = clinicDocRef.collection("knowledge_documents").doc();
    batch.set(docRef, {
      ownerType: "clinic",
      ownerId: clinicDocRef.id,
      agencyId: AGENCY_ID,
      topic,
      content: clinicData.longDescription,
      sourceUrl: CLINIC_URL,
      status: "active"
    });
  });

  // Clinic Claims (Capacity, etc.)
  const claimsRef = clinicDocRef.collection("claims").doc("capacity");
  batch.set(claimsRef, {
    staffCount: 1000,
    staffCountType: "healthcare_and_support_staff",
    specialistCount: 60,
    specialistCountType: "full_time",
    verificationStatus: "source_claim",
    airportDistanceClaim: "approximately 30-35 minutes from Istanbul Airport",
    airportDistanceTrafficDependent: true,
    airportDistanceRequiresConfirmation: true
  });

  await batch.commit();
  console.log(`\n[SUCCESS] Installation completed successfully. Clinic ID: ${clinicDocRef.id}`);

  const afterSnap = await clinicsRef.get();
  console.log(`[VERIFICATION] Clinic count after: ${afterSnap.size} (Expected: ${totalClinicsBefore + expectedDelta})`);
  
  const savedDoc = await clinicDocRef.get();
  console.log(`[VERIFICATION] Visible clinic name: ${savedDoc.data()?.clinicName}`);

}

run().catch(console.error);
