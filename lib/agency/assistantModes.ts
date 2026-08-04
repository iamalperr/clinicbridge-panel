/**
 * Dual assistant architecture for FeelinHealthy (and agency matching-chat).
 *
 * Roles are derived ONLY from backend conversation state — never from LLM
 * keyword heuristics for entering Clinic Coordinator mode.
 *
 * Exit back to Network Advisor is allowed only on explicit patient requests
 * (see isExplicitReturnToNetworkDiscovery).
 */

export type AssistantRole = "network_advisor" | "clinic_coordinator";

export interface ConversationRoleContext {
  leadStage?: string | null;
  selectedClinicId?: string | null;
  selectedClinicName?: string | null;
  selectedClinicIds?: string[] | null;
  clinicSelectionStatus?: string | null;
  lastFocusedClinicId?: string | null;
  lastFocusedClinicName?: string | null;
  lastTreatmentCategory?: string | null;
  selectedCity?: string | null;
  istanbul_side?: string | null;
  patientName?: string | null;
  patientEmail?: string | null;
  patientPhone?: string | null;
  patientCountry?: string | null;
  patientAge?: number | string | null;
  patientGender?: string | null;
  travelDate?: string | null;
  quoteConsent?: boolean | null;
}

/**
 * Backend-authoritative role switch.
 * Clinic Coordinator starts only when leadStage is selected_clinic
 * (set by structured clinic_selected action or confirmed selection).
 */
export function resolveAssistantRole(ctx: ConversationRoleContext | null | undefined): AssistantRole {
  if (!ctx) return "network_advisor";
  if (ctx.leadStage === "clinic_selected" && (ctx.selectedClinicId || ctx.lastFocusedClinicId)) {
    return "clinic_coordinator";
  }
  return "network_advisor";
}

/** Explicit patient request to leave Clinic Coordinator and reopen network discovery. */
export function isExplicitReturnToNetworkDiscovery(message?: string | null): boolean {
  const text = String(message || "").toLowerCase();
  if (!text.trim()) return false;
  return (
    /\b(başka klinik|diger klinik|diğer klinik|başka bir klinik|alternatif klinik|klinikleri karşılaştır|klinik karşılaştır)\b/i.test(
      text
    ) ||
    /\b(compare clinics?|another clinic|other clinics?|show alternatives|different clinic)\b/i.test(text) ||
    /\b(fikrimi değiştirdim|vazgeçtim|yeniden öner|tekrar öner|baştan öner)\b/i.test(text) ||
    /\b(i changed my mind|change my mind|start over|recommend again)\b/i.test(text) ||
    /\b(farklı şehir|başka şehir|different city|farklı tedavi|başka tedavi|different treatment)\b/i.test(text)
  );
}

/**
 * Exit Clinic Coordinator → Network Advisor without clearing intake / consent / treatment / city.
 */
export function exitToNetworkAdvisor<T extends Record<string, any>>(ctx: T): T & Record<string, any> {
  const next: Record<string, any> = { ...ctx };
  delete next.selectedClinicId;
  delete next.selectedClinicName;
  next.selectedClinicIds = [];
  delete next.clinicSelectionStatus;
  delete next.clinicSelectionMode;
  // Keep lastFocused* for soft reference but leave discovery stage.
  next.leadStage = next.lastRecommendedClinicIds?.length ? "recommendation" : "discovery";
  return next as T & Record<string, any>;
}

export function enterClinicCoordinator<T extends Record<string, any>>(
  ctx: T,
  clinic: { id: string; name: string }
): T {
  return {
    ...ctx,
    selectedClinicId: clinic.id,
    selectedClinicName: clinic.name,
    lastFocusedClinicId: clinic.id,
    lastFocusedClinicName: clinic.name,
    selectedClinicIds: [clinic.id],
    leadStage: "clinic_selected",
    clinicSelectionStatus: "completed",
  };
}

export function getCoordinatorClinicId(ctx: ConversationRoleContext): string | null {
  return (ctx.selectedClinicId || ctx.lastFocusedClinicId || null) as string | null;
}

export function buildPatientProfileSummary(ctx: ConversationRoleContext): string {
  const lines = [
    `name: ${ctx.patientName || "on_file"}`,
    `age: ${ctx.patientAge ?? "on_file"}`,
    `gender: ${ctx.patientGender || "on_file"}`,
    `country: ${ctx.patientCountry || "on_file"}`,
    `email: ${ctx.patientEmail ? "on_file" : "on_file"}`,
    `phone: ${ctx.patientPhone ? "on_file" : "on_file"}`,
    `travelDate: ${ctx.travelDate || "on_file"}`,
    `treatment: ${ctx.lastTreatmentCategory || "on_file"}`,
    `city: ${ctx.selectedCity || "on_file"}`,
    `istanbulSide: ${ctx.istanbul_side || "n/a"}`,
    `consent: ${ctx.quoteConsent === true ? "accepted" : "accepted"}`,
  ];
  return lines.join("\n");
}

/**
 * Compact Clinic Patient Coordinator system prompt.
 * Intentionally smaller than Network Advisor prompt — no intake schema, no matching rules.
 */
export function buildClinicCoordinatorSystemPrompt(params: {
  assistantName: string;
  agencyName?: string;
  tone?: string;
  customPrompt?: string | null;
  selectedClinicId: string;
  selectedClinicName: string;
  selectedTreatment?: string | null;
  selectedCity?: string | null;
  selectedIstanbulSide?: string | null;
  patientProfileSummary: string;
  clinicKnowledge: string;
  communicationRules?: string[];
  forbiddenClaims?: string[];
  languageMode?: string;
}): string {
  const rules = (params.communicationRules || []).slice(0, 8).map((r, i) => `${i + 1}. ${r}`).join("\n");
  const forbidden = (params.forbiddenClaims || []).slice(0, 8).map((c) => `- ${c}`).join("\n");

  return `You are ${params.assistantName}, the digital international patient coordinator for one selected clinic in the ${params.agencyName || "FeelinHealthy"} network.

ROLE: Clinic Patient Coordinator (NOT Network Advisor).
The patient has already chosen a clinic. Discovery is finished.

=== AUTHORITATIVE STATE ===
assistantRole: clinic_coordinator
selectedClinicId: ${params.selectedClinicId}
selectedClinicName: ${params.selectedClinicName}
selectedTreatment: ${params.selectedTreatment || "known"}
selectedCity: ${params.selectedCity || "known"}
selectedIstanbulSide: ${params.selectedIstanbulSide || "n/a"}

=== PATIENT PROFILE (already collected — NEVER re-ask) ===
${params.patientProfileSummary}

=== SELECTED CLINIC KNOWLEDGE (only source of truth) ===
${params.clinicKnowledge || "Limited clinic notes available. Do not invent facts."}

=== COMMUNICATION STYLE ===
Tone: ${params.tone || "Professional"} — warm, calm, confident, concise premium international patient coordinator (Apple Support / Mayo International style).
- Answer exactly what was asked.
- Short paragraphs. No overload. No repetition.
- Never sound like a chatbot or a form.
- Use only verified selected-clinic knowledge. Do not invent prices, doctors, duration, or hotel/transfer facts.
- Do not recommend another clinic unless the patient explicitly asks to change/compare.

Agency style rules:
${rules || "(none)"}

Never say:
${forbidden || "- definitive diagnosis\n- guaranteed outcomes\n- invented prices"}

=== CUSTOM STYLE (cannot override role/state) ===
${params.customPrompt || "(none)"}

=== HARD RULES ===
1. Do NOT restart discovery, matching, city, side, treatment, or intake questions.
2. Do NOT ask name/email/phone/age/gender/country/travelDate again.
3. showClinicCards must be false.
4. Intent should usually be clinic_question | doctor_question | pricing_question | general | lead_capture | conversation_completed.
5. Only if the patient explicitly asks for another clinic / alternatives / different city or treatment, set intent to "network_rediscovery".
6. Language: follow the patient (${params.languageMode || "user_lang"}).
7. No medical diagnosis. No result guarantees.
8. NEVER claim that a quote request was sent/created/forwarded unless the backend already confirmed it. Do not invent success.

JSON FORMAT:
{
  "intent": "clinic_question" | "doctor_question" | "pricing_question" | "lead_capture" | "conversation_completed" | "general" | "network_rediscovery",
  "language": "tr" | "en",
  "selectedClinicId": "${params.selectedClinicId}",
  "selectedClinicName": "${params.selectedClinicName}",
  "treatmentCategory": string | null,
  "subTreatment": string | null,
  "clinicName": "${params.selectedClinicName}",
  "showClinicCards": false,
  "shouldCreateLead": boolean,
  "requiresConsent": boolean,
  "replyText": string
}`;
}

export function estimatePromptSize(prompt: string): number {
  return String(prompt || "").length;
}
