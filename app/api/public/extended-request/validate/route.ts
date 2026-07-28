import { NextResponse } from "next/server";
import { validateExtendedRequestToken } from "@/lib/services/extendedRequestService";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const data = await validateExtendedRequestToken(token);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("[ExtendedRequest Validate Error]", error);
    const status = error.message.includes("EXPIRED") || error.message.includes("REVOKED") || error.message.includes("COMPLETED") ? 403 : 500;
    return NextResponse.json({ error: error.message || "INTERNAL_ERROR" }, { status });
  }
}
