import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getAdminDb } from "@/lib/firebase-admin";

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

function buildClinicContext(clinics: any[], pricing: any[]): string {
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
    const { message, history = [], sessionContext = {} } = body;

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400, headers: CORS });
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

    console.log(`[matching-chat] Agency: ${slug}, Clinics: ${allClinics.length}, Pricing: ${allPricing.length}`);
    if (allPricing.length > 0) {
      console.log(`[matching-chat] Sample pricing:`, JSON.stringify(allPricing[0]));
    }

    /* ── 2. Build clinic context for OpenAI ── */
    const clinicContext = buildClinicContext(allClinics, allPricing);

    /* ── 3. Build session context hint ── */
    const ctx: SessionContext = sessionContext;
    let contextHint = "";
    if (ctx.lastFocusedClinicName) {
      contextHint += `\nPrevious context: The patient was last looking at "${ctx.lastFocusedClinicName}" (ID: ${ctx.lastFocusedClinicId}).`;
    }
    if (ctx.lastTreatmentCategory) {
      contextHint += ` Previous treatment interest: ${ctx.lastTreatmentCategory}.`;
    }
    if (ctx.lastSubTreatment) {
      contextHint += ` Sub-treatment: ${ctx.lastSubTreatment}.`;
    }

    /* ── 4. OpenAI Call: Intent Extraction + Response ── */
    const systemPrompt = `Sen bir sağlık turizmi AI asistanısın. Görevin hastaların doğru kliniği bulmasına yardımcı olmak.

KURALLAR:
1. Hastanın mesajını analiz et ve aşağıdaki JSON formatında yanıt ver.
2. Hasta mesajı eksikse (tedavi, lokasyon veya bütçe belirtmemişse) needsFollowUp: true yap ve takip sorusu sor.
3. Hasta belirli bir klinik hakkında soru soruyorsa (nasıl bir klinik, hangi tedavileri sunuyor, doktorları kim, transfer var mı gibi) intent: "clinic_question" olarak işaretle.
4. "Bu klinik", "orası", "o klinik" gibi ifadeler önceki context'teki kliniğe referanstır.
5. Hasta fiyat soruyorsa intent: "pricing_question" olarak işaretle.
6. Hasta doktor soruyorsa intent: "doctor_question" olarak işaretle.
7. FİYATLARI ASLA UYDURMA. Sadece aşağıdaki klinik verilerindeki fiyatları kullan. Fiyat yoksa "Bu tedavi için sistemde net fiyat tanımlı değil. Teklif alarak öğrenebilirsiniz." de.
8. Türkçe mesaja Türkçe, İngilizce mesaja İngilizce yanıt ver.
9. Yanıtların doğal, nazik ve profesyonel olsun.
10. Tıbbi teşhis koyma, sadece bilgi ver ve yönlendir.

MEVCUT KLİNİKLER VE FİYATLAR:

${clinicContext}
${contextHint}

JSON FORMATI:
{
  "intent": "clinic_matching" | "clinic_question" | "pricing_question" | "doctor_question" | "followup" | "general",
  "language": "tr" | "en",
  "treatmentCategory": string | null,
  "subTreatment": string | null,
  "location": string | null,
  "budgetAmount": number | null,
  "budgetCurrency": string | null,
  "clinicName": string | null,
  "needsFollowUp": boolean,
  "replyText": "Doğal dilde AI yanıtı"
}

ÖNEMLİ:
- replyText alanı hastaya gösterilecek doğal dildeki yanıttır.
- clinic_matching intent'inde replyText kısa bir giriş olmalı (ör: "Antalya'da implant tedavisi için uygun klinikleri listeledim."). Klinik detaylarını replyText'e yazma, kartlardan gösterilecek.
- followup intent'inde replyText takip sorularını içermeli.
- clinic_question intent'inde replyText klinik hakkında detaylı bilgi vermeli (klinik verisinden).
- pricing_question intent'inde replyText fiyat bilgisini içermeli (sadece gerçek veriden).`;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-10).map((h: any) => ({
          role: h.role as "user" | "assistant",
          content: typeof h.content === "string" ? h.content : JSON.stringify(h.content),
        })),
        { role: "user", content: message },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";
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

    console.log(`[matching-chat] Intent: ${parsed.intent}, Treatment: ${parsed.treatmentCategory}, Sub: ${parsed.subTreatment}, Location: ${parsed.location}, ClinicName: ${parsed.clinicName}`);

    const newCtx: SessionContext = { ...ctx };
    if (parsed.treatmentCategory) newCtx.lastTreatmentCategory = parsed.treatmentCategory;
    if (parsed.subTreatment) newCtx.lastSubTreatment = parsed.subTreatment;
    if (parsed.location) newCtx.lastLocation = parsed.location;

    /* ── 5. Handle each intent type ── */

    // --- FOLLOW-UP ---
    if (parsed.intent === "followup" || parsed.needsFollowUp) {
      return NextResponse.json({
        reply: parsed.replyText || "Hangi tedaviyi arıyorsunuz?",
        type: "text",
        sessionContext: newCtx,
      }, { headers: CORS });
    }

    // --- CLINIC MATCHING ---
    if (parsed.intent === "clinic_matching") {
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
      }, { headers: CORS });
    }

    // --- CLINIC QUESTION ---
    if (parsed.intent === "clinic_question") {
      const clinicName = parsed.clinicName || ctx.lastFocusedClinicName;
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
        }, { headers: CORS });
      }

      return NextResponse.json({
        reply: parsed.replyText || (parsed.language === "tr"
          ? "Belirttiğiniz klinik sistemde bulunamadı."
          : "The specified clinic was not found."),
        type: "text",
        sessionContext: newCtx,
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
    }, { headers: CORS });

  } catch (err: any) {
    console.error("[matching-chat] Error:", err);
    return NextResponse.json(
      { reply: "Şu an teknik bir sorun yaşıyoruz. Lütfen tekrar deneyin.", type: "text" },
      { status: 200, headers: CORS }
    );
  }
}
