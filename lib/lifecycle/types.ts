/** Server-only clinic trial lifecycle milestones. No patient content. */

export const LIFECYCLE_MILESTONES = [
  "signed_up",
  "wizard_completed",
  "knowledge_min_reached",
  "widget_installed",
  "first_real_conversation",
  "first_appointment_request",
  "notifications_configured",
  "trial_ending_soon",
  "trial_expired",
  "converted_to_paid",
] as const;

export type LifecycleMilestone = (typeof LIFECYCLE_MILESTONES)[number];

export type LifecycleHealth = "green" | "yellow" | "red" | "neutral";

export type LifecycleEmailKey =
  | "day0_welcome"
  | "day1_wizard"
  | "day3_widget"
  | "day7_summary"
  | "day11_ending"
  | "day14_ended";

export interface SignupAttribution {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  referrer: string;
  landingPage: string;
}

export interface LifecycleMilestonesMap {
  signed_up?: string;
  wizard_completed?: string;
  knowledge_min_reached?: string;
  widget_installed?: string;
  first_real_conversation?: string;
  first_appointment_request?: string;
  notifications_configured?: string;
  trial_ending_soon?: string;
  trial_expired?: string;
  converted_to_paid?: string;
}

export interface LifecycleEmailsSent {
  day0_welcome?: string;
  day1_wizard?: string;
  day3_widget?: string;
  day7_summary?: string;
  day11_ending?: string;
  day14_ended?: string;
}

export interface ClinicLifecycleDoc {
  clinicId: string;
  acquisition: "direct";
  signedUpAt: string | null;
  attribution: SignupAttribution;
  milestones: LifecycleMilestonesMap;
  stage: LifecycleMilestone | null;
  activated: boolean;
  activatedAt: string | null;
  lastActivityAt: string | null;
  csmNote: string;
  nextAction: string;
  emailsSent: LifecycleEmailsSent;
  lifecycleEmailOptOut: boolean;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  clinicName: string;
  trialEndsAt: string | null;
  plan: string;
}

export interface LifecycleEventMeta {
  [key: string]: string | number | boolean | null | undefined;
}

export const KNOWLEDGE_MIN_ITEMS = 3;
export const ACTIVATION_WINDOW_DAYS = 7;
export const TRIAL_LENGTH_DAYS = 14;
export const STUCK_NO_PROGRESS_HOURS = 48;
export const LIFECYCLE_COLLECTION = "clinicLifecycle";
