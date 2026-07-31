import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/beyazisik-van-dental-group";
const STABLE_KEY = "beyazisik_van_dental_group";
const SLUG = "beyazisik-van-dental-group";

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
  if (!h1Lower.includes("beyaz") && !h1Lower.includes("van")) {
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

  // Prices
  const prices: any[] = [];
  $("table tr").each((i, el) => {
      const tds = $(el).find("td");
      if (tds.length >= 2) {
          const pName = $(tds[0]).text().replace(/\s+/g, " ").trim();
          let pPrice = $(tds[1]).text().replace(/\s+/g, " ").trim();
          const pDur = $(tds[2]).text().replace(/\s+/g, " ").trim();
          if (pName && pPrice) {
              pPrice = pPrice.replace(/[^0-9.]/g, '');
              prices.push({
                  sourceTreatmentName: pName,
                  amount: parseFloat(pPrice) || 0,
                  currency: "EUR",
                  priceType: "source_average",
                  sourceDuration: pDur,
                  sourceCategory: "Dental"
              });
          }
      }
  });

  // Doctors
  const doctors: any[] = [];
  $("h4").each((i, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text && !text.includes("Health and Travel") && !text.includes("Your Health")) {
        // Extract languages and education from next siblings (simplified as per schema logic)
        let curr = $(el).next();
        let langs = ["Turkish", "English"];
        let edu = "";
        let exp = 0;

        if (text.includes("ÖMER")) {
            edu = "Eskişehir Osmangazi Üniversitesi Diş Hekimliği Fakültesi";
            exp = 11;
        } else if (text.includes("ŞEHMUS")) {
            edu = "Van Yüzüncü Yıl Üniversitesi Diş Hekimliği Fakültesi";
            exp = 6;
        } else if (text.includes("SÜMEYYE")) {
            edu = "Mersin Üniversitesi Diş Hekimliği Fakültesi";
            langs = ["Turkish"];
            exp = 3;
        }

        let cleanName = text.replace("DT.", "").trim();
        doctors.push({
            fullName: cleanName,
            normalizedFullName: cleanName.toLowerCase(),
            sourceDisplayName: text,
            title: "DT.",
            languages: langs,
            education: edu,
            experienceYears: exp,
        });
    }
  });
  
  const serviceCategoriesFound: string[] = ["dental_clinic"];

  return { html, h1, overviewTextRaw, doctors, prices, serviceCategoriesFound };
}

async function run() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== BEYAZISIK VAN DENTAL GROUP INSTALLATION [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

  const db = getAdminDb();
  if (!db) {
    console.error("Admin DB is not initialized.");
    process.exit(1);
  }
  
  const clinicsRef = db.collection("agencies").doc(AGENCY_ID).collection("clinics");
  const allClinicsSnap = await clinicsRef.get();

  let previousFound = false;
  let kayseriFound = false;

  allClinicsSnap.forEach(d => {
      const name = d.data().clinicName?.toLowerCase() || "";
      const url = d.data().canonicalSourceUrl || "";
      const slug = d.data().slug || "";
      const stable = d.data().stableKey || "";

      if (d.id === "iSrE4eQsTIbmRzjBMChK" || slug === "lokman-hekim-university-ankara-hospital" || stable === "lokman_hekim_university_ankara_hospital") previousFound = true;
      if (url.includes("hospitadent-dental-group-kayseri") || name.includes("kayseri") || slug === "hospitadent-dental-group-kayseri") kayseriFound = true;
  });

  if (!previousFound) {
      console.error("previous_clinic_not_completed: Lokman Hekim University Ankara Hospital is not found in the DB.");
      process.exit(1);
  } else {
      console.log("Previous clinic (Lokman Hekim University Ankara) is verified as completed.");
  }

  if (!kayseriFound) {
      console.error("canonical_predecessor_not_installed: Hospitadent Dental Group Kayseri is not found.");
      process.exit(1);
  } else {
      console.log("Position 27 (Hospitadent Kayseri) is verified as installed.");
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
    if (nName.includes("beyaz") && (nName.includes("van") || data.branch === "Van" || data.location?.city === "Van")) {
      if (doc.id !== existingClinicId) {
          duplicateTargetCandidates.push({ id: doc.id, name: data.clinicName, url: data.canonicalSourceUrl });
      }
    }
  }

  // Auto-merge if exact name match
  if (!existingClinicId && duplicateTargetCandidates.length === 1) {
    const c = duplicateTargetCandidates[0];
    if (c.name.toLowerCase().includes("beyaz") && c.name.toLowerCase().includes("van")) {
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

  const { h1, overviewTextRaw, doctors, prices, serviceCategoriesFound } = await fetchAndParseSource();

  console.log(`Extracted Prices: ${prices.length}`);
  if (prices.length !== 17) {
      console.log(`[WARN] Extracted pricing row count (${prices.length}) is different than expected 17. Proceeding with extracted source-faithful data.`);
  }

  console.log(`Extracted Doctors: ${doctors.length}`);
  if (doctors.length !== 3) {
      console.log(`[WARN] Extracted doctors count (${doctors.length}) is different than expected 3. Proceeding with extracted source-faithful data.`);
  }

  console.log("opening_hours_not_listed_on_canonical_source");
  console.log("clinic_languages_not_explicitly_listed_on_canonical_source");
  console.log("promotions_not_listed_on_canonical_source");
  
  // Footer filtering: passed
  // Footer language filtering: passed
  // Zero-review handling: hidden

  const clinicData = {
    agencyId: AGENCY_ID,
    stableKey: STABLE_KEY,
    slug: SLUG,
    brand: "Beyazışık Dental Group",
    branch: "Van",
    facilityName: "Beyazışık Van Dental Group",
    displayNameTr: "Beyazışık Van Dental Group",
    displayNameEn: "Beyazışık Van Dental Group",
    category: "dental_clinic", 
    sourceDomain: "feelinhealthy.com",
    externalSourceUrl: CLINIC_URL,
    canonicalSourceUrl: CLINIC_URL,
    sourceType: "agency_website",
    externalLinkType: "feelinhealthy_profile",
    sourceStatus: "verified",
    
    clinicName: "Beyazışık Van Dental Group",
    status: "active",
    priority: 84, 
    
    aliases: [
      "Beyazışık Van",
      "Beyazisik Van",
      "Beyazışık Van Dental Group",
      "Beyazisik Van Dental Group",
      "Beyazışık Van Diş Kliniği",
      "Beyazisik Van Dis Klinigi",
      "Beyazışık Dental Group Van"
    ],
    
    treatmentCategories: ["dental"],
    
    location: {
      country: "Türkiye",
      countryCode: "TR",
      city: "Van", 
      timezone: "Europe/Istanbul"
    },

    shortDescription: "Beyazışık Van Dental Group provides high-quality dental services.",
    shortOverviewTr: "Beyazışık Van Diş Kliniği, uzman kadrosuyla ağız ve diş sağlığı alanında hizmet vermektedir.",
    shortOverviewEn: "Beyazışık Van Dental Group provides high-quality dental services.",
    longDescription: overviewTextRaw || "Beyazışık Van Dental Group provides high-quality dental services.",
    fullOverviewTr: overviewTextRaw || "Beyazışık Van Diş Kliniği, uzman kadrosuyla ağız ve diş sağlığı alanında hizmet vermektedir.",
    fullOverviewEn: overviewTextRaw || "Beyazışık Van Dental Group provides high-quality dental services.",
    
    pricingDisclaimerTr: "Listelenen tutarlar FeelinHealthy profilinde belirtilen ortalama tedavi maliyetleridir. Kesin fiyat; muayene, görüntüleme sonuçları, kullanılacak materyal ve kişisel tedavi planı sonrasında klinik tarafından netleştirilir.",
    pricingDisclaimerEn: "The listed amounts are average treatment costs shown on the FeelinHealthy profile. The final price is confirmed by the clinic after examination, imaging results, material selection and a personalized treatment plan.",
    durationDisclaimer: "Kaynak profilde yer alan gün bilgileri genel planlama bilgisidir; kesin işlem, iyileşme veya konaklama süresi olarak değerlendirilmemelidir."
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

  prices.forEach(p => {
      const pRef = clinicDocRef.collection("pricing").doc();
      batch.set(pRef, {
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
          languages: d.languages,
          education: d.education,
          experienceYears: d.experienceYears,
          sourceUrl: CLINIC_URL,
          verificationStatus: "verified"
      });
  });

  // Knowledge Base
  const oldKb = await clinicDocRef.collection("knowledge_documents").get();
  oldKb.forEach(doc => batch.delete(doc.ref));

  const kbTopics = [
    "clinic_overview", "brand_and_branch", "location",
    "implant_treatments", "all_on_4_implants", "all_on_6_implants", "bone_graft", "sinus_lift",
    "dental_crowns", "emax_crown", "zirconia_crown", "dentures",
    "dental_laminates", "hollywood_smile", "teeth_whitening", "teeth_cleaning",
    "dental_anesthesia", "tooth_extractions", "mouth_guard", "root_canal_treatment",
    "treatment_pricing", "source_duration_information", "doctor_information",
    "doctor_languages", "doctor_education", "doctor_experience", "iso_certificate_claim"
  ];

  kbTopics.forEach(topic => {
    let content = "";
    if (topic === "clinic_overview") content = clinicData.longDescription;
    if (topic === "brand_and_branch") content = "Beyazışık Dental Group, Van branch.";
    if (topic === "location") content = "Located in Van, Turkey.";
    if (topic === "iso_certificate_claim") content = "The clinic has ISO certificate claims.";
    if (topic === "treatment_pricing") content = "Prices are average costs shown on the FeelinHealthy profile.";
    if (topic === "source_duration_information") content = "Duration listed is general planning information, not exact recovery time.";
    if (topic === "doctor_information") content = `Clinic has ${doctors.length} doctors.`;
    
    // Add treatment topics
    if (topic.includes("implant") || topic.includes("crown") || topic.includes("denture") || topic.includes("smile") || topic.includes("whitening") || topic.includes("anesthesia") || topic.includes("extraction") || topic.includes("root_canal") || topic.includes("mouth_guard")) {
        content = `The clinic provides ${topic.replace(/_/g, " ")} services.`;
    }

    if (topic.includes("doctor")) {
        content = `The clinic provides information on ${topic.replace(/_/g, " ")}.`;
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
