/**
 * Deterministic Contact Request intent / preference / cancel detection.
 * Independent of phone/email disclosure alone.
 */

import type { PreferredContactMethod } from "./types";

export interface ContactHandoffDetection {
  /** Explicit patient request that the clinic contact them. */
  isHandoffIntent: boolean;
  /** Soft / ambiguous — ask confirmation before creating. */
  needsConfirmation: boolean;
  preferredMethod: PreferredContactMethod;
  /** Explicit cancel of contact / handoff. */
  isCancel: boolean;
  /** Patient is amending preferred method on an existing request. */
  isPreferenceAmendment: boolean;
}

/**
 * Detect preferred contact method from patient wording.
 * Preference ≠ clinic channel capability.
 */
export function detectPreferredContactMethod(text: string): PreferredContactMethod {
  const lower = (text || "").toLowerCase();

  if (
    /\b(whatsapp|whats\s*app|wp['’]?den|wp['’]?dan|whatsapp['’]?tan|whatsapp['’]?ten)\b/i.test(
      lower
    )
  ) {
    return "whatsapp";
  }

  if (
    /\b(text\s*me|sms|message\s*me|text\s+them|can\s+they\s+text|ask\s+them\s+to\s+text|prefer\s+text|by\s+text|via\s+text|yaz[ıi]ş|mesaj\s+at|mesaj\s+yaz|sms\s+at|yazs[ıi]nlar|yazabilirler|yaz[ıi]n|mesajla|metin\s+mesaj)\b/i.test(
      lower
    )
  ) {
    return "sms";
  }

  if (
    /\b(email\s*me|e-?mail\s*me|mail\s*me|by\s+email|via\s+email|e-?posta|eposta|mail\s+at[ıi]n|mail\s+g[öo]nder)\b/i.test(
      lower
    )
  ) {
    return "email";
  }

  if (
    /\b(call\s*me|phone\s*me|ring\s*me|give\s+me\s+a\s+call|please\s+call|ask\s+them\s+to\s+call|can\s+they\s+call|beni\s+ara|aramas[ıi]nlar|aray[ıi]n|telefonla\s+ara|ara\s+beni|aramalar[ıi]n[ıi]\s+[ıi]sterim)\b/i.test(
      lower
    )
  ) {
    return "phone";
  }

  return "unspecified";
}

/**
 * Explicit cancellation of clinic contact / handoff.
 * Does not cancel appointments.
 */
export function isContactHandoffCancel(text: string): boolean {
  if (!text) return false;
  const lower = text.trim().toLowerCase();

  // Preference swap ("don't call, WhatsApp me") is an amendment, not a cancel
  if (
    /\b(whatsapp|text|sms|email|mesaj|yaz)\b/i.test(lower) &&
    /\b(actually|instead|rather|aslında|aslinda|yerine|de[gğ]il)\b/i.test(lower)
  ) {
    return false;
  }
  if (
    /\b(don'?t\s+call|do\s+not\s+call|aramay[ıi]n|aramas[ıi]nlar)\b/i.test(lower) &&
    /\b(whatsapp|text|sms|email|mesaj|yaz)\s*me?\b/i.test(lower)
  ) {
    return false;
  }

  const patterns = [
    /\b(never\s+mind|dont\s+contact|don't\s+contact|do\s+not\s+contact|no\s+need\s+to\s+(call|text|contact|message)|don't\s+call|dont\s+call|don't\s+text|dont\s+text|cancel\s+(the\s+)?(contact|callback|handoff)|stop\s+contacting)\b/i,
    /\b(actually\s+no\s+need\s+to\s+call|actually\s+no\b|no\s+need\s+to\s+call|forget\s+(about\s+)?(contacting|calling|texting))\b/i,
    /\b(bo[sş]verin|bo[sş]ver|ileti[sş]ime\s+ge[cç]melerine\s+gerek\s+yok|aramas[ıi]nlar|aramay[ıi]n|yazmas[ıi]nlar|bana\s+ula[sş]mas[ıi]nlar|geri\s+d[öo]n[uü][sş]\s+istemiyorum|iletisim\s+istemiyorum|[iı]leti[sş]im\s+istemiyorum)\b/i,
    /\b(aslında\s+gerek\s+yok|aslinda\s+gerek\s+yok|iptal\s+edin\s+(konta[gğ]ı|ileti[sş]imi)|konta[gğ]ı\s+[iı]ptal)\b/i,
  ];

  return patterns.some((p) => p.test(lower));
}

/**
 * Patient asks clinic/team to initiate contact (not merely asking for clinic's number).
 */
export function isPatientContactHandoffIntent(text: string): boolean {
  if (!text) return false;
  const lower = text.trim().toLowerCase();

  // Exclude pure informational "what is your phone / how can I reach you"
  if (isInformationalClinicContactQuery(lower) && !hasOutboundContactRequest(lower)) {
    return false;
  }

  return hasOutboundContactRequest(lower);
}

function hasOutboundContactRequest(lower: string): boolean {
  const patterns = [
    // English — clinic → patient
    /\b(can\s+they\s+(text|call|message|email|whatsapp|contact)\s+me)\b/i,
    /\b(ask\s+them\s+to\s+(text|call|message|email|whatsapp|contact)\s+me)\b/i,
    /\b(have\s+them\s+(text|call|message|email|whatsapp|contact)\s+me)\b/i,
    /\b(please\s+(text|call|message|email|whatsapp)\s+me)\b/i,
    /\b((text|call|message|email|whatsapp)\s+me)\b/i,
    /\b(can\s+someone\s+(contact|call|text|message)\s+me)\b/i,
    /\b(please\s+(contact|call|text|message)\s+me)\b/i,
    /\b(i\s+(want|need|would\s+like)\s+(them|someone|the\s+clinic|a\s+representative)\s+to\s+(contact|call|text|message)\s+me)\b/i,
    /\b(get\s+(someone|them|the\s+clinic)\s+to\s+(contact|call|text|message)\s+me)\b/i,
    /\b(here'?s?\s+my\s+(number|phone).{0,40}(contact|call|text|message)\s+me)\b/i,
    /\b(i\s+can'?t\s+(talk|speak|call).{0,60}(text|message|sms|whatsapp))\b/i,
    /\b(can'?t\s+(talk|speak).{0,40}(text|message)\s+me)\b/i,
    /\b(prefer\s+(text|sms|whatsapp|email).{0,30}(contact|reach|message)?)\b/i,
    /\b(reach\s+out\s+to\s+me)\b/i,
    /\b(contact\s+me\s+(by|via|on|through|please|asap)?)\b/i,
    /\b(have\s+(the\s+)?clinic\s+(contact|call|text|message)\s+me)\b/i,

    // Turkish — clinic → patient
    /\b(beni\s+aras[ıi]nlar|beni\s+aray[ıi]n|beni\s+ara)\b/i,
    /\b(bana\s+(yazs[ıi]nlar|yaz[ıi]n|mesaj\s+ats[ıi]nlar|mesaj\s+at[ıi]n|sms\s+ats[ıi]nlar))\b/i,
    /\b((yazs[ıi]nlar|aras[ıi]nlar|ula[sş]s[ıi]nlar|d[öo]ns[üu]nler))\b/i,
    /\b(biri\s+(beni\s+)?(aras[ıi]n|yazs[ıi]n|ula[sş]s[ıi]n))\b/i,
    /\b(klinik\s+(beni\s+)?(aras[ıi]n|yazs[ıi]n|ula[sş]s[ıi]n|ileti[sş]ime\s+ge[cç]sin))\b/i,
    /\b(ileti[sş]ime\s+ge[cç](sinler|melerini|memizi)?\s+[iı]sterim)\b/i,
    /\b(geri\s+d[öo]n[üu][sş]\s+(yap[ıi]n|bekliyorum|[iı]sterim))\b/i,
    /\b(whatsapp['’]?tan\s+yaz|[wp]+\s*['’]?den\s+yaz)\b/i,
    /\b(konu[sş]amam|konusamam|i[sş]teyim|i[sş]teyim).{0,40}(yaz|mesaj|sms|whatsapp)\b/i,
    /\b(konu[sş]am[ıi]yorum|konusamiyorum).{0,50}(yaz|mesaj|sms|text)\b/i,
  ];

  return patterns.some((p) => p.test(lower));
}

/**
 * Asking for the clinic's own contact details (informational) — not a handoff.
 */
export function isInformationalClinicContactQuery(lower: string): boolean {
  return /\b(what('?s|\s+is)\s+your\s+(phone|number|whatsapp|email)|how\s+can\s+i\s+reach\s+you|your\s+(phone|contact)\s+number|telefonunuz|numaran[ıi]z|whatsapp\s+numaran[ıi]z|ileti[sş]im\s+bilgileriniz|nas[ıi]l\s+ula[sş]abilirim)\b/i.test(
    lower
  );
}

/**
 * Soft intents that should ask confirmation before creating a request.
 * Clear "text me" / "call me" are not soft.
 */
export function isAmbiguousContactHandoff(text: string): boolean {
  if (!text) return false;
  const lower = text.trim().toLowerCase();
  if (!isPatientContactHandoffIntent(lower)) return false;

  // Clear directives — no extra confirmation
  if (
    /\b(please\s+(text|call|message|email|whatsapp|contact)\s+me|ask\s+them\s+to|have\s+them\s+(text|call|message|email|whatsapp|contact)|beni\s+ara|yazs[ıi]nlar|aras[ıi]nlar)\b/i.test(
      lower
    ) ||
    /^(?:please\s+)?(?:text|call|message|email|whatsapp)\s+me\b/i.test(lower.trim())
  ) {
    return false;
  }

  // Capability-style questions without "please" — confirm forwarding
  if (
    /\b(can\s+they\s+(text|call|message)|do\s+they\s+(text|call|message)|will\s+they\s+(text|call)|yazabil(irler|ir)\s+mi|arayabil(irler|ir)\s+mi)\b/i.test(
      lower
    )
  ) {
    return true;
  }

  return false;
}

export function detectContactHandoff(text: string): ContactHandoffDetection {
  const isCancel = isContactHandoffCancel(text);
  const preferredMethod = detectPreferredContactMethod(text);
  const isHandoffIntent = !isCancel && isPatientContactHandoffIntent(text);
  const needsConfirmation = isHandoffIntent && isAmbiguousContactHandoff(text);
  const isPreferenceAmendment =
    !isCancel &&
    preferredMethod !== "unspecified" &&
    /\b(actually|instead|rather|prefer|aslında|aslinda|yerine|de[gğ]il)\b/i.test(
      (text || "").toLowerCase()
    );

  return {
    isHandoffIntent,
    needsConfirmation,
    preferredMethod,
    isCancel,
    isPreferenceAmendment,
  };
}

/** Required patient contact detail for a preferred method. */
export function requiredContactDetail(
  method: PreferredContactMethod
): "phone" | "email" | null {
  if (method === "email") return "email";
  if (method === "phone" || method === "sms" || method === "whatsapp") return "phone";
  // unspecified: prefer phone if we must ask; phone is most common
  return "phone";
}

export function methodLabel(
  method: PreferredContactMethod,
  locale: string = "en"
): string {
  const isTr = (locale || "en").toLowerCase().startsWith("tr");
  switch (method) {
    case "sms":
      return isTr ? "mesaj / SMS" : "text / SMS";
    case "whatsapp":
      return "WhatsApp";
    case "phone":
      return isTr ? "telefon araması" : "phone call";
    case "email":
      return isTr ? "e-posta" : "email";
    default:
      return isTr ? "belirtilmedi" : "unspecified";
  }
}

/**
 * Explicit correction of phone/email (not casual mention of digits).
 * Used only when an unresolved Contact Request already exists.
 */
export function isExplicitContactDetailCorrection(text: string): boolean {
  if (!text) return false;
  const lower = text.trim().toLowerCase();
  const digitCount = (text.match(/\d/g) || []).length;
  const hasEmail = /@/.test(text);
  const hasContactNoun = /\b(number|phone|email|e-?posta|eposta|numara|numaram|telefon)\b/i.test(
    lower
  );
  const hasCorrectionCue =
    /\b(sorry|actually|correction|correct(?:ed)?|update(?:d)?|changed|my\s+(?:new\s+)?number\s+is|yeni\s+numara|numaram\s+|d[uü]zelt|yanl[ıi][sş])\b/i.test(
      lower
    );

  if (!hasCorrectionCue) return false;
  return hasEmail || (hasContactNoun && digitCount >= 7) || digitCount >= 10;
}
