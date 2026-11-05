import { describe, expect, it } from "vitest";
import {
  daysUntil,
  directClinicChatGate,
  dueTrialReminder,
  monthKey,
  planUsageNotification,
  trialClosedReply,
  usageWarningLevel,
} from "../lib/trial/policy";
import { buildTrialReminderEmail, buildUsageWarningEmail } from "../lib/trial/emails";

const now = new Date("2026-11-05T12:00:00.000Z");

describe("direct clinic trial and usage", () => {
  it("leaves existing clinics on the normal assistant path", () => {
    expect(directClinicChatGate({ plan: "pro", chatLimit: 500 }, now).kind).toBe("skip");
    expect(directClinicChatGate(null, now).kind).toBe("skip");
    expect(usageWarningLevel({ count: 500, limit: 500, month: monthKey(now), now })).toBeNull();
  });

  it("closes only an ended direct trial and keeps the clinic contact that was stored", () => {
    const open = directClinicChatGate({
      acquisition: "direct",
      plan: "trial",
      trialEndsAt: "2026-11-19T12:00:00.000Z",
      chatLimit: 500,
      phone: "02120000000",
    }, now, "tr");
    expect(open.kind).toBe("track");
    const closed = directClinicChatGate({
      acquisition: "direct",
      plan: "trial",
      trialEndsAt: "2026-11-04T12:00:00.000Z",
      phone: "02120000000",
      email: "klinik@example.com",
    }, now, "en");
    expect(closed.kind).toBe("closed");
    if (closed.kind === "closed") {
      expect(closed.reply).toContain("temporarily closed");
      expect(closed.reply).toContain("02120000000");
      expect(closed.reply).not.toMatch(/555|999/);
    }
    expect(trialClosedReply("tr", {}).includes("doğrudan")).toBe(true);
  });

  it("warns at 80 percent and at the full allowance without closing the assistant", () => {
    expect(planUsageNotification({ count: 3, limit: 5, warned80: false, warned100: false }).notify).toBeNull();
    expect(planUsageNotification({ count: 4, limit: 5, warned80: false, warned100: false })).toMatchObject({ notify: "80", warned80: true, warned100: false });
    expect(planUsageNotification({ count: 5, limit: 5, warned80: true, warned100: false })).toMatchObject({ notify: "100", warned100: true });
    expect(planUsageNotification({ count: 6, limit: 5, warned80: true, warned100: true }).notify).toBeNull();
    const month = monthKey(now);
    expect(usageWarningLevel({ acquisition: "direct", count: 4, limit: 5, month, now })).toBe("80");
    expect(usageWarningLevel({ acquisition: "direct", count: 5, limit: 5, month, now })).toBe("100");
    expect(usageWarningLevel({ acquisition: "direct", count: 5, limit: 5, month: "2026-10", now })).toBeNull();
    expect(directClinicChatGate({ acquisition: "direct", plan: "trial", trialEndsAt: "2026-11-19T12:00:00.000Z", chatLimit: 5 }, now).kind).toBe("track");
  });

  it("resets the warning when the Istanbul month changes", () => {
    const next = planUsageNotification({ count: 1, limit: 5, warned80: false, warned100: false });
    expect(next).toEqual({ notify: null, warned80: false, warned100: false });
  });

  it("sends the 3-day and 1-day reminders once, on those Istanbul days", () => {
    expect(daysUntil(new Date("2026-11-08T09:00:00.000Z"), now)).toBe(3);
    expect(daysUntil(new Date("2026-11-06T12:00:00.000Z"), now)).toBe(1);
    const base = { acquisition: "direct", plan: "trial", now, sent3: false, sent1: false };
    expect(dueTrialReminder({ ...base, trialEndsAt: new Date("2026-11-08T09:00:00.000Z") })).toBe("3");
    expect(dueTrialReminder({ ...base, trialEndsAt: new Date("2026-11-06T12:00:00.000Z") })).toBe("1");
    expect(dueTrialReminder({ ...base, sent3: true, trialEndsAt: new Date("2026-11-08T09:00:00.000Z") })).toBeNull();
    expect(dueTrialReminder({ ...base, plan: "klinik", trialEndsAt: new Date("2026-11-08T09:00:00.000Z") })).toBeNull();
    expect(buildTrialReminderEmail({ language: "tr", clinicName: "Ada <Klinik>", reminder: "3" }).html).toContain("Paket seçmek için bizimle iletişime geçin");
    expect(buildTrialReminderEmail({ language: "tr", clinicName: "Ada <Klinik>", reminder: "3" }).html).toContain("Ada &lt;Klinik&gt;");
    expect(buildUsageWarningEmail({ language: "en", clinicName: "Ada", notice: "100", count: 5, limit: 5 }).subject).toContain("full");
    expect(buildUsageWarningEmail({ language: "tr", clinicName: "Ada", notice: "80", count: 4, limit: 5 }).html).toContain("açık kalır");
  });
});
