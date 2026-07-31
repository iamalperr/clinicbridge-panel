import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/beyazisik-marmaris-dental-group";
const STABLE_KEY = "beyazisik_marmaris_dental_group";
const SLUG = "beyazisik-marmaris-dental-group";

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
  if (!h1Lower.includes("beyazışık") && !h1Lower.includes("beyazisik") && !h1Lower.includes("marmaris")) {
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
        // Clean up title
        if (name.toUpperCase().includes("DT.")) {
            name = name.replace(/DT\./i, "").trim();
        }
        
        doctors.push({
            name,
            sourceDisplayName: text,
            sourceTitle: title,
            specialty,
            languages: ["English", "Turkish"],
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
  console.log(`=== BEYAZIŞIK MARMARİS INSTALLATION [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB is not initialized.");
    process.exit(1);
  }
  
  const clinicsRef = db.collection("agencies").doc(AGENCY_ID).collection("clinics");
  const allClinicsSnap = await clinicsRef.get();

  let bodrumFound = false;
  let kocaeliFound = false;
  let ankaraFound = false;

  allClinicsSnap.forEach(d => {
      const name = d.data().clinicName?.toLowerCase() || "";
      const url = d.data().canonicalSourceUrl || "";
      const slug = d.data().slug || "";
      const stable = d.data().stableKey || "";

      if (d.id === "9He2D8p3zhyPIa6Iqkbl" || slug === "hospitadent-dental-group-bodrum" || stable === "hospitadent_dental_group_bodrum") bodrumFound = true;
      if (url.includes("beyazisik-kocaeli") || name.includes("beyazışık kocaeli") || slug === "beyazisik-kocaeli-dental-group") kocaeliFound = true;
      if (url.includes("hospitadent-dental-group-ankara") || name.includes("ankara") || slug === "hospitadent-dental-group-ankara") ankaraFound = true;
  });

  if (!bodrumFound) {
      console.error("previous_clinic_not_completed: Hospitadent Dental Group Bodrum is not found in the DB.");
      process.exit(1);
  } else {
      console.log("Previous clinic (Hospitadent Bodrum) is verified as completed.");
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
    if (nName.includes("beyazışık") && (data.location?.city === "Marmaris" || nName.includes("marmaris"))) {
      duplicateTargetCandidates.push({ id: doc.id, name: data.clinicName, url: data.canonicalSourceUrl });
    }
  }

  // Auto-merge if exact name match and it's the only one
  if (!existingClinicId && duplicateTargetCandidates.length === 1) {
    const c = duplicateTargetCandidates[0];
    if (c.name.toLowerCase().includes("beyazışık marmaris")) {
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
    brand: "Beyazışık Dental Group",
    branch: "Marmaris", 
    displayNameTr: "Beyazışık Marmaris Dental Group",
    displayNameEn: "Beyazışık Marmaris Dental Group",
    category: "dental_clinic", 
    sourceDomain: "feelinhealthy.com",
    externalSourceUrl: CLINIC_URL,
    canonicalSourceUrl: CLINIC_URL,
    sourceType: "agency_website",
    externalLinkType: "feelinhealthy_profile",
    sourceStatus: "verified",
    
    clinicName: "Beyazışık Marmaris Dental Group",
    status: "active",
    priority: 79, 
    
    aliases: [
      "Beyazışık Marmaris",
      "Beyazisik Marmaris",
      "Beyazışık Marmaris Dental Group",
      "Beyazisik Marmaris Dental Group",
      "Beyazışık Marmaris Diş Kliniği",
      "Beyazisik Marmaris Dis Klinigi",
      "Beyazışık Muğla",
      "Beyazisik Mugla",
      "Beyazışık Dental Group Marmaris"
    ],
    
    treatmentCategories: ["dental"],
    
    location: {
      country: "Türkiye",
      countryCode: "TR",
      province: "Muğla",
      city: "Marmaris", 
      district: "Marmaris",
      timezone: "Europe/Istanbul"
    },

    shortDescription: "Beyazışık Dental Group provides dental care services at its Marmaris branch.",
    shortOverviewTr: "Beyazışık Marmaris Dental Group şubesinde kapsamlı ağız ve diş sağlığı hizmetleri sunmaktadır.",
    shortOverviewEn: "Beyazışık Dental Group provides comprehensive oral and dental health services at its Marmaris branch.",
    longDescription: overviewTextRaw || "Beyazışık Dental Group provides comprehensive oral and dental health services at its Marmaris branch.",
    fullOverviewTr: overviewTextRaw || "Beyazışık Marmaris Dental Group şubesinde kapsamlı ağız ve diş sağlığı hizmetleri sunmaktadır.",
    fullOverviewEn: overviewTextRaw || "Beyazışık Dental Group provides comprehensive oral and dental health services at its Marmaris branch.",
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
    if (topic === "brand_and_branch") content = "Beyazışık Dental Group, Marmaris Branch.";
    if (topic === "location_and_access") content = "Located in Marmaris, Muğla, Turkey.";
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

  // Position 23 & 24 Read-Only Verification
  if (!kocaeliFound) {
      console.log(`[VERIFICATION-WARN] next_canonical_existing_status_mismatch: Beyazışık Kocaeli Dental Group not found.`);
  } else {
      console.log(`[VERIFICATION] Beyazışık Kocaeli Dental Group is present in DB.`);
  }

  if (!ankaraFound) {
      console.log(`[VERIFICATION-WARN] next_canonical_existing_status_mismatch: Hospitadent Dental Group Ankara not found.`);
  } else {
      console.log(`[VERIFICATION] Hospitadent Dental Group Ankara is present in DB.`);
  }

}

run().catch(console.error);
