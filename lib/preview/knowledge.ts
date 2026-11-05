import type { PreviewFacts, PreviewKnowledgeItem } from "./types";

function itemLanguage(languages: string[]): "TR" | "EN" {
  return languages.some((language) => language.toLowerCase().startsWith("tr")) ? "TR" : "EN";
}

/** Turns grounded facts into knowledge records. Omits anything the site did not provide. */
export function buildKnowledgeItems(facts: PreviewFacts): PreviewKnowledgeItem[] {
  const language = itemLanguage(facts.languages);
  const items: PreviewKnowledgeItem[] = [];

  const general: string[] = [];
  if (facts.clinicName) general.push(facts.clinicName);
  if (facts.address) general.push(facts.address);
  if (facts.phone) general.push(`Telefon: ${facts.phone}`);
  if (facts.whatsapp) general.push(`WhatsApp: ${facts.whatsapp}`);
  if (general.length) {
    items.push({
      title: facts.clinicName || "Klinik",
      category: "Klinik Genel Bilgi",
      language,
      content: general.join("\n"),
    });
  }

  for (const treatment of facts.treatments) {
    const lines = [treatment.name];
    if (treatment.priceRange) lines.push(`Fiyat aralığı: ${treatment.priceRange}`);
    items.push({
      title: treatment.name,
      category: "Tedaviler",
      language,
      content: lines.join("\n"),
    });
  }

  if (facts.hours) {
    items.push({
      title: "Çalışma saatleri",
      category: "Çalışma Saatleri",
      language,
      content: facts.hours,
    });
  }

  for (const entry of facts.faq) {
    items.push({
      title: entry.question,
      category: "Sık Sorulan Sorular",
      language,
      content: `${entry.question}\n${entry.answer}`,
    });
  }

  return items;
}
