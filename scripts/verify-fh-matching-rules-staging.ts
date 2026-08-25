/**
 * Staging verify: load matchingRules, resolve sample cases, edit+restore one rule.
 */
import * as admin from "firebase-admin";
import {
  loadAndAssertStagingEnv,
  STAGING_PROJECT_ID,
} from "./lib/stagingFirebaseEnv";
import { resolveAgencyClinicRecommendations } from "../lib/agency/agencyMatchingRules";
import { FEELINHEALTHY_PRODUCTION_CLINIC_IDS as IDS } from "../lib/agency/feelinhealthyConfig";

async function main() {
  loadAndAssertStagingEnv();
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(
        JSON.parse(
          Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, "base64").toString("utf8")
        )
      ),
      projectId: STAGING_PROJECT_ID,
    });
  }
  const db = admin.firestore();
  const snap = await db
    .collection("agencies")
    .doc("feelinhealthy")
    .collection("matchingRules")
    .get();
  const rules = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as any[];
  console.log("firestore rules", rules.length);
  console.log(
    "intermed in firestore",
    rules.some((r) => (r.clinicIds || []).includes(IDS.intermedNisantasi))
  );

  const clinicSnap = await db
    .collection("agencies")
    .doc("feelinhealthy")
    .collection("clinics")
    .get();
  const clinics = clinicSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((c: any) => c.status === "active");
  console.log("active clinics", clinics.length);

  const cases: Array<[string, string, any]> = [
    ["dental", "istanbul", "anatolian"],
    ["dental", "istanbul", "european"],
    ["dental", "antalya", "any"],
    ["aesthetic_surgery", "istanbul", "european"],
  ];
  for (const [cat, city, side] of cases) {
    const res = resolveAgencyClinicRecommendations({
      category: cat,
      city,
      side,
      availableClinics: clinics,
      agencyRules: rules,
      agencySlug: "feelinhealthy",
    });
    console.log(
      cat,
      city,
      side,
      "source=" + res.source,
      res.matchingCuratedClinics.map((c: any) => c.clinicName || c.id).join(" | ")
    );
  }

  const ruleRef = db
    .collection("agencies")
    .doc("feelinhealthy")
    .collection("matchingRules")
    .doc("dental__istanbul__anatolian");
  const before = (await ruleRef.get()).data();
  console.log("before dental anatolian", before?.clinicIds);

  const alt = clinics.find(
    (c: any) =>
      c.id !== IDS.istanbulDisAkademisi &&
      c.id !== IDS.hospitadentCamlica &&
      (c.treatmentCategories || []).map(String).includes("dental")
  );

  if (!alt) {
    console.log("EDIT_TEST_SKIP no alternate dental clinic");
    return;
  }

  await ruleRef.set(
    {
      clinicIds: [IDS.istanbulDisAkademisi, alt.id],
      source: "agency_ui",
      updatedBy: "staging-edit-test",
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  const rules2 = (
    await db.collection("agencies").doc("feelinhealthy").collection("matchingRules").get()
  ).docs.map((d) => ({ id: d.id, ...d.data() }));

  const res2 = resolveAgencyClinicRecommendations({
    category: "dental",
    city: "istanbul",
    side: "anatolian",
    availableClinics: clinics,
    agencyRules: rules2 as any,
    agencySlug: "feelinhealthy",
  });
  console.log(
    "after edit ids",
    res2.matchingCuratedClinics.map((c: any) => c.id),
    "names",
    res2.matchingCuratedClinics.map((c: any) => c.clinicName)
  );
  console.log("EDIT_TOOK_EFFECT", res2.matchingCuratedClinics.some((c: any) => c.id === alt.id));

  await ruleRef.set(
    {
      clinicIds: before?.clinicIds,
      source: "legacy_curated_migration",
      updatedBy: null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );
  console.log("restored dental anatolian");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
