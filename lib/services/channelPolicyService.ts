import { NotificationChannel } from "@/lib/types/notification";

/**
 * Defines the strictly active communication channels for each persona.
 * WhatsApp and SMS are disabled and excluded from active functionality 
 * in the current phase.
 */
export const ACTIVE_NOTIFICATION_CHANNELS = {
  patient: ["email", "secure_portal"],
  agency: ["email", "portal"],
  clinic: ["email", "portal"]
};

/**
 * Safely normalizes legacy or invalid notification channel settings to "email".
 * This prevents runtime crashes while respecting the new email-only policy.
 * @param legacyValue The legacy or requested string
 * @param hasValidEmail Indicates if we have an email address to actually fallback to
 * @returns "email" if normalized successfully, or "none" / undefined if unresolvable
 */
export function normalizeLegacyChannel(legacyValue: string | undefined | null, hasValidEmail: boolean): NotificationChannel | undefined {
  if (!legacyValue) return undefined;

  // We explicitly ignore "sms" and "whatsapp" and route them to email
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
    console.warn(`[channelPolicy] Legacy channel '${legacyValue}' could not be normalized to 'email' because no valid email is present.`);
    return undefined;
  }

  // If it's already exactly "email" and we have an email, keep it.
  if (legacyValue === "email") {
    return hasValidEmail ? "email" : undefined;
  }

  return undefined;
}
