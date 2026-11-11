import {
  ACTIVATION_WINDOW_DAYS,
  KNOWLEDGE_MIN_ITEMS,
  LIFECYCLE_MILESTONES,
  STUCK_NO_PROGRESS_HOURS,
  TRIAL_LENGTH_DAYS,
  type LifecycleHealth,
  type LifecycleMilestone,
  type LifecycleMilestonesMap,
  type SignupAttribution,
} from "@/lib/lifecycle/types";
import { istanbulDay, parseTimestamp } from "@/lib/trial/policy";

const MS_DAY = 86_400_000;

export function emptyAttribution(): SignupAttribution {
  return {
    utmSource: "",
    utmMedium: "",
    utmCampaign: "",
    referrer: "",
    landingPage: "",
  };
}

export function normalizeAttribution(input: Partial<SignupAttribution> | null | undefined): SignupAttribution {
  const base = emptyAttribution();
  if (!input) return base;
  return {
    utmSource: clampAttr(input.utmSource),
    utmMedium: clampAttr(input.utmMedium),
    utmCampaign: clampAttr(input.utmCampaign),
    referrer: clampAttr(input.referrer, 500),
    landingPage: clampAttr(input.landingPage, 300) || "/",
  };
}

function clampAttr(value: unknown, max = 120): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

/** Idempotent: keep existing timestamp; set only when missing. */
export function applyMilestoneIdempotent(
  existing: LifecycleMilestonesMap,
  milestone: LifecycleMilestone,
  atIso: string
): { next: LifecycleMilestonesMap; wrote: boolean } {
  if (existing[milestone]) {
    return { next: existing, wrote: false };
  }
  return { next: { ...existing, [milestone]: atIso }, wrote: true };
}

export function latestStage(milestones: LifecycleMilestonesMap): LifecycleMilestone | null {
  let best: LifecycleMilestone | null = null;
  let bestTs = -1;
  for (const key of LIFECYCLE_MILESTONES) {
    const raw = milestones[key];
    if (!raw) continue;
    const ts = Date.parse(raw);
    if (Number.isNaN(ts)) continue;
    if (ts >= bestTs) {
      bestTs = ts;
      best = key;
    }
  }
  return best;
}

export function knowledgeItemCount(input: {
  treatmentCount?: number;
  faqCount?: number;
}): number {
  const treatments = Math.max(0, Math.floor(input.treatmentCount || 0));
  const faq = Math.max(0, Math.floor(input.faqCount || 0));
  return treatments + faq;
}

export function hasKnowledgeMinimum(input: {
  treatmentCount?: number;
  faqCount?: number;
}): boolean {
  return knowledgeItemCount(input) >= KNOWLEDGE_MIN_ITEMS;
}

export function computeActivatedAt(input: {
  signedUpAt: Date | null;
  widgetInstalledAt: Date | null;
  firstRealConversationAt: Date | null;
}): Date | null {
  const { signedUpAt, widgetInstalledAt, firstRealConversationAt } = input;
  if (!signedUpAt || !widgetInstalledAt || !firstRealConversationAt) return null;
  const deadline = signedUpAt.getTime() + ACTIVATION_WINDOW_DAYS * MS_DAY;
  if (widgetInstalledAt.getTime() > deadline) return null;
  if (firstRealConversationAt.getTime() > deadline) return null;
  return new Date(Math.max(widgetInstalledAt.getTime(), firstRealConversationAt.getTime()));
}

export function trialDayNumber(signedUpAt: Date, now: Date): number {
  const start = Date.parse(`${istanbulDay(signedUpAt)}T00:00:00Z`);
  const current = Date.parse(`${istanbulDay(now)}T00:00:00Z`);
  const day = Math.floor((current - start) / MS_DAY);
  return Math.max(0, day);
}

export function trialDayLabel(signedUpAt: Date | null, now: Date): string {
  if (!signedUpAt) return `?/ ${TRIAL_LENGTH_DAYS}`;
  const day = Math.min(trialDayNumber(signedUpAt, now), TRIAL_LENGTH_DAYS);
  return `${day}/${TRIAL_LENGTH_DAYS}`;
}

export function computeHealth(input: {
  activated: boolean;
  milestones: LifecycleMilestonesMap;
  signedUpAt: Date | null;
  now: Date;
}): LifecycleHealth {
  if (input.activated) return "green";
  if (input.milestones.wizard_completed && !input.milestones.widget_installed) return "yellow";
  if (input.signedUpAt) {
    const ageMs = input.now.getTime() - input.signedUpAt.getTime();
    const progressed =
      Boolean(input.milestones.wizard_completed) ||
      Boolean(input.milestones.widget_installed) ||
      Boolean(input.milestones.knowledge_min_reached) ||
      Boolean(input.milestones.first_real_conversation);
    if (ageMs >= STUCK_NO_PROGRESS_HOURS * 3_600_000 && !progressed) return "red";
  }
  return "neutral";
}

export function asDate(value: unknown): Date | null {
  return parseTimestamp(value);
}

export function sourceLabel(attribution: SignupAttribution): string {
  const parts = [attribution.utmSource, attribution.utmMedium, attribution.utmCampaign].filter(Boolean);
  if (parts.length) return parts.join(" / ");
  if (attribution.referrer) {
    try {
      return new URL(attribution.referrer).hostname || attribution.referrer;
    } catch {
      return attribution.referrer;
    }
  }
  return "direct";
}
