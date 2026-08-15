/**
 * Appointment Collection Entry Gate
 *
 * Single authoritative decision point for whether an agent may START collecting
 * appointment information. Shared by every single-clinic and agency surface so the
 * rule cannot drift per clinic.
 *
 * Product rule: mentioning a doctor, specialty, treatment, procedure, department or
 * clinic service is NEVER by itself sufficient to begin appointment collection.
 * Collection begins only on genuine booking intent, or when the patient volunteers
 * scheduling/contact commitments that only make sense when booking.
 */

import { ConversationIntent } from "./types";

export type AppointmentGateMode = "continue" | "start" | "blocked";

export interface AppointmentGateEntities {
  treatment?: string;
  preferredDate?: string;
  preferredTime?: string;
  fullName?: string;
  firstName?: string;
  phone?: string;
  email?: string;
  [key: string]: any;
}

export interface AppointmentCollectionGateInput {
  message: string;
  intent: ConversationIntent;
  isAppointmentFlowActive: boolean;
  entities?: AppointmentGateEntities | null;
}

export interface AppointmentCollectionGateResult {
  allowed: boolean;
  mode: AppointmentGateMode;
  reason: string;
}

export interface BookingIntentDetection {
  hasBookingIntent: boolean;
  signal?: "appointment_request" | "availability_request" | "visit_request";
}

/**
 * Intents that already represent an established appointment flow.
 */
export const APPOINTMENT_FLOW_INTENTS: ConversationIntent[] = [
  "appointment_start",
  "appointment_continuation",
  "appointment_correction",
  "appointment_confirmation",
];

/**
 * Intents whose entities describe what the patient is ASKING ABOUT, not what they
 * are booking. These may never open appointment collection on their own.
 */
export const INFORMATION_SEEKING_INTENTS: ConversationIntent[] = [
  "greeting",
  "casual_conversation",
  "small_talk",
  "treatment_information",
  "pricing_request",
  "quote_request",
  "doctor_information",
  "clinic_information",
  "location_request",
  "clinic_location",
  "working_hours_request",
  "clinic_working_hours",
  "clinic_recommendation",
  "clinic_comparison",
  "contact_request",
  "live_support_request",
  "complaint",
  "emergency",
  "language_switch",
  "off_topic",
  "help",
  "cancel",
  "rejection",
];

/**
 * Family A — explicit appointment / booking requests.
 * Historic ClinicBridge lexicon; kept as the primary booking signal.
 */
const APPOINTMENT_REQUEST_PATTERNS: RegExp[] = [
  /(?:randevu|randevu\s+almak|randevu\s+oluştur|randevu\s+olustur|muayene\s+olmak|rezervasyon|görüşme\s+talep)/i,
  /(?:book\s+(?:an\s+)?appointment|make\s+(?:an\s+)?appointment|schedule\s+(?:an\s+)?appointment|book\s+a\s+visit|schedule\s+a\s+visit|appointment)/i,
  /(?:termin\s+vereinbaren|termin\s+buchen|termin\s+ausmachen|einen\s+termin|termin)/i,
  /(?:prendre\s+(?:un\s+)?rendez-vous|prendre\s+rdv|réservation|reserver\s+un\s+rdv|rendez-vous)/i,
  /(?:حجز\s+موعد|احجز\s+موعد|موعد)/i,
];

/**
 * Family B — availability requests.
 * Deliberately scoped to scheduling nouns: "is treatment X available?" is an
 * informational capability question, not a booking request.
 */
const AVAILABILITY_REQUEST_PATTERNS: RegExp[] = [
  /müsaitli[ğg]\w*/i,
  /müsait\s*(?:mi|mı|misiniz|mısınız|miyiz|mıyız)\b/i,
  /\bmüsait\s+(?:bir\s+)?(?:saat|gün|tarih|zaman)/i,
  /\bboş\s+(?:yer|saat|gün|tarih)/i,
  /\buygun\s+(?:bir\s+)?(?:saat|gün|tarih)\b/i,
  /\bavailabilit(?:y|ies)\b/i,
  /\bavailable\s+(?:slot|time|date|day|hour)s?\b/i,
  /\bany\s+(?:openings?|free\s+slots?)\b/i,
  /\bfreie[nr]?\s+termine?\b/i,
  /\bverfügbarkeit\b/i,
  /\bdisponibilit[ée]s?\b/i,
  /مواعيد\s+متاحة/i,
];

/**
 * Family C — visit / scheduling requests without the word "appointment".
 * "Do you have an endodontist?" stays informational; "Can I come tomorrow?" does not.
 */
const VISIT_REQUEST_PATTERNS: RegExp[] = [
  /\bgelebilir\s*miyim\b/i,
  /\bgel(?:mek|meyi)\s+isti(?:yorum|yoruz)\b/i,
  /\bu[ğg]rayabilir\s*miyim\b/i,
  /\bge[çc]ebilir\s*miyim\b/i,
  /\bsaat\s+ayarlay\w*/i,
  /(?:doktor|hekim|dt\.|dr\.)[^.?!]{0,40}\bg[öo]r[üu][şs]mek\s+isti(?:yorum|yoruz)\b/i,
  /\bcan\s+i\s+come\b/i,
  /\bcan\s+i\s+(?:visit|drop\s+by|stop\s+by)\b/i,
  /\b(?:i'?d\s+like|i\s+would\s+like|i\s+want)\s+to\s+come\b/i,
  /\b(?:set\s+up|arrange|fix)\s+a\s+time\b/i,
  /\bkann\s+ich\s+(?:vorbei)?kommen\b/i,
  /\b(?:je\s+peux|puis-je)\s+venir\b/i,
  /هل\s+يمكنني\s+الحضور/i,
];

/**
 * Detects genuine booking intent in the patient's own wording, across languages.
 * This is the single booking lexicon used by both the IntentRouter and the gate.
 */
export function detectExplicitBookingIntent(message: string): BookingIntentDetection {
  const text = String(message || "");
  if (!text.trim()) return { hasBookingIntent: false };

  if (APPOINTMENT_REQUEST_PATTERNS.some((re) => re.test(text))) {
    return { hasBookingIntent: true, signal: "appointment_request" };
  }
  if (AVAILABILITY_REQUEST_PATTERNS.some((re) => re.test(text))) {
    return { hasBookingIntent: true, signal: "availability_request" };
  }
  if (VISIT_REQUEST_PATTERNS.some((re) => re.test(text))) {
    return { hasBookingIntent: true, signal: "visit_request" };
  }
  return { hasBookingIntent: false };
}

/**
 * Slots a patient only volunteers when they intend to be scheduled or contacted.
 *
 * `treatment` is excluded because it is the subject of most clinic questions, and a
 * bare name is excluded because it is weak evidence on its own ("Ben Ahmet, fiyat
 * nedir?") and is the slot most often over-extracted from free-form sentences.
 */
export function hasSchedulingCommitmentEntities(entities?: AppointmentGateEntities | null): boolean {
  if (!entities) return false;
  return Boolean(
    entities.preferredDate ||
    entities.preferredTime ||
    entities.phone ||
    entities.email
  );
}

/**
 * Authoritative gate: may the agent be in / enter appointment collection for this turn?
 */
export function evaluateAppointmentCollectionGate(
  input: AppointmentCollectionGateInput
): AppointmentCollectionGateResult {
  if (input.isAppointmentFlowActive) {
    return { allowed: true, mode: "continue", reason: "appointment_flow_active" };
  }

  if (APPOINTMENT_FLOW_INTENTS.includes(input.intent)) {
    return { allowed: true, mode: "start", reason: `appointment_intent:${input.intent}` };
  }

  const booking = detectExplicitBookingIntent(input.message);
  if (booking.hasBookingIntent) {
    return { allowed: true, mode: "start", reason: `booking_signal:${booking.signal}` };
  }

  if (INFORMATION_SEEKING_INTENTS.includes(input.intent)) {
    return { allowed: false, mode: "blocked", reason: `information_seeking_intent:${input.intent}` };
  }

  if (hasSchedulingCommitmentEntities(input.entities)) {
    return { allowed: true, mode: "start", reason: "scheduling_commitment_entities" };
  }

  return { allowed: false, mode: "blocked", reason: "no_booking_intent" };
}
