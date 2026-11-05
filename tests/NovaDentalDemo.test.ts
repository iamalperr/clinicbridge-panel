import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isOutsideClinicHours, parseClinicHours } from "../lib/preview/clinicHours";
import { detectPreviewLanguage } from "../lib/preview/previewLanguage";
import { advancePreviewIntake } from "../lib/preview/previewIntake";
import { NOVA_DOCTORS, NOVA_FAQS, NOVA_HOURS_TEXT, NOVA_TREATMENTS, NOVA_WEEK, novaAnswer, novaKnowledgeItems } from "../lib/demo/novaDental";

describe("Nova Dental demo", () => {
  it("keeps a rich fictional clinic out of the demo disclaimer", () => {
    expect(NOVA_DOCTORS).toHaveLength(3);
    expect(NOVA_TREATMENTS.map((item) => item.price).every((price) => price.includes("€"))).toBe(true);
    expect(NOVA_FAQS.length).toBeGreaterThanOrEqual(15);
    const knowledge = novaKnowledgeItems().map((item) => item.content).join("\n");
    expect(knowledge).toMatch(/Dr\. Selin Acar/);
    expect(knowledge).not.toMatch(/gerçek klinik değildir|not a real clinic|randevu alımı yapmamaktadır/i);
  });

  it("answers doctors and prices without calling them a sample", () => {
    expect(novaAnswer("Doktorlarınız kim?", "tr")).toMatch(/Selin Acar/);
    expect(novaAnswer("fiyat listesi gönderir misiniz", "tr")).toMatch(/450–750 €/);
    expect(novaAnswer("Wie viel kosten Zirkonkronen?", "de")).toMatch(/180–280 €/);
    expect(novaAnswer("كم سعر ابتسامة هوليود؟", "ar")).toMatch(/3\.200–6\.400 €/);
    expect(novaAnswer("Doktorlarınız kim?", "tr")).not.toMatch(/demo|örnek klinik|not a real clinic/i);
  });

  it("switches the interface language from the visitor's message", () => {
    expect(detectPreviewLanguage("Wie lange muss ich für Implantate in Istanbul bleiben?")).toBe("de");
    expect(detectPreviewLanguage("كم سعر ابتسامة هوليود؟")).toBe("ar");
    expect(detectPreviewLanguage("Сколько стоит имплант?")).toBe("ru");
    expect(detectPreviewLanguage("Doktorlarınız kim?")).toBe("tr");
    expect(detectPreviewLanguage("I'm in London, how much are zirconia crowns?")).toBe("en");
  });

  it("collects an appointment from explicit state until every field exists", () => {
    const now = new Date("2026-11-04T09:00:00.000Z");
    const treatments = NOVA_TREATMENTS.map((item) => item.name.tr);
    const first = advancePreviewIntake({ message: "Randevu almak istiyorum", treatments, hours: NOVA_WEEK, now });
    expect(first.lead).toBeNull();
    expect(first.reply).toMatch(/adınızı/);
    expect(first.reply).not.toMatch(/bilgiye sahip değilim/);
    const named = advancePreviewIntake({ message: "Ayşe Yılmaz", state: first.intakeState, treatments, hours: NOVA_WEEK, now });
    const treated = advancePreviewIntake({ message: "İmplant", state: named.intakeState, treatments, hours: NOVA_WEEK, now });
    const dated = advancePreviewIntake({ message: "Haziranın ikinci haftası", state: treated.intakeState, treatments, hours: NOVA_WEEK, now });
    const done = advancePreviewIntake({ message: "+90 532 111 22 33", state: dated.intakeState, treatments, hours: NOVA_WEEK, now });
    expect(done.reply).toContain("Talebiniz klinik ekibine iletildi");
    expect(done.lead?.name).toBe("Ayşe Yılmaz");
    expect(done.lead?.treatment).toBe("İmplant");
    expect(done.lead?.outsideHours).toBe(false);
    expect(done.intakeState.active).toBe(false);
  });

  it("marks Sunday closed and a Wednesday afternoon open", () => {
    expect(isOutsideClinicHours(new Date("2026-11-08T09:00:00.000Z"), NOVA_WEEK)).toBe(true);
    expect(isOutsideClinicHours(new Date("2026-11-04T09:00:00.000Z"), NOVA_WEEK)).toBe(false);
    const parsed = parseClinicHours(NOVA_HOURS_TEXT);
    expect(parsed?.[1]?.start).toBe(9 * 60);
    expect(parsed?.[6]?.start).toBe(10 * 60);
    expect(parsed?.[5]?.end).toBe(19 * 60);
    expect(parsed?.[0]).toBeUndefined();
  });

  it("does not import the demo clinic into the live agent", () => {
    const agent = readFileSync("lib/agent/handleClinicAgentTurn.ts", "utf8");
    const signup = readFileSync("app/api/public/signup/route.ts", "utf8");
    expect(agent).not.toContain("lib/demo/novaDental");
    expect(signup).not.toContain("lib/demo/novaDental");
  });
});
