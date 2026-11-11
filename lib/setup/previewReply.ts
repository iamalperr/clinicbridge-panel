import type { SetupFaqInput, SetupTreatmentInput } from "@/lib/setup/materials";
import { parseWorkingHours, WEEKDAY_LABELS_TR, WEEKDAY_ORDER } from "@/lib/setup/workingHours";

const SAMPLE_QUESTION = "İmplant fiyatı ne kadar?";

export function setupSampleQuestion(): string {
  return SAMPLE_QUESTION;
}

/** Deterministic mini-chat reply from wizard draft data (no LLM). */
export function buildSetupPreviewReply(input: {
  treatments: SetupTreatmentInput[];
  hours: string;
  faq: SetupFaqInput[];
  question?: string;
}): string {
  const question = (input.question || SAMPLE_QUESTION).toLowerCase();
  const implant = input.treatments.find((item) => /implant/i.test(item.name));
  const priced = input.treatments.find((item) => item.priceRange?.trim());

  if (/fiyat|price|ne kadar|ücret|cost/i.test(question)) {
    if (implant?.priceRange?.trim()) {
      return `${implant.name} için fiyat aralığımız ${implant.priceRange.trim()}. Kesin tutar muayene sonrası netleşir; dilerseniz randevu talebi oluşturabilirim.`;
    }
    if (priced?.priceRange?.trim()) {
      return `${priced.name} için fiyat aralığımız ${priced.priceRange.trim()}. Detaylı plan için randevu talebi alabilirim.`;
    }
    if (implant || input.treatments.some((item) => item.name.trim())) {
      return "Bu tedavi için kesin fiyatı muayene sonrası paylaşıyoruz. İsterseniz ekibimize randevu talebi iletebilirim.";
    }
  }

  const faqHit = input.faq.find(
    (item) =>
      item.question.trim() &&
      item.answer.trim() &&
      (question.includes(item.question.toLowerCase().slice(0, 12)) ||
        item.question.toLowerCase().includes("fiyat") ||
        item.question.toLowerCase().includes("süre"))
  );
  if (faqHit) return faqHit.answer.trim();

  if (input.hours.trim()) {
    const weekly = parseWorkingHours(input.hours);
    const openDays = WEEKDAY_ORDER.filter((key) => weekly[key].open)
      .map((key) => `${WEEKDAY_LABELS_TR[key]} ${weekly[key].start}-${weekly[key].end}`)
      .slice(0, 3);
    if (openDays.length) {
      return `Kliniğimizin çalışma saatleri: ${openDays.join(", ")}. Size nasıl yardımcı olabilirim?`;
    }
  }

  const names = input.treatments.map((item) => item.name.trim()).filter(Boolean).slice(0, 3);
  if (names.length) {
    return `${names.join(", ")} hakkında bilgi verebilirim. Hangi tedaviyle ilgileniyorsunuz?`;
  }

  return "Kliniğimiz hakkında bilgi verebilir, randevu talebinizi ekibe iletebilirim. Nasıl yardımcı olayım?";
}
