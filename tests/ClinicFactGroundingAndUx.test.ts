import { describe, it, expect } from "vitest";
import {
  buildVerifiedClinicFactReply,
  clinicHasExplicitSpecialization,
  clinicOffersTreatmentCategory,
  containsUnsupportedClinicMarketingClaim,
  detectClinicFactKind,
  isClinicFactInformationTurn,
  isDoctorActivelyListed,
  resolveClinicNarrativeText,
  resolveVerifiedDoctorCount,
} from "../lib/agency/clinicFactGrounding";
import { buildAgencyGroundedContext } from "../lib/agency/agencyGroundedRetrieval";
import { isAgencyInformationalInterruption } from "../lib/agency/conversationOrchestration";

describe("Clinic factual grounding (global)", () => {
  it("1. Doctor count exists → verified reply includes the number", () => {
    const clinic = { id: "c1", clinicName: "Tema Clinic", doctorCount: 12 };
    const count = resolveVerifiedDoctorCount(clinic, []);
    expect(count).toEqual({ count: 12, source: "doctorCount" });
    const reply = buildVerifiedClinicFactReply({
      kind: "doctor_count",
      locale: "tr",
      clinicName: "Tema Clinic",
      doctorCount: count,
    });
    expect(reply.verified).toBe(true);
    expect(reply.reply).toContain("12");
  });

  it("2. Doctor count missing → does not invent a number", () => {
    const reply = buildVerifiedClinicFactReply({
      kind: "doctor_count",
      locale: "en",
      clinicName: "Tema Clinic",
      doctorCount: null,
    });
    expect(reply.verified).toBe(false);
    expect(reply.reply.toLowerCase()).not.toMatch(/\b\d+\s+doctor/);
    expect(reply.reply.toLowerCase()).toMatch(/do not currently have|verified/);
  });

  it("3. Clinic offers treatment → does not infer specialist", () => {
    const clinic = {
      treatmentCategories: ["hair_transplant"],
      overview: { specialties: [] },
    };
    expect(clinicOffersTreatmentCategory(clinic, "hair")).toBe(true);
    expect(clinicHasExplicitSpecialization(clinic, "hair")).toBe(false);
    const reply = buildVerifiedClinicFactReply({
      kind: "expertise",
      locale: "en",
      clinicName: "Clinic A",
      doctorCount: null,
      offersTreatment: true,
      explicitSpecialization: false,
      treatmentLabel: "hair transplant",
    });
    expect(reply.reply.toLowerCase()).toContain("offers");
    expect(reply.reply.toLowerCase()).toMatch(/cannot verify/);
    expect(reply.kind).toBe("expertise_service_only");
    expect(reply.reply.toLowerCase().startsWith("clinic a specializes")).toBe(false);
  });

  it("4. Explicit specialization exists → can be communicated", () => {
    const clinic = {
      overview: { specialties: ["Hair Transplant", "FUE"] },
    };
    expect(clinicHasExplicitSpecialization(clinic, "hair")).toBe(true);
    const reply = buildVerifiedClinicFactReply({
      kind: "expertise",
      locale: "tr",
      clinicName: "Clinic A",
      doctorCount: null,
      offersTreatment: true,
      explicitSpecialization: true,
      treatmentLabel: "saç ekimi",
    });
    expect(reply.verified).toBe(true);
    expect(reply.reply.toLowerCase()).toMatch(/uzmanlık|belirtilmiş/);
  });

  it("5. Missing specialization → transparently cannot verify", () => {
    const reply = buildVerifiedClinicFactReply({
      kind: "expertise",
      locale: "en",
      clinicName: "Clinic A",
      doctorCount: null,
      offersTreatment: false,
      explicitSpecialization: false,
      treatmentLabel: "cardiology",
    });
    expect(reply.verified).toBe(false);
    expect(reply.reply.toLowerCase()).toMatch(/cannot verify/);
  });

  it("6. Missing clinic fact → no unsupported marketing fallback", () => {
    const reply = buildVerifiedClinicFactReply({
      kind: "doctor_count",
      locale: "tr",
      clinicName: "Clinic A",
      doctorCount: null,
    });
    expect(containsUnsupportedClinicMarketingClaim(reply.reply)).toBe(false);
    expect(
      containsUnsupportedClinicMarketingClaim(
        "Ancak klinik, alanında uzman bir ekip ile hizmet vermektedir."
      )
    ).toBe(true);
  });

  it("7. Information available in clinic record → context builder does not omit doctorCount", () => {
    const result = buildAgencyGroundedContext({
      agencyId: "ag1",
      userMessage: "Tema Clinic kaç doktor?",
      clinics: [
        {
          id: "c1",
          clinicName: "Tema Clinic",
          status: "active",
          doctorCount: 7,
          shortDescription: "Dental clinic",
          treatmentCategories: ["dental"],
        },
      ],
      doctors: [
        {
          id: "d1",
          clinicId: "c1",
          fullName: "Dr. Ada",
          isActive: true,
          isPublic: true,
        },
      ],
    });
    expect(result.contextText).toContain("Verified doctorCount field: 7");
    expect(result.contextText).toContain("Dr. Ada");
    expect(result.contextText).toMatch(/NOT automatic proof of specialization/i);
  });

  it("legacy doctor active:true without status is listable", () => {
    expect(isDoctorActivelyListed({ active: true, name: "Dr X" })).toBe(true);
    expect(isDoctorActivelyListed({ status: "active", name: "Dr Y" })).toBe(true);
    expect(isDoctorActivelyListed({ status: "inactive", name: "Dr Z" })).toBe(false);
    expect(isDoctorActivelyListed({ active: true, showOnPublicProfile: false })).toBe(
      false
    );
  });

  it("overview object does not stringify to [object Object]", () => {
    const text = resolveClinicNarrativeText({
      overview: { summary: "Modern surgical center", specialties: ["aesthetic"] },
      shortDescription: "ignored when overview object present",
    });
    expect(text).toContain("Modern surgical center");
    expect(text).not.toContain("[object Object]");
  });
});

describe("Conversation UX — informational digression", () => {
  it("8. Simple clinic fact question is an informational interruption", () => {
    const dig = isAgencyInformationalInterruption("BHT Tema’da kaç doktor var?", {
      workflowActive: true,
    });
    expect(dig.isInterruption).toBe(true);
    expect(detectClinicFactKind("BHT Tema’da kaç doktor var?")).toBe("doctor_count");
    expect(isClinicFactInformationTurn("How many doctors at this clinic?")).toBe(true);
  });

  it("16. TR and EN doctor-count detection are equivalent", () => {
    expect(detectClinicFactKind("kaç doktor var")).toBe("doctor_count");
    expect(detectClinicFactKind("How many doctors are there?")).toBe("doctor_count");
    const tr = buildVerifiedClinicFactReply({
      kind: "doctor_count",
      locale: "tr",
      clinicName: "Clinic",
      doctorCount: { count: 3, source: "doctor_records" },
    });
    const en = buildVerifiedClinicFactReply({
      kind: "doctor_count",
      locale: "en",
      clinicName: "Clinic",
      doctorCount: { count: 3, source: "doctor_records" },
    });
    expect(tr.reply).toContain("3");
    expect(en.reply).toContain("3");
  });

  it("17. No clinic-specific hardcoding required", () => {
    const a = buildVerifiedClinicFactReply({
      kind: "doctor_count",
      locale: "en",
      clinicName: "Any Clinic Alpha",
      doctorCount: { count: 2, source: "doctorCount" },
    });
    const b = buildVerifiedClinicFactReply({
      kind: "doctor_count",
      locale: "en",
      clinicName: "Any Clinic Beta",
      doctorCount: { count: 2, source: "doctorCount" },
    });
    expect(a.reply).toContain("Any Clinic Alpha");
    expect(b.reply).toContain("Any Clinic Beta");
    expect(a.reply.replace("Any Clinic Alpha", "X")).toBe(
      b.reply.replace("Any Clinic Beta", "X")
    );
  });
});
