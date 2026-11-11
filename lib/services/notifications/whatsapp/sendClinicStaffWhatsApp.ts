/**
 * Clinic-staff WhatsApp notifications (Meta Cloud API templates).
 *
 * Independent of email: a WhatsApp failure never throws and never affects the
 * appointment / contact-request / email outcome. Logs carry channel + status +
 * Meta error code + message id only — never patient data or env secrets.
 */

import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  WHATSAPP_TEMPLATE_NAME,
  getPanelBaseUrl,
  getWhatsAppSendConfig,
} from "./config";
import {
  CONTACT_REQUEST_TREATMENT_LABEL,
  buildPanelLink,
  buildTemplateBodyParams,
  maskPhone,
  resolveTemplateLanguage,
  type ClinicStaffNotificationKind,
  type WhatsAppTemplateLanguage,
} from "./templateParams";
import { sendWhatsAppTemplate, type WhatsAppErrorCode } from "./WhatsAppCloudProvider";
import {
  WHATSAPP_NOTIFICATIONS_COLLECTION,
  loadWhatsAppSettings,
  type ClinicWhatsAppSettings,
} from "./settings";

export type WhatsAppDeliveryStatus = "sent" | "failed" | "skipped";

export interface WhatsAppRecipientResult {
  status: WhatsAppDeliveryStatus;
  reason?: string;
  errorCode?: WhatsAppErrorCode | string;
  metaErrorCode?: number;
  messageId?: string;
  recipientMasked?: string;
}

export interface SendClinicStaffWhatsAppParams {
  clinicId: string;
  clinicData?: Record<string, unknown> | null;
  kind: ClinicStaffNotificationKind;
  recordId?: string;
  conversationId?: string;
  patientName?: unknown;
  treatment?: unknown;
  preferredDate?: unknown;
  preferredTime?: unknown;
  /** When set (test send), only this E.164 number is targeted and settings.enabled is ignored. */
  recipientOverride?: string;
  fetchImpl?: typeof fetch;
  db?: Firestore | null;
  now?: Date;
}

function logDelivery(fields: Record<string, unknown>) {
  console.log(JSON.stringify({ checkpoint: "WHATSAPP_STAFF_NOTIFICATION", ...fields }));
}

async function storeOutbound(db: Firestore, doc: Record<string, unknown>) {
  await db.collection(WHATSAPP_NOTIFICATIONS_COLLECTION).add(doc);
}

export async function sendClinicStaffWhatsApp(
  params: SendClinicStaffWhatsAppParams
): Promise<{ status: WhatsAppDeliveryStatus; results: WhatsAppRecipientResult[] }> {
  const clinicId = params.clinicId;
  const results: WhatsAppRecipientResult[] = [];

  try {
    const configResult = getWhatsAppSendConfig();
    if (!configResult.ok) {
      const reason = configResult.reason === "disabled" ? "kill_switch" : "missing_env";
      logDelivery({
        clinicId,
        kind: params.kind,
        channel: "whatsapp",
        status: "skipped",
        reason,
        missing: configResult.reason === "missing_env" ? configResult.missing : undefined,
      });
      return { status: "skipped", results: [{ status: "skipped", reason }] };
    }

    const db = params.db === undefined ? getAdminDb() : params.db;
    if (!db) {
      logDelivery({ clinicId, kind: params.kind, channel: "whatsapp", status: "skipped", reason: "no_admin_db" });
      return { status: "skipped", results: [{ status: "skipped", reason: "no_admin_db" }] };
    }

    const settings: ClinicWhatsAppSettings = await loadWhatsAppSettings(db, clinicId);
    let recipients = settings.recipients;

    if (params.recipientOverride) {
      const match = recipients.find((r) => r.phone === params.recipientOverride);
      if (!match) {
        logDelivery({
          clinicId,
          kind: params.kind,
          channel: "whatsapp",
          status: "failed",
          reason: "recipient_not_opted_in",
        });
        return { status: "failed", results: [{ status: "failed", reason: "recipient_not_opted_in" }] };
      }
      recipients = [match];
    } else if (!settings.enabled || recipients.length === 0) {
      logDelivery({
        clinicId,
        kind: params.kind,
        channel: "whatsapp",
        status: "skipped",
        reason: settings.enabled ? "no_recipients" : "clinic_disabled",
      });
      return {
        status: "skipped",
        results: [{ status: "skipped", reason: settings.enabled ? "no_recipients" : "clinic_disabled" }],
      };
    }

    const language: WhatsAppTemplateLanguage = resolveTemplateLanguage(params.clinicData);
    const treatment =
      params.kind === "contact_request"
        ? CONTACT_REQUEST_TREATMENT_LABEL[language]
        : params.kind === "test"
          ? language === "tr"
            ? "Test bildirimi"
            : "Test notification"
          : params.treatment;
    const preferredDate =
      params.kind === "test"
        ? new Date().toISOString().slice(0, 10)
        : params.kind === "contact_request"
          ? undefined
          : params.preferredDate;
    const panelLink = buildPanelLink({
      baseUrl: getPanelBaseUrl(),
      clinicId,
      kind: params.kind === "test" ? "appointment" : params.kind,
      recordId: params.recordId,
      conversationId: params.conversationId,
    });
    const bodyParams = buildTemplateBodyParams({
      language,
      patientName: params.kind === "test" ? (language === "tr" ? "Test Hasta" : "Test Patient") : params.patientName,
      treatment,
      preferredDate,
      preferredTime: params.preferredTime,
      panelLink,
    });

    let anySent = false;
    let anyFailed = false;

    for (const recipient of recipients) {
      const digits = recipient.phone.slice(1);
      const masked = maskPhone(digits);
      const sendResult = await sendWhatsAppTemplate({
        to: recipient.phone,
        templateName: WHATSAPP_TEMPLATE_NAME,
        language,
        bodyParams,
        config: configResult.config,
        fetchImpl: params.fetchImpl,
      });

      if (sendResult.status === "sent") {
        anySent = true;
        results.push({ status: "sent", messageId: sendResult.messageId, recipientMasked: masked });
        logDelivery({
          clinicId,
          kind: params.kind,
          channel: "whatsapp",
          status: "sent",
          messageId: sendResult.messageId,
          recipientMasked: masked,
          language,
        });
        try {
          await storeOutbound(db, {
            clinicId,
            kind: params.kind,
            recordId: params.recordId || null,
            conversationId: params.conversationId || null,
            recipientDigits: digits,
            recipientMasked: masked,
            messageId: sendResult.messageId,
            templateName: WHATSAPP_TEMPLATE_NAME,
            language,
            status: "sent",
            createdAt: (params.now || new Date()).toISOString(),
            updatedAt: (params.now || new Date()).toISOString(),
          });
        } catch {
          /* logging must not break delivery */
        }
      } else {
        anyFailed = true;
        results.push({
          status: "failed",
          errorCode: sendResult.errorCode,
          metaErrorCode: sendResult.metaErrorCode,
          recipientMasked: masked,
        });
        logDelivery({
          clinicId,
          kind: params.kind,
          channel: "whatsapp",
          status: "failed",
          errorCode: sendResult.errorCode,
          metaErrorCode: sendResult.metaErrorCode,
          recipientMasked: masked,
        });
        try {
          await storeOutbound(db, {
            clinicId,
            kind: params.kind,
            recordId: params.recordId || null,
            recipientDigits: digits,
            recipientMasked: masked,
            messageId: null,
            templateName: WHATSAPP_TEMPLATE_NAME,
            language,
            status: "failed",
            errorCode: sendResult.errorCode,
            metaErrorCode: sendResult.metaErrorCode ?? null,
            createdAt: (params.now || new Date()).toISOString(),
            updatedAt: (params.now || new Date()).toISOString(),
          });
        } catch {
          /* ignore */
        }
      }
    }

    return {
      status: anySent ? "sent" : anyFailed ? "failed" : "skipped",
      results,
    };
  } catch (error) {
    logDelivery({
      clinicId,
      kind: params.kind,
      channel: "whatsapp",
      status: "failed",
      reason: "unexpected_error",
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return { status: "failed", results: [{ status: "failed", reason: "unexpected_error" }] };
  }
}
