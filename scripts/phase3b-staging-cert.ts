/**
 * Phase 3B live staging certification runner (API-level).
 * Loads ONLY .env.staging. Targets clinicbridge-staging.
 *
 * Usage (with Next already running on BASE_URL with staging env):
 *   npx tsx scripts/phase3b-staging-cert.ts
 */

import { loadAndAssertStagingEnv, STAGING_PROJECT_ID, PRODUCTION_PROJECT_ID } from "./lib/stagingFirebaseEnv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { resolveAgencyBrand } from "../lib/agency/resolveAgencyBrand";
import { getCuratedClinicsForFeelinHealthy } from "../lib/agency/feelinhealthyConfig";
import { FEELINHEALTHY_PRODUCTION_CLINIC_IDS, FEELINHEALTHY_CONFIG } from "../lib/agency/feelinhealthyConfig";
import { buildPatientOfferEmailContent } from "../lib/services/patientOfferEmailContent";
import { Resend } from "resend";

const BASE = process.env.CERT_BASE_URL || "http://127.0.0.1:3000";
const SLUG = "feelinhealthy";
const TEST_INBOX = "info@clinicbridge-ai.com";
const CONSENT_VERSION = "1.0";

type Turn = {
  label: string;
  message?: string;
  action?: Record<string, unknown>;
  history?: Array<{ role: string; content: string }>;
};

type TurnResult = {
  label: string;
  ok: boolean;
  type?: string;
  reply?: string;
  ctx: Record<string, any>;
  trace?: Record<string, number>;
  totalMs?: number;
  notes: string[];
  rawKeys?: string[];
};

const results: Record<string, any> = {
  safety: {},
  replays: {},
  email: {},
  duplicate: {},
  selection: {},
  errors: {},
  perf: [] as any[],
  db: {},
  decisionHints: [] as string[],
};

function failHint(msg: string) {
  results.decisionHints.push(msg);
  console.error("FAIL_HINT:", msg);
}

async function postChat(
  sessionContext: Record<string, any>,
  turn: Turn
): Promise<TurnResult> {
  const body: any = {
    sessionContext,
    history: turn.history || [],
  };
  if (turn.action) body.action = turn.action;
  if (turn.message != null) body.message = turn.message;

  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/public/agency/${SLUG}/matching-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const wallMs = Date.now() - t0;
  const data = await res.json().catch(() => ({}));
  const ctx = data.sessionContext || sessionContext;
  const notes: string[] = [];
  if (!res.ok) notes.push(`http_${res.status}`);
  results.perf.push({
    label: turn.label,
    wallMs,
    trace: data.trace || null,
    openAiTotalMs: data.trace?.openAiTotalMs,
    totalMs: data.trace?.totalMs ?? wallMs,
  });
  return {
    label: turn.label,
    ok: res.ok,
    type: data.type,
    reply: typeof data.reply === "string" ? data.reply : JSON.stringify(data.reply || "").slice(0, 500),
    ctx,
    trace: data.trace,
    totalMs: data.trace?.totalMs ?? wallMs,
    notes,
    rawKeys: Object.keys(data),
  };
}

function newSession(suffix: string) {
  return {
    sessionId: `cert_${Date.now()}_${suffix}`,
  };
}

async function acceptConsent(ctx: Record<string, any>) {
  return postChat(ctx, {
    label: "consent_accept",
    action: {
      type: "privacy_consent_response",
      action: "accept",
      consentVersion: CONSENT_VERSION,
      locale: "tr",
    },
  });
}

async function selectCity(ctx: Record<string, any>, city: string, locale = "tr") {
  return postChat(ctx, {
    label: `select_city_${city}`,
    action: {
      type: "select_treatment_city",
      city,
      value: city,
      locale,
      actionId: `city_${city}_${Date.now()}`,
    },
  });
}

async function selectSide(ctx: Record<string, any>, side: "anatolian" | "european", locale = "tr") {
  return postChat(ctx, {
    label: `select_side_${side}`,
    action: {
      type: "side_selection",
      side,
      locale,
      actionId: `side_${side}_${Date.now()}`,
    },
  });
}

function summarizeCtx(ctx: Record<string, any>) {
  return {
    sessionId: ctx.sessionId,
    selectedCity: ctx.selectedCity || null,
    istanbul_side: ctx.istanbul_side || null,
    lastTreatmentCategory: ctx.lastTreatmentCategory || null,
    quoteConsent: ctx.quoteConsent ?? null,
    leadId: ctx.leadId || null,
    quoteId: ctx.quoteId || null,
    quoteRequestLocked: ctx.quoteRequestLocked ?? null,
    selectedClinicIds: ctx.selectedClinicIds || [],
    lastRecommendedClinicIds: ctx.lastRecommendedClinicIds || [],
    postQuoteRematchRequested: ctx.postQuoteRematchRequested ?? null,
    postQuoteMembershipMessageSent: ctx.postQuoteMembershipMessageSent ?? null,
    leadStage: ctx.leadStage || null,
  };
}

async function dbCounts(db: ReturnType<typeof getFirestore>) {
  const agency = db.collection("agencies").doc("feelinhealthy");
  const [leads, quotes, convs] = await Promise.all([
    agency.collection("leads").get(),
    agency.collection("quotes").get(),
    agency.collection("conversations").get(),
  ]);
  return { leads: leads.size, quotes: quotes.size, conversations: convs.size };
}

async function main() {
  console.log("=== PHASE 3B STAGING CERT ===");
  loadAndAssertStagingEnv();
  if (!process.env.OPENAI_API_KEY || !process.env.RESEND_API_KEY) {
    throw new Error("OPENAI/RESEND missing");
  }
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, "base64").toString("utf8"));
  if (sa.project_id !== STAGING_PROJECT_ID) throw new Error("SA not staging");
  if (!getApps().length) initializeApp({ credential: cert(sa), projectId: STAGING_PROJECT_ID });
  const connected = getApps()[0]?.options?.projectId;
  if (connected !== STAGING_PROJECT_ID) throw new Error("connected not staging");
  results.safety = {
    guard: "PASS",
    firebase: connected,
    productionTargeted: connected === PRODUCTION_PROJECT_ID ? "YES" : "NO",
    openai: "PRESENT",
    resend: "PRESENT",
  };
  console.log("safety=", JSON.stringify(results.safety));

  // Health check API
  const health = await fetch(`${BASE}/api/public/agency/${SLUG}/matching-chat`, {
    method: "OPTIONS",
  }).catch((e) => ({ ok: false, status: 0, error: String(e) } as any));
  if (!health.ok && health.status !== 204) {
    // try a minimal POST to see if server is up
    const probe = await fetch(`${BASE}/demo/feelinhealthy`).catch((e) => ({ ok: false, statusText: String(e) } as any));
    if (!probe.ok) {
      throw new Error(`Next server not reachable at ${BASE}. Start with staging env first.`);
    }
  }

  const db = getFirestore();
  const before = await dbCounts(db);
  results.db.before = before;
  console.log("db_before=", before);

  // ── REPLAY 1: info interrupt / İstanbul aesthetic ──
  {
    let ctx: any = newSession("r1");
    const c1 = await acceptConsent(ctx);
    ctx = c1.ctx;
    const t1 = await postChat(ctx, {
      label: "r1_treatment",
      message: "Burun estetiği (rinoplasti) yaptırmak istiyorum, İstanbul tercih ediyorum.",
    });
    ctx = t1.ctx;
    // If still need city card
    if (!ctx.selectedCity) {
      const city = await selectCity(ctx, "istanbul");
      ctx = city.ctx;
    }
    const beforeInfo = summarizeCtx(ctx);
    const info = await postChat(ctx, {
      label: "r1_info_interrupt",
      message: "Tedavi süreci nasıl ilerliyor? Kaç günlük bir tedavi olacak?",
    });
    ctx = info.ctx;
    const afterInfo = summarizeCtx(ctx);
    const reply = (info.reply || "").toLowerCase();
    const passInfo =
      info.ok &&
      !/partner clinic not found|klinik bulunamadı|teknik sorun/i.test(info.reply || "") &&
      String(afterInfo.selectedCity || "").toLowerCase().includes("istanbul") &&
      !afterInfo.leadId &&
      !afterInfo.quoteId;

    const side = await selectSide(ctx, "anatolian");
    ctx = side.ctx;
    // may need more intake - push synthetic intake answers if asked
    for (let i = 0; i < 8; i++) {
      const stage = ctx.conversationStage || ctx.leadStage || "";
      const type = ""; // continue with intake fields
      if (ctx.quoteRequestLocked) break;
      if ((ctx.lastRecommendedClinicIds || []).length > 0) break;
      if (ctx.istanbul_side && ctx.selectedCity && ctx.lastTreatmentCategory) {
        // try name/email/phone if intake pending
        const missing = [];
        if (!ctx.patientName && !ctx.firstName) {
          const r = await postChat(ctx, {
            label: `r1_intake_name_${i}`,
            message: "Staging Certification Patient",
          });
          ctx = r.ctx;
          continue;
        }
        if (!ctx.patientEmail) {
          const r = await postChat(ctx, {
            label: `r1_intake_email_${i}`,
            message: TEST_INBOX,
          });
          ctx = r.ctx;
          continue;
        }
        if (!ctx.patientPhone && !ctx.phone) {
          const r = await postChat(ctx, {
            label: `r1_intake_phone_${i}`,
            message: "+905551112233",
          });
          ctx = r.ctx;
          continue;
        }
      }
      const r = await postChat(ctx, {
        label: `r1_continue_${i}`,
        message: "Devam edelim",
      });
      ctx = r.ctx;
      if ((ctx.lastRecommendedClinicIds || []).length) break;
      if (r.type === "clinic_recommendations" || r.type === "clinic_cards") break;
    }

    const recIds = ctx.lastRecommendedClinicIds || [];
    const intermedShown = recIds.includes(FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi);
    const orionShown = recIds.includes(FEELINHEALTHY_PRODUCTION_CLINIC_IDS.orionSurgeryCenter);
    results.replays.r1 = {
      passInfo,
      beforeInfo,
      afterInfo,
      infoReplyPreview: (info.reply || "").slice(0, 280),
      infoTrace: info.trace,
      afterSide: summarizeCtx(ctx),
      recommended: recIds,
      orionShown,
      intermedShown,
      cityPreserved: String(afterInfo.selectedCity || "").toLowerCase().includes("istanbul"),
      noLeadQuote: !afterInfo.leadId && !afterInfo.quoteId,
    };
    if (!passInfo) failHint("Replay1 info interrupt failed");
    if (intermedShown) failHint("Replay1 Intermed leaked");
    console.log("R1=", JSON.stringify(results.replays.r1));
  }

  // ── REPLAY 2: Antalya dental ──
  {
    let ctx: any = newSession("r2");
    ctx = (await acceptConsent(ctx)).ctx;
    ctx = (
      await postChat(ctx, {
        label: "r2_treatment",
        message: "Diş implantı yaptırmak istiyorum.",
      })
    ).ctx;
    const antalya = await postChat(ctx, {
      label: "r2_antalya",
      message: "Antalya tercih ediyorum.",
    });
    ctx = antalya.ctx;
    if (!String(ctx.selectedCity || "").toLowerCase().includes("antalya")) {
      ctx = (await selectCity(ctx, "antalya")).ctx;
    }
    const city = String(ctx.selectedCity || "").toLowerCase();
    results.replays.r2 = {
      pass: city.includes("antalya"),
      after: summarizeCtx(ctx),
      replyPreview: (antalya.reply || "").slice(0, 200),
      trace: antalya.trace,
    };
    if (!results.replays.r2.pass) failHint("Replay2 Antalya not stored");
    console.log("R2=", JSON.stringify(results.replays.r2));
  }

  // ── REPLAY 3: İstanbul dental + Avrupa, Intermed exclusion ──
  {
    let ctx: any = newSession("r3");
    ctx = (await acceptConsent(ctx)).ctx;
    ctx = (
      await postChat(ctx, {
        label: "r3_treatment_city",
        message: "Diş implantı için İstanbul tercih ediyorum.",
      })
    ).ctx;
    if (!ctx.selectedCity) ctx = (await selectCity(ctx, "istanbul")).ctx;
    const afterCity = summarizeCtx(ctx);
    ctx = (await selectSide(ctx, "european")).ctx;
    // push intake to matching
    for (let i = 0; i < 10; i++) {
      if ((ctx.lastRecommendedClinicIds || []).length) break;
      if (!ctx.patientName && !ctx.firstName) {
        ctx = (await postChat(ctx, { label: `r3_name_${i}`, message: "Staging Certification Patient" })).ctx;
        continue;
      }
      if (!ctx.patientEmail) {
        ctx = (await postChat(ctx, { label: `r3_email_${i}`, message: TEST_INBOX })).ctx;
        continue;
      }
      if (!ctx.patientPhone && !ctx.phone) {
        ctx = (await postChat(ctx, { label: `r3_phone_${i}`, message: "+905551112233" })).ctx;
        continue;
      }
      ctx = (await postChat(ctx, { label: `r3_go_${i}`, message: "Uygun klinikleri göster" })).ctx;
    }
    const rec = ctx.lastRecommendedClinicIds || [];
    const clinicsSnap = await db.collection("agencies").doc("feelinhealthy").collection("clinics").get();
    const clinics = clinicsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const curated = getCuratedClinicsForFeelinHealthy("dental", "istanbul", "european", clinics);
    const curatedIds = curated.matchingCuratedClinics.map((c: any) => c.id);
    results.replays.r3 = {
      afterCity,
      after: summarizeCtx(ctx),
      recommended: rec,
      curatedIds,
      maxOk: rec.length <= FEELINHEALTHY_CONFIG.maxGuestClinics,
      intermedAbsent: !rec.includes(FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi),
      intermedExistsActive: clinics.some(
        (c: any) =>
          c.id === FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi &&
          String(c.status).toLowerCase() === "active"
      ),
      cityPreserved: String(ctx.selectedCity || "").toLowerCase().includes("istanbul"),
      side: ctx.istanbul_side,
    };
    if (!results.replays.r3.intermedAbsent) failHint("Replay3 Intermed shown");
    if (!results.replays.r3.maxOk) failHint("Replay3 exceeded guest max");
    if (results.replays.r3.side !== "european") failHint("Replay3 side not european");
    console.log("R3=", JSON.stringify(results.replays.r3));
  }

  // ── REPLAY 4–7: quote + post-quote (use dental Avrupa session if we have recs) ──
  {
    let ctx: any = newSession("r4");
    ctx = (await acceptConsent(ctx)).ctx;
    ctx = (
      await postChat(ctx, {
        label: "r4_start",
        message: "Diş implantı istiyorum, İstanbul Avrupa Yakası.",
      })
    ).ctx;
    if (!ctx.selectedCity) ctx = (await selectCity(ctx, "istanbul")).ctx;
    if (ctx.istanbul_side !== "european") ctx = (await selectSide(ctx, "european")).ctx;
    for (let i = 0; i < 12; i++) {
      if ((ctx.lastRecommendedClinicIds || []).length >= 1) break;
      if (!ctx.patientName && !ctx.firstName) {
        ctx = (await postChat(ctx, { label: `r4_name_${i}`, message: "Staging Certification Patient" })).ctx;
        continue;
      }
      if (!ctx.patientEmail) {
        ctx = (await postChat(ctx, { label: `r4_email_${i}`, message: TEST_INBOX })).ctx;
        continue;
      }
      if (!ctx.patientPhone && !ctx.phone) {
        ctx = (await postChat(ctx, { label: `r4_phone_${i}`, message: "+905551112233" })).ctx;
        continue;
      }
      ctx = (await postChat(ctx, { label: `r4_match_${i}`, message: "Klinik öner" })).ctx;
    }
    const beforeQuote = await dbCounts(db);
    const rec = [...(ctx.lastRecommendedClinicIds || [])].slice(0, 2);
    // select clinics via card actions
    for (const clinicId of rec) {
      const r = await postChat(ctx, {
        label: `r4_select_${clinicId}`,
        action: {
          action: "select_clinic",
          clinicId,
          clinicName: clinicId,
          actionId: `sel_${clinicId}_${Date.now()}`,
          locale: "tr",
        },
      });
      ctx = r.ctx;
    }
    // request quote
    const quoteTurn = await postChat(ctx, {
      label: "r4_request_quote",
      action: {
        action: "request_quote",
        clinicId: rec[0],
        actionId: `quote_${Date.now()}`,
        locale: "tr",
      },
    });
    ctx = quoteTurn.ctx;
    // Also try message-based quote request if needed
    if (!ctx.quoteId && !ctx.quoteRequestLocked) {
      const q2 = await postChat(ctx, {
        label: "r4_quote_msg",
        message: "Seçtiğim kliniklerden teklif istiyorum",
      });
      ctx = q2.ctx;
    }
    const afterQuote = await dbCounts(db);
    const membershipOnce = Boolean(ctx.postQuoteMembershipMessageSent || ctx.postQuoteMembershipKey);
    const replyHasMembership =
      /en fazla\s*2|üyelik|karşılaştır/i.test(quoteTurn.reply || "") ||
      membershipOnce;

    // Replay 5 post-quote info
    const beforeQ5 = { leadId: ctx.leadId, quoteId: ctx.quoteId, selectedClinicIds: [...(ctx.selectedClinicIds || [])], city: ctx.selectedCity };
    const q5 = await postChat(ctx, {
      label: "r5_postquote_info",
      message: "Kaç günlük bir operasyon olacak?",
    });
    ctx = q5.ctx;
    const afterQ5 = { leadId: ctx.leadId, quoteId: ctx.quoteId, selectedClinicIds: [...(ctx.selectedClinicIds || [])], city: ctx.selectedCity };

    // Replay 6 rematch ask
    const beforeQ6 = { leadId: ctx.leadId, quoteId: ctx.quoteId, leadStage: ctx.leadStage };
    const q6 = await postChat(ctx, {
      label: "r6_baska_klinik",
      message: "Başka klinik görmek istiyorum.",
    });
    ctx = q6.ctx;
    const afterQ6 = summarizeCtx(ctx);

    // Replay 7 location change
    const beforeQ7 = { leadId: ctx.leadId, quoteId: ctx.quoteId };
    const q7 = await postChat(ctx, {
      label: "r7_antalya_to_istanbul",
      message: "Antalya yerine İstanbul tercih ediyorum.",
    });
    ctx = q7.ctx;
    const afterQ7 = summarizeCtx(ctx);

    results.replays.r4 = {
      beforeQuote,
      afterQuote,
      ctx: summarizeCtx(ctx),
      recommended: rec,
      quoteReplyPreview: (quoteTurn.reply || "").slice(0, 300),
      followUpHint: membershipOnce || replyHasMembership,
      leadDelta: afterQuote.leads - beforeQuote.leads,
      quoteDelta: afterQuote.quotes - beforeQuote.quotes,
      pass:
        afterQuote.leads - beforeQuote.leads <= 1 &&
        afterQuote.quotes - beforeQuote.quotes <= 1,
    };
    results.replays.r5 = {
      before: beforeQ5,
      after: afterQ5,
      replyPreview: (q5.reply || "").slice(0, 280),
      sameLead: beforeQ5.leadId === afterQ5.leadId,
      sameQuote: beforeQ5.quoteId === afterQ5.quoteId,
      cityPreserved: beforeQ5.city === afterQ5.city,
      pass:
        beforeQ5.leadId === afterQ5.leadId &&
        beforeQ5.quoteId === afterQ5.quoteId &&
        !/teklif oluşturuldu|quote created/i.test(q5.reply || ""),
      trace: q5.trace,
    };
    results.replays.r6 = {
      before: beforeQ6,
      after: afterQ6,
      replyPreview: (q6.reply || "").slice(0, 280),
      sameLead: beforeQ6.leadId === afterQ6.leadId,
      sameQuote: beforeQ6.quoteId === afterQ6.quoteId,
      rematchFlag: afterQ6.postQuoteRematchRequested === true || /klinik|öner|şehir/i.test(q6.reply || ""),
      pass: beforeQ6.leadId === afterQ6.leadId && beforeQ6.quoteId === afterQ6.quoteId,
      trace: q6.trace,
    };
    results.replays.r7 = {
      before: beforeQ7,
      after: afterQ7,
      replyPreview: (q7.reply || "").slice(0, 280),
      sameLead: beforeQ7.leadId === afterQ7.leadId,
      sameQuote: beforeQ7.quoteId === afterQ7.quoteId,
      cityIstanbul: String(afterQ7.selectedCity || "").toLowerCase().includes("istanbul") || /istanbul|yakası|side/i.test(q7.reply || ""),
      pass: beforeQ7.leadId === afterQ7.leadId && beforeQ7.quoteId === afterQ7.quoteId,
      trace: q7.trace,
    };
    if (!results.replays.r5.pass) failHint("Replay5 post-quote Q&A mutated lead/quote");
    if (!results.replays.r6.pass) failHint("Replay6 created new lead/quote");
    if (!results.replays.r7.pass) failHint("Replay7 created new lead/quote");
    console.log("R4=", JSON.stringify(results.replays.r4));
    console.log("R5=", JSON.stringify(results.replays.r5));
    console.log("R6=", JSON.stringify(results.replays.r6));
    console.log("R7=", JSON.stringify(results.replays.r7));
  }

  // ── REPLAY 8: aesthetic Avrupa Intermed exclusion (runtime curated + live) ──
  {
    const clinicsSnap = await db.collection("agencies").doc("feelinhealthy").collection("clinics").get();
    const clinics = clinicsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const curated = getCuratedClinicsForFeelinHealthy("aesthetic_surgery", "istanbul", "european", clinics);
    const ids = curated.matchingCuratedClinics.map((c: any) => c.id);
    let ctx: any = newSession("r8");
    ctx = (await acceptConsent(ctx)).ctx;
    ctx = (
      await postChat(ctx, {
        label: "r8_start",
        message: "Rinoplasti için İstanbul Avrupa Yakası istiyorum.",
      })
    ).ctx;
    if (!ctx.selectedCity) ctx = (await selectCity(ctx, "istanbul")).ctx;
    if (ctx.istanbul_side !== "european") ctx = (await selectSide(ctx, "european")).ctx;
    for (let i = 0; i < 10; i++) {
      if ((ctx.lastRecommendedClinicIds || []).length) break;
      if (!ctx.patientName && !ctx.firstName) {
        ctx = (await postChat(ctx, { label: `r8_name_${i}`, message: "Staging Certification Patient" })).ctx;
        continue;
      }
      if (!ctx.patientEmail) {
        ctx = (await postChat(ctx, { label: `r8_email_${i}`, message: TEST_INBOX })).ctx;
        continue;
      }
      if (!ctx.patientPhone && !ctx.phone) {
        ctx = (await postChat(ctx, { label: `r8_phone_${i}`, message: "+905551112233" })).ctx;
        continue;
      }
      ctx = (await postChat(ctx, { label: `r8_go_${i}`, message: "Uygun klinikleri listele" })).ctx;
    }
    const live = ctx.lastRecommendedClinicIds || [];
    results.replays.r8 = {
      curatedIds: ids,
      liveRecommended: live,
      intermedInCurated: ids.includes(FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi),
      intermedInLive: live.includes(FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi),
      intermedActiveLinked: clinics.some(
        (c: any) =>
          c.id === FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi &&
          String(c.status).toLowerCase() === "active"
      ),
      bhtPresent:
        ids.includes(FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema) ||
        live.includes(FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema),
      pass:
        !ids.includes(FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi) &&
        !live.includes(FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi),
    };
    if (!results.replays.r8.pass) failHint("Replay8 Intermed exclusion failed live");
    console.log("R8=", JSON.stringify(results.replays.r8));
  }

  // ── REPLAY 9: English ──
  {
    let ctx: any = newSession("r9");
    ctx = (
      await postChat(ctx, {
        label: "r9_consent",
        action: {
          type: "privacy_consent_response",
          action: "accept",
          consentVersion: CONSENT_VERSION,
          locale: "en",
        },
      })
    ).ctx;
    const start = await postChat(ctx, {
      label: "r9_start",
      message: "I'm considering rhinoplasty in Istanbul.",
    });
    ctx = start.ctx;
    if (!ctx.selectedCity) ctx = (await selectCity(ctx, "istanbul", "en")).ctx;
    const info = await postChat(ctx, {
      label: "r9_info",
      message: "How many days does the treatment take?",
    });
    ctx = info.ctx;
    const reply = info.reply || "";
    const turkishBleed = /\b(merhaba|lütfen|tercih|klinik|yakası|teşekkür)\b/i.test(reply);
    results.replays.r9 = {
      replyPreview: reply.slice(0, 300),
      city: ctx.selectedCity,
      turkishBleed,
      pass: info.ok && !turkishBleed && String(ctx.selectedCity || "").toLowerCase().includes("istanbul"),
      trace: info.trace,
    };
    if (!results.replays.r9.pass) failHint("Replay9 English flow failed or language bleed");
    console.log("R9=", JSON.stringify(results.replays.r9));
  }

  // ── REPLAY 10: email via production content path (one send) ──
  {
    const agencySnap = await db.collection("agencies").doc("feelinhealthy").get();
    const brand = resolveAgencyBrand(agencySnap.data() as any);
    const content = buildPatientOfferEmailContent({
      lang: "tr",
      agencyName: brand.displayName,
      patientName: "Staging Certification Patient",
      treatmentLabel: "Dental Implant",
      offers: [
        {
          clinicName: "Hospitadent Mecidiyeköy",
          treatmentName: "Dental Implant",
          priceMin: 399,
          priceMax: 399,
          currency: "EUR",
        },
      ],
      customMessage: "Phase 3B staging certification email — synthetic only.",
      footerBrand: brand.footerBrand,
    });
    const from = brand.fromHeader;
    const replyTo = brand.replyTo;
    const subject = content.subject;
    const headersOk =
      from === "FeelinHealthy <noreply@clinicbridge-ai.com>" &&
      replyTo === "staging-cert+feelinhealthy@clinicbridge.invalid" &&
      /FeelinHealthy/i.test(subject) &&
      !/FeelinHealthy · ClinicBridge AI/.test(content.html);

    // Skip second send if CERT_SKIP_EMAIL=1; otherwise send once
    let messageId = "";
    let sendOk = false;
    let sendError = "";
    if (process.env.CERT_SKIP_EMAIL === "1") {
      sendOk = true;
      messageId = "SKIPPED_PRIOR_DRY_RUN";
    } else {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const result = await resend.emails.send({
        from,
        to: TEST_INBOX,
        replyTo: replyTo!,
        subject: `[Phase3B] ${subject}`,
        html: content.html,
        text: content.text,
      });
      if (result.error) {
        sendError = result.error.message || String(result.error);
        sendOk = false;
      } else {
        sendOk = true;
        messageId = result.data?.id || "";
      }
    }
    results.email = {
      headersOk,
      from,
      replyTo,
      to: TEST_INBOX,
      subject: `[Phase3B] ${subject}`,
      sendOk,
      messageId,
      sendError: sendError || null,
      pass: headersOk && sendOk,
    };
    if (!results.email.pass) failHint("Replay10 email certification failed");
    console.log("EMAIL=", JSON.stringify(results.email));
  }

  // ── Duplicate message trace (API-level rapid double submit) ──
  {
    let ctx: any = newSession("dup");
    ctx = (await acceptConsent(ctx)).ctx;
    const msg = "Diş temizliği hakkında bilgi verir misiniz?";
    const p1 = postChat(ctx, { label: "dup_a", message: msg });
    const p2 = postChat(ctx, { label: "dup_b", message: msg });
    const [a, b] = await Promise.all([p1, p2]);
    results.duplicate = {
      method: "parallel_double_POST_same_message",
      posts: 2,
      bothOk: a.ok && b.ok,
      repliesEqual: (a.reply || "") === (b.reply || ""),
      note: "API parallel posts both execute; browser idempotency is separate (demo actionId guards). Classify: API accepts concurrent posts — UI must coalesce.",
      severity: "observe",
    };
    console.log("DUP=", JSON.stringify(results.duplicate));
  }

  // ── Clinic selection trace ──
  {
    let ctx: any = newSession("sel");
    ctx = (await acceptConsent(ctx)).ctx;
    // seed recommended set
    ctx.lastRecommendedClinicIds = [
      FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentMecidiyekoy,
      FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema,
    ];
    ctx.selectedClinicIds = [];
    ctx.quoteConsent = true;
    const id1 = FEELINHEALTHY_PRODUCTION_CLINIC_IDS.hospitadentMecidiyekoy;
    const id2 = FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema;
    const s1 = await postChat(ctx, {
      label: "sel_1",
      action: { action: "select_clinic", clinicId: id1, actionId: `a1_${Date.now()}`, locale: "tr" },
    });
    ctx = s1.ctx;
    const after1 = [...(ctx.selectedClinicIds || [])];
    const s2 = await postChat(ctx, {
      label: "sel_2",
      action: { action: "select_clinic", clinicId: id2, actionId: `a2_${Date.now()}`, locale: "tr" },
    });
    ctx = s2.ctx;
    const after2 = [...(ctx.selectedClinicIds || [])];
    // rapid double-click same clinic actionId distinct
    const t = Date.now();
    const d1 = postChat(ctx, {
      label: "sel_double_a",
      action: { action: "select_clinic", clinicId: id1, actionId: `dup_${t}_a`, locale: "tr" },
    });
    const d2 = postChat(ctx, {
      label: "sel_double_b",
      action: { action: "select_clinic", clinicId: id1, actionId: `dup_${t}_b`, locale: "tr" },
    });
    const [x, y] = await Promise.all([d1, d2]);
    const finalIds = [...new Set([...(x.ctx.selectedClinicIds || []), ...(y.ctx.selectedClinicIds || [])])];
    results.selection = {
      after1,
      after2,
      count1: after1.length,
      count2: after2.length,
      neverExceeds2: after2.length <= 2 && finalIds.length <= 2,
      rapidDoubleFinalUnique: finalIds.length,
      pass: after1.length === 1 && after2.length === 2 && after2.length <= 2,
    };
    if (!results.selection.pass) failHint("Clinic selection trace failed");
    console.log("SEL=", JSON.stringify(results.selection));
  }

  // ── Error taxonomy (soft checks via unknown treatment / empty) ──
  {
    let ctx: any = newSession("err");
    ctx = (await acceptConsent(ctx)).ctx;
    const unk = await postChat(ctx, {
      label: "err_unknown",
      message: "asdfqwerty zxcvbn tedavi",
    });
    const techLeak = /teknik sorun|partner clinic not found|stack|firestore/i.test(unk.reply || "");
    results.errors = {
      unknownReplyPreview: (unk.reply || "").slice(0, 240),
      techLeak,
      pass: unk.ok && !techLeak,
    };
    if (!results.errors.pass) failHint("Error taxonomy leaked technical copy");
    console.log("ERR=", JSON.stringify(results.errors));
  }

  // Perf summary
  const totals = results.perf.map((p: any) => Number(p.totalMs || p.wallMs || 0)).filter((n: number) => n > 0).sort((a: number, b: number) => a - b);
  const pct = (arr: number[], p: number) =>
    arr.length ? arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : null;
  results.perfSummary = {
    sampleCount: totals.length,
    p50: pct(totals, 50),
    p95: pct(totals, 95),
    max: totals.length ? totals[totals.length - 1] : null,
    blockerOver10s: totals.filter((n: number) => n > 10000).length,
    samples: results.perf.map((p: any) => ({
      label: p.label,
      totalMs: p.totalMs || p.wallMs,
      openAiTotalMs: p.openAiTotalMs ?? p.trace?.openAiTotalMs ?? null,
    })),
  };
  if (results.perfSummary.blockerOver10s > 0) {
    failHint(`Latency samples >10s: ${results.perfSummary.blockerOver10s}`);
  }

  const after = await dbCounts(db);
  results.db.after = after;
  results.db.delta = {
    leads: after.leads - before.leads,
    quotes: after.quotes - before.quotes,
    conversations: after.conversations - before.conversations,
  };

  const blockers = results.decisionHints;
  results.executive =
    blockers.length === 0
      ? "CONDITIONAL_GO_PENDING_BROWSER_TRACES"
      : "NO-GO";

  console.log("\n=== CERT JSON SUMMARY ===");
  console.log(JSON.stringify({
    safety: results.safety,
    replays: Object.fromEntries(
      Object.entries(results.replays).map(([k, v]: any) => [k, { pass: v.pass ?? v.passInfo ?? null, ...v }])
    ),
    email: results.email,
    duplicate: results.duplicate,
    selection: results.selection,
    errors: results.errors,
    perfSummary: results.perfSummary,
    db: results.db,
    decisionHints: blockers,
    executive: results.executive,
  }, null, 2));
}

main().catch((e) => {
  console.error("CERT_FATAL", e instanceof Error ? e.message : e);
  process.exit(1);
});
