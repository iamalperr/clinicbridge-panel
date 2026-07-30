import { loadEnvConfig } from "@next/env";
const projectDir = process.cwd();
loadEnvConfig(projectDir);

import { getAdminDb } from "../lib/firebase-admin";

async function run() {
  const db = getAdminDb();
  const agencyId = "mFrKEjO9fNwUzbueW5rc";
  
  const querySnap = await db.collection("agencies").doc(agencyId).collection("clinics")
    .orderBy("priority", "asc")
    .get();
    
  console.log(`[VERIFICATION] Real Agency Portal query returned ${querySnap.size} clinics.`);
  
  let sancaktepeFound = false;
  let gokturkFound = false;
  let cevizlibagFound = false;
  let pendikFound = false;
  let kocaeliFound = false;

  querySnap.forEach(doc => {
    const data = doc.data();
    if (data.branch === 'Sancaktepe' || data.slug === 'beyazisik-sancaktepe-dental-group') {
      sancaktepeFound = true;
      console.log(`- Found Sancaktepe: ID ${doc.id}, Name: ${data.clinicName}`);
    }
    if (data.branch === 'Göktürk' || doc.id === 'tiIuRfmyrnPsRkw8YQo5') gokturkFound = true;
    if (data.branch === 'Cevizlibağ' || doc.id === 'n6Fm05IEtQqOLvBEg9qQ') cevizlibagFound = true;
    if (data.branch === 'Pendik' || doc.id === 'qcFmrRWRTLxyjiuaCdFm') pendikFound = true;
    if (data.branch === 'Kocaeli' || data.clinicName?.includes('Kocaeli')) kocaeliFound = true;
  });
  
  console.log("[VERIFICATION] Sancaktepe present:", sancaktepeFound);
  console.log("[VERIFICATION] Göktürk present:", gokturkFound);
  console.log("[VERIFICATION] Cevizlibağ present:", cevizlibagFound);
  console.log("[VERIFICATION] Pendik present:", pendikFound);
  console.log("[VERIFICATION] Kocaeli present:", kocaeliFound);

  if (!sancaktepeFound || gokturkFound || cevizlibagFound || !pendikFound || !kocaeliFound || querySnap.size !== 15) {
    console.error("[ERROR] UI query regression check failed.");
    process.exit(1);
  } else {
    console.log("[SUCCESS] UI query regression check passed.");
  }
}

run().catch(console.error);
