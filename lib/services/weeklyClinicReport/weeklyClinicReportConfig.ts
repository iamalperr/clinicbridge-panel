/**
 * Configuration for automated weekly clinic AI usage reports.
 *
 * Phase 1: internal recipients only — never clinic patient/clinic inboxes.
 * Clinic identity uses canonical Firestore clinicId (not display name).
 */

export type WeeklyClinicReportTarget = {
  clinicId: string;
  /** Display name for email header only */
  clinicName: string;
  enabled: boolean;
  /** Internal review inboxes — never clinic addresses in this phase */
  internalRecipients: string[];
};

/**
 * İstanbul Diş Akademisi Clinic Portal document ID (production).
 * Not the FeelinHealthy agency curated clinic id.
 */
export const ISTANBUL_DIS_AKADEMISI_CLINIC_ID = "ByTnY4VEmBTJxogqCQ7q";

export const WEEKLY_CLINIC_REPORT_TARGETS: WeeklyClinicReportTarget[] = [
  {
    clinicId: ISTANBUL_DIS_AKADEMISI_CLINIC_ID,
    clinicName: "İstanbul Diş Akademisi",
    enabled: true,
    internalRecipients: ["info@clinicbridge-ai.com"],
  },
];

export function getEnabledWeeklyReportTargets(): WeeklyClinicReportTarget[] {
  return WEEKLY_CLINIC_REPORT_TARGETS.filter((t) => t.enabled);
}

export function assertInternalOnlyRecipients(recipients: string[]): void {
  for (const r of recipients) {
    const email = String(r || "").trim().toLowerCase();
    if (!email.endsWith("@clinicbridge-ai.com")) {
      throw new Error(
        `[weekly-clinic-report] Refusing non-internal recipient: ${email}. Phase-1 reports may only go to @clinicbridge-ai.com.`
      );
    }
  }
}
