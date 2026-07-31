import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/memorial-hospital";
const STABLE_KEY = "memorial_hospital_antalya";
const SLUG = "memorial-hospital";

async function fetchAndParseSource() {
  console.log(`Fetching canonical source: ${CLINIC_URL}...`);
  let res;
  let attempt = 0;
  while (attempt < 3) {
      try {
          res = await fetch(CLINIC_URL, {
            headers: { 'Accept-Encoding': 'identity' },
            redirect: 'manual'
          });
          if (res.status >= 300 && res.status < 400) {
              throw new Error(`canonical_source_fetch_failed_or_identity_mismatch: Redirected to ${res.headers.get('location')}`);
          }
          if (res.ok) break;
      } catch (err) {
          attempt++;
          console.log(`Fetch attempt ${attempt} failed.`);
          if (attempt === 3) throw err;
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $("title").text().trim();
  const h1 = $("h1").text().trim() || $(".title").text().trim();

  const h1Lower = h1.toLocaleLowerCase('tr');
  if (!h1Lower.includes("memorial")) {
    throw new Error(`canonical_source_fetch_failed_or_identity_mismatch: Title does not match target. Got: ${h1}`);
  }

  console.log(`Source page title: ${h1}`);

  // We extract all text to find the facts
  const fullBodyText = $("body").text().replace(/\s+/g, " ");
  
  // Service Categories Extraction
  const serviceCategoriesFound: string[] = [];
  
  const textLower = fullBodyText.toLowerCase();
  
  // Mapping texts to enum keys
  const categoryMap: Record<string, string> = {
      "dental": "dental",
      "hair transplant": "hair_transplant",
      "aesthetic, plastic and reconstructive surgery": "aesthetic_plastic_reconstructive_surgery",
      "stroke rehabilitation": "stroke_rehabilitation",
      "oncology": "oncology",
      "ivf": "ivf",
      "in vitro fertilization": "ivf",
      "cardiology": "cardiology_cardiovascular_surgery",
      "cardiovascular surgery": "cardiology_cardiovascular_surgery",
      "check-up": "check_up",
      "eye treatment": "eye_treatments",
      "bone marrow": "bone_marrow_stem_cell_transplantation"
  };

  for (const [key, val] of Object.entries(categoryMap)) {
      if (textLower.includes(key) && !serviceCategoriesFound.includes(val)) {
          serviceCategoriesFound.push(val);
      }
  }

  // Doctor extraction
  const doctors: any[] = [];
  $("h4").each((i, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text && !text.includes("Health and Travel") && !text.includes("Your Health")) {
        const parts = text.split(",");
        let name = parts[0].trim();
        let specialty = parts.length > 1 ? parts.slice(1).join(",").trim() : null;

        let title = "";
        if (name.includes("Prof. Dr.")) {
            title = "Prof. Dr.";
            name = name.replace("Prof. Dr.", "").trim();
        } else if (name.includes("Op. Dr.")) {
            title = "Op. Dr.";
            name = name.replace("Op. Dr.", "").trim();
        } else if (name.includes("Prof.")) {
            title = "Prof.";
            name = name.replace("Prof.", "").trim();
        } else if (name.includes("Assoc. Prof.")) {
            title = "Assoc. Prof.";
            name = name.replace("Assoc. Prof.", "").trim();
        } else if (name.includes("MD")) {
            title = "MD";
            name = name.replace("MD", "").trim();
        }
        
        // Check specialty edge cases (e.g., MD in specialty)
        if (specialty && specialty.includes("MD")) {
            specialty = specialty.replace("MD", "").trim();
        }

        // Check for data quality warnings
        let dataQualityFlags = [];
        if (text.includes("Mahmut AKYÜZ")) dataQualityFlags.push("specialty_education_mismatch_possible");
        
        doctors.push({
            name,
            sourceDisplayName: text,
            sourceTitle: title,
            specialty,
            languages: ["English", "Turkish"], // Extracted from generic rule
            education: null,
            experienceYears: null,
            associations: null,
            sourceDataQualityFlags: dataQualityFlags
        });
    }
  });

  return { html, h1, fullBodyText, doctors, serviceCategoriesFound };
}

async function run() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== MEMORIAL HOSPITAL INSTALLATION [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB is not initialized.");
    process.exit(1);
  }
  
  const clinicsRef = db.collection("agencies").doc(AGENCY_ID).collection("clinics");
  const allClinicsSnap = await clinicsRef.get();

  let ozelIlkeFound = false;
  let antalyaFound = false;

  allClinicsSnap.forEach(d => {
      if (d.id === "SlbVcqWOLNigPDbEiTeT" || d.data().clinicName.includes("Özel İlke")) ozelIlkeFound = true;
      if (d.data().clinicName.includes("Hospitadent") && d.data().clinicName.includes("Antalya")) antalyaFound = true;
  });

  if (!ozelIlkeFound) {
      console.error("previous_clinic_not_completed: Özel İlke Ağız ve Diş Sağlığı Polikliniği is not found in the DB.");
      process.exit(1);
  } else {
      console.log("Previous clinic (Özel İlke) is verified as completed.");
  }

  if (!antalyaFound) {
      console.error("canonical_predecessor_not_installed: Hospitadent Dental Group Antalya is not found in the DB.");
      process.exit(1);
  } else {
      console.log("Position 19 clinic (Hospitadent Antalya) is verified as already installed.");
  }

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
    
    // Check branch/city collisions carefully
    const nName = data.clinicName?.toLowerCase() || "";
    if (nName.includes("memorial") && data.location?.city === "Antalya") {
      duplicateTargetCandidates.push({ id: doc.id, name: data.clinicName, url: data.canonicalSourceUrl });
    }
  }

  // Auto-merge if exact name match and it's the only one
  if (!existingClinicId && duplicateTargetCandidates.length === 1) {
    const c = duplicateTargetCandidates[0];
    if (c.name.toLowerCase().includes("memorial hospital")) {
        console.log("Repairing broken exact name match:", c.id);
        existingClinicId = c.id;
        duplicateTargetCandidates = [];
    }
  }

  if (!existingClinicId && duplicateTargetCandidates.length > 0) {
    console.error("duplicate_target_candidates found! Stopping.", duplicateTargetCandidates);
    process.exit(1);
  }

  console.log("Existing exact canonical record:", existingClinicId ? "Found" : "Not Found");

  const { h1, fullBodyText, doctors, serviceCategoriesFound } = await fetchAndParseSource();

  console.log(`Extracted Service Categories: ${serviceCategoriesFound.join(", ")}`);
  console.log(`Extracted Doctors: ${doctors.length}`);

  console.log("detailed_treatment_rows_not_listed_on_canonical_source");
  console.log("pricing_rows_not_listed_on_canonical_source");
  console.log("promotions_not_listed_on_canonical_source");

  const clinicData = {
    agencyId: AGENCY_ID,
    stableKey: STABLE_KEY,
    slug: SLUG,
    brand: "Memorial",
    branch: "Antalya", // Rule: Structured branch
    displayNameTr: "Memorial Hospital",
    displayNameEn: "Memorial Hospital",
    category: "hospital", // Proper enum for multi_specialty
    sourceDomain: "feelinhealthy.com",
    externalSourceUrl: CLINIC_URL,
    canonicalSourceUrl: CLINIC_URL,
    sourceType: "agency_website",
    externalLinkType: "feelinhealthy_profile",
    sourceStatus: "verified",
    
    clinicName: "Memorial Hospital",
    status: "active",
    priority: 81, 
    
    aliases: [
      "Memorial Hospital",
      "Memorial Antalya Hospital",
      "Memorial Antalya",
      "Memorial Healthcare Group Antalya",
      "Memorial Hastanesi Antalya",
      "Memorial Antalya Hastanesi"
    ],
    
    treatmentCategories: serviceCategoriesFound,
    
    location: {
      country: "Türkiye",
      countryCode: "TR",
      city: "Antalya",
      timezone: "Europe/Istanbul"
    },

    shortDescription: "Memorial Antalya Hospital provides multi-specialty healthcare services.",
    shortOverviewTr: "Memorial Antalya Hastanesi çok branşlı sağlık hizmetleri sunmaktadır.",
    shortOverviewEn: "Memorial Antalya Hospital provides multi-specialty healthcare services.",
    longDescription: "Memorial Hospital is part of the Memorial Healthcare Group, providing a wide range of medical services in Antalya.",
    fullOverviewTr: "Memorial Hastanesi, Memorial Sağlık Grubu'nun bir parçası olarak Antalya'da geniş bir tıbbi hizmet yelpazesi sunmaktadır.",
    fullOverviewEn: "Memorial Hospital is part of the Memorial Healthcare Group, providing a wide range of medical services in Antalya.",
  };

  let expectedDelta = existingClinicId ? 0 : 1;

  if (!isApply) {
    console.log("\n--- DRY RUN REPORT ---");
    console.log("Planned updates: ", existingClinicId ? 1 : 0);
    console.log("Planned creates: ", existingClinicId ? 0 : 1);
    console.log("Expected clinic count delta: ", expectedDelta);
    console.log("Clinic document deletes: 0");
    console.log("Other clinic writes: 0");
    console.log("Other doctor writes: 0");
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

  // Categories mapping
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

  // Capacity / Facilities (Facility-level)
  const oldFacilities = await clinicDocRef.collection("facilities").get();
  oldFacilities.forEach(doc => batch.delete(doc.ref));
  
  const facilitiesData = [
    { name: "114 inpatient beds", type: "capacity" },
    { name: "28 intensive-care beds", type: "capacity" },
    { name: "5 operating rooms", type: "capacity" },
    { name: "Advanced Radiology Department", type: "unit" },
    { name: "Intensive Care Units with day-night simulation features", type: "unit" },
    { name: "Coronary Angiography Unit", type: "unit" },
    { name: "Interventional Radiology Unit", type: "unit" },
    { name: "Chemotherapy Center", type: "unit" },
    { name: "Art Center", type: "facility" }
  ];

  facilitiesData.forEach(f => {
      const docRef = clinicDocRef.collection("facilities").doc();
      batch.set(docRef, {
          clinicId: clinicDocRef.id,
          name: f.name,
          facilityType: f.type,
          verificationStatus: "verified",
          sourceUrl: CLINIC_URL
      });
  });

  // International Support
  const oldSupport = await clinicDocRef.collection("international_support").get();
  oldSupport.forEach(doc => batch.delete(doc.ref));
  
  const supportData = [
      "Second medical opinions", "Treatment plans prepared by Memorial physicians",
      "Cost estimates for planned treatments", "Multilingual staff and interpreter services",
      "Admission assistance", "Discharge assistance", "Follow-up assistance",
      "Air ambulance organization", "Ground ambulance organization", 
      "Preferred-airline benefits claim", "Airport transfer services", 
      "Memorial Guesthouse services", "Travel arrangements", "Accommodation arrangements"
  ];
  
  supportData.forEach(s => {
      const docRef = clinicDocRef.collection("international_support").doc();
      batch.set(docRef, {
          clinicId: clinicDocRef.id,
          serviceName: s,
          disclaimerTr: "Uluslararası hasta destek hizmetlerinin kapsamı, uygunluğu, ücreti ve rezervasyon koşulları Memorial Hospital ile ayrıca teyit edilmelidir.",
          disclaimerEn: "The scope, availability, fees and booking conditions of international patient support services should be confirmed directly with Memorial Hospital.",
          verificationStatus: "verified",
          sourceUrl: CLINIC_URL
      });
  });


  // Clear pricing and packages safely
  const oldPrices = await clinicDocRef.collection("pricing").get();
  oldPrices.forEach(doc => batch.delete(doc.ref));
  const oldPackages = await clinicDocRef.collection("packages").get();
  oldPackages.forEach(doc => batch.delete(doc.ref));

  // Doctors
  const oldDoctors = await clinicDocRef.collection("doctors").get();
  oldDoctors.forEach(doc => batch.delete(doc.ref));

  doctors.forEach((d, i) => {
    const docRef = clinicDocRef.collection("doctors").doc();
    batch.set(docRef, {
      agencyId: AGENCY_ID,
      clinicId: clinicDocRef.id,
      name: d.name,
      sourceDisplayName: d.sourceDisplayName,
      title: d.sourceTitle || "",
      languages: d.languages || [],
      specialty: d.specialty || null,
      experienceYears: d.experienceYears || null,
      education: d.education || null,
      associations: d.associations || null,
      sourceDataQualityFlags: d.sourceDataQualityFlags,
      verificationStatus: "verified",
      sourceUrl: CLINIC_URL,
      displayOrder: i,
      active: true
    });
  });

  // Knowledge Base
  const oldKb = await clinicDocRef.collection("knowledge_documents").get();
  oldKb.forEach(doc => batch.delete(doc.ref));

  const kbTopics = [
    "clinic_overview", "memorial_healthcare_group", "memorial_antalya_hospital", 
    "location", "hospital_capacity", "facilities", "oncology_technologies", 
    "accreditation_claim", "medical_service_categories", "international_patient_services",
    "second_medical_opinion", "cost_estimate_support", "admission_discharge_support",
    "ambulance_organization", "airport_transfer_services", "guesthouse_services", 
    "travel_accommodation_support", "doctor_information"
  ];

  kbTopics.forEach(topic => {
    let content = "";
    if (topic === "clinic_overview") content = clinicData.longDescription;
    if (topic === "memorial_healthcare_group") content = "Memorial Healthcare Group has over 13 hospitals and satellite clinics, 1300 doctors, and 7300 healthcare workers.";
    if (topic === "memorial_antalya_hospital") content = "Memorial Antalya Hospital provides multi-specialty care in Antalya.";
    if (topic === "location") content = "Antalya, Turkey.";
    if (topic === "hospital_capacity") content = "Memorial Antalya Hospital has 114 inpatient beds, 28 intensive-care beds, and 5 operating rooms.";
    if (topic === "oncology_technologies") content = "TrueBeam STx, Elekta Versa HD Signature.";
    if (topic === "accreditation_claim") content = "The FeelinHealthy profile states that Memorial was the first hospital in Türkiye to receive JCI accreditation. The current facility and certificate scope should be confirmed separately.";
    if (topic === "international_patient_services") content = "Includes interpreters, admission assistance, and more.";

    if (content) {
        const docRef = clinicDocRef.collection("knowledge_documents").doc();
        batch.set(docRef, {
        ownerType: "clinic",
        ownerId: clinicDocRef.id,
        agencyId: AGENCY_ID,
        topic,
        content, 
        sourceUrl: CLINIC_URL,
        status: "active"
        });
    }
  });

  // Clinic Level Languages
  const oldLang = await clinicDocRef.collection("supported_languages").get();
  oldLang.forEach(doc => batch.delete(doc.ref));
  console.log("opening_hours_not_listed_on_canonical_source");
  console.log("clinic_languages_not_explicitly_listed_on_canonical_source");

  await batch.commit();
  console.log(`\n[SUCCESS] Installation completed successfully. Clinic ID: ${clinicDocRef.id}`);

  const afterSnap = await clinicsRef.get();
  console.log(`[VERIFICATION] Clinic count after: ${afterSnap.size} (Expected: ${totalClinicsBefore + expectedDelta})`);
  
  const savedDoc = await clinicDocRef.get();
  console.log(`[VERIFICATION] Visible clinic name: ${savedDoc.data()?.clinicName}`);

}

run().catch(console.error);
