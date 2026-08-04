import { describe, it, expect } from "vitest";
import {
  getGroupIntakePrompt,
  evaluateFeelinHealthyIntake,
  pickStaticGroup1Example,
} from "../lib/agency/feelinhealthyConfig";

const PATIENT = {
  patientName: "Alper Özgül",
  firstName: "Alper",
  lastName: "Özgül",
  patientAge: 27,
  age: 27,
  patientGender: "Erkek",
  gender: "Erkek",
  patientEmail: "alper@clinicbridge-ai.com",
  patientPhone: "+905551112233",
  patientCountry: "Türkiye",
  travelDate: "Ağustos 2026",
};

describe("Intake example privacy", () => {
  it("Group 1 examples are only from the static international pool", () => {
    for (let i = 0; i < 20; i++) {
      const example = pickStaticGroup1Example("tr");
      expect(["John Smith, Erkek, 42", "Emma Johnson, Kadın, 35"]).toContain(example);
      expect(example).not.toContain("Alper");
      expect(example).not.toContain("Özgül");
    }
  });

  it("Group 1 prompt never embeds patient name, age or gender from context", () => {
    const status = evaluateFeelinHealthyIntake({});
    const prompt = getGroupIntakePrompt(status, PATIENT, "tr");

    expect(prompt).toMatch(/Örnek: "(John Smith, Erkek, 42|Emma Johnson, Kadın, 35)"/);
    expect(prompt).not.toContain("Alper");
    expect(prompt).not.toContain("Özgül");
    expect(prompt).not.toContain("27");
  });

  it("Group 2 example is static and never uses patient contact fields", () => {
    const status = evaluateFeelinHealthyIntake({
      patientName: PATIENT.patientName,
      patientAge: PATIENT.patientAge,
      patientGender: PATIENT.patientGender,
    });
    const prompt = getGroupIntakePrompt(status, PATIENT, "tr");

    expect(prompt).toContain("john.smith@email.com");
    expect(prompt).toContain("+44 7700 900123");
    expect(prompt).toContain("United Kingdom");
    expect(prompt).not.toContain(PATIENT.patientEmail);
    expect(prompt).not.toContain(PATIENT.patientPhone);
    expect(prompt).not.toContain(PATIENT.patientCountry);
  });

  it("Group 3 example is static and never uses the patient's travel date", () => {
    const status = evaluateFeelinHealthyIntake({
      patientName: PATIENT.patientName,
      patientAge: PATIENT.patientAge,
      patientGender: PATIENT.patientGender,
      patientEmail: PATIENT.patientEmail,
      patientPhone: PATIENT.patientPhone,
      patientCountry: PATIENT.patientCountry,
    });
    // Group 3 is current when travelDate is still missing
    expect(status.currentGroup).toBe(3);

    const prompt = getGroupIntakePrompt(status, { ...PATIENT, travelDate: undefined }, "tr");
    expect(prompt).toContain("Ekim 2026");
    expect(prompt).not.toContain("Ağustos 2026");
  });

  it("English Group 1 examples stay generic", () => {
    const status = evaluateFeelinHealthyIntake({});
    const prompt = getGroupIntakePrompt(status, PATIENT, "en");
    expect(prompt).toMatch(/For example: "(John Smith, Male, 42|Emma Johnson, Female, 35)"/);
    expect(prompt).not.toContain("Alper");
  });
});
