/**
 * Central i18n for technical / empty-reply fallbacks.
 * Every user-visible error path must use this — never inline Turkish-only strings.
 */

import { isTimeoutError } from "@/lib/services/infrastructureErrors";

export type TechnicalFallbackCategory =
  | "llm_failure"
  | "rag_failure"
  | "timeout"
  | "empty_reply_guard"
  | "unconfigured_ai"
  | "route_unhandled_exception"
  /** @deprecated Prefer llm_failure / rag_failure / timeout */
  | "llm_or_rag_failure";

/** Coarse server-side category for structured technical-fallback logs (no PII). */
export type TechnicalFallbackErrorCategory = "llm" | "rag" | "timeout" | "unknown";

function readErrorMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message?: unknown }).message || "");
  }
  return "";
}

/**
 * Map a thrown error + origin into a coarse category for observability.
 * Never inspects or returns message content beyond timeout keyword detection.
 */
export function classifyTechnicalFallbackError(
  err: unknown,
  source: "llm" | "rag" | "route" | "empty" | "config"
): TechnicalFallbackErrorCategory {
  if (source === "empty" || source === "config" || source === "route") return "unknown";
  if (isTimeoutError(err) || /timeout|etimedout|aborted|deadline/i.test(readErrorMessage(err))) {
    return "timeout";
  }
  if (source === "rag") return "rag";
  if (source === "llm") return "llm";
  return "unknown";
}

export function fallbackReasonForErrorCategory(
  category: TechnicalFallbackErrorCategory,
  source: "llm" | "rag" | "route" | "empty" | "config"
): TechnicalFallbackCategory {
  if (category === "timeout") return "timeout";
  if (category === "rag") return "rag_failure";
  if (category === "llm") return "llm_failure";
  if (source === "empty") return "empty_reply_guard";
  if (source === "config") return "unconfigured_ai";
  if (source === "route") return "route_unhandled_exception";
  return "route_unhandled_exception";
}

/** Pipeline step that threw before the technical fallback was shown. */
export type TechnicalFailureStep = "rag_retrieval" | "llm_call" | "route" | "config" | "empty_reply";

/** Content-free cause of a technical failure (no message text, stack or provider body). */
export interface TechnicalErrorDetails {
  step: TechnicalFailureStep;
  errorType: string;
  /** Gateway/app code, e.g. OPENAI_QUOTA_EXCEEDED, OPENAI_TIMEOUT. */
  errorCode: string | null;
  /** Provider's own code, e.g. credit_balance_exhausted. */
  providerErrorCode: string | null;
  httpStatus: number | null;
}

function shortCode(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value.trim().slice(0, 64);
}

export function describeTechnicalError(err: unknown, step: TechnicalFailureStep): TechnicalErrorDetails {
  const e = (typeof err === "object" && err !== null ? err : {}) as {
    name?: unknown;
    code?: unknown;
    providerErrorCode?: unknown;
    httpStatus?: unknown;
    status?: unknown;
  };
  const httpStatus =
    typeof e.httpStatus === "number" ? e.httpStatus : typeof e.status === "number" ? e.status : null;
  return {
    step,
    errorType: err instanceof Error ? (err.name || "Error").slice(0, 64) : err === undefined ? "none" : typeof err,
    errorCode: shortCode(e.code) ?? (typeof e.code === "number" ? String(e.code) : null),
    providerErrorCode: shortCode(e.providerErrorCode),
    httpStatus,
  };
}

/**
 * Structured server-side log for every technical-fallback turn.
 * Forbidden: message text, patient PII, secrets, raw provider bodies.
 */
export function logTechnicalFallbackEvent(params: {
  category: TechnicalFallbackErrorCategory;
  fallbackReason: TechnicalFallbackCategory | string;
  clinicId?: string | null;
  conversationId?: string | null;
  error?: TechnicalErrorDetails;
}): void {
  console.error(
    JSON.stringify({
      event: "technical_fallback",
      category: params.category,
      fallbackReason: params.fallbackReason,
      clinicId: params.clinicId || "unknown",
      conversationId: params.conversationId || "unknown",
      ...(params.error
        ? {
            step: params.error.step,
            errorType: params.error.errorType,
            errorCode: params.error.errorCode,
            providerErrorCode: params.error.providerErrorCode,
            httpStatus: params.error.httpStatus,
          }
        : {}),
      ts: new Date().toISOString(),
    })
  );
}

/** Stable code persisted on the conversation log, e.g. "OPENAI_QUOTA_EXCEEDED". */
export function technicalErrorCodeFor(details: TechnicalErrorDetails): string {
  return (details.errorCode || details.providerErrorCode || details.errorType || "unknown").toUpperCase();
}

export function resolveClinicPhoneForFallback(clinicData?: {
  whatsappNumber?: string | null;
  turkishContactNumber?: string | null;
  internationalContactNumber?: string | null;
  phone?: string | null;
} | null): string {
  if (!clinicData) return "";
  const candidates = [
    clinicData.whatsappNumber,
    clinicData.turkishContactNumber,
    clinicData.internationalContactNumber,
    clinicData.phone,
  ];
  for (const c of candidates) {
    const t = typeof c === "string" ? c.trim() : "";
    const digits = t.replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15) return t;
  }
  return "";
}

/**
 * Localized technical-problem reply: patient language, optional clinic phone,
 * and an offer to open the contact/handoff flow (useful when the clinic is closed).
 */
export function formatTechnicalFallbackReply(params: {
  locale?: string | null;
  clinicPhone?: string | null;
}): string {
  const lang = String(params.locale || "tr").toLowerCase();
  const phone = typeof params.clinicPhone === "string" ? params.clinicPhone.trim() : "";
  const phoneBit = phone ? ` (${phone})` : "";

  if (lang.startsWith("en")) {
    return (
      `We're experiencing a temporary technical issue.` +
      (phone
        ? ` You can also reach the clinic directly${phoneBit}.`
        : "") +
      ` If you'd like, I can take your name and phone number and have the clinic team contact you.`
    );
  }
  if (lang.startsWith("de")) {
    return (
      `Wir haben derzeit ein technisches Problem.` +
      (phone ? ` Sie können die Klinik auch direkt erreichen${phoneBit}.` : "") +
      ` Wenn Sie möchten, notiere ich Ihren Namen und Ihre Telefonnummer und lasse das Klinikteam Sie kontaktieren.`
    );
  }
  if (lang.startsWith("fr")) {
    return (
      `Nous rencontrons actuellement un problème technique.` +
      (phone ? ` Vous pouvez aussi joindre la clinique directement${phoneBit}.` : "") +
      ` Si vous le souhaitez, je peux noter votre nom et téléphone pour qu'un membre de l'équipe vous contacte.`
    );
  }
  if (lang.startsWith("ar")) {
    return (
      `نواجه حالياً مشكلة تقنية مؤقتة.` +
      (phone ? ` يمكنك أيضاً التواصل مع العيادة مباشرة${phoneBit}.` : "") +
      ` إذا رغبت، يمكنني تسجيل اسمك ورقم هاتفك ليتواصل معك فريق العيادة.`
    );
  }
  if (lang.startsWith("ru")) {
    return (
      `Сейчас возникла временная техническая проблема.` +
      (phone ? ` Вы также можете связаться с клиникой напрямую${phoneBit}.` : "") +
      ` Если хотите, я запишу ваше имя и телефон, и команда клиники свяжется с вами.`
    );
  }

  return (
    `Şu an geçici bir teknik sorun yaşıyoruz.` +
    (phone ? ` Kliniğe doğrudan${phoneBit} numarasından da ulaşabilirsiniz.` : "") +
    ` Dilerseniz adınızı ve telefon numaranızı alıp klinik ekibimizin size ulaşmasını sağlayabilirim.`
  );
}

/** Deterministic post-submit acknowledgment (replaces awkward LLM small-talk). */
export function formatPostAppointmentAnythingElse(locale?: string | null): string {
  const lang = String(locale || "tr").toLowerCase();
  if (lang.startsWith("en")) return "Is there anything else I can help you with?";
  if (lang.startsWith("de")) return "Kann ich Ihnen sonst noch bei etwas helfen?";
  if (lang.startsWith("fr")) return "Puis-je vous aider pour autre chose ?";
  if (lang.startsWith("ar")) return "هل يمكنني مساعدتك في أمر آخر؟";
  if (lang.startsWith("ru")) return "Могу ли я ещё чем-то помочь?";
  return "Başka bir konuda yardımcı olabileceğim bir şey var mı?";
}

/** Brief notice when starting a new booking after one already submitted in this conversation. */
export function formatPriorAppointmentRescheduleNotice(locale?: string | null): string {
  const lang = String(locale || "tr").toLowerCase();
  if (lang.startsWith("en")) {
    return "You already have a preliminary appointment request in this conversation. I'll treat this as an update with the new date/time and reuse your contact details.";
  }
  if (lang.startsWith("de")) {
    return "In diesem Gespräch liegt bereits eine vorläufige Terminanfrage vor. Ich übernehme die neuen Datum-/Uhrzeitangaben und verwende Ihre bisherigen Kontaktdaten.";
  }
  return "Bu görüşmede zaten bir ön randevu talebiniz var. Bunu yeni tarih/saat için bir güncelleme olarak ele alıp kayıtlı iletişim bilgilerinizi kullanacağım.";
}

/** Phrases that mark a technical/error fallback in conversation logs (any locale). */
export function looksLikeTechnicalFallbackReply(reply: string): boolean {
  const t = String(reply || "").toLowerCase();
  if (!t.trim()) return true;
  return (
    t.includes("teknik bir sorun") ||
    t.includes("teknik sorun") ||
    t.includes("technical issue") ||
    t.includes("technisches problem") ||
    t.includes("problème technique") ||
    t.includes("проблема") ||
    t.includes("yanıt üretemiyorum") ||
    t.includes("cannot respond right now") ||
    t.includes("temporary technical") ||
    t.includes("experiencing a temporary")
  );
}
