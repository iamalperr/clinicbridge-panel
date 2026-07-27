import { NextResponse } from "next/server";
import { trackableAIRequest } from "@/lib/services/aiGateway";
import { getAdminDb } from "@/lib/firebase-admin";
import { sendAgencyLeadNotification } from "@/lib/services/emailService";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════════════════ */

interface MatchedPrice {
  subTreatmentName: string;
  priceMin: number;
  priceMax: number;
  currency: string;
  priceType: string;
  duration: string;
}

interface ClinicRecommendation {
  clinicId: string;
  clinicName: string;
  clinicSlug: string;
  clinicType: string;
  location: string;
  rating: number;
  reviews: number;
  matchScore: number;
  matchedPrices: MatchedPrice[];
  supportedLanguages: string[];
  reason: string;
  profilePath: string;
  accommodation: boolean;
  transfer: boolean;
  shortDescription: string;
}

interface SessionContext {
  sessionId?: string;
  leadStage?: "discovery" | "recommendation" | "clinic_selected" | "lead_capture" | "collecting_email" | "collecting_consent" | "quote_request_created" | "completed";
  selectedClinicId?: string;
  selectedClinicName?: string;
  patientName?: string;
  patientEmail?: string;
  patientPhone?: string;
  patientCountry?: string;
  patientAge?: number;
  patientGender?: string;
  language?: string;
  travelDate?: string;
  quoteConsent?: boolean;
  missingLeadField?: string;
  emailValidationFails?: number;
  consentVersion?: string;

  lastTreatmentCategory?: string;
  lastSubTreatment?: string;
  lastLocation?: string;
  lastRecommendedClinicIds?: string[];
  lastFocusedClinicId?: string;
  lastFocusedClinicName?: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════════════ */

function buildClinicContext(clinics: any[], pricing: any[], knowledgeRecords: any[] = [], aiConfigs: any[] = []): string {
  const lines: string[] = [];
  for (const c of clinics) {
    const cPrices = pricing.filter((p: any) => p.clinicId === c.id);
    const priceStr = cPrices.length > 0
      ? cPrices.map((p: any) =>
        `  - ${p.subTreatmentName || p.treatmentName}: ${p.priceMin}${p.priceMin !== p.priceMax ? `–${p.priceMax}` : ""} ${p.currency || "EUR"}${p.duration ? ` (${p.duration})` : ""}`
      ).join("\n")
      : "  (Fiyat bilgisi tanımlı değil)";

    const loc = c.location ? `${c.location.city || ""}, ${c.location.country || ""}`.replace(/^, |, $/g, "") : "";
    const langs = (c.supportedLanguages || []).join(", ");
    const specs = (c.subTreatments || c.treatments || []).join(", ");
    const overview = c.overview || c.shortDescription || "";

    const cKb = knowledgeRecords.filter(k => k.clinicId === c.id && k.isActive !== false);
    
    // Sort KB by priority (Yüksek > Normal > Düşük)
    const priorityWeight: Record<string, number> = { "Yüksek": 3, "Normal": 2, "Düşük": 1 };
    cKb.sort((a, b) => (priorityWeight[b.priority] || 2) - (priorityWeight[a.priority] || 2));

    const kbStr = cKb.length > 0 
      ? cKb.map(k => `  [${k.category}] ${k.title}:\n  ${k.content}`).join("\n\n")
      : "";

    const cAi = aiConfigs.find(a => a.clinicId === c.id) || {};
    const aiStr = `Assistant Name: ${cAi.assistantName || "AI Asistan"}
Tone: ${cAi.tone || "Professional"}
Pricing Behavior: ${cAi.pricingBehavior || "show_exact"}
Recommendation Behavior: ${cAi.recommendationBehavior || "direct_recommend"}
Lead Collection: ${cAi.leadCollectionMode || "moderate"}
Custom Rules: ${cAi.customSystemPrompt || "Yok"}`;

    lines.push(`CLINIC: ${c.clinicName} (ID: ${c.id})
Slug: ${c.clinicSlug || c.id}
Type: ${c.category || c.clinicType || ""}
Location: ${loc}
Languages: ${langs}
Rating: ${c.rating || "N/A"} (${c.reviewCount || 0} reviews)
Treatments: ${specs}
Accommodation: ${c.accommodation !== false ? "Yes" : "No"}
Transfer: ${c.transfer !== false ? "Yes" : "No"}
Overview: ${overview}

AI Configuration:
${aiStr}

Knowledge Base (AI Bilgi Havuzu):
${kbStr}

Pricing:
${priceStr}`);
  }
  return lines.join("\n\n---\n\n");
}

function scoreClinic(
  clinic: any,
  pricing: any[],
  intent: any
): { score: number; reason: string; matchedPrices: MatchedPrice[] } {
  let score = 0;
  const reasons: string[] = [];
  const lang = intent.language || "tr";

  const clinicText = [
    clinic.clinicName, clinic.category, clinic.clinicType,
    ...(clinic.subTreatments || []), ...(clinic.treatments || []),
  ].join(" ").toLowerCase();

  // Treatment match
  if (intent.treatmentCategory) {
    const catLower = intent.treatmentCategory.toLowerCase();
    if (clinicText.includes(catLower) || clinicText.includes("diş") && catLower.includes("diş")) {
      score += 40;
    }
  }

  // Sub-treatment match
  if (intent.subTreatment) {
    const subLower = intent.subTreatment.toLowerCase();
    if (clinicText.includes(subLower)) {
      score += 30;
      reasons.push(lang === "tr" ? `${intent.subTreatment} hizmeti sunuyor` : `Offers ${intent.subTreatment}`);
    }
  }

  // Location match
  const locStr = clinic.location ? `${clinic.location.city || ""} ${clinic.location.country || ""}`.toLowerCase() : "";
  if (intent.location && locStr.includes(intent.location.toLowerCase())) {
    score += 20;
    reasons.push(lang === "tr" ? `${intent.location} bölgesinde` : `Located in ${intent.location}`);
  }

  // Get matched prices — match by clinicId or clinicName
  const cPrices = pricing.filter((p: any) =>
    p.clinicId === clinic.id ||
    (p.clinicName && clinic.clinicName && p.clinicName.toLowerCase() === clinic.clinicName.toLowerCase())
  );
  let matchedPrices: MatchedPrice[] = [];

  if (intent.subTreatment) {
    const subLower = intent.subTreatment.toLowerCase();
    const exact = cPrices.filter((p: any) =>
      (p.subTreatmentName || p.treatmentName || "").toLowerCase().includes(subLower)
    );
    if (exact.length > 0) {
      matchedPrices = exact.map(toMatchedPrice);
    } else {
      // Show all prices for this clinic
      matchedPrices = cPrices.slice(0, 6).map(toMatchedPrice);
    }
  } else {
    matchedPrices = cPrices.slice(0, 6).map(toMatchedPrice);
  }

  // Budget fit
  if (intent.budgetAmount && matchedPrices.length > 0) {
    const minP = Math.min(...matchedPrices.map((p) => p.priceMin));
    if (minP <= intent.budgetAmount) {
      score += 15;
      reasons.push(lang === "tr" ? "Bütçenize uygun seçenekler mevcut" : "Options within your budget");
    }
  }

  // Language match
  const cLangs = (clinic.supportedLanguages || []).map((l: string) => l.toLowerCase());
  if (cLangs.length >= 4) { score += 5; reasons.push(lang === "tr" ? "Çok dilli destek" : "Multilingual support"); }
  if (lang === "tr" && cLangs.includes("tr")) score += 5;
  if (lang === "en" && cLangs.includes("en")) score += 5;

  // Has pricing data
  if (matchedPrices.length > 0) score += 10;

  // Rating
  if ((clinic.rating || 0) >= 4.8) score += 5;

  return {
    score,
    reason: reasons.join(". ") + (reasons.length > 0 ? "." : ""),
    matchedPrices,
  };
}

function toMatchedPrice(p: any): MatchedPrice {
  return {
    subTreatmentName: p.subTreatmentName || p.treatmentName || "—",
    priceMin: p.priceMin || 0,
    priceMax: p.priceMax || 0,
    currency: p.currency || "EUR",
    priceType: p.priceType || "package",
    duration: p.duration || "",
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN POST HANDLER
═══════════════════════════════════════════════════════════════════════════ */

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body = await req.json();
    const { message, action, history = [], sessionContext = {} } = body;

    let finalMessage = message;

    // Handle system actions
    if (action) {
      if (action.type === "clinic_selected") {
        finalMessage = `[SİSTEM AKSİYONU: Kullanıcı arayüzden 'Bu Klinikle Devam Et' butonuna tıklayarak '${action.clinicName}' kliniğini seçti. Lütfen bu seçimi doğal ve profesyonel bir şekilde onayla, klinik hakkında çok kısa bilgi ver ve ardından HEMEN lead toplama aşamasının İLK sorusu olan Ad Soyad bilgisini iste.]`;
      } else if (action.type === "clinic_info") {
        finalMessage = `[SİSTEM AKSİYONU: Kullanıcı arayüzden 'Daha Fazla Bilgi' butonuna tıklayarak '${action.clinicName}' hakkında bilgi istedi. Lütfen klinik hakkında genel bilgi ver, öne çıkan özelliklerini veya doktorlarını sırala. En sonda bu klinikle devam etmek isteyip istemediğini sor. (Henüz lead toplamaya başlama)]`;
      } else if (action.type === "lead_capture") {
        finalMessage = `[SİSTEM AKSİYONU: Kullanıcı arayüzden 'Teklif İste' butonuna tıklayarak '${action.clinicName}' kliniği için teklif almak istediğini belirtti. Lütfen HEMEN lead toplama aşamasının İLK sorusu olan Ad Soyad bilgisini iste.]`;
      }
    }

    if (!finalMessage) {
      return NextResponse.json({ error: "message or action is required" }, { status: 400, headers: CORS });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { reply: "AI servisi yapılandırılmamış.", type: "text" },
        { headers: CORS }
      );
    }

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { reply: "Veritabanı bağlantısı kurulamadı.", type: "text" },
        { status: 503, headers: CORS }
      );
    }

    /* ── 1. Load agency + clinics + pricing ── */
    const agencySnap = await adminDb.collection("agencies")
      .where("slug", "==", slug).where("status", "==", "active").limit(1).get();
    if (agencySnap.empty) {
      return NextResponse.json({ error: "Agency not found" }, { status: 404, headers: CORS });
    }
    const agencyId = agencySnap.docs[0].id;

    /* ── DETERMINISTIC INTERCEPTORS (PHASE 3) ── */
    const { requireAcceptedAgencyConsent, saveConsentRecord } = await import("@/lib/services/agencyConsentService");
    
    const ctx: SessionContext = sessionContext || {};
    if (!ctx.sessionId) {
      ctx.sessionId = typeof window !== 'undefined' ? crypto.randomUUID() : `sess_${Date.now()}`;
    }

    const privacySettings = agencySnap.docs[0].data().privacySettings || {
      enabled: true,
      mode: "kvkk",
      version: "v1.0",
      consentTextTr: "Size uygun klinikleri önerebilmemiz ve talebinizi değerlendirebilmemiz için paylaşacağınız kişisel ve sağlıkla ilgili verileri işlememize yönelik onayınıza ihtiyacımız bulunuyor. Aydınlatma metnini inceleyerek devam edebilirsiniz.",
      consentTextEn: "We need your consent to process the personal and health-related information you may share so that we can recommend suitable clinics and evaluate your request. You can review the privacy notice before continuing.",
      requiredBeforePersonalData: true
    };

    if (action && action.type === "privacy_consent_response") {
      const consentLang = action.locale || "tr";
      const status = action.action === "accept" ? "accepted" : "declined";
      
      await saveConsentRecord(
        agencyId,
        ctx.sessionId!,
        status,
        privacySettings.version,
        consentLang,
        "agency_widget"
      );
      
      if (status === "accepted") {
        ctx.quoteConsent = true;
        return NextResponse.json({
          reply: consentLang === "tr" 
            ? "Teşekkür ederim. Şimdi size uygun klinikleri belirleyebilmek için tedavi ihtiyacınız hakkında birkaç soru soracağım."
            : "Thank you. I’ll now ask a few questions about your treatment needs so I can help identify suitable clinics.",
          type: "text",
          sessionContext: ctx,
          showClinicCards: false
        }, { headers: CORS });
      } else {
        ctx.quoteConsent = false;
        return NextResponse.json({
          reply: consentLang === "tr"
            ? "Elbette. Onay vermeden de tedaviler ve genel klinik hizmetleri hakkında bilgi alabilirsiniz. Ancak kişisel bilgilerinizi kullanarak klinik önerisi veya teklif talebi oluşturamam."
            : "Of course. You may still receive general information about treatments and clinic services, but I cannot create a personalized clinic recommendation or treatment request without your consent.",
          type: "text",
          sessionContext: ctx,
          showClinicCards: false
        }, { headers: CORS });
      }
    }

    const clinicSnap = await adminDb.collection("agencies").doc(agencyId)
      .collection("clinics").orderBy("priority", "asc").get();
    const allClinics = clinicSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((c: any) => c.status === "active");

    // Load pricing — agency-level collection: agencies/{agencyId}/pricing
    // Each pricing doc has a clinicId field linking it to a clinic
    const allPricing: any[] = [];
    const pricingSnap = await adminDb.collection("agencies").doc(agencyId)
      .collection("pricing").get();
    for (const pDoc of pricingSnap.docs) {
      const p = pDoc.data();
      if (p.status === "inactive") continue;
      allPricing.push({
        id: pDoc.id,
        clinicId: p.clinicId || "",
        clinicName: p.clinicName || "",
        treatmentName: p.treatmentName || "",
        subTreatmentName: p.subTreatmentName || p.treatmentName || "",
        priceGroup: p.priceGroup || null,
        priceMin: p.priceMin || 0,
        priceMax: p.priceMax || 0,
        currency: p.currency || "EUR",
        priceType: p.priceType || "average",
        duration: p.duration || null,
      });
    }

    // Load Agency AI Config
    const aiSnap = await adminDb.collection("agencies").doc(agencyId).collection("aiConfig").doc("main").get();
    const agencyAiConfig = aiSnap.exists ? aiSnap.data() : null;

    // Load AI Knowledge Base records for active clinics
    const allKbRecords: any[] = [];
    for (const c of allClinics) {
      // Fetch Knowledge Base
      const kbSnap = await adminDb.collection("agencies").doc(agencyId)
        .collection("clinics").doc(c.id).collection("knowledgeBase").get();
      for (const kDoc of kbSnap.docs) {
        const kData = kDoc.data();
        if (kData.isActive !== false) {
          allKbRecords.push({ id: kDoc.id, clinicId: c.id, ...kData });
        }
      }
    }

    console.log(`[matching-chat] Agency: ${slug}, Clinics: ${allClinics.length}, Pricing: ${allPricing.length}, KB Records: ${allKbRecords.length}`);
    if (allPricing.length > 0) {
      console.log(`[matching-chat] Sample pricing:`, JSON.stringify(allPricing[0]));
    }

    // HYBRID SEARCH FOR KNOWLEDGE BASE
    const { hybridSearch } = await import("@/lib/services/retrievalService");
    
    // Convert KB records for hybrid search
    const docsForSearch = allKbRecords.map(kb => ({
      id: kb.id,
      title: kb.title,
      content: kb.content,
      embeddingChunks: kb.embeddingChunks || []
    }));
    
    // We want a slightly broader search since it's an agency with multiple clinics
    const topKbChunks = await hybridSearch(message, docsForSearch, "", 15);
    
    // Reconstruct kb records from the top chunks to match buildClinicContext expectations
    const relevantKbRecords = topKbChunks.map(chunk => {
      const originalDoc = allKbRecords.find(k => k.id === chunk.doc_id);
      return {
        id: chunk.doc_id,
        clinicId: originalDoc?.clinicId,
        category: "RAG_MATCH",
        title: chunk.title,
        content: chunk.text
      };
    });

    /* ── 2. Build clinic context for OpenAI ── */
    const clinicContext = buildClinicContext(allClinics, allPricing, relevantKbRecords);

    /* ── 3. Build session context hint ── */
    let contextHint = `\nMEVCUT KONUŞMA DURUMU (SESSION CONTEXT):
- Aşama (leadStage): ${ctx.leadStage || "discovery"}
- Seçilen Klinik (selectedClinicName): ${ctx.selectedClinicName || "Yok"}
- Toplanan Bilgiler:
  * Ad Soyad: ${ctx.patientName || "Yok"}
  * Telefon: ${ctx.patientPhone || "Yok"}
  * Ülke: ${ctx.patientCountry || "Yok"}
  * Yaş: ${ctx.patientAge || "Yok"}
  * Cinsiyet: ${ctx.patientGender || "Yok"}
  * KVKK/GDPR Onayı: ${ctx.quoteConsent ? "Evet" : "Yok"}
- İlgi Alanı: Tedavi: ${ctx.lastTreatmentCategory || "Bilinmiyor"}, Alt Tedavi: ${ctx.lastSubTreatment || "Bilinmiyor"}, Lokasyon: ${ctx.lastLocation || "Bilinmiyor"}
`;
    if (ctx.lastFocusedClinicName) {
      contextHint += `- En son incelenen klinik: "${ctx.lastFocusedClinicName}" (ID: ${ctx.lastFocusedClinicId}).\n`;
    }

    /* ── 4. OpenAI Call: Intent Extraction + Response ── */
    /* ── 4. OpenAI Call: Intent Extraction + Response ── */
    const asstName = agencyAiConfig?.assistantName || "AI Asistan";
    const persona = agencyAiConfig?.persona || "Sen bir sağlık turizmi AI asistanısın. Görevin hastaların doğru kliniği bulmasına yardımcı olmak.";
    const tone = agencyAiConfig?.tone || "Professional";
    const rules = (agencyAiConfig?.responseRules || []).map((r: string, i: number) => `${i + 1}. ${r}`).join("\n");
    const forbidden = (agencyAiConfig?.forbiddenClaims || []).map((c: string) => `- ${c}`).join("\n");
    const customPrompt = agencyAiConfig?.customSystemPrompt ? `\nÖZEL KURALLAR:\n${agencyAiConfig.customSystemPrompt}\n` : "";
    
    // Build Intake Instructions Context
    const intakeInstructions = agencyAiConfig?.intakeInstructions || [];
    const intakeText = intakeInstructions.map((inst: any, idx: number) => {
      return `${idx + 1}. Bilgi: ${inst.labelTR} (Zorunlu mu: ${inst.required ? 'Evet' : 'Hayır'})\n   - Neden toplanıyor: ${inst.usage}\n   - Örnek soru: "${inst.questionTR}"`;
    }).join("\n\n");

    const systemPrompt = `Senin adın: ${asstName}.
Karakterin ve Rolün: ${persona}
Üslubun: ${tone}

STANDART KURALLAR:
1. Hastanın mesajını analiz et ve aşağıdaki JSON formatında yanıt ver.
2. PASİF KAPANIS YAPMA. "Daha fazla bilgi isterseniz buradayım" gibi zayıf kapanışlar yerine, hastayı daima bir sonraki lead (kayıt) adımına yönlendir.
3. KLİNİK SEÇİMİ: Eğer hasta "Hospitadent ile devam edelim", "Bu klinik iyi", "[Klinik Adı] hakkında bilgi ver", "İlk klinik olsun" gibi sözler söylerse intent: "clinic_selected" yap ve o kliniğin adını "selectedClinicName", ID'sini "selectedClinicId" olarak set et. 
4. LEAD TOPLAMA: Hasta bir klinik seçtiğinde veya tavsiye istediğinde yavaş yavaş "lead_capture" aşamasına geç. Bilgileri asla aynı anda sorma. Sırasıyla SADECE 1 eksik bilgiyi sor.
   Sıra KESİNLİKLE şöyle olmalı: 
   1. Ad Soyad (patientName)
   2. Telefon / WhatsApp (patientPhone)
   3. Ülke (patientCountry)
   4. Yaş (patientAge)
   5. Cinsiyet (patientGender)
   6. Tedavi Detayı (treatmentCategory / subTreatment)
   7. Bütçe (budgetAmount)
   8. Seyahat Tarihi (travelDate)
   9. KVKK/GDPR Onayı (quoteConsent)
5. "missingLeadField" alanına sıradaki sorman gereken 1 alanı yaz.
6. HASTA BİLGİ VERDİKÇE JSON içinde ilgili alanı (patientName, patientPhone vb.) doldur.
7. Tüm lead bilgileri tamamsa ve KVKK onayı alındıysa "shouldCreateLead": true dön.
8. FİYATLARI ASLA UYDURMA. Aşağıdaki verilerden çek.
9. Türkçe mesaja Türkçe, İngilizce mesaja İngilizce yanıt ver. (Dil davranışı: ${agencyAiConfig?.languageBehavior || "user_lang"})
10. Tıbbi teşhis koyma.
11. KVKK ONAYI: Eğer hastadan kişisel veya sağlıkla ilgili detaylı bir veri isteyeceksen VEYA hasta sana kendi inisiyatifiyle kişisel/sağlık verisi (örn. "yaşım 45", "diyabetim var", "dişim ağrıyor") veriyorsa, 'requiresConsent': true yap. Ancak genel sorulara (örn. "İmplant nedir?") requiresConsent: false yap.
12. KAPANIŞ (COMPLETED): Eğer kullanıcı teşekkür, tamam, görüşürüz gibi kapanış mesajı verirse ve lead/quote request zaten tamamlanmışsa (leadStage === 'quote_request_created' veya 'completed'), yeni öneri veya lead toplama akışı başlatma. Sadece kibar kapanış cevabı ver ve intent olarak "conversation_completed" dön.

HASTA BİLGİSİ TOPLAMA YÖNERGESİ (INTAKE INSTRUCTIONS):
${intakeText || "Belirtilmedi."}

ACENTA ÖZEL YANIT KURALLARI:
${rules || "Belirtilmedi."}
SÖYLENMEMESİ GEREKENLER (YASAKLI İFADELER):
${forbidden || "Belirtilmedi."}
${customPrompt}

MEVCUT KLİNİKLER VE FİYATLAR:
${clinicContext}

${contextHint}

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
  "patientPhone": string | null,
  "patientCountry": string | null,
  "patientAge": number | null,
  "patientGender": "Kadın" | "Erkek" | "Belirtmek istemiyorum" | "Diğer" | null,
  "travelDate": string | null,
  "quoteConsent": boolean | null,
  "missingLeadField": "patientName" | "patientPhone" | "patientCountry" | "patientAge" | "patientGender" | "travelDate" | "quoteConsent" | null,
  "requiresConsent": boolean,
  "shouldCreateLead": boolean,
  "showClinicCards": boolean,
  "replyText": "Doğal dilde proaktif, yönlendirici AI yanıtı"
}

ÖNEMLİ:
- replyText alanı hastaya gösterilecek yanıttır. Eğer "clinic_selected" ise, o klinik hakkında 1-2 cümle kısa ve olumlu bilgi verip HEMEN missingLeadField ile ilgili soruyu sorarak lead alımına geç.
- clinic_recommendation intent'inde replyText sadece kısa giriş olmalı.
- showClinicCards: Sadece "clinic_recommendation" veya klinik listesi sunulması gereken durumlarda true yap. "clinic_selected", "lead_capture", "clinic_info" gibi durumlarda KESİNLİKLE false yap ki kartlar ekranda tekrar etmesin.`;

    const completion = await trackableAIRequest({
      clinicId: ctx.selectedClinicId || undefined,
      channel: "portal",
      requestType: "chat",
      model: "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 1200,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-10).map((h: any) => ({
          role: h.role as "user" | "assistant",
          content: typeof h.content === "string" ? h.content : JSON.stringify(h.content),
        })),
        { role: "user", content: finalMessage },
      ],
    });

    const raw = completion.content?.trim() ?? "{}";
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error("[matching-chat] Failed to parse OpenAI JSON:", raw.slice(0, 200));
      return NextResponse.json({
        reply: "Üzgünüm, yanıtı işlerken bir sorun oluştu. Lütfen tekrar deneyin.",
        type: "text",
        sessionContext: ctx,
      }, { headers: CORS });
    }

    // Strip markdown formatting characters from reply text
    if (parsed && typeof parsed.replyText === "string") {
      parsed.replyText = parsed.replyText.replace(/\*\*|\*|#/g, '');
    }

    // GROUNDEDNESS CHECK FOR RAG
    if (relevantKbRecords && relevantKbRecords.length > 0 && 
        (parsed.intent === "clinic_question" || parsed.intent === "pricing_question" || parsed.intent === "doctor_question") &&
        parsed.replyText && !parsed.replyText.includes("doğrulamıyorum") && !parsed.replyText.includes("erişemediğim")) {
        const { validateGroundedness } = await import("@/lib/services/retrievalService");
        const contextStr = relevantKbRecords.map((k: any) => `## ${k.title}\n${k.content}`).join("\n\n");
        const validation = await validateGroundedness(parsed.replyText, contextStr);
        if (!validation.isGrounded) {
           console.warn(`[Groundedness Failed] Reason: ${validation.reason}\nReply: ${parsed.replyText}`);
           parsed.replyText = "Bu bilgiyi şu anda sistemimizdeki klinik verilerinden güvenilir şekilde doğrulayamıyorum. Yanlış yönlendirmemek için klinik ekibinden teyit edilmesi gerekir.";
        }
    }

    console.log(`[matching-chat] Intent: ${parsed.intent}, Treatment: ${parsed.treatmentCategory}, Sub: ${parsed.subTreatment}, Location: ${parsed.location}, ClinicName: ${parsed.clinicName}`);

    const newCtx: SessionContext = { ...ctx };
    if (parsed.treatmentCategory) newCtx.lastTreatmentCategory = parsed.treatmentCategory;
    if (parsed.subTreatment) newCtx.lastSubTreatment = parsed.subTreatment;
    if (parsed.location) newCtx.lastLocation = parsed.location;
    
    // Update lead states
    if (parsed.selectedClinicId) newCtx.selectedClinicId = parsed.selectedClinicId;
    if (parsed.selectedClinicName) newCtx.selectedClinicName = parsed.selectedClinicName;
    if (parsed.patientName) newCtx.patientName = parsed.patientName;
    if (parsed.patientPhone) newCtx.patientPhone = parsed.patientPhone;
    if (parsed.patientCountry) newCtx.patientCountry = parsed.patientCountry;
    if (parsed.patientAge !== undefined && parsed.patientAge !== null) newCtx.patientAge = parsed.patientAge;
    if (parsed.patientGender) newCtx.patientGender = parsed.patientGender;
    if (parsed.travelDate) newCtx.travelDate = parsed.travelDate;
    if (parsed.quoteConsent !== undefined && parsed.quoteConsent !== null) newCtx.quoteConsent = parsed.quoteConsent;
    if (parsed.missingLeadField) newCtx.missingLeadField = parsed.missingLeadField;
    
    if (parsed.intent === "clinic_recommendation" || parsed.intent === "clinic_matching") newCtx.leadStage = "recommendation";
    if (parsed.intent === "clinic_selected") newCtx.leadStage = "clinic_selected";
    if (parsed.intent === "lead_capture") newCtx.leadStage = "lead_capture";
    if (parsed.intent === "conversation_completed") newCtx.leadStage = "completed";
    
    if (parsed.shouldCreateLead && !ctx.quoteConsent && parsed.quoteConsent) {
      newCtx.quoteConsent = true;
    }

    /* ── 5. Handle each intent type ── */

    // --- CONVERSATION COMPLETED ---
    if (parsed.intent === "conversation_completed") {
      return NextResponse.json({
        reply: parsed.replyText || "Rica ederim. Talebiniz ilgili kliniğe iletilmek üzere kaydedildi. Klinik ekibi sizinle en kısa sürede iletişime geçecektir. Sağlıklı günler dilerim.",
        type: "text",
        sessionContext: newCtx,
        showClinicCards: false,
        leadStatus: newCtx.leadStage,
        shouldCreateNewLead: false,
        shouldUpdateLead: false
      }, { headers: CORS });
    }

    // --- CONSENT GATING ---
    const leadAlreadyCreated = ctx.leadStage === "quote_request_created" || ctx.leadStage === "completed";
    
    const isTryingToCollectData = parsed.missingLeadField && parsed.missingLeadField !== "quoteConsent" && ["patientName", "patientPhone", "patientEmail", "patientAge"].includes(parsed.missingLeadField);
    const hasGivenHealthData = parsed.treatmentCategory || parsed.subTreatment || parsed.patientAge || parsed.patientGender;
    
    if (parsed.shouldCreateLead || parsed.requiresConsent || isTryingToCollectData || (hasGivenHealthData && !ctx.quoteConsent)) {
      if (privacySettings.enabled && privacySettings.requiredBeforePersonalData) {
        const hasConsent = await requireAcceptedAgencyConsent(agencyId, ctx.sessionId!, privacySettings.version);
        if (!hasConsent) {
          if (ctx.quoteConsent === false) {
             return NextResponse.json({
               reply: parsed.language === "tr" 
                 ? "Daha önce onay vermediğiniz için kişiselleştirilmiş işlem yapamıyoruz. Genel konularda yardımcı olabilirim."
                 : "Since you declined the privacy consent, I cannot process personal data. I can only assist with general information.",
               type: "text",
               sessionContext: ctx,
               showClinicCards: false
             }, { headers: CORS });
          }
          
          return NextResponse.json({
             reply: parsed.language === "tr" ? privacySettings.consentTextTr : privacySettings.consentTextEn,
             type: "consent_request",
             privacyNoticeUrl: parsed.language === "tr" ? privacySettings.noticeUrlTr : privacySettings.noticeUrlEn,
             consentVersion: privacySettings.version,
             sessionContext: ctx,
             showClinicCards: false
          }, { headers: CORS });
        }
      }
    }

    // --- SHOULD CREATE LEAD ---
    if (parsed.shouldCreateLead && !leadAlreadyCreated) {
      newCtx.leadStage = "collecting_email";
      return NextResponse.json({
        reply: parsed.replyText + "\n\nSize detaylı bilgi iletebilmemiz için geçerli bir e-posta adresi paylaşabilir misiniz?",
        type: "text",
        sessionContext: newCtx,
        showClinicCards: false,
        leadStatus: newCtx.leadStage,
        shouldCreateNewLead: false,
        shouldUpdateLead: false
      }, { headers: CORS });
    }

    // --- FOLLOW-UP OR LEAD CAPTURE ---
    if (parsed.intent === "followup" || parsed.needsFollowUp || parsed.intent === "lead_capture") {
      return NextResponse.json({
        reply: parsed.replyText || "Lütfen gerekli bilgileri paylaşır mısınız?",
        type: "text",
        sessionContext: newCtx,
        showClinicCards: parsed.showClinicCards === true,
      }, { headers: CORS });
    }

    // --- CLINIC MATCHING OR RECOMMENDATION ---
    if (parsed.intent === "clinic_matching" || parsed.intent === "clinic_recommendation") {
      const scored = allClinics
        .map((clinic: any) => {
          const { score, reason, matchedPrices } = scoreClinic(clinic, allPricing, parsed);
          return { clinic, score, reason, matchedPrices };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      const recommendations: ClinicRecommendation[] = scored.map(({ clinic, score, reason, matchedPrices }: any) => ({
        clinicId: clinic.id,
        clinicName: clinic.clinicName,
        clinicSlug: clinic.clinicSlug || clinic.clinicName?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, "") || clinic.id,
        clinicType: clinic.category || clinic.clinicType || "",
        location: clinic.location ? `${clinic.location.city || ""}, ${clinic.location.country || ""}`.replace(/^, |, $/g, "") : "",
        rating: clinic.rating || 0,
        reviews: clinic.reviewCount || 0,
        matchScore: Math.min(99, 70 + Math.round(score / 2)),
        matchedPrices,
        supportedLanguages: (clinic.supportedLanguages || []).map((l: string) => l.toUpperCase()),
        reason,
        profilePath: `/agency-demo/medicalcenter/${clinic.clinicSlug || clinic.id}`,
        accommodation: clinic.accommodation !== false,
        transfer: clinic.transfer !== false,
        shortDescription: clinic.shortDescription || clinic.overview || "",
      }));

      if (recommendations.length > 0) {
        newCtx.lastRecommendedClinicIds = recommendations.map((r) => r.clinicId);
        newCtx.lastFocusedClinicId = recommendations[0].clinicId;
        newCtx.lastFocusedClinicName = recommendations[0].clinicName;
      }

      return NextResponse.json({
        reply: parsed.replyText || (parsed.language === "tr"
          ? `${parsed.subTreatment || "Tedaviniz"} için ${recommendations.length} uygun klinik buldum.`
          : `I found ${recommendations.length} suitable clinic(s) for ${parsed.subTreatment || "your treatment"}.`),
        type: "clinic_recommendations",
        clinics: recommendations,
        sessionContext: newCtx,
        showClinicCards: true, // always true for recommendations unless AI explicitly says false, but let's enforce true.
      }, { headers: CORS });
    }

    // --- CLINIC SELECTED OR CLINIC QUESTION ---
    if (parsed.intent === "clinic_question" || parsed.intent === "clinic_selected") {
      const clinicName = parsed.selectedClinicName || parsed.clinicName || ctx.lastFocusedClinicName;
      let clinic: any = null;
      if (clinicName) {
        const nameLower = clinicName.toLowerCase();
        clinic = allClinics.find((c: any) =>
          c.clinicName?.toLowerCase().includes(nameLower) ||
          nameLower.includes(c.clinicName?.toLowerCase().split(" ")[0] || "___")
        );
      }

      if (clinic) {
        const cPricing = allPricing.filter((p: any) => p.clinicId === clinic.id || (p.clinicName && clinic.clinicName && p.clinicName.toLowerCase() === clinic.clinicName.toLowerCase()));
        newCtx.lastFocusedClinicId = clinic.id;
        newCtx.lastFocusedClinicName = clinic.clinicName;

        const miniCard: ClinicRecommendation = {
          clinicId: clinic.id,
          clinicName: clinic.clinicName,
          clinicSlug: clinic.clinicSlug || clinic.id,
          clinicType: clinic.category || clinic.clinicType || "",
          location: clinic.location ? `${clinic.location.city || ""}, ${clinic.location.country || ""}`.replace(/^, |, $/g, "") : "",
          rating: clinic.rating || 0,
          reviews: clinic.reviewCount || 0,
          matchScore: 0,
          matchedPrices: cPricing.slice(0, 6).map(toMatchedPrice),
          supportedLanguages: (clinic.supportedLanguages || []).map((l: string) => l.toUpperCase()),
          reason: "",
          profilePath: `/agency-demo/medicalcenter/${clinic.clinicSlug || clinic.id}`,
          accommodation: clinic.accommodation !== false,
          transfer: clinic.transfer !== false,
          shortDescription: clinic.shortDescription || "",
        };

        return NextResponse.json({
          reply: parsed.replyText || `${clinic.clinicName} hakkında bilgi.`,
          type: "clinic_answer",
          clinics: [miniCard],
          sessionContext: newCtx,
          showClinicCards: parsed.showClinicCards === true,
        }, { headers: CORS });
      }

      return NextResponse.json({
        reply: parsed.replyText || (parsed.language === "tr"
          ? "Belirttiğiniz klinik sistemde bulunamadı."
          : "The specified clinic was not found."),
        type: "text",
        sessionContext: newCtx,
        showClinicCards: parsed.showClinicCards === true,
      }, { headers: CORS });
    }

    // --- PRICING QUESTION ---
    if (parsed.intent === "pricing_question") {
      const clinicName = parsed.clinicName || ctx.lastFocusedClinicName;
      let clinic: any = null;
      if (clinicName) {
        const nameLower = clinicName.toLowerCase();
        clinic = allClinics.find((c: any) => c.clinicName?.toLowerCase().includes(nameLower));
      }

      let relevantPricing = clinic
        ? allPricing.filter((p: any) => p.clinicId === clinic.id || (p.clinicName && clinic.clinicName && p.clinicName.toLowerCase() === clinic.clinicName.toLowerCase()))
        : allPricing;

      if (parsed.subTreatment) {
        const subLower = parsed.subTreatment.toLowerCase();
        const filtered = relevantPricing.filter((p: any) =>
          (p.subTreatmentName || p.treatmentName || "").toLowerCase().includes(subLower)
        );
        if (filtered.length > 0) relevantPricing = filtered;
      }

      const miniCard = clinic ? [{
        clinicId: clinic.id,
        clinicName: clinic.clinicName,
        clinicSlug: clinic.clinicSlug || clinic.id,
        clinicType: clinic.category || "",
        location: clinic.location ? `${clinic.location.city || ""}, ${clinic.location.country || ""}`.replace(/^, |, $/g, "") : "",
        rating: clinic.rating || 0,
        reviews: clinic.reviewCount || 0,
        matchScore: 0,
        matchedPrices: relevantPricing.slice(0, 8).map(toMatchedPrice),
        supportedLanguages: (clinic.supportedLanguages || []).map((l: string) => l.toUpperCase()),
        reason: "",
        profilePath: `/agency-demo/medicalcenter/${clinic.clinicSlug || clinic.id}`,
        accommodation: clinic.accommodation !== false,
        transfer: clinic.transfer !== false,
        shortDescription: "",
      } as ClinicRecommendation] : undefined;

      if (clinic) {
        newCtx.lastFocusedClinicId = clinic.id;
        newCtx.lastFocusedClinicName = clinic.clinicName;
      }

      return NextResponse.json({
        reply: parsed.replyText || "Fiyat bilgisi.",
        type: "pricing_answer",
        clinics: miniCard,
        sessionContext: newCtx,
      }, { headers: CORS });
    }

    // --- DOCTOR QUESTION ---
    if (parsed.intent === "doctor_question") {
      const clinicName = parsed.clinicName || ctx.lastFocusedClinicName;
      let clinic: any = null;
      if (clinicName) {
        const nameLower = clinicName.toLowerCase();
        clinic = allClinics.find((c: any) => c.clinicName?.toLowerCase().includes(nameLower));
      }

      if (clinic) {
        newCtx.lastFocusedClinicId = clinic.id;
        newCtx.lastFocusedClinicName = clinic.clinicName;

        try {
          const doctorSnap = await adminDb.collection("agencies").doc(agencyId)
            .collection("clinics").doc(clinic.id)
            .collection("doctors").orderBy("order", "asc").get();
          const doctors = doctorSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((doc: any) => doc.status === "active");

          if (doctors.length > 0) {
            const docLines = doctors.map((d: any) => {
              const title = d.title || "";
              const specs = (d.specialties || []).join(", ");
              return `• ${title} ${d.name}${specs ? ` — ${specs}` : ""}`;
            }).join("\n");

            const lang = parsed.language || "tr";
            const replyText = parsed.replyText || (lang === "tr"
              ? `${clinic.clinicName} doktor kadrosu:\n\n${docLines}`
              : `${clinic.clinicName} medical team:\n\n${docLines}`);

            return NextResponse.json({
              reply: replyText,
              type: "doctor_answer",
              sessionContext: newCtx,
            }, { headers: CORS });
          }
        } catch (e) {
          console.error("[matching-chat] Doctor fetch error:", e);
        }

        return NextResponse.json({
          reply: parsed.replyText || (parsed.language === "tr"
            ? `${clinic.clinicName} için sistemde doktor bilgisi henüz tanımlı değil.`
            : `No doctor information is available for ${clinic.clinicName} yet.`),
          type: "text",
          sessionContext: newCtx,
        }, { headers: CORS });
      }

      return NextResponse.json({
        reply: parsed.replyText || (parsed.language === "tr"
          ? "Hangi kliniğin doktorlarını öğrenmek istediğinizi belirtir misiniz?"
          : "Could you specify which clinic's doctors you'd like to learn about?"),
        type: "text",
        sessionContext: newCtx,
      }, { headers: CORS });
    }

    // --- GENERAL / FALLBACK ---
    return NextResponse.json({
      reply: parsed.replyText || (parsed.language === "tr"
        ? "Size nasıl yardımcı olabilirim? Hangi tedaviyi aradığınızı, lokasyonunuzu veya bütçenizi paylaşabilirsiniz."
        : "How can I help you? Share the treatment you're looking for, your preferred location, or budget."),
      type: "text",
      sessionContext: newCtx,
      showClinicCards: parsed.showClinicCards === true,
    }, { headers: CORS });

  } catch (err: any) {
    console.error("[matching-chat] Error:", err);
    return NextResponse.json(
      { reply: "Şu an teknik bir sorun yaşıyoruz. Lütfen tekrar deneyin.", type: "text" },
      { status: 200, headers: CORS }
    );
  }
}
