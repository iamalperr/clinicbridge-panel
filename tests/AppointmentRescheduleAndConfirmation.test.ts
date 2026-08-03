import { describe, it, expect } from "vitest";
import { resolveAppointmentDisplaySchedule } from "../lib/services/appointments/AppointmentScheduleResolver";
import { getAppointmentStatusEmailTemplate } from "../lib/services/notifications/EmailTemplateResolver";
import { mapToCanonicalStatus, APPOINTMENT_STATUS_TRANSITIONS, isValidStatusTransition } from "../lib/types/appointment";

describe("AppointmentScheduleResolver", () => {
  it("should correctly resolve legacy appointments without confirmed schedule", () => {
    const legacyAppt = {
      preferredDate: "2026-08-10",
      preferredTime: "14:30",
      patientName: "Ahmet Yılmaz"
    };

    const schedule = resolveAppointmentDisplaySchedule(legacyAppt);
    expect(schedule.requestedDate).toBe("2026-08-10");
    expect(schedule.requestedTime).toBe("14:30");
    expect(schedule.confirmedDate).toBeNull();
    expect(schedule.confirmedTime).toBeNull();
    expect(schedule.displayDate).toBe("2026-08-10");
    expect(schedule.displayTime).toBe("14:30");
    expect(schedule.hasDifferentConfirmedSchedule).toBe(false);
  });

  it("should correctly resolve appointments with confirmed schedule differing from requested", () => {
    const appt = {
      preferredDate: "2026-08-10",
      preferredTimePeriod: "morning",
      confirmedDate: "2026-08-12",
      confirmedTime: "11:00",
      patientName: "Mehmet Demir"
    };

    const schedule = resolveAppointmentDisplaySchedule(appt);
    expect(schedule.requestedDate).toBe("2026-08-10");
    expect(schedule.requestedTime).toBe("Sabah");
    expect(schedule.confirmedDate).toBe("2026-08-12");
    expect(schedule.confirmedTime).toBe("11:00");
    expect(schedule.displayDate).toBe("2026-08-12");
    expect(schedule.displayTime).toBe("11:00");
    expect(schedule.hasDifferentConfirmedSchedule).toBe(true);
  });

  it("should handle period time mapping (afternoon, evening, earliest_available)", () => {
    const afternoonAppt = {
      preferredDate: "2026-08-15",
      preferredTimePeriod: "afternoon"
    };
    expect(resolveAppointmentDisplaySchedule(afternoonAppt).requestedTime).toBe("Öğleden sonra");

    const eveningAppt = {
      preferredDate: "2026-08-15",
      preferredTimePeriod: "evening"
    };
    expect(resolveAppointmentDisplaySchedule(eveningAppt).requestedTime).toBe("Akşam");

    const earliestAppt = {
      preferredDate: "2026-08-15",
      preferredTimePeriod: "earliest_available"
    };
    expect(resolveAppointmentDisplaySchedule(earliestAppt).requestedTime).toBe("En erken uygun saat");
  });

  it("should handle preferredTimeStart and preferredTimeEnd ranges", () => {
    const rangeAppt = {
      preferredDate: "2026-08-20",
      preferredTimeStart: "10:00",
      preferredTimeEnd: "11:30"
    };
    expect(resolveAppointmentDisplaySchedule(rangeAppt).requestedTime).toBe("10:00 - 11:30");
  });
});

describe("EmailTemplateResolver with Rescheduled and Confirmed Details", () => {
  const baseParams = {
    tenantId: "istanbul-dis-akademisi",
    clinicId: "istanbul-dis-akademisi",
    patientName: "Elif Kaya",
    clinicName: "İstanbul Diş Akademisi",
    treatment: "İmplant Muayenesi",
    requestedDate: "10 Ağustos 2026",
    requestedTime: "10:00",
  };

  it("should generate TR confirmed email with confirmed date/time differing from requested", () => {
    const template = getAppointmentStatusEmailTemplate({
      ...baseParams,
      status: "confirmed",
      locale: "tr",
      confirmedDate: "12 Ağustos 2026",
      confirmedTime: "15:30",
      changeReason: "Hekimimizin ameliyat takvimi nedeniyle randevu saati güncellenmiştir."
    });

    expect(template).toBeDefined();
    expect(template!.subject).toContain("Randevunuz Kesinleştirildi");
    expect(template!.htmlContent).toContain("İstanbul Diş Akademisi");
    expect(template!.htmlContent).toContain("12 Ağustos 2026");
    expect(template!.htmlContent).toContain("15:30");
    expect(template!.htmlContent).toContain("Hekimimizin ameliyat takvimi nedeniyle");
  });

  it("should fallback gracefully if confirmedDate/Time is not provided in confirmed status", () => {
    const template = getAppointmentStatusEmailTemplate({
      ...baseParams,
      status: "confirmed",
      locale: "tr"
    });

    expect(template).toBeDefined();
    expect(template!.htmlContent).toContain("10 Ağustos 2026");
    expect(template!.htmlContent).toContain("10:00");
  });

  it("should generate EN confirmed email with confirmed schedule", () => {
    const template = getAppointmentStatusEmailTemplate({
      ...baseParams,
      status: "confirmed",
      locale: "en",
      confirmedDate: "August 12, 2026",
      confirmedTime: "03:30 PM",
      changeReason: "Doctor schedule alignment."
    });

    expect(template).toBeDefined();
    expect(template!.subject).toContain("Your Appointment is Confirmed");
    expect(template!.htmlContent).toContain("August 12, 2026");
    expect(template!.htmlContent).toContain("03:30 PM");
    expect(template!.htmlContent).toContain("Doctor schedule alignment.");
  });

  it("should generate other customer email status templates properly without regression", () => {
    const emailStatuses = ["approved", "confirmed", "rejected", "cancelled", "reschedule_requested"] as const;
    for (const status of emailStatuses) {
      const trTemplate = getAppointmentStatusEmailTemplate({
        ...baseParams,
        status,
        locale: "tr"
      });
      expect(trTemplate).toBeDefined();
      expect(trTemplate!.htmlContent).toContain("İstanbul Diş Akademisi");

      const enTemplate = getAppointmentStatusEmailTemplate({
        ...baseParams,
        status,
        locale: "en"
      });
      expect(enTemplate).toBeDefined();
    }

    // Pending and completed statuses do not send patient emails
    expect(getAppointmentStatusEmailTemplate({ ...baseParams, status: "pending", locale: "tr" })).toBeNull();
    expect(getAppointmentStatusEmailTemplate({ ...baseParams, status: "completed", locale: "tr" })).toBeNull();
  });
});

describe("Appointment Status Transitions and Canonical Mapping", () => {
  it("should map various raw strings to canonical status", () => {
    expect(mapToCanonicalStatus("pending")).toBe("pending");
    expect(mapToCanonicalStatus("pending_review")).toBe("under_review");
    expect(mapToCanonicalStatus("under_review")).toBe("under_review");
    expect(mapToCanonicalStatus("approved")).toBe("approved");
    expect(mapToCanonicalStatus("confirmed")).toBe("confirmed");
    expect(mapToCanonicalStatus("rejected")).toBe("rejected");
    expect(mapToCanonicalStatus("cancelled")).toBe("cancelled");
    expect(mapToCanonicalStatus("canceled")).toBe("cancelled");
    expect(mapToCanonicalStatus("reschedule")).toBe("reschedule_requested");
    expect(mapToCanonicalStatus("reschedule_requested")).toBe("reschedule_requested");
    expect(mapToCanonicalStatus("completed")).toBe("completed");
  });

  it("should allow transitioning from confirmed to confirmed (reschedule)", () => {
    expect(isValidStatusTransition("confirmed", "confirmed")).toBe(true);
    expect(isValidStatusTransition("pending", "confirmed")).toBe(true);
    expect(isValidStatusTransition("under_review", "confirmed")).toBe(true);
    expect(isValidStatusTransition("approved", "confirmed")).toBe(true);
    expect(isValidStatusTransition("reschedule_requested", "confirmed")).toBe(true);
  });

  it("should allow same-status updates for editing date and time on pending, under_review, and approved appointments", () => {
    expect(isValidStatusTransition("pending", "pending")).toBe(true);
    expect(isValidStatusTransition("under_review", "under_review")).toBe(true);
    expect(isValidStatusTransition("approved", "approved")).toBe(true);
    expect(isValidStatusTransition("reschedule_requested", "reschedule_requested")).toBe(true);
  });

  it("should resolve updated requested date and time correctly for unconfirmed appointments", () => {
    const underReviewAppt = {
      status: "under_review",
      requestedDate: "2026-08-05",
      requestedTime: "14:00",
      patientName: "Ahmet Kaya"
    };

    const schedule = resolveAppointmentDisplaySchedule(underReviewAppt);
    expect(schedule.requestedDate).toBe("2026-08-05");
    expect(schedule.requestedTime).toBe("14:00");
    expect(schedule.confirmedDate).toBeNull();
    expect(schedule.confirmedTime).toBeNull();
    expect(schedule.displayDate).toBe("2026-08-05");
    expect(schedule.displayTime).toBe("14:00");
  });
});
