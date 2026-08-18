/**
 * Resolve a patient-stated doctor preference against the current clinic's
 * doctor catalog only. Never invent a doctor identity.
 */

export type RequestedDoctorPreference = {
  id?: string;
  name: string;
};

export type ClinicDoctorMatchInput = {
  id: string;
  fullName: string;
  title?: string;
  isActive?: boolean;
};

export type DoctorPreferenceOutcome =
  | { kind: "none" }
  | { kind: "matched"; doctor: RequestedDoctorPreference }
  | { kind: "ambiguous"; candidates: RequestedDoctorPreference[] }
  | { kind: "unresolved_note"; note: string };

export type DoctorPreferenceDraftLike = {
  requestedDoctor?: RequestedDoctorPreference;
  notes?: string;
};

const NAMED_DOCTOR_RE =
  /\b(?:dr\.?|dt\.?|prof\.?|doç\.?|uzm\.?|doktor|hekim|doctor|dentist)\s+([A-Za-zÇĞİÖŞÜçğıöşü][A-Za-zÇĞİÖŞÜçğıöşü'.-]+(?:\s+[A-Za-zÇĞİÖŞÜçğıöşü][A-Za-zÇĞİÖŞÜçğıöşü'.-]+){0,3})/i;

const TITLED_WITH_NAME_RE =
  /\b(?:with|ile|chez)\s+(?:dr\.?|dt\.?|doktor|hekim|doctor)\s+([A-Za-zÇĞİÖŞÜçğıöşü][A-Za-zÇĞİÖŞÜçğıöşü'.-]+(?:\s+[A-Za-zÇĞİÖŞÜçğıöşü][A-Za-zÇĞİÖŞÜçğıöşü'.-]+){0,3})/i;

const UNRESOLVED_PREFERENCE_RE =
  /\b(female dentist|kadın diş hekimi|kadın doktor|the dentist i spoke with|geçen sefer konuştuğum|geçen sefer görüştüğüm|önceki doktorum|my previous dentist)\b/i;

const DOCTOR_NOTE_RE =
  /^(hasta özellikle|patient asked (to see|for)|hasta, klinik listesinde)/i;

const MAX_NOTE_LENGTH = 280;

const NAME_STOPWORDS = new Set([
  "will", "see", "me", "my", "the", "a", "an", "for", "on", "at", "to", "available",
  "about", "our", "your", "who", "which", "does", "perform", "performs", "information",
  "list", "team", "i", "we", "you", "they", "spoke", "with", "last", "time", "hangi",
  "kim", "var", "mi", "mı", "mu", "mü", "hakkinda", "ekibi", "doktorlar", "doctors",
  "do", "can", "have", "consultation", "appointment", "randevu", "muayene",
  "instead", "please", "implant",
]);

function takeNameTokens(raw: string): string | null {
  const parts = String(raw || "").trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const tok of parts) {
    const folded = foldDoctorName(tok);
    if (!folded || NAME_STOPWORDS.has(folded)) break;
    kept.push(tok);
  }
  return kept.length ? kept.join(" ") : null;
}

function isPlausiblePersonName(raw: string): boolean {
  const tokens = foldDoctorName(raw).split(" ").filter(Boolean);
  if (tokens.length === 0) return false;
  if (NAME_STOPWORDS.has(tokens[0])) return false;
  if (tokens.every((t) => NAME_STOPWORDS.has(t))) return false;
  return tokens.some((t) => t.length >= 3 && !NAME_STOPWORDS.has(t));
}

export function foldDoctorName(value: string): string {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/\b(dr\.?|dt\.?|prof\.?|doç\.?|doc\.?|uzm\.?|uzman|doktor|hekim|doctor|dentist|physician)\b/gi, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function looksLikeDoctorPreference(message: string): boolean {
  const raw = String(message || "").trim();
  if (!raw) return false;
  if (UNRESOLVED_PREFERENCE_RE.test(raw)) return true;
  return Boolean(extractTitledName(raw));
}

export function mapClinicDoctorRecords(
  records: Array<Record<string, any> & { id?: string }>
): ClinicDoctorMatchInput[] {
  return (records || [])
    .map((data, index) => {
      const fullName = String(data.doctorName || data.full_name || data.fullName || "").trim();
      return {
        id: String(data.id || data.doctor_id || `doctor_${index + 1}`),
        fullName,
        title: String(data.title || data.professional_title || "").trim() || undefined,
        isActive: data.is_active !== false && data.status !== "inactive",
      };
    })
    .filter((d) => d.fullName);
}

function displayName(doc: ClinicDoctorMatchInput): string {
  const name = String(doc.fullName || "").trim();
  const title = String(doc.title || "").trim();
  if (title && !new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(name)) {
    return `${title} ${name}`.trim();
  }
  return name;
}

function lastToken(folded: string): string {
  const parts = folded.split(" ").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function firstToken(folded: string): string {
  return folded.split(" ").filter(Boolean)[0] || "";
}

function extractTitledName(message: string): string | null {
  const named = message.match(NAMED_DOCTOR_RE);
  const namedClean = named?.[1] ? takeNameTokens(named[1]) : null;
  if (namedClean && isPlausiblePersonName(namedClean)) return namedClean;
  const withTitled = message.match(TITLED_WITH_NAME_RE);
  const withClean = withTitled?.[1] ? takeNameTokens(withTitled[1]) : null;
  if (withClean && isPlausiblePersonName(withClean)) return withClean;
  return null;
}

export function matchClinicDoctors(
  query: string,
  doctors: ClinicDoctorMatchInput[]
): ClinicDoctorMatchInput[] {
  const q = foldDoctorName(query);
  if (!q) return [];
  const active = doctors.filter((d) => d.isActive !== false && foldDoctorName(d.fullName));
  const exact = active.filter((d) => foldDoctorName(d.fullName) === q);
  if (exact.length > 0) return exact;

  const contains = active.filter((d) => {
    const folded = foldDoctorName(d.fullName);
    return folded.includes(q) || (q.length >= 8 && q.includes(folded));
  });
  if (contains.length === 1) return contains;

  const qParts = q.split(" ").filter(Boolean);
  if (qParts.length === 1) {
    const first = active.filter((d) => firstToken(foldDoctorName(d.fullName)) === q);
    if (first.length > 0) return first;
    const last = active.filter((d) => lastToken(foldDoctorName(d.fullName)) === q);
    if (last.length > 0) return last;
  }

  if (qParts.length >= 2) {
    const fullContains = active.filter((d) => foldDoctorName(d.fullName).includes(q));
    if (fullContains.length === 1) return fullContains;
    const first = qParts[0];
    const last = lastToken(q);
    const firstLast = active.filter((d) => {
      const folded = foldDoctorName(d.fullName);
      return firstToken(folded) === first && lastToken(folded) === last;
    });
    if (firstLast.length > 0) return firstLast;
  }

  return contains;
}

function toPreference(doc: ClinicDoctorMatchInput): RequestedDoctorPreference {
  return { id: doc.id, name: displayName(doc) };
}

function unknownDoctorNote(uttered: string, locale: string): string {
  const label = /^(dr|dt|doktor|doctor)\b/i.test(uttered) ? uttered : `Dr. ${uttered}`;
  if ((locale || "tr").toLowerCase().startsWith("en")) {
    return `Patient asked to see ${label}. This name was not matched to the clinic doctor list.`;
  }
  return `Hasta özellikle ${label} ile görüşmek istiyor.`;
}

export function resolveDoctorPreference(params: {
  message: string;
  doctors: ClinicDoctorMatchInput[];
  locale?: string;
}): DoctorPreferenceOutcome {
  const message = String(params.message || "").trim();
  if (!message) return { kind: "none" };

  const locale = params.locale || "tr";
  const doctors = (params.doctors || []).filter((d) => d && d.fullName);
  const titled = extractTitledName(message);

  if (titled) {
    if (doctors.length === 0) return { kind: "none" };
    const matches = matchClinicDoctors(titled, doctors);
    if (matches.length === 1) return { kind: "matched", doctor: toPreference(matches[0]) };
    if (matches.length > 1) {
      return { kind: "ambiguous", candidates: matches.map(toPreference) };
    }
    return { kind: "unresolved_note", note: unknownDoctorNote(titled, locale) };
  }

  if (UNRESOLVED_PREFERENCE_RE.test(message)) {
    const note = locale.toLowerCase().startsWith("en")
      ? "Patient asked for a previously seen / specific dentist that could not be matched to the clinic doctor list."
      : "Hasta, klinik listesinde eşleştirilemeyen belirli bir hekim tercihi belirtti.";
    return { kind: "unresolved_note", note };
  }

  const catalogHits = doctors.filter((d) => {
    const folded = foldDoctorName(d.fullName);
    if (folded.length < 8) return false;
    return foldDoctorName(message).includes(folded);
  });
  if (catalogHits.length === 1) return { kind: "matched", doctor: toPreference(catalogHits[0]) };
  if (catalogHits.length > 1) {
    return { kind: "ambiguous", candidates: catalogHits.map(toPreference) };
  }

  return { kind: "none" };
}

export function doctorClarificationMessage(
  locale: string,
  candidates: RequestedDoctorPreference[]
): string {
  const names = candidates.map((c) => c.name).filter(Boolean);
  const list = names.slice(0, 5).join(", ");
  if ((locale || "tr").toLowerCase().startsWith("en")) {
    return `I found more than one doctor matching that name (${list}). Could you confirm the full name? I can add a preferred doctor to the request; the clinic will confirm availability.`;
  }
  return `Bu isme uyan birden fazla hekim var (${list}). Tam adı teyit edebilir misiniz? Tercih edilen hekimi talebe eklerim; müsaitliği klinik değerlendirecektir.`;
}

export function preferredDoctorAckMessage(locale: string, doctorName: string): string {
  if ((locale || "tr").toLowerCase().startsWith("en")) {
    return `I've added ${doctorName} as your preferred doctor. The clinic will confirm availability when reviewing the appointment request.`;
  }
  return `${doctorName} tercih edilen hekim olarak talebinize eklendi. Müsaitliği klinik, randevu talebini değerlendirirken teyit edecektir.`;
}

export function toPersistedRequestedDoctor(
  requestedDoctor?: { id?: string; name: string } | null
): RequestedDoctorPreference | undefined {
  const name = String(requestedDoctor?.name || "").trim();
  if (!name) return undefined;
  return requestedDoctor?.id ? { id: String(requestedDoctor.id), name } : { name };
}

export function notesDuplicateDoctor(notes: string | undefined, doctorName: string | undefined): boolean {
  if (!notes || !doctorName) return false;
  return foldDoctorName(notes).includes(foldDoctorName(doctorName));
}

export function isDoctorPreferenceNote(notes: string | undefined): boolean {
  return Boolean(notes && DOCTOR_NOTE_RE.test(notes.trim()));
}

export function mergeAppointmentNote(existing: string | undefined, incoming: string): string {
  const next = String(incoming || "").trim();
  const prev = String(existing || "").trim();
  if (!next) return prev;
  if (!prev) return next.slice(0, MAX_NOTE_LENGTH);
  if (foldDoctorName(prev).includes(foldDoctorName(next))) return prev.slice(0, MAX_NOTE_LENGTH);
  return `${prev} ${next}`.trim().slice(0, MAX_NOTE_LENGTH);
}

export function applyDoctorPreferenceToDraft<T extends DoctorPreferenceDraftLike>(params: {
  draft: T;
  message: string;
  doctors: ClinicDoctorMatchInput[];
  locale?: string;
}): {
  draft: T;
  outcome: DoctorPreferenceOutcome;
  changed: boolean;
  clarification?: string;
  ack?: string;
} {
  const locale = params.locale || "tr";
  const outcome = resolveDoctorPreference({
    message: params.message,
    doctors: params.doctors,
    locale,
  });
  const next = { ...params.draft };

  if (outcome.kind === "none") {
    return { draft: next, outcome, changed: false };
  }

  if (outcome.kind === "matched") {
    next.requestedDoctor = outcome.doctor;
    if (isDoctorPreferenceNote(next.notes) || notesDuplicateDoctor(next.notes, outcome.doctor.name)) {
      next.notes = undefined;
    }
    return {
      draft: next,
      outcome,
      changed: true,
      ack: preferredDoctorAckMessage(locale, outcome.doctor.name),
    };
  }

  if (outcome.kind === "ambiguous") {
    return {
      draft: next,
      outcome,
      changed: false,
      clarification: doctorClarificationMessage(locale, outcome.candidates),
    };
  }

  next.requestedDoctor = undefined;
  next.notes = mergeAppointmentNote(
    isDoctorPreferenceNote(next.notes) ? undefined : next.notes,
    outcome.note
  );
  return { draft: next, outcome, changed: true };
}
