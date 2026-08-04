import { saveConversationStateAsync } from "@/lib/services/conversationHelper";
import { NextResponse } from "next/server";
import { trackableAIRequest } from "@/lib/services/aiGateway";
import { getAdminDb } from "@/lib/firebase-admin";
import { sendAgencyLeadNotification } from "@/lib/services/emailService";
import { getCached, setCached } from "@/lib/services/agencyCache";
import {
  IntentRouter,
  SlotExtractor,
  ConversationFeatureFlags,
  ConversationLogger,
  looksLikeRequestPhrase
} from "@/lib/conversation";
import {
  getCuratedClinicsForFeelinHealthy,
  evaluateFeelinHealthyIntake,
  getGroupIntakePrompt,
  getUnsupportedLocationPrompt,
  calculateAdditionalCountAndConversion,
  resolveCityAndSide,
  resolveIstanbulSideFromText,
  getIstanbulSideClarificationCard,
  decideFeelinHealthyLocationNextStep,
  getCitySelectionCard,
  getCityDisplayName,
  getTreatmentClarificationPrompt,
  isReadyForClinicMatching,
  getClinicMatchingReadyReply,
  getSideGuidancePrompt,
  formatClinicCardLocation,
  FEELINHEALTHY_CONFIG,
  buildFeelinHealthyMatchingDiagnostics,
  logFeelinHealthyMatchingDiagnostics,
  normalizeTreatmentBranch,
  type IntakeGroupNumber,
} from "@/lib/agency/feelinhealthyConfig";
import {
  getStructuredConsentData,
  validatePrivacyNoticeUrl
} from "@/lib/utils/privacyNotice";
import {
  compileAssistantPolicy,
  buildAuthoritativeSystemPrompt,
  logPolicyConflicts,
} from "@/lib/agency/assistantPolicy";
import {
  resolveAssistantRole,
  isExplicitReturnToNetworkDiscovery,
  exitToNetworkAdvisor,
  enterClinicCoordinator,
  getCoordinatorClinicId,
  buildPatientProfileSummary,
  buildClinicCoordinatorSystemPrompt,
  estimatePromptSize,
} from "@/lib/agency/assistantModes";

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
  doctorMatch?: {
    hasRelevantDoctors: boolean;
    relevantDoctorCount: number;
    displayedDoctorCount: number;
    matchBasis: string;
    doctors: any[];
  };
}

interface SessionContext {
  sessionId?: string;
  leadStage?: "discovery" | "recommendation" | "clinic_selected" | "lead_capture" | "collecting_email" | "collecting_consent" | "quote_request_created" | "completed";
  selectedClinicId?: string;
  selectedClinicName?: string;
  patientName?: string;
  patientEmail?: string;
  patientEmailStatus?: "missing" | "collected" | "invalid" | "verified_format";
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

  clinicSelectionMode?: "automatic" | "manual" | "assisted" | null;
  selectedClinicIds?: string[];
  clinicSelectionStatus?: "not_started" | "in_progress" | "completed";
  showProfileLinks?: boolean;
  pendingUserMessage?: string;
  pendingHealthRequest?: string;
  processingMode?: "degraded" | "normal";
  firstName?: string;
  lastName?: string;
  age?: number;
  gender?: string;

  // FeelinHealthy specific session fields
  intakeStage?: IntakeGroupNumber;
  pendingLocationExpansion?: boolean;
  pendingLocationExpansionTarget?: string;
  pendingLocationBranch?: string;
  isGuestUser?: boolean;
  selectedCity?: string | null;
  locationSelectionConfirmed?: boolean;
  sideSelectionConfirmed?: boolean;
  availableCities?: string[];
  pendingCitySelection?: boolean;
  istanbul_side?: "european" | "anatolian" | "unsure" | null;
  istanbul_side_source?: "explicit_text" | "structured_card" | "district_cue" | "airport_cue" | "branch_implicit" | null;
  pendingSideClarification?: boolean;
  pendingSideGuidance?: boolean;
}

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Resolves a doctor's display name across record shapes.
 *
 * `ClinicDoctor` stores the canonical value in `full_name`; `doctorName` is an
 * optional denormalised alias that migrated records may not carry. Reading only
 * the alias produced an undefined name in the clinic card payload.
 */
function resolveDoctorFullName(doctor: any): string {
  const candidate =
    doctor?.doctorName || doctor?.full_name || doctor?.fullName || doctor?.name;
  return typeof candidate === "string" ? candidate.trim() : "";
}

function buildClinicContext(clinics: any[], pricing: any[], knowledgeRecords: any[] = [], aiConfigs: any[] = [], agencyKnowledge: any[] = [], showPriceRange: boolean = true): string {
  const lines: string[] = [];
  
  if (agencyKnowledge.length > 0) {
    const agKb = agencyKnowledge.map(k => `[${k.knowledgeType.toUpperCase()}] ${k.title}:\n${k.content}`).join("\n\n");
    lines.push(`=== AGENCY DESTINATION & GENERAL KNOWLEDGE ===\n${agKb}\n(Note: This is general agency knowledge, NOT a specific clinic's capability. Do not assume all clinics provide these services unless stated in the clinic's section.)\n==============================================\n`);
  }

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
${showPriceRange ? priceStr : "  (Fiyat bilgisi gizlidir veya paylaşılmamalıdır)"}`);
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
  const routeStart = performance.now();
  let requestBody: any = {};
  let resolvedAgencyId: string | undefined = undefined;
  let agencyContextLoadMs = 0;
  let clinicPrefilterMs = 0;
  let promptBuildMs = 0;
  let openAiTotalMs = 0;
  let responseParseMs = 0;
  const clinicMatchingMs = 0;
  let requestValidationMs = 0;

  const jsonResponse = (respBody: any, init?: any) => {
    try {
      if (respBody && respBody.sessionContext && resolvedAgencyId) {
        saveConversationStateAsync(resolvedAgencyId, respBody.sessionContext, requestBody?.history || [], respBody.reply, respBody.type).catch(console.error);
      }
    } catch(e) {}
    
    const totalMs = performance.now() - routeStart;
    if (typeof respBody === "object" && respBody !== null) {
      respBody.trace = {
        requestValidationMs: Math.round(requestValidationMs),
        agencyContextLoadMs: Math.round(agencyContextLoadMs),
        clinicPrefilterMs: Math.round(clinicPrefilterMs),
        promptBuildMs: Math.round(promptBuildMs),
        openAiTotalMs: Math.round(openAiTotalMs),
        responseParseMs: Math.round(responseParseMs),
        clinicMatchingMs: Math.round(clinicMatchingMs),
        totalMs: Math.round(totalMs)
      };
      console.log(`[matching-chat] Trace totalMs=${Math.round(totalMs)}`, respBody.trace);
    }
    return NextResponse.json(respBody, init);
  };

  let slug = "";
  try {
    try {
      const resolvedParams = await params;
      slug = resolvedParams?.slug || "";
    } catch {}
    if (!slug && req.url) {
      const pathParts = new URL(req.url).pathname.split("/").filter(Boolean);
      slug = pathParts.find((p, i, a) => a[i + 1] === "matching-chat") || pathParts[pathParts.length - 2] || "";
    }

    requestBody = await req.json();
    const { message, action, history = [], sessionContext = {} } = requestBody;
    requestValidationMs = performance.now() - routeStart;

    let finalMessage = message;

    // True when finalMessage is the treatment request replayed after consent.
    // That text describes what the patient wants, never who they are, so it
    // must not be mined for intake fields.
    let isReplayedTreatmentRequest = false;

    // Structured city/side cards only update location state. They must never be
    // treated as free-text intake answers and must not restart Group 1.
    let structuredLocationAction = false;

    const adminDb = getAdminDb();
    if (!adminDb && slug !== "feelinhealthy") {
      return jsonResponse(
        { reply: "Veritabanı bağlantısı kurulamadı.", type: "text" },
        { status: 503, headers: CORS }
      );
    }

    const cacheKeyAgencySlug = `agency-config-slug:${slug}`;
    const cachedAgency = getCached<{ agencyId: string; agencyData: any; matchingConfig: any }>(cacheKeyAgencySlug);

    let agencyId: string;
    let agencyData: any;
    let matchingConfig: any;

    if (cachedAgency) {
      agencyId = cachedAgency.agencyId;
      agencyData = cachedAgency.agencyData;
      matchingConfig = cachedAgency.matchingConfig;
    } else {
      let agencySnap: any = null;
      try {
        if (adminDb) {
          agencySnap = await adminDb.collection("agencies")
            .where("slug", "==", slug).where("status", "==", "active").limit(1).get();
        }
      } catch (dbErr) {
        console.warn("[matching-chat] Agency DB fetch failed, using fallback if available:", dbErr);
      }

      if (!agencySnap || agencySnap.empty) {
        if (slug === "feelinhealthy") {
          agencyId = "feelinhealthy";
          agencyData = {
            name: "FeelinHealthy",
            slug: "feelinhealthy",
            privacyUrl: "https://feelinhealthy.com/kvkk",
            settings: { maxClinicsPerTreatmentRequest: 3 }
          };
          matchingConfig = { maxClinicsToShow: 3, showPriceRange: true, showProfileLinks: true };
        } else {
          return jsonResponse({ error: "Agency not found" }, { status: 404, headers: CORS });
        }
      } else {
        agencyId = agencySnap.docs[0].id;
        agencyData = agencySnap.docs[0].data();

        // Load Agency Matching Config
        try {
          const matchingSnap = adminDb ? await adminDb.collection("agencies").doc(agencyId).collection("config").doc("matching").get() : null;
          matchingConfig = matchingSnap && matchingSnap.exists ? matchingSnap.data() : null;
        } catch (e) {
          matchingConfig = null;
        }
      }

      setCached(cacheKeyAgencySlug, { agencyId, agencyData, matchingConfig }, 5 * 60 * 1000);
    }
    resolvedAgencyId = agencyId;

    const maxClinics = matchingConfig?.maxClinicsToShow || agencyData.settings?.maxClinicsPerTreatmentRequest || 3;
    const showPriceRange = matchingConfig?.showPriceRange !== false;
    const showProfileLinks = matchingConfig?.showProfileLinks !== false;
    // Initialize selection arrays
    if (!sessionContext.selectedClinicIds) {
      sessionContext.selectedClinicIds = [];
    }

    // Handle system actions
    if (action) {
      if (action.type === "clinic_selected") {
        Object.assign(
          sessionContext,
          enterClinicCoordinator(sessionContext, {
            id: String(action.clinicId || ""),
            name: String(action.clinicName || "Selected clinic"),
          })
        );
        finalMessage =
          slug === "feelinhealthy"
            ? `[SİSTEM AKSİYONU: Hasta '${action.clinicName}' kliniğini seçti. Backend state: clinic_selected. Artık Clinic Patient Coordinator rolündesin. Keşif/matching/intake/şehir/yaka SORMA. Kısa ve sıcak bir onay ver; yalnızca bu klinik bağlamında yardımcı ol.]`
            : `[SİSTEM AKSİYONU: Kullanıcı arayüzden 'Bu Klinikle Devam Et' butonuna tıklayarak '${action.clinicName}' kliniğini seçti. Lütfen bu seçimi doğal ve profesyonel bir şekilde onayla, klinik hakkında çok kısa bilgi ver ve ardından HEMEN lead toplama aşamasının İLK sorusu olan Ad Soyad bilgisini iste.]`;
      } else if (action.type === "clinic_info") {
        sessionContext.lastFocusedClinicId = action.clinicId;
        sessionContext.lastFocusedClinicName = action.clinicName;
        // Soft focus only — coordinator role requires explicit clinic_selected / leadStage.
        finalMessage = `[SİSTEM AKSİYONU: Kullanıcı arayüzden 'Daha Fazla Bilgi' butonuna tıklayarak '${action.clinicName}' hakkında bilgi istedi. Lütfen klinik hakkında genel bilgi ver, öne çıkan özelliklerini veya doktorlarını sırala. En sonda bu klinikle devam etmek isteyip istemediğini sor. (Henüz lead toplamaya başlama)]`;
      } else if (action.type === "lead_capture") {
        const currentSelected = new Set<string>(sessionContext.selectedClinicIds || []);
        currentSelected.add(action.clinicId);
        sessionContext.selectedClinicIds = Array.from(currentSelected);
        Object.assign(
          sessionContext,
          enterClinicCoordinator(sessionContext, {
            id: String(action.clinicId || ""),
            name: String(action.clinicName || "Selected clinic"),
          })
        );
        finalMessage =
          slug === "feelinhealthy" && sessionContext.patientName && sessionContext.patientEmail
            ? `[SİSTEM AKSİYONU: Hasta '${action.clinicName}' için teklif istedi. Backend state: clinic_selected. Clinic Patient Coordinator olarak onayla; intake tamamsa Ad/e-posta tekrar isteme. Röntgen, süre, transfer, fiyat açıklaması gibi klinik sorularına bu klinik bilgisiyle cevap ver.]`
            : `[SİSTEM AKSİYONU: Kullanıcı arayüzden 'Teklif İste' butonuna tıklayarak '${action.clinicName}' kliniği için teklif almak istediğini belirtti. Lütfen HEMEN lead toplama aşamasının İLK sorusu olan Ad Soyad bilgisini iste.]`;
      } else if (action.type === "patient_email_submission") {
        const { normalizeEmail, isValidEmail } = await import("@/lib/utils/emailValidation");
        const normalized = normalizeEmail(action.email);
        if (isValidEmail(normalized)) {
          finalMessage = `[SİSTEM AKSİYONU: Kullanıcı e-posta formunu doldurarak geçerli bir e-posta adresi iletti: ${normalized}. Lütfen bunu onayla ve lead toplama aşamasına kaldığın yerden devam et.]`;
          sessionContext.patientEmail = normalized;
          sessionContext.patientEmailStatus = "verified_format";
        } else {
          return jsonResponse({
            reply: action.locale === "tr"
              ? "Bu e-posta adresinde küçük bir yazım hatası olabilir. Kontrol ederek yeniden paylaşabilir misiniz?"
              : "There may be a small typo in this email address. Could you check it and share it again?",
            type: "text",
            sessionContext,
            showClinicCards: false
          }, { headers: CORS });
        }
      } else if (action.type === "clinic_selection_mode") {
        if (action.mode === "automatic") {
           const recommended = sessionContext.lastRecommendedClinicIds || [];
           sessionContext.clinicSelectionMode = "automatic";
           sessionContext.selectedClinicIds = recommended.slice(0, maxClinics);
           sessionContext.clinicSelectionStatus = "in_progress";
           finalMessage = `[SİSTEM AKSİYONU: Kullanıcı 'Tüm uygun kliniklerden teklif al' seçeneğini seçti. Sistem en uygun olan ${sessionContext.selectedClinicIds.length} kliniği seçti. Lütfen seçilen klinikleri kullanıcıya listeleyerek özetle ve seçimlerini değiştirebileceklerini veya bu kliniklerle devam edebileceklerini belirt. Henüz lead toplama aşamasına geçme.]`;
        } else if (action.mode === "manual") {
           sessionContext.clinicSelectionMode = "manual";
           sessionContext.clinicSelectionStatus = "in_progress";
           finalMessage = `[SİSTEM AKSİYONU: Kullanıcı 'Klinikleri tek tek seç' seçeneğini seçti. Lütfen klinik kartları üzerinden seçim yapmasını bekle. En fazla ${maxClinics} klinik seçilebileceğini hatırlat.]`;
        }
      } else if (action.type === "clinic_selection_update") {
        sessionContext.clinicSelectionMode = "manual";
        sessionContext.clinicSelectionStatus = "in_progress";
        const currentSelected = new Set<string>(sessionContext.selectedClinicIds);
        
        if (action.action === "select") {
          if (currentSelected.size >= maxClinics) {
             return jsonResponse({
                reply: action.locale === "tr" 
                  ? `Aynı talep için en fazla ${maxClinics} klinik seçebilirsiniz. Yeni bir klinik seçmek için mevcut seçimlerinizden birini kaldırabilirsiniz.`
                  : `You can select up to ${maxClinics} clinics for the same request. Remove one of your current selections to choose another clinic.`,
                type: "text",
                sessionContext,
                showClinicCards: false
             }, { headers: CORS });
          }
          currentSelected.add(action.clinicId);
          sessionContext.selectedClinicIds = Array.from(currentSelected);
          finalMessage = `[SİSTEM AKSİYONU: Kullanıcı ${action.clinicName} kliniğini seçti. Toplam seçilen klinik sayısı: ${currentSelected.size}/${maxClinics}. Sadece 'Seçiminiz kaydedildi, başka klinik seçebilir veya devam edebilirsiniz' diyerek kısa bir yanıt ver.]`;
        } else if (action.action === "deselect") {
          currentSelected.delete(action.clinicId);
          sessionContext.selectedClinicIds = Array.from(currentSelected);
          finalMessage = `[SİSTEM AKSİYONU: Kullanıcı ${action.clinicName} kliniğinin seçimini kaldırdı. Toplam seçilen klinik sayısı: ${currentSelected.size}/${maxClinics}.]`;
        }
      } else if (action.type === "clinic_selection_complete") {
        sessionContext.clinicSelectionStatus = "completed";
        finalMessage = `[SİSTEM AKSİYONU: Kullanıcı klinik seçimini tamamladı. Seçilen toplam klinik sayısı: ${sessionContext.selectedClinicIds?.length || 0}. Artık lead toplama sürecine (Ad Soyad vb.) geçebilirsin.]`;
      } else if (action.type === "privacy_consent_response") {
        const { saveConsentRecord } = await import("@/lib/services/agencyConsentService");
        const consentLang = action.locale || "tr";
        const consentStatus = action.action === "accept" ? "accepted" : "declined";
        const privacySettingsForConsent = agencyData.privacySettings || {
          enabled: true, mode: "kvkk", version: "v1.0",
          consentTextTr: "", consentTextEn: "", requiredBeforePersonalData: true
        };

        const sid = sessionContext.sessionId || `sess_${Date.now()}`;
        sessionContext.sessionId = sid;

        await saveConsentRecord(
          agencyId,
          sid,
          consentStatus as any,
          privacySettingsForConsent.version,
          consentLang,
          "agency_widget"
        );

        if (consentStatus === "declined") {
          sessionContext.quoteConsent = false;
          return jsonResponse({
            reply: consentLang === "tr"
              ? "Elbette. Onay vermeden de tedaviler ve genel klinik hizmetleri hakkında bilgi alabilirsiniz. Ancak kişisel bilgilerinizi kullanarak klinik önerisi veya teklif talebi oluşturamam."
              : "Of course. You may still receive general information about treatments and clinic services, but I cannot create a personalized clinic recommendation or treatment request without your consent.",
            type: "consent_declined",
            sessionContext,
            showClinicCards: false
          }, { headers: CORS });
        }

        // Consent accepted — set flag and re-process pending message if available
        sessionContext.quoteConsent = true;
        const pendingMsg = sessionContext.pendingUserMessage;
        if (pendingMsg) {
          finalMessage = pendingMsg;
          isReplayedTreatmentRequest = true;
          delete sessionContext.pendingUserMessage;
        } else {
          finalMessage = consentLang === "tr"
            ? "Onayım var, tedavi ihtiyacım hakkında bilgi vermek istiyorum."
            : "I have given my consent, I would like to provide information about my treatment needs.";
        }
      } else if (action.type === "select_treatment_city") {
        structuredLocationAction = true;
        const cityLang = action.locale || "tr";
        const isEn = cityLang.toLowerCase().startsWith("en");
        const cityValue = String(action.city || action.value || "").toLowerCase();

        if (cityValue === "undecided" || cityValue === "travel_help") {
          delete sessionContext.selectedCity;
          delete sessionContext.locationSelectionConfirmed;
          sessionContext.pendingCitySelection = true;
          finalMessage = isEn
            ? "I’m not sure about the city yet. Could you help based on travel and transfer plans?"
            : "Henüz şehir konusunda karar vermedim. Ulaşım ve seyahat planıma göre yardımcı olur musunuz?";
        } else if (cityValue) {
          // Location only — never clear intake, consent, or treatment.
          sessionContext.selectedCity = cityValue;
          sessionContext.locationSelectionConfirmed = true;
          sessionContext.lastLocation = getCityDisplayName(cityValue, cityLang);
          sessionContext.pendingCitySelection = false;
          // Choosing a non-Istanbul city must clear any leftover Istanbul side state.
          if (cityValue !== "istanbul") {
            delete sessionContext.istanbul_side;
            delete sessionContext.istanbul_side_source;
            delete sessionContext.pendingSideClarification;
            delete sessionContext.sideSelectionConfirmed;
          }
          finalMessage = isEn
            ? `I prefer ${getCityDisplayName(cityValue, "en")}. Please continue with suitable clinics there.`
            : `${getCityDisplayName(cityValue, "tr")} tercih ediyorum. Uygun kuruluşlarla devam edelim.`;
        }
      } else if (action.type === "side_selection") {
        structuredLocationAction = true;
        const sideLang = action.locale || "tr";
        const isEn = sideLang.toLowerCase().startsWith("en");
        if (action.side === "european" || action.side === "anatolian") {
          sessionContext.istanbul_side = action.side;
          sessionContext.istanbul_side_source = "structured_card";
          sessionContext.selectedCity = "istanbul";
          sessionContext.locationSelectionConfirmed = true;
          sessionContext.sideSelectionConfirmed = true;
          sessionContext.lastLocation = action.side === "anatolian" ? "İstanbul Anadolu Yakası" : "İstanbul Avrupa Yakası";
          delete sessionContext.pendingSideClarification;
          delete sessionContext.pendingSideGuidance;
          finalMessage = action.side === "european"
            ? (isEn ? "I prefer Istanbul European Side. Please recommend suitable clinics." : "İstanbul Avrupa Yakası'nı tercih ediyorum. Uygun klinikleri listeleyebilir misiniz?")
            : (isEn ? "I prefer Istanbul Anatolian Side. Please recommend suitable clinics." : "İstanbul Anadolu Yakası'nı tercih ediyorum. Uygun klinikleri listeleyebilir misiniz?");
        } else if (action.side === "unsure") {
          sessionContext.istanbul_side = "unsure";
          sessionContext.istanbul_side_source = "structured_card";
          sessionContext.selectedCity = "istanbul";
          sessionContext.locationSelectionConfirmed = true;
          sessionContext.sideSelectionConfirmed = false;
          sessionContext.pendingSideGuidance = true;
          finalMessage = isEn
            ? "I am not sure between the European and Anatolian sides. Could you help guide me based on my arrival airport or hotel area?"
            : "İstanbul'un iki yakası arasında emin değilim. Havaalanı veya otel bölgesine göre bana yardımcı olabilir misiniz?";
        }
      } else if (action.type === "branch_side_confirm") {
        structuredLocationAction = true;
        const sideLang = action.locale || "tr";
        const isEn = sideLang.toLowerCase().startsWith("en");
        if (action.action === "confirm" && (action.side === "anatolian" || action.side === "european")) {
          sessionContext.istanbul_side = action.side;
          sessionContext.istanbul_side_source = "structured_card";
          sessionContext.selectedCity = "istanbul";
          sessionContext.locationSelectionConfirmed = true;
          sessionContext.sideSelectionConfirmed = true;
          sessionContext.lastLocation = action.side === "anatolian" ? "İstanbul Anadolu Yakası" : "İstanbul Avrupa Yakası";
          delete sessionContext.pendingSideClarification;
          delete sessionContext.pendingSideGuidance;
          finalMessage = action.side === "anatolian"
            ? (isEn ? "Yes, please show options on the Anatolian Side." : "Evet, Anadolu Yakası'ndaki seçenekleri değerlendirmek istiyorum.")
            : (isEn ? "Yes, please show options on the European Side." : "Evet, Avrupa Yakası'ndaki seçenekleri değerlendirmek istiyorum.");
        } else {
          delete sessionContext.istanbul_side;
          delete sessionContext.sideSelectionConfirmed;
          delete sessionContext.selectedCity;
          delete sessionContext.locationSelectionConfirmed;
          delete sessionContext.pendingSideClarification;
          sessionContext.pendingCitySelection = true;
          finalMessage = isEn
            ? "No, I would like to explore options in other cities."
            : "Hayır, İstanbul dışındaki diğer şehir seçeneklerini görmek istiyorum.";
        }
      }
    }

    if (!finalMessage) {
      return jsonResponse({ error: "message or action is required" }, { status: 400, headers: CORS });
    }

    /* ── DETERMINISTIC INTERCEPTORS (PHASE 3) ── */
    const { requireAcceptedAgencyConsent } = await import("@/lib/services/agencyConsentService");
    
    const ctx: SessionContext = sessionContext || {};
    if (!ctx.sessionId) {
      ctx.sessionId = `sess_${Date.now()}`;
    }

    const isFeelinHealthy = slug === "feelinhealthy" || agencyData.slug === "feelinhealthy";

    // Explicit patient request to leave Clinic Coordinator → Network Advisor.
    // Entering coordinator is backend-state-only; exiting requires explicit rediscovery language.
    if (
      resolveAssistantRole(ctx) === "clinic_coordinator" &&
      isExplicitReturnToNetworkDiscovery(finalMessage || message)
    ) {
      Object.assign(ctx, exitToNetworkAdvisor(ctx));
    }

    // While Group 1 is open a bare full name is a legitimate answer, so the
    // extractor is told a name is expected. At every other point an unlabelled
    // phrase is left alone rather than guessed at as a name.
    const expectedIntakeSlot =
      isFeelinHealthy &&
      !isReplayedTreatmentRequest &&
      !structuredLocationAction &&
      resolveAssistantRole(ctx) !== "clinic_coordinator" &&
      !evaluateFeelinHealthyIntake(ctx).group1Complete
        ? "patientName"
        : undefined;

    // Intent Router & Slot Extractor Evaluation for Agency
    const agencySlotsExtracted = SlotExtractor.extractSlots(
      finalMessage || message || "",
      {
        fullName: ctx.patientName,
        phone: ctx.patientPhone,
        email: ctx.patientEmail,
        treatment: ctx.lastTreatmentCategory
      },
      agencyData.defaultLanguage || "tr",
      "Europe/Istanbul",
      expectedIntakeSlot
    );

    const agencyIntentResult = IntentRouter.classifyConversationIntent({
      message: finalMessage || message || "",
      collectedSlots: {
        fullName: ctx.patientName,
        phone: ctx.patientPhone,
        email: ctx.patientEmail,
        treatment: ctx.lastTreatmentCategory
      },
      activeTreatment: ctx.lastTreatmentCategory,
      activeClinic: ctx.selectedClinicName || ctx.lastFocusedClinicName,
      agencyContext: {
        agencyId,
        agencySlug: slug
      },
      locale: agencyData.defaultLanguage || "tr"
    });

    if (agencyIntentResult.intent === "emergency") {
      const isEn = (agencyData.defaultLanguage || "tr").toLowerCase().startsWith("en");
      const emMsg = isEn
        ? "⚠️ If you are experiencing a medical emergency, severe pain, or bleeding, please immediately contact emergency services (112) or the nearest emergency medical clinic."
        : "⚠️ Acil bir sağlık durumu, şiddetli ağrı veya kanama yaşıyorsanız lütfen derhal en yakın acil servise başvurun veya 112 Acil Yardım hattını arayın.";
      return NextResponse.json({
        responseType: "chat_message",
        reply: emMsg,
        sessionContext: ctx
      }, { headers: CORS });
    }

    if (
      !structuredLocationAction &&
      agencyIntentResult.clarificationNeeded &&
      agencyIntentResult.clarificationPrompt
    ) {
      return NextResponse.json({
        responseType: "chat_message",
        reply: agencyIntentResult.clarificationPrompt,
        quickReplies: agencyIntentResult.suggestedOptions || [],
        sessionContext: ctx
      }, { headers: CORS });
    }

    if (agencySlotsExtracted.extracted.treatment && !ctx.lastTreatmentCategory) {
      ctx.lastTreatmentCategory = agencySlotsExtracted.extracted.treatment;
    }

    // The replayed treatment request and structured city/side actions must never
    // write intake fields. City/side cards only update location state.
    if (!isReplayedTreatmentRequest && !structuredLocationAction) {
      if (agencySlotsExtracted.extracted.fullName && !ctx.patientName) {
        ctx.patientName = agencySlotsExtracted.extracted.fullName;
      }
      if (agencySlotsExtracted.extracted.firstName) {
        ctx.firstName = agencySlotsExtracted.extracted.firstName;
      }
      if (agencySlotsExtracted.extracted.lastName) {
        ctx.lastName = agencySlotsExtracted.extracted.lastName;
      }
      if (agencySlotsExtracted.extracted.phone && !ctx.patientPhone) {
        ctx.patientPhone = agencySlotsExtracted.extracted.phone;
      }
      if (agencySlotsExtracted.extracted.email && !ctx.patientEmail) {
        ctx.patientEmail = agencySlotsExtracted.extracted.email;
      }
      if (agencySlotsExtracted.extracted.patientAge !== undefined && agencySlotsExtracted.extracted.patientAge !== null && ctx.patientAge === undefined) {
        ctx.patientAge = agencySlotsExtracted.extracted.patientAge;
        ctx.age = agencySlotsExtracted.extracted.patientAge;
      }
      if (agencySlotsExtracted.extracted.age !== undefined && agencySlotsExtracted.extracted.age !== null && ctx.age === undefined) {
        ctx.age = agencySlotsExtracted.extracted.age;
        if (ctx.patientAge === undefined) ctx.patientAge = agencySlotsExtracted.extracted.age;
      }
      if (agencySlotsExtracted.extracted.patientGender && !ctx.patientGender) {
        ctx.patientGender = agencySlotsExtracted.extracted.patientGender;
        ctx.gender = agencySlotsExtracted.extracted.patientGender;
      }
      if (agencySlotsExtracted.extracted.gender && !ctx.gender) {
        ctx.gender = agencySlotsExtracted.extracted.gender;
        if (!ctx.patientGender) ctx.patientGender = agencySlotsExtracted.extracted.gender;
      }
      if (agencySlotsExtracted.extracted.patientCountry && !ctx.patientCountry) {
        ctx.patientCountry = agencySlotsExtracted.extracted.patientCountry;
      }
      if (agencySlotsExtracted.extracted.travelDate && !ctx.travelDate) {
        ctx.travelDate = agencySlotsExtracted.extracted.travelDate;
      }
    }
    if (agencySlotsExtracted.extracted.city && !ctx.lastLocation) {
      ctx.lastLocation = agencySlotsExtracted.extracted.district
        ? `${agencySlotsExtracted.extracted.city} / ${agencySlotsExtracted.extracted.district}`
        : agencySlotsExtracted.extracted.city;
    }

    if (isFeelinHealthy) {
      // Persist city / side from the current (or replayed) treatment request without
      // inventing Istanbul when neither was mentioned.
      const incomingText = `${finalMessage || message || ""} ${agencySlotsExtracted.extracted.city || ""} ${agencySlotsExtracted.extracted.district || ""}`;
      const sideRes = resolveIstanbulSideFromText(incomingText);
      // Only adopt a newly mentioned city. Never overwrite an explicit selection.
      if (sideRes.city && !ctx.selectedCity) {
        ctx.selectedCity = sideRes.city;
        if (!ctx.lastLocation || !resolveCityAndSide(ctx.lastLocation).city) {
          ctx.lastLocation = getCityDisplayName(sideRes.city, agencyData.defaultLanguage || "tr");
        }
      }
      if (sideRes.side === "european" || sideRes.side === "anatolian") {
        ctx.istanbul_side = sideRes.side;
        ctx.istanbul_side_source = sideRes.source;
        ctx.selectedCity = "istanbul";
        ctx.locationSelectionConfirmed = true;
        ctx.sideSelectionConfirmed = true;
        ctx.lastLocation = sideRes.side === "anatolian" ? "İstanbul Anadolu Yakası" : "İstanbul Avrupa Yakası";
        delete ctx.pendingSideClarification;
        delete ctx.pendingSideGuidance;
      }
    }


    // Handle user affirmative response to location negotiation
    if (ctx.pendingLocationExpansion) {
      const isAffirmative = /\b(evet|olur|uygun|fark etmez|tamam|yes|sure|okay|ok|why not|neden olmasın|tabi|tabii|kabul)\b/i.test(finalMessage || message || "");
      if (isAffirmative) {
        ctx.lastLocation = ctx.pendingLocationExpansionTarget || "İstanbul Anadolu Yakası";
        delete ctx.pendingLocationExpansion;
        delete ctx.pendingLocationExpansionTarget;
        delete ctx.pendingLocationBranch;
      }
    }

    // ── STEP 1: GREETING DETECTION (P0 GREETING HANDLER) ──
    const rawMsg = (finalMessage || message || "").trim();
    const hasHealthKeyword = /\b(implant|diş|dis|zirkonyum|zirconium|kaplama|saç|sac|ekim|estetik|burun|rinoplasti|rhinoplasty|botoks|dolgu|liposuction|meme|bbl|obezite|tüp bebek|tup bebek|tüp|ivf|tedavi|doktor|hekim|klinik|operasyon|ameliyat|bariatrik|veneers|crowns|dental|hair|aesthetic|surgery|treatment|check-up|checkup|göz|lasik|katarakt|eye|fertility|fiyat|ucret|ücret|cost|price|randevu|appointment)\b/i.test(rawMsg);
    const hasPersonalSlotData = Boolean(
      agencySlotsExtracted.extracted.treatment ||
      agencySlotsExtracted.extracted.fullName ||
      agencySlotsExtracted.extracted.firstName ||
      agencySlotsExtracted.extracted.phone ||
      agencySlotsExtracted.extracted.email ||
      agencySlotsExtracted.extracted.patientAge ||
      agencySlotsExtracted.extracted.age ||
      agencySlotsExtracted.extracted.patientGender ||
      agencySlotsExtracted.extracted.gender
    );

    const isPureGreeting = (
      agencyIntentResult.intent === "greeting" ||
      /^(merhaba|merhabalar|selam|selamlar|günaydın|gunaydin|iyi günler|iyi gunler|iyi akşamlar|iyi aksamlar|iyi sabahlar|selamün aleyküm|selamun aleykum|sa|slm|hello|hi|hey|good morning|good afternoon|good evening|howdy|greetings)[!.,\s👋✨]*$/i.test(rawMsg)
    ) && !hasHealthKeyword && !hasPersonalSlotData;

    if (isPureGreeting) {
      const isEn = /^(hello|hi|hey|good morning|good afternoon|good evening|howdy|greetings)/i.test(rawMsg) ||
        ((agencyData.defaultLanguage || "tr").toLowerCase().startsWith("en") && !/^(merhaba|selam|günaydın|gunaydin|iyi)/i.test(rawMsg));

      // Load Prompt Studio greetings from aiConfig/main (not the agency root doc).
      const cacheKeyAiConfigEarly = `agency-aiConfig:${agencyId}`;
      let greetingAiConfig = getCached<any>(cacheKeyAiConfigEarly);
      if (!greetingAiConfig && adminDb) {
        try {
          const aiSnap = await adminDb.collection("agencies").doc(agencyId).collection("aiConfig").doc("main").get();
          greetingAiConfig = aiSnap.exists ? aiSnap.data() : null;
          setCached(cacheKeyAiConfigEarly, greetingAiConfig);
        } catch {
          greetingAiConfig = null;
        }
      }

      const greetingReply = isEn
        ? (greetingAiConfig?.greetingMessageEN || "Hello! How can I help you today? What treatment or clinic information are you looking for?")
        : (greetingAiConfig?.greetingMessageTR || "Merhaba! Size nasıl yardımcı olabilirim? Hangi tedavi veya klinik hakkında bilgi almak istersiniz?");
      
      return jsonResponse({
        reply: greetingReply,
        type: "text",
        sessionContext: ctx,
        showClinicCards: false
      }, { headers: CORS });
    }

    // ── STEP 2 & 3: HEALTH INTENT DETECTION & KVKK CONSENT GATING ──
    const privacySettings = {
      enabled: isFeelinHealthy ? true : (agencyData.privacySettings?.enabled !== false),
      requiredBeforePersonalData: isFeelinHealthy ? true : (agencyData.privacySettings?.requiredBeforePersonalData !== false),
      mode: agencyData.privacySettings?.mode || "kvkk",
      version: agencyData.privacySettings?.version || "v1.0",
      consentTextTr: isFeelinHealthy
        ? "Sizlere uygun klinikleri önerebilmemiz ve talebinizi değerlendirebilmemiz için paylaşacağınız kişisel ve sağlıkla ilgili verileri işlememize yönelik onayınıza ihtiyaç duyuyoruz. Aydınlatma metnini inceleyerek devam edebilirsiniz."
        : (agencyData.privacySettings?.consentTextTr || "Size uygun klinikleri önerebilmemiz..."),
      consentTextEn: isFeelinHealthy
        ? "To recommend suitable clinics and evaluate your request, we need your consent to process the personal and health-related information you provide. You can review the privacy notice before continuing."
        : (agencyData.privacySettings?.consentTextEn || "We need your consent..."),
      noticeUrlTr: isFeelinHealthy ? "https://feelinhealthy.com/kvkk" : (agencyData.privacySettings?.noticeUrlTr || "https://feelinhealthy.com/kvkk"),
      noticeUrlEn: isFeelinHealthy ? "https://feelinhealthy.com/kvkk" : (agencyData.privacySettings?.noticeUrlEn || "https://feelinhealthy.com/kvkk"),
    };

    const isHealthOrTreatmentRequest = Boolean(
      hasHealthKeyword ||
      hasPersonalSlotData ||
      agencySlotsExtracted.extracted.treatment ||
      ctx.lastTreatmentCategory ||
      agencyIntentResult.intent === "treatment_information" ||
      agencyIntentResult.intent === "pricing_request" ||
      agencyIntentResult.intent === "doctor_information" ||
      agencyIntentResult.intent === "clinic_recommendation" ||
      agencyIntentResult.intent === "clinic_information" ||
      agencyIntentResult.intent === "quote_request" ||
      isFeelinHealthy
    );

    if (isHealthOrTreatmentRequest && privacySettings.enabled && privacySettings.requiredBeforePersonalData) {
      const hasConsent = ctx.quoteConsent === true || (await requireAcceptedAgencyConsent(agencyId, ctx.sessionId!, privacySettings.version));
      if (!hasConsent) {
        const isEn = (agencyData.defaultLanguage || "tr").toLowerCase().startsWith("en");
        if (ctx.quoteConsent === false) {
          return jsonResponse({
            reply: isEn
              ? "Since you declined the privacy consent, I cannot process personal or health data. I can only assist with general information."
              : "Daha önce onay vermediğiniz için kişiselleştirilmiş işlem yapamıyoruz. Genel konularda yardımcı olabilirim.",
            type: "text",
            sessionContext: ctx,
            showClinicCards: false
          }, { headers: CORS });
        }

        // Save original health request — never overwrite with a city/side card action.
        if (!structuredLocationAction) {
          ctx.pendingUserMessage = finalMessage || message;
          ctx.pendingHealthRequest = finalMessage || message;
        }
        const consentLang = isEn ? "en" : "tr";
        const structuredData = getStructuredConsentData(agencyData, consentLang);
        const noticeUrl = isFeelinHealthy ? "https://feelinhealthy.com/kvkk" : (structuredData.privacyNoticeUrl || "https://feelinhealthy.com/kvkk");
        return jsonResponse({
          reply: consentLang === "tr" ? privacySettings.consentTextTr : privacySettings.consentTextEn,
          type: "consent_request",
          privacyNoticeUrl: noticeUrl,
          privacyNoticeLabel: structuredData.privacyNoticeLabel || "Aydınlatma metnini",
          consentStructured: {
            consentTextBeforeLink: structuredData.consentTextBeforeLink || "Sizlere uygun klinikleri önerebilmemiz ve talebinizi değerlendirebilmemiz için paylaşacağınız kişisel ve sağlıkla ilgili verileri işlememize yönelik onayınıza ihtiyaç duyuyoruz. ",
            privacyNoticeLabel: structuredData.privacyNoticeLabel || "Aydınlatma metnini",
            privacyNoticeUrl: noticeUrl,
            consentTextAfterLink: structuredData.consentTextAfterLink || " inceleyerek devam edebilirsiniz."
          },
          consentVersion: privacySettings.version,
          sessionContext: ctx,
          showClinicCards: false
        }, { headers: CORS });
      }
    }

    if ((agencyIntentResult.intent as string) === "emergency") {
      const isEn = (agencyData.defaultLanguage || "tr").toLowerCase().startsWith("en");
      const emMsg = isEn
        ? "⚠️ If you are experiencing a medical emergency, severe pain, or bleeding, please immediately contact emergency services (112) or the nearest emergency medical clinic."
        : "⚠️ Acil bir sağlık durumu, şiddetli ağrı veya kanama yaşıyorsanız lütfen derhal en yakın acil servise başvurun veya 112 Acil Yardım hattını arayın.";
      return NextResponse.json({
        responseType: "chat_message",
        reply: emMsg,
        sessionContext: ctx
      }, { headers: CORS });
    }

    if (
      !structuredLocationAction &&
      agencyIntentResult.clarificationNeeded &&
      agencyIntentResult.clarificationPrompt
    ) {
      return NextResponse.json({
        responseType: "chat_message",
        reply: agencyIntentResult.clarificationPrompt,
        quickReplies: agencyIntentResult.suggestedOptions || [],
        sessionContext: ctx
      }, { headers: CORS });
    }

    const perfStart = performance.now();

    const cacheKeyClinics = `agency-clinics:${agencyId}`;
    let allClinics = getCached<any[]>(cacheKeyClinics);
    if (!allClinics) {
      if (adminDb) {
        const clinicSnap = await adminDb.collection("agencies").doc(agencyId)
          .collection("clinics").orderBy("priority", "asc").get();
        allClinics = clinicSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((c: any) => c.status === "active");
      } else {
        allClinics = [];
      }
      setCached(cacheKeyClinics, allClinics);
    }
    const fullAgencyClinics = [...(allClinics || [])];

    const prefilterStart = performance.now();
    ctx.clinicSelectionMode = matchingConfig?.routingMode || "manual"; // Save routing mode for leads
    ctx.showProfileLinks = showProfileLinks; // Instruct frontend to hide links if false
    
    // Apply Treatment Clinic Rules if available
    if (matchingConfig?.treatmentClinicRules && matchingConfig.treatmentClinicRules.length > 0 && ctx.lastTreatmentCategory) {
      const activeRule = matchingConfig.treatmentClinicRules.find((r: any) => r.treatmentCategory === ctx.lastTreatmentCategory);
      if (activeRule && activeRule.eligibleClinicIds && activeRule.eligibleClinicIds.length > 0) {
        allClinics = allClinics.filter((c: any) => activeRule.eligibleClinicIds.includes(c.id));
      }
    }
    // Truncate candidates to max 10 to avoid sending 35 clinics to the prompt
    if (allClinics && allClinics.length > 10) {
      allClinics = allClinics.slice(0, 10);
    }
    clinicPrefilterMs = performance.now() - prefilterStart;

    const ctxLoadStart = performance.now();
    
    // Load Pricing
    const cacheKeyPricing = `agency-pricing:${agencyId}`;
    let allPricing = getCached<any[]>(cacheKeyPricing);
    
    // Load KB
    const cacheKeyKb = `agency-kb:${agencyId}`;
    let allKbRecords = getCached<any[]>(cacheKeyKb);

    // Load Doctors
    const cacheKeyDoctors = `agency-doctors:${agencyId}`;
    let allDoctors = getCached<any[]>(cacheKeyDoctors);

    // Load Agency AI Config
    const cacheKeyAiConfig = `agency-aiConfig:${agencyId}`;
    let agencyAiConfig = getCached<any>(cacheKeyAiConfig);
    
    // Load Agency KB
    const cacheKeyAgencyKb = `agency-kb-main:${agencyId}`;
    let agencyKbRecords = getCached<any[]>(cacheKeyAgencyKb);

    if (adminDb && (!allPricing || !allKbRecords || !allDoctors || !agencyAiConfig || !agencyKbRecords)) {
      const [aiSnap, agKbSnap] = await Promise.all([
        adminDb.collection("agencies").doc(agencyId).collection("aiConfig").doc("main").get(),
        adminDb.collection("knowledge_documents").where("tenantId", "==", agencyId).where("ownerType", "==", "agency").get()
      ]);

      agencyAiConfig = aiSnap.exists ? aiSnap.data() : null;
      setCached(cacheKeyAiConfig, agencyAiConfig);

      agencyKbRecords = [];
      agKbSnap.forEach((d) => {
        if (d.data().status === "active") {
          agencyKbRecords!.push({ id: d.id, ...d.data() });
        }
      });
      setCached(cacheKeyAgencyKb, agencyKbRecords);

      // Now parallelize clinic-specific reads for ALL active clinics in the agency, so we can cache them globally for this agency
      let allActiveClinics = getCached<any[]>(cacheKeyClinics);
      if (!allActiveClinics) {
         const fullClinicSnap = await adminDb.collection("agencies").doc(agencyId).collection("clinics").orderBy("priority", "asc").get();
         allActiveClinics = fullClinicSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c: any) => c.status === "active");
         setCached(cacheKeyClinics, allActiveClinics);
      }

      const pricingPromises = allActiveClinics.map((c) => adminDb!.collection("agencies").doc(agencyId).collection("clinics").doc(c.id).collection("pricing").get());
      const kbPromises = allActiveClinics.map((c) => adminDb!.collection("agencies").doc(agencyId).collection("clinics").doc(c.id).collection("knowledgeBase").get());
      const docPromises = allActiveClinics.map((c) => adminDb!.collection("agencies").doc(agencyId).collection("clinics").doc(c.id).collection("doctors").get());

      const [pricingResults, kbResults, docResults] = await Promise.all([
        Promise.all(pricingPromises),
        Promise.all(kbPromises),
        Promise.all(docPromises)
      ]);

      allPricing = [];
      allKbRecords = [];
      allDoctors = [];

      pricingResults.forEach((snap, idx) => {
        const c = allActiveClinics![idx];
        snap.docs.forEach(pDoc => {
          const p = pDoc.data();
          if (p.status !== "inactive") {
            allPricing!.push({
              id: pDoc.id,
              clinicId: c.id,
              clinicName: c.clinicName || "",
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
        });
      });

      kbResults.forEach((snap, idx) => {
        const c = allActiveClinics![idx];
        snap.docs.forEach(kDoc => {
          const kData = kDoc.data();
          if (kData.isActive !== false) {
            allKbRecords!.push({ id: kDoc.id, clinicId: c.id, ...kData });
          }
        });
      });

      docResults.forEach((snap, idx) => {
        const c = allActiveClinics![idx];
        snap.docs.forEach(dDoc => {
          const dData = dDoc.data();
          if (dData.status === "active" && dData.showOnPublicProfile !== false) {
            allDoctors!.push({ id: dDoc.id, clinicId: c.id, ...dData });
          }
        });
      });

      setCached(cacheKeyPricing, allPricing);
      setCached(cacheKeyKb, allKbRecords);
      setCached(cacheKeyDoctors, allDoctors);
    }

    allPricing = allPricing || [];
    allKbRecords = allKbRecords || [];
    allDoctors = allDoctors || [];
    agencyKbRecords = agencyKbRecords || [];
    
    agencyContextLoadMs = performance.now() - ctxLoadStart;

    console.log(`[matching-chat] Agency: ${slug}, Cached/Loaded Pricing: ${allPricing.length}, KB Records: ${allKbRecords.length}`);

    // Filter pricing and KB to only include the prefiltered clinics (allClinics)
    const activeClinicIds = new Set(allClinics.map(c => c.id));
    const filteredPricing = allPricing.filter(p => activeClinicIds.has(p.clinicId));
    const filteredKbRecords = allKbRecords.filter(k => activeClinicIds.has(k.clinicId));

    const allSearchableRecords = [
      ...filteredKbRecords,
      ...agencyKbRecords.map(k => ({
        id: k.id,
        title: k.title,
        content: k.content,
        embeddingChunks: k.embeddingChunks || [],
        isAgency: true
      }))
    ];


    // HYBRID SEARCH FOR KNOWLEDGE BASE
    const { hybridSearch } = await import("@/lib/services/retrievalService");
    
    // Convert KB records for hybrid search
    const docsForSearch = allSearchableRecords.map(kb => ({
      id: kb.id,
      title: kb.title,
      content: kb.content,
      embeddingChunks: kb.embeddingChunks || []
    }));
    
    // We want a slightly broader search since it's an agency with multiple clinics
    let relevantKbRecords: any[] = [];
    if (message && message.trim().length > 0) {
      const topKbChunks = await hybridSearch(message, docsForSearch, "", 15);
      
      // Reconstruct kb records from the top chunks to match buildClinicContext expectations
      relevantKbRecords = topKbChunks.map(chunk => {
        const originalDoc = allKbRecords.find(k => k.id === chunk.doc_id);
        const originalAgDoc = agencyKbRecords.find(k => k.id === chunk.doc_id);
        
        return {
          id: chunk.doc_id,
          clinicId: originalDoc?.clinicId,
          category: originalAgDoc ? `AGENCY_${originalAgDoc.knowledgeType.toUpperCase()}` : "RAG_MATCH",
          title: chunk.title,
          content: chunk.text
        };
      });
    }

    /* ── 2. Build clinic context for OpenAI ── */
    const promptBuildStart = performance.now();
    const assistantRole = resolveAssistantRole(ctx);
    const coordinatorClinicId = getCoordinatorClinicId(ctx);
    const clinicsForPrompt =
      assistantRole === "clinic_coordinator" && coordinatorClinicId
        ? allClinics.filter((c: any) => String(c.id) === String(coordinatorClinicId))
        : allClinics;
    const kbForPrompt =
      assistantRole === "clinic_coordinator" && coordinatorClinicId
        ? relevantKbRecords.filter(
            (k: any) => !k.clinicId || String(k.clinicId) === String(coordinatorClinicId)
          )
        : relevantKbRecords;
    const pricingForPrompt =
      assistantRole === "clinic_coordinator" && coordinatorClinicId
        ? filteredPricing.filter((p: any) => String(p.clinicId) === String(coordinatorClinicId))
        : filteredPricing;
    const clinicContext = buildClinicContext(
      clinicsForPrompt.length > 0 ? clinicsForPrompt : allClinics,
      pricingForPrompt,
      kbForPrompt,
      [],
      assistantRole === "clinic_coordinator" ? [] : agencyKbRecords,
      showPriceRange
    );
    promptBuildMs = performance.now() - promptBuildStart;

    /* ── 3. Build session context hint ── */
    let contextHint = `\nMEVCUT KONUŞMA DURUMU (SESSION CONTEXT):
- assistantRole: ${assistantRole}
- Aşama (leadStage): ${ctx.leadStage || "discovery"}
- Seçilen Klinik (selectedClinicName): ${ctx.selectedClinicName || "Yok"}
- Toplanan Bilgiler:
  * Ad Soyad: ${ctx.patientName || "Yok"}
  * E-posta: ${ctx.patientEmail ? `${ctx.patientEmail.substring(0,2)}***@... (${ctx.patientEmailStatus})` : "Yok"}
  * Telefon: ${ctx.patientPhone || "Yok"}
  * Ülke: ${ctx.patientCountry || "Yok"}
  * Yaş: ${ctx.patientAge || "Yok"}
  * Cinsiyet: ${ctx.patientGender || "Yok"}
  * KVKK/GDPR Onayı: ${ctx.quoteConsent ? "Evet" : "Yok"}
- Klinik Seçimi (clinicSelectionMode): ${ctx.clinicSelectionMode || "Yok"} (Status: ${ctx.clinicSelectionStatus || "not_started"})
- Seçili Klinik ID'leri: ${ctx.selectedClinicIds?.join(", ") || "Yok"} (Toplam ${ctx.selectedClinicIds?.length || 0} / Maks ${maxClinics})
- İlgi Alanı: Tedavi: ${ctx.lastTreatmentCategory || "Bilinmiyor"}, Alt Tedavi: ${ctx.lastSubTreatment || "Bilinmiyor"}, Lokasyon: ${ctx.lastLocation || "Bilinmiyor"}
`;
    if (ctx.lastFocusedClinicName) {
      contextHint += `- En son incelenen klinik: "${ctx.lastFocusedClinicName}" (ID: ${ctx.lastFocusedClinicId}).\n`;
    }

    /* ── 4. OpenAI Call: Intent Extraction + Response ── */
    const assistantPolicy = compileAssistantPolicy({
      agencyId,
      agencySlug: slug,
      aiConfig: agencyAiConfig,
      matchingConfig: {
        maxClinicsToShow: maxClinics,
        showPriceRange,
      },
      sessionContext: ctx,
      privacyNoticeUrl: isFeelinHealthy ? "https://feelinhealthy.com/kvkk" : undefined,
    });
    logPolicyConflicts(assistantPolicy);

    let systemPrompt: string;
    if (assistantRole === "clinic_coordinator" && coordinatorClinicId) {
      const selectedClinic =
        clinicsForPrompt[0] ||
        allClinics.find((c: any) => String(c.id) === String(coordinatorClinicId));
      systemPrompt = buildClinicCoordinatorSystemPrompt({
        assistantName: assistantPolicy.communicationStyle.assistantName,
        agencyName: isFeelinHealthy ? "FeelinHealthy" : agencyData.name || "ClinicBridge",
        tone: assistantPolicy.communicationStyle.tone,
        customPrompt: assistantPolicy.customPrompt,
        selectedClinicId: String(coordinatorClinicId),
        selectedClinicName: String(
          ctx.selectedClinicName || selectedClinic?.clinicName || ctx.lastFocusedClinicName || "Selected clinic"
        ),
        selectedTreatment: ctx.lastTreatmentCategory || null,
        selectedCity: ctx.selectedCity || null,
        selectedIstanbulSide: ctx.istanbul_side || null,
        patientProfileSummary: buildPatientProfileSummary(ctx),
        clinicKnowledge: clinicContext,
        communicationRules: assistantPolicy.communicationStyle.responseRules,
        forbiddenClaims: assistantPolicy.communicationStyle.forbiddenClaims,
        languageMode: assistantPolicy.languagePolicy.mode,
      });
    } else {
      const requiredNextAction = assistantPolicy.conversationState.treatmentKnown
        ? "Tedavi biliniyor; tedavi sorusunu tekrarlama. Backend intake/lokasyon state’ine uy."
        : "Backend state sıradaki adımı belirler. Toplanmış alanları tekrar sorma.";
      systemPrompt = buildAuthoritativeSystemPrompt({
        policy: assistantPolicy,
        clinicContext,
        contextHint,
        requiredNextAction,
      });
    }

    console.log(
      `[matching-chat] role=${assistantRole} promptChars=${estimatePromptSize(systemPrompt)} clinicsInContext=${clinicsForPrompt.length}`
    );

    // --- Context Tracking ---
    const totalClinicsLoaded = allClinics.length;
    const totalKbLoaded = relevantKbRecords.length;
    console.log(`[matching-chat] Generating response. Clinics loaded: ${totalClinicsLoaded}, KB Records: ${totalKbLoaded}`);
    if (totalClinicsLoaded > 15 || totalKbLoaded > 30) {
      console.warn(`[matching-chat] [ALERT] Context length potentially large (Clinics: ${totalClinicsLoaded}, KB: ${totalKbLoaded})`);
    }

    const aiStart = performance.now();
    
    let parsed: any;

    if (!process.env.OPENAI_API_KEY) {
      console.warn("[matching-chat] OPENAI_API_KEY is not configured. Running in deterministic intake mode.");
      const trBranch = agencySlotsExtracted.extracted.treatment || ctx.lastTreatmentCategory || undefined;
      const trLoc = ctx.selectedCity || agencySlotsExtracted.extracted.city || ctx.lastLocation || undefined;
      const isEn = (agencyData.defaultLanguage || "tr").toLowerCase().startsWith("en");
      parsed = {
        intent: "clinic_recommendation",
        language: isEn ? "en" : "tr",
        treatmentCategory: trBranch,
        location: trLoc,
        showClinicCards: false,
        replyText: isEn
          ? "Thanks — I’ll continue with the next details we need."
          : "Teşekkürler — ihtiyacımız olan sonraki bilgilerle devam ediyorum."
      };
      openAiTotalMs = 0;
      responseParseMs = 0;
    } else {
      // Wrap in Promise.race for 8-second hard timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          const err: any = new Error("PROVIDER_TIMEOUT");
          err.code = "OPENAI_TIMEOUT";
          reject(err);
        }, 8000);
      });

      const completion = await Promise.race([
        trackableAIRequest({
          clinicId: ctx.selectedClinicId || undefined,
          channel: "portal",
          requestType: "chat",
          model: "gpt-4o-mini", // Fast model for intake as requested
          temperature: 0.3,
          maxTokens: 1200,
          responseFormat: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            ...history.slice(-6).map((h: any) => ({
              role: h.role as "user" | "assistant",
              content: typeof h.content === "string" ? h.content : JSON.stringify(h.content),
            })),
            { role: "user", content: finalMessage },
          ],
        }),
        timeoutPromise
      ]);

      openAiTotalMs = performance.now() - aiStart;
      const parseStart = performance.now();

      const raw = completion.content?.trim() ?? "{}";
      try {
        parsed = JSON.parse(raw);
        responseParseMs = performance.now() - parseStart;
      } catch (err: any) {
        console.error("[matching-chat] [ALERT] OPENAI_RESPONSE_PARSE_FAILED", err.message, "RAW:", raw.slice(0, 500));
        // Degraded Mode Fallback for JSON Parse error
        const isTr = ctx.language === "tr" || (!ctx.language && true);
        const newCtx: SessionContext = { ...ctx, processingMode: "degraded" };
        return jsonResponse({
          reply: isTr 
            ? (isFeelinHealthy ? "Talebinizi aldım. Size en uygun klinikleri hazırlayabilmemiz için adınızı soyadınızı, yaşınızı ve cinsiyetinizi paylaşabilir misiniz?" : "Talebinizi aldım. Size uygun klinikleri hazırlayabilmem için yaklaşık bütçenizi, tercih ettiğiniz tarihi ve dil ihtiyacınızı paylaşabilir misiniz?")
            : (isFeelinHealthy ? "I've saved your request. To prepare the most suitable clinic options for you, could you please share your full name, age, and gender?" : "I've saved your request. To prepare suitable clinic options, could you share your approximate budget, preferred dates and language requirements?"),
          type: "text",
          sessionContext: newCtx,
        }, { headers: CORS });
      }
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
        // Groundedness check

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
    
    // Validate and update patient email from LLM if any
    if (parsed.patientEmail && parsed.patientEmail !== ctx.patientEmail) {
      const { normalizeEmail, isValidEmail } = await import("@/lib/utils/emailValidation");
      const normalized = normalizeEmail(parsed.patientEmail);
      if (isValidEmail(normalized)) {
        newCtx.patientEmail = normalized!;
        newCtx.patientEmailStatus = "verified_format";
      } else {
        newCtx.patientEmail = undefined;
        newCtx.patientEmailStatus = "invalid";
        return jsonResponse({
          reply: parsed.language === "tr"
            ? "Bu e-posta adresinde küçük bir yazım hatası olabilir. Kontrol ederek yeniden paylaşabilir misiniz?"
            : "There may be a small typo in this email address. Could you check it and share it again?",
          type: "text",
          sessionContext: newCtx,
          showClinicCards: false
        }, { headers: CORS });
      }
    }

    if (parsed.selectedClinicId) newCtx.selectedClinicId = parsed.selectedClinicId;
    if (parsed.selectedClinicName) newCtx.selectedClinicName = parsed.selectedClinicName;

    // Persist role transitions from structured LLM intents (backend validates exit).
    if (parsed.intent === "clinic_selected" && (parsed.selectedClinicId || newCtx.selectedClinicId)) {
      Object.assign(
        newCtx,
        enterClinicCoordinator(newCtx, {
          id: String(parsed.selectedClinicId || newCtx.selectedClinicId),
          name: String(parsed.selectedClinicName || newCtx.selectedClinicName || "Selected clinic"),
        })
      );
    }
    if (parsed.intent === "network_rediscovery") {
      if (
        resolveAssistantRole(newCtx) === "clinic_coordinator" &&
        isExplicitReturnToNetworkDiscovery(finalMessage || message)
      ) {
        Object.assign(newCtx, exitToNetworkAdvisor(newCtx));
        parsed.intent = "clinic_recommendation";
        parsed.showClinicCards = true;
      } else if (resolveAssistantRole(newCtx) === "clinic_coordinator") {
        // Reject unsolicited rediscovery while coordinator mode is active.
        parsed.intent = "clinic_question";
        parsed.showClinicCards = false;
      }
    }
    // A name proposed by the model is rejected when it reads as a treatment
    // request, so the pending request can never land in the patient record.
    if (
      parsed.patientName &&
      !isReplayedTreatmentRequest &&
      !looksLikeRequestPhrase(parsed.patientName)
    ) {
      newCtx.patientName = parsed.patientName;
    }
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

    // --- CONSENT GATING ---
    const leadAlreadyCreated = ctx.leadStage === "quote_request_created" || ctx.leadStage === "completed";
    
    const isTryingToCollectData = parsed.missingLeadField && parsed.missingLeadField !== "quoteConsent" && ["patientName", "patientPhone", "patientEmail", "patientAge"].includes(parsed.missingLeadField);
    const hasGivenHealthData = !!(
      parsed.treatmentCategory ||
      parsed.subTreatment ||
      parsed.patientAge ||
      parsed.patientGender ||
      agencySlotsExtracted.extracted.treatment ||
      (isFeelinHealthy && (parsed.intent === "clinic_recommendation" || parsed.intent === "clinic_matching" || /\b(implant|diş|zirkonyum|saç|estetik|botoks|rinoplasti|obezite|tüp bebek|tedavi|doktor|klinik|operasyon|bariatrik|veneers|crowns|dental|hair|aesthetic|rhinoplasty|surgery|treatment)\b/i.test(finalMessage || message || "")))
    );
    
    // Explicitly bypass consent gating for simple greetings when no health data is passed in current turn
    const isSimpleGreeting = (parsed.intent === "greeting" || parsed.intent === "general_info") && !hasGivenHealthData && !/\b(implant|diş|zirkonyum|saç|estetik|botoks|rinoplasti|obezite|tüp bebek|tedavi|doktor|klinik|operasyon|bariatrik|veneers|crowns|dental|hair|aesthetic|rhinoplasty|surgery|treatment)\b/i.test(finalMessage || message || "");

    const isMedicalOrTreatmentRequest = !isSimpleGreeting && (
      hasGivenHealthData ||
      parsed.shouldCreateLead ||
      parsed.requiresConsent ||
      isTryingToCollectData ||
      parsed.intent === "clinic_recommendation" ||
      parsed.intent === "clinic_matching" ||
      (isFeelinHealthy && (!!parsed.treatmentCategory || !!newCtx.lastTreatmentCategory || /\b(implant|diş|zirkonyum|saç|estetik|botoks|rinoplasti|obezite|tüp bebek|tedavi|doktor|klinik|operasyon|bariatrik|veneers|crowns|dental|hair|aesthetic|rhinoplasty|surgery|treatment)\b/i.test(finalMessage || message || "")))
    );
    
    if (isMedicalOrTreatmentRequest && privacySettings.enabled && privacySettings.requiredBeforePersonalData) {
      const hasConsent = ctx.quoteConsent === true || (await requireAcceptedAgencyConsent(agencyId, ctx.sessionId!, privacySettings.version));
      if (!hasConsent) {
        if (ctx.quoteConsent === false) {
           return jsonResponse({
             reply: parsed.language === "tr" 
               ? "Daha önce onay vermediğiniz için kişiselleştirilmiş işlem yapamıyoruz. Genel konularda yardımcı olabilirim."
               : "Since you declined the privacy consent, I cannot process personal data. I can only assist with general information.",
             type: "text",
             sessionContext: ctx,
             showClinicCards: false
           }, { headers: CORS });
        }
        
        // Save the original user message so it can be re-processed after consent
        ctx.pendingUserMessage = finalMessage;
        const structuredData = getStructuredConsentData(agencyData, parsed.language || "tr");
        return jsonResponse({
           reply: parsed.language === "tr" ? privacySettings.consentTextTr : privacySettings.consentTextEn,
           type: "consent_request",
           privacyNoticeUrl: structuredData.privacyNoticeUrl,
           privacyNoticeLabel: structuredData.privacyNoticeLabel,
           consentStructured: {
             consentTextBeforeLink: structuredData.consentTextBeforeLink,
             privacyNoticeLabel: structuredData.privacyNoticeLabel,
             privacyNoticeUrl: structuredData.privacyNoticeUrl,
             consentTextAfterLink: structuredData.consentTextAfterLink
           },
           consentVersion: privacySettings.version,
           sessionContext: ctx,
           showClinicCards: false
        }, { headers: CORS });
      }
    }

    // ── FeelinHealthy canonical post-consent order ──
    // Intake → treatment clarification → city selection → Istanbul side → matching.
    // Never assume Istanbul and never show the side card before city is known.
    if (isFeelinHealthy && newCtx.quoteConsent === true) {
      const currentLang = (parsed.language || agencyData.defaultLanguage || "tr").toLowerCase().startsWith("en") ? "en" : "tr";

      // Persist treatment from the model / extractor without inventing a branch.
      if (parsed.treatmentCategory && !newCtx.lastTreatmentCategory) {
        newCtx.lastTreatmentCategory = parsed.treatmentCategory;
      }
      if (agencySlotsExtracted.extracted.treatment && !newCtx.lastTreatmentCategory) {
        newCtx.lastTreatmentCategory = agencySlotsExtracted.extracted.treatment;
      }

      // Adopt a model-proposed city only when the patient's own message already
      // named that city. Never invent Istanbul from the model alone.
      if (parsed.location && !newCtx.selectedCity) {
        const parsedLoc = resolveCityAndSide(parsed.location);
        const userMentionedCity = resolveIstanbulSideFromText(finalMessage || message || "").city;
        if (parsedLoc.city && userMentionedCity === parsedLoc.city) {
          newCtx.selectedCity = parsedLoc.city;
          newCtx.lastLocation = getCityDisplayName(parsedLoc.city, currentLang);
          if (parsedLoc.side === "european" || parsedLoc.side === "anatolian") {
            newCtx.istanbul_side = parsedLoc.side;
          }
        }
      }

      const intakeStatus = evaluateFeelinHealthyIntake(newCtx);
      newCtx.intakeStage = intakeStatus.currentGroup;

      const matchingLikeIntent =
        parsed.intent === "clinic_recommendation" ||
        parsed.intent === "clinic_matching" ||
        parsed.intent === "lead_capture" ||
        parsed.intent === "followup" ||
        parsed.needsFollowUp ||
        newCtx.leadStage === "lead_capture" ||
        newCtx.leadStage === "clinic_selected" ||
        newCtx.pendingCitySelection ||
        newCtx.pendingSideClarification ||
        newCtx.pendingSideGuidance ||
        Boolean(newCtx.lastTreatmentCategory);

      // Never re-ask intake once it is complete — including after city/side cards.
      // Clinic Coordinator mode must never restart Group 1–3.
      if (
        resolveAssistantRole(newCtx) !== "clinic_coordinator" &&
        (matchingLikeIntent || structuredLocationAction) &&
        !intakeStatus.allGroupsComplete
      ) {
        const groupPrompt = getGroupIntakePrompt(intakeStatus, newCtx, currentLang);
        return jsonResponse({
          reply: groupPrompt,
          type: "text",
          sessionContext: newCtx,
          showClinicCards: false,
        }, { headers: CORS });
      }

      if (intakeStatus.allGroupsComplete && resolveAssistantRole(newCtx) !== "clinic_coordinator") {
        const locationDecision = decideFeelinHealthyLocationNextStep(
          newCtx,
          fullAgencyClinics,
          currentLang
        );

        // Keep decision fields on the session for the next turn.
        if (locationDecision.city && !newCtx.selectedCity) {
          newCtx.selectedCity = locationDecision.city;
        }
        newCtx.availableCities = locationDecision.availableCities.map((c) => c.city);

        if (locationDecision.step === "ask_treatment") {
          return jsonResponse({
            reply: getTreatmentClarificationPrompt(currentLang),
            type: "text",
            sessionContext: newCtx,
            showClinicCards: false,
          }, { headers: CORS });
        }

        if (locationDecision.step === "ask_city") {
          const cityCard = getCitySelectionCard(
            locationDecision.treatmentBranch,
            locationDecision.availableCities,
            currentLang
          );
          newCtx.pendingCitySelection = true;
          return jsonResponse({
            reply: cityCard.message,
            type: "city_selection",
            citySelectionCard: cityCard,
            sessionContext: newCtx,
            showClinicCards: false,
          }, { headers: CORS });
        }

        // Side guidance ("emin değilim") only after Istanbul is already selected.
        const isUnsureOrGuidance =
          newCtx.selectedCity === "istanbul" &&
          (newCtx.pendingSideGuidance ||
            /\b(fark etmez|emin degilim|emin değilim|bilmiyorum|kararsizim|kararsızım|neresi uygun|hangisi daha iyi|yardım|not sure|any|unsure|dont know|help me choose)\b/i.test(
              finalMessage || message || ""
            ));
        if (isUnsureOrGuidance) {
          const sideCues = resolveIstanbulSideFromText(finalMessage || message || "");
          const guidanceText = getSideGuidancePrompt(sideCues.cueName, currentLang);
          const cardData = getIstanbulSideClarificationCard(
            locationDecision.treatmentBranch,
            currentLang
          );
          delete newCtx.pendingSideGuidance;
          newCtx.pendingSideClarification = true;
          return jsonResponse({
            reply: guidanceText,
            type: cardData.type,
            sideClarificationCard: cardData,
            sessionContext: newCtx,
            showClinicCards: false,
          }, { headers: CORS });
        }

        if (locationDecision.step === "ask_side" && newCtx.selectedCity === "istanbul") {
          const cardData = getIstanbulSideClarificationCard(
            locationDecision.treatmentBranch,
            currentLang
          );
          newCtx.pendingSideClarification = true;
          return jsonResponse({
            reply: cardData.message,
            type: cardData.type,
            sideClarificationCard: cardData,
            sessionContext: newCtx,
            showClinicCards: false,
          }, { headers: CORS });
        }

        // Unsupported non-Istanbul city for this branch → negotiate alternatives.
        if (
          locationDecision.step === "ready" &&
          locationDecision.city &&
          locationDecision.city !== "istanbul" &&
          !newCtx.pendingLocationExpansion
        ) {
          const curatedCheck = getCuratedClinicsForFeelinHealthy(
            locationDecision.treatmentBranch || "",
            locationDecision.city,
            locationDecision.side,
            fullAgencyClinics
          );
          if (
            curatedCheck.isUnsupportedLocation &&
            curatedCheck.supportedLocationsForBranch &&
            curatedCheck.supportedLocationsForBranch.length > 0
          ) {
            newCtx.pendingLocationExpansion = true;
            newCtx.pendingLocationExpansionTarget =
              curatedCheck.supportedLocationsForBranch[0].displayNameTr;
            newCtx.pendingLocationBranch = locationDecision.treatmentBranch || undefined;
            return jsonResponse({
              reply: getUnsupportedLocationPrompt(
                locationDecision.treatmentBranch || "",
                locationDecision.city,
                curatedCheck.supportedLocationsForBranch,
                currentLang
              ),
              type: "location_negotiation",
              sessionContext: newCtx,
              showClinicCards: false,
            }, { headers: CORS });
          }
        }

        // Once consent + intake + location are ready, force clinic matching.
        // Do not let shouldCreateLead / followup short-circuit this step.
        // Never rematch while Clinic Patient Coordinator mode is active.
        if (
          isReadyForClinicMatching(newCtx).ready &&
          resolveAssistantRole(newCtx) !== "clinic_coordinator"
        ) {
          parsed.intent = "clinic_recommendation";
          parsed.shouldCreateLead = false;
          parsed.needsFollowUp = false;
          if (!parsed.language) parsed.language = currentLang;
        }
      }
    }

    /* ── 5. Handle each intent type ── */

    // --- CONVERSATION COMPLETED ---
    if (parsed.intent === "conversation_completed") {
      return jsonResponse({
        reply: parsed.replyText || "Rica ederim. Talebiniz ilgili kliniğe iletilmek üzere kaydedildi. Klinik ekibi sizinle en kısa sürede iletişime geçecektir. Sağlıklı günler dilerim.",
        type: "text",
        sessionContext: newCtx,
        showClinicCards: false,
        leadStatus: newCtx.leadStage,
        shouldCreateNewLead: false,
        shouldUpdateLead: false
      }, { headers: CORS });
    }

    // --- CLINIC MATCHING OR RECOMMENDATION (before lead/followup for FeelinHealthy) ---
    if (
      (parsed.intent === "clinic_matching" || parsed.intent === "clinic_recommendation") &&
      resolveAssistantRole(newCtx) !== "clinic_coordinator"
    ) {
      let recommendations: ClinicRecommendation[] = [];
      let additionalEligibleClinicCount = 0;
      let conversionData: any = undefined;

      const feelinHealthyReady = isFeelinHealthy ? isReadyForClinicMatching(newCtx).ready : false;

      if (isFeelinHealthy && feelinHealthyReady) {
        const branchOrCat = parsed.treatmentCategory || newCtx.lastTreatmentCategory || agencySlotsExtracted.extracted.treatment;
        const locationDecision = decideFeelinHealthyLocationNextStep(newCtx, fullAgencyClinics, (parsed.language || "tr"));
        // Hard gate: never render clinics until city (and Istanbul side when needed) are known.
        if (locationDecision.step !== "ready") {
          const currentLang = (parsed.language || agencyData.defaultLanguage || "tr").toLowerCase().startsWith("en") ? "en" : "tr";
          if (locationDecision.step === "ask_city") {
            const cityCard = getCitySelectionCard(locationDecision.treatmentBranch, locationDecision.availableCities, currentLang);
            newCtx.pendingCitySelection = true;
            return jsonResponse({
              reply: cityCard.message,
              type: "city_selection",
              citySelectionCard: cityCard,
              sessionContext: newCtx,
              showClinicCards: false,
            }, { headers: CORS });
          }
          if (locationDecision.step === "ask_side") {
            const cardData = getIstanbulSideClarificationCard(locationDecision.treatmentBranch, currentLang);
            newCtx.pendingSideClarification = true;
            return jsonResponse({
              reply: cardData.message,
              type: cardData.type,
              sideClarificationCard: cardData,
              sessionContext: newCtx,
              showClinicCards: false,
            }, { headers: CORS });
          }
          return jsonResponse({
            reply: getTreatmentClarificationPrompt(currentLang),
            type: "text",
            sessionContext: newCtx,
            showClinicCards: false,
          }, { headers: CORS });
        }

        const effectiveCity = locationDecision.city;
        const effectiveSide = newCtx.istanbul_side || locationDecision.side;
        const curatedResult = getCuratedClinicsForFeelinHealthy(branchOrCat, effectiveCity, effectiveSide, fullAgencyClinics);

        const linkedIds = fullAgencyClinics.map((c: any) => String(c.id));
        const activeIds = fullAgencyClinics
          .filter((c: any) => c.status === "active")
          .map((c: any) => String(c.id));
        const branchKey = String(normalizeTreatmentBranch(branchOrCat));
        const treatmentMatchedIds = fullAgencyClinics
          .filter((c: any) => {
            const cats = (c.treatmentCategories || []).map((t: string) => String(t).toLowerCase());
            return cats.includes(branchKey) || String(c.category || "").toLowerCase().includes(branchKey);
          })
          .map((c: any) => String(c.id));
        const cityMatchedIds = fullAgencyClinics
          .filter((c: any) => {
            const city = String(c.location?.city || "").toLowerCase();
            const want = String(effectiveCity || "").toLowerCase();
            if (!want) return false;
            if (want === "istanbul") return city.includes("istanbul") || city.includes("i̇stanbul");
            return city.includes(want);
          })
          .map((c: any) => String(c.id));
        const sideMatchedIds = curatedResult.matchingCuratedClinics.map((c: any) => String(c.id));

        const isGuest = newCtx.isGuestUser !== false;
        const displayLimit = isGuest ? FEELINHEALTHY_CONFIG.maxGuestClinics : maxClinics;
        const displayedClinics = curatedResult.matchingCuratedClinics.slice(0, displayLimit);

        logFeelinHealthyMatchingDiagnostics(
          buildFeelinHealthyMatchingDiagnostics({
            agencyId: "feelinhealthy",
            treatmentBranch: branchKey,
            treatmentId: branchOrCat || null,
            city: effectiveCity,
            istanbulSide: effectiveSide || null,
            linkedClinicIds: linkedIds,
            activeClinicIds: activeIds,
            treatmentMatchedIds,
            cityMatchedIds,
            sideMatchedIds,
            curatedMatchedIds: curatedResult.matchingCuratedClinics.map((c: any) => String(c.id)),
            finalIds: displayedClinics.map((c: any) => String(c.id)),
          })
        );
        
        const currentLang = (parsed.language || agencyData.defaultLanguage || "tr").toLowerCase().startsWith("en") ? "en" : "tr";
        const conv = calculateAdditionalCountAndConversion(curatedResult.allEligibleClinics.length, displayedClinics.length, currentLang);
        additionalEligibleClinicCount = conv.additionalCount;
        conversionData = conv;

        recommendations = displayedClinics.map((clinic: any) => {
          const { matchedPrices } = scoreClinic(clinic, allPricing, parsed);
          const cDocs = allDoctors.filter(d => d.clinicId === clinic.id);
          const trLower = (parsed.subTreatment || parsed.treatmentCategory || "").toLowerCase();
          const relevantDocs = cDocs.filter(d => {
            if (!trLower) return true;
            const dStr = [
              ...(d.treatmentCategories || []),
              ...(d.subTreatments || []),
              ...(d.highlightedTreatments || []),
              ...(d.expertiseAreas || []),
              d.specialty || ""
            ].join(" ").toLowerCase();
            return dStr.includes(trLower);
          });

          return {
            clinicId: clinic.id,
            clinicName: clinic.clinicName,
            clinicSlug: clinic.clinicSlug || clinic.clinicName?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/g, "") || clinic.id,
            clinicType: clinic.category || clinic.clinicType || "",
            location: formatClinicCardLocation(clinic, currentLang),
            rating: clinic.rating || undefined,
            reviews: clinic.reviewCount || undefined,
            matchScore: 98,
            matchedPrices,
            supportedLanguages: (clinic.supportedLanguages || []).map((l: string) => l.toUpperCase()),
            reason: currentLang === "tr" ? "Onaylı FeelinHealthy partner kliniği" : "Certified FeelinHealthy partner clinic",
            profilePath: `/agency-demo/medicalcenter/${clinic.clinicSlug || clinic.id}`,
            accommodation: clinic.accommodation !== false,
            transfer: clinic.transfer !== false,
            shortDescription: clinic.shortDescription || clinic.overview || "",
            doctorMatch: {
              hasRelevantDoctors: (relevantDocs.length > 0 ? relevantDocs : cDocs).length > 0,
              relevantDoctorCount: relevantDocs.length || cDocs.length,
              displayedDoctorCount: Math.min(2, relevantDocs.length || cDocs.length),
              matchBasis: relevantDocs.length > 0 ? "treatment" : "clinic_default",
              doctors: (relevantDocs.length > 0 ? relevantDocs : cDocs).map(d => ({
                id: d.id,
                fullName: resolveDoctorFullName(d),
                title: d.title || "",
                specialty: d.specialty || (d.expertiseAreas && d.expertiseAreas.length > 0 ? d.expertiseAreas[0] : ""),
                languages: d.supportedLanguages || [],
                photoUrl: d.photoUrl || null,
                experienceYears: d.experienceYears || null,
                education: d.education || null,
                shortBio: d.shortBio || null,
                treatmentCategories: d.treatmentCategories || [],
                subTreatments: d.subTreatments || []
              }))
            }
          };
        });
      } else if (!isFeelinHealthy) {
        const scored = allClinics
          .map((clinic: any) => {
            const { score, reason, matchedPrices } = scoreClinic(clinic, allPricing, parsed);
            return { clinic, score, reason, matchedPrices };
          })
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3);

        recommendations = scored.map(({ clinic, score, reason, matchedPrices }: any) => ({
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
          doctorMatch: (() => {
            // Resolve doctors for this clinic and treatment
            const cDocs = allDoctors.filter(d => d.clinicId === clinic.id);
            const relevantDocs = cDocs.filter(d => {
              if (!parsed.subTreatment && !parsed.treatmentCategory) return true; // if no specific intent, show all
              const trLower = (parsed.subTreatment || parsed.treatmentCategory || "").toLowerCase();
              const dStr = [
                ...(d.treatmentCategories || []),
                ...(d.subTreatments || []),
                ...(d.highlightedTreatments || []),
                ...(d.expertiseAreas || []),
                d.specialty || ""
              ].join(" ").toLowerCase();
              return dStr.includes(trLower);
            });
            
            if (cDocs.length === 0) return { hasRelevantDoctors: false, relevantDoctorCount: 0, displayedDoctorCount: 0, matchBasis: "none", doctors: [] };
            
            return {
              hasRelevantDoctors: relevantDocs.length > 0,
              relevantDoctorCount: relevantDocs.length || cDocs.length,
              displayedDoctorCount: Math.min(2, relevantDocs.length || cDocs.length),
              matchBasis: relevantDocs.length > 0 ? "treatment" : "clinic_default",
              doctors: (relevantDocs.length > 0 ? relevantDocs : cDocs).map(d => ({
                id: d.id,
                fullName: resolveDoctorFullName(d),
                title: d.title || "",
                specialty: d.specialty || (d.expertiseAreas && d.expertiseAreas.length > 0 ? d.expertiseAreas[0] : ""),
                languages: d.supportedLanguages || [],
                photoUrl: d.photoUrl || null,
                experienceYears: d.experienceYears || null,
                education: d.education || null,
                shortBio: d.shortBio || null,
                treatmentCategories: d.treatmentCategories || [],
                subTreatments: d.subTreatments || []
              }))
            };
          })()
        }));
      }

      // FeelinHealthy without readiness must not emit an empty clinic_recommendations payload.
      const shouldEmitRecommendations = !isFeelinHealthy || feelinHealthyReady;

      if (shouldEmitRecommendations) {
        // Guest FeelinHealthy responses must never contain more than 2 clinics.
        if (isFeelinHealthy) {
          recommendations = recommendations.slice(0, FEELINHEALTHY_CONFIG.maxGuestClinics);
        }

        if (recommendations.length > 0) {
          newCtx.lastRecommendedClinicIds = recommendations.map((r) => r.clinicId);
          newCtx.lastFocusedClinicId = recommendations[0].clinicId;
          newCtx.lastFocusedClinicName = recommendations[0].clinicName;
          newCtx.leadStage = "recommendation";
        }

        const replyLang = (parsed.language || agencyData.defaultLanguage || "tr").toLowerCase().startsWith("en") ? "en" : "tr";
        const readyReply = isFeelinHealthy
          ? getClinicMatchingReadyReply(replyLang, recommendations.length)
          : (parsed.replyText || (replyLang === "tr"
            ? `${parsed.subTreatment || "Tedaviniz"} için ${recommendations.length} uygun klinik buldum.`
            : `I found ${recommendations.length} suitable clinic(s) for ${parsed.subTreatment || "your treatment"}.`));

        return jsonResponse({
          reply: readyReply,
          type: "clinic_recommendations",
          clinics: recommendations,
          additionalEligibleClinicCount,
          conversionData,
          sessionContext: newCtx,
          showClinicCards: true,
          shouldCreateNewLead: false,
          shouldUpdateLead: false,
        }, { headers: CORS });
      }
    }

    // Coordinator: treat rematch intents as clinic Q&A instead.
    if (
      resolveAssistantRole(newCtx) === "clinic_coordinator" &&
      (parsed.intent === "clinic_matching" || parsed.intent === "clinic_recommendation")
    ) {
      parsed.intent = "clinic_question";
      parsed.showClinicCards = false;
      if (!parsed.selectedClinicName) parsed.selectedClinicName = newCtx.selectedClinicName;
      if (!parsed.clinicName) parsed.clinicName = newCtx.selectedClinicName;
    }

    // --- SHOULD CREATE LEAD (only after clinic matching had its chance) ---
    if (parsed.shouldCreateLead && !leadAlreadyCreated) {
      if (
        isFeelinHealthy &&
        isReadyForClinicMatching(newCtx).ready &&
        !newCtx.lastRecommendedClinicIds?.length &&
        resolveAssistantRole(newCtx) !== "clinic_coordinator"
      ) {
        // Safety net: never create a lead before the first clinic recommendation.
        parsed.intent = "clinic_recommendation";
      } else {
        if (newCtx.patientEmailStatus !== "verified_format" && !newCtx.patientEmail?.includes("@")) {
           newCtx.leadStage = "collecting_email";
           return jsonResponse({
             reply: parsed.language === "tr" 
               ? "Talebinizi tamamlayabilmemiz ve süreçle ilgili sizi bilgilendirebilmemiz için geçerli bir e-posta adresine ihtiyacımız bulunuyor."
               : "To complete your request and keep you informed about the process, we need a valid email address.",
             type: "email_request",
             sessionContext: newCtx,
             showClinicCards: false,
             leadStatus: newCtx.leadStage,
             shouldCreateNewLead: false,
             shouldUpdateLead: false
           }, { headers: CORS });
        }

        newCtx.leadStage = "quote_request_created";
        return jsonResponse({
          reply: parsed.replyText || "Harika, talebinizi başarıyla oluşturdum.",
          type: "text",
          sessionContext: newCtx,
          showClinicCards: false,
          leadStatus: newCtx.leadStage,
          shouldCreateNewLead: true,
          shouldUpdateLead: false
        }, { headers: CORS });
      }
    }

    // --- FOLLOW-UP OR LEAD CAPTURE ---
    // Clinic Coordinator: never rematch from followup; fall through to clinic Q&A handlers.
    if (
      resolveAssistantRole(newCtx) !== "clinic_coordinator" &&
      (parsed.intent === "followup" || parsed.needsFollowUp || parsed.intent === "lead_capture")
    ) {
      if (isFeelinHealthy && isReadyForClinicMatching(newCtx).ready) {
        // Fall through is not possible after return paths above; re-enter matching.
        parsed.intent = "clinic_recommendation";
      } else {
        return jsonResponse({
          reply: parsed.replyText || "Lütfen gerekli bilgileri paylaşır mısınız?",
          type: "text",
          sessionContext: newCtx,
          showClinicCards: parsed.showClinicCards === true,
        }, { headers: CORS });
      }
    } else if (
      resolveAssistantRole(newCtx) === "clinic_coordinator" &&
      (parsed.intent === "followup" || parsed.needsFollowUp)
    ) {
      parsed.intent = "clinic_question";
      parsed.showClinicCards = false;
    } else if (
      resolveAssistantRole(newCtx) === "clinic_coordinator" &&
      parsed.intent === "lead_capture"
    ) {
      return jsonResponse({
        reply:
          parsed.replyText ||
          (parsed.language === "en"
            ? "Your request is noted for this clinic. How else can I help with your visit?"
            : "Talebiniz bu klinik için not edildi. Ziyaretinizle ilgili başka nasıl yardımcı olabilirim?"),
        type: "text",
        sessionContext: newCtx,
        showClinicCards: false,
        leadStatus: newCtx.leadStage,
      }, { headers: CORS });
    }

    // If followup/lead path redirected into matching, run it once more here.
    // Never rematch while Clinic Patient Coordinator mode is active.
    if (
      isFeelinHealthy &&
      resolveAssistantRole(newCtx) !== "clinic_coordinator" &&
      (parsed.intent === "clinic_matching" || parsed.intent === "clinic_recommendation")
    ) {
      const branchOrCat = parsed.treatmentCategory || newCtx.lastTreatmentCategory || agencySlotsExtracted.extracted.treatment;
      const locationDecision = decideFeelinHealthyLocationNextStep(newCtx, fullAgencyClinics, (parsed.language || "tr"));
      if (locationDecision.step === "ready") {
        const effectiveCity = locationDecision.city;
        const effectiveSide = newCtx.istanbul_side || locationDecision.side;
        const curatedResult = getCuratedClinicsForFeelinHealthy(branchOrCat, effectiveCity, effectiveSide, fullAgencyClinics);
        const displayedClinics = curatedResult.matchingCuratedClinics.slice(0, FEELINHEALTHY_CONFIG.maxGuestClinics);
        const currentLang = (parsed.language || agencyData.defaultLanguage || "tr").toLowerCase().startsWith("en") ? "en" : "tr";
        const conv = calculateAdditionalCountAndConversion(curatedResult.allEligibleClinics.length, displayedClinics.length, currentLang);
        const recommendations = displayedClinics.map((clinic: any) => {
          const { matchedPrices } = scoreClinic(clinic, allPricing, parsed);
          return {
            clinicId: clinic.id,
            clinicName: clinic.clinicName,
            clinicSlug: clinic.clinicSlug || clinic.id,
            clinicType: clinic.category || clinic.clinicType || "",
            location: formatClinicCardLocation(clinic, currentLang),
            rating: clinic.rating || undefined,
            reviews: clinic.reviewCount || undefined,
            matchScore: 98,
            matchedPrices,
            supportedLanguages: (clinic.supportedLanguages || []).map((l: string) => l.toUpperCase()),
            reason: currentLang === "tr" ? "Onaylı FeelinHealthy partner kliniği" : "Certified FeelinHealthy partner clinic",
            profilePath: `/agency-demo/medicalcenter/${clinic.clinicSlug || clinic.id}`,
            accommodation: clinic.accommodation !== false,
            transfer: clinic.transfer !== false,
            shortDescription: clinic.shortDescription || clinic.overview || "",
          } as ClinicRecommendation;
        });
        if (recommendations.length > 0) {
          newCtx.lastRecommendedClinicIds = recommendations.map((r) => r.clinicId);
          newCtx.lastFocusedClinicId = recommendations[0].clinicId;
          newCtx.lastFocusedClinicName = recommendations[0].clinicName;
          newCtx.leadStage = "recommendation";
        }
        return jsonResponse({
          reply: getClinicMatchingReadyReply(currentLang, recommendations.length),
          type: "clinic_recommendations",
          clinics: recommendations,
          additionalEligibleClinicCount: conv.additionalCount,
          conversionData: conv,
          sessionContext: newCtx,
          showClinicCards: true,
          shouldCreateNewLead: false,
          shouldUpdateLead: false,
        }, { headers: CORS });
      }
    }

    // --- CLINIC SELECTED OR CLINIC QUESTION ---
    if (parsed.intent === "clinic_question" || parsed.intent === "clinic_selected") {
      const clinicName =
        parsed.selectedClinicName ||
        parsed.clinicName ||
        newCtx.selectedClinicName ||
        ctx.lastFocusedClinicName;
      let clinic: any = null;
      if (resolveAssistantRole(newCtx) === "clinic_coordinator" && getCoordinatorClinicId(newCtx)) {
        clinic = allClinics.find((c: any) => String(c.id) === String(getCoordinatorClinicId(newCtx)));
      } else if (clinicName) {
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
          doctorMatch: (() => {
            const cDocs = allDoctors.filter(d => d.clinicId === clinic.id);
            if (cDocs.length === 0) return { hasRelevantDoctors: false, relevantDoctorCount: 0, displayedDoctorCount: 0, matchBasis: "none", doctors: [] };
            return {
              hasRelevantDoctors: true,
              relevantDoctorCount: cDocs.length,
              displayedDoctorCount: Math.min(2, cDocs.length),
              matchBasis: "clinic_default",
              doctors: cDocs.map(d => ({
                id: d.id,
                fullName: resolveDoctorFullName(d),
                title: d.title || "",
                specialty: d.specialty || (d.expertiseAreas && d.expertiseAreas.length > 0 ? d.expertiseAreas[0] : ""),
                languages: d.supportedLanguages || [],
                photoUrl: d.photoUrl || null,
                experienceYears: d.experienceYears || null,
                education: d.education || null,
                shortBio: d.shortBio || null,
                treatmentCategories: d.treatmentCategories || [],
                subTreatments: d.subTreatments || []
              }))
            };
          })()
        };

        return jsonResponse({
          reply: parsed.replyText || `${clinic.clinicName} hakkında bilgi.`,
          type: "clinic_answer",
          clinics: [miniCard],
          sessionContext: newCtx,
          showClinicCards: false, // DO NOT REPEAT CLINIC CARD ON CLINIC QUESTIONS
        }, { headers: CORS });
      }

      return jsonResponse({
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

      return jsonResponse({
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
          if (adminDb) {
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

            return jsonResponse({
              reply: replyText,
              type: "doctor_answer",
              sessionContext: newCtx,
            }, { headers: CORS });
          }
        }
      } catch (e) {
          console.error("[matching-chat] Doctor fetch error:", e);
        }

        return jsonResponse({
          reply: parsed.replyText || (parsed.language === "tr"
            ? `${clinic.clinicName} için sistemde doktor bilgisi henüz tanımlı değil.`
            : `No doctor information is available for ${clinic.clinicName} yet.`),
          type: "text",
          sessionContext: newCtx,
        }, { headers: CORS });
      }

      return jsonResponse({
        reply: parsed.replyText || (parsed.language === "tr"
          ? "Hangi kliniğin doktorlarını öğrenmek istediğinizi belirtir misiniz?"
          : "Could you specify which clinic's doctors you'd like to learn about?"),
        type: "text",
        sessionContext: newCtx,
      }, { headers: CORS });
    }

    // --- GENERAL / FALLBACK ---
    return jsonResponse({
      reply: parsed.replyText || (parsed.language === "tr"
        ? (isFeelinHealthy ? "Size nasıl yardımcı olabilirim? Hangi tedaviyi aradığınızı veya tercih ettiğiniz lokasyonu paylaşabilirsiniz." : "Size nasıl yardımcı olabilirim? Hangi tedaviyi aradığınızı, lokasyonunuzu veya bütçenizi paylaşabilirsiniz.")
        : (isFeelinHealthy ? "How can I help you? Share the treatment you're looking for or your preferred location." : "How can I help you? Share the treatment you're looking for, your preferred location, or budget.")),
      type: "text",
      sessionContext: newCtx,
      showClinicCards: parsed.showClinicCards === true,
    }, { headers: CORS });

  } catch (err: any) {
    const errorCode = err.code || "UNKNOWN_ERROR";
    console.error(`[matching-chat] [ALERT] Provider Error: ${errorCode}`, err.message);

    const { action, sessionContext } = requestBody;
    const ctx = sessionContext || {};
    const lang = ctx.language || (action?.locale) || "tr";
    const isTr = lang === "tr";
    const isFeelinHealthyFallback = slug === "feelinhealthy" || ctx.isGuestUser !== undefined;
    
    // SAFE DEGRADED MODE (Deterministic Fallback)
    // Preserves the user message and session, ensures no fake success is shown.
    ctx.processingMode = "degraded";

    if (action && action.type === "privacy_consent_response" && action.action === "accept") {
      return jsonResponse(
        { 
          reply: isTr 
            ? (isFeelinHealthyFallback ? "Onayınız alındı. Tercihinizi kaydettim. Size en uygun klinikleri hazırlayabilmemiz için adınızı soyadınızı, yaşınızı ve cinsiyetinizi paylaşabilir misiniz?" : "Onayınız alındı. Tercihinizi kaydettim. Size en uygun klinikleri hazırlarken birkaç ek bilgiye ihtiyacım var. Yaklaşık bütçeniz veya seyahat tarihiniz belli mi?")
            : (isFeelinHealthyFallback ? "Consent received. I've noted your preference. To prepare the most suitable clinic options for you, could you please share your full name, age, and gender?" : "Consent received. I've noted your preference. While I prepare the most suitable clinics, I need a few more details. Do you have an approximate budget or travel date in mind?"),
          type: "text",
          sessionContext: ctx
        },
        { status: 200, headers: CORS }
      );
    }

    return jsonResponse(
      { 
        reply: isTr 
          ? (isFeelinHealthyFallback ? "Talebinizi aldım. Size en uygun klinikleri hazırlayabilmemiz için adınızı soyadınızı, yaşınızı ve cinsiyetinizi paylaşabilir misiniz?" : "Talebinizi aldım. Size uygun klinikleri hazırlayabilmem için yaklaşık bütçenizi, tercih ettiğiniz tarihi ve dil ihtiyacınızı paylaşabilir misiniz?")
          : (isFeelinHealthyFallback ? "I've saved your request. To prepare the most suitable clinic options for you, could you please share your full name, age, and gender?" : "I've saved your request. To prepare suitable clinic options, could you share your approximate budget, preferred dates and language requirements?"), 
        type: "text",
        sessionContext: ctx
      },
      { status: 200, headers: CORS }
    );
  }
}
