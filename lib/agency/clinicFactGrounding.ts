/**
 * Global clinic factual grounding helpers.
 *
 * Deterministic, clinic-agnostic. Never invents doctor counts, expertise,
 * or marketing claims. Service availability ≠ specialization.
 */

export type ClinicFactKind =
  | "doctor_count"
  | "doctor_list"
  | "expertise"
  | "general_clinic"
  | null;

/** Doctor is listable for AI / public answers (legacy + portal schemas). */
export function isDoctorActivelyListed(doctor: any): boolean {
  if (!doctor || typeof doctor !== "object") return false;
  if (doctor.showOnPublicProfile === false || doctor.isPublic === false) return false;
  if (doctor.active === false || doctor.isActive === false) return false;
  const status = String(doctor.status || "")
    .toLowerCase()
    .trim();
  if (
    status === "inactive" ||
    status === "archived" ||
    status === "deleted" ||
    status === "draft" ||
    status === "hidden"
  ) {
    return false;
  }
  if (status === "active") return true;
  if (doctor.active === true || doctor.isActive === true) return true;
  // Legacy install scripts often omit `status` and only set `active: true` or neither.
  if (!status) return true;
  return false;
}

export function resolveDoctorDisplayName(doctor: any): string {
  const candidate =
    doctor?.doctorName || doctor?.full_name || doctor?.fullName || doctor?.name;
  return typeof candidate === "string" ? candidate.trim() : "";
}

export function resolveDoctorSpecialtyList(doctor: any): string[] {
  const fromAreas = Array.isArray(doctor?.expertiseAreas)
    ? doctor.expertiseAreas.map(String).filter(Boolean)
    : [];
  const fromSpecs = Array.isArray(doctor?.specialties)
    ? doctor.specialties.map(String).filter(Boolean)
    : [];
  const single = doctor?.specialty ? [String(doctor.specialty)] : [];
  const merged = [...fromSpecs, ...fromAreas, ...single]
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set(merged));
}

/**
 * Safe narrative text from clinic records. Avoids String(object) → "[object Object]".
 */
export function resolveClinicNarrativeText(clinic: any): string {
  if (!clinic) return "";
  const overview = clinic.overview;
  if (typeof overview === "string" && overview.trim()) return overview.trim();
  if (overview && typeof overview === "object") {
    const parts = [
      overview.summary,
      Array.isArray(overview.specialties) ? overview.specialties.join(", ") : "",
      Array.isArray(overview.highlightedTreatments)
        ? overview.highlightedTreatments.join(", ")
        : "",
      overview.notes,
    ]
      .map((p) => String(p || "").trim())
      .filter(Boolean);
    if (parts.length) return parts.join(". ");
  }
  for (const key of ["longDescription", "shortDescription", "summary", "description"] as const) {
    const v = clinic[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * Verified doctor count: listed doctor docs first, then clinic.doctorCount,
 * then optional claims.capacity.specialistCount (labelled as claim source by caller).
 */
export function resolveVerifiedDoctorCount(
  clinic: any,
  doctorsForClinic: any[] = []
): { count: number; source: "doctor_records" | "doctorCount" | "claims_capacity" } | null {
  const listed = (doctorsForClinic || []).filter(isDoctorActivelyListed);
  if (listed.length > 0) {
    return { count: listed.length, source: "doctor_records" };
  }
  const dc = Number(clinic?.doctorCount);
  if (Number.isFinite(dc) && dc > 0) {
    return { count: Math.floor(dc), source: "doctorCount" };
  }
  const claim = Number(
    clinic?.claims?.capacity?.specialistCount ?? clinic?.claims?.specialistCount
  );
  if (Number.isFinite(claim) && claim > 0) {
    return { count: Math.floor(claim), source: "claims_capacity" };
  }
  return null;
}

export function detectClinicFactKind(message?: string | null): ClinicFactKind {
  const raw = String(message || "").trim();
  if (!raw) return null;
  const lower = raw.toLocaleLowerCase("tr-TR");

  if (
    /kaç\s+doktor|kac\s+doktor|how many doctors|doktor\s+say[ıi]|number of doctors|kaç\s+hekim|kac\s+hekim|kaç\s+uzman|kac\s+uzman|how many specialists|staff size|kadrosunda kaç/i.test(
      lower
    )
  ) {
    return "doctor_count";
  }
  if (
    /hangi doktor|doktorlar[ıi]?\s+kim|doctor list|doktor kadro|doktorlar[ıi]?\s+neler|who are the doctors/i.test(
      lower
    )
  ) {
    return "doctor_list";
  }
  if (
    /uzman\s+m[ıi]|uzman[ıi]\s+m[ıi]|speciali[sz]e[sd]?\s+in|is .+ (an )?expert|expertise|bu konuda uzman|alan[ıi]nda uzman|specialist in/i.test(
      lower
    )
  ) {
    return "expertise";
  }
  if (
    /hakk[ıi]nda|about (the )?clinic|ne sunuyor|what (does|do) .+ offer|klinik bilgisi/i.test(
      lower
    )
  ) {
    return "general_clinic";
  }
  return null;
}

/** Explicit specialization signals from structured clinic data only. */
export function clinicHasExplicitSpecialization(
  clinic: any,
  topic?: string | null
): boolean {
  const overview = clinic?.overview;
  const specialties: string[] = [];
  if (overview && typeof overview === "object" && Array.isArray(overview.specialties)) {
    specialties.push(...overview.specialties.map(String));
  }
  if (Array.isArray(clinic?.specialties)) {
    specialties.push(...clinic.specialties.map(String));
  }
  if (specialties.length === 0) return false;
  if (!topic || !String(topic).trim()) return specialties.length > 0;
  const t = String(topic).toLocaleLowerCase("tr-TR");
  return specialties.some((s) => String(s).toLocaleLowerCase("tr-TR").includes(t) || t.includes(String(s).toLocaleLowerCase("tr-TR")));
}

export function clinicOffersTreatmentCategory(
  clinic: any,
  topic?: string | null
): boolean {
  if (!topic) return false;
  const t = String(topic).toLocaleLowerCase("tr-TR");
  const cats = [
    ...(clinic?.treatmentCategories || []),
    ...(clinic?.treatments || []),
    ...(clinic?.subTreatments || []),
  ]
    .map((c: any) =>
      typeof c === "string" ? c : String(c?.name || c?.category || "")
    )
    .filter(Boolean)
    .map((s: string) => s.toLocaleLowerCase("tr-TR"));
  return cats.some((c) => c.includes(t) || t.includes(c));
}

/**
 * Unsupported marketing fillers the model tends to invent when unsure.
 * Used for post-filters when a fact was not verified.
 */
const UNSUPPORTED_MARKETING_RE =
  /alan[ıi]nda uzman bir ekip|deneyimli doktorlarla|olduk[cç]a ba[sş]ar[ıi]l[ıi]d[ıi]r|uzman kadrosuyla hizmet|highly experienced team|expert team in the field|renowned for excellence/i;

export function containsUnsupportedClinicMarketingClaim(text?: string | null): boolean {
  return UNSUPPORTED_MARKETING_RE.test(String(text || ""));
}

export function buildVerifiedClinicFactReply(params: {
  kind: Exclude<ClinicFactKind, null>;
  locale?: string;
  clinicName: string;
  doctorCount: { count: number; source: string } | null;
  doctors?: Array<{ name: string; specialties?: string[] }>;
  offersTreatment?: boolean;
  explicitSpecialization?: boolean;
  treatmentLabel?: string | null;
}): { reply: string; verified: boolean; kind: string } {
  const isEn = String(params.locale || "tr").toLowerCase().startsWith("en");
  const name = params.clinicName || (isEn ? "This clinic" : "Bu klinik");

  if (params.kind === "doctor_count") {
    if (params.doctorCount) {
      const n = params.doctorCount.count;
      return {
        verified: true,
        kind: "doctor_count",
        reply: isEn
          ? `According to our verified clinic records, ${name} currently lists ${n} doctor${n === 1 ? "" : "s"}.`
          : `Doğrulanmış klinik kayıtlarımıza göre ${name} bünyesinde şu an ${n} doktor görünüyor.`,
      };
    }
    return {
      verified: false,
      kind: "doctor_count",
      reply: isEn
        ? `I do not currently have a verified doctor count for ${name} in ClinicBridge records.`
        : `${name} için sistemimizde doğrulanmış bir doktor sayısı bulunmuyor.`,
    };
  }

  if (params.kind === "doctor_list") {
    const docs = (params.doctors || []).filter((d) => d.name);
    if (docs.length > 0) {
      const lines = docs
        .slice(0, 12)
        .map((d) => {
          const sp = (d.specialties || []).filter(Boolean).join(", ");
          return sp ? `• ${d.name} — ${sp}` : `• ${d.name}`;
        })
        .join("\n");
      return {
        verified: true,
        kind: "doctor_list",
        reply: isEn
          ? `Verified doctors listed for ${name}:\n\n${lines}`
          : `${name} için kayıtlı doğrulanmış doktorlar:\n\n${lines}`,
      };
    }
    return {
      verified: false,
      kind: "doctor_list",
      reply: isEn
        ? `I do not currently have verified doctor profiles for ${name} in ClinicBridge records.`
        : `${name} için sistemimizde doğrulanmış doktor profili bulunmuyor.`,
    };
  }

  if (params.kind === "expertise") {
    const topic = params.treatmentLabel || "";
    if (params.explicitSpecialization) {
      return {
        verified: true,
        kind: "expertise",
        reply: isEn
          ? topic
            ? `Verified clinic records list ${topic} among ${name}'s stated specialties.`
            : `Verified clinic records include stated specialties for ${name}.`
          : topic
            ? `Doğrulanmış klinik kayıtlarında ${name} için ${topic} belirtilmiş bir uzmanlık alanı olarak yer alıyor.`
            : `Doğrulanmış klinik kayıtlarında ${name} için belirtilmiş uzmanlık alanları bulunuyor.`,
      };
    }
    if (params.offersTreatment) {
      return {
        verified: true,
        kind: "expertise_service_only",
        reply: isEn
          ? topic
            ? `I can confirm that ${name} offers ${topic}. I cannot verify from our records that the clinic specializes in it or is an expert in that field.`
            : `I can confirm related services appear for ${name}, but I cannot verify specialization or expertise from our records.`
          : topic
            ? `${name} bünyesinde ${topic} sunulduğunu doğrulayabiliyorum. Ancak kayıtlarımızda bunun bir uzmanlık / specialization olarak tanımlandığını doğrulayamıyorum.`
            : `${name} için ilgili hizmet kaydı görüyorum; ancak uzmanlık iddiasını doğrulayacak bir kayıt yok.`,
      };
    }
    return {
      verified: false,
      kind: "expertise",
      reply: isEn
        ? `I cannot verify from ClinicBridge records whether ${name} specializes in that area.`
        : `${name} için bu alanda uzmanlık iddiasını doğrulayacak bir kayıt bulunmuyor.`,
    };
  }

  // general_clinic — caller should prefer grounded LLM with context; provide unavailable fallback only
  return {
    verified: false,
    kind: "general_clinic",
    reply: isEn
      ? `I can share what is present in verified ClinicBridge records for ${name}, but I will not invent details that are not listed.`
      : `${name} için yalnızca ClinicBridge’deki doğrulanmış kayıtları paylaşabilirim; kayıt dışı bilgi uydurmam.`,
  };
}

/**
 * Whether this turn is a pure clinic-fact digression that should not advance intake.
 */
export function isClinicFactInformationTurn(message?: string | null): boolean {
  return detectClinicFactKind(message) != null;
}
