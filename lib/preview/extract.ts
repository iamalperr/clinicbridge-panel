import { trackableAIRequest } from "@/lib/services/aiGateway";
import { groundPreviewFacts } from "./ground";
import type { PreviewFacts } from "./types";

export async function extractPreviewFacts(
  corpus: string,
  signals: { languages: string[]; logoUrl: string | null; primaryColor: string | null }
): Promise<PreviewFacts> {
  const response = await trackableAIRequest({
    channel: "system",
    requestType: "system",
    model: "gpt-4o-mini",
    temperature: 0,
    maxTokens: 1800,
    responseFormat: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You extract clinic facts from website text. Return JSON only. Use null or empty arrays when the text does not state a fact. Never invent a clinic name, treatment, price, address, opening hours, phone, WhatsApp number, or FAQ. Copy prices only when the page states them. JSON keys: clinicName, treatments (array of {name, priceRange}), address, hours, phone, whatsapp, faq (array of {question, answer}).",
      },
      {
        role: "user",
        content: corpus.slice(0, 24_000),
      },
    ],
  });

  let parsed: unknown = {};
  try {
    parsed = JSON.parse(response.content || "{}");
  } catch {
    parsed = {};
  }
  return groundPreviewFacts(parsed, corpus, signals);
}
