import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import { getAdminDb } from "../lib/firebase-admin";

const AGENCY_ID = "mFrKEjO9fNwUzbueW5rc";

async function runAudit() {
  console.log("=== FINAL CANONICAL AUDIT ===");
  const db = getAdminDb();
  const clinicsRef = db.collection("agencies").doc(AGENCY_ID).collection("clinics");
  const allClinicsSnap = await clinicsRef.get();

  const totalClinics = allClinicsSnap.size;
  console.log(`Total clinics found for agency: ${totalClinics}`);

  if (totalClinics !== 35) {
      console.error(`ERROR: Expected 35 clinics, found ${totalClinics}`);
  } else {
      console.log("SUCCESS: 35/35 clinics verified.");
  }

  const urls = new Set();
  const slugs = new Set();
  const stableKeys = new Set();

  let duplicatesUrl = 0;
  let duplicatesSlug = 0;
  let duplicatesStableKey = 0;
  let brokenUrls = 0;
  let missingNames = 0;

  allClinicsSnap.forEach(doc => {
      const data = doc.data();
      if (!data.clinicName) missingNames++;
      
      const url = data.canonicalSourceUrl;
      if (!url || typeof url !== 'string' || !url.startsWith("http")) {
          brokenUrls++;
      } else {
          if (urls.has(url)) duplicatesUrl++;
          urls.add(url);
      }

      const slug = data.slug;
      if (slug && typeof slug === 'string') {
          if (slugs.has(slug)) duplicatesSlug++;
          slugs.add(slug);
      }

      const sk = data.stableKey;
      if (sk && typeof sk === 'string') {
          if (stableKeys.has(sk)) duplicatesStableKey++;
          stableKeys.add(sk);
      }
  });

  console.log(`Duplicate URLs: ${duplicatesUrl}`);
  console.log(`Duplicate Slugs: ${duplicatesSlug}`);
  console.log(`Duplicate Stable Keys: ${duplicatesStableKey}`);
  console.log(`Broken/Missing Profile URLs: ${brokenUrls}`);
  console.log(`Missing Clinic Names: ${missingNames}`);
  
  console.log("All canonical integrity checks completed.");
}

runAudit().catch(console.error);
