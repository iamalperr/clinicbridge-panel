/**
 * Regression: confirmation must finalize before subsequent WhatsApp / live-support
 * intents can interfere; multi-treatment and after-9AM must not lose meaning.
 */
import { describe, it, expect } from "vitest";
import { SlotExtractor } from "../lib/conversation/slotExtractor";
import { PendingActionManager } from "../lib/conversation/PendingActionManager";
import { buildAppointmentReviewMessage } from "../lib/conversation/formatters";
import { normalizeConversationStatus } from "../lib/services/conversations/conversationStatusResolver";
import { stripUndefinedDeep } from "../lib/firestore/stripUndefined";

describe("Multi-treatment extraction", () => {
  it("keeps crown, root canal, extraction, and whitening", () => {
    const all = SlotExtractor.parseAllCanonicalTreatments(
      "Crown,!root canal extraction and whitening"
    );
    const ids = all.map((t) => t.id);
    expect(ids).toContain("crown");
    expect(ids).toContain("root_canal");
    expect(ids).toContain("tooth_extraction");
    expect(ids).toContain("teeth_whitening");
    expect(ids[0]).toBe("crown");
    expect(SlotExtractor.parseCanonicalTreatment("Crown,!root canal extraction and whitening")?.id).toBe(
      "crown"
    );
  });
});

describe("After 9 AM time preference", () => {
  it("does not treat anytime after 9 AM as a bare exact 09:00 specific booking", () => {
    const raw = "Tomorrow anytime after 9 AM";
    const res = SlotExtractor.parseTime(raw, raw.toLowerCase());
    expect(res?.time).toBe("09:00");
    expect(res?.timePreference).toBe("after");
  });

  it("summary prefers preferredTimeText over exact clock", () => {
    const msg = buildAppointmentReviewMessage({
      locale: "en",
      appointmentData: {
        patientName: "Atalante Jeanfrancois",
        patientPhone: "+1 9546145704",
        patientEmail: "atalantej@hotmail.com",
        requestedService: "Crown",
        requestedDate: "2026-08-22",
        requestedTime: "09:00",
        preferredTimeText: "Anytime after 09:00",
        notes: "Requested procedures: Crown, Root Canal, Tooth Extraction, Teeth Whitening",
      },
      clinicName: "İstanbul Diş Akademisi",
    });
    expect(msg).toContain("Anytime after 09:00");
    expect(msg).toContain("Requested procedures:");
    expect(msg).not.toMatch(/Preferred time:\s*9:00 AM/);
  });
});

describe("Confirmation priority semantics", () => {
  it("recognizes Yes please as confirmation", () => {
    expect(PendingActionManager.isConfirmation("Yes please")).toBe(true);
    expect(PendingActionManager.isConfirmation("yes")).toBe(true);
  });

  it("does not treat WhatsApp contact preference as confirmation", () => {
    expect(PendingActionManager.isConfirmation("They can contact me through WhatsApp")).toBe(false);
  });
});

describe("Status coexistence: appointment + live support", () => {
  it("prefers converted_to_appointment when appointmentId exists even if raw status is liveSupport", () => {
    expect(
      normalizeConversationStatus("liveSupport", {
        appointmentId: "appt_1",
        convertedToAppointment: true,
        appointmentStatus: "created",
      })
    ).toBe("converted_to_appointment");
  });

  it("stripUndefinedDeep allows safe draft persistence", () => {
    const cleaned = stripUndefinedDeep({
      appointmentState: "APPOINTMENT_SUBMITTED",
      preferredContactChannel: "whatsapp",
      notes: undefined,
    });
    expect(cleaned).toEqual({
      appointmentState: "APPOINTMENT_SUBMITTED",
      preferredContactChannel: "whatsapp",
    });
  });
});
