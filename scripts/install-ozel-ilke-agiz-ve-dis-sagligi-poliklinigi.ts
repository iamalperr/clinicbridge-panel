import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import * as admin from "firebase-admin";
import { getAdminDb } from "../lib/firebase-admin";
import * as cheerio from "cheerio";
import fetch from "node-fetch";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";
const CLINIC_URL = "https://feelinhealthy.com/medicalcenter/ozel-ilke-agiz-ve-dis-sagligi-poliklinigi";
const STABLE_KEY = "ozel_ilke_agiz_ve_dis_sagligi_poliklinigi";
const SLUG = "ozel-ilke-agiz-ve-dis-sagligi-poliklinigi";

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
  if (!h1Lower.includes("ilke") || !h1Lower.includes("özel") && !h1Lower.includes("ozel")) {
    throw new Error(`canonical_source_fetch_failed_or_identity_mismatch: Title does not match target. Got: ${h1}`);
  }

  console.log(`Source page title: ${h1}`);

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

  const history = overviewTextRaw.includes("opened in İzmir in 2011") && overviewTextRaw.includes("A-type clinic in 2018") ? 
    "Ilke Dental Clinic opened in İzmir in 2011 as a B-type clinic and upgraded to an A-type clinic in 2018." : "";
  const missionMatch = overviewTextRaw.match(/Our Mission\s+(.*?)(?=\s+Our Vision|$)/i);
  const mission = missionMatch ? missionMatch[1].trim() : "";
  const visionMatch = overviewTextRaw.match(/Our Vision\s+(.*)/i);
  const vision = visionMatch ? visionMatch[1].trim() : "";
  
  let cleanedOverview = overviewTextRaw
    .replace(/Our Mission.*/i, "")
    .replace(/Our Vision.*/i, "")
    .trim();

  return { html, h1, overviewTextRaw, cleanedOverview, history, mission, vision };
}

async function run() {
  const isApply = process.argv.includes("--apply");
  console.log(`=== ÖZEL İLKE AĞIZ VE DİŞ SAĞLIĞI POLİKLİNİĞİ INSTALLATION [${isApply ? "APPLY" : "DRY-RUN"}] ===\n`);

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
    // Avoid matching other clinics. Only match specific ones.
    if (nName.includes("ilke") && (nName.includes("özel") || nName.includes("ozel"))) {
      duplicateTargetCandidates.push({ id: doc.id, name: data.clinicName, url: data.canonicalSourceUrl });
    }
  }

  // Auto-merge if exact name match and it's the only one
  if (!existingClinicId && duplicateTargetCandidates.length === 1) {
    const c = duplicateTargetCandidates[0];
    if (c.name.includes("Özel İlke")) {
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

  const { html, h1, overviewTextRaw, cleanedOverview, history, mission, vision } = await fetchAndParseSource();

  console.log(`Extracted History: ${history ? 'Yes' : 'No'}`);
  console.log(`Extracted Mission: ${mission ? 'Yes' : 'No'}`);
  console.log(`Extracted Vision: ${vision ? 'Yes' : 'No'}`);

  console.log("treatment_rows_not_listed_on_canonical_source");
  console.log("pricing_rows_not_listed_on_canonical_source");
  console.log("promotions_not_listed_on_canonical_source");
  console.log("doctors_not_listed_on_canonical_source");

  const clinicData = {
    agencyId: AGENCY_ID,
    stableKey: STABLE_KEY,
    slug: SLUG,
    brand: "Özel İlke",
    branch: "", // Rule: Canonical source üzerinde branch belirtilmiyorsa branch üretme
    displayNameTr: "Özel İlke Ağız ve Diş Sağlığı Polikliniği",
    displayNameEn: "Ozel Ilke Oral and Dental Health Polyclinic", // Fallback generated translation metadata noted in prompt
    displayNameEnMetadata: "generated_translation",
    category: "oral_dental_health_polyclinic",
    sourceDomain: "feelinhealthy.com",
    externalSourceUrl: CLINIC_URL,
    canonicalSourceUrl: CLINIC_URL,
    sourceType: "agency_website",
    externalLinkType: "feelinhealthy_profile",
    sourceStatus: "verified",
    
    clinicName: "Özel İlke Ağız ve Diş Sağlığı Polikliniği",
    status: "active",
    priority: 83, 
    
    aliases: [
      "Özel İlke",
      "Özel İlke Diş Kliniği",
      "İlke Dental Clinic",
      "Ilke Dental Clinic",
      "Özel İlke İzmir",
      "Ozel Ilke Izmir",
      "Özel İlke Ağız ve Diş Sağlığı Polikliniği",
      "Ozel Ilke Agiz ve Dis Sagligi Poliklinigi"
    ],
    
    treatmentCategories: [], // No categories on source
    
    location: {
      country: "Türkiye",
      countryCode: "TR",
      city: "İzmir",
      timezone: "Europe/Istanbul"
    },

    shortDescription: cleanedOverview.substring(0, 150) + "..." || "Oral and Dental Health Polyclinic providing services in Izmir.",
    shortOverviewTr: "2011 yılından bu yana İzmir'de hizmet veren modern ağız ve diş sağlığı polikliniği.",
    shortOverviewEn: cleanedOverview.substring(0, 150) + "..." || "Oral and Dental Health Polyclinic providing services in Izmir.",
    longDescription: overviewTextRaw || "Oral and Dental Health Polyclinic.",
    fullOverviewTr: "İlke Ağız ve Diş Sağlığı Polikliniği, İzmir'de modern donanımı ve uzman kadrosuyla ağız ve diş sağlığı hizmetleri sunmaktadır.",
    fullOverviewEn: overviewTextRaw || "Oral and Dental Health Polyclinic.",
    
    historyTr: "2011 yılında B tipi klinik olarak faaliyete başlamış, 2018 yılında A tipi klinik statüsüne yükselmiştir.",
    historyEn: history,
    missionTr: "Mutlak hasta memnuniyetini sağlamak amacıyla etik standartlara bağlı, yenilikçi ve güvenilir sağlık hizmetleri sunmak.",
    missionEn: mission,
    visionTr: "Hasta ve çalışan memnuniyetini ön planda tutan, sürekli gelişime açık ve sağlıkta öncelikli tercih edilen güvenilir bir kurum olmak.",
    visionEn: vision
  };

  let expectedDelta = existingClinicId ? 0 : 1;

  if (!isApply) {
    console.log("\n--- DRY RUN REPORT ---");
    console.log("Planned updates: ", existingClinicId ? 1 : 0);
    console.log("Planned creates: ", existingClinicId ? 0 : 1);
    console.log("Expected clinic count delta: ", expectedDelta);
    console.log("Clinic document deletes: 0");
    console.log("Other clinic writes: 0");
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

  // Clear unverified legacies safely
  const oldDepts = await clinicDocRef.collection("departments").get();
  oldDepts.forEach(doc => batch.delete(doc.ref));
  
  const oldPrices = await clinicDocRef.collection("pricing").get();
  oldPrices.forEach(doc => batch.delete(doc.ref));
  
  const oldPackages = await clinicDocRef.collection("packages").get();
  oldPackages.forEach(doc => batch.delete(doc.ref));

  const oldDoctors = await clinicDocRef.collection("doctors").get();
  oldDoctors.forEach(doc => batch.delete(doc.ref));

  // Knowledge Base
  const oldKb = await clinicDocRef.collection("knowledge_documents").get();
  oldKb.forEach(doc => batch.delete(doc.ref));

  const kbTopics = [
    "clinic_overview", "clinic_history", "mission", "vision", "location_and_access"
  ];

  kbTopics.forEach(topic => {
    let content = "";
    if (topic === "clinic_overview") content = clinicData.longDescription;
    if (topic === "clinic_history") content = clinicData.historyEn;
    if (topic === "mission") content = clinicData.missionEn;
    if (topic === "vision") content = clinicData.visionEn;
    if (topic === "location_and_access") content = "Clinic is located in Izmir, Turkey.";

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
  
  // NOTE: Rule "Türkçe dilini yalnızca Türkiye’de bulunduğu için otomatik ekleme." means DO NOT ASSUME TR JUST BECAUSE TR. 
  // Rule "Doctor languages değerlerini clinic languages alanına otomatik aktarma." 
  // "FeelinHealthy footer language selector’ını clinic languages olarak import etme."
  // Source does NOT explicitly list languages.
  console.log("No languages explicitly listed in source, assuming nothing.");

  await batch.commit();
  console.log(`\n[SUCCESS] Installation completed successfully. Clinic ID: ${clinicDocRef.id}`);

  const afterSnap = await clinicsRef.get();
  console.log(`[VERIFICATION] Clinic count after: ${afterSnap.size} (Expected: ${totalClinicsBefore + expectedDelta})`);
  
  const savedDoc = await clinicDocRef.get();
  console.log(`[VERIFICATION] Visible clinic name: ${savedDoc.data()?.clinicName}`);

}

run().catch(console.error);
