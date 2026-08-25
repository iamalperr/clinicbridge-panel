import { NextResponse } from "next/server";
import { AuthError, requireAgencyAccess } from "@/lib/services/apiAuth";
import { getAdminDb } from "@/lib/firebase-admin";
import { clearAgencyCache } from "@/lib/services/agencyCache";
import {
  FEELINHEALTHY_NEVER_RECOMMEND_CLINIC_IDS,
  MATCHING_RULE_SOURCE_UI,
  PLATFORM_MAX_RECOMMENDED_CLINICS,
  buildMatchingRuleId,
  isFeelinHealthyAgency,
  sanitizeMatchingClinicIds,
  type AgencyMatchingRule,
  type AgencyMatchingRuleSide,
} from "@/lib/agency/agencyMatchingRules";

export const dynamic = "force-dynamic";

/**
 * GET /api/agency/[agencyId]/matching-rules
 * List recommendation rules for the agency.
 */
export async function GET(
  req: Request,
  props: { params: Promise<{ agencyId: string }> }
) {
  try {
    const { agencyId } = await props.params;
    await requireAgencyAccess(req, agencyId);
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
    }

    const snap = await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("matchingRules")
      .get();

    const rules = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ ok: true, rules });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[matching-rules GET]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

/**
 * PUT /api/agency/[agencyId]/matching-rules
 * Upsert one recommendation rule. Invalidates agency matchingRules cache.
 *
 * Body: { treatmentBranch, city, side, clinicIds, enabled?, ruleId? }
 */
export async function PUT(
  req: Request,
  props: { params: Promise<{ agencyId: string }> }
) {
  try {
    const { agencyId } = await props.params;
    const { uid } = await requireAgencyAccess(req, agencyId);
    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json({ error: "DB_UNAVAILABLE" }, { status: 503 });
    }

    let body: {
      ruleId?: string;
      treatmentBranch?: string;
      city?: string;
      side?: string;
      clinicIds?: string[];
      enabled?: boolean;
      resetToLegacy?: boolean;
      legacyClinicIds?: string[];
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const treatmentBranch = String(body.treatmentBranch || "").trim();
    const city = String(body.city || "").trim().toLowerCase();
    const side = (String(body.side || "any").trim().toLowerCase() ||
      "any") as AgencyMatchingRuleSide;
    if (!treatmentBranch || !city) {
      return NextResponse.json(
        { error: "MISSING_FIELDS", message: "treatmentBranch and city are required" },
        { status: 400 }
      );
    }
    if (!["anatolian", "european", "any"].includes(side)) {
      return NextResponse.json({ error: "INVALID_SIDE" }, { status: 400 });
    }

    const isFH = isFeelinHealthyAgency({ agencyId });
    const exclude = isFH ? FEELINHEALTHY_NEVER_RECOMMEND_CLINIC_IDS : undefined;
    const clinicIds = sanitizeMatchingClinicIds(
      Array.isArray(body.clinicIds) ? body.clinicIds.map(String) : [],
      { max: PLATFORM_MAX_RECOMMENDED_CLINICS, excludeIds: exclude }
    );

    // Clinics must be linked + active on this agency
    if (clinicIds.length > 0) {
      const clinicSnaps = await Promise.all(
        clinicIds.map((id) =>
          adminDb.collection("agencies").doc(agencyId).collection("clinics").doc(id).get()
        )
      );
      for (let i = 0; i < clinicSnaps.length; i++) {
        const snap = clinicSnaps[i];
        if (!snap.exists) {
          return NextResponse.json(
            { error: "CLINIC_NOT_LINKED", clinicId: clinicIds[i] },
            { status: 400 }
          );
        }
        const status = String(snap.data()?.status || "active").toLowerCase();
        if (status !== "active") {
          return NextResponse.json(
            { error: "CLINIC_INACTIVE", clinicId: clinicIds[i] },
            { status: 400 }
          );
        }
      }
    }

    const ruleId =
      String(body.ruleId || "").trim() ||
      buildMatchingRuleId(treatmentBranch, city, side);
    const nowIso = new Date().toISOString();
    const ref = adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("matchingRules")
      .doc(ruleId);
    const existing = await ref.get();

    const rule: AgencyMatchingRule = {
      id: ruleId,
      agencyId,
      treatmentBranch,
      city,
      side,
      clinicIds,
      enabled: body.enabled !== false,
      schemaVersion: 1,
      source: MATCHING_RULE_SOURCE_UI,
      updatedAt: nowIso,
      updatedBy: uid,
      createdAt: existing.exists
        ? existing.data()?.createdAt || nowIso
        : nowIso,
    };

    await ref.set(rule, { merge: true });

    // Lightweight audit event (no new framework)
    await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("auditEvents")
      .add({
        eventType: "agency_matching_rule_updated",
        ruleId,
        treatmentBranch,
        city,
        side,
        clinicIds,
        updatedBy: uid,
        updatedAt: nowIso,
      });

    // Invalidate in-process caches on this instance
    let agencySlug: string | undefined;
    try {
      const agencySnap = await adminDb.collection("agencies").doc(agencyId).get();
      agencySlug = agencySnap.data()?.slug;
    } catch {
      /* ignore */
    }
    clearAgencyCache(agencyId, agencySlug);

    return NextResponse.json({ ok: true, rule });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[matching-rules PUT]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
