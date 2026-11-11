/**
 * Meta WhatsApp Cloud API webhook helpers: signature check, status updates, staff auto-reply.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { Firestore } from "firebase-admin/firestore";
import {
  getPanelBaseUrl,
  getWhatsAppSendConfig,
  getWhatsAppWebhookSecrets,
} from "./config";
import { resolveTemplateLanguage, toWhatsAppRecipient } from "./templateParams";
import {
  WHATSAPP_AUTO_REPLIES_COLLECTION,
  WHATSAPP_NOTIFICATIONS_COLLECTION,
  WHATSAPP_SETTINGS_COLLECTION,
} from "./settings";

export const AUTO_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

type Env = Record<string, string | undefined>;

export function verifyWhatsAppWebhookChallenge(params: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
  env?: Env;
}): { ok: true; challenge: string } | { ok: false; reason: "forbidden" | "bad_request" } {
  const { verifyToken } = getWhatsAppWebhookSecrets(params.env);
  if (!params.mode || !params.token || params.challenge == null) return { ok: false, reason: "bad_request" };
  if (params.mode !== "subscribe" || !verifyToken || params.token !== verifyToken) {
    return { ok: false, reason: "forbidden" };
  }
  return { ok: true, challenge: params.challenge };
}

/** Constant-time compare of X-Hub-Signature-256 against HMAC-SHA256 of the raw body. */
export function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null, env?: Env): boolean {
  const { appSecret } = getWhatsAppWebhookSecrets(env);
  if (!appSecret || !signatureHeader) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type WhatsAppWebhookStatus = "sent" | "delivered" | "read" | "failed";

export function normalizeWebhookStatus(raw: unknown): WhatsAppWebhookStatus | null {
  if (raw === "sent" || raw === "delivered" || raw === "read" || raw === "failed") return raw;
  return null;
}

export async function applyWhatsAppStatusUpdate(
  db: Firestore,
  params: {
    messageId: string;
    status: WhatsAppWebhookStatus;
    timestamp?: string;
    errorCode?: number;
    now?: Date;
  }
): Promise<{ updated: boolean }> {
  const snap = await db
    .collection(WHATSAPP_NOTIFICATIONS_COLLECTION)
    .where("messageId", "==", params.messageId)
    .limit(1)
    .get();
  if (snap.empty) return { updated: false };
  const nowIso = (params.now || new Date()).toISOString();
  await snap.docs[0].ref.set(
    {
      status: params.status,
      ...(params.timestamp ? { providerTimestamp: params.timestamp } : {}),
      ...(params.errorCode != null ? { metaErrorCode: params.errorCode } : {}),
      updatedAt: nowIso,
      [`statusAt_${params.status}`]: nowIso,
    },
    { merge: true }
  );
  return { updated: true };
}

export function buildStaffAutoReply(language: "tr" | "en", panelUrl: string): string {
  return language === "tr"
    ? `Bu numara yalnızca bildirim içindir. Detaylar ve yanıt için panele girin: ${panelUrl}`
    : `This number is for notifications only. Open the panel for details and replies: ${panelUrl}`;
}

async function findClinicForStaffSender(db: Firestore, digits: string): Promise<{ clinicId: string; language: "tr" | "en" } | null> {
  const snap = await db
    .collection(WHATSAPP_SETTINGS_COLLECTION)
    .where("recipientNumbers", "array-contains", digits)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const clinicSnap = await db.collection("clinics").doc(doc.id).get();
  const language = resolveTemplateLanguage(clinicSnap.exists ? (clinicSnap.data() as Record<string, unknown>) : null);
  return { clinicId: doc.id, language };
}

/** Sends at most one free-form auto-reply per staff sender per 24h. Never throws. */
export async function maybeAutoReplyToStaff(params: {
  db: Firestore;
  from: string;
  text: string;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<{ status: "sent" | "skipped" | "failed"; reason?: string }> {
  try {
    const digits = toWhatsAppRecipient(params.from.startsWith("+") ? params.from : `+${params.from}`);
    if (!digits) return { status: "skipped", reason: "invalid_sender" };
    if (!String(params.text || "").trim()) return { status: "skipped", reason: "empty" };

    const clinic = await findClinicForStaffSender(params.db, digits);
    if (!clinic) return { status: "skipped", reason: "unknown_sender" };

    const configResult = getWhatsAppSendConfig();
    if (!configResult.ok) return { status: "skipped", reason: configResult.reason };

    const now = params.now || new Date();
    const replyRef = params.db.collection(WHATSAPP_AUTO_REPLIES_COLLECTION).doc(digits);
    const prior = await replyRef.get();
    const lastAt = prior.exists ? String(prior.data()?.lastAt || "") : "";
    if (lastAt) {
      const elapsed = now.getTime() - new Date(lastAt).getTime();
      if (elapsed >= 0 && elapsed < AUTO_REPLY_WINDOW_MS) {
        return { status: "skipped", reason: "throttled" };
      }
    }

    const body = buildStaffAutoReply(clinic.language, getPanelBaseUrl());
    const url = `https://graph.facebook.com/${configResult.config.graphVersion}/${encodeURIComponent(configResult.config.phoneNumberId)}/messages`;
    const fetchImpl = params.fetchImpl ?? fetch;
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configResult.config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: digits,
        type: "text",
        text: { body, preview_url: false },
      }),
    });
    if (!response.ok) {
      console.log(
        JSON.stringify({
          checkpoint: "WHATSAPP_AUTO_REPLY",
          status: "failed",
          httpStatus: response.status,
          clinicId: clinic.clinicId,
        })
      );
      return { status: "failed", reason: "meta_error" };
    }
    await replyRef.set({ lastAt: now.toISOString(), clinicId: clinic.clinicId }, { merge: true });
    console.log(
      JSON.stringify({
        checkpoint: "WHATSAPP_AUTO_REPLY",
        status: "sent",
        clinicId: clinic.clinicId,
      })
    );
    return { status: "sent" };
  } catch {
    return { status: "failed", reason: "unexpected_error" };
  }
}

export interface ParsedWebhookPayload {
  statuses: Array<{
    messageId: string;
    status: WhatsAppWebhookStatus;
    timestamp?: string;
    errorCode?: number;
  }>;
  inbound: Array<{ from: string; text: string }>;
}

export function parseWhatsAppWebhookPayload(body: unknown): ParsedWebhookPayload {
  const statuses: ParsedWebhookPayload["statuses"] = [];
  const inbound: ParsedWebhookPayload["inbound"] = [];
  const entries = (body as { entry?: unknown })?.entry;
  if (!Array.isArray(entries)) return { statuses, inbound };

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: Record<string, unknown> })?.value;
      if (!value) continue;
      const statusList = value.statuses;
      if (Array.isArray(statusList)) {
        for (const item of statusList) {
          const messageId = typeof (item as { id?: unknown })?.id === "string" ? (item as { id: string }).id : "";
          const status = normalizeWebhookStatus((item as { status?: unknown })?.status);
          if (!messageId || !status) continue;
          const errors = (item as { errors?: Array<{ code?: unknown }> })?.errors;
          const errorCode = typeof errors?.[0]?.code === "number" ? errors[0].code : undefined;
          statuses.push({
            messageId,
            status,
            timestamp: typeof (item as { timestamp?: unknown })?.timestamp === "string" ? (item as { timestamp: string }).timestamp : undefined,
            errorCode,
          });
        }
      }
      const messages = value.messages;
      if (Array.isArray(messages)) {
        for (const msg of messages) {
          const from = typeof (msg as { from?: unknown })?.from === "string" ? (msg as { from: string }).from : "";
          const text =
            typeof (msg as { text?: { body?: unknown } })?.text?.body === "string"
              ? (msg as { text: { body: string } }).text.body
              : "";
          if (from) inbound.push({ from, text });
        }
      }
    }
  }
  return { statuses, inbound };
}
