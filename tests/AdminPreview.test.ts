import { describe, expect, it } from "vitest";
import {
  buildPreviewLinkEmail,
  emptyPreviewFacts,
  factsFromEditable,
  mergePreviewFacts,
  previewPublicUrl,
  type EditablePreview,
} from "../lib/preview/adminFacts";

const editable: EditablePreview = {
  clinicName: " Ada Klinik ",
  treatments: [{ name: "İmplant", priceRange: "18.000–35.000 TL" }, { name: "  ", priceRange: "1" }],
  address: "İstanbul",
  hours: "09:00-18:00",
  phone: "+90 212 000 00 00",
  whatsapp: "",
  languages: ["TR", "en", "toolong"],
  faq: [{ question: "Açık mısınız?", answer: "Hafta içi açığız." }],
  logoUrl: "https://example.com/logo.png",
  primaryColor: "#0ea5e9",
};

describe("admin preview editing", () => {
  it("keeps operator-entered facts and adds extracted ones", () => {
    const base = factsFromEditable(editable);
    const merged = mergePreviewFacts(base, {
      ...emptyPreviewFacts(),
      clinicName: "Başka Klinik",
      treatments: [{ name: "İmplant", priceRange: "1 TL" }, { name: "Beyazlatma", priceRange: "4.500 TL" }],
      phone: "+90 555 000 00 00",
      faq: [{ question: "Açık mısınız?", answer: "Başka" }, { question: "Otopark var mı?", answer: "Evet" }],
    });
    expect(merged.clinicName).toBe("Ada Klinik");
    expect(merged.phone).toBe("+90 212 000 00 00");
    expect(merged.treatments.map((item) => item.name)).toEqual(["İmplant", "Beyazlatma"]);
    expect(merged.faq.map((item) => item.question)).toEqual(["Açık mısınız?", "Otopark var mı?"]);
    expect(merged.languages).toEqual(["tr", "en"]);
    expect(merged.primaryColor).toBe("#0ea5e9");
  });

  it("builds a clinic email that contains only the preview link", () => {
    const link = previewPublicUrl("abc123");
    const letter = buildPreviewLinkEmail("Ada Klinik", link);
    expect(link).toBe("https://clinicbridge-ai.com/onizleme/abc123");
    expect(letter.subject).toContain("Ada Klinik");
    expect(letter.html).toContain(link);
    expect(letter.html).not.toContain("talebinizi aldık");
  });
});
