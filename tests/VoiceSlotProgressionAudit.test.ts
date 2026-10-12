/**
 * Premium voice conversation layer — slot progression regressions.
 *
 * Real staff call: after "Randevu kaydını oluşturabilmem için adınızı ve soyadınızı paylaşabilir
 * misiniz?" the caller answered with a plain full name three times; every turn stayed in
 * COLLECTING_NAME with the identical prompt and no patientName. Root cause: STT terminal
 * punctuation ("Yusuf Alper Özgül.") failed the letters-only name parsers, and nothing stopped
 * the same prompt from repeating. These tests were first written as DEFECT reproductions and
 * now pin the corrected behavior: typed slot parsing, atomic draft transitions, next prompt
 * from the new state, bounded retry with a draft-preserving handoff offer, and speech-only
 * presentation of written abbreviations.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IntentRouter } from "@/lib/conversation/intentRouter";
import { SlotExtractor, looksLikeRequestPhrase } from "@/lib/conversation/slotExtractor";
import { parseFullNameSlot, parsePhoneSlot, toSlotInput } from "@/lib/conversation/slotParsing";
import { ConversationStateEngine } from "@/lib/conversation/stateEngine";
import { applyAppointmentSchedulingAmendment } from "@/lib/conversation/appointmentSchedulingAmendment";
import { renderVoiceSpeech } from "@/lib/voice/telephony/renderVoiceSpeech";
import type { WeeklySchedule } from "@/lib/skills/ClinicWorkingHoursResolver";
import { RequestTimer } from "@/lib/performance/requestTimer";
import { evaluateFeelinHealthyIntake } from "@/lib/agency/feelinhealthyConfig";
import {
  classifyAppointmentCancellationTurn,
  containsUnverifiedCancellationClaim,
} from "@/lib/agent/appointmentCancellation";
import { isLiveAgentRequest, isPatientContactHandoffIntent } from "@/lib/contact-request/intent";

const TZ = "Europe/Istanbul";
/** Monday 12 Oct 2026, 13:00 Istanbul */
const NOW = new Date("2026-10-12T10:00:00.000Z");
const HOURS: WeeklySchedule = {
  monday: ["10:00", "19:00"],
  tuesday: ["10:00", "19:00"],
  wednesday: ["10:00", "19:00"],
  thursday: ["10:00", "19:00"],
  friday: ["10:00", "19:00"],
  saturday: ["10:00", "17:00"],
  sunday: null,
};
const WIDE_HOURS: WeeklySchedule = {
  monday: ["08:00", "23:00"],
  tuesday: ["08:00", "23:00"],
  wednesday: ["08:00", "23:00"],
  thursday: ["08:00", "23:00"],
  friday: ["08:00", "23:00"],
  saturday: ["08:00", "23:00"],
  sunday: null,
};
const WEB_NAME_PROMPT = "Randevu kaydını oluşturabilmem için adınızı ve soyadınızı paylaşabilir misiniz?";
const SPOKEN_PHONE = "sıfır beş yüz otuz iki iki yüz doksan bir kırk beş altmış yedi";
const AMBIGUOUS_SPOKEN_PHONE = "sıfır beş yüz otuz iki yüz yirmi üç kırk beş altmış yedi";

const routeName = (message: string) =>
  IntentRouter.classifyConversationIntent({
    message,
    currentState: "APPOINTMENT_COLLECTION",
    expectedSlot: "fullName",
    collectedSlots: { treatment: "Diş İmplantı", preferredDate: "2026-10-16", preferredTime: "14:00" },
    locale: "tr",
    now: NOW,
  });

const routeSlot = (
  message: string,
  expectedSlot: string,
  meridiem?: Parameters<typeof IntentRouter.classifyConversationIntent>[0]["meridiem"]
) =>
  IntentRouter.classifyConversationIntent({
    message,
    currentState: "APPOINTMENT_COLLECTION",
    expectedSlot,
    collectedSlots: {},
    locale: "tr",
    clinicTimeZone: TZ,
    now: NOW,
    meridiem,
  });

describe("full name: STT punctuation and natural intros", () => {
  it.each([
    ["Yusuf Alper Özgül.", "Yusuf Alper Özgül"],
    ["Yusuf Özgül.", "Yusuf Özgül"],
    ["Yusuf Alper Özgül?", "Yusuf Alper Özgül"],
    ["Ben Yusuf Alper Özgül", "Yusuf Alper Özgül"],
    ["Benim adım Yusuf Alper Özgül.", "Yusuf Alper Özgül"],
    ["Adım Yusuf Alper Özgül", "Yusuf Alper Özgül"],
    ["İsmim Yusuf Alper Özgül", "Yusuf Alper Özgül"],
    ["Evet, Yusuf Alper Özgül.", "Yusuf Alper Özgül"],
    ["Evet Yusuf Alper Özgül", "Yusuf Alper Özgül"],
    ["Tamam, Yusuf Alper Özgül", "Yusuf Alper Özgül"],
    ["Tabii ki Yusuf Alper Özgül", "Yusuf Alper Özgül"],
    ["Yusuf Alper Özgül efendim", "Yusuf Alper Özgül"],
    ["Yusuf Alper Özgül,", "Yusuf Alper Özgül"],
    ["yusuf alper özgül", "yusuf alper özgül"],
  ])("'%s' fills fullName = '%s' and continues the flow", (spoken, expected) => {
    const routed = routeName(spoken);
    expect(routed.intent).toBe("appointment_continuation");
    expect(routed.isInterruption).toBeFalsy();
    expect(routed.entities?.fullName).toBe(expected);
    expect(routed.slotOutcomes?.fullName?.status).toBe("filled");
    expect(SlotExtractor.parseName(spoken.trim())?.fullName).toBe(expected);
  });

  it("never truncates a three-word explicit name to two words", () => {
    expect(routeName("Adım Yusuf Alper Özgül").entities?.fullName).toBe("Yusuf Alper Özgül");
    expect(SlotExtractor.parseName("Adım Kemal Sunal")?.fullName).toBe("Kemal Sunal");
  });

  it("keeps Turkish letters and original casing (NFC)", () => {
    const decomposed = "Çağrı Işıl Öztürk".normalize("NFD");
    const result = parseFullNameSlot(toSlotInput(decomposed), { allowBare: true });
    expect(result.status).toBe("filled");
    expect(result.status === "filled" && result.value.fullName).toBe("Çağrı Işıl Öztürk");
  });

  it.each(["Yusuf", "adım yusuf", "Yusuf."])("single token '%s' is an explicit NAME_SINGLE_TOKEN, never stored", (spoken) => {
    const routed = routeName(spoken);
    expect(routed.entities?.fullName).toBeUndefined();
    expect(routed.slotOutcomes?.fullName).toEqual({ status: "rejected", reasonCode: "NAME_SINGLE_TOKEN" });
  });

  it.each(["randevu almak istiyorum", "implant yaptırmak istiyorum", "evet", "Cuma günü"])(
    "'%s' is never a name",
    (spoken) => {
      expect(routeName(spoken).entities?.fullName).toBeUndefined();
      expect(SlotExtractor.parseName(spoken)).toBeNull();
    }
  );

  it("a surname that is also a treatment keyword does not block the expected name", () => {
    const routed = routeName("Ahmet Kanal");
    expect(routed.entities?.fullName).toBe("Ahmet Kanal");
    expect(routed.entities?.treatment).toBeUndefined();
    // Outside name collection a treatment mention still blocks bare-name mining.
    const idle = IntentRouter.classifyConversationIntent({ message: "Kanal tedavisi", currentState: "INITIAL", locale: "tr", now: NOW });
    expect(idle.entities?.fullName).toBeUndefined();
    expect(idle.entities?.treatment).toBe("root_canal");
  });

  it("compatibility: looksLikeRequestPhrase keeps its contract", () => {
    expect(looksLikeRequestPhrase("implant yaptırmak istiyorum")).toBe(true);
    expect(looksLikeRequestPhrase("Alper Özgül")).toBe(false);
  });
});

describe("date: natural Turkish", () => {
  it.each([
    ["yarın", "2026-10-13"],
    ["öbür gün", "2026-10-14"],
    ["yarından sonra", "2026-10-14"],
    ["cuma", "2026-10-16"],
    ["önümüzdeki cuma", "2026-10-16"],
    ["ayın on ikisi", "2026-10-12"],
    ["ayın yirmisi", "2026-10-20"],
    ["12 Ekim", "2026-10-12"],
    ["12 Ekim 2026", "2026-10-12"],
  ])("'%s' → %s", (spoken, iso) => {
    const routed = routeSlot(spoken, "preferredDate");
    expect(routed.entities?.preferredDate).toBe(iso);
    expect(routed.slotOutcomes?.preferredDate?.status).toBe("filled");
  });

  it("a day of this month that already passed is ambiguous, never guessed", () => {
    const routed = routeSlot("ayın beşi", "preferredDate");
    expect(routed.entities?.preferredDate).toBeUndefined();
    expect(routed.slotOutcomes?.preferredDate).toEqual({ status: "ambiguous", reasonCode: "DATE_DAY_OF_MONTH_PASSED" });
    const amended = applyAppointmentSchedulingAmendment({
      message: "ayın beşi",
      draft: {},
      locale: "tr",
      clinicTimeZone: TZ,
      now: NOW,
      workingHours: HOURS,
      is24_7: false,
      expectedSlot: "preferredDate",
    });
    expect(amended.outcome).toBe("none");
    expect(amended.draft.requestedDate).toBeUndefined();
  });

  it("date validation is not bypassed: a past explicit date is still rejected", () => {
    const amended = applyAppointmentSchedulingAmendment({
      message: "5 Ekim 2026",
      draft: {},
      locale: "tr",
      clinicTimeZone: TZ,
      now: NOW,
      workingHours: HOURS,
      is24_7: false,
      expectedSlot: "preferredDate",
    });
    expect(amended.outcome).toBe("invalid");
  });
});

describe("time: natural Turkish with clinic hours", () => {
  const withHours = { workingHours: HOURS, is24_7: false };

  it.each([
    ["on dört", "14:00"],
    ["saat on dört", "14:00"],
    ["on dörtte", "14:00"],
    ["öğleden sonra iki", "14:00"],
    ["öğleden sonra ikide", "14:00"],
    ["iki buçuk", "14:30"],
    ["öğleden sonra iki buçuk", "14:30"],
    ["14", "14:00"],
    ["14:00", "14:00"],
    ["ikide", "14:00"],
    ["Öğleden sonra", "14:00"],
    ["öğleden sonra 2", "14:00"],
    ["akşam 6", "18:00"],
  ])("'%s' → %s", (spoken, time) => {
    expect(routeSlot(spoken, "preferredTime", withHours).entities?.preferredTime).toBe(time);
  });

  it("'iki buçuk' never silently becomes 02:30 when clinic hours are known", () => {
    const routed = routeSlot("iki buçuk", "preferredTime", withHours);
    expect(routed.entities?.preferredTime).toBe("14:30");
    expect(routed.slotOutcomes?.preferredTime?.reasonCode).toBe("TIME_MERIDIEM_FROM_HOURS");
  });

  it("both readings plausible → ambiguous with both candidates, nothing stored", () => {
    const routed = routeSlot("saat dokuz", "preferredTime", { workingHours: WIDE_HOURS, is24_7: false });
    expect(routed.entities?.preferredTime).toBeUndefined();
    expect(routed.slotOutcomes?.preferredTime).toEqual({
      status: "ambiguous",
      reasonCode: "TIME_MERIDIEM_AMBIGUOUS",
      candidates: ["09:00", "21:00"],
    });
    const twentyFourSeven = routeSlot("iki buçuk", "preferredTime", { is24_7: true });
    expect(twentyFourSeven.entities?.preferredTime).toBeUndefined();
    expect(twentyFourSeven.slotOutcomes?.preferredTime?.candidates).toEqual(["02:30", "14:30"]);
  });

  it("a daypart reply picks one of the offered candidates", () => {
    const pending = { workingHours: WIDE_HOURS, is24_7: false, pendingCandidates: ["09:00", "21:00"] };
    expect(routeSlot("akşam", "preferredTime", pending).entities?.preferredTime).toBe("21:00");
    expect(routeSlot("sabah", "preferredTime", pending).entities?.preferredTime).toBe("09:00");
    expect(routeSlot("21:00", "preferredTime", pending).entities?.preferredTime).toBe("21:00");
  });

  it("the ambiguity survives the scheduling amendment's own re-extraction", () => {
    const amended = applyAppointmentSchedulingAmendment({
      message: "saat dokuz",
      draft: { requestedDate: "2026-10-16" },
      locale: "tr",
      clinicTimeZone: TZ,
      now: NOW,
      workingHours: WIDE_HOURS,
      is24_7: false,
      expectedSlot: "preferredTime",
      meridiem: { workingHours: WIDE_HOURS, is24_7: false },
    });
    expect(amended.outcome).toBe("none");
    expect(amended.draft.requestedTime).toBeUndefined();
  });

  it("no ASCII-only word boundaries: 'Öğleden sonra' and 'ogleden sonra' agree", () => {
    expect(routeSlot("Öğleden sonra", "preferredTime").entities?.preferredTime).toBe(
      routeSlot("ogleden sonra", "preferredTime").entities?.preferredTime
    );
  });
});

describe("phone: deterministic and ambiguity-safe", () => {
  it("typed and uniquely spoken numbers resolve", () => {
    expect(routeSlot("0532 291 45 67", "phone").entities?.phone).toBe("+90 532 291 45 67");
    const spoken = routeSlot(SPOKEN_PHONE, "phone");
    expect(spoken.entities?.phone).toBe("+90 532 291 45 67");
    expect(spoken.slotOutcomes?.phone?.reasonCode).toBe("PHONE_SPOKEN");
  });

  it("competing groupings are ambiguous and are never silently converted", () => {
    const routed = routeSlot(AMBIGUOUS_SPOKEN_PHONE, "phone");
    expect(routed.entities?.phone).toBeUndefined();
    expect(routed.slotOutcomes?.phone).toEqual({ status: "ambiguous", reasonCode: "PHONE_AMBIGUOUS_GROUPING" });
    expect(SlotExtractor.parsePhone(AMBIGUOUS_SPOKEN_PHONE)).toBeNull();
    const typed = parsePhoneSlot(toSlotInput(AMBIGUOUS_SPOKEN_PHONE));
    expect(typed.status).toBe("ambiguous");
    expect(typed.status === "ambiguous" && typed.candidates).toEqual(["+90 530 223 45 67", "+90 532 123 45 67"]);
  });

  it("incomplete numbers are rejected, never completed", () => {
    expect(routeSlot("sıfır beş yüz otuz bir iki yüz doksan", "phone").entities?.phone).toBeUndefined();
  });
});

describe("email: existing policy preserved", () => {
  it("dictated, normal, refusal and malformed", () => {
    expect(routeSlot("Yusuf nokta alper et gmail nokta com.", "email").entities?.email).toBe("yusuf.alper@gmail.com");
    expect(routeSlot("yusuf@example.org", "email").entities?.email).toBe("yusuf@example.org");
    const declined = routeSlot("istemiyorum", "email");
    expect(declined.entities?.emailDeclined).toBe(true);
    expect(declined.slotOutcomes?.email).toEqual({ status: "declined", reasonCode: "EMAIL_DECLINED" });
    expect(routeSlot("yusuf@gmail", "email").slotOutcomes?.email?.reasonCode).toBe("EMAIL_MALFORMED");
  });
});

describe("multi-slot natural utterances", () => {
  it("treatment + date + time + name from one sentence", () => {
    const r = IntentRouter.classifyConversationIntent({
      message: "İmplant için önümüzdeki cuma öğleden sonra iki gibi gelmek istiyorum. Adım Yusuf Alper Özgül.",
      currentState: "INITIAL",
      collectedSlots: {},
      locale: "tr",
      clinicTimeZone: TZ,
      now: NOW,
      meridiem: { workingHours: HOURS, is24_7: false },
    });
    expect(r.entities?.treatment).toBe("implant");
    expect(r.entities?.preferredDate).toBe("2026-10-16");
    expect(r.entities?.preferredTime).toBe("14:00");
    expect(r.entities?.fullName).toBe("Yusuf Alper Özgül");
  });

  it("name + spoken phone in the name turn", () => {
    const r = routeName(`Yusuf Alper Özgül, telefonum ${SPOKEN_PHONE}`);
    expect(r.intent).toBe("appointment_continuation");
    expect(r.entities?.fullName).toBe("Yusuf Alper Özgül");
    expect(r.entities?.phone).toBe("+90 532 291 45 67");
  });
});

describe("appointment cancellation classification (no active draft)", () => {
  const onRecord = { submittedOnRecord: true };
  it.each([
    ["Randevumu iptal etmek istiyorum.", "request"],
    ["Randevuyu iptal et", "request"],
    ["Randevumu iptal edebilir misiniz?", "request"],
    ["Randevu almaktan vazgeçtim.", "request"],
    ["Randevumu nasıl iptal edebilirim?", "question"],
    ["Randevumu iptal etmek istemiyorum.", "negation"],
    ["Otoparkınız var mı?", "none"],
  ])("'%s' → %s", (text, kind) => {
    expect(classifyAppointmentCancellationTurn(text, onRecord).kind).toBe(kind);
  });

  it("mixed request keeps only the question for the knowledge answer", () => {
    expect(classifyAppointmentCancellationTurn("Randevumu iptal etmek istiyorum. Otoparkınız var mı?", onRecord)).toEqual({
      kind: "request",
      knowledgeQuestion: "Otoparkınız var mı?",
    });
  });

  it("without a submitted appointment only an explicit appointment cancel is a request", () => {
    expect(classifyAppointmentCancellationTurn("Randevumu iptal etmek istiyorum.", { submittedOnRecord: false }).kind).toBe("request");
    expect(classifyAppointmentCancellationTurn("iptal", { submittedOnRecord: false }).kind).toBe("none");
  });

  it.each([
    ["Randevunuzu iptal ettim.", true],
    ["Randevunuz iptal edildi.", true],
    ["I have cancelled your appointment.", true],
    ["Randevunuz iptal edildiğinde size bilgi verilir.", false],
    ["Randevu iptal talebinizi kliniğe iletebilirim.", false],
  ])("cancellation claim guard: '%s' → %s", (text, claim) => {
    expect(containsUnverifiedCancellationClaim(text)).toBe(claim);
  });
});

describe("human handoff vocabulary", () => {
  it.each([
    "Temsilciye bağlar mısınız?",
    "Beni bir temsilciye bağlar mısınız?",
    "Bir yetkiliyle görüşebilir miyim?",
    "Yetkiliye bağlanmak istiyorum.",
    "Birisiyle görüşmek istiyorum.",
  ])("'%s' is a live-agent handoff request", (text) => {
    expect(isLiveAgentRequest(text)).toBe(true);
    expect(isPatientContactHandoffIntent(text)).toBe(true);
  });

  it.each(["Temsilciniz kim?", "Yetkiliniz bugün çalışıyor mu?", "Doktorla görüşmek istiyorum."])(
    "'%s' is not a handoff request",
    (text) => {
      expect(isLiveAgentRequest(text)).toBe(false);
      expect(isPatientContactHandoffIntent(text)).toBe(false);
    }
  );

  it("'Beni arayın' remains a handoff request", () => {
    expect(isPatientContactHandoffIntent("Beni arayın")).toBe(true);
  });
});

describe("cross-product: agency intake (FeelinHealthy) uses the same parser", () => {
  const agencyExtract = (message: string) =>
    SlotExtractor.extractSlots(message, {}, "tr", "Europe/Istanbul", "patientName").extracted;

  it("punctuated and introduced names fill patientName", () => {
    expect(agencyExtract("Yusuf Alper Özgül.").patientName).toBe("Yusuf Alper Özgül");
    expect(agencyExtract("Benim adım Ayşe Yılmaz").patientName).toBe("Ayşe Yılmaz");
    expect(agencyExtract("Alper Özgül, Erkek, 27").patientName).toBe("Alper Özgül");
  });

  it("treatment requests never become names in agency intake", () => {
    expect(agencyExtract("implant yaptırmak istiyorum").patientName).toBeUndefined();
    expect(agencyExtract("Diş tedavisi olmak istiyorum").patientName).toBeUndefined();
  });
});

describe("targeted: Agency matching-chat call shape", () => {
  /** Mirrors app/api/public/agency/[slug]/matching-chat/route.ts (extractSlots + classifyConversationIntent). */
  const agencyTurn = (message: string, ctx: { patientName?: string; patientPhone?: string } = {}, expected = "patientName") => {
    const collected = { fullName: ctx.patientName, phone: ctx.patientPhone, email: undefined, treatment: "dental" };
    const slots = SlotExtractor.extractSlots(message, collected, "tr", "Europe/Istanbul", expected);
    const intent = IntentRouter.classifyConversationIntent({
      message,
      collectedSlots: collected,
      activeTreatment: "dental",
      agencyContext: { agencyId: "agency_test", agencySlug: "agency-test" },
      locale: "tr",
    });
    return { extracted: slots.extracted, intent: intent.intent };
  };

  it("mixed name + price question: the route still receives the name and a pricing intent", () => {
    const r = agencyTurn("Yusuf Alper Özgül. Bu arada implant fiyatınız ne kadar?");
    expect(r.extracted.fullName).toBe("Yusuf Alper Özgül");
    expect(r.intent).toBe("pricing_request");
  });

  it("surname-only correction is not applied to agency state (first/last name are stored separately there)", () => {
    const r = agencyTurn("Soyadım Kaya olacaktı.", { patientName: "Yusuf Alper Özgül" });
    expect(r.extracted.fullName).toBeUndefined();
    expect(r.extracted.lastName).toBeUndefined();
  });

  it("agency cancel semantics are unchanged outside an appointment flow", () => {
    expect(agencyTurn("Randevuyu iptal etmek istiyorum. Otopark var mı?").intent).not.toBe("cancel");
  });

  it("an ambiguous spoken phone is never stored", () => {
    expect(agencyTurn(AMBIGUOUS_SPOKEN_PHONE, { patientName: "Yusuf Alper Özgül" }, "phone").extracted.phone).toBeUndefined();
    expect(agencyTurn(SPOKEN_PHONE, { patientName: "Yusuf Alper Özgül" }, "phone").extracted.phone).toBe("+90 532 291 45 67");
  });
});

describe("targeted: FeelinHealthy Group 1 intake", () => {
  const group1 = (message: string) => SlotExtractor.extractSlots(message, {}, "tr", "Europe/Istanbul", "patientName").extracted;

  it("a punctuated full name with age and gender completes Group 1", () => {
    const extracted = group1("Alper Özgül., Erkek, 27");
    expect(extracted.patientName).toBe("Alper Özgül");
    expect(evaluateFeelinHealthyIntake(extracted).group1Complete).toBe(true);
  });

  it("a mixed name + question turn still fills the name; a lone first name stays incomplete", () => {
    const mixed = group1("Benim adım Ayşe Yılmaz. Bu arada fiyatlar ne kadar?");
    expect(mixed.patientName).toBe("Ayşe Yılmaz");
    expect(evaluateFeelinHealthyIntake(mixed).missingFieldsInCurrentGroup).not.toContain("patientName");
    const lone = group1("Ayşe.");
    expect(lone.patientName).toBeUndefined();
    expect(evaluateFeelinHealthyIntake(lone).missingFieldsInCurrentGroup).toContain("patientName");
  });

  it("treatment requests never become a FeelinHealthy patient name", () => {
    expect(group1("İstanbul'da implant yaptırmak istiyorum.").patientName).toBeUndefined();
  });
});

describe("speech presentation: written abbreviations (speechText only)", () => {
  it.each(["treatment", "preferredDate", "preferredTime"])(
    "the web %s prompt keeps '(Örn: …)' while speech says 'örneğin'",
    (slot) => {
      const canonical = ConversationStateEngine.generateNextSlotPrompt({}, [slot], "tr");
      const before = canonical;
      expect(canonical).toContain("(Örn:");
      const spoken = renderVoiceSpeech({ text: canonical, locale: "tr" }).spokenText;
      expect(canonical).toBe(before);
      expect(spoken).not.toMatch(/Örn[.:,]|\(/);
      expect(spoken).toMatch(/Örneğin /);
    }
  );

  it.each([
    ["Örn. implant", "Örneğin implant"],
    ["Tedaviler (Örn: implant, kanal tedavisi) yapılır.", "Tedaviler, örneğin implant, kanal tedavisi yapılır."],
    ["Dolgu, kaplama vb. işlemler", "Dolgu, kaplama ve benzeri işlemler"],
    ["Dolgu, kaplama vs. gibi", "Dolgu, kaplama vesaire gibi"],
    ["Bkz. web sitemiz", "Bakınız web sitemiz"],
    ["Doç. Dr. Mehmet Ak", "Doçent doktor Mehmet Ak"],
    ["Prof. Dr. Ayşe Kaya", "Profesör doktor Ayşe Kaya"],
  ])("'%s' → '%s'", (text, spoken) => {
    const presented = renderVoiceSpeech({ text, locale: "tr" });
    expect(presented.spokenText).toBe(spoken);
    expect(presented.telemetry.hasAbbreviationTransformation).toBe(true);
  });

  it("protects emails, domains, ratios, decimals, clocks and initials (no punctuation destroyer)", () => {
    const spoken = renderVoiceSpeech({
      text: "Oran 16:9, fiyat 1.250,50 TL, www.klinik.com, dr.ahmet@klinik.com, A. B. Yılmaz, saat 14:00.",
      locale: "tr",
    }).spokenText;
    expect(spoken).toContain("16:9");
    expect(spoken).toContain("1.250,50");
    expect(spoken).toContain("bağlantı");
    expect(spoken).toContain("dr nokta ahmet et klinik nokta com");
    expect(spoken).toContain("A. B. Yılmaz");
    expect(spoken).toContain("saat on dört");
    expect(spoken).not.toMatch(/doktor/i);
  });
});

type Saved = Record<string, any>;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Firestore set(..., { merge: true }) semantics: nested maps merge, absent keys survive. */
function deepMerge(target: Saved, patch: Saved): Saved {
  const out: Saved = { ...target };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}

const ALLOWED_SLOT_TURN_KEYS = new Set([
  "event",
  "sessionRef",
  "turnSeq",
  "expectedSlot",
  "resolvedSlotNames",
  "expectedSlotOutcome",
  "reasonCode",
  "attempt",
  "progressed",
  "correctionApplied",
  "multiSlotCount",
  "handoffOffered",
  "latencyMs",
  "hadTerminalPunctuation",
  "tokenCountBucket",
]);

describe("Agent Core end-to-end: atomic slot turns", () => {
  let handleClinicAgentTurn: typeof import("@/lib/agent/handleClinicAgentTurn").handleClinicAgentTurn;
  const logLines: string[] = [];
  const createAppointmentAndNotify = vi.fn(async () => ({ success: true, appointmentId: "apt_1" }));
  const createContactRequestAndNotify = vi.fn(async () => ({ success: true, contactRequestId: "cr_1" }));
  const KNOWLEDGE_ANSWER = "Kliniğimizde bu konudaki bilgiyi klinik ekibimiz netleştirir.";
  type AiRequest = (req: { messages: Array<{ role: string; content: string }> }) => Promise<{ content: string; durationMs: number }>;
  const aiRequest = vi.fn<AiRequest>(async () => ({ content: KNOWLEDGE_ANSWER, durationMs: 1 }));
  const hybridSearch = vi.fn<(query: string) => Promise<unknown[]>>(async () => []);

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    for (const level of ["log", "warn", "error", "info"] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logLines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
      });
    }
    vi.doMock("@/lib/services/aiGateway", () => ({ trackableAIRequest: aiRequest }));
    vi.doMock("@/lib/services/retrievalService", () => ({
      hybridSearch,
      validateGroundedness: vi.fn(async () => ({ isGrounded: true })),
    }));
    vi.doMock("@/lib/performance/clinicRuntimeCache", () => ({
      getCachedClinicRuntime: () => null,
      setCachedClinicRuntime: () => undefined,
    }));
    vi.doMock("@/lib/services/conversations/conversationTranscriptService", () => ({
      syncConversationLogMessagesFromHistory: vi.fn(async () => 2),
    }));
    vi.doMock("@/lib/appointment-service", () => ({ createAppointmentAndNotify }));
    vi.doMock("@/lib/contact-request/service", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/contact-request/service")>()),
      createContactRequestAndNotify,
      findUnresolvedContactRequest: vi.fn(async () => null),
      cancelUnresolvedContactRequest: vi.fn(async () => ({ cancelled: false })),
    }));
    ({ handleClinicAgentTurn } = await import("@/lib/agent/handleClinicAgentTurn"));
  });

  afterAll(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.doUnmock("@/lib/services/aiGateway");
    vi.doUnmock("@/lib/services/retrievalService");
    vi.doUnmock("@/lib/performance/clinicRuntimeCache");
    vi.doUnmock("@/lib/services/conversations/conversationTranscriptService");
    vi.doUnmock("@/lib/appointment-service");
    vi.doUnmock("@/lib/contact-request/service");
  });

  beforeEach(() => {
    logLines.length = 0;
    createAppointmentAndNotify.mockClear();
    createContactRequestAndNotify.mockClear();
    aiRequest.mockClear();
    hybridSearch.mockClear();
  });

  let messageSeq = 0;
  function makeConversation(
    options: { channel?: "voice" | "web_widget"; hours?: WeeklySchedule; seed?: Saved; clinic?: Saved } = {}
  ) {
    const channel = options.channel ?? "voice";
    // Working hours are cached per clinic id, so a custom schedule needs its own clinic.
    const clinicId = options.hours ? "clinic_wide_hours" : "clinic_test";
    let saved: Saved = structuredClone(options.seed ?? {});
    const history: Array<{ role: "user" | "assistant"; content: string }> = [];
    const conversationId = `conv_${channel}_${++messageSeq}`;
    const logRef = {
      get: async () => ({ exists: Object.keys(saved).length > 0, data: () => structuredClone(saved) }),
      set: async (data: Saved, opts?: { merge?: boolean; mergeFields?: string[] }) => {
        if (opts?.mergeFields) {
          saved = { ...saved };
          for (const field of opts.mergeFields) saved[field] = data[field];
        } else {
          saved = deepMerge(saved, data);
        }
      },
      create: async () => undefined,
      collection: () => ({ doc: () => ({ set: async () => undefined, get: async () => ({ exists: false }) }) }),
    };
    const adminDb = {
      collection: (name: string) => {
        if (name === "clinics") {
          return {
            doc: () => ({
              get: async () => ({
                exists: true,
                id: clinicId,
                data: () => ({
                  name: "Test Dental",
                  language: "tr",
                  timezone: TZ,
                  workingHours: options.hours ?? HOURS,
                  notificationSettings: {},
                  ...options.clinic,
                }),
              }),
              collection: (sub: string) => {
                if (sub === "conversationLogs") return { doc: () => logRef };
                if (sub === "doctors") return { where: () => ({ get: async () => ({ empty: true, docs: [] }) }) };
                return { doc: () => ({ get: async () => ({ exists: false }) }) };
              },
            }),
          };
        }
        if (name === "promptSettings") {
          return { doc: () => ({ get: async () => ({ exists: true, data: () => ({ systemPrompt: "Asistan", model: "gpt-4o-mini" }) }) }) };
        }
        if (name === "trainingMaterials") {
          return { where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) };
        }
        if (name === "agencies") return { get: async () => ({ docs: [] }) };
        return { doc: () => ({ get: async () => ({ exists: false }) }) };
      },
    };
    let turnSeq = 0;
    const say = async (text: string) => {
      turnSeq += 1;
      const result = await handleClinicAgentTurn({
        input: {
          clinicId,
          conversationId,
          channel,
          text,
          history: [...history],
          locale: "tr",
          context: { messageId: channel === "voice" ? `voice:binding_test:${turnSeq}` : `web_m${turnSeq}` },
        },
        adminDb,
        perf: new RequestTimer({}),
        debugLog: [],
        startTime: NOW.getTime(),
      });
      history.push({ role: "user", content: text }, { role: "assistant", content: result.replyText });
      return {
        reply: result.replyText,
        state: saved.appointmentState as string,
        draft: (saved.appointmentDraft || {}) as Saved,
        saved: () => saved,
      };
    };
    return { say, saved: () => saved };
  }

  async function collectUpToName(say: ReturnType<typeof makeConversation>["say"]) {
    expect((await say("İmplant için randevu almak istiyorum.")).state).toBe("COLLECTING_DATE");
    expect((await say("16 Ekim")).state).toBe("COLLECTING_TIME");
    const askName = await say("saat 14:00");
    expect(askName.state).toBe("COLLECTING_NAME");
    return askName;
  }

  it("voice: punctuated STT name is stored and the next prompt is not the name prompt", async () => {
    const { say } = makeConversation();
    const askName = await collectUpToName(say);
    expect(askName.reply).toMatch(/adınızı ve soyadınızı/i);
    const r = await say("Yusuf Alper Özgül.");
    expect(r.state).toBe("COLLECTING_PHONE");
    expect(r.draft.patientName).toBe("Yusuf Alper Özgül");
    expect(r.reply).not.toMatch(/adınızı/i);
    expect(r.reply).toMatch(/telefon numaranızı/i);
  });

  it.each(["Evet, Yusuf Alper Özgül.", "Benim adım Yusuf Alper Özgül.", "Tabii ki Yusuf Alper Özgül"])(
    "voice: '%s' in COLLECTING_NAME progresses to the phone",
    async (spoken) => {
      const { say } = makeConversation();
      await collectUpToName(say);
      const r = await say(spoken);
      expect(r.state).toBe("COLLECTING_PHONE");
      expect(r.draft.patientName).toBe("Yusuf Alper Özgül");
    }
  );

  it("voice: multi-slot answer persists every safe slot and asks only the next missing one", async () => {
    const { say } = makeConversation();
    const r = await say("İmplant için önümüzdeki cuma öğleden sonra iki gibi gelmek istiyorum. Adım Yusuf Alper Özgül.");
    expect(r.draft.requestedService).toBeTruthy();
    expect(r.draft.requestedDate).toBe("2026-10-16");
    expect(r.draft.requestedTime).toBe("14:00");
    expect(r.draft.patientName).toBe("Yusuf Alper Özgül");
    expect(r.state).toBe("COLLECTING_PHONE");
    expect(r.reply).toMatch(/telefon numaranızı/i);
    expect(r.reply).not.toMatch(/hangi gün|saat kaçta|adınızı|hangi tedavi/i);
  });

  it("voice: name + spoken phone in one answer fills both", async () => {
    const { say } = makeConversation();
    await collectUpToName(say);
    const r = await say(`Yusuf Alper Özgül, telefonum ${SPOKEN_PHONE}`);
    expect(r.draft.patientName).toBe("Yusuf Alper Özgül");
    expect(r.draft.patientPhone).toBeTruthy();
    expect(r.state).toBe("COLLECTING_EMAIL");
    expect(r.reply).toMatch(/e-posta adresinizi/i);
  });

  describe("atomicity: every COLLECTING_* early return persists the merged draft", () => {
    it("phone failure branch: a name correction made while phone is expected is persisted", async () => {
      const { say } = makeConversation();
      await collectUpToName(say);
      expect((await say("Yusuf Alper")).state).toBe("COLLECTING_PHONE");
      const corrected = await say("Adım Ahmet Kaya");
      expect(corrected.state).toBe("COLLECTING_PHONE");
      expect(corrected.draft.patientName).toBe("Ahmet Kaya");
      expect(corrected.reply).toMatch(/^Tamam, güncelledim\./);
      expect(corrected.reply).toMatch(/telefon/i);
    });

    it("scheduling-invalid branch: the name given with an out-of-hours time is kept", async () => {
      const { say } = makeConversation();
      await collectUpToName(say);
      const r = await say("Adım Yusuf Alper Özgül, saat 22:00 olsun");
      expect(r.state).toBe("COLLECTING_DATE");
      expect(r.draft.patientName).toBe("Yusuf Alper Özgül");
    });

    it("time-zone clarification branch: the name is saved before asking about the zone", async () => {
      const { say } = makeConversation();
      await collectUpToName(say);
      const r = await say("Adım Yusuf Alper Özgül, saat 15:00 CST");
      expect(r.state).toBe("AWAITING_DATE_CLARIFICATION");
      expect(r.draft.patientName).toBe("Yusuf Alper Özgül");
    });

    it("email failure branch: the name given with a malformed email is kept", async () => {
      const { say } = makeConversation();
      await collectUpToName(say);
      await say("Yusuf Alper Özgül");
      expect((await say("0532 291 45 67")).state).toBe("COLLECTING_EMAIL");
      const r = await say("Adım Ahmet Kaya, mailim yusuf@gmail");
      expect(r.state).toBe("COLLECTING_EMAIL");
      expect(r.draft.patientName).toBe("Ahmet Kaya");
      expect(r.reply).toMatch(/eksik veya geçersiz/);
    });

    it("date-clarification failure branch: the merged draft is saved", async () => {
      const { say } = makeConversation({
        seed: {
          appointmentState: "AWAITING_DATE_CLARIFICATION",
          appointmentDraft: { requestedService: "Diş İmplantı", requestedTime: "14:00" },
          conversationLocale: "tr",
        },
      });
      const r = await say("Ahmet Kaya 0532 291 45 67 tarih bilmiyorum");
      expect(r.state).toBe("AWAITING_DATE_CLARIFICATION");
      expect(r.draft.patientPhone).toContain("532 291 45 67");
      expect(r.draft.requestedService).toBe("Diş İmplantı");
    });
  });

  it("voice: bounded retry → handoff offer preserves the draft; 'hayır' keeps collecting", async () => {
    const { say, saved } = makeConversation();
    const askName = await collectUpToName(say);
    const replies = [askName.reply];

    const first = await say("Yusuf");
    replies.push(first.reply);
    expect(first.state).toBe("COLLECTING_NAME");
    expect(first.reply).toMatch(/soyadınızı/i);
    expect(saved().slotAttempts.fullName).toEqual({ count: 1, lastReasonCode: "NAME_SINGLE_TOKEN" });

    const second = await say("Yusuf");
    replies.push(second.reply);
    expect(second.reply).toMatch(/örneğin Ayşe Yılmaz/);
    expect(saved().slotAttempts.fullName.count).toBe(2);

    const third = await say("Yusuf");
    replies.push(third.reply);
    expect(third.reply).toMatch(/klinik ekibimiz sizinle iletişime geçsin/);
    expect(third.reply).toMatch(/bilgileri saklıyorum/);
    expect(third.state).toBe("COLLECTING_NAME");
    expect(saved().pendingAction).toMatchObject({ type: "create_contact_request", status: "pending", payload: { origin: "slot_recovery" } });
    expect(third.draft).toMatchObject({ requestedDate: "2026-10-16", requestedTime: "14:00" });
    expect(third.draft.requestedService).toBeTruthy();

    for (let i = 1; i < replies.length; i++) expect(replies[i]).not.toBe(replies[i - 1]);

    const declined = await say("hayır");
    expect(declined.state).toBe("COLLECTING_NAME");
    expect(declined.reply).toMatch(/^Peki, devam edelim\./);
    expect(declined.reply).not.toMatch(/iptal/i);
    expect(declined.draft).toMatchObject({ requestedDate: "2026-10-16", requestedTime: "14:00" });
    expect(saved().pendingAction).toBeNull();

    const named = await say("Yusuf Alper Özgül.");
    expect(named.state).toBe("COLLECTING_PHONE");
    expect(named.draft.patientName).toBe("Yusuf Alper Özgül");
    expect(saved().slotAttempts.fullName).toBeNull();
    expect(createAppointmentAndNotify).not.toHaveBeenCalled();
  });

  it("voice: answering the slot while the handoff offer is pending clears the offer", async () => {
    const { say, saved } = makeConversation();
    await collectUpToName(say);
    for (let i = 0; i < 3; i++) await say("Yusuf");
    expect(saved().pendingAction?.payload?.origin).toBe("slot_recovery");
    const r = await say("Evet, Yusuf Alper Özgül.");
    expect(r.state).toBe("COLLECTING_PHONE");
    expect(r.draft.patientName).toBe("Yusuf Alper Özgül");
    expect(saved().pendingAction).toBeNull();
    expect(createContactRequestAndNotify).not.toHaveBeenCalled();
  });

  it("voice: accepting the handoff offer uses the existing contact path and keeps the draft", async () => {
    const { say, saved } = makeConversation();
    await collectUpToName(say);
    for (let i = 0; i < 3; i++) await say("Yusuf");
    const accepted = await say("evet");
    expect(saved().appointmentDraft).toMatchObject({ requestedDate: "2026-10-16", requestedTime: "14:00" });
    expect(saved().appointmentState).toBe("COLLECTING_NAME");
    // No phone collected yet: the contact path asks for it instead of creating anything.
    expect(saved().pendingAction?.type).toBe("collect_contact_phone");
    expect(accepted.reply).toMatch(/telefon/i);
    expect(createContactRequestAndNotify).not.toHaveBeenCalled();
    expect(createAppointmentAndNotify).not.toHaveBeenCalled();
  });

  it("voice: ambiguous clock asks once with both candidates, the daypart reply resolves it", async () => {
    const { say, saved } = makeConversation({ hours: WIDE_HOURS });
    expect((await say("İmplant için randevu almak istiyorum.")).state).toBe("COLLECTING_DATE");
    expect((await say("16 Ekim")).state).toBe("COLLECTING_TIME");
    const ask = await say("saat dokuz");
    expect(ask.state).toBe("COLLECTING_TIME");
    expect(ask.draft.requestedTime).toBeUndefined();
    expect(ask.reply).toBe("Saat 09:00 mi, yoksa 21:00 mi demek istediniz?");
    expect(saved().slotAttempts.preferredTime).toMatchObject({ lastReasonCode: "TIME_MERIDIEM_AMBIGUOUS", candidates: ["09:00", "21:00"] });
    const resolved = await say("akşam");
    expect(resolved.draft.requestedTime).toBe("21:00");
    expect(resolved.state).toBe("COLLECTING_NAME");
  });

  it("voice: ambiguous spoken phone is not stored; a digit-by-digit read-back is requested", async () => {
    const { say } = makeConversation();
    await collectUpToName(say);
    await say("Yusuf Alper Özgül");
    const r = await say(AMBIGUOUS_SPOKEN_PHONE);
    expect(r.state).toBe("COLLECTING_PHONE");
    expect(r.draft.patientPhone).toBeUndefined();
    expect(r.reply).toMatch(/tek tek/);
  });

  it("voice replies carry no labels, '(Örn: …)' or written abbreviations", async () => {
    const { say } = makeConversation();
    const replies = [
      (await say("İmplant için randevu almak istiyorum.")).reply,
      (await say("16 Ekim")).reply,
      (await say("saat 14:00")).reply,
      (await say("Yusuf Alper Özgül.")).reply,
    ];
    for (const reply of replies) {
      expect(reply).not.toMatch(/\(Örn|Örn[.:]|\(e\.g\./);
    }
    expect(replies[2]).toBe("Anladım, saat 14:00. Adınızı ve soyadınızı alabilir miyim?");
  });

  it("web: same answer is stored; web keeps its existing prompt copy (no voice acknowledgement)", async () => {
    const { say } = makeConversation({ channel: "web_widget" });
    const askName = await collectUpToName(say);
    expect(askName.reply).toBe(WEB_NAME_PROMPT);
    const r = await say("Yusuf Alper Özgül.");
    expect(r.state).toBe("COLLECTING_PHONE");
    expect(r.draft.patientName).toBe("Yusuf Alper Özgül");
    expect(r.reply).toBe(ConversationStateEngine.generateNextSlotPrompt({}, ["phone"], "tr"));
  });

  it("web: a failed name answer is clarified instead of repeating the identical prompt", async () => {
    const { say } = makeConversation({ channel: "web_widget" });
    const askName = await collectUpToName(say);
    const r = await say("Yusuf");
    expect(r.state).toBe("COLLECTING_NAME");
    expect(r.reply).not.toBe(askName.reply);
    expect(r.reply).toMatch(/soyadınızı/i);
  });

  describe("mixed slot + informational question turns", () => {
    const BASE_DRAFT = { requestedService: "Diş İmplantı", requestedDate: "2026-10-16", requestedTime: "14:00" };
    const seedAt = (appointmentState: string, draft: Saved = BASE_DRAFT) => ({
      appointmentState,
      appointmentDraft: { ...draft },
      conversationLocale: "tr",
    });
    const lastUserContent = () => {
      const call = aiRequest.mock.calls.at(-1)?.[0];
      return call?.messages.at(-1)?.content;
    };

    it.each(["voice", "web_widget"] as const)(
      "%s: name + price question → name persisted, question answered by Agent Core, resume asks the phone",
      async (channel) => {
        const { say } = makeConversation({ channel, seed: seedAt("COLLECTING_NAME") });
        const r = await say("Yusuf Alper Özgül. Bu arada implant fiyatınız ne kadar?");
        expect(r.draft.patientName).toBe("Yusuf Alper Özgül");
        expect(r.state).toBe("COLLECTING_PHONE");
        expect(r.draft).toMatchObject(BASE_DRAFT);
        expect(aiRequest).toHaveBeenCalledTimes(1);
        expect(hybridSearch).toHaveBeenCalledTimes(1);
        expect(lastUserContent()).toBe("Yusuf Alper Özgül. Bu arada implant fiyatınız ne kadar?");
        expect(r.reply.startsWith(KNOWLEDGE_ANSWER)).toBe(true);
        expect(r.reply).toMatch(/telefon numaranızı/i);
        expect(r.reply).not.toMatch(/adınızı/i);
        if (channel === "voice") expect(r.reply).not.toMatch(/\(Örn/);
      }
    );

    it("reverse order: question first, introduced name after", async () => {
      const { say } = makeConversation({ seed: seedAt("COLLECTING_NAME") });
      const r = await say("İmplant fiyatınız ne kadar? Bu arada adım Yusuf Alper Özgül.");
      expect(r.draft.patientName).toBe("Yusuf Alper Özgül");
      expect(r.state).toBe("COLLECTING_PHONE");
      expect(r.reply.startsWith(KNOWLEDGE_ANSWER)).toBe(true);
    });

    it("expected date: 'Önümüzdeki cuma. Doktorunuz kim olacak?'", async () => {
      const { say } = makeConversation({ seed: seedAt("COLLECTING_DATE", { requestedService: "Diş İmplantı" }) });
      const r = await say("Önümüzdeki cuma. Doktorunuz kim olacak?");
      expect(r.draft.requestedDate).toBe("2026-10-16");
      expect(r.state).toBe("COLLECTING_TIME");
      expect(r.reply.startsWith(KNOWLEDGE_ANSWER)).toBe(true);
      expect(r.reply).toMatch(/saat/i);
    });

    it("expected time: 'Öğleden sonra iki uygun olur. Otoparkınız var mı?'", async () => {
      const { say } = makeConversation({
        seed: seedAt("COLLECTING_TIME", { requestedService: "Diş İmplantı", requestedDate: "2026-10-16" }),
      });
      const r = await say("Öğleden sonra iki uygun olur. Otoparkınız var mı?");
      expect(r.draft.requestedTime).toBe("14:00");
      expect(r.state).toBe("COLLECTING_NAME");
      expect(r.reply.startsWith(KNOWLEDGE_ANSWER)).toBe(true);
      expect(r.reply).toMatch(/adınızı ve soyadınızı/i);
    });

    it("expected phone: a statement that mentions WhatsApp is a phone answer, not a live-support request", async () => {
      const { say } = makeConversation({ seed: seedAt("COLLECTING_PHONE", { ...BASE_DRAFT, patientName: "Yusuf Alper Özgül" }) });
      const r = await say("Numaram 0532 291 45 67. Bu numaradan WhatsApp da kullanıyorum.");
      expect(r.draft.patientPhone).toContain("532 291 45 67");
      expect(r.state).toBe("COLLECTING_EMAIL");
      expect(r.reply).toMatch(/e-posta/i);
    });

    it("expected email: decline + 'can it still be created?' → declined, review summary, nothing created yet", async () => {
      const { say } = makeConversation({
        seed: seedAt("COLLECTING_EMAIL", { ...BASE_DRAFT, patientName: "Yusuf Alper Özgül", patientPhone: "+90 532 291 45 67" }),
      });
      const r = await say("E-posta vermek istemiyorum. Randevum yine oluşturulabilir mi?");
      expect(r.draft.emailDisposition).toBe("DECLINED");
      expect(r.state).toBe("AWAITING_CONFIRMATION");
      expect(r.reply).not.toMatch(/eksik veya geçersiz/);
      expect(createAppointmentAndNotify).not.toHaveBeenCalled();
    });

    it("correction + question: the corrected time is persisted BEFORE the knowledge answer runs", async () => {
      const conversation = makeConversation({
        seed: seedAt("COLLECTING_PHONE", { ...BASE_DRAFT, patientName: "Yusuf Alper Özgül" }),
      });
      let atAnswer: Saved | null = null;
      aiRequest.mockImplementationOnce(async () => {
        atAnswer = structuredClone(conversation.saved());
        return { content: KNOWLEDGE_ANSWER, durationMs: 1 };
      });
      const r = await conversation.say("Bu arada saat on iki olsun. Kliniğinizde otopark var mı?");
      expect(atAnswer!.appointmentDraft.requestedTime).toBe("12:00");
      expect(r.draft.requestedTime).toBe("12:00");
      expect(r.state).toBe("COLLECTING_PHONE");
      expect(r.reply.startsWith(KNOWLEDGE_ANSWER)).toBe(true);
      expect(r.reply).toMatch(/telefon/i);
    });

    it("surname correction + doctor question: persisted before the answer; only the surname changes", async () => {
      const conversation = makeConversation({
        seed: seedAt("COLLECTING_PHONE", { ...BASE_DRAFT, patientName: "Yusuf Alper Özgül" }),
      });
      let atAnswer: Saved | null = null;
      aiRequest.mockImplementationOnce(async () => {
        atAnswer = structuredClone(conversation.saved());
        return { content: KNOWLEDGE_ANSWER, durationMs: 1 };
      });
      const r = await conversation.say("Soyadım Kaya olacaktı. Bu tedaviyi hangi doktor yapıyor?");
      expect(atAnswer!.appointmentDraft.patientName).toBe("Yusuf Alper Kaya");
      expect(r.draft.patientName).toBe("Yusuf Alper Kaya");
      expect(r.state).toBe("COLLECTING_PHONE");
    });

    it("multi-slot + question: every safe field persists, then only the next missing field is asked", async () => {
      const { say } = makeConversation({ seed: seedAt("COLLECTING_DATE", { requestedService: "Diş İmplantı" }) });
      const r = await say("Adım Yusuf Alper Özgül, cuma günü saat iki gibi gelebilirim. İmplant fiyatınız ne kadar?");
      expect(r.draft).toMatchObject({
        patientName: "Yusuf Alper Özgül",
        requestedDate: "2026-10-16",
        requestedTime: "14:00",
        requestedService: "Diş İmplantı",
      });
      expect(r.state).toBe("COLLECTING_PHONE");
      expect(r.reply.startsWith(KNOWLEDGE_ANSWER)).toBe(true);
      expect(r.reply).toMatch(/telefon/i);
      expect(r.reply).not.toMatch(/hangi gün|saat kaçta|adınızı/i);
    });

    it("RAG/LLM failure after extraction does not roll back the accepted slot", async () => {
      const { say, saved } = makeConversation({ seed: seedAt("COLLECTING_NAME") });
      aiRequest.mockRejectedValueOnce(new Error("upstream unavailable"));
      await say("Yusuf Alper Özgül. Bu arada implant fiyatınız ne kadar?").catch(() => undefined);
      expect(saved().appointmentDraft.patientName).toBe("Yusuf Alper Özgül");
      expect(saved().appointmentState).toBe("COLLECTING_PHONE");
      const next = await say("0532 291 45 67");
      expect(next.state).toBe("COLLECTING_EMAIL");
      expect(next.reply).not.toMatch(/adınızı/i);
    });

    it("ambiguous clock next to a question is not guessed", async () => {
      const { say } = makeConversation({
        hours: WIDE_HOURS,
        seed: seedAt("COLLECTING_TIME", { requestedService: "Diş İmplantı", requestedDate: "2026-10-16" }),
      });
      const r = await say("Saat dokuz. Otopark var mı?");
      expect(r.draft.requestedTime).toBeUndefined();
      expect(r.state).toBe("COLLECTING_TIME");
    });

    it("ambiguous spoken phone next to a question is not stored", async () => {
      const { say } = makeConversation({ seed: seedAt("COLLECTING_PHONE", { ...BASE_DRAFT, patientName: "Yusuf Alper Özgül" }) });
      const r = await say(`${AMBIGUOUS_SPOKEN_PHONE}. Bu arada otopark var mı?`);
      expect(r.draft.patientPhone).toBeUndefined();
      expect(r.state).toBe("COLLECTING_PHONE");
    });

    it("pure question: nothing is extracted from the question, draft and state are unchanged", async () => {
      const { say } = makeConversation({ seed: seedAt("COLLECTING_NAME") });
      const r = await say("Otoparkınız var mı?");
      expect(r.draft).toEqual(BASE_DRAFT);
      expect(r.state).toBe("COLLECTING_NAME");
      expect(r.reply).toMatch(/adınızı ve soyadınızı/i);
    });

    it("explicit cancellation takes precedence over the question", async () => {
      const { say } = makeConversation({ seed: seedAt("COLLECTING_NAME") });
      const r = await say("Randevuyu iptal etmek istiyorum. Otopark var mı?");
      expect(r.state).toBe("IDLE");
      expect(r.reply).toMatch(/iptal ettim/);
      expect(aiRequest).not.toHaveBeenCalled();
      const notCancel = makeConversation({ seed: seedAt("COLLECTING_NAME") });
      const kept = await notCancel.say("Randevumu iptal etmek istemiyorum. Otopark var mı?");
      expect(kept.state).not.toBe("IDLE");
      expect(kept.draft).toMatchObject(BASE_DRAFT);
    });

    it.each(["Yusuf Alper Özgül. Beni arayın lütfen.", "Yusuf Alper Özgül. Canlı destek istiyorum."])(
      "explicit handoff keeps Contact Request/Handoff semantics: %s",
      async (spoken) => {
        const { say, saved } = makeConversation({ seed: seedAt("COLLECTING_NAME") });
        await say(spoken);
        expect(aiRequest).not.toHaveBeenCalled();
        expect(createAppointmentAndNotify).not.toHaveBeenCalled();
        expect(saved().appointmentDraft).toMatchObject(BASE_DRAFT);
      }
    );
  });

  describe("premium invariants", () => {
    it("A: once persisted, a slot is never asked again (mixed turn, then plain turns)", async () => {
      const { say } = makeConversation({
        seed: { appointmentState: "COLLECTING_NAME", appointmentDraft: { requestedService: "Diş İmplantı", requestedDate: "2026-10-16", requestedTime: "14:00" }, conversationLocale: "tr" },
      });
      const replies = [
        (await say("Yusuf Alper Özgül. Otoparkınız var mı?")).reply,
        (await say("Doktorunuz kim?")).reply,
        (await say("0532 291 45 67")).reply,
      ];
      for (const reply of replies) expect(reply).not.toMatch(/adınızı/i);
    });

    it("G: web and voice reach identical business state for the same mixed turns", async () => {
      const turns = [
        "İmplant için randevu almak istiyorum.",
        "Önümüzdeki cuma. Doktorunuz kim olacak?",
        "Öğleden sonra iki uygun olur. Otoparkınız var mı?",
        "Yusuf Alper Özgül. Bu arada implant fiyatınız ne kadar?",
        "0532 291 45 67",
        "E-posta vermek istemiyorum.",
      ];
      const voice = makeConversation({ channel: "voice" });
      const web = makeConversation({ channel: "web_widget" });
      for (const turn of turns) {
        await voice.say(turn);
        await web.say(turn);
      }
      expect(voice.saved().appointmentState).toBe("AWAITING_CONFIRMATION");
      expect(web.saved().appointmentState).toBe("AWAITING_CONFIRMATION");
      const pick = (s: Saved) => {
        const d = s.appointmentDraft;
        return [d.requestedService, d.requestedDate, d.requestedTime, d.patientName, d.patientPhone, d.emailDisposition];
      };
      expect(pick(voice.saved())).toEqual(pick(web.saved()));
      expect(createAppointmentAndNotify).not.toHaveBeenCalled();
    });
  });

  describe("targeted thin coverage", () => {
    it("partial month: 'Kasım ayında' asks for the day; 'ayın on altısı' completes THAT month, not this one", async () => {
      const { say, saved } = makeConversation({
        seed: { appointmentState: "COLLECTING_DATE", appointmentDraft: { requestedService: "Diş İmplantı" }, conversationLocale: "tr" },
      });
      const ask = await say("Kasım ayında");
      expect(ask.state).toBe("COLLECTING_DATE");
      expect(ask.draft.requestedDate).toBeFalsy();
      expect(saved().appointmentDraft.pendingAppointmentDate).toBeTruthy();
      expect(ask.reply).toMatch(/hangi gün/i);
      const done = await say("ayın on altısı");
      expect(done.draft.requestedDate).toBe("2026-11-16");
      expect(done.state).toBe("COLLECTING_TIME");
    });

    it("guest Clinic flow (public web widget): booking to review with a mixed turn", async () => {
      const { say, saved } = makeConversation({ channel: "web_widget" });
      await say("İmplant için randevu almak istiyorum.");
      await say("16 Ekim");
      await say("saat 14:00");
      await say("Yusuf Alper Özgül. Bu arada implant fiyatınız ne kadar?");
      await say("0532 291 45 67");
      const review = await say("istemiyorum");
      expect(saved().appointmentState).toBe("AWAITING_CONFIRMATION");
      expect(review.reply).toMatch(/Yusuf Alper Özgül/);
      expect(createAppointmentAndNotify).not.toHaveBeenCalled();
    });

    it("authenticated Clinic flow (server-trusted voice binding): booking to review with a mixed turn", async () => {
      const { say, saved } = makeConversation({ channel: "voice" });
      await say("İmplant için randevu almak istiyorum.");
      await say("16 Ekim");
      await say("saat 14:00");
      await say("Yusuf Alper Özgül. Bu arada implant fiyatınız ne kadar?");
      await say(SPOKEN_PHONE);
      await say("istemiyorum");
      expect(saved().appointmentState).toBe("AWAITING_CONFIRMATION");
      expect(saved().appointmentDraft.patientName).toBe("Yusuf Alper Özgül");
      expect(createAppointmentAndNotify).not.toHaveBeenCalled();
    });
  });

  describe("appointment cancellation lifecycle truthfulness", () => {
    const SUBMITTED: Saved = {
      appointmentState: "APPOINTMENT_SUBMITTED",
      appointmentDraft: {},
      isAppointmentCreated: true,
      appointmentId: "apt_submitted_1",
      patientName: "Yusuf Alper Özgül",
      patientPhone: "+905322914567",
      conversationLocale: "tr",
    };
    const DRAFT: Saved = {
      appointmentState: "COLLECTING_NAME",
      appointmentDraft: { requestedService: "Diş İmplantı", requestedDate: "2026-10-16", requestedTime: "14:00" },
      conversationLocale: "tr",
    };
    const FALSE_CANCEL_CLAIM = /iptal (ettim|edildi|edilmiştir)|randevunuz(u)? (sildim|kaldırdım)/i;
    const OFFER = /randevu iptal talebinizi kliniğe iletebilirim/i;
    const expectSubmittedUntouched = (s: Saved) => {
      expect(s.appointmentState).toBe("APPOINTMENT_SUBMITTED");
      expect(s.appointmentId).toBe("apt_submitted_1");
      expect(s.isAppointmentCreated).toBe(true);
      expect(s.appointmentDraftBoundary).toBeUndefined();
    };

    it("active draft: 'Randevu almaktan vazgeçtim.' discards the local draft and says so", async () => {
      const { say, saved } = makeConversation({ seed: DRAFT });
      const r = await say("Randevu almaktan vazgeçtim.");
      expect(saved().appointmentState).toBe("IDLE");
      expect(saved().appointmentDraft.requestedService).toBeFalsy();
      expect(r.reply).toMatch(/Randevu talebinizi iptal ettim/);
      expect(createContactRequestAndNotify).not.toHaveBeenCalled();
      expect(createAppointmentAndNotify).not.toHaveBeenCalled();
    });

    it.each(["voice", "web_widget"] as const)(
      "%s submitted: 'Randevumu iptal etmek istiyorum.' offers to forward a cancellation request and claims nothing",
      async (channel) => {
        const { say, saved } = makeConversation({ channel, seed: SUBMITTED });
        const r = await say("Randevumu iptal etmek istiyorum.");
        expect(r.reply).not.toMatch(FALSE_CANCEL_CLAIM);
        expect(r.reply).toMatch(OFFER);
        expectSubmittedUntouched(saved());
        expect(saved().pendingAction).toMatchObject({
          type: "create_contact_request",
          status: "pending",
          payload: { purpose: "appointment_cancellation", appointmentId: "apt_submitted_1" },
        });
        expect(createContactRequestAndNotify).not.toHaveBeenCalled();
        expect(aiRequest).not.toHaveBeenCalled();
      }
    );

    it.each(["Randevuyu iptal et", "iptal", "Randevumu iptal edebilir misiniz?"])(
      "submitted: '%s' never resets the submitted appointment or claims cancellation",
      async (spoken) => {
        const { say, saved } = makeConversation({ seed: SUBMITTED });
        const r = await say(spoken);
        expect(r.reply).not.toMatch(FALSE_CANCEL_CLAIM);
        expect(r.reply).toMatch(OFFER);
        expectSubmittedUntouched(saved());
      }
    );

    it("submitted + confirm: forwards one cancellation Contact Request and reports only that", async () => {
      const { say, saved } = makeConversation({ seed: SUBMITTED });
      await say("Randevumu iptal etmek istiyorum.");
      const r = await say("Evet");
      expect(createContactRequestAndNotify).toHaveBeenCalledTimes(1);
      const [payload] = createContactRequestAndNotify.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(payload.patientNote).toMatch(/iptal/i);
      expect(payload.patientNote).toContain("apt_submitted_1");
      expect(payload.patientPhone).toBeTruthy();
      expect(r.reply).toMatch(/iptal talebinizi klinik ekibine ilettim/i);
      expect(r.reply).toMatch(/klinik ekibi talebinizi işlediğinde kesinleşir/i);
      expect(r.reply).not.toMatch(FALSE_CANCEL_CLAIM);
      expectSubmittedUntouched(saved());
      expect(saved().pendingAction ?? null).toBeNull();
      expect(createAppointmentAndNotify).not.toHaveBeenCalled();
    });

    it("submitted + 'Evet, iptal edin.' is an acceptance, not a decline", async () => {
      const { say } = makeConversation({ seed: SUBMITTED });
      await say("Randevumu iptal etmek istiyorum.");
      const r = await say("Evet, iptal edin.");
      expect(createContactRequestAndNotify).toHaveBeenCalledTimes(1);
      expect(r.reply).toMatch(/iptal talebinizi klinik ekibine ilettim/i);
    });

    it("submitted + confirm when forwarding fails: says it could not forward, never that it cancelled", async () => {
      createContactRequestAndNotify.mockImplementationOnce(async () => ({ success: false } as never));
      const { say, saved } = makeConversation({ seed: SUBMITTED });
      await say("Randevumu iptal etmek istiyorum.");
      const r = await say("Evet");
      expect(r.reply).toMatch(/iletemiyorum/);
      expect(r.reply).not.toMatch(FALSE_CANCEL_CLAIM);
      expectSubmittedUntouched(saved());
    });

    it("submitted + decline: nothing forwarded, nothing changed", async () => {
      const { say, saved } = makeConversation({ seed: SUBMITTED });
      await say("Randevumu iptal etmek istiyorum.");
      const r = await say("Hayır");
      expect(createContactRequestAndNotify).not.toHaveBeenCalled();
      expect(r.reply).toMatch(/kliniğe bir iptal talebi iletmedim/i);
      expect(r.reply).not.toMatch(FALSE_CANCEL_CLAIM);
      expectSubmittedUntouched(saved());
      expect(saved().pendingAction ?? null).toBeNull();
    });

    it("submitted + missing phone: collects the phone and keeps the cancellation purpose", async () => {
      const { say } = makeConversation({ seed: { ...SUBMITTED, patientPhone: undefined } });
      await say("Randevumu iptal etmek istiyorum.");
      const ask = await say("Evet");
      expect(ask.reply).toMatch(/telefon numaranızı/i);
      expect(createContactRequestAndNotify).not.toHaveBeenCalled();
      const done = await say("0532 291 45 67");
      expect(createContactRequestAndNotify).toHaveBeenCalledTimes(1);
      const [payload] = createContactRequestAndNotify.mock.calls[0] as unknown as [Record<string, unknown>];
      expect(payload.patientNote).toContain("apt_submitted_1");
      expect(done.reply).toMatch(/iptal talebinizi klinik ekibine ilettim/i);
    });

    it.each([
      ["submitted", SUBMITTED],
      ["idle", { conversationLocale: "tr" }],
    ] as const)("%s: 'Randevumu nasıl iptal edebilirim?' is informational and cancels nothing", async (_label, seed) => {
      const { say, saved } = makeConversation({ seed: seed as Saved });
      const r = await say("Randevumu nasıl iptal edebilirim?");
      expect(r.reply).toMatch(/doğrudan iptal edemiyorum/i);
      expect(r.reply).not.toMatch(FALSE_CANCEL_CLAIM);
      expect(createContactRequestAndNotify).not.toHaveBeenCalled();
      expect(saved().appointmentDraftBoundary).toBeUndefined();
    });

    it("active draft: 'Randevumu nasıl iptal edebilirim?' keeps the draft", async () => {
      const { say, saved } = makeConversation({ seed: DRAFT });
      await say("Randevumu nasıl iptal edebilirim?");
      expect(saved().appointmentState).not.toBe("IDLE");
      expect(saved().appointmentDraft).toMatchObject(DRAFT.appointmentDraft);
    });

    it.each([
      ["submitted", SUBMITTED],
      ["active draft", DRAFT],
    ] as const)("%s: 'Randevumu iptal etmek istemiyorum.' cancels nothing", async (label, seed) => {
      const { say, saved } = makeConversation({ seed: seed as Saved });
      const r = await say("Randevumu iptal etmek istemiyorum.");
      expect(r.reply).not.toMatch(FALSE_CANCEL_CLAIM);
      expect(createContactRequestAndNotify).not.toHaveBeenCalled();
      if (label === "submitted") {
        expectSubmittedUntouched(saved());
        expect(saved().pendingAction ?? null).toBeNull();
      } else {
        expect(saved().appointmentState).not.toBe("IDLE");
        expect(saved().appointmentDraft).toMatchObject(DRAFT.appointmentDraft);
      }
    });

    it("submitted mixed: cancellation request + parking question answers the question and offers the request", async () => {
      const { say, saved } = makeConversation({ seed: SUBMITTED });
      const r = await say("Randevumu iptal etmek istiyorum. Otoparkınız var mı?");
      expect(aiRequest).toHaveBeenCalledTimes(1);
      const messages = aiRequest.mock.calls[0][0].messages;
      expect(messages[messages.length - 1]).toEqual({ role: "user", content: "Otoparkınız var mı?" });
      expect(r.reply).toContain(KNOWLEDGE_ANSWER);
      expect(r.reply).toMatch(OFFER);
      expect(r.reply).not.toMatch(FALSE_CANCEL_CLAIM);
      expectSubmittedUntouched(saved());
      expect(saved().pendingAction).toMatchObject({ payload: { purpose: "appointment_cancellation" } });
      expect(createContactRequestAndNotify).not.toHaveBeenCalled();
      const confirmed = await say("Evet");
      expect(createContactRequestAndNotify).toHaveBeenCalledTimes(1);
      expect(confirmed.reply).toMatch(/iptal talebinizi klinik ekibine ilettim/i);
    });

    it("submitted: a bare 'Hayır' never claims the appointment was cancelled", async () => {
      const { say, saved } = makeConversation({ seed: SUBMITTED });
      const r = await say("Hayır");
      expect(r.reply).not.toMatch(FALSE_CANCEL_CLAIM);
      expectSubmittedUntouched(saved());
    });

    it("model reply claiming a cancellation is intercepted and replaced by the truthful offer", async () => {
      aiRequest.mockImplementationOnce(async () => ({ content: "Randevunuzu iptal ettim, başka bir isteğiniz var mı?", durationMs: 1 }));
      const { say, saved } = makeConversation({ seed: SUBMITTED });
      const r = await say("Otoparkınız var mı?");
      expect(aiRequest).toHaveBeenCalledTimes(1);
      expect(r.reply).not.toMatch(FALSE_CANCEL_CLAIM);
      expect(r.reply).toMatch(/doğrudan gerçekleştiremiyorum/);
      expectSubmittedUntouched(saved());
    });

    it("handoff disabled: no offer to forward, clinic contact shown instead", async () => {
      const { say, saved } = makeConversation({
        seed: SUBMITTED,
        clinic: { enableHumanHandoff: false, turkishContactNumber: "+90 212 000 00 00" },
      });
      const r = await say("Randevumu iptal etmek istiyorum.");
      expect(r.reply).toMatch(/doğrudan gerçekleştiremiyorum/);
      expect(r.reply).toContain("+90 212 000 00 00");
      expect(r.reply).not.toMatch(OFFER);
      expect(r.reply).not.toMatch(FALSE_CANCEL_CLAIM);
      expect(saved().pendingAction ?? null).toBeNull();
      expectSubmittedUntouched(saved());
    });
  });

  describe("human handoff vocabulary (truthful Contact Request, no live transfer)", () => {
    const HANDOFF_PHRASES = [
      "Temsilciye bağlar mısınız?",
      "Beni bir temsilciye bağlar mısınız?",
      "Bir yetkiliyle görüşebilir miyim?",
      "Yetkiliye bağlanmak istiyorum.",
      "Birisiyle görüşmek istiyorum.",
    ];
    const FALSE_TRANSFER = /bağlıyorum|aktarıyorum|bağladım|aktardım|transferring|connecting you/i;

    it.each(HANDOFF_PHRASES)("'%s' asks to forward a Contact Request and never claims a transfer", async (spoken) => {
      const { say, saved } = makeConversation({ seed: { conversationLocale: "tr", patientPhone: "+905322914567" } });
      const r = await say(spoken);
      expect(r.reply).toMatch(/doğrudan bir yetkiliye bağlayamıyorum/);
      expect(r.reply).not.toMatch(FALSE_TRANSFER);
      expect(saved().pendingAction).toMatchObject({ type: "create_contact_request", status: "pending" });
      expect(createContactRequestAndNotify).not.toHaveBeenCalled();
      expect(aiRequest).not.toHaveBeenCalled();
      const confirmed = await say("Evet");
      expect(createContactRequestAndNotify).toHaveBeenCalledTimes(1);
      expect(confirmed.reply).toMatch(/klinik ekibine ilettim/);
      expect(confirmed.reply).not.toMatch(FALSE_TRANSFER);
    });

    it("during collection: a handoff phrase keeps the draft", async () => {
      const draft = { requestedService: "Diş İmplantı", requestedDate: "2026-10-16", requestedTime: "14:00" };
      const { say, saved } = makeConversation({ seed: { appointmentState: "COLLECTING_NAME", appointmentDraft: draft, conversationLocale: "tr" } });
      const r = await say("Bir yetkiliyle görüşebilir miyim?");
      expect(r.reply).toMatch(/doğrudan bir yetkiliye bağlayamıyorum/);
      expect(saved().appointmentDraft).toMatchObject(draft);
      expect(createAppointmentAndNotify).not.toHaveBeenCalled();
    });

    it.each(["Temsilciniz kim?", "Yetkiliniz bugün çalışıyor mu?"])("'%s' is a question, not a handoff", async (spoken) => {
      const { say } = makeConversation({ seed: { conversationLocale: "tr" } });
      const r = await say(spoken);
      expect(r.reply).not.toMatch(/bağlayamıyorum|iletmemi ister misiniz/i);
      expect(createContactRequestAndNotify).not.toHaveBeenCalled();
    });

    it("'Beni arayın' still creates the Contact Request directly", async () => {
      const { say } = makeConversation({ seed: { conversationLocale: "tr", patientPhone: "+905322914567" } });
      const r = await say("Beni arayın lütfen.");
      expect(createContactRequestAndNotify).toHaveBeenCalledTimes(1);
      expect(r.reply).not.toMatch(FALSE_TRANSFER);
    });
  });

  it("VOICE_SLOT_TURN telemetry is structural only and never contains PII", async () => {
    const { say } = makeConversation();
    await collectUpToName(say);
    logLines.length = 0;
    await say("Yusuf Alper Özgül.");
    await say(SPOKEN_PHONE);
    const events = logLines
      .filter((line) => line.includes('"VOICE_SLOT_TURN"'))
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(events).toHaveLength(2);
    for (const event of events) {
      for (const key of Object.keys(event)) expect(ALLOWED_SLOT_TURN_KEYS.has(key), key).toBe(true);
    }
    expect(events[0]).toMatchObject({
      event: "VOICE_SLOT_TURN",
      expectedSlot: "fullName",
      resolvedSlotNames: ["fullName"],
      expectedSlotOutcome: "filled",
      reasonCode: "NAME_BARE",
      progressed: true,
      hadTerminalPunctuation: true,
      tokenCountBucket: "3-4",
      handoffOffered: false,
    });
    expect(typeof events[0].turnSeq).toBe("number");
    expect(String(events[0].sessionRef)).toMatch(/^[0-9a-f]{16}$/);
    expect(events[1]).toMatchObject({ expectedSlot: "phone", resolvedSlotNames: ["phone"], reasonCode: "PHONE_SPOKEN" });
    const blob = JSON.stringify(events);
    for (const pii of ["Yusuf", "Özgül", "532", "291", "sıfır", "conv_voice"]) expect(blob).not.toContain(pii);
  });
});
