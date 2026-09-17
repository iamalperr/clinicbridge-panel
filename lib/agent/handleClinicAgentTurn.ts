/**
 * Single-clinic Agent Core turn handler (channel-agnostic).
 * Web Chat Adapter and future Voice Adapter call this with normalized text turns.
 *
 * Phase 1: extracted from app/api/public/chat/route.ts without intentional behavior changes.
 */
import { trackableAIRequest } from "@/lib/services/aiGateway";
import { resolveEffectiveAITemperature } from "@/lib/ai/temperaturePolicy";
import { getAdminDb } from "@/lib/firebase-admin";
import { AppointmentDateValidator, ClinicWorkingHoursResolver } from "@/lib/skills";
import {
  resolveClinicTimeZone,
  validateAppointmentDateTime,
  evaluateRawAppointmentTimeZoneAmbiguity,
  type AppointmentDateTimeValidationResult,
} from "@/lib/appointment/appointmentDateTimePolicy";
import {
  getDocs,
  collection, query, where,
  doc, getDoc,
} from "firebase/firestore";
import { normalizeTurkishPhone } from "@/lib/phoneUtils";
import { resolveContactNumber } from "@/lib/utils/contact-resolver";
import {
  IntentRouter,
  SlotExtractor,
  ConversationStateEngine,
  PendingActionManager,
  formatContactResponse,
  formatLiveSupportHandoff,
  buildAppointmentReviewMessage,
  evaluateAppointmentCollectionGate,
  resolveConversationLocaleWithMeta,
  languageResolutionLogFields,
  applyConfirmationAmendment,
  applyAppointmentSchedulingAmendment,
  resolveAppointmentTreatmentCarryForward,
  type AppointmentDraftLike,
} from "@/lib/conversation";
import {
  applyDoctorPreferenceToDraft,
  type ClinicDoctorMatchInput,
} from "@/lib/appointment/requestedDoctorPreference";
import { RequestTimer } from "@/lib/performance/requestTimer";
import {
  getCachedClinicRuntime,
  setCachedClinicRuntime,
} from "@/lib/performance/clinicRuntimeCache";
import { stripUndefinedDeep } from "@/lib/firestore/stripUndefined";
import { toAIUsageChannel } from "./channel";
import { isConfirmation, normalizeConfirmationInput } from "./confirmationDetect";
import {
  safeMergeDraft,
  isAppointmentDraftComplete,
  mergeAppointmentDraftSources,
} from "./draft";
import { extractAppointmentFromHistory, parseTimeText } from "./appointmentParse";
import { saveAppointmentState, respondWithVisibleReply } from "./persistence";
import { fetchClinicDoctorMatchInputs, getClientDb } from "./clinicRuntime";
import type {
  AgentTurnInput,
  AgentTurnResult,
  AppointmentData,
  AppointmentState,
} from "./types";

export type { AppointmentData, AppointmentState, AgentTurnInput, AgentTurnResult };

export interface HandleClinicAgentTurnParams {
  input: AgentTurnInput;
  /** Injected Firestore admin; null falls back to client reads where historically allowed. */
  adminDb: any;
  perf: RequestTimer;
  debugLog: string[];
  startTime: number;
}

/**
 * Run one normalized text turn for a single clinic.
 * Prefers persisted conversationLogs appointmentState/draft/locale as business truth;
 * still accepts history + pendingAppointmentData for Web Widget backward compatibility.
 */
export async function handleClinicAgentTurn(
  params: HandleClinicAgentTurnParams
): Promise<AgentTurnResult> {
  const { input, adminDb, perf, debugLog, startTime } = params;
  const clinicId = input.clinicId;
  const message = input.text;
  const language = input.locale;
  const history = (input.history ?? []) as Array<{ role: string; content: string }>;
  const convId = input.conversationId;
  const pendingAppointmentData = input.pendingAppointmentData as
    | Partial<AppointmentData>
    | undefined;
  const widgetId = input.widgetId;
  const channel = input.channel;
  const sourceDomain = input.sourceDomain || input.originUrl || "unknown";

    /* ── DB for reads ──────────────────────────────────────────────────── */
    const clientDb = adminDb ? null : getClientDb();
    debugLog.push(`db=admin:${!!adminDb} client:${!!clientDb}`);

    let clinicName    = "Klinik";
    let promptSettings: any = null;
    let trainingDocs: Array<{ id: string; title: string; content: string; embeddingChunks?: any[] }> = [];
    let clinicWhatsapp = "";
    let clinicTelegram = "";
    let clinicLanguage = "tr";
    let clinicData: any = null;

    let isAgencyClinic = false;
    let agencyIdForClinic: string | null = null;
    let actualClinicId = clinicId; // Store the real document ID if it differs from the slug

    if (adminDb) {
      perf.start("clinic_config_load");
      const cachedRuntime = getCachedClinicRuntime(clinicId);
      if (cachedRuntime) {
        clinicData = cachedRuntime.clinicData;
        clinicName = cachedRuntime.clinicName;
        clinicWhatsapp = cachedRuntime.clinicWhatsapp;
        clinicTelegram = cachedRuntime.clinicTelegram;
        clinicLanguage = cachedRuntime.clinicLanguage;
        promptSettings = cachedRuntime.promptSettings;
        trainingDocs = cachedRuntime.trainingDocs;
        debugLog.push(`[admin-cache] clinic="${clinicName}" docs=${trainingDocs.length}`);
        perf.end("clinic_config_load", {
          trainingDocCount: trainingDocs.length,
          cacheHit: true,
        });
      } else {
      const [clinicSnap, promptSnap, materialsSnap] = await Promise.all([
        adminDb.collection("clinics").doc(clinicId).get(),
        adminDb.collection("promptSettings").doc(clinicId).get(),
        adminDb.collection("trainingMaterials").where("clinicId", "==", clinicId).limit(250).get(),
      ]);
      if (clinicSnap.exists) {
        const cData = clinicSnap.data()!;
        clinicData      = cData;
        clinicName      = cData.name          ?? "Klinik";
        clinicWhatsapp  = cData.whatsappNumber  ?? "";
        clinicTelegram  = cData.telegramUsername ?? "";
        clinicLanguage  = cData.language         ?? "tr";
        
        if (promptSnap.exists) promptSettings = promptSnap.data();
        trainingDocs = materialsSnap.docs.map((d: any) => ({ 
          id: d.id, 
          title: d.data().title ?? "", 
          content: d.data().content ?? "",
          embeddingChunks: d.data().embeddingChunks || []
        }));
        setCachedClinicRuntime(clinicId, {
          clinicData,
          clinicName,
          clinicWhatsapp,
          clinicTelegram,
          clinicLanguage,
          promptSettings,
          trainingDocs,
        });
        debugLog.push(`[admin] clinic="${clinicName}" docs=${trainingDocs.length}`);
      } else {
        // Fallback for Agency Clinics
        const agenciesSnap = await adminDb.collection("agencies").get();
        for (const agency of agenciesSnap.docs) {
          let aClinicSnap: any = await adminDb.collection("agencies").doc(agency.id).collection("clinics").doc(clinicId).get();
          
          if (!aClinicSnap.exists) {
            const aClinicsQuery = await adminDb.collection("agencies").doc(agency.id).collection("clinics").where("clinicSlug", "==", clinicId).limit(1).get();
            if (!aClinicsQuery.empty) {
              aClinicSnap = aClinicsQuery.docs[0];
            }
          }

          if (aClinicSnap.exists) {
             const aData = aClinicSnap.data()!;
             agencyIdForClinic = agency.id;
             isAgencyClinic = true;
             
             // Update actualClinicId to the actual document ID for subsequent queries
             actualClinicId = aClinicSnap.id;
             
             clinicData = aData;
             clinicName = aData.clinicName || aData.name || "Klinik";
             clinicWhatsapp = aData.whatsapp || aData.whatsappNumber || "";
             clinicTelegram = aData.telegram || aData.telegramUsername || "";
             clinicLanguage = aData.language || "tr";
             
             if (aData.aiQuoteSettings?.prompt) {
                 promptSettings = { basePrompt: aData.aiQuoteSettings.prompt };
             }
             
             const aMaterialsSnap = await adminDb.collection("agencies").doc(agency.id).collection("clinics").doc(actualClinicId).collection("knowledgeBase").where("isActive", "==", true).get();
             trainingDocs = aMaterialsSnap.docs.map((d: any) => ({
               id: d.id,
               title: d.data().title ?? "",
               content: d.data().content ?? "",
               embeddingChunks: d.data().embeddingChunks || []
             }));
             debugLog.push(`[admin-agency] clinic="${clinicName}" docs=${trainingDocs.length}`);
             break;
          }
        }
      }
      if (clinicData && !isAgencyClinic) {
        // cache already set above for top-level clinics
      }
      perf.end("clinic_config_load", {
        trainingDocCount: trainingDocs.length,
        isAgencyClinic,
        cacheHit: false,
      });
      }
    } else if (clientDb) {
      perf.start("clinic_config_load");
      const [clinicSnap, promptSnap] = await Promise.all([
        getDoc(doc(clientDb, "clinics", clinicId)),
        getDoc(doc(clientDb, "promptSettings", clinicId)),
      ]);
      if (clinicSnap.exists()) {
        const cData = clinicSnap.data()!;
        clinicData      = cData;
        clinicName      = cData.name          ?? "Klinik";
        clinicWhatsapp  = cData.whatsappNumber  ?? "";
        clinicTelegram  = cData.telegramUsername ?? "";
        clinicLanguage  = cData.language         ?? "tr";
        
        if (promptSnap.exists()) promptSettings = promptSnap.data();
        const materialsSnap = await getDocs(query(collection(clientDb, "trainingMaterials"), where("clinicId", "==", clinicId)));
        trainingDocs = materialsSnap.docs.map((d: any) => ({ 
          id: d.id, 
          title: d.data().title ?? "", 
          content: d.data().content ?? "",
          embeddingChunks: d.data().embeddingChunks || []
        }));
        debugLog.push(`[client] clinic="${clinicName}" docs=${trainingDocs.length}`);
      }
      perf.end("clinic_config_load", {
        trainingDocCount: trainingDocs.length,
        cacheHit: false,
      });
    }
    
    if (!clinicData) {
      console.error(`[chat API] FAIL LOUDLY: Clinic not found for clinicId=${clinicId}. Preventing generic fallback.`);
      return {
        replyText: "",
        conversationId: convId,
        payload: {
          error: "Klinik veya asistan yapılandırması bulunamadı. Lütfen clinicId değerini kontrol edin."
        },
        httpStatus: 404,
      };
    }

    // Soft initial language for early contact resolution; authoritative locale
    // is computed after conversation state is loaded (see conversationLocale).
    let activeLang = (typeof language === "string" && language.trim())
      ? language.trim().toLowerCase().slice(0, 2)
      : "tr";
    clinicWhatsapp = resolveContactNumber(clinicData, activeLang, trainingDocs);

    const messageId = (input.context as any)?.messageId || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const msgLower = message.toLowerCase().trim();

    /* ====================================================================
       0. APPOINTMENT MAINTENANCE BLOCKER (set to true to disable appointments)
       ==================================================================== */
    const APPOINTMENT_SYSTEM_MAINTENANCE = false;

    /* ====================================================================
       1. STRICT CONFIRMATION INTERCEPTOR (BYPASSES ALL NORMAL CHAT LOGIC)
       ==================================================================== */
    // ── INSTRUMENTATION LOG 1 ──
    const activeTraceId = input.traceId || Math.random().toString(36).substring(7);

    // ── AŞAMA 3: POZİTİF VE NEGATİF ONAY ALGILAMASINI SAĞLAMLAŞTIR ──
    const negativeConfirmationRegex = /^(hayır|hayir|yanlış|yanlis|değiştirmek istiyorum|emin değilim|bir dakika|tarih yanlış|saat yanlış|telefon yanlış|no|incorrect|not yet|i want to change it)/i;
    const negativeConfirmationDetected = negativeConfirmationRegex.test(message.trim());

    const isConfirm = isConfirmation(message);
    const positiveConfirmationWords = [
      "evet", "evet onaylıyorum", "evet onayliyorum", "onaylıyorum", "onayliyorum",
      "doğru", "dogru", "bilgiler doğru", "bilgiler dogru", "iletebilirsiniz",
      "olur", "tamam", "uygun", "uygundur", "kabul ediyorum", "gönder", "gonder",
      "yes", "yes, i confirm", "confirmed", "correct", "the information is correct",
      "you may proceed", "please proceed",
    ];
    
    let positiveConfirmationDetected = false;
    if (!negativeConfirmationDetected) {
       const normalizedConfirm = normalizeConfirmationInput(message);
       positiveConfirmationDetected = isConfirm || 
                                      positiveConfirmationWords.some(w => normalizedConfirm === w || normalizedConfirm.startsWith(w + " ")) || 
                                      normalizedConfirm.includes("onaylıyorum") ||
                                      normalizedConfirm.includes("onayliyorum") ||
                                      msgLower.startsWith("evet") || 
                                      msgLower.startsWith("yes");
    }

    console.log(JSON.stringify({ checkpoint: "APPT_01_CONFIRMATION_REQUEST_RECEIVED", traceId: activeTraceId, conversationId: convId, clinicId: actualClinicId, message: msgLower, positiveConfirmationDetected, negativeConfirmationDetected, timestamp: new Date().toISOString() }));

    let loadedState = "IDLE";
    let loadedDraft: any = {};
    let loadedPendingAction: any = null;
    let loadedAppointmentId: string | null = null;
    let loadedIsAppointmentCreated: boolean = false;
    let loadedConversationLocale: string | null = null;
    let loadedAppointmentVersion = 0;
    let loadedProcessedMessageIds: string[] = [];
    let loadedConversationLogData: any = null;

    if (adminDb && convId) {
        try {
            perf.start("conversation_state_load");
            const statePath = `clinics/${actualClinicId}/conversationLogs/${convId}`;
            const contextSnap = await adminDb.collection("clinics").doc(actualClinicId).collection("conversationLogs").doc(convId).get();
            const docExists = contextSnap.exists;
            const rawState = docExists ? contextSnap.data()?.appointmentState : undefined;
            const rawDraftKeys = docExists && contextSnap.data()?.appointmentDraft ? Object.keys(contextSnap.data()!.appointmentDraft) : [];
            console.log(`[STATE_LOAD_DEBUG] path=${statePath} exists=${docExists} rawState=${rawState} rawDraftKeys=${JSON.stringify(rawDraftKeys)} widgetClinicId=${clinicId} resolvedClinicId=${actualClinicId}`);
            if (docExists) {
                const lData = contextSnap.data();
                loadedConversationLogData = lData || null;
                if (lData?.appointmentState) loadedState = lData.appointmentState;
                if (lData?.appointmentDraft) loadedDraft = lData.appointmentDraft;
                if (lData?.pendingAction) loadedPendingAction = lData.pendingAction;
                if (lData?.appointmentId) loadedAppointmentId = lData.appointmentId;
                if (lData?.isAppointmentCreated) loadedIsAppointmentCreated = lData.isAppointmentCreated;
                if (lData?.conversationLocale || lData?.detectedLanguage || lData?.language) {
                  loadedConversationLocale = lData.conversationLocale || lData.detectedLanguage || lData.language;
                }
                if (typeof lData?.appointmentVersion === "number") loadedAppointmentVersion = lData.appointmentVersion;
                if (Array.isArray(lData?.processedMessageIds)) loadedProcessedMessageIds = lData.processedMessageIds;
            }
            perf.end("conversation_state_load", { exists: docExists, appointmentState: rawState || "IDLE" });
        } catch (e: any) {
            perf.end("conversation_state_load", { error: true });
            console.error("[chat API] Error loading strict context:", e.message);
        }
    }

    // Resolve conversation locale following guarded priority (message language
    // beats widget browser language; explicit switches still win).
    perf.start("locale_resolve");
    const localeResolution = resolveConversationLocaleWithMeta({
      requestLanguage: language,
      persistedLocale: loadedConversationLocale,
      currentMessage: message,
      history,
      clinicDefaultLocale: clinicLanguage
    });
    const conversationLocale = localeResolution.locale;
    activeLang = conversationLocale;
    clinicWhatsapp = resolveContactNumber(clinicData, activeLang, trainingDocs);
    perf.end("locale_resolve", { locale: conversationLocale, reason: localeResolution.reason });

    /** Shared persistence context for every visible assistant reply on this request. */
    const basePersist = (
      extra: Partial<Parameters<typeof respondWithVisibleReply>[1]> = {}
    ): Parameters<typeof respondWithVisibleReply>[1] => ({
      clinicId: actualClinicId,
      convId,
      userMessage: message,
      history,
      widgetId: widgetId,
      detectedLanguage: conversationLocale,
      tenantId: agencyIdForClinic || clinicId,
      sourceDomain: sourceDomain,
      ...extra,
    });

    console.log(JSON.stringify({
      checkpoint: "APPOINTMENT_LOCALE_RESOLUTION",
      traceId: activeTraceId,
      conversationId: convId,
      clinicId: actualClinicId,
      requestLanguage: language,
      persistedLocale: loadedConversationLocale,
      localeReason: localeResolution.reason,
      ...languageResolutionLogFields(localeResolution),
      clinicDefaultLocale: clinicLanguage,
    }));
    // ── INSTRUMENTATION LOG 2 & 3 ──
    console.log(JSON.stringify({ checkpoint: "APPT_02_STATE_LOADED", traceId: activeTraceId, conversationId: convId, clinicId: actualClinicId, appointmentState: loadedState, conversationLocale, timestamp: new Date().toISOString() }));
    console.log(JSON.stringify({ checkpoint: "APPT_03_DRAFT_LOADED", traceId: activeTraceId, conversationId: convId, clinicId: actualClinicId, draftFields: Object.keys(loadedDraft), timestamp: new Date().toISOString() }));

    // ── AŞAMA 4: CONFIRMATION HANDLER GARANTİSİ (EFFECTIVE STATE & ACTION OWNERSHIP) ──
    // Recover a complete draft from Firestore and/or client pending payload. A prior
    // bug could show the patient a confirmation summary while appointmentDraft failed
    // to persist (Firestore undefined rejection), leaving state stuck in COLLECTING_*.
    // Also reconstruct from the last assistant summary in history when needed so
    // "Yes please" still finalizes even if client pending payload is missing.
    let confirmationDraft = mergeAppointmentDraftSources(
      loadedDraft,
      pendingAppointmentData as Partial<AppointmentData> | undefined
    );
    if (!isAppointmentDraftComplete(confirmationDraft) && Array.isArray(history) && history.length > 0) {
      const fromHistory = extractAppointmentFromHistory(history);
      if (fromHistory) {
        confirmationDraft = mergeAppointmentDraftSources(confirmationDraft, fromHistory);
        console.log(JSON.stringify({
          checkpoint: "APPT_DRAFT_RECOVERED_FROM_HISTORY",
          conversationId: convId,
          clinicId: actualClinicId,
          recoveredKeys: Object.keys(fromHistory),
        }));
      }
    }
    const draftCompleteForConfirm = isAppointmentDraftComplete(confirmationDraft);
    const apptPermitted = PendingActionManager.isAppointmentSubmissionPermitted({
      appointmentState: loadedState,
      appointmentSubmitted: loadedIsAppointmentCreated || loadedState === "APPOINTMENT_SUBMITTED" || loadedState === "COMPLETED",
      appointmentId: loadedAppointmentId || undefined,
      pendingAction: loadedPendingAction
    });

    const stateLooksLikeReview =
      loadedState === "AWAITING_CONFIRMATION" ||
      (draftCompleteForConfirm &&
        (String(loadedState || "").startsWith("COLLECTING_") ||
          loadedState === "AWAITING_DATE_CLARIFICATION" ||
          loadedState === "IDLE" ||
          !loadedState));

    const isAwaitingConfirmation =
      Boolean(adminDb) &&
      positiveConfirmationDetected &&
      !negativeConfirmationDetected &&
      draftCompleteForConfirm &&
      stateLooksLikeReview &&
      apptPermitted.allowed;

    console.log(JSON.stringify({
      checkpoint: "APPT_CONFIRMATION_RECEIVED",
      traceId: activeTraceId,
      conversationId: convId,
      loadedState,
      effectiveState: loadedState,
      apptPermitted: apptPermitted.allowed,
      guardReason: apptPermitted.reason,
      positiveConfirmationDetected,
      negativeConfirmationDetected,
      draftCompleteForConfirm,
      stateLooksLikeReview,
      confirmationDetected: positiveConfirmationDetected,
      conversationLocale,
      handlerWillRun: isAwaitingConfirmation
    }));

    if (isAwaitingConfirmation && adminDb) {
         // Prefer merged complete draft for finalization
         loadedDraft = confirmationDraft;
         // ── INSTRUMENTATION LOG 4 ──
         console.log(JSON.stringify({ checkpoint: "APPT_04_CONFIRMATION_HANDLER_ENTERED", traceId: activeTraceId, conversationId: convId, clinicId: actualClinicId, conversationLocale, loadedStateBefore: loadedState, timestamp: new Date().toISOString() }));
         
         // 1. Validate all 6 required fields in persisted draft
         const missingDraftSlots = ConversationStateEngine.getMissingSlots({
           treatment: loadedDraft.requestedService,
           preferredDate: loadedDraft.requestedDate,
           preferredTime: loadedDraft.requestedTime,
           fullName: loadedDraft.patientName,
           phone: loadedDraft.patientPhone,
           email: loadedDraft.patientEmail
         });

         if (missingDraftSlots.length > 0) {
           const earliestMissing = missingDraftSlots[0];
           let nextSubState: AppointmentState = "COLLECTING_INFO";
           if (earliestMissing === "treatment") nextSubState = "COLLECTING_TREATMENT";
           else if (earliestMissing === "preferredDate") nextSubState = "COLLECTING_DATE";
           else if (earliestMissing === "preferredTime") nextSubState = "COLLECTING_TIME";
           else if (earliestMissing === "fullName") nextSubState = "COLLECTING_NAME";
           else if (earliestMissing === "phone") nextSubState = "COLLECTING_PHONE";
           else if (earliestMissing === "email") nextSubState = "COLLECTING_EMAIL";

           console.error(`[CONFIRMATION_BLOCKED] Missing ${earliestMissing} in persisted draft for convId=${convId}`);
           await saveAppointmentState(adminDb, actualClinicId, convId, 0, nextSubState, loadedDraft, { conversationLocale });
           const missingPrompt = ConversationStateEngine.generateNextSlotPrompt(
             {
               treatment: loadedDraft.requestedService,
               preferredDate: loadedDraft.requestedDate,
               preferredTime: loadedDraft.requestedTime,
               fullName: loadedDraft.patientName,
               phone: loadedDraft.patientPhone,
               email: loadedDraft.patientEmail
             },
             missingDraftSlots,
             conversationLocale
           );
           return respondWithVisibleReply({ 
             success: true, 
             responseType: "appointment_information_required", 
             appointmentCreated: false, 
             reply: missingPrompt 
           }, basePersist({ appointmentState: nextSubState }));
         }
         
         // 1.5 Final Strict Date & Time Hard Block (clinic TZ + past + working hours)
         const clinicTzResolved = resolveClinicTimeZone(clinicData);
         const clinicTimeZone = clinicTzResolved.confident
           ? clinicTzResolved.timeZone
           : "Europe/Istanbul";
         const hoursResolutionFinal = ClinicWorkingHoursResolver.resolveClinicWorkingHours({
           clinicId: actualClinicId || clinicId,
           clinicData,
           trainingDocs,
         });

         // Ambiguous TZ abbreviation on the confirmation turn itself
         const abbrevGate = evaluateRawAppointmentTimeZoneAmbiguity(message, conversationLocale);
         if (abbrevGate) {
           await saveAppointmentState(adminDb, actualClinicId, convId, 0, "AWAITING_DATE_CLARIFICATION", loadedDraft, {
             conversationLocale,
           });
           return respondWithVisibleReply({
             success: true,
             responseType: "appointment_date_clarification_required",
             appointmentCreated: false,
             reply: abbrevGate.message,
           }, basePersist({ appointmentState: "AWAITING_DATE_CLARIFICATION" }));
         }

         const finalDateValidation = AppointmentDateValidator.validateAppointmentDateConsistency({
            rawDateText: loadedDraft.requestedDate,
            rawTimeText: loadedDraft.requestedTime || null,
            inferredDate: loadedDraft.requestedDate || null,
            inferredTime: loadedDraft.requestedTime || null,
            currentClinicDateTime: new Date(),
            timeZone: clinicTimeZone
         });

         if (finalDateValidation.hasConflict || !finalDateValidation.isValid) {
            console.error(`[CONFIRMATION_BLOCKED] Final date validation failed before creation:`, JSON.stringify(finalDateValidation));
            const draftKeepFields = { ...loadedDraft };
            if (finalDateValidation.conflictType === "PAST_DATE" || finalDateValidation.conflictType === "PAST_TIME") {
              draftKeepFields.requestedDate = undefined as any;
              draftKeepFields.requestedTime = undefined as any;
            }
            await saveAppointmentState(adminDb, actualClinicId, convId, 0, "AWAITING_DATE_CLARIFICATION", draftKeepFields, {
               dateAlternatives: finalDateValidation.alternatives,
               conversationLocale
            });
            const clarificationFallback = conversationLocale.startsWith("en")
              ? "I noticed a discrepancy with the appointment date. Could you please confirm or specify the date again?"
              : "Tarih ile ilgili bir tutarsızlık fark ettim. Lütfen randevu tarihinizi tekrar onaylayın veya düzeltin.";
            return respondWithVisibleReply({ 
               success: true, 
               responseType: "appointment_date_clarification_required", 
               appointmentCreated: false, 
               reply: finalDateValidation.clarificationMessage || clarificationFallback 
            }, basePersist({ appointmentState: "AWAITING_DATE_CLARIFICATION" }));
         }

         // Canonical past / hours / notice gate (does not trust LLM)
         const policyValidation: AppointmentDateTimeValidationResult = validateAppointmentDateTime({
           localDate: finalDateValidation.resolvedDate || loadedDraft.requestedDate,
           localTime: finalDateValidation.resolvedTime || loadedDraft.requestedTime,
           rawUserInput: `${loadedDraft.requestedDate || ""} ${loadedDraft.requestedTime || ""}`,
           clinicTimeZone,
           now: new Date(),
           workingHours: hoursResolutionFinal.schedule,
           is24_7: hoursResolutionFinal.is24_7,
           // Product: no universal minimum-notice rule yet (default 0).
           minimumNoticeMinutes: 0,
           locale: conversationLocale,
           resolutionSource: "deterministic_parser",
         });

         if (!policyValidation.ok) {
           console.error(`[CONFIRMATION_BLOCKED] AppointmentDateTimePolicy rejected:`, policyValidation.reason);
           const draftKeepFields = {
             ...loadedDraft,
             requestedDate: undefined as any,
             requestedTime: undefined as any,
           };
           await saveAppointmentState(adminDb, actualClinicId, convId, 0, "COLLECTING_DATE", draftKeepFields, {
             conversationLocale,
           });
           return respondWithVisibleReply({
             success: true,
             responseType: "appointment_date_clarification_required",
             appointmentCreated: false,
             reply: policyValidation.message,
             suggestedTimes: policyValidation.suggestions,
           }, basePersist({ appointmentState: "COLLECTING_DATE" }));
         }

         // Override with canonical just to be absolutely sure
         loadedDraft.requestedDate = policyValidation.resolved?.localDate || finalDateValidation.resolvedDate || loadedDraft.requestedDate;
         loadedDraft.requestedTime = policyValidation.resolved?.localTime || finalDateValidation.resolvedTime || loadedDraft.requestedTime;
         (loadedDraft as any).requestedWeekday = conversationLocale.startsWith("en") ? (finalDateValidation.resolvedWeekdayEn || finalDateValidation.resolvedWeekday) : finalDateValidation.resolvedWeekday;
         (loadedDraft as any).clinicTimeZone = clinicTimeZone;
         (loadedDraft as any).startsAtUtc = policyValidation.resolved?.startsAtUtc;

          // 2. Call and await createAppointmentAndNotify
         try {
             // State -> SUBMITTING_APPOINTMENT
             await saveAppointmentState(adminDb, actualClinicId, convId, 0, "SUBMITTING_APPOINTMENT", loadedDraft, { conversationLocale });

             const { createAppointmentAndNotify } = await import("@/lib/appointment-service");

             // ── INSTRUMENTATION LOG 5 ──
             console.log(JSON.stringify({ checkpoint: "APPT_05_CREATE_APPOINTMENT_CALLED", traceId: activeTraceId, conversationId: convId, clinicId: actualClinicId, timestamp: new Date().toISOString() }));

             const result = await createAppointmentAndNotify({
                 clinicId: actualClinicId, // Must be the real Firestore doc ID
                 patientName: loadedDraft.patientName,
                 patientPhone: loadedDraft.patientPhone,
                 patientEmail: loadedDraft.patientEmail,
                 requestedService: loadedDraft.requestedService || (conversationLocale.startsWith("en") ? "General Consultation" : "Genel Muayene"),
                 requestedDate: loadedDraft.requestedDate,
                 requestedTime: loadedDraft.requestedTime,
                 preferredTimeText: loadedDraft.preferredTimeText,
                 preferredTimePeriod: loadedDraft.preferredTimePeriod,
                 preferredTimeStart: loadedDraft.preferredTimeStart,
                 preferredTimeEnd: loadedDraft.preferredTimeEnd,
                 notes: loadedDraft.notes || "",
                 requestedDoctor: loadedDraft.requestedDoctor,
                 source: "ai_chatbot",
                 status: "PENDING_REVIEW",
                 createdBy: "ai_assistant",
                 conversationId: convId,
                 idempotencyKey: `${convId}_${loadedDraft.requestedDate}_${loadedDraft.requestedService}`,
                 notificationChannelToSave: "email",
                 clinicData,
                 clinicTimeZone: (loadedDraft as any).clinicTimeZone,
                 startsAtUtc: (loadedDraft as any).startsAtUtc,
             });

             // 3. Require a real appointmentId
             if (result.success && result.appointmentId) {
                 await saveAppointmentState(adminDb, actualClinicId, convId, 0, "APPOINTMENT_SUBMITTED", {}, {
                   isAppointmentCreated: true,
                   appointmentId: result.appointmentId,
                   pendingAction: null,
                   conversationLocale
                 });

                 const successReply = conversationLocale.startsWith("en")
                   ? `Thank you. Your preliminary appointment request has been submitted to ${clinicName}. The clinic team will review it and contact you using your registered contact details.`
                   : conversationLocale.startsWith("de")
                   ? `Vielen Dank. Ihre vorläufige Terminanfrage wurde an ${clinicName} weitergeleitet. Das Klinikteam wird Ihre Anfrage prüfen und sich bei Ihnen melden.`
                   : conversationLocale.startsWith("fr")
                   ? `Merci. Votre demande de rendez-vous préliminaire a été transmise à ${clinicName}. L'équipe clinique examinera votre demande et vous contactera.`
                   : conversationLocale.startsWith("ar")
                   ? `شكراً لك. تم إرسال طلب الموعد المبدئي الخاص بك إلى ${clinicName}. سيقوم فريق العيادة بمراجعة طلبك والتواصل معك.`
                   : `Teşekkür ederim. Ön randevu talebiniz ${clinicName}'e iletildi. Klinik ekibi talebinizi değerlendirdikten sonra kayıtlı iletişim bilgileriniz üzerinden size bilgi verecektir.`;

                 // LOG THE SUCCESSFUL APPOINTMENT CREATION (via respondWithVisibleReply)
                 return respondWithVisibleReply({
                     success: true,
                     responseType: "appointment_created",
                     appointmentCreated: true,
                     appointmentId: result.appointmentId,
                     appointmentStatus: result.status || "PENDING_REVIEW",
                     clinicNotificationSent: result.clinicNotificationStatus === "SENT" || result.clinicNotificationStatus === "ACCEPTED",
                     patientNotificationSent: result.patientNotificationStatus === "SENT" || result.patientNotificationStatus === "ACCEPTED",
                     reply: successReply
                 }, basePersist({
                   apptData: loadedDraft,
                   appointmentId: result.appointmentId,
                   isAppointmentCreated: true,
                   appointmentState: "APPOINTMENT_SUBMITTED",
                 }));

             } else {
                 await saveAppointmentState(adminDb, actualClinicId, convId, 0, "AWAITING_CONFIRMATION", loadedDraft, { conversationLocale });
                 const failReply = conversationLocale.startsWith("en")
                   ? "I am sorry, your preliminary appointment request could not be saved at this time. Please try again later."
                   : conversationLocale.startsWith("de")
                   ? "Es tut uns leid, Ihre Terminanfrage konnte derzeit nicht gespeichert werden. Bitte versuchen Sie es später noch einmal."
                   : "Üzgünüm, ön randevu talebiniz şu anda sisteme kaydedilemedi. Lütfen daha sonra tekrar deneyin.";
                 return respondWithVisibleReply({
                     success: false,
                     responseType: "appointment_creation_failed",
                     appointmentCreated: false,
                     errorCode: "APPOINTMENT_CREATE_FAILED",
                     reply: failReply
                 }, basePersist({ appointmentState: "AWAITING_CONFIRMATION" }));
             }

         } catch (err: any) {
             await saveAppointmentState(adminDb, actualClinicId, convId, 0, "AWAITING_CONFIRMATION", loadedDraft, { conversationLocale });
             const failReply = conversationLocale.startsWith("en")
               ? "I am sorry, your preliminary appointment request could not be saved at this time. Please try again later."
               : "Üzgünüm, ön randevu talebiniz şu anda sisteme kaydedilemedi. Lütfen daha sonra tekrar deneyin.";
             return respondWithVisibleReply({
                 success: false,
                 responseType: "appointment_creation_failed",
                 appointmentCreated: false,
                 errorCode: "APPOINTMENT_CREATE_FAILED",
                 reply: failReply
             }, basePersist({ appointmentState: "AWAITING_CONFIRMATION" }));
         }
    } else if (positiveConfirmationDetected) {
         console.log(JSON.stringify({
           checkpoint: "CONFIRMATION_HANDLER_BYPASSED",
           reason: !positiveConfirmationDetected
             ? "not_positive_confirmation"
             : !draftCompleteForConfirm
             ? "draft_incomplete"
             : !stateLooksLikeReview
             ? "state_not_reviewable"
             : !apptPermitted.allowed
             ? apptPermitted.reason
             : "unknown",
           loadedState,
           draftCompleteForConfirm,
           positiveConfirmationDetected,
         }));
    }
    /* ==================================================================== */

    /* ── Deterministic Appointment State Machine Init ──────────────────── */
    let appointmentState: AppointmentState = "IDLE";
    let appointmentDraft: Partial<AppointmentData> = {};
    let appointmentVersion: number = 0;
    let processedMessageIds: string[] = [];
    let stateData: any = {};

    if (adminDb && convId) {
      try {
        // Reuse the conversation log already loaded above (avoids a duplicate Firestore read).
        const lData = loadedConversationLogData;
        if (lData) {
          stateData = lData || {};
          if (lData?.appointmentState) appointmentState = lData.appointmentState;
          if (lData?.appointmentDraft) appointmentDraft = lData.appointmentDraft;
          if (typeof lData?.appointmentVersion === "number") appointmentVersion = lData.appointmentVersion;
          else appointmentVersion = loadedAppointmentVersion;
          if (Array.isArray(lData?.processedMessageIds)) processedMessageIds = lData.processedMessageIds;
          else processedMessageIds = loadedProcessedMessageIds;
          
          if (processedMessageIds.includes(messageId)) {
             console.log(`[IDEMPOTENCY_SKIPPED] convId=${convId} messageId=${messageId}`);
             return respondWithVisibleReply(
               { responseType: "CHAT_REPLY", duplicate: true, reply: "" },
               basePersist({ skipPersist: true })
             );
          }
        }
      } catch (e: any) {
        console.error("[chat API] Error fetching conversationLog for state machine:", e.message);
      }
    }

    // Only merge frontend pendingAppointmentData if we are NOT awaiting confirmation.
    // This prevents empty or stale frontend data from erasing the server's persisted draft during the 'evet' step.
    if (appointmentState !== "AWAITING_CONFIRMATION") {
      appointmentDraft = safeMergeDraft(appointmentDraft, pendingAppointmentData);
    }

    let clinicDoctorsForMatch: ClinicDoctorMatchInput[] | null = null;
    const getClinicDoctorsForMatch = async () => {
      if (clinicDoctorsForMatch) return clinicDoctorsForMatch;
      clinicDoctorsForMatch = await fetchClinicDoctorMatchInputs({
        adminDb,
        clinicId,
        actualClinicId,
        isAgencyClinic,
        agencyIdForClinic,
      });
      return clinicDoctorsForMatch;
    };



    /* ── DETERMINISTIC STATE MACHINE INTERCEPTOR ───────────────────────── */
    const currentExpectedSlot =
      appointmentState === "COLLECTING_EMAIL" ? "email" :
      appointmentState === "COLLECTING_PHONE" ? "phone" :
      appointmentState === "COLLECTING_NAME" ? "fullName" :
      appointmentState === "COLLECTING_TIME" ? "preferredTime" :
      appointmentState === "COLLECTING_DATE" ? "preferredDate" :
      appointmentState === "COLLECTING_TREATMENT" ? "treatment" :
      appointmentState === "AWAITING_CONFIRMATION" ? "confirmation" :
      undefined;

    // Global Intent Router Evaluation
    // Carry forward last unambiguous treatment from draft/history so Q&A → booking
    // does not re-ask "which treatment?" when the patient only supplies date/time.
    const treatmentCarryForward = resolveAppointmentTreatmentCarryForward({
      draftRequestedService: appointmentDraft.requestedService,
      history,
      locale: conversationLocale,
    });
    const activeTreatment =
      !treatmentCarryForward.ambiguous && treatmentCarryForward.treatmentId
        ? treatmentCarryForward.treatmentId
        : undefined;

    if (treatmentCarryForward.source !== "none" || treatmentCarryForward.ambiguous) {
      console.log(JSON.stringify({
        checkpoint: "APPT_TREATMENT_CARRY_FORWARD",
        traceId: activeTraceId,
        conversationId: convId,
        clinicId: actualClinicId,
        treatmentId: treatmentCarryForward.treatmentId,
        ambiguous: treatmentCarryForward.ambiguous,
        source: treatmentCarryForward.source,
        reason: treatmentCarryForward.reason,
      }));
    }

    perf.start("intent_classify");
    const conversationIntent = IntentRouter.classifyConversationIntent({
      message,
      conversationHistory: history as any,
      currentState: appointmentState === "IDLE" ? "INITIAL" : (appointmentState === "AWAITING_CONFIRMATION" ? "APPOINTMENT_REVIEW" : (appointmentState === "APPOINTMENT_SUBMITTED" ? "APPOINTMENT_SUBMITTED" : "APPOINTMENT_COLLECTION")),
      expectedSlot: currentExpectedSlot,
      pendingAction: loadedPendingAction,
      appointmentSubmitted: loadedIsAppointmentCreated || loadedState === "APPOINTMENT_SUBMITTED" || loadedState === "COMPLETED" || appointmentState === "APPOINTMENT_SUBMITTED",
      collectedSlots: {
        preferredDate: appointmentDraft.requestedDate || undefined,
        preferredTime: appointmentDraft.requestedTime || undefined,
        fullName: appointmentDraft.patientName || undefined,
        phone: appointmentDraft.patientPhone || undefined,
        email: appointmentDraft.patientEmail || undefined,
        treatment: appointmentDraft.requestedService || activeTreatment || undefined
      },
      activeTreatment,
      clinicContext: {
        clinicId: actualClinicId,
        clinicName,
        turkishContactNumber: clinicData?.turkishContactNumber,
        internationalContactNumber: clinicData?.internationalContactNumber
      },
      locale: conversationLocale
    });
    perf.end("intent_classify", { intent: conversationIntent.intent });

    // 1. Language Switch handling
    if (conversationIntent.intent === "language_switch" && conversationIntent.targetLocale) {
      const newLocale = conversationIntent.targetLocale;
      const isEn = newLocale.startsWith("en");
      const isDe = newLocale.startsWith("de");
      const isFr = newLocale.startsWith("fr");
      const isAr = newLocale.startsWith("ar");

      const isFlowActive = appointmentState !== "IDLE" && appointmentState !== "APPOINTMENT_SUBMITTED";
      let switchReply = "";

      if (isFlowActive) {
        const missingSlots = ConversationStateEngine.getMissingSlots({
          treatment: appointmentDraft.requestedService || undefined,
          preferredDate: appointmentDraft.requestedDate || undefined,
          preferredTime: appointmentDraft.requestedTime || undefined,
          fullName: appointmentDraft.patientName || undefined,
          phone: appointmentDraft.patientPhone || undefined,
          email: appointmentDraft.patientEmail || undefined
        });
        const slotPrompt = ConversationStateEngine.generateNextSlotPrompt(
          {
            treatment: appointmentDraft.requestedService || undefined,
            preferredDate: appointmentDraft.requestedDate || undefined,
            preferredTime: appointmentDraft.requestedTime || undefined,
            fullName: appointmentDraft.patientName || undefined,
            phone: appointmentDraft.patientPhone || undefined,
            email: appointmentDraft.patientEmail || undefined
          },
          missingSlots,
          newLocale
        );
        const ack = isEn ? "Sure, we can continue in English!" : isDe ? "Gerne, wir können auf Deutsch fortfahren!" : isFr ? "Bien sûr, nous pouvons continuer en français !" : isAr ? "بالتأكيد، يمكننا المتابعة باللغة العربية!" : "Tabii ki, Türkçe olarak devam edebiliriz!";
        switchReply = `${ack} ${slotPrompt}`;
      } else {
        switchReply = isEn
          ? "Sure, we can continue in English! How can I help you today?"
          : isDe
          ? "Gerne, wir können auf Deutsch fortfahren! Wie kann ich Ihnen helfen?"
          : isFr
          ? "Bien sûr, nous pouvons continuer en français ! Comment puis-je vous aider aujourd'hui ?"
          : isAr
          ? "بالتأكيد، يمكننا المتابعة باللغة العربية! كيف يمكنني مساعدتك اليوم؟"
          : "Tabii ki, Türkçe olarak devam edebiliriz! Size nasıl yardımcı olabilirim?";
      }

      await saveAppointmentState(adminDb, actualClinicId, convId, appointmentVersion, appointmentState, appointmentDraft, {
        conversationLocale: newLocale,
        processedMessageIds: [...processedMessageIds, messageId]
      });

      return respondWithVisibleReply({
        responseType: "CHAT_REPLY",
        reply: switchReply,
        detectedLanguage: newLocale,
        pendingAppointmentData: appointmentDraft
      }, basePersist({
        detectedLanguage: newLocale,
        appointmentState,
      }));
    }

    // 2. Cancellation Intent
    const isCancel = conversationIntent.intent === "cancel" || /^(hayır|h|onaylamıyorum|iptal|vazgeçtim|hayir|no|cancel|stornieren|annuler|nein|non|لا)$/i.test(msgLower);
    if (isCancel && (appointmentState !== "IDLE" || pendingAppointmentData)) {
      await saveAppointmentState(adminDb, actualClinicId, convId, appointmentVersion, "IDLE", {}, {
        processedMessageIds: [...processedMessageIds, messageId],
        conversationLocale
      });
      const cancelReply = conversationLocale.startsWith("en")
        ? "I have cancelled your appointment request. How else can I assist you?"
        : conversationLocale.startsWith("de")
        ? "Ich habe Ihre Terminanfrage storniert. Wie kann ich Ihnen sonst noch helfen?"
        : conversationLocale.startsWith("fr")
        ? "J'ai annulé votre demande de rendez-vous. Comment puis-je vous aider d'autre ?"
        : conversationLocale.startsWith("ar")
        ? "لقد قمت بإلغاء طلب الموعد الخاص بك. كيف يمكنني مساعدتك أكثر؟"
        : "Randevu talebinizi iptal ettim. Size başka nasıl yardımcı olabilirim?";
      return respondWithVisibleReply({
        responseType: "CHAT_REPLY",
        reply: cancelReply,
        pendingAppointmentData: null
      }, basePersist({ appointmentState: "IDLE" }));
    }

    // 2b. Confirmation-stage draft amendment (not yes/no-only).
    // Date/time changes reuse validateAppointmentDateTime; unrelated fields stay intact.
    if (isAwaitingConfirmation && adminDb) {
      const clinicTzResolved = resolveClinicTimeZone(clinicData);
      const clinicTimeZone = clinicTzResolved.confident
        ? clinicTzResolved.timeZone
        : "Europe/Istanbul";
      const hoursResolution = ClinicWorkingHoursResolver.resolveClinicWorkingHours({
        clinicId: actualClinicId || clinicId,
        clinicData,
        trainingDocs,
      });

      perf.start("confirmation_amendment");
      const doctors = await getClinicDoctorsForMatch();
      const amendment = applyConfirmationAmendment({
        message,
        locale: conversationLocale,
        draft: {
          patientName: appointmentDraft.patientName,
          patientPhone: appointmentDraft.patientPhone,
          patientEmail: appointmentDraft.patientEmail,
          requestedService: appointmentDraft.requestedService,
          requestedDate: appointmentDraft.requestedDate,
          requestedTime: appointmentDraft.requestedTime,
          preferredDateDisplay: appointmentDraft.preferredDateDisplay,
          requestedWeekday: (appointmentDraft as any).requestedWeekday,
          requestedDoctor: appointmentDraft.requestedDoctor,
          notes: appointmentDraft.notes,
        },
        clinicTimeZone,
        now: new Date(),
        workingHours: hoursResolution.schedule,
        is24_7: hoursResolution.is24_7,
        doctors,
      });
      perf.end("confirmation_amendment", {
        outcome: amendment.outcome,
        fields: amendment.amendedFields.join(","),
      });

      console.log(JSON.stringify({
        checkpoint: "APPT_CONFIRMATION_AMENDMENT",
        traceId: activeTraceId,
        conversationId: convId,
        clinicId: actualClinicId,
        appointmentStateBefore: "AWAITING_CONFIRMATION",
        appointmentStateAfter: "AWAITING_CONFIRMATION",
        detectedIntent: conversationIntent.intent,
        amendmentFields: amendment.amendedFields,
        outcome: amendment.outcome,
        errorCode: amendment.validationReason || null,
        responseGenerated: amendment.outcome !== "none",
        responsePersisted: amendment.outcome !== "none",
      }));

      if (amendment.outcome === "applied") {
        Object.assign(appointmentDraft, amendment.nextDraft);
        await saveAppointmentState(
          adminDb,
          actualClinicId,
          convId,
          appointmentVersion,
          "AWAITING_CONFIRMATION",
          appointmentDraft,
          {
            processedMessageIds: [...processedMessageIds, messageId],
            conversationLocale,
          }
        );
        const reviewMsg = buildAppointmentReviewMessage({
          locale: conversationLocale,
          appointmentData: appointmentDraft,
          clinicName,
          timeZone: clinicTimeZone,
        });
        const reply = amendment.doctorClarification
          ? `${amendment.doctorClarification}\n\n${reviewMsg}`
          : reviewMsg;
        return respondWithVisibleReply({
          responseType: "CHAT_REPLY",
          reply,
          pendingAppointmentData: appointmentDraft,
        }, basePersist({
          appointmentState: "AWAITING_CONFIRMATION",
          apptData: appointmentDraft as AppointmentData,
        }));
      }

      if (amendment.outcome === "invalid" || amendment.outcome === "unparsed_datetime") {
        await saveAppointmentState(
          adminDb,
          actualClinicId,
          convId,
          appointmentVersion,
          "AWAITING_CONFIRMATION",
          appointmentDraft,
          {
            processedMessageIds: [...processedMessageIds, messageId],
            conversationLocale,
          }
        );
        return respondWithVisibleReply({
          success: true,
          responseType: "appointment_date_clarification_required",
          appointmentCreated: false,
          reply: amendment.message,
          suggestedTimes: amendment.suggestions,
          pendingAppointmentData: appointmentDraft,
        }, basePersist({ appointmentState: "AWAITING_CONFIRMATION" }));
      }
    }

    // 3. Handle Contextual Clarification Needed (e.g. When? disambiguation)
    if (conversationIntent.clarificationNeeded && conversationIntent.clarificationPrompt) {
      return respondWithVisibleReply({
        responseType: "CHAT_REPLY",
        reply: conversationIntent.clarificationPrompt,
        quickReplies: conversationIntent.suggestedOptions || [],
        pendingAppointmentData: appointmentDraft
      }, basePersist({ appointmentState }));
    }

    // 4. Handle Contact / Live Support Request (Preserves active appointment flow state)
    if (conversationIntent.intent === "contact_request" || conversationIntent.intent === "live_support_request") {
      const effectiveContactNumber = clinicWhatsapp || clinicData?.turkishContactNumber || clinicData?.internationalContactNumber || clinicData?.phone;
      const contactTarget =
        conversationIntent.entities?.contactTarget ||
        (/\bwhatsapp\b/i.test(message) ? "whatsapp" : undefined);
      const contactMsg = formatContactResponse(effectiveContactNumber, contactTarget, conversationLocale);
      console.log(JSON.stringify({
        checkpoint: "CONTACT_RESPONSE_LANGUAGE",
        traceId: activeTraceId,
        conversationId: convId,
        responseLanguage: conversationLocale,
        ...languageResolutionLogFields(localeResolution),
        handler: "formatContactResponse",
      }));
      return respondWithVisibleReply({
        responseType: "CHAT_REPLY",
        reply: contactMsg,
        pendingAppointmentData: appointmentDraft
      }, basePersist({ appointmentState, isLiveSupport: conversationIntent.intent === "live_support_request" }));
    }

    let isMidFlowInterruption = false;
    const isAppointmentFlowActive = appointmentState !== "IDLE" && appointmentState !== "APPOINTMENT_SUBMITTED";
    // Authoritative gate: a treatment / doctor / specialty mention alone must never
    // open appointment collection. Only genuine booking intent (or volunteered
    // scheduling commitments) may start the flow.
    perf.start("appointment_gate");
    const appointmentGate = evaluateAppointmentCollectionGate({
      message,
      intent: conversationIntent.intent,
      isAppointmentFlowActive,
      entities: conversationIntent.entities
    });
    perf.end("appointment_gate", {
      allowed: appointmentGate.allowed,
      mode: appointmentGate.mode,
      reason: appointmentGate.reason,
    });

    if (!appointmentGate.allowed) {
      console.log(JSON.stringify({
        checkpoint: "APPOINTMENT_GATE_BLOCKED",
        traceId: activeTraceId,
        conversationId: convId,
        clinicId: actualClinicId,
        candidateIntent: conversationIntent.intent,
        validatedIntent: conversationIntent.intent,
        gateMode: appointmentGate.mode,
        gateReason: appointmentGate.reason,
        priorState: appointmentState,
        locale: conversationLocale,
        hasTreatmentEntity: Boolean(conversationIntent.entities?.treatment),
      }));
    } else {
      console.log(JSON.stringify({
        checkpoint: "APPOINTMENT_GATE_ALLOWED",
        traceId: activeTraceId,
        conversationId: convId,
        clinicId: actualClinicId,
        candidateIntent: conversationIntent.intent,
        gateMode: appointmentGate.mode,
        gateReason: appointmentGate.reason,
        priorState: appointmentState,
        nextStateHint: appointmentGate.mode === "continue" ? appointmentState : "APPOINTMENT_COLLECTION",
        locale: conversationLocale,
      }));
    }

    // 5. Interruption Handling during active Appointment Collection / Review
    if (conversationIntent.isInterruption && isAppointmentFlowActive) {
      isMidFlowInterruption = true;
      console.log(`[INTENT_ROUTER] Mid-flow interruption detected: ${conversationIntent.intent}. Answering question while preserving appointment state: ${appointmentState}`);
    } else if (appointmentGate.allowed) {
      // 6. Handle slot extractions with immediate scheduling validation
      const clinicTzForScheduling = resolveClinicTimeZone(clinicData);
      const schedulingTimeZone = clinicTzForScheduling.confident
        ? clinicTzForScheduling.timeZone
        : "Europe/Istanbul";
      const hoursForScheduling = ClinicWorkingHoursResolver.resolveClinicWorkingHours({
        clinicId: actualClinicId || clinicId,
        clinicData,
        trainingDocs,
      });

      const abbrevGateCollect = evaluateRawAppointmentTimeZoneAmbiguity(message, conversationLocale);
      if (abbrevGateCollect) {
        await saveAppointmentState(adminDb, actualClinicId, convId, appointmentVersion, "AWAITING_DATE_CLARIFICATION", appointmentDraft, {
          processedMessageIds: [...processedMessageIds, messageId],
          conversationLocale,
        });
        return respondWithVisibleReply({
          responseType: "CHAT_REPLY",
          reply: abbrevGateCollect.message,
          pendingAppointmentData: appointmentDraft,
        }, basePersist({ appointmentState: "AWAITING_DATE_CLARIFICATION" }));
      }

      const schedulingAmendment = applyAppointmentSchedulingAmendment({
        message,
        draft: appointmentDraft as AppointmentDraftLike,
        extracted: conversationIntent.entities || undefined,
        locale: conversationLocale,
        clinicTimeZone: schedulingTimeZone,
        now: new Date(),
        workingHours: hoursForScheduling.schedule,
        is24_7: hoursForScheduling.is24_7,
      });

      console.log(JSON.stringify({
        checkpoint: "APPT_SCHEDULING_AMENDMENT",
        traceId: activeTraceId,
        conversationId: convId,
        outcome: schedulingAmendment.outcome,
        amendedFields: schedulingAmendment.amendedFields,
        validationReason: schedulingAmendment.validationReason || null,
      }));

      if (schedulingAmendment.outcome === "invalid") {
        Object.assign(appointmentDraft, schedulingAmendment.draft);
        await saveAppointmentState(adminDb, actualClinicId, convId, appointmentVersion, "COLLECTING_DATE", appointmentDraft, {
          processedMessageIds: [...processedMessageIds, messageId],
          conversationLocale,
        });
        return respondWithVisibleReply({
          responseType: "appointment_date_clarification_required",
          reply: schedulingAmendment.message || (conversationLocale.startsWith("en")
            ? "That date is not available. Please choose another day within clinic working hours."
            : "Bu tarih uygun değil. Lütfen kliniğin çalışma saatlerine uygun başka bir gün seçin."),
          suggestedTimes: schedulingAmendment.suggestions,
          pendingAppointmentData: appointmentDraft,
        }, basePersist({ appointmentState: "COLLECTING_DATE" }));
      }

      if (schedulingAmendment.outcome === "applied") {
        Object.assign(appointmentDraft, schedulingAmendment.draft);
      }

      // Non-scheduling entities (contact, treatment, name)
      if (conversationIntent.entities) {
        if (conversationIntent.entities.fullName) {
          appointmentDraft.patientName = conversationIntent.entities.fullName;
        }
        if (conversationIntent.entities.phone) {
          appointmentDraft.patientPhone = conversationIntent.entities.phone;
        }
        if (conversationIntent.entities.email) {
          appointmentDraft.patientEmail = conversationIntent.entities.email;
        }
        if (conversationIntent.entities.treatment) {
          const treatmentIds = [
            conversationIntent.entities.treatment,
            ...(((conversationIntent.entities as any).additionalTreatments as string[]) || []),
          ].filter(Boolean);
          const primaryId = treatmentIds[0];
          const label = SlotExtractor.formatMultiTreatmentLabel(treatmentIds, conversationLocale);
          const primaryLabel = SlotExtractor.formatMultiTreatmentLabel([primaryId], conversationLocale);
          appointmentDraft.requestedService = primaryLabel || primaryId;
          if (treatmentIds.length > 1) {
            const proceduresNote = conversationLocale.startsWith("en")
              ? `Requested procedures: ${label}`
              : `Talep edilen işlemler: ${label}`;
            appointmentDraft.notes = [appointmentDraft.notes, proceduresNote].filter(Boolean).join("\n");
          }
        }
        console.log(`[INTENT_ROUTER] Appointment slots updated:`, conversationIntent.entities);
      }

      if (appointmentGate.allowed) {
        const doctors = await getClinicDoctorsForMatch();
        const doctorPref = applyDoctorPreferenceToDraft({
          draft: {
            requestedDoctor: appointmentDraft.requestedDoctor,
            notes: appointmentDraft.notes,
          },
          message,
          doctors,
          locale: conversationLocale,
        });
        appointmentDraft.requestedDoctor = doctorPref.draft.requestedDoctor;
        appointmentDraft.notes = doctorPref.draft.notes;
        if (doctorPref.clarification && !ConversationStateEngine.getMissingSlots({
          treatment: appointmentDraft.requestedService || undefined,
          preferredDate: appointmentDraft.requestedDate || undefined,
          preferredTime: appointmentDraft.requestedTime || undefined,
          fullName: appointmentDraft.patientName || undefined,
          phone: appointmentDraft.patientPhone || undefined,
          email: appointmentDraft.patientEmail || undefined
        }).length) {
          await saveAppointmentState(adminDb, actualClinicId, convId, appointmentVersion, "AWAITING_CONFIRMATION", appointmentDraft, {
            processedMessageIds: [...processedMessageIds, messageId],
            conversationLocale,
          });
          const reviewMsg = buildAppointmentReviewMessage({
            locale: conversationLocale,
            appointmentData: appointmentDraft,
            clinicName
          });
          return respondWithVisibleReply({
            responseType: "CHAT_REPLY",
            reply: `${doctorPref.clarification}\n\n${reviewMsg}`,
            pendingAppointmentData: appointmentDraft
          }, basePersist({ appointmentState: "AWAITING_CONFIRMATION", apptData: appointmentDraft as AppointmentData }));
        }
        if (doctorPref.clarification) {
          await saveAppointmentState(adminDb, actualClinicId, convId, appointmentVersion, appointmentState, appointmentDraft, {
            processedMessageIds: [...processedMessageIds, messageId],
            conversationLocale,
          });
          return respondWithVisibleReply({
            responseType: "CHAT_REPLY",
            reply: doctorPref.clarification,
            pendingAppointmentData: appointmentDraft
          }, basePersist({ appointmentState }));
        }
      }

      // Handle specific sub-state parsing fallbacks
      if (appointmentState === "AWAITING_DATE_CLARIFICATION") {
        let chosenAlt: { date: string; weekday: string } | null = null;
        if (message.trim() === "1" && stateData.dateAlternatives && stateData.dateAlternatives[0]) {
          chosenAlt = stateData.dateAlternatives[0];
        } else if (message.trim() === "2" && stateData.dateAlternatives && stateData.dateAlternatives[1]) {
          chosenAlt = stateData.dateAlternatives[1];
        }

        if (chosenAlt) {
          appointmentDraft.requestedDate = chosenAlt.date;
          (appointmentDraft as any).requestedWeekday = chosenAlt.weekday;
        } else {
          const validationResult = AppointmentDateValidator.validateAppointmentDateConsistency({
            rawDateText: message,
            rawTimeText: appointmentDraft.requestedTime || null,
            inferredDate: null,
            inferredTime: appointmentDraft.requestedTime || null,
            currentClinicDateTime: new Date(),
            timeZone: "Europe/Istanbul"
          });
          
          if (validationResult.isValid && !validationResult.hasConflict) {
            appointmentDraft.requestedDate = validationResult.resolvedDate || appointmentDraft.requestedDate;
            (appointmentDraft as any).requestedWeekday = conversationLocale.startsWith("en") ? (validationResult.resolvedWeekdayEn || validationResult.resolvedWeekday) : validationResult.resolvedWeekday;
          } else {
            const clarificationFail = conversationLocale.startsWith("en")
              ? "The date could not be understood. Please specify again."
              : "Tarih anlaşılamadı. Lütfen tekrar belirtin.";
            return respondWithVisibleReply({ 
              responseType: "CHAT_REPLY", 
              reply: validationResult.clarificationMessage || clarificationFail, 
              pendingAppointmentData: appointmentDraft 
            }, basePersist({ appointmentState: "AWAITING_DATE_CLARIFICATION" }));
          }
        }
      } else if (appointmentState === "COLLECTING_PHONE" && !appointmentDraft.patientPhone) {
        const extractedPhone = SlotExtractor.parsePhone(message.trim());
        let finalPhone = extractedPhone;
        if (!finalPhone) {
          const phoneResult = normalizeTurkishPhone(message.trim());
          if (phoneResult.valid) finalPhone = phoneResult.normalized;
        }
        if (finalPhone) {
          appointmentDraft.patientPhone = finalPhone;
        } else {
          const reply = ConversationStateEngine.generateNextSlotPrompt(appointmentDraft, ["phone"], conversationLocale);
          return respondWithVisibleReply({
            responseType: "CHAT_REPLY",
            reply,
            pendingAppointmentData: appointmentDraft
          }, basePersist({ appointmentState: "COLLECTING_PHONE" }));
        }
      } else if (appointmentState === "COLLECTING_EMAIL" && !appointmentDraft.patientEmail) {
        const extractedEmail = SlotExtractor.parseEmail(message.trim());
        if (extractedEmail) {
          appointmentDraft.patientEmail = extractedEmail;
        } else {
          const reply = ConversationStateEngine.generateNextSlotPrompt(appointmentDraft, ["email"], conversationLocale, undefined, "invalid_email");
          return respondWithVisibleReply({
            responseType: "CHAT_REPLY",
            reply,
            pendingAppointmentData: appointmentDraft
          }, basePersist({ appointmentState: "COLLECTING_EMAIL" }));
        }
      } else if (appointmentState === "COLLECTING_NAME" && !appointmentDraft.patientName) {
        const parsedName = SlotExtractor.parseName(message.trim());
        if (parsedName) {
          appointmentDraft.patientName = parsedName.fullName;
        }
      }

      // Compute missing slots across all 6 fields
      const missingSlots = ConversationStateEngine.getMissingSlots({
        treatment: appointmentDraft.requestedService || undefined,
        preferredDate: appointmentDraft.requestedDate || undefined,
        preferredTime: appointmentDraft.requestedTime || undefined,
        fullName: appointmentDraft.patientName || undefined,
        phone: appointmentDraft.patientPhone || undefined,
        email: appointmentDraft.patientEmail || undefined
      });

      if (missingSlots.length === 0) {
        const preConfirmPolicy = validateAppointmentDateTime({
          localDate: appointmentDraft.requestedDate,
          localTime: appointmentDraft.requestedTime || "",
          rawUserInput: `${appointmentDraft.requestedDate || ""} ${appointmentDraft.requestedTime || ""}`,
          clinicTimeZone: schedulingTimeZone,
          now: new Date(),
          workingHours: hoursForScheduling.schedule,
          is24_7: hoursForScheduling.is24_7,
          minimumNoticeMinutes: 0,
          locale: conversationLocale,
          resolutionSource: "deterministic_parser",
        });
        if (!preConfirmPolicy.ok) {
          appointmentDraft.requestedDate = undefined as any;
          appointmentDraft.requestedTime = undefined as any;
          appointmentDraft.preferredDateDisplay = undefined as any;
          (appointmentDraft as any).requestedWeekday = undefined;
          await saveAppointmentState(adminDb, actualClinicId, convId, appointmentVersion, "COLLECTING_DATE", appointmentDraft, {
            processedMessageIds: [...processedMessageIds, messageId],
            conversationLocale,
          });
          return respondWithVisibleReply({
            responseType: "appointment_date_clarification_required",
            reply: preConfirmPolicy.message,
            suggestedTimes: preConfirmPolicy.suggestions,
            pendingAppointmentData: appointmentDraft,
          }, basePersist({ appointmentState: "COLLECTING_DATE" }));
        }
        if (preConfirmPolicy.resolved?.localDate) {
          appointmentDraft.requestedDate = preConfirmPolicy.resolved.localDate;
        }
        if (preConfirmPolicy.resolved?.localTime) {
          appointmentDraft.requestedTime = preConfirmPolicy.resolved.localTime;
        }

        await saveAppointmentState(adminDb, actualClinicId, convId, appointmentVersion, "AWAITING_CONFIRMATION", appointmentDraft, {
          processedMessageIds: [...processedMessageIds, messageId],
          conversationLocale
        });
        const reviewMsg = buildAppointmentReviewMessage({
          locale: conversationLocale,
          appointmentData: appointmentDraft,
          clinicName
        });
        return respondWithVisibleReply({
          responseType: "CHAT_REPLY",
          reply: reviewMsg,
          pendingAppointmentData: appointmentDraft
        }, basePersist({ appointmentState: "AWAITING_CONFIRMATION", apptData: appointmentDraft as AppointmentData }));
      }

      const earliestMissing = missingSlots[0];
      let nextSubState: AppointmentState = "COLLECTING_INFO";
      if (earliestMissing === "treatment") nextSubState = "COLLECTING_TREATMENT";
      else if (earliestMissing === "preferredDate") nextSubState = "COLLECTING_DATE";
      else if (earliestMissing === "preferredTime") nextSubState = "COLLECTING_TIME";
      else if (earliestMissing === "fullName") nextSubState = "COLLECTING_NAME";
      else if (earliestMissing === "phone") nextSubState = "COLLECTING_PHONE";
      else if (earliestMissing === "email") nextSubState = "COLLECTING_EMAIL";

      await saveAppointmentState(adminDb, actualClinicId, convId, appointmentVersion, nextSubState, appointmentDraft, {
        processedMessageIds: [...processedMessageIds, messageId],
        conversationLocale
      });

      const nextSlotPrompt = ConversationStateEngine.generateNextSlotPrompt(
        {
          treatment: appointmentDraft.requestedService || undefined,
          preferredDate: appointmentDraft.requestedDate || undefined,
          preferredTime: appointmentDraft.requestedTime || undefined,
          fullName: appointmentDraft.patientName || undefined,
          phone: appointmentDraft.patientPhone || undefined,
          email: appointmentDraft.patientEmail || undefined
        },
        missingSlots,
        conversationLocale,
        undefined,
        conversationIntent.validationError,
        conversationIntent.allInfoProvidedIntent
      );

      perf.log({
        path: "appointment_collection",
        intent: conversationIntent.intent,
        nextSubState,
        historyTurns: Array.isArray(history) ? history.length : 0,
      });

      return respondWithVisibleReply({
        responseType: "CHAT_REPLY",
        reply: nextSlotPrompt,
        pendingAppointmentData: appointmentDraft
      }, basePersist({ appointmentState: nextSubState }));
    }



    /* ──────────────────────────────────────────────────────────────────────── */

    /* ── Relevance scoring ─────────────────────────────────────────────── */
    const msgWords = msgLower.split(/\s+/).filter((w: string) => w.length > 2);
    
    // YENİ: RAG araması iyileştirmesi (Çalışma saatleri garantisi)
    const isAppointmentIntent = /\b(randevu|appointment|saat|gün|müsait|boş|yarın|bugün|alabilir)\b/.test(msgLower);
    
    // YENİ: Konum RAG araması iyileştirmesi
    const isLocationIntent = /\b(nerede|adres|nerdesiniz|semt|ilçe|ulaşım|konum|lokasyon|address|where|get there|befindet|adresse)\b/.test(msgLower);

    // YENİ: Fiyat/Ücret niyet tespiti (Priority: examination > xray > general treatment)
    const isExaminationFeeIntent = /\b(muayene|kontrol|ilk değerlendirme|ilk randevu).*(ücret|fiyat|parası|bedeli|ne kadar|ücretsiz|free|cost|ne tutar|ne kadara mal olur)\b/i.test(msgLower) || /\b(ücret|fiyat|parası|bedeli|ne kadar|ücretsiz|cost|ne tutar).*(muayene|kontrol|ilk değerlendirme|ilk randevu)\b/i.test(msgLower);
    const isXrayFeeIntent = /\b(röntgen|x-ray|film|tomografi).*(ücret|fiyat|parası|bedeli|ne kadar|ücretsiz|free|cost|ne tutar|ne kadara mal olur)\b/i.test(msgLower) || /\b(ücret|fiyat|parası|bedeli|ne kadar|ücretsiz|cost|ne tutar).*(röntgen|x-ray|film|tomografi)\b/i.test(msgLower);
    const isTreatmentPriceIntent = /\b(ücret|fiyat|ne kadar|fiyatı|parası|maliyeti|cost|price|ne tutar|ne kadara mal olur)\b/i.test(msgLower) && !isExaminationFeeIntent && !isXrayFeeIntent;
    
    let activePriceIntent = "";
    if (isExaminationFeeIntent) activePriceIntent = "examination_fee";
    else if (isXrayFeeIntent) activePriceIntent = "xray_fee";
    else if (isTreatmentPriceIntent) activePriceIntent = "treatment_price";
    
    debugLog.push(`intent_price=${activePriceIntent || "none"}`);

    // ─── DETERMINISTIC INTENT ROUTING ──────────────────────────────────────────
    // Import shared specialization and treatment registries
    const { findSpecializationCode, findTreatmentCode, getSpecializationLabel, getTreatmentLabel, SPECIALIZATION_REGISTRY } = await import("@/lib/constants/specializations");

    const requestedSpecialtyCode = findSpecializationCode(msgLower);
    const requestedTreatmentCode = findTreatmentCode(msgLower);

    // Intent detection
    const isBaseDoctorIntent = /\b(doktor|hekim|uzman|doctor|dentist|specialist|cerrah|surgeon|tıbbi|medical team|ekip|doctors|hekimler|doktorlar)/i.test(msgLower);
    const isTreatmentDoctorIntent = requestedTreatmentCode !== null && /\b(kim|hangi|who|which|yapıyor|yapan|ilgilen|çalış|performs|does)\b/i.test(msgLower);
    const isBeforeAfterIntent = /\b(önce.?sonra|before.?after|sonuç|result|örnek.?vaka|sample|case|foto|photo|görseller?|images?|nasıl.?gör[üu]n|how.?look|tedavi.?sonuç|outcome)\b/i.test(msgLower);
    const isDoctorIntent = isBaseDoctorIntent || requestedSpecialtyCode !== null || isTreatmentDoctorIntent;
    const isDoctorCountIntent = isDoctorIntent && /\b(kaç|sayısı|sayı|how many|number of)\b/i.test(msgLower);
    const isServiceIntent = /\b(hizmet|hizmetler|hizmetleri|hizmetleriniz|servis|servisler|servisleri|tedavi|tedaviler|tedavileri|tedavileriniz|işlem|işlemler|işlemleri|neler yapıyorsunuz|ne yapıyorsunuz|hangi tedaviler|hangi işlemler|services|treatments|procedures|specialties|clinical departments|medical services|what do you offer|what do you do)\b/i.test(msgLower) && !requestedTreatmentCode && !requestedSpecialtyCode && !isDoctorIntent && !activePriceIntent;
    debugLog.push(`intent_service=${isServiceIntent}`);

    // Classify the detected intent for logging
    let detectedDoctorSubIntent = "none";
    if (isDoctorCountIntent) detectedDoctorSubIntent = "doctor_count";
    else if (requestedSpecialtyCode && /\b(uzman|specialist|kim|who)\b/i.test(msgLower)) detectedDoctorSubIntent = "specialist_lookup";
    else if (requestedSpecialtyCode) detectedDoctorSubIntent = "doctor_specialization";
    else if (isTreatmentDoctorIntent) detectedDoctorSubIntent = "doctor_by_treatment";
    else if (isDoctorIntent) detectedDoctorSubIntent = "doctor_list";
    if (isBeforeAfterIntent) detectedDoctorSubIntent = "before_after";

    let doctorContext = "";
    let doctorDataMissing = false;
    const allowedDoctorNames: string[] = [];
    let treatmentContext = "";
    
    // ─── Helper: Classify specialist status ────────────────────────────────────
    const isVerifiedSpecialist = (data: any): boolean => {
      // 1. Explicit specialist_status field
      if (data.specialist_status === true) return true;
      // 2. Title matches any recognized specialist or academic prefix
      const title = String(data.title || data.professional_title || "").trim();
      const isAcademicOrSpecialist = /^(uzm|uzman|doç|prof)\b/i.test(title) || 
                                     /^dr\.\s*dt\./i.test(title) || 
                                     /^dr\.\s*öğr\.\s*üyesi/i.test(title);
      if (isAcademicOrSpecialist) return true;
      // 3. Explicit primary_specialization_code
      if (data.primary_specialization_code && data.primary_specialization_code.length > 0) return true;
      // "Dr." alone does NOT qualify
      return false;
    };

    // ─── Helper: Match doctor against specialization code ───────────────────────
    const doctorMatchesSpecialty = (data: any, specCode: string): boolean => {
      // 1. Check structured specialization code fields
      if (data.primary_specialization_code === specCode) return true;
      if (Array.isArray(data.clinical_field_codes) && data.clinical_field_codes.includes(specCode)) return true;
      // 2. Fallback: Check title/specialty text against synonym list
      const entry = SPECIALIZATION_REGISTRY.find(e => e.code === specCode);
      if (entry) {
        const combined = ((data.title || "") + " " + (data.specialty || "") + " " + (data.primary_specialization || "") + " " + (data.department || "")).toLowerCase();
        const allSyns = [...entry.synonymsTR, ...entry.synonymsEN, entry.labelTR.toLowerCase(), entry.labelEN.toLowerCase()];
        return allSyns.some(syn => combined.includes(syn.toLowerCase()));
      }
      return false;
    };

    // ─── Helper: Match doctor against treatment code ────────────────────────────
    const doctorMatchesTreatment = (data: any, treatCode: string): boolean => {
      // 1. Check structured treatment_codes array
      if (Array.isArray(data.treatment_codes) && data.treatment_codes.includes(treatCode)) return true;
      // 2. Fallback: Check free-text treatments field
      const { TREATMENT_REGISTRY } = require("@/lib/constants/specializations");
      const entry = TREATMENT_REGISTRY.find((e: any) => e.code === treatCode);
      if (entry) {
        let treatmentsText = "";
        if (Array.isArray(data.treatments)) treatmentsText = data.treatments.join(" ").toLowerCase();
        else if (typeof data.treatments === "string") treatmentsText = data.treatments.toLowerCase();
        const allSyns = [...entry.synonymsTR, ...entry.synonymsEN, entry.labelTR.toLowerCase(), entry.labelEN.toLowerCase()];
        return allSyns.some((syn: string) => treatmentsText.includes(syn.toLowerCase()));
      }
      return false;
    }

    if (isDoctorIntent || isTreatmentDoctorIntent) {
      const adminDb = getAdminDb();
      if (adminDb) {
        try {
          let docsSnap;
          if (isAgencyClinic && agencyIdForClinic) {
            docsSnap = await adminDb.collection("agencies").doc(agencyIdForClinic).collection("clinics").doc(actualClinicId).collection("doctors").where("is_active", "==", true).get();
          } else {
            docsSnap = await adminDb.collection("clinics").doc(clinicId).collection("doctors").where("is_active", "==", true).get();
          }
          
          if (!docsSnap.empty) {
            const docs = docsSnap.docs.map(d => ({ id: d.id, ...d.data() }) as any);
            if (docs.length > 0) {
              docs.sort((a: any, b: any) => (a.display_order || a.order || 0) - (b.display_order || b.order || 0));
              
              let specialistCount = 0;
              let generalCount = 0;

              const rawDoctorsData: any[] = [];
              const docsListStrings = docs.map((data: any, index: number) => {
                const fullName = `${data.title ? data.title + ' ' : ''}${data.doctorName || data.full_name || data.fullName}`.trim();
                allowedDoctorNames.push(fullName);
                
                const docId = data.id || data.doctor_id || `doctor_${index + 1}`;
                const titleStr = String(data.title || data.professional_title || "Diş Hekimi").trim();
                const specialtyStr = String(data.specialty || data.primary_specialization || "").trim();
                const clinicalField = String(data.department || "").trim();
                const specCode = data.primary_specialization_code || "";
                const clinicalFieldCodes = Array.isArray(data.clinical_field_codes) ? data.clinical_field_codes : [];
                const treatmentCodesArr = Array.isArray(data.treatment_codes) ? data.treatment_codes : [];
                
                let treatments: string[] = [];
                if (Array.isArray(data.treatments)) {
                  treatments = data.treatments;
                } else if (typeof data.treatments === "string") {
                  treatments = data.treatments.split(",").map((t: string) => t.trim()).filter(Boolean);
                }
                
                const isSpecialist = isVerifiedSpecialist(data);
                
                rawDoctorsData.push({
                  doctor_id: docId,
                  full_name: fullName,
                  professional_title: titleStr,
                  specialist_status: isSpecialist,
                  primary_specialization_code: specCode,
                  clinical_field_codes: clinicalFieldCodes,
                  treatment_codes: treatmentCodesArr,
                  specialization: specialtyStr || (isSpecialist ? getSpecializationLabel(specCode) : ""),
                  clinical_field: clinicalField,
                  treatments: treatments,
                });

                // Build text representation for context
                let text = `HEKİM ID: ${docId}\n`;
                text += `Ad: ${fullName}\n`;
                text += `Unvan: ${titleStr}\n`;
                text += `Uzman Statüsü: ${isSpecialist ? "Doğrulanmış Uzman Diş Hekimi" : "Diş Hekimi (uzman statüsü doğrulanmamış)"}\n`;
                
                if (specialtyStr) {
                  text += `Doğrulanmış Uzmanlık: ${specialtyStr}\n`;
                }
                if (clinicalField) {
                  text += `Çalışma Alanı: ${clinicalField}\n`;
                }
                if (treatments.length > 0) {
                  text += `Yaptığı Tedaviler: ${treatments.join(", ")}\n`;
                }
                if (data.education) text += `Eğitim: ${data.education}\n`;
                if (data.experienceYears) text += `Deneyim: ${data.experienceYears} Yıl\n`;
                if (Array.isArray(data.languages) && data.languages.length > 0) text += `Diller: ${data.languages.join(", ")}\n`;
                
                if (isSpecialist) specialistCount++;
                else generalCount++;

                return text.trim();
              });

              // ─── Diagnostic logging ──────────────────────────────────────────
              console.log(`[DOCTOR INTENT] intent=${detectedDoctorSubIntent} clinic=${clinicId} total_active=${docs.length} specialists=${specialistCount} general=${generalCount} requested_specialty=${requestedSpecialtyCode || "none"} requested_treatment=${requestedTreatmentCode || "none"}`);

              // ─── INTENT ROUTING ───────────────────────────────────────────────

              if (requestedSpecialtyCode && !isDoctorCountIntent) {
                // SPECIALIST LOOKUP or DOCTOR_SPECIALIZATION
                const matchedDoctors = rawDoctorsData.filter(d => doctorMatchesSpecialty(d, requestedSpecialtyCode!));
                const specLabel = getSpecializationLabel(requestedSpecialtyCode);

                if (matchedDoctors.length > 0) {
                  const matchedSummary = matchedDoctors.map(d => {
                    const isSpec = d.specialist_status;
                    const roleDesc = isSpec
                      ? `${specLabel} Uzmanı`
                      : `${specLabel} alanında çalışan hekim`;
                    return { full_name: d.full_name, professional_title: d.professional_title, role_description: roleDesc, specialist_status: isSpec };
                  });
                  doctorContext = `[VERIFIED DOCTOR PAYLOAD — Specialty: ${specLabel}]
Hastanın aradığı alanda (${specLabel}) kliniğimizde aşağıdaki hekim(ler) görev yapmaktadır.

\`\`\`json
${JSON.stringify(matchedSummary, null, 2)}
\`\`\`

ÖNEMLİ KURALLAR:
- specialist_status = true olan hekimleri "Uzman" olarak tanıt. Örn: "Periodontoloji Uzmanı".
- specialist_status = false olan hekimleri "bu alanda çalışan hekim" olarak tanıt. Örn: "${specLabel} alanında çalışan hekimimiz". ASLA "Uzman" deme.
- Hastaya doğrudan isimleri ve unvanlarını paylaş.`;
                } else {
                  doctorContext = `[VERIFIED DOCTOR PAYLOAD — Specialty: ${specLabel}]
Şu anda sistem kayıtlarımızda ${specLabel} alanında uzmanlığı veya çalışma alanı kayıtlı aktif bir hekimimiz görünmüyor.
Hastaya bu durumu profesyonelce bildir. Dilerse genel değerlendirme için randevu oluşturabileceğini belirt.`;
                }
              } else if (isTreatmentDoctorIntent && requestedTreatmentCode && !isDoctorCountIntent) {
                // DOCTOR_BY_TREATMENT
                const matchedDoctors = rawDoctorsData.filter(d => doctorMatchesTreatment(d, requestedTreatmentCode!));
                const treatLabel = getTreatmentLabel(requestedTreatmentCode);

                if (matchedDoctors.length > 0) {
                  const matchedSummary = matchedDoctors.map(d => ({
                    full_name: d.full_name,
                    professional_title: d.professional_title,
                  }));
                  doctorContext = `[VERIFIED DOCTOR PAYLOAD — Treatment: ${treatLabel}]
${treatLabel} tedavisini kliniğimizde aşağıdaki hekim(ler) uygulamaktadır:

\`\`\`json
${JSON.stringify(matchedSummary, null, 2)}
\`\`\`

Hastaya doğrudan bu hekimlerin isimlerini ve unvanlarını paylaş.`;
                } else {
                  doctorContext = `[VERIFIED DOCTOR PAYLOAD — Treatment: ${treatLabel}]
Şu anda sistem kayıtlarımızda ${treatLabel} tedavisi için atanmış bir hekim kaydı görünmüyor.
Ancak kliniğimizde bu tedavi sunulabiliyor olabilir. Hastayı randevu oluşturmaya yönlendir.`;
                }
              } else if (isDoctorCountIntent) {
                let matchedBySpecialty: any[] = [];
                let specialtyLabel = "";
                if (requestedSpecialtyCode) {
                  matchedBySpecialty = rawDoctorsData.filter(d => doctorMatchesSpecialty(d, requestedSpecialtyCode!));
                  specialtyLabel = getSpecializationLabel(requestedSpecialtyCode);
                }

                const verifiedPayload = {
                  intent: "doctor_count",
                  clinic_id: clinicId,
                  total_active_doctors: docs.length,
                  verified_specialist_dentists: specialistCount,
                  general_or_unverified_doctors: generalCount,
                  requested_specialty: specialtyLabel || null,
                  requested_specialty_count: specialtyLabel ? matchedBySpecialty.length : null,
                  doctors: rawDoctorsData.map(d => ({ full_name: d.full_name, professional_title: d.professional_title, specialist_status: d.specialist_status }))
                };
                
                doctorContext = `[VERIFIED DOCTOR COUNT PAYLOAD]
Aşağıdaki JSON verisi kliniğin KESİN ve GÜNCEL hekim kadrosudur.

\`\`\`json
${JSON.stringify(verifiedPayload, null, 2)}
\`\`\`

ÖNEMLİ KURALLAR:
1. DİKKAT: Aşağıda verilecek olan "Knowledge Base" (Bilgi Havuzu/RAG) kayıtları kliniğin tüm hekimlerini İÇERMEZ. Doktor sayısını söylerken veya doktorları listelerken ASLA Bilgi Havuzundan dönen metinlerin/kayıtların sayısını (örn. sadece 3 hekim dönmüş olması) kullanma. SADECE BURADAKİ JSON VERİSİNDEKİ SAYILARI KULLAN.
2. Doktor sayısı sorusunda SADECE 'total_active_doctors' değerini kullan.
3. "Uzman diş hekimi" sayısı sorulursa: SADECE 'verified_specialist_dentists' değerini kullan.
4. "Diş hekimi" sayısı sorulursa: SADECE 'general_or_unverified_doctors' değerini kullan.
5. Kullanıcı spesifik bir uzmanlık alanı soruyorsa (örn: periodontoloji) SADECE 'requested_specialty_count' değerini kullan.
6. Asla bilginin doğrulanamadığını söyleme.
7. İstenmedikçe listeyi tek tek sayma. Doğal bir cümle ile yanıt ver. Örn: "Kliniğimizde 6 uzman diş hekimi, 3 diş hekimi olmak üzere toplam 9 aktif hekim görev yapmaktadır."
8. Eğer hastalar tüm hekimleri VEYA tüm uzmanları saymanı isterse, JSON'daki "doctors" listesinin İLGİLİ KISMINI (tümünü veya sadece uzmanları) KESİNTİSİZ olarak listele. RAG'de az isim olsa dahi JSON'da kaç isim varsa o kadar yaz.`;
              } else {
                // GENERAL DOCTOR LIST
                doctorContext = `[HEKİM KADROSU BİLGİSİ]
Kliniğimizde toplam ${docs.length} aktif hekim görev yapmaktadır.
Doğrulanmış uzman diş hekimi: ${specialistCount}, Diş hekimi: ${generalCount}.

TAM LİSTE:
${docsListStrings.join('\n\n---\n\n')}

ÖNEMLİ KURALLAR (HEKİM BİLGİSİ):
1. DİKKAT: Aşağıda verilecek Bilgi Havuzu (RAG) kayıtları eksik olabilir. Hastaya doktor sayısını söylerken SADECE BURADAKİ tam sayıları (Toplam: ${docs.length}, Uzman: ${specialistCount}, Diş Hekimi: ${generalCount}) referans al.
2. SADECE yukarıdaki listede bulunan hekimleri sun. Asla uydurma hekim ekleme.
3. "Doğrulanmış Uzmanlık" alanı boşsa UZMANLIK UYDURMA. Tedavi yapması o alanın uzmanı olduğu anlamına gelmez.
4. "Uzman Statüsü" alanına bak: "Doğrulanmış Uzman Diş Hekimi" yazanları uzman olarak tanıt, diğerlerini "Diş Hekimi" olarak tanıt.
5. Hastalar tüm hekimleri sorarsa TAM LİSTE'deki isimlerin tümünü ver, Bilgi Havuzunda (RAG) az sayıda kişi dönse bile buradaki listeyi baz al.`;
              }
            } else {
              doctorDataMissing = true;
            }
          } else {
            doctorDataMissing = true;
          }
        } catch (err) {
          console.error("[chat] Error fetching doctors", err);
          doctorDataMissing = true;
        }

      } else {
        doctorDataMissing = true;
      }
      
      if (doctorDataMissing) {
        doctorContext = `DİKKAT: Sistemde bu kliniğin yapısal (structured) doktor listesi bulunamadı. Lütfen sağlanan 'Bilgi Havuzu' (Knowledge Base) kayıtlarına bak.
Eğer Bilgi Havuzunda doktor isimleri başlık olarak geçiyorsa şu kurallara KESİNLİKLE uy:
1. Her doktor başlığının altındaki bilgileri SADECE o doktora ait tek ve bağımsız bir kayıt olarak değerlendir.
2. Uzmanlık alanlarını ASLA tahmin etme. Sadece açıkça yazan uzmanlık bilgisini kullan.
3. "Kaç doktorunuz var?" sorusunda Bilgi Havuzu'ndaki doktor başlıklarını say.
Eğer Bilgi Havuzunda da doktor bilgisi YOKSA: "Kliniğimizin güncel hekim kadrosuna ilişkin kayıtlı bir sayı bulunmuyor. Dilerseniz klinik ekibimizden teyit edilmesini sağlayabilirim." Asla başka klinik veya ağ iddiasında bulunma; yalnızca bu klinik kayıtlarına dayan.`;
      }
    }

    // ─── BEFORE/AFTER INTENT ─────────────────────────────────────────────────
    if (isBeforeAfterIntent && requestedTreatmentCode) {
      const treatLabel = getTreatmentLabel(requestedTreatmentCode);
      // Search knowledge base for treatment profiles with before_after_url
      const matchingTreatmentDoc = trainingDocs.find((doc: any) => {
        const combined = (doc.title + " " + doc.content).toLowerCase();
        const { TREATMENT_REGISTRY } = require("@/lib/constants/specializations");
        const entry = TREATMENT_REGISTRY.find((e: any) => e.code === requestedTreatmentCode);
        if (!entry) return false;
        const allSyns = [...entry.synonymsTR, ...entry.synonymsEN, entry.labelTR.toLowerCase()];
        return allSyns.some((syn: string) => combined.includes(syn.toLowerCase()));
      });

      if (matchingTreatmentDoc) {
        // Try to extract before_after_url from content
        const urlMatch = matchingTreatmentDoc.content.match(/https?:\/\/[^\s\n"<>]+/);
        if (urlMatch) {
          treatmentContext = `[BEFORE/AFTER URL — ${treatLabel}]
Hastanın sorduğu ${treatLabel} tedavisi için öncesi-sonrası görseller ve vaka örnekleri aşağıdaki sayfada mevcuttur:
URL: ${urlMatch[0]}

Hastaya bu linki paylaş ve şu güvenlik notunu ekle:
"Görseller örnek vaka sonuçlarıdır. Uygulanacak tedavi ve elde edilecek sonuç kişiye göre değişebilir."`;
        }
      }
      console.log(`[BEFORE_AFTER] treatment=${requestedTreatmentCode} found_url=${!!treatmentContext} clinic=${clinicId}`);
    }

    /* ── PRE-FLIGHT: Deterministic Appointment Working Hours + Past-Time Validation ── */
    if (isAppointmentIntent && !isConfirmation(message)) {
      const clinicTzResolved = resolveClinicTimeZone(clinicData);
      const clinicTimeZone = clinicTzResolved.confident
        ? clinicTzResolved.timeZone
        : "Europe/Istanbul";

      const abbrevGate = evaluateRawAppointmentTimeZoneAmbiguity(message, conversationLocale);
      if (abbrevGate) {
        return respondWithVisibleReply(
          {
            responseType: "CHAT_REPLY",
            reply: abbrevGate.message,
            conversationId: convId,
            pendingAppointmentData: appointmentDraft,
          },
          basePersist({ appointmentState })
        );
      }

      const hoursResolution = ClinicWorkingHoursResolver.resolveClinicWorkingHours({
        clinicId: actualClinicId || clinicId,
        clinicData,
        trainingDocs
      });

      console.log(JSON.stringify({
        event: "CLINIC_WORKING_HOURS_RESOLVED",
        traceId: activeTraceId,
        clinicId: actualClinicId || clinicId,
        source: hoursResolution.source,
        confidence: hoursResolution.confidence,
        is24_7: !!hoursResolution.is24_7,
        clinicTimeZone,
        clinicTimeZoneSource: clinicTzResolved.source,
      }));

      // Extract requested date/time either from conversationIntent entities, appointmentDraft, or message
      const requestedDate = conversationIntent?.entities?.preferredDate || appointmentDraft?.requestedDate || null;
      const requestedTime = conversationIntent?.entities?.preferredTime || appointmentDraft?.requestedTime || null;
      const requestedWeekday = conversationIntent?.entities?.preferredWeekday || (appointmentDraft as any)?.requestedWeekday || null;
      const requestedWeekdayIndex = (conversationIntent?.entities as any)?.preferredWeekdayIndex ?? null;

      if (requestedDate && requestedTime) {
        const policy = validateAppointmentDateTime({
          localDate: requestedDate,
          localTime: requestedTime,
          rawUserInput: message,
          clinicTimeZone,
          now: new Date(),
          workingHours: hoursResolution.schedule,
          is24_7: hoursResolution.is24_7,
          minimumNoticeMinutes: 0,
          locale: conversationLocale,
        });

        console.log(JSON.stringify({
          event: "APPOINTMENT_DATETIME_POLICY_CHECK",
          traceId: activeTraceId,
          clinicId: actualClinicId || clinicId,
          ok: policy.ok,
          reason: policy.reason,
          clinicTimeZone,
        }));

        if (!policy.ok) {
          // Keep treatment/contact; clear only invalid date/time for correction.
          if (appointmentDraft) {
            appointmentDraft.requestedDate = undefined as any;
            appointmentDraft.requestedTime = undefined as any;
          }
          return respondWithVisibleReply(
            {
              responseType: "CHAT_REPLY",
              reply: policy.message,
              conversationId: convId,
              pendingAppointmentData: appointmentDraft,
              suggestedTimes: policy.suggestions,
            },
            basePersist({ appointmentState: "COLLECTING_DATE" })
          );
        }

        // Store converted clinic-local values when EST→Istanbul conversion applied
        if (policy.resolved) {
          if (appointmentDraft) {
            appointmentDraft.requestedDate = policy.resolved.localDate;
            appointmentDraft.requestedTime = policy.resolved.localTime;
          }
          if (conversationIntent?.entities) {
            conversationIntent.entities.preferredDate = policy.resolved.localDate;
            conversationIntent.entities.preferredTime = policy.resolved.localTime;
          }
        }
      } else if (requestedDate || requestedTime || requestedWeekday || requestedWeekdayIndex !== null) {
        const validation = ClinicWorkingHoursResolver.validateRequestedTime({
          requestedDate,
          requestedTime,
          weekdayIndex: requestedWeekdayIndex,
          weekdayName: requestedWeekday,
          schedule: hoursResolution.schedule,
          is24_7: hoursResolution.is24_7,
          clinicLanguage
        });

        console.log(JSON.stringify({
          event: "WORKING_HOURS_VALIDATION_CHECK",
          traceId: activeTraceId,
          clinicId: actualClinicId || clinicId,
          requestedDay: validation.requestedDay,
          requestedTime: validation.requestedTime,
          isValid: validation.isValid,
          reason: validation.reason
        }));

        debugLog.push(`appt_valid=${validation.isValid}`);

        if (!validation.isValid) {
          const fallbackMsg = validation.message || (
            validation.reason === "closed"
              ? `Belirttiğiniz gün kliniğimiz kapalıdır. Kliniğimizin çalışma saatleri: ${validation.scheduleSummary || ""}. Uygun olduğunuz başka bir gün ve saat paylaşabilir misiniz?`
              : `Belirttiğiniz ${validation.requestedTime || ""} saati kliniğimizin çalışma saatleri dışında kalmaktadır. Kliniğimizin çalışma saatleri: ${validation.scheduleSummary || ""}. Bu saatler içerisinden size uygun başka bir saat paylaşabilir misiniz?`
          );

          console.log("[widget-chat] Rejected appointment time:", { requestedDay: validation.requestedDay, requestedTime: validation.requestedTime });
          return respondWithVisibleReply(
            { responseType: "CHAT_REPLY", reply: fallbackMsg, conversationId: convId, pendingAppointmentData: appointmentDraft },
            basePersist({ appointmentState })
          );
        }
      }
    }

    // HYBRID SEARCH & QUERY REWRITING
    const sliceLimit = isDoctorIntent ? 15 : 10;
    
    // Dynamically import retrievalService to avoid edge runtime issues if applicable, but this is a node API route
    const { hybridSearch } = await import("@/lib/services/retrievalService");
    
    // YENİ: Override search query for specific price intents to guarantee deterministic RAG match
    let searchMessage = message;
    if (activePriceIntent === "examination_fee") {
      searchMessage = "ilk muayene ücreti ücretsiz muayene fiyatı bedava muayene mi";
    } else if (activePriceIntent === "xray_fee") {
      searchMessage = "röntgen ücreti ücretsiz röntgen fiyatı tomografi bedeli bedava mı";
    } else if (isServiceIntent) {
      searchMessage = "tedaviler uzmanlık alanları hizmetler işlemler servisler treatments procedures clinical specialties medical services";
    }

    perf.start("rag_hybrid_search");
    const topDocs = await hybridSearch(searchMessage, trainingDocs, clinicName, sliceLimit);
    perf.end("rag_hybrid_search", {
      topK: topDocs.length,
      trainingDocs: trainingDocs.length,
    });
    
    let knowledgeContext = topDocs.length > 0
      ? topDocs.map(d => `## ${d.title}\n${d.text}`).join("\n\n---\n\n")
      : "";
      
    // Safeguard: Hard limit knowledgeContext to prevent TPM / max context limits
    if (knowledgeContext.length > 15000) {
       knowledgeContext = knowledgeContext.substring(0, 15000) + "\n...[METİN KESİLDİ]";
    }

    debugLog.push(`topDocs=[${topDocs.slice(0, 4).map(d => d.title).join(", ")}]`);

    // Log detailed RAG matching data for debug
    if (topDocs.length > 0) {
      // Working hours validation is handled deterministically via ClinicWorkingHoursResolver before RAG search
      console.log(`[RAG-DEBUG] widget_clinic_id: ${clinicId}`);
      console.log(`[RAG-DEBUG] query_text: "${message}"`);
      topDocs.slice(0, 3).forEach((d, i) => {
        console.log(`[RAG-DEBUG] match_${i + 1} - title: "${d.title}", score: ${d.score.toFixed(3)}, vec: ${d.vectorScore.toFixed(3)}, kw: ${d.keywordScore.toFixed(3)}, content_preview: "${d.text.slice(0, 100).replace(/\n/g, ' ')}..."`);
      });
      console.log(`[RAG-DEBUG] final_context_sent_to_llm_length: ${knowledgeContext.length} chars`);
    }

    /* ── PRE-FLIGHT: detect live support intent BEFORE calling OpenAI ────── */
    const LIVE_SUPPORT_KEYWORDS = [
      // Turkish — explicit
      "canlı destek", "canli destek",
      "canlı birine", "canli birine",
      "canlı biriyle", "canli biriyle",
      "insana bağla", "insana bagla",
      "insan ile görüş", "insan ile goruş",
      "gerçek kişi", "gercek kisi",
      "biriyle görüşmek", "biriyle gorusmek",
      "klinikle iletişime", "klinikle iletisime",
      "sizinle görüşmek", "sizinle gorusmek",
      "ekiple görüşmek", "ekiple gorusmek",
      "yetkili", "müşteri temsilci", "musteri temsilci",
      "operatöre bağla", "operatore bagla",
      // Turkish — channel names
      "whatsapp", "telegram",
      // English
      "live support", "live chat", "real person", "human agent",
      "talk to someone", "speak to someone", "connect me",
      "contact clinic", "reach clinic",
    ];
    const msgLowerPre = message.toLowerCase();
    const userWantsLive = LIVE_SUPPORT_KEYWORDS.some(k => msgLowerPre.includes(k));

    if (userWantsLive) {
      debugLog.push("LIVE_SUPPORT_SHORT_CIRCUIT");

      // The decision must use the conversation’s currently selected or detected language
      const lang = activeLang;
      const contactNumber = clinicWhatsapp || "";
      const appointmentAlreadySubmitted =
        appointmentState === "APPOINTMENT_SUBMITTED" ||
        loadedState === "APPOINTMENT_SUBMITTED" ||
        loadedIsAppointmentCreated ||
        Boolean(loadedAppointmentId);

      const handoffMsg = formatLiveSupportHandoff({
        clinicName,
        contactNumber,
        locale: lang,
        appointmentAlreadySubmitted,
      });

      // Persist WhatsApp preference on an already-submitted appointment when possible
      if (appointmentAlreadySubmitted && adminDb && loadedAppointmentId) {
        try {
          const apptRef = adminDb
            .collection("clinics")
            .doc(actualClinicId)
            .collection("appointments")
            .doc(loadedAppointmentId);
          const existingAppt = (await apptRef.get()).data() || {};
          const noteLine = "Preferred contact method: WhatsApp";
          const prevNotes = String(existingAppt.notes || "");
          const notes = prevNotes.includes(noteLine)
            ? prevNotes
            : [prevNotes, noteLine].filter(Boolean).join("\n");
          await apptRef.set(
            stripUndefinedDeep({
              preferredContactChannel: "whatsapp",
              notes,
              updatedAt: new Date().toISOString(),
            }),
            { merge: true }
          );
        } catch (e: any) {
          console.error("[LIVE_SUPPORT] Failed to annotate appointment contact preference:", e?.message);
        }
      }

      const handoffPayload: any = {
        reply: handoffMsg,
        conversationId: convId,
        liveSupportRequired: true,
        clinicName,
        detectedLanguage: lang,
      };
      if (clinicWhatsapp) handoffPayload.whatsappNumber = clinicWhatsapp;
      if (clinicTelegram) handoffPayload.telegramLink   = clinicTelegram;

      debugLog.push(`liveSupport=short-circuit wa=${!!clinicWhatsapp} tg=${!!clinicTelegram} lang=${lang} apptSubmitted=${appointmentAlreadySubmitted}`);
      console.log("[widget-chat]", debugLog.join(" | "));

      return respondWithVisibleReply(handoffPayload, basePersist({
        isLiveSupport: true,
        // Do not rewind a submitted appointment into collecting/idle.
        appointmentState: appointmentAlreadySubmitted ? "APPOINTMENT_SUBMITTED" : appointmentState,
        appointmentId: loadedAppointmentId || undefined,
        isAppointmentCreated: appointmentAlreadySubmitted || undefined,
      }));
    }

    /* ── Normal AI call ───────────────────────────────────────────────── */
    const customPrompt  = promptSettings?.systemPrompt ?? "";
    const aiSkills      = (promptSettings?.aiSkills    ?? {}) as Record<string, boolean>;
    const guardrails    = (promptSettings?.guardrails   ?? {}) as Record<string, { enabled: boolean; text: string }>;
    const clinicTimeZone = "Europe/Istanbul"; // Default, could be dynamic later if clinic document provides it
    const nowForPrompt = new Date();
    const today = nowForPrompt.toLocaleDateString("tr-TR", {
      timeZone: clinicTimeZone,
      weekday: "long", year: "numeric", month: "long", day: "numeric",
    });

    /* Helper: skill is enabled when aiSkills entry is true OR not set (default on) */
    const skillOn = (id: string) => aiSkills[id] !== false;

    /* ── Capability-driven instruction blocks ── */
    const skillBlocks: string[] = [];

    // create_appointment_request — always injected if enabled (core UX)
    if (skillOn("create_appointment_request")) {
      // Phone is ALWAYS mandatory for AI Chatbot appointments regardless of clinic setting
      skillBlocks.push(`\nRANDEVU AKIŞI:
Kullanıcı randevu almak istediğinde (örn: "Randevu almak istiyorum", "Yarın diş beyazlatma", "Doktora görünmek istiyorum", vb.):
1. Şu bilgileri adım adım, tek tek ve DOĞAL bir dille topla (ZORUNLU SIRA):
   - Tedavi/İşlem Türü
   - Tercih edilen Tarih
   - Tercih edilen Saat (Eğer hasta saat belirtmediyse mutlaka şu soruyu sor: "Randevu talebinizi kliniğe doğru şekilde iletebilmem için tercih ettiğiniz saat veya saat aralığını da paylaşabilir misiniz?" Hasta saat belirtmeden devam etmek isterse boş bırakabilirsin.)
   - Ad ve Soyad
   - Telefon Numarası (ZORUNLU - isimden sonra telefonu sor, e-postadan ÖNCE)
   - E-posta Adresi (ZORUNLU - telefondan sonra e-postayı sor)
2. Eğer bir bilgi eksikse sadece o bilgiyi sor. (Aynı konuşmada daha önce verilen bir bilgiyi tekrar sorma).
3. Telefon numarası istemek için şu kalıbı kullan: "Kliniğimizin randevu talebinizle ilgili sizinle iletişime geçebilmesi için telefon numaranızı paylaşabilir misiniz?"
4. E-posta adresi geçerliliğini kontrol et (@ işareti, alan adı vs.). Hatalıysa: "E-posta adresinizde küçük bir eksiklik görünüyor. Klinik dönüşünü iletebilmemiz için adresinizi örneğin adiniz@example.com formatında tekrar paylaşabilir misiniz?" şeklinde nazikçe uyar.
5. ÖNEMLİ: Hem telefon hem e-posta ZORUNLU alanlarıdır. Hiçbir koşulda bu alanları toplamadan onay özetine geçme.
6. Tüm bilgiler tamam olunca MUTLAKA şu formatta özet ve onay iste:
   "Ön randevu talebinizin özeti:

   Ad Soyad: [isim]
   Telefon: [telefon]
   E-posta: [email]
   Hizmet: [hizmet]
   Tercih Edilen Tarih: [Tarihin Açık Hali (Örn: 27 Temmuz 2026 Pazartesi)]
   Kullanıcının Söylediği Orijinal Tarih: [Kullanıcının tam cümlesi veya kelimesi, örn: "Pazartesi" veya "Yarın" veya "Belirtilmedi"]
   Tercih Edilen Saat: [Tercih edilen saat. Sadece şu formatlardan birini kullan: Net saat ise "14:00", Aralık ise "10:00-12:00", Dönem ise "sabah" / "öğleden_sonra" / "akşamüstü" / "en_erken", Belirtilmediyse "Belirtilmedi"]

   Bu bilgilerle ön randevu talebinizi kliniğimizin değerlendirmesine iletmemi onaylıyor musunuz? Evet veya Hayır şeklinde yanıtlayabilirsiniz."
7. Kullanıcı "Evet" dediğinde sistem klinik onayına sunulmak üzere bir ÖN RANDEVU TALEBİ oluşturacak. 
   Kesinlikle "randevunuz oluşturuldu", "onaylandı" deme.
   Kapanış mesajı olarak şunu kullan: "Teşekkür ederim. Ön randevu talebiniz kliniğimizin değerlendirmesine iletildi. [Hizmet] işlemi için tercih ettiğiniz [Tarih], saat [Saat] bilgisi klinik ekibi tarafından değerlendirilecektir. Talebiniz henüz kesinleşmiş bir randevu değildir. Klinik ekibimiz talebinizi değerlendirdikten sonra sonucu paylaşmış olduğunuz e-posta adresine iletecektir."
8. ÖNEMLİ: Eğer randevu için kullanıcıdan bilgi (ad, telefon, tarih vb.) İSTİYORSAN veya onay özetini SUNUYORSAN, yanıtının en başına gizli bir etiket olarak [FLOW_ACTIVE] ekle. (Örn: "[FLOW_ACTIVE] Teşekkürler, telefon numaranızı da alabilir miyim?")`);
    } else {
      skillBlocks.push("\nNot: Randevu oluşturma özelliği bu klinik için şu an devre dışıdır. Randevu talepleri için kullanıcıyı kliniği doğrudan aramaya yönlendir.");
    }

    // send_patient_satisfaction_survey
    if (skillOn("send_patient_satisfaction_survey")) {
      skillBlocks.push("\nHASTA MEMNUNİYET ANKETİ: Randevu veya AI görüşmesi sonrasında uygun bir noktada kısa bir memnuniyet sorusu sor (örn: 'Görüşmemizden memnun kaldınız mı? 1-5 arası puan verebilir misiniz?'). Tıbbi sorular sırasında sorma.");
    }

    // collect_appointment_feedback
    if (skillOn("collect_appointment_feedback")) {
      skillBlocks.push("\nRANDEVU GERİ BİLDİRİMİ: Kullanıcı geçmiş randevusundan bahsederse deneyimi, doktor iletişimini ve hizmet kalitesini sorabilirsin.");
    }

    // follow_up_treatment_interest
    if (skillOn("follow_up_treatment_interest")) {
      skillBlocks.push("\nTEDAVİ İLGİSİ TAKİBİ: Kullanıcı bir tedaviye ilgi gösterip randevu almadan konuyu değiştirirse nazikçe hatırlat: 'Bu tedavi hakkında size daha fazla bilgi vermemi veya randevu ayarlamamı ister misiniz?'");
    }

    // clinic_policy_lookup
    if (skillOn("clinic_policy_lookup")) {
      skillBlocks.push("\nKLİNİK POLİTİKASI: Çalışma saatleri, iptal politikası, fiyatlandırma ve randevu kuralları hakkındaki sorularda önce bilgi havuzuna bak. Bulamazsan kliniği doğrudan aramalarını öner.");
    }

    // emergency_guidance — always active regardless of toggle
    skillBlocks.push("\nACİL DURUM: Hasta acil semptomlar tarif ederse (şiddetli ağrı, kanama, nefes darlığı vb.) TEŞHİS KOYMA. Doğrudan kliniği veya 112'yi aramasını söyle.");

    // knowledge_lookup — always active
    if (knowledgeContext) {
      skillBlocks.push(`\nKLİNİK BİLGİ HAVUZU:\n\n${knowledgeContext}`);
    } else {
      skillBlocks.push("\n(Bu klinik için henüz eğitim verisi eklenmemiş.)");
    }

    if (isLocationIntent) {
      skillBlocks.push("\nKONUM BİLGİSİ: Konum veya adres sorulduğunda, bilgi havuzunda bulunan semt, ilçe, şehir, yakındaki önemli noktalar (havalimanı vb.) gibi TÜM detayları açıkça belirt. Sadece şehri söyleyip geçme. Bilgi varsa gereksiz yere 'iletişime geçin' deme, adresi tam olarak yaz.");
    }

    if (isServiceIntent) {
      skillBlocks.push(`\nGENEL HİZMET TALEBİ: Kullanıcı kliniğin sunduğu genel hizmetleri / tedavileri soruyor. Yanıtını KLİNİK BİLGİ HAVUZU'ndaki tedavileri doğal ve hasta dostu bir şekilde özetleyerek oluştur. Belgelerin başlıklarını robotik bir liste gibi alt alta sıralama; benzer tedavileri mantıklı kategorilerde birleştirerek akıcı bir paragraf veya düzenli bir özet halinde sun.`);
    }

    if (activePriceIntent) {
      skillBlocks.push(`\nÖNEMLİ FİYATLANDIRMA KURALLARI:
1. "Ücretsiz" (free), geçerli ve doğrulanmış bir fiyat türüdür. Bilgi Havuzunda (Örn: "İlk muayene ücretsizdir") geçiyorsa "doğrulanmış bilgi mevcut değil" DEME, "fiyatlar muayene sonrası belli olur" DEME.
2. Soru muayene veya röntgen ücreti ise ve cevap "ücretsiz" ise, DOĞRUDAN net cevap ver: "İlk muayene kliniğimizde ücretsizdir." (veya bağlama uygun şekilde).
3. Soruya doğrudan cevap vermeden önce asla randevu akışını veya iletişim bilgisini öne çıkarma. Önce sorulan fiyat bilgisini / ücretsizlik bilgisini ver, sonra dilerse randevu alabileceğini belirt.`);
    }

    if (doctorContext) {
      skillBlocks.push(`\n${doctorContext}`);
    }

    if (treatmentContext) {
      skillBlocks.push(`\n${treatmentContext}`);
    }

    /* ── Guardrail blocks ── */
    const guardrailBlocks: string[] = [];
    if (guardrails?.noDiagnosis?.enabled !== false) {
      guardrailBlocks.push("- Kesinlikle tıbbi teşhis veya tedavi tavsiyesi verme.");
    }
    if (guardrails?.noAssumptions?.enabled !== false) {
      guardrailBlocks.push("- Hasta durumu hakkında net bilgi olmadan varsayımda bulunma.");
    }
    if (guardrails?.dataPrivacy?.enabled !== false) {
      guardrailBlocks.push("- Kişisel veya hassas sağlık verilerini paylaşma.");
    }

    /* ── System prompt construction ──
       When the clinic has provided a comprehensive custom prompt (e.g. İDA),
       it becomes the PRIMARY identity. Otherwise, use the default intro.
    */
    console.log("[NORMAL_LLM_CALL_STARTED]");
    const hasCustomPrompt = customPrompt && customPrompt.trim().length > 0;

    const systemPrompt = [
      // ── PRIMARY IDENTITY ──
      hasCustomPrompt
        ? customPrompt   // Custom prompt IS the identity (e.g. "Your name is İDA...")
        : `Sen ${clinicName}'nin dijital hasta asistanısın.`,

      // ── Date context & Clinic Info (always injected) ──
      `\n\nBugünün tarihi ve saati: ${today}.`,
      clinicWhatsapp ? `\nKlinik İletişim Numarası (WhatsApp / Telefon): ${clinicWhatsapp}` : "",

      // ── Skill and knowledge blocks ──
      ...skillBlocks,

      // ── Guardrails ──
      guardrailBlocks.length > 0 ? `\nEK GÜVENLİK KURALLARI:\n${guardrailBlocks.join("\n")}` : "",

      // ── System-level rules ──
      `\nSİSTEM KURALLARI:
- LANGUAGE INVARIANT (MANDATORY): Active conversation language is "${conversationLocale}". Always reply in this language. Do NOT switch to English (or any other language) because the latest user message is short, contains "WhatsApp"/brand names, numbers, dates, yes/no, or mixed proper nouns. Only switch language when the user explicitly asks to change languages.
- ÖNEMLİ: A polite closing, appreciation message, or temporary end of conversation ("Teşekkürler", "Tamamdır", "Thanks") does NOT prevent the user from continuing the conversation. If the user asks a new question after a closing message, immediately resume normal assistant behavior, treat it as a fresh active query, and always respond factually based on the clinic's Knowledge Base, ignoring the fact that the conversation recently seemed 'closed'.
- Kesin randevu onayı veya kesin müsaitlik garantisi VERME.
- Yanıt dilini aktif konuşma diline ("${conversationLocale}") göre belirle.${!hasCustomPrompt ? "\n- Yanıtların kısa (max 4 cümle), nazik olsun." : "\n- Yanıt uzunluğunu kendi talimatlarına göre belirle; bilgi varsa eksiksiz aktar."}
- Eğer mevcut konuşmanın bağlamıyla DOĞRUDAN ilgili ve kullanıcının seçebileceği 2 veya 3 kısa hızlı aksiyon önerebiliyorsan, yanıtının EN SONUNA şu formatta ekle: [ACTIONS: Aksiyon 1 | Aksiyon 2]
- Bu aksiyonlar kesinlikle kullanıcının diliyle eşleşmelidir (Türkçe konuşmada "Randevu almak istiyorum", "Hangi hizmetleri sunuyorsunuz?", "Kliniğiniz nerede?" gibi olmalı. "Book an appointment" gibi İngilizce kalıpları Türkçe konuşmada KULLANMA).
- SADECE mantıklıysa öner. Randevu akışı başladıysa (isim/telefon soruluyorsa veya onay bekleniyorsa) genel tedavi komutları GÖSTERME.
- [ACTIONS: ...] etiketi DAİMA en sonda olsun ve tek satırda olsun.

GLOBAL RESPONSE STRATEGY (HYBRID KNOWLEDGE):
1. EĞİTİCİ GENEL BİLGİ (Global Dental Knowledge): Hasta genel bir diş/sağlık sorusu sorarsa (Örn: "Vidasız implant nedir?", "Kanal tedavisi ne kadar sürer?"), soruyu ÖNCE genel tıbbi bilgi havuzunla eğitici bir dille açıkla. Kesinlikle teşhis koyma ve tedavi önerme. Genel bilgi, bu kliniğin o işlemi yaptığını kanıtlamaz.
2. KLİNİK BİLGİSİ DOĞRULAMA (Clinic Knowledge Base / Overview): Klinik-spesifik iddialar (bu klinikte var mı, hangi doktor, fiyat, süre, marka) YALNIZCA Bilgi Havuzu, klinik overview/summary veya yapısal kayıtlardan doğrulansın. Doğrulandıysa doğal şekilde onayla.
3. BİLİNMEYEN DURUM (Clinic-scoped Safety Fallback): Klinik kaydı yoksa ASLA "hiç bilgim yok" / "I have no information" deme ve ağ/başka klinik iddiası uydurma. Bunun yerine: "Genel olarak şöyle açıklanır; kliniğimizde bu tekniğin/markanın uygulanıp uygulanmadığını mevcut kayıtlarımızdan kesin doğrulayamıyorum. Dilerseniz klinik ekibimizden teyit edilmesini sağlayabilirim."
4. YARDIMCI DEVAM (Helpful Continuation): Bilgi eksikliğinde sohbeti çıkmaza sokma. Randevu veya klinik ekibine iletim gibi tek bir yardımcı sonraki adım öner.
5. ORTA AKIŞ KESİNTİSİ: Randevu bilgisi toplanırken soru gelirse önce soruyu yanıtla, sonra kaldığınız alandan nazikçe devam et.`,
    ].join("");

    debugLog.push("calling OpenAI...");
    const chatModel = promptSettings?.model ?? "gpt-4o-mini";
    const temperatureResolved = resolveEffectiveAITemperature({
      rawTemperature: promptSettings?.temperature,
      model: chatModel,
    });
    console.log("[widget-chat] capabilities:", {
      skills: Object.fromEntries(Object.entries(aiSkills).map(([k,v]) => [k, v ? "ON" : "OFF"])),
      guardrails: Object.fromEntries(Object.entries(guardrails).map(([k,v]: any) => [k, v?.enabled ? "ON" : "OFF"])),
      skillBlockCount: skillBlocks.length,
      effectiveTemperature: temperatureResolved.effectiveTemperature,
      temperatureSource: temperatureResolved.source,
    });
    perf.start("llm_chat");
    const completion = await trackableAIRequest({
      clinicId,
      conversationId: convId,
      channel: toAIUsageChannel(channel),
      requestType: "chat",
      language: conversationLocale,
      model: chatModel,
      temperature: temperatureResolved.temperature,
      omitTemperature: temperatureResolved.omitFromRequest,
      temperatureSource: temperatureResolved.source,
      maxTokens:   600,
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-12).map((h: any) => ({
          role:    h.role as "user" | "assistant",
          content: h.content,
        })),
        { role: "user", content: message },
      ],
    });
    perf.end("llm_chat", {
      model: chatModel,
      durationMs: (completion as any).durationMs ?? null,
    });

    let reply = completion.content?.trim()
      || "Üzgünüm, şu an yanıt üretemiyorum.";

    // Strip markdown formatting characters (**, *, #) as requested
    reply = reply.replace(/\*\*|\*|#/g, '');

    // HARD FORBIDDEN PHRASES FOR NORMAL CHAT
    // Normal chat must never claim the appointment was successfully sent.
    const forbiddenClaims = [
      "randevu talebiniz iletildi",
      "kliniğimize ilettim",
      "talebiniz oluşturuldu",
      "randevunuz kaydedildi",
      "başarıyla gönderildi",
      "değerlendirmesine iletildi",
      "sisteme kaydedildi",
      "kliniğe iletildi",
      "randevu onaylandı"
    ];
    
    // We only do this if it's the general LLM flow, which it is here.
    if (forbiddenClaims.some(claim => reply.toLowerCase().includes(claim.toLowerCase()))) {
      console.warn("[FORBIDDEN_CLAIM_INTERCEPTED] LLM tried to claim success without transaction:", reply);
      
      // AŞAMA 7 - State'e göre dinamik fallback metni
      if (appointmentState === "AWAITING_CONFIRMATION" || loadedState === "AWAITING_CONFIRMATION") {
         reply = "Randevu talebinizi oluşturabilmem için yukarıdaki bilgileri onaylamanız gerekiyor.";
      } else if (appointmentState.startsWith("COLLECTING_")) {
         reply = "Lütfen eksik randevu bilgilerinizi tamamlayınız.";
      } else {
         reply = "Randevu talebiniz şu anda oluşturulamadı. Lütfen kısa bir süre sonra yeniden deneyin veya klinikle doğrudan iletişime geçin.";
      }
    }

    let suggestedActions: string[] = [];
    const actionsMatch = reply.match(/\[ACTIONS:\s*(.*?)\]/);
    if (actionsMatch) {
      suggestedActions = actionsMatch[1].split("|").map(a => a.trim()).filter(Boolean);
      reply = reply.replace(actionsMatch[0], "").trim();
    }

    // HARD VALIDATION for Doctor Intent (Preventing Hallucinations)
    if (isDoctorIntent) {
      const lowerReply = reply.toLowerCase();
      // We removed the unconditional override so that the AI can successfully pull doctors from the Knowledge Base.
    }

    let isAiResponseFlowActive = false;
    if (reply.includes("[FLOW_ACTIVE]")) {
      // Strip the marker always so it never reaches the patient.
      reply = reply.replace(/\[FLOW_ACTIVE\]/g, "").trim();

      // LLM tags are phrasing hints only. They may not open appointment collection
      // unless the shared gate would allow a start for this patient message.
      const flowActiveGate = evaluateAppointmentCollectionGate({
        message,
        intent: conversationIntent.intent,
        isAppointmentFlowActive: appointmentState !== "IDLE" && appointmentState !== "APPOINTMENT_SUBMITTED",
        entities: conversationIntent.entities,
      });

      if (flowActiveGate.allowed) {
        isAiResponseFlowActive = true;
        if (appointmentState === "IDLE") {
          appointmentState = "COLLECTING_INFO";
        }
        console.log(JSON.stringify({
          checkpoint: "FLOW_ACTIVE_HONORED",
          traceId: activeTraceId,
          conversationId: convId,
          clinicId: actualClinicId,
          gateReason: flowActiveGate.reason,
          appointmentState,
        }));
      } else {
        console.log(JSON.stringify({
          checkpoint: "FLOW_ACTIVE_IGNORED",
          traceId: activeTraceId,
          conversationId: convId,
          clinicId: actualClinicId,
          candidateIntent: conversationIntent.intent,
          gateReason: flowActiveGate.reason,
        }));
      }
    }

    // GROUNDEDNESS CHECK
    // Only check if we retrieved RAG context and the AI didn't already use the safe fallback
    const hasApptEntitiesPresent = Boolean(
      conversationIntent.entities?.email ||
      conversationIntent.entities?.phone ||
      conversationIntent.entities?.fullName ||
      conversationIntent.entities?.preferredDate ||
      conversationIntent.entities?.preferredTime ||
      appointmentDraft.patientEmail ||
      appointmentDraft.patientPhone
    );
    const isStateActive =
      appointmentState !== "IDLE" ||
      isAiResponseFlowActive ||
      conversationIntent.intent === "appointment_start" ||
      conversationIntent.intent === "appointment_continuation" ||
      conversationIntent.intent === "appointment_confirmation" ||
      conversationIntent.intent === "appointment_correction" ||
      hasApptEntitiesPresent;

    const isPricingOrInfoIntent =
      conversationIntent.intent === "pricing_request" ||
      conversationIntent.intent === "treatment_information" ||
      conversationIntent.intent === "quote_request";

    if (knowledgeContext.length > 0 && !reply.includes("doğrulamıyorum") && !reply.includes("erişemediğim") && !isDoctorIntent && !isStateActive && !isServiceIntent && !isPricingOrInfoIntent) {
      const { validateGroundedness } = await import("@/lib/services/retrievalService");
      
      const fullContextForValidation = doctorContext ? `${knowledgeContext}\n\n${doctorContext}` : knowledgeContext;
      perf.start("groundedness");
      const validation = await validateGroundedness(reply, fullContextForValidation);
      perf.end("groundedness", { isGrounded: validation.isGrounded });
      if (!validation.isGrounded) {
         console.warn(`[Groundedness Failed] Reason: ${validation.reason}\nReply: ${reply}`);
         if (activeLang === "tr") {
            reply = "Bu bilgiyi şu online güvenilir şekilde doğrulayamıyorum. Yanlış yönlendirmemek için klinik ekibimizden teyit edilmesi gerekir.";
         } else if (activeLang === "de") {
            reply = "Ich kann diese Informationen im Moment nicht zuverlässig überprüfen. Dies muss von unserem Klinikteam bestätigt werden, um Sie nicht falsch zu informieren.";
         } else {
            reply = "I cannot reliably verify this information at the moment. It needs to be confirmed by our clinic team to avoid misleading you.";
         }
      }
    }

    if (isMidFlowInterruption) {
      const missingSlots = ConversationStateEngine.getMissingSlots({
        treatment: appointmentDraft.requestedService || undefined,
        preferredDate: appointmentDraft.requestedDate || undefined,
        preferredTime: appointmentDraft.requestedTime || undefined,
        fullName: appointmentDraft.patientName || undefined,
        phone: appointmentDraft.patientPhone || undefined,
        email: appointmentDraft.patientEmail || undefined
      });
      const resumePrompt = ConversationStateEngine.generateNextSlotPrompt(
        {
          treatment: appointmentDraft.requestedService || undefined,
          preferredDate: appointmentDraft.requestedDate || undefined,
          preferredTime: appointmentDraft.requestedTime || undefined,
          fullName: appointmentDraft.patientName || undefined,
          phone: appointmentDraft.patientPhone || undefined,
          email: appointmentDraft.patientEmail || undefined
        },
        missingSlots,
        conversationLocale
      );
      const bridge = conversationLocale.startsWith("en")
        ? "Whenever you're ready, we can continue from where we left off."
        : "Hazır olduğunuzda kaldığımız yerden devam edebiliriz.";
      reply = `${reply}\n\n${bridge}\n\n${resumePrompt}`;
    }

    debugLog.push(`OK reply="${reply.slice(0, 60)}" ms=${Date.now() - startTime}`);
    console.log("[widget-chat]", debugLog.join(" | "));
    perf.log({
      path: "llm_rag_response",
      intent: conversationIntent.intent,
      historyTurns: Array.isArray(history) ? history.length : 0,
      trainingDocs: trainingDocs.length,
      topDocs: topDocs.length,
      wallClockMs: Date.now() - startTime,
    });

    // ── AŞAMA 6: RESPONSE CONTRACT DEFAULTLARI ──
    const responsePayload: any = { 
      reply, 
      conversationId: convId,
      success: true,
      responseType: isMidFlowInterruption ? "appointment_information_required" : "chat_message",
      appointmentCreated: false,
      pendingAppointmentData: isMidFlowInterruption ? appointmentDraft : undefined
    };

    if (suggestedActions.length > 0) {
      responsePayload.suggestedActions = suggestedActions;
    }

    // ── AŞAMA 2: Parse regardless of isConfirmSummary ──
    // ── AŞAMA 2: Parse regardless of isConfirmSummary ──
    const nameMatch    = reply.match(/(?:Ad Soyad|Ad|Name|İsim):\s*([^\n\r]+)/i);
    const phoneMatch   = reply.match(/(?:Telefon|Phone|Tel):\s*([0-9\s+\-().]+)/i);
    const emailMatch   = reply.match(/(?:E-posta|Email|Mail|E-mail):\s*([^\n\r\s]+)/i);
    const serviceMatch = reply.match(/(?:Hizmet|Service|Tedavi):\s*([^\n\r]+)/i);
    const dtMatch      = reply.match(/(?:Tercih Edilen Tarih|Tarih|Date):\s*([^\n\r]+)/i);
    const rawDateMatch = reply.match(/(?:Kullanıcının Söylediği Orijinal Tarih|Orijinal Tarih|Raw Date):\s*([^\n\r]+)/i);
    const timeMatch    = reply.match(/(?:Saat|Time):\s*([^\n\r]+)/i);

    const dtStr  = dtMatch?.[1]?.trim() ?? "";
    const rawDateText = rawDateMatch?.[1]?.trim() ?? "";
    const rawTimeStr = timeMatch?.[1]?.trim() ?? "";
    // SERVER-SIDE DETERMINISTIC DATE VALIDATION has been moved to the AWAITING_DATE_CLARIFICATION interceptor
    
    // Clean up the reply so we don't expose the hidden raw date prompt instruction to the user
    reply = reply.replace(/(?:Kullanıcının Söylediği Orijinal Tarih|Orijinal Tarih|Raw Date):\s*([^\n\r]+)[\n\r]*/i, "");

    const parsedTime = parseTimeText(rawTimeStr);

    const pending: AppointmentData = {
      patientName:      nameMatch?.[1]?.trim()    ?? "",
      patientPhone:     phoneMatch?.[1]?.replace(/\s+/g, "").trim() ?? "",
      patientEmail:     emailMatch?.[1]?.trim().toLowerCase() ?? "",
      requestedService: serviceMatch?.[1]?.trim() ?? "Genel Muayene",
      requestedDate:    dtStr,
      requestedTime:    parsedTime.preferredTime,
      preferredTimeStart: parsedTime.preferredTimeStart,
      preferredTimeEnd: parsedTime.preferredTimeEnd,
      preferredTimePeriod: parsedTime.preferredTimePeriod,
      preferredTimeText: parsedTime.preferredTimeText,
      originalText:     reply,
      requestedDoctor:  appointmentDraft.requestedDoctor,
      notes:            appointmentDraft.notes,
    };

    const appointmentDataComplete = 
      Boolean(pending.patientName) && 
      Boolean(pending.patientPhone) && 
      Boolean(pending.requestedDate) && 
      Boolean(pending.requestedTime || pending.preferredTimeText);

    // ── AŞAMA 1: ACİL CASE-INSENSITIVE HOTFIX ──
    const normalizedReply = reply.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
    const containsConfirmationQuestion =
      normalizedReply.includes("onaylıyor musunuz") ||
      normalizedReply.includes("onaylar mısınız") ||
      normalizedReply.includes("onaylayabilir misiniz") ||
      normalizedReply.includes("iletmemi onaylıyor musunuz") ||
      normalizedReply.includes("iletmemi ister misiniz") ||
      normalizedReply.includes("bilgiler doğru mu") ||
      normalizedReply.includes("bilgileriniz doğru mu") ||
      normalizedReply.includes("shall i forward") ||
      normalizedReply.includes("would you like me to forward") ||
      normalizedReply.includes("do you confirm") ||
      normalizedReply.includes("onaylıyor") ||
      normalizedReply.includes("onaylay") ||
      normalizedReply.includes("confirm");

    const appointmentAlreadyCreated = loadedState === "CREATED" || loadedState === "COMPLETED";
    const isAppointmentIntentDetected = !isMidFlowInterruption && (isAppointmentFlowActive || appointmentState !== "IDLE" || /\b(randevu|appointment)\b/i.test(reply));

    const shouldAwaitConfirmation = 
      !isMidFlowInterruption &&
      isAppointmentIntentDetected &&
      appointmentDataComplete &&
      !appointmentAlreadyCreated;

    const isConfirmSummary = !isMidFlowInterruption && (shouldAwaitConfirmation || containsConfirmationQuestion);

    if (isConfirmSummary && pending.patientName && (pending.patientPhone || pending.patientEmail)) {
      
      const tzResolved = resolveClinicTimeZone(clinicData);
      const timeZone = tzResolved.confident ? tzResolved.timeZone : "Europe/Istanbul";
      const currentClinicDateTime = new Date();

      console.log(JSON.stringify({
         event: "APPOINTMENT_DATE_VALIDATION_START",
         traceId: activeTraceId,
         conversationId: convId,
         rawDateText: rawDateText,
         rawTimeText: rawTimeStr,
         inferredDate: pending.requestedDate,
         inferredTime: pending.requestedTime,
         timeZone,
         clinicTimeZoneSource: tzResolved.source,
         currentClinicDateTime
      }));

      const dateValidation = AppointmentDateValidator.validateAppointmentDateConsistency({
         rawDateText: rawDateText && rawDateText.toLowerCase() !== "belirtilmedi" ? rawDateText : dtStr,
         rawTimeText: rawTimeStr,
         inferredDate: pending.requestedDate,
         inferredTime: pending.requestedTime,
         currentClinicDateTime,
         timeZone
      });

      // Additional policy gate before showing confirmation summary
      if (dateValidation.isValid && !dateValidation.hasConflict && pending.requestedDate && pending.requestedTime) {
        const hoursRes = ClinicWorkingHoursResolver.resolveClinicWorkingHours({
          clinicId: actualClinicId || clinicId,
          clinicData,
          trainingDocs,
        });
        const policy = validateAppointmentDateTime({
          localDate: dateValidation.resolvedDate || pending.requestedDate,
          localTime: dateValidation.resolvedTime || pending.requestedTime,
          rawUserInput: message,
          clinicTimeZone: timeZone,
          now: currentClinicDateTime,
          workingHours: hoursRes.schedule,
          is24_7: hoursRes.is24_7,
          minimumNoticeMinutes: 0,
          locale: conversationLocale,
        });
        if (!policy.ok) {
          responsePayload.responseType = "appointment_date_clarification_required";
          responsePayload.reply = policy.message;
          responsePayload.pendingAppointmentData = {
            ...pending,
            requestedDate: undefined,
            requestedTime: undefined,
          };
          appointmentState = "COLLECTING_DATE";
          appointmentDraft = responsePayload.pendingAppointmentData;
          return respondWithVisibleReply(responsePayload, basePersist({
            appointmentState: "COLLECTING_DATE",
          }));
        }
        if (policy.resolved) {
          pending.requestedDate = policy.resolved.localDate;
          pending.requestedTime = policy.resolved.localTime;
          (pending as any).startsAtUtc = policy.resolved.startsAtUtc;
          (pending as any).clinicTimeZone = policy.resolved.clinicTimeZone;
        }
      }

      console.log(JSON.stringify({
         event: "APPOINTMENT_DATE_VALIDATION_RESULT",
         traceId: activeTraceId,
         mentionedWeekday: dateValidation.mentionedWeekday,
         resolvedDate: dateValidation.resolvedDate,
         resolvedWeekday: dateValidation.resolvedWeekday,
         resolvedTime: dateValidation.resolvedTime,
         isValid: dateValidation.isValid,
         hasConflict: dateValidation.hasConflict,
         conflictType: dateValidation.conflictType
      }));

      if (dateValidation.requiresClarification) {
          responsePayload.responseType = "appointment_date_clarification_required";
          responsePayload.reply = dateValidation.clarificationMessage || "Tarih ve saat anlaşılamadı. Lütfen tekrar belirtin.";
          responsePayload.pendingAppointmentData = pending;
          
          appointmentState = "AWAITING_DATE_CLARIFICATION";
          appointmentDraft = pending;
          
          await saveAppointmentState(adminDb, actualClinicId, convId, appointmentVersion, "AWAITING_DATE_CLARIFICATION", appointmentDraft, { 
             processedMessageIds: [...processedMessageIds, messageId],
             dateAlternatives: dateValidation.alternatives,
             conversationLocale
          });
          
          console.log(JSON.stringify({
             event: "APPOINTMENT_DATE_CONFLICT_BLOCKED",
             traceId: activeTraceId,
             conversationId: convId,
             conflictType: dateValidation.conflictType,
             alternativesCount: dateValidation.alternatives?.length,
             nextState: "AWAITING_DATE_CLARIFICATION"
          }));

          return respondWithVisibleReply(responsePayload, basePersist({
            appointmentState: "AWAITING_DATE_CLARIFICATION",
          }));
      }

      // V2 Validation passed or was automatically deterministically resolved
      pending.requestedDate = dateValidation.resolvedDate || pending.requestedDate;
      // Also update the display text to be perfectly canonical
      const canonicalLabel = dateValidation.resolvedDate && dateValidation.resolvedWeekday ? 
         `${dateValidation.resolvedDate} ${dateValidation.resolvedWeekday}` : pending.requestedDate;
      
      // We overwrite the raw inputs so they don't leak into the summary incorrectly
      pending.requestedDate = canonicalLabel.split(" ")[0]; // just ISO
      (pending as any).requestedWeekday = conversationLocale.startsWith("en") ? (dateValidation.resolvedWeekdayEn || dateValidation.resolvedWeekday) : dateValidation.resolvedWeekday;

      // Construct a clean, canonical localized summary
      const summaryMsg = buildAppointmentReviewMessage({
        locale: conversationLocale,
        appointmentData: {
          ...pending,
          requestedDate: dateValidation.resolvedDate || pending.requestedDate,
          requestedWeekday: conversationLocale.startsWith("en") ? (dateValidation.resolvedWeekdayEn || dateValidation.resolvedWeekday) : dateValidation.resolvedWeekday,
          requestedTime: dateValidation.resolvedTime || pending.requestedTime
        },
        clinicName
      });
      
      const actionDesc = conversationLocale.startsWith("en") ? "Preliminary appointment confirmation summary" : "Randevu onay özeti";
      const pendingAction = PendingActionManager.createPendingAction("submit_appointment", pending, undefined, actionDesc);

      responsePayload.reply = summaryMsg;
      responsePayload.pendingAppointmentData = pending;
      responsePayload.pendingAction = pendingAction;
      responsePayload.responseType = "appointment_confirmation_required";
      
      const previousState = appointmentState;
      appointmentState = "AWAITING_CONFIRMATION";
      appointmentDraft = pending;

      console.log(JSON.stringify({
        checkpoint: "APPT_STATE_TRANSITION",
        traceId: activeTraceId,
        conversationId: convId,
        previousState,
        nextState: "AWAITING_CONFIRMATION",
        reason: "isConfirmSummary_detected",
        appointmentDataComplete,
        containsConfirmationQuestion
      }));
    } else if (isAppointmentIntentDetected && !appointmentDataComplete && !appointmentAlreadyCreated) {
      responsePayload.responseType = "appointment_information_required";
    }

    // Detect and establish pendingAction for any assistant follow-up questions/offers
    if (!responsePayload.pendingAction && responsePayload.reply) {
      const offeredAction = PendingActionManager.detectOfferedAction(responsePayload.reply);
      if (offeredAction) {
        responsePayload.pendingAction = PendingActionManager.createPendingAction(
          offeredAction,
          {},
          undefined,
          `Assistant offer: ${offeredAction}`
        );
      }
    }

    if (adminDb && actualClinicId && convId && (appointmentState !== "IDLE" || responsePayload.pendingAction)) {
        try {
            await saveAppointmentState(adminDb, actualClinicId, convId, appointmentVersion, appointmentState, appointmentDraft, {
              processedMessageIds: [...processedMessageIds, messageId],
              pendingAction: responsePayload.pendingAction || null,
              conversationLocale
            });
        } catch (e: any) {
            console.error("[chat API] Error saving deterministic state at end of flow:", e.message);
        }
    }

    return respondWithVisibleReply(responsePayload, basePersist({
      apptData: isConfirmSummary ? responsePayload.pendingAppointmentData : null,
      promptVersionId: "production",
      knowledgeBaseId: "default",
      retrievedDocumentCount: trainingDocs.length,
      fallbackReason: String(responsePayload.reply || "").includes("doğrulayamıyorum") ? "groundedness_failure" : "",
      appointmentState,
    }));


}
