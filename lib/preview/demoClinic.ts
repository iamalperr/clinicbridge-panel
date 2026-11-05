import { buildKnowledgeItems } from "./knowledge";
import type { PreviewFacts, PreviewKnowledgeItem } from "./types";

/** Public sample preview. It does not expire and is not created by a crawl. */
export const DEMO_PREVIEW_ID = "demo";
export const DEMO_CHAT_LIMIT_PER_HOUR = 20;

const facts: PreviewFacts = {
  clinicName: "Nova Dental",
  treatments: [
    { name: "İmplant", priceRange: "18.000–35.000 TL" },
    { name: "Diş beyazlatma", priceRange: "4.500–7.500 TL" },
    { name: "Zirkonyum kaplama", priceRange: "6.000–9.000 TL" },
    { name: "Ortodonti", priceRange: "40.000–70.000 TL" },
    { name: "Kanal tedavisi", priceRange: "3.500–6.000 TL" },
  ],
  address: "Nişantaşı, İstanbul",
  hours: "Pazartesi–Cuma 09:00–19:00, Cumartesi 10:00–16:00",
  phone: null,
  whatsapp: null,
  languages: ["tr", "en", "de", "ar"],
  faq: [
    {
      question: "Bu bir gerçek klinik mi?",
      answer: "Hayır. Nova Dental, ClinicBridge önizlemesini göstermek için hazırlanmış örnek bir kliniktir.",
    },
    {
      question: "İmplant fiyatı nedir?",
      answer: "Örnek implant fiyat aralığı 18.000–35.000 TL'dir. Kesin fiyat muayene sonrası belirlenir.",
    },
    {
      question: "Hafta sonu açık mısınız?",
      answer: "Örnek çalışma saatine göre cumartesi 10:00–16:00 arası açıktır. Pazar kapalıdır.",
    },
    {
      question: "Which languages do you speak?",
      answer: "This sample clinic answers in Turkish, English, German, and Arabic.",
    },
  ],
  logoUrl: null,
  primaryColor: "#0ea5e9",
};

export function demoPreviewFacts(): PreviewFacts {
  return facts;
}

export function demoKnowledgeItems(): PreviewKnowledgeItem[] {
  const items = buildKnowledgeItems(facts);
  items.push({
    title: "Sample clinic",
    category: "Klinik Genel Bilgi",
    language: "EN",
    content: [
      "Nova Dental is a sample clinic in Nişantaşı, Istanbul.",
      "Hours: Monday–Friday 09:00–19:00, Saturday 10:00–16:00.",
      "Languages: Turkish, English, German, Arabic.",
      "Implant sample range: 18,000–35,000 TL.",
      "Teeth whitening sample range: 4,500–7,500 TL.",
      "Zirconia crown sample range: 6,000–9,000 TL.",
      "Orthodontics sample range: 40,000–70,000 TL.",
      "Root canal sample range: 3,500–6,000 TL.",
      "This is not a real clinic and does not book appointments.",
    ].join("\n"),
  });
  return items;
}

export function demoPreviewView() {
  return {
    previewId: DEMO_PREVIEW_ID,
    sourceUrl: "",
    clinicName: facts.clinicName,
    logoUrl: facts.logoUrl,
    primaryColor: facts.primaryColor,
    embeddable: false,
    treatmentCount: facts.treatments.length,
    languageCount: facts.languages.length,
    questionCount: facts.faq.length,
  };
}
