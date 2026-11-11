import {
  computeHealth,
  sourceLabel,
  trialDayLabel,
  asDate,
} from "@/lib/lifecycle/milestones";
import { emptyAttribution, normalizeAttribution } from "@/lib/lifecycle/milestones";
import type {
  LifecycleHealth,
  LifecycleMilestone,
  LifecycleMilestonesMap,
  SignupAttribution,
} from "@/lib/lifecycle/types";

export interface TrialAdminRow {
  clinicId: string;
  clinicName: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  signupDate: string | null;
  trialDay: string;
  source: string;
  stage: LifecycleMilestone | null;
  health: LifecycleHealth;
  lastActivityAt: string | null;
  activated: boolean;
  csmNote: string;
  nextAction: string;
  panelUrl: string;
  telUrl: string | null;
  mailtoUrl: string | null;
}

export function rowFromLifecycleDoc(
  clinicId: string,
  data: Record<string, unknown>,
  now = new Date()
): TrialAdminRow {
  const attribution = normalizeAttribution(data.attribution as SignupAttribution | undefined);
  const milestones = (data.milestones && typeof data.milestones === "object"
    ? data.milestones
    : {}) as LifecycleMilestonesMap;
  const signedUpAt = asDate(data.signedUpAt);
  const activated = data.activated === true;
  const health = computeHealth({ activated, milestones, signedUpAt, now });
  const phone = typeof data.contactPhone === "string" ? data.contactPhone : "";
  const email = typeof data.contactEmail === "string" ? data.contactEmail : "";
  const clinicName = typeof data.clinicName === "string" ? data.clinicName : clinicId;
  return {
    clinicId,
    clinicName,
    contactName: typeof data.contactName === "string" ? data.contactName : "",
    contactPhone: phone,
    contactEmail: email,
    signupDate: signedUpAt ? signedUpAt.toISOString() : null,
    trialDay: trialDayLabel(signedUpAt, now),
    source: sourceLabel(attribution),
    stage: (typeof data.stage === "string" ? data.stage : null) as LifecycleMilestone | null,
    health,
    lastActivityAt: typeof data.lastActivityAt === "string" ? data.lastActivityAt : null,
    activated,
    csmNote: typeof data.csmNote === "string" ? data.csmNote : "",
    nextAction: typeof data.nextAction === "string" ? data.nextAction : "",
    panelUrl: `/clinics/${clinicId}`,
    telUrl: phone ? `tel:${phone.replace(/\s+/g, "")}` : null,
    mailtoUrl: email ? `mailto:${email}` : null,
  };
}

export function filterTrialRows(
  rows: TrialAdminRow[],
  filters: { stage?: string; health?: string; source?: string }
): TrialAdminRow[] {
  return rows.filter((row) => {
    if (filters.stage && filters.stage !== "all" && row.stage !== filters.stage) return false;
    if (filters.health && filters.health !== "all" && row.health !== filters.health) return false;
    if (filters.source && filters.source !== "all") {
      const needle = filters.source.toLowerCase();
      if (!row.source.toLowerCase().includes(needle)) return false;
    }
    return true;
  });
}

export function trialsToCsv(rows: TrialAdminRow[]): string {
  const header = [
    "clinicId",
    "clinicName",
    "contactName",
    "contactPhone",
    "contactEmail",
    "signupDate",
    "trialDay",
    "source",
    "stage",
    "health",
    "lastActivityAt",
    "activated",
    "csmNote",
    "nextAction",
  ];
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.clinicId,
        row.clinicName,
        row.contactName,
        row.contactPhone,
        row.contactEmail,
        row.signupDate || "",
        row.trialDay,
        row.source,
        row.stage || "",
        row.health,
        row.lastActivityAt || "",
        row.activated ? "true" : "false",
        row.csmNote,
        row.nextAction,
      ]
        .map((cell) => escape(String(cell)))
        .join(",")
    );
  }
  return lines.join("\n");
}

export function emptyLifecycleSeedAttribution(): SignupAttribution {
  return emptyAttribution();
}
