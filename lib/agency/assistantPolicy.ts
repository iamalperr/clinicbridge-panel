/**
 * Authoritative agency assistant policy compiler.
 *
 * Precedence (highest → lowest):
 * 1. Medical safety, privacy and KVKK
 * 2. Backend conversation state
 * 3. Agency structured configuration (typed)
 * 4. Custom advanced system prompt (tone/style only)
 * 5. LLM response generation
 *
 * The custom prompt must never redefine required intake, consent, clinic limits,
 * or conversation stage order.
 */

import type { AgencyAIConfig, AIIntakeInstruction } from "../types/agency";
import { FEELINHEALTHY_CONFIG } from "./feelinhealthyConfig";
import { resolveAssistantRole, type AssistantRole } from "./assistantModes";
import {
  getAgencyIstanbulSide,
  getAgencySelectedCity,
  getAgencySelectedClinicIds,
  getAgencyTreatmentContext,
} from "./agencySessionState";
import { getExplainBeforeAskSystemPolicyBlock } from "./intakeExplainBeforeAsk";

export type PolicyWarningSeverity = "warning" | "error";

export interface PolicyWarning {
  code: string;
  severity: PolicyWarningSeverity;
  messageTr: string;
  messageEn: string;
}

export type IntakeFieldKey =
  | "treatmentNeed"
  | "firstName"
  | "lastName"
  | "patientAge"
  | "patientGender"
  | "patientCountry"
  | "patientEmail"
  | "patientPhone"
  | "preferredLocation"
  | "budget"
  | "hasXrayOrDiagnosis"
  | "travelDate"
  | "supportNeeds"
  | "patientLocation";

export interface IntakeFieldPolicy {
  key: IntakeFieldKey | string;
  enabled: boolean;
  required: boolean;
  group: 1 | 2 | 3 | "optional" | "location_state" | "intent";
  labelTR: string;
  labelEN: string;
  questionTR: string;
  questionEN: string;
}

export interface AssistantPolicy {
  agencyId: string;
  agencySlug: string;
  isFeelinHealthy: boolean;
  languagePolicy: {
    mode: "user_lang" | "default_tr" | "default_en";
  };
  pricingPolicy: {
    mode: "show_exact" | "show_range" | "quote_only" | "fallback_quote";
    /** Effective display — matching config may override Studio dropdown. */
    showPriceRange: boolean;
  };
  recommendationPolicy: {
    mode: "ask_first" | "direct_recommend" | "always_alternatives" | "strict_match";
    leadCollectionMode: "light" | "moderate" | "aggressive";
  };
  intakePolicy: {
    fields: IntakeFieldPolicy[];
    askBudget: boolean;
    groupedMode: boolean;
    /** Fields that must never block matching readiness. */
    nonBlockingOptionalKeys: string[];
  };
  consentPolicy: {
    required: boolean;
    privacyNoticeUrl: string;
  };
  clinicLimit: number;
  customPrompt: string | null;
  communicationStyle: {
    assistantName: string;
    persona: string;
    tone: string;
    greetingMessageTR: string;
    greetingMessageEN: string;
    responseRules: string[];
    forbiddenClaims: string[];
  };
  conversationState: {
    stage: string;
    consentAccepted: boolean;
    treatmentKnown: boolean;
    treatmentCategory: string | null;
    intakeGroup: string | number | null;
    selectedCity: string | null;
    istanbulSide: string | null;
    selectedClinicId: string | null;
    selectedClinicName: string | null;
    selectedClinicIds: string[];
    /** @deprecated use assistantRole === "clinic_coordinator" */
    isSelectedClinicMode: boolean;
    assistantRole: AssistantRole;
    leadStage: string | null;
  };
  warnings: PolicyWarning[];
}

const BUDGET_ASK_RE =
  /\bbütçen(iz|izi|i)?\b|\bbütçesini\b|\bbütçe\s*(paylaş|söyle|nedir|nedir\??)|yaklaşık bir bütçe|\bshare (your )?budget\b|\b(your )?budget\b|\bbudget\b/i;
const BUDGET_DENY_RE =
  /bütçe sorma|bütçe sormaz|bütçe sorulmaz|never ask.{0,20}budget|do not ask.{0,20}budget|askBudget\s*[:=]\s*false/i;
const CLINIC_LIMIT_OVERRIDE_RE = /\b(3|4|5|altı|alti|six|five|four|three)\s*(klinik|clinic)/i;
const MAX_CLINIC_OVERRIDE_RE = /\b(tüm|tum|all)\s+(uygun\s+)?(klinik|clinic)/i;

export function mentionsBudget(text?: string | null): boolean {
  const value = String(text || "");
  if (!value.trim()) return false;
  if (BUDGET_DENY_RE.test(value) && !/\bbütçen(iz|izi)\b|\bshare (your )?budget\b/i.test(value)) {
    // Pure "do not ask budget" policy language is allowed.
    return false;
  }
  return BUDGET_ASK_RE.test(value);
}

export const FEELINHEALTHY_CANONICAL_INTAKE: IntakeFieldPolicy[] = [
  {
    key: "treatmentNeed",
    enabled: true,
    required: true,
    group: "intent",
    labelTR: "Tedavi ihtiyacı",
    labelEN: "Treatment need",
    questionTR: "Hangi tedavi için destek istiyorsunuz?",
    questionEN: "What treatment would you like help with?",
  },
  {
    key: "firstName",
    enabled: true,
    required: true,
    group: 1,
    labelTR: "Ad",
    labelEN: "First name",
    questionTR: "Adınızı paylaşır mısınız?",
    questionEN: "May I have your first name?",
  },
  {
    key: "lastName",
    enabled: true,
    required: true,
    group: 1,
    labelTR: "Soyad",
    labelEN: "Last name",
    questionTR: "Soyadınızı paylaşır mısınız?",
    questionEN: "May I have your last name?",
  },
  {
    key: "patientGender",
    enabled: true,
    required: true,
    group: 1,
    labelTR: "Cinsiyet",
    labelEN: "Gender",
    questionTR: "Cinsiyetinizi paylaşır mısınız?",
    questionEN: "Could you share your gender?",
  },
  {
    key: "patientAge",
    enabled: true,
    required: true,
    group: 1,
    labelTR: "Yaş",
    labelEN: "Age",
    questionTR: "Yaşınızı öğrenebilir miyim?",
    questionEN: "May I know your age?",
  },
  {
    key: "patientEmail",
    enabled: true,
    required: true,
    group: 2,
    labelTR: "E-posta",
    labelEN: "Email",
    questionTR: "E-posta adresinizi paylaşır mısınız?",
    questionEN: "Could you share your email address?",
  },
  {
    key: "patientPhone",
    enabled: true,
    required: true,
    group: 2,
    labelTR: "Telefon",
    labelEN: "Phone",
    questionTR: "Telefon numaranızı paylaşır mısınız?",
    questionEN: "Could you share your phone number?",
  },
  {
    key: "patientCountry",
    enabled: true,
    required: true,
    group: 2,
    labelTR: "Ülke (ikamet)",
    labelEN: "Country of residence",
    questionTR: "Hangi ülkeden yazıyorsunuz?",
    questionEN: "Which country are you contacting us from?",
  },
  {
    key: "travelDate",
    enabled: true,
    required: true,
    group: 3,
    labelTR: "Seyahat tarihi",
    labelEN: "Travel date",
    questionTR: "Seyahatinizi hangi tarih veya dönem için planlıyorsunuz?",
    questionEN: "When are you planning to travel for treatment?",
  },
  {
    key: "preferredLocation",
    enabled: true,
    required: true,
    group: "location_state",
    labelTR: "Tercih edilen tedavi şehri",
    labelEN: "Preferred treatment city",
    questionTR: "Tedavi için hangi şehri tercih edersiniz?",
    questionEN: "Which city do you prefer for treatment?",
  },
  {
    key: "budget",
    enabled: false,
    required: false,
    group: "optional",
    labelTR: "Bütçe",
    labelEN: "Budget",
    questionTR: "",
    questionEN: "",
  },
  {
    key: "hasXrayOrDiagnosis",
    enabled: true,
    required: false,
    group: "optional",
    labelTR: "Röntgen/Teşhis",
    labelEN: "X-ray / Diagnosis",
    questionTR: "Daha önce röntgen veya teşhis aldınız mı?",
    questionEN: "Have you had an X-ray or diagnosis before?",
  },
  {
    key: "supportNeeds",
    enabled: true,
    required: false,
    group: "optional",
    labelTR: "Destek ihtiyaçları",
    labelEN: "Support needs",
    questionTR: "Transfer veya konaklama desteği ister misiniz?",
    questionEN: "Do you need transfer or accommodation support?",
  },
];

export const FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS: Partial<AgencyAIConfig> = {
  assistantName: "FeelinHealthy AI Assistant",
  tone: "Professional",
  persona:
    "Sen FeelinHealthy adına çalışan, sağlık turizmi hastalarına doğru klinik ve tedavi yönlendirmesi yapan profesyonel bir AI asistansın. Hastanın tedavi ihtiyacını, ikamet ülkesini, yaşını, cinsiyetini, seyahat planını ve beklentilerini anlayarak en uygun klinikleri önerirsin. Bütçe sormazsın. Kesin teşhis koymaz, tedavi garantisi vermez ve kesin fiyat taahhüdünde bulunmazsın. Fiyat bilgisi paylaşırken bunun sistemde kayıtlı fiyat aralığı olduğunu, nihai fiyatın klinik değerlendirmesi sonrası netleşeceğini belirtirsin. Konuşma tarzın güven veren, sade, profesyonel ve çözüm odaklıdır.",
  greetingMessageTR:
    "Merhaba 👋 Ben FeelinHealthy AI asistanınızım. Tedavi ihtiyacınızı ve tercih ettiğiniz şehri paylaşın; size en uygun klinikleri birlikte bulalım.",
  greetingMessageEN:
    "Hello 👋 I’m your FeelinHealthy AI assistant. Tell me about your treatment need and preferred city, and I’ll help you find the most suitable clinics.",
  leadCollectionMode: "moderate",
  pricingBehavior: "show_range",
  recommendationBehavior: "direct_recommend",
  languageBehavior: "user_lang",
  temperature: 0.45,
  responseRules: [
    "Hastanın en son sorduğu bilgilendirme sorusunu önce yanıtla; sonra gerekirse bir sonraki intake alanını nazikçe iste.",
    "Danışman gibi konuş; asla 'Invalid input', 'Missing field', 'eksik alan' veya form-validasyon dili kullanma.",
    "workflowPaused ise soruyu tam yanıtla ve yalnızca bir yumuşak devam cümlesi ekle; intake'i yeniden başlatma.",
    "Klinik seçilmeden önce ağımızdaki kliniklerin sundukları olarak anlat; seçili/adlı klinikte yalnızca o klinik kapsamında kal.",
    "Doktor, fiyat, uzmanlık veya klinik yeteneği uydurma; yalnızca doğrulanmış bağlamı kullan.",
    "Hastanın tedavi ihtiyacını anlamadan klinik önermeye çalışma.",
    "Hasta yeterli bilgi verdiyse klinik önerilerini sohbet içinde kartlarla göster.",
    "Klinik kartlarında yalnızca backend fiyatlarını kullan; yoksa uydurma.",
    "Hasta bir klinik seçtiğinde aynı kartı sürekli tekrar gösterme.",
    "Klinik seçildikten sonra yalnızca seçilen klinik bağlamında cevap ver; keşfe geri dönme.",
    "FeelinHealthy için bütçe sorma.",
    "Lead bilgilerini 3 grup halinde topla; her seferinde yalnızca eksik grubu sor.",
    "Kesin teşhis, kesin sonuç veya kesin fiyat garantisi verme.",
  ],
  forbiddenClaims: [
    "Kesin teşhis koyma.",
    "Tedavi sonucu garantisi verme.",
    "Fiyatın kesin olduğunu söyleme.",
    "Doktor muayenesi olmadan kesin tedavi planı çıkarma.",
    "Klinik adına tıbbi taahhüt verme.",
    "Bilgi yoksa uydurma.",
    "Doktor, fiyat veya klinik kapasitesi uydurma.",
    "Bütçe sorusu sorma.",
    "Form/validasyon dili kullanma (Invalid input, Missing field).",
  ],
  intakeInstructions: [
    {
      key: "treatmentNeed",
      labelTR: "Tedavi veya Şikayet",
      labelEN: "Treatment or Concern",
      questionTR: "Hangi tedavi veya şikayet için destek istiyorsunuz?",
      questionEN: "What treatment or concern would you like help with?",
      required: true,
      type: "text",
      usage: "Tedavi niyetini state olarak kaydetmek için",
    },
    {
      key: "patientAge",
      labelTR: "Yaş",
      labelEN: "Age",
      questionTR: "Yaşınızı öğrenebilir miyim?",
      questionEN: "May I know your age?",
      required: true,
      type: "number",
      usage: "Grup 1 — zorunlu",
    },
    {
      key: "patientGender",
      labelTR: "Cinsiyet",
      labelEN: "Gender",
      questionTR: "Cinsiyetinizi paylaşır mısınız?",
      questionEN: "Could you share your gender?",
      required: true,
      type: "select",
      usage: "Grup 1 — zorunlu",
    },
    {
      key: "patientCountry",
      labelTR: "İkamet Ülkesi",
      labelEN: "Country of Residence",
      questionTR: "Hangi ülkeden yazıyorsunuz?",
      questionEN: "Which country are you contacting us from?",
      required: true,
      type: "text",
      usage: "Grup 2 — ikamet/iletişim ülkesi (tedavi şehri değil)",
    },
    {
      key: "preferredLocation",
      labelTR: "Tercih Edilen Tedavi Şehri",
      labelEN: "Preferred Treatment City",
      questionTR: "Tedavi için hangi şehri tercih edersiniz?",
      questionEN: "Which city do you prefer for treatment?",
      required: true,
      type: "text",
      usage: "Lokasyon state makinesi / şehir seçim kartı ile yönetilir",
    },
    {
      key: "budget",
      labelTR: "Bütçe",
      labelEN: "Budget",
      questionTR: "",
      questionEN: "",
      required: false,
      type: "text",
      usage: "FeelinHealthy için kapalı — asla sorulmaz",
    },
    {
      key: "hasXrayOrDiagnosis",
      labelTR: "Röntgen/Teşhis Durumu",
      labelEN: "X-ray / Diagnosis",
      questionTR: "Daha önce röntgen veya teşhis aldınız mı?",
      questionEN: "Have you had an X-ray or diagnosis before?",
      required: false,
      type: "text",
      usage: "Opsiyonel — eşleşmeyi engellemez",
    },
    {
      key: "travelDate",
      labelTR: "Seyahat Tarihi",
      labelEN: "Travel Date",
      questionTR: "Seyahatinizi hangi tarih veya dönem için planlıyorsunuz?",
      questionEN: "When are you planning to travel for treatment?",
      required: true,
      type: "text",
      usage: "Grup 3 — zorunlu",
    },
    {
      key: "supportNeeds",
      labelTR: "Destek İhtiyaçları",
      labelEN: "Support Needs",
      questionTR: "Transfer veya konaklama desteği ister misiniz?",
      questionEN: "Do you need transfer or accommodation support?",
      required: false,
      type: "text",
      usage: "Opsiyonel — eşleşmeyi engellemez",
    },
  ],
  customSystemPrompt: `Bu asistan FeelinHealthy acentasına bağlı klinikler arasında hasta yönlendirmesi yapar.

İletişim stilini ve güven dilini bu prompt belirler; ancak zorunlu intake alanları, KVKK, şehir/yaka seçimi, klinik limiti ve konuşma aşaması backend state tarafından yönetilir. Bu kuralları yeniden tanımlama.

Seçili klinik modunda yalnızca seçilen klinik bağlamında yanıt ver; klinik keşfine geri dönme. Kartları yalnızca öneri veya seçim anında göster.`,
};

export function validateAgencyAIConfigConflicts(
  config: Partial<AgencyAIConfig> | null | undefined,
  opts: { isFeelinHealthy: boolean; clinicLimit?: number } = { isFeelinHealthy: false }
): PolicyWarning[] {
  const warnings: PolicyWarning[] = [];
  const cfg = config || {};
  const intake = cfg.intakeInstructions || [];
  const budgetField = intake.find((i) => i.key === "budget");

  if (opts.isFeelinHealthy) {
    if (budgetField?.required || (budgetField && String(budgetField.questionTR || "").trim())) {
      warnings.push({
        code: "fh_budget_enabled",
        severity: "error",
        messageTr: "FeelinHealthy için bütçe alanı kapalı olmalıdır; zorunlu veya soru metni bulunmamalıdır.",
        messageEn: "Budget must stay disabled for FeelinHealthy; do not mark it required or keep a question.",
      });
    }
    if (mentionsBudget(cfg.persona) || mentionsBudget(cfg.greetingMessageTR) || mentionsBudget(cfg.greetingMessageEN)) {
      warnings.push({
        code: "fh_budget_in_copy",
        severity: "error",
        messageTr: "Persona veya karşılama mesajında bütçe geçiyor. FeelinHealthy bütçe sormaz.",
        messageEn: "Persona or welcome message mentions budget. FeelinHealthy must never ask for budget.",
      });
    }
    if ((cfg.responseRules || []).some((r) => mentionsBudget(r))) {
      warnings.push({
        code: "fh_budget_in_rules",
        severity: "warning",
        messageTr: "Yanıt kurallarında bütçe ifadesi var. FeelinHealthy kurallarından çıkarılmalıdır.",
        messageEn: "Response rules mention budget. Remove budget from FeelinHealthy rules.",
      });
    }

    const requiredKeys = ["patientAge", "patientGender", "patientCountry", "travelDate"];
    for (const key of requiredKeys) {
      const row = intake.find((i) => i.key === key || (key === "patientCountry" && i.key === "patientLocation"));
      if (row && row.required === false) {
        warnings.push({
          code: `fh_required_disabled_${key}`,
          severity: "error",
          messageTr: `${row.labelTR || key} FeelinHealthy’de zorunludur; kapalı bırakılmamalıdır.`,
          messageEn: `${row.labelEN || key} is required for FeelinHealthy and must stay required.`,
        });
      }
    }

    const hasPatientLoc = intake.some((i) => i.key === "patientLocation" && i.required);
    const hasPreferred = intake.some((i) => i.key === "preferredLocation");
    const hasCountry = intake.some((i) => i.key === "patientCountry");
    if (hasPatientLoc && hasPreferred && !hasCountry) {
      warnings.push({
        code: "fh_location_overlap",
        severity: "warning",
        messageTr: "patientLocation ile preferredLocation karışabilir. İkamet ülkesi (patientCountry) ile tedavi şehrini ayırın.",
        messageEn: "patientLocation and preferredLocation may overlap. Separate residence country from treatment city.",
      });
    }
  }

  const custom = cfg.customSystemPrompt || "";
  if (CLINIC_LIMIT_OVERRIDE_RE.test(custom) || MAX_CLINIC_OVERRIDE_RE.test(custom)) {
    warnings.push({
      code: "custom_prompt_clinic_limit",
      severity: "warning",
      messageTr: "Özel prompt klinik sayısını yeniden tanımlıyor gibi görünüyor. Azami klinik limiti backend tarafından uygulanır.",
      messageEn: "Custom prompt appears to redefine clinic limits. Backend clinic limits remain authoritative.",
    });
  }
  if (/kvkk.?atlan|skip.?consent|without.?consent|onaysız/i.test(custom)) {
    warnings.push({
      code: "custom_prompt_consent",
      severity: "error",
      messageTr: "Özel prompt KVKK/onay kurallarını baypas ediyor gibi. Bu engellenir.",
      messageEn: "Custom prompt appears to bypass consent rules. Consent remains mandatory.",
    });
  }
  if (/teşhis koy|diagnose the patient|garanti ver|guarantee.?result/i.test(custom)) {
    warnings.push({
      code: "custom_prompt_medical_safety",
      severity: "error",
      messageTr: "Özel prompt tıbbi güvenlik kurallarıyla çelişiyor olabilir.",
      messageEn: "Custom prompt may conflict with medical safety rules.",
    });
  }

  void opts.clinicLimit;
  return warnings;
}

export function compileAssistantPolicy(input: {
  agencyId: string;
  agencySlug: string;
  aiConfig?: Partial<AgencyAIConfig> | null;
  matchingConfig?: { maxClinicsToShow?: number; showPriceRange?: boolean } | null;
  sessionContext?: Record<string, any> | null;
  privacyNoticeUrl?: string;
}): AssistantPolicy {
  const isFeelinHealthy =
    input.agencySlug === "feelinhealthy" ||
    input.agencyId === "feelinhealthy" ||
    input.agencySlug === FEELINHEALTHY_CONFIG.agencySlug;

  const ai = input.aiConfig || {};
  const defaults = isFeelinHealthy ? FEELINHEALTHY_PROMPT_STUDIO_DEFAULTS : {};
  // Stored Studio values win for communication style, but FH intake/budget hard rules win below.
  const merged: Partial<AgencyAIConfig> = { ...defaults, ...ai };

  const clinicLimit = isFeelinHealthy
    ? FEELINHEALTHY_CONFIG.maxGuestClinics
    : Number(input.matchingConfig?.maxClinicsToShow || 3);

  const showPriceRange =
    input.matchingConfig?.showPriceRange !== undefined
      ? Boolean(input.matchingConfig.showPriceRange)
      : merged.pricingBehavior !== "quote_only";

  const ctx = input.sessionContext || {};
  // Canonical selected-clinic list only — not clinic eligibility authorization.
  const selectedClinicIds = getAgencySelectedClinicIds(ctx);
  const assistantRole = resolveAssistantRole(ctx);
  const isSelectedClinicMode = assistantRole === "clinic_coordinator";
  const treatment = getAgencyTreatmentContext(ctx);
  const selectedCity = getAgencySelectedCity(ctx);

  const intakeFields: IntakeFieldPolicy[] = isFeelinHealthy
    ? FEELINHEALTHY_CANONICAL_INTAKE.map((f) => ({ ...f }))
    : (merged.intakeInstructions || []).map((inst: AIIntakeInstruction) => ({
        key: inst.key,
        enabled: true,
        required: Boolean(inst.required),
        group: "optional" as const,
        labelTR: inst.labelTR,
        labelEN: inst.labelEN,
        questionTR: inst.questionTR,
        questionEN: inst.questionEN,
      }));

  if (isFeelinHealthy) {
    for (const f of intakeFields) {
      if (f.key === "budget") {
        f.enabled = false;
        f.required = false;
        f.questionTR = "";
        f.questionEN = "";
      }
    }
  }

  const warnings = validateAgencyAIConfigConflicts(merged, {
    isFeelinHealthy,
    clinicLimit,
  });

  return {
    agencyId: input.agencyId,
    agencySlug: input.agencySlug,
    isFeelinHealthy,
    languagePolicy: {
      mode: (merged.languageBehavior as AssistantPolicy["languagePolicy"]["mode"]) || "user_lang",
    },
    pricingPolicy: {
      mode: (merged.pricingBehavior as AssistantPolicy["pricingPolicy"]["mode"]) || "show_range",
      showPriceRange,
    },
    recommendationPolicy: {
      mode: (merged.recommendationBehavior as AssistantPolicy["recommendationPolicy"]["mode"]) || "direct_recommend",
      leadCollectionMode:
        (merged.leadCollectionMode as AssistantPolicy["recommendationPolicy"]["leadCollectionMode"]) || "moderate",
    },
    intakePolicy: {
      fields: intakeFields,
      askBudget: isFeelinHealthy ? false : intakeFields.some((f) => f.key === "budget" && f.enabled),
      groupedMode: isFeelinHealthy,
      nonBlockingOptionalKeys: ["hasXrayOrDiagnosis", "supportNeeds", "budget"],
    },
    consentPolicy: {
      required: true,
      privacyNoticeUrl: input.privacyNoticeUrl || (isFeelinHealthy ? FEELINHEALTHY_CONFIG.privacyNoticeUrl : ""),
    },
    clinicLimit,
    customPrompt: merged.customSystemPrompt?.trim() || null,
    communicationStyle: {
      assistantName: merged.assistantName || "AI Asistan",
      persona: merged.persona || "Sen bir sağlık turizmi AI asistanısın.",
      tone: merged.tone || "Professional",
      greetingMessageTR: merged.greetingMessageTR || "Merhaba! Size nasıl yardımcı olabilirim?",
      greetingMessageEN: merged.greetingMessageEN || "Hello! How can I help you today?",
      responseRules: merged.responseRules || [],
      forbiddenClaims: merged.forbiddenClaims || [],
    },
    conversationState: {
      stage: String(ctx.leadStage || ctx.intakeStage || "start"),
      consentAccepted: ctx.quoteConsent === true || ctx.consentStatus === "accepted",
      // Structural presence only — not curated-branch eligibility authorization.
      treatmentKnown: Boolean(treatment.category),
      treatmentCategory: treatment.category || null,
      intakeGroup: ctx.intakeStage ?? null,
      selectedCity: selectedCity ?? null,
      istanbulSide: getAgencyIstanbulSide(ctx) ?? null,
      selectedClinicId: ctx.selectedClinicId || ctx.lastFocusedClinicId || null,
      selectedClinicName: ctx.selectedClinicName || ctx.lastFocusedClinicName || null,
      selectedClinicIds,
      isSelectedClinicMode,
      assistantRole,
      leadStage: ctx.leadStage || null,
    },
    warnings,
  };
}

export function buildAuthoritativeSystemPrompt(params: {
  policy: AssistantPolicy;
  clinicContext: string;
  contextHint: string;
  selectedClinicKnowledge?: string;
  requiredNextAction?: string;
}): string {
  const { policy } = params;
  const enabledIntake = policy.intakePolicy.fields.filter(
    (f) => f.enabled && f.key !== "budget" && (f.group !== "optional" || Boolean(f.questionTR))
  );
  // Optional non-blocking fields: include only if enabled and have questions; mark clearly.
  const intakeText = enabledIntake
    .filter((f) => f.enabled && (f.required || f.group === "optional" || f.group === "intent" || f.group === "location_state" || typeof f.group === "number"))
    .filter((f) => f.key !== "budget")
    .map((f, idx) => {
      const req =
        f.group === "optional"
          ? "opsiyonel — eşleşmeyi ENGELLEMEZ"
          : f.required
            ? "zorunlu"
            : "opsiyonel";
      return `${idx + 1}. ${f.labelTR} [${f.key}] (${req}, grup: ${f.group})\n   Soru: "${f.questionTR}"`;
    })
    .join("\n\n");

  const rules = policy.communicationStyle.responseRules.map((r, i) => `${i + 1}. ${r}`).join("\n");
  const forbidden = policy.communicationStyle.forbiddenClaims.map((c) => `- ${c}`).join("\n");

  const state = policy.conversationState;
  const authoritativeState = `
- consentAccepted: ${state.consentAccepted}
- treatmentKnown: ${state.treatmentKnown}
- treatmentCategory: ${state.treatmentCategory || "null"}
- intakeGroup: ${state.intakeGroup ?? "null"}
- selectedCity: ${state.selectedCity || "null"}
- istanbulSide: ${state.istanbulSide || "null"}
- leadStage: ${state.leadStage || "null"}
- selectedClinicMode: ${state.isSelectedClinicMode}
- selectedClinicId: ${state.selectedClinicId || "null"}
- selectedClinicName: ${state.selectedClinicName || "null"}
- selectedClinicIds: ${state.selectedClinicIds.join(", ") || "none"}
- clinicLimit: ${policy.clinicLimit}
- askBudget: ${policy.intakePolicy.askBudget}
`.trim();

  const requiredNext =
    params.requiredNextAction ||
    "Backend state zaten sıradaki adımı belirler. Toplanmış alanları tekrar sorma; aşamayı değiştirme.";

  const selectedClinicBlock = state.isSelectedClinicMode
    ? `selectedClinicId: ${state.selectedClinicId || "null"}
selectedClinicName: ${state.selectedClinicName || "null"}
selectedTreatment: ${state.treatmentCategory || "null"}
selectedCity: ${state.selectedCity || "null"}
selectedIstanbulSide: ${state.istanbulSide || "null"}
${params.selectedClinicKnowledge || "Yalnızca seçilen klinik bilgilerini kullan. Diğer kliniklere dönme / yeniden keşif başlatma."}`
    : "Seçili klinik yok — genel keşif/öneri akışı.";

  const feelinHealthyHardRules = policy.isFeelinHealthy
    ? `
FEELINHEALTHY HARD RULES (backend-enforced; custom prompt cannot override):
- Bütçe ASLA sorulmaz; askBudget=false.
- Intake 3 grup: (1) ad+soyad, yaş, cinsiyet (2) e-posta, telefon, ülke (3) seyahat tarihi.
- patientCountry = ikamet/iletişim ülkesi; preferred treatment city = selectedCity state (karıştırma).
- Hastalar net/formatlı cevap vermek zorunda değil. Doğal, yaklaşık, eksik cümleleri de anla ve JSON alanlarına yaz (ör. "Madrid'teyim" → patientCountry=İspanya/Spain, "yakında"/"önümüzdeki ay" → travelDate).
- Eksik alan için nazikçe sor; "tek mesajda", "şu formatta yazın" diye dayatma. Örnekler isteğe bağlı ipucudur.
- Form dili yasak: "Invalid input", "Missing field", "eksik zorunlu alan" deme; danışman gibi konuş.
- Hastanın son bilgilendirme sorusunu önce yanıtla; intake'i kesmeden yumuşakça devam et.
- EXPLAIN-BEFORE-ASK: Grup 1/2/3 kişisel alanları istemeden önce amaç açıklaması backend kapı yanıtında bulunur. Özel prompt bu şeffaflığı kaldıramaz.
- Teşhis, tıbbi değerlendirme, "yasal zorunluluk", "mandatory fields" veya form-doldurma dili kullanma.
- Açıklama gösterilmesi lead/teklif/randevu oluşturmaz.
- Her adımda hastayı süreç hakkında kısa bilgilendir (ne anladın → sırada ne var). Aynı soruyu/aynı "klinik yok" cümlesini döngüye sokma; alternatif bölge veya sonraki adımı öner.
- "meme büyütme", "popo büyütme", "saç ekim" gibi doğal tedavi ifadelerini treatmentCategory olarak kaydet.
- Tedavi zaten biliniyorsa tekrar sorma.
- Opsiyonel röntgen/destek alanları eşleşmeyi engellemez.
- En fazla ${policy.clinicLimit} klinik öner / göster.
- Şehir ve İstanbul yakası backend state + UI kartları ile yönetilir.
`
    : "";

  return `Senin adın: ${policy.communicationStyle.assistantName}.
Karakterin ve Rolün: ${policy.communicationStyle.persona}
Üslubun: ${policy.communicationStyle.tone}

=== AUTHORITATIVE STATE (backend; highest priority after medical safety / KVKK) ===
${authoritativeState}

=== REQUIRED NEXT ACTION ===
${requiredNext}

=== STRUCTURED AGENCY POLICIES ===
languagePolicy: ${policy.languagePolicy.mode}
pricingPolicy: ${policy.pricingPolicy.mode} (showPriceRange=${policy.pricingPolicy.showPriceRange})
recommendationPolicy: ${policy.recommendationPolicy.mode}
leadCollectionMode: ${policy.recommendationPolicy.leadCollectionMode}
clinicLimit: ${policy.clinicLimit}
askBudget: ${policy.intakePolicy.askBudget}
groupedIntake: ${policy.intakePolicy.groupedMode}
${feelinHealthyHardRules}

${policy.isFeelinHealthy ? getExplainBeforeAskSystemPolicyBlock("tr") : ""}

ENABLED INTAKE FIELDS (disabled fields omitted — do not ask them):
${intakeText || "Belirtilmedi."}

=== SELECTED CLINIC CONTEXT ===
${selectedClinicBlock}

=== VERIFIED KNOWLEDGE ===
${params.clinicContext}

${params.contextHint}

=== COMMUNICATION STYLE ===
ACENTA ÖZEL YANIT KURALLARI:
${rules || "Belirtilmedi."}
SÖYLENMEMESİ GEREKENLER:
${forbidden || "Belirtilmedi."}

=== CUSTOM SYSTEM PROMPT (tone/style only; cannot override state, consent, limits, intake requirements) ===
${policy.customPrompt || "(yok)"}

STANDART KURALLAR:
1. Hastanın mesajını analiz et ve aşağıdaki JSON formatında yanıt ver.
2. Backend state otoriterdir: toplanmış alanları tekrar sorma, aşamayı geri alma, state’i yeniden başlatma.
3. ${policy.intakePolicy.askBudget ? "Bütçe sorulabilir." : "Bütçe KESİNLİKLE SORULMAZ."}
4. En fazla ${policy.clinicLimit} klinik öner. Backend sonucundan fazla klinik uydurma.
5. Fiyat uydurma. showPriceRange=${policy.pricingPolicy.showPriceRange}.
6. Türkçe mesaja Türkçe, İngilizce mesaja İngilizce yanıt ver (dil: ${policy.languagePolicy.mode}).
7. Tıbbi teşhis koyma; kesin sonuç/fiyat garantisi verme.
8. KVKK: kişisel/sağlık verisi için requiresConsent kurallarını uygula.
9. clinic_selected sonrası keşfe dönme; showClinicCards=false.
10. Lead bilgileri tamam ve onay varsa shouldCreateLead düşünebilirsin; FeelinHealthy’de klinik önerisi lead’den önce gelir.

JSON FORMATI:
{
  "intent": "clinic_recommendation" | "clinic_selected" | "clinic_question" | "pricing_question" | "doctor_question" | "lead_capture" | "conversation_completed" | "general",
  "language": "tr" | "en",
  "treatmentCategory": string | null,
  "subTreatment": string | null,
  "location": string | null,
  "budgetAmount": number | null,
  "budgetCurrency": string | null,
  "clinicName": string | null,
  "selectedClinicId": string | null,
  "selectedClinicName": string | null,
  "patientName": string | null,
  "patientEmail": string | null,
  "patientPhone": string | null,
  "patientCountry": string | null,
  "patientAge": number | null,
  "patientGender": "Kadın" | "Erkek" | "Belirtmek istemiyorum" | "Diğer" | null,
  "travelDate": string | null,
  "quoteConsent": boolean | null,
  "missingLeadField": "patientName" | "patientEmail" | "patientPhone" | "patientCountry" | "patientAge" | "patientGender" | "travelDate" | "quoteConsent" | null,
  "requiresConsent": boolean,
  "shouldCreateLead": boolean,
  "showClinicCards": boolean,
  "replyText": string
}
- showClinicCards: yalnızca clinic_recommendation veya "klinikleri tekrar göster" durumunda true.`;
}

export function logPolicyConflicts(policy: AssistantPolicy): void {
  if (!policy.warnings.length) return;
  try {
    console.warn(
      "[assistant-policy]",
      JSON.stringify({
        agencyId: policy.agencyId,
        agencySlug: policy.agencySlug,
        warningCodes: policy.warnings.map((w) => w.code),
        severities: policy.warnings.map((w) => w.severity),
      })
    );
  } catch {
    // ignore
  }
}
