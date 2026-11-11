/**
 * Meta WhatsApp Cloud API template sender.
 * POST https://graph.facebook.com/{version}/{phoneNumberId}/messages
 */

import type { NotificationPayload, NotificationProvider, NotificationProviderResult } from "../providers/NotificationProvider";
import {
  WHATSAPP_SEND_TIMEOUT_MS,
  getWhatsAppSendConfig,
  type WhatsAppSendConfig,
} from "./config";
import { toWhatsAppRecipient, type WhatsAppTemplateLanguage } from "./templateParams";

export type WhatsAppErrorCode =
  | "auth_failed"
  | "permission_denied"
  | "template_not_found"
  | "template_param_mismatch"
  | "template_paused"
  | "recipient_not_allowed"
  | "recipient_unavailable"
  | "rate_limited"
  | "invalid_request"
  | "meta_unavailable"
  | "timeout"
  | "network_error"
  | "invalid_recipient"
  | "unknown";

export type WhatsAppSendResult =
  | { status: "sent"; messageId: string; httpStatus: number }
  | {
      status: "failed";
      errorCode: WhatsAppErrorCode;
      metaErrorCode?: number;
      httpStatus?: number;
    };

/** Meta Graph / Cloud API error codes → stable product statuses. */
export function mapMetaErrorCode(code: number | undefined, httpStatus?: number): WhatsAppErrorCode {
  switch (code) {
    case 190:
    case 102:
      return "auth_failed";
    case 10:
    case 200:
    case 294:
      return "permission_denied";
    case 132001:
      return "template_not_found";
    case 132000:
    case 132012:
      return "template_param_mismatch";
    case 132015:
    case 132016:
      return "template_paused";
    case 131030:
      return "recipient_not_allowed";
    case 131026:
    case 133010:
      return "recipient_unavailable";
    case 4:
    case 80007:
    case 130429:
    case 131048:
    case 131056:
      return "rate_limited";
    case 100:
    case 131008:
    case 131009:
      return "invalid_request";
    case 1:
    case 2:
    case 131000:
    case 131016:
      return "meta_unavailable";
  }
  if (typeof code === "number" && code >= 200 && code <= 299) return "permission_denied";
  if (httpStatus && httpStatus >= 500) return "meta_unavailable";
  if (httpStatus === 401) return "auth_failed";
  if (httpStatus === 429) return "rate_limited";
  return "unknown";
}

export interface SendTemplateParams {
  to: string;
  templateName: string;
  language: WhatsAppTemplateLanguage;
  bodyParams: string[];
  config: WhatsAppSendConfig;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function buildTemplateRequestBody(to: string, templateName: string, language: string, bodyParams: string[]) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      components: [
        {
          type: "body",
          parameters: bodyParams.map((text) => ({ type: "text", text })),
        },
      ],
    },
  };
}

/** Sends a template message. Never throws; the access token never leaves the Authorization header. */
export async function sendWhatsAppTemplate(params: SendTemplateParams): Promise<WhatsAppSendResult> {
  const to = toWhatsAppRecipient(params.to);
  if (!to) return { status: "failed", errorCode: "invalid_recipient" };

  const { config } = params;
  const url = `https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(config.phoneNumberId)}/messages`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? WHATSAPP_SEND_TIMEOUT_MS);
  const fetchImpl = params.fetchImpl ?? fetch;

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildTemplateRequestBody(to, params.templateName, params.language, params.bodyParams)),
      signal: controller.signal,
    });
    const data: unknown = await response.json().catch(() => null);
    const body = (data && typeof data === "object" ? data : {}) as {
      messages?: Array<{ id?: unknown }>;
      error?: { code?: unknown };
    };
    const messageId = body.messages?.[0]?.id;
    if (response.ok && typeof messageId === "string" && messageId) {
      return { status: "sent", messageId, httpStatus: response.status };
    }
    const metaErrorCode = typeof body.error?.code === "number" ? body.error.code : undefined;
    return {
      status: "failed",
      errorCode: mapMetaErrorCode(metaErrorCode, response.status),
      metaErrorCode,
      httpStatus: response.status,
    };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { status: "failed", errorCode: aborted ? "timeout" : "network_error" };
  } finally {
    clearTimeout(timer);
  }
}

/** NotificationService adapter. Payload variables: { templateName, bodyParams }. */
export class WhatsAppCloudProvider implements NotificationProvider {
  channel = "whatsapp" as const;

  constructor(private readonly fetchImpl?: typeof fetch) {}

  async send(payload: NotificationPayload): Promise<NotificationProviderResult> {
    const configResult = getWhatsAppSendConfig();
    if (!configResult.ok) {
      return {
        success: false,
        attempted: false,
        accepted: false,
        status: "NOT_CONFIGURED",
        errorCode: configResult.reason,
        errorMessage: null,
      };
    }
    const bodyParams = Array.isArray(payload.variables?.bodyParams)
      ? payload.variables.bodyParams.map((value: unknown) => String(value ?? "-"))
      : [];
    const result = await sendWhatsAppTemplate({
      to: payload.to,
      templateName: String(payload.templateId || payload.variables?.templateName || ""),
      language: payload.language === "tr" ? "tr" : "en",
      bodyParams,
      config: configResult.config,
      fetchImpl: this.fetchImpl,
    });
    if (result.status === "sent") {
      return { success: true, attempted: true, accepted: true, status: "ACCEPTED", messageId: result.messageId };
    }
    return {
      success: false,
      attempted: true,
      accepted: false,
      status: "FAILED",
      errorCode: result.errorCode,
      errorMessage: result.metaErrorCode ? `meta_error_${result.metaErrorCode}` : null,
    };
  }
}
