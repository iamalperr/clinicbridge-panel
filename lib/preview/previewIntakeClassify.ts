import { trackableAIRequest } from "@/lib/services/aiGateway";
import type { PreviewBookingFields, PreviewBookingIntent } from "./previewIntake";

function asIntent(value: unknown): PreviewBookingIntent | null {
  return value === "booking" || value === "question" || value === "both" || value === "other" ? value : null;
}

function asText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim().slice(0, 80);
  return text || null;
}

export function readBookingClassification(value: unknown): PreviewBookingFields | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const intent = asIntent(record.intent);
  if (!intent) return null;
  return {
    intent,
    name: asText(record.name),
    treatment: asText(record.treatment),
    datePreference: asText(record.datePreference),
    contact: asText(record.contact),
    country: asText(record.country),
  };
}

/** Classifies one preview message. A model failure leaves the deterministic intake in charge. */
export async function classifyPreviewBooking(message: string): Promise<PreviewBookingFields | null> {
  try {
    const response = await trackableAIRequest({
      channel: "system",
      requestType: "system",
      model: "gpt-4o-mini",
      temperature: 0,
      maxTokens: 220,
      responseFormat: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Classify one clinic-website message. Reply JSON only.",
            "intent is booking, question, both, or other.",
            "booking means the visitor wants an appointment, including questions such as whether they can book.",
            "Extract only facts the visitor stated: name, treatment, datePreference, contact, country. Use null when absent.",
            "A name is a person's name. Never extract yes, okay, a question, or a phone number as a name.",
            "Languages may be Turkish, English, German, Arabic, or Russian.",
          ].join(" "),
        },
        { role: "user", content: message.slice(0, 500) },
      ],
    });
    return readBookingClassification(JSON.parse(response.content || "{}"));
  } catch {
    return null;
  }
}
