import { getAdminDb } from "@/lib/firebase-admin";
import {
  normalizeAgencySessionState,
  serializeAgencySessionState,
  type AgencySessionState,
  type AgencySessionStateInputMaybe,
} from "@/lib/agency/agencySessionState";

/**
 * Persist a derived conversation summary document.
 * Full sessionContext is round-tripped via the client; this writes selected
 * fields only. Input is normalized/serialized for structural safety — not for
 * authorization (consent/lead/quote still require backend verification).
 */
export async function saveConversationStateAsync(
  agencyId: string,
  ctxInput: AgencySessionStateInputMaybe,
  history: unknown[],
  replyText: string,
  replyType: string
) {
  const ctx = serializeAgencySessionState(normalizeAgencySessionState(ctxInput));
  if (!ctx.sessionId || !agencyId) return;
  const adminDb = getAdminDb();
  if (!adminDb) return;

  try {
    let status = "active";
    if (ctx.leadStage === "completed") status = "quote_requested";
    else if (ctx.leadStage === "clinic_selected") status = "clinic_recommended";
    else if (ctx.leadStage === "recommendation") status = "qualified";

    let aiCompletionRate = 10;
    if (ctx.leadStage === "discovery") aiCompletionRate = 30;
    if (ctx.leadStage === "recommendation") aiCompletionRate = 60;
    if (ctx.leadStage === "clinic_selected") aiCompletionRate = 80;
    if (ctx.leadStage === "collecting_email" || ctx.leadStage === "collecting_consent") aiCompletionRate = 90;
    if (ctx.leadStage === "quote_request_created" || ctx.leadStage === "completed") aiCompletionRate = 100;

    const fullHistory = [...(history || [])] as Array<Record<string, unknown>>;
    if (replyText) {
      fullHistory.push({ role: "assistant", content: replyText, type: replyType });
    }

    await adminDb.collection("agencies").doc(agencyId).collection("conversations").doc(String(ctx.sessionId)).set({
      agencyId,
      patientName: ctx.patientName || "",
      language: ctx.language || "tr",
      treatmentCategory: ctx.lastTreatmentCategory || "",
      subTreatment: ctx.lastSubTreatment || "",
      location: ctx.lastLocation || "",
      status,
      leadStage: ctx.leadStage || "discovery",
      messagesCount: fullHistory.length,
      aiCompletionRate,
      leadId: ctx.leadId || "",
      selectedClinicId: ctx.selectedClinicId || ctx.lastFocusedClinicId || "",
      recommendedClinicIds: ctx.lastRecommendedClinicIds || [],
      history: fullHistory,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
      createdAt: ctx.createdAt || new Date()
    }, { merge: true });
  } catch (err) {
    console.error("[matching-chat] Failed to save conversation state:", err);
  }
}

export type { AgencySessionState };
