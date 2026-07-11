/**
 * responseBuilder.ts
 *
 * Generates structured chat messages from matching results.
 */

import type { ClinicRecommendation, ClinicPricingItem, DemoClinicInput } from "./clinicMatcher";
import type { ParsedIntent } from "./intentParser";

// ─── Chat Message Types ─────────────────────────────────────────────────────

export type ChatMessageType =
  | "text"
  | "clinic_recommendations"
  | "clinic_answer"
  | "pricing_answer"
  | "doctor_answer";

export interface ChatMessage {
  id: string;
  role: "user" | "ai";
  type: ChatMessageType;
  text: string;
  clinics?: ClinicRecommendation[];
  pricing?: ClinicPricingItem[];
  focusedClinicName?: string;
}

// ─── Response Builders ──────────────────────────────────────────────────────

let msgCounter = 0;
function nextId(): string { return `msg_${Date.now()}_${++msgCounter}`; }

export function buildMatchingResponse(
  intent: ParsedIntent,
  clinics: ClinicRecommendation[]
): ChatMessage {
  const lang = intent.language;

  if (clinics.length === 0) {
    return {
      id: nextId(), role: "ai", type: "text",
      text: lang === "tr"
        ? "Maalesef kriterlerinize uygun klinik bulunamadı. Farklı tedavi veya lokasyon ile tekrar deneyebilirsiniz."
        : "Unfortunately, no clinics matched your criteria. You can try a different treatment or location.",
    };
  }

  const locationPart = intent.location ? (lang === "tr" ? ` ${intent.location} bölgesinde` : ` in ${intent.location}`) : "";
  const treatmentPart = intent.subTreatment || (lang === "tr" ? "tedaviniz" : "your treatment");

  const text = lang === "tr"
    ? `${treatmentPart} için${locationPart} ${clinics.length} uygun klinik buldum. Bütçenize ve tedavi ihtiyacınıza göre aşağıdaki klinikler değerlendirilebilir.`
    : `I found ${clinics.length} suitable clinic${clinics.length > 1 ? "s" : ""} for ${treatmentPart}${locationPart}. Here are the recommendations based on your needs.`;

  return {
    id: nextId(), role: "ai", type: "clinic_recommendations",
    text,
    clinics,
    focusedClinicName: clinics[0]?.clinicName,
  };
}

export function buildClinicAnswerResponse(
  intent: ParsedIntent,
  clinic: DemoClinicInput,
  pricing: ClinicPricingItem[]
): ChatMessage {
  const lang = intent.language;

  const parts: string[] = [];

  // Overview
  const desc = lang === "tr" ? clinic.longDescription?.tr || clinic.shortDescription?.tr : clinic.longDescription?.en || clinic.shortDescription?.en;
  if (desc) parts.push(desc);

  // Specialties
  const specs = clinic.specialties.map((s) => lang === "tr" ? s.tr : s.en).join(", ");
  if (specs) {
    parts.push(lang === "tr" ? `Sunulan tedaviler: ${specs}.` : `Treatments offered: ${specs}.`);
  }

  // Services
  if (clinic.services && clinic.services.length > 0) {
    parts.push(lang === "tr" ? `Hizmetler: ${clinic.services.join(", ")}.` : `Services: ${clinic.services.join(", ")}.`);
  }

  // Accreditations
  if (clinic.accreditations && clinic.accreditations.length > 0) {
    parts.push(lang === "tr" ? `Akreditasyonlar: ${clinic.accreditations.join(", ")}.` : `Accreditations: ${clinic.accreditations.join(", ")}.`);
  }

  // Closing
  parts.push(lang === "tr"
    ? "Daha fazla bilgi için klinik profilini inceleyebilir veya teklif talebi oluşturabilirsiniz."
    : "You can view the clinic profile for more details or request a quote.");

  // Build a mini recommendation for the card
  const miniClinic: ClinicRecommendation = {
    clinicId: clinic.id,
    clinicName: clinic.name,
    clinicSlug: clinic.clinicSlug,
    clinicType: lang === "tr" ? clinic.type.tr : clinic.type.en,
    location: clinic.location,
    rating: clinic.rating,
    reviews: clinic.reviews,
    matchScore: 0,
    matchedTreatment: "",
    matchedSubTreatment: "",
    matchedPrices: pricing.slice(0, 6).map((p) => ({
      subTreatmentName: p.subTreatmentName || p.treatmentName || "—",
      priceMin: p.priceMin,
      priceMax: p.priceMax,
      currency: p.currency || "EUR",
      priceType: p.priceType || "package",
      duration: p.duration || "",
    })),
    supportedLanguages: clinic.languages,
    reason: "",
    profilePath: `/agency-demo/medicalcenter/${clinic.clinicSlug}`,
    accommodation: clinic.accommodation,
    transfer: clinic.transfer,
    shortDescription: (lang === "tr" ? clinic.shortDescription?.tr : clinic.shortDescription?.en) || "",
  };

  return {
    id: nextId(), role: "ai", type: "clinic_answer",
    text: parts.join("\n\n"),
    clinics: [miniClinic],
    focusedClinicName: clinic.name,
  };
}

export function buildPricingResponse(
  intent: ParsedIntent,
  clinic: DemoClinicInput | undefined,
  pricing: ClinicPricingItem[]
): ChatMessage {
  const lang = intent.language;

  if (pricing.length === 0) {
    return {
      id: nextId(), role: "ai", type: "text",
      text: lang === "tr"
        ? "Bu tedavi için sistemde net fiyat tanımlı değil. Teklif alarak öğrenebilirsiniz."
        : "No pricing information is available for this treatment. You can request a quote to learn more.",
    };
  }

  const subName = intent.subTreatment || "";
  const clinicLabel = clinic?.name || (lang === "tr" ? "Klinikler" : "Clinics");

  const priceLines = pricing.map((p) => {
    const name = p.subTreatmentName || p.treatmentName || "—";
    const price = p.priceMin === p.priceMax ? `${p.priceMin} ${p.currency}` : `${p.priceMin}–${p.priceMax} ${p.currency}`;
    const dur = p.duration ? ` · ${p.duration}` : "";
    return `• ${name}: ${price}${dur}`;
  }).join("\n");

  const text = lang === "tr"
    ? `${clinicLabel} — ${subName || "Fiyat Bilgileri"}:\n\n${priceLines}\n\nFiyatlar tahminidir; kesin fiyat klinik değerlendirmesine göre değişebilir.`
    : `${clinicLabel} — ${subName || "Pricing Information"}:\n\n${priceLines}\n\nPrices are estimates; final pricing depends on clinical evaluation.`;

  const miniClinic = clinic ? [{
    clinicId: clinic.id,
    clinicName: clinic.name,
    clinicSlug: clinic.clinicSlug,
    clinicType: lang === "tr" ? clinic.type.tr : clinic.type.en,
    location: clinic.location,
    rating: clinic.rating,
    reviews: clinic.reviews,
    matchScore: 0,
    matchedTreatment: "",
    matchedSubTreatment: subName,
    matchedPrices: pricing.slice(0, 6).map((p) => ({
      subTreatmentName: p.subTreatmentName || p.treatmentName || "—",
      priceMin: p.priceMin, priceMax: p.priceMax, currency: p.currency || "EUR",
      priceType: p.priceType || "package", duration: p.duration || "",
    })),
    supportedLanguages: clinic.languages,
    reason: "",
    profilePath: `/agency-demo/medicalcenter/${clinic.clinicSlug}`,
    accommodation: clinic.accommodation,
    transfer: clinic.transfer,
    shortDescription: "",
  } as ClinicRecommendation] : undefined;

  return {
    id: nextId(), role: "ai", type: "pricing_answer",
    text,
    clinics: miniClinic,
    focusedClinicName: clinic?.name,
  };
}

export function buildDoctorResponse(
  intent: ParsedIntent,
  clinic: DemoClinicInput | undefined,
  doctors: any[]
): ChatMessage {
  const lang = intent.language;
  const clinicLabel = clinic?.name || "";

  if (!clinic) {
    return {
      id: nextId(), role: "ai", type: "text",
      text: lang === "tr"
        ? "Hangi kliniğin doktorlarını öğrenmek istediğinizi belirtir misiniz?"
        : "Could you specify which clinic's doctors you'd like to learn about?",
    };
  }

  if (doctors.length === 0) {
    return {
      id: nextId(), role: "ai", type: "text",
      text: lang === "tr"
        ? `${clinicLabel} için sistemde doktor bilgisi henüz tanımlı değil. Detaylı bilgi için klinikle iletişime geçebilirsiniz.`
        : `No doctor information is available for ${clinicLabel} yet. You can contact the clinic for details.`,
      focusedClinicName: clinic.name,
    };
  }

  const docLines = doctors.map((d: any) => {
    const title = d.title || "";
    const specs = (d.specialties || []).join(", ");
    return `• ${title} ${d.name}${specs ? ` — ${specs}` : ""}`;
  }).join("\n");

  return {
    id: nextId(), role: "ai", type: "doctor_answer",
    text: lang === "tr"
      ? `${clinicLabel} doktor kadrosu:\n\n${docLines}`
      : `${clinicLabel} medical team:\n\n${docLines}`,
    focusedClinicName: clinic.name,
  };
}

export function buildGreetingMessage(lang: "tr" | "en"): ChatMessage {
  return {
    id: nextId(), role: "ai", type: "text",
    text: lang === "tr"
      ? "Merhaba! Size en uygun kliniği bulmak için buradayım. Hangi tedaviyi arıyorsunuz? Lokasyon veya bütçe tercihiniz varsa onu da belirtebilirsiniz."
      : "Hello! I'm here to help you find the right clinic. What treatment are you looking for? Feel free to share your preferred location or budget.",
  };
}

export function buildUserMessage(text: string): ChatMessage {
  return { id: nextId(), role: "user", type: "text", text };
}
