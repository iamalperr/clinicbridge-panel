/**
 * Patient-facing live-support channels (WhatsApp / Telegram redirect buttons).
 * Product-global: the same rule applies to single-clinic and agency clinic records.
 *
 * Only the clinic's own WhatsApp / Telegram fields are used. General contact lines
 * (turkishContactNumber, internationalContactNumber, phone) are never turned into a
 * WhatsApp link, and nothing is returned unless human handoff is explicitly enabled.
 */

export interface LiveSupportChannels {
  /** Digits only, ready for https://wa.me/<digits>. */
  whatsappNumber?: string;
  /** Always an https://t.me/<handle> URL. */
  telegramLink?: string;
}

const TELEGRAM_HANDLE = /^[A-Za-z0-9_]{5,32}$/;

export function normalizeWhatsAppDigits(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function normalizeTelegramLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;
  const urlMatch = value.match(/^(?:https?:\/\/)?(?:www\.)?t\.me\/([^/?#\s]+)\/?$/i);
  const handle = urlMatch ? urlMatch[1] : value.replace(/^@/, "");
  return TELEGRAM_HANDLE.test(handle) ? `https://t.me/${handle}` : null;
}

export function resolveLiveSupportChannels(
  clinicData: Record<string, unknown> | null | undefined
): LiveSupportChannels {
  if (!clinicData || clinicData.enableHumanHandoff !== true) return {};
  const whatsappNumber = normalizeWhatsAppDigits(clinicData.whatsappNumber || clinicData.whatsapp);
  const telegramLink = normalizeTelegramLink(clinicData.telegramUsername || clinicData.telegram);
  return {
    ...(whatsappNumber ? { whatsappNumber } : {}),
    ...(telegramLink ? { telegramLink } : {}),
  };
}

export interface LiveSupportButtonsPayload extends LiveSupportChannels {
  /** Language of the reply the buttons are attached to; the widget labels the buttons in it. */
  replyLanguage?: string;
}

export function resolveLiveSupportButtons(
  clinicData: Record<string, unknown> | null | undefined,
  replyLanguage: string
): LiveSupportButtonsPayload {
  const channels = resolveLiveSupportChannels(clinicData);
  return channels.whatsappNumber || channels.telegramLink ? { ...channels, replyLanguage } : channels;
}
