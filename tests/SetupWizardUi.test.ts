import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { setupProfilePercent } from "../lib/setup/completion";
import { knowledgeValuesEqual, isKnowledgeFormValid } from "../components/clinic/training/KnowledgeEditor";
import { parseWorkingHours, serializeWorkingHours } from "../lib/setup/workingHours";

describe("setup wizard UI contracts", () => {
  it("reuses KnowledgeEditor from Eğitim Bilgi ekle and debounces autosave", () => {
    const training = readFileSync("app/clinics/[clinicId]/training/page.tsx", "utf8");
    const wizard = readFileSync("components/setup/SetupWizard.tsx", "utf8");
    expect(training).toContain('from "@/components/clinic/training/KnowledgeEditor"');
    expect(wizard).toContain('from "@/components/clinic/training/KnowledgeEditor"');
    expect(wizard).toContain("data-testid=\"setup-add-treatment\"");
    expect(wizard).toContain("Acil durumlarda asistan her zaman önce 112");
    expect(wizard).toContain("1000");
    expect(wizard).toContain('setSaveState("error")');
    expect(wizard).toContain("Saatlerinizi yeni formatta onaylayın");
    expect(wizard).toContain("Deterministic client-side preview");
    expect(readFileSync("components/setup/SetupHoursPicker.tsx", "utf8")).toContain("Hafta içi hepsine uygula");
  });

  it("keeps unsaved-change detection for the shared editor", () => {
    const a = { title: "A", content: "B", entity_type: "general", priceRange: "" };
    expect(knowledgeValuesEqual(a, { ...a })).toBe(true);
    expect(knowledgeValuesEqual(a, { ...a, title: "C" })).toBe(false);
    expect(isKnowledgeFormValid("treatment", { ...a, title: "İmplant", content: "" })).toBe(true);
  });

  it("computes profile completion from draft fields", () => {
    expect(
      setupProfilePercent({
        treatments: [{ name: "İmplant" }],
        hours: serializeWorkingHours(parseWorkingHours("Pzt-Cuma 09:00-18:00")),
        faq: [{ question: "Soru?", answer: "Cevap" }],
        doNotSay: "Teşhis koymasın",
        appointmentEmail: "a@b.com",
        widgetInstalled: false,
      })
    ).toBeGreaterThanOrEqual(75);
  });

  it("copies setup strings away from bot wording", () => {
    const tr = readFileSync("locales/tr.json", "utf8");
    expect(tr).toContain("Asistanınızı yayına alın");
    expect(tr).toContain("Asistanın söylememesi gerekenler");
    expect(tr).not.toContain("Botunuzu yayına alın");
  });
});
