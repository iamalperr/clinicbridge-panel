/**
 * privacyNotice.ts
 *
 * Privacy notice URL validation, structured consent model, and security sanitization.
 */

export interface StructuredConsentData {
  consentTextBeforeLink: string;
  privacyNoticeLabel: string;
  privacyNoticeUrl: string | null;
  consentTextAfterLink: string;
  rawFallbackText: string;
  isValidUrl: boolean;
}

const ALLOWED_PROTOCOLS = new Set(["https:", "http:"]);

/**
 * Validates and sanitizes a privacy notice URL.
 * Only allows http and https protocols.
 * Rejects javascript:, data:, file:, etc.
 */
export function validatePrivacyNoticeUrl(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      console.warn(`[Security Warning] Blocked unsafe privacyNoticeUrl protocol: ${parsed.protocol}`);
      return null;
    }
    return parsed.toString();
  } catch {
    console.warn(`[Config Warning] Invalid privacyNoticeUrl format: "${trimmed}"`);
    return null;
  }
}

/**
 * Builds structured consent data for an agency and locale.
 * Sourced dynamically from agency configuration or FeelinHealthy defaults.
 */
export function getStructuredConsentData(
  agencyConfig?: any,
  lang: string = "tr"
): StructuredConsentData {
  const isEn = lang.toLowerCase().startsWith("en");

  const rawUrl = isEn
    ? (agencyConfig?.privacySettings?.noticeUrlEn || agencyConfig?.privacySettings?.privacyNoticeUrlEn || agencyConfig?.privacyUrl || agencyConfig?.privacyNoticeUrl || "https://feelinhealthy.com/kvkk")
    : (agencyConfig?.privacySettings?.noticeUrlTr || agencyConfig?.privacySettings?.privacyNoticeUrlTr || agencyConfig?.privacyUrl || agencyConfig?.privacyNoticeUrl || "https://feelinhealthy.com/kvkk");

  const validatedUrl = validatePrivacyNoticeUrl(rawUrl);

  if (isEn) {
    const privacyNoticeLabel = agencyConfig?.privacySettings?.privacyNoticeLabelEn || agencyConfig?.privacyNoticeLabelEn || "privacy notice";
    const consentTextBeforeLink = "To recommend suitable clinics and evaluate your request, we need your consent to process the personal and health-related information you provide. You can review the ";
    const consentTextAfterLink = " before continuing.";
    const rawFallbackText = `To recommend suitable clinics and evaluate your request, we need your consent to process the personal and health-related information you provide. You can review the ${privacyNoticeLabel} before continuing.`;

    return {
      consentTextBeforeLink,
      privacyNoticeLabel,
      privacyNoticeUrl: validatedUrl,
      consentTextAfterLink,
      rawFallbackText,
      isValidUrl: validatedUrl !== null
    };
  }

  const privacyNoticeLabel = agencyConfig?.privacySettings?.privacyNoticeLabelTr || agencyConfig?.privacyNoticeLabelTr || "Aydınlatma metnini";
  const consentTextBeforeLink = "Sizlere uygun klinikleri önerebilmemiz ve talebinizi değerlendirebilmemiz için paylaşacağınız kişisel ve sağlıkla ilgili verileri işlememize yönelik onayınıza ihtiyaç duyuyoruz. ";
  const consentTextAfterLink = " inceleyerek devam edebilirsiniz.";
  const rawFallbackText = `Sizlere uygun klinikleri önerebilmemiz ve talebinizi değerlendirebilmemiz için paylaşacağınız kişisel ve sağlıkla ilgili verileri işlememize yönelik onayınıza ihtiyaç duyuyoruz. ${privacyNoticeLabel} inceleyerek devam edebilirsiniz.`;

  return {
    consentTextBeforeLink,
    privacyNoticeLabel,
    privacyNoticeUrl: validatedUrl,
    consentTextAfterLink,
    rawFallbackText,
    isValidUrl: validatedUrl !== null
  };
}
