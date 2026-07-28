import { NextResponse } from "next/server";
import { completeExtendedRequestRegistration } from "@/lib/services/extendedRequestService";

export async function POST(req: Request) {
  try {
    const { token, consentId } = await req.json();

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    await completeExtendedRequestRegistration(token);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[ExtendedRequest Complete Error]", error);
    const status = error.message.includes("EXPIRED") ? 403 : 500;
    return NextResponse.json({ error: error.message || "INTERNAL_ERROR" }, { status });
  }
}
