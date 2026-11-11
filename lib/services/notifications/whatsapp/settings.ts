/**
 * Per-clinic WhatsApp staff-notification settings.
 *
 * Stored in the server-only `clinicWhatsappSettings/{clinicId}` collection (clients are denied in
 * firestore.rules) so opt-in timestamps can only be written by the validated settings API.
 */

import type { Firestore } from "firebase-admin/firestore";
import { isValidE164, toWhatsAppRecipient } from "./templateParams";

export const WHATSAPP_SETTINGS_COLLECTION = "clinicWhatsappSettings";
export const WHATSAPP_NOTIFICATIONS_COLLECTION = "whatsappNotifications";
export const WHATSAPP_AUTO_REPLIES_COLLECTION = "whatsappAutoReplies";
export const MAX_WHATSAPP_RECIPIENTS = 5;

export interface WhatsAppRecipient {
  /** E.164, e.g. "+905321112233". */
  phone: string;
  optIn: true;
  /** ISO timestamp set by the server when the clinic confirmed this person's consent. */
  optInAt: string;
  optInBy: string;
}

export interface ClinicWhatsAppSettings {
  clinicId: string;
  enabled: boolean;
  recipients: WhatsAppRecipient[];
  /** Digits of opted-in recipients, for webhook sender lookup (array-contains). */
  recipientNumbers: string[];
  updatedAt?: string;
  updatedBy?: string;
  testSends?: { lastAt: string; day: string; count: number };
}

export type RecipientValidationError = {
  index: number;
  code: "invalid_number" | "opt_in_required" | "duplicate" | "too_many";
};

export interface RecipientInput {
  phone: unknown;
  optIn: unknown;
}

export function emptyWhatsAppSettings(clinicId: string): ClinicWhatsAppSettings {
  return { clinicId, enabled: false, recipients: [], recipientNumbers: [] };
}

/** Validates the settings form payload and stamps consent on newly opted-in numbers. */
export function buildWhatsAppSettingsUpdate(params: {
  clinicId: string;
  enabled: unknown;
  recipients: unknown;
  previous: ClinicWhatsAppSettings | null;
  actorUid: string;
  now: Date;
}): { ok: true; settings: ClinicWhatsAppSettings } | { ok: false; errors: RecipientValidationError[] } {
  const input: RecipientInput[] = Array.isArray(params.recipients) ? params.recipients : [];
  const errors: RecipientValidationError[] = [];
  if (input.length > MAX_WHATSAPP_RECIPIENTS) {
    errors.push({ index: MAX_WHATSAPP_RECIPIENTS, code: "too_many" });
  }

  const previousByPhone = new Map((params.previous?.recipients || []).map((r) => [r.phone, r]));
  const seen = new Set<string>();
  const recipients: WhatsAppRecipient[] = [];
  const nowIso = params.now.toISOString();

  input.slice(0, MAX_WHATSAPP_RECIPIENTS).forEach((entry, index) => {
    const phone = typeof entry?.phone === "string" ? entry.phone.replace(/[\s()-]/g, "") : "";
    if (!isValidE164(phone)) {
      errors.push({ index, code: "invalid_number" });
      return;
    }
    if (seen.has(phone)) {
      errors.push({ index, code: "duplicate" });
      return;
    }
    seen.add(phone);
    if (entry.optIn !== true) {
      errors.push({ index, code: "opt_in_required" });
      return;
    }
    const prior = previousByPhone.get(phone);
    recipients.push(
      prior?.optIn === true && prior.optInAt
        ? prior
        : { phone, optIn: true, optInAt: nowIso, optInBy: params.actorUid }
    );
  });

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    settings: {
      clinicId: params.clinicId,
      enabled: params.enabled === true,
      recipients,
      recipientNumbers: recipients.map((r) => toWhatsAppRecipient(r.phone)!).filter(Boolean),
      updatedAt: nowIso,
      updatedBy: params.actorUid,
      ...(params.previous?.testSends ? { testSends: params.previous.testSends } : {}),
    },
  };
}

function normalizeStored(clinicId: string, data: Record<string, unknown> | undefined): ClinicWhatsAppSettings {
  if (!data) return emptyWhatsAppSettings(clinicId);
  const recipients = (Array.isArray(data.recipients) ? data.recipients : []).filter(
    (r): r is WhatsAppRecipient =>
      !!r && typeof r === "object" && isValidE164((r as WhatsAppRecipient).phone) && (r as WhatsAppRecipient).optIn === true
  );
  return {
    clinicId,
    enabled: data.enabled === true,
    recipients,
    recipientNumbers: recipients.map((r) => toWhatsAppRecipient(r.phone)!),
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : undefined,
    updatedBy: typeof data.updatedBy === "string" ? data.updatedBy : undefined,
    testSends: data.testSends as ClinicWhatsAppSettings["testSends"],
  };
}

export async function loadWhatsAppSettings(db: Firestore, clinicId: string): Promise<ClinicWhatsAppSettings> {
  const snap = await db.collection(WHATSAPP_SETTINGS_COLLECTION).doc(clinicId).get();
  return normalizeStored(clinicId, snap.exists ? (snap.data() as Record<string, unknown>) : undefined);
}

export async function saveWhatsAppSettings(db: Firestore, settings: ClinicWhatsAppSettings): Promise<void> {
  await db.collection(WHATSAPP_SETTINGS_COLLECTION).doc(settings.clinicId).set(settings, { merge: false });
}

export const TEST_SEND_MIN_INTERVAL_MS = 60_000;
export const TEST_SEND_DAILY_LIMIT = 5;

/** Reserves one test-send slot (1 per minute, 5 per day per clinic) in a transaction. */
export async function reserveTestSend(
  db: Firestore,
  clinicId: string,
  now: Date
): Promise<{ ok: true } | { ok: false; reason: "too_soon" | "daily_limit"; retryAfterSeconds?: number }> {
  const ref = db.collection(WHATSAPP_SETTINGS_COLLECTION).doc(clinicId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = (snap.exists ? snap.data()?.testSends : undefined) as ClinicWhatsAppSettings["testSends"];
    const day = now.toISOString().slice(0, 10);
    if (current?.lastAt) {
      const elapsed = now.getTime() - new Date(current.lastAt).getTime();
      if (elapsed >= 0 && elapsed < TEST_SEND_MIN_INTERVAL_MS) {
        return { ok: false as const, reason: "too_soon" as const, retryAfterSeconds: Math.ceil((TEST_SEND_MIN_INTERVAL_MS - elapsed) / 1000) };
      }
    }
    const count = current?.day === day ? current.count : 0;
    if (count >= TEST_SEND_DAILY_LIMIT) return { ok: false as const, reason: "daily_limit" as const };
    tx.set(ref, { testSends: { lastAt: now.toISOString(), day, count: count + 1 } }, { merge: true });
    return { ok: true as const };
  });
}
