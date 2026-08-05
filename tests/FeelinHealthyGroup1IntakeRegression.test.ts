import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { SlotExtractor, looksLikeRequestPhrase } from "../lib/conversation/slotExtractor";
import {
  evaluateFeelinHealthyIntake,
  getGroupIntakePrompt,
} from "../lib/agency/feelinhealthyConfig";

const REPO_ROOT = resolve(__dirname, "..");
const MATCHING_CHAT_ROUTE = "app/api/public/agency/[slug]/matching-chat/route.ts";
const routeSource = readFileSync(resolve(REPO_ROOT, MATCHING_CHAT_ROUTE), "utf8");

/** Extraction as the demo performs it outside Group 1 (no name expected). */
const extract = (message: string) =>
  SlotExtractor.extractSlots(message, {}, "tr").extracted;

/** Extraction while Group 1 is open, where a bare name is a valid answer. */
const extractDuringGroup1 = (message: string) =>
  SlotExtractor.extractSlots(message, {}, "tr", "Europe/Istanbul", "patientName").extracted;

const TREATMENT_REQUESTS = [
  "İstanbul'da implant yaptırmak istiyorum.",
  "İstanbul'da implant yaptırmak istiyorum",
  "implant yaptırmak istiyorum",
  "Saç ekimi yaptırmak istiyorum",
  "Diş tedavisi olmak istiyorum",
  "Burun estetiği olmak istiyorum",
  "Zirkonyum kaplama yaptırmak istiyorum",
];

describe("FeelinHealthy Group 1 intake regression", () => {
  describe("A treatment request is never patient information", () => {
    it.each(TREATMENT_REQUESTS)("extracts no name from %j", (message) => {
      const outside = extract(message);
      expect(outside.patientName).toBeUndefined();
      expect(outside.firstName).toBeUndefined();
      expect(outside.lastName).toBeUndefined();

      // Even while Group 1 is open the request must not become a name.
      const during = extractDuringGroup1(message);
      expect(during.patientName).toBeUndefined();
      expect(during.firstName).toBeUndefined();
    });

    it("keeps the pending request usable for treatment matching", () => {
      const extracted = extract("İstanbul'da implant yaptırmak istiyorum.");
      expect(extracted.treatment).toBe("implant");
      expect(extracted.patientName).toBeUndefined();
    });

    it("classifies request phrasing so a model-supplied name can be rejected", () => {
      expect(looksLikeRequestPhrase("implant yaptırmak istiyorum")).toBe(true);
      expect(looksLikeRequestPhrase("Diş tedavisi olmak istiyorum")).toBe(true);
      expect(looksLikeRequestPhrase("randevu almak istiyorum")).toBe(true);
      expect(looksLikeRequestPhrase("Alper Özgül")).toBe(false);
      expect(looksLikeRequestPhrase("Kemal Sunal")).toBe(false);
    });

    it("never fills an intake field from the replayed request in the route", () => {
      expect(routeSource).toContain("isReplayedTreatmentRequest = true");
      expect(routeSource).toContain("if (!isReplayedTreatmentRequest && !structuredLocationAction) {");
      expect(routeSource).toContain("!looksLikeRequestPhrase(parsed.patientName)");
    });

    it("still resolves treatment and location from the replayed request", () => {
      const guardStart = routeSource.indexOf(
        "if (!isReplayedTreatmentRequest && !structuredLocationAction) {"
      );
      const treatmentAssign = routeSource.indexOf("ctx.lastTreatmentCategory =");
      expect(treatmentAssign).toBeGreaterThan(-1);
      expect(treatmentAssign).toBeLessThan(guardStart);
    });
  });

  describe("Group 1 collects first name, surname, gender and age", () => {
    it("asks for all four fields when nothing is known", () => {
      const status = evaluateFeelinHealthyIntake({});
      const promptTr = getGroupIntakePrompt(status, {}, "tr");

      expect(promptTr).toContain("adınızı");
      expect(promptTr).toContain("soyadınızı");
      expect(promptTr).toContain("cinsiyetinizi");
      expect(promptTr).toContain("yaşınızı");
    });

    it("still asks for age/gender when only the name is known", () => {
      const ctx = { patientName: "Alper Özgül" };
      const status = evaluateFeelinHealthyIntake(ctx);
      const promptTr = getGroupIntakePrompt(status, ctx, "tr");

      expect(status.currentGroup).toBe(1);
      expect(promptTr).toContain("yaşınızı");
      expect(promptTr).toContain("cinsiyetinizi");
      expect(promptTr).not.toContain("tek bir mesajda");
    });

    it("asks for all four fields in English too", () => {
      const promptEn = getGroupIntakePrompt(evaluateFeelinHealthyIntake({}), {}, "en");
      expect(promptEn.toLowerCase()).toContain("first name");
      expect(promptEn.toLowerCase()).toContain("surname");
      expect(promptEn.toLowerCase()).toContain("gender");
      expect(promptEn.toLowerCase()).toContain("age");
    });

    it("never asks for a budget", () => {
      const promptTr = getGroupIntakePrompt(evaluateFeelinHealthyIntake({}), {}, "tr");
      expect(promptTr.toLowerCase()).not.toContain("bütçe");
      expect(promptTr.toLowerCase()).not.toContain("budget");
    });

    it("treats a lone first name as incomplete", () => {
      const status = evaluateFeelinHealthyIntake({ patientName: "Alper" });
      expect(status.group1Complete).toBe(false);
      expect(status.missingFieldsInCurrentGroup).toContain("patientName");
    });

    it("accepts a first name and surname supplied separately", () => {
      const status = evaluateFeelinHealthyIntake({
        firstName: "Alper",
        lastName: "Özgül",
        patientAge: 27,
        patientGender: "male",
      });
      expect(status.group1Complete).toBe(true);
    });

    it("does not treat a treatment request stored as a name as a complete name", () => {
      // Defence in depth: even if legacy session data carries this value, the
      // group cannot complete without age and gender.
      const status = evaluateFeelinHealthyIntake({
        patientName: "implant yaptırmak istiyorum",
      });
      expect(status.group1Complete).toBe(false);
      expect(status.currentGroup).toBe(1);
    });
  });

  describe("A genuine Group 1 answer is understood", () => {
    it.each([
      ["Alper Özgül, Erkek, 27", "Alper Özgül", 27, "male"],
      ["Alper Özgül - 27 - Erkek", "Alper Özgül", 27, "male"],
      ["Ayşe Yılmaz, Kadın, 34", "Ayşe Yılmaz", 34, "female"],
    ])("parses %j in a single message", (message, name, age, gender) => {
      const extracted = extract(message as string);
      expect(extracted.patientName).toBe(name);
      expect(extracted.patientAge).toBe(age);
      expect(extracted.patientGender).toBe(gender);
    });

    it("completes Group 1 from one combined message", () => {
      const extracted = extract("Alper Özgül, Erkek, 27");
      const status = evaluateFeelinHealthyIntake(extracted);

      expect(status.group1Complete).toBe(true);
      expect(status.currentGroup).toBe(2);
    });

    it("accepts an explicitly introduced name", () => {
      expect(extract("Adım Alper Özgül").patientName).toBe("Alper Özgül");
    });

    it("accepts a bare name while Group 1 is open", () => {
      expect(extractDuringGroup1("Alper Özgül").patientName).toBe("Alper Özgül");
    });

    it("asks the extractor for a name only while Group 1 is open", () => {
      expect(routeSource).toContain("let expectedIntakeSlot");
      expect(routeSource).toContain('expectedIntakeSlot = "patientName"');
      expect(routeSource).toContain("shouldAllowLlmAssistForIntakeGate");
    });
  });

  describe("Untouched behaviour", () => {
    it("leaves the KVKK consent gate in place", () => {
      expect(routeSource).toContain("privacy_consent_response");
      expect(routeSource).toContain("ctx.pendingUserMessage = finalMessage || message");
      expect(routeSource).toContain("sessionContext.quoteConsent = true");
    });

    it("leaves the Istanbul side clarification in place", () => {
      expect(routeSource).toContain("side_selection");
      expect(routeSource).toContain("istanbul_side");
    });

    it("keeps Group 2 and Group 3 field sets unchanged", () => {
      const group2 = evaluateFeelinHealthyIntake({
        patientName: "Alper Özgül",
        patientAge: 27,
        patientGender: "male",
      });
      expect(group2.currentGroup).toBe(2);
      expect(group2.missingFieldsInCurrentGroup).toEqual([
        "patientEmail",
        "patientPhone",
        "patientCountry",
      ]);

      const group3 = evaluateFeelinHealthyIntake({
        patientName: "Alper Özgül",
        patientAge: 27,
        patientGender: "male",
        patientEmail: "a@b.com",
        patientPhone: "+905551112233",
        patientCountry: "Türkiye",
      });
      expect(group3.currentGroup).toBe(3);
      expect(group3.missingFieldsInCurrentGroup).toEqual(["travelDate"]);
    });
  });
});
