import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import {
  applyMilestoneIdempotent,
  computeActivatedAt,
  computeHealth,
  hasKnowledgeMinimum,
  trialDayNumber,
} from "../lib/lifecycle/milestones";
import {
  isIgnoredLifecycleHost,
  isRealConversationOrigin,
  originMatchesClinicDomain,
} from "../lib/lifecycle/origins";
import {
  buildAdminDigestBuckets,
  selectLifecycleEmail,
  dueTrialLifecycleMilestones,
  isStuckNoWidget,
  type LifecycleClinicSnapshot,
} from "../lib/lifecycle/cronSelection";
import { verifyLifecycleOptOutToken, lifecycleOptOutToken } from "../lib/lifecycle/optOut";
import { filterTrialRows, trialsToCsv, rowFromLifecycleDoc } from "../lib/lifecycle/adminRows";
import { isSuperAdmin } from "../lib/types";

describe("lifecycle milestones", () => {
  it("writes a milestone only once (idempotent)", () => {
    const first = applyMilestoneIdempotent({}, "signed_up", "2026-11-01T10:00:00.000Z");
    expect(first.wrote).toBe(true);
    const second = applyMilestoneIdempotent(first.next, "signed_up", "2026-11-02T10:00:00.000Z");
    expect(second.wrote).toBe(false);
    expect(second.next.signed_up).toBe("2026-11-01T10:00:00.000Z");
  });

  it("activates only when widget + first real conversation land within 7 days of signup", () => {
    const signup = new Date("2026-11-01T09:00:00.000Z");
    const ok = computeActivatedAt({
      signedUpAt: signup,
      widgetInstalledAt: new Date("2026-11-03T09:00:00.000Z"),
      firstRealConversationAt: new Date("2026-11-05T09:00:00.000Z"),
    });
    expect(ok?.toISOString()).toBe("2026-11-05T09:00:00.000Z");

    const late = computeActivatedAt({
      signedUpAt: signup,
      widgetInstalledAt: new Date("2026-11-03T09:00:00.000Z"),
      firstRealConversationAt: new Date("2026-11-10T09:00:00.000Z"),
    });
    expect(late).toBeNull();
  });

  it("requires ≥3 treatments/FAQ items for knowledge_min", () => {
    expect(hasKnowledgeMinimum({ treatmentCount: 2, faqCount: 0 })).toBe(false);
    expect(hasKnowledgeMinimum({ treatmentCount: 2, faqCount: 1 })).toBe(true);
  });
});

describe("widget origin filtering", () => {
  it("ignores localhost, vercel.app, and clinicbridge demo/app hosts", () => {
    expect(isIgnoredLifecycleHost("localhost")).toBe(true);
    expect(isIgnoredLifecycleHost("127.0.0.1")).toBe(true);
    expect(isIgnoredLifecycleHost("my-app.vercel.app")).toBe(true);
    expect(isIgnoredLifecycleHost("app.clinicbridge-ai.com")).toBe(true);
    expect(isIgnoredLifecycleHost("demo.clinicbridge-ai.com")).toBe(true);
    expect(isIgnoredLifecycleHost("ada.com.tr")).toBe(false);
  });

  it("marks widget_installed only when origin matches clinic domain", () => {
    expect(originMatchesClinicDomain("https://www.ada.com.tr", "ada.com.tr")).toBe(true);
    expect(originMatchesClinicDomain("ada.com.tr", "ada.com.tr")).toBe(true);
    expect(originMatchesClinicDomain("localhost", "ada.com.tr")).toBe(false);
    expect(originMatchesClinicDomain("preview.vercel.app", "ada.com.tr")).toBe(false);
    expect(originMatchesClinicDomain("other.com", "ada.com.tr")).toBe(false);
    expect(originMatchesClinicDomain("https://app.clinicbridge-ai.com", "ada.com.tr")).toBe(false);
  });

  it("excludes panel/preview hosts from first_real_conversation", () => {
    expect(isRealConversationOrigin("https://hasta.ada.com.tr")).toBe(true);
    expect(isRealConversationOrigin("https://app.clinicbridge-ai.com")).toBe(false);
    expect(isRealConversationOrigin("http://localhost:3000")).toBe(false);
  });
});

describe("cron selection (Europe/Istanbul day boundaries)", () => {
  const base = (over: Partial<LifecycleClinicSnapshot> = {}): LifecycleClinicSnapshot => ({
    clinicId: "c1",
    acquisition: "direct",
    plan: "trial",
    signedUpAt: new Date("2026-11-01T08:00:00.000Z"), // Istanbul 11:00
    trialEndsAt: new Date("2026-11-15T08:00:00.000Z"),
    milestones: { signed_up: "2026-11-01T08:00:00.000Z" },
    emailsSent: {},
    lifecycleEmailOptOut: false,
    activated: false,
    activatedAt: null,
    ...over,
  });

  it("uses Istanbul calendar day for trial day emails and skip conditions", () => {
    // Nov 1 21:00 UTC = Nov 2 00:00 Istanbul → day 1
    const day1Istanbul = new Date("2026-11-01T21:00:00.000Z");
    expect(trialDayNumber(new Date("2026-11-01T08:00:00.000Z"), day1Istanbul)).toBe(1);
    expect(selectLifecycleEmail(base(), day1Istanbul)).toBe("day1_wizard");
    expect(
      selectLifecycleEmail(
        base({ milestones: { signed_up: "x", wizard_completed: "2026-11-01T12:00:00.000Z" } }),
        day1Istanbul
      )
    ).toBeNull();

    const day3 = new Date("2026-11-04T08:00:00.000Z");
    expect(selectLifecycleEmail(base(), day3)).toBe("day3_widget");
    expect(
      selectLifecycleEmail(base({ milestones: { signed_up: "x", widget_installed: "y" } }), day3)
    ).toBeNull();

    const day0 = new Date("2026-11-01T10:00:00.000Z");
    expect(selectLifecycleEmail(base(), day0)).toBe("day0_welcome");
    expect(selectLifecycleEmail(base({ emailsSent: { day0_welcome: "sent" } }), day0)).toBeNull();
    expect(selectLifecycleEmail(base({ lifecycleEmailOptOut: true }), day0)).toBeNull();
  });

  it("builds digest buckets for stuck / ending / expired", () => {
    const now = new Date("2026-11-05T08:00:00.000Z");
    const buckets = buildAdminDigestBuckets(
      [
        base({
          clinicId: "stuck",
          signedUpAt: new Date("2026-11-03T08:00:00.000Z"),
          milestones: { signed_up: "2026-11-03T08:00:00.000Z" },
        }),
        base({
          clinicId: "ending",
          trialEndsAt: new Date("2026-11-07T08:00:00.000Z"),
        }),
        base({
          clinicId: "expired",
          trialEndsAt: new Date("2026-11-04T08:00:00.000Z"),
          plan: "trial",
        }),
        base({
          clinicId: "activated",
          activated: true,
          activatedAt: new Date("2026-11-05T07:00:00.000Z"),
        }),
      ],
      now
    );
    expect(buckets.stuckNoWidget).toContain("stuck");
    expect(buckets.endingSoon).toContain("ending");
    expect(buckets.expiredYesterday).toContain("expired");
    expect(buckets.newlyActivated).toContain("activated");
    expect(isStuckNoWidget({ signedUpAt: new Date("2026-11-04T10:00:00.000Z"), milestones: {}, now })).toBe(false);
  });

  it("stamps trial_ending_soon and trial_expired when due", () => {
    const now = new Date("2026-11-13T08:00:00.000Z");
    expect(
      dueTrialLifecycleMilestones({
        plan: "trial",
        trialEndsAt: new Date("2026-11-15T08:00:00.000Z"),
        milestones: {},
        now,
      })
    ).toContain("trial_ending_soon");
    expect(
      dueTrialLifecycleMilestones({
        plan: "trial",
        trialEndsAt: new Date("2026-11-10T08:00:00.000Z"),
        milestones: {},
        now,
      })
    ).toContain("trial_expired");
  });
});

describe("admin access + CSV", () => {
  it("restricts trials board to super admin roles", () => {
    expect(isSuperAdmin("superAdmin")).toBe(true);
    expect(isSuperAdmin("admin")).toBe(true);
    expect(isSuperAdmin("clinicUser")).toBe(false);
    const route = readFileSync("app/api/admin/trials/route.ts", "utf8");
    expect(route).toContain("requireSuperAdmin");
    const page = readFileSync("app/admin/trials/page.tsx", "utf8");
    expect(page).toContain("isSuperAdmin");
    const guard = readFileSync("components/auth/AuthGuard.tsx", "utf8");
    expect(guard).toContain("/admin/trials");
    const rules = readFileSync("firestore.rules", "utf8");
    expect(rules).toContain("clinicLifecycle");
    expect(rules).toMatch(/match \/clinicLifecycle\/\{document=\*\*\}[\s\S]*allow read, write: if false/);
  });

  it("filters rows and exports CSV without patient message content", () => {
    const row = rowFromLifecycleDoc("c1", {
      clinicName: "Ada",
      contactName: "Ayşe",
      contactEmail: "a@b.com",
      contactPhone: "+905551112233",
      signedUpAt: "2026-11-01T08:00:00.000Z",
      attribution: { utmSource: "google", utmMedium: "cpc", utmCampaign: "trial", referrer: "", landingPage: "/kayit" },
      milestones: { signed_up: "2026-11-01T08:00:00.000Z", wizard_completed: "2026-11-02T08:00:00.000Z" },
      stage: "wizard_completed",
      activated: false,
      lastActivityAt: "2026-11-02T08:00:00.000Z",
      csmNote: "Ara",
      nextAction: "Widget yardımı",
    });
    expect(row.health).toBe("yellow");
    expect(row.source).toContain("google");
    const filtered = filterTrialRows([row], { stage: "wizard_completed", health: "yellow", source: "google" });
    expect(filtered).toHaveLength(1);
    const csv = trialsToCsv(filtered);
    expect(csv).toContain("Ada");
    expect(csv).not.toContain("patientMessage");
  });

  it("verifies opt-out tokens", () => {
    const token = lifecycleOptOutToken("clinic_abc");
    expect(verifyLifecycleOptOutToken("clinic_abc", token)).toBe(true);
    expect(verifyLifecycleOptOutToken("clinic_abc", "nope")).toBe(false);
  });
});

describe("health colors", () => {
  it("marks red after 48h with no progress", () => {
    const health = computeHealth({
      activated: false,
      milestones: { signed_up: "2026-11-01T08:00:00.000Z" },
      signedUpAt: new Date("2026-11-01T08:00:00.000Z"),
      now: new Date("2026-11-04T08:00:00.000Z"),
    });
    expect(health).toBe("red");
  });
});

describe("cron wiring", () => {
  it("schedules trial-lifecycle at 09:00 Europe/Istanbul (06:00 UTC)", () => {
    const vercel = readFileSync("vercel.json", "utf8");
    expect(vercel).toContain("/api/internal/trial-lifecycle");
    expect(vercel).toContain("0 6 * * *");
    const route = readFileSync("app/api/internal/trial-lifecycle/route.ts", "utf8");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("runDailyTrialLifecycle");
  });
});
