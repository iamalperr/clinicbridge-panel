/**
 * Turkish speech evaluation harness (local fixture; no provider calls, no patient data).
 *
 * Staff read each phrase on a test call; the operator fills one record per phrase from the
 * worker's VOICE_WORKER_TURN_LATENCY log and their own listening notes (the transcript itself is
 * never logged by the worker, so the STT result is copied by the tester, not by the system).
 * checkCriticalFacts flags any date, time, number, price or name that did not survive STT.
 */

export interface CriticalFact {
  label: string;
  /** Accepted renderings, e.g. digits or words (STT numerals formatting is off). */
  anyOf: readonly string[];
}

export interface TurkishEvalPhrase {
  id: string;
  expected: string;
  criticalFacts: readonly CriticalFact[];
  /** What the phrase stresses: endpointing pauses, numbers, names, etc. */
  focus: string;
}

export const TURKISH_EVAL_PHRASES: readonly TurkishEvalPhrase[] = Object.freeze([
  {
    id: "treatment-info",
    expected: "İmplant tedavisi hakkında bilgi almak istiyorum.",
    criticalFacts: [{ label: "treatment", anyOf: ["implant"] }],
    focus: "treatment vocabulary",
  },
  {
    id: "date-time",
    expected: "12 Ekim Pazartesi saat üç uygun mu?",
    criticalFacts: [
      { label: "day", anyOf: ["12", "on iki"] },
      { label: "month", anyOf: ["ekim"] },
      { label: "weekday", anyOf: ["pazartesi"] },
      { label: "hour", anyOf: ["üç", "3", "15"] },
    ],
    focus: "date + time; must stay one turn across the pause after 'saat'",
  },
  {
    id: "reschedule",
    expected: "Randevumu saat on dörtten on ikiye alabilir miyiz?",
    criticalFacts: [
      { label: "from-hour", anyOf: ["on dört", "14"] },
      { label: "to-hour", anyOf: ["on iki", "12"] },
    ],
    focus: "two times in one sentence (from/to)",
  },
  {
    id: "phone-number",
    expected: "Telefon numaram sıfır beş yüz otuz bir...",
    criticalFacts: [
      { label: "leading-zero", anyOf: ["sıfır", "0"] },
      { label: "operator-prefix", anyOf: ["beş yüz otuz bir", "531", "5 31"] },
    ],
    focus: "digit groups with pauses; must not be split into several turns",
  },
  {
    id: "doctor-name",
    expected: "Dr. Ahmet ile görüşmek istiyorum.",
    criticalFacts: [{ label: "doctor-name", anyOf: ["ahmet"] }],
    focus: "personal name and title",
  },
  {
    id: "price",
    expected: "Fiyat iki bin beş yüz TL mi?",
    criticalFacts: [
      { label: "amount", anyOf: ["iki bin beş yüz", "2500", "2.500", "2 500"] },
      { label: "currency", anyOf: ["tl", "lira"] },
    ],
    focus: "price; never reformatted by the provider",
  },
  {
    id: "percentage",
    expected: "Yüzde yirmi indirim var mı?",
    criticalFacts: [{ label: "percent", anyOf: ["yüzde yirmi", "%20", "% 20", "yüzde 20"] }],
    focus: "percentage",
  },
  {
    id: "weekday-afternoon",
    expected: "Cumartesi öğleden sonra uygun musunuz?",
    criticalFacts: [
      { label: "weekday", anyOf: ["cumartesi"] },
      { label: "part-of-day", anyOf: ["öğleden sonra"] },
    ],
    focus: "relative time expression",
  },
]);

export interface TurkishEvalRecord {
  phraseId: string;
  expected: string;
  sttResult: string;
  correctnessNotes: string;
  /** Did the phrase arrive as one caller turn? */
  endpointing: "SINGLE_TURN" | "SPLIT" | "CUT_OFF";
  sttLatencyMs: number | null;
  agentCoreLatencyMs: number | null;
  ttsFirstAudioLatencyMs: number | null;
  pronunciationNotes: string;
}

function normalizeTurkish(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/[.,!?;:…"'()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Labels of critical facts missing from the STT result (empty array: all facts survived). */
export function checkCriticalFacts(phrase: TurkishEvalPhrase, sttResult: string): string[] {
  const heard = normalizeTurkish(sttResult);
  return phrase.criticalFacts
    .filter((fact) => !fact.anyOf.some((rendering) => heard.includes(normalizeTurkish(rendering))))
    .map((fact) => fact.label);
}
