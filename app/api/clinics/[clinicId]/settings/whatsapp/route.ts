import { NextResponse } from "next/server";
import { AuthError, requireClinicAccess } from "@/lib/services/apiAuth";
import { getAdminDb } from "@/lib/firebase-admin";
import {
  buildWhatsAppSettingsUpdate,
  emptyWhatsAppSettings,
  loadWhatsAppSettings,
  saveWhatsAppSettings,
} from "@/lib/services/notifications/whatsapp/settings";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  try {
    const { clinicId } = await params;
    await requireClinicAccess(request, clinicId);
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ error: "Database error" }, { status: 500 });
    const settings = await loadWhatsAppSettings(adminDb, clinicId);
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[GET_WHATSAPP_SETTINGS_ERROR]", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Failed to fetch WhatsApp settings" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clinicId: string }> }
) {
  try {
    const { clinicId } = await params;
    const auth = await requireClinicAccess(request, clinicId);
    const adminDb = getAdminDb();
    if (!adminDb) return NextResponse.json({ error: "Database error" }, { status: 500 });

    const body = await request.json().catch(() => ({}));
    const previous = await loadWhatsAppSettings(adminDb, clinicId);
    const built = buildWhatsAppSettingsUpdate({
      clinicId,
      enabled: body?.enabled,
      recipients: body?.recipients,
      previous: previous.recipients.length > 0 || previous.enabled ? previous : emptyWhatsAppSettings(clinicId),
      actorUid: auth.uid,
      now: new Date(),
    });
    if (!built.ok) {
      return NextResponse.json({ error: "validation_failed", errors: built.errors }, { status: 400 });
    }
    await saveWhatsAppSettings(adminDb, built.settings);
    const hasRecipient = built.settings.recipients.some(
      (recipient) => typeof recipient.phoneE164 === "string" && recipient.phoneE164.replace(/\D/g, "").length >= 8
    );
    if (built.settings.enabled && hasRecipient) {
      const { safeRecordLifecycleMilestone } = await import("@/lib/lifecycle/safeRecord");
      await safeRecordLifecycleMilestone(adminDb, {
        clinicId,
        milestone: "notifications_configured",
        meta: { via: "whatsapp" },
      });
    }
    return NextResponse.json(built.settings);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[POST_WHATSAPP_SETTINGS_ERROR]", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Failed to save WhatsApp settings" }, { status: 500 });
  }
}
