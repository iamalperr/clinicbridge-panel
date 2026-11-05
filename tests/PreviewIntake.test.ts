import { describe, expect, it } from "vitest";
import { novaAnswer, NOVA_TREATMENTS, NOVA_WEEK } from "../lib/demo/novaDental";
import {
  advancePreviewIntake,
  composePreviewIntakeReply,
  readIntakeState,
} from "../lib/preview/previewIntake";
import { readBookingClassification } from "../lib/preview/previewIntakeClassify";

const treatments = NOVA_TREATMENTS.map((item) => item.name.tr);
const now = new Date("2026-11-04T09:00:00.000Z");

describe("preview booking intake", () => {
  it("asks for a name on the first booking sentence and never uses the knowledge fallback", () => {
    const result = advancePreviewIntake({ message: "Randevu alabilir miyim?", treatments, hours: NOVA_WEEK, now });
    expect(result.reply).toBe("Randevu için adınızı ve soyadınızı yazar mısınız?");
    expect(result.reply).not.toMatch(/bilgiye sahip değilim/);
    expect(result.answerQuestion).toBe(false);
    expect(result.intakeState.waitingFor).toBe("name");
    expect(result.lead).toBeNull();
  });

  it("stores a stated name and asks for the treatment", () => {
    const opened = advancePreviewIntake({ message: "Randevu alabilir miyim?", treatments, now });
    const named = advancePreviewIntake({ message: "Lale Öztürk", state: opened.intakeState, treatments, now });
    expect(named.intakeState.name).toBe("Lale Öztürk");
    expect(named.reply).toBe("Hangi tedaviyle ilgileniyorsunuz?");
    expect(named.intakeState.waitingFor).toBe("treatment");
  });

  it("builds the card from one message that already contains every field", () => {
    const result = advancePreviewIntake({
      message: "Ben Lale Öztürk, implant için 15 Aralık uygun, +44 7700 900123",
      treatments,
      hours: NOVA_WEEK,
      now,
    });
    expect(result.lead?.name).toBe("Lale Öztürk");
    expect(result.lead?.treatment).toBe("İmplant");
    expect(result.lead?.datePreference).toBe("15 Aralık");
    expect(result.lead?.contact).toContain("+44");
    expect(result.reply).toContain("Talebiniz klinik ekibine iletildi");
    expect(result.intakeState.active).toBe(false);
    expect(result.intakeState.waitingFor).toBeNull();
  });

  it("answers a question in the middle of the form and returns to the pending field", () => {
    const opened = advancePreviewIntake({ message: "Randevu almak istiyorum", treatments, now });
    const named = advancePreviewIntake({ message: "Lale Öztürk", state: opened.intakeState, treatments, now });
    const asked = advancePreviewIntake({ message: "implant ne kadar sürer?", state: named.intakeState, treatments, now });
    expect(asked.answerQuestion).toBe(true);
    expect(asked.intakeState.treatment).toBeNull();
    expect(asked.intakeState.waitingFor).toBe("treatment");
    const reply = composePreviewIntakeReply(asked, novaAnswer("implant ne kadar sürer?", "tr"));
    expect(reply).toMatch(/İmplant/);
    expect(reply).toContain("Hangi tedaviyle ilgileniyorsunuz?");
    expect(reply).not.toMatch(/bilgiye sahip değilim/);
    const missing = composePreviewIntakeReply(asked, "Bu konuda bilgiye sahip değilim.");
    expect(missing).toContain("Bu konuyu klinik ekibine not ediyorum, size dönecekler.");
    expect(missing).toContain("Hangi tedaviyle ilgileniyorsunuz?");
  });

  it("completes a German booking", () => {
    const opened = advancePreviewIntake({ message: "Termin möglich?", treatments, now });
    expect(opened.intakeState.language).toBe("de");
    expect(opened.reply).toMatch(/heißen/);
    const named = advancePreviewIntake({ message: "Lale Öztürk", state: opened.intakeState, treatments, now });
    const treated = advancePreviewIntake({ message: "Implantat", state: named.intakeState, treatments, now });
    const dated = advancePreviewIntake({ message: "15. Dezember", state: treated.intakeState, treatments, now });
    const done = advancePreviewIntake({ message: "anna@example.de", state: dated.intakeState, treatments, hours: NOVA_WEEK, now });
    expect(done.lead?.language).toBe("de");
    expect(done.lead?.treatment).toBe("İmplant");
    expect(done.reply).toContain("Ihre Anfrage wurde an das Klinikteam weitergeleitet.");
    expect(done.intakeState.active).toBe(false);
  });

  it("completes an Arabic booking", () => {
    const opened = advancePreviewIntake({ message: "هل يمكن حجز موعد؟", treatments, now });
    expect(opened.intakeState.language).toBe("ar");
    expect(opened.reply).toContain("ما اسمكم");
    const named = advancePreviewIntake({ message: "ليلى أحمد", state: opened.intakeState, treatments, now });
    const treated = advancePreviewIntake({ message: "زراعة", state: named.intakeState, treatments, now });
    const dated = advancePreviewIntake({ message: "15 ديسمبر", state: treated.intakeState, treatments, now });
    const done = advancePreviewIntake({ message: "+44 7700 900123", state: dated.intakeState, treatments, hours: NOVA_WEEK, now });
    expect(done.lead?.name).toBe("ليلى أحمد");
    expect(done.lead?.language).toBe("ar");
    expect(done.reply).toContain("تم إرسال طلبكم إلى فريق العيادة.");
  });

  it("rejects yes as a name, asks differently once, then skips the field", () => {
    const opened = advancePreviewIntake({ message: "Randevu alabilir miyim?", treatments, now });
    const first = advancePreviewIntake({ message: "evet", state: opened.intakeState, treatments, now });
    expect(first.intakeState.name).toBeNull();
    expect(first.intakeState.clarified).toBe(true);
    expect(first.reply).not.toBe(opened.reply);
    expect(first.reply).toMatch(/Ayşe Yılmaz/);
    const second = advancePreviewIntake({ message: "evet", state: first.intakeState, treatments, now });
    expect(second.intakeState.name).toBe("belirtilmedi");
    expect(second.intakeState.waitingFor).toBe("treatment");
    expect(second.reply).not.toBe(first.reply);
  });

  it("trusts a valid draft and ignores a malformed one", () => {
    const opened = advancePreviewIntake({ message: "Can I book?", language: "en", treatments, now });
    expect(opened.reply).toMatch(/first and last name/);
    expect(readIntakeState({ active: true, waitingFor: "phone" }, "en")).toBeNull();
    const kept = advancePreviewIntake({
      message: "Lale Öztürk",
      state: { ...opened.intakeState, name: "x".repeat(80) },
      treatments,
      now,
    });
    expect(kept.intakeState.name).toBe("Lale Öztürk");
  });

  it("reads a booking classification without calling a model", () => {
    expect(readBookingClassification({
      intent: "booking",
      name: null,
      treatment: "implant",
      datePreference: null,
      contact: null,
      country: null,
    })?.intent).toBe("booking");
    expect(readBookingClassification({ intent: "maybe" })).toBeNull();
    const classified = advancePreviewIntake({
      message: "hello",
      classified: { intent: "booking", name: "Lale Öztürk", treatment: "implant", datePreference: "15 December", contact: "+44 7700 900123" },
      treatments,
      now,
    });
    expect(classified.lead?.name).toBe("Lale Öztürk");
  });
});
