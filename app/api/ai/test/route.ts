import { NextResponse } from "next/server";
import { trackableAIRequest } from "@/lib/services/aiGateway";
import { getAdminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    const { clinicId, messages, userMessage, settings, patientConsent, language, source, requestId } = await req.json();

    // ── 1. clinicId validation — block everything without it ──
    if (!clinicId) {
      const errorMsg = language === "en"
        ? "AI test could not be started. Clinic information is unavailable."
        : "AI testi başlatılamadı. Klinik bilgisi alınamadı.";
      return NextResponse.json(
        { error: errorMsg },
        { status: 400 }
      );
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
    let clinicPhone = "";
    let clinicLanguage = language || "tr";
    let trainingDocs: Array<{ title: string; content: string }> = [];

    if (adminDb) {
      try {
        const [clinicSnap, materialsSnap] = await Promise.all([
          adminDb.collection("clinics").doc(clinicId).get(),
          adminDb.collection("trainingMaterials").where("clinicId", "==", clinicId).limit(30).get(),
        ]);

        if (clinicSnap.exists) {
          const cData = clinicSnap.data()!;
          clinicName = cData.name ?? "Klinik";
          clinicPhone = cData.phone ?? "";
          clinicLanguage = cData.language ?? clinicLanguage;
        }

        trainingDocs = materialsSnap.docs.map(d => ({
          title: d.data().title ?? "",
          content: d.data().content ?? "",
        }));
      } catch (dbErr: any) {
        // Log but don't block — we can still run the test without full context
        console.error(`[ai-test] Clinic lookup failed for ${clinicId}:`, dbErr.message);
      }
    }

    // ── 3. Build knowledge context with relevance scoring ──
    const lastUserMessage = messages && Array.isArray(messages)
      ? messages.filter((m: any) => m.role === "user").pop()?.content || ""
      : userMessage || "";

    const msgLower = lastUserMessage.toLowerCase();
    const msgWords = msgLower.split(/\s+/).filter((w: string) => w.length > 2);

    let knowledgeContext = "";
    if (trainingDocs.length > 0 && msgWords.length > 0) {
      const scored = trainingDocs.map(d => {
        const text = (d.title + " " + d.content).toLowerCase();
        const score = msgWords.reduce((s: number, w: string) => s + (text.includes(w) ? 1 : 0), 0);
        return { ...d, score };
      });
      scored.sort((a, b) => b.score - a.score);
      const topDocs = scored.filter(d => d.score > 0).slice(0, 12);
      if (topDocs.length > 0) {
        knowledgeContext = topDocs.map(d => `## ${d.title}\n${d.content}`).join("\n\n---\n\n");
      }
    }

    // ── 4. Construct Guardrails ──
    const activeGuardrails: string[] = [];
    if (settings.guardrails) {
      Object.values(settings.guardrails).forEach((guardrail: any) => {
        if (guardrail.enabled && guardrail.text) {
          activeGuardrails.push(guardrail.text);
        }
      });
    }

    const guardrailRules = activeGuardrails.length > 0
      ? `CRITICAL GUARDRAILS (MUST FOLLOW):\n- ${activeGuardrails.join("\n- ")}\n\n`
      : "";

    // ── 5. Construct Behavior Rules based on Quality Criteria ──
    const activeCriteria: string[] = [];
    if (settings.qualityCriteria) {
      if (settings.qualityCriteria.accuracy) activeCriteria.push("Provide accurate, direct, and clear answers.");
      if (settings.qualityCriteria.noGuessing) activeCriteria.push("Do not guess or make assumptions, especially regarding medical diagnoses.");
      if (settings.qualityCriteria.appointmentRouting) activeCriteria.push("When appropriate, gently encourage the user to book an appointment or visit the clinic.");
      if (settings.qualityCriteria.patientSatisfaction) activeCriteria.push("Maintain a highly empathetic, polite, and professional tone.");
      if (settings.qualityCriteria.consistency) activeCriteria.push("Always remain consistent with the clinic's official policies and pricing.");
      if (settings.qualityCriteria.fastResolution) activeCriteria.push("Aim for fast resolution by providing the shortest path to solving the user's inquiry.");
    }
    
    const criteriaRules = activeCriteria.length > 0 
      ? `\n\nBEHAVIOR RULES:\n- ${activeCriteria.join("\n- ")}`
      : "";

    // ── 6. Build system prompt with clinic context ──
    const contactInfo = clinicPhone
      ? `\nKlinik telefon numarası: ${clinicPhone}. Hasta yönlendirmesi gerektiğinde bu numarayı kullanabilirsin.`
      : "\nBu kliniğin telefon numarası kayıtlı değildir. Hasta yönlendirmesi gerektiğinde 'kliniği arayın' demek yerine klinikle iletişime geçmelerini öner.";

    const knowledgeBlock = knowledgeContext
      ? `\n\nKLİNİK BİLGİ HAVUZU:\n\n${knowledgeContext}`
      : "";

    const systemInstruction = settings.systemPrompt 
      ? `${guardrailRules}Sen ${clinicName}'nin dijital hasta asistanısın.\n\n${settings.systemPrompt}${contactInfo}${knowledgeBlock}${criteriaRules}\n\nIMPORTANT: If the user asks to book an appointment (e.g., "randevu almak istiyorum"), you MUST respond in valid JSON format exactly like this:\n{ "message": "Your response text here...", "quickReplies": ["Option 1", "Option 2", "Option 3"] }\nOtherwise, just respond normally in plain text.\n\nDil kuralı: Kullanıcı hangi dilde soruyorsa o dilde yanıt ver. Türkçe sorulara Türkçe, İngilizce sorulara İngilizce yanıt ver.`
      : `${guardrailRules}Sen ${clinicName}'nin dijital hasta asistanısın. Yardımsever ve profesyonel bir üslup kullan.${contactInfo}${knowledgeBlock}${criteriaRules}`;

    // ── 7. Build the messages array for AI Gateway ──
    const chatHistory = messages && Array.isArray(messages) 
      ? messages.map((m: any) => ({ role: m.role, content: m.content }))
      : [{ role: "user", content: userMessage }];

    // ── 8. Make the OpenAI request via AI Gateway (includes usage tracking) ──
    const completion = await trackableAIRequest({
      clinicId,
      channel: "admin",
      requestType: "admin_test",
      model: settings.model || "gpt-4o",
      temperature: settings.temperature !== undefined ? settings.temperature : 0.7,
      language: clinicLanguage,
      messages: [
        {
          role: "system",
          content: systemInstruction,
        },
        ...chatHistory,
      ],
    });

    const aiMessage = completion.content;

    if (!aiMessage) {
      throw new Error("Empty response from AI Gateway");
    }

    // ── 9. Parse structured response ──
    let responsePayload: any = { message: aiMessage };
    try {
      const parsed = JSON.parse(aiMessage);
      if (parsed && typeof parsed === "object" && parsed.message) {
        responsePayload = {
          message: parsed.message,
          ...(parsed.quickReplies && Array.isArray(parsed.quickReplies) ? { quickReplies: parsed.quickReplies } : {})
        };
      }
    } catch (e) {
      // Not JSON, which is fine
    }

    const durationMs = Date.now() - startTime;
    console.log(`[ai-test] ✅ clinicId=${clinicId} model=${completion.model} tokens=${completion.usage.totalTokens} cost=$${completion.cost.totalCostUsd.toFixed(4)} duration=${durationMs}ms`);

    return NextResponse.json(responsePayload);

  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    
    // Log error with context but WITHOUT sensitive data (no API key, no patient messages)
    console.error(`[ai-test] ❌ Error (${durationMs}ms):`, {
      message: error.message || "Unknown error",
      code: error.response?.data?.error?.code || error.code,
      // Do NOT log: API key, patient message content
    });
    
    const errorMessage = error.response?.data?.error?.message 
      || error.message 
      || "AI yanıtı alınamadı. Lütfen tekrar deneyin.";

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
