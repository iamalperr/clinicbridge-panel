import { NotificationChannel } from "@/lib/types/notification";

/**
 * Active channels per persona.
 *
 * Clinic staff WhatsApp (Meta Cloud API) is an *additional* clinic-notification
 * channel alongside email. Patient and agency WhatsApp remain disabled — legacy
 * patient preferences that say "whatsapp" / "sms" still normalize to email.
 */
export const ACTIVE_NOTIFICATION_CHANNELS = {
  patient: ["email", "secure_portal"],
  agency: ["email", "portal"],
  clinic: ["email", "portal", "whatsapp"],
} as const;

/**
 * Safely normalizes legacy or invalid *patient* notification channel settings to "email".
 * Clinic-staff WhatsApp is configured separately (clinicWhatsappSettings) and must not
 * go through this path.
 */
export function normalizeLegacyChannel(
  legacyValue: string | undefined | null,
  hasValidEmail: boolean
): NotificationChannel | undefined {
  if (!legacyValue) return undefined;

  // Patient-facing WhatsApp/SMS are not live yet — fall back to email when possible.
  if (
    legacyValue === "whatsapp" ||
    legacyValue === "sms" ||
    legacyValue === "email_and_sms" ||
    legacyValue === "email_and_whatsapp"
  ) {
    if (hasValidEmail) {
      console.log(`[channelPolicy] Legacy channel '${legacyValue}' normalized to 'email'`);
      return "email";
    }
    console.warn(
      `[channelPolicy] Legacy channel '${legacyValue}' could not be normalized to 'email' because no valid email is present.`
    );
    return undefined;
  }

  if (legacyValue === "email") {
    return hasValidEmail ? "email" : undefined;
  }

  return undefined;
}

export function isClinicWhatsAppChannelEnabled(): boolean {
  return (ACTIVE_NOTIFICATION_CHANNELS.clinic as readonly string[]).includes("whatsapp");
}
