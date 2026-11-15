/**
 * Dry-run: list conversations stuck in liveSupport / live_support_required
 * over the last 30 days that have no successful contact-request clinic notify.
 *
 * NEVER sends email/WhatsApp. Print-only.
 *
 * Usage:
 *   npx tsx scripts/dry-run-live-support-missing-notify.ts
 *   npx tsx scripts/dry-run-live-support-missing-notify.ts --clinic=<clinicId>
 *
 * Env:
 *   Loads .env.staging by default (see scripts/lib/stagingFirebaseEnv.ts).
 *   Override with CLINICBRIDGE_ENV_FILE=/path/to/env
 */
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import {
  loadAndAssertStagingEnv,
  STAGING_PROJECT_ID,
  PRODUCTION_PROJECT_ID,
} from "./lib/stagingFirebaseEnv";
import { maskPhoneForLogs } from "../lib/phone/e164";

const DAYS = 30;
const LIVE_STATUSES = new Set([
  "liveSupport",
  "live_support",
  "live_support_required",
  "Canlı Destek Gerekli",
  "Live Support Required",
]);

function parseArgs(argv: string[]): { clinicId?: string } {
  const clinicArg = argv.find((a) => a.startsWith("--clinic="));
  return { clinicId: clinicArg ? clinicArg.slice("--clinic=".length).trim() : undefined };
}

function isLiveStatus(raw: unknown): boolean {
  const s = String(raw || "").trim();
  if (!s) return false;
  if (LIVE_STATUSES.has(s)) return true;
  const lower = s.toLowerCase();
  return lower.includes("livesupport") || lower.includes("live_support");
}

function wasNotified(status: unknown): boolean {
  const s = String(status || "").toLowerCase();
  return s === "sent" || s === "disabled" || s === "skipped_duplicate";
}

async function listClinicIds(db: Firestore, only?: string): Promise<string[]> {
  if (only) return [only];
  const snap = await db.collection("clinics").select().get();
  return snap.docs.map((d) => d.id);
}

async function main() {
  console.log("=== DRY-RUN: live support without clinic notify (last 30 days) ===");
  console.log("This script NEVER sends email or WhatsApp.\n");

  loadAndAssertStagingEnv();
  const { clinicId: onlyClinic } = parseArgs(process.argv.slice(2));

  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, "base64").toString("utf8")
  );
  if (sa.project_id === PRODUCTION_PROJECT_ID) {
    throw new Error("Refusing production project — use staging env only for this dry-run.");
  }
  if (sa.project_id !== STAGING_PROJECT_ID) {
    console.warn(
      `[warn] SA project_id=${sa.project_id} (expected staging ${STAGING_PROJECT_ID}). Continuing in dry-run only.`
    );
  }

  if (!getApps().length) {
    initializeApp({ credential: cert(sa), projectId: sa.project_id });
  }
  const db = getFirestore();

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000).toISOString();
  const clinicIds = await listClinicIds(db, onlyClinic);
  console.log(`Scanning ${clinicIds.length} clinic(s) since ${since}…\n`);

  type Row = {
    clinicId: string;
    conversationId: string;
    status: string;
    updatedAt: string;
    language?: string;
    hasContactRequest: boolean;
    contactRequestId?: string;
    notifyStatus?: string;
    phoneMasked: string;
  };

  const rows: Row[] = [];

  for (const clinicId of clinicIds) {
    const logsSnap = await db
      .collection("clinics")
      .doc(clinicId)
      .collection("conversationLogs")
      .where("updatedAt", ">=", since)
      .limit(500)
      .get()
      .catch(async () => {
        // Fallback if composite index missing: scan recent by updatedAt desc is not always available.
        return db
          .collection("clinics")
          .doc(clinicId)
          .collection("conversationLogs")
          .orderBy("updatedAt", "desc")
          .limit(200)
          .get();
      });

    for (const doc of logsSnap.docs) {
      const data = doc.data() || {};
      const updatedAt = String(data.updatedAt || data.createdAt || "");
      if (updatedAt && updatedAt < since) continue;
      if (!isLiveStatus(data.status) && data.liveSupportRequested !== true) continue;

      // Skip when conversation already has a successfully notified contact request.
      const contactRequestId = data.contactRequestId ? String(data.contactRequestId) : "";
      let notifyStatus: string | undefined;
      let hasContactRequest = Boolean(contactRequestId);

      if (contactRequestId) {
        const crSnap = await db
          .collection("clinics")
          .doc(clinicId)
          .collection("contactRequests")
          .doc(contactRequestId)
          .get();
        if (crSnap.exists) {
          notifyStatus = String(crSnap.data()?.clinicNotificationStatus || "");
          if (wasNotified(notifyStatus)) continue;
        }
      } else {
        // Unresolved CR for this conversation?
        const crQuery = await db
          .collection("clinics")
          .doc(clinicId)
          .collection("contactRequests")
          .where("conversationId", "==", doc.id)
          .limit(5)
          .get()
          .catch(() => null);
        if (crQuery && !crQuery.empty) {
          hasContactRequest = true;
          const anyNotified = crQuery.docs.some((d) =>
            wasNotified(d.data()?.clinicNotificationStatus)
          );
          if (anyNotified) continue;
          notifyStatus = String(crQuery.docs[0].data()?.clinicNotificationStatus || "missing");
        }
      }

      rows.push({
        clinicId,
        conversationId: doc.id,
        status: String(data.status || ""),
        updatedAt,
        language: data.language || data.conversationLocale || data.detectedLanguage,
        hasContactRequest,
        contactRequestId: contactRequestId || undefined,
        notifyStatus,
        phoneMasked: maskPhoneForLogs(data.patientPhone),
      });
    }
  }

  console.log(`Found ${rows.length} conversation(s) needing review:\n`);
  for (const r of rows) {
    console.log(
      JSON.stringify({
        clinicId: r.clinicId,
        conversationId: r.conversationId,
        status: r.status,
        updatedAt: r.updatedAt,
        language: r.language || null,
        hasContactRequest: r.hasContactRequest,
        contactRequestId: r.contactRequestId || null,
        notifyStatus: r.notifyStatus || null,
        phoneMasked: r.phoneMasked,
        action: "NOTIFY_SKIPPED_DRY_RUN",
      })
    );
  }

  console.log(
    `\nDone. Dry-run only — no emails sent. Re-run with an explicit send script after approval.`
  );
}

main().catch((err) => {
  console.error("[dry-run] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
