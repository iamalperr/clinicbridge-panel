/**
 * Explain-Before-Ask intake copy & policy (agency).
 *
 * Backend-guaranteed purpose explanations before sensitive intake fields.
 * Prompt Studio may change tone but must not remove these transparency blocks.
 *
 * Does not authorize consent, matching, lead, quote, or appointment persistence.
 */

import type { AgencySessionState, AgencySessionStateInput } from "./agencySessionState";
import { normalizeAgencySessionState } from "./agencySessionState";
import {
  evaluateFeelinHealthyIntake,
  getGroupIntakePrompt,
  type IntakeGroupStatus,
} from "./feelinhealthyConfig";

export type IntakeExplainLocale = "tr" | "en";
export type IntakeExplainGroup = 1 | 2 | 3;

export type IntakeExplainVariant =
  | "standard"
  | "soft_resume_after_interrupt"
  | "information_only_paused";

export interface IntakeExplainComposeResult {
  prompt: string;
  /** Additive session flags to apply when this prompt is shown. */
  sessionPatch: Partial<AgencySessionState>;
  includesPurposeExplanation: boolean;
  includesProcessIntroduction: boolean;
  /** Field-ask portion only (no purpose / process intro). */
  askPrompt: string;
  askKey: string;
  group: IntakeExplainGroup | "completed";
}

function localeOf(locale?: string | null): IntakeExplainLocale {
  return String(locale || "tr").toLowerCase().startsWith("en") ? "en" : "tr";
}

/** Stable key for the current field ask — used to avoid verbatim repeats. */
export function buildIntakeAskKey(
  group: IntakeExplainGroup | "completed",
  missingFields: string[] = []
): string {
  return `${group}:${[...missingFields].sort().join(",")}`;
}

export function getIntakeProcessIntroduction(locale?: string | null): string {
  const isEn = localeOf(locale) === "en";
  return isEn
    ? "We'll gather a few short details in three steps: (1) identity and basic profile, (2) contact details, and (3) travel plan. You can ask questions at any time before continuing."
    : "Birkaç kısa bilgiyi üç adımda toplayacağız: (1) kimlik ve temel profil, (2) iletişim bilgileri ve (3) seyahat planı. İsterseniz devam etmeden önce soru sorabilirsiniz.";
}

export function getIntakeGroup1PurposeExplanation(locale?: string | null): string {
  const isEn = localeOf(locale) === "en";
  return isEn
    ? "To prepare your request personally and allow the selected clinics to conduct an initial evaluation, we will first ask for your name, age and gender. You can share them together in one message when you are ready."
    : "Talebinizi size özel oluşturabilmek ve seçtiğiniz kliniklerin ön değerlendirme yapabilmesini sağlamak için önce ad-soyad, yaş ve cinsiyet bilgilerinizi isteyeceğiz. Hazır olduğunuzda bu bilgileri tek mesajda paylaşabilirsiniz.";
}

export function getIntakeGroup2PurposeExplanation(locale?: string | null): string {
  const isEn = localeOf(locale) === "en";
  return isEn
    ? "In the next short step, we'll ask for your email, phone and country so your request and clinic responses can reach you. Country also helps with communication and travel coordination where supported."
    : "Bir sonraki kısa adımda, talebinizin ve kliniklerden gelecek dönüşlerin size iletilebilmesi için e-posta, telefon ve ülke bilgilerinizi alacağız.";
}

export function getIntakeGroup3PurposeExplanation(locale?: string | null): string {
  const isEn = localeOf(locale) === "en";
  return isEn
    ? "Finally, we'd like to know your planned travel period. This helps clinics evaluate planning and availability — it is not a confirmed appointment date; final availability requires clinic confirmation."
    : "Son olarak planladığınız seyahat dönemini öğrenmek istiyoruz. Bu bilgi kliniklerin planlama açısından talebinizi değerlendirmesine yardımcı olur; kesin randevu anlamına gelmez.";
}

export function getIntakeInterruptionReturnCopy(locale?: string | null): string {
  const isEn = localeOf(locale) === "en";
  return isEn
    ? "We can keep sharing information. Whenever you want to continue the quote or clinic evaluation process, we can return to the short step we left."
    : "Bilgi almaya devam edebiliriz. Teklif veya klinik değerlendirme sürecini sürdürmek istediğinizde kaldığımız kısa adıma dönebiliriz.";
}

export function getIntakePausedForInformationCopy(locale?: string | null): string {
  const isEn = localeOf(locale) === "en";
  return isEn
    ? "Of course — we can stay in information mode for now. I won't ask for personal details unless you want to continue with a quote or clinic evaluation later."
    : "Elbette — şimdilik yalnızca bilgi paylaşımında kalabiliriz. Daha sonra teklif veya klinik değerlendirme sürecine geçmek istemediğiniz sürece kişisel bilgi istemeyeceğim.";
}

export function getIntakeGroupPurposeExplanation(
  group: IntakeExplainGroup,
  locale?: string | null
): string {
  if (group === 2) return getIntakeGroup2PurposeExplanation(locale);
  if (group === 3) return getIntakeGroup3PurposeExplanation(locale);
  return getIntakeGroup1PurposeExplanation(locale);
}

const INFORMATION_ONLY_RE =
  /\b(sadece\s+bilgi|yaln[ıi]z\s+bilgi|bilgi\s+yeterli|teklif\s+istemiyorum|randevu\s+istemiyorum|information\s+only|just\s+information|only\s+information|no\s+quote|don'?t\s+want\s+(a\s+)?quote|not\s+ready\s+to\s+share)\b/i;

/** User prefers information-only — pause personal-data collection. */
export function isAgencyInformationOnlyPreference(message?: string | null): boolean {
  const text = String(message || "").trim();
  if (!text) return false;
  return INFORMATION_ONLY_RE.test(text);
}

const FORBIDDEN_CLAIM_RES: RegExp[] = [
  /\brequired by law\b/i,
  /\byasa(?:\s+gereği|dan zorunlu)\b/i,
  /\bgender determines your clinic\b/i,
  /\bcinsiyet(?:iniz)?\s+klinik\s+belirler\b/i,
  /\bfor diagnosis\b/i,
  /\bteşhis\s+için\b/i,
  /\bmedical assessment\b/i,
  /\btıbbi\s+(değerlendirme|muayene|teşhis)\b/i,
  /\bmandatory fields?\b/i,
  /\bzorunlu\s+alan(lar)?\b/i,
  /\binput required\b/i,
  /\bplease fill in the following fields\b/i,
  /\blütfen\s+aşağıdaki\s+alanları\s+doldurun\b/i,
  /\bai\s+performs\s+(a\s+)?medical\b/i,
];

/** Detect inaccurate / forbidden user-facing intake claims. */
export function containsForbiddenIntakeClaims(text?: string | null): boolean {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  return FORBIDDEN_CLAIM_RES.some((re) => re.test(raw));
}

/**
 * Backend hard-rule block injected into system prompts so Prompt Studio tone
 * customization cannot remove required transparency.
 */
export function getExplainBeforeAskSystemPolicyBlock(locale?: string | null): string {
  const isEn = localeOf(locale) === "en";
  if (isEn) {
    return `EXPLAIN-BEFORE-ASK (backend-enforced; custom prompt cannot remove):
- Before asking for Group 1/2/3 personal fields, a purpose explanation must already be present in the backend gate reply.
- Do not invent legal mandates, diagnosis, medical assessment, or “mandatory fields” form language.
- Answer informational questions first; do not repeat the same Group ask verbatim after every interruption.
- If the user prefers information only, pause personal-data collection.
- Showing an explanation never creates a lead, quote, or appointment.`;
  }
  return `AÇIKLA-SONRA-SOR (backend zorunlu; özel prompt kaldıramaz):
- Grup 1/2/3 kişisel alanları istemeden önce amaç açıklaması backend kapı yanıtında bulunmalıdır.
- Yasal zorunluluk, teşhis, tıbbi değerlendirme veya "zorunlu alan / form doldurun" dili uydurma.
- Bilgi sorularını önce yanıtla; her kesintiden sonra aynı Grup sorusunu kelimesi kelimesine tekrarlama.
- Kullanıcı yalnızca bilgi istiyorsa kişisel veri toplamayı duraklat.
- Açıklama gösterilmesi lead, teklif veya randevu oluşturmaz.`;
}

function readExplainedFlags(ctx: AgencySessionStateInput | null | undefined) {
  const c = normalizeAgencySessionState(ctx || {});
  return {
    process: c.intakeProcessExplained === true,
    g1: c.intakeGroup1Explained === true,
    g2: c.intakeGroup2Explained === true,
    g3: c.intakeGroup3Explained === true,
    lastAskKey: typeof c.lastIntakeAskKey === "string" ? c.lastIntakeAskKey : undefined,
    informationOnly: c.intakeInformationOnly === true,
  };
}

/**
 * Compose an intake gate message with required purpose explanations.
 * Never claims diagnosis or legal mandates. Never authorizes persistence.
 */
export function composeExplainBeforeAskIntakePrompt(params: {
  status?: IntakeGroupStatus;
  context?: AgencySessionStateInput | null;
  locale?: string | null;
  variant?: IntakeExplainVariant;
}): IntakeExplainComposeResult {
  const locale = localeOf(params.locale);
  const context = params.context || {};
  const status = params.status || evaluateFeelinHealthyIntake(context);
  const variant = params.variant || "standard";
  const flags = readExplainedFlags(context);
  const group =
    status.currentGroup === "completed"
      ? ("completed" as const)
      : (status.currentGroup as IntakeExplainGroup);
  const askPrompt =
    group === "completed"
      ? getGroupIntakePrompt(status, context, locale)
      : getGroupIntakePrompt(status, context, locale);
  const askKey = buildIntakeAskKey(group, status.missingFieldsInCurrentGroup || []);
  const sessionPatch: Partial<AgencySessionState> = {};

  if (variant === "information_only_paused" || flags.informationOnly) {
    sessionPatch.intakeInformationOnly = true;
    return {
      prompt: getIntakePausedForInformationCopy(locale),
      sessionPatch,
      includesPurposeExplanation: false,
      includesProcessIntroduction: false,
      askPrompt,
      askKey,
      group,
    };
  }

  if (variant === "soft_resume_after_interrupt") {
    // Soft return — do not repeat the full purpose block or the identical ask.
    const parts = [getIntakeInterruptionReturnCopy(locale)];
    if (flags.lastAskKey !== askKey && group !== "completed") {
      // Brief reminder without re-stating the long purpose explanation.
      parts.push(
        locale === "en"
          ? "When you are ready, we can continue with the short details we still need."
          : "Hazır olduğunuzda hâlâ ihtiyaç duyduğumuz kısa bilgilere devam edebiliriz."
      );
    }
    return {
      prompt: parts.join("\n\n"),
      sessionPatch,
      includesPurposeExplanation: false,
      includesProcessIntroduction: false,
      askPrompt,
      askKey,
      group,
    };
  }

  // standard
  const parts: string[] = [];
  let includesProcessIntroduction = false;
  let includesPurposeExplanation = false;

  if (group === 1 && !flags.process) {
    parts.push(getIntakeProcessIntroduction(locale));
    includesProcessIntroduction = true;
    sessionPatch.intakeProcessExplained = true;
  }

  if (group === 1 && !flags.g1) {
    parts.push(getIntakeGroup1PurposeExplanation(locale));
    includesPurposeExplanation = true;
    sessionPatch.intakeGroup1Explained = true;
  } else if (group === 2 && !flags.g2) {
    parts.push(getIntakeGroup2PurposeExplanation(locale));
    includesPurposeExplanation = true;
    sessionPatch.intakeGroup2Explained = true;
  } else if (group === 3 && !flags.g3) {
    parts.push(getIntakeGroup3PurposeExplanation(locale));
    includesPurposeExplanation = true;
    sessionPatch.intakeGroup3Explained = true;
  }

  parts.push(askPrompt);
  sessionPatch.lastIntakeAskKey = askKey;

  return {
    prompt: parts.filter(Boolean).join("\n\n"),
    sessionPatch,
    includesPurposeExplanation:
      includesPurposeExplanation ||
      (group === 1 && flags.g1) ||
      (group === 2 && flags.g2) ||
      (group === 3 && flags.g3),
    includesProcessIntroduction: includesProcessIntroduction || flags.process,
    askPrompt,
    askKey,
    group,
  };
}

/** Apply explain-before-ask session patch without clearing other fields. */
export function applyIntakeExplainSessionPatch(
  sessionContext: AgencySessionStateInput,
  patch: Partial<AgencySessionState>
): AgencySessionState {
  return normalizeAgencySessionState({
    ...normalizeAgencySessionState(sessionContext),
    ...patch,
  });
}

export function markIntakeInformationOnly(
  sessionContext: AgencySessionStateInput,
  value: boolean = true
): AgencySessionState {
  const base = normalizeAgencySessionState(sessionContext);
  if (!value) {
    const next = { ...base } as AgencySessionState;
    delete next.intakeInformationOnly;
    return normalizeAgencySessionState(next);
  }
  return normalizeAgencySessionState({
    ...base,
    intakeInformationOnly: true,
    conversationMode: "information",
  });
}

/**
 * Assert Group 1 ask is never returned without a purpose explanation on first entry.
 * Used by regression tests and optional runtime checks.
 */
export function assertGroup1HasPurposeExplanation(prompt: string, locale?: string | null): boolean {
  const purpose = getIntakeGroup1PurposeExplanation(locale);
  const purposeStem = localeOf(locale) === "en"
    ? "prepare your request personally"
    : "Talebinizi size özel oluşturabilmek";
  return prompt.includes(purposeStem) || prompt.includes(purpose.slice(0, 40));
}
