import { NextResponse } from "next/server";
import { AuthError, requireSuperAdmin } from "@/lib/services/apiAuth";
import { createManualPreview, listPreviewRequests } from "@/lib/preview/adminPreview";
import { PreviewUrlError } from "@/lib/preview/ssrf";

export const runtime = "nodejs";
export const maxDuration = 60;

function fail(error: unknown) {
  if (error instanceof AuthError) return NextResponse.json({ error: "forbidden" }, { status: error.status });
  if (error instanceof PreviewUrlError) return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  const message = error instanceof Error ? error.message : "";
  if (message === "invalid") return NextResponse.json({ error: "invalid" }, { status: 400 });
  if (message === "unavailable") return NextResponse.json({ error: "unavailable" }, { status: 503 });
  console.error("[admin-previews]", message || "unknown");
  return NextResponse.json({ error: "unavailable" }, { status: 503 });
}

export async function GET(req: Request) {
  try {
    await requireSuperAdmin(req);
    return NextResponse.json({ requests: await listPreviewRequests() });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireSuperAdmin(req);
    const body = await req.json() as { clinicName?: unknown; website?: unknown; email?: unknown };
    const id = await createManualPreview({
      clinicName: typeof body.clinicName === "string" ? body.clinicName : "",
      website: typeof body.website === "string" ? body.website : "",
      email: typeof body.email === "string" ? body.email : "",
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return fail(error);
  }
}
