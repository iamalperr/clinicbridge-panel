export const SETUP_CATEGORIES = [
  "Tedaviler",
  "Çalışma Saatleri",
  "Sık Sorulan Sorular",
  "Söylenmemesi Gerekenler",
] as const;

export type SetupCategory = (typeof SETUP_CATEGORIES)[number];

export interface SetupTreatmentInput {
  id?: string;
  name: string;
  priceRange?: string | null;
}

export interface SetupFaqInput {
  id?: string;
  question: string;
  answer: string;
}

export interface SetupMaterialDraft {
  id?: string;
  title: string;
  category: SetupCategory;
  content: string;
  language: "TR" | "EN";
}

export function treatmentContent(name: string, priceRange: string | null | undefined): string {
  const title = name.trim();
  const price = priceRange?.trim();
  return price ? `${title}\nFiyat aralığı: ${price}` : title;
}

export function parseTreatment(title: string, content: string): { name: string; priceRange: string } {
  const match = content.match(/Fiyat aralığı:\s*(.+)/);
  return {
    name: title.trim() || content.split("\n")[0]?.trim() || "",
    priceRange: match?.[1]?.trim() || "",
  };
}

export function parseFaq(title: string, content: string): { question: string; answer: string } {
  const question = title.trim();
  const lines = content.split("\n");
  if (lines[0]?.trim() === question) {
    return { question, answer: lines.slice(1).join("\n").trim() };
  }
  return { question, answer: content.trim() };
}

export function draftsFromSetup(input: {
  treatments: SetupTreatmentInput[];
  hours: string;
  faq: SetupFaqInput[];
  doNotSay: string;
  language: "TR" | "EN";
}): SetupMaterialDraft[] {
  const drafts: SetupMaterialDraft[] = [];
  for (const treatment of input.treatments) {
    const name = treatment.name.trim();
    if (!name) continue;
    drafts.push({
      id: treatment.id,
      title: name,
      category: "Tedaviler",
      content: treatmentContent(name, treatment.priceRange),
      language: input.language,
    });
  }
  const hours = input.hours.trim();
  if (hours) {
    drafts.push({
      title: "Çalışma saatleri",
      category: "Çalışma Saatleri",
      content: hours,
      language: input.language,
    });
  }
  for (const entry of input.faq) {
    const question = entry.question.trim();
    const answer = entry.answer.trim();
    if (!question || !answer) continue;
    drafts.push({
      id: entry.id,
      title: question,
      category: "Sık Sorulan Sorular",
      content: `${question}\n${answer}`,
      language: input.language,
    });
  }
  const doNotSay = input.doNotSay.trim();
  if (doNotSay) {
    drafts.push({
      title: "Söylenmemesi gerekenler",
      category: "Söylenmemesi Gerekenler",
      content: doNotSay,
      language: input.language,
    });
  }
  return drafts;
}

export function shouldShowSetupBanner(clinic: { acquisition?: string; setupCompleted?: boolean } | null | undefined): boolean {
  return clinic?.acquisition === "direct" && clinic.setupCompleted !== true;
}
