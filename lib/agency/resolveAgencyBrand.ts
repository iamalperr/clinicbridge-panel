/**
 * Canonical patient-facing agency brand resolver.
 *
 * ClinicBridge is the platform; patient emails for an agency conversation should
 * display the agency brand when known. Falls back to ClinicBridge AI only when
 * agency identity cannot be resolved — never invent a tenant.
 *
 * Distinguishes display name from the approved SMTP mailbox (deliverability).
 */

export const CLINICBRIDGE_PLATFORM_BRAND = {
  displayName: "ClinicBridge AI",
  fromName: "ClinicBridge AI",
  fromEmail: "noreply@clinicbridge-ai.com",
  replyTo: undefined as string | undefined,
  logoUrl: undefined as string | undefined,
  footerBrand: "ClinicBridge AI",
  supportEmail: undefined as string | undefined,
  websiteUrl: undefined as string | undefined,
} as const;

export interface AgencyBrandInput {
  name?: string | null;
  slug?: string | null;
  email?: string | null;
  contactEmail?: string | null;
  website?: string | null;
  logo?: string | null;
  branding?: {
    displayName?: string | null;
    logoUrl?: string | null;
  } | null;
  settings?: {
    supportEmail?: string | null;
    websiteUrl?: string | null;
    defaultLocale?: string | null;
  } | null;
}

export interface ResolvedAgencyBrand {
  displayName: string;
  fromName: string;
  /** Approved mailbox only — do not invent unverified domains. */
  fromEmail: string;
  replyTo?: string;
  logoUrl?: string;
  footerBrand: string;
  supportEmail?: string;
  websiteUrl?: string;
  /** True when agency identity was resolved (not platform fallback). */
  isAgencyBranded: boolean;
  /** RFC5322 From header: `Display Name <mailbox@domain>`. */
  fromHeader: string;
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | undefined {
  for (const v of values) {
    const t = String(v || "").trim();
    if (t) return t;
  }
  return undefined;
}

/**
 * Resolve patient-visible brand from an agency Firestore document (or partial).
 * Missing/empty agency → ClinicBridge AI platform fallback.
 */
export function resolveAgencyBrand(
  agency?: AgencyBrandInput | null
): ResolvedAgencyBrand {
  const displayName = firstNonEmpty(
    agency?.branding?.displayName,
    agency?.name
  );

  if (!displayName) {
    return {
      ...CLINICBRIDGE_PLATFORM_BRAND,
      isAgencyBranded: false,
      fromHeader: `${CLINICBRIDGE_PLATFORM_BRAND.fromName} <${CLINICBRIDGE_PLATFORM_BRAND.fromEmail}>`,
    };
  }

  const supportEmail = firstNonEmpty(
    agency?.settings?.supportEmail,
    agency?.contactEmail,
    agency?.email
  );
  const websiteUrl = firstNonEmpty(agency?.settings?.websiteUrl, agency?.website);
  const logoUrl = firstNonEmpty(agency?.branding?.logoUrl, agency?.logo);
  const fromEmail = CLINICBRIDGE_PLATFORM_BRAND.fromEmail;

  return {
    displayName,
    fromName: displayName,
    fromEmail,
    replyTo: supportEmail,
    logoUrl,
    footerBrand: displayName,
    supportEmail,
    websiteUrl,
    isAgencyBranded: true,
    fromHeader: `${displayName} <${fromEmail}>`,
  };
}
