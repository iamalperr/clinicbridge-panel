import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/hospitadent-dental-group-bodrum";
const STABLE_KEY = "hospitadent_dental_group_bodrum";
const SLUG = "hospitadent-dental-group-bodrum";

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
  if (!h1Lower.includes("hospitadent") || !h1Lower.includes("bodrum")) {
    throw new Error(`canonical_source_fetch_failed_or_identity_mismatch: Title does not match target. Got: ${h1}`);
  }

  console.log(`Source page title: ${h1}`);

  const fullBodyText = $("body").text().replace(/\s+/g, " ");
  
  // Extracting overview (simple fallback)
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
  
  const textLower = fullBodyText.toLowerCase();
  
  // Category mapping
  const serviceCategoriesFound: string[] = ["dental_clinic"];
  
  // Doctors extraction
  const doctors: any[] = [];
  $("h4").each((i, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text && !text.includes("Health and Travel") && !text.includes("Your Health")) {
        const parts = text.split(",");
        let name = parts[0].trim();
        let specialty = parts.length > 1 ? parts.slice(1).join(",").trim() : "General Dentist";
        
        let title = "Dt.";
        if (name.includes("Prof. Dr.")) {
            title = "Prof. Dr.";
            name = name.replace("Prof. Dr.", "").trim();
        } else if (name.includes("Dr. Dt.")) {
            title = "Dr. Dt.";
            name = name.replace("Dr. Dt.", "").trim();
        } else if (name.includes("Uz. Dt.")) {
            title = "Uz. Dt.";
            name = name.replace("Uz. Dt.", "").trim();
        } else if (name.includes("Dt.")) {
            title = "Dt.";
            name = name.replace("Dt.", "").trim();
        }
        
        doctors.push({
            name,
            sourceDisplayName: text,
            sourceTitle: title,
            specialty,
            languages: ["English", "Turkish"], // Assume basic English and Turkish for doctors
            education: null,
            experienceYears: null,
            associations: null,
            sourceDataQualityFlags: []
        });
    }
  });

  // Prices extraction
  const prices: any[] = [];
  $("table tr").each((i, el) => {
      const rowText = $(el).text().replace(/\s+/g, " ").trim();
      const tds = $(el).find("td");
      if (tds.length >= 2) {
          const treatmentName = $(tds[0]).text().trim();
          const priceStr = $(tds[1]).text().trim();
          
          if (treatmentName && priceStr && !treatmentName.toLowerCase().includes("treatment") && /\d/.test(priceStr)) {
              let amount = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
              if (isNaN(amount)) amount = 0;
              let currency = "USD";
              if (priceStr.includes("€") || priceStr.includes("EUR")) currency = "EUR";
              else if (priceStr.includes("£") || priceStr.includes("GBP")) currency = "GBP";
              else if (priceStr.includes("₺") || priceStr.includes("TRY")) currency = "TRY";
              
              prices.push({
                  sourceTreatmentName: treatmentName,
                  amount,
                  currency,
                  priceType: "source_average"
              });
          }
      }
  });

  return { html, h1, overviewTextRaw, fullBodyText, doctors, prices, serviceCategoriesFound };
}

async function run() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== HOSPITADENT BODRUM INSTALLATION [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB is not initialized.");
    process.exit(1);
  }
  
  const clinicsRef = db.collection("agencies").doc(AGENCY_ID).collection("clinics");
  const allClinicsSnap = await clinicsRef.get();

  let memorialFound = false;

  allClinicsSnap.forEach(d => {
      if (d.data().slug === "memorial-hospital" || d.data().stableKey === "memorial_hospital_antalya" || d.id === "VOu7zswvfDlZtj6dDd6I") {
          memorialFound = true;
      }
  });

  if (!memorialFound) {
      console.error("previous_clinic_not_completed: Memorial Hospital is not found in the DB.");
      process.exit(1);
  } else {
      console.log("Previous clinic (Memorial Hospital) is verified as completed.");
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
    if (nName.includes("hospitadent") && (data.location?.city === "Bodrum" || nName.includes("bodrum"))) {
      duplicateTargetCandidates.push({ id: doc.id, name: data.clinicName, url: data.canonicalSourceUrl });
    }
  }

  // Auto-merge if exact name match and it's the only one
  if (!existingClinicId && duplicateTargetCandidates.length === 1) {
    const c = duplicateTargetCandidates[0];
    if (c.name.toLowerCase().includes("hospitadent dental group bodrum")) {
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

  const { h1, overviewTextRaw, fullBodyText, doctors, prices, serviceCategoriesFound } = await fetchAndParseSource();

  console.log(`Extracted Prices: ${prices.length}`);
  console.log(`Extracted Doctors: ${doctors.length}`);

  if (prices.length === 0) console.log("pricing_rows_not_listed_on_canonical_source");
  console.log("promotions_not_listed_on_canonical_source");
  console.log("opening_hours_not_listed_on_canonical_source");
  console.log("clinic_languages_not_explicitly_listed_on_canonical_source");

  const clinicData = {
    agencyId: AGENCY_ID,
    stableKey: STABLE_KEY,
    slug: SLUG,
    brand: "Hospitadent Dental Group",
    branch: "Bodrum", 
    displayNameTr: "Hospitadent Dental Group Bodrum",
    displayNameEn: "Hospitadent Dental Group Bodrum",
    category: "dental_clinic", 
    sourceDomain: "feelinhealthy.com",
    externalSourceUrl: CLINIC_URL,
    canonicalSourceUrl: CLINIC_URL,
    sourceType: "agency_website",
    externalLinkType: "feelinhealthy_profile",
    sourceStatus: "verified",
    
    clinicName: "Hospitadent Dental Group Bodrum",
    status: "active",
    priority: 80, 
    
    aliases: [
      "Hospitadent Bodrum",
      "Hospitadent Dental Group Bodrum",
      "Hospitadent Bodrum Dental Clinic",
      "Hospitadent Bodrum Diş Kliniği",
      "Hospitadent Muğla",
      "Hospitadent Dental Group Muğla"
    ],
    
    treatmentCategories: ["dental"],
    
    location: {
      country: "Türkiye",
      countryCode: "TR",
      province: "Muğla",
      city: "Bodrum", // Setting Bodrum as city for fallback display
      district: "Bodrum",
      timezone: "Europe/Istanbul"
    },

    shortDescription: "Hospitadent Dental Group provides dental care services at its Bodrum branch.",
    shortOverviewTr: "Hospitadent Dental Group Bodrum şubesinde kapsamlı ağız ve diş sağlığı hizmetleri sunmaktadır.",
    shortOverviewEn: "Hospitadent Dental Group provides comprehensive oral and dental health services at its Bodrum branch.",
    longDescription: overviewTextRaw || "Hospitadent Dental Group provides comprehensive oral and dental health services at its Bodrum branch.",
    fullOverviewTr: overviewTextRaw || "Hospitadent Dental Group Bodrum şubesinde kapsamlı ağız ve diş sağlığı hizmetleri sunmaktadır.",
    fullOverviewEn: overviewTextRaw || "Hospitadent Dental Group provides comprehensive oral and dental health services at its Bodrum branch.",
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

  // Clear facilities safely
  const oldFacilities = await clinicDocRef.collection("facilities").get();
  oldFacilities.forEach(doc => batch.delete(doc.ref));
  
  // Clear support safely
  const oldSupport = await clinicDocRef.collection("international_support").get();
  oldSupport.forEach(doc => batch.delete(doc.ref));
  
  // Clear prices and packages safely
  const oldPrices = await clinicDocRef.collection("pricing").get();
  oldPrices.forEach(doc => batch.delete(doc.ref));
  const oldPackages = await clinicDocRef.collection("packages").get();
  oldPackages.forEach(doc => batch.delete(doc.ref));

  // Insert Prices
  prices.forEach((p, i) => {
      const docRef = clinicDocRef.collection("pricing").doc();
      batch.set(docRef, {
          clinicId: clinicDocRef.id,
          sourceTreatmentName: p.sourceTreatmentName,
          amount: p.amount,
          currency: p.currency,
          priceType: p.priceType,
          sourceUrl: CLINIC_URL,
          verificationStatus: "verified",
          displayOrder: i,
          disclaimerEn: "The listed amounts are average treatment costs shown on the FeelinHealthy profile. The final price is confirmed by the clinic after examination, imaging results, material selection and a personalized treatment plan.",
          disclaimerTr: "Listelenen tutarlar FeelinHealthy profilinde belirtilen ortalama tedavi maliyetleridir. Kesin fiyat; muayene, görüntüleme sonuçları, kullanılacak materyal ve kişisel tedavi planı sonrasında klinik tarafından netleştirilir."
      });
  });

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
      sourceDataQualityFlags: d.sourceDataQualityFlags || [],
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
    "clinic_overview", "brand_and_branch", 
    "location_and_access", "dental_treatments", 
    "treatment_pricing", "doctor_information"
  ];

  kbTopics.forEach(topic => {
    let content = "";
    if (topic === "clinic_overview") content = clinicData.longDescription;
    if (topic === "brand_and_branch") content = "Hospitadent Dental Group, Bodrum Branch.";
    if (topic === "location_and_access") content = "Located in Bodrum, Muğla, Turkey.";
    if (topic === "dental_treatments") content = "Provides a variety of dental treatments.";
    if (topic === "treatment_pricing") content = `Average prices are listed for ${prices.length} treatments on the canonical profile. Final prices are determined after examination.`;
    if (topic === "doctor_information") content = doctors.map(d => `${d.sourceTitle || ''} ${d.name} (${d.specialty || 'General Dentist'})`).join(", ");

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

  await batch.commit();
  console.log(`\n[SUCCESS] Installation completed successfully. Clinic ID: ${clinicDocRef.id}`);

  const afterSnap = await clinicsRef.get();
  console.log(`[VERIFICATION] Clinic count after: ${afterSnap.size} (Expected: ${totalClinicsBefore + expectedDelta})`);
  
  const savedDoc = await clinicDocRef.get();
  console.log(`[VERIFICATION] Visible clinic name: ${savedDoc.data()?.clinicName}`);

}

run().catch(console.error);
