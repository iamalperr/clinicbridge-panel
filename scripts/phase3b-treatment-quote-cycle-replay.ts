/**
 * Staging live replay: Rhinoplasty quote → Implant quote → back to Rhinoplasty.
 * Loads ONLY .env.staging for Admin. Requires Next on CERT_BASE_URL with staging env.
 */
import {
  loadAndAssertStagingEnv,
  STAGING_PROJECT_ID,
  PRODUCTION_PROJECT_ID,
} from "./lib/stagingFirebaseEnv";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FEELINHEALTHY_PRODUCTION_CLINIC_IDS } from "../lib/agency/feelinhealthyConfig";
import { isQuoteRequestLocked } from "../lib/agency/feelinhealthyQuotePrefill";
import {
  hasCompletedQuoteForTreatment,
  resolveTreatmentQuoteKey,
} from "../lib/agency/treatmentQuoteCycle";

const BASE = process.env.CERT_BASE_URL || "http://127.0.0.1:3000";
const SLUG = "feelinhealthy";
const TEST_INBOX = "info@clinicbridge-ai.com";
const CONSENT_VERSION = "1.0";

async function post(sessionContext: any, body: any, label: string) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/public/agency/${SLUG}/matching-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionContext, history: [], ...body }),
  });
  const data = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    status: res.status,
    label,
    wallMs: Date.now() - t0,
    type: data.type,
    reply: String(data.reply || "").slice(0, 240),
    ctx: data.sessionContext || sessionContext,
    leadId: data.leadId,
    quoteId: data.quoteId,
  };
}

function seedIntake(ctx: any, extras: Record<string, any> = {}) {
  return {
    ...ctx,
    quoteConsent: true,
    patientName: "Staging Quote Cycle Patient",
    patientAge: 36,
    patientGender: "Kadın",
    patientEmail: TEST_INBOX,
    patientEmailStatus: "verified_format",
    patientPhone: "+905551114455",
    patientCountry: "Almanya",
    travelDate: "2026-11-20",
    ...extras,
  };
}

async function acceptConsent(ctx: any) {
  return post(ctx, {
    action: {
      type: "privacy_consent_response",
      action: "accept",
      consentVersion: CONSENT_VERSION,
      locale: "tr",
    },
  }, "consent");
}

async function driveMatch(ctx: any, treatmentMsg: string, side?: "anatolian" | "european") {
  let r = await post(ctx, { message: treatmentMsg }, "treatment");
  ctx = r.ctx;
  if (!ctx.selectedCity && /istanbul|İstanbul/i.test(treatmentMsg)) {
    r = await post(ctx, {
      action: {
        type: "select_treatment_city",
        city: "istanbul",
        value: "istanbul",
        locale: "tr",
        actionId: `city_${Date.now()}`,
      },
    }, "city");
    ctx = r.ctx;
  }
  if (side && ctx.istanbul_side !== side) {
    r = await post(ctx, {
      action: { type: "side_selection", side, locale: "tr", actionId: `side_${Date.now()}` },
    }, "side");
    ctx = r.ctx;
  }
  ctx = seedIntake(ctx, {
    selectedCity: ctx.selectedCity || "istanbul",
    istanbul_side: ctx.istanbul_side || side || null,
    lastTreatmentCategory: ctx.lastTreatmentCategory,
  });
  r = await post(ctx, { message: "Uygun klinikleri şimdi göster lütfen." }, "match");
  ctx = r.ctx;
  if (!(ctx.lastRecommendedClinicIds || []).length) {
    r = await post(ctx, { message: "Klinik önerilerini getir." }, "match2");
    ctx = r.ctx;
  }
  return ctx;
}

async function selectAndQuote(ctx: any) {
  const rec = [...(ctx.lastRecommendedClinicIds || [])].slice(0, 2);
  if (!rec.length) throw new Error("no recommendations");
  for (const id of rec) {
    const r = await post(ctx, {
      action: {
        type: "clinic_selection_update",
        action: "select",
        clinicId: id,
        clinicName: id,
        locale: "tr",
      },
    }, `sel_${id}`);
    ctx = r.ctx;
  }
  let r = await post(ctx, {
    action: {
      type: "clinic_selection_complete",
      locale: "tr",
      recommendedClinicIds: rec,
    },
  }, "complete");
  ctx = r.ctx;
  if (!ctx.quoteId) {
    r = await post(ctx, {
      action: {
        action: "request_quote",
        clinicId: rec[0],
        clinicName: rec[0],
        actionId: `quote_${Date.now()}`,
        locale: "tr",
      },
    }, "request_quote");
    ctx = r.ctx;
  }
  return { ctx, rec, quoteId: ctx.quoteId || r.quoteId, leadId: ctx.leadId || r.leadId };
}

async function dbCounts(db: ReturnType<typeof getFirestore>) {
  const agency = db.collection("agencies").doc("feelinhealthy");
  const [leads, quotes] = await Promise.all([
    agency.collection("leads").get(),
    agency.collection("quotes").get(),
  ]);
  return {
    leads: leads.size,
    quotes: quotes.size,
    quoteTreatments: quotes.docs.map((d) => ({
      id: d.id,
      treatmentCategory: d.data().treatmentCategory,
      treatmentCycleKey: d.data().treatmentCycleKey || null,
      conversationId: d.data().conversationId || null,
      leadId: d.data().leadId || null,
    })),
  };
}

async function main() {
  console.log("=== TREATMENT QUOTE CYCLE STAGING REPLAY ===");
  loadAndAssertStagingEnv();
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, "base64").toString("utf8")
  );
  if (sa.project_id !== STAGING_PROJECT_ID) throw new Error("not staging");
  if (!getApps().length) initializeApp({ credential: cert(sa), projectId: STAGING_PROJECT_ID });
  if (getApps()[0]?.options?.projectId === PRODUCTION_PROJECT_ID) throw new Error("prod");
  const db = getFirestore();
  const before = await dbCounts(db);
  const report: any = { before, steps: {}, pass: true, hints: [] as string[] };
  const fail = (m: string) => {
    report.pass = false;
    report.hints.push(m);
    console.error("FAIL", m);
  };

  let ctx: any = { sessionId: `tqcycle_${Date.now()}` };
  ctx = (await acceptConsent(ctx)).ctx;

  // 1–4 Rhinoplasty → quote
  ctx = await driveMatch(
    ctx,
    "Burun estetiği (rinoplasti) için İstanbul Avrupa Yakası istiyorum.",
    "european"
  );
  report.steps.rhinoMatch = {
    recommended: ctx.lastRecommendedClinicIds || [],
    intermedAbsent: !(ctx.lastRecommendedClinicIds || []).includes(
      FEELINHEALTHY_PRODUCTION_CLINIC_IDS.intermedNisantasi
    ),
    locked: isQuoteRequestLocked(ctx),
  };
  if (!(ctx.lastRecommendedClinicIds || []).length) fail("Rhino matching empty");

  const q1 = await selectAndQuote(ctx);
  ctx = q1.ctx;
  report.steps.rhinoQuote = {
    quoteId: q1.quoteId,
    leadId: q1.leadId,
    locked: isQuoteRequestLocked(ctx),
    map: ctx.quotesByTreatmentKey || null,
    treatmentKey: resolveTreatmentQuoteKey(ctx.lastTreatmentCategory),
  };
  if (!q1.quoteId) fail("Rhino quote missing");
  if (!isQuoteRequestLocked(ctx)) fail("Rhino CTA should be locked");

  // 5 Confirm locked for same treatment
  const lockedRetry = await post(ctx, {
    action: {
      action: "request_quote",
      clinicId: q1.rec[0],
      clinicName: q1.rec[0],
      actionId: `retry_${Date.now()}`,
      locale: "tr",
    },
  }, "rhino_retry");
  ctx = lockedRetry.ctx;
  report.steps.rhinoRetry = {
    status: lockedRetry.status,
    locked: isQuoteRequestLocked(ctx),
    quoteId: ctx.quoteId,
  };
  if (lockedRetry.status !== 409 && ctx.quoteId !== q1.quoteId) {
    // Some paths return 200 with already-registered copy
    if (!/zaten|already/i.test(lockedRetry.reply) && lockedRetry.status !== 409) {
      fail("Rhino retry should not create a new quote");
    }
  }

  // 6–8 Switch to Implant
  let r = await post(ctx, { message: "Diş implantı yaptırmak istiyorum." }, "switch_implant");
  ctx = r.ctx;
  if (ctx.istanbul_side !== "european") {
    r = await post(ctx, {
      action: { type: "side_selection", side: "european", locale: "tr", actionId: `side2_${Date.now()}` },
    }, "side2");
    ctx = r.ctx;
  }
  ctx = seedIntake(ctx, {
    selectedCity: "istanbul",
    istanbul_side: ctx.istanbul_side || "european",
    lastTreatmentCategory: ctx.lastTreatmentCategory || "implant",
  });
  r = await post(ctx, { message: "Uygun implant kliniklerini göster." }, "implant_match");
  ctx = r.ctx;
  report.steps.implantMatch = {
    treatment: ctx.lastTreatmentCategory,
    treatmentKey: resolveTreatmentQuoteKey(ctx.lastTreatmentCategory),
    recommended: ctx.lastRecommendedClinicIds || [],
    locked: isQuoteRequestLocked(ctx),
    hasAestheticQuote: hasCompletedQuoteForTreatment(ctx, "aesthetic_surgery"),
    hasDentalQuote: hasCompletedQuoteForTreatment(ctx, "dental"),
    map: ctx.quotesByTreatmentKey || null,
  };
  if (isQuoteRequestLocked(ctx)) fail("Implant CTA should be unlocked");
  if (!(ctx.lastRecommendedClinicIds || []).length) fail("Implant matching empty");

  // 9 Create Implant quote
  const q2 = await selectAndQuote(ctx);
  ctx = q2.ctx;
  report.steps.implantQuote = {
    quoteId: q2.quoteId,
    leadId: q2.leadId,
    locked: isQuoteRequestLocked(ctx),
    map: ctx.quotesByTreatmentKey || null,
    sameLead: q2.leadId === q1.leadId,
    distinctQuote: q2.quoteId !== q1.quoteId,
  };
  if (!q2.quoteId) fail("Implant quote missing");
  if (q2.quoteId === q1.quoteId) fail("Implant quote must be a new record");
  if (q2.leadId !== q1.leadId) fail("Expected same lead for both treatment quotes");

  // 11 Switch back to Rhinoplasty
  r = await post(ctx, { message: "Tekrar burun estetiği (rinoplasti) istiyorum." }, "back_rhino");
  ctx = r.ctx;
  report.steps.backRhino = {
    treatment: ctx.lastTreatmentCategory,
    treatmentKey: resolveTreatmentQuoteKey(ctx.lastTreatmentCategory),
    locked: isQuoteRequestLocked(ctx),
    quoteId: ctx.quoteId,
    map: ctx.quotesByTreatmentKey || null,
  };
  if (!isQuoteRequestLocked(ctx)) fail("Returning to Rhinoplasty should lock CTA");
  if (ctx.quoteId && ctx.quoteId !== q1.quoteId && ctx.quotesByTreatmentKey?.aesthetic_surgery?.quoteId !== q1.quoteId) {
    fail("Rhinoplasty historical quote not recognized");
  }

  // EN alias smoke (session fragment)
  const enKey = resolveTreatmentQuoteKey("rhinoplasty");
  const enAlias = resolveTreatmentQuoteKey("nose aesthetics");
  report.steps.enNorm = {
    rhinoplasty: enKey,
    // burun estetiği already covered; English rhinoplasty key:
    sameAsAesthetic: enKey === "aesthetic_surgery",
  };

  const after = await dbCounts(db);
  report.after = after;
  report.delta = {
    leads: after.leads - before.leads,
    quotes: after.quotes - before.quotes,
  };
  if (report.delta.quotes < 2) fail("Expected at least +2 quotes");
  if (report.delta.leads !== 1) fail(`Expected +1 lead, got ${report.delta.leads}`);

  console.log("\n=== REPLAY JSON ===");
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(2);
}

main().catch((e) => {
  console.error("REPLAY_FATAL", e instanceof Error ? e.message : e);
  process.exit(1);
});
