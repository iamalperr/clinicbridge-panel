/**
 * Deterministic "does this clinic offer treatment X?" answers.
 * Uses the full clinic knowledge already loaded for the turn (not top-k RAG)
 * so a recorded treatment is not replaced by the groundedness fallback.
 */
import {
  findTreatmentCode,
  getTreatmentLabel,
  TREATMENT_REGISTRY,
} from "../constants/specializations";

export interface TreatmentKnowledgeSnippet {
  title?: string;
  content?: string;
  /** Bare catalog row (treatment name, price-list name). A name match counts as offered. */
  catalog?: boolean;
}

export type TreatmentAvailabilityStatus = "offered" | "not_offered" | "unknown";

export interface TreatmentAvailabilityDecision {
  treatmentCode: string;
  status: TreatmentAvailabilityStatus;
  reply: string;
  laser: boolean;
}

const AVAILABILITY_PATTERN =
  /yap[ıi]l[ıi]yor mu|yap[ıi]yor musunuz|yap[ıi]yorsunuz mu|uygulan[ıi]yor mu|sunuyor musunuz|sunuluyor mu|mevcut mu|hizmetinizde var|do you (offer|do|provide|perform)|is (it |this )?(available|offered)|do you have\b|bieten sie|wird .{0,40} angeboten|\bvar m[ıi]\b/i;

const PRICE_PATTERN =
  /\b(fiyat|fiyatı|fiyati|ücret|ucret|ne kadar|price|pricing|cost|how much|fee)\b/i;

const DOCTOR_PATTERN =
  /\b(kim|hangi doktor|hangi hekim|who performs|which doctor|which dentist)\b/i;

const BOOKING_PATTERN = /\b(randevu|appointment|termin)\b/i;

const NEGATION_PATTERN =
  /(yap[ıi]lm[ıi]yor|yap[ıi]lmamaktad|uygulanm[ıi]yor|uygulanmamaktad|sunulmuyor|sunulmamaktad|sunmuyoruz|yapm[ıi]yoruz|uygulam[ıi]yoruz|mevcut de[gğ]il|yer alm[ıi]yor|bulunmuyor|not offered|do not offer|don't offer|we don't offer|we do not offer|not available|nicht angeboten|bieten wir nicht)/i;

const OFFER_CUE_PATTERN =
  /(\boffers?\b|\bprovides?\b|\bincludes?\b|\bavailable\b|sunul|sunuyor|uygulan[ıi]r|uygulanmaktad[ıi]r|yap[ıi]l[ıi]r|yap[ıi]yoruz|yap[ıi]lmaktad[ıi]r|mevcuttur|\bhizmeti\b|\bfiyat\b|\bprice\b|\baverage\b|\beur\b|\btl\b)/i;

const LASER_PATTERN = /\b(lazer|laser)\b/i;

export function isTreatmentAvailabilityQuestion(message: string): boolean {
  const lower = message.toLowerCase();
  if (!findTreatmentCode(lower)) return false;
  if (PRICE_PATTERN.test(lower)) return false;
  if (DOCTOR_PATTERN.test(lower)) return false;
  if (BOOKING_PATTERN.test(lower)) return false;
  return AVAILABILITY_PATTERN.test(lower);
}

export function collectClinicCatalogSnippets(clinicData: unknown): TreatmentKnowledgeSnippet[] {
  if (!clinicData || typeof clinicData !== "object") return [];
  const data = clinicData as Record<string, unknown>;
  const snippets: TreatmentKnowledgeSnippet[] = [];

  const pushText = (title: string, value: unknown) => {
    if (typeof value === "string" && value.trim()) {
      snippets.push({ title, content: value });
    }
  };

  pushText("overview", data.longDescription);
  pushText("overview", data.description);
  pushText("overview", data.shortDescription);

  const overview = data.overview;
  if (overview && typeof overview === "object") {
    const o = overview as Record<string, unknown>;
    pushText("overview", o.longDescription);
    pushText("overview", o.shortDescription);
  }

  for (const key of ["subTreatments", "treatments", "services"] as const) {
    const list = data[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const name =
        typeof item === "string"
          ? item
          : item && typeof item === "object"
            ? String(
                (item as Record<string, unknown>).name ||
                  (item as Record<string, unknown>).treatmentName ||
                  (item as Record<string, unknown>).label ||
                  ""
              )
            : "";
      if (name.trim()) {
        snippets.push({ title: name, content: name, catalog: true });
      }
    }
  }

  return snippets;
}

function synonymsFor(code: string): string[] {
  const entry = TREATMENT_REGISTRY.find((item) => item.code === code);
  if (!entry) return [];
  return [...entry.synonymsTR, ...entry.synonymsEN, entry.labelTR, entry.labelEN]
    .map((syn) => syn.toLowerCase())
    .filter((syn) => syn.length >= 4)
    .sort((a, b) => b.length - a.length);
}

function paragraphContainsSynonym(text: string, synonyms: string[]): string | null {
  const lower = text.toLowerCase();
  return synonyms.find((syn) => lower.includes(syn)) ?? null;
}

function snippetStatus(
  snippet: TreatmentKnowledgeSnippet,
  synonyms: string[]
): { status: TreatmentAvailabilityStatus; laser: boolean } {
  const title = snippet.title || "";
  const content = snippet.content || "";
  const titleHit = paragraphContainsSynonym(title, synonyms);
  const catalogHit = Boolean(snippet.catalog && (titleHit || paragraphContainsSynonym(content, synonyms)));

  const paragraphs = content
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

  let offered = false;
  let denied = false;
  let laser = false;

  const note = (text: string, fromCatalog: boolean) => {
    if (!paragraphContainsSynonym(text, synonyms)) return;
    if (LASER_PATTERN.test(text)) laser = true;
    if (NEGATION_PATTERN.test(text)) {
      denied = true;
      return;
    }
    if (fromCatalog || OFFER_CUE_PATTERN.test(text)) {
      offered = true;
    }
  };

  if (titleHit || catalogHit) note(`${title} ${snippet.catalog ? content : ""}`.trim(), true);
  for (const paragraph of paragraphs) note(paragraph, false);

  // A denial in the same record overrides a title-only match.
  if (denied) return { status: "not_offered", laser: false };
  if (offered) return { status: "offered", laser };
  return { status: "unknown", laser: false };
}

export function resolveTreatmentAvailability(params: {
  message: string;
  locale: string;
  documents: TreatmentKnowledgeSnippet[];
}): TreatmentAvailabilityDecision | null {
  if (!isTreatmentAvailabilityQuestion(params.message)) return null;
  const treatmentCode = findTreatmentCode(params.message.toLowerCase());
  if (!treatmentCode) return null;

  const synonyms = synonymsFor(treatmentCode);
  let offered = false;
  let denied = false;
  let laser = false;

  for (const doc of params.documents) {
    const verdict = snippetStatus(doc, synonyms);
    if (verdict.status === "offered") {
      offered = true;
      if (verdict.laser) laser = true;
    } else if (verdict.status === "not_offered") {
      denied = true;
    }
  }

  const status: TreatmentAvailabilityStatus = offered
    ? "offered"
    : denied
      ? "not_offered"
      : "unknown";

  const lang = params.locale.toLowerCase().startsWith("en")
    ? "en"
    : params.locale.toLowerCase().startsWith("de")
      ? "de"
      : "tr";
  const label = getTreatmentLabel(treatmentCode, lang === "de" ? "en" : lang);

  return {
    treatmentCode,
    status,
    laser: status === "offered" && laser,
    reply: formatTreatmentAvailabilityReply({
      locale: lang,
      status,
      label,
      laser: status === "offered" && laser,
    }),
  };
}

export function formatTreatmentAvailabilityReply(params: {
  locale: "tr" | "en" | "de";
  status: TreatmentAvailabilityStatus;
  label: string;
  laser: boolean;
}): string {
  const name =
    params.laser && /whitening|beyazlatma|aufhell/i.test(params.label)
      ? params.locale === "en"
        ? "laser teeth whitening"
        : params.locale === "de"
          ? "Laser-Zahnaufhellung"
          : "lazer diş beyazlatma"
      : params.label;

  if (params.status === "offered") {
    if (params.locale === "en") {
      return `Yes, ${name} is offered at our clinic. Suitability is confirmed after a clinical examination.`;
    }
    if (params.locale === "de") {
      return `Ja, ${name} wird in unserer Klinik angeboten. Die Eignung wird nach einer Untersuchung festgelegt.`;
    }
    return `Evet, kliniğimizde ${name} uygulanmaktadır. Kesin uygunluk muayene ve hekim değerlendirmesinden sonra belirlenir.`;
  }

  if (params.status === "not_offered") {
    if (params.locale === "en") {
      return `According to our records, ${name} is not offered at our clinic.`;
    }
    if (params.locale === "de") {
      return `Nach unseren Unterlagen wird ${name} in unserer Klinik nicht angeboten.`;
    }
    return `Kayıtlarımıza göre kliniğimizde ${name} uygulanmıyor.`;
  }

  if (params.locale === "en") {
    return `I cannot reliably verify from our current records whether ${name} is offered at our clinic. This needs to be confirmed by our clinic team to avoid misleading you.`;
  }
  if (params.locale === "de") {
    return `Ich kann anhand unserer aktuellen Unterlagen nicht zuverlässig überprüfen, ob ${name} in unserer Klinik angeboten wird. Damit wir Sie nicht falsch informieren, muss das von unserem Klinikteam bestätigt werden.`;
  }
  return `${name} işleminin kliniğimizde uygulanıp uygulanmadığını mevcut kayıtlarımızdan doğrulayamıyorum. Yanlış yönlendirmemek için bunun klinik ekibimizden teyit edilmesi gerekir.`;
}
