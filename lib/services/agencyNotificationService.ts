import { getAdminDb } from "@/lib/firebase-admin";
import { Resend } from "resend";
import {
  AGENCY_LEAD_NOTIFICATION_EVENT,
  buildAgencyLeadNotificationJobId,
  buildAgencyQuoteNotificationContent,
  buildQuoteRequestPortalUrl,
  computeNextRetryAt,
  isRetryableNotificationJob,
  pickOfficialClinicName,
  resolveQuoteNotificationDelivery,
  type AgencyNotificationStatus,
  type QuoteNotificationDelivery,
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

export async function resolveAgencyQuoteNotificationDelivery(
  agencyId: string
): Promise<QuoteNotificationDelivery> {
  const adminDb = getAdminDb();
  if (!adminDb) {
    return {
      enabled: true,
      recipients: [],
      cc: [],
      source: null,
      outcome: "config_missing",
      configError: "DB_UNAVAILABLE",
    };
  }

  const agencySnap = await adminDb.collection("agencies").doc(agencyId).get();
  if (!agencySnap.exists) {
    return {
      enabled: true,
      recipients: [],
      cc: [],
      source: null,
      outcome: "config_missing",
      configError: "AGENCY_NOT_FOUND",
    };
  }
  const agencyData = agencySnap.data()!;

  const settingsSnap = await adminDb
    .collection("agencies")
    .doc(agencyId)
    .collection("config")
    .doc("settings")
    .get();
  const configSettings = settingsSnap.exists ? settingsSnap.data() || {} : {};

  return resolveQuoteNotificationDelivery({
    quoteNotificationSettings:
      configSettings.quoteNotificationSettings ||
      agencyData.settings?.quoteNotificationSettings,
    quoteNotificationEmails:
      configSettings.quoteNotificationEmails ||
      agencyData.settings?.quoteNotificationEmails ||
      agencyData.quoteNotificationEmails,
    notificationEmail:
      configSettings.notificationEmail || agencyData.settings?.notificationEmail,
  });
}

/** @deprecated Prefer resolveAgencyQuoteNotificationDelivery */
export async function resolveAgencyLeadNotificationRecipients(agencyId: string): Promise<{
  recipients: string[];
  source: string | null;
  configError?: string;
  cc?: string[];
  replyTo?: string;
  outcome?: QuoteNotificationDelivery["outcome"];
  enabled?: boolean;
}> {
  const delivery = await resolveAgencyQuoteNotificationDelivery(agencyId);
  return {
    recipients: delivery.recipients,
    source: delivery.source,
    configError: delivery.configError,
    cc: delivery.cc,
    replyTo: delivery.replyTo,
    outcome: delivery.outcome,
    enabled: delivery.enabled,
  };
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

    const delivery = await resolveAgencyQuoteNotificationDelivery(agencyId);

    if (delivery.outcome === "disabled") {
      logSafe("skipped_disabled", {
        agencyId,
        quoteRequestId: leadId,
        notificationStatus: "skipped",
        attemptNumber,
        providerErrorCode: "NOTIFICATIONS_DISABLED",
      });
      await jobRef.update({
        status: "skipped",
        lastErrorCode: "NOTIFICATIONS_DISABLED",
        attemptCount: attemptNumber,
        nextAttemptAt: null,
        updatedAt: new Date().toISOString(),
      });
      await updateLeadNotificationState(agencyId, leadId, {
        notificationStatus: "skipped",
        notificationAttempts: attemptNumber,
        lastNotificationAttemptAt: now,
        notificationErrorCode: "NOTIFICATIONS_DISABLED",
        notificationErrorMessage: "Quote notifications disabled in agency settings",
        nextRetryAt: null,
      });
      return;
    }

    if (delivery.outcome === "config_missing" || delivery.recipients.length === 0) {
      const errorCode = delivery.configError || "NO_RECIPIENTS_CONFIGURED";
      logSafe("config_missing", {
        agencyId,
        quoteRequestId: leadId,
        jobId,
        notificationStatus: "config_missing",
        attemptNumber,
        providerErrorCode: errorCode,
      });
      await jobRef.update({
        status: "config_missing",
        lastErrorCode: errorCode,
        failedAt: new Date().toISOString(),
        attemptCount: attemptNumber,
        nextAttemptAt: null,
        updatedAt: new Date().toISOString(),
      });
      await updateLeadNotificationState(agencyId, leadId, {
        notificationStatus: "config_missing",
        notificationAttempts: attemptNumber,
        lastNotificationAttemptAt: now,
        notificationErrorCode: errorCode,
        notificationErrorMessage: "Quote notifications enabled but no recipients configured",
        nextRetryAt: null,
      });
      return;
    }

    const recipients = delivery.recipients;

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
      recipientSource: delivery.source,
      recipientCount: recipients.length,
    });

    if (!process.env.RESEND_API_KEY) {
      console.warn("[agencyNotificationService] RESEND_API_KEY missing. Marking as failed for retry.");
      throw new Error("RESEND_API_KEY_MISSING");
    }

    const result = await resend.emails.send({
      from: "ClinicBridge AI <noreply@clinicbridge-ai.com>",
      to: recipients,
      ...(delivery.cc.length > 0 ? { cc: delivery.cc } : {}),
      ...(delivery.replyTo ? { replyTo: delivery.replyTo } : {}),
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
      ccSnapshot: delivery.cc,
      replyToSnapshot: delivery.replyTo || null,
      recipientSource: delivery.source,
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

/**
 * Sends a non-patient test email using the agency's saved quoteNotificationSettings.
 * Does not create a quote request or notification job.
 */
export async function sendTestQuoteNotificationEmail(agencyId: string): Promise<{
  ok: boolean;
  errorCode?: string;
  message: string;
  recipientCount?: number;
}> {
  const delivery = await resolveAgencyQuoteNotificationDelivery(agencyId);

  if (delivery.outcome === "disabled") {
    return {
      ok: false,
      errorCode: "NOTIFICATIONS_DISABLED",
      message: "Quote notifications are disabled. Enable them before sending a test email.",
    };
  }

  if (delivery.outcome === "config_missing" || delivery.recipients.length === 0) {
    return {
      ok: false,
      errorCode: "NO_RECIPIENTS_CONFIGURED",
      message: "No valid recipients configured. Add at least one recipient and save settings.",
    };
  }

  if (!process.env.RESEND_API_KEY) {
    return {
      ok: false,
      errorCode: "RESEND_API_KEY_MISSING",
      message: "Email provider is not configured.",
    };
  }

  const subject = "ClinicBridge – Teklif Talebi Bildirim Testi";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; color: #1e293b; line-height: 1.6;">
      <h2 style="color: #0d9488;">Test e-postası</h2>
      <p>Bu mesaj Agency Portal → Teklif Talebi Bildirimleri ayarlarından gönderilen bir test e-postasıdır.</p>
      <p>Gerçek bir hasta teklif talebi oluşturulmamıştır.</p>
      <p style="font-size: 12px; color: #64748b;">Agency ID: ${agencyId}</p>
    </div>`;
  const text =
    "ClinicBridge test e-postası. Gerçek bir hasta teklif talebi oluşturulmamıştır.\nAgency ID: " +
    agencyId;

  try {
    const result = await resend.emails.send({
      from: "ClinicBridge AI <noreply@clinicbridge-ai.com>",
      to: delivery.recipients,
      ...(delivery.cc.length > 0 ? { cc: delivery.cc } : {}),
      ...(delivery.replyTo ? { replyTo: delivery.replyTo } : {}),
      subject,
      html,
      text,
    });

    if (result.error) {
      logSafe("test_email_failed", {
        agencyId,
        notificationStatus: "failed",
        providerErrorCode: result.error.message || "RESEND_SEND_ERROR",
        recipientCount: delivery.recipients.length,
      });
      return {
        ok: false,
        errorCode: "RESEND_SEND_ERROR",
        message: result.error.message || "Failed to send test email.",
      };
    }

    logSafe("test_email_sent", {
      agencyId,
      notificationStatus: "sent",
      recipientCount: delivery.recipients.length,
      providerErrorCode: null,
    });

    return {
      ok: true,
      message: "Test email sent successfully.",
      recipientCount: delivery.recipients.length,
    };
  } catch (err) {
    const code = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    logSafe("test_email_failed", {
      agencyId,
      notificationStatus: "failed",
      providerErrorCode: code,
    });
    return {
      ok: false,
      errorCode: "SEND_FAILED",
      message: "Failed to send test email.",
    };
  }
}
