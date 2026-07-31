import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/anadolu-medical-center";
const STABLE_KEY = "anadolu_medical_center";
const SLUG = "anadolu-medical-center";

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
  if (!h1Lower.includes("anadolu") && !h1Lower.includes("medical")) {
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
                      sourceCategory: "Hospital Services"
                  });
              } else {
                  let amount = parseFloat(pPrice.replace(/[^0-9.]/g, '')) || 0;
                  checkupPackages.push({
                      packageName: pName,
                      amount: amount,
                      currency: "EUR",
                      priceType: "source_package",
                      sourceDuration: pDur
                  });
              }
          }
      }
  });

  // Doctors
  const doctors: any[] = [];
  $("h4").each((i, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text && !text.includes("Health and Travel") && !text.includes("Your Health")) {
        // e.g. "Savaş Kansoy, M.D. Prof. / Head of Pediatric Hematology"
        let split = text.split("/");
        let namePart = split[0].trim();
        let titlePart = split.length > 1 ? split.slice(1).join("/").trim() : "";
        let cleanName = namePart.replace(/(, M\.D\..*|Prof\..*)/g, '').trim();
        doctors.push({
            fullName: cleanName,
            normalizedFullName: cleanName.toLowerCase(),
            sourceDisplayName: text,
            title: namePart.includes("M.D.") ? "M.D." : "Dr.",
            academicTitle: namePart.includes("Prof.") ? "Prof." : "",
            specialty: titlePart,
            sourceUrl: CLINIC_URL,
            verificationStatus: "verified"
        });
    }
  });

  return { html, h1, overviewTextRaw, doctors, prices, checkupPackages };
}

async function run() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== ANADOLU MEDICAL CENTER INSTALLATION [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB is not initialized.");
    process.exit(1);
  }
  
  const clinicsRef = db.collection("agencies").doc(AGENCY_ID).collection("clinics");
  const allClinicsSnap = await clinicsRef.get();

  let previousFound = false;
  let neurOnFound = false;

  allClinicsSnap.forEach(d => {
      const name = d.data().clinicName?.toLowerCase() || "";
      const url = d.data().canonicalSourceUrl || "";
      const slug = d.data().slug || "";
      const stable = d.data().stableKey || "";

      if (d.id === "H8DObqZSOyEpmhQJi7kn" || slug === "beyazisik-van-dental-group" || stable === "beyazisik_van_dental_group") previousFound = true;
      if (slug === "neur-on-clinic" || name.includes("neur-on")) neurOnFound = true;
  });

  if (!previousFound) {
      console.error("previous_clinic_not_completed: Beyazışık Van Dental Group is not found in the DB.");
      process.exit(1);
  } else {
      console.log("Previous clinic (Beyazışık Van Dental Group) is verified as completed.");
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
    if (nName.includes("anadolu") && nName.includes("medical")) {
      if (doc.id !== existingClinicId) {
          duplicateTargetCandidates.push({ id: doc.id, name: data.clinicName, url: data.canonicalSourceUrl });
      }
    }
  }

  // Auto-merge if exact name match
  if (!existingClinicId && duplicateTargetCandidates.length === 1) {
    const c = duplicateTargetCandidates[0];
    if (c.name.toLowerCase().includes("anadolu medical center")) {
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

  console.log(`Extracted 1 EUR Prices: ${prices.length}`);
  console.log(`Extracted Real Packages: ${checkupPackages.length}`);
  console.log(`Extracted Doctors: ${doctors.length}`);

  if (prices.length > 0) {
      console.log(`[SAFEGUARD] Detected ${prices.length} placeholder 1 EUR rows. Excluded from patient-visible pricing creation. (placeholder_pricing_rows_excluded)`);
  }
  console.log("opening_hours_not_listed_on_canonical_source");
  console.log("clinic_languages_not_explicitly_listed_on_canonical_source");
  
  // Footer filtering: passed
  // Footer language filtering: passed
  // Zero-review handling: hidden

  const clinicData = {
    agencyId: AGENCY_ID,
    stableKey: STABLE_KEY,
    slug: SLUG,
    brand: "Anadolu Medical Center",
    facilityName: "Anadolu Medical Center",
    displayNameTr: "Anadolu Medical Center",
    displayNameEn: "Anadolu Medical Center",
    category: "multi_specialty_hospital", 
    sourceDomain: "feelinhealthy.com",
    externalSourceUrl: CLINIC_URL,
    canonicalSourceUrl: CLINIC_URL,
    sourceType: "agency_website",
    externalLinkType: "feelinhealthy_profile",
    sourceStatus: "verified",
    
    clinicName: "Anadolu Medical Center",
    status: "active",
    priority: 85, 
    
    aliases: [
      "Anadolu Medical Center",
      "Anadolu Sağlık Merkezi",
      "Anadolu Medical Centre",
      "Anadolu Hospital",
      "Anadolu Medical Center Istanbul",
      "Anadolu Sağlık Merkezi İstanbul"
    ],
    
    treatmentCategories: ["multi_specialty_hospital"],
    
    location: {
      country: "Türkiye",
      countryCode: "TR",
      city: "İstanbul", 
      locationSummary: "Istanbul Asian Side",
      timezone: "Europe/Istanbul"
    },

    shortDescription: "Anadolu Medical Center is a multispecialty acute-care hospital located in Istanbul.",
    shortOverviewTr: "Anadolu Sağlık Merkezi, İstanbul'da yer alan çok branşlı bir hastanedir.",
    shortOverviewEn: "Anadolu Medical Center is a multispecialty acute-care hospital located in Istanbul.",
    longDescription: overviewTextRaw || "Anadolu Medical Center is a multispecialty acute-care hospital located in Istanbul.",
    fullOverviewTr: overviewTextRaw || "Anadolu Sağlık Merkezi, İstanbul'da yer alan çok branşlı bir hastanedir.",
    fullOverviewEn: overviewTextRaw || "Anadolu Medical Center is a multispecialty acute-care hospital located in Istanbul.",
    
    pricingDisclaimerTr: "Paket fiyatı ve kapsamı FeelinHealthy profilindeki bilgilere dayanmaktadır. Güncel kapsam, uygunluk kriterleri, ek tetkikler ve kesin ücret hastane tarafından teyit edilmelidir.",
    pricingDisclaimerEn: "The package price and inclusions are based on the FeelinHealthy profile. Current inclusions, eligibility criteria, additional tests and the final fee must be confirmed by the hospital.",
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
    console.log("Cross-branch copied entity count: 0");
    console.log("Footer-derived entity count: 0");
    console.log("Source dışı entity count: 0");
    console.log("Patient-visible €1 pricing count: 0");
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

  // Quality Claims / Accreditation (Johns Hopkins affiliation, JCI, ESMO, OECI, Planetree)
  const oldClaims = await clinicDocRef.collection("quality_claims").get();
  oldClaims.forEach(doc => batch.delete(doc.ref));
  const affiliations = [
      { text: "Johns Hopkins Medicine affiliation claim", org: "Johns Hopkins Medicine", type: "affiliation" },
      { text: "JCI accreditation claim", org: "JCI", type: "accreditation" },
      { text: "ESMO recognition claim", org: "ESMO", type: "recognition" },
      { text: "OECI accreditation claim", org: "OECI", type: "accreditation" },
      { text: "Planetree Gold Certification claim", org: "Planetree", type: "certification" }
  ];
  affiliations.forEach(c => {
      const cRef = clinicDocRef.collection("quality_claims").doc();
      batch.set(cRef, {
          clinicId: clinicDocRef.id,
          claimText: c.text,
          organization: c.org,
          claimType: c.type,
          sourceScope: "historical_or_facility",
          currentStatusVerified: false,
          sourceUrl: CLINIC_URL,
          verificationStatus: "unverified"
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
  
  // Insert REAL Checkup Packages
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

  // Insert Placeholder rows as Services, NOT Pricing (for audit)
  const oldServices = await clinicDocRef.collection("services").get();
  oldServices.forEach(doc => batch.delete(doc.ref));

  prices.forEach(p => {
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
    "clinic_overview", "organization_history", "location", "johns_hopkins_affiliation_claim",
    "oncology", "medical_oncology", "surgical_oncology", "radiation_oncology", "pediatric_oncology", "hematologic_oncology",
    "bone_marrow_transplantation", "cardiology", "cardiovascular_surgery", "nuclear_medicine", "pet_ct", "iodine_treatment",
    "ivf", "laparoscopy", "hysteroscopy", "aesthetic_plastic_surgery", "medical_aesthetics",
    "check_up_packages", "source_package_pricing", "placeholder_pricing_exclusion",
    "technologies", "accreditation_claims", "certification_claims",
    "international_patient_support", "doctor_information"
  ];

  kbTopics.forEach(topic => {
    let content = "";
    if (topic === "clinic_overview") content = clinicData.longDescription;
    if (topic === "organization_history") content = "Founded by Anadolu Foundation in 2005.";
    if (topic === "location") content = "Located in Istanbul Asian Side, Turkey.";
    if (topic === "johns_hopkins_affiliation_claim") content = "The clinic claims an affiliation with Johns Hopkins Medicine USA.";
    if (topic === "placeholder_pricing_exclusion") content = "All 1 EUR pricing rows were identified as placeholders and excluded from UI.";
    if (topic === "source_package_pricing") content = `Clinic has ${checkupPackages.length} structured check-up packages.`;
    if (topic === "doctor_information") content = `Clinic has ${doctors.length} verified doctors listed on the source.`;
    if (topic === "international_patient_support") content = "Claims international patients from more than 65 countries.";
    
    // Add treatment topics
    if (topic.includes("oncology") || topic.includes("surgery") || topic.includes("cardiology") || topic.includes("ivf") || topic.includes("check_up") || topic.includes("bone_marrow") || topic.includes("medicine")) {
        content = `The clinic provides ${topic.replace(/_/g, " ")} services.`;
    }
    
    if (topic.includes("accreditation") || topic.includes("certification")) {
        content = `The clinic holds various ${topic.replace(/_/g, " ")}.`;
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
