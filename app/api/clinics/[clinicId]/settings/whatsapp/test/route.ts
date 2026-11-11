import { NextResponse } from "next/server";
import { AuthError, requireClinicAccess } from "@/lib/services/apiAuth";
import { getAdminDb } from "@/lib/firebase-admin";
import { isValidE164 } from "@/lib/services/notifications/whatsapp/templateParams";
import { loadWhatsAppSettings, reserveTestSend } from "@/lib/services/notifications/whatsapp/settings";
import { sendClinicStaffWhatsApp } from "@/lib/services/notifications/whatsapp/sendClinicStaffWhatsApp";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  try {
    const { clinicId } = await params;
    await requireClinicAccess(request, clinicId);
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ error: "Database error" }, { status: 500 });

    const body = await request.json().catch(() => ({}));
    const phone = typeof body?.phone === "string" ? body.phone.trim() : "";
    if (!isValidE164(phone)) {
      return NextResponse.json({ error: "invalid_number" }, { status: 400 });
    }

    const settings = await loadWhatsAppSettings(adminDb, clinicId);
    if (!settings.recipients.some((r) => r.phone === phone && r.optIn === true)) {
      return NextResponse.json({ error: "recipient_not_opted_in" }, { status: 400 });
    }

    const reserved = await reserveTestSend(adminDb, clinicId, new Date());
    if (!reserved.ok) {
      return NextResponse.json(
        {
          error: reserved.reason,
          retryAfterSeconds: reserved.retryAfterSeconds,
        },
        { status: 429 }
      );
    }

    const clinicSnap = await adminDb.collection("clinics").doc(clinicId).get();
    const result = await sendClinicStaffWhatsApp({
      clinicId,
      clinicData: clinicSnap.exists ? (clinicSnap.data() as Record<string, unknown>) : null,
      kind: "test",
      recipientOverride: phone,
      db: adminDb,
    });

    if (result.status === "sent") {
      return NextResponse.json({
        success: true,
        status: "sent",
        messageId: result.results.find((r) => r.messageId)?.messageId,
      });
    }
    if (result.status === "skipped") {
      return NextResponse.json(
        { success: false, status: "skipped", reason: result.results[0]?.reason || "skipped" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        success: false,
        status: "failed",
        errorCode: result.results[0]?.errorCode || "unknown",
      },
      { status: 502 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[WHATSAPP_TEST_SEND_ERROR]", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Failed to send test message" }, { status: 500 });
  }
}
