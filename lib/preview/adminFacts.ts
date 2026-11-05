import type { PreviewFacts } from "./types";

export const PREVIEW_PUBLIC_ORIGIN = "https://clinicbridge-ai.com";

export interface EditablePreview {
  clinicName: string;
  treatments: { name: string; priceRange: string }[];
  address: string;
  hours: string;
  phone: string;
  whatsapp: string;
  languages: string[];
  faq: { question: string; answer: string }[];
  logoUrl: string;
  primaryColor: string;
}

export function emptyPreviewFacts(): PreviewFacts {
  return {
    clinicName: null,
    treatments: [],
    address: null,
    hours: null,
    phone: null,
    whatsapp: null,
    languages: [],
    faq: [],
    logoUrl: null,
    primaryColor: null,
  };
}

export function clipText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function factsFromEditable(input: EditablePreview): PreviewFacts {
  const color = input.primaryColor.trim();
  return {
    clinicName: clipText(input.clinicName, 120) || null,
    treatments: input.treatments
      .map((item) => ({ name: clipText(item.name, 120), priceRange: clipText(item.priceRange, 80) || null }))
      .filter((item) => item.name),
    address: clipText(input.address, 240) || null,
    hours: clipText(input.hours, 240) || null,
    phone: clipText(input.phone, 40) || null,
    whatsapp: clipText(input.whatsapp, 40) || null,
    languages: [...new Set(input.languages.map((item) => item.trim().toLowerCase()).filter((item) => /^[a-z]{2}$/.test(item)))],
    faq: input.faq
      .map((item) => ({ question: clipText(item.question, 240), answer: clipText(item.answer, 600) }))
      .filter((item) => item.question && item.answer),
    logoUrl: clipText(input.logoUrl, 400) || null,
    primaryColor: /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color) ? color : null,
  };
}

export function editableFromFacts(facts: PreviewFacts): EditablePreview {
  return {
    clinicName: facts.clinicName || "",
    treatments: facts.treatments.map((item) => ({ name: item.name, priceRange: item.priceRange || "" })),
    address: facts.address || "",
    hours: facts.hours || "",
    phone: facts.phone || "",
    whatsapp: facts.whatsapp || "",
    languages: facts.languages,
    faq: facts.faq.map((item) => ({ question: item.question, answer: item.answer })),
    logoUrl: facts.logoUrl || "",
    primaryColor: facts.primaryColor || "",
  };
}

/** Adds newly extracted treatments and answers. Keeps facts the operator already entered. */
export function mergePreviewFacts(base: PreviewFacts, extra: PreviewFacts): PreviewFacts {
  const treatmentNames = new Set(base.treatments.map((item) => item.name.toLowerCase()));
  const treatments = [...base.treatments];
  for (const item of extra.treatments) {
    if (!treatmentNames.has(item.name.toLowerCase())) treatments.push(item);
  }
  const questions = new Set(base.faq.map((item) => item.question.toLowerCase()));
  const faq = [...base.faq];
  for (const item of extra.faq) {
    if (!questions.has(item.question.toLowerCase())) faq.push(item);
  }
  return {
    clinicName: base.clinicName || extra.clinicName,
    treatments,
    address: base.address || extra.address,
    hours: base.hours || extra.hours,
    phone: base.phone || extra.phone,
    whatsapp: base.whatsapp || extra.whatsapp,
    languages: [...new Set([...base.languages, ...extra.languages])],
    faq,
    logoUrl: base.logoUrl || extra.logoUrl,
    primaryColor: base.primaryColor || extra.primaryColor,
  };
}

export function previewPublicUrl(previewId: string): string {
  return `${PREVIEW_PUBLIC_ORIGIN}/onizleme/${encodeURIComponent(previewId)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    if (char === '"') return "&quot;";
    return "&#39;";
  });
}

export function buildPreviewLinkEmail(clinicName: string, link: string): { subject: string; html: string } {
  const name = clinicName.trim() || "Kliniğiniz";
  return {
    subject: `${name} için hazırlanan önizleme`,
    html: [
      `<p>${escapeHtml(name)} için hazırlanan önizleme bağlantısı:</p>`,
      `<p><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
      "<p>Bağlantı 7 gün geçerlidir. Your preview link is valid for 7 days.</p>",
    ].join(""),
  };
}
