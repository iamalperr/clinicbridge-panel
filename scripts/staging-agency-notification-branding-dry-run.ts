/**
 * Staging-only dry-run: one synthetic FeelinHealthy agency-facing
 * "Yeni Teklif Talebi" notification to the internal test inbox.
 *
 * Usage:
 *   npx tsx scripts/staging-agency-notification-branding-dry-run.ts
 *
 * Safety:
 * - Loads ONLY .env.staging
 * - Refuses production project
 * - Sends to TEST_INBOX only (no agency staff / patient recipients)
 * - Synthetic patient data only
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Resend } from "resend";
import {
  loadAndAssertStagingEnv,
  STAGING_PROJECT_ID,
  PRODUCTION_PROJECT_ID,
} from "./lib/stagingFirebaseEnv";
import { resolveAgencyBrand } from "../lib/agency/resolveAgencyBrand";
import {
  buildAgencyQuoteNotificationContent,
  buildQuoteRequestPortalUrl,
} from "../lib/services/agencyQuoteNotificationContent";

const TEST_INBOX = "info@clinicbridge-ai.com";
const AGENCY_ID = "feelinhealthy";

async function main() {
  console.log("=== STAGING AGENCY NOTIFICATION BRANDING DRY-RUN ===");
  loadAndAssertStagingEnv();

  if (!process.env.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY missing in staging env");
  }

  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, "base64").toString("utf8")
  );
  if (sa.project_id !== STAGING_PROJECT_ID) {
    throw new Error(`SA project_id=${sa.project_id} is not staging (${STAGING_PROJECT_ID})`);
  }
  if (sa.project_id === PRODUCTION_PROJECT_ID) {
    throw new Error("Refusing production project");
  }

  if (!getApps().length) {
    initializeApp({ credential: cert(sa), projectId: STAGING_PROJECT_ID });
  }
  const db = getFirestore();
  const connected = getApps()[0]?.options?.projectId;
  if (connected !== STAGING_PROJECT_ID) {
    throw new Error(`connected project ${connected} is not staging`);
  }

  const agencySnap = await db.collection("agencies").doc(AGENCY_ID).get();
  if (!agencySnap.exists) {
    throw new Error(`Staging agency ${AGENCY_ID} not found`);
  }

  const brand = resolveAgencyBrand(agencySnap.data() as any);
  const leadId = `dryrun_branding_${Date.now()}`;
  const portalUrl = buildQuoteRequestPortalUrl(AGENCY_ID, leadId);
  const content = buildAgencyQuoteNotificationContent({
    lang: "tr",
    patientName: "Staging Branding DryRun",
    patientEmail: "staging-dryrun@clinicbridge.invalid",
    patientPhone: "+900000000000",
    patientCountry: "GB",
    treatmentLabel: "hair_transplant",
    preferredCity: "istanbul",
    istanbulSide: "european",
    travelDate: "2026-09-15",
    clinicNames: ["Hospitadent Mecidiyeköy"],
    quoteRequestId: leadId,
    conversationId: `sess_dryrun_${Date.now()}`,
    portalUrl,
    createdAt: new Date().toISOString(),
    status: "requested",
  });

  const from = brand.fromHeader;
  const subject = `[Staging Dry-Run] ${content.subject}`;
  const headersOk =
    from === "FeelinHealthy <noreply@clinicbridge-ai.com>" &&
    !/ClinicBridge AI </.test(from) &&
    content.subject.startsWith("Yeni Teklif Talebi");

  console.log(
    JSON.stringify(
      {
        projectId: STAGING_PROJECT_ID,
        agencyId: AGENCY_ID,
        from,
        to: TEST_INBOX,
        subject,
        headersOk,
        isAgencyBranded: brand.isAgencyBranded,
      },
      null,
      2
    )
  );

  if (!headersOk) {
    throw new Error(`Brand headers failed: from=${from}`);
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const result = await resend.emails.send({
    from,
    to: TEST_INBOX,
    subject,
    html: content.html,
    text: content.text,
  });

  if (result.error) {
    throw new Error(`Resend error: ${result.error.message || String(result.error)}`);
  }

  console.log(
    JSON.stringify(
      {
        pass: true,
        messageId: result.data?.id || null,
        from,
        to: TEST_INBOX,
        subject,
      },
      null,
      2
    )
  );
  console.log("AGENCY NOTIFICATION BRANDING DRY-RUN PASS");
}

main().catch((err) => {
  console.error("AGENCY NOTIFICATION BRANDING DRY-RUN FAIL", err);
  process.exit(1);
});
