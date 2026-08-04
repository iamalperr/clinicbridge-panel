import { NextResponse } from "next/server";
import { AuthError, requireAgencyAccess } from "@/lib/services/apiAuth";
import { sendTestQuoteNotificationEmail } from "@/lib/services/agencyNotificationService";

/**
 * POST /api/agency/[agencyId]/notifications/quote/test
 * Sends a non-patient test email using saved quoteNotificationSettings.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ agencyId: string }> }
) {
  try {
    const { agencyId } = await params;
    if (!agencyId) {
      return NextResponse.json({ error: "agencyId required" }, { status: 400 });
    }

    await requireAgencyAccess(req, agencyId);

    const result = await sendTestQuoteNotificationEmail(agencyId);
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          errorCode: result.errorCode,
          message: result.message,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: result.message,
      recipientCount: result.recipientCount,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[quote/test]", err instanceof Error ? err.message : "unknown");
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
