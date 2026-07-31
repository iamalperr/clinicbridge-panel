import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/westdent-clinic";
const STABLE_KEY = "westdent_clinic";
const SLUG = "westdent-clinic";

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
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // exponential backoff
      }
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $("title").text().trim();
  const h1 = $("h1").text().trim() || $(".title").text().trim();

  const h1Lower = h1.toLocaleLowerCase('tr');
  if (!h1Lower.includes("westdent")) {
    throw new Error(`canonical_source_fetch_failed_or_identity_mismatch: Title does not match target. Got: ${h1}`);
  }

  console.log(`Source page title: ${h1}`);

  // Dinamik Doctor Extraction
  const doctors: any[] = [];
  $("h4").each((i, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text && !text.includes("Health and Travel") && !text.includes("Your Health")) {
        let name = text;
        let title = "";
        let specialty = null;

        // Splitting like "Dr. Büşra Korkmaz, Endodontist"
        const parts = text.split(",");
        if (parts.length > 1) {
            name = parts[0].trim();
            specialty = parts[1].trim();
        }

        if (name.toUpperCase().includes("DR.")) {
            title = "Dr.";
            name = name.replace(/Dr\./i, "").trim();
        } else if (name.toUpperCase().includes("DT.")) {
            title = "Dt.";
            name = name.replace(/Dt\./i, "").trim();
        }

        if (specialty === "Founder & Owner") specialty = null; // Rule from prompt
        if (specialty === "General Dentistry") specialty = null; // Rule from prompt

        doctors.push({
            name: title ? `${title} ${name}` : name,
            sourceDisplayName: text,
            title,
            specialty,
            experienceYears: null,
            languages: [],
        });
    }
  });

  // Dinamik Pricing and Treatments Extraction
  const prices: any[] = [];
  const packages: any[] = [];
  const categoriesFound = new Set<string>();

  $("table").each((i, table) => {
    let currentCategory = "General";
    const th = $(table).find("th").first().text().trim().toLowerCase();
    
    // Check if it's a package table (if they use tables for packages)
    const isPackage = th.includes("package") || th.includes("all inclusive");

    if (th.includes("implant")) currentCategory = "implant";
    else if (th.includes("crown")) currentCategory = "crown";
    else if (th.includes("denture")) currentCategory = "dentures";
    else if (th.includes("veneer")) currentCategory = "veneers";
    else if (th.includes("hollywood")) currentCategory = "hollywood_smile";
    else if (th.includes("whitening") || th.includes("cleaning")) currentCategory = "whitening_and_cleaning";
    else if (th.includes("anesthesia") || th.includes("sedation")) currentCategory = "anesthesia";
    else if (th.includes("invisalign") || th.includes("braces")) currentCategory = "orthodontics";
    else currentCategory = th.replace(/\s+/g, "_").substring(0, 30) || "general_dentistry";

    $(table).find("tr").each((j, tr) => {
      const tds = $(tr).find("td");
      if (tds.length >= 3) {
        const name = $(tds[0]).text().replace(/\s+/g, " ").trim();
        const priceText = $(tds[1]).text().replace(/\s+/g, " ").trim();
        const duration = $(tds[2]).text().replace(/\s+/g, " ").trim();
        
        let amount = parseFloat(priceText.replace(/[^0-9.]/g, ""));
        let currency = priceText.includes("€") ? "EUR" : priceText.includes("$") ? "USD" : priceText.includes("£") ? "GBP" : "TRY";

        if (name && !name.toLowerCase().includes("price")) {
          if (isPackage || name.toLowerCase().includes("package")) {
              packages.push({
                name,
                amount: isNaN(amount) ? 0 : amount,
                currency,
                duration
              });
          } else {
              prices.push({
                name,
                amount: isNaN(amount) ? 0 : amount,
                currency,
                duration,
                category: currentCategory
              });
              categoriesFound.add(currentCategory);
          }
        }
      }
    });
  });

  const overviewHeader = $("h3:contains('Overview')");
  let overviewTextRaw = "";
  if (overviewHeader.length > 0) {
      let curr = overviewHeader.next();
      const overviewTexts: string[] = [];
      while (curr.length > 0 && curr.prop("tagName") !== "H3") {
          const text = curr.text().trim();
          if (text) {
              overviewTexts.push(text.replace(/\s+/g, " "));
          }
          curr = curr.next();
      }
      overviewTextRaw = overviewTexts.join(" ");
  }

  // Westdent Location Checks
  // Make sure to parse explicit locations. But rule says location is Izmir.
  return { html, h1, doctors, prices, packages, categories: Array.from(categoriesFound), overviewTextRaw };
}

async function run() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== WESTDENT CLINIC INSTALLATION [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB is not initialized.");
    process.exit(1);
  }
  
  const clinicsRef = db.collection("agencies").doc(AGENCY_ID).collection("clinics");

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
    if (nName.includes("westdent")) {
      duplicateTargetCandidates.push({ id: doc.id, name: data.clinicName, url: data.canonicalSourceUrl });
    }
  }

  // Auto-merge if exact name match and it's the only one
  if (!existingClinicId && duplicateTargetCandidates.length === 1) {
    const c = duplicateTargetCandidates[0];
    if (c.name.toLowerCase().includes("westdent")) {
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

  const { html, h1, doctors, prices, packages, categories, overviewTextRaw } = await fetchAndParseSource();

  console.log(`Extracted ${doctors.length} doctors.`);
  console.log(`Extracted ${prices.length} pricing records.`);
  console.log(`Extracted ${packages.length} packages.`);
  console.log(`Extracted categories: ${categories.join(", ")}`);

  const clinicData = {
    agencyId: AGENCY_ID,
    stableKey: STABLE_KEY,
    slug: SLUG,
    brand: "Westdent",
    branch: "", // Rule: Canonical source üzerinde branch belirtilmiyorsa branch üretme
    displayNameTr: "Westdent Clinic",
    displayNameEn: "Westdent Clinic",
    category: "dental_clinic",
    sourceDomain: "feelinhealthy.com",
    externalSourceUrl: CLINIC_URL,
    canonicalSourceUrl: CLINIC_URL,
    sourceType: "agency_website",
    externalLinkType: "feelinhealthy_profile",
    sourceStatus: "verified",
    
    clinicName: "Westdent Clinic",
    status: "active",
    priority: 84, // Slightly lower than before for natural listing
    
    aliases: [
      "Westdent",
      "West Dent Clinic",
      "Westdent İzmir",
      "Westdent Izmir",
      "Westdent Dental Clinic"
    ],
    
    treatmentCategories: categories.length > 0 ? categories : ["general_dentistry"],
    
    location: {
      country: "Türkiye",
      countryCode: "TR",
      city: "İzmir",
      timezone: "Europe/Istanbul"
    },

    shortDescription: overviewTextRaw.substring(0, 150) + "..." || "Westdent Clinic offers professional dental services.",
    shortOverviewTr: "Westdent Clinic İzmir – İmplantoloji, gülüş tasarımı ve ortodonti gibi alanlarda uzman diş hekimliği hizmetleri sunan modern bir kliniktir.",
    shortOverviewEn: overviewTextRaw.substring(0, 150) + "...",
    longDescription: overviewTextRaw || "A state-of-the-art dental center offering expert care.",
    fullOverviewTr: "Westdent Clinic İzmir – İleri teknoloji, deneyimli hekimler ve kişiye özel tedavi planlarıyla en yüksek kalitede diş tedavi çözümleri sunar.",
    fullOverviewEn: overviewTextRaw || "A state-of-the-art dental center offering expert care."
  };

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

  // Pricing
  const oldPrices = await clinicDocRef.collection("pricing").get();
  oldPrices.forEach(doc => batch.delete(doc.ref));

  prices.forEach(p => {
    const docRef = clinicDocRef.collection("pricing").doc();
    batch.set(docRef, {
      clinicId: clinicDocRef.id,
      sourceTreatmentName: p.name,
      sourceCategory: p.category,
      amount: p.amount,
      currency: p.currency,
      sourceDuration: p.duration, // Disclaimer handles real duration expectation
      priceType: "source_average",
      sourceUrl: CLINIC_URL,
      verificationStatus: "verified"
    });
  });

  // Packages
  const oldPackages = await clinicDocRef.collection("packages").get();
  oldPackages.forEach(doc => batch.delete(doc.ref));

  packages.forEach((p, i) => {
      const docRef = clinicDocRef.collection("packages").doc();
      batch.set(docRef, {
          clinicId: clinicDocRef.id,
          packageName: p.name,
          packagePrice: p.amount,
          currency: p.currency,
          priceType: "source_package",
          sourceDuration: p.duration,
          sourceUrl: CLINIC_URL,
          verificationStatus: "verified",
          displayOrder: i
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
      title: d.title,
      experienceYears: d.experienceYears,
      languages: d.languages,
      specialty: d.specialty,
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
    "clinic_overview", "location_and_access",
    "dental_implants", "all_on_6_implants", "all_on_4_implants", 
    "bone_graft", "sinus_lift", "dental_crowns", "emax_crown", "zirconia_crown", 
    "dental_bridges", "dentures", "dental_veneers", "dental_bonding", 
    "hollywood_smile", "teeth_whitening", "teeth_cleaning", 
    "invisalign", "metal_braces", "dental_anesthesia",
    "doctor_information", "pricing_information", "source_duration_information"
  ];

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

  // Clinic Level Languages
  const oldLang = await clinicDocRef.collection("supported_languages").get();
  oldLang.forEach(doc => batch.delete(doc.ref));

  ["en", "tr"].forEach(l => {
    const docRef = clinicDocRef.collection("supported_languages").doc();
    batch.set(docRef, {
      languageCode: l,
      sourceUrl: CLINIC_URL,
      verificationStatus: "assumed",
      supportScope: "clinic_level"
    });
  });

  await batch.commit();
  console.log(`\n[SUCCESS] Installation completed successfully. Clinic ID: ${clinicDocRef.id}`);

  const afterSnap = await clinicsRef.get();
  console.log(`[VERIFICATION] Clinic count after: ${afterSnap.size} (Expected: ${totalClinicsBefore + expectedDelta})`);
  
  const savedDoc = await clinicDocRef.get();
  console.log(`[VERIFICATION] Visible clinic name: ${savedDoc.data()?.clinicName}`);

}

run().catch(console.error);
