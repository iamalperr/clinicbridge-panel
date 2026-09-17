/**
 * Global conversation-language consistency.
 *
 * Guards the production defect where a Russian patient asked "Есть WhatsApp?"
 * and received an English contact reply because:
 * 1) Cyrillic was not detected,
 * 2) widget requestLanguage=en became the active locale,
 * 3) deterministic formatContactResponse used that English locale.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  detectTextLanguage,
  detectTextLanguageWithMeta,
  resolveConversationLocaleWithMeta,
  formatContactResponse,
  formatLiveSupportHandoff,
  formatPricingFallback,
  isLanguageAmbiguousMessage,
  IntentRouter,
} from "../lib/conversation";
import { validateAppointmentDateOnly } from "../lib/appointment/appointmentDateTimePolicy";
import type { WeeklySchedule } from "../lib/skills/ClinicWorkingHoursResolver";

const HOURS: WeeklySchedule = {
  monday: ["10:00", "19:00"],
  tuesday: ["10:00", "19:00"],
  wednesday: ["10:00", "19:00"],
  thursday: ["10:00", "19:00"],
  friday: ["10:00", "19:00"],
  saturday: ["10:00", "17:00"],
  sunday: null,
};

function turn(params: {
  message: string;
  persisted?: string;
  requestLanguage?: string;
  history?: Array<{ role: string; content: string }>;
  clinicDefault?: string;
}) {
  return resolveConversationLocaleWithMeta({
    currentMessage: params.message,
    persistedLocale: params.persisted,
    requestLanguage: params.requestLanguage ?? "en",
    history: params.history,
    clinicDefaultLocale: params.clinicDefault ?? "tr",
  });
}

describe("Conversation language policy — production Russian WhatsApp case", () => {
  it("1. RU long sentence then Есть WhatsApp? stays Russian for contact reply", () => {
    const first = turn({
      message: "Запишитесь на прием",
      requestLanguage: "en",
      clinicDefault: "tr",
    });
    expect(first.locale).toBe("ru");
    expect(first.source).toBe("message_detected");

    const second = turn({
      message: "Есть WhatsApp?",
      persisted: first.locale,
      requestLanguage: "en",
      history: [{ role: "user", content: "Запишитесь на прием" }],
    });
    expect(second.locale).toBe("ru");
    const reply = formatContactResponse("+90 535 660 51 37", "whatsapp", second.locale);
    expect(reply).toMatch(/Команда клиники|WhatsApp/i);
    expect(reply).not.toMatch(/Our clinic team is available/i);
  });

  it("2. User RU then WhatsApp? stays RU", () => {
    const res = turn({ message: "WhatsApp?", persisted: "ru", requestLanguage: "en" });
    expect(res.locale).toBe("ru");
    expect(res.source).toBe("persisted");
  });

  it("3. User RU then Да stays RU", () => {
    expect(turn({ message: "Да", persisted: "ru" }).locale).toBe("ru");
  });

  it("4. User RU then phone number only stays RU", () => {
    expect(turn({ message: "+90 535 660 51 37", persisted: "ru" }).locale).toBe("ru");
  });

  it("5. User TR then WhatsApp? stays TR", () => {
    expect(turn({ message: "WhatsApp?", persisted: "tr", requestLanguage: "en" }).locale).toBe("tr");
  });

  it("6. User DE then WhatsApp? stays DE", () => {
    expect(turn({ message: "WhatsApp?", persisted: "de", requestLanguage: "en" }).locale).toBe("de");
  });

  it("7. User AR then date only stays AR", () => {
    expect(turn({ message: "2026-08-30", persisted: "ar" }).locale).toBe("ar");
  });

  it("8. Explicit English switch from RU is accepted", () => {
    const res = turn({
      message: "Can we continue in English?",
      persisted: "ru",
      requestLanguage: "tr",
    });
    expect(res.locale).toBe("en");
    expect(res.source).toBe("explicit_switch");
    expect(res.switchAccepted).toBe(true);
  });

  it("9. After explicit EN switch, WhatsApp? stays EN", () => {
    expect(turn({ message: "WhatsApp?", persisted: "en" }).locale).toBe("en");
    const reply = formatContactResponse("+90 535 660 51 37", "whatsapp", "en");
    expect(reply).toMatch(/Our clinic team/i);
  });

  it("10. Deterministic appointment validation uses active conversation language", () => {
    const res = validateAppointmentDateOnly({
      localDate: "2026-08-30",
      clinicTimeZone: "Europe/Istanbul",
      now: new Date("2026-08-29T07:00:00.000Z"),
      workingHours: HOURS,
      locale: "ru",
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("CLOSED_DAY");
    expect(res.message).toMatch(/Клиника закрыта|закрыта/i);
    expect(res.message).not.toMatch(/Our clinic team|The clinic is closed on Sunday/i);
  });

  it("11. Contact/WhatsApp response uses active conversation language", () => {
    expect(formatContactResponse("+1", "whatsapp", "ru")).toMatch(/Команда клиники/);
    expect(formatContactResponse("+1", "whatsapp", "tr")).toMatch(/Klinik ekibimize/);
    expect(formatContactResponse("+1", "whatsapp", "de")).toMatch(/Klinikteam/);
    expect(formatLiveSupportHandoff({ clinicName: "İDA", contactNumber: "+1", locale: "ru" })).toMatch(
      /WhatsApp/
    );
    expect(formatLiveSupportHandoff({ clinicName: "İDA", contactNumber: "+1", locale: "ru" })).not.toMatch(
      /Of course\. You can contact/
    );
  });

  it("12. Generic pricing fallback uses active conversation language", () => {
    expect(formatPricingFallback("implant", "ru")).toMatch(/прайс|клиник/i);
    expect(formatPricingFallback("implant", "en")).toMatch(/verified list price/i);
  });

  it("13. Short ambiguous message never resets established language to English", () => {
    for (const msg of ["WhatsApp?", "Да", "Нет", "ok", "👍", "+905551112233", "30.08"]) {
      const res = turn({ message: msg, persisted: "ru", requestLanguage: "en" });
      expect(res.locale, msg).toBe("ru");
      expect(res.locale, msg).not.toBe("en");
    }
  });

  it("14. Mixed message with WhatsApp proper noun preserves established language", () => {
    const res = turn({
      message: "Есть WhatsApp?",
      persisted: "ru",
      requestLanguage: "en",
    });
    expect(res.locale).toBe("ru");
    // Script detection may reaffirm RU; must not flip to EN because of the brand token.
    expect(res.locale).not.toBe("en");
  });

  it("language does not oscillate across multiple short turns", () => {
    let locale = turn({ message: "Запишитесь на прием", requestLanguage: "en" }).locale;
    expect(locale).toBe("ru");
    for (const msg of ["Есть WhatsApp?", "Да", "Спасибо", "WhatsApp?", "ок"]) {
      locale = turn({ message: msg, persisted: locale, requestLanguage: "en" }).locale;
      expect(locale).toBe("ru");
    }
  });
});

describe("Language detector scripts and ambiguity", () => {
  it("detects Cyrillic as Russian with high confidence", () => {
    const d = detectTextLanguageWithMeta("Запишитесь на прием");
    expect(d.locale).toBe("ru");
    expect(d.confidence).toBe("high");
    expect(d.source).toBe("script");
  });

  it("detects Arabic script", () => {
    expect(detectTextLanguage("هل لديكم واتساب؟")).toBe("ar");
  });

  it("treats WhatsApp? as ambiguous", () => {
    expect(isLanguageAmbiguousMessage("WhatsApp?")).toBe(true);
    expect(detectTextLanguageWithMeta("WhatsApp?").ambiguous).toBe(true);
  });

  it("does not let widget English override first Russian message", () => {
    const meta = resolveConversationLocaleWithMeta({
      requestLanguage: "en",
      currentMessage: "Запишитесь на прием",
      clinicDefaultLocale: "tr",
    });
    expect(meta.locale).toBe("ru");
    expect(meta.reason).toMatch(/message_detected:ru/);
  });
});

describe("Intent + contact path wiring", () => {
  it("classifies Есть WhatsApp? as a contact/live-support style intent", () => {
    const res = IntentRouter.classifyConversationIntent({
      message: "Есть WhatsApp?",
      currentState: "INITIAL",
      locale: "ru",
    });
    expect(["contact_request", "live_support_request"]).toContain(res.intent);
  });

  it("chat route persists conversationLocale every turn and uses formatLiveSupportHandoff", () => {
    const route = [
      readFileSync(join(process.cwd(), "app/api/public/chat/route.ts"), "utf8"),
      readFileSync(join(process.cwd(), "lib/agent/handleClinicAgentTurn.ts"), "utf8"),
      readFileSync(join(process.cwd(), "lib/agent/persistence.ts"), "utf8"),
    ].join("\n");
    expect(route).toContain("formatLiveSupportHandoff");
    expect(route).toContain("languageResolutionLogFields");
    expect(route).toContain("logData.conversationLocale");
    expect(route).toContain("LANGUAGE INVARIANT");
    expect(route).toContain("CONTACT_RESPONSE_LANGUAGE");
  });
});
