/**
 * Agency grounded network retrieval (Architecture V2).
 *
 * Assembles verified context for OpenAI phrasing. Never invents doctors,
 * prices, or clinic capabilities. Empty agency KB must not mean
 * "I have no information" — fall back to connected clinic structured data
 * and an approved network fallback.
 *
 * Does not choose clinics, authorize writes, or change matching eligibility.
 */

import { resolveClinicNarrativeText } from "./clinicFactGrounding";

export type AgencyGroundedSourceType =
  | "prompt_studio"
  | "conversation_state"
  | "selected_clinic"
  | "connected_clinic"
  | "clinic_overview"
  | "clinic_summary"
  | "treatments"
  | "doctors"
  | "pricing"
  | "faq"
  | "clinic_kb"
  | "location"
  | "languages"
  | "agency_kb"
  | "approved_fallback";

export interface AgencyGroundedAttribution {
  agencyId?: string;
  clinicId?: string;
  sourceType: AgencyGroundedSourceType;
  recordId?: string;
  score?: number;
}

export interface AgencyGroundedClinicInput {
  id?: string;
  clinicId?: string;
  clinicName?: string;
  clinicSlug?: string;
  status?: string;
  overview?: string | null | Record<string, unknown>;
  summary?: string | null;
  description?: string | null;
  longDescription?: string | null;
  shortDescription?: string | null;
  doctorCount?: number | null;
  accreditation?: string[] | null;
  treatmentCategories?: string[];
  treatments?: Array<{ name?: string; category?: string } | string>;
  location?: { city?: string; address?: string; side?: string } | null;
  supportedLanguages?: string[];
  languages?: string[];
}

export interface AgencyGroundedDoctorInput {
  id?: string;
  clinicId?: string;
  fullName?: string;
  name?: string;
  title?: string;
  specialties?: string[];
  specialty?: string;
  expertiseAreas?: string[];
  languages?: string[];
  isActive?: boolean;
  isPublic?: boolean;
}

export interface AgencyGroundedPricingInput {
  id?: string;
  clinicId?: string;
  treatmentName?: string;
  subTreatmentName?: string;
  priceMin?: number;
  priceMax?: number;
  currency?: string;
  isActive?: boolean;
}

export interface AgencyGroundedFaqInput {
  id?: string;
  clinicId?: string;
  question?: string;
  answer?: string;
  useInAIAnswers?: boolean;
}

export interface AgencyGroundedKbInput {
  id?: string;
  clinicId?: string;
  title?: string;
  content?: string;
  isActive?: boolean;
  ownerType?: string;
}

export interface BuildAgencyGroundedContextInput {
  agencyId?: string;
  agencyName?: string;
  locale?: string;
  assistantRole?: "network_advisor" | "clinic_coordinator" | string;
  selectedClinicId?: string | null;
  /** User message — used to detect an explicitly named clinic. */
  userMessage?: string | null;
  conversationSummary?: string | null;
  promptStudioSnippet?: string | null;
  clinics: AgencyGroundedClinicInput[];
  doctors?: AgencyGroundedDoctorInput[];
  pricing?: AgencyGroundedPricingInput[];
  faqs?: AgencyGroundedFaqInput[];
  clinicKnowledge?: AgencyGroundedKbInput[];
  agencyKnowledge?: AgencyGroundedKbInput[];
  showPriceRange?: boolean;
  maxClinics?: number;
}

export interface AgencyGroundedContextResult {
  contextText: string;
  attributions: AgencyGroundedAttribution[];
  framing: "network" | "selected_clinic" | "named_clinic";
  namedClinicId?: string;
  usedAgencyKnowledge: boolean;
  usedApprovedFallback: boolean;
}

function clinicIdOf(c: AgencyGroundedClinicInput): string {
  return String(c.id || c.clinicId || "").trim();
}

function clinicNameOf(c: AgencyGroundedClinicInput): string {
  return String(c.clinicName || c.clinicSlug || clinicIdOf(c) || "Clinic").trim();
}

function activeClinics(clinics: AgencyGroundedClinicInput[]): AgencyGroundedClinicInput[] {
  return (clinics || []).filter((c) => {
    const status = String(c.status || "active").toLowerCase();
    return status === "active" || status === "";
  });
}

/**
 * Resolve an explicitly named connected clinic from the user message.
 * Returns undefined when no unique connected match is found.
 */
export function resolveNamedConnectedClinic(
  message: string | null | undefined,
  clinics: AgencyGroundedClinicInput[]
): AgencyGroundedClinicInput | undefined {
  const raw = String(message || "").toLocaleLowerCase("tr-TR");
  if (!raw.trim()) return undefined;
  const active = activeClinics(clinics);
  const hits = active.filter((c) => {
    const name = clinicNameOf(c).toLocaleLowerCase("tr-TR");
    const slug = String(c.clinicSlug || "").toLocaleLowerCase("tr-TR");
    if (name.length >= 4 && raw.includes(name)) return true;
    if (slug.length >= 4 && raw.includes(slug.replace(/-/g, " "))) return true;
    // Common brand tokens (e.g. hospitadent)
    const token = name.split(/\s+/)[0];
    if (token.length >= 5 && raw.includes(token)) return true;
    return false;
  });
  if (hits.length === 1) return hits[0];
  return undefined;
}

export function getApprovedNetworkFallback(locale: string = "tr"): string {
  const isEn = locale.toLowerCase().startsWith("en");
  return isEn
    ? "I can share what our connected network clinics offer based on their verified profiles. If you tell me the treatment or city you have in mind, I can narrow this further."
    : "Bağlı klinik ağımızın doğrulanmış profil bilgilerine dayanarak neler sunulduğunu paylaşabilirim. Tedavi veya şehir tercihizi söylerseniz daha da netleştirebiliriz.";
}

export type ApprovedPricingFallbackOptions = {
  clinicName?: string | null;
  treatmentHint?: string | null;
  /** Soft next ask already known by backend (e.g. missing contact/treatment detail). */
  nextAsk?: string | null;
};

/**
 * Lexicon-approved reply when verified list pricing is missing.
 * Never dead-ends with "I have no information" — collect what is needed and
 * promise a quick, satisfaction-minded pricing follow-up.
 */
export function getApprovedPricingFallback(
  locale: string = "tr",
  options: ApprovedPricingFallbackOptions = {}
): string {
  const isEn = locale.toLowerCase().startsWith("en");
  const clinic = String(options.clinicName || "").trim();
  const treatment = String(options.treatmentHint || "").trim();
  const nextAsk = String(options.nextAsk || "").trim();

  if (isEn) {
    const subject = treatment
      ? `for ${treatment}`
      : clinic
        ? `with ${clinic}`
        : "for this treatment";
    const base =
      `I don’t have a verified list price ${subject} on hand right now — the final amount is personalized after the clinic’s evaluation. ` +
      `If you share the details we still need (treatment notes and your contact), we’ll get back to you quickly with clear pricing so you can decide with confidence.`;
    return nextAsk ? `${base} ${nextAsk}` : base;
  }

  const subject = treatment
    ? `${treatment} için`
    : clinic
      ? `${clinic} için`
      : "bu tedavi için";
  const base =
    `${subject} şu anda doğrulanmış bir liste fiyatı paylaşamıyorum; net tutar klinik değerlendirmesi sonrası kişiye özel belirleniyor. ` +
    `Gerekli bilgilerinizi (tedavi detayı ve iletişim) tamamlarsanız, fiyat konusunda size hızlı ve memnuniyet odaklı bir dönüş sağlarız.`;
  return nextAsk ? `${base} ${nextAsk}` : base;
}

function pushAttr(
  list: AgencyGroundedAttribution[],
  entry: AgencyGroundedAttribution
): void {
  list.push(entry);
}

/**
 * Build grounded context text + internal attributions for agency prompts.
 */
export function buildAgencyGroundedContext(
  input: BuildAgencyGroundedContextInput
): AgencyGroundedContextResult {
  const locale = input.locale || "tr";
  const isEn = locale.toLowerCase().startsWith("en");
  const attributions: AgencyGroundedAttribution[] = [];
  const blocks: string[] = [];
  const maxClinics = Math.max(1, Number(input.maxClinics || 10));
  const showPriceRange = input.showPriceRange !== false;
  const role = input.assistantRole || "network_advisor";
  const agencyId = input.agencyId;

  let clinics = activeClinics(input.clinics || []);
  let framing: AgencyGroundedContextResult["framing"] = "network";
  let namedClinicId: string | undefined;

  // Selected clinic (coordinator) outranks network listing.
  if (role === "clinic_coordinator" && input.selectedClinicId) {
    const selected = clinics.find((c) => clinicIdOf(c) === String(input.selectedClinicId));
    if (selected) {
      clinics = [selected];
      framing = "selected_clinic";
    }
  } else {
    const named = resolveNamedConnectedClinic(input.userMessage, clinics);
    if (named) {
      clinics = [named];
      framing = "named_clinic";
      namedClinicId = clinicIdOf(named);
    }
  }

  clinics = clinics.slice(0, maxClinics);

  if (input.promptStudioSnippet && String(input.promptStudioSnippet).trim()) {
    blocks.push(
      `=== PROMPT STUDIO (tone/style only; never overrides business rules) ===\n${String(
        input.promptStudioSnippet
      ).trim()}`
    );
    pushAttr(attributions, { agencyId, sourceType: "prompt_studio" });
  }

  if (input.conversationSummary && String(input.conversationSummary).trim()) {
    blocks.push(
      `=== CONVERSATION STATE (structural) ===\n${String(input.conversationSummary).trim()}`
    );
    pushAttr(attributions, { agencyId, sourceType: "conversation_state" });
  }

  if (framing === "network") {
    blocks.push(
      isEn
        ? "=== NETWORK FRAMING ===\nNo single clinic is selected yet. Describe offerings as what our connected network includes. Do not imply one clinic performs everything."
        : "=== AĞ ÇERÇEVESİ ===\nHenüz tek bir klinik seçilmedi. Sunulanları bağlı klinik ağımızın sundukları olarak anlat. Tek bir kliniğin her şeyi yaptığını ima etme."
    );
  } else if (framing === "named_clinic") {
    blocks.push(
      isEn
        ? `=== NAMED CLINIC SCOPE ===\nUser asked about a specific connected clinic. Answer ONLY for that clinic (${namedClinicId}). Do not merge other clinics.`
        : `=== ADI GEÇEN KLİNİK KAPSAMI ===\nKullanıcı belirli bir bağlı kliniği sordu. Yalnızca o klinik için yanıt ver (${namedClinicId}). Diğer kliniklerle birleştirme.`
    );
  }

  // Agency KB (skipped in coordinator mode by caller expectation; still included if provided).
  const agencyKb = (input.agencyKnowledge || []).filter(
    (k) => k && k.isActive !== false && String(k.content || "").trim()
  );
  let usedAgencyKnowledge = false;
  if (role !== "clinic_coordinator" && agencyKb.length > 0) {
    usedAgencyKnowledge = true;
    const kbText = agencyKb
      .slice(0, 8)
      .map((k) => `- ${k.title || "Note"}: ${String(k.content).slice(0, 500)}`)
      .join("\n");
    blocks.push(`=== AGENCY KNOWLEDGE BASE ===\n${kbText}`);
    for (const k of agencyKb.slice(0, 8)) {
      pushAttr(attributions, {
        agencyId,
        sourceType: "agency_kb",
        recordId: k.id,
      });
    }
  }

  const doctorsByClinic = new Map<string, AgencyGroundedDoctorInput[]>();
  for (const d of input.doctors || []) {
    if (d.isActive === false || d.isPublic === false) continue;
    const cid = String(d.clinicId || "").trim();
    if (!cid) continue;
    const list = doctorsByClinic.get(cid) || [];
    list.push(d);
    doctorsByClinic.set(cid, list);
  }

  const pricingByClinic = new Map<string, AgencyGroundedPricingInput[]>();
  for (const p of input.pricing || []) {
    if (p.isActive === false) continue;
    const cid = String(p.clinicId || "").trim();
    if (!cid) continue;
    const list = pricingByClinic.get(cid) || [];
    list.push(p);
    pricingByClinic.set(cid, list);
  }

  const faqByClinic = new Map<string, AgencyGroundedFaqInput[]>();
  for (const f of input.faqs || []) {
    if (f.useInAIAnswers === false) continue;
    if (!String(f.answer || "").trim()) continue;
    const cid = String(f.clinicId || "").trim();
    if (!cid) continue;
    const list = faqByClinic.get(cid) || [];
    list.push(f);
    faqByClinic.set(cid, list);
  }

  const kbByClinic = new Map<string, AgencyGroundedKbInput[]>();
  for (const k of input.clinicKnowledge || []) {
    if (k.isActive === false) continue;
    if (!String(k.content || "").trim()) continue;
    const cid = String(k.clinicId || "").trim();
    if (!cid) continue;
    const list = kbByClinic.get(cid) || [];
    list.push(k);
    kbByClinic.set(cid, list);
  }

  for (const clinic of clinics) {
    const cid = clinicIdOf(clinic);
    const name = clinicNameOf(clinic);
    const lines: string[] = [`### ${name} (id=${cid || "unknown"})`];

    const overview = resolveClinicNarrativeText({
      overview: clinic.overview,
      summary: clinic.summary,
      description: clinic.description,
      longDescription: clinic.longDescription,
      shortDescription: clinic.shortDescription,
    });
    if (overview) {
      lines.push(`Overview: ${overview.slice(0, 600)}`);
      pushAttr(attributions, {
        agencyId,
        clinicId: cid,
        sourceType: "clinic_overview",
      });
    }

    const cats = (clinic.treatmentCategories || []).map(String).filter(Boolean);
    const treatments = (clinic.treatments || [])
      .map((t) => (typeof t === "string" ? t : t.name || t.category || ""))
      .filter(Boolean);
    if (cats.length || treatments.length) {
      lines.push(
        `Treatments (service availability — NOT automatic proof of specialization): ${[...cats, ...treatments].slice(0, 20).join(", ")}`
      );
      pushAttr(attributions, {
        agencyId,
        clinicId: cid,
        sourceType: "treatments",
      });
    }

    const doctorCountNum = Number(clinic.doctorCount);
    if (Number.isFinite(doctorCountNum) && doctorCountNum > 0) {
      lines.push(`Verified doctorCount field: ${Math.floor(doctorCountNum)}`);
      pushAttr(attributions, {
        agencyId,
        clinicId: cid,
        sourceType: "doctors",
      });
    }

    if (Array.isArray(clinic.accreditation) && clinic.accreditation.length > 0) {
      lines.push(`Accreditation: ${clinic.accreditation.map(String).slice(0, 8).join(", ")}`);
    }

    const docs = (doctorsByClinic.get(cid) || []).slice(0, 8);
    if (docs.length) {
      lines.push(`Verified doctor records listed: ${docs.length}`);
      lines.push(
        "Doctors (verified records only): " +
          docs
            .map((d) => {
              const dn = d.fullName || d.name || "Doctor";
              const specs = [
                ...(d.specialties || []),
                ...(d.expertiseAreas || []),
                ...(d.specialty ? [d.specialty] : []),
              ]
                .map(String)
                .filter(Boolean);
              const sp = Array.from(new Set(specs)).join("/");
              return sp ? `${dn} (${sp})` : dn;
            })
            .join("; ")
      );
      for (const d of docs) {
        pushAttr(attributions, {
          agencyId,
          clinicId: cid,
          sourceType: "doctors",
          recordId: d.id,
        });
      }
    }

    const prices = (pricingByClinic.get(cid) || []).slice(0, 10);
    if (showPriceRange && prices.length) {
      lines.push(
        "Pricing (verified ranges only): " +
          prices
            .map((p) => {
              const label = p.subTreatmentName || p.treatmentName || "item";
              const cur = p.currency || "EUR";
              if (p.priceMin != null && p.priceMax != null) {
                return `${label}: ${p.priceMin}-${p.priceMax} ${cur}`;
              }
              if (p.priceMin != null) return `${label}: from ${p.priceMin} ${cur}`;
              return label;
            })
            .join("; ")
      );
      for (const p of prices) {
        pushAttr(attributions, {
          agencyId,
          clinicId: cid,
          sourceType: "pricing",
          recordId: p.id,
        });
      }
    }

    const faqs = (faqByClinic.get(cid) || []).slice(0, 5);
    if (faqs.length) {
      lines.push(
        "FAQ: " +
          faqs.map((f) => `Q:${f.question} A:${String(f.answer).slice(0, 200)}`).join(" | ")
      );
      for (const f of faqs) {
        pushAttr(attributions, {
          agencyId,
          clinicId: cid,
          sourceType: "faq",
          recordId: f.id,
        });
      }
    }

    const kb = (kbByClinic.get(cid) || []).slice(0, 5);
    if (kb.length) {
      lines.push(
        "Clinic KB: " +
          kb.map((k) => `${k.title || "Note"}: ${String(k.content).slice(0, 280)}`).join(" | ")
      );
      for (const k of kb) {
        pushAttr(attributions, {
          agencyId,
          clinicId: cid,
          sourceType: "clinic_kb",
          recordId: k.id,
        });
      }
    }

    const city = clinic.location?.city;
    const side = clinic.location?.side;
    if (city || side) {
      lines.push(`Location: ${[city, side].filter(Boolean).join(" / ")}`);
      pushAttr(attributions, {
        agencyId,
        clinicId: cid,
        sourceType: "location",
      });
    }

    const langs = clinic.supportedLanguages || clinic.languages || [];
    if (langs.length) {
      lines.push(`Languages: ${langs.map(String).join(", ")}`);
      pushAttr(attributions, {
        agencyId,
        clinicId: cid,
        sourceType: "languages",
      });
    }

    pushAttr(attributions, {
      agencyId,
      clinicId: cid,
      sourceType: framing === "selected_clinic" ? "selected_clinic" : "connected_clinic",
    });

    blocks.push(lines.join("\n"));
  }

  let usedApprovedFallback = false;
  const hasStructured =
    blocks.some((b) => b.includes("Overview:") || b.includes("Treatments:") || b.includes("Doctors")) ||
    usedAgencyKnowledge;

  if (!hasStructured || clinics.length === 0) {
    usedApprovedFallback = true;
    blocks.push(`=== APPROVED FALLBACK ===\n${getApprovedNetworkFallback(locale)}`);
    pushAttr(attributions, { agencyId, sourceType: "approved_fallback" });
  }

  blocks.push(
    isEn
      ? "=== GROUNDING RULES ===\nUse only verified context above. Never invent doctors, doctor counts, prices, specialties, certifications, or clinic capabilities. Offering a treatment ≠ specializing in it and ≠ being an expert — only state specialization when explicit specialty data exists. If a fact is missing, say it is not in verified records — do NOT invent marketing fillers (e.g. 'expert team', 'highly experienced staff'). If pricing is missing: do NOT invent a number — briefly explain pricing is personalized after evaluation when the user is in a quote flow; for pure information questions do not start lead qualification."
      : "=== DAYANAK KURALLARI ===\nYalnızca yukarıdaki doğrulanmış bağlamı kullan. Doktor, doktor sayısı, fiyat, uzmanlık, sertifika veya klinik yeteneği uydurma. Bir tedaviyi sunmak = o alanda uzman olmak değildir; uzmanlık yalnızca açık uzmanlık kaydı varsa söylenebilir. Bilgi yoksa doğrulanmış kayıtlarda olmadığını söyle — 'uzman kadro / deneyimli ekip' gibi pazarlama cümleleri uydurma. Fiyat yoksa rakam uydurma; bilgi sorularında lead formuna geçme."
  );

  return {
    contextText: blocks.join("\n\n"),
    attributions,
    framing,
    namedClinicId,
    usedAgencyKnowledge,
    usedApprovedFallback,
  };
}
