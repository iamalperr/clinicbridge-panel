import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase-admin";
import { requireClinicAccess, AuthError } from "@/lib/services/apiAuth";
import { loadClinicConversationTranscript } from "@/lib/services/conversations/conversationTranscriptService";

/**
 * GET /api/clinics/[clinicId]/conversations/[conversationId]/messages
 *
 * Returns the full visible conversation transcript for clinic portal detail.
 * Enforces clinic tenant isolation via requireClinicAccess.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ clinicId: string; conversationId: string }> }
) {
  try {
    const { clinicId, conversationId } = await params;
    if (!clinicId || !conversationId) {
      return NextResponse.json(
        { error: "clinicId and conversationId required", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    await requireClinicAccess(req, clinicId);

    const adminDb = getAdminDb();
    if (!adminDb) {
      return NextResponse.json(
        { error: "Database unavailable", code: "DB_UNAVAILABLE" },
        { status: 503 }
      );
    }

    const detail = await loadClinicConversationTranscript(adminDb, {
      clinicId,
      conversationId,
      reconcileCount: true,
    });

    if (!detail) {
      return NextResponse.json(
        { error: "Conversation not found", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      conversationId: detail.conversationId,
      clinicId: detail.clinicId,
      patient: detail.patient,
      status: detail.status,
      messageCount: detail.messageCount,
      storedMessageCount: detail.storedMessageCount,
      messages: detail.messages.map((m) => ({
        id: m.id,
        role: m.role,
        sender: m.sender,
        content: m.content,
        createdAt: m.createdAt,
        sequence: m.sequence,
        source: m.source,
        wasAnswered: m.wasAnswered ?? true,
        needsTraining: m.needsTraining ?? false,
      })),
      hasMore: false,
      sourcesUsed: detail.sourcesUsed,
    });
  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message, code: "UNAUTHORIZED" },
        { status: err.status || 401 }
      );
    }
    console.error("[conversation-messages] Error:", err?.message || err);
    return NextResponse.json(
      { error: "Failed to load conversation messages", code: "INTERNAL" },
      { status: 500 }
    );
  }
}
