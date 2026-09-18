/**
 * Contact Request domain service — tenant-scoped persistence + clinic notify.
 * Completely separate from createAppointmentAndNotify.
 */

import { getAdminDb } from "@/lib/firebase-admin";
import { stripUndefinedDeep } from "@/lib/firestore/stripUndefined";
import { sendClinicContactRequestEmail } from "./notifications";
import type {
  ContactRequest,
  ContactRequestStatus,
  CreateContactRequestPayload,
  CreateContactRequestResult,
  PreferredContactMethod,
  UpdateContactRequestStatusResult,
} from "./types";
import { UNRESOLVED_CONTACT_REQUEST_STATUSES } from "./types";

function maskPhone(phone?: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-4)}`;
}

function collectionRef(adminDb: any, clinicId: string) {
  return adminDb.collection("clinics").doc(clinicId).collection("contactRequests");
}

async function resolveClinicSnap(adminDb: any, clinicId: string): Promise<any | null> {
  const rootSnap: any = await adminDb.collection("clinics").doc(clinicId).get();
  if (rootSnap.exists) return rootSnap;

  const agenciesSnap = await adminDb.collection("agencies").get();
  for (const agency of agenciesSnap.docs) {
    const aClinicsQuery = await adminDb
      .collection("agencies")
      .doc(agency.id)
      .collection("clinics")
      .where("clinicSlug", "==", clinicId)
      .limit(1)
      .get();
    if (!aClinicsQuery.empty) return aClinicsQuery.docs[0];

    const directSnap = await adminDb
      .collection("agencies")
      .doc(agency.id)
      .collection("clinics")
      .doc(clinicId)
      .get();
    if (directSnap.exists) return directSnap;
  }
  return null;
}

export async function findUnresolvedContactRequest(params: {
  clinicId: string;
  conversationId: string;
}): Promise<ContactRequest | null> {
  const adminDb = getAdminDb();
  if (!adminDb || !params.clinicId || !params.conversationId) return null;

  try {
    const snap = await collectionRef(adminDb, params.clinicId)
      .where("conversationId", "==", params.conversationId)
      .limit(10)
      .get();

    if (snap.empty) return null;

    const unresolved = (snap.docs as Array<{ data: () => ContactRequest }>)
      .map((d: { data: () => ContactRequest }) => d.data() as ContactRequest)
      .filter((r: ContactRequest) => UNRESOLVED_CONTACT_REQUEST_STATUSES.includes(r.status))
      .sort((a: ContactRequest, b: ContactRequest) =>
        String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt))
      );

    return unresolved[0] || null;
  } catch (e: any) {
    console.error(
      JSON.stringify({
        checkpoint: "CONTACT_REQUEST_LOOKUP_FAILED",
        clinicId: params.clinicId,
        conversationId: params.conversationId,
        error: e?.message || String(e),
      })
    );
    return null;
  }
}

export async function getContactRequest(params: {
  clinicId: string;
  contactRequestId: string;
}): Promise<ContactRequest | null> {
  const adminDb = getAdminDb();
  if (!adminDb) return null;
  const snap = await collectionRef(adminDb, params.clinicId).doc(params.contactRequestId).get();
  if (!snap.exists) return null;
  return snap.data() as ContactRequest;
}

async function sendClinicNewContactRequestNotification(
  request: ContactRequest
): Promise<{ status: string }> {
  const adminDb = getAdminDb();
  if (!adminDb || !request.clinicId) return { status: "FAILED" };

  const clinicSnap = await resolveClinicSnap(adminDb, request.clinicId);
  if (!clinicSnap || !clinicSnap.exists) {
    console.error(
      JSON.stringify({
        checkpoint: "CONTACT_REQUEST_CLINIC_NOT_FOUND",
        clinicId: request.clinicId,
        contactRequestId: request.id,
      })
    );
    return { status: "FAILED" };
  }

  const clinicData = clinicSnap.data()!;
  const clinicName = clinicData.clinicName || clinicData.name || "Klinik";
  const ns = clinicData.notificationSettings || {};
  // Prefer dedicated toggle when present; otherwise follow appointment email enablement.
  const clinicEmailEnabled =
    ns.clinic?.newContactRequestEmailEnabled ??
    ns.clinic?.newAppointmentEmailEnabled ??
    true;

  const rawRecipients: string[] = [...(ns.clinic?.recipientEmails || [])];
  if (rawRecipients.length === 0) {
    if (clinicData.notificationEmail) rawRecipients.push(clinicData.notificationEmail);
    if (clinicData.email) rawRecipients.push(clinicData.email);
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const uniqueRecipients = Array.from(
    new Set(
      rawRecipients
        .map((e) => (e || "").trim().toLowerCase())
        .filter(
          (e) =>
            e &&
            emailRegex.test(e) &&
            e !== "ornek@klinik.com" &&
            e !== "ornek@clinic.com"
        )
    )
  );

  if (!clinicEmailEnabled || uniqueRecipients.length === 0) {
    return { status: "DISABLED" };
  }

  try {
    const result = await sendClinicContactRequestEmail({
      clinicId: request.clinicId,
      clinicName,
      clinicEmails: uniqueRecipients,
      request,
    });
    return { status: result.success ? "SENT" : "FAILED" };
  } catch (e: any) {
    console.error(
      JSON.stringify({
        checkpoint: "CONTACT_REQUEST_NOTIFY_EXCEPTION",
        clinicId: request.clinicId,
        contactRequestId: request.id,
        error: e?.message || String(e),
      })
    );
    return { status: "FAILED" };
  }
}

function isSuccessfullyNotified(status?: string): boolean {
  const s = String(status || "").toLowerCase();
  return s === "sent" || s === "disabled" || s === "skipped_duplicate";
}

async function applyContactRequestUpdates(
  col: any,
  existing: ContactRequest,
  payload: CreateContactRequestPayload
): Promise<ContactRequest> {
  const now = new Date().toISOString();
  const updates: Partial<ContactRequest> = {
    preferredContactMethod: payload.preferredContactMethod,
    updatedAt: now,
    // Keep key aligned with latest contact details so retries stay sticky.
    idempotencyKey: payload.idempotencyKey,
  };
  if (payload.patientName) updates.patientName = payload.patientName;
  if (payload.patientPhone) updates.patientPhone = payload.patientPhone;
  if (payload.patientEmail) updates.patientEmail = payload.patientEmail;
  if (payload.patientNote) updates.patientNote = payload.patientNote;
  if (payload.language) updates.language = payload.language;

  await col.doc(existing.id).set(stripUndefinedDeep(updates), { merge: true });
  return { ...existing, ...updates };
}

async function finalizeOpenContactRequestNotify(
  col: any,
  record: ContactRequest,
  opts: { preferSkipIfAlreadyNotified: boolean }
): Promise<CreateContactRequestResult> {
  // Already delivered or intentionally disabled → do not re-email.
  if (opts.preferSkipIfAlreadyNotified && isSuccessfullyNotified(record.clinicNotificationStatus)) {
    return {
      success: true,
      contactRequestId: record.id,
      record,
      isDuplicate: true,
      clinicNotificationStatus: "SKIPPED_DUPLICATE",
    };
  }

  // Retry when prior notify failed / missing. Patient success still requires notifyOk.
  const notify = await sendClinicNewContactRequestNotification(record);
  await col.doc(record.id).set(
    {
      clinicNotificationStatus: notify.status.toLowerCase(),
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  const notifyOk = notify.status === "SENT" || notify.status === "DISABLED";
  return {
    success: notifyOk,
    contactRequestId: record.id,
    record: { ...record, clinicNotificationStatus: notify.status.toLowerCase() },
    isDuplicate: true,
    clinicNotificationStatus: notify.status,
    reason: notifyOk ? undefined : "NOTIFICATION_FAILED",
    code: notifyOk ? undefined : "NOTIFICATION_FAILED",
  };
}

/**
 * Create (or return existing) Contact Request and notify clinic.
 * Idempotent by idempotencyKey and by unresolved conversation request.
 */
export async function createContactRequestAndNotify(
  payload: CreateContactRequestPayload
): Promise<CreateContactRequestResult> {
  const adminDb = getAdminDb();
  if (!adminDb) {
    return { success: false, code: "DB_UNAVAILABLE", reason: "Admin DB not initialized" };
  }

  if (!payload.clinicId || !payload.conversationId || !payload.idempotencyKey) {
    return { success: false, code: "INVALID_PAYLOAD", reason: "Missing required fields" };
  }

  const col = collectionRef(adminDb, payload.clinicId);

  try {
    // 1) Exact idempotency key — only reuse OPEN matches.
    // Resolved/cancelled historical rows with the same key must not block a new request.
    const idempSnap = await col.where("idempotencyKey", "==", payload.idempotencyKey).limit(5).get();
    if (!idempSnap.empty) {
      const matches = idempSnap.docs.map((d: { data: () => ContactRequest }) => d.data() as ContactRequest);
      const openByKey = matches.find((r: ContactRequest) =>
        UNRESOLVED_CONTACT_REQUEST_STATUSES.includes(r.status)
      );

      if (openByKey) {
        console.log(
          JSON.stringify({
            checkpoint: "CONTACT_REQUEST_IDEMPOTENCY_HIT",
            clinicId: payload.clinicId,
            conversationId: payload.conversationId,
            contactRequestId: openByKey.id,
            phoneMasked: maskPhone(openByKey.patientPhone),
            notificationStatus: openByKey.clinicNotificationStatus || null,
          })
        );

        const mergedOpen = await applyContactRequestUpdates(col, openByKey, payload);
        return finalizeOpenContactRequestNotify(col, mergedOpen, {
          preferSkipIfAlreadyNotified: true,
        });
      }
      // Closed-only key matches → fall through and create a new pending request.
    }

    // 2) Unresolved request for same conversation → update details/preference; notify once
    const unresolved = await findUnresolvedContactRequest({
      clinicId: payload.clinicId,
      conversationId: payload.conversationId,
    });

    if (unresolved) {
      const merged = await applyContactRequestUpdates(col, unresolved, payload);
      return finalizeOpenContactRequestNotify(col, merged, {
        preferSkipIfAlreadyNotified: true,
      });
    }

    const now = new Date().toISOString();
    const ref = col.doc();
    const record: ContactRequest = stripUndefinedDeep({
      id: ref.id,
      clinicId: payload.clinicId,
      conversationId: payload.conversationId,
      patientName: payload.patientName,
      patientPhone: payload.patientPhone,
      patientEmail: payload.patientEmail,
      preferredContactMethod: payload.preferredContactMethod,
      patientNote: payload.patientNote,
      language: payload.language || "en",
      channel: payload.channel || "web_widget",
      source: payload.source || "AI Assistant",
      status: "pending",
      idempotencyKey: payload.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    }) as ContactRequest;

    await ref.set(record);

    // In-app clinic notification (no PII in console beyond masked)
    try {
      await adminDb.collection("clinics").doc(payload.clinicId).collection("notifications").add({
        type: "contact_request",
        title: "New patient contact request",
        message: `Contact request (${record.preferredContactMethod}) for conversation ${payload.conversationId}`,
        contactRequestId: record.id,
        conversationId: payload.conversationId,
        read: false,
        createdAt: now,
      });
    } catch {
      // non-fatal
    }

    console.log(
      JSON.stringify({
        checkpoint: "CONTACT_REQUEST_CREATED",
        clinicId: payload.clinicId,
        conversationId: payload.conversationId,
        contactRequestId: record.id,
        preferredContactMethod: record.preferredContactMethod,
        channel: record.channel,
        phoneMasked: maskPhone(record.patientPhone),
      })
    );

    const notify = await sendClinicNewContactRequestNotification(record);
    await ref.set(
      {
        clinicNotificationStatus: notify.status.toLowerCase(),
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    const notifyOk = notify.status === "SENT" || notify.status === "DISABLED";
    if (!notifyOk) {
      return {
        success: false,
        contactRequestId: record.id,
        record: { ...record, clinicNotificationStatus: notify.status.toLowerCase() },
        clinicNotificationStatus: notify.status,
        reason: "NOTIFICATION_FAILED",
        code: "NOTIFICATION_FAILED",
      };
    }

    return {
      success: true,
      contactRequestId: record.id,
      record: { ...record, clinicNotificationStatus: notify.status.toLowerCase() },
      isDuplicate: false,
      clinicNotificationStatus: notify.status,
    };
  } catch (e: any) {
    console.error(
      JSON.stringify({
        checkpoint: "CONTACT_REQUEST_CREATE_FAILED",
        clinicId: payload.clinicId,
        conversationId: payload.conversationId,
        error: e?.message || String(e),
      })
    );
    return {
      success: false,
      code: "PERSISTENCE_FAILED",
      reason: e?.message || "PERSISTENCE_FAILED",
    };
  }
}

export async function updateContactRequestPreference(params: {
  clinicId: string;
  contactRequestId: string;
  preferredContactMethod: PreferredContactMethod;
  patientNote?: string;
  patientPhone?: string;
  patientEmail?: string;
  patientName?: string;
}): Promise<UpdateContactRequestStatusResult> {
  const adminDb = getAdminDb();
  if (!adminDb) return { success: false, reason: "DB_UNAVAILABLE" };

  const ref = collectionRef(adminDb, params.clinicId).doc(params.contactRequestId);
  const snap = await ref.get();
  if (!snap.exists) return { success: false, reason: "NOT_FOUND" };

  const existing = snap.data() as ContactRequest;
  if (existing.clinicId !== params.clinicId) {
    return { success: false, reason: "TENANT_MISMATCH" };
  }

  const now = new Date().toISOString();
  const updates = stripUndefinedDeep({
    preferredContactMethod: params.preferredContactMethod,
    patientNote: params.patientNote,
    patientPhone: params.patientPhone,
    patientEmail: params.patientEmail,
    patientName: params.patientName,
    updatedAt: now,
  });

  await ref.set(updates, { merge: true });
  return { success: true, record: { ...existing, ...updates } as ContactRequest };
}

export async function updateContactRequestStatus(params: {
  clinicId: string;
  contactRequestId: string;
  status: ContactRequestStatus;
  actorUserId?: string;
}): Promise<UpdateContactRequestStatusResult> {
  const adminDb = getAdminDb();
  if (!adminDb) return { success: false, reason: "DB_UNAVAILABLE" };

  const allowed: ContactRequestStatus[] = [
    "pending",
    "acknowledged",
    "contacted",
    "resolved",
    "cancelled",
  ];
  if (!allowed.includes(params.status)) {
    return { success: false, reason: "INVALID_STATUS" };
  }

  const ref = collectionRef(adminDb, params.clinicId).doc(params.contactRequestId);
  const snap = await ref.get();
  if (!snap.exists) return { success: false, reason: "NOT_FOUND" };

  const existing = snap.data() as ContactRequest;
  if (existing.clinicId !== params.clinicId) {
    return { success: false, reason: "TENANT_MISMATCH" };
  }

  const now = new Date().toISOString();
  const updates: Record<string, any> = {
    status: params.status,
    updatedAt: now,
  };
  if (params.actorUserId) updates.lastStatusChangedBy = params.actorUserId;
  if (params.status === "acknowledged") updates.acknowledgedAt = now;
  if (params.status === "contacted") updates.contactedAt = now;
  if (params.status === "resolved") updates.resolvedAt = now;
  if (params.status === "cancelled") updates.cancelledAt = now;

  await ref.set(updates, { merge: true });
  return { success: true, record: { ...existing, ...updates } as ContactRequest };
}

export async function cancelUnresolvedContactRequest(params: {
  clinicId: string;
  conversationId: string;
}): Promise<{ cancelled: boolean; contactRequestId?: string }> {
  const existing = await findUnresolvedContactRequest(params);
  if (!existing) return { cancelled: false };

  const result = await updateContactRequestStatus({
    clinicId: params.clinicId,
    contactRequestId: existing.id,
    status: "cancelled",
  });

  return {
    cancelled: Boolean(result.success),
    contactRequestId: existing.id,
  };
}

/** Stable idempotency key for a conversation-scoped contact request. */
export function buildContactRequestIdempotencyKey(params: {
  conversationId: string;
  preferredContactMethod: PreferredContactMethod;
  patientPhone?: string;
  patientEmail?: string;
}): string {
  const phone = (params.patientPhone || "").replace(/\D/g, "").slice(-10) || "nophone";
  const email = (params.patientEmail || "").trim().toLowerCase() || "noemail";
  // One open request per conversation — method amendments update the same key base
  return `cr:${params.conversationId}:${phone}:${email}`;
}
