/**
 * Seed minimal SYNTHETIC FeelinHealthy certification data into clinicbridge-staging.
 *
 * Usage:
 *   npx tsx scripts/seed-feelinhealthy-staging-cert.ts --dry-run
 *   npx tsx scripts/seed-feelinhealthy-staging-cert.ts --apply
 *
 * Loads ONLY `.env.staging`. Never `.env.local`.
 * Does not fetch production Firestore or feelinhealthy.com HTML.
 */

import * as admin from "firebase-admin";
import {
  loadAndAssertStagingEnv,
  STAGING_PROJECT_ID,
  PRODUCTION_PROJECT_ID,
} from "./lib/stagingFirebaseEnv";
import { FEELINHEALTHY_PRODUCTION_CLINIC_IDS } from "../lib/agency/feelinhealthyConfig";
import { getCuratedClinicsForFeelinHealthy } from "../lib/agency/feelinhealthyConfig";
import { FEELINHEALTHY_CONFIG } from "../lib/agency/feelinhealthyConfig";
import { FEELINHEALTHY_CURATED_RULES } from "../lib/agency/feelinhealthyConfig";

const AGENCY_ID = "feelinhealthy";
const TEST_REPLY_TO = "staging-cert+feelinhealthy@clinicbridge.invalid";

type Side = "anatolian" | "european" | null;

interface ClinicSeed {
  id: string;
  clinicName: string;
  clinicSlug: string;
  aliasPatterns: string[];
  category: string;
  treatmentCategories: string[];
  city: string;
  side: Side;
  district?: string;
  priority: number;
  /** Present for Intermed exclusion fixture — not in curated aesthetic×Avrupa. */
  exclusionFixture?: boolean;
}

const CLINICS: ClinicSeed[] = [
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.istanbulDisAkademisi,
    clinicName: "İstanbul Diş Akademisi",
    clinicSlug: "istanbul-dis-akademisi",
    aliasPatterns: ["istanbul-dis-akademisi", "istanbul diş akademisi", "istanbul dental academy"],
    category: "dental",
    treatmentCategories: ["dental"],
    city: "Istanbul",
    side: "anatolian",
    district: "Kadıköy / Ataşehir",
    priority: 10,
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentCamlica,
    clinicName: "Hospitadent Çamlıca",
    clinicSlug: "hospitadent-dental-group-camlica",
    aliasPatterns: ["hospitadent-dental-group-camlica", "hospitadent-camlica", "hospitadent camlica"],
    category: "dental",
    treatmentCategories: ["dental"],
    city: "Istanbul",
    side: "anatolian",
    district: "Çamlıca, Üsküdar",
    priority: 20,
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentMecidiyekoy,
    clinicName: "Hospitadent Mecidiyeköy",
    clinicSlug: "hospitadent-dental-group-mecidiyekoy",
    aliasPatterns: ["hospitadent-dental-group-mecidiyekoy", "hospitadent-mecidiyekoy", "hospitadent mecidiyekoy"],
    category: "dental",
    treatmentCategories: ["dental"],
    city: "Istanbul",
    side: "european",
    district: "Mecidiyeköy, Şişli",
    priority: 30,
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema,
    clinicName: "BHT Clinic İstanbul TEMA Hospital",
    clinicSlug: "bht-clinic-istanbul-tema-hastanesi",
    aliasPatterns: [
      "bht-clinic-istanbul-tema-hastanesi",
      "bht-clinic-istanbul-tema",
      "bht clinic",
      "bht tema",
    ],
    // Dental (Avrupa) + aesthetic (Avrupa) curated coverage
    category: "multi_specialty_hospital",
    treatmentCategories: ["dental", "aesthetic_surgery"],
    city: "Istanbul",
    side: "european",
    district: "Halkalı / Küçükçekmece",
    priority: 40,
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentAntalya,
    clinicName: "Hospitadent Antalya",
    clinicSlug: "hospitadent-dental-group-antalya",
    aliasPatterns: ["hospitadent-dental-group-antalya", "hospitadent-antalya", "hospitadent antalya"],
    category: "dental",
    treatmentCategories: ["dental"],
    city: "Antalya",
    side: null,
    district: "Antalya",
    priority: 50,
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.orionSurgeryCenter,
    clinicName: "Orion Surgery Center",
    clinicSlug: "orion-surgery-center",
    aliasPatterns: ["orion-surgery-center", "orion surgery center", "orion"],
    category: "aesthetic_surgery",
    treatmentCategories: ["aesthetic_surgery"],
    city: "Istanbul",
    side: "anatolian",
    district: "İstanbul",
    priority: 60,
  },
  {
    id: FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi,
    clinicName: "Intermed Health Group Nişantaşı",
    clinicSlug: "intermed-health-group-nisantasi",
    aliasPatterns: ["intermed-health-group-nisantasi", "intermed nisantasi", "intermed"],
    category: "aesthetic_surgery",
    treatmentCategories: ["aesthetic_surgery"],
    city: "Istanbul",
    side: "european",
    district: "Nişantaşı, Şişli",
    priority: 99,
    exclusionFixture: true,
  },
];

function initAdminOrDie(): admin.firestore.Firestore {
  const projectId = (process.env.FIREBASE_PROJECT_ID || "").trim();
  if (projectId === PRODUCTION_PROJECT_ID || projectId !== STAGING_PROJECT_ID) {
    console.error(`[seed] REFUSING Admin init for project="${projectId}"`);
    process.exit(1);
  }

  const b64 = (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "").trim();
  if (!b64) {
    console.error("[seed] FIREBASE_SERVICE_ACCOUNT_BASE64 required in .env.staging");
    process.exit(1);
  }
  const sa = JSON.parse(Buffer.from(b64, "base64").toString("utf8")) as {
    project_id?: string;
  };
  if (sa.project_id !== STAGING_PROJECT_ID) {
    console.error(`[seed] REFUSING SA project_id="${sa.project_id}"`);
    process.exit(1);
  }

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(Buffer.from(b64, "base64").toString("utf8"))),
      projectId: STAGING_PROJECT_ID,
    });
  }

  const appProject = admin.app().options.projectId || sa.project_id;
  if (appProject !== STAGING_PROJECT_ID) {
    console.error(`[seed] REFUSING connected project="${appProject}"`);
    process.exit(1);
  }
  console.log(`[seed] Admin connected project="${appProject}"`);
  return admin.firestore();
}

function buildAgencyDoc() {
  return {
    id: AGENCY_ID,
    slug: AGENCY_ID,
    displayName: "FeelinHealthy",
    name: "FeelinHealthy",
    type: "health_tourism_agency",
    status: "active",
    legalContext: "Health tourism agency / medical tourism platform (STAGING CERT FIXTURE)",
    primaryWebsite: "https://feelinhealthy.com/",
    domains: [
      "https://feelinhealthy.com",
      "http://localhost:3000",
      "*.feelinhealthy.com",
    ],
    locales: ["en", "tr"],
    branding: {
      primaryColor: "#00b2a9",
      secondaryColor: "#1e293b",
      accentColor: "#0ea5e9",
      displayName: "FeelinHealthy",
    },
    privacySettings: {
      enabled: true,
      mode: "kvkk_and_gdpr",
      version: "1.0",
      requiredBeforePersonalData: true,
      consentTextEn:
        "To recommend suitable clinics and evaluate your request, we need your consent to process the personal and health-related information you provide. You can review the privacy notice before continuing.",
      consentTextTr:
        "Sizlere uygun klinikleri önerebilmemiz ve talebinizi değerlendirebilmemiz için paylaşacağınız kişisel ve sağlıkla ilgili verileri işlememize yönelik onayınıza ihtiyaç duyuyoruz. Aydınlatma metnini inceleyerek devam edebilirsiniz.",
      noticeUrlEn: "https://feelinhealthy.com/kvkk",
      noticeUrlTr: "https://feelinhealthy.com/kvkk",
    },
    // Patient-email Reply-To (resolveAgencyBrand): settings.supportEmail → contactEmail → email.
    // Portal agency create/edit writes contactEmail. Do not rely on emailSettings.replyTo
    // (seed-only invention; not read by patient mailers).
    contactEmail: TEST_REPLY_TO,
    settings: {
      // Active for non-FH paths; FH guest selection uses FEELINHEALTHY_CONFIG (2).
      maxClinicsPerTreatmentRequest: 2,
      multiClinicSelectionEnabled: true,
      patientEmailCollectionEnabled: true,
      patientSecurePortalEnabled: true,
      emailNotificationsEnabled: true,
      whatsappNotificationsEnabled: false,
      smsNotificationsEnabled: false,
      askBudget: false,
      budgetCollectionEnabled: false,
      supportEmail: TEST_REPLY_TO,
    },
    agentSettings: {
      name: "FeelinHealthy Assistant",
      role: "Health tourism patient advisor (staging)",
    },
    stagingFixture: true,
    stagingPurpose: "release_certification",
  };
}

function buildClinicDoc(c: ClinicSeed) {
  const location: Record<string, string> = {
    city: c.city,
    country: "Turkey",
    district: c.district || "",
  };
  if (c.side === "anatolian") location.region = "Asian Side";
  if (c.side === "european") location.region = "European Side";
  if (c.side) location.istanbul_side = c.side;

  const doc: Record<string, unknown> = {
    id: c.id,
    clinicId: c.id,
    clinicName: c.clinicName,
    displayNameTr: c.clinicName,
    displayNameEn: c.clinicName,
    clinicSlug: c.clinicSlug,
    slug: c.clinicSlug,
    aliasPatterns: c.aliasPatterns,
    category: c.category,
    treatmentCategories: c.treatmentCategories,
    status: "active",
    publicVisibility: true,
    priority: c.priority,
    clinicType: "external",
    agencyId: AGENCY_ID,
    agencySlug: AGENCY_ID,
    location,
    supportedLanguages: ["tr", "en"],
    overview: {
      shortDescription: `STAGING CERT FIXTURE — synthetic ${c.clinicName}. Not production data.`,
    },
    stagingFixture: true,
    exclusionFixture: c.exclusionFixture === true,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (c.side) doc.istanbul_side = c.side;
  return doc;
}

async function run() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply;

  console.log("\n=== FeelinHealthy STAGING CERT SEED ===");
  console.log(`Mode: ${dryRun ? "DRY-RUN" : "APPLY"}`);

  loadAndAssertStagingEnv();
  const db = initAdminOrDie();

  // Extra belt-and-suspenders before writes
  const connected = admin.app().options.projectId;
  if (connected !== STAGING_PROJECT_ID) {
    console.error(`[seed] STOP: connected="${connected}"`);
    process.exit(1);
  }

  const agencyRef = db.collection("agencies").doc(AGENCY_ID);
  const agencyPayload = buildAgencyDoc();

  console.log(`\n[agency] agencies/${AGENCY_ID}`);
  console.log(`  maxClinicsPerTreatmentRequest=${agencyPayload.settings.maxClinicsPerTreatmentRequest}`);
  console.log(`  askBudget=${agencyPayload.settings.askBudget}`);
  console.log(`  contactEmail=${agencyPayload.contactEmail}`);
  console.log(`  settings.supportEmail=${agencyPayload.settings.supportEmail}`);
  console.log(`  FEELINHEALTHY_CONFIG.maxGuestClinics=${FEELINHEALTHY_CONFIG.maxGuestClinics}`);

  if (apply) {
    const existing = await agencyRef.get();
    await agencyRef.set(
      {
        ...agencyPayload,
        createdAt: existing.exists
          ? existing.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp()
          : admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    await agencyRef.collection("config").doc("matching").set(
      {
        maxClinicsToShow: 2,
        stagingFixture: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    console.log("  -> agency upserted");
  } else {
    console.log("  -> would upsert agency + config/matching");
  }

  console.log("\n[clinics]");
  for (const c of CLINICS) {
    const ref = agencyRef.collection("clinics").doc(c.id);
    const doc = buildClinicDoc(c);
    console.log(
      `  ${c.id}  ${c.clinicName}  city=${c.city} side=${c.side || "-"} cats=${c.treatmentCategories.join(",")}${
        c.exclusionFixture ? " [EXCLUSION FIXTURE]" : ""
      }`
    );
    if (apply) {
      const snap = await ref.get();
      await ref.set(
        {
          ...doc,
          createdAt: snap.exists
            ? snap.data()?.createdAt || admin.firestore.FieldValue.serverTimestamp()
            : admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
  }

  if (dryRun) {
    console.log("\nDRY-RUN complete. Re-run with --apply to write.");
    process.exit(0);
  }

  // ── Post-seed validation (read-only) ──
  console.log("\n=== POST-SEED VALIDATION ===");
  console.log(`project=${admin.app().options.projectId}`);

  const agencySnap = await agencyRef.get();
  if (!agencySnap.exists) {
    console.error("FAIL: agency missing");
    process.exit(1);
  }
  const agency = agencySnap.data()!;
  const settingsMax = agency.settings?.maxClinicsPerTreatmentRequest;
  console.log(`agency.exists=true slug=${agency.slug}`);
  console.log(`settings.maxClinicsPerTreatmentRequest=${settingsMax}`);
  console.log(`settings.askBudget=${agency.settings?.askBudget}`);
  console.log(`settings.budgetCollectionEnabled=${agency.settings?.budgetCollectionEnabled}`);
  console.log(`canonical.maxGuestClinics=${FEELINHEALTHY_CONFIG.maxGuestClinics}`);
  console.log(`canonical.askBudget=${FEELINHEALTHY_CONFIG.askBudget}`);

  if (Number(settingsMax) !== 2) {
    console.error("FAIL: settings max clinics != 2");
    process.exit(1);
  }
  if (FEELINHEALTHY_CONFIG.maxGuestClinics !== 2) {
    console.error("FAIL: canonical guest max != 2");
    process.exit(1);
  }
  if (agency.settings?.askBudget !== false || FEELINHEALTHY_CONFIG.askBudget !== false) {
    console.error("FAIL: budget must be disabled");
    process.exit(1);
  }

  const clinicSnap = await agencyRef.collection("clinics").get();
  const clinics = clinicSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`clinic_count=${clinics.length}`);

  for (const expected of CLINICS) {
    const found = clinics.find((c) => c.id === expected.id);
    if (!found) {
      console.error(`FAIL: missing clinic ${expected.id}`);
      process.exit(1);
    }
    if (String((found as any).status).toLowerCase() !== "active") {
      console.error(`FAIL: clinic ${expected.id} not active`);
      process.exit(1);
    }
    const side = (found as any).istanbul_side || (found as any).location?.istanbul_side || null;
    if (expected.side && side !== expected.side) {
      console.error(`FAIL: clinic ${expected.id} side=${side} expected=${expected.side}`);
      process.exit(1);
    }
  }

  const intermed = clinics.find(
    (c) => c.id === FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi
  );
  console.log(`intermed.exists=${Boolean(intermed)} active=${(intermed as any)?.status}`);

  // Curated exclusion proof (in-memory against seeded clinic list)
  const aestheticAvrupa = getCuratedClinicsForFeelinHealthy(
    "aesthetic_surgery",
    "istanbul",
    "european",
    clinics
  );
  const aestheticIds = aestheticAvrupa.matchingCuratedClinics.map((c: any) => c.id);
  console.log(`aesthetic_avrupa_curated_ids=${JSON.stringify(aestheticIds)}`);
  if (aestheticIds.includes(FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi)) {
    console.error("FAIL: Intermed appeared in curated aesthetic×Avrupa recommendations");
    process.exit(1);
  }
  const intermedInRule = FEELINHEALTHY_CURATED_RULES.some(
    (b) =>
      b.branchKey === "aesthetic_surgery" &&
      b.locations.some(
        (l) =>
          l.city === "istanbul" &&
          l.side === "european" &&
          l.curatedClinics.some(
            (t) => t.slugOrId === FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi
          )
      )
  );
  console.log(`intermed_in_curated_rule=${intermedInRule}`);
  if (intermedInRule) {
    console.error("FAIL: curated rule still lists Intermed");
    process.exit(1);
  }

  // Matching dry-runs
  const dryCases = [
    { label: "dental+istanbul+anatolian", cat: "dental", city: "istanbul", side: "anatolian" as const },
    { label: "dental+istanbul+european", cat: "dental", city: "istanbul", side: "european" as const },
    { label: "dental+antalya", cat: "dental", city: "antalya", side: null },
    { label: "aesthetic+istanbul+anatolian", cat: "aesthetic_surgery", city: "istanbul", side: "anatolian" as const },
    { label: "aesthetic+istanbul+european", cat: "aesthetic_surgery", city: "istanbul", side: "european" as const },
  ];
  console.log("\n[matching dry-run]");
  for (const tc of dryCases) {
    const res = getCuratedClinicsForFeelinHealthy(tc.cat, tc.city, tc.side, clinics);
    const ids = res.matchingCuratedClinics.map((c: any) => c.id);
    console.log(
      `  ${tc.label}: count=${ids.length} ids=${JSON.stringify(ids)} maxOk=${
        ids.length <= FEELINHEALTHY_CONFIG.maxGuestClinics
      }`
    );
    if (ids.length === 0) {
      console.error(`FAIL: no matches for ${tc.label}`);
      process.exit(1);
    }
    if (ids.length > FEELINHEALTHY_CONFIG.maxGuestClinics) {
      console.error(`FAIL: exceeded guest max for ${tc.label}`);
      process.exit(1);
    }
    if (
      tc.label === "aesthetic+istanbul+european" &&
      ids.includes(FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi)
    ) {
      console.error("FAIL: Intermed in aesthetic Avrupa dry-run");
      process.exit(1);
    }
  }

  // No patient artifacts
  const leadSnap = await agencyRef.collection("leads").limit(5).get();
  const quoteSnap = await agencyRef.collection("quotes").limit(5).get();
  const quoteReqSnap = await agencyRef.collection("quoteRequests").limit(5).get();
  const convSnap = await agencyRef.collection("conversations").limit(5).get();
  const leadCount = leadSnap.size;
  const quoteCount = quoteSnap.size + quoteReqSnap.size;
  const convCount = convSnap.size;
  console.log(`\nconversations≈${convCount} leads=${leadCount} quotes≈${quoteCount}`);
  if (leadCount > 0 || quoteCount > 0) {
    console.error("FAIL: unexpected leads/quotes before certification");
    process.exit(1);
  }

  console.log("\nSTAGING SEED APPLY + VALIDATION OK");
  console.log(`production_touched=NO written_project=${STAGING_PROJECT_ID}`);
}

run().catch((err) => {
  console.error("[seed] FATAL", err instanceof Error ? err.message : err);
  process.exit(1);
});
