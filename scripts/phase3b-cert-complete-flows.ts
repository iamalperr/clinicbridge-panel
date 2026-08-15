/**
 * Phase 3B focused completion: full intake → match → select → quote → post-quote.
 * Loads ONLY .env.staging. Requires Next on CERT_BASE_URL with staging env.
 */
import {
  loadAndAssertStagingEnv,
  STAGING_PROJECT_ID,
  PRODUCTION_PROJECT_ID,
} from "./lib/stagingFirebaseEnv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import {
  FEELINHEALTHY_PRODUCTION_CLINIC_IDS,
  FEELINHEALTHY_CONFIG,
  getCuratedClinicsForFeelinHealthy,
} from "../lib/agency/feelinhealthyConfig";

const BASE = process.env.CERT_BASE_URL || "http://127.0.0.1:3000";
const SLUG = "feelinhealthy";
const TEST_INBOX = "info@clinicbridge-ai.com";
const CONSENT_VERSION = "1.0";

const hints: string[] = [];
const report: Record<string, any> = { replays: {}, selection: {}, db: {}, perf: [] };

function fail(msg: string) {
  hints.push(msg);
  console.error("FAIL:", msg);
}

async function post(sessionContext: any, body: any, label: string) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/public/agency/${SLUG}/matching-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionContext, history: body.history || [], ...body }),
  });
  const wallMs = Date.now() - t0;
  const data = await res.json().catch(() => ({}));
  report.perf.push({
    label,
    wallMs,
    totalMs: data.trace?.totalMs ?? wallMs,
    openAiTotalMs: data.trace?.openAiTotalMs ?? null,
    trace: data.trace || null,
  });
  return {
    ok: res.ok,
    status: res.status,
    type: data.type,
    reply: typeof data.reply === "string" ? data.reply : JSON.stringify(data.reply || "").slice(0, 400),
    followUpReplies: data.followUpReplies || [],
    clinics: data.clinics || data.recommendations || data.clinicCards || null,
    ctx: data.sessionContext || sessionContext,
    trace: data.trace,
    leadId: data.leadId,
    quoteId: data.quoteId,
    raw: data,
  };
}

function completeIntakeSeed(ctx: any, extras: Record<string, any> = {}) {
  return {
    ...ctx,
    quoteConsent: true,
    patientName: "Staging Certification Patient",
    patientAge: 34,
    patientGender: "Kadın",
    patientEmail: TEST_INBOX,
    patientEmailStatus: "verified_format",
    patientPhone: "+905551112233",
    patientCountry: "Almanya",
    travelDate: "2026-10-15",
    ...extras,
  };
}

function summarize(ctx: any) {
  return {
    sessionId: ctx.sessionId,
    selectedCity: ctx.selectedCity || null,
    istanbul_side: ctx.istanbul_side || null,
    lastTreatmentCategory: ctx.lastTreatmentCategory || null,
    leadId: ctx.leadId || null,
    quoteId: ctx.quoteId || null,
    quoteRequestLocked: ctx.quoteRequestLocked ?? null,
    selectedClinicIds: ctx.selectedClinicIds || [],
    lastRecommendedClinicIds: ctx.lastRecommendedClinicIds || [],
    leadStage: ctx.leadStage || null,
    postQuoteRematchRequested: ctx.postQuoteRematchRequested ?? null,
    postQuoteMembershipMessageSent: ctx.postQuoteMembershipMessageSent ?? null,
  };
}

async function acceptConsent(ctx: any, locale = "tr") {
  return post(
    ctx,
    {
      action: {
        type: "privacy_consent_response",
        action: "accept",
        consentVersion: CONSENT_VERSION,
        locale,
      },
    },
    `consent_${locale}`
  );
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

async function driveToRecommendations(opts: {
  label: string;
  treatmentMsg: string;
  city?: string;
  side?: "anatolian" | "european";
  locale?: string;
}) {
  const locale = opts.locale || "tr";
  let ctx: any = { sessionId: `cert2_${Date.now()}_${opts.label}` };
  ctx = (await acceptConsent(ctx, locale)).ctx;
  let r = await post(ctx, { message: opts.treatmentMsg }, `${opts.label}_treatment`);
  ctx = r.ctx;

  if (opts.city && !String(ctx.selectedCity || "").toLowerCase().includes(opts.city)) {
    r = await post(
      ctx,
      {
        action: {
          type: "select_treatment_city",
          city: opts.city,
          value: opts.city,
          locale,
          actionId: `city_${opts.label}_${Date.now()}`,
        },
      },
      `${opts.label}_city`
    );
    ctx = r.ctx;
  }

  if (opts.side && ctx.istanbul_side !== opts.side) {
    r = await post(
      ctx,
      {
        action: {
          type: "side_selection",
          side: opts.side,
          locale,
          actionId: `side_${opts.label}_${Date.now()}`,
        },
      },
      `${opts.label}_side`
    );
    ctx = r.ctx;
  }

  // Seed complete intake (client session pattern used by demo) then trigger match.
  ctx = completeIntakeSeed(ctx, {
    selectedCity: ctx.selectedCity || opts.city,
    istanbul_side: ctx.istanbul_side || opts.side || null,
  });

  r = await post(
    ctx,
    {
      message:
        locale === "en"
          ? "Please show suitable clinics for me now."
          : "Uygun klinikleri şimdi göster lütfen.",
    },
    `${opts.label}_match`
  );
  ctx = r.ctx;

  // One more nudge if still empty
  if (!(ctx.lastRecommendedClinicIds || []).length) {
    r = await post(
      ctx,
      {
        message:
          locale === "en" ? "Show clinic recommendations." : "Klinik önerilerini getir.",
      },
      `${opts.label}_match2`
    );
    ctx = r.ctx;
  }

  return { ctx, last: r };
}

async function main() {
  console.log("=== PHASE 3B COMPLETE-FLOWS CERT ===");
  loadAndAssertStagingEnv();
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, "base64").toString("utf8")
  );
  if (sa.project_id !== STAGING_PROJECT_ID) throw new Error("SA not staging");
  if (!getApps().length) initializeApp({ credential: cert(sa), projectId: STAGING_PROJECT_ID });
  const connected = getApps()[0]?.options?.projectId;
  if (connected === PRODUCTION_PROJECT_ID) throw new Error("production targeted");
  console.log("safety_ok", connected);

  const db = getFirestore();
  report.db.before = await dbCounts(db);
  console.log("db_before", report.db.before);

  // ── R1 matching after Anadolu side (aesthetic) ──
  {
    const { ctx, last } = await driveToRecommendations({
      label: "r1m",
      treatmentMsg: "Burun estetiği (rinoplasti) yaptırmak istiyorum, İstanbul tercih ediyorum.",
      city: "istanbul",
      side: "anatolian",
    });
    const rec = ctx.lastRecommendedClinicIds || [];
    const orion = FEELINHEALTHY_PRODUCTION_CLINIC_IDS.orionSurgeryCenter;
    const intermed = FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi;
    report.replays.r1_match = {
      recommended: rec,
      orionShown: rec.includes(orion),
      intermedShown: rec.includes(intermed),
      city: ctx.selectedCity,
      side: ctx.istanbul_side,
      replyPreview: (last.reply || "").slice(0, 220),
      pass:
        rec.length > 0 &&
        rec.length <= FEELINHEALTHY_CONFIG.maxGuestClinics &&
        !rec.includes(intermed) &&
        String(ctx.selectedCity || "").toLowerCase().includes("istanbul") &&
        ctx.istanbul_side === "anatolian",
    };
    if (!report.replays.r1_match.pass) fail("R1 matching after Anadolu side failed");
    console.log("R1_MATCH", JSON.stringify(report.replays.r1_match));
  }

  // ── R3 dental Avrupa ──
  {
    const { ctx } = await driveToRecommendations({
      label: "r3m",
      treatmentMsg: "Diş implantı için İstanbul tercih ediyorum.",
      city: "istanbul",
      side: "european",
    });
    const rec = ctx.lastRecommendedClinicIds || [];
    const intermed = FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi;
    report.replays.r3_match = {
      recommended: rec,
      maxOk: rec.length <= FEELINHEALTHY_CONFIG.maxGuestClinics,
      intermedAbsent: !rec.includes(intermed),
      side: ctx.istanbul_side,
      city: ctx.selectedCity,
      pass:
        rec.length > 0 &&
        rec.length <= 2 &&
        !rec.includes(intermed) &&
        ctx.istanbul_side === "european",
    };
    if (!report.replays.r3_match.pass) fail("R3 dental Avrupa matching failed");
    console.log("R3_MATCH", JSON.stringify(report.replays.r3_match));
  }

  // ── R4–R7 quote + post-quote ──
  {
    const beforeQuote = await dbCounts(db);
    const driven = await driveToRecommendations({
      label: "r4q",
      treatmentMsg: "Diş implantı istiyorum, İstanbul Avrupa Yakası.",
      city: "istanbul",
      side: "european",
    });
    let ctx = driven.ctx;
    const rec = [...(ctx.lastRecommendedClinicIds || [])].slice(0, 2);
    if (rec.length === 0) {
      fail("R4 no recommendations — cannot quote");
      report.replays.r4 = { pass: false, recommended: [] };
    } else {
      // Selection panel: 0→1→2→1
      let s = await post(
        ctx,
        {
          action: {
            type: "clinic_selection_update",
            action: "select",
            clinicId: rec[0],
            clinicName: rec[0],
            locale: "tr",
          },
        },
        "sel_1"
      );
      ctx = s.ctx;
      const after1 = [...(ctx.selectedClinicIds || [])];
      s = await post(
        ctx,
        {
          action: {
            type: "clinic_selection_update",
            action: "select",
            clinicId: rec[1] || rec[0],
            clinicName: rec[1] || rec[0],
            locale: "tr",
          },
        },
        "sel_2"
      );
      ctx = s.ctx;
      const after2 = [...(ctx.selectedClinicIds || [])];
      s = await post(
        ctx,
        {
          action: {
            type: "clinic_selection_update",
            action: "deselect",
            clinicId: after2[0],
            clinicName: after2[0],
            locale: "tr",
          },
        },
        "sel_deselect"
      );
      ctx = s.ctx;
      const afterDeselect = [...(ctx.selectedClinicIds || [])];
      // reselect both for quote
      for (const id of rec) {
        s = await post(
          ctx,
          {
            action: {
              type: "clinic_selection_update",
              action: "select",
              clinicId: id,
              clinicName: id,
              locale: "tr",
            },
          },
          `resel_${id}`
        );
        ctx = s.ctx;
      }

      // rapid double select same clinic
      const t = Date.now();
      const [d1, d2] = await Promise.all([
        post(
          ctx,
          {
            action: {
              type: "clinic_selection_update",
              action: "select",
              clinicId: rec[0],
              clinicName: rec[0],
              locale: "tr",
              actionId: `rapid_${t}_a`,
            },
          },
          "rapid_a"
        ),
        post(
          { ...ctx },
          {
            action: {
              type: "clinic_selection_update",
              action: "select",
              clinicId: rec[0],
              clinicName: rec[0],
              locale: "tr",
              actionId: `rapid_${t}_b`,
            },
          },
          "rapid_b"
        ),
      ]);
      const rapidMax = Math.max(
        (d1.ctx.selectedClinicIds || []).length,
        (d2.ctx.selectedClinicIds || []).length
      );
      ctx = d1.ctx.selectedClinicIds?.length >= (d2.ctx.selectedClinicIds || []).length ? d1.ctx : d2.ctx;

      report.selection = {
        after1,
        after2,
        afterDeselect,
        count1: after1.length,
        count2: after2.length,
        countDeselect: afterDeselect.length,
        neverExceeds2: after2.length <= 2 && rapidMax <= 2,
        pass:
          after1.length === 1 &&
          after2.length === Math.min(2, rec.length) &&
          afterDeselect.length === Math.min(2, rec.length) - 1 &&
          rapidMax <= 2,
      };
      if (!report.selection.pass) fail("Clinic selection panel trace failed");
      console.log("SEL", JSON.stringify(report.selection));

      // Complete selection + request quote
      s = await post(
        ctx,
        {
          action: {
            type: "clinic_selection_complete",
            locale: "tr",
            recommendedClinicIds: rec,
          },
        },
        "sel_complete"
      );
      ctx = s.ctx;

      if (!ctx.quoteId) {
        s = await post(
          ctx,
          {
            action: {
              action: "request_quote",
              clinicId: rec[0],
              clinicName: rec[0],
              actionId: `quote_${Date.now()}`,
              locale: "tr",
            },
          },
          "request_quote"
        );
        ctx = s.ctx;
      }

      const afterQuote = await dbCounts(db);
      const membershipText = [
        s.reply,
        ...(s.followUpReplies || []).map((f: any) => f.text || f.content || ""),
      ].join("\n");
      const membershipOnce =
        Boolean(ctx.postQuoteMembershipMessageSent) ||
        /en fazla\s*2|üyelik|karşılaştır|ücretsiz üye/i.test(membershipText);
      const leadDelta = afterQuote.leads - beforeQuote.leads;
      const quoteDelta = afterQuote.quotes - beforeQuote.quotes;

      report.replays.r4 = {
        beforeQuote,
        afterQuote,
        leadDelta,
        quoteDelta,
        leadId: ctx.leadId || s.leadId,
        quoteId: ctx.quoteId || s.quoteId,
        membershipOnce,
        membershipPreview: membershipText.slice(0, 280),
        replyPreview: (s.reply || "").slice(0, 280),
        ctx: summarize(ctx),
        pass:
          leadDelta === 1 &&
          quoteDelta === 1 &&
          Boolean(ctx.quoteId || s.quoteId) &&
          Boolean(ctx.leadId || s.leadId) &&
          membershipOnce,
      };
      if (!report.replays.r4.pass) fail("R4 quote success criteria failed");
      console.log("R4", JSON.stringify(report.replays.r4));

      // R5 post-quote Q&A
      const before5 = {
        leadId: ctx.leadId,
        quoteId: ctx.quoteId,
        selectedClinicIds: [...(ctx.selectedClinicIds || [])],
        city: ctx.selectedCity,
        membership: ctx.postQuoteMembershipMessageSent,
      };
      s = await post(
        ctx,
        { message: "Kaç günlük bir operasyon olacak?" },
        "r5_info"
      );
      ctx = s.ctx;
      const mid = await dbCounts(db);
      report.replays.r5 = {
        before: before5,
        after: summarize(ctx),
        replyPreview: (s.reply || "").slice(0, 280),
        sameLead: before5.leadId === ctx.leadId,
        sameQuote: before5.quoteId === ctx.quoteId,
        membershipNotRepeated: !/ücretsiz üye|en fazla\s*2 klinik/i.test(s.reply || ""),
        pass:
          before5.leadId === ctx.leadId &&
          before5.quoteId === ctx.quoteId &&
          before5.city === ctx.selectedCity &&
          mid.quotes === afterQuote.quotes &&
          mid.leads === afterQuote.leads,
      };
      if (!report.replays.r5.pass) fail("R5 post-quote Q&A mutated quote/lead");
      console.log("R5", JSON.stringify(report.replays.r5));

      // R6 rematch
      const before6 = { leadId: ctx.leadId, quoteId: ctx.quoteId };
      s = await post(ctx, { message: "Başka klinik görmek istiyorum." }, "r6_rematch");
      ctx = s.ctx;
      const after6db = await dbCounts(db);
      report.replays.r6 = {
        before: before6,
        after: summarize(ctx),
        replyPreview: (s.reply || "").slice(0, 280),
        sameLead: before6.leadId === ctx.leadId,
        sameQuote: before6.quoteId === ctx.quoteId,
        noNewQuote: after6db.quotes === afterQuote.quotes,
        noNewLead: after6db.leads === afterQuote.leads,
        rematchAvailable:
          ctx.postQuoteRematchRequested === true ||
          (ctx.lastRecommendedClinicIds || []).length > 0 ||
          /klinik|öner|şehir|yakası/i.test(s.reply || ""),
        pass:
          before6.leadId === ctx.leadId &&
          before6.quoteId === ctx.quoteId &&
          after6db.quotes === afterQuote.quotes &&
          after6db.leads === afterQuote.leads,
      };
      if (!report.replays.r6.pass) fail("R6 rematch created new lead/quote");
      console.log("R6", JSON.stringify(report.replays.r6));

      // R7 location change
      const before7 = { leadId: ctx.leadId, quoteId: ctx.quoteId };
      s = await post(
        ctx,
        { message: "Antalya yerine İstanbul tercih ediyorum." },
        "r7_loc"
      );
      ctx = s.ctx;
      const after7db = await dbCounts(db);
      report.replays.r7 = {
        before: before7,
        after: summarize(ctx),
        replyPreview: (s.reply || "").slice(0, 280),
        sameLead: before7.leadId === ctx.leadId,
        sameQuote: before7.quoteId === ctx.quoteId,
        noNewQuote: after7db.quotes === afterQuote.quotes,
        cityIstanbul:
          String(ctx.selectedCity || "").toLowerCase().includes("istanbul") ||
          /istanbul|yakası|side/i.test(s.reply || ""),
        pass:
          before7.leadId === ctx.leadId &&
          before7.quoteId === ctx.quoteId &&
          after7db.quotes === afterQuote.quotes &&
          after7db.leads === afterQuote.leads,
      };
      if (!report.replays.r7.pass) fail("R7 location change created new lead/quote");
      console.log("R7", JSON.stringify(report.replays.r7));
    }
  }

  // ── R8 Intermed live aesthetic Avrupa ──
  {
    const clinicsSnap = await db.collection("agencies").doc("feelinhealthy").collection("clinics").get();
    const clinics = clinicsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const curated = getCuratedClinicsForFeelinHealthy(
      "aesthetic_surgery",
      "istanbul",
      "european",
      clinics
    );
    const curatedIds = curated.matchingCuratedClinics.map((c: any) => c.id);
    const { ctx } = await driveToRecommendations({
      label: "r8m",
      treatmentMsg: "Rinoplasti için İstanbul Avrupa Yakası istiyorum.",
      city: "istanbul",
      side: "european",
    });
    const live = ctx.lastRecommendedClinicIds || [];
    const intermed = FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi;
    const bht = FEELINHEALTHY_PRODUCTION_CLINIC_IDS.bhtClinicIstanbulTema;
    report.replays.r8 = {
      curatedIds,
      liveRecommended: live,
      intermedInCurated: curatedIds.includes(intermed),
      intermedInLive: live.includes(intermed),
      intermedActive: clinics.some(
        (c: any) => c.id === intermed && String(c.status).toLowerCase() === "active"
      ),
      bhtPresent: curatedIds.includes(bht) || live.includes(bht),
      liveRan: live.length > 0,
      pass: live.length > 0 && !live.includes(intermed) && !curatedIds.includes(intermed),
    };
    if (!report.replays.r8.pass) fail("R8 Intermed live exclusion failed");
    console.log("R8", JSON.stringify(report.replays.r8));
  }

  report.db.after = await dbCounts(db);
  report.db.delta = {
    leads: report.db.after.leads - report.db.before.leads,
    quotes: report.db.after.quotes - report.db.before.quotes,
    conversations: report.db.after.conversations - report.db.before.conversations,
  };

  const totals = report.perf
    .map((p: any) => Number(p.totalMs || p.wallMs || 0))
    .filter((n: number) => n > 0)
    .sort((a: number, b: number) => a - b);
  const pct = (arr: number[], p: number) =>
    arr.length ? arr[Math.min(arr.length - 1, Math.floor((p / 100) * arr.length))] : null;
  report.perfSummary = {
    sampleCount: totals.length,
    p50: pct(totals, 50),
    p95: pct(totals, 95),
    max: totals.at(-1) ?? null,
    blockerOver10s: totals.filter((n: number) => n > 10000).length,
  };

  report.decisionHints = hints;
  report.executive = hints.length === 0 ? "PASS_COMPLETE_FLOWS" : "NO-GO";

  console.log("\n=== COMPLETE-FLOWS JSON ===");
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error("CERT_FATAL", e instanceof Error ? e.message : e);
  process.exit(1);
});
