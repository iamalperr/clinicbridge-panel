/**
 * Server-side update of selected clinics on an agency lead.
 * Syncs lead + linked quote + clinic_requests without changing funnel status.
 */

import { getAdminDb } from "@/lib/firebase-admin";
import { FEELINHEALTHY_CONFIG } from "@/lib/agency/feelinhealthyConfig";
import {
  buildClinicSelectionHistoryNote,
  clinicSelectionEquals,
  diffClinicSelection,
  normalizeClinicIdList,
  resolveAgencyClinicSelectionLimit,
} from "@/lib/agency/leadClinicSelection";
import { normalizeLeadStatusHistory } from "@/lib/agency/leadStatusActions";
import { pickOfficialClinicName } from "@/lib/services/agencyQuoteNotificationContent";

export class LeadClinicSelectionError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "LeadClinicSelectionError";
    this.code = code;
    this.status = status;
  }
}

export interface UpdateAgencyLeadClinicSelectionInput {
  agencyId: string;
  leadId: string;
  clinicIds: string[];
  changedBy?: string;
  note?: string;
  locale?: string;
}

export interface UpdateAgencyLeadClinicSelectionResult {
  ok: true;
  skipped: boolean;
  clinicIds: string[];
  clinicNames: string[];
}

async function resolveClinicNames(
  agencyId: string,
  clinicIds: string[]
): Promise<string[]> {
  const adminDb = getAdminDb();
  if (!adminDb) return clinicIds;
  const names: string[] = [];
  for (const clinicId of clinicIds) {
    const snap = await adminDb
      .collection("agencies")
      .doc(agencyId)
      .collection("clinics")
      .doc(clinicId)
      .get();
    names.push(pickOfficialClinicName(snap.exists ? snap.data() : null, clinicId));
  }
  return names;
}

export async function updateAgencyLeadClinicSelection(
  input: UpdateAgencyLeadClinicSelectionInput
): Promise<UpdateAgencyLeadClinicSelectionResult> {
  const { agencyId, leadId, changedBy, note, locale } = input;
  const nextIds = normalizeClinicIdList(input.clinicIds);

  if (!agencyId || !leadId) {
    throw new LeadClinicSelectionError("INVALID_PAYLOAD", "agencyId and leadId are required", 400);
  }
  if (nextIds.length === 0) {
    throw new LeadClinicSelectionError(
      "CLINIC_SELECTION_REQUIRED",
      "At least one clinic must be selected",
      400
    );
  }

  const adminDb = getAdminDb();
  if (!adminDb) {
    throw new LeadClinicSelectionError("DB_UNAVAILABLE", "Database unavailable", 503);
  }

  const agencyRef = adminDb.collection("agencies").doc(agencyId);
  const agencySnap = await agencyRef.get();
  if (!agencySnap.exists || agencySnap.data()?.status !== "active") {
    throw new LeadClinicSelectionError("AGENCY_NOT_FOUND", "Agency not found", 404);
  }
  const agencyData = agencySnap.data()!;

  const matchingSnap = await agencyRef.collection("config").doc("matching").get();
  const matchingConfig = matchingSnap.exists ? matchingSnap.data() : null;
  const maxClinics = resolveAgencyClinicSelectionLimit({
    agencySlug: agencyData.slug,
    matchingMaxClinics: matchingConfig?.maxClinicsToShow,
    settingsMaxClinics: agencyData.settings?.maxClinicsPerTreatmentRequest,
    guestQuoteLimit: FEELINHEALTHY_CONFIG.guestQuoteClinicSelectionLimit,
  });

  if (nextIds.length > maxClinics) {
    throw new LeadClinicSelectionError(
      "CLINIC_SELECTION_LIMIT_EXCEEDED",
      `You can select up to ${maxClinics} clinics`,
      400
    );
  }

  // Validate clinics belong to agency and are not inactive.
  for (const clinicId of nextIds) {
    const clinicSnap = await agencyRef.collection("clinics").doc(clinicId).get();
    if (!clinicSnap.exists) {
      throw new LeadClinicSelectionError(
        "INVALID_CLINIC_SELECTION",
        `Clinic not found: ${clinicId}`,
        400
      );
    }
    const clinicStatus = String(clinicSnap.data()?.status || "active").toLowerCase();
    if (clinicStatus === "inactive" || clinicStatus === "archived" || clinicStatus === "disabled") {
      throw new LeadClinicSelectionError(
        "INVALID_CLINIC_SELECTION",
        `Clinic is not active: ${clinicId}`,
        400
      );
    }
  }

  const leadRef = agencyRef.collection("leads").doc(leadId);
  const leadSnap = await leadRef.get();
  if (!leadSnap.exists) {
    throw new LeadClinicSelectionError("LEAD_NOT_FOUND", "Lead not found", 404);
  }
  const lead = leadSnap.data()!;
  const leadStatus = String(lead.status || "");
  if (leadStatus === "lost" || leadStatus === "converted") {
    throw new LeadClinicSelectionError(
      "LEAD_LOCKED",
      "Clinic selection cannot be changed for converted or lost leads",
      409
    );
  }

  const previousIds = normalizeClinicIdList(lead.clinicIds);
  if (clinicSelectionEquals(previousIds, nextIds)) {
    const existingNames = Array.isArray(lead.selectedClinicNames)
      ? lead.selectedClinicNames.map(String)
      : await resolveClinicNames(agencyId, nextIds);
    return { ok: true, skipped: true, clinicIds: nextIds, clinicNames: existingNames };
  }

  const clinicNames = await resolveClinicNames(agencyId, nextIds);
  const previousNames = Array.isArray(lead.selectedClinicNames)
    ? lead.selectedClinicNames.map(String)
    : await resolveClinicNames(agencyId, previousIds);
  const now = new Date().toISOString();
  const historyNote =
    (typeof note === "string" && note.trim()) ||
    buildClinicSelectionHistoryNote({
      previousNames,
      nextNames: clinicNames,
      locale,
    });

  const historyEntry = {
    status: lead.status || "quote_requested",
    changedAt: now,
    ...(changedBy ? { changedBy } : {}),
    note: historyNote,
  };

  const { added, removed } = diffClinicSelection(previousIds, nextIds);

  // Sync clinic_requests: cancel removed (non-terminal), create missing for added.
  const crSnap = await agencyRef
    .collection("clinic_requests")
    .where("leadId", "==", leadId)
    .get();

  const batch = adminDb.batch();

  for (const doc of crSnap.docs) {
    const data = doc.data();
    const clinicId = String(data.clinicId || "");
    if (!removed.includes(clinicId)) continue;
    const status = String(data.status || "").toLowerCase();
    if (status === "cancelled" || status === "rejected" || status === "responded") continue;
    batch.update(doc.ref, {
      status: "cancelled",
      updatedAt: now,
      cancelledAt: now,
      cancelReason: "clinic_selection_updated",
    });
  }

  const existingActiveClinicIds = new Set(
    crSnap.docs
      .map((d) => d.data())
      .filter((d) => {
        const st = String(d.status || "").toLowerCase();
        return st !== "cancelled" && st !== "rejected";
      })
      .map((d) => String(d.clinicId || ""))
  );

  for (const clinicId of added) {
    if (existingActiveClinicIds.has(clinicId)) continue;
    const crRef = agencyRef.collection("clinic_requests").doc();
    batch.set(crRef, {
      leadId,
      agencyId,
      clinicId,
      status: "pending",
      source: lead.source || "widget",
      createdAt: now,
      updatedAt: now,
      submittedAt: now,
    });
  }

  // Lead patch — do NOT change funnel status.
  batch.set(
    leadRef,
    {
      clinicIds: nextIds,
      clinicRequestCount: nextIds.length,
      selectedClinicNames: clinicNames,
      assignedClinicName: clinicNames[0] || null,
      statusHistory: [...normalizeLeadStatusHistory(lead.statusHistory), historyEntry],
      updatedAt: now,
      ...(changedBy ? { updatedBy: changedBy } : {}),
    },
    { merge: true }
  );

  // Linked quote (operational source of truth for clinic selection).
  let quoteRef = lead.quoteId
    ? agencyRef.collection("quotes").doc(String(lead.quoteId))
    : null;
  if (!quoteRef) {
    const quoteSnap = await agencyRef
      .collection("quotes")
      .where("leadId", "==", leadId)
      .limit(1)
      .get();
    if (!quoteSnap.empty) {
      quoteRef = quoteSnap.docs[0].ref;
    }
  }
  if (quoteRef) {
    batch.set(
      quoteRef,
      {
        selectedClinicIds: nextIds,
        selectedClinicNames: clinicNames,
        updatedAt: now,
      },
      { merge: true }
    );
  }

  await batch.commit();

  return { ok: true, skipped: false, clinicIds: nextIds, clinicNames };
}
