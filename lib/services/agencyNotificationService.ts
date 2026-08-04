import { getAdminDb } from "@/lib/firebase-admin";
import { Resend } from "resend";
import {
  AGENCY_LEAD_NOTIFICATION_EVENT,
  buildAgencyLeadNotificationJobId,
  buildAgencyQuoteNotificationContent,
  buildQuoteRequestPortalUrl,
  collectQuoteNotificationRecipients,
  computeNextRetryAt,
  isRetryableNotificationJob,
  pickOfficialClinicName,
  type AgencyNotificationStatus,
} from "@/lib/services/agencyQuoteNotificationContent";

const resend = new Resend(process.env.RESEND_API_KEY || "fallback_key");

function logSafe(event: string, payload: Record<string, unknown>) {
  console.log(`[agencyNotificationService] ${event}`, payload);
}

async function updateLeadNotificationState(
  agencyId: string,
  leadId: string,
  patch: {
    notificationStatus: AgencyNotificationStatus;
    notificationAttempts?: number;
    lastNotificationAttemptAt?: string;
    notificationSentAt?: string | null;
    notificationErrorCode?: string | null;
    notificationErrorMessage?: string | null;
    nextRetryAt?: string | null;
  }
) {
  const adminDb = getAdminDb();
  if (!adminDb) return;
  try {
    await adminDb.collection("agencies").doc(agencyId).collection("leads").doc(leadId).set(
      {
        notificationStatus: patch.notificationStatus,
        notificationAttempts: patch.notificationAttempts ?? 0,
        lastNotificationAttemptAt: patch.lastNotificationAttemptAt || null,
        notificationSentAt: patch.notificationSentAt ?? null,
        notificationErrorCode: patch.notificationErrorCode ?? null,
        notificationErrorMessage: patch.notificationErrorMessage ?? null,
        nextRetryAt: patch.nextRetryAt ?? null,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  } catch (err) {
    console.error("[agencyNotificationService] Failed to persist lead notification state", {
      agencyId,
      leadId,
      error: err instanceof Error ? err.message : "unknown",
    });
  }
}

export async function scheduleAndProcessAgencyLeadNotification(agencyId: string, leadId: string) {
  const adminDb = getAdminDb();
  if (!adminDb) return;

  const eventType = AGENCY_LEAD_NOTIFICATION_EVENT;
  const channel = "email";
  const jobId = buildAgencyLeadNotificationJobId(leadId);
  const jobRef = adminDb.collection("agencies").doc(agencyId).collection("notification_jobs").doc(jobId);

  try {
    const jobResult = await adminDb.runTransaction(async (t: any) => {
      const doc = await t.get(jobRef);
      if (doc.exists) {
        const data = doc.data()!;
        if (data.status === "sent" || data.status === "processing") {
          return { skip: true, reason: data.status };
        }
        if (isRetryableNotificationJob(data)) {
          t.update(jobRef, {
            status: "retrying",
            updatedAt: new Date().toISOString(),
          });
          return { skip: false, jobData: { ...data, status: "retrying" } };
        }
        return { skip: true, reason: data.status === "failed" ? "max_attempts_reached" : data.status };
      }

      const jobData = {
        id: jobId,
        agencyId,
        leadId,
        eventType,
        channel,
        notificationType: eventType,
        idempotencyKey: `${leadId}:${eventType}`,
        templateKey: "agency_new_quote_request",
        status: "pending",
        attemptCount: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      t.set(jobRef, jobData);
      return { skip: false, jobData };
    });

    if (jobResult.skip) {
      logSafe("skip_job", { agencyId, leadId, jobId, reason: jobResult.reason });
      return;
    }

    await updateLeadNotificationState(agencyId, leadId, {
      notificationStatus: jobResult.jobData?.status === "retrying" ? "retrying" : "pending",
      notificationAttempts: jobResult.jobData?.attemptCount || 0,
    });

    await processAgencyNotificationJob(agencyId, jobId);
  } catch (error) {
    console.error(`[agencyNotificationService] Error scheduling job ${jobId}:`, error);
    await updateLeadNotificationState(agencyId, leadId, {
      notificationStatus: "failed",
      notificationErrorCode: "SCHEDULE_ERROR",
      notificationErrorMessage: error instanceof Error ? error.message : "unknown",
    });
  }
}

export async function resolveAgencyLeadNotificationRecipients(agencyId: string): Promise<{
  recipients: string[];
  source: string | null;
  configError?: string;
}> {
  const adminDb = getAdminDb();
  if (!adminDb) return { recipients: [], source: null, configError: "DB_UNAVAILABLE" };

  const agencySnap = await adminDb.collection("agencies").doc(agencyId).get();
  if (!agencySnap.exists) return { recipients: [], source: null, configError: "AGENCY_NOT_FOUND" };
  const agencyData = agencySnap.data()!;

  const settingsSnap = await adminDb.collection("agencies").doc(agencyId).collection("config").doc("settings").get();
  const configSettings = settingsSnap.exists ? settingsSnap.data() || {} : {};

  const usersSnap = await adminDb
    .collection("users")
    .where("agencyId", "==", agencyId)
    .where("role", "==", "admin")
    .where("status", "==", "active")
    .get();
  const adminEmails = usersSnap.docs.map((d) => d.data().email).filter(Boolean);

  return collectQuoteNotificationRecipients({
    quoteNotificationEmails:
      configSettings.quoteNotificationEmails ||
      agencyData.settings?.quoteNotificationEmails ||
      agencyData.quoteNotificationEmails,
    notificationEmail:
      configSettings.notificationEmail || agencyData.settings?.notificationEmail,
    ownerEmail: agencyData.ownerEmail,
    agencyEmail: agencyData.email || agencyData.contactEmail,
    adminEmails,
  });
}

async function resolveOfficialClinicNames(
  agencyId: string,
  clinicIds: string[]
): Promise<string[]> {
  const adminDb = getAdminDb();
  if (!adminDb || clinicIds.length === 0) return [];

  const names: string[] = [];
  for (const clinicId of clinicIds) {
    // Canonical agency clinic records first
    const agencyClinic = await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("clinics")
      .doc(clinicId)
      .get();
    if (agencyClinic.exists) {
      names.push(pickOfficialClinicName(agencyClinic.data(), clinicId));
      continue;
    }
    // Fallback to top-level clinics collection
    const topClinic = await adminDb.collection("clinics").doc(clinicId).get();
    names.push(pickOfficialClinicName(topClinic.exists ? topClinic.data() : null, clinicId));
  }
  return names;
}

export async function processAgencyNotificationJob(agencyId: string, jobId: string) {
  const adminDb = getAdminDb();
  if (!adminDb) return;

  const jobRef = adminDb.collection("agencies").doc(agencyId).collection("notification_jobs").doc(jobId);
  const now = new Date().toISOString();

  const jobSnapBefore = await jobRef.get();
  if (!jobSnapBefore.exists) return;
  const existing = jobSnapBefore.data()!;
  if (existing.status === "sent") {
    logSafe("already_sent", { agencyId, leadId: existing.leadId, jobId });
    return;
  }

  await jobRef.update({
    status: "processing",
    updatedAt: now,
    lastAttemptAt: now,
  });

  try {
    const jobSnap = await jobRef.get();
    const jobData = jobSnap.data()!;
    const leadId = jobData.leadId as string;
    const attemptNumber = Number(jobData.attemptCount || 0) + 1;

    await updateLeadNotificationState(agencyId, leadId, {
      notificationStatus: "retrying",
      notificationAttempts: attemptNumber,
      lastNotificationAttemptAt: now,
    });

    const recipientResult = await resolveAgencyLeadNotificationRecipients(agencyId);
    const recipients = recipientResult.recipients;
    if (recipients.length === 0) {
      const errorCode = recipientResult.configError || "NO_RECIPIENTS_FOUND";
      logSafe("config_error", {
        agencyId,
        leadId,
        jobId,
        notificationStatus: "failed",
        attemptNumber,
        providerErrorCode: errorCode,
      });
      await jobRef.update({
        status: "failed",
        lastErrorCode: errorCode,
        failedAt: new Date().toISOString(),
        attemptCount: attemptNumber,
        nextAttemptAt: null,
        updatedAt: new Date().toISOString(),
      });
      await updateLeadNotificationState(agencyId, leadId, {
        notificationStatus: "failed",
        notificationAttempts: attemptNumber,
        lastNotificationAttemptAt: now,
        notificationErrorCode: errorCode,
        notificationErrorMessage: "No valid quote notification recipients configured",
        nextRetryAt: null,
      });
      return;
    }

    const leadSnap = await adminDb.collection("agencies").doc(agencyId).collection("leads").doc(leadId).get();
    if (!leadSnap.exists) throw new Error("LEAD_NOT_FOUND");
    const lead = leadSnap.data()!;

    const crSnap = await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("clinic_requests")
      .where("leadId", "==", leadId)
      .get();
    const clinicIdsFromRequests = crSnap.docs.map((d) => d.data().clinicId).filter(Boolean);
    const selectedClinicIds: string[] = Array.from(
      new Set([...(lead.clinicIds || []), ...clinicIdsFromRequests].filter(Boolean))
    );

    const clinicNames = await resolveOfficialClinicNames(agencyId, selectedClinicIds);

    const agencySnap = await adminDb.collection("agencies").doc(agencyId).get();
    const agencyLocale = agencySnap.data()?.settings?.defaultLocale || lead.language || "tr";
    const lang = String(agencyLocale).toLowerCase().startsWith("en") ? "en" : "tr";

    const portalUrl = buildQuoteRequestPortalUrl(agencyId, leadId);
    const content = buildAgencyQuoteNotificationContent({
      lang,
      patientName: lead.patientName,
      patientEmail: lead.patientEmail,
      patientPhone: lead.patientPhone,
      patientCountry: lead.country,
      treatmentLabel: lead.treatmentCategory,
      preferredCity: lead.selectedCity || lead.preferredCity || lead.city,
      istanbulSide: lead.istanbul_side || lead.istanbulSide,
      travelDate: lead.travelDate,
      clinicNames,
      quoteRequestId: leadId,
      conversationId: lead.conversationId,
      portalUrl,
      createdAt: lead.createdAt || lead.submittedAt,
      status: lead.status || "requested",
    });

    logSafe("sending", {
      agencyId,
      quoteRequestId: leadId,
      conversationId: lead.conversationId || null,
      selectedClinicIds,
      notificationStatus: "retrying",
      attemptNumber,
      recipientSource: recipientResult.source,
      recipientCount: recipients.length,
    });

    if (!process.env.RESEND_API_KEY) {
      console.warn("[agencyNotificationService] RESEND_API_KEY missing. Marking as failed for retry.");
      throw new Error("RESEND_API_KEY_MISSING");
    }

    const result = await resend.emails.send({
      from: "ClinicBridge AI <noreply@clinicbridge-ai.com>",
      to: recipients,
      subject: content.subject,
      html: content.html,
      text: content.text,
    });

    if (result.error) {
      throw new Error(result.error.message || "RESEND_SEND_ERROR");
    }

    await jobRef.update({
      status: "sent",
      sentAt: new Date().toISOString(),
      attemptCount: attemptNumber,
      recipientSnapshot: recipients,
      recipientSource: recipientResult.source,
      providerMessageId: result.data?.id || null,
      updatedAt: new Date().toISOString(),
      lastErrorCode: null,
      nextAttemptAt: null,
    });

    await updateLeadNotificationState(agencyId, leadId, {
      notificationStatus: "sent",
      notificationAttempts: attemptNumber,
      lastNotificationAttemptAt: now,
      notificationSentAt: new Date().toISOString(),
      notificationErrorCode: null,
      notificationErrorMessage: null,
      nextRetryAt: null,
    });

    logSafe("sent", {
      agencyId,
      quoteRequestId: leadId,
      conversationId: lead.conversationId || null,
      selectedClinicIds,
      notificationStatus: "sent",
      attemptNumber,
      providerErrorCode: null,
    });
  } catch (err: any) {
    const providerErrorCode = err?.message || "UNKNOWN_ERROR";
    console.error(`[agencyNotificationService] Error processing job ${jobId}:`, {
      agencyId,
      jobId,
      providerErrorCode,
    });

    const jobSnap = await jobRef.get();
    const data = jobSnap.data()!;
    const leadId = data.leadId as string;
    const newAttemptCount = Number(data.attemptCount || 0) + 1;
    const maxAttempts = Number(data.maxAttempts || 3);
    const nextRetryAt =
      newAttemptCount >= maxAttempts ? null : computeNextRetryAt(newAttemptCount);

    await jobRef.update({
      status: "failed",
      lastErrorCode: providerErrorCode,
      failedAt: new Date().toISOString(),
      attemptCount: newAttemptCount,
      nextAttemptAt: nextRetryAt,
      updatedAt: new Date().toISOString(),
    });

    await updateLeadNotificationState(agencyId, leadId, {
      notificationStatus: "failed",
      notificationAttempts: newAttemptCount,
      lastNotificationAttemptAt: now,
      notificationErrorCode: providerErrorCode,
      notificationErrorMessage: "Email delivery failed",
      nextRetryAt,
    });

    logSafe("failed", {
      agencyId,
      quoteRequestId: leadId,
      conversationId: null,
      selectedClinicIds: [],
      notificationStatus: "failed",
      attemptNumber: newAttemptCount,
      providerErrorCode,
    });
  }
}

/**
 * Retry failed/pending agency lead notification jobs that are due.
 * Reuses the existing notification_jobs collection (no second queue).
 */
export async function retryDueAgencyLeadNotifications(options?: {
  agencyId?: string;
  limit?: number;
}): Promise<{ scanned: number; retried: number; skipped: number }> {
  const adminDb = getAdminDb();
  if (!adminDb) return { scanned: 0, retried: 0, skipped: 0 };

  const limit = options?.limit ?? 25;
  let scanned = 0;
  let retried = 0;
  let skipped = 0;
  const nowMs = Date.now();

  const agencyIds: string[] = [];
  if (options?.agencyId) {
    agencyIds.push(options.agencyId);
  } else {
    const agencies = await adminDb.collection("agencies").where("status", "==", "active").limit(50).get();
    agencies.docs.forEach((d) => agencyIds.push(d.id));
  }

  for (const agencyId of agencyIds) {
    const jobsSnap = await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("notification_jobs")
      .where("eventType", "==", AGENCY_LEAD_NOTIFICATION_EVENT)
      .limit(Math.max(limit * 3, 50))
      .get();

    for (const doc of jobsSnap.docs) {
      const job = doc.data();
      if (!["failed", "pending", "retrying"].includes(String(job.status || ""))) {
        continue;
      }
      scanned += 1;
      if (!isRetryableNotificationJob(job, nowMs)) {
        skipped += 1;
        continue;
      }
      await scheduleAndProcessAgencyLeadNotification(agencyId, job.leadId);
      retried += 1;
      if (retried >= limit) break;
    }
  }

  logSafe("retry_batch", { scanned, retried, skipped, agencyCount: agencyIds.length });
  return { scanned, retried, skipped };
}
