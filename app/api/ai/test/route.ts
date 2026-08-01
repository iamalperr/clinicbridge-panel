import { NextResponse } from "next/server";
import { trackableAIRequest } from "@/lib/services/aiGateway";
import { getAdminDb } from "@/lib/firebase-admin";
import { resolveContactNumber } from "@/lib/utils/contact-resolver";
import {
  IntentRouter,
  SlotExtractor,
  ConversationStateEngine,
  ConversationFeatureFlags,
  ConversationLogger,
  ConversationState,
  ConversationSlots,
  formatPricingFallback,
  formatContactResponse
} from "@/lib/conversation";
import { ClinicWorkingHoursResolver } from "@/lib/skills";

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    const { clinicId, messages, userMessage, settings, patientConsent, language, source, requestId } = await req.json();

    // ── 1. clinicId validation — block everything without it ──
    if (!clinicId) {
      const errorMsg = language === "en"
        ? "AI test could not be started. Clinic information is unavailable."
        : "AI testi başlatılamadı. Klinik bilgisi alınamadı.";
      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    if (patientConsent !== true) {
      return NextResponse.json(
        { error: "KVKK onayı olmadan AI hizmeti kullanılamaz." },
        { status: 403 }
      );
    }

    if (!settings || (!userMessage && !messages)) {
      return NextResponse.json(
        { error: "settings and either userMessage or messages are required" },
        { status: 400 }
      );
    }

    // ── 2. Clinic lookup — load clinic context from Firestore ──
    const adminDb = getAdminDb();
    let clinicName = "Klinik";
    let clinicLanguage = language || "tr";
    let clinicData: any = {};
    let trainingDocs: Array<{ title: string; content: string }> = [];

    if (adminDb) {
      try {
        const [clinicSnap, materialsSnap] = await Promise.all([
          adminDb.collection("clinics").doc(clinicId).get(),
          adminDb.collection("trainingMaterials").where("clinicId", "==", clinicId).limit(250).get()
        ]);

        if (clinicSnap.exists) {
          clinicData = clinicSnap.data() || {};
          clinicName = clinicData.name ?? "Klinik";
          clinicLanguage = clinicData.language ?? clinicLanguage;
        }

        trainingDocs = materialsSnap.docs.map(d => ({
          title: d.data().title ?? "",
          content: d.data().content ?? ""
        }));
      } catch (dbErr: any) {
        console.error(`[ai-test] Clinic lookup failed for ${clinicId}:`, dbErr.message);
      }
    }

    // Resolve contact number dynamically based on conversation language
    const effectivePhone = resolveContactNumber(clinicData, clinicLanguage, trainingDocs);

    // ── 3. Reconstruct Conversation State & Slots from Chat History ──
    const chatHistory: Array<{ role: "user" | "assistant" | "system"; content: string }> =
      messages && Array.isArray(messages)
        ? messages.map((m: any) => ({ role: m.role, content: m.content }))
        : [{ role: "user", content: userMessage || "" }];

    const lastUserMessage = chatHistory.filter(m => m.role === "user").pop()?.content || userMessage || "";
    const msgLower = lastUserMessage.toLowerCase();

    // Accumulate slots and track multi-turn context
    const accumulatedSlots: Partial<ConversationSlots> = {};
    let inferredState: ConversationState = "INITIAL";
    let activeTreatment: string | undefined;
    let activeTopic: string | undefined;

    for (const item of chatHistory) {
      if (item.role === "user") {
        const ext = SlotExtractor.extractSlots(item.content, accumulatedSlots, clinicLanguage);
        Object.assign(accumulatedSlots, ext.extracted);
        if (ext.extracted.treatment) {
          activeTreatment = ext.extracted.treatment;
        }
        if (/\b(randevu|appointment|book|schedule)\b/i.test(item.content)) {
          inferredState = "APPOINTMENT_COLLECTION";
        }
      }
    }

    // Step 4: Classify Intent using Shared Intent Router
    const intentResult = IntentRouter.classifyConversationIntent({
      message: lastUserMessage,
      conversationHistory: chatHistory,
      currentState: inferredState,
      collectedSlots: accumulatedSlots,
      activeTreatment,
      activeTopic,
      clinicContext: {
        clinicId,
        clinicName,
        turkishContactNumber: clinicData.turkishContactNumber,
        internationalContactNumber: clinicData.internationalContactNumber
      },
      locale: clinicLanguage
    });

    // Step 5: Process State Transition
    const transition = ConversationStateEngine.processTransition(
      {
        clinicId,
        clinicName,
        conversationId: requestId || `test_${Date.now()}`,
        channel: "admin",
        locale: clinicLanguage,
        currentState: inferredState,
        slots: accumulatedSlots,
        history: chatHistory
      },
      intentResult
    );

    const isEn = clinicLanguage.toLowerCase().startsWith("en");

    // Observability Logging
    ConversationLogger.log({
      conversationId: requestId || `test_${Date.now()}`,
      channel: "admin_portal",
      clinicId,
      previousState: transition.previousState,
      detectedIntent: intentResult.intent,
      confidence: intentResult.confidence,
      extractedSlots: transition.updatedSlots,
      requiresKnowledgeBase: intentResult.requiresKnowledgeBase,
      nextState: transition.nextState,
      processingDurationMs: Date.now() - startTime
    });

    // ── 6. Handle Contextual Disambiguation / Clarification Options ──
    if (intentResult.clarificationNeeded && intentResult.clarificationPrompt) {
      return NextResponse.json({
        message: intentResult.clarificationPrompt,
        quickReplies: intentResult.suggestedOptions || []
      });
    }

    // ── 7. Handle Direct Safety / Live Support / Contact / Complaint Intents ──
    if (intentResult.intent === "emergency") {
      const emMsg = isEn
        ? `⚠️ If you are experiencing a medical emergency, severe pain, or bleeding, please immediately contact the nearest emergency room or call emergency services (112). You can also contact our clinic directly at ${effectivePhone || "our phone line"}.`
        : `⚠️ Acil bir durum, şiddetli ağrı veya kanama yaşıyorsanız lütfen derhal en yakın acil servise başvurun veya 112 Acil Yardım hattını arayın. Kliniğimize doğrudan ${effectivePhone || "telefon numaramızdan"} ulaşabilirsiniz.`;
      return NextResponse.json({ message: emMsg });
    }

    if (intentResult.intent === "complaint") {
      const phoneStr = effectivePhone ? ` (${effectivePhone})` : "";
      const complaintMsg = isEn
        ? `We apologize for any inconvenience you may have experienced. Your satisfaction is very important to us. Our clinic team is available to assist you directly${phoneStr}. Would you like us to have a representative contact you?`
        : `Yaşadığınız aksaklık veya gecikme için çok özür dileriz. Memnuniyetiniz bizim için çok önemlidir. Klinik ekibimize doğrudan${phoneStr} numarasından ulaşabilirsiniz. Dilerseniz yetkili bir temsilcimizin size ulaşmasını da sağlayabiliriz.`;
      return NextResponse.json({
        message: complaintMsg,
        quickReplies: isEn ? ["Call Clinic", "Continue Appointment"] : ["Kliniği Ara", "Randevuya Devam Et"]
      });
    }

    if (intentResult.intent === "contact_request" || intentResult.intent === "live_support_request") {
      const contactMsg = formatContactResponse(effectivePhone, intentResult.entities.contactTarget, clinicLanguage);
      return NextResponse.json({
        message: contactMsg,
        quickReplies: isEn ? ["Call Clinic", "Book Appointment"] : ["Kliniği Ara", "Randevu Al"]
      });
    }

    // ── 8. Handle Active Appointment Progression (Pure Slot Step - Zero Hallucination) ──
    if (
      (intentResult.intent === "appointment_continuation" ||
        intentResult.intent === "appointment_start" ||
        intentResult.intent === "appointment_correction") &&
      !intentResult.requiresKnowledgeBase
    ) {
      const ackText = ConversationStateEngine.getSlotAcknowledgment(intentResult.entities, clinicLanguage);
      const nextPrompt = ConversationStateEngine.generateNextSlotPrompt(
        transition.updatedSlots,
        transition.missingRequiredSlots,
        clinicLanguage,
        ackText
      );

      const quickReplies: string[] = [];
      if (transition.missingRequiredSlots.length === 0) {
        quickReplies.push(isEn ? "Yes, I Confirm" : "Evet, Onaylıyorum");
        quickReplies.push(isEn ? "No, Change Details" : "Hayır, Düzenlemek İstiyorum");
      } else if (transition.missingRequiredSlots[0] === "preferredTime") {
        quickReplies.push(isEn ? "Morning" : "Sabah (10:00 - 12:00)");
        quickReplies.push(isEn ? "Afternoon" : "Öğleden Sonra (14:00 - 17:00)");
      }

      return NextResponse.json({
        message: nextPrompt,
        ...(quickReplies.length > 0 ? { quickReplies } : {})
      });
    }

    // ── 9. Build Knowledge Context for RAG if required ──
    let knowledgeContext = "";
    let topDocs: any[] = [];
    const msgWords = msgLower.split(/\s+/).filter((w: string) => w.length > 2);

    if (trainingDocs.length > 0 && msgWords.length > 0) {
      const isLocationIntent = intentResult.intent === "location_request" || intentResult.intent === "clinic_location";
      const isWorkingHoursIntent = intentResult.intent === "working_hours_request" || intentResult.intent === "clinic_working_hours";
      const isPricingIntent = intentResult.intent === "pricing_request";
      const isDoctorIntent = intentResult.intent === "doctor_information";

      const scored = trainingDocs.map(d => {
        const text = (d.title + " " + d.content).toLowerCase();
        let score = msgWords.reduce((s: number, w: string) => s + (text.includes(w) ? 1 : 0), 0);

        if ((isWorkingHoursIntent || intentResult.intent === "appointment_start") && /\b(çalışma|saat|mesai|opening|business|working|gün)\b/.test(text)) {
          score += 50;
        }
        if (isLocationIntent && /\b(konum|ulaşım|adres|lokasyon|location|address|karte|adresse)\b/.test(text)) {
          score += 50;
        }
        if (isPricingIntent && /\b(fiyat|ücret|fiyatlar|ücreti|tl|euro|price|pricing|cost)\b/.test(text)) {
          score += 50;
        }
        if (isDoctorIntent && /\b(doktor|hekim|uzman|dt\.|dr\.|dentist|physician)\b/.test(text)) {
          score += 50;
        }

        return { ...d, score };
      });

      scored.sort((a, b) => b.score - a.score);
      topDocs = scored.filter(d => d.score > 0).slice(0, 12);
      if (topDocs.length > 0) {
        knowledgeContext = topDocs.map(d => `## ${d.title}\n${d.content}`).join("\n\n---\n\n");
      }
    }

    // ── 10. Pricing Fallback if no specific price in knowledge ──
    if (intentResult.intent === "pricing_request" && (!knowledgeContext || topDocs.length === 0)) {
      const priceFallbackMsg = formatPricingFallback(intentResult.entities.treatment, clinicLanguage);
      return NextResponse.json({
        message: priceFallbackMsg,
        quickReplies: isEn ? ["Get a Quote", "Book Appointment"] : ["Fiyat Teklifi Al", "Randevu Al"]
      });
    }

    // ── 11. Deterministic Working Hours Validation for Appointment Intent ──
    if (intentResult.intent === "appointment_start" || intentResult.intent === "appointment_continuation") {
      const validation = await ClinicWorkingHoursResolver.validateAppointmentTime({
        clinicId,
        userMessage: lastUserMessage,
        documents: (topDocs || []).map((d: any) => ({ title: d.title, content: d.content || d.text || "" })),
        language: clinicLanguage,
      });

      if (!validation.isValid && validation.reason) {
        const fallbackMsg =
          validation.reason === "closed"
            ? (isEn
                ? `Our clinic is closed on the day you specified. Our working hours are: ${validation.scheduleSummary || ""}. Could you share another day and time that works for you?`
                : `Belirttiğiniz gün kliniğimiz kapalıdır. Kliniğimizin çalışma saatleri: ${validation.scheduleSummary || ""}. Uygun olduğunuz başka bir gün ve saat paylaşabilir misiniz?`)
            : (isEn
                ? `The time you requested (${validation.requestedTime || ""}) is outside our working hours. Our working hours are: ${validation.scheduleSummary || ""}. Could you share another time within these hours?`
                : `Belirttiğiniz ${validation.requestedTime || ""} saati kliniğimizin çalışma saatleri dışında kalmaktadır. Kliniğimizin çalışma saatleri: ${validation.scheduleSummary || ""}. Bu saatler içerisinden size uygun başka bir saat paylaşabilir misiniz?`);

        return NextResponse.json({ message: fallbackMsg });
      }
    }

    // ── 12. Construct Guardrails & Quality Criteria ──
    const activeGuardrails: string[] = [];
    if (settings.guardrails) {
      Object.values(settings.guardrails).forEach((guardrail: any) => {
        if (guardrail.enabled && guardrail.text) {
          activeGuardrails.push(guardrail.text);
        }
      });
    }

    const guardrailRules =
      activeGuardrails.length > 0 ? `CRITICAL GUARDRAILS (MUST FOLLOW):\n- ${activeGuardrails.join("\n- ")}\n\n` : "";

    const activeCriteria: string[] = [];
    if (settings.qualityCriteria) {
      if (settings.qualityCriteria.accuracy) activeCriteria.push("Provide accurate, direct, and clear answers.");
      if (settings.qualityCriteria.noGuessing) activeCriteria.push("Do not guess or make assumptions, especially regarding medical diagnoses.");
      if (settings.qualityCriteria.appointmentRouting) activeCriteria.push("When appropriate, gently encourage the user to book an appointment or visit the clinic.");
      if (settings.qualityCriteria.patientSatisfaction) activeCriteria.push("Maintain a highly empathetic, polite, and professional tone.");
      if (settings.qualityCriteria.consistency) activeCriteria.push("Always remain consistent with the clinic's official policies and pricing.");
      if (settings.qualityCriteria.fastResolution) activeCriteria.push("Aim for fast resolution by providing the shortest path to solving the user's inquiry.");
    }

    const criteriaRules = activeCriteria.length > 0 ? `\n\nBEHAVIOR RULES:\n- ${activeCriteria.join("\n- ")}` : "";

    const contactInfo = effectivePhone
      ? `\nKlinik telefon numarası: ${effectivePhone}. Hasta yönlendirmesi gerektiğinde bu numarayı kullanabilirsin.`
      : "\nBu kliniğin telefon numarası kayıtlı değildir. Hasta yönlendirmesi gerektiğinde klinikle iletişime geçmelerini öner.";

    const knowledgeBlock = knowledgeContext ? `\n\nKLİNİK BİLGİ HAVUZU:\n\n${knowledgeContext}` : "";

    const hybridStrategy = `
GLOBAL RESPONSE STRATEGY (HYBRID KNOWLEDGE):
1. EĞİTİCİ GENEL BİLGİ: Hasta genel bir diş/sağlık sorusu sorarsa önce genel tıbbi bilgi havuzunla eğitici ve sade bir dille açıkla. Kesinlikle teşhis koyma.
2. KLİNİK BİLGİSİ DOĞRULAMA: Kliniğin Bilgi Havuzuna bak. Bilgi varsa doğal şekilde açıkla.
3. BİLİNMEYEN DURUM: Bilgi yoksa asla kaba bir dille reddetme, dürüst ve yardımcı bir geçiş yap.
4. AKTİF AKIŞ KORUMA: Eğer kullanıcı randevu alırken soru sorduysa, sorusunu cevapladıktan sonra randevu sürecine devam etmek isteyip istemediğini nazikçe sor.
`;

    const hasCustomPrompt = settings.systemPrompt && settings.systemPrompt.trim().length > 0;
    const systemInstruction = hasCustomPrompt
      ? `${guardrailRules}${settings.systemPrompt}${contactInfo}${knowledgeBlock}${criteriaRules}\n${hybridStrategy}\nDil kuralı: Kullanıcı hangi dilde soruyorsa (${clinicLanguage}) o dilde yanıt ver.`
      : `${guardrailRules}Sen ${clinicName}'nin dijital hasta asistanısın. Yardımsever ve profesyonel bir üslup kullan.${contactInfo}${knowledgeBlock}${criteriaRules}\n${hybridStrategy}\nDil kuralı: Kullanıcı hangi dilde soruyorsa (${clinicLanguage}) o dilde yanıt ver.`;

    // ── 13. Call AI Gateway ──
    const completion = await trackableAIRequest({
      clinicId,
      channel: "admin",
      requestType: "admin_test",
      model: settings.model || "gpt-4o",
      temperature: settings.temperature !== undefined ? settings.temperature : 0.7,
      language: clinicLanguage,
      messages: [
        { role: "system", content: systemInstruction },
        ...chatHistory
      ]
    });

    const aiMessage = completion.content;
    if (!aiMessage) {
      throw new Error("Empty response from AI Gateway");
    }

    // ── 14. Format Response ──
    let responsePayload: any = { message: aiMessage.replace(/\*\*|\*|#/g, "") };
    try {
      const parsed = JSON.parse(aiMessage);
      if (parsed && typeof parsed === "object" && parsed.message) {
        responsePayload = {
          message: parsed.message.replace(/\*\*|\*|#/g, ""),
          ...(parsed.quickReplies && Array.isArray(parsed.quickReplies) ? { quickReplies: parsed.quickReplies } : {})
        };
      }
    } catch (e) {
      // Not JSON, which is fine
    }

    const durationMs = Date.now() - startTime;
    console.log(`[ai-test] ✅ clinicId=${clinicId} model=${completion.model} tokens=${completion.usage.totalTokens} duration=${durationMs}ms`);

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[ai-test] ❌ Error (${durationMs}ms):`, {
      message: error.message || "Unknown error",
      code: error.response?.data?.error?.code || error.code
    });

    const errorMessage =
      error.response?.data?.error?.message ||
      error.message ||
      "AI yanıtı alınamadı. Lütfen tekrar deneyin.";

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
