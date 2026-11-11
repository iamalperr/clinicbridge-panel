/**
 * WhatsApp Cloud API configuration (Meta). Product-global, server-only.
 *
 * Kill switch: sending is allowed only when WHATSAPP_NOTIFICATIONS_ENABLED === "true"
 * and the send credentials are present. Env values are never logged — only names.
 */

export const DEFAULT_WHATSAPP_GRAPH_VERSION = "v25.0";
export const WHATSAPP_TEMPLATE_NAME = "new_appointment_request";
export const WHATSAPP_SEND_TIMEOUT_MS = 8000;

export interface WhatsAppSendConfig {
  accessToken: string;
  phoneNumberId: string;
  graphVersion: string;
}

export type WhatsAppConfigResult =
  | { ok: true; config: WhatsAppSendConfig }
  | { ok: false; reason: "disabled" | "missing_env"; missing: string[] };

type Env = Record<string, string | undefined>;

const read = (env: Env, name: string): string => (env[name] || "").trim();

export function getWhatsAppSendConfig(env: Env = process.env): WhatsAppConfigResult {
  if (read(env, "WHATSAPP_NOTIFICATIONS_ENABLED") !== "true") {
    return { ok: false, reason: "disabled", missing: [] };
  }
  const missing = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"].filter((name) => !read(env, name));
  if (missing.length > 0) return { ok: false, reason: "missing_env", missing };

  const version = read(env, "WHATSAPP_GRAPH_VERSION");
  return {
    ok: true,
    config: {
      accessToken: read(env, "WHATSAPP_ACCESS_TOKEN"),
      phoneNumberId: read(env, "WHATSAPP_PHONE_NUMBER_ID"),
      graphVersion: /^v\d+\.\d+$/.test(version) ? version : DEFAULT_WHATSAPP_GRAPH_VERSION,
    },
  };
}

export function getWhatsAppWebhookSecrets(env: Env = process.env): {
  verifyToken: string;
  appSecret: string;
} {
  return {
    verifyToken: read(env, "WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
    appSecret: read(env, "WHATSAPP_APP_SECRET"),
  };
}

export function getPanelBaseUrl(env: Env = process.env): string {
  const configured = read(env, "NEXT_PUBLIC_APP_URL").replace(/\/$/, "");
  return /^https:\/\//.test(configured) ? configured : "https://app.clinicbridge-ai.com";
}
