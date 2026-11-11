import type { SetupFaqInput, SetupTreatmentInput } from "@/lib/setup/materials";

export function setupProfilePercent(input: {
  treatments: SetupTreatmentInput[];
  hours: string;
  faq: SetupFaqInput[];
  doNotSay: string;
  appointmentEmail?: string;
  appointmentWhatsapp?: string;
  widgetInstalled?: boolean;
}): number {
  let score = 0;
  if (input.treatments.some((item) => item.name.trim())) score += 30;
  if (input.hours.trim()) score += 15;
  if (input.faq.some((item) => item.question.trim() && item.answer.trim())) score += 20;
  if (input.doNotSay.trim()) score += 10;
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((input.appointmentEmail || "").trim());
  const waOk = (input.appointmentWhatsapp || "").replace(/\D/g, "").length >= 8;
  if (emailOk || waOk) score += 15;
  if (input.widgetInstalled) score += 10;
  return Math.min(100, score);
}
