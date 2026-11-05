import { describe, expect, it } from "vitest";
import { buildWeekRange } from "../lib/services/weeklyClinicReport/weekRange";
import {
  assertInternalOnlyRecipients,
  ISTANBUL_DIS_AKADEMISI_CLINIC_ID,
  WEEKLY_CLINIC_REPORT_TARGETS,
} from "../lib/services/weeklyClinicReport/weeklyClinicReportConfig";
import {
  buildDirectWeeklyEmail,
  computeDirectWeeklyStats,
  directWeeklyRecipient,
  parseWorkingHours,
} from "../lib/services/weeklyClinicReport/directClinicWeekly";

const week = buildWeekRange("2026-09-07", "2026-09-13");

describe("direct clinic weekly report", () => {
  it("keeps the Istanbul clinic on the internal recipient list", () => {
    expect(WEEKLY_CLINIC_REPORT_TARGETS.map((target) => target.clinicId)).toEqual([
      ISTANBUL_DIS_AKADEMISI_CLINIC_ID,
    ]);
    expect(WEEKLY_CLINIC_REPORT_TARGETS[0].internalRecipients).toEqual(["info@clinicbridge-ai.com"]);
    expect(() => assertInternalOnlyRecipients(["phasee.report@example.com"])).toThrow(/non-internal recipient/);
    expect(directWeeklyRecipient({
      clinicId: ISTANBUL_DIS_AKADEMISI_CLINIC_ID,
      acquisition: "direct",
      email: "info@clinicbridge-ai.com",
      emailVerified: true,
      claimClinicId: ISTANBUL_DIS_AKADEMISI_CLINIC_ID,
    })).toBeNull();
  });

  it("mails a direct clinic only when its own verified user is explicitly included", () => {
    expect(directWeeklyRecipient({
      clinicId: "PhaseEClinic1",
      acquisition: "direct",
      email: "phasee.report@example.com",
      emailVerified: true,
      claimClinicId: "PhaseEClinic1",
    })).toBe("phasee.report@example.com");
    expect(directWeeklyRecipient({
      clinicId: "PhaseEClinic1",
      acquisition: "direct",
      email: "phasee.report@example.com",
      emailVerified: false,
      claimClinicId: "PhaseEClinic1",
    })).toBeNull();
    expect(directWeeklyRecipient({
      clinicId: "PhaseEClinic1",
      acquisition: "direct",
      email: "phasee.report@example.com",
      emailVerified: true,
      claimClinicId: "AnotherClinic",
    })).toBeNull();
    expect(directWeeklyRecipient({
      clinicId: "PhaseEClinic1",
      acquisition: "agency",
      email: "phasee.report@example.com",
      emailVerified: true,
      claimClinicId: "PhaseEClinic1",
    })).toBeNull();
  });

  it("counts last week's patients, after-hours messages, and forwarded appointment requests", () => {
    const stats = computeDirectWeeklyStats([
      { createdAt: "2026-09-08T08:30:00.000Z" },
      { createdAt: "2026-09-08T19:30:00.000Z", contactRequestId: "cr_1" },
      { createdAt: "2026-09-01T08:30:00.000Z", appointmentId: "old" },
    ], "09:00-18:00", week);
    expect(stats).toEqual({ patients: 2, outsideHours: 1, forwardedAppointments: 1 });

    const saturday = computeDirectWeeklyStats([
      { createdAt: "2026-09-12T08:00:00.000Z" },
    ], "Pzt-Cuma 09:00-18:00", week);
    expect(saturday.outsideHours).toBe(1);
    expect(parseWorkingHours("her gün açığız")).toBeNull();
    const unread = computeDirectWeeklyStats([
      { createdAt: "2026-09-08T08:30:00.000Z", lastMessagePreview: "özel not" },
    ], "açığız", week);
    expect(unread.outsideHours).toBeNull();
    expect(unread.patients).toBe(1);
  });

  it("writes the clinic summary without patient message text", () => {
    const email = buildDirectWeeklyEmail({
      language: "tr",
      clinicName: "Ada <Klinik>",
      periodLabel: week.subjectRangeTr,
      stats: { patients: 2, outsideHours: 1, forwardedAppointments: 1 },
    });
    expect(email.subject).toContain("Geçen haftanın hasta özeti");
    expect(email.html).toContain("Ada &lt;Klinik&gt;");
    expect(email.html).toContain("2 hasta yazdı");
    expect(email.html).toContain("1 tanesi");
    expect(email.html).toContain("1 randevu talebi");
    expect(email.html).not.toContain("özel not");
    expect(email.html).not.toMatch(/info@clinicbridge-ai.com/);
  });
});
