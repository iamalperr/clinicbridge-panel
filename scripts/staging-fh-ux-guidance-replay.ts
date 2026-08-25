/**
 * Staging replay: FeelinHealthy membership CTA + Istanbul unsure-side guidance.
 * Loads ONLY .env.staging. Does not target production.
 *
 * Usage:
 *   CERT_BASE_URL=http://localhost:3000 npx tsx scripts/staging-fh-ux-guidance-replay.ts
 */
import {
  loadAndAssertStagingEnv,
  STAGING_PROJECT_ID,
  PRODUCTION_PROJECT_ID,
} from "./lib/stagingFirebaseEnv";
import {
  applyStructuredLocationAction,
  resolveNextConversationAction,
  buildGateResponseFromAction,
} from "../lib/agency/feelinhealthyConversationMachine";
import {
  getOnSiteMembershipGuidance,
  isMembershipHowToIntent,
} from "../lib/agency/feelinhealthyClinicCardActions";
import {
  getSideGuidancePrompt,
  resolveIstanbulSideFromText,
} from "../lib/agency/feelinhealthyConfig";

const BASE = (process.env.CERT_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");

async function tryLiveMembership(): Promise<Record<string, unknown>> {
  if (!BASE) {
    return { skipped: true, reason: "CERT_BASE_URL not set — logic-only replay" };
  }
  const body = {
    message: "Üye olmak için ne yapmalıyım?",
    sessionContext: {
      sessionId: `sess_ux_membership_${Date.now()}`,
      quoteConsent: true,
      language: "tr",
      patientName: "Staging UX",
      firstName: "Staging",
      lastName: "UX",
      patientGender: "Kadın",
      patientAge: 30,
      patientEmail: "staging-ux@clinicbridge.invalid",
      patientPhone: "+900000000001",
      patientCountry: "TR",
      travelDate: "2026-10-01",
    },
    locale: "tr",
  };
  const res = await fetch(`${BASE}/api/public/agency/feelinhealthy/matching-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  const reply = String(data.reply || "");
  return {
    status: res.status,
    replyPreview: reply.slice(0, 240),
    hasKayitOl: /Kayıt Ol/i.test(reply),
    noWebsiteRedirect: !/web sitesine gidip|feelinhealthy\.com\/register/i.test(reply),
    pass: res.ok && /Kayıt Ol/i.test(reply) && !/web sitesine gidip/i.test(reply),
  };
}

function logicReplay() {
  const membershipMsg = "Üye olmak için ne yapmalıyım?";
  const membership = {
    detected: isMembershipHowToIntent(membershipMsg),
    reply: getOnSiteMembershipGuidance({ locale: "tr" }),
  };

  const unsure = applyStructuredLocationAction(
    {
      quoteConsent: true,
      patientName: "Staging UX",
      firstName: "Staging",
      lastName: "UX",
      patientGender: "Kadın",
      patientAge: 30,
      patientEmail: "staging-ux@clinicbridge.invalid",
      patientPhone: "+900000000001",
      patientCountry: "TR",
      travelDate: "2026-10-01",
      lastTreatmentCategory: "hair_transplant",
      selectedCity: "istanbul",
      locationSelectionConfirmed: true,
    },
    { type: "side_selection", side: "unsure", actionId: `unsure_${Date.now()}` }
  );
  const next = resolveNextConversationAction(unsure.ctx, {
    locale: "tr",
    isStructuredAction: true,
  });
  const gate = buildGateResponseFromAction(next, unsure.ctx as any);

  const saw = resolveIstanbulSideFromText("Sabiha Gökçen'e ineceğim.");
  const ist = resolveIstanbulSideFromText(
    "İstanbul Havalimanı’na geleceğim, Şişli’de kalacağım."
  );

  return {
    membership: {
      detected: membership.detected,
      hasKayitOl: /Kayıt Ol/i.test(membership.reply),
      noWebsiteRedirect: !/web sitesine/i.test(membership.reply),
      pass: membership.detected && /Kayıt Ol/i.test(membership.reply),
    },
    unsure: {
      city: unsure.ctx.selectedCity,
      side: unsure.ctx.istanbul_side,
      pendingSideGuidance: unsure.ctx.pendingSideGuidance,
      nextKind: next.kind,
      hasSideCard: Boolean(gate?.sideClarificationCard),
      replyPreview: String(gate?.reply || "").slice(0, 200),
      pass:
        unsure.ctx.selectedCity === "istanbul" &&
        next.kind === "side_guidance" &&
        !gate?.sideClarificationCard,
    },
    saw: {
      side: saw.side,
      prompt: getSideGuidancePrompt(saw.cueName || "sabiha", "tr").slice(0, 160),
      pass: saw.side === "anatolian",
    },
    istSisli: {
      side: ist.side,
      prompt: getSideGuidancePrompt(ist.cueName || "sisli", "tr").slice(0, 160),
      pass: ist.side === "european",
    },
  };
}

async function main() {
  console.log("=== STAGING FH UX GUIDANCE REPLAY ===");
  loadAndAssertStagingEnv();
  if (process.env.FIREBASE_PROJECT_ID === PRODUCTION_PROJECT_ID) {
    throw new Error("Refusing production");
  }
  console.log("project=", STAGING_PROJECT_ID);

  const logic = logicReplay();
  console.log("logic=", JSON.stringify(logic, null, 2));

  const live = await tryLiveMembership().catch((e) => ({
    pass: false,
    error: String(e),
  }));
  console.log("liveMembership=", JSON.stringify(live, null, 2));

  const pass =
    logic.membership.pass &&
    logic.unsure.pass &&
    logic.saw.pass &&
    logic.istSisli.pass &&
    (live as any).skipped === true
      ? true
      : Boolean((live as any).pass !== false && logic.membership.pass);

  // Logic scenarios are required; live API is optional enhancement.
  const requiredPass =
    logic.membership.pass && logic.unsure.pass && logic.saw.pass && logic.istSisli.pass;

  if (!requiredPass) {
    console.error("FEELINHEALTHY UX GUIDANCE STAGING FAIL");
    process.exit(1);
  }
  console.log("FEELINHEALTHY UX GUIDANCE STAGING PASS");
  void pass;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
