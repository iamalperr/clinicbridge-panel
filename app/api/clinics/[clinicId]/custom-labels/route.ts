import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireClinicAccess, AuthError } from "@/lib/services/apiAuth";

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
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const labelsRef = adminDb
      .collection("clinics")
      .doc(clinicId)
      .collection("customLabels");

    // Seed presets idempotently
    const existingSnap = await labelsRef.get();
    const existingIds = new Set(existingSnap.docs.map((d) => d.id));

    for (const preset of GLOBAL_PRESETS) {
      if (!existingIds.has(preset.id)) {
        await labelsRef.doc(preset.id).set({
          ...preset,
          createdAt: new Date().toISOString(),
          isActive: true,
        });
      }
    }

    // Fetch all active labels
    const snap = await labelsRef.where("isActive", "==", true).get();
    const labels = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Sort by order field
    labels.sort((a: any, b: any) => (a.order ?? 99) - (b.order ?? 99));

    return NextResponse.json({ labels });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[custom-labels] Error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
