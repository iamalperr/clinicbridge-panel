import { NextResponse } from "next/server";
import { extractText } from "unpdf";
import { AuthError, requireSuperAdmin } from "@/lib/services/apiAuth";
import {
  extractIntoPreview,
  readPreviewRequest,
  replyForPreview,
  rescanPreviewRequest,
  savePreviewEdits,
  sendPreviewLink,
  type EditablePreview,
} from "@/lib/preview/adminPreview";
import type { PreviewChatTurn } from "@/lib/preview/chat";

export const runtime = "nodejs";
export const maxDuration = 60;

type RouteParams = { params: Promise<{ id: string }> };

function fail(error: unknown) {
  if (error instanceof AuthError) return NextResponse.json({ error: "forbidden" }, { status: error.status });
  const message = error instanceof Error ? error.message : "";
  if (message === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (message === "no_preview") return NextResponse.json({ error: "no_preview" }, { status: 400 });
  if (message === "unavailable" || message.includes("OPENAI")) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  console.error("[admin-preview]", message || "unknown");
  return NextResponse.json({ error: "unavailable" }, { status: 503 });
}

function asEditable(value: unknown): EditablePreview {
  const record = value && typeof value === "object" ? value as Partial<EditablePreview> : {};
  const rows = (items: unknown) => Array.isArray(items) ? items.filter((item) => item && typeof item === "object") : [];
  return {
    clinicName: typeof record.clinicName === "string" ? record.clinicName : "",
    treatments: rows(record.treatments) as EditablePreview["treatments"],
    address: typeof record.address === "string" ? record.address : "",
    hours: typeof record.hours === "string" ? record.hours : "",
    phone: typeof record.phone === "string" ? record.phone : "",
    whatsapp: typeof record.whatsapp === "string" ? record.whatsapp : "",
    languages: Array.isArray(record.languages) ? record.languages.filter((item): item is string => typeof item === "string") : [],
    faq: rows(record.faq) as EditablePreview["faq"],
    logoUrl: typeof record.logoUrl === "string" ? record.logoUrl : "",
    primaryColor: typeof record.primaryColor === "string" ? record.primaryColor : "",
  };
}

function asHistory(value: unknown): PreviewChatTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: PreviewChatTurn[] = [];
  for (const entry of value.slice(-8)) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { role?: unknown; content?: unknown };
    if ((record.role !== "user" && record.role !== "assistant") || typeof record.content !== "string") continue;
    const content = record.content.trim().slice(0, 500);
    if (content) turns.push({ role: record.role, content });
  }
  return turns;
}

export async function GET(req: Request, { params }: RouteParams) {
  try {
    await requireSuperAdmin(req);
    const { id } = await params;
    const detail = await readPreviewRequest(id);
    if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (error) {
    return fail(error);
  }
}

export async function POST(req: Request, { params }: RouteParams) {
  try {
    await requireSuperAdmin(req);
    const { id } = await params;
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "invalid" }, { status: 400 });
      if (file.size > 8_000_000) return NextResponse.json({ error: "too_large" }, { status: 400 });
      const extracted = await extractText(new Uint8Array(await file.arrayBuffer()), { mergePages: true });
      const text = extracted.text.trim();
      if (!text) return NextResponse.json({ error: "empty" }, { status: 400 });
      await extractIntoPreview(id, text);
      return NextResponse.json({ ok: true });
    }

    const body = await req.json() as { action?: unknown; facts?: unknown; text?: unknown; message?: unknown; history?: unknown };
    const action = typeof body.action === "string" ? body.action : "";
    if (action === "save") {
      await savePreviewEdits(id, asEditable(body.facts));
      return NextResponse.json({ ok: true });
    }
    if (action === "rescan") return NextResponse.json(await rescanPreviewRequest(id));
    if (action === "extract") {
      const text = typeof body.text === "string" ? body.text.trim() : "";
      if (text.length < 20) return NextResponse.json({ error: "empty" }, { status: 400 });
      await extractIntoPreview(id, text);
      return NextResponse.json({ ok: true });
    }
    if (action === "chat") {
      const message = typeof body.message === "string" ? body.message.trim().slice(0, 500) : "";
      if (!message) return NextResponse.json({ error: "invalid" }, { status: 400 });
      const reply = await replyForPreview(id, message, asHistory(body.history));
      return NextResponse.json({ reply });
    }
    if (action === "send") {
      const result = await sendPreviewLink(id);
      if (!result.sent) return NextResponse.json({ error: "email_failed" }, { status: 502 });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  } catch (error) {
    return fail(error);
  }
}
