import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireClinicAccess, AuthError } from "@/lib/services/apiAuth";
import { mapInfrastructureError } from "@/lib/services/infrastructureErrors";

/**
 * Global preset labels available to all clinics.
 * Seeded idempotently on first GET — never duplicated.
 */
const GLOBAL_PRESETS = [
  {
    id: "converted_to_appointment",
    labelTr: "Randevuya Dönüştü",
    labelEn: "Converted to Appointment",
    color: "#8b5cf6",
    isPreset: true,
    order: 1,
  },
];

/**
 * GET /api/clinics/[clinicId]/custom-labels
 *
 * Returns available custom labels for the clinic.
 * Seeds global presets on first call (idempotent).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  try {
    const { clinicId } = await params;
    await requireClinicAccess(req, clinicId);

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Database unavailable", code: "SERVICE_UNAVAILABLE" },
        { status: 503 }
      );
    }

    const labelsRef = adminDb
      .collection("clinics")
      .doc(clinicId)
      .collection("customLabels");

    // Single read of the active set. Previously this endpoint read the whole
    // subcollection twice (once to test for seeding, once to filter).
    const snap = await labelsRef.where("isActive", "==", true).get();
    const labels = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const activeIds = new Set(labels.map((l) => l.id));

    // Seed presets idempotently. A preset absent from the active set is checked
    // by id so a deliberately deactivated label is never resurrected.
    for (const preset of GLOBAL_PRESETS) {
      if (activeIds.has(preset.id)) continue;

      const presetSnap = await labelsRef.doc(preset.id).get();
      if (presetSnap.exists) continue;

      const seeded = {
        ...preset,
        createdAt: new Date().toISOString(),
        isActive: true,
      };
      await labelsRef.doc(preset.id).set(seeded);
      labels.push(seeded);
    }

    // Sort by order field
    labels.sort((a: any, b: any) => (a.order ?? 99) - (b.order ?? 99));

    return NextResponse.json({ labels });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[custom-labels] Error:", err);
    const mapped = mapInfrastructureError(err);
    return NextResponse.json(
      { error: mapped.error, code: mapped.code },
      { status: mapped.status }
    );
  }
}
