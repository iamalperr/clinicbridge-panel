import { daysUntil, istanbulDay, parseTimestamp } from "@/lib/trial/policy";
import { trialDayNumber } from "@/lib/lifecycle/milestones";
import type { LifecycleEmailKey, LifecycleEmailsSent, LifecycleMilestonesMap } from "@/lib/lifecycle/types";

export interface LifecycleClinicSnapshot {
  clinicId: string;
  acquisition?: unknown;
  plan?: unknown;
  signedUpAt: Date | null;
  trialEndsAt: Date | null;
  milestones: LifecycleMilestonesMap;
  emailsSent: LifecycleEmailsSent;
  lifecycleEmailOptOut: boolean;
  activated: boolean;
  activatedAt: Date | null;
  conversationCount?: number;
  appointmentRequestCount?: number;
}

export interface AdminDigestBuckets {
  newSignups: string[];
  stuckNoWidget: string[];
  newlyActivated: string[];
  endingSoon: string[];
  expiredYesterday: string[];
}

/** Clinics signed up on Istanbul calendar day `now`. */
export function isNewSignupToday(signedUpAt: Date | null, now: Date): boolean {
  if (!signedUpAt) return false;
  return istanbulDay(signedUpAt) === istanbulDay(now);
}

/** Signed up >24h ago, still no widget_installed. */
export function isStuckNoWidget(input: {
  signedUpAt: Date | null;
  milestones: LifecycleMilestonesMap;
  now: Date;
}): boolean {
  if (!input.signedUpAt || input.milestones.widget_installed) return false;
  return input.now.getTime() - input.signedUpAt.getTime() > 24 * 60 * 60 * 1000;
}

export function isNewlyActivatedToday(activatedAt: Date | null, now: Date): boolean {
  if (!activatedAt) return false;
  return istanbulDay(activatedAt) === istanbulDay(now);
}

export function isTrialEndingSoon(trialEndsAt: Date | null, now: Date): boolean {
  if (!trialEndsAt) return false;
  const days = daysUntil(trialEndsAt, now);
  return days >= 0 && days <= 3;
}

export function expiredYesterday(trialEndsAt: Date | null, now: Date): boolean {
  if (!trialEndsAt) return false;
  return daysUntil(trialEndsAt, now) === -1;
}

export function buildAdminDigestBuckets(
  clinics: LifecycleClinicSnapshot[],
  now: Date
): AdminDigestBuckets {
  const buckets: AdminDigestBuckets = {
    newSignups: [],
    stuckNoWidget: [],
    newlyActivated: [],
    endingSoon: [],
    expiredYesterday: [],
  };
  for (const clinic of clinics) {
    if (clinic.acquisition !== "direct") continue;
    if (isNewSignupToday(clinic.signedUpAt, now)) buckets.newSignups.push(clinic.clinicId);
    if (isStuckNoWidget({ signedUpAt: clinic.signedUpAt, milestones: clinic.milestones, now })) {
      buckets.stuckNoWidget.push(clinic.clinicId);
    }
    if (clinic.activated && isNewlyActivatedToday(clinic.activatedAt, now)) {
      buckets.newlyActivated.push(clinic.clinicId);
    }
    if (clinic.plan === "trial" && isTrialEndingSoon(clinic.trialEndsAt, now)) {
      buckets.endingSoon.push(clinic.clinicId);
    }
    if (clinic.plan === "trial" && expiredYesterday(clinic.trialEndsAt, now)) {
      buckets.expiredYesterday.push(clinic.clinicId);
    }
  }
  return buckets;
}

/**
 * Which lifecycle nurture email (if any) should send today.
 * Each key only once; skipped when the condition no longer applies or opted out.
 */
export function selectLifecycleEmail(
  clinic: LifecycleClinicSnapshot,
  now: Date
): LifecycleEmailKey | null {
  if (clinic.acquisition !== "direct") return null;
  if (clinic.lifecycleEmailOptOut) return null;
  if (!clinic.signedUpAt) return null;
  if (clinic.plan && clinic.plan !== "trial" && clinic.milestones.converted_to_paid) {
    // Still allow day0 if somehow missing; otherwise stop nurture after convert.
  }
  if (clinic.milestones.converted_to_paid || (clinic.plan && clinic.plan !== "trial")) {
    // Converted clinics only get day0 if never sent; skip rest.
    if (!clinic.emailsSent.day0_welcome && trialDayNumber(clinic.signedUpAt, now) === 0) {
      return "day0_welcome";
    }
    return null;
  }

  const day = trialDayNumber(clinic.signedUpAt, now);
  const sent = clinic.emailsSent;
  const m = clinic.milestones;

  if (day === 0 && !sent.day0_welcome) return "day0_welcome";
  if (day === 1 && !sent.day1_wizard && !m.wizard_completed) return "day1_wizard";
  if (day === 3 && !sent.day3_widget && !m.widget_installed) return "day3_widget";
  if (day === 7 && !sent.day7_summary) return "day7_summary";
  if (day === 11 && !sent.day11_ending && clinic.plan === "trial") return "day11_ending";
  if (day >= 14 && !sent.day14_ended && clinic.plan === "trial") {
    const ends = clinic.trialEndsAt;
    if (!ends || ends.getTime() <= now.getTime() || day === 14) return "day14_ended";
  }
  return null;
}

/** Cron should also stamp trial_ending_soon / trial_expired when due. */
export function dueTrialLifecycleMilestones(input: {
  plan?: unknown;
  trialEndsAt: Date | null;
  milestones: LifecycleMilestonesMap;
  now: Date;
}): Array<"trial_ending_soon" | "trial_expired"> {
  if (input.plan !== "trial" || !input.trialEndsAt) return [];
  const due: Array<"trial_ending_soon" | "trial_expired"> = [];
  const days = daysUntil(input.trialEndsAt, input.now);
  if (days <= 3 && days >= 0 && !input.milestones.trial_ending_soon) due.push("trial_ending_soon");
  if (days < 0 && !input.milestones.trial_expired) due.push("trial_expired");
  return due;
}

export function shouldMarkConverted(input: {
  plan?: unknown;
  milestones: LifecycleMilestonesMap;
}): boolean {
  if (input.milestones.converted_to_paid) return false;
  if (!input.plan || input.plan === "trial") return false;
  return true;
}

export function parseLifecycleTimestamp(value: unknown): Date | null {
  return parseTimestamp(value);
}
