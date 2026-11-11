/**
 * IntentRouter.isEmergency coverage across tr/en/de/fr/ar/ru: realistic post-treatment
 * emergencies must be caught; booking, pricing, side-effect and medical-history questions must not.
 */
import { describe, expect, it } from "vitest";
import { IntentRouter } from "@/lib/conversation/intentRouter";
import {
  EMERGENCY_CATEGORIES,
  EMERGENCY_MESSAGES,
  EMERGENCY_VARIANTS,
  NON_EMERGENCY_MESSAGES,
} from "./emergencyCorpus";

const detect = (message: string) => IntentRouter.isEmergency(message.toLowerCase());
const LANGUAGES = ["tr", "en", "de", "fr", "ar", "ru"] as const;

describe("isEmergency: post-treatment emergencies by category", () => {
  for (const lang of LANGUAGES) {
    describe(lang, () => {
      it.each(EMERGENCY_CATEGORIES.flatMap((category) => EMERGENCY_MESSAGES[lang][category].map((m) => [category, m])))(
        "%s: %s",
        (_category, message) => {
          expect(detect(message)).toBe(true);
        }
      );
    });
  }

  it("every language covers every category", () => {
    for (const lang of LANGUAGES) {
      for (const category of EMERGENCY_CATEGORIES) {
        expect(EMERGENCY_MESSAGES[lang][category].length).toBeGreaterThan(0);
      }
    }
  });
});

describe("isEmergency: free-form variants", () => {
  for (const lang of LANGUAGES) {
    it.each(EMERGENCY_VARIANTS[lang])(`${lang}: %s`, (message) => {
      expect(detect(message)).toBe(true);
    });
  }
});

describe("isEmergency: no false positives", () => {
  for (const lang of LANGUAGES) {
    it.each(NON_EMERGENCY_MESSAGES[lang])(`${lang}: %s`, (message) => {
      expect(detect(message)).toBe(false);
    });
  }
});

describe("isEmergency: boundaries and tiers", () => {
  it("matches whole words only, including non-Latin scripts", () => {
    expect(detect("Kanamalı diş eti")).toBe(false);
    expect(detect("Halsschmerzen seit gestern")).toBe(false);
    expect(detect("painless implant")).toBe(false);
    expect(detect("Боль невыносимая")).toBe(true);
    expect(detect("وأغمي علي")).toBe(true);
  });

  it("acute symptoms win over expected-side-effect wording", () => {
    expect(detect("Is it normal that I can't breathe?")).toBe(true);
    expect(detect("İmplanttan sonra yüzüm şişti, nefes alamıyorum, normal mi?")).toBe(true);
    expect(detect("Is some swelling of the face normal?")).toBe(false);
  });

  it("generic emergency words exclude booking and contact phrasing but keep clinical context", () => {
    expect(detect("This is an emergency")).toBe(true);
    expect(detect("What is your emergency number?")).toBe(false);
    expect(detect("Acil temsilci istiyorum ama şiddetli kanama var")).toBe(true);
    expect(detect("Acil tedavi gerekiyor")).toBe(true);
  });

  it("fever needs a number of 39 °C or more next to a fever word", () => {
    expect(detect("Ateşim 39.2")).toBe(true);
    expect(detect("Fever of 103 F since last night")).toBe(true);
    expect(detect("Ateşim 37.5")).toBe(false);
    expect(detect("39 yaşındayım, implant fiyatı nedir")).toBe(false);
  });
});
