import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/neur-on-clinic";
const STABLE_KEY = "neur_on_clinic";
const SLUG = "neur-on-clinic";

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

  const h1Lower = h1.toLowerCase();
  if (!h1Lower.includes("neur-on") && !h1Lower.includes("neuron")) {
    throw new Error(`canonical_source_fetch_failed_or_identity_mismatch: Title does not match target. Got: ${h1}`);
  }

  console.log(`Source page title: ${h1}`);

  // Extracting overview
  const overviewHeader = $("h3:contains('Overview')");
  let overviewTextRaw = "";
  if (overviewHeader.length > 0) {
      let curr = overviewHeader.next();
      const overviewTexts: string[] = [];
      while (curr.length > 0 && curr.prop("tagName") !== "H3" && curr.prop("tagName") !== "H2") {
          const text = curr.text().trim();
          if (text) {
              overviewTexts.push(text.replace(/\s+/g, " "));
          }
          curr = curr.next();
      }
      overviewTextRaw = overviewTexts.join(" ");
  }

  const prices: any[] = [];
  const checkupPackages: any[] = [];
  
  $("table tr").each((i, el) => {
      const tds = $(el).find("td");
      if (tds.length >= 2) {
          const pName = $(tds[0]).text().replace(/\s+/g, " ").trim();
          let pPrice = $(tds[1]).text().replace(/\s+/g, " ").trim();
          const pDur = $(tds[2]).text().replace(/\s+/g, " ").trim();
          if (pName && pPrice && pPrice !== "Price") {
              if (pPrice === "1.00€") {
                  prices.push({
                      sourceTreatmentName: pName,
                      amount: 1.00,
                      currency: "EUR",
                      priceType: "placeholder",
                      sourceDuration: pDur,
                      sourceCategory: "Rehabilitation Services"
                  });
              } else {
                  let amount = parseFloat(pPrice.replace(/[^0-9.]/g, '')) || 0;
                  if (pName.toLowerCase().includes("package")) {
                      checkupPackages.push({
                          packageName: pName,
                          amount: amount,
                          currency: "EUR",
                          priceType: "source_package",
                          sourceDuration: pDur
                      });
                  } else {
                      prices.push({
                          sourceTreatmentName: pName,
                          amount: amount,
                          currency: "EUR",
                          priceType: "source_average",
                          sourceDuration: pDur,
                          sourceCategory: "Rehabilitation Services"
                      });
                  }
              }
          }
      }
  });

  // Doctors
  const doctors: any[] = [];
  $("h4").each((i, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text && (text.includes("Dr.") || text.includes("Prof.") || text.includes("Neurologist"))) {
        let split = text.split("/");
        let namePart = split[0].trim();
        let titlePart = split.length > 1 ? split.slice(1).join("/").trim() : "";
        let cleanName = namePart.replace(/(Dr\.|Prof\.)/g, '').trim();
        doctors.push({
            fullName: cleanName,
            normalizedFullName: cleanName.toLowerCase(),
            sourceDisplayName: text,
            title: namePart.includes("Prof.") ? "Prof. Dr." : "Dr.",
            academicTitle: namePart.includes("Prof.") ? "Prof." : "",
            specialty: titlePart || "Neurology / Rehabilitation",
            sourceUrl: CLINIC_URL,
            verificationStatus: "verified"
        });
    }
  });

  return { html, h1, overviewTextRaw, doctors, prices, checkupPackages };
}

async function run() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== NEUR-ON CLINIC INSTALLATION [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB is not initialized.");
    process.exit(1);
  }
  
  const clinicsRef = db.collection("agencies").doc(AGENCY_ID).collection("clinics");
  const allClinicsSnap = await clinicsRef.get();

  let previousFound = false;
  let kadikoyFound = false;
  let kadikoyId = null;

  allClinicsSnap.forEach(d => {
      const name = d.data().clinicName?.toLowerCase() || "";
      const url = d.data().canonicalSourceUrl || "";
      const slug = d.data().slug || "";
      const stable = d.data().stableKey || "";

      if (d.id === "CnjF1vlliz4vM7IRRWKr" || slug === "anadolu-medical-center" || stable === "anadolu_medical_center") previousFound = true;
      if (slug === "intermed-health-group-kadikoy" || stable === "intermed_health_group_kadikoy" || url.includes("intermed-health-group--kadikoy")) {
          kadikoyFound = true;
          kadikoyId = d.id;
      }
  });

  if (!previousFound) {
      console.error("previous_clinic_not_completed: Anadolu Medical Center is not found in the DB.");
      process.exit(1);
  } else {
      console.log("Previous clinic (Anadolu Medical Center) is verified as completed.");
  }

  const totalClinicsBefore = allClinicsSnap.size;
  console.log("FeelinHealthy agency clinic count before:", totalClinicsBefore);

  let existingClinicId = null;
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
      break;
    }
    
    // Check branch collisions carefully
    const nName = data.clinicName?.toLowerCase() || "";
    if (nName.includes("neur-on") || (nName.includes("neuron") && nName.includes("clinic"))) {
      if (doc.id !== existingClinicId) {
          duplicateTargetCandidates.push({ id: doc.id, name: data.clinicName, url: data.canonicalSourceUrl });
      }
    }
  }

  // Auto-merge if exact name match
  if (!existingClinicId && duplicateTargetCandidates.length === 1) {
    const c = duplicateTargetCandidates[0];
    if (c.name.toLowerCase().includes("neur-on clinic")) {
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

  const { h1, overviewTextRaw, doctors, prices, checkupPackages } = await fetchAndParseSource();

  console.log(`Extracted Prices: ${prices.length}`);
  console.log(`Extracted Packages: ${checkupPackages.length}`);
  console.log(`Extracted Doctors: ${doctors.length}`);

  let oneEurCount = prices.filter(p => p.priceType === "placeholder").length;
  if (oneEurCount > 0) {
      console.log(`[SAFEGUARD] Detected ${oneEurCount} placeholder 1 EUR rows. Excluded from patient-visible pricing creation. (placeholder_pricing_rows_excluded)`);
  }
  
  console.log("opening_hours_not_listed_on_canonical_source");
  console.log("clinic_languages_not_explicitly_listed_on_canonical_source");
  
  const clinicData = {
    agencyId: AGENCY_ID,
    stableKey: STABLE_KEY,
    slug: SLUG,
    brand: "Neur-on Clinic",
    facilityName: "Neur-on Clinic",
    displayNameTr: "Neur-on Clinic",
    displayNameEn: "Neur-on Clinic",
    category: "specialty_clinic", 
    sourceDomain: "feelinhealthy.com",
    externalSourceUrl: CLINIC_URL,
    canonicalSourceUrl: CLINIC_URL,
    sourceType: "agency_website",
    externalLinkType: "feelinhealthy_profile",
    sourceStatus: "verified",
    
    clinicName: "Neur-on Clinic",
    status: "active",
    priority: 86, 
    
    aliases: [
      "Neur-on Clinic",
      "Neur On Clinic",
      "NeurOn Clinic",
      "Neuron Clinic",
      "Neur-on",
      "Neur On"
    ],
    
    treatmentCategories: ["rehabilitation_center", "specialty_clinic"],
    
    location: {
      country: "Türkiye",
      countryCode: "TR",
      city: "İstanbul", 
      locationSummary: "Istanbul, Türkiye",
      timezone: "Europe/Istanbul"
    },

    shortDescription: "Neur-on Clinic is a neurorepair unit specializing in advanced neurorehabilitation.",
    shortOverviewTr: "Neur-on Clinic, gelişmiş nörorehabilitasyon alanında uzmanlaşmış bir kliniktir.",
    shortOverviewEn: "Neur-on Clinic is a neurorepair unit specializing in advanced neurorehabilitation.",
    longDescription: overviewTextRaw || "Neur-on Clinic is a neurorepair unit specializing in advanced neurorehabilitation.",
    fullOverviewTr: overviewTextRaw || "Neur-on Clinic, gelişmiş nörorehabilitasyon alanında uzmanlaşmış bir kliniktir.",
    fullOverviewEn: overviewTextRaw || "Neur-on Clinic is a neurorepair unit specializing in advanced neurorehabilitation.",
    
    pricingDisclaimerTr: "Listelenen tutarlar FeelinHealthy profilindeki bilgilere dayanmaktadır. Kesin ücret; uzman değerlendirmesi, tetkik sonuçları ve kişisel tedavi planı sonrasında klinik tarafından teyit edilir.",
    pricingDisclaimerEn: "The listed amounts are based on the FeelinHealthy profile. The final fee is confirmed by the clinic after specialist evaluation, diagnostic results and a personalized treatment plan.",
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
    console.log("Patient-visible €1 pricing count: 0");
    console.log("Run with --apply to execute.");
    
    if (kadikoyFound) {
        console.log(`[VERIFICATION] Position 31 Check: Intermed Health Group | Kadikoy is already installed (ID: ${kadikoyId}). Canonical duplicate confirmed.`);
    } else {
        console.log(`[WARNING] Position 31 Check: Intermed Health Group | Kadikoy not found.`);
    }
    
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

  // Clear facilities safely
  const oldFacilities = await clinicDocRef.collection("facilities").get();
  oldFacilities.forEach(doc => batch.delete(doc.ref));
  
  // Clear support safely
  const oldSupport = await clinicDocRef.collection("international_support").get();
  oldSupport.forEach(doc => batch.delete(doc.ref));
  
  // Clear prices safely
  const oldPrices = await clinicDocRef.collection("pricing").get();
  oldPrices.forEach(doc => batch.delete(doc.ref));
  
  // Insert Packages
  const oldPackages = await clinicDocRef.collection("packages").get();
  oldPackages.forEach(doc => batch.delete(doc.ref));

  checkupPackages.forEach(p => {
      const pRef = clinicDocRef.collection("packages").doc();
      batch.set(pRef, {
          clinicId: clinicDocRef.id,
          packageName: p.packageName,
          amount: p.amount,
          currency: p.currency,
          priceType: p.priceType,
          sourceDuration: p.sourceDuration,
          sourceUrl: CLINIC_URL,
          verificationStatus: "verified"
      });
  });

  // Insert Services / Real Pricing
  const oldServices = await clinicDocRef.collection("services").get();
  oldServices.forEach(doc => batch.delete(doc.ref));

  prices.forEach(p => {
      if (p.priceType === "placeholder") {
          const sRef = clinicDocRef.collection("services").doc();
          batch.set(sRef, {
              clinicId: clinicDocRef.id,
              serviceName: p.sourceTreatmentName,
              category: p.sourceCategory,
              sourceUrl: CLINIC_URL,
              verificationStatus: "verified",
              priceStatus: "placeholder_or_unverified",
              patientVisible: false,
              sourceAmount: 1,
              sourceCurrency: "EUR",
              sourceValuePreservedForAudit: true,
              excludedFromPricingUI: true,
              exclusionReason: "implausible_repeated_placeholder_price"
          });
      } else {
          // It's a real price
          const sRef = clinicDocRef.collection("pricing").doc();
          batch.set(sRef, {
              clinicId: clinicDocRef.id,
              sourceTreatmentName: p.sourceTreatmentName,
              sourceCategory: p.sourceCategory,
              amount: p.amount,
              currency: p.currency,
              priceType: p.priceType,
              sourceDuration: p.sourceDuration,
              sourceUrl: CLINIC_URL,
              verificationStatus: "verified"
          });
      }
  });

  // Clear Doctors
  const oldDoctors = await clinicDocRef.collection("doctors").get();
  oldDoctors.forEach(doc => batch.delete(doc.ref));

  doctors.forEach(d => {
      const dRef = clinicDocRef.collection("doctors").doc();
      batch.set(dRef, {
          clinicId: clinicDocRef.id,
          fullName: d.fullName,
          normalizedFullName: d.normalizedFullName,
          sourceDisplayName: d.sourceDisplayName,
          title: d.title,
          academicTitle: d.academicTitle,
          specialty: d.specialty,
          sourceUrl: CLINIC_URL,
          verificationStatus: "verified"
      });
  });

  // Knowledge Base
  const oldKb = await clinicDocRef.collection("knowledge_documents").get();
  oldKb.forEach(doc => batch.delete(doc.ref));

  const kbTopics = [
    "clinic_overview", "organization_type", "location_and_access",
    "medical_departments", "rehabilitation_services", "treatment_technologies",
    "treatment_pricing", "source_duration_information",
    "promotion_packages", "doctor_information"
  ];

  kbTopics.forEach(topic => {
    let content = "";
    if (topic === "clinic_overview") content = clinicData.longDescription;
    if (topic === "organization_type") content = "Specialty Clinic (Neurorehabilitation)";
    if (topic === "location_and_access") content = "Located in Istanbul, Turkey.";
    if (topic === "treatment_pricing") content = `Clinic has ${prices.filter(p=>p.priceType !== "placeholder").length} structured service prices.`;
    if (topic === "promotion_packages") content = `Clinic has ${checkupPackages.length} structured packages.`;
    if (topic === "doctor_information") content = `Clinic has ${doctors.length} verified doctors listed on the source.`;
    if (topic === "source_duration_information") content = "Duration details apply specifically to treatment cycles.";
    
    if (topic.includes("rehabilitation") || topic.includes("treatment")) {
        content = `The clinic provides ${topic.replace(/_/g, " ")} services.`;
    }
    
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

  // Clinic Level Languages (Empty as requested)
  const oldLang = await clinicDocRef.collection("supported_languages").get();
  oldLang.forEach(doc => batch.delete(doc.ref));

  await batch.commit();
  console.log(`\n[SUCCESS] Installation completed successfully. Clinic ID: ${clinicDocRef.id}`);

  const afterSnap = await clinicsRef.get();
  console.log(`[VERIFICATION] Clinic count after: ${afterSnap.size} (Expected: ${totalClinicsBefore + expectedDelta})`);
  
  const savedDoc = await clinicDocRef.get();
  console.log(`[VERIFICATION] Visible clinic name: ${savedDoc.data()?.clinicName}`);
  console.log(`[VERIFICATION] Location City: ${savedDoc.data()?.location?.city}`);

}

run().catch(console.error);
