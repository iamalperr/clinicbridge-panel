import { NextResponse } from "next/server";
import { sendPatientLeadApprovalEmail } from "@/lib/services/emailService";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agencyId, leadId, customMessage } = body;

    if (!agencyId || !leadId) {
      return NextResponse.json(
        { error: "Missing required fields: agencyId, leadId" },
        { status: 400 }
      );
    }

    const result = await sendPatientLeadApprovalEmail({
      agencyId,
      leadId,
      customMessage,
    });

    if (result) {
      return NextResponse.json({ success: true, message: "Patient email sent." });
    } else {
      return NextResponse.json(
        { success: false, message: "Failed to send email. Check logs." },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("[send-patient-email] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
